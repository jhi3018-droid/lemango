// =============================================
// ===== 매출 관리 (Sales Management) — Phase 1: L1 주문 원장 + 실포맷 업로드 + 병합 =====
// =============================================
// 설계 v1.3 + Phase 0/1R 조사(실파일 검증) 기반. 기존 매출현황(gonghom.js/sabangnet.js)·매출공식 무접촉.
// - 별도 업로드 경로(신규 파일 js/sales-ledger.js). 원본 주문내역 파일(카페24 28/27컬럼 CSV · 사방넷 20컬럼 xlsx)을 L1 원장에 병합.
// - L1 = salesOrders/{id}, 1문서=1주문(라인 배열). 결정적 id → 재업로드=병합(변경분만 write, 무변경=0 write).
// - 집계(L2/L3)·리포트 화면=Phase 2/3(미구현). 여기선 원장 캡처 + 업로드 내역만.
// - 🔴 리스너 금지(조회 시 1회 read). op-count 청킹(≤450). append-only(라인 삭제 없음, 병합만).
// - 🔴 매출액 규칙 = 기존 공식 계승(두 시스템 일치): 카페24 라인 상품매출 = 상품구매금액(P) − 상품별추가할인(Y) · 사방넷 = 결제금액(H) + 배송비 별도 캡처(sh).
//   적립금(카페24 W)·현금(총결제 S)·회원등급 = 별도 표시용 주문 필드.

// ---- 채널 코드 ----
const SL_CH = { c24: 'c24', sb: 'sb' }
const SL_NOTE_MAX = 5   // 주문당 변경노트 보관 상한

// ---- 파싱/업로드 세션 상태 ----
let _slParsed = null      // { type, orders:[...], warn:{...}, fileName }
let _slBusy = false       // 확정 중복 가드
let _slUploads = []        // 업로드 내역 캐시(조회 시 1회 read)
let _slActiveSub = 'summary'

// =============================================
// ===== 공통 헬퍼 =====
// =============================================
function _slPad(n) { return String(n).padStart(2, '0') }
function _slUp(v) { return String(v == null ? '' : v).trim().toUpperCase() }
function _slStr(v) { return String(v == null ? '' : v).trim() }

// 정수 KRW — 콤마/공백/₩/소수점('301000.00') 정규화
function _slNum(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return Math.round(v)
  const s = String(v).replace(/[,\s₩]/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : Math.round(n)
}

// 🔴 날짜 정규화 → 'YYYY-MM-DD' (한국 로컬 캘린더 날짜 = 원천 그대로, UTC→KST +9h 시프트 금지).
//   원본 파일의 날짜는 이미 한국 벽시계 날짜(카페24 admin/사방넷 export)라 재포맷만. (§1.6 KST 유틸은 '우리가 생성하는 instant' 전용)
function _slDate(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return ''
    return v.getUTCFullYear() + '-' + _slPad(v.getUTCMonth() + 1) + '-' + _slPad(v.getUTCDate())
  }
  if (typeof v === 'number') {
    if (v >= 19000101 && v <= 29991231) { const s = String(v); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) }  // YYYYMMDD as number
    const d = new Date(Math.round((v - 25569) * 86400000))   // Excel serial (day count, TZ-agnostic → UTC 추출)
    if (isNaN(d.getTime())) return ''
    return d.getUTCFullYear() + '-' + _slPad(d.getUTCMonth() + 1) + '-' + _slPad(d.getUTCDate())
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-.\/]\s*(\d{1,2})[-.\/]\s*(\d{1,2})/)   // YYYY-MM-DD / YYYY.M.D / YYYY/M/D (+시간)
  if (m) return m[1] + '-' + _slPad(m[2]) + '-' + _slPad(m[3])
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)   // YYYYMMDD
  if (m) return m[1] + '-' + m[2] + '-' + m[3]
  return ''   // 파싱 실패 → 호출부가 경고
}

// 사이즈 best-effort 추출(편의 필드; 원본 옵션은 o 에 그대로 보존)
function _slNormSize(s) { let t = String(s || '').trim().toUpperCase(); if (t === 'XXL') t = '2XL'; return t }
function _slExtractSize(raw) {
  if (!raw) return ''
  let s = String(raw).trim()
  let m = s.match(/(?:사이즈|size)\s*[:=]\s*([^\/,\s]+)/i); if (m) return _slNormSize(m[1])
  m = s.match(/\(([^)]+)\)\s*$/); if (m) s = m[1]                                   // 후행 (M)/(L)
  m = s.match(/(?:^|[:_\/\s])(XS|2XL|XXL|XL|S|M|L|F)\s*$/i); if (m) return _slNormSize(m[1])
  return _slNormSize(s)
}

// doc-id 안전화(공백/슬래시/역슬래시 → _). 원본 쇼핑몰명은 mall 필드에 보존.
function _slSanitize(s) {
  const t = String(s || '').trim().replace(/[\/\\\s]+/g, '_').replace(/^_+|_+$/g, '')
  return t || 'unknown'
}

// 변경노트 bounded push(최근 SL_NOTE_MAX 개만)
function _slPushNote(notes, note) {
  const arr = Array.isArray(notes) ? notes.slice() : []
  arr.push(note)
  return arr.slice(-SL_NOTE_MAX)
}

// 등록된 품번 Set(미매칭 경고용) — 조회 시 1회 구성
function _slProductCodeSet() {
  const set = new Set()
  const list = (typeof State !== 'undefined' && State.allProducts) ? State.allProducts : []
  list.forEach(p => { if (p && p.productCode) set.add(String(p.productCode).trim().toUpperCase()) })
  return set
}

// =============================================
// ===== 파트너 마스터 (Phase 4) — 주문자ID(bid) ↔ 업체 명단 =====
// =============================================
// 저장 = sharedData/salesPartners (기존 OR-union 설정 패턴 · admin-write). 엔트리 { id, name, grade, active, src:'file'|'manual', ut }.
//   🔴 분류 = 집계-타임(파생 데이터 원칙): c24 주문의 bid(주문자ID) ∈ 활성 마스터 → 파트너(pt) · else 공홈(gh). grade=표시 전용.
//   마스터 변경 → 집계 stale → [집계 재계산] 필요(작업지시 확정). 오너 결정: 181명 전원 파트너(일반회원 포함 — bid∈마스터가 기준, 등급 무관).
//   Cafe24 로그인 ID 대소문자 무관 → _slPidNorm(trim+lower) 로 매칭(마스터·bid 동일 정규화).
function _slPidNorm(id) { return String(id == null ? '' : id).trim().toLowerCase() }

let _salesPartners = (() => {
  try { if (typeof localStorage === 'undefined') return []; const s = localStorage.getItem('lemango_sales_partners_v1'); return s ? JSON.parse(s) : [] } catch { return [] }
})()
let _slPartnerUpdatedAt = (() => { try { return (typeof localStorage !== 'undefined' && localStorage.getItem('lemango_sales_partners_ut_v1')) || '' } catch { return '' } })()

// 활성 파트너 id Set(정규화) — 분류/후보검출 단일 소스
function _slPartnerActiveSet() {
  const set = new Set()
  ;(_salesPartners || []).forEach(p => { if (p && p.active !== false && p.id) set.add(_slPidNorm(p.id)) })
  return set
}
// 전체(비활성 포함) 정규화 id → 엔트리 (표시/관리용)
function _slPartnerMap() {
  const m = {}
  ;(_salesPartners || []).forEach(p => { if (p && p.id) m[_slPidNorm(p.id)] = p })
  return m
}
// bid → 활성 파트너명(없으면 '')
function _slPartnerName(bid) { const p = _slPartnerMap()[_slPidNorm(bid)]; return (p && p.active !== false) ? (p.name || p.id) : '' }
// 주문이 파트너 매입인가(c24 + bid ∈ 활성 마스터)
function _slOrderIsPartner(o, ptSet) { return !!(o && o.ch === SL_CH.c24 && o.bid && ptSet && ptSet.has(_slPidNorm(o.bid))) }
// 새 파트너 후보 = grade 에 'Partner' 포함(Global Partner 포함)인데 bid 가 활성 마스터에 없음
function _slCollectCandidate(o, ptSet, out) {
  if (!o || o.ch !== SL_CH.c24 || !o.bid) return
  if (ptSet && ptSet.has(_slPidNorm(o.bid))) return
  if (String(o.grade || '').indexOf('Partner') >= 0) out[o.bid] = String(o.grade || '')
}

// 메모리/localStorage 반영(동기화·CRUD 공용). fromSync=true → 재저장 안 함(에코 방지).
function _slSetPartners(arr, fromSync) {
  _salesPartners = Array.isArray(arr) ? arr : []
  try { if (typeof localStorage !== 'undefined') localStorage.setItem('lemango_sales_partners_v1', JSON.stringify(_salesPartners)) } catch (e) {}
  if (typeof document !== 'undefined' && _slActiveSub === 'partner' && document.getElementById('slPartnerBody')) { try { renderSalesPartner() } catch (e) {} }
}
async function saveSalesPartners() {
  _slPartnerUpdatedAt = new Date().toISOString()
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('lemango_sales_partners_v1', JSON.stringify(_salesPartners))
      localStorage.setItem('lemango_sales_partners_ut_v1', _slPartnerUpdatedAt)
    }
  } catch (e) {}
  if (typeof _fsSync === 'function') {
    await _fsSync('salesPartners', _salesPartners)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['salesPartners'] = Date.now()
  }
}
// 세션 시작 시 마스터 없으면 1회 로드(리스너 아님 · 재계산/분류 정확성 보장). _slPartnerLoaded=한번 시도하면 재조회 안 함(빈 마스터 반복 read 방지).
let _slPartnerLoaded = false
async function _slEnsurePartnerMaster() {
  if ((_salesPartners || []).length || _slPartnerLoaded) return
  if (typeof db === 'undefined' || !db) return
  _slPartnerLoaded = true
  try {
    const d = await db.collection('sharedData').doc('salesPartners').get()
    if (d.exists && d.data().data) { _slSetPartners(JSON.parse(d.data().data), true); _slPartnerUpdatedAt = d.data().updatedAt || _slPartnerUpdatedAt }
  } catch (e) { _slPartnerLoaded = false }
}

// =============================================
// ===== 파일 읽기 + 타입 자동 감지 =====
// =============================================
function _slReadWorkbookRows(data, isCsv) {
  const opts = isCsv ? { type: 'string', codepage: 65001 } : { type: 'array' }
  const wb = XLSX.read(data, opts)
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
}

// 헤더 서명으로 타입 판별. 카페24=이름 매칭(27/28컬럼 무관) · 사방넷=위치 기반(20컬럼) 서명.
function _slDetectType(headers) {
  const H = (headers || []).map(h => _slStr(h))
  const has = n => H.some(h => h === n || h.includes(n))
  // 카페24: '자체 상품코드'(공백)·'상품구매금액'·'환불완료일'·'주문번호'
  if (has('자체 상품코드') && has('상품구매금액') && has('환불완료일') && has('주문번호')) return SL_CH.c24
  // 사방넷: '쇼핑몰명'·'결제금액'·'반품완료일자'·'자체상품코드'(공백 없음)
  if (has('쇼핑몰명') && has('결제금액') && has('반품완료일자') && has('자체상품코드')) return SL_CH.sb
  return null
}

// 카페24 헤더 → 인덱스(이름 매칭; 정확일치 우선으로 부분문자열 충돌[상품구매금액⊂총 상품구매금액] 방지)
function _slC24ColMap(headers) {
  const H = (headers || []).map(h => _slStr(h))
  const col = (name) => {
    let i = H.findIndex(h => h === name); if (i >= 0) return i
    return H.findIndex(h => h.includes(name))
  }
  const colExact = (name) => H.findIndex(h => h === name)   // 부분문자열 fallback 금지(오매칭 방어)
  return {
    orderDate: col('주문일시'), refundDate: col('환불완료일'), orderNo: col('주문번호'),
    buyerId: col('주문자ID'), grade: col('회원등급'), code: col('자체 상품코드'),
    opt: col('상품옵션'), shop: col('쇼핑몰'), qty: col('수량'),
    P: col('상품구매금액'), Q: col('총 배송비'), S: col('총 결제금액'), T: col('총 주문금액'),
    U: col('실제 환불금액'), W: col('사용한 적립금액'), Y: col('상품별 추가할인금액'),
    // 🔴 exact-only: '환불금액'(AA)만. fallback 허용 시 export 가 이 열을 빼면 '실제 환불금액'(U)로 오매칭 → rf 과다. 미존재 시 -1 → 0 처리.
    lineRefund: colExact('환불금액')
  }
}

// 사방넷 위치 맵(20컬럼 A~T — 기존 파서와 동일 순서, 실파일 검증됨)
const SL_SB = {
  mall: 1, orderNo: 2, code: 3, name: 4, optRaw: 5, qty: 6, pay: 7, ship: 8,
  orderDate: 12, refundDate: 13, optClean: 16, sizeAlias: 17
}

// =============================================
// ===== 파서 (→ 주문 배열 + 경고) =====
// =============================================
function _slNewWarn() {
  return { unmatched: new Set(), dateFail: [], anomaly: [], newMalls: new Set(), friends: 0, malls: {}, newPartners: new Set() }
}

// 카페24 파싱: 주문번호로 그룹핑. 라인 매출 rv = P − Y. 주문 필드 cash(S)/pu(W)/grade/bid/ship(ΣQ)/ref(maxU).
function _slParseCafe24(rows) {
  const warn = _slNewWarn()
  const headers = rows[0] || []
  const M = _slC24ColMap(headers)
  const codeSet = _slProductCodeSet()
  const ptSet = (typeof _slPartnerActiveSet === 'function') ? _slPartnerActiveSet() : new Set()   // 새 파트너 후보 검출용(현재 마스터)
  const orders = {}   // orderNo → order obj
  const hasBuyer = M.buyerId >= 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const code = _slUp(row[M.code])
    const orderNo = _slStr(row[M.orderNo])
    if (!code && !orderNo) continue                         // 완전 빈 행 skip
    if (!orderNo) { warn.dateFail.push(`행${r + 1}: 주문번호 없음`); continue }

    const od = _slDate(row[M.orderDate])
    if (!od) warn.dateFail.push(`행${r + 1}(주문 ${orderNo}): 주문일 파싱 실패`)

    const P = _slNum(row[M.P]), Y = _slNum(row[M.Y])
    const rv = P - Y
    if (rv < 0) warn.anomaly.push(`행${r + 1}(${code}): 매출액 음수 ${rv}`)
    if (!code) warn.unmatched.add('(품번없음)')
    else if (!codeSet.has(code)) warn.unmatched.add(code)

    const line = { c: code, o: _slStr(row[M.opt]), q: _slNum(row[M.qty]), rv: rv }
    const sz = _slExtractSize(row[M.opt]); if (sz) line.sz = sz
    const lref = _slNum(row[M.lineRefund]); if (lref) line.rf = lref
    const rd = _slDate(row[M.refundDate]); if (rd) line.rd = rd

    let o = orders[orderNo]
    if (!o) {
      o = orders[orderNo] = {
        key: SL_CH.c24 + '_' + orderNo, ch: SL_CH.c24, ono: orderNo,
        od: od, mall: _slStr(row[M.shop]), grade: _slStr(row[M.grade]),
        cash: _slNum(row[M.S]), pu: _slNum(row[M.W]),
        ship: 0, ref: 0, lines: []
      }
      if (hasBuyer) {
        const bid = _slStr(row[M.buyerId])
        if (bid) {
          o.bid = bid
          if (!ptSet.has(_slPidNorm(bid)) && _slStr(row[M.grade]).indexOf('Partner') >= 0) warn.newPartners.add(bid + ' (' + _slStr(row[M.grade]) + ')')
        }
      }
    }
    o.ship += _slNum(row[M.Q])                              // 총배송비: 첫 품목만 값 → 합=Q
    o.ref = Math.max(o.ref, _slNum(row[M.U]))               // 실제환불금액: 주문당 MAX(기존 공식 동일)
    o.lines.push(line)
  }

  const list = Object.values(orders)
  list.forEach(o => {
    const mk = o.mall || '(미상)'
    warn.malls[mk] = (warn.malls[mk] || 0) + 1
    if ((o.grade && o.grade.includes('프렌즈')) || o.pu > 0) warn.friends++
  })
  return { type: SL_CH.c24, orders: list, warn }
}

// 사방넷 파싱: (쇼핑몰, 주문번호)로 그룹핑. 라인 rv = 결제금액(H), sh = 배송비(I) 별도. 사은품 → rv/sh 0(기존 공식 제외 미러).
function _slParseSabang(rows) {
  const warn = _slNewWarn()
  const codeSet = _slProductCodeSet()
  const orders = {}

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const code = _slUp(row[SL_SB.code])
    const ono = _slStr(row[SL_SB.orderNo])
    const mallRaw = _slStr(row[SL_SB.mall])
    if (!code) continue                                     // 기존 파서와 동일(품번 없는 행 skip)
    if (!ono) { warn.dateFail.push(`행${r + 1}: 주문번호 없음`); continue }

    const od = _slDate(row[SL_SB.orderDate])
    if (!od) warn.dateFail.push(`행${r + 1}(주문 ${ono}): 주문일 파싱 실패`)

    const isFreebie = ono.includes('_사은품') || code.includes('사은품')
    const pay = _slNum(row[SL_SB.pay]), shipv = _slNum(row[SL_SB.ship])
    const rv = isFreebie ? 0 : pay                          // 사은품 매출 제외(H=0)
    const sh = isFreebie ? 0 : shipv                        // 사은품 배송비 제외(중복 방지)
    if (rv < 0) warn.anomaly.push(`행${r + 1}(${code}): 매출액 음수 ${rv}`)
    if (!codeSet.has(code)) warn.unmatched.add(code)

    const line = { c: code, o: _slStr(row[SL_SB.optRaw] || row[SL_SB.optClean]), q: _slNum(row[SL_SB.qty]), rv: rv }
    const sz = _slExtractSize(row[SL_SB.sizeAlias] || row[SL_SB.optClean] || row[SL_SB.optRaw]); if (sz) line.sz = sz
    if (sh) line.sh = sh
    const rd = _slDate(row[SL_SB.refundDate]); if (rd) line.rd = rd

    const key = SL_CH.sb + '_' + _slSanitize(mallRaw) + '_' + ono
    let o = orders[key]
    if (!o) {
      o = orders[key] = {
        key: key, ch: SL_CH.sb, ono: ono, od: od, mall: mallRaw, ship: 0, lines: []
      }
      warn.malls[mallRaw || '(미상)'] = 0
      warn.newMalls.add(mallRaw || '(미상)')   // 채널 마스터 부재(Phase 1) → 전 쇼핑몰 목록화(향후 별칭용)
    }
    o.ship += sh
    o.lines.push(line)
  }

  const list = Object.values(orders)
  list.forEach(o => { const mk = o.mall || '(미상)'; warn.malls[mk] = (warn.malls[mk] || 0) + 1 })
  return { type: SL_CH.sb, orders: list, warn }
}

// =============================================
// ===== L1 문서 빌더 + 병합 엔진(순수 로직) =====
// =============================================
// 저장용 라인(내부 임시키 제거)
function _slCleanLine(l) {
  const o = { c: l.c, o: l.o || '', q: l.q, rv: l.rv }
  if (l.sz) o.sz = l.sz
  if (l.sh) o.sh = l.sh
  if (l.rf) o.rf = l.rf
  if (l.rd) o.rd = l.rd
  return o
}

// 라인들의 반품일(rd) distinct 정렬 배열 → 문서 레벨 인덱스 필드(rds). 집계 재계산이 array-contains 로 반품 주문 조회(Phase 2).
function _slDocRds(lines) {
  const s = new Set()
  ;(lines || []).forEach(l => { if (l && l.rd) s.add(l.rd) })
  return [...s].sort()
}
// 라인들의 distinct 품번 배열 → 문서 레벨 인덱스(codes). 주문 조회 by 품번(array-contains, Phase 3).
function _slDocCodes(lines) {
  const s = new Set()
  ;(lines || []).forEach(l => { if (l && l.c) s.add(l.c) })
  return [...s].sort()
}

// 주문 → L1 문서(신규)
function _slBuildDoc(inc, uploadId, nowIso) {
  const doc = {
    ch: inc.ch, ono: inc.ono, od: inc.od || '', mall: inc.mall || '',
    lines: inc.lines.map(_slCleanLine),
    rds: _slDocRds(inc.lines),
    codes: _slDocCodes(inc.lines),
    up: uploadId, ut: nowIso, ct: nowIso, notes: []
  }
  if (inc.bid) doc.bid = inc.bid
  if (inc.grade) doc.grade = inc.grade
  if (inc.cash !== undefined) doc.cash = inc.cash
  if (inc.pu !== undefined && inc.pu !== 0) doc.pu = inc.pu
  if (inc.ship !== undefined && inc.ship !== 0) doc.ship = inc.ship
  if (inc.ref !== undefined && inc.ref !== 0) doc.ref = inc.ref
  return doc
}

// 라인 키(식별) = (품번, 옵션) occurrence pairing. 변경 판정 필드 = {q, rv, sh, rf, rd}. rd 신규 등장 = 반품.
function _slLineKey(l) { return (l.c || '') + '' + (l.o || '') }

// 병합: existing 없으면 신규, 있으면 라인 diff. return { action:'new'|'merge'|'same', doc, returns }
function _slMergeOrder(existing, inc, uploadId, nowIso) {
  if (!existing) {
    const doc = _slBuildDoc(inc, uploadId, nowIso)
    let returns = 0; inc.lines.forEach(l => { if (l.rd) returns++ })
    return { action: 'new', doc: doc, returns: returns }
  }

  const exLines = Array.isArray(existing.lines) ? existing.lines : []
  const outLines = exLines.map(l => Object.assign({}, l))   // clone(비파괴)
  const buckets = {}
  outLines.forEach((l, i) => { const k = _slLineKey(l); (buckets[k] = buckets[k] || []).push(i) })
  const used = new Set()
  let changed = false, returns = 0
  const bits = []

  inc.lines.forEach(il => {
    const k = _slLineKey(il)
    const q = buckets[k] || []
    let mi = -1
    for (const idx of q) { if (!used.has(idx)) { mi = idx; break } }
    if (mi >= 0) {
      used.add(mi)
      const ex = outLines[mi]
      let lc = false
      if (_slNum(ex.q) !== _slNum(il.q)) { ex.q = il.q; lc = true }
      if (_slNum(ex.rv) !== _slNum(il.rv)) { ex.rv = il.rv; lc = true }
      if (_slNum(ex.sh || 0) !== _slNum(il.sh || 0)) { if (il.sh) ex.sh = il.sh; else delete ex.sh; lc = true }
      if (_slNum(ex.rf || 0) !== _slNum(il.rf || 0)) { if (il.rf) ex.rf = il.rf; else delete ex.rf; lc = true }
      // rd(반품완료일): 신규 등장 또는 변경 시만 반영, 절대 clear 안 함(append-only 정신)
      if (il.rd && il.rd !== (ex.rd || '')) { if (!ex.rd) returns++; ex.rd = il.rd; lc = true }
      if (lc) { changed = true; bits.push(il.c) }
    } else {
      outLines.push(_slCleanLine(il)); changed = true; bits.push('+' + il.c)
      if (il.rd) returns++
    }
  })
  // incoming 에 없는 기존 라인 = 유지(삭제 안 함)

  // 주문 레벨 변화(현금/환불금액/배송비/적립금) — 라인 무변경이어도 조정 포착(돈 정합; 집계가 doc 스칼라 사용 → stale 방지)
  const scalarChg = []
  if (inc.cash !== undefined && _slNum(existing.cash || 0) !== _slNum(inc.cash)) scalarChg.push('현금')
  if (inc.ref !== undefined && _slNum(existing.ref || 0) !== _slNum(inc.ref)) scalarChg.push('환불')
  if (inc.ship !== undefined && _slNum(existing.ship || 0) !== _slNum(inc.ship)) scalarChg.push('배송비')
  if (inc.pu !== undefined && _slNum(existing.pu || 0) !== _slNum(inc.pu)) scalarChg.push('적립금')
  if (scalarChg.length) { changed = true; bits.push(scalarChg.join('·')) }

  if (!changed) return { action: 'same', doc: null, returns: 0 }

  const doc = Object.assign({}, existing)
  doc.lines = outLines
  doc.rds = _slDocRds(outLines)   // 반품일 인덱스 갱신(병합으로 rd 추가/변경 반영)
  doc.codes = _slDocCodes(outLines)   // 품번 인덱스 갱신(라인 추가 반영)
  // 주문 스칼라 최신값 반영(present 한 것만)
  if (inc.od) doc.od = inc.od
  if (inc.mall) doc.mall = inc.mall
  if (inc.bid) doc.bid = inc.bid
  if (inc.grade) doc.grade = inc.grade
  if (inc.cash !== undefined) doc.cash = inc.cash
  if (inc.pu !== undefined) doc.pu = inc.pu
  if (inc.ship !== undefined) doc.ship = inc.ship
  if (inc.ref !== undefined) doc.ref = inc.ref
  if (!doc.ct) doc.ct = nowIso
  doc.up = uploadId; doc.ut = nowIso
  doc.notes = _slPushNote(existing.notes, { t: nowIso, u: uploadId, s: '변경 ' + bits.slice(0, 6).join(',') })
  return { action: 'merge', doc: doc, returns: returns }
}

// =============================================
// ===== 업로드 플로우 =====
// =============================================
function _slIsAdmin() {
  const grade = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  return grade >= 3
}

function openSalesUploadModal() {
  if (!_slIsAdmin()) { showToast('업로드 권한이 없습니다 (관리자 전용).', 'warning'); return }
  _slParsed = null
  const modal = document.getElementById('slUploadModal'); if (!modal) return
  const body = document.getElementById('slUploadBody')
  if (body) body.innerHTML = _slUploadIntroHtml()
  if (!modal.open) modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
}
function closeSalesUploadModal() {
  const modal = document.getElementById('slUploadModal'); if (modal && modal.open) modal.close()
  _slParsed = null
}

function _slUploadIntroHtml() {
  return `
    <div class="sl-up-intro">
      <p class="sl-up-note">원본 주문내역 파일(<b>카페24</b> 공홈/파트너 CSV · <b>사방넷</b> 주문서 xlsx)을 올리면 자동 인식됩니다.
      기존 <b>매출현황</b> 업로드와는 별개 경로입니다.</p>
      <label class="btn btn-new sl-up-filebtn">📁 파일 선택
        <input type="file" id="slFileInput" accept=".csv,.xlsx,.xls" style="display:none" onchange="handleSalesLedgerFile(this)">
      </label>
    </div>`
}

function handleSalesLedgerFile(input) {
  const file = input.files && input.files[0]; if (!file) return
  const isCsv = /\.csv$/i.test(file.name)
  const reader = new FileReader()
  reader.onload = e => {
    let rows
    try { rows = _slReadWorkbookRows(e.target.result, isCsv) }
    catch (err) { showToast('파일을 읽지 못했습니다: ' + err.message, 'error'); return }
    input.value = ''
    const headers = rows[0] || []
    const type = _slDetectType(headers)
    if (!type) {
      _slRenderReject(file.name)
      return
    }
    const parsed = (type === SL_CH.c24) ? _slParseCafe24(rows) : _slParseSabang(rows)
    parsed.fileName = file.name
    parsed.rawRowCount = Math.max(0, rows.length - 1)
    _slParsed = parsed
    _slRenderPreview()
  }
  if (isCsv) reader.readAsText(file, 'UTF-8'); else reader.readAsArrayBuffer(file)
}

function _slRenderReject(fileName) {
  const body = document.getElementById('slUploadBody'); if (!body) return
  body.innerHTML = `
    <div class="sl-up-reject">
      <div class="sl-up-reject-title">❌ 인식할 수 없는 파일입니다</div>
      <div class="sl-up-reject-file">${esc(fileName)}</div>
      <div class="sl-up-reject-desc">
        기대 형식:<br>
        • <b>카페24</b>: 헤더에 <code>주문번호 · 자체 상품코드 · 상품구매금액 · 환불완료일</code> 포함<br>
        • <b>사방넷</b>: 헤더에 <code>쇼핑몰명 · 자체상품코드 · 결제금액 · 반품완료일자</code> 포함
      </div>
      ${_slUploadIntroHtml()}
    </div>`
}

function _slRenderPreview() {
  const p = _slParsed; if (!p) return
  const body = document.getElementById('slUploadBody'); if (!body) return
  const w = p.warn
  const orderCnt = p.orders.length
  const lineCnt = p.orders.reduce((s, o) => s + o.lines.length, 0)
  const typeLabel = p.type === SL_CH.c24 ? '카페24 (공홈/파트너)' : '사방넷'
  const mallRows = Object.keys(w.malls).sort().map(m => `${esc(m)} <b>${w.malls[m]}</b>`).join(' · ')

  const warnBlocks = []
  if (w.unmatched.size) warnBlocks.push(_slWarnBlock('품번 미매칭', w.unmatched.size, [...w.unmatched], '등록되지 않은 품번(원장엔 기록됨)'))
  if (w.dateFail.length) warnBlocks.push(_slWarnBlock('날짜/주문번호 문제', w.dateFail.length, w.dateFail, '해당 행 문제(주문번호 없는 행은 제외)'))
  if (w.anomaly.length) warnBlocks.push(_slWarnBlock('금액 이상치', w.anomaly.length, w.anomaly, '음수 매출(원장엔 기록됨)'))
  if (p.type === SL_CH.sb && w.newMalls.size) warnBlocks.push(_slWarnBlock('쇼핑몰명 목록', w.newMalls.size, [...w.newMalls], '채널 마스터 부재 — 향후 별칭 등록용'))
  if (p.type === SL_CH.c24 && w.newPartners && w.newPartners.size) warnBlocks.push(_slWarnBlock('🤝 새 파트너 후보', w.newPartners.size, [...w.newPartners], "회원등급이 'Partner'인데 파트너 명단에 없음 — [파트너별] 탭에서 명단 갱신 후 [집계 재계산] 권장(현재는 공홈 분류)"))
  if (p.type === SL_CH.c24 && w.friends) warnBlocks.push(`<div class="sl-warn"><div class="sl-warn-h">🎁 프렌즈·적립금 주문 <b>${w.friends}</b>건 <span class="sl-warn-info">(적립금 매출 별도 표시)</span></div></div>`)

  body.innerHTML = `
    <div class="sl-preview">
      <div class="sl-pv-head">
        <div class="sl-pv-type">${typeLabel}</div>
        <div class="sl-pv-file">${esc(p.fileName || '')}</div>
      </div>
      <div class="sl-pv-stats">
        <span>데이터 행 <b>${p.rawRowCount}</b></span>
        <span>주문 <b>${orderCnt}</b></span>
        <span>라인 <b>${lineCnt}</b></span>
        ${p.type === SL_CH.sb ? `<span>쇼핑몰 <b>${Object.keys(w.malls).length}</b></span>` : ''}
      </div>
      ${p.type === SL_CH.sb ? `<div class="sl-pv-malls">${mallRows}</div>` : ''}
      <div class="sl-warn-list">${warnBlocks.join('') || '<div class="sl-warn-none">경고 없음</div>'}</div>
      <div class="sl-pv-actions">
        <button class="btn btn-outline" onclick="closeSalesUploadModal()">취소</button>
        <button class="btn btn-new" id="slConfirmBtn" onclick="confirmSalesLedgerUpload()">원장에 반영</button>
      </div>
      <div class="sl-pv-hint">반영 = 신규 주문 생성 + 기존 주문 병합(변경분만 기록). 같은 파일을 다시 올리면 아무것도 안 바뀝니다.</div>
    </div>`
}

function _slWarnBlock(title, count, items, desc) {
  const list = (items || []).slice(0, 200).map(x => esc(String(x))).join('\n')
  const copyId = 'slcopy_' + Math.random().toString(36).slice(2, 8)
  return `<div class="sl-warn">
    <div class="sl-warn-h">⚠️ ${esc(title)} <b>${count}</b>건 <span class="sl-warn-info">${esc(desc || '')}</span>
      <button class="btn btn-outline btn-sm" onclick="_slCopyText('${copyId}')">복사</button></div>
    <textarea id="${copyId}" class="sl-warn-ta" readonly rows="4">${list}</textarea>
  </div>`
}
function _slCopyText(id) {
  const ta = document.getElementById(id); if (!ta) return
  ta.select()
  try { document.execCommand('copy'); showToast('복사됨', 'success') } catch (e) { showToast('복사 실패', 'warning') }
}

// 🔴 확정 = 기존 read(청크 documentId in ≤30) → 병합 계산 → 변경분 write(op ≤450) → 업로드 내역 기록.
async function confirmSalesLedgerUpload() {
  if (_slBusy) return
  const p = _slParsed
  if (!p || !p.orders.length) { showToast('반영할 주문이 없습니다.', 'warning'); return }
  if (!_slIsAdmin()) { showToast('업로드 권한이 없습니다.', 'warning'); return }
  if (typeof db === 'undefined' || !db) { showToast('DB 연결이 없습니다.', 'error'); return }
  _slBusy = true
  const btn = document.getElementById('slConfirmBtn'); if (btn) { btn.disabled = true; btn.textContent = '반영 중…' }

  const uid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : ''
  const workerName = (typeof formatUserName === 'function')
    ? formatUserName(_currentUserName, (typeof _currentUserPosition !== 'undefined' ? _currentUserPosition : ''))
    : ((typeof _currentUserName !== 'undefined' && _currentUserName) || '')
  const nowIso = new Date().toISOString()
  const uploadId = 'ULOG-' + ((typeof kstStamp === 'function') ? kstStamp() : nowIso.replace(/\D/g, '').slice(0, 14)) + '-' + Math.random().toString(36).slice(2, 6)

  try {
    // 1) 기존 doc read (청크 30)
    const keys = p.orders.map(o => o.key)
    const existing = {}
    const FP = firebase.firestore.FieldPath.documentId()
    for (let i = 0; i < keys.length; i += 30) {
      const chunk = keys.slice(i, i + 30)
      const snap = await db.collection('salesOrders').where(FP, 'in', chunk).get()
      snap.forEach(d => { existing[d.id] = d.data() })
    }

    // 2) 병합 계산 + 영향 일자 수집(증분 재계산용: 변경 주문의 주문일 + 반품일)
    const toWrite = []
    const affectedDays = new Set()
    let cNew = 0, cMerge = 0, cSame = 0, cReturns = 0
    p.orders.forEach(o => {
      const ex = existing[o.key] || null
      const res = _slMergeOrder(ex, o, uploadId, nowIso)
      cReturns += res.returns
      if (res.action === 'new' || res.action === 'merge') {
        toWrite.push({ id: o.key, doc: res.doc })
        if (res.action === 'new') cNew++; else cMerge++
        if (res.doc.od) affectedDays.add(res.doc.od)
        ;(res.doc.lines || []).forEach(l => { if (l.rd) affectedDays.add(l.rd) })
        // 🔴 옛 날짜(병합 전)도 수집 — od/rd 이동 시 옛 salesD/shard stale 방지(F2)
        if (ex) { if (ex.od) affectedDays.add(ex.od); (ex.rds || []).forEach(d => affectedDays.add(d)) }
      } else cSame++
    })

    // 3) write (op-count 청킹 ≤450). 무변경(cSame) = write 없음.
    const CHUNK = 450
    for (let i = 0; i < toWrite.length; i += CHUNK) {
      const batch = db.batch()
      toWrite.slice(i, i + CHUNK).forEach(r => {
        batch.set(db.collection('salesOrders').doc(r.id), r.doc)   // 전체 doc set(메모리 병합 완료 → 멱등)
      })
      await batch.commit()
    }

    // 4) 업로드 내역 기록(별도 1 doc)
    const uploadRec = {
      uploadId: uploadId, type: p.type, fileName: p.fileName || '',
      rows: p.rawRowCount || 0, orders: p.orders.length,
      cntNew: cNew, cntMerge: cMerge, cntSame: cSame, cntReturns: cReturns,
      unmatched: [...p.warn.unmatched].slice(0, 300), dateFail: p.warn.dateFail.slice(0, 300),
      anomaly: p.warn.anomaly.slice(0, 300), malls: p.warn.malls, friends: p.warn.friends || 0,
      newPartners: p.warn.newPartners ? [...p.warn.newPartners].slice(0, 300) : [],
      workerUid: uid, workerName: workerName, at: nowIso
    }
    await db.collection('salesUploads').doc(uploadId).set(uploadRec)

    if (typeof logActivity === 'function') logActivity('upload', '매출원장', `${p.type} — ${p.fileName} : 신규 ${cNew} · 병합 ${cMerge} · 무변경 ${cSame} · 반품 ${cReturns}`)
    _slUploads = []   // 캐시 무효화 → 다음 조회 시 재로드

    // 5) 증분 재계산 — 영향받은 일자의 salesD + 걸치는 월/주 shard 만 재도출(touched-only). 무변경(0 write)=0 재계산.
    //    🔴 L1 은 이미 커밋됨(진실). 재계산 실패해도 L1 안전 → [집계 재계산]으로 복구 가능(예외 흡수).
    let recalcNote = ''
    if (toWrite.length && affectedDays.size) {
      const btn2 = document.getElementById('slConfirmBtn'); if (btn2) btn2.textContent = '집계 갱신 중…'
      try { const rr = await _slRecomputeDaysAndShards([...affectedDays].sort()); recalcNote = `집계 갱신: ${rr.days}일` }
      catch (re) { console.error('증분 재계산 실패:', re && re.message); recalcNote = '⚠️ 집계 갱신 실패 — [집계 재계산] 필요' }
    }
    _slRenderResult({ cNew, cMerge, cSame, cReturns, writes: toWrite.length, recalcNote })
  } catch (e) {
    console.error('confirmSalesLedgerUpload 실패:', e && e.message)
    showToast('원장 반영 실패 — 다시 시도해주세요. (병합은 재업로드로 안전 재개됩니다)', 'error')
    if (btn) { btn.disabled = false; btn.textContent = '원장에 반영' }
    _slBusy = false
    return
  }
  _slBusy = false
}

function _slRenderResult(r) {
  const body = document.getElementById('slUploadBody'); if (!body) return
  body.innerHTML = `
    <div class="sl-result">
      <div class="sl-result-title">✅ 원장 반영 완료</div>
      <div class="sl-result-grid">
        <div class="sl-rc"><span>신규</span><b>${r.cNew}</b></div>
        <div class="sl-rc"><span>병합</span><b>${r.cMerge}</b></div>
        <div class="sl-rc"><span>변경없음</span><b>${r.cSame}</b></div>
        <div class="sl-rc sl-rc-ret"><span>반품 감지</span><b>${r.cReturns}</b></div>
      </div>
      <div class="sl-result-note">쓰기 ${r.writes}건 (변경없음은 쓰지 않음).${r.recalcNote ? ' · ' + esc(r.recalcNote) : ''}</div>
      <div class="sl-pv-actions">
        <button class="btn btn-outline" onclick="closeSalesUploadModal();switchSalesMgmtSub('summary')">일자별 요약 보기</button>
        <button class="btn btn-new" onclick="closeSalesUploadModal();switchSalesMgmtSub('history')">확인</button>
      </div>
    </div>`
}

// =============================================
// ===== 업로드 내역 조회(리스너 없음 — 1회 read) =====
// =============================================
async function loadSalesUploads(force) {
  if (_slUploads.length && !force) return _slUploads
  if (typeof db === 'undefined' || !db) return []
  try {
    const snap = await db.collection('salesUploads').get()
    const arr = []
    snap.forEach(d => arr.push(d.data()))
    arr.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    _slUploads = arr
  } catch (e) { console.error('loadSalesUploads:', e && e.message); _slUploads = [] }
  return _slUploads
}

async function renderSalesUploadHistory(force) {
  const tbody = document.getElementById('slHistBody'); if (!tbody) return
  tbody.innerHTML = `<tr><td colspan="9" class="sl-hist-loading">불러오는 중…</td></tr>`
  const list = await loadSalesUploads(force)
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="9" class="sl-hist-empty">업로드 내역이 없습니다.</td></tr>`; return }
  tbody.innerHTML = list.map(u => {
    const typeLabel = u.type === SL_CH.c24 ? '카페24' : (u.type === SL_CH.sb ? '사방넷' : esc(u.type || ''))
    const when = (typeof kstFormat === 'function') ? kstFormat(u.at, 'full') : esc(String(u.at || '').slice(0, 16))
    const warnCnt = (u.unmatched ? u.unmatched.length : 0) + (u.dateFail ? u.dateFail.length : 0) + (u.anomaly ? u.anomaly.length : 0)
    return `<tr>
      <td>${when}</td>
      <td>${typeLabel}</td>
      <td class="sl-hist-file" title="${esc(u.fileName || '')}">${esc(u.fileName || '')}</td>
      <td class="sl-c">${u.rows || 0}</td>
      <td class="sl-c">${u.orders || 0}</td>
      <td class="sl-c">${u.cntNew || 0} / ${u.cntMerge || 0} / ${u.cntSame || 0}</td>
      <td class="sl-c">${u.cntReturns || 0}</td>
      <td class="sl-c">${warnCnt ? `<span class="sl-hist-warn">${warnCnt}</span>` : '-'}</td>
      <td>${esc(u.workerName || '')}</td>
    </tr>`
  }).join('')
}

// =============================================
// ===== 메뉴 셸 (매출관리 탭) =====
// =============================================
const SL_SUBS = [
  { key: 'summary', label: '일자별 요약' },
  { key: 'matrix', label: '전체' },
  { key: 'malls', label: '쇼핑몰별' },
  { key: 'partner', label: '파트너별' },
  { key: 'orders', label: '주문 조회' },
  { key: 'history', label: '업로드 내역' }
]

function renderSalesMgmtTab() {
  const page = document.getElementById('salesMgmtPage'); if (!page) return
  const canUpload = _slIsAdmin()
  const subBar = SL_SUBS.map(s =>
    `<button class="store-subtab${s.key === _slActiveSub ? ' store-subtab-active' : ''}" onclick="switchSalesMgmtSub('${s.key}')">${esc(s.label)}</button>`
  ).join('')
  page.innerHTML = `
    <div class="store-header">
      <h2 class="store-title">💰 매출관리</h2>
      <div class="sl-head-actions">
        ${canUpload ? `<button class="btn btn-new" onclick="openSalesUploadModal()">📤 주문내역 업로드</button>` : '<span class="sl-head-note">업로드는 관리자만 가능합니다</span>'}
      </div>
    </div>
    <div class="store-subtabs">${subBar}</div>
    <div class="sl-note-phase">원본 주문내역(카페24/사방넷)을 주문 원장에 적재 → 일자별 매출 집계. 품번×채널 매트릭스는 다음 단계에서 추가됩니다.</div>
    <div class="store-panels">
      <div class="store-panel${_slActiveSub === 'summary' ? '' : ' store-panel-hidden'}" id="slPanel_summary">
        <div class="sl-sum-controls">
          <label class="inbhist-ctl">시작일 <input type="date" id="slSumStart" class="inbhist-date" onchange="renderSalesSummary()"></label>
          <label class="inbhist-ctl">마지막일 <input type="date" id="slSumEnd" class="inbhist-date" onchange="renderSalesSummary()"></label>
          <button class="btn btn-outline" onclick="renderSalesSummary()">↻ 조회</button>
          ${canUpload ? `<button class="btn btn-new" id="slRecalcBtn" onclick="runSalesRecompute()">🔄 집계 재계산</button>` : ''}
          ${canUpload ? `<button class="btn btn-outline" onclick="openSalesVerifyModal()">🧪 데이터 검증</button>` : ''}
          <button class="btn btn-outline" onclick="downloadSalesSummary()">📥 엑셀</button>
        </div>
        <div id="slSummaryBody"><div class="sl-hist-loading">불러오는 중…</div></div>
      </div>
      <div class="store-panel${_slActiveSub === 'matrix' ? '' : ' store-panel-hidden'}" id="slPanel_matrix">
        <div class="sl-mx-toolbar"><span class="store-title-sm">전체 (품번×채널)</span><button class="btn btn-outline" onclick="downloadSalesMatrix()">📥 엑셀</button></div>
        <div id="slMatrixBody"><div class="sl-hist-loading">불러오는 중…</div></div>
      </div>
      <div class="store-panel${_slActiveSub === 'malls' ? '' : ' store-panel-hidden'}" id="slPanel_malls">
        <div class="sl-mx-toolbar"><span class="store-title-sm">쇼핑몰별 (사방넷)</span><button class="btn btn-outline" onclick="downloadSalesMalls()">📥 엑셀</button></div>
        <div id="slMallsBody"><div class="sl-hist-loading">불러오는 중…</div></div>
      </div>
      <div class="store-panel${_slActiveSub === 'partner' ? '' : ' store-panel-hidden'}" id="slPanel_partner">
        <div id="slPartnerBody"></div>
      </div>
      <div class="store-panel${_slActiveSub === 'orders' ? '' : ' store-panel-hidden'}" id="slPanel_orders">
        <div id="slOrdersBody"></div>
      </div>
      <div class="store-panel${_slActiveSub === 'history' ? '' : ' store-panel-hidden'}" id="slPanel_history">
        <div class="sl-hist-toolbar"><button class="btn btn-outline" onclick="renderSalesUploadHistory(true)">↻ 새로고침</button></div>
        <div class="sl-hist-wrap">
          <table class="data-table inbhist-table sl-hist-table">
            <thead><tr>
              <th style="width:130px">시각</th><th style="width:64px">유형</th><th>파일</th>
              <th style="width:60px">행</th><th style="width:60px">주문</th>
              <th style="width:120px">신규/병합/무변경</th><th style="width:60px">반품</th>
              <th style="width:52px">경고</th><th style="width:90px">작업자</th>
            </tr></thead>
            <tbody id="slHistBody"><tr><td colspan="9" class="sl-hist-loading">불러오는 중…</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>`
  _slRenderSub(_slActiveSub)
}

function _slRenderSub(sub) {
  if (sub === 'summary') renderSalesSummary()
  else if (sub === 'matrix') renderSalesMatrix()
  else if (sub === 'malls') renderSalesMalls()
  else if (sub === 'partner') renderSalesPartner()
  else if (sub === 'orders') renderSalesOrdersTab()
  else if (sub === 'history') renderSalesUploadHistory(false)
}

function switchSalesMgmtSub(sub) {
  _slActiveSub = sub
  document.querySelectorAll('#salesMgmtPage .store-subtab').forEach(btn => {
    const on = btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf("'" + sub + "'") >= 0
    btn.classList.toggle('store-subtab-active', !!on)
  })
  document.querySelectorAll('#salesMgmtPage .store-panel').forEach(p => {
    p.classList.toggle('store-panel-hidden', p.id !== 'slPanel_' + sub)
  })
  _slRenderSub(sub)
}

// =============================================
// ===== Phase 2: 집계층(L2/L3) + 증분 재계산 + 일자별 요약 =====
// =============================================
// 🔴 파생 데이터 원칙: L2(salesD)/L3(salesM/salesW) 는 항상 L1(salesOrders)에서 재도출 가능(재계산 도구가 증명).
//   판매=주문일(od) 귀속 · 반품=반품일(라인 rd) 귀속. 적립금(pts)=주문 pu 를 라인 rv 가중 분배(Σ=pu).
//   재계산=touched shard 전체 재도출(증분-가산 금지 → 멱등). L1 은 재계산이 절대 변경 안 함(rds 인덱스 backfill 은 additive 예외).
//   🔴 리스너 금지 · op-count 청킹 · 복합인덱스 불요(od range=단일필드, rds array-contains=단일필드, grp=클라 필터).

// ---- 날짜 유틸(달력 날짜 산술 — UTC getUTC* 사용, Intl/로컬 금지) ----
function _slMonthKey(dk) { return String(dk || '').slice(0, 7) }                 // 'YYYY-MM'
function _slParseDK(dk) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dk || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN }
function _slFmtDK(t) { const d = new Date(t); return d.getUTCFullYear() + '-' + _slPad(d.getUTCMonth() + 1) + '-' + _slPad(d.getUTCDate()) }
function _slWeekStart(dk) { const t = _slParseDK(dk); if (isNaN(t)) return dk; const off = (new Date(t).getUTCDay() + 6) % 7; return _slFmtDK(t - off * 86400000) }   // 월요일 dateKey
function _slWeekRange(ws) { const t = _slParseDK(ws); return [ws, _slFmtDK(t + 6 * 86400000)] }
function _slMonthRange(m) { const y = +m.slice(0, 4), mo = +m.slice(5, 7); return [m + '-01', m + '-' + _slPad(new Date(Date.UTC(y, mo, 0)).getUTCDate())] }
function _slDaysInRange(s, e) { const out = []; let t = _slParseDK(s); const te = _slParseDK(e); if (isNaN(t) || isNaN(te)) return out; let g = 0; while (t <= te && g < 1200) { out.push(_slFmtDK(t)); t += 86400000; g++ } return out }
function _slInR(dk, s, e) { return dk && dk >= s && dk <= e }

// ---- 총액을 라인 rv 가중으로 정수 분배(largest-remainder, Σ=total 정확) ----
function _slAllocByRv(lines, total) {
  const n = (lines || []).length, out = new Array(n).fill(0)
  if (!total || !n) return out
  const tot = lines.reduce((s, l) => s + _slNum(l.rv || 0), 0)
  if (tot <= 0) return out
  const raw = lines.map(l => total * _slNum(l.rv || 0) / tot)
  raw.forEach((x, i) => { out[i] = Math.floor(x) })
  let rem = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((x, i) => ({ i, f: x - Math.floor(x), rv: _slNum(lines[i].rv || 0) })).sort((a, b) => b.f - a.f || b.rv - a.rv)
  for (let k = 0; k < order.length && rem > 0; k++) { out[order[k].i]++; rem-- }
  return out
}
// 적립금 라인 분배(주문 pu 를 rv 가중, Σ=pu 정확)
function _slLinePtsMap(o) { return _slAllocByRv(o.lines || [], _slNum(o.pu || 0)) }

// ---- 반품액 라인 분배 ----
// gross=true(L2 채널 총액, §1.4 대사): 사방넷 배송비 포함 · 카페24 U(실제환불금액) authoritative.
// gross=false(L3 품번 상품): 사방넷 배송 제외.
function _slOrderRamtMap(o, gross) {
  const lines = o.lines || [], out = new Array(lines.length).fill(0)
  const ret = []; lines.forEach((l, i) => { if (l.rd) ret.push(i) })
  if (!ret.length) return out
  if (o.ch === SL_CH.sb) { ret.forEach(i => { out[i] = _slNum(lines[i].rv || 0) + (gross ? _slNum(lines[i].sh || 0) : 0) }); return out }   // 사방넷: 판매(+배송) 역전
  // 🔴 카페24: §1.4 U(ref, 실제환불금액)=authoritative → ref 를 rv 가중 분배(rf 혼용 금지 = 과대계상 방지, Σ=U). ref 없을 때만 rf/rv 폴백.
  const ref = _slNum(o.ref || 0)
  if (ref > 0) {
    const tot = ret.reduce((s, i) => s + _slNum(lines[i].rv || 0), 0)
    if (tot > 0) {
      const raw = ret.map(i => ref * _slNum(lines[i].rv || 0) / tot)
      const fl = raw.map(x => Math.floor(x)); let rem = ref - fl.reduce((a, b) => a + b, 0)
      const order = ret.map((idx, k) => ({ k, f: raw[k] - Math.floor(raw[k]), rv: _slNum(lines[idx].rv || 0) })).sort((a, b) => b.f - a.f || b.rv - a.rv)
      for (let j = 0; j < order.length && rem > 0; j++) { fl[order[j].k]++; rem-- }
      ret.forEach((idx, k) => { out[idx] = fl[k] })
      return out
    }
  }
  ret.forEach(i => { out[i] = _slNum(lines[i].rf || 0) || _slNum(lines[i].rv || 0) })   // ref 없음 → 라인 환불금액 or 판매 역전
  return out
}

// ---- 순수 집계기 ----
function _slZeroGrp(withMalls) { const g = { sq: 0, samt: 0, pts: 0, rq: 0, ramt: 0 }; if (withMalls) g.malls = {}; return g }
function _slMallBucket(g, mall) { return g.malls[mall] || (g.malls[mall] = { q: 0, amt: 0, rq: 0, ramt: 0 }) }

// L2 일별: { d, c24:{sq,samt,pts,rq,ramt}, sb:{...,malls}, gh:{...}, pt:{...} }
// 🔴 gh/pt = 카페24(c24) 공홈/파트너 분해(가산적) — 모든 c24 기여를 c24 총계 + (gh|pt) 양쪽에 더함 → gh+pt == c24 정확 보존(Phase4 split conservation).
function _slAggDay(orders, day, ptSet) {
  const res = { d: day, c24: _slZeroGrp(false), sb: _slZeroGrp(true), gh: _slZeroGrp(false), pt: _slZeroGrp(false) }
  orders.forEach(o => {
    const grp = (o.ch === SL_CH.c24) ? 'c24' : 'sb'
    const b = res[grp], pts = _slLinePtsMap(o), ram = _slOrderRamtMap(o, true)   // 🔴 gross(배송비 포함 = §1.4 대사)
    const sp = (grp === 'c24') ? (_slOrderIsPartner(o, ptSet) ? res.pt : res.gh) : null   // 공홈/파트너 분해 대상(카페24만)
    const saleIn = o.od === day
    if (saleIn && grp === 'c24') { b.samt += _slNum(o.ship || 0); sp.samt += _slNum(o.ship || 0) }   // 카페24 배송비(Q)=주문단위 1회
    ;(o.lines || []).forEach((l, i) => {
      if (saleIn) {
        const ls = _slNum(l.rv) + _slNum(l.sh || 0)   // 사방넷 라인 배송비 folded(카페24 l.sh 없음 → o.ship 로 별도 1회)
        b.sq += _slNum(l.q); b.samt += ls; b.pts += pts[i]
        if (sp) { sp.sq += _slNum(l.q); sp.samt += ls; sp.pts += pts[i] }
        if (grp === 'sb') { const m = _slMallBucket(b, o.mall || '(미상)'); m.q += _slNum(l.q); m.amt += ls }
      }
      if (l.rd === day) {
        b.rq += _slNum(l.q); b.ramt += ram[i]
        if (sp) { sp.rq += _slNum(l.q); sp.ramt += ram[i] }
        if (grp === 'sb') { const m = _slMallBucket(b, o.mall || '(미상)'); m.rq += _slNum(l.q); m.ramt += ram[i] }
      }
    })
  })
  return res
}

// L3 기간×품번: { grp, items:{품번:{q,amt,pts,rq,ramt[,malls]}} }
// 🔴 amt=gross(배송비 포함=L2/요약 동일 기준 → 매트릭스 Σ = 요약 정확 대사). 사방넷=라인 배송비 직접 · 카페24=주문 배송비를 rv 가중 분배.
// 🔴 c24 shard: items[code] 에 gh/pt 분해(가산적, gh+pt==item 총계) 추가 + ptBy(파트너별 per-bid per-품번) 사이드맵.
//   ptBy = { bidNorm: { name, items:{ code:{q,amt,rq,ramt} } } } — 파트너 주문 subset(sparse), 파트너별 탭 소스. sb grp 은 무변경.
function _slAggShard(orders, grp, pStart, pEnd, ptSet) {
  const items = {}
  const ptBy = {}
  const get = code => items[code] || (items[code] = { q: 0, amt: 0, pts: 0, rq: 0, ramt: 0 })
  const side = (it, key) => it[key] || (it[key] = { q: 0, amt: 0, rq: 0, ramt: 0 })
  orders.forEach(o => {
    const og = (o.ch === SL_CH.c24) ? 'c24' : 'sb'
    if (og !== grp) return
    const pts = _slLinePtsMap(o), ram = _slOrderRamtMap(o, true)   // gross(배송 포함) — L2/요약 대사
    const saleIn = _slInR(o.od, pStart, pEnd)
    const shipMap = (og === 'c24' && saleIn) ? _slAllocByRv(o.lines || [], _slNum(o.ship || 0)) : null   // 카페24 주문 배송비 rv 가중 분배
    const isPt = og === 'c24' && _slOrderIsPartner(o, ptSet)
    const sideKey = isPt ? 'pt' : 'gh'
    let pmap = null
    if (isPt) { const bn = _slPidNorm(o.bid); pmap = ptBy[bn] || (ptBy[bn] = { name: _slPartnerName(o.bid) || o.bid, items: {} }) }
    const pget = code => pmap.items[code] || (pmap.items[code] = { q: 0, amt: 0, rq: 0, ramt: 0 })
    ;(o.lines || []).forEach((l, i) => {
      const code = l.c || '(미상)'
      if (saleIn) {
        const lineShip = (og === 'sb') ? _slNum(l.sh || 0) : (shipMap ? shipMap[i] : 0)   // 사방넷=라인 배송비 · 카페24=분배분
        const amt = _slNum(l.rv) + lineShip
        const it = get(code); it.q += _slNum(l.q); it.amt += amt; it.pts += pts[i]
        if (og === 'c24') { const s = side(it, sideKey); s.q += _slNum(l.q); s.amt += amt }
        if (isPt) { const pi = pget(code); pi.q += _slNum(l.q); pi.amt += amt }
        if (grp === 'sb') { it.malls = it.malls || {}; const m = it.malls[o.mall || '(미상)'] || (it.malls[o.mall || '(미상)'] = { q: 0, amt: 0 }); m.q += _slNum(l.q); m.amt += amt }
      }
      if (_slInR(l.rd, pStart, pEnd)) {
        const it = get(code); it.rq += _slNum(l.q); it.ramt += ram[i]
        if (og === 'c24') { const s = side(it, sideKey); s.rq += _slNum(l.q); s.ramt += ram[i] }
        if (isPt) { const pi = pget(code); pi.rq += _slNum(l.q); pi.ramt += ram[i] }
      }
    })
  })
  return { grp: grp, items: items, ptBy: grp === 'c24' ? ptBy : undefined }
}

// ---- L1 조회(재계산용, 리스너 없음) ----
async function _slFetchByOd(pStart, pEnd) {
  const snap = await db.collection('salesOrders').where('od', '>=', pStart).where('od', '<=', pEnd).get()
  const map = {}; snap.forEach(d => { map[d.id] = d.data() }); return map
}
async function _slFetchByRdsAny(days) {
  const map = {}
  for (let i = 0; i < days.length; i += 10) {
    const chunk = days.slice(i, i + 10)
    const snap = await db.collection('salesOrders').where('rds', 'array-contains-any', chunk).get()
    snap.forEach(d => { map[d.id] = d.data() })
  }
  return map
}
async function _slFetchPeriodOrders(pStart, pEnd) {
  const byOd = await _slFetchByOd(pStart, pEnd)
  const byRd = await _slFetchByRdsAny(_slDaysInRange(pStart, pEnd))
  const merged = Object.assign({}, byRd, byOd)   // union(od 우선, 같은 doc 중복 제거)
  return Object.values(merged)
}

// ---- 재계산(touched shard 전체 재도출) ----
async function _slRecomputeDay(day, ptSet) {
  const orders = await _slFetchPeriodOrders(day, day)
  const body = _slAggDay(orders, day, ptSet); body.ut = new Date().toISOString()
  await db.collection('salesD').doc(day).set(body)
}
async function _slRecomputeShard(coll, labelField, docId, grp, pStart, pEnd, periodLabel, ptSet) {
  const orders = await _slFetchPeriodOrders(pStart, pEnd)
  const agg = _slAggShard(orders, grp, pStart, pEnd, ptSet)
  const body = { grp: grp, items: agg.items, ut: new Date().toISOString() }
  body[labelField] = periodLabel
  if (grp === 'c24' && agg.ptBy) body.ptBy = agg.ptBy   // 파트너별 per-bid per-품번(파트너별 탭 소스)
  // 🔴 shard 크기 가드(Firestore 1MB 한계 · ptBy 추가로 팽창 가능) — 경고만(sub-shard 분리=문서화된 후속)
  try { const sz = JSON.stringify(body).length; if (sz > 900000) console.warn('[salesLedger] 대용량 shard:', docId, sz, 'bytes — ptBy sub-shard 분리 검토 필요') } catch (e) {}
  await db.collection(coll).doc(docId).set(body)
}
// 주어진 day 집합 → salesD + 걸치는 월/주 shard(×grp) 재계산. ptSet 미전달 시 마스터 자동 로드.
async function _slRecomputeDaysAndShards(dayArr, onProg, ptSet) {
  if (!ptSet) { await _slEnsurePartnerMaster(); ptSet = _slPartnerActiveSet() }
  const months = new Set(), weeks = new Set()
  let done = 0
  for (const d of dayArr) { await _slRecomputeDay(d, ptSet); months.add(_slMonthKey(d)); weeks.add(_slWeekStart(d)); if (onProg) onProg(++done, dayArr.length) }
  for (const m of months) { const [s, e] = _slMonthRange(m); for (const g of ['c24', 'sb']) await _slRecomputeShard('salesM', 'm', m + '_' + g, g, s, e, m, ptSet) }
  for (const w of weeks) { const [s, e] = _slWeekRange(w); for (const g of ['c24', 'sb']) await _slRecomputeShard('salesW', 'w', w + '_' + g, g, s, e, w, ptSet) }
  return { days: dayArr.length, months: months.size, weeks: weeks.size }
}

// rds/codes 인덱스 backfill(전 컬렉션 스캔, additive·멱등). Phase 1/2 doc 은 필드 없을 수 있음 → 재계산 도구가 1회 채움. 이후 merge 가 유지.
function _slArrEq(a, b) { a = a || []; b = b || []; return a.length === b.length && a.every((x, i) => x === b[i]) }
async function _slBackfillRds(onProg) {
  const snap = await db.collection('salesOrders').get()
  const upd = []
  snap.forEach(d => {
    const data = d.data(), wantR = _slDocRds(data.lines), wantC = _slDocCodes(data.lines)
    const patch = {}
    if (!_slArrEq(wantR, data.rds)) patch.rds = wantR
    if (!_slArrEq(wantC, data.codes)) patch.codes = wantC
    if (Object.keys(patch).length) upd.push({ id: d.id, patch })
  })
  for (let i = 0; i < upd.length; i += 450) {
    const b = db.batch(); upd.slice(i, i + 450).forEach(u => b.update(db.collection('salesOrders').doc(u.id), u.patch)); await b.commit()
    if (onProg) onProg(Math.min(i + 450, upd.length), upd.length)
  }
  return upd.length
}

// 🔴 관리자 재계산 도구: 범위 전체 재빌드(backfill → 영향일 판정 → 재계산). 멱등(재실행=동일 결과).
async function recomputeSalesRange(startDate, endDate, onProg) {
  if (typeof db === 'undefined' || !db) throw new Error('no db')
  if (onProg) onProg('파트너 마스터 확인 중…')
  await _slEnsurePartnerMaster()
  const ptSet = _slPartnerActiveSet()   // 🔴 이번 재계산 전체에 고정된 분류 기준(마스터 스냅샷)
  if (onProg) onProg('rds 인덱스 확인 중…')
  await _slBackfillRds()
  if (onProg) onProg('영향 일자 수집 중…')
  const byOd = await _slFetchByOd(startDate, endDate)
  const days = new Set(), cand = {}
  Object.values(byOd).forEach(o => { if (_slInR(o.od, startDate, endDate)) days.add(o.od); _slCollectCandidate(o, ptSet, cand) })
  const byRd = await _slFetchByRdsAny(_slDaysInRange(startDate, endDate))
  Object.values(byRd).forEach(o => { (o.rds || []).forEach(d => { if (_slInR(d, startDate, endDate)) days.add(d) }) })
  const dayArr = [...days].sort()
  const r = await _slRecomputeDaysAndShards(dayArr, (a, b) => { if (onProg) onProg(`재계산 ${a}/${b}일`) }, ptSet)
  r.candidates = Object.keys(cand).map(bid => bid + (cand[bid] ? ' (' + cand[bid] + ')' : ''))   // 새 파트너 후보(마스터 갱신 신호)
  return r
}

// ---- 일자별 요약 뷰(L2 salesD 만 read) ----
async function _slLatestDataDate() {
  try {
    const snap = await db.collection('salesD').orderBy(firebase.firestore.FieldPath.documentId(), 'desc').limit(1).get()
    let dk = ''; snap.forEach(d => { dk = d.id }); return dk
  } catch (e) { return '' }
}
async function _slLoadSalesDaily(start, end) {
  const snap = await db.collection('salesD')
    .orderBy(firebase.firestore.FieldPath.documentId())
    .startAt(start).endAt(end).get()
  const arr = []; snap.forEach(d => arr.push(d.data())); return arr
}

// 🔴 공홈/파트너 분해 fallback — 재계산 전(구 shard=gh/pt 부재) = 전액 공홈(파트너 0). 재계산 후 실제 분리.
//   → gh+pt == c24 항상 보존(무손실). 재계산은 '파트너 몫을 pt 로 이동'만 함.
function _slSplitBlock(c) {
  c = c || {}
  if (c.gh || c.pt) return { gh: c.gh || _slZeroGrp(false), pt: c.pt || _slZeroGrp(false) }
  return { gh: c, pt: _slZeroGrp(false) }
}
function _slItemSplit(it) {
  it = it || {}
  if (it.gh || it.pt) return { gh: it.gh || {}, pt: it.pt || {} }
  return { gh: it, pt: {} }
}

let _slSummaryRows = []

async function renderSalesSummary() {
  const panel = document.getElementById('slSummaryBody'); if (!panel) return
  let start = (document.getElementById('slSumStart') || {}).value
  let end = (document.getElementById('slSumEnd') || {}).value
  if (!start || !end) {
    const latest = await _slLatestDataDate()
    start = end = latest || (typeof kstDateKey === 'function' ? kstDateKey() : new Date().toISOString().slice(0, 10))
    const si = document.getElementById('slSumStart'), ei = document.getElementById('slSumEnd')
    if (si) si.value = start; if (ei) ei.value = end
  }
  if (start > end) { const t = start; start = end; end = t }
  panel.innerHTML = '<div class="sl-hist-loading">불러오는 중…</div>'
  let rows
  try { rows = await _slLoadSalesDaily(start, end) } catch (e) { panel.innerHTML = '<div class="sl-hist-empty">조회 실패: ' + esc(e.message) + '</div>'; return }
  _slSummaryRows = rows
  if (!rows.length) { panel.innerHTML = `<div class="sl-hist-empty">해당 기간 집계 데이터가 없습니다. 관리자라면 [집계 재계산]으로 생성하세요.</div>`; return }
  const fmt = v => (v || 0).toLocaleString()
  let tG = { s: 0, r: 0 }, tP = { s: 0, r: 0 }, tCp = 0, tS = { s: 0, r: 0 }
  const body = rows.map(d => {
    const c = d.c24 || {}, s = d.sb || {}
    const sp = _slSplitBlock(c)   // 공홈/파트너(재계산 전=전액 공홈)
    const ghS = sp.gh.samt || 0, ghR = sp.gh.ramt || 0, ptS = sp.pt.samt || 0, ptR = sp.pt.ramt || 0
    const sNet = (s.samt || 0) - (s.ramt || 0)
    tG.s += ghS; tG.r += ghR; tP.s += ptS; tP.r += ptR; tCp += c.pts || 0; tS.s += s.samt || 0; tS.r += s.ramt || 0
    return `<tr>
      <td>${esc(d.d)}</td>
      <td class="sl-c">${fmt(ghS)}</td><td class="sl-c">${fmt(ghR)}</td><td class="sl-c">${fmt(ghS - ghR)}</td>
      <td class="sl-c sl-pt-col">${fmt(ptS)}</td><td class="sl-c sl-pt-col">${fmt(ptR)}</td><td class="sl-c sl-pt-col">${fmt(ptS - ptR)}</td>
      <td class="sl-c sl-pts">${fmt(c.pts)}</td>
      <td class="sl-c">${fmt(s.samt)}</td><td class="sl-c">${fmt(s.ramt)}</td><td class="sl-c">${fmt(sNet)}</td>
      <td class="sl-c sl-net"><b>${fmt((ghS - ghR) + (ptS - ptR) + sNet)}</b></td>
    </tr>`
  }).join('')
  const totNet = (tG.s - tG.r) + (tP.s - tP.r) + (tS.s - tS.r)
  panel.innerHTML = `
    <div class="sl-sum-basis">📅 주문일 기준 · 반품=반품완료일 귀속 · 매장(POS) 미포함(Phase3 조인). 카페24=<b>공홈</b>(자사몰)+<b>파트너</b>(주문자ID∈파트너 명단) 분리 · 매출=기존 매출공식과 동일 기준(상품구매−추가할인+배송비 · 사방넷 결제금액+배송비). 적립금분=카페24 전체 기준 별도 표시. <b>공홈+파트너 = 카페24 총액(무손실)</b> · 파트너 분리는 [파트너별] 명단 등록 + [집계 재계산] 후 반영.</div>
    <div class="sl-hist-wrap">
      <table class="data-table inbhist-table sl-sum-table">
        <thead>
          <tr><th rowspan="2">날짜</th><th colspan="7">카페24</th><th colspan="3">사방넷</th><th rowspan="2">합계 순액</th></tr>
          <tr><th>공홈 매출</th><th>공홈 반품</th><th>공홈 순액</th><th class="sl-pt-col">파트너 매출</th><th class="sl-pt-col">파트너 반품</th><th class="sl-pt-col">파트너 순액</th><th>적립금분</th><th>매출</th><th>반품</th><th>순액</th></tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot><tr class="sl-sum-foot">
          <td>합계</td>
          <td class="sl-c">${fmt(tG.s)}</td><td class="sl-c">${fmt(tG.r)}</td><td class="sl-c">${fmt(tG.s - tG.r)}</td>
          <td class="sl-c sl-pt-col">${fmt(tP.s)}</td><td class="sl-c sl-pt-col">${fmt(tP.r)}</td><td class="sl-c sl-pt-col">${fmt(tP.s - tP.r)}</td>
          <td class="sl-c sl-pts">${fmt(tCp)}</td>
          <td class="sl-c">${fmt(tS.s)}</td><td class="sl-c">${fmt(tS.r)}</td><td class="sl-c">${fmt(tS.s - tS.r)}</td>
          <td class="sl-c sl-net"><b>${fmt(totNet)}</b></td>
        </tr></tfoot>
      </table>
    </div>`
}

function downloadSalesSummary() {
  if (!_slSummaryRows.length) { showToast('내려받을 데이터가 없습니다.', 'warning'); return }
  if (typeof XLSX === 'undefined') { showToast('엑셀 모듈 로드 실패', 'error'); return }
  const aoa = [['날짜', '공홈 매출', '공홈 반품', '공홈 순액', '파트너 매출', '파트너 반품', '파트너 순액', '카페24 적립금분', '사방넷 매출', '사방넷 반품', '사방넷 순액', '합계 순액']]
  _slSummaryRows.forEach(d => {
    const c = d.c24 || {}, s = d.sb || {}, sp = _slSplitBlock(c)
    const ghS = sp.gh.samt || 0, ghR = sp.gh.ramt || 0, ptS = sp.pt.samt || 0, ptR = sp.pt.ramt || 0, sN = (s.samt || 0) - (s.ramt || 0)
    aoa.push([d.d, ghS, ghR, ghS - ghR, ptS, ptR, ptS - ptR, c.pts || 0, s.samt || 0, s.ramt || 0, sN, (ghS - ghR) + (ptS - ptR) + sN])
  })
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '일자별매출')
  const s = _slSummaryRows[0].d, e = _slSummaryRows[_slSummaryRows.length - 1].d
  XLSX.writeFile(wb, `매출요약_${s}~${e}.xlsx`)
}

// 관리자 재계산 실행(현재 요약 뷰의 기간)
async function runSalesRecompute() {
  if (!_slIsAdmin()) { showToast('권한이 없습니다.', 'warning'); return }
  if (_slBusy) return
  let start = (document.getElementById('slSumStart') || {}).value
  let end = (document.getElementById('slSumEnd') || {}).value
  if (!start || !end) { showToast('기간을 선택하세요.', 'warning'); return }
  if (start > end) { const t = start; start = end; end = t }
  const days = _slDaysInRange(start, end).length
  const ok = await korConfirm(`${start} ~ ${end} (${days}일) 구간의 집계를 L1 원장에서 재계산합니다.\n\n(멱등 — 재실행해도 동일 결과. L1 원장은 변경되지 않습니다.)`, '재계산', '취소')
  if (!ok) return
  _slBusy = true
  const btn = document.getElementById('slRecalcBtn'); if (btn) { btn.disabled = true; btn.textContent = '재계산 중…' }
  try {
    const r = await recomputeSalesRange(start, end, msg => { if (btn) btn.textContent = msg })
    showToast(`집계 재계산 완료 — ${r.days}일 · 월 ${r.months} · 주 ${r.weeks} shard` + ((r.candidates && r.candidates.length) ? ` · ⚠️ 새 파트너 후보 ${r.candidates.length}명` : ''), 'success')
    if (typeof logActivity === 'function') logActivity('setting', '매출집계', `재계산 ${start}~${end} : ${r.days}일/${r.months}월/${r.weeks}주`)
    await renderSalesSummary()
  } catch (e) {
    console.error('runSalesRecompute:', e && e.message)
    showToast('재계산 실패 — 다시 시도해주세요. (L1 원장은 안전)', 'error')
  }
  if (btn) { btn.disabled = false; btn.textContent = '🔄 집계 재계산' }
  _slBusy = false
}

// =============================================
// ===== Phase 3: 품번×채널 매트릭스 탭 (전체/쇼핑몰별/파트너/주문조회) =====
// =============================================
// 🔴 화면 READ 전용(L1/L3/storeSales 조회, 쓰기 없음 · merge 의 codes[] 유지 제외). 리스너 금지.
//   매트릭스 Σ = 일자별 요약(같은 기간·기준) 정확 대사(_slAggShard=aggDay 와 동일 gross 기준).
//   매장(POS) 열 = storeSales 뷰타임 조인(single-truth, L2/L3 미저장) — 매출 조회 netting 원리 재사용.

let _slMxStart = '', _slMxEnd = '', _slMxUnit = 'amt', _slMxSearch = ''
let _slMatrixRows = [], _slMallsData = null, _slOrdersFound = []

// 상품명 조회(State.allProducts, 렌더마다 신선)
function _slNameMap() {
  const m = {}; const list = (typeof State !== 'undefined' && State.allProducts) ? State.allProducts : []
  list.forEach(p => { if (p && p.productCode) m[String(p.productCode).toUpperCase()] = p.nameKr || '' })
  return m
}
// ②: 품번 → 상품 객체 맵(대표 이미지 썸네일용, 인메모리 — 추가 Firestore read 없음). 렌더마다 신선(_slNameMap 미러).
function _slProdMap() {
  const m = {}; const list = (typeof State !== 'undefined' && State.allProducts) ? State.allProducts : []
  list.forEach(p => { if (p && p.productCode) m[String(p.productCode).toUpperCase()] = p })
  return m
}
// ②: 매트릭스 썸네일 셀(매출현황/상품조회 패턴 재사용 — class="thumb" · loading="lazy" · placeholder onerror). 클릭=품번 셀과 동일 상세 모달(_slOpenProduct) → 행당 갤러리 JSON 미부착(800+행 perf).
function _slThumbCell(code, pmap) {
  const p = pmap[String(code).toUpperCase()]
  const ph = (typeof PLACEHOLDER_IMG !== 'undefined') ? PLACEHOLDER_IMG : 'assets/logo-placeholder.png'
  const url = (p && typeof getThumbUrl === 'function' ? getThumbUrl(p) : null) || ph
  return `<td class="sl-thumb-cell"><img src="${url}" class="thumb sl-thumb" loading="lazy" onerror="this.onerror=null;this.src='${ph}'" onclick="_slOpenProduct('${esc(code)}')" /></td>`
}

async function _slReadShard(coll, id) { try { const d = await db.collection(coll).doc(id).get(); return d.exists ? d.data() : null } catch (e) { return null } }

// 하이브리드: 정확히 한 달/한 주면 L3 shard · 그 외(일/범위)는 L1 스캔(_slAggShard=동일 기준).
async function _slMatrixItems(grp, pStart, pEnd) {
  const mk = _slMonthKey(pStart)
  if (pStart === mk + '-01' && pEnd === _slMonthRange(mk)[1]) { const d = await _slReadShard('salesM', mk + '_' + grp); if (d && d.items) return d.items }
  if (_slWeekStart(pStart) === pStart && _slWeekRange(pStart)[1] === pEnd) { const d = await _slReadShard('salesW', pStart + '_' + grp); if (d && d.items) return d.items }
  const orders = await _slFetchPeriodOrders(pStart, pEnd)
  let ptSet = null
  if (grp === 'c24') { await _slEnsurePartnerMaster(); ptSet = _slPartnerActiveSet() }   // L1 스캔 경로도 gh/pt 분해(마스터-타임)
  return _slAggShard(orders, grp, pStart, pEnd, ptSet).items
}

// 🔴 매장(POS) per-품번 순액 = storeSales 판매 − 취소(void). 매출 조회 netting 재사용:
//   판매=dateKey range(전 매장) · 취소=_shFetchVoidsByOrig(originalSaleId, 날짜무관) → 라인 lineTotal 로 per-품번 상쇄.
//   Σ = _shComputeAgg 의 remainingTotal(soldTotal−voidedTotal) 과 동치(라인 lineTotal 합=totals.total).
async function _slStorePos(pStart, pEnd) {
  const items = {}
  if (typeof db === 'undefined' || !db) return items
  let snap
  try { snap = await db.collection('storeSales').where('dateKey', '>=', pStart).where('dateKey', '<=', pEnd).get() }
  catch (e) { console.warn('storeSales 조회 실패(매장 열 생략):', e && e.message); return { _err: true } }
  const saleIds = []
  const add = (code, q, amt) => { const c = String(code || '(미상)').toUpperCase(); const it = items[c] || (items[c] = { q: 0, amt: 0 }); it.q += q; it.amt += amt }   // 대문자 정규화 = c24/sb codes(대문자)와 동일 키 → 매트릭스 행 분리 방지
  snap.forEach(d => {
    const o = d.data(); if (!o || o.type !== 'sale') return
    saleIds.push(d.id)
    ;(o.lines || []).forEach(l => add(l.productCode, _slNum(l.qty), _slNum(l.lineTotal)))
  })
  let voids = []
  try { voids = (typeof _shFetchVoidsByOrig === 'function') ? await _shFetchVoidsByOrig(saleIds) : [] } catch (e) { voids = [] }
  voids.forEach(v => (v.lines || []).forEach(l => add(l.productCode, -_slNum(l.qty), -_slNum(l.lineTotal))))
  return items
}

// ---- 기간 컨트롤(매트릭스 탭 공용 상태) ----
async function _slMxEnsurePeriod() {
  if (_slMxStart && _slMxEnd) return
  const latest = await _slLatestDataDate()
  _slMxStart = _slMxEnd = latest || (typeof kstDateKey === 'function' ? kstDateKey() : new Date().toISOString().slice(0, 10))
}
function _slMxControlsHtml(idp, renderFn) {
  return `<div class="sl-mx-controls">
    <label class="inbhist-ctl">시작 <input type="date" id="${idp}Start" class="inbhist-date" value="${esc(_slMxStart)}" onchange="_slMxSetDates('${idp}','${renderFn}')"></label>
    <label class="inbhist-ctl">끝 <input type="date" id="${idp}End" class="inbhist-date" value="${esc(_slMxEnd)}" onchange="_slMxSetDates('${idp}','${renderFn}')"></label>
    <button class="btn btn-outline btn-sm" onclick="_slMxPreset('day','${renderFn}')">최신일</button>
    <button class="btn btn-outline btn-sm" onclick="_slMxPreset('week','${renderFn}')">주</button>
    <button class="btn btn-outline btn-sm" onclick="_slMxPreset('month','${renderFn}')">월</button>
    <span class="sl-mx-range">${esc(_slMxStart)} ~ ${esc(_slMxEnd)}</span>
    <label class="inbhist-ctl">품번 <input type="text" id="${idp}Search" class="inbhist-store" value="${esc(_slMxSearch)}" placeholder="부분일치" oninput="_slMxSearchInput(this,'${renderFn}')"></label>
    <button class="btn btn-outline btn-sm" onclick="_slMxToggleUnit('${renderFn}')">${_slMxUnit === 'amt' ? '금액▾' : '수량▾'}</button>
    <button class="btn btn-outline" onclick="${renderFn}()">↻</button>
  </div>`
}
function _slMxSetDates(idp, renderFn) {
  const s = (document.getElementById(idp + 'Start') || {}).value, e = (document.getElementById(idp + 'End') || {}).value
  if (s) _slMxStart = s; if (e) _slMxEnd = e
  if (_slMxStart > _slMxEnd) { const t = _slMxStart; _slMxStart = _slMxEnd; _slMxEnd = t }
  if (typeof window[renderFn] === 'function') window[renderFn]()
}
async function _slMxPreset(kind, renderFn) {
  const latest = await _slLatestDataDate() || _slMxEnd || (typeof kstDateKey === 'function' ? kstDateKey() : '')
  if (kind === 'day') { _slMxStart = _slMxEnd = latest }
  else if (kind === 'week') { _slMxStart = _slWeekStart(latest); _slMxEnd = _slWeekRange(_slMxStart)[1] }
  else if (kind === 'month') { const r = _slMonthRange(_slMonthKey(latest)); _slMxStart = r[0]; _slMxEnd = r[1] }
  if (typeof window[renderFn] === 'function') window[renderFn]()
}
let _slMxSearchTimer = null
function _slMxSearchInput(el, renderFn) { _slMxSearch = el.value || ''; clearTimeout(_slMxSearchTimer); _slMxSearchTimer = setTimeout(() => { if (typeof window[renderFn] === 'function') window[renderFn]() }, 250) }
function _slMxToggleUnit(renderFn) { _slMxUnit = _slMxUnit === 'amt' ? 'qty' : 'amt'; if (typeof window[renderFn] === 'function') window[renderFn]() }

// ---- 전체 탭 (품번 × 합계/카페24/사방넷/매장) ----
async function renderSalesMatrix() {
  const panel = document.getElementById('slMatrixBody'); if (!panel) return
  await _slMxEnsurePeriod()
  panel.innerHTML = _slMxControlsHtml('mxA', 'renderSalesMatrix') + '<div class="sl-hist-loading">불러오는 중…</div>'
  const s = _slMxStart, e = _slMxEnd, unit = _slMxUnit
  let c24, sb, pos
  try { c24 = await _slMatrixItems('c24', s, e); sb = await _slMatrixItems('sb', s, e); pos = await _slStorePos(s, e) }
  catch (err) { panel.innerHTML = _slMxControlsHtml('mxA', 'renderSalesMatrix') + `<div class="sl-hist-empty">조회 실패: ${esc(err.message)}</div>`; return }
  const posErr = pos && pos._err; if (posErr) delete pos._err
  const nameMap = _slNameMap(), prodMap = _slProdMap()
  const codes = new Set([...Object.keys(c24), ...Object.keys(sb), ...Object.keys(pos)])
  const net = (it) => unit === 'qty' ? ((it.q || 0) - (it.rq || 0)) : ((it.amt || 0) - (it.ramt || 0))
  let rows = [...codes].map(code => {
    const csp = _slItemSplit(c24[code])   // 공홈/파트너(재계산 전=전액 공홈)
    const ghV = net(csp.gh), ptV = net(csp.pt), sV = net(sb[code] || {})
    const pV = unit === 'qty' ? ((pos[code] || {}).q || 0) : ((pos[code] || {}).amt || 0)
    return { code, name: nameMap[code.toUpperCase()] || '', gh: ghV, pt: ptV, s: sV, p: pV, tot: ghV + ptV + sV + pV }
  })
  const q = (_slMxSearch || '').trim().toUpperCase()
  if (q) rows = rows.filter(r => r.code.toUpperCase().includes(q) || (r.name || '').toUpperCase().includes(q))
  rows.sort((a, b) => b.tot - a.tot || a.code.localeCompare(b.code))
  _slMatrixRows = rows
  const fmt = v => (v || 0).toLocaleString()
  const t = rows.reduce((a, r) => { a.gh += r.gh; a.pt += r.pt; a.s += r.s; a.p += r.p; a.tot += r.tot; return a }, { gh: 0, pt: 0, s: 0, p: 0, tot: 0 })
  const unitLbl = unit === 'amt' ? '금액(순액=매출+배송−반품)' : '수량(순=판매−반품)'
  panel.innerHTML = _slMxControlsHtml('mxA', 'renderSalesMatrix') + `
    <div class="sl-sum-basis">${esc(s)} ~ ${esc(e)} · ${unitLbl} · 배송비 포함·반품 차감(일자별 요약과 동일 기준) · 카페24=<b>공홈+파트너</b> 분리(공홈+파트너=카페24 총액 · 파트너 분리는 명단 등록+재계산 후)${posErr ? ' · ⚠️ 매장 열 조회 권한/오류로 생략' : ''}</div>
    <div class="sl-hist-wrap">
      <table class="data-table inbhist-table sl-mx-table">
        <thead><tr><th class="sl-thumb-th">이미지</th><th>품번</th><th>상품명</th><th class="sl-c">합계</th><th class="sl-c">공홈</th><th class="sl-c sl-pt-col">파트너</th><th class="sl-c">사방넷</th><th class="sl-c">매장</th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `<tr>
          ${_slThumbCell(r.code, prodMap)}
          <td><a class="sl-code-link" onclick="_slOpenProduct('${esc(r.code)}')">${esc(r.code)}</a></td>
          <td class="sl-mx-name">${esc(r.name)}</td>
          <td class="sl-c sl-net"><b>${fmt(r.tot)}</b></td><td class="sl-c">${fmt(r.gh)}</td><td class="sl-c sl-pt-col">${fmt(r.pt)}</td><td class="sl-c">${fmt(r.s)}</td><td class="sl-c">${fmt(r.p)}</td>
        </tr>`).join('') : `<tr><td colspan="8" class="sl-hist-empty">데이터 없음 — 집계 재계산이 필요할 수 있습니다.</td></tr>`}</tbody>
        <tfoot><tr class="sl-sum-foot"><td colspan="3">합계 (${rows.length}품번)</td><td class="sl-c sl-net"><b>${fmt(t.tot)}</b></td><td class="sl-c">${fmt(t.gh)}</td><td class="sl-c sl-pt-col">${fmt(t.pt)}</td><td class="sl-c">${fmt(t.s)}</td><td class="sl-c">${fmt(t.p)}</td></tr></tfoot>
      </table>
    </div>`
}

// ---- 쇼핑몰별 탭 (품번 × 사방넷 몰) ----
async function renderSalesMalls() {
  const panel = document.getElementById('slMallsBody'); if (!panel) return
  await _slMxEnsurePeriod()
  panel.innerHTML = _slMxControlsHtml('mxM', 'renderSalesMalls') + '<div class="sl-hist-loading">불러오는 중…</div>'
  const s = _slMxStart, e = _slMxEnd, unit = _slMxUnit
  let sb
  try { sb = await _slMatrixItems('sb', s, e) } catch (err) { panel.innerHTML = _slMxControlsHtml('mxM', 'renderSalesMalls') + `<div class="sl-hist-empty">조회 실패: ${esc(err.message)}</div>`; return }
  const nameMap = _slNameMap(), prodMap = _slProdMap()
  const mallSet = new Set()
  Object.keys(sb).forEach(code => { const m = sb[code].malls || {}; Object.keys(m).forEach(x => mallSet.add(x)) })
  const malls = [...mallSet].sort()
  const val = mm => unit === 'qty' ? (mm.q || 0) : (mm.amt || 0)
  let rows = Object.keys(sb).map(code => {
    const it = sb[code], mm = it.malls || {}
    const cells = malls.map(x => val(mm[x] || {}))
    const tot = unit === 'qty' ? ((it.q || 0) - (it.rq || 0)) : ((it.amt || 0) - (it.ramt || 0))
    return { code, name: nameMap[code.toUpperCase()] || '', cells, tot }
  })
  const q = (_slMxSearch || '').trim().toUpperCase()
  if (q) rows = rows.filter(r => r.code.toUpperCase().includes(q) || (r.name || '').toUpperCase().includes(q))
  rows.sort((a, b) => b.tot - a.tot || a.code.localeCompare(b.code))
  _slMallsData = { malls, rows, unit }
  const fmt = v => (v || 0).toLocaleString()
  const colTot = malls.map((_, ci) => rows.reduce((a, r) => a + (r.cells[ci] || 0), 0))
  panel.innerHTML = _slMxControlsHtml('mxM', 'renderSalesMalls') + `
    <div class="sl-sum-basis">${esc(s)} ~ ${esc(e)} · ${unit === 'amt' ? '금액(배송 포함·반품 차감)' : '수량(순)'} · 사방넷 쇼핑몰별(원본 몰명) · 합계=사방넷 순액</div>
    <div class="sl-hist-wrap">
      <table class="data-table inbhist-table sl-mx-table">
        <thead><tr><th class="sl-thumb-th">이미지</th><th>품번</th><th>상품명</th><th class="sl-c">사방넷 합계</th>${malls.map(m => `<th class="sl-c">${esc(m)}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.map(r => `<tr>
          ${_slThumbCell(r.code, prodMap)}
          <td><a class="sl-code-link" onclick="_slOpenProduct('${esc(r.code)}')">${esc(r.code)}</a></td><td class="sl-mx-name">${esc(r.name)}</td>
          <td class="sl-c sl-net"><b>${fmt(r.tot)}</b></td>${r.cells.map(v => `<td class="sl-c">${v ? fmt(v) : '-'}</td>`).join('')}
        </tr>`).join('') : `<tr><td colspan="${4 + malls.length}" class="sl-hist-empty">사방넷 데이터 없음</td></tr>`}</tbody>
        <tfoot><tr class="sl-sum-foot"><td colspan="3">합계</td><td class="sl-c sl-net"><b>${fmt(rows.reduce((a, r) => a + r.tot, 0))}</b></td>${colTot.map(v => `<td class="sl-c">${fmt(v)}</td>`).join('')}</tr></tfoot>
      </table>
    </div>`
}

// =============================================
// ===== 파트너별 탭 (Phase 4) — 명단 관리 + 업체별 매입 리포트 =====
// =============================================
let _slPartnerManageOpen = false, _slPartnerSearch = '', _slPartnerEditId = null, _slMasterDirty = false
let _slPartnerReport = null   // { cols:[{key,name}], rows:[{code,name,cells[],tot}], unit }

async function renderSalesPartner() {
  const panel = document.getElementById('slPartnerBody'); if (!panel) return
  await _slEnsurePartnerMaster()
  await _slMxEnsurePeriod()
  const isAdmin = _slIsAdmin()
  const total = (_salesPartners || []).length
  const activeN = (_salesPartners || []).filter(p => p && p.active !== false).length
  const ut = _slPartnerUpdatedAt ? ((typeof kstFormat === 'function') ? kstFormat(_slPartnerUpdatedAt, 'full') : String(_slPartnerUpdatedAt).slice(0, 16)) : '—'
  let html = `<div class="sl-pt-head">
    <div class="sl-pt-summary">🤝 파트너 명단 <b>${total}</b>명 (활성 ${activeN}) · 최종 갱신 ${esc(ut)}</div>
    <div class="sl-pt-head-actions">
      ${isAdmin ? `<label class="btn btn-outline btn-sm sl-pt-uplabel">🤝 명단 업로드<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handlePartnerFile(this)"></label>
      <button class="btn btn-outline btn-sm" onclick="_slTogglePartnerManage()">${_slPartnerManageOpen ? '▲ 명단 관리 닫기' : '👥 명단 관리'}</button>` : ''}
    </div>
  </div>`
  if (_slMasterDirty && isAdmin) html += `<div class="sl-pt-dirty">⚠️ 파트너 명단이 변경되었습니다. 집계에 반영하려면 <button class="btn btn-new btn-sm" onclick="runFullRecompute()">🔄 전체 기간 재계산</button> (또는 [일자별 요약]에서 기간 지정 후 재계산)</div>`
  if (isAdmin && _slPartnerManageOpen) html += _slPartnerManageHtml()
  html += _slMxControlsHtml('mxP', 'renderSalesPartner')
  html += `<div id="slPartnerReportBody"><div class="sl-hist-loading">불러오는 중…</div></div>`
  panel.innerHTML = html
  await _slRenderPartnerReport()
}

// 업체별 매입 리포트(품번 × 업체) — 하이브리드: 정확 월/주=shard ptBy · 그 외=L1 스캔(od-range, 클라 bid 필터)
async function _slPartnerItems(pStart, pEnd) {
  const mk = _slMonthKey(pStart)
  if (pStart === mk + '-01' && pEnd === _slMonthRange(mk)[1]) { const d = await _slReadShard('salesM', mk + '_c24'); if (d && d.ptBy) return d.ptBy }
  if (_slWeekStart(pStart) === pStart && _slWeekRange(pStart)[1] === pEnd) { const d = await _slReadShard('salesW', pStart + '_c24'); if (d && d.ptBy) return d.ptBy }
  await _slEnsurePartnerMaster()
  const orders = await _slFetchPeriodOrders(pStart, pEnd)
  return _slAggShard(orders, 'c24', pStart, pEnd, _slPartnerActiveSet()).ptBy || {}
}
async function _slRenderPartnerReport() {
  const body = document.getElementById('slPartnerReportBody'); if (!body) return
  const s = _slMxStart, e = _slMxEnd, unit = _slMxUnit
  let ptBy
  try { ptBy = await _slPartnerItems(s, e) } catch (err) { body.innerHTML = `<div class="sl-hist-empty">조회 실패: ${esc(err.message)}</div>`; return }
  const nameMap = _slNameMap(), pmap = _slPartnerMap(), prodMap = _slProdMap()
  const colKeys = Object.keys(ptBy)
  const cols = colKeys.map(k => ({ key: k, name: (pmap[k] && pmap[k].name) || ptBy[k].name || k })).sort((a, b) => a.name.localeCompare(b.name))
  const codeSet = new Set()
  colKeys.forEach(k => Object.keys(ptBy[k].items || {}).forEach(c => codeSet.add(c)))
  const val = it => unit === 'qty' ? ((it.q || 0) - (it.rq || 0)) : ((it.amt || 0) - (it.ramt || 0))
  let rows = [...codeSet].map(code => {
    const cells = cols.map(col => val((ptBy[col.key].items || {})[code] || {}))
    return { code, name: nameMap[code.toUpperCase()] || '', cells, tot: cells.reduce((a, b) => a + b, 0) }
  })
  const q = (_slMxSearch || '').trim().toUpperCase()
  if (q) rows = rows.filter(r => r.code.toUpperCase().includes(q) || (r.name || '').toUpperCase().includes(q))
  rows.sort((a, b) => b.tot - a.tot || a.code.localeCompare(b.code))
  _slPartnerReport = { cols, rows, unit }
  const fmt = v => (v || 0).toLocaleString()
  const colTot = cols.map((_, ci) => rows.reduce((a, r) => a + (r.cells[ci] || 0), 0))
  const grand = colTot.reduce((a, b) => a + b, 0)
  if (!cols.length) { body.innerHTML = `<div class="sl-hist-empty">${esc(s)} ~ ${esc(e)} · 파트너 매입 데이터가 없습니다.${(_salesPartners || []).length ? ' (기간 내 파트너 주문 없음 — 정확 월/주가 아니면 L1 스캔, 그 외 [집계 재계산] 필요)' : ' 먼저 파트너 명단을 등록하세요.'}</div>`; return }
  body.innerHTML = `
    <div class="sl-sum-basis">${esc(s)} ~ ${esc(e)} · ${unit === 'amt' ? '금액(순액=매출+배송−반품)' : '수량(순=판매−반품)'} · 업체=주문자ID∈파트너 명단 · 열=기간 내 매입 있는 업체만</div>
    <div class="sl-hist-wrap"><table class="data-table inbhist-table sl-mx-table">
      <thead><tr><th class="sl-thumb-th">이미지</th><th>품번</th><th>상품명</th><th class="sl-c">합계</th>${cols.map(c => `<th class="sl-c">${esc(c.name)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>
        ${_slThumbCell(r.code, prodMap)}
        <td><a class="sl-code-link" onclick="_slOpenProduct('${esc(r.code)}')">${esc(r.code)}</a></td><td class="sl-mx-name">${esc(r.name)}</td>
        <td class="sl-c sl-net"><b>${fmt(r.tot)}</b></td>${r.cells.map(v => `<td class="sl-c">${v ? fmt(v) : '-'}</td>`).join('')}
      </tr>`).join('')}</tbody>
      <tfoot><tr class="sl-sum-foot"><td colspan="3">합계 (${rows.length}품번)</td><td class="sl-c sl-net"><b>${fmt(grand)}</b></td>${colTot.map(v => `<td class="sl-c">${fmt(v)}</td>`).join('')}</tr></tfoot>
    </table></div>
    <div class="sl-mx-toolbar"><button class="btn btn-outline btn-sm" onclick="downloadSalesPartner()">📥 엑셀</button></div>`
}
function downloadSalesPartner() {
  if (!_slPartnerReport || !_slPartnerReport.cols.length) { showToast('데이터 없음', 'warning'); return }
  const { cols, rows } = _slPartnerReport
  const aoa = [['품번', '상품명', '합계', ...cols.map(c => c.name)]]
  rows.forEach(r => aoa.push([r.code, r.name, r.tot, ...r.cells]))
  _slExcel(aoa, `매출_파트너별_${_slMxStart}~${_slMxEnd}`)
}

// ---- 명단 관리(CRUD) — grade≥3. 삭제 없음(비활성 토글). ----
function _slKnownGrades() { const s = new Set(['Partner Blue Class', 'Partner Red Class', 'Partner Orange Class', 'Partner Green Class']); (_salesPartners || []).forEach(p => { if (p && p.grade) s.add(p.grade) }); return [...s] }
function _slPartnerRowsHtml() {
  const q = (_slPartnerSearch || '').trim().toLowerCase()
  let list = (_salesPartners || []).slice()
  if (q) list = list.filter(p => String(p.id || '').toLowerCase().includes(q) || String(p.name || '').toLowerCase().includes(q))
  list.sort((a, b) => String(a.name || a.id || '').localeCompare(String(b.name || b.id || '')))
  if (!list.length) return '<tr><td colspan="6" class="sl-hist-empty">명단이 비어 있습니다.</td></tr>'
  return list.map(p => {
    const k = _slPidNorm(p.id)
    const on = p.active !== false
    if (_slPartnerEditId === k) {
      return `<tr class="sl-pt-editrow">
        <td>${esc(p.id)}</td>
        <td><input type="text" id="slPtEditName" class="inbhist-store" value="${esc(p.name || '')}"></td>
        <td><input type="text" id="slPtEditGrade" class="inbhist-store" value="${esc(p.grade || '')}" list="slPtGrades"></td>
        <td>${on ? '활성' : '비활성'}</td><td>${esc((p.ut || '').slice(0, 10))}</td>
        <td><button class="btn btn-new btn-sm" onclick="_slPartnerSaveEdit('${esc(k)}')">저장</button> <button class="btn btn-outline btn-sm" onclick="_slPartnerCancelEdit()">취소</button></td>
      </tr>`
    }
    return `<tr>
      <td>${esc(p.id)}</td><td>${esc(p.name || '')}</td><td>${esc(p.grade || '')}</td>
      <td><span class="sl-pt-badge ${on ? 'on' : 'off'}">${on ? '활성' : '비활성'}</span></td>
      <td>${esc((p.ut || '').slice(0, 10))}</td>
      <td><button class="btn btn-outline btn-sm" onclick="_slPartnerStartEdit('${esc(k)}')">수정</button>
        <button class="btn btn-outline btn-sm" onclick="_slPartnerToggleActive('${esc(k)}')">${on ? '비활성' : '활성'}</button></td>
    </tr>`
  }).join('')
}
function _slPartnerManageHtml() {
  const grades = _slKnownGrades()
  return `<div class="sl-pt-manage">
    <datalist id="slPtGrades">${grades.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
    <div class="sl-pt-manage-top">
      <input type="text" class="inbhist-store" placeholder="아이디/이름 검색" value="${esc(_slPartnerSearch)}" oninput="_slPartnerSearchInput(this)">
      <span class="sl-warn-info">삭제는 비활성으로 대체(이력 안전). 변경 후 [집계 재계산] 필요.</span>
    </div>
    <div class="sl-pt-add">
      <input type="text" id="slPtNewId" class="inbhist-store" placeholder="아이디(주문자ID)">
      <input type="text" id="slPtNewName" class="inbhist-store" placeholder="이름/업체명">
      <input type="text" id="slPtNewGrade" class="inbhist-store" placeholder="등급(선택)" list="slPtGrades">
      <button class="btn btn-new btn-sm" onclick="_slPartnerAdd()">+ 추가</button>
    </div>
    <div class="sl-hist-wrap"><table class="data-table inbhist-table sl-pt-table">
      <thead><tr><th>아이디</th><th>이름</th><th>등급</th><th>활성</th><th>등록/갱신</th><th>작업</th></tr></thead>
      <tbody id="slPtTbody">${_slPartnerRowsHtml()}</tbody>
    </table></div>
  </div>`
}
function _slTogglePartnerManage() { _slPartnerManageOpen = !_slPartnerManageOpen; _slPartnerEditId = null; renderSalesPartner() }
function _slPartnerSearchInput(el) { _slPartnerSearch = el.value || ''; const tb = document.getElementById('slPtTbody'); if (tb) tb.innerHTML = _slPartnerRowsHtml() }
function _slPartnerStartEdit(k) { _slPartnerEditId = k; renderSalesPartner() }
function _slPartnerCancelEdit() { _slPartnerEditId = null; renderSalesPartner() }
async function _slPartnerCommit(action) {
  try { await saveSalesPartners() } catch (e) { showToast('저장 실패 — 다시 시도해주세요.', 'error'); return }
  if (typeof logActivity === 'function') logActivity('setting', '파트너마스터', `${action} — ${(_salesPartners || []).length}명`)
  _slMasterDirty = true
  showToast(`파트너 명단 ${action} 완료 — 반영하려면 [집계 재계산]`, 'success')
  renderSalesPartner()
}
async function _slPartnerSaveEdit(k) {
  const p = (_salesPartners || []).find(x => _slPidNorm(x.id) === k); if (!p) return
  p.name = _slStr((document.getElementById('slPtEditName') || {}).value)
  p.grade = _slStr((document.getElementById('slPtEditGrade') || {}).value)
  p.ut = new Date().toISOString()
  _slPartnerEditId = null
  await _slPartnerCommit('수정')
}
async function _slPartnerToggleActive(k) {
  const p = (_salesPartners || []).find(x => _slPidNorm(x.id) === k); if (!p) return
  p.active = p.active === false ? true : false; p.ut = new Date().toISOString()
  await _slPartnerCommit(p.active ? '활성화' : '비활성화')
}
async function _slPartnerAdd() {
  if (!_slIsAdmin()) { showToast('권한이 없습니다.', 'warning'); return }
  const id = _slStr((document.getElementById('slPtNewId') || {}).value)
  const nm = _slStr((document.getElementById('slPtNewName') || {}).value)
  const gr = _slStr((document.getElementById('slPtNewGrade') || {}).value)
  if (!id) { showToast('아이디를 입력하세요.', 'warning'); return }
  const k = _slPidNorm(id)
  if ((_salesPartners || []).some(p => _slPidNorm(p.id) === k)) { showToast('이미 등록된 아이디입니다.', 'warning'); return }
  _salesPartners.push({ id: id, name: nm, grade: gr, active: true, src: 'manual', ut: new Date().toISOString() })
  await _slPartnerCommit('추가')
}

// ---- 명단 파일 업로드(3-col 서명: 아이디/이름/회원등급) — 전체 교체 + 수동추가 보존 확인 ----
function _slDetectPartnerHeaders(headers) {
  const H = (headers || []).map(h => _slStr(h))
  const has = n => H.some(h => h === n || h.includes(n))
  return has('아이디') && has('이름') && has('회원등급')
}
function _slParsePartnerRows(rows) {
  const H = (rows[0] || []).map(h => _slStr(h))
  const find = names => { for (const n of names) { let i = H.findIndex(h => h === n); if (i >= 0) return i; i = H.findIndex(h => h.includes(n)); if (i >= 0) return i } return -1 }
  const ci = find(['아이디', 'ID', 'id']), cn = find(['이름', '성명', 'name']), cg = find(['회원등급', '등급', 'grade'])
  const map = {}, order = [], dupes = new Set()
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue
    const id = ci >= 0 ? _slStr(row[ci]) : ''; if (!id) continue
    const key = _slPidNorm(id)
    if (map[key]) dupes.add(id); else order.push(key)   // 중복 ID = 마지막 값 우선
    map[key] = { id: id, name: cn >= 0 ? _slStr(row[cn]) : '', grade: cg >= 0 ? _slStr(row[cg]) : '' }
  }
  return { entries: order.map(k => map[k]), dupes: [...dupes] }
}
async function handlePartnerFile(input) {
  const file = input.files && input.files[0]; if (!file) return
  if (!_slIsAdmin()) { showToast('권한이 없습니다 (관리자 전용).', 'warning'); input.value = ''; return }
  const isCsv = /\.csv$/i.test(file.name)
  const reader = new FileReader()
  reader.onload = async ev => {
    let rows
    try { rows = _slReadWorkbookRows(ev.target.result, isCsv) } catch (err) { showToast('파일 읽기 실패: ' + err.message, 'error'); return }
    input.value = ''
    if (!_slDetectPartnerHeaders(rows[0] || [])) { showToast('파트너 명단 형식이 아닙니다 — 헤더에 아이디·이름·회원등급 필요.', 'warning'); return }
    const { entries, dupes } = _slParsePartnerRows(rows)
    if (!entries.length) { showToast('명단 데이터가 없습니다.', 'warning'); return }
    const nowIso = new Date().toISOString()
    const oldMap = _slPartnerMap()
    const fileKeys = new Set(entries.map(en => _slPidNorm(en.id)))
    // 파일 = 전체 교체. 기존 비활성 플래그는 지속 항목에 한해 보존(수동 override 존중).
    const merged = entries.map(en => {
      const prev = oldMap[_slPidNorm(en.id)]
      return { id: en.id, name: en.name, grade: en.grade, active: (prev && prev.active === false) ? false : true, src: 'file', ut: nowIso }
    })
    // 파일에 없는 수동추가(src:'manual') 항목 = 유지/제거 확인
    const manualOrphans = (_salesPartners || []).filter(p => p && p.src === 'manual' && !fileKeys.has(_slPidNorm(p.id)))
    let keepManual = true
    if (manualOrphans.length) {
      keepManual = await korConfirm(`업로드 파일에 없는 '수동 추가' 항목 ${manualOrphans.length}건이 있습니다.\n예: ${manualOrphans.slice(0, 5).map(p => p.id).join(', ')}\n\n[유지]하면 명단에 남기고, [제거]하면 삭제합니다.`, '유지', '제거')
    }
    if (keepManual) manualOrphans.forEach(p => merged.push(p))
    const preservedDeact = merged.filter(m => m.active === false).length
    const ok = await korConfirm(`파트너 명단을 ${merged.length}명으로 갱신합니다.\n· 파일 ${entries.length}명${dupes.length ? ` (중복 ID ${dupes.length}건 — 마지막 값 사용: ${dupes.slice(0, 3).join(', ')})` : ''}\n· 비활성 유지 ${preservedDeact}명${manualOrphans.length ? ` · 수동추가 ${keepManual ? '유지' : '제거'} ${manualOrphans.length}건` : ''}\n\n반영 후 [집계 재계산]이 필요합니다.`, '갱신', '취소')
    if (!ok) return
    _salesPartners = merged
    try { await saveSalesPartners() } catch (e) { showToast('명단 저장 실패 — 다시 시도해주세요.', 'error'); return }
    if (typeof logActivity === 'function') logActivity('setting', '파트너마스터', `명단 업로드 ${merged.length}명 (파일 ${entries.length}${dupes.length ? ` · 중복 ${dupes.length}` : ''})`)
    _slMasterDirty = true
    showToast(`파트너 명단 ${merged.length}명 갱신 완료 — [집계 재계산] 필요`, 'success')
    renderSalesPartner()
  }
  if (isCsv) reader.readAsText(file, 'UTF-8'); else reader.readAsArrayBuffer(file)
}

// ---- 전체 기간 재계산(마스터 변경 반영) ----
async function _slFullDataRange() {
  let min = '', max = ''
  try {
    const a = await db.collection('salesOrders').where('od', '>=', '2000-01-01').orderBy('od').limit(1).get(); a.forEach(d => min = d.data().od || '')
    const b = await db.collection('salesOrders').where('od', '>=', '2000-01-01').orderBy('od', 'desc').limit(1).get(); b.forEach(d => max = d.data().od || '')
  } catch (e) { console.warn('_slFullDataRange:', e && e.message) }
  return [min, max]
}
async function runFullRecompute() {
  if (!_slIsAdmin()) { showToast('권한이 없습니다.', 'warning'); return }
  if (_slBusy) return
  const [min, max] = await _slFullDataRange()
  if (!min || !max) { showToast('원장 데이터가 없습니다. [일자별 요약]에서 기간을 지정해 재계산하세요.', 'warning'); return }
  const days = _slDaysInRange(min, max).length
  const ok = await korConfirm(`전체 기간 ${min} ~ ${max} (${days}일)\n집계를 재계산하여 공홈/파트너 분리를 반영합니다.\n(멱등 — 재실행해도 동일 · L1 원장 불변)`, '재계산', '취소')
  if (!ok) return
  _slBusy = true
  try {
    const r = await recomputeSalesRange(min, max, () => {})
    _slMasterDirty = false
    showToast(`재계산 완료 — ${r.days}일` + ((r.candidates && r.candidates.length) ? ` · ⚠️ 새 파트너 후보 ${r.candidates.length}명` : ''), 'success')
    if (typeof logActivity === 'function') logActivity('setting', '매출집계', `전체 재계산 ${min}~${max}: ${r.days}일`)
    renderSalesPartner()
  } catch (e) { console.error('runFullRecompute:', e && e.message); showToast('재계산 실패 — 다시 시도해주세요. (L1 원장은 안전)', 'error') }
  _slBusy = false
}

// =============================================
// ===== 🧪 데이터 검증 도구 (READ-ONLY) — 날짜/집계 정합성 진단 =====
// =============================================
// 🔴 READ-ONLY: .get() 만 사용(set/update/delete 0건) · 리스너 없음 · 관리자 전용 · 월 단위 청크 + 중단 가능.
//   L1→일별 도출 = _slAggDay (재계산 _slRecomputeDay 와 동일 헬퍼 · 두 번째 구현 금지 — 파생 재사용).
//   L2↔L3 = 저장 aggregate 간 산술 대사(salesD 월합 vs salesM shard 합).
let _slVerifyAbort = false
let _slVerifyText = ''

function _slVfNum(n) { return (n || 0).toLocaleString() }
function _slVfToday() { try { return (typeof kstDateKey === 'function' && kstDateKey()) || _slFmtDK(Date.now() + 9 * 3600000) } catch (e) { return _slFmtDK(Date.now()) } }
// 연속 날짜를 'a~b, c' 로 압축(커버리지 갭 표기)
function _slVfRanges(days) {
  if (!days || !days.length) return ''
  const s = [...days].sort(); const out = []; let a = s[0], p = s[0]
  const nxt = dk => _slFmtDK(_slParseDK(dk) + 86400000)
  for (let i = 1; i < s.length; i++) { if (s[i] === nxt(p)) { p = s[i]; continue } out.push(a === p ? a : a + '~' + p); a = s[i]; p = s[i] }
  out.push(a === p ? a : a + '~' + p)
  return out.join(', ')
}

// 관리자 전용 · 읽기 전용 데이터 검증. onProg(msg)=진행 표시. 반환 { text, ...summary }.
async function salesVerify(fromDate, toDate, onProg) {
  if (!_slIsAdmin()) throw new Error('데이터 검증은 관리자 전용입니다.')   // 심층방어(read-only 이나 콘솔 직접호출도 게이트)
  if (typeof db === 'undefined' || !db) throw new Error('DB 연결 없음')
  const prog = (m) => { try { if (onProg) onProg(m) } catch (e) {} }
  const R = []; const push = (s) => R.push(s == null ? '' : String(s))
  const SANE_MIN = '2020-01-01'
  const today = _slVfToday()

  prog('파트너 마스터 확인 중…')
  await _slEnsurePartnerMaster()
  const ptSet = _slPartnerActiveSet()   // _slAggDay 도출을 재계산과 동일 분류기준으로 고정

  if (!fromDate || !toDate) { const [mn, mx] = await _slFullDataRange(); fromDate = fromDate || mn; toDate = toDate || mx }
  if (!fromDate || !toDate) throw new Error('원장 데이터가 없습니다.')

  push('========================================')
  push('🧪 매출 데이터 검증 리포트 (READ-ONLY)')
  push('생성: ' + today + ' · 검증 범위: ' + fromDate + ' ~ ' + toDate)
  push('========================================')
  push('')

  // ---- 1) 업로드 내역 총괄 ----
  prog('업로드 내역 집계 중…')
  const ups = await loadSalesUploads(true)
  let uRows = 0, uNew = 0, uMerge = 0, uSame = 0, uRet = 0, uDateFail = 0, uUnmatched = 0, uAnom = 0
  const dfTop = []
  ups.forEach(u => {
    uRows += u.rows || 0; uNew += u.cntNew || 0; uMerge += u.cntMerge || 0; uSame += u.cntSame || 0; uRet += u.cntReturns || 0
    const df = (u.dateFail || []).length; uDateFail += df
    uUnmatched += (u.unmatched || []).length; uAnom += (u.anomaly || []).length
    if (df > 0) dfTop.push({ f: u.fileName || u.type || '?', df: df, at: u.at || '' })
  })
  push('【1】 업로드 내역 총괄 — ' + ups.length + '개 파일')
  push('  · 총 행 ' + _slVfNum(uRows) + ' · 신규 ' + _slVfNum(uNew) + ' · 병합 ' + _slVfNum(uMerge) + ' · 변경없음 ' + _slVfNum(uSame) + ' · 반품 ' + _slVfNum(uRet))
  push('  · ⚠️ 날짜 파싱 실패(누적) ' + _slVfNum(uDateFail) + ' · 미매칭 품번 ' + _slVfNum(uUnmatched) + ' · 이상치 ' + _slVfNum(uAnom))
  if (dfTop.length) {
    dfTop.sort((a, b) => b.df - a.df)
    push('  · 날짜 실패 상위 파일:')
    dfTop.slice(0, 10).forEach(x => push('     - ' + x.f + ' : ' + x.df + '건 (' + String(x.at).slice(0, 10) + ')'))
  }
  push('')

  // ---- 2) L1 전체 스캔 + 날짜 분포/이상(범위 밖 오류도 잡으려면 전량 스캔 필수) ----
  prog('L1 원장 전체 스캔 중…')
  const snap = await db.collection('salesOrders').get()
  const orders = []; snap.forEach(d => orders.push(d.data()))
  const dayBucket = new Map()   // day → Map(key→order) : od 또는 rd 로 그 날에 관여하는 주문(대사 도출용)
  const addDay = (day, o) => { if (!day) return; let m = dayBucket.get(day); if (!m) { m = new Map(); dayBucket.set(day, m) } m.set(o.key || (o.ch + '_' + o.ono), o) }
  const monthCh = {}
  let minOd = '', maxOd = ''
  const emptyOd = [], outWin = [], rdAnom = []
  orders.forEach(o => {
    const od = o.od || ''
    if (!od) emptyOd.push(o.ono || o.key || '?')
    else {
      if (!minOd || od < minOd) minOd = od
      if (!maxOd || od > maxOd) maxOd = od
      if (od < SANE_MIN || od > today) outWin.push((o.ono || '?') + '(' + od + ')')
      const mk = _slMonthKey(od); const b = monthCh[mk] || (monthCh[mk] = { c24: 0, sb: 0 }); b[o.ch === SL_CH.c24 ? 'c24' : 'sb']++
      addDay(od, o)
    }
    ;(o.lines || []).forEach(l => {
      if (l && l.rd) {
        addDay(l.rd, o)
        if (od && l.rd < od) rdAnom.push((o.ono || '?') + ' rd ' + l.rd + ' < od ' + od)
        else if (l.rd > today) rdAnom.push((o.ono || '?') + ' rd ' + l.rd + '(미래)')
      }
    })
  })
  push('【2】 L1 원장 날짜 분포 — 총 ' + _slVfNum(orders.length) + ' 주문 (전체 스캔)')
  push('  · od 범위: ' + (minOd || '-') + ' ~ ' + (maxOd || '-'))
  push('  · 🔴 주문일(od) 빈값 = ' + emptyOd.length + '건' + (emptyOd.length ? ' → 집계 누락(재업로드로 정정 필요): ' + emptyOd.slice(0, 20).join(', ') + (emptyOd.length > 20 ? ' …외 ' + (emptyOd.length - 20) : '') : ''))
  push('  · 🔴 od 범위밖(2020 이전 / 미래) = ' + outWin.length + '건' + (outWin.length ? ': ' + outWin.slice(0, 20).join(', ') + (outWin.length > 20 ? ' …외 ' + (outWin.length - 20) : '') : ''))
  push('  · 🔴 반품일(rd) 이상(od 이전 / 미래) = ' + rdAnom.length + '건' + (rdAnom.length ? ': ' + rdAnom.slice(0, 15).join(' | ') + (rdAnom.length > 15 ? ' …외 ' + (rdAnom.length - 15) : '') : ''))
  push('  · 월별 주문수:')
  Object.keys(monthCh).sort().forEach(mk => push('     ' + mk + ' : 카페24 ' + monthCh[mk].c24 + ' · 사방넷 ' + monthCh[mk].sb))
  push('')

  // ---- 3) L1 → L2(salesD) 대사 (월 단위 청크, 중단 가능) ----
  push('【3】 L1 → L2(salesD) 대사 — L1 재도출(_slAggDay) vs 저장 salesD')
  const months = []
  { let t = _slParseDK(_slMonthKey(fromDate) + '-01'); const te = _slParseDK(_slMonthKey(toDate) + '-01'); let g = 0
    while (!isNaN(t) && !isNaN(te) && t <= te && g < 240) { const d = new Date(t); months.push(d.getUTCFullYear() + '-' + _slPad(d.getUTCMonth() + 1)); t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); g++ } }
  let l2Mismatch = 0
  const l3Lines = []; let l3Mismatch = 0
  for (let mi = 0; mi < months.length; mi++) {
    if (_slVerifyAbort) { push('  ⚠️ 사용자 중단 — 부분 결과'); break }
    const mk = months[mi]
    prog('L1↔L2 대사 ' + (mi + 1) + '/' + months.length + ' (' + mk + ')')
    const [ms, me] = _slMonthRange(mk)
    const daily = await _slLoadSalesDaily(ms, me)   // 저장 salesD (READ)
    const dMap = {}; daily.forEach(d => { dMap[d.d] = d })
    const daySet = new Set(Object.keys(dMap))
    dayBucket.forEach((_, day) => { if (day >= ms && day <= me) daySet.add(day) })
    const days = [...daySet].sort()
    const l2Sum = { c24: { q: 0, amt: 0, rq: 0, ramt: 0 }, sb: { q: 0, amt: 0, rq: 0, ramt: 0 } }
    days.forEach(day => {
      const bm = dayBucket.get(day); const dayOrders = bm ? [...bm.values()] : []
      const derived = _slAggDay(dayOrders, day, ptSet)   // 🔴 재계산과 동일 헬퍼
      const stored = dMap[day]
      ;['c24', 'sb'].forEach(g => {
        const dv = derived[g] || {}, sv = (stored && stored[g]) || {}
        if (stored) { l2Sum[g].q += (sv.sq || 0); l2Sum[g].amt += (sv.samt || 0); l2Sum[g].rq += (sv.rq || 0); l2Sum[g].ramt += (sv.ramt || 0) }
        const diffs = []
        ;[['sq', '판매수'], ['samt', '매출'], ['rq', '반품수'], ['ramt', '반품액']].forEach(([fd, lbl]) => { const a = dv[fd] || 0, b = sv[fd] || 0; if (a !== b) diffs.push(lbl + ' L1=' + a + '/L2=' + b) })
        if (!stored && (dv.sq || dv.samt || dv.rq || dv.ramt)) { l2Mismatch++; push('  ✗ ' + day + ' [' + g + '] salesD 누락 — L1 활동 있음(재계산 필요)') }
        else if (diffs.length) { l2Mismatch++; push('  ✗ ' + day + ' [' + g + '] ' + diffs.join(' · ')) }
      })
    })
    // ---- 4) L2 → L3(salesM shard) 대사 (이 달) ----
    for (const g of ['c24', 'sb']) {
      const shard = await _slReadShard('salesM', mk + '_' + g)   // 저장 shard (READ)
      const sc = { q: 0, amt: 0, rq: 0, ramt: 0 }
      if (shard && shard.items) Object.values(shard.items).forEach(it => { sc.q += it.q || 0; sc.amt += it.amt || 0; sc.rq += it.rq || 0; sc.ramt += it.ramt || 0 })
      const l2 = l2Sum[g]
      const hasL2 = l2.q || l2.amt || l2.rq || l2.ramt, hasL3 = sc.q || sc.amt || sc.rq || sc.ramt
      if (!shard && hasL2) { l3Mismatch++; l3Lines.push('  ✗ ' + mk + ' [' + g + '] salesM shard 누락 — salesD 합 있음(재계산 필요)') }
      else if (hasL2 || hasL3) {
        const dd = []
        if (l2.amt !== sc.amt) dd.push('매출 L2=' + l2.amt + '/L3=' + sc.amt)
        if (l2.q !== sc.q) dd.push('수량 L2=' + l2.q + '/L3=' + sc.q)
        if (l2.ramt !== sc.ramt) dd.push('반품액 L2=' + l2.ramt + '/L3=' + sc.ramt)
        if (l2.rq !== sc.rq) dd.push('반품수 L2=' + l2.rq + '/L3=' + sc.rq)
        if (dd.length) { l3Mismatch++; l3Lines.push('  ✗ ' + mk + ' [' + g + '] ' + dd.join(' · ')) }
      }
    }
    await new Promise(r => setTimeout(r, 0))   // UI yield
  }
  if (!l2Mismatch) push('  ✅ 불일치 없음')
  push('')
  push('【4】 L2(salesD 월합) → L3(salesM shard) 대사')
  if (l3Lines.length) l3Lines.forEach(push); else push('  ✅ 불일치 없음')
  push('')

  // ---- 5) 커버리지 갭 (참고) ----
  push('【5】 커버리지 갭 — 활동 0인 날(참고용 · 주말/공휴일 정상)')
  const gapDays = []
  _slDaysInRange(fromDate, toDate).forEach(day => { const bm = dayBucket.get(day); if (!bm || !bm.size) gapDays.push(day) })
  push('  · 활동 0일 = ' + gapDays.length + '일' + (gapDays.length ? ' (' + _slVfRanges(gapDays) + ')' : ''))
  push('')

  // ---- 6) 요약 판정 (복사용) ----
  push('【6】 요약 판정 (복사용)')
  push('  · 업로드 날짜파싱 실패 누적: ' + uDateFail)
  push('  · L1 빈 od: ' + emptyOd.length + ' · od 범위밖: ' + outWin.length + ' · rd 이상: ' + rdAnom.length)
  push('  · L1↔L2 불일치: ' + l2Mismatch + ' · L2↔L3 불일치: ' + l3Mismatch)
  const bad = (emptyOd.length || outWin.length || rdAnom.length || l2Mismatch || l3Mismatch || uDateFail)
  push('  · 종합: ' + (bad ? '⚠️ 확인 필요 — 위 항목 점검 후 Fable에게 결과 붙여넣기' : '✅ 이상 없음'))
  push('========================================')

  const text = R.join('\n')
  _slVerifyText = text
  try { console.log(text) } catch (e) {}
  return { text: text, orders: orders.length, emptyOd: emptyOd.length, outWin: outWin.length, rdAnom: rdAnom.length, l2Mismatch: l2Mismatch, l3Mismatch: l3Mismatch, dateFail: uDateFail, aborted: _slVerifyAbort }
}

// ---- 검증 모달(관리자) ----
function openSalesVerifyModal() {
  if (!_slIsAdmin()) { showToast('데이터 검증은 관리자 전용입니다.', 'warning'); return }
  const m = document.getElementById('slVerifyModal'); if (!m) return
  _slVerifyAbort = false
  const ss = document.getElementById('slSumStart'), se = document.getElementById('slSumEnd')
  const vs = document.getElementById('slVfStart'), ve = document.getElementById('slVfEnd')
  if (vs && ss && ss.value) vs.value = ss.value
  if (ve && se && se.value) ve.value = se.value
  if (!m.open) m.showModal()
  if (typeof centerModal === 'function') centerModal(m)
}
function closeSalesVerifyModal() { _slVerifyAbort = true; const m = document.getElementById('slVerifyModal'); if (m && m.open) m.close() }
function _slAbortVerify() { _slVerifyAbort = true; const st = document.getElementById('slVfStatus'); if (st) st.textContent = '중단 요청됨…' }
async function runSalesVerify() {
  if (!_slIsAdmin()) { showToast('관리자 전용', 'warning'); return }
  const body = document.getElementById('slVerifyBody'), st = document.getElementById('slVfStatus')
  const runBtn = document.getElementById('slVfRunBtn'), abortBtn = document.getElementById('slVfAbortBtn')
  const vs = ((document.getElementById('slVfStart') || {}).value) || '', ve = ((document.getElementById('slVfEnd') || {}).value) || ''
  _slVerifyAbort = false
  if (runBtn) runBtn.disabled = true
  if (abortBtn) abortBtn.classList.remove('sl-vf-hidden')
  if (body) body.textContent = '검증 중… (읽기 전용)'
  try {
    const res = await salesVerify(vs, ve, (msg) => { if (st) st.textContent = msg })
    if (body) body.textContent = res.text
    if (st) st.textContent = res.aborted ? '⚠️ 중단됨(부분 결과)' : '완료'
  } catch (e) {
    if (body) body.textContent = '검증 실패: ' + ((e && e.message) || e)
    if (st) st.textContent = '오류'
  }
  if (runBtn) runBtn.disabled = false
  if (abortBtn) abortBtn.classList.add('sl-vf-hidden')
}
function _slVerifyCopy() {
  if (!_slVerifyText) { showToast('복사할 결과가 없습니다.', 'warning'); return }
  const ta = document.createElement('textarea'); ta.value = _slVerifyText; document.body.appendChild(ta); ta.select()
  try { document.execCommand('copy'); showToast('검증 결과 복사됨', 'success') } catch (e) { showToast('복사 실패', 'warning') }
  document.body.removeChild(ta)
}

// ---- 주문 조회 탭 (주문번호 exact / 품번 부분 → L1 주문 목록 + 라인 상세) ----
async function renderSalesOrdersTab() {
  const panel = document.getElementById('slOrdersBody'); if (!panel) return
  panel.innerHTML = `
    <div class="sl-mx-controls">
      <label class="inbhist-ctl">검색 <input type="text" id="soQuery" class="inbhist-store" placeholder="주문번호(정확) 또는 품번" onkeydown="if(event.key==='Enter')searchSalesOrders()"></label>
      <button class="btn btn-new" onclick="searchSalesOrders()">🔍 검색</button>
      <span class="sl-warn-info">주문번호=양 채널 정확일치 · 품번=포함 주문(codes 인덱스)</span>
    </div>
    <div id="slOrdersResult"><div class="sl-hist-empty">주문번호 또는 품번을 입력하고 검색하세요.</div></div>`
}
async function searchSalesOrders() {
  const q = _slStr((document.getElementById('soQuery') || {}).value); const res = document.getElementById('slOrdersResult'); if (!res) return
  if (!q) { res.innerHTML = '<div class="sl-hist-empty">검색어를 입력하세요.</div>'; return }
  res.innerHTML = '<div class="sl-hist-loading">검색 중…</div>'
  const found = {}
  try {
    const s1 = await db.collection('salesOrders').where('ono', '==', q).get()   // 주문번호 정확(양 채널, ono 단일필드)
    s1.forEach(d => { found[d.id] = d.data() })
    if (Object.keys(found).length < 200) {
      const s2 = await db.collection('salesOrders').where('codes', 'array-contains', q.toUpperCase()).limit(200).get()   // 품번 포함
      s2.forEach(d => { if (!found[d.id]) found[d.id] = d.data() })
    }
  } catch (err) { res.innerHTML = `<div class="sl-hist-empty">검색 실패: ${esc(err.message)} (품번 검색은 [집계 재계산]으로 codes 인덱스 생성 후 가능)</div>`; return }
  const list = Object.entries(found).map(([id, o]) => Object.assign({ _id: id }, o)).sort((a, b) => String(b.od || '').localeCompare(String(a.od || '')))
  _slOrdersFound = list
  if (!list.length) { res.innerHTML = '<div class="sl-hist-empty">일치하는 주문이 없습니다. (품번 검색이 안 되면 [일자별 요약]→[집계 재계산] 1회 필요)</div>'; return }
  const chLbl = c => c === SL_CH.c24 ? '카페24' : '사방넷'
  const fmt = v => (v || 0).toLocaleString()
  res.innerHTML = `<div class="sl-hist-wrap"><table class="data-table inbhist-table sl-mx-table">
    <thead><tr><th style="width:20px"></th><th>주문번호</th><th>주문일</th><th>채널</th><th>쇼핑몰</th><th class="sl-c">라인</th><th class="sl-c">매출</th><th>반품</th></tr></thead>
    <tbody>${list.map((o, i) => {
      // 매출 표시 = Σ(rv + 라인배송) [+ 카페24 주문배송 1회]. 사방넷은 배송비가 라인(l.sh)·주문(o.ship) 양쪽 적재라 o.ship 재가산 금지(이중계상) — 라인 상세 합과 일치.
      const gross = (o.lines || []).reduce((s, l) => s + _slNum(l.rv) + _slNum(l.sh || 0), 0) + (o.ch === SL_CH.c24 ? _slNum(o.ship || 0) : 0)
      const hasRet = (o.rds || []).length > 0 || (o.lines || []).some(l => l.rd)
      return `<tr class="sl-ord-row" onclick="_slToggleOrder(${i})"><td>▸</td>
        <td>${esc(o.ono || '')}</td><td>${esc(o.od || '')}</td><td>${chLbl(o.ch)}</td><td>${esc(o.mall || '')}</td>
        <td class="sl-c">${(o.lines || []).length}</td><td class="sl-c">${fmt(gross)}</td><td>${hasRet ? '<span class="sl-hist-warn">반품</span>' : '-'}</td></tr>
        <tr class="sl-ord-detail inb-hidden" id="slOrdDet${i}"><td colspan="8">${_slOrderDetailHtml(o)}</td></tr>`
    }).join('')}</tbody></table></div>`
}
function _slOrderDetailHtml(o) {
  const fmt = v => (v || 0).toLocaleString()
  const lines = (o.lines || []).map(l => `<tr>
    <td><a class="sl-code-link" onclick="_slOpenProduct('${esc(l.c)}')">${esc(l.c)}</a></td><td>${esc(l.o || '')}</td><td class="sl-c">${l.q}</td>
    <td class="sl-c">${fmt(_slNum(l.rv) + _slNum(l.sh || 0))}</td><td>${l.rd ? esc(l.rd) : '-'}</td></tr>`).join('')
  const notes = (o.notes || []).map(n => `${esc((n.t || '').slice(0, 16))} ${esc(n.s || '')}`).join(' · ')
  const meta = []
  if (o.cash !== undefined) meta.push(`현금 ${fmt(o.cash)}`); if (o.pu) meta.push(`적립금 ${fmt(o.pu)}`); if (o.grade) meta.push(esc(o.grade)); if (o.bid) meta.push('ID:' + esc(o.bid))
  return `<div class="sl-ord-det-box">
    <table class="data-table sl-ord-lines"><thead><tr><th>품번</th><th>옵션</th><th class="sl-c">수량</th><th class="sl-c">매출액</th><th>반품일</th></tr></thead><tbody>${lines}</tbody></table>
    ${meta.length ? `<div class="sl-ord-meta">${meta.join(' · ')}</div>` : ''}
    ${notes ? `<div class="sl-ord-notes">변경: ${notes}</div>` : ''}
  </div>`
}
function _slToggleOrder(i) { const el = document.getElementById('slOrdDet' + i); if (el) el.classList.toggle('inb-hidden') }
function _slOpenProduct(code) { if (typeof openDetailModal === 'function') openDetailModal(code, { readOnly: true }); else showToast('상품 상세를 열 수 없습니다.', 'warning') }

// ---- 엑셀(현재 탭·현재 기간 미러) ----
function downloadSalesMatrix() {
  if (!_slMatrixRows.length) { showToast('데이터 없음', 'warning'); return }
  const aoa = [['품번', '상품명', '합계', '공홈', '파트너', '사방넷', '매장']]
  _slMatrixRows.forEach(r => aoa.push([r.code, r.name, r.tot, r.gh, r.pt, r.s, r.p]))
  _slExcel(aoa, `매출_전체_${_slMxStart}~${_slMxEnd}`)
}
function downloadSalesMalls() {
  if (!_slMallsData) { showToast('데이터 없음', 'warning'); return }
  const { malls, rows } = _slMallsData
  const aoa = [['품번', '상품명', '사방넷합계', ...malls]]
  rows.forEach(r => aoa.push([r.code, r.name, r.tot, ...r.cells]))
  _slExcel(aoa, `매출_쇼핑몰별_${_slMxStart}~${_slMxEnd}`)
}
function _slExcel(aoa, fname) {
  if (typeof XLSX === 'undefined') { showToast('엑셀 모듈 로드 실패', 'error'); return }
  const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '매출'); XLSX.writeFile(wb, fname + '.xlsx')
}

// ---- window 노출 ----
window.renderSalesMgmtTab = renderSalesMgmtTab
window.switchSalesMgmtSub = switchSalesMgmtSub
window.openSalesUploadModal = openSalesUploadModal
window.closeSalesUploadModal = closeSalesUploadModal
window.handleSalesLedgerFile = handleSalesLedgerFile
window.confirmSalesLedgerUpload = confirmSalesLedgerUpload
window.renderSalesUploadHistory = renderSalesUploadHistory
window._slCopyText = _slCopyText
// Phase 2: 집계 뷰/재계산
window.renderSalesSummary = renderSalesSummary
window.downloadSalesSummary = downloadSalesSummary
window.runSalesRecompute = runSalesRecompute
window.recomputeSalesRange = recomputeSalesRange
// 순수 집계 로직(테스트/재사용)
window._slAggDay = _slAggDay
window._slAggShard = _slAggShard
window._slLinePtsMap = _slLinePtsMap
window._slAllocByRv = _slAllocByRv
window._slOrderRamtMap = _slOrderRamtMap
window._slWeekStart = _slWeekStart
window._slDocRds = _slDocRds
window._slDocCodes = _slDocCodes
// Phase 3: 매트릭스/쇼핑몰별/파트너/주문조회
window.renderSalesMatrix = renderSalesMatrix
window.renderSalesMalls = renderSalesMalls
window.renderSalesPartner = renderSalesPartner
window.renderSalesOrdersTab = renderSalesOrdersTab
// Phase 4: 파트너 마스터 + 명단 관리 + 업체별 리포트
window._slSetPartners = _slSetPartners
window.saveSalesPartners = saveSalesPartners
window._slPartnerActiveSet = _slPartnerActiveSet
window._slPartnerMap = _slPartnerMap
window._slOrderIsPartner = _slOrderIsPartner
window._slCollectCandidate = _slCollectCandidate
window._slPidNorm = _slPidNorm
window._slDetectPartnerHeaders = _slDetectPartnerHeaders
window._slParsePartnerRows = _slParsePartnerRows
window.handlePartnerFile = handlePartnerFile
window.downloadSalesPartner = downloadSalesPartner
window.runFullRecompute = runFullRecompute
// 🧪 데이터 검증(READ-ONLY)
window.salesVerify = salesVerify
window.openSalesVerifyModal = openSalesVerifyModal
window.closeSalesVerifyModal = closeSalesVerifyModal
window.runSalesVerify = runSalesVerify
window._slAbortVerify = _slAbortVerify
window._slVerifyCopy = _slVerifyCopy
window._slTogglePartnerManage = _slTogglePartnerManage
window._slPartnerSearchInput = _slPartnerSearchInput
window._slPartnerStartEdit = _slPartnerStartEdit
window._slPartnerCancelEdit = _slPartnerCancelEdit
window._slPartnerSaveEdit = _slPartnerSaveEdit
window._slPartnerToggleActive = _slPartnerToggleActive
window._slPartnerAdd = _slPartnerAdd
window.searchSalesOrders = searchSalesOrders
window.downloadSalesMatrix = downloadSalesMatrix
window.downloadSalesMalls = downloadSalesMalls
window._slMxSetDates = _slMxSetDates
window._slMxPreset = _slMxPreset
window._slMxSearchInput = _slMxSearchInput
window._slMxToggleUnit = _slMxToggleUnit
window._slToggleOrder = _slToggleOrder
window._slOpenProduct = _slOpenProduct
window._slStorePos = _slStorePos
window._slMatrixItems = _slMatrixItems
// 병합/파싱 순수 로직(테스트/재사용 노출)
window._slMergeOrder = _slMergeOrder
window._slParseCafe24 = _slParseCafe24
window._slParseSabang = _slParseSabang
window._slDetectType = _slDetectType
