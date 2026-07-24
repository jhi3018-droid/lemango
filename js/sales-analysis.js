// =============================================
// ===== 📊 매출분석 v1 — 기간 비교 / 상품 랭킹 / 반품 분석 =====
// =============================================
// 🔴 READ-ONLY 분석 화면: Firestore write 0 · 리스너 0 · 신규 컬렉션 0 · rules 무변경.
//   데이터 소스 = 매출관리 집계 전용(L2 salesD · L3 salesM/W via _slMatrixItems/_slLoadSalesDaily)
//   + 매장(POS) = storeSales 뷰타임 조인(_slStorePos 원리 재사용, READ만).
//   집계/L1/매출공식/매출관리 화면 무접촉 — sales-ledger.js 의 전역 헬퍼만 호출(수정 없음).
//   금액 기준 = 순액(매출−반품·배송 포함) — 매출관리 일자별 요약과 동일 기준.
//   캐시 = 세션 메모(_saCache, 탭 재방문 read 0) · [↻ 새로고침]=메모 클리어 후 재조회.

let _saActiveSub = 'compare'
let _saStart = '', _saEnd = ''        // 랭킹/반품 공용 기간(매출관리 _slMx* 와 별개 — 매출관리 화면 상태 무접촉)
let _saChannel = 'all'                // all | gh | pt | sb
let _saMall = ''                      // 사방넷 몰 필터('' = 전체)
let _saBasis = 'qty'                  // qty | amt (랭킹 기준)
let _saMinSales = 10                  // 반품 분석 최소 판매수 필터(소량 왜곡 방지)
let _saCache = {}                     // 세션 메모: key → data
let _saRankData = null                // { top, bottom, s, e, ps, pe } (엑셀 미러)
let _saRetData = null                 // { rows, chan, s, e } (엑셀 미러)
let _saCmpData = null                 // 기간 비교(엑셀 미러)

const SA_SUBS = [
  { key: 'scorecard', label: '🧬 기획 인사이트' },
  { key: 'compare', label: '📈 기간 비교' },
  { key: 'ranking', label: '🏆 상품 랭킹' },
  { key: 'returns', label: '📉 반품 분석' }
]
const SA_CH_LABEL = { all: '전체', gh: '공홈', pt: '파트너', sb: '사방넷' }
// 채널 색(브랜드 팔레트 — dashboard CHART_COLORS 컨벤션): 공홈=네이비 · 파트너=골드 · 사방넷=그린
const SA_CH_COLOR = { gh: '#1a1a2e', pt: '#c9a96e', sb: '#4caf7d' }

// =============================================
// ===== 메뉴 셸 =====
// =============================================
function renderSalesAnalysisTab() {
  const page = document.getElementById('salesAnalysisPage'); if (!page) return
  const subBar = SA_SUBS.map(s =>
    `<button class="store-subtab${s.key === _saActiveSub ? ' store-subtab-active' : ''}" onclick="switchSalesAnalysisSub('${s.key}')">${esc(s.label)}</button>`
  ).join('')
  page.innerHTML = `
    <div class="store-header">
      <h2 class="store-title">📊 매출분석</h2>
      <div class="sl-head-actions"><span class="sl-head-note">매출관리 집계 기반 분석 (읽기 전용)</span></div>
    </div>
    <div class="store-subtabs">${subBar}</div>
    <div class="store-panels">
      <div class="store-panel${_saActiveSub === 'scorecard' ? '' : ' store-panel-hidden'}" id="saPanel_scorecard"><div id="saScorecardBody"><div class="sl-hist-loading">불러오는 중…</div></div></div>
      <div class="store-panel${_saActiveSub === 'compare' ? '' : ' store-panel-hidden'}" id="saPanel_compare"><div id="saCompareBody"><div class="sl-hist-loading">불러오는 중…</div></div></div>
      <div class="store-panel${_saActiveSub === 'ranking' ? '' : ' store-panel-hidden'}" id="saPanel_ranking"><div id="saRankingBody"><div class="sl-hist-loading">불러오는 중…</div></div></div>
      <div class="store-panel${_saActiveSub === 'returns' ? '' : ' store-panel-hidden'}" id="saPanel_returns"><div id="saReturnsBody"><div class="sl-hist-loading">불러오는 중…</div></div></div>
    </div>`
  _saRenderSub(_saActiveSub)
}
function _saRenderSub(sub) {
  if (sub === 'scorecard') renderSaScorecard()
  else if (sub === 'compare') renderSaCompare()
  else if (sub === 'ranking') renderSaRanking()
  else if (sub === 'returns') renderSaReturns()
}
function switchSalesAnalysisSub(sub) {
  _saActiveSub = sub
  document.querySelectorAll('#salesAnalysisPage .store-subtab').forEach(btn => {
    const on = btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf("'" + sub + "'") >= 0
    btn.classList.toggle('store-subtab-active', !!on)
  })
  document.querySelectorAll('#salesAnalysisPage .store-panel').forEach(p => {
    p.classList.toggle('store-panel-hidden', p.id !== 'saPanel_' + sub)
  })
  _saRenderSub(sub)
}

// =============================================
// ===== 공용: 날짜/기간/캐시/포맷 =====
// =============================================
function _saToday() { return (typeof kstDateKey === 'function' && kstDateKey()) || new Date().toISOString().slice(0, 10) }
function _saFmt(v) { return (v || 0).toLocaleString() }
function _saMan(v) { return Math.round((v || 0) / 10000).toLocaleString() + '만' }   // 만원 반올림(BEST/전월비 포맷)
async function _saEnsurePeriod() {
  if (_saStart && _saEnd) return
  const latest = await _slLatestDataDate()
  _saStart = _saEnd = latest || _saToday()
}
// 직전 동일기간: prevEnd = start−1일, prevStart = prevEnd−(len−1)
function _saPrevRange(s, e) {
  const ts = _slParseDK(s), te = _slParseDK(e)
  if (isNaN(ts) || isNaN(te)) return { ps: s, pe: e }
  const days = Math.round((te - ts) / 86400000) + 1
  const pe = _slFmtDK(ts - 86400000)
  const ps = _slFmtDK(ts - days * 86400000)
  return { ps: ps, pe: pe }
}
function _saRefresh() { _saCache = {}; _saRenderSub(_saActiveSub) }   // 세션 메모 클리어 후 현재 탭 재조회

// 기간 매트릭스 items(c24+sb) — _slMatrixItems 재사용(하이브리드: 정확 월/주=L3 shard · 그 외=L1 스캔). 세션 메모.
async function _saLoadItems(s, e) {
  const key = 'mx_' + s + '_' + e
  if (_saCache[key]) return _saCache[key]
  const c24 = await _slMatrixItems('c24', s, e)
  const sb = await _slMatrixItems('sb', s, e)
  const data = { c24: c24 || {}, sb: sb || {} }
  _saCache[key] = data
  return data
}

// 채널 필터 적용 per-품번 {q,rq,amt,ramt} 맵. 몰 필터=사방넷 몰 버킷({q,amt}만 — 반품 미분리, 매출관리 쇼핑몰별과 동일 한계).
function _saChanVals(data, channel, mall) {
  const out = {}
  const add = (code, it) => {
    if (!it) return
    const o = out[code] || (out[code] = { q: 0, rq: 0, amt: 0, ramt: 0 })
    o.q += it.q || 0; o.rq += it.rq || 0; o.amt += it.amt || 0; o.ramt += it.ramt || 0
  }
  if (channel === 'all' || channel === 'gh' || channel === 'pt') {
    Object.keys(data.c24).forEach(code => {
      if (channel === 'all') add(code, data.c24[code])
      else add(code, _slItemSplit(data.c24[code])[channel])
    })
  }
  if (channel === 'all' || channel === 'sb') {
    Object.keys(data.sb).forEach(code => {
      const it = data.sb[code]
      if (channel === 'sb' && mall) add(code, (it.malls || {})[mall])   // 몰 버킷={q,amt}(반품 미분리)
      else add(code, it)
    })
  }
  return out
}
function _saNetOf(o, basis) { o = o || {}; return basis === 'amt' ? (o.amt || 0) - (o.ramt || 0) : (o.q || 0) - (o.rq || 0) }

// 매장(POS) 기간 순액 — storeSales 뷰타임 조인(READ만). 판매합/취소합 분리(_slStorePos netting 원리 + _shFetchVoidsByOrig 재사용).
async function _saStoreNet(s, e) {
  const key = 'pos_' + s + '_' + e
  if (_saCache[key]) return _saCache[key]
  const out = { sale: 0, voided: 0, net: 0, err: false }
  if (typeof db === 'undefined' || !db) { out.err = true; _saCache[key] = out; return out }
  try {
    const snap = await db.collection('storeSales').where('dateKey', '>=', s).where('dateKey', '<=', e).get()
    const ids = []
    snap.forEach(d => {
      const o = d.data(); if (!o || o.type !== 'sale') return
      ids.push(d.id)
      ;(o.lines || []).forEach(l => { out.sale += _slNum(l.lineTotal) })   // 라인 lineTotal 합(=totals.total, _slStorePos 동일 기준)
    })
    const voids = (typeof _shFetchVoidsByOrig === 'function') ? await _shFetchVoidsByOrig(ids) : []
    voids.forEach(v => (v.lines || []).forEach(l => { out.voided += _slNum(l.lineTotal) }))
    out.net = out.sale - out.voided
  } catch (err) {
    // 🔴 실패 시 부분 누산값 폐기(취소 미반영 순액 오표시 방지) — err 플래그로 화면/엑셀에서 '생략' 처리(F1)
    console.warn('_saStoreNet(매장 열 생략):', err && err.message)
    out.sale = 0; out.voided = 0; out.net = 0; out.err = true
  }
  _saCache[key] = out
  return out
}

// 상품명/썸네일(인메모리 State.allProducts — 추가 read 0). freeze 마킹 없는 단순 썸네일(열 적음 → freeze 불요).
function _saThumb(code, pmap) {
  const p = pmap[String(code).toUpperCase()]
  const ph = (typeof PLACEHOLDER_IMG !== 'undefined') ? PLACEHOLDER_IMG : 'assets/logo-placeholder.png'
  const url = (p && typeof getThumbUrl === 'function' ? getThumbUrl(p) : null) || ph
  return `<img src="${url}" class="thumb sa-thumb" loading="lazy" onerror="this.onerror=null;this.src='${ph}'" />`
}

// 기간 바(랭킹/반품 공용) — 매출관리 프리셋 컨벤션(데이터 최신일/이번 주=월~오늘/이번 달=1일~오늘)
function _saControlsHtml(renderFn, extra) {
  return `<div class="sl-mx-controls">
    <label class="inbhist-ctl">시작 <input type="date" id="saStart_${renderFn}" class="inbhist-date" value="${esc(_saStart)}" onchange="_saSetDates('${renderFn}')"></label>
    <label class="inbhist-ctl">끝 <input type="date" id="saEnd_${renderFn}" class="inbhist-date" value="${esc(_saEnd)}" onchange="_saSetDates('${renderFn}')"></label>
    <button class="btn btn-outline btn-sm" onclick="_saPreset('day','${renderFn}')">데이터 최신일</button>
    <button class="btn btn-outline btn-sm" onclick="_saPreset('week','${renderFn}')">이번 주</button>
    <button class="btn btn-outline btn-sm" onclick="_saPreset('month','${renderFn}')">이번 달</button>
    <span class="sl-mx-range">${esc(_saStart)} ~ ${esc(_saEnd)}</span>
    ${extra || ''}
    <button class="btn btn-outline" onclick="_saRefresh()" title="캐시 비우고 다시 조회">↻ 새로고침</button>
  </div>`
}
function _saSetDates(renderFn) {
  const s = (document.getElementById('saStart_' + renderFn) || {}).value
  const e = (document.getElementById('saEnd_' + renderFn) || {}).value
  if (s) _saStart = s; if (e) _saEnd = e
  if (_saStart > _saEnd) { const t = _saStart; _saStart = _saEnd; _saEnd = t }
  if (typeof window[renderFn] === 'function') window[renderFn]()
}
async function _saPreset(kind, renderFn) {
  const today = _saToday()
  if (kind === 'day') { const latest = await _slLatestDataDate() || _saEnd || today; _saStart = _saEnd = latest }
  else if (kind === 'week') { _saStart = _slWeekStart(today); _saEnd = today }
  else if (kind === 'month') { _saStart = _slMonthKey(today) + '-01'; _saEnd = today }
  if (typeof window[renderFn] === 'function') window[renderFn]()
}
function _saSetChannel(v, renderFn) { _saChannel = v; if (v !== 'sb') _saMall = ''; if (typeof window[renderFn] === 'function') window[renderFn]() }
function _saSetMall(v, renderFn) { _saMall = v; if (typeof window[renderFn] === 'function') window[renderFn]() }
function _saSetBasis(v) { _saBasis = v; renderSaRanking() }
function _saSetMinSales(v) { const n = parseInt(v, 10); _saMinSales = (isNaN(n) || n < 0) ? 0 : n; renderSaReturns() }

// =============================================
// ===== Tab 0 — 🧬 기획 인사이트 (속성 스코어카드) =====
// =============================================
// 🔴 온라인(공홈+파트너+사방넷) 전용 · 매장(POS) 제외 · 사은품 제외(_slExcludedCodeSet, 이 탭에서만).
//   카테고리(복종)/백스타일/레그컷 = L3 items × 상품마스터 view-time 조인 · 사이즈 = salesSz 파생층(캐논 SIZES 화이트리스트).
//   미분류 = 속성 빈 상품(무음 숨김 금지) · 하단 대사(B5): 스코어카드 합 + 사은품 제외분 == 전체 매트릭스 합(Decision #6).
let _saScData = null   // 엑셀 미러

async function _saLoadSz(grp, s, e) {
  const key = 'sz_' + grp + '_' + s + '_' + e
  if (_saCache[key]) return _saCache[key]
  const items = (typeof _slSzItems === 'function') ? await _slSzItems(grp, s, e) : {}
  _saCache[key] = items || {}
  return _saCache[key]
}
function _saUp(c) { return (typeof _slCodeNorm === 'function') ? _slCodeNorm(c) : String(c == null ? '' : c).trim().toUpperCase() }
function _saRate(rq, q) { return q > 0 ? (rq / q * 100) : 0 }

// 한 차원(dimension)의 버킷 맵 → 정렬된 행 배열(순매출 desc). 미분류는 항상 마지막.
function _saDimRows(map) {
  const MISC = '미분류'
  return Object.keys(map).map(k => {
    const b = map[k]
    return { key: k, q: b.q, rq: b.rq, amt: b.amt, ramt: b.ramt, net: (b.amt || 0) - (b.ramt || 0), rate: _saRate(b.rq, b.q), codes: b.codes.size }
  }).sort((a, b) => (a.key === MISC ? 1 : 0) - (b.key === MISC ? 1 : 0) || b.net - a.net || String(a.key).localeCompare(String(b.key)))
}
function _saDimTableHtml(title, rows, opts) {
  opts = opts || {}
  const totNet = rows.reduce((s, r) => s + r.net, 0)
  const body = rows.length ? rows.map(r => {
    const isMisc = r.key === '미분류' || r.key === '기타'
    const label = isMisc
      ? `<span class="sa-sc-misc">${esc(r.key)}${r.key === '미분류' ? ' <span class="sa-sc-mischint">(속성 미입력 — 상품조회 → 정보 미완성 필터에서 채우면 사라짐)</span>' : (opts.miscTip ? ` <span class="sa-sc-mischint" title="${esc(opts.miscTip)}">ⓘ 원본 키</span>` : '')}</span>`
      : esc(r.key)
    return `<tr class="${isMisc ? 'sa-sc-miscrow' : ''}">
      <td>${label}</td>
      <td class="sl-c">${_saFmt(r.q)}</td>
      <td class="sl-c">${_saFmt(r.rq)}</td>
      <td class="sl-c">${r.rate.toFixed(1)}%</td>
      <td class="sl-c">${_saFmt(r.net)}</td>
      <td class="sl-c">${_saFmt(r.codes)}</td>
    </tr>`
  }).join('') : '<tr><td colspan="6" class="sl-hist-empty">해당 없음</td></tr>'
  return `<div class="sa-card">
    <div class="sa-card-title">${esc(title)} <span class="sa-muted">· 순매출 합 ${_saFmt(totNet)}</span></div>
    <table class="data-table inbhist-table sa-sc-table">
      <thead><tr><th>${esc(opts.col || '값')}</th><th class="sl-c">판매수량</th><th class="sl-c">반품수량</th><th class="sl-c">반품률</th><th class="sl-c">순매출액</th><th class="sl-c">상품 수</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`
}

async function renderSaScorecard() {
  const panel = document.getElementById('saScorecardBody'); if (!panel) return
  await _saEnsurePeriod()
  panel.innerHTML = '<div class="sl-hist-loading">불러오는 중…</div>'
  const s = _saStart, e = _saEnd
  let data, szC24, szSb
  try {
    data = await _saLoadItems(s, e)                 // L3 items (랭킹/반품과 세션 캐시 공유)
    szC24 = await _saLoadSz('c24', s, e)
    szSb = await _saLoadSz('sb', s, e)
  } catch (err) { panel.innerHTML = `<div class="sl-hist-empty">조회 실패: ${esc(err.message)}</div>`; return }
  if (document.getElementById('saScorecardBody') !== panel) return

  const excludedSet = (typeof _slExcludedCodeSet === 'function') ? _slExcludedCodeSet() : new Set()
  const prodMap = _slProdMap()
  const perCode = _saChanVals(data, 'all', '')      // 온라인 전 채널 {code:{q,rq,amt,ramt}}

  // 전체 매트릭스 합(RHS, 제외 포함 전체)
  let matSale = 0, matRet = 0
  Object.keys(perCode).forEach(c => { const v = perCode[c]; matSale += v.amt || 0; matRet += v.ramt || 0 })

  // 속성 3차원 버킷 + 제외분 분리
  const MISC = '미분류'
  const dims = {
    type: { title: '📦 카테고리(복종)', col: '복종', map: {}, get: p => (p && String(p.type || '').trim()) },
    backStyle: { title: '👗 백스타일', col: '백스타일', map: {}, get: p => (p && String(p.backStyle || '').trim()) },
    legCut: { title: '✂️ 레그컷', col: '레그컷', map: {}, get: p => (p && String(p.legCut || '').trim()) }
  }
  const addDim = (dk, key, v, code) => { const m = dims[dk].map; const b = m[key] || (m[key] = { q: 0, rq: 0, amt: 0, ramt: 0, codes: new Set() }); b.q += v.q || 0; b.rq += v.rq || 0; b.amt += v.amt || 0; b.ramt += v.ramt || 0; b.codes.add(code) }
  let exclSale = 0, exclRet = 0; const exclCodes = new Set()
  Object.keys(perCode).forEach(code => {
    const v = perCode[code]
    if (excludedSet.has(_saUp(code))) { exclSale += v.amt || 0; exclRet += v.ramt || 0; exclCodes.add(code); return }
    const p = prodMap[code.toUpperCase()]
    Object.keys(dims).forEach(dk => addDim(dk, dims[dk].get(p) || MISC, v, code))
  })

  // 사이즈 섹션 — salesSz(c24+sb) 병합, 제외 제거, 캐논 SIZES vs 기타
  const SZ = (typeof SIZES !== 'undefined') ? SIZES : ['XS', 'S', 'M', 'L', 'XL', '2XL', 'F']
  const szSet = new Set(SZ)
  const szMap = {}; const miscRaw = {}
  const addSz = (items) => {
    Object.keys(items || {}).forEach(code => {
      if (excludedSet.has(_saUp(code))) return
      const szm = items[code] || {}
      Object.keys(szm).forEach(k => {
        const canonical = szSet.has(k)
        const bucket = canonical ? k : '기타'
        const b = szMap[bucket] || (szMap[bucket] = { q: 0, rq: 0, amt: 0, ramt: 0, codes: new Set() })
        const v = szm[k] || {}; b.q += v.q || 0; b.rq += v.rq || 0; b.amt += v.amt || 0; b.ramt += v.ramt || 0; b.codes.add(code)
        if (!canonical) miscRaw[k] = (miscRaw[k] || 0) + 1
      })
    })
  }
  addSz(szC24); addSz(szSb)
  // 사이즈 행 순서 = 캐논 SIZES 순서 우선, 기타 마지막
  const szRows = Object.keys(szMap).map(k => { const b = szMap[k]; return { key: k, q: b.q, rq: b.rq, amt: b.amt, ramt: b.ramt, net: (b.amt || 0) - (b.ramt || 0), rate: _saRate(b.rq, b.q), codes: b.codes.size } })
    .sort((a, b) => { const ia = szSet.has(a.key) ? SZ.indexOf(a.key) : 99, ib = szSet.has(b.key) ? SZ.indexOf(b.key) : 99; return ia - ib || String(a.key).localeCompare(String(b.key)) })
  const miscTip = Object.keys(miscRaw).sort().map(k => k + '(' + miscRaw[k] + ')').join(', ')

  // 대사(B5): 스코어카드 합(비제외, type 차원 = 캐논 파티션) + 제외분 == 전체 매트릭스 합
  const typeRows = _saDimRows(dims.type.map)
  let scSale = 0, scRet = 0
  Object.values(dims.type.map).forEach(b => { scSale += b.amt; scRet += b.ramt })
  const okSale = (scSale + exclSale === matSale), okRet = (scRet + exclRet === matRet)
  // 사이즈층 자체 합(비제외) — type 차원과 같아야 함(salesSz ↔ 속성층 크로스소스 정합)
  let szSale = 0, szRet = 0; szRows.forEach(r => { szSale += r.amt; szRet += r.ramt })
  const szConsistent = (szSale === scSale && szRet === scRet)
  // 🔴 헤드라인 대사에 salesSz 정합도 포함(리뷰 반영) — 속성층 파티션은 동일 소스라 구조적 true 이므로,
  //   별도 소스인 salesSz(사이즈층) 정합까지 통과해야 "일치"로 표시(성공 시에도 사이즈층 긍정 확인 노출).
  const reconOk = okSale && okRet && szConsistent

  _saScData = { s: s, e: e, dims: dims, typeRows: typeRows, szRows: szRows, miscRaw: miscRaw,
    exclSale: exclSale, exclRet: exclRet, exclCount: exclCodes.size, matSale: matSale, matRet: matRet, scSale: scSale, scRet: scRet, reconOk: reconOk }

  const header = `<div class="sl-sum-basis sa-sc-basis">
    <b>온라인 판매 기준 · 매장(POS) 제외</b> · 순매출액 = 매출−반품(배송 포함) · 기간 ${esc(s)} ~ ${esc(e)}
    · 사은품 제외 <b>${exclCodes.size}</b>개 품번
    <button class="btn btn-outline btn-sm" onclick="downloadSaScorecard()">📥 엑셀</button>
  </div>`

  const reconLine = `<div class="sa-sc-recon ${reconOk ? 'sa-sc-ok' : 'sa-sc-bad'}">
    ${reconOk ? '✅ 대사 일치' : '⚠️ 대사 불일치'} —
    스코어카드 순매출 ${_saFmt(scSale - scRet)} + 사은품 제외분 ${_saFmt(exclSale - exclRet)} = ${_saFmt((scSale - scRet) + (exclSale - exclRet))}
    <span class="sa-muted">vs 전체 매트릭스 순매출 ${_saFmt(matSale - matRet)}</span>
    <span class="sa-muted"> · 사이즈층(salesSz) ${szConsistent ? '정합 ✅' : '불일치 ⚠️'}</span>
    ${(okSale && okRet) ? '' : `<div class="sa-sc-baddetail">차액: 매출 ${_saFmt((scSale + exclSale) - matSale)} · 반품 ${_saFmt((scRet + exclRet) - matRet)} — [매출관리 → 집계 재계산] 후 재확인</div>`}
    ${szConsistent ? '' : `<div class="sa-sc-baddetail">⚠️ 사이즈층(salesSz) 합이 속성층과 다름(매출 ${_saFmt(szSale)} vs ${_saFmt(scSale)}) — [매출관리 → 집계 재계산] 필요</div>`}
  </div>`

  panel.innerHTML = _saControlsHtml('renderSaScorecard') + header +
    _saDimTableHtml(dims.type.title, typeRows, { col: dims.type.col }) +
    _saDimTableHtml(dims.backStyle.title, _saDimRows(dims.backStyle.map), { col: dims.backStyle.col }) +
    _saDimTableHtml(dims.legCut.title, _saDimRows(dims.legCut.map), { col: dims.legCut.col }) +
    _saDimTableHtml('📐 사이즈', szRows, { col: '사이즈', miscTip: miscTip || '없음' }) +
    reconLine
}

function downloadSaScorecard() {
  if (!_saScData) { showToast('데이터 없음', 'warning'); return }
  const d = _saScData
  const aoa = [['[기획 인사이트 — 속성 스코어카드] ' + d.s + ' ~ ' + d.e + ' · 온라인 · 매장 제외 · 사은품 ' + d.exclCount + '개 품번 제외']]
  const sect = (title, rows, col) => {
    aoa.push([]); aoa.push([title]); aoa.push([col, '판매수량', '반품수량', '반품률(%)', '순매출액', '상품수'])
    rows.forEach(r => aoa.push([r.key, r.q, r.rq, Math.round(r.rate * 10) / 10, r.net, r.codes]))
  }
  sect('카테고리(복종)', d.typeRows, '복종')
  sect('백스타일', _saDimRows(d.dims.backStyle.map), '백스타일')
  sect('레그컷', _saDimRows(d.dims.legCut.map), '레그컷')
  sect('사이즈', d.szRows, '사이즈')
  aoa.push([]); aoa.push(['[대사]', '순매출', '', '', '', ''])
  aoa.push(['스코어카드', d.scSale - d.scRet]); aoa.push(['사은품 제외분', d.exclSale - d.exclRet])
  aoa.push(['전체 매트릭스', d.matSale - d.matRet]); aoa.push(['판정', d.reconOk ? '일치' : '불일치'])
  _slExcel(aoa, `매출분석_기획인사이트_${d.s}~${d.e}`)
}

// =============================================
// ===== Tab 1 — 📈 기간 비교 =====
// =============================================
// 월간 비교(이번 달 1일~오늘 vs 지난달 1일~같은날, 월말 클램프 — _slPrevMonthRange 재사용) 공홈/파트너/사방넷/매장/전체
// + 월별 추이(최근 6개월, 채널 스택 CSS bar) + 주간 추이(최근 12주, 월요일 시작) — L2 salesD 1회 range 로 전부 파생.
async function _saLoadCompare() {
  const today = _saToday()
  const key = 'cmp_' + today
  if (_saCache[key]) return _saCache[key]
  const r = _slPrevMonthRange(today)   // {curStart,curEnd,prevStart,prevEnd}
  // 6개월 시작(5개월 전 1일) — 전월(비교)·12주(84일) 범위 포함 → L2 salesD 단일 range 쿼리
  const cy = +today.slice(0, 4), cm = +today.slice(5, 7)
  const m6 = new Date(Date.UTC(cy, cm - 1 - 5, 1))
  const months = []; for (let i = 0; i < 6; i++) { const d = new Date(Date.UTC(m6.getUTCFullYear(), m6.getUTCMonth() + i, 1)); months.push(d.getUTCFullYear() + '-' + _slPad(d.getUTCMonth() + 1)) }
  const loadStart = months[0] + '-01'
  const rows = await _slLoadSalesDaily(loadStart, today)
  // 12주(월요일 시작, 이번 주 포함)
  const ws0 = _slWeekStart(today)
  const weeks = []; for (let i = 11; i >= 0; i--) weeks.push(_slFmtDK(_slParseDK(ws0) - i * 7 * 86400000))
  // 일별 → 채널 samt/ramt 누산기
  const z = () => ({ gh: { s: 0, r: 0 }, pt: { s: 0, r: 0 }, sb: { s: 0, r: 0 } })
  const acc = (dst, d) => {
    const sp = _slDaySplit(d), s = d.sb || {}
    dst.gh.s += sp.gh.samt || 0; dst.gh.r += sp.gh.ramt || 0
    dst.pt.s += sp.pt.samt || 0; dst.pt.r += sp.pt.ramt || 0
    dst.sb.s += s.samt || 0; dst.sb.r += s.ramt || 0
  }
  const cur = z(), prev = z()
  const byMonth = {}; months.forEach(m => { byMonth[m] = z() })
  const byWeek = {}; weeks.forEach(w => { byWeek[w] = z() })
  rows.forEach(d => {
    const dk = d.d || ''
    if (dk >= r.curStart && dk <= r.curEnd) acc(cur, d)
    if (dk >= r.prevStart && dk <= r.prevEnd) acc(prev, d)
    const mk = _slMonthKey(dk); if (byMonth[mk]) acc(byMonth[mk], d)
    const wk = _slWeekStart(dk); if (byWeek[wk]) acc(byWeek[wk], d)
  })
  // 매장(POS): 이번 달 vs 지난달(같은 날) — storeSales 뷰타임 조인 2회(월간 카드 전용 · 추이 미포함)
  const posCur = await _saStoreNet(r.curStart, r.curEnd)
  const posPrev = await _saStoreNet(r.prevStart, r.prevEnd)
  const data = { r: r, cur: cur, prev: prev, posCur: posCur, posPrev: posPrev, months: months, byMonth: byMonth, weeks: weeks, byWeek: byWeek, docs: rows.length }
  _saCache[key] = data
  return data
}

// 채널 스택 CSS bar (chart 라이브러리 없음 — dashboard 미니차트 색 컨벤션)
function _saStackBarsHtml(labels, series, curIdx) {
  // series: [{gh,pt,sb net}] per label
  const tot = series.map(v => Math.max(0, v.gh) + Math.max(0, v.pt) + Math.max(0, v.sb))
  const max = Math.max(...tot, 1)
  const H = 150
  return `<div class="sa-bars">` + labels.map((lb, i) => {
    const v = series[i]
    const seg = k => { const h = Math.round(Math.max(0, v[k]) / max * H); return h > 0 ? `<div class="sa-bar-seg" style="height:${h}px;background:${SA_CH_COLOR[k]}" title="${SA_CH_LABEL[k]} ${_saFmt(v[k])}"></div>` : '' }
    const sum = v.gh + v.pt + v.sb
    return `<div class="sa-bar-col${i === curIdx ? ' sa-bar-cur' : ''}">
      <div class="sa-bar-val">${_saMan(sum)}</div>
      <div class="sa-bar-stack" style="height:${H}px">${seg('sb')}${seg('pt')}${seg('gh')}</div>
      <div class="sa-bar-lb">${esc(lb)}</div>
    </div>`
  }).join('') + `</div>`
}

async function renderSaCompare() {
  const panel = document.getElementById('saCompareBody'); if (!panel) return
  panel.innerHTML = '<div class="sl-hist-loading">불러오는 중…</div>'
  let d
  try { d = await _saLoadCompare() } catch (err) { panel.innerHTML = `<div class="sl-hist-empty">조회 실패: ${esc(err.message)}</div>`; return }
  if (document.getElementById('saCompareBody') !== panel) return
  const r = d.r
  const net = b => (b.s || 0) - (b.r || 0)
  // 월간 비교 카드 rows: [라벨, curS, curR, prevNet]
  const chRows = [
    ['공홈', d.cur.gh, d.prev.gh],
    ['파트너', d.cur.pt, d.prev.pt],
    ['사방넷', d.cur.sb, d.prev.sb]
  ]
  const posErr = d.posCur.err || d.posPrev.err
  // 🔴 매장 조회 실패 시 전체 행에서 매장 제외(무음 혼입 금지 — F1) + 라벨 명시
  const posCurS = posErr ? 0 : d.posCur.sale, posCurR = posErr ? 0 : d.posCur.voided
  const posPrevS = posErr ? 0 : d.posPrev.sale, posPrevR = posErr ? 0 : d.posPrev.voided
  const totCur = { s: d.cur.gh.s + d.cur.pt.s + d.cur.sb.s + posCurS, r: d.cur.gh.r + d.cur.pt.r + d.cur.sb.r + posCurR }
  const totPrev = { s: d.prev.gh.s + d.prev.pt.s + d.prev.sb.s + posPrevS, r: d.prev.gh.r + d.prev.pt.r + d.prev.sb.r + posPrevR }
  const delta = (c, p) => {
    if (!p) return c ? '<span class="sa-up">신규</span>' : '-'
    const pct = (c - p) / Math.abs(p) * 100
    const cls = pct >= 0 ? 'sa-up' : 'sa-down'
    return `<span class="${cls}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</span>`
  }
  const cmpRow = (label, cs, cr, ps, pr, extraCls) => {
    const cn = cs - cr, pn = ps - pr
    return `<tr class="${extraCls || ''}"><td>${label}</td><td class="sl-c">${_saFmt(cs)}</td><td class="sl-c">${_saFmt(cr)}</td><td class="sl-c sl-net"><b>${_saFmt(cn)}</b></td><td class="sl-c">${_saFmt(pn)}</td><td class="sl-c">${delta(cn, pn)}</td></tr>`
  }
  let cardBody = chRows.map(([lb, c, p]) => cmpRow(lb, c.s, c.r, p.s, p.r)).join('')
  cardBody += posErr
    ? `<tr><td>매장(POS)</td><td colspan="5" class="sl-c sa-muted">조회 권한/오류로 생략</td></tr>`
    : cmpRow('매장(POS)', d.posCur.sale, d.posCur.voided, d.posPrev.sale, d.posPrev.voided)
  cardBody += cmpRow('전체' + (posErr ? ' (매장 제외)' : ''), totCur.s, totCur.r, totPrev.s, totPrev.r, 'sa-total-row')
  _saCmpData = { r: r, chRows: chRows, posErr: posErr, posCur: d.posCur, posPrev: d.posPrev, totCur: totCur, totPrev: totPrev, months: d.months, byMonth: d.byMonth, weeks: d.weeks, byWeek: d.byWeek }
  // 추이 시리즈(순액)
  const mSeries = d.months.map(m => { const b = d.byMonth[m]; return { gh: net(b.gh), pt: net(b.pt), sb: net(b.sb) } })
  const wSeries = d.weeks.map(w => { const b = d.byWeek[w]; return { gh: net(b.gh), pt: net(b.pt), sb: net(b.sb) } })
  const mLabels = d.months.map(m => (+m.slice(5, 7)) + '월')
  const wLabels = d.weeks.map(w => w.slice(5))
  const legend = `<span class="sa-legend"><i style="background:${SA_CH_COLOR.gh}"></i>공홈 <i style="background:${SA_CH_COLOR.pt}"></i>파트너 <i style="background:${SA_CH_COLOR.sb}"></i>사방넷</span>`
  panel.innerHTML = `
    <div class="sl-sum-basis">💰 금액 기준: <b>순액 = 매출 − 반품 · 배송비 포함</b>(매출관리 일자별 요약과 동일) · 판매=주문일 · 반품=반품완료일 귀속 · 매장(POS)=판매−취소(storeSales) <button class="btn btn-outline btn-sm" onclick="_saRefresh()">↻ 새로고침</button> <button class="btn btn-outline btn-sm" onclick="downloadSaCompare()">📥 엑셀</button></div>
    <div class="sa-card">
      <div class="sa-card-title">📅 월간 비교 — 이번 달(${esc(r.curStart)}~${esc(r.curEnd)}) vs 지난달(${esc(r.prevStart)}~${esc(r.prevEnd)}, 같은 날짜 기준)</div>
      <table class="data-table inbhist-table sa-cmp-table">
        <thead><tr><th>채널</th><th class="sl-c">이번 달 매출</th><th class="sl-c">이번 달 반품</th><th class="sl-c">이번 달 순액</th><th class="sl-c">지난달 순액</th><th class="sl-c">증감</th></tr></thead>
        <tbody>${cardBody}</tbody>
      </table>
    </div>
    <div class="sa-card">
      <div class="sa-card-title">📊 월별 추이 — 최근 6개월 순액 ${legend} <span class="sa-muted">(매장 POS 미포함 · 마지막 달=진행중)</span></div>
      ${_saStackBarsHtml(mLabels, mSeries, d.months.length - 1)}
    </div>
    <div class="sa-card">
      <div class="sa-card-title">📆 주간 추이 — 최근 12주 순액 (월요일 시작) ${legend} <span class="sa-muted">(매장 POS 미포함 · 마지막 주=진행중)</span></div>
      ${_saStackBarsHtml(wLabels, wSeries, d.weeks.length - 1)}
    </div>`
}

function downloadSaCompare() {
  if (!_saCmpData) { showToast('데이터 없음', 'warning'); return }
  const d = _saCmpData, net = b => (b.s || 0) - (b.r || 0)
  const aoa = [['[월간 비교] ' + d.r.curStart + '~' + d.r.curEnd + ' vs ' + d.r.prevStart + '~' + d.r.prevEnd],
    ['채널', '이번달 매출', '이번달 반품', '이번달 순액', '지난달 매출', '지난달 반품', '지난달 순액']]
  d.chRows.forEach(([lb, c, p]) => aoa.push([lb, c.s, c.r, c.s - c.r, p.s, p.r, p.s - p.r]))
  if (d.posErr) aoa.push(['매장(POS)', '조회 오류로 생략(전체 행 미포함)'])
  else aoa.push(['매장(POS)', d.posCur.sale, d.posCur.voided, d.posCur.net, d.posPrev.sale, d.posPrev.voided, d.posPrev.net])
  aoa.push(['전체' + (d.posErr ? ' (매장 제외)' : ''), d.totCur.s, d.totCur.r, d.totCur.s - d.totCur.r, d.totPrev.s, d.totPrev.r, d.totPrev.s - d.totPrev.r])
  aoa.push([])
  aoa.push(['[월별 추이 — 순액, 매장 미포함]', '공홈', '파트너', '사방넷', '합계'])
  d.months.forEach(m => { const b = d.byMonth[m]; aoa.push([m, net(b.gh), net(b.pt), net(b.sb), net(b.gh) + net(b.pt) + net(b.sb)]) })
  aoa.push([])
  aoa.push(['[주간 추이 — 순액(월요일 시작), 매장 미포함]', '공홈', '파트너', '사방넷', '합계'])
  d.weeks.forEach(w => { const b = d.byWeek[w]; aoa.push([w, net(b.gh), net(b.pt), net(b.sb), net(b.gh) + net(b.pt) + net(b.sb)]) })
  _slExcel(aoa, `매출분석_기간비교_${d.r.curEnd}`)
}

// =============================================
// ===== Tab 2 — 🏆 상품 랭킹 =====
// =============================================
async function renderSaRanking() {
  const panel = document.getElementById('saRankingBody'); if (!panel) return
  await _saEnsurePeriod()
  panel.innerHTML = '<div class="sl-hist-loading">불러오는 중…</div>'
  const s = _saStart, e = _saEnd
  const { ps, pe } = _saPrevRange(s, e)
  let data, prevData
  try { data = await _saLoadItems(s, e); prevData = await _saLoadItems(ps, pe) }
  catch (err) { panel.innerHTML = `<div class="sl-hist-empty">조회 실패: ${esc(err.message)}</div>`; return }
  if (document.getElementById('saRankingBody') !== panel) return
  // 몰 목록(사방넷 필터용 — 현재 로드 데이터에서)
  const mallSet = new Set()
  Object.keys(data.sb).forEach(c => Object.keys(data.sb[c].malls || {}).forEach(m => mallSet.add(m)))
  const malls = [...mallSet].sort()
  if (_saMall && !mallSet.has(_saMall)) _saMall = ''
  const vals = _saChanVals(data, _saChannel, _saMall)
  const prevVals = _saChanVals(prevData, _saChannel, _saMall)
  const nameMap = _slNameMap(), prodMap = _slProdMap()
  // 기간 내 판매 발생(판매수량>0) 상품만 — 0판매 제외
  const ranked = Object.keys(vals).filter(c => (vals[c].q || 0) > 0)
    .map(code => {
      const v = vals[code]
      const cur = _saNetOf(v, _saBasis)
      const prv = _saNetOf(prevVals[code], _saBasis)
      return { code: code, name: nameMap[code.toUpperCase()] || '', q: (v.q || 0) - (v.rq || 0), amt: (v.amt || 0) - (v.ramt || 0), cur: cur, prev: prv }
    })
    .sort((a, b) => b.cur - a.cur || String(a.code).localeCompare(String(b.code)))
  const top = ranked.slice(0, 20)
  const bottom = ranked.length > 20 ? ranked.slice(-Math.min(20, ranked.length - 20)) : []
  _saRankData = { top: top, bottom: bottom, s: s, e: e, ps: ps, pe: pe, ranked: ranked }
  const delta = r => {
    if (!r.prev) return r.cur ? '<span class="sa-up">신규</span>' : '-'
    const pct = (r.cur - r.prev) / Math.abs(r.prev) * 100
    return `<span class="${pct >= 0 ? 'sa-up' : 'sa-down'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</span>`
  }
  // 🔴 rank = baseRankOf(i)로 이미 최종 순위 — 여기서 i 를 다시 더하면 2i+1(1,3,5…) 이중가산 버그(07-23 수정)
  const rowHtml = (r, rank) => `<tr class="sa-rank-row" onclick="_slOpenProduct('${esc(r.code)}')" title="클릭=상품 상세 · 품번 클릭=매출관리 매트릭스">
    <td class="sl-c sa-rank-no">${rank}</td>
    <td class="sa-thumb-cell">${_saThumb(r.code, prodMap)}</td>
    <td><a class="sl-code-link" onclick="event.stopPropagation();_slOpenMatrixForCode('${esc(r.code)}')" title="매출관리 전체 탭에서 보기">${esc(r.code)}</a></td>
    <td class="sa-name" title="${esc(r.name)}">${esc(r.name)}</td>
    <td class="sl-c">${_saFmt(r.q)}</td><td class="sl-c">${_saFmt(r.amt)}</td><td class="sl-c">${delta(r)}</td>
  </tr>`
  const tableHtml = (rows, baseRankOf) => `
    <table class="data-table inbhist-table sa-rank-table">
      <thead><tr><th class="sl-c" style="width:44px">순위</th><th style="width:52px">이미지</th><th style="width:130px">품번</th><th>상품명</th><th class="sl-c">순수량</th><th class="sl-c">순액</th><th class="sl-c">직전 대비</th></tr></thead>
      <tbody>${rows.length ? rows.map((r, i) => rowHtml(r, baseRankOf(i))).join('') : '<tr><td colspan="7" class="sl-hist-empty">해당 없음</td></tr>'}</tbody>
    </table>`
  const chanSel = `<select class="inbhist-store" onchange="_saSetChannel(this.value,'renderSaRanking')">${['all', 'gh', 'pt', 'sb'].map(k => `<option value="${k}"${_saChannel === k ? ' selected' : ''}>${SA_CH_LABEL[k]}</option>`).join('')}</select>` +
    (_saChannel === 'sb' ? `<select class="inbhist-store" onchange="_saSetMall(this.value,'renderSaRanking')"><option value="">몰 전체</option>${malls.map(m => `<option value="${esc(m)}"${_saMall === m ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select>` : '') +
    `<select class="inbhist-store" onchange="_saSetBasis(this.value)"><option value="qty"${_saBasis === 'qty' ? ' selected' : ''}>기준: 순수량</option><option value="amt"${_saBasis === 'amt' ? ' selected' : ''}>기준: 순액</option></select>`
  panel.innerHTML = _saControlsHtml('renderSaRanking', chanSel) + `
    <div class="sl-sum-basis">${esc(s)} ~ ${esc(e)} · 채널: <b>${SA_CH_LABEL[_saChannel]}${_saMall ? ' / ' + esc(_saMall) : ''}</b> · 기준: <b>${_saBasis === 'amt' ? '순액(매출−반품·배송 포함)' : '순수량(판매−반품)'}</b> · 기간 내 판매 발생(판매수량>0) 상품 ${_saFmt(ranked.length)}개 · 직전 동일기간=${esc(ps)}~${esc(pe)}${_saChannel === 'sb' && _saMall ? ' · ⚠️ 몰 필터=반품 미분리(판매 기준)' : ''} <button class="btn btn-outline btn-sm" onclick="downloadSaRanking()">📥 엑셀</button></div>
    <div class="sa-card"><div class="sa-card-title">🏆 TOP 20</div>${tableHtml(top, i => i + 1)}</div>
    <div class="sa-card"><div class="sa-card-title">🐢 판매 부진 — 하위 ${bottom.length}개 <span class="sa-muted">(판매 발생 상품 중 하위 · 0판매 상품 제외)</span></div>${tableHtml(bottom, i => ranked.length - bottom.length + 1 + i)}</div>`
}

function downloadSaRanking() {
  if (!_saRankData) { showToast('데이터 없음', 'warning'); return }
  const d = _saRankData
  const aoa = [['구분', '순위', '품번', '상품명', '순수량', '순액', '직전기간 값(' + (_saBasis === 'amt' ? '순액' : '순수량') + ')', '증감%'],
    ...d.top.map((r, i) => ['TOP', i + 1, r.code, r.name, r.q, r.amt, r.prev, r.prev ? Math.round((r.cur - r.prev) / Math.abs(r.prev) * 1000) / 10 : '']),
    ...d.bottom.map((r, i) => ['하위', d.ranked.length - d.bottom.length + 1 + i, r.code, r.name, r.q, r.amt, r.prev, r.prev ? Math.round((r.cur - r.prev) / Math.abs(r.prev) * 1000) / 10 : ''])]
  _slExcel(aoa, `매출분석_상품랭킹_${d.s}~${d.e}`)
}

// =============================================
// ===== Tab 3 — 📉 반품 분석 =====
// =============================================
async function renderSaReturns() {
  const panel = document.getElementById('saReturnsBody'); if (!panel) return
  await _saEnsurePeriod()
  panel.innerHTML = '<div class="sl-hist-loading">불러오는 중…</div>'
  const s = _saStart, e = _saEnd
  let data
  try { data = await _saLoadItems(s, e) }   // 랭킹과 세션 메모 공유(같은 기간=추가 read 0)
  catch (err) { panel.innerHTML = `<div class="sl-hist-empty">조회 실패: ${esc(err.message)}</div>`; return }
  if (document.getElementById('saReturnsBody') !== panel) return
  // 채널 요약 카드(공홈/파트너/사방넷) — 필터 무관 전 채널
  const chSum = { gh: { q: 0, rq: 0, ramt: 0 }, pt: { q: 0, rq: 0, ramt: 0 }, sb: { q: 0, rq: 0, ramt: 0 } }
  Object.keys(data.c24).forEach(c => { const sp = _slItemSplit(data.c24[c]); ['gh', 'pt'].forEach(k => { const it = sp[k] || {}; chSum[k].q += it.q || 0; chSum[k].rq += it.rq || 0; chSum[k].ramt += it.ramt || 0 }) })
  Object.keys(data.sb).forEach(c => { const it = data.sb[c]; chSum.sb.q += it.q || 0; chSum.sb.rq += it.rq || 0; chSum.sb.ramt += it.ramt || 0 })
  const rate = (rq, q) => q > 0 ? (rq / q * 100) : 0
  const sumCard = k => { const b = chSum[k]; return `<div class="sa-ret-card"><div class="sa-ret-ch" style="border-color:${SA_CH_COLOR[k]}">${SA_CH_LABEL[k]}</div><div class="sa-ret-rate">${rate(b.rq, b.q).toFixed(1)}%</div><div class="sa-ret-sub">판매 ${_saFmt(b.q)} · 반품 ${_saFmt(b.rq)}<br>반품액 ${_saFmt(b.ramt)}</div></div>` }
  // 품번별 표(채널 필터 적용) — 최소 판매수 필터(기본 10)
  const vals = _saChanVals(data, _saChannel, '')
  const nameMap = _slNameMap(), prodMap = _slProdMap()
  const rows = Object.keys(vals)
    .map(code => { const v = vals[code]; return { code: code, name: nameMap[code.toUpperCase()] || '', q: v.q || 0, rq: v.rq || 0, ramt: v.ramt || 0, rate: rate(v.rq || 0, v.q || 0) } })
    .filter(r => r.q >= _saMinSales && r.q > 0)
    .sort((a, b) => b.rate - a.rate || b.ramt - a.ramt || String(a.code).localeCompare(String(b.code)))
  _saRetData = { rows: rows, chan: _saChannel, s: s, e: e, chSum: chSum }
  const chanSel = `<select class="inbhist-store" onchange="_saSetChannel(this.value,'renderSaReturns')">${['all', 'gh', 'pt', 'sb'].map(k => `<option value="${k}"${_saChannel === k ? ' selected' : ''}>${SA_CH_LABEL[k]}</option>`).join('')}</select>` +
    `<label class="inbhist-ctl">최소 판매수 <input type="number" min="0" class="inbhist-date sa-min-input" value="${_saMinSales}" onchange="_saSetMinSales(this.value)"></label>`
  panel.innerHTML = _saControlsHtml('renderSaReturns', chanSel) + `
    <div class="sl-sum-basis">${esc(s)} ~ ${esc(e)} · 채널: <b>${SA_CH_LABEL[_saChannel]}</b> · 최소 판매수 ${_saMinSales} 이상 표시(소량 왜곡 방지) <button class="btn btn-outline btn-sm" onclick="downloadSaReturns()">📥 엑셀</button></div>
    <div class="sa-ret-cards">${sumCard('gh')}${sumCard('pt')}${sumCard('sb')}</div>
    <div class="sa-footnote">ℹ️ 반품률 = 기간 내 판매 대비 기간 내 반품(반품완료일 기준) — 근사치. 기간을 길게 잡을수록 정확합니다. (매장 POS 취소는 미포함)</div>
    <table class="data-table inbhist-table sa-ret-table">
      <thead><tr><th style="width:52px">이미지</th><th style="width:130px">품번</th><th>상품명</th><th class="sl-c">판매수량</th><th class="sl-c">반품수량</th><th class="sl-c">반품률%</th><th class="sl-c">반품금액</th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr class="sa-rank-row" onclick="_slOpenProduct('${esc(r.code)}')">
        <td class="sa-thumb-cell">${_saThumb(r.code, prodMap)}</td>
        <td><a class="sl-code-link" onclick="event.stopPropagation();_slOpenMatrixForCode('${esc(r.code)}')">${esc(r.code)}</a></td>
        <td class="sa-name" title="${esc(r.name)}">${esc(r.name)}</td>
        <td class="sl-c">${_saFmt(r.q)}</td><td class="sl-c">${_saFmt(r.rq)}</td>
        <td class="sl-c"><b class="${r.rate >= 20 ? 'sa-down' : ''}">${r.rate.toFixed(1)}%</b></td>
        <td class="sl-c">${_saFmt(r.ramt)}</td>
      </tr>`).join('') : `<tr><td colspan="7" class="sl-hist-empty">조건에 맞는 상품 없음 (최소 판매수 ${_saMinSales} 이상)</td></tr>`}</tbody>
    </table>`
}

function downloadSaReturns() {
  if (!_saRetData) { showToast('데이터 없음', 'warning'); return }
  const d = _saRetData
  const aoa = [['[채널 요약] ' + d.s + '~' + d.e, '판매수량', '반품수량', '반품률%', '반품금액']]
  ;['gh', 'pt', 'sb'].forEach(k => { const b = d.chSum[k]; aoa.push([SA_CH_LABEL[k], b.q, b.rq, b.q > 0 ? Math.round(b.rq / b.q * 1000) / 10 : 0, b.ramt]) })
  aoa.push([])
  aoa.push(['품번', '상품명', '판매수량', '반품수량', '반품률%', '반품금액'])
  d.rows.forEach(r => aoa.push([r.code, r.name, r.q, r.rq, Math.round(r.rate * 10) / 10, r.ramt]))
  _slExcel(aoa, `매출분석_반품_${d.s}~${d.e}`)
}

// ---- window 노출 ----
window.renderSalesAnalysisTab = renderSalesAnalysisTab
window.switchSalesAnalysisSub = switchSalesAnalysisSub
window.renderSaScorecard = renderSaScorecard
window.renderSaCompare = renderSaCompare
window.renderSaRanking = renderSaRanking
window.renderSaReturns = renderSaReturns
window.downloadSaScorecard = downloadSaScorecard
window._saDimRows = _saDimRows
window._saPreset = _saPreset
window._saSetDates = _saSetDates
window._saSetChannel = _saSetChannel
window._saSetMall = _saSetMall
window._saSetBasis = _saSetBasis
window._saSetMinSales = _saSetMinSales
window._saRefresh = _saRefresh
window.downloadSaCompare = downloadSaCompare
window.downloadSaRanking = downloadSaRanking
window.downloadSaReturns = downloadSaReturns
// 순수 로직(테스트 재사용)
window._saChanVals = _saChanVals
window._saPrevRange = _saPrevRange
window._saNetOf = _saNetOf
