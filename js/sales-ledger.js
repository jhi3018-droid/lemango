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
let _slActiveSub = 'history'

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
  return { unmatched: new Set(), dateFail: [], anomaly: [], newMalls: new Set(), friends: 0, malls: {} }
}

// 카페24 파싱: 주문번호로 그룹핑. 라인 매출 rv = P − Y. 주문 필드 cash(S)/pu(W)/grade/bid/ship(ΣQ)/ref(maxU).
function _slParseCafe24(rows) {
  const warn = _slNewWarn()
  const headers = rows[0] || []
  const M = _slC24ColMap(headers)
  const codeSet = _slProductCodeSet()
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
      if (hasBuyer) { const bid = _slStr(row[M.buyerId]); if (bid) o.bid = bid }
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

// 주문 → L1 문서(신규)
function _slBuildDoc(inc, uploadId, nowIso) {
  const doc = {
    ch: inc.ch, ono: inc.ono, od: inc.od || '', mall: inc.mall || '',
    lines: inc.lines.map(_slCleanLine),
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

    // 2) 병합 계산
    const toWrite = []
    let cNew = 0, cMerge = 0, cSame = 0, cReturns = 0
    p.orders.forEach(o => {
      const res = _slMergeOrder(existing[o.key] || null, o, uploadId, nowIso)
      cReturns += res.returns
      if (res.action === 'new') { cNew++; toWrite.push({ id: o.key, doc: res.doc }) }
      else if (res.action === 'merge') { cMerge++; toWrite.push({ id: o.key, doc: res.doc }) }
      else cSame++
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
      workerUid: uid, workerName: workerName, at: nowIso
    }
    await db.collection('salesUploads').doc(uploadId).set(uploadRec)

    if (typeof logActivity === 'function') logActivity('upload', '매출원장', `${p.type} — ${p.fileName} : 신규 ${cNew} · 병합 ${cMerge} · 무변경 ${cSame} · 반품 ${cReturns}`)
    _slRenderResult({ cNew, cMerge, cSame, cReturns, writes: toWrite.length })
    _slUploads = []   // 캐시 무효화 → 다음 조회 시 재로드
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
      <div class="sl-result-note">쓰기 ${r.writes}건 (변경없음은 쓰지 않음).</div>
      <div class="sl-pv-actions"><button class="btn btn-new" onclick="closeSalesUploadModal();switchSalesMgmtSub('history')">확인</button></div>
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
const SL_SUBS = [{ key: 'history', label: '업로드 내역' }]

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
    <div class="sl-note-phase">원본 주문내역(카페24/사방넷)을 주문 원장에 적재합니다. 매출 집계·리포트 화면은 다음 단계에서 추가됩니다.</div>
    <div class="store-panels">
      <div class="store-panel" id="slPanel_history">
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
  renderSalesUploadHistory(false)
}

function switchSalesMgmtSub(sub) {
  _slActiveSub = sub
  document.querySelectorAll('#salesMgmtPage .store-subtab').forEach(btn => {
    const on = btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf("'" + sub + "'") >= 0
    btn.classList.toggle('store-subtab-active', !!on)
  })
  if (sub === 'history') renderSalesUploadHistory(false)
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
// 병합/파싱 순수 로직(테스트/재사용 노출)
window._slMergeOrder = _slMergeOrder
window._slParseCafe24 = _slParseCafe24
window._slParseSabang = _slParseSabang
window._slDetectType = _slDetectType
