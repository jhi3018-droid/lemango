/* ===================================================
   르망고 관리 시스템 - app.js
   =================================================== */

// =============================================
// ===== 설정 관리 =====
// =============================================
const SETTINGS_KEY = 'lemango_settings_v1'

const DEFAULT_SETTINGS = {
  brands:         ['르망고', '르망고 느와'],
  types:          [['onepiece','원피스'],['bikini','비키니'],['two piece','투피스']],
  saleStatuses:   ['판매중', '종료', '추가생산'],
  legCuts:        [['normal cut','노멀컷'],['middle cut','미들컷'],['high cut','하이컷'],['low cut','로우컷']],
  fabricTypes:    ['포일', '일반'],
  chestLines:     ['낮음', '보통', '높음'],
  transparencies: ['없음', '약간있음'],
  linings:        ['없음', '있음'],
  capRings:       ['없음', '있음'],
}

const SETTING_DEFS = [
  // group: 'design'
  { key: 'types',          title: '상품 타입', group: 'design', type: 'pair',   ph1: '코드 (예: onepiece)', ph2: '표시명 (예: 원피스)' },
  { key: 'legCuts',        title: '다리파임',  group: 'design', type: 'pair',   ph1: '코드 (예: high cut)', ph2: '표시명 (예: 하이컷)' },
  { key: 'fabricTypes',    title: '원단타입',  group: 'design', type: 'simple', ph: '타입명 (예: 포일)' },
  { key: 'chestLines',     title: '가슴선',    group: 'design', type: 'simple', ph: '옵션명 (예: 낮음)' },
  { key: 'transparencies', title: '비침',      group: 'design', type: 'simple', ph: '옵션명 (예: 없음)' },
  { key: 'linings',        title: '안감',      group: 'design', type: 'simple', ph: '옵션명 (예: 없음)' },
  { key: 'capRings',       title: '캡고리',    group: 'design', type: 'simple', ph: '옵션명 (예: 없음)' },
  // group: 'info'
  { key: 'brands',         title: '브랜드',    group: 'info',   type: 'simple', ph: '브랜드명 (예: 르망고)' },
  { key: 'saleStatuses',   title: '판매상태',  group: 'info',   type: 'simple', ph: '상태명 (예: 판매중)' },
]

// =============================================
// ===== 판매 채널(플랫폼) 관리 =====
// =============================================
const DEFAULT_PLATFORMS = ['공홈', 'GS', '29cm', 'W쇼핑', '기타']

let _platforms = (() => {
  try {
    const saved = localStorage.getItem('lemango_platforms_v1')
    return saved ? JSON.parse(saved) : [...DEFAULT_PLATFORMS]
  } catch { return [...DEFAULT_PLATFORMS] }
})()

function savePlatforms() {
  localStorage.setItem('lemango_platforms_v1', JSON.stringify(_platforms))
}

let _settings = (() => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (!saved) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    const parsed = JSON.parse(saved)
    // 누락된 키는 DEFAULT로 채움
    return Object.fromEntries(
      Object.keys(DEFAULT_SETTINGS).map(k => [k, parsed[k] ?? JSON.parse(JSON.stringify(DEFAULT_SETTINGS[k]))])
    )
  } catch { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) }
})()

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(_settings))
}

// select 요소 하나를 채우는 유틸
function populateSelect(id, items, withAll = false, withBlank = false) {
  const el = document.getElementById(id)
  if (!el) return
  const current = el.value
  let html = ''
  if (withAll)   html += '<option value="all">전체</option>'
  if (withBlank) html += '<option value="">선택</option>'
  html += items.map(item => {
    const [val, label] = Array.isArray(item) ? item : [item, item]
    return `<option value="${val}">${label}</option>`
  }).join('')
  el.innerHTML = html
  // 이전 값 유지 시도
  if ([...el.options].some(o => o.value === current)) el.value = current
}

// 모든 managed select 갱신
function populateAllSelects() {
  const s = _settings
  // 상품조회 검색
  populateSelect('pBrand',       s.brands,         true)
  populateSelect('pLegCut',      s.legCuts,         true)
  populateSelect('pSaleStatus',  s.saleStatuses,    true)
  // 신규기획 검색
  populateSelect('npBrand',      s.brands,          true)
  populateSelect('npType',       s.types,           true)
  // 신규등록 모달 폼
  populateSelect('rBrand',       s.brands)
  populateSelect('rType',        s.types)
  populateSelect('rLegCut',      s.legCuts,         false, true)
  populateSelect('rFabricType',  s.fabricTypes,     false, true)
  populateSelect('rChestLine',   s.chestLines,      false, true)
  populateSelect('rTransparency',s.transparencies,  false, true)
  populateSelect('rLining',      s.linings,         false, true)
  populateSelect('rCapRing',     s.capRings,        false, true)
  // 신규기획 모달 폼
  populateSelect('plBrand',      s.brands)
  populateSelect('plType',       s.types,           false, true)
  // 판매조회 플랫폼 필터
  populateSelect('slPlatform',   _platforms,        true)
}

// ===== 전역 상태 =====
const State = {
  allProducts: [],
  planItems:   [],
  product: { filtered: [], sort: { key: 'no', dir: 'asc' } },
  stock:   { filtered: [], sort: { key: 'no', dir: 'asc' } },
  sales:   { filtered: [], sort: { key: 'totalSales', dir: 'desc' } },
  plan:    { filtered: [], sort: { key: 'no', dir: 'asc' } },
  modal:   { images: [], idx: 0 }
}

// ===== 초기화 =====
async function init() {
  renderDate()
  bindTabs()
  initDraggable()
  initRegisterDraggable()
  initPlanRegisterDraggable()
  initPlanDetailDraggable()
  makeDraggableResizable(document.getElementById('stockRegisterModal'))
  makeDraggableResizable(document.getElementById('outgoingModal'))
  makeDraggableResizable(document.getElementById('gonghomPreviewModal'))
  try {
    const [lem, noir] = await Promise.all([
      fetch('data/products_lemango.json').then(r => r.json()),
      fetch('data/products_noir.json').then(r => r.json())
    ])
    State.allProducts = [...lem, ...noir]
    State.product.filtered = [...State.allProducts]
    State.stock.filtered   = [...State.allProducts]
    State.sales.filtered   = [...State.allProducts]
    // 샘플 기획 데이터
    State.planItems.push({
      no: 1,
      sampleNo: '26SS0201',
      productCode: '',
      brand: '르망고',
      nameKr: '아말피 홀터넥',
      nameEn: 'Amalfi Halterneck',
      colorKr: '코랄 핑크',
      colorEn: 'Coral Pink',
      salePrice: 168000,
      costPrice: 58000,
      type: 'onepiece',
      year: '2026',
      season: '2',
      gender: 'W',
      memo: '26SS2 시즌 원피스 신규 기획. 홀터넥 + 오픈백 구조. 포일 원단 검토 중.',
      images: {
        sum: ['https://images.unsplash.com/photo-1604871000636-074fa5117945?w=400'],
        lemango: '',
        noir: ''
      },
      schedule: {
        design:     { start: '2026-02-01', end: '2026-02-20' },
        production: { start: '2026-02-21', end: '2026-03-25' },
        image:      { start: '2026-03-26', end: '2026-04-05' },
        register:   { start: '2026-04-06', end: '2026-04-10' },
        logistics:  { start: '2026-04-11', end: '2026-04-20' }
      }
    })
    State.plan.filtered    = State.planItems.filter(p => !p.confirmed)
    populateAllSelects()
    renderDashboard()
    renderProductTable()
    renderStockTable()
    renderSalesTable()
    renderPlanTable()
  } catch (e) {
    showToast('데이터 로드 실패: ' + e.message, 'error')
    console.error(e)
  }
  // Enter 키 검색
  ['pKeyword','sKeyword','slKeyword','npKeyword'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') el.closest('.tab-content')?.querySelector('.btn-primary')?.click() })
  })
}

// ===== 다중 검색 키워드 파싱 =====
// 쉼표 또는 줄바꿈으로 구분, 최대 200개, 빈값 제거
function parseKeywords(raw) {
  return raw
    .split(/[\n\r,]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 200)
}

// 엑셀에서 세로로 복사한 내용 붙여넣기 처리
function handleSearchPaste(e, inputId) {
  const text = (e.clipboardData || window.clipboardData).getData('text')
  if (!text.includes('\n') && !text.includes('\r')) return // 단일행이면 기본 동작
  e.preventDefault()
  const tokens = parseKeywords(text)
  document.getElementById(inputId).value = tokens.join(', ')
}

// ===== 날짜 표시 =====
function renderDate() {
  const days = ['일','월','화','수','목','금','토']
  const d = new Date()
  document.getElementById('headerDate').textContent =
    `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

// ===== 탭 전환 =====
function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  })
}
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab))
  if (tab === 'settings') renderSettings()
}

// ===== 유틸 =====
const fmtPrice = n => n ? n.toLocaleString('ko-KR') + '원' : '-'
const fmtNum   = n => (n === undefined || n === null) ? '-' : n.toLocaleString('ko-KR')
const getTotalStock = p => Object.values(p.stock || {}).reduce((a,b) => a+b, 0)
const getTotalSales = p => Object.values(p.sales || {}).reduce((a,b) => a+b, 0)
const getExhaustion = p => {
  const st = getTotalStock(p), sl = getTotalSales(p)
  return st > 0 ? Math.round(sl / st * 100) : 0
}

function getThumbUrl(p) {
  if (p.images?.sum?.length)     return p.images.sum[0]       // 업로드된 SUM URL 우선
  if (p.images?.lemango?.length) return p.images.lemango[0]
  if (p.images?.noir?.length)    return p.images.noir[0]
  if (p.images?.design)          return p.images.design
  if (p.images?.shoot)           return p.images.shoot
  return null
}
function getAllImages(p) {
  const imgs = []
  if (p.images?.sum)      imgs.push(...p.images.sum)
  if (p.images?.lemango)  imgs.push(...p.images.lemango)
  if (p.images?.noir)     imgs.push(...p.images.noir)
  if (p.images?.external) imgs.push(...p.images.external)
  if (p.images?.design)   imgs.push(p.images.design)
  if (p.images?.shoot)    imgs.push(p.images.shoot)
  return [...new Set(imgs.filter(Boolean))]  // 중복 제거
}

function renderThumb(p) {
  const url = getThumbUrl(p)
  if (!url) return `<div class="no-image">없음</div>`
  const all = getAllImages(p)
  const allJson = JSON.stringify(all).replace(/"/g, '&quot;')
  return `<img src="${url}" class="thumb" loading="lazy"
    onerror="this.style.display='none'"
    onclick='openModal(0, ${allJson})' />`
}

function progressBar(pct) {
  const color = pct >= 80 ? 'var(--danger)' : pct >= 50 ? 'var(--warning)' : 'var(--success)'
  return `<div class="progress-wrap">
    <div class="progress-bg"><div class="progress-bar" style="width:${Math.min(pct,100)}%;background:${color}"></div></div>
    <span style="color:${color}">${pct}%</span>
  </div>`
}

function stockCell(n) {
  const cls = n === 0 ? 'stock-zero' : n < 5 ? 'stock-low' : 'stock-ok'
  return `<span class="${cls}">${n}</span>`
}

function typeBadge(type) {
  const t = (type || '').toLowerCase()
  return `<span class="badge badge-${t.replace(' ','-')}">${type || '-'}</span>`
}

function isInRange(dateStr, from, to) {
  if (!dateStr) return !from && !to
  const d = new Date(dateStr)
  if (from && d < new Date(from)) return false
  if (to   && d > new Date(to + 'T23:59:59')) return false
  return true
}

// ===== 정렬 =====
function sortData(arr, key, dir) {
  return [...arr].sort((a, b) => {
    let va = key.includes('.') ? key.split('.').reduce((o,k) => o?.[k], a) : a[key]
    let vb = key.includes('.') ? key.split('.').reduce((o,k) => o?.[k], b) : b[key]
    if (va === null || va === undefined) return 1
    if (vb === null || vb === undefined) return -1
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ko')
    return dir === 'asc' ? cmp : -cmp
  })
}

function bindSortHeader(tableId, stateKey, renderFn) {
  document.querySelectorAll(`#${tableId} thead th.sortable`).forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key
      const cur = State[stateKey].sort
      const dir = cur.key === key && cur.dir === 'asc' ? 'desc' : 'asc'
      State[stateKey].sort = { key, dir }
      State[stateKey].filtered = sortData(State[stateKey].filtered, key, dir)
      renderFn()
    })
  })
}

function updateSortIcons(tableId, sort) {
  document.querySelectorAll(`#${tableId} thead th`).forEach(th => {
    th.classList.remove('sort-asc','sort-desc')
    const icon = th.querySelector('.sort-icon')
    if (icon) icon.textContent = '⇅'
    if (th.dataset.key === sort.key) {
      th.classList.add(sort.dir === 'asc' ? 'sort-asc' : 'sort-desc')
      if (icon) icon.textContent = sort.dir === 'asc' ? '↑' : '↓'
    }
  })
}

// =============================================
// ===== 대시보드 =====
// =============================================
function renderDashboard() {
  renderKPI()
  renderBestList()
  renderSalesSummary()
  renderMiniChart()
}

function renderKPI() {
  const all = State.allProducts
  const totalStock = all.reduce((s,p) => s + getTotalStock(p), 0)
  const totalSales = all.reduce((s,p) => s + getTotalSales(p), 0)
  const avgEx = totalStock > 0 ? Math.round(totalSales / totalStock * 100) : 0
  document.getElementById('kpiRow').innerHTML = [
    { icon: '👗', label: '전체 상품', value: `${all.length}개` },
    { icon: '📦', label: '총 입고수량', value: `${totalStock.toLocaleString()}개` },
    { icon: '🛍️', label: '총 판매수량', value: `${totalSales.toLocaleString()}개` },
    { icon: '📊', label: '평균 소진율', value: `${avgEx}%` }
  ].map(c => `
    <div class="kpi-card">
      <span class="kpi-icon">${c.icon}</span>
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value">${c.value}</div>
    </div>`).join('')
}

function renderBestList() {
  const top10 = [...State.allProducts]
    .sort((a,b) => getTotalSales(b) - getTotalSales(a))
    .slice(0,10)

  document.getElementById('bestList').innerHTML = top10.map((p,i) => {
    const thumb = getThumbUrl(p)
    const rankClass = i < 3 ? `rank-${i+1}` : ''
    return `<div class="best-item" onclick="goToSales('${p.productCode}')">
      <span class="rank ${rankClass}">${i+1}</span>
      ${thumb
        ? `<img src="${thumb}" class="best-thumb" onerror="this.style.display='none'" />`
        : `<div class="best-thumb" style="background:var(--border-light);border-radius:3px;border:1px solid var(--border)"></div>`
      }
      <div class="best-info">
        <span class="best-brand">${p.brand}</span>
        <span class="best-code">${p.productCode}</span>
        <span class="best-name">${p.nameKr}</span>
      </div>
      <span class="best-sales">${getTotalSales(p).toLocaleString()}개</span>
    </div>`
  }).join('')
}

function goToSales(code) {
  switchTab('sales')
  document.getElementById('slKeyword').value = code
  searchSales()
}

function renderSalesSummary() {
  const all = State.allProducts
  const brands = [
    { name: '르망고',    items: all.filter(p => p.brand === '르망고') },
    { name: '르망고 느와', items: all.filter(p => p.brand === '르망고 느와') },
    { name: '전체',      items: all }
  ]
  // 더미 전월 데이터 (당월의 80~120%)
  const rows = brands.map(b => {
    const curr = b.items.reduce((s,p) => s + getTotalSales(p) * (p.salePrice || 0), 0)
    const prev = Math.round(curr * (0.8 + Math.random() * 0.4))
    const diff = curr - prev
    return { name: b.name, prev, curr, diff }
  })
  document.getElementById('salesSummary').innerHTML = `
    <table class="summary-table">
      <thead><tr><th></th><th>전월</th><th>당월</th><th>증감</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td>${r.name}</td>
          <td>${(r.prev/10000).toFixed(0)}만원</td>
          <td>${(r.curr/10000).toFixed(0)}만원</td>
          <td class="${r.diff >= 0 ? 'positive' : 'negative'}">${r.diff >= 0 ? '+' : ''}${(r.diff/10000).toFixed(0)}만원</td>
        </tr>`).join('')}
      </tbody>
    </table>`
}

function renderMiniChart() {
  const canvas = document.getElementById('salesChart')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const platforms = _platforms
  const totals = platforms.map(pl =>
    State.allProducts.reduce((s,p) => s + (p.sales?.[pl] || 0), 0)
  )
  const max = Math.max(...totals) || 1
  const w = canvas.width, h = canvas.height
  const barW = 44, gap = (w - platforms.length * barW) / (platforms.length + 1)
  const CHART_COLORS = ['#1a1a2e','#c9a96e','#4caf7d','#f0a500','#e05252','#7b68ee','#20b2aa','#ff7f50','#9370db','#3cb371']
  const colors = _platforms.map((_, i) => CHART_COLORS[i % CHART_COLORS.length])
  ctx.clearRect(0, 0, w, h)
  // 배경 격자
  ctx.strokeStyle = '#eeebe5'; ctx.lineWidth = 1
  for (let i = 1; i <= 4; i++) {
    const y = h - 28 - (h - 40) * i / 4
    ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(w - 8, y); ctx.stroke()
  }
  platforms.forEach((pl, i) => {
    const x = gap + i * (barW + gap)
    const barH = Math.round((totals[i] / max) * (h - 48))
    const y = h - 28 - barH
    ctx.fillStyle = colors[i]
    ctx.beginPath()
    ctx.roundRect(x, y, barW, barH, [3,3,0,0])
    ctx.fill()
    // 레이블
    ctx.fillStyle = '#6b6b6b'; ctx.font = '11px Inter'
    ctx.textAlign = 'center'
    ctx.fillText(pl, x + barW/2, h - 10)
    // 값
    ctx.fillStyle = colors[i]; ctx.font = 'bold 11px Inter'
    ctx.fillText(totals[i], x + barW/2, y - 4)
  })
}

// =============================================
// ===== 상품조회 =====
// =============================================
// 품번 13자리에서 성별 코드(char 2) 추출
function _codeGender(code) {
  return (code && code.length === 13) ? code[2] : null
}
// 품번 13자리에서 타입 코드(chars 3-4) 추출
function _codeType(code) {
  return (code && code.length === 13) ? code.slice(3, 5) : null
}
// p.type(onepiece/bikini/two piece) → pcType 코드 집합으로 매핑 (품번 없을 때 fallback)
const _TYPE_FALLBACK = {
  ON: ['onepiece'], MO: ['onepiece'],
  BK: ['bikini'],   BR: ['bikini'],
  JM: ['two piece'], RG: ['two piece'], AL: ['two piece'],
}

function searchProduct() {
  const raw      = document.getElementById('pKeyword').value
  const keywords = parseKeywords(raw)
  const field    = document.getElementById('pSearchField').value
  const dateType = document.getElementById('pDateType').value
  const dateFrom = document.getElementById('pDateFrom').value
  const dateTo   = document.getElementById('pDateTo').value
  const brand    = document.getElementById('pBrand').value
  const gender   = document.getElementById('pGender').value
  const type     = document.getElementById('pType').value
  const legCut   = document.getElementById('pLegCut').value

  let result = State.allProducts.filter(p => {
    if (keywords.length) {
      const getTargets = () => {
        if (field === 'nameKr')      return [p.nameKr, p.nameEn]
        if (field === 'productCode') return [p.productCode, p.sampleNo]
        if (field === 'backStyle')   return [p.backStyle]
        if (field === 'barcode')     return [p.barcode]
        return [p.nameKr, p.nameEn, p.productCode, p.sampleNo, p.colorKr, p.backStyle, p.barcode]
      }
      const targets = getTargets()
      if (!keywords.some(kw => targets.some(t => (t||'').toLowerCase().includes(kw)))) return false
    }
    if (dateFrom || dateTo) {
      if (!isInRange(p[dateType], dateFrom, dateTo)) return false
    }
    if (brand !== 'all' && p.brand !== brand) return false

    // 성별 필터 — 품번 3번째 자리에서 추출
    if (gender !== 'all') {
      const g = _codeGender(p.productCode)
      if (!g || g !== gender) return false
    }

    // 타입 필터 — 품번 4-5번째 자리 우선, p.type fallback
    if (type !== 'all') {
      const t = _codeType(p.productCode)
      if (t) {
        if (t !== type) return false
      } else {
        // 품번이 없거나 형식 미일치 → p.type으로 fallback
        const fallbackTypes = _TYPE_FALLBACK[type] || []
        if (!fallbackTypes.includes((p.type||'').toLowerCase())) return false
      }
    }

    if (legCut !== 'all' && (p.legCut || '') !== legCut) return false

    const saleStatus = document.getElementById('pSaleStatus').value
    if (saleStatus !== 'all' && (p.saleStatus || '판매중') !== saleStatus) return false

    return true
  })
  State.product.filtered = sortData(result, State.product.sort.key, State.product.sort.dir)
  renderProductTable()
}

function resetProduct() {
  ['pKeyword','pDateFrom','pDateTo'].forEach(id => document.getElementById(id).value = '')
  document.getElementById('pSearchField').value = 'all'
  document.getElementById('pDateType').value = 'registDate'
  document.getElementById('pBrand').value = 'all'
  document.getElementById('pGender').value = 'all'
  document.getElementById('pType').value = 'all'
  document.getElementById('pLegCut').value = 'all'
  document.getElementById('pSaleStatus').value = 'all'
  State.product.filtered = [...State.allProducts]
  renderProductTable()
}

function renderProductTable() {
  const data = State.product.filtered
  const sort = State.product.sort
  document.getElementById('pTableMeta').textContent = `검색결과 ${data.length}건`

  if (!data.length) {
    document.getElementById('pTableWrap').innerHTML = `<div class="empty-state"><p>검색 결과가 없습니다.</p></div>`
    return
  }

  const totStock = data.reduce((s,p) => s + getTotalStock(p), 0)
  const totSales = data.reduce((s,p) => s + getTotalSales(p), 0)

  document.getElementById('pTableWrap').innerHTML = `
    <table class="data-table" id="productTable">
      <thead><tr>
        <th class="sortable" data-key="no">No.<span class="sort-icon">⇅</span></th>
        <th>이미지</th>
        <th class="sortable" data-key="brand">브랜드<span class="sort-icon">⇅</span></th>
        <th class="sortable" data-key="productCode">품번<span class="sort-icon">⇅</span></th>
        <th>바코드</th>
        <th class="sortable" data-key="nameKr">상품명<span class="sort-icon">⇅</span></th>
        <th>색상</th>
        <th class="sortable" data-key="salePrice" style="text-align:right">판매가<span class="sort-icon">⇅</span></th>
        <th class="sortable" data-key="costPrice" style="text-align:right">원가<span class="sort-icon">⇅</span></th>
        <th>타입</th>
        <th>백스타일</th>
        <th>레그컷</th>
        <th>제조년월</th>
        <th>제조국</th>
        <th class="sortable" data-key="totalStock" style="text-align:right">입고수량<span class="sort-icon">⇅</span></th>
        <th class="sortable" data-key="totalSales" style="text-align:right">판매수량<span class="sort-icon">⇅</span></th>
        <th>소진율</th>
      </tr></thead>
      <tbody>${data.map(p => {
        const st = getTotalStock(p), sl = getTotalSales(p), ex = getExhaustion(p)
        return `<tr>
          <td style="text-align:center">${p.no}</td>
          <td>${renderThumb(p)}</td>
          <td><span style="font-size:12px">${p.brand}</span></td>
          <td><span class="code-link" onclick="openDetailModal('${p.productCode}')">${p.productCode}</span></td>
          <td style="font-size:12px;font-family:Inter">${p.barcode || '-'}</td>
          <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis" title="${p.nameKr}">${p.nameKr}</td>
          <td>${p.colorKr || '-'}</td>
          <td style="text-align:right"><span class="price">${fmtPrice(p.salePrice)}</span></td>
          <td style="text-align:right"><span class="price">${fmtPrice(p.costPrice)}</span></td>
          <td>${typeBadge(p.type)}</td>
          <td style="font-size:12px;max-width:120px;overflow:hidden;text-overflow:ellipsis">${p.backStyle || '-'}</td>
          <td style="font-size:12px">${p.legCut || '-'}</td>
          <td style="font-size:12px">${p.madeMonth || '-'}</td>
          <td>${p.madeIn || '-'}</td>
          <td style="text-align:right;font-family:Inter">${fmtNum(st)}</td>
          <td style="text-align:right;font-family:Inter">${fmtNum(sl)}</td>
          <td>${progressBar(ex)}</td>
        </tr>`
      }).join('')}</tbody>
      <tfoot><tr>
        <td colspan="14" style="text-align:right">합계</td>
        <td style="text-align:right;font-family:Inter">${totStock.toLocaleString()}</td>
        <td style="text-align:right;font-family:Inter">${totSales.toLocaleString()}</td>
        <td></td>
      </tr></tfoot>
    </table>`

  bindSortHeader('productTable', 'product', renderProductTable)
  updateSortIcons('productTable', sort)
}

// =============================================
// ===== 재고조회 =====
// =============================================
function searchStock() {
  const keywords = parseKeywords(document.getElementById('sKeyword').value)
  const dateFrom = document.getElementById('sDateFrom').value
  const dateTo   = document.getElementById('sDateTo').value
  const status   = document.getElementById('sStockStatus').value

  let result = State.allProducts.filter(p => {
    if (keywords.length) {
      const targets = [p.productCode, p.nameKr]
      if (!keywords.some(kw => targets.some(t => (t||'').toLowerCase().includes(kw)))) return false
    }
    if (dateFrom || dateTo) {
      if (!isInRange(p.registDate, dateFrom, dateTo)) return false
    }
    if (status === 'instock' && getTotalStock(p) === 0) return false
    if (status === 'soldout' && getTotalStock(p)  >  0) return false
    return true
  })
  State.stock.filtered = sortData(result, State.stock.sort.key, State.stock.sort.dir)
  renderStockTable()
}

// ===== 재고 입력 패널 =====
function findStockProduct() {
  const keyword = document.getElementById('sipKeyword').value.trim()
  if (!keyword) { showToast('품번을 입력하세요.', 'warning'); return }

  const p = State.allProducts.find(x =>
    (x.productCode||'').toLowerCase() === keyword.toLowerCase() ||
    (x.productCode||'').toLowerCase().includes(keyword.toLowerCase())
  )

  const body = document.getElementById('sipBody')
  if (!p) {
    body.innerHTML = `<div class="sip-empty sip-notfound">품번 <b>${keyword}</b>을(를) 찾을 수 없습니다.</div>`
    return
  }

  const sizes = ['XS','S','M','L','XL']
  body.innerHTML = `
    <div class="sip-product-info">
      <span class="sip-brand">${p.brand}</span>
      <span class="sip-code">${p.productCode}</span>
      <span class="sip-name">${p.nameKr}</span>
    </div>
    <div class="sip-sizes">
      ${sizes.map(sz => `
        <div class="sip-size-item">
          <label class="sip-size-label">${sz}</label>
          <input type="number" class="sip-size-input" id="sipStock_${sz}"
            value="${p.stock?.[sz] || 0}" min="0"
            onkeydown="if(event.key==='Enter') saveStockInput('${p.productCode}')" />
        </div>
      `).join('')}
      <div class="sip-size-item sip-total-item">
        <label class="sip-size-label">합계</label>
        <span class="sip-total-num" id="sipTotal">${getTotalStock(p)}</span>
      </div>
    </div>
    <div class="sip-actions">
      <button class="btn btn-primary" onclick="saveStockInput('${p.productCode}')">저장</button>
      <button class="btn btn-outline" onclick="clearSipPanel()">닫기</button>
    </div>
  `

  // 입력값 변경 시 합계 실시간 업데이트
  sizes.forEach(sz => {
    document.getElementById(`sipStock_${sz}`).addEventListener('input', () => {
      const total = sizes.reduce((s, s2) => s + (parseInt(document.getElementById(`sipStock_${s2}`).value) || 0), 0)
      document.getElementById('sipTotal').textContent = total
    })
  })
}

function saveStockInput(productCode) {
  const p = State.allProducts.find(x => x.productCode === productCode)
  if (!p) return
  const sizes = ['XS','S','M','L','XL']
  sizes.forEach(sz => {
    p.stock[sz] = parseInt(document.getElementById(`sipStock_${sz}`).value) || 0
  })
  State.stock.filtered = State.stock.filtered.map(x => x.productCode === productCode ? p : x)
  renderStockTable()
  showToast(`${p.nameKr} 재고가 저장됐습니다.`, 'success')
}

function clearSipPanel() {
  document.getElementById('sipKeyword').value = ''
  document.getElementById('sipBody').innerHTML = '<div class="sip-empty">품번을 입력하여 재고를 수정하세요</div>'
}

// ===== 재고 등록 모달 =====
let _stockUploadData = null

function openStockRegisterModal() {
  document.getElementById('srmKeyword').value = ''
  document.getElementById('srmProductArea').innerHTML = '<div class="srm-empty">품번을 입력하세요</div>'
  document.getElementById('srmPreviewSection').style.display = 'none'
  document.getElementById('srmConfirmBtn').style.display = 'none'
  _stockUploadData = null
  const modal = document.getElementById('stockRegisterModal')
  centerModal(modal)
  modal.showModal()
  centerModal(modal)
}

function findSrmProduct() {
  const keyword = document.getElementById('srmKeyword').value.trim()
  if (!keyword) return
  const p = State.allProducts.find(x =>
    (x.productCode||'').toLowerCase() === keyword.toLowerCase() ||
    (x.productCode||'').toLowerCase().includes(keyword.toLowerCase())
  )
  const area = document.getElementById('srmProductArea')
  if (!p) {
    area.innerHTML = `<div class="srm-empty srm-notfound">품번 <b>${keyword}</b>을(를) 찾을 수 없습니다.</div>`
    return
  }
  area.innerHTML = buildSrmProductArea(p)
}

function buildSrmProductArea(p) {
  const sizes = ['XS','S','M','L','XL']

  // 입고 이력 섹션 (날짜 역순)
  const logs = (p.stockLog || []).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''))
  const logHtml = logs.length ? `
    <div class="srm-log-section">
      <div class="srm-log-title">입고 이력</div>
      <table class="srm-log-table">
        <thead>
          <tr>
            <th>입고일</th>
            ${sizes.map(sz => `<th>${sz}</th>`).join('')}
            <th>합계</th>
            <th>메모</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(log => {
            const rowTotal = sizes.reduce((s, sz) => s + (log[sz]||0), 0)
            return `<tr>
              <td>${log.date||'-'}</td>
              ${sizes.map(sz => `<td class="${(log[sz]||0)>0?'srm-log-qty':''}">${log[sz]||0}</td>`).join('')}
              <td class="srm-log-total">${rowTotal}</td>
              <td class="srm-log-memo">${log.memo||''}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>` : ''

  return `
    <div class="sip-product-info" style="margin:12px 0 10px">
      <span class="sip-brand">${p.brand}</span>
      <span class="sip-code">${p.productCode}</span>
      <span class="sip-name">${p.nameKr}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:12px">
      <thead>
        <tr style="background:var(--table-header)">
          <th style="padding:5px 8px;text-align:left;border:1px solid var(--border)">사이즈</th>
          <th style="padding:5px 8px;text-align:left;border:1px solid var(--border)">바코드</th>
          <th style="padding:5px 8px;text-align:right;border:1px solid var(--border)">현재재고</th>
          <th style="padding:5px 8px;text-align:center;border:1px solid var(--border)">추가입고수량</th>
        </tr>
      </thead>
      <tbody>
        ${sizes.map(sz => `
          <tr>
            <td style="padding:5px 8px;border:1px solid var(--border);font-weight:600">${sz}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);font-family:Inter;color:var(--text-sub)">${p.barcodes?.[sz] || p.barcode || '-'}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);text-align:right">${p.stock?.[sz]||0}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);text-align:center">
              <input type="number" class="sip-size-input" id="srmStock_${sz}"
                value="0" min="0" style="width:70px;text-align:center"
                oninput="updateSrmTotal()" />
            </td>
          </tr>`).join('')}
        <tr style="background:var(--table-header);font-weight:700">
          <td colspan="3" style="padding:5px 8px;border:1px solid var(--border);text-align:right">입고 합계</td>
          <td style="padding:5px 8px;border:1px solid var(--border);text-align:center" id="srmTotal">0</td>
        </tr>
      </tbody>
    </table>
    <div style="display:flex;gap:8px;align-items:center;margin:8px 0 0">
      <label style="font-size:12px;white-space:nowrap">입고일</label>
      <input type="date" id="srmDate" value="${new Date().toISOString().slice(0,10)}" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px" />
      <label style="font-size:12px;white-space:nowrap">메모</label>
      <input type="text" id="srmMemo" placeholder="메모 (선택)" style="flex:2;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px" />
    </div>
    <div class="sip-actions">
      <button class="btn btn-primary" onclick="saveSrmStock('${p.productCode}')">입고 저장</button>
    </div>
    ${logHtml}
  `
}

function updateSrmTotal() {
  const sizes = ['XS','S','M','L','XL']
  const total = sizes.reduce((s, sz) => s + (parseInt(document.getElementById(`srmStock_${sz}`)?.value)||0), 0)
  document.getElementById('srmTotal').textContent = total
}

function saveSrmStock(productCode) {
  const p = State.allProducts.find(x => x.productCode === productCode)
  if (!p) return
  const sizes = ['XS','S','M','L','XL']
  const inQty = {}
  sizes.forEach(sz => { inQty[sz] = parseInt(document.getElementById(`srmStock_${sz}`)?.value)||0 })
  const total = Object.values(inQty).reduce((a,b) => a+b, 0)
  if (total === 0) { showToast('입고 수량을 입력해주세요.', 'warning'); return }

  // 누적 추가
  if (!p.stock) p.stock = { XS:0, S:0, M:0, L:0, XL:0 }
  sizes.forEach(sz => { p.stock[sz] = (p.stock[sz]||0) + inQty[sz] })

  // 입고 이력 저장
  if (!p.stockLog) p.stockLog = []
  p.stockLog.push({
    type: 'in',
    date: document.getElementById('srmDate')?.value || new Date().toISOString().slice(0,10),
    memo: document.getElementById('srmMemo')?.value.trim() || '',
    ...inQty,
    registeredAt: new Date().toISOString()
  })

  State.stock.filtered = State.stock.filtered.map(x => x.productCode === productCode ? p : x)
  renderStockTable()
  showToast(`${p.nameKr} 입고 ${total}개 저장 완료`, 'success')
  // 저장 후 동일 상품 다시 렌더 (현재 재고 + 입고 이력 포함)
  document.getElementById('srmProductArea').innerHTML = buildSrmProductArea(p)
}

// Excel 날짜 변환 (시리얼 숫자 또는 문자열 → YYYY-MM-DD)
function parseExcelDate(val) {
  if (!val) return new Date().toISOString().slice(0,10)
  if (val instanceof Date) return val.toISOString().slice(0,10)
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000)
    return d.toISOString().slice(0,10)
  }
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10)
  return s
}

function handleStockRegisterUpload(input) {
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const wb  = XLSX.read(e.target.result, { type: 'array', cellDates: true })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      // 1행 헤더: 입고일(0) 품번(1) 사이즈(2) 바코드(3) 수량(4) 메모(5)
      const dataRows = raw.slice(1).filter(r => String(r[1]||'').trim())
      if (!dataRows.length) { showToast('데이터가 없습니다.', 'error'); return }

      _stockUploadData = dataRows.map((row, idx) => {
        const code    = String(row[1]||'').trim()
        const p       = State.allProducts.find(x => x.productCode === code)
        return {
          rowNum:  idx + 2,
          date:    parseExcelDate(row[0]),
          code,
          size:    String(row[2]||'').trim().toUpperCase(),
          barcode: String(row[3]||'').trim(),
          qty:     parseInt(row[4]) || 0,
          memo:    String(row[5]||'').trim(),
          found:   !!p,
          nameKr:  p ? p.nameKr : '—'
        }
      })

      const valid    = _stockUploadData.filter(r => r.found).length
      const notFound = _stockUploadData.filter(r => !r.found).length
      document.getElementById('srmPreviewCount').innerHTML =
        `<span style="font-weight:400;font-size:12px;color:var(--text-sub)">
          전체 ${_stockUploadData.length}행 | <span style="color:var(--success)">매칭 ${valid}행</span>
          ${notFound ? ` | <span style="color:var(--danger)">미매칭 ${notFound}행</span>` : ''}
        </span>`

      document.getElementById('srmPreviewTbody').innerHTML = _stockUploadData.map(r => `
        <tr class="${r.found ? '' : 'upm-row-error'}">
          <td>${r.rowNum}</td>
          <td style="font-size:11px">${r.date}</td>
          <td style="font-family:Inter;font-size:11px">${r.code}</td>
          <td>${r.nameKr}</td>
          <td style="text-align:center;font-weight:600">${r.size}</td>
          <td style="font-family:Inter;font-size:11px">${r.barcode || '-'}</td>
          <td style="text-align:center;font-weight:700;color:var(--accent)">${r.qty}</td>
          <td style="font-size:11px;color:var(--text-sub)">${r.memo || '-'}</td>
          <td>${r.found ? '<span class="upm-badge ok">✅</span>' : '<span class="upm-badge err">❌ 미매칭</span>'}</td>
        </tr>`).join('')

      document.getElementById('srmPreviewSection').style.display = ''
      document.getElementById('srmConfirmBtn').style.display = valid > 0 ? '' : 'none'
      document.getElementById('srmConfirmBtn').textContent = `${valid}행 입고 저장`
    } catch (err) {
      showToast('파일 읽기 오류: ' + err.message, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
}

function confirmStockUpload() {
  if (!_stockUploadData) return

  // 품번+입고일+메모로 그룹화 → 사이즈별 합산
  const groups = {}
  _stockUploadData.filter(r => r.found).forEach(r => {
    const key = `${r.code}||${r.date}||${r.memo}`
    if (!groups[key]) groups[key] = { code: r.code, date: r.date, memo: r.memo, sizes: {}, barcodes: {} }
    const sz = r.size
    if (['XS','S','M','L','XL'].includes(sz)) {
      groups[key].sizes[sz] = (groups[key].sizes[sz] || 0) + r.qty
      if (r.barcode) groups[key].barcodes[sz] = r.barcode
    }
  })

  let cnt = 0
  Object.values(groups).forEach(g => {
    const p = State.allProducts.find(x => x.productCode === g.code)
    if (!p) return
    if (!p.stock)    p.stock    = { XS:0, S:0, M:0, L:0, XL:0 }
    if (!p.barcodes) p.barcodes = {}
    if (!p.stockLog) p.stockLog = []

    // 누적 입고
    Object.entries(g.sizes).forEach(([sz, qty]) => { p.stock[sz] = (p.stock[sz]||0) + qty })
    // 바코드 업데이트
    Object.entries(g.barcodes).forEach(([sz, bc]) => { p.barcodes[sz] = bc })
    // 이력
    p.stockLog.push({ type:'in', date: g.date, memo: g.memo || '엑셀 일괄 입고',
      ...g.sizes, barcodes: g.barcodes, registeredAt: new Date().toISOString() })
    cnt++
  })

  State.stock.filtered = [...State.allProducts]
  renderStockTable()
  showToast(`${cnt}개 상품 입고 저장 완료`, 'success')
  document.getElementById('stockRegisterModal').close()
  _stockUploadData = null
}

// =============================================
// ===== 개별출고 모달 =====
// =============================================
function openOutgoingModal() {
  document.getElementById('ougKeyword').value = ''
  document.getElementById('ougProductArea').innerHTML = '<div class="srm-empty">품번을 입력하세요</div>'
  document.getElementById('ougDate').value = new Date().toISOString().slice(0,10)
  document.getElementById('ougMemo').value = ''
  const modal = document.getElementById('outgoingModal')
  centerModal(modal)
  modal.showModal()
  centerModal(modal)
}

function closeOutgoingModal() {
  document.getElementById('outgoingModal').close()
}

function findOutgoingProduct() {
  const keyword = document.getElementById('ougKeyword').value.trim()
  if (!keyword) { showToast('품번을 입력하세요.', 'warning'); return }
  const p = State.allProducts.find(x =>
    (x.productCode||'').toLowerCase() === keyword.toLowerCase() ||
    (x.productCode||'').toLowerCase().includes(keyword.toLowerCase())
  )
  const area = document.getElementById('ougProductArea')
  if (!p) {
    area.innerHTML = `<div class="srm-empty srm-notfound">품번 <b>${keyword}</b>을(를) 찾을 수 없습니다.</div>`
    return
  }
  const sizes = ['XS','S','M','L','XL']
  area.innerHTML = `
    <div class="sip-product-info" style="margin:12px 0 10px">
      <span class="sip-brand">${p.brand}</span>
      <span class="sip-code">${p.productCode}</span>
      <span class="sip-name">${p.nameKr}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:12px">
      <thead>
        <tr style="background:var(--table-header)">
          <th style="padding:5px 8px;text-align:left;border:1px solid var(--border)">사이즈</th>
          <th style="padding:5px 8px;text-align:left;border:1px solid var(--border)">바코드</th>
          <th style="padding:5px 8px;text-align:right;border:1px solid var(--border)">현재재고</th>
          <th style="padding:5px 8px;text-align:center;border:1px solid var(--border)">출고수량</th>
        </tr>
      </thead>
      <tbody>
        ${sizes.map(sz => `
          <tr>
            <td style="padding:5px 8px;border:1px solid var(--border);font-weight:600">${sz}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);font-family:Inter;color:var(--text-sub)">${p.barcodes?.[sz] || p.barcode || '-'}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);text-align:right" id="ougCur_${sz}">${p.stock?.[sz]||0}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);text-align:center">
              <input type="number" class="sip-size-input" id="ougStock_${sz}"
                value="0" min="0" max="${p.stock?.[sz]||0}" style="width:70px;text-align:center"
                oninput="updateOugTotal()" />
            </td>
          </tr>`).join('')}
        <tr style="background:var(--table-header);font-weight:700">
          <td colspan="3" style="padding:5px 8px;border:1px solid var(--border);text-align:right">출고 합계</td>
          <td style="padding:5px 8px;border:1px solid var(--border);text-align:center" id="ougTotal">0</td>
        </tr>
      </tbody>
    </table>
    <div class="sip-actions">
      <button class="btn btn-danger" onclick="submitOutgoing('${p.productCode}')">출고 처리</button>
    </div>
  `
}

function updateOugTotal() {
  const sizes = ['XS','S','M','L','XL']
  const total = sizes.reduce((s, sz) => s + (parseInt(document.getElementById(`ougStock_${sz}`)?.value)||0), 0)
  const el = document.getElementById('ougTotal')
  if (el) el.textContent = total
}

function submitOutgoing(productCode) {
  const p = State.allProducts.find(x => x.productCode === productCode)
  if (!p) return
  const sizes = ['XS','S','M','L','XL']
  const outQty = {}
  sizes.forEach(sz => { outQty[sz] = parseInt(document.getElementById(`ougStock_${sz}`)?.value)||0 })
  const total = Object.values(outQty).reduce((a,b) => a+b, 0)
  if (total === 0) { showToast('출고 수량을 입력해주세요.', 'warning'); return }

  // 재고 초과 체크
  const overSize = sizes.find(sz => outQty[sz] > (p.stock?.[sz]||0))
  if (overSize) {
    showToast(`${overSize} 출고 수량이 현재 재고(${p.stock?.[overSize]||0})를 초과합니다.`, 'error')
    return
  }

  // 누적 차감
  if (!p.stock) p.stock = { XS:0, S:0, M:0, L:0, XL:0 }
  sizes.forEach(sz => { p.stock[sz] = (p.stock[sz]||0) - outQty[sz] })

  // 출고 이력 저장
  if (!p.stockLog) p.stockLog = []
  p.stockLog.push({
    type: 'out',
    date: document.getElementById('ougDate')?.value || new Date().toISOString().slice(0,10),
    memo: document.getElementById('ougMemo')?.value.trim() || '',
    ...outQty,
    registeredAt: new Date().toISOString()
  })

  State.stock.filtered = State.stock.filtered.map(x => x.productCode === productCode ? p : x)
  renderStockTable()
  showToast(`${p.nameKr} 출고 ${total}개 처리 완료`, 'success')
  closeOutgoingModal()
}

function resetStock() {
  ['sKeyword','sDateFrom','sDateTo'].forEach(id => document.getElementById(id).value = '')
  document.getElementById('sStockStatus').value = 'all'
  State.stock.filtered = [...State.allProducts]
  renderStockTable()
}

function renderStockTable() {
  const data = State.stock.filtered
  const sort = State.stock.sort
  document.getElementById('sTableMeta').textContent = `검색결과 ${data.length}건`

  if (!data.length) {
    document.getElementById('sTableWrap').innerHTML = `<div class="empty-state"><p>검색 결과가 없습니다.</p></div>`
    return
  }

  const sizes = ['XS','S','M','L','XL']
  const totals = {}
  sizes.forEach(sz => totals[sz] = data.reduce((s,p) => s + (p.stock?.[sz] || 0), 0))
  const grandTotal = Object.values(totals).reduce((a,b) => a+b, 0)

  document.getElementById('sTableWrap').innerHTML = `
    <table class="data-table" id="stockTable">
      <thead><tr>
        <th>이미지</th>
        <th class="sortable" data-key="productCode">품번<span class="sort-icon">⇅</span></th>
        <th class="sortable" data-key="nameKr">상품명<span class="sort-icon">⇅</span></th>
        <th>브랜드</th>
        <th style="text-align:right">판매가</th>
        ${sizes.map(sz => `<th style="text-align:center">${sz}</th>`).join('')}
        <th class="sortable" data-key="totalStock" style="text-align:right">합계<span class="sort-icon">⇅</span></th>
      </tr></thead>
      <tbody>${data.map(p => {
        const total = getTotalStock(p)
        return `<tr>
          <td>${renderThumb(p)}</td>
          <td><span class="code-link" onclick="openDetailModal('${p.productCode}')">${p.productCode}</span></td>
          <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis" title="${p.nameKr}">${p.nameKr}</td>
          <td style="font-size:12px">${p.brand}</td>
          <td style="text-align:right"><span class="price">${fmtPrice(p.salePrice)}</span></td>
          ${sizes.map(sz => `<td style="text-align:center">${stockCell(p.stock?.[sz] || 0)}</td>`).join('')}
          <td style="text-align:right;font-family:Inter;font-weight:600">${total}</td>
        </tr>`
      }).join('')}</tbody>
      <tfoot><tr>
        <td colspan="4" style="text-align:right">합계</td>
        <td></td>
        ${sizes.map(sz => `<td style="text-align:center">${totals[sz]}</td>`).join('')}
        <td style="text-align:right">${grandTotal}</td>
      </tr></tfoot>
    </table>`

  bindSortHeader('stockTable', 'stock', renderStockTable)
  updateSortIcons('stockTable', sort)
}

// =============================================
// ===== 판매조회 =====
// =============================================
function searchSales() {
  const keywords  = parseKeywords(document.getElementById('slKeyword').value)
  const dateFrom  = document.getElementById('slDateFrom').value
  const dateTo    = document.getElementById('slDateTo').value
  const platform  = document.getElementById('slPlatform').value

  let result = State.allProducts.filter(p => {
    if (keywords.length) {
      const targets = [p.productCode, p.nameKr]
      if (!keywords.some(kw => targets.some(t => (t||'').toLowerCase().includes(kw)))) return false
    }
    if (dateFrom || dateTo) {
      if (!isInRange(p.registDate, dateFrom, dateTo)) return false
    }
    if (platform !== 'all' && !(p.sales?.[platform] > 0)) return false
    return true
  })
  State.sales.filtered = sortData(result, State.sales.sort.key, State.sales.sort.dir)
  renderSalesTable()
}

function resetSales() {
  ['slKeyword','slDateFrom','slDateTo'].forEach(id => document.getElementById(id).value = '')
  document.getElementById('slPlatform').value = 'all'
  State.sales.filtered = [...State.allProducts]
  State.sales.sort = { key: 'totalSales', dir: 'desc' }
  renderSalesTable()
}

function renderSalesTable() {
  const data = State.sales.filtered
  const sort = State.sales.sort
  document.getElementById('slTableMeta').textContent = `검색결과 ${data.length}건`

  if (!data.length) {
    document.getElementById('slTableWrap').innerHTML = `<div class="empty-state"><p>검색 결과가 없습니다.</p></div>`
    return
  }

  const platforms = _platforms
  const platTotals = {}
  platforms.forEach(pl => platTotals[pl] = data.reduce((s,p) => s + (p.sales?.[pl] || 0), 0))
  const grandTotal = Object.values(platTotals).reduce((a,b) => a+b, 0)

  document.getElementById('slTableWrap').innerHTML = `
    <table class="data-table" id="salesTable">
      <thead><tr>
        <th>이미지</th>
        <th class="sortable" data-key="productCode">품번<span class="sort-icon">⇅</span></th>
        <th class="sortable" data-key="nameKr">상품명<span class="sort-icon">⇅</span></th>
        <th>브랜드</th>
        <th style="text-align:right">판매가</th>
        ${platforms.map(pl => `<th style="text-align:right">${pl}</th>`).join('')}
        <th class="sortable" data-key="totalSales" style="text-align:right">합계<span class="sort-icon">⇅</span></th>
      </tr></thead>
      <tbody>${data.map(p => {
        const total = getTotalSales(p)
        return `<tr>
          <td>${renderThumb(p)}</td>
          <td style="font-family:Inter;font-size:12px">${p.productCode}</td>
          <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis" title="${p.nameKr}">${p.nameKr}</td>
          <td style="font-size:12px">${p.brand}</td>
          <td style="text-align:right"><span class="price">${fmtPrice(p.salePrice)}</span></td>
          ${platforms.map(pl => `<td style="text-align:right;font-family:Inter">${p.sales?.[pl] || 0}</td>`).join('')}
          <td style="text-align:right;font-family:Inter;font-weight:600">${total}</td>
        </tr>`
      }).join('')}</tbody>
      <tfoot><tr>
        <td colspan="4" style="text-align:right">합계</td>
        <td></td>
        ${platforms.map(pl => `<td style="text-align:right;font-family:Inter">${platTotals[pl]}</td>`).join('')}
        <td style="text-align:right;font-family:Inter">${grandTotal}</td>
      </tr></tfoot>
    </table>`

  bindSortHeader('salesTable', 'sales', renderSalesTable)
  updateSortIcons('salesTable', sort)
}

// =============================================
// ===== 신규기획 =====
// =============================================
let _plLocalImgUrls = []

function openPlanRegisterModal() {
  const modal = document.getElementById('planRegisterModal')
  modal.showModal()
  requestAnimationFrame(() => {
    modal.style.left = Math.max(0, (window.innerWidth  - modal.offsetWidth)  / 2) + 'px'
    modal.style.top  = Math.max(0, (window.innerHeight - modal.offsetHeight) / 2) + 'px'
  })
  initPlPcodePanel()
}

function closePlanRegisterModal() {
  const code = document.getElementById('plProductCode')?.value
  if (code) _reservedCodes.delete(code)
  document.getElementById('planRegisterModal').close()
  document.getElementById('planRegisterForm').reset()
  const prev = document.getElementById('plImgPreview')
  if (prev) prev.innerHTML = ''
  _plLocalImgUrls = []
}

function submitPlanRegister(e) {
  e.preventDefault()
  const sampleNo = document.getElementById('plSampleNo').value.trim()
  if (!sampleNo) { showToast('샘플번호는 필수입니다.', 'error'); return }

  const sumUrls = (document.getElementById('plImgSum').value || '').split('\n').map(u => u.trim()).filter(Boolean)
  const item = {
    no:          State.planItems.length + 1,
    sampleNo,
    productCode: document.getElementById('plProductCode').value.trim() || '',
    brand:       document.getElementById('plBrand').value,
    nameKr:      document.getElementById('plNameKr').value.trim(),
    nameEn:      document.getElementById('plNameEn').value.trim(),
    colorKr:     document.getElementById('plColorKr').value.trim(),
    colorEn:     document.getElementById('plColorEn').value.trim(),
    salePrice:   Number(document.getElementById('plSalePrice').value) || 0,
    costPrice:   Number(document.getElementById('plCostPrice').value) || 0,
    type:        document.getElementById('plType').value,
    year:        document.getElementById('plYear').value,
    season:      document.getElementById('plSeason').value,
    gender:      document.getElementById('plGender').value,
    memo:        document.getElementById('plMemo').value.trim(),
    images: {
      sum:     [...sumUrls, ..._plLocalImgUrls],
      lemango: document.getElementById('plImgLemango').value.trim(),
      noir:    document.getElementById('plImgNoir').value.trim()
    },
    schedule: {
      design:     { start: document.getElementById('plDesignStart').value,     end: document.getElementById('plDesignEnd').value },
      production: { start: document.getElementById('plProductionStart').value, end: document.getElementById('plProductionEnd').value },
      image:      { start: document.getElementById('plImageStart').value,      end: document.getElementById('plImageEnd').value },
      register:   { start: document.getElementById('plRegisterStart').value,   end: document.getElementById('plRegisterEnd').value },
      logistics:  { start: document.getElementById('plLogisticsStart').value,  end: document.getElementById('plLogisticsEnd').value }
    }
  }
  if (item.productCode) _reservedCodes.delete(item.productCode)
  State.planItems.push(item)
  State.plan.filtered = State.planItems.filter(p => !p.confirmed)
  _plLocalImgUrls = []
  renderPlanTable()
  closePlanRegisterModal()
  showToast(`"${sampleNo}" 기획 등록 완료`, 'success')
}

// ===== 신규기획 품번 자동생성 =====
function togglePlPcodePanel() {
  const panel = document.getElementById('plPcodePanel')
  const btn   = document.getElementById('plPcodeToggleBtn')
  const open  = panel.style.display === 'none' || panel.style.display === ''
  panel.style.display = open ? 'block' : 'none'
  btn.textContent = open ? '자동생성 ▴' : '자동생성 ▾'
  if (open) initPlPcodePanel()
}

function initPlPcodePanel() {
  if (!document.getElementById('plPcDesign')) return
  renderPlDesignList('')
  selectPlDesign('1626')
  renderPlBackStyleList('')
  document.getElementById('plPcPreview').textContent = '-'
  document.getElementById('plPcSeqDisplay').textContent = '-'
  const applyBtn = document.getElementById('plPcApplyBtn')
  if (applyBtn) applyBtn.disabled = true
}

function renderPlBackStyleList(query) {
  const q = (query || '').toLowerCase().trim()
  const list = q
    ? _backStyles.filter(([c,e,k]) => c.includes(q) || e.toLowerCase().includes(q) || k.toLowerCase().includes(q))
    : _backStyles
  const current = document.getElementById('plPcBackStyle')?.value
  const dd = document.getElementById('plBsDropdown')
  if (!dd) return
  dd.innerHTML = list.map(([c,e,k]) =>
    `<div class="design-listitem${current===c?' selected':''}" onclick="selectPlBackStyle('${c}')">[${c}] ${e} / ${k}</div>`
  ).join('') || '<div class="design-no-result">없음</div>'
}

function filterPlBackStyleList() {
  renderPlBackStyleList(document.getElementById('plPcBsSearch')?.value || '')
}

function selectPlBackStyle(code) {
  const found = _backStyles.find(([c]) => c === code)
  if (!found) return
  document.getElementById('plPcBackStyle').value = code
  document.getElementById('plPcBsSearch').value = ''
  document.getElementById('plPcBsSearch').placeholder = `${code} - ${found[1]} (${found[2]})`
  renderPlBackStyleList('')
}

function showPlBsForm(mode) {
  const form = document.getElementById('plBsForm')
  if (!form) return
  if (mode === 'edit') {
    const cur = document.getElementById('plPcBackStyle')?.value
    if (!cur) { showToast('수정할 백스타일을 선택하세요.', 'warning'); return }
    const entry = _backStyles.find(([c]) => c === cur)
    if (entry) {
      document.getElementById('plBsFormCode').value = entry[0]
      document.getElementById('plBsFormEn').value   = entry[1]
      document.getElementById('plBsFormKr').value   = entry[2]
    }
  } else {
    document.getElementById('plBsFormCode').value = ''
    document.getElementById('plBsFormEn').value   = ''
    document.getElementById('plBsFormKr').value   = ''
  }
  form.dataset.mode = mode
  form.style.display = 'flex'
}

function confirmPlBsForm() {
  const form = document.getElementById('plBsForm')
  const mode = form?.dataset.mode
  const code = document.getElementById('plBsFormCode')?.value.trim()
  const en   = document.getElementById('plBsFormEn')?.value.trim()
  const kr   = document.getElementById('plBsFormKr')?.value.trim()
  if (!code || !en || !kr) { showToast('코드, 영문, 한글 모두 입력해주세요.', 'warning'); return }
  if (mode === 'add') {
    if (_backStyles.find(([c]) => c === code)) { showToast('이미 존재하는 코드입니다.', 'error'); return }
    _backStyles.push([code, en, kr])
  } else {
    const idx = _backStyles.findIndex(([c]) => c === code)
    if (idx !== -1) _backStyles[idx] = [code, en, kr]; else _backStyles.push([code, en, kr])
  }
  saveBackStyles()
  renderPlBackStyleList('')
  document.getElementById('plPcBackStyle').value = code
  if (form) form.style.display = 'none'
}

function renderPlDesignList(query) {
  const q = (query || '').toLowerCase().trim()
  const list = q
    ? _designCodes.filter(([c,e,k]) => c.includes(q) || e.toLowerCase().includes(q) || k.toLowerCase().includes(q))
    : _designCodes
  const current = document.getElementById('plPcDesign')?.value
  const dd = document.getElementById('plDesignDropdown')
  if (!dd) return
  dd.innerHTML = list.map(([c,e,k]) =>
    `<div class="design-option${current===c?' selected':''}" onclick="selectPlDesign('${c}')">
      <span class="design-code">${c}</span>
      <span class="design-names"><span class="design-en">${e}</span><span class="design-kr">${k}</span></span>
    </div>`
  ).join('') || '<div class="design-no-result">검색 결과 없음</div>'
  const sel = dd.querySelector('.design-option.selected')
  if (sel) sel.scrollIntoView({ block: 'nearest' })
}

function filterPlDesignList() {
  renderPlDesignList(document.getElementById('plPcDesignSearch')?.value || '')
}

function selectPlDesign(code) {
  const found = _designCodes.find(([c]) => c === code)
  if (!found) return
  document.getElementById('plPcDesign').value = code
  document.getElementById('plPcDesignSearch').value = ''
  document.getElementById('plPcDesignSearch').placeholder = `${code} - ${found[1]} (${found[2]})`
  renderPlDesignList('')
}

function updatePlProductCode() {
  const cls       = document.getElementById('plPcClass')?.value
  const gen       = document.getElementById('plPcGender')?.value
  const typ       = document.getElementById('plPcType')?.value
  const des       = document.getElementById('plPcDesign')?.value
  const year      = document.getElementById('plPcYear')?.value
  const seasonNum = document.getElementById('plPcSeasonNum')?.value
  if (!cls || !des) return

  const prefix = cls + gen + typ + des + year + seasonNum
  const usedNums = new Set(
    [...State.allProducts, ...State.planItems]
      .map(p => p.productCode)
      .filter(c => c && c.slice(0, 12) === prefix)
      .map(c => c.slice(12))
  )
  _reservedCodes.forEach(c => { if (c.slice(0,12) === prefix) usedNums.add(c.slice(12)) })

  let nextNum = null
  for (let i = 0; i <= 99; i++) {
    const n = String(i).padStart(2,'0')
    if (!usedNums.has(n)) { nextNum = n; break }
  }

  const seqDisplay = document.getElementById('plPcSeqDisplay')
  const applyBtn   = document.getElementById('plPcApplyBtn')
  if (nextNum === null) {
    seqDisplay.textContent = '만료'
    document.getElementById('plPcPreview').textContent = '사용 가능한 번호 없음'
    if (applyBtn) applyBtn.disabled = true
  } else {
    seqDisplay.textContent = nextNum
    document.getElementById('plPcPreview').textContent = prefix + nextNum
    if (applyBtn) applyBtn.disabled = false
  }
}

function applyPlGeneratedCode() {
  const code = document.getElementById('plPcPreview').textContent
  if (!code || code === '-' || code === '사용 가능한 번호 없음') return

  if (State.allProducts.some(p => p.productCode === code) ||
      State.planItems.some(p => p.productCode === code) ||
      _reservedCodes.has(code)) {
    showToast(`품번 "${code}"은 이미 사용 중입니다.`, 'error')
    updatePlProductCode()
    return
  }
  _reservedCodes.add(code)
  document.getElementById('plProductCode').value = code
  document.getElementById('plPcodePanel').style.display = 'none'
  document.getElementById('plPcodeToggleBtn').textContent = '자동생성 ▾'

  const cls = document.getElementById('plPcClass')?.value || ''
  const typ = document.getElementById('plPcType')?.value || ''
  document.getElementById('plBrand').value = cls.startsWith('N') ? '르망고 느와' : '르망고'

  const typeEl = document.getElementById('plType')
  if (typeEl) {
    const typeMap = { ON: 'onepiece', MO: 'onepiece', BK: 'bikini', BR: 'bikini' }
    const mapped = typeMap[typ]
    if (mapped) typeEl.value = mapped
  }

  const yearMap = {'1':'2021','2':'2022','3':'2023','4':'2024','5':'2025','6':'2026','7':'2027','8':'2028','9':'2029','0':'2030'}
  const yearVal = document.getElementById('plPcYear')?.value
  const yearEl = document.getElementById('plYear')
  if (yearEl && yearVal) yearEl.value = yearMap[yearVal] || yearVal
  const seasonEl = document.getElementById('plSeason')
  if (seasonEl) seasonEl.value = document.getElementById('plPcSeasonNum')?.value || ''
  const genderEl = document.getElementById('plGender')
  if (genderEl) genderEl.value = document.getElementById('plPcGender')?.value || ''

  showToast(`품번 ${code} 적용됨`, 'success')
}

function handlePlImgUpload(input) {
  const files = Array.from(input.files)
  const preview = document.getElementById('plImgPreview')
  files.forEach(file => {
    const url = URL.createObjectURL(file)
    _plLocalImgUrls.push(url)
    const wrap = document.createElement('div')
    wrap.className = 'pl-img-thumb-wrap'
    const img = document.createElement('img')
    img.src = url
    img.className = 'pl-img-thumb'
    img.onclick = () => window.open(url)
    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'pl-img-del'
    del.textContent = '✕'
    del.onclick = () => {
      _plLocalImgUrls = _plLocalImgUrls.filter(u => u !== url)
      URL.revokeObjectURL(url)
      wrap.remove()
    }
    wrap.appendChild(img)
    wrap.appendChild(del)
    preview.appendChild(wrap)
  })
  input.value = ''
}

function searchPlan() {
  const raw    = document.getElementById('npKeyword').value
  const keywords = parseKeywords(raw)
  const field     = document.getElementById('npSearchField').value
  const brand     = document.getElementById('npBrand').value
  const type      = document.getElementById('npType').value
  const year      = document.getElementById('npYear').value
  const season    = document.getElementById('npSeason').value
  const gender    = document.getElementById('npGenderFilter').value
  const confirmed = document.getElementById('npConfirmed')?.value || 'pending'

  let result = State.planItems.filter(p => {
    // 이전 상태 필터 (기본: 미이전만 표시)
    if (confirmed === 'pending'   &&  p.confirmed) return false
    if (confirmed === 'confirmed' && !p.confirmed) return false

    if (keywords.length) {
      const getTargets = () => {
        if (field === 'nameKr')      return [p.nameKr, p.nameEn]
        if (field === 'productCode') return [p.productCode, p.sampleNo]
        return [p.nameKr, p.nameEn, p.productCode, p.sampleNo, p.colorKr, p.memo]
      }
      const targets = getTargets()
      if (!keywords.some(kw => targets.some(t => (t||'').toLowerCase().includes(kw)))) return false
    }
    if (brand  !== 'all' && p.brand  !== brand)       return false
    if (type   !== 'all' && p.type   !== type)         return false
    if (year   !== 'all' && p.year   !== year)         return false
    if (season !== 'all' && String(p.season) !== season) return false
    if (gender !== 'all' && p.gender !== gender)       return false
    return true
  })
  State.plan.filtered = result
  renderPlanTable()
}

function resetPlan() {
  document.getElementById('npKeyword').value = ''
  document.getElementById('npSearchField').value = 'all'
  document.getElementById('npBrand').value = 'all'
  document.getElementById('npType').value = 'all'
  document.getElementById('npYear').value = 'all'
  document.getElementById('npSeason').value = 'all'
  document.getElementById('npGenderFilter').value = 'all'
  const confirmedEl = document.getElementById('npConfirmed')
  if (confirmedEl) confirmedEl.value = 'pending'
  State.plan.filtered = State.planItems.filter(p => !p.confirmed)
  renderPlanTable()
}

function renderPlanTable() {
  const data = State.plan.filtered
  const sort = State.plan.sort
  document.getElementById('npTableMeta').textContent = `검색결과 ${data.length}건`

  if (!data.length) {
    document.getElementById('npTableWrap').innerHTML = `<div class="empty-state"><p>등록된 기획 상품이 없습니다. <strong>신규기획 등록</strong> 버튼을 눌러 추가하세요.</p></div>`
    return
  }

  const schedules = [
    { key: 'design',     label: '디자인' },
    { key: 'production', label: '생산' },
    { key: 'image',      label: '이미지' },
    { key: 'register',   label: '상품등록' },
    { key: 'logistics',  label: '물류입고' }
  ]
  const fmtD = d => d ? d.replace(/^\d{4}-(\d{2})-(\d{2})$/, '$1/$2') : '-'

  document.getElementById('npTableWrap').innerHTML = `
    <table class="data-table plan-table" id="planTable">
      <thead>
        <tr>
          <th rowspan="2" style="text-align:center">No.</th>
          <th rowspan="2">이미지</th>
          <th rowspan="2">샘플번호</th>
          <th rowspan="2">품번</th>
          <th rowspan="2">브랜드</th>
          <th rowspan="2">상품명</th>
          <th rowspan="2">색상</th>
          <th rowspan="2">타입</th>
          <th rowspan="2" style="text-align:right">판매가</th>
          ${schedules.map(s => `<th colspan="2" class="schedule-group-th">${s.label}</th>`).join('')}
        </tr>
        <tr>
          ${schedules.map(() => `<th class="schedule-sub-th">시작일</th><th class="schedule-sub-th">완료예정일</th>`).join('')}
        </tr>
      </thead>
      <tbody>${data.map(p => `<tr${p.confirmed ? ' style="opacity:0.6"' : ''}>
        <td style="text-align:center">${p.no}${p.confirmed ? '<br><span style="font-size:9px;background:var(--success);color:#fff;padding:1px 5px;border-radius:8px">이전됨</span>' : ''}</td>
        <td>${renderThumb(p)}</td>
        <td><span class="code-link" onclick="openPlanDetailModal(${p.no})">${p.sampleNo}</span></td>
        <td>${p.productCode ? `<span class="code-link" onclick="openDetailModal('${p.productCode}')">${p.productCode}</span>` : `<span style="color:var(--text-muted);font-size:12px">-</span>`}</td>
        <td style="font-size:12px">${p.brand || '-'}</td>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.nameKr || ''}">${p.nameKr || '-'}</td>
        <td style="font-size:12px">${p.colorKr || '-'}</td>
        <td>${typeBadge(p.type)}</td>
        <td style="text-align:right"><span class="price">${fmtPrice(p.salePrice)}</span></td>
        ${schedules.map(s => {
          const sch = p.schedule?.[s.key] || {}
          return `<td class="schedule-date-cell${sch.start?' has-date':''}">${fmtD(sch.start)}</td><td class="schedule-date-cell${sch.end?' has-date':''}">${fmtD(sch.end)}</td>`
        }).join('')}
      </tr>`).join('')}</tbody>
    </table>`

  bindSortHeader('planTable', 'plan', renderPlanTable)
  updateSortIcons('planTable', sort)
}

// ===== 신규기획 상세 모달 =====
let _editingPlanNo = null

function openPlanDetailModal(no) {
  const item = State.planItems.find(p => p.no === no)
  if (!item) return
  _editingPlanNo = no
  buildPlanDetailContent(item)
  // 뷰 모드로 초기화
  const modal = document.getElementById('planDetailModal')
  modal.classList.remove('edit-mode')
  document.getElementById('pdEditBtn').style.display = ''
  document.getElementById('pdSaveBtn').style.display = 'none'
  const confirmBtn = document.getElementById('pdConfirmBtn')
  if (confirmBtn) confirmBtn.style.display = item.confirmed ? 'none' : ''
  modal.showModal()
  centerModal(modal)
}

function closePlanDetailModal() {
  // 미확정 임시 예약 코드 해제
  if (_pdPendingCode) {
    const currentItem = State.planItems.find(p => p.no === _editingPlanNo)
    if (!currentItem || currentItem.productCode !== _pdPendingCode) {
      _reservedCodes.delete(_pdPendingCode)
    }
    _pdPendingCode = null
  }
  document.getElementById('planDetailModal').close()
}

// ===== 기획 상세 모달 — 품번 인라인 생성 =====
function togglePdCodeGenPanel() {
  const panel = document.getElementById('pdCodeGenPanel')
  const btn   = document.querySelector('.pdcg-toggle-btn')
  if (!panel) return
  const open = panel.style.display === 'none'
  panel.style.display = open ? '' : 'none'
  if (btn) btn.textContent = open ? '품번 생성 ▴' : '품번 생성 ▾'
  if (open) {
    filterPdDesignList()
    updatePdProductCode()
  }
}

function filterPdDesignList() {
  const q = (document.getElementById('pdCgDesignSearch')?.value || '').toLowerCase().trim()
  const list = q
    ? _designCodes.filter(([c,e,k]) => c.includes(q) || e.toLowerCase().includes(q) || k.toLowerCase().includes(q))
    : _designCodes
  const current = document.getElementById('pdCgDesign')?.value
  const dd = document.getElementById('pdCgDesignDropdown')
  if (!dd) return
  dd.innerHTML = list.map(([c,e,k]) =>
    `<div class="design-option${current===c?' selected':''}" onclick="selectPdDesign('${c}')">
      <span class="design-code">${c}</span>
      <span class="design-names"><span class="design-en">${e}</span><span class="design-kr">${k}</span></span>
    </div>`
  ).join('') || '<div class="design-no-result">검색 결과 없음</div>'
}

function selectPdDesign(code) {
  const found = _designCodes.find(([c]) => c === code)
  if (!found) return
  document.getElementById('pdCgDesign').value = code
  document.getElementById('pdCgDesignSearch').value = ''
  document.getElementById('pdCgDesignSearch').placeholder = `${code} - ${found[1]} (${found[2]})`
  filterPdDesignList()
  updatePdProductCode()
}

function updatePdProductCode() {
  const cls    = document.getElementById('pdCgCls')?.value    || ''
  const gen    = document.getElementById('pdCgGen')?.value    || ''
  const typ    = document.getElementById('pdCgTyp')?.value    || ''
  const des    = document.getElementById('pdCgDesign')?.value || ''
  const year   = document.getElementById('pdCgYear')?.value   || ''
  const season = document.getElementById('pdCgSeason')?.value || ''

  const previewEl = document.getElementById('pdCgPreview')
  const applyBtn  = document.getElementById('pdCgApplyBtn')
  if (!des) {
    if (previewEl) previewEl.textContent = '디자인 번호를 선택하세요'
    if (applyBtn)  applyBtn.disabled = true
    return
  }

  const prefix = cls + gen + typ + des + year + season
  // 현재 편집 중인 아이템의 기존 품번은 제외 (재생성 허용)
  const currentItem = State.planItems.find(p => p.no === _editingPlanNo)
  const currentOwnCode = currentItem?.productCode || ''
  const usedNums = new Set(
    [...State.allProducts, ...State.planItems]
      .map(p => p.productCode)
      .filter(c => c && c !== currentOwnCode && c.slice(0, 12) === prefix)
      .map(c => c.slice(12))
  )
  _reservedCodes.forEach(c => {
    if (c !== currentOwnCode && c.slice(0, 12) === prefix) usedNums.add(c.slice(12))
  })

  let nextNum = null
  for (let i = 0; i <= 99; i++) {
    const n = String(i).padStart(2, '0')
    if (!usedNums.has(n)) { nextNum = n; break }
  }

  if (nextNum === null) {
    if (previewEl) previewEl.textContent = '사용 가능한 번호 없음'
    if (applyBtn)  applyBtn.disabled = true
  } else {
    if (previewEl) previewEl.textContent = prefix + nextNum
    if (applyBtn)  applyBtn.disabled = false
  }
}

let _pdPendingCode = null  // 이번 편집 세션에서 예약된 임시 코드

function applyPdGeneratedCode() {
  const code = document.getElementById('pdCgPreview')?.textContent?.trim()
  if (!code || code === '-' || code.includes('없음') || code.includes('선택')) return

  const currentItem = State.planItems.find(p => p.no === _editingPlanNo)
  const currentOwnCode = currentItem?.productCode || ''

  // 최종 중복 검사 (자기 자신 기존 코드는 허용)
  if ((State.allProducts.some(p => p.productCode === code) ||
       State.planItems.some(p => p.productCode === code && p.no !== _editingPlanNo) ||
       _reservedCodes.has(code)) && code !== currentOwnCode) {
    showToast(`품번 "${code}"은 이미 사용 중입니다.`, 'error')
    updatePdProductCode()
    return
  }

  // 이전에 예약했던 임시 코드 해제
  if (_pdPendingCode && _pdPendingCode !== currentOwnCode) {
    _reservedCodes.delete(_pdPendingCode)
  }

  _pdPendingCode = code
  if (code !== currentOwnCode) _reservedCodes.add(code)

  const input = document.getElementById('pdProductCodeInput')
  if (input) input.value = code
  document.getElementById('pdCodeGenPanel').style.display = 'none'
  const toggleBtn = document.querySelector('.pdcg-toggle-btn')
  if (toggleBtn) toggleBtn.textContent = '품번 생성 ▾'
  showToast(`품번 "${code}" 적용됐습니다.`, 'success')
}

function togglePlanDetailEdit() {
  const modal = document.getElementById('planDetailModal')
  const isEdit = modal.classList.toggle('edit-mode')
  document.getElementById('pdEditBtn').style.display = isEdit ? 'none' : ''
  document.getElementById('pdSaveBtn').style.display = isEdit ? '' : 'none'
}

function savePlanDetailEdit() {
  const item = State.planItems.find(p => p.no === _editingPlanNo)
  if (!item) return
  const modal = document.getElementById('planDetailModal')

  // 품번 빈 값 체크 → 생성 패널 열기
  const pcInput = document.getElementById('pdProductCodeInput')
  if (pcInput && !pcInput.value.trim()) {
    showToast('품번이 비어있습니다. 품번을 입력하거나 생성해주세요.', 'warning')
    const panel = document.getElementById('pdCodeGenPanel')
    if (panel && panel.style.display === 'none') togglePdCodeGenPanel()
    pcInput.focus()
    return
  }

  // 일반 input/select/textarea
  modal.querySelectorAll('[data-pkey]').forEach(el => {
    const key = el.dataset.pkey
    const val = el.tagName === 'INPUT' && el.type === 'number' ? (parseFloat(el.value) || 0) : el.value
    item[key] = val
  })
  // 일정 date inputs
  const scheduleKeys = ['design', 'production', 'image', 'register', 'logistics']
  scheduleKeys.forEach(k => {
    if (!item.schedule) item.schedule = {}
    if (!item.schedule[k]) item.schedule[k] = {}
    const startEl = modal.querySelector(`[data-sched="${k}-start"]`)
    const endEl   = modal.querySelector(`[data-sched="${k}-end"]`)
    if (startEl) item.schedule[k].start = startEl.value || null
    if (endEl)   item.schedule[k].end   = endEl.value   || null
  })

  // 헤더 텍스트 즉시 반영
  document.getElementById('pdBrand').textContent  = item.brand || ''
  document.getElementById('pdNameKr').textContent = item.nameKr || '(상품명 없음)'
  document.getElementById('pdSampleNo').textContent = item.sampleNo

  buildPlanDetailContent(item)
  modal.classList.remove('edit-mode')
  document.getElementById('pdEditBtn').style.display = ''
  document.getElementById('pdSaveBtn').style.display = 'none'
  renderPlanTable()
  showToast('저장됐습니다.', 'success')
}

function confirmPlanToProduct() {
  const item = State.planItems.find(p => p.no === _editingPlanNo)
  if (!item) return

  if (!item.productCode || !item.productCode.trim()) {
    showToast('품번이 없습니다. 먼저 품번을 생성/입력 후 저장해주세요.', 'warning')
    return
  }

  if (State.allProducts.some(p => p.productCode === item.productCode)) {
    showToast(`품번 "${item.productCode}"은 이미 상품조회에 존재합니다.`, 'warning')
    return
  }

  if (!confirm(`신규기획 항목을 상품조회로 이전합니다.\n품번: ${item.productCode}\n상품명: ${item.nameKr || '(없음)'}\n\n계속하시겠습니까?`)) return

  // 플랜 아이템 → 상품 객체 생성
  const salesInit = {}
  _platforms.forEach(pl => { salesInit[pl] = 0 })

  const newProduct = {
    no:          State.allProducts.length + 1,
    brand:       item.brand       || '',
    productCode: item.productCode,
    sampleNo:    item.sampleNo    || '',
    cafe24Code:  item.cafe24Code  || '',
    barcode:     item.barcode     || '',
    nameKr:      item.nameKr      || '',
    nameEn:      item.nameEn      || '',
    colorKr:     item.colorKr     || '',
    colorEn:     item.colorEn     || '',
    salePrice:   item.salePrice   || 0,
    costPrice:   item.costPrice   || 0,
    type:        item.type        || '',
    backStyle:   item.backStyle   || '',
    legCut:      item.legCut      || '',
    guide:       item.guide       || '',
    fabricType:  item.fabricType  || '',
    chestLine:   item.chestLine   || '',
    transparency:item.transparency|| '',
    lining:      item.lining      || '',
    capRing:     item.capRing     || '',
    material:    item.material    || '',
    comment:     item.comment     || '',
    washMethod:  item.washMethod  || '',
    bust:        item.bust        || '',
    waist:       item.waist       || '',
    hip:         item.hip         || '',
    modelSize:   item.modelSize   || '',
    madeMonth:   item.madeMonth   || '',
    madeBy:      item.madeBy      || '',
    madeIn:      item.madeIn      || '',
    videoUrl:    item.videoUrl    || null,
    saleStatus:  item.saleStatus  || '판매중',
    images: {
      sum:      item.images?.sum      || [],
      lemango:  item.images?.lemango  || [],
      noir:     item.images?.noir     || [],
      external: item.images?.external || [],
      design:   item.images?.design   || [],
      shoot:    item.images?.shoot    || []
    },
    stock:       { XS: 0, S: 0, M: 0, L: 0, XL: 0 },
    sales:       salesInit,
    registDate:  new Date().toISOString().slice(0, 10),
    logisticsDate: '',
    // 기획 일정 이력 (상품조회 하단에 표시)
    scheduleLog: item.schedule && Object.keys(item.schedule).length
      ? [{ confirmedAt: new Date().toISOString().slice(0, 10), schedule: JSON.parse(JSON.stringify(item.schedule)) }]
      : []
  }

  State.allProducts.push(newProduct)
  item.confirmed = true

  // 상품조회 필터 갱신
  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  renderProductTable()
  renderStockTable()
  renderDashboard()
  renderPlanTable()

  closePlanDetailModal()
  switchTab('product')

  // 상세 모달 열기 (약간 지연: 탭 전환 후)
  setTimeout(() => openDetailModal(newProduct.productCode), 100)

  showToast(`"${newProduct.productCode}" 상품이 상품조회로 이전됐습니다.`, 'success')
}

function buildPlanDetailContent(item) {
  document.getElementById('pdBrand').textContent    = item.brand || ''
  document.getElementById('pdNameKr').textContent   = item.nameKr || '(상품명 없음)'
  document.getElementById('pdSampleNo').textContent = item.sampleNo

  const schedules = [
    { key: 'design',     label: '디자인' },
    { key: 'production', label: '생산' },
    { key: 'image',      label: '이미지' },
    { key: 'register',   label: '상품등록' },
    { key: 'logistics',  label: '물류입고' }
  ]

  const allImgs = [
    ...(item.images?.sum    || []),
    ...(item.images?.lemango ? [item.images.lemango] : []),
    ...(item.images?.noir    ? [item.images.noir]    : [])
  ].filter(Boolean)

  const imgHtml = allImgs.length
    ? allImgs.map((url, i) =>
        `<img src="${url}" class="pd-thumb" onclick="openModal(${i}, ${JSON.stringify(allImgs).replace(/"/g, '&quot;')})" onerror="this.style.display='none'" />`
      ).join('')
    : '<span class="pd-no-img">이미지 없음</span>'

  const fmtDate = d => d || '-'
  const typeLabel   = { onepiece: '원피스', bikini: '비키니', 'two piece': '투피스' }
  const genderLabel = { W: '여성', M: '남성', G: '걸즈', B: '보이즈', N: '공용', K: '키즈' }

  // 뷰/편집 겸용 필드 헬퍼 (dispOverride: select일 때 표시용 한글 레이블)
  const pf = (label, key, val, type = 'text', opts = '', spanClass = '', dispOverride = '') => {
    const dispVal = dispOverride || (val !== null && val !== undefined && val !== '' ? String(val) : '-')
    const inputEl = type === 'select'
      ? `<select data-pkey="${key}">${opts}</select>`
      : type === 'textarea'
        ? `<textarea data-pkey="${key}" rows="3">${val || ''}</textarea>`
        : `<input type="${type}" data-pkey="${key}" value="${String(val || '').replace(/"/g, '&quot;')}" />`
    return `<div class="dfield ${spanClass}">
      <span class="dfield-label">${label}</span>
      <span class="dfield-value${dispVal === '-' ? ' empty' : ''}">${dispVal}</span>
      ${inputEl}
    </div>`
  }

  const brandOpts  = _settings.brands.map(b => `<option value="${b}"${item.brand===b?' selected':''}>${b}</option>`).join('')
  const typeOpts   = _settings.types.map(([v,l]) => `<option value="${v}"${item.type===v?' selected':''}>${l}</option>`).join('')
  const genderOpts = [['W','여성'],['M','남성'],['G','걸즈'],['B','보이즈'],['N','공용'],['K','키즈']]
    .map(([v,l]) => `<option value="${v}"${item.gender===v?' selected':''}>${l}</option>`).join('')

  // 품번 생성 패널용 옵션 (item 데이터로 기본값 추측)
  const clsGuess    = item.brand?.includes('느와') ? 'NS' : 'LS'
  const typGuess    = item.type === 'bikini' ? 'BK' : item.type === 'two piece' ? 'BK' : 'ON'
  const yearGuess   = String(item.year  || '6')
  const seasonGuess = String(item.season || '1')
  const genGuess    = item.gender || 'W'
  const CLS_OPT = [['LS','르망고 수영복'],['LW','르망고 의류'],['LG','르망고 굿즈'],['NS','느와 수영복'],['NW','느와 의류'],['NG','느와 굿즈']]
  const TYP_OPT = [['ON','원피스'],['MO','모노키니'],['BK','비키니'],['BR','브리프'],['JM','재머'],['RG','래시가드'],['AL','애슬레저'],['GM','의류'],['SC','수영모'],['BG','가방'],['ET','기타']]
  const GEN_OPT = [['W','여성'],['M','남성'],['G','걸즈'],['B','보이즈'],['N','공용'],['K','키즈']]
  const YEAR_OPT = ['1','2','3','4','5','6','7','8','9','0']
  const mkSel = (id, opts, guess, fn) =>
    `<select id="${id}" onchange="${fn}()">${opts.map(([v,l]) => `<option value="${v}"${v===guess?' selected':''}>${v}${l?' - '+l:''}</option>`).join('')}</select>`

  const pcVal = item.productCode || ''
  const productCodeField = `<div class="dfield dfield-span2">
    <span class="dfield-label">품번</span>
    <span class="dfield-value${!pcVal ? ' empty' : ''}">${pcVal || '-'}</span>
    <div class="pdcg-input-row">
      <input type="text" data-pkey="productCode" id="pdProductCodeInput" value="${pcVal}" placeholder="품번 직접 입력" style="flex:1" />
      <button class="btn btn-outline pdcg-toggle-btn" onclick="togglePdCodeGenPanel()" style="font-size:11px;padding:4px 12px;white-space:nowrap">품번 생성 ▾</button>
    </div>
    <div id="pdCodeGenPanel" class="pd-codegen-panel" style="display:none">
      <div class="pdcg-selects">
        <div class="pdcg-group"><label>분류</label>${mkSel('pdCgCls', CLS_OPT, clsGuess, 'updatePdProductCode')}</div>
        <div class="pdcg-group"><label>성별</label>${mkSel('pdCgGen', GEN_OPT, genGuess, 'updatePdProductCode')}</div>
        <div class="pdcg-group"><label>타입</label>${mkSel('pdCgTyp', TYP_OPT, typGuess, 'updatePdProductCode')}</div>
        <div class="pdcg-group"><label>연도</label>${mkSel('pdCgYear', YEAR_OPT.map(v => [v, '']), yearGuess, 'updatePdProductCode')}</div>
        <div class="pdcg-group"><label>시즌</label>${mkSel('pdCgSeason', ['1','2','3','4','5'].map(v => [v,'']), seasonGuess, 'updatePdProductCode')}</div>
      </div>
      <div class="pdcg-design-row">
        <label>디자인 번호 (패턴)</label>
        <input type="text" id="pdCgDesignSearch" placeholder="코드 또는 패턴명 검색" oninput="filterPdDesignList()" autocomplete="off" class="design-search-input" />
        <div id="pdCgDesignDropdown" class="design-dropdown" style="max-height:160px;overflow-y:auto"></div>
        <input type="hidden" id="pdCgDesign" />
      </div>
      <div class="pdcg-preview-row">
        <span class="pdcg-label">미리보기</span>
        <code id="pdCgPreview" class="pdcg-preview">-</code>
        <button class="btn btn-primary" id="pdCgApplyBtn" onclick="applyPdGeneratedCode()" disabled style="font-size:12px;padding:4px 14px">적용</button>
      </div>
    </div>
  </div>`

  document.getElementById('pdContent').innerHTML = `
    <div class="pd-section">
      <div class="pd-section-title">이미지</div>
      <div class="pd-img-row">${imgHtml}</div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">기본 정보</div>
      <div class="dfields-grid">
        ${pf('샘플번호', 'sampleNo', item.sampleNo)}
        ${productCodeField}
        ${pf('브랜드',        'brand',      item.brand,   'select', brandOpts, '', item.brand)}
        ${pf('상품명 (한글)', 'nameKr',     item.nameKr,  'text',   '', 'dfield-span2')}
        ${pf('상품명 (영문)', 'nameEn',     item.nameEn,  'text',   '', 'dfield-span2')}
        ${pf('색상 (한글)',   'colorKr',    item.colorKr)}
        ${pf('색상 (영문)',   'colorEn',    item.colorEn)}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">가격 / 타입</div>
      <div class="dfields-grid">
        ${pf('판매가', 'salePrice', item.salePrice, 'number')}
        ${pf('원가',   'costPrice', item.costPrice, 'number')}
        ${pf('타입',   'type',      item.type, 'select', typeOpts, '', typeLabel[item.type] || item.type)}
        ${pf('연도',   'year',      item.year)}
        ${pf('시즌',   'season',    item.season)}
        ${pf('성별',   'gender',    item.gender, 'select', genderOpts, '', genderLabel[item.gender] || item.gender)}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">메모</div>
      ${pf('메모', 'memo', item.memo, 'textarea', '', 'dfield-span2')}
    </div>
    <div class="pd-section">
      <div class="pd-section-title">일정 관리</div>
      <table class="plan-schedule-table">
        <thead><tr>
          <th class="pst-label-th">담당</th>
          <th class="pst-date-th">시작일</th>
          <th class="pst-date-th">완료예정일</th>
        </tr></thead>
        <tbody>${schedules.map(s => {
          const sch = item.schedule?.[s.key] || {}
          return `<tr>
            <td class="pst-label">${s.label}</td>
            <td class="pst-date-val${sch.start ? ' has-date' : ''}">
              <span class="pst-view">${fmtDate(sch.start)}</span>
              <input type="date" class="pst-edit" data-sched="${s.key}-start" value="${sch.start || ''}" />
            </td>
            <td class="pst-date-val${sch.end ? ' has-date' : ''}">
              <span class="pst-view">${fmtDate(sch.end)}</span>
              <input type="date" class="pst-edit" data-sched="${s.key}-end" value="${sch.end || ''}" />
            </td>
          </tr>`
        }).join('')}</tbody>
      </table>
    </div>`
}

// =============================================
// ===== 이미지 모달 =====
// =============================================
function openModal(idx, images) {
  State.modal.images = images
  State.modal.idx    = idx
  updateModal()
  document.getElementById('imageModal').showModal()
}

function updateModal() {
  const { images, idx } = State.modal
  document.getElementById('modalImg').src = images[idx] || ''
  document.getElementById('modalCounter').textContent = images.length > 1 ? `${idx+1} / ${images.length}` : ''
  document.getElementById('modalPrev').style.display = images.length > 1 ? '' : 'none'
  document.getElementById('modalNext').style.display = images.length > 1 ? '' : 'none'
}

function modalNav(dir) {
  const { images } = State.modal
  State.modal.idx = (State.modal.idx + dir + images.length) % images.length
  updateModal()
}

document.addEventListener('keydown', e => {
  const modal = document.getElementById('imageModal')
  if (!modal.open) return
  if (e.key === 'ArrowLeft')  modalNav(-1)
  if (e.key === 'ArrowRight') modalNav(1)
  if (e.key === 'Escape')     modal.close()
})

// =============================================
// ===== 엑셀 다운로드 =====
// =============================================
function downloadExcel(type) {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 라이브러리 로딩 중...', 'warning'); return }
  const data = State[type === 'product' ? 'product' : type === 'stock' ? 'stock' : type === 'plan' ? 'plan' : 'sales'].filtered
  let rows, headers, sheetName

  if (type === 'product' || type === 'plan') {
    headers = [
      'No.','브랜드','품번','샘플번호','카페24코드','바코드',
      '상품명(한글)','상품명(영문)','색상(한글)','색상(영문)',
      '판매가','원가',
      '타입','원단타입','백스타일','다리파임','가이드','가슴선','비침','안감','캡고리',
      '소재','원단설명','디자이너코멘트','세탁방법',
      '가슴(cm)','허리(cm)','엉덩이(cm)','모델착용사이즈',
      '제조년월','제조사','제조국',
      '영상URL',
      '이미지_르망고','이미지_느와','이미지_외부몰','이미지_SUM',
      '재고_XS','재고_S','재고_M','재고_L','재고_XL','재고_합계',
      ..._platforms.map(pl => '판매_' + pl), '판매_합계',
      '소진율(%)','등록일','물류완료일'
    ]
    rows = data.map(p => [
      p.no, p.brand, p.productCode, p.sampleNo||'', p.cafe24Code||'', p.barcode||'',
      p.nameKr||'', p.nameEn||'', p.colorKr||'', p.colorEn||'',
      p.salePrice||0, p.costPrice||0,
      p.type||'', p.fabricType||'', p.backStyle||'', p.legCut||'', p.guide||'', p.chestLine||'', p.transparency||'', p.lining||'', p.capRing||'',
      p.material||'', p.fabricType||'', p.comment||'', p.washMethod||'',
      p.bust||'', p.waist||'', p.hip||'', p.modelSize||'',
      p.madeMonth||'', p.madeBy||'', p.madeIn||'',
      p.videoUrl||'',
      (p.images?.lemango||[]).join('\n'),
      (p.images?.noir||[]).join('\n'),
      (p.images?.external||[]).join('\n'),
      (p.images?.sum||[]).join('\n'),
      p.stock?.XS||0, p.stock?.S||0, p.stock?.M||0, p.stock?.L||0, p.stock?.XL||0, getTotalStock(p),
      ..._platforms.map(pl => p.sales?.[pl]||0), getTotalSales(p),
      getExhaustion(p), p.registDate||'', p.logisticsDate||''
    ])
    sheetName = type === 'plan' ? '신규기획' : '상품전체'
  } else if (type === 'stock') {
    headers = ['품번','상품명','브랜드','판매가','XS','S','M','L','XL','합계']
    rows = data.map(p => [
      p.productCode, p.nameKr, p.brand, p.salePrice,
      p.stock?.XS||0, p.stock?.S||0, p.stock?.M||0, p.stock?.L||0, p.stock?.XL||0,
      getTotalStock(p)
    ])
    sheetName = '재고조회'
  } else {
    headers = ['품번','상품명','브랜드','판매가',..._platforms,'합계']
    rows = data.map(p => [
      p.productCode, p.nameKr, p.brand, p.salePrice,
      ..._platforms.map(pl => p.sales?.[pl]||0),
      getTotalSales(p)
    ])
    sheetName = '판매조회'
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  // 열 너비 자동 설정
  if (type === 'product') {
    ws['!cols'] = [
      {wch:5},{wch:12},{wch:16},{wch:12},{wch:10},
      {wch:20},{wch:20},{wch:8},{wch:8},
      {wch:8},{wch:8},
      {wch:10},{wch:8},{wch:16},{wch:10},{wch:8},{wch:8},
      {wch:30},{wch:10},{wch:40},{wch:16},
      {wch:30},{wch:14},
      {wch:12},{wch:16},{wch:10},
      {wch:35},
      {wch:50},{wch:50},{wch:50},{wch:60},
      {wch:6},{wch:6},{wch:6},{wch:6},{wch:6},{wch:8},
      {wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},
      {wch:8},{wch:10},{wch:10}
    ]
    // 줄바꿈 허용 (이미지 URL 셀)
    ws['!rows'] = rows.map(() => ({ hpt: 60 }))
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'')
  XLSX.writeFile(wb, `르망고_${sheetName}_${today}.xlsx`)
  showToast(`${sheetName} 다운로드 완료`, 'success')
}

// ===== 상품 업로드용 컬럼 인덱스 =====
// 헤더 2행 구조: 실제 데이터는 3행(index 2)부터
// col: no(0) 상품코드(1) 이미지(2) 상품명(3) 영문상품명(4)
//      색상한글(5) 색상영문(6) 원가(7) 판매가(8) 사이즈(9)
//      모델착용(10) 소재(11) 원단설명(12) 디자이너코멘트(13) 세탁방법(14)
//      type(15) backStyle(16) legCut(17) 가슴선(18) 가이드(19)
//      제조년월(20) 제조사(21) 제조국(22) 모델컷(23) 제품컷(24)
//      파일명(25) 르망고자사몰(26) 느와자사몰(27) 외부몰(28) SUM(29) 영상(30) 코디상품(31)
const UPLOAD_COL = {
  no: 0, code: 1, nameKr: 3, nameEn: 4,
  colorKr: 5, colorEn: 6, costPrice: 7, salePrice: 8,
  sizeSpec: 9, modelSize: 10, material: 11, fabricType: 12,
  comment: 13, washMethod: 14, type: 15, backStyle: 16,
  legCut: 17, guide: 19, madeMonth: 20, madeBy: 21, madeIn: 22,
  urlLemango: 26, urlNoir: 27, urlExternal: 28, urlSum: 29, videoUrl: 30
}

function parseSumUrls(cellValue) {
  if (!cellValue) return []
  return String(cellValue)
    .split(/[\n\r]+/)
    .map(u => u.trim())
    .filter(u => u.startsWith('http'))
}

// ===== 샘플 파일 (product만 실제 구조 적용) =====
function downloadSample(type) {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }

  let aoa, filename, sheetName

  if (type === 'product') {
    // 2행 헤더 구조 (원본 Sheet2와 동일)
    const row1 = ['no.','상품코드','이미지','상품명','영문상품명','색상','','금액','','사이즈(cm)','모델 착용사이즈','소재','원단설명','디자이너코멘트','세탁방법','type','back style','leg cut','가슴선','가이드','제조','','','촬영여부','','파일명','url','','','','','코디상품']
    const row2 = ['','','','','','한글','영문','원가','판매가','','','','','','','','','','','','제조년월','제조사','제조국','모델컷','제품컷','','르망고 자사몰','느와 자사몰','외부몰','SUM','영상','']
    const ex   = [
      1,'5SW029','','루나르 투피스','LUNAR Two-Piece','블랙','black','-',330000,
      's LENGTH-27.5 / BUST-30.5','s','Shell: P80% SP20%','포일',
      '플라워 모티프 아플리케와 금속장식 디테일','손세탁','bikini','','로우컷','보통','없음',
      '2025년 12월','주식회사 르망고','대한민국','o','x','5SW029',
      'https://lemango.cafe24.com/goods/noir/2025/5SW029/5SW029_01.jpg',
      'https://lemangonoir.cafe24.com/goods/2025/5SW029/5SW029_01.jpg',
      '',
      'https://lemango.cafe24.com/goods/noir/2025/5SW029_SUM/1000_1.jpg\nhttps://lemango.cafe24.com/goods/noir/2025/5SW029_SUM/1000_2.jpg',
      'https://youtube.com/shorts/example','없음'
    ]
    aoa = [row1, row2, ex]
    filename = '르망고_상품등록_샘플.xlsx'
    sheetName = '상품등록'
  } else if (type === 'stock') {
    aoa = [
      ['입고일','품번','사이즈','바코드','수량','메모'],
      ['2026-03-17','LSWON16266707','XS','8800354901570',10,''],
      ['2026-03-17','LSWON16266707','S', '8800354901587',15,''],
      ['2026-03-17','LSWON16266707','M', '8800354902027',20,''],
      ['2026-03-17','LSWON16266707','L', '8800354901594',15,''],
      ['2026-03-17','LSWON16266707','XL','8800354901600',5, '입고예시']
    ]
    filename = '르망고_재고_샘플.xlsx'
    sheetName = '재고'
  } else {
    aoa = [
      ['품번','상품명','날짜',..._platforms],
      ['LSWON16266707','코트다쥐르 쉘','2026-03-01',..._platforms.map((_,i) => i===0?10:i===1?5:i===2?8:i===3?3:2)]
    ]
    filename = '르망고_판매_샘플.xlsx'
    sheetName = '판매'
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // 열 너비 설정 (상품 샘플)
  if (type === 'product') {
    ws['!cols'] = [
      {wch:5},{wch:14},{wch:8},{wch:18},{wch:20},{wch:8},{wch:8},
      {wch:8},{wch:8},{wch:30},{wch:12},{wch:25},{wch:8},{wch:40},{wch:12},
      {wch:10},{wch:18},{wch:10},{wch:8},{wch:8},{wch:12},{wch:16},{wch:10},
      {wch:6},{wch:6},{wch:10},{wch:45},{wch:45},{wch:45},{wch:60},{wch:35},{wch:10}
    ]
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
  showToast('샘플 파일 다운로드 완료', 'success')
}

// ===== 업로드 처리 =====
function handleUpload(input, type) {
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  const reader = new FileReader()
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      if (type === 'product') {
        uploadProducts(raw)
      } else if (type === 'stock') {
        uploadStock(raw)
      } else {
        uploadSales(raw)
      }
    } catch (err) {
      showToast('파일 읽기 오류: ' + err.message, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
}

function uploadProducts(raw) {
  // 2행 헤더 → 데이터는 index 2부터
  const dataRows = raw.slice(2).filter(r => r[UPLOAD_COL.code])
  if (!dataRows.length) { showToast('데이터가 없습니다.', 'error'); return }

  let added = 0, updated = 0
  dataRows.forEach(row => {
    const code = String(row[UPLOAD_COL.code]).trim()
    if (!code) return

    const sumUrls  = parseSumUrls(row[UPLOAD_COL.urlSum])
    const lemUrls  = parseSumUrls(row[UPLOAD_COL.urlLemango])
    const noirUrls = parseSumUrls(row[UPLOAD_COL.urlNoir])
    const extUrls  = parseSumUrls(row[UPLOAD_COL.urlExternal])

    const product = {
      no:          State.allProducts.length + 1,
      brand:       '르망고 느와',
      productCode: code,
      cafe24Code:  code,
      barcode:     '',
      nameKr:      String(row[UPLOAD_COL.nameKr]  || ''),
      nameEn:      String(row[UPLOAD_COL.nameEn]  || ''),
      colorKr:     String(row[UPLOAD_COL.colorKr] || ''),
      colorEn:     String(row[UPLOAD_COL.colorEn] || ''),
      costPrice:   Number(row[UPLOAD_COL.costPrice])  || 0,
      salePrice:   Number(row[UPLOAD_COL.salePrice])  || 0,
      sizeSpec:    String(row[UPLOAD_COL.sizeSpec]    || ''),
      modelSize:   String(row[UPLOAD_COL.modelSize]   || ''),
      material:    String(row[UPLOAD_COL.material]    || ''),
      fabricType:  String(row[UPLOAD_COL.fabricType]  || ''),
      comment:     String(row[UPLOAD_COL.comment]     || ''),
      type:        String(row[UPLOAD_COL.type]        || ''),
      backStyle:   String(row[UPLOAD_COL.backStyle]   || ''),
      legCut:      String(row[UPLOAD_COL.legCut]      || ''),
      guide:       String(row[UPLOAD_COL.guide]       || ''),
      madeMonth:   String(row[UPLOAD_COL.madeMonth]   || ''),
      madeBy:      String(row[UPLOAD_COL.madeBy]      || ''),
      madeIn:      String(row[UPLOAD_COL.madeIn]      || ''),
      videoUrl:    String(row[UPLOAD_COL.videoUrl]    || '') || null,
      chestLine:   '',
      transparency:'',
      lining:      '',
      capRing:     '',
      bust:        '',
      waist:       '',
      hip:         '',
      images: {
        lemango:  lemUrls,
        noir:     noirUrls,
        external: extUrls,
        sum:      sumUrls   // ← 목록 이미지로 사용
      },
      stock: { XS: 0, S: 0, M: 0, L: 0, XL: 0 },
      sales: Object.fromEntries(_platforms.map(pl => [pl, 0])),
      registDate: new Date().toISOString().slice(0, 10),
      logisticsDate: null
    }

    const idx = State.allProducts.findIndex(p => p.productCode === code)
    if (idx >= 0) {
      // 기존 품번 → 이미지/기본정보 업데이트 (재고·판매는 유지)
      State.allProducts[idx] = { ...State.allProducts[idx], ...product,
        stock: State.allProducts[idx].stock,
        sales: State.allProducts[idx].sales }
      updated++
    } else {
      State.allProducts.push(product)
      added++
    }
  })

  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  State.sales.filtered   = [...State.allProducts]
  renderProductTable()
  renderStockTable()
  renderSalesTable()
  renderDashboard()
  showToast(`업로드 완료: 신규 ${added}건 / 업데이트 ${updated}건`, 'success')
}

function uploadStock(raw) {
  // 헤더 1행, 데이터 index 1부터. 컬럼: 품번(0) 상품명(1) XS(2) S(3) M(4) L(5) XL(6)
  const dataRows = raw.slice(1).filter(r => r[0])
  let cnt = 0
  dataRows.forEach(row => {
    const code = String(row[0]).trim()
    const p = State.allProducts.find(p => p.productCode === code)
    if (!p) return
    p.stock = { XS: +row[2]||0, S: +row[3]||0, M: +row[4]||0, L: +row[5]||0, XL: +row[6]||0 }
    cnt++
  })
  State.stock.filtered = [...State.allProducts]
  renderStockTable()
  renderDashboard()
  showToast(`재고 업데이트: ${cnt}건`, 'success')
}

function uploadSales(raw) {
  // 헤더 1행. 컬럼: 품번(0) 상품명(1) 날짜(2) 공홈(3) GS(4) 29cm(5) W쇼핑(6) 기타(7)
  const dataRows = raw.slice(1).filter(r => r[0])
  let cnt = 0
  dataRows.forEach(row => {
    const code = String(row[0]).trim()
    const p = State.allProducts.find(p => p.productCode === code)
    if (!p) return
    _platforms.forEach((pl, i) => {
      p.sales[pl] = (p.sales[pl] || 0) + (+row[3 + i]||0)
    })
    cnt++
  })
  State.sales.filtered = [...State.allProducts]
  renderSalesTable()
  renderDashboard()
  showToast(`판매 업데이트: ${cnt}건`, 'success')
}

// =============================================
// ===== 토스트 =====
// =============================================
function showToast(msg, type = '') {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = `toast ${type} show`
  clearTimeout(el._timer)
  el._timer = setTimeout(() => { el.className = 'toast' }, 3000)
}

// =============================================
// ===== 상품 상세 모달 =====
// =============================================
let _detailCode = null        // 현재 열린 상품 코드
let _detailPendingCode = null  // 상세 모달 품번 생성 패널에서 임시 예약한 코드

// 드래그 + 리사이즈 초기화 (최초 1회)
function initRegisterDraggable() {
  const modal  = document.getElementById('registerModal')
  const header = modal.querySelector('.rmodal-header')
  let dragging = false, startX, startY, origLeft, origTop

  function snapRect() {
    const rect = modal.getBoundingClientRect()
    modal.style.left = rect.left + 'px'
    modal.style.top  = rect.top  + 'px'
  }

  header.addEventListener('mousedown', e => {
    if (e.target.closest('button, label, input')) return
    snapRect()
    dragging = true
    startX = e.clientX; startY = e.clientY
    origLeft = parseFloat(modal.style.left)
    origTop  = parseFloat(modal.style.top)
    e.preventDefault()
  })

  document.addEventListener('mousemove', e => {
    if (!dragging) return
    const dx = e.clientX - startX, dy = e.clientY - startY
    modal.style.left = Math.max(0, Math.min(origLeft + dx, window.innerWidth  - modal.offsetWidth))  + 'px'
    modal.style.top  = Math.max(0, Math.min(origTop  + dy, window.innerHeight - modal.offsetHeight)) + 'px'
  })

  document.addEventListener('mouseup', () => { dragging = false })
}

function initPlanRegisterDraggable() {
  const modal  = document.getElementById('planRegisterModal')
  const header = modal.querySelector('.rmodal-header')
  let dragging = false, startX, startY, origLeft, origTop

  function snapRect() {
    const rect = modal.getBoundingClientRect()
    modal.style.left = rect.left + 'px'
    modal.style.top  = rect.top  + 'px'
  }

  header.addEventListener('mousedown', e => {
    if (e.target.closest('button, label, input, textarea, select')) return
    snapRect()
    dragging = true
    startX = e.clientX; startY = e.clientY
    origLeft = parseFloat(modal.style.left)
    origTop  = parseFloat(modal.style.top)
    e.preventDefault()
  })

  document.addEventListener('mousemove', e => {
    if (!dragging) return
    const dx = e.clientX - startX, dy = e.clientY - startY
    modal.style.left = Math.max(0, Math.min(origLeft + dx, window.innerWidth  - modal.offsetWidth))  + 'px'
    modal.style.top  = Math.max(0, Math.min(origTop  + dy, window.innerHeight - modal.offsetHeight)) + 'px'
  })

  document.addEventListener('mouseup', () => { dragging = false })
}

function initPlanDetailDraggable() {
  const modal  = document.getElementById('planDetailModal')
  const header = modal.querySelector('.rmodal-header')
  let dragging = false, startX, startY, origLeft, origTop

  function snapRect() {
    const rect = modal.getBoundingClientRect()
    modal.style.left = rect.left + 'px'
    modal.style.top  = rect.top  + 'px'
  }

  header.addEventListener('mousedown', e => {
    if (e.target.closest('button')) return
    snapRect()
    dragging = true
    startX = e.clientX; startY = e.clientY
    origLeft = parseFloat(modal.style.left)
    origTop  = parseFloat(modal.style.top)
    e.preventDefault()
  })

  document.addEventListener('mousemove', e => {
    if (!dragging) return
    const dx = e.clientX - startX, dy = e.clientY - startY
    modal.style.left = Math.max(0, Math.min(origLeft + dx, window.innerWidth  - modal.offsetWidth))  + 'px'
    modal.style.top  = Math.max(0, Math.min(origTop  + dy, window.innerHeight - modal.offsetHeight)) + 'px'
  })

  document.addEventListener('mouseup', () => { dragging = false })
}

// =============================================
// ===== 범용 드래그 + 리사이즈 초기화 =====
// =============================================
function makeDraggableResizable(modal, minW = 420, minH = 300) {
  const header = modal.querySelector('.srm-header, .rmodal-header, .dmodal-header')
  if (!header) return

  let action = null, startX, startY, origLeft, origTop, origW, origH

  function snapRect() {
    const r = modal.getBoundingClientRect()
    modal.style.left   = r.left   + 'px'
    modal.style.top    = r.top    + 'px'
    modal.style.width  = r.width  + 'px'
    modal.style.height = r.height + 'px'
  }

  // 드래그
  header.addEventListener('mousedown', e => {
    if (e.target.closest('button, input, label, select, textarea, a')) return
    snapRect()
    action = 'drag'
    startX = e.clientX; startY = e.clientY
    origLeft = parseFloat(modal.style.left)
    origTop  = parseFloat(modal.style.top)
    e.preventDefault()
  })

  // 리사이즈 핸들 주입 (이미 있으면 스킵)
  const DIRS = ['t','b','l','r','lt','rt','lb','rb']
  DIRS.forEach(dir => {
    if (modal.querySelector(`.resize-handle.${dir}`)) return
    const h = document.createElement('div')
    h.className = `resize-handle ${dir}`
    h.dataset.dir = dir
    modal.appendChild(h)
    h.addEventListener('mousedown', e => {
      snapRect()
      action = dir
      startX = e.clientX; startY = e.clientY
      origLeft = parseFloat(modal.style.left); origTop = parseFloat(modal.style.top)
      origW = parseFloat(modal.style.width);   origH  = parseFloat(modal.style.height)
      e.preventDefault(); e.stopPropagation()
    })
  })

  document.addEventListener('mousemove', e => {
    if (!action) return
    const dx = e.clientX - startX, dy = e.clientY - startY
    if (action === 'drag') {
      modal.style.left = Math.max(0, Math.min(origLeft + dx, window.innerWidth  - modal.offsetWidth))  + 'px'
      modal.style.top  = Math.max(0, Math.min(origTop  + dy, window.innerHeight - modal.offsetHeight)) + 'px'
      return
    }
    let newL = origLeft, newT = origTop, newW = origW, newH = origH
    if (action.includes('r'))  newW = Math.max(minW, origW + dx)
    if (action.includes('l')) { newW = Math.max(minW, origW - dx); newL = origLeft + origW - newW }
    if (action.includes('b'))  newH = Math.max(minH, origH + dy)
    if (action.includes('t')) { newH = Math.max(minH, origH - dy); newT = origTop  + origH - newH }
    newL = Math.max(0, Math.min(newL, window.innerWidth  - newW))
    newT = Math.max(0, Math.min(newT, window.innerHeight - newH))
    modal.style.left = newL + 'px'; modal.style.top  = newT  + 'px'
    modal.style.width = newW + 'px'; modal.style.height = newH + 'px'
  })

  document.addEventListener('mouseup', () => { action = null })
}

function centerModal(modal) {
  modal.style.left = ''
  modal.style.top  = ''
  requestAnimationFrame(() => {
    modal.style.left = Math.max(0, (window.innerWidth  - modal.offsetWidth)  / 2) + 'px'
    modal.style.top  = Math.max(0, (window.innerHeight - modal.offsetHeight) / 2) + 'px'
  })
}

function initDraggable() {
  const modal  = document.getElementById('detailModal')
  const header = modal.querySelector('.dmodal-header')
  const MIN_W  = 480, MIN_H = 300

  let action = null  // 'drag' | 리사이즈 방향 문자열
  let startX, startY, origLeft, origTop, origW, origH

  function snapRect() {
    const rect = modal.getBoundingClientRect()
    modal.style.left   = rect.left   + 'px'
    modal.style.top    = rect.top    + 'px'
    modal.style.width  = rect.width  + 'px'
    modal.style.height = rect.height + 'px'
  }

  // 드래그
  header.addEventListener('mousedown', e => {
    if (e.target.closest('button')) return
    snapRect()
    action = 'drag'
    startX = e.clientX; startY = e.clientY
    origLeft = parseFloat(modal.style.left)
    origTop  = parseFloat(modal.style.top)
    e.preventDefault()
  })

  // 리사이즈 핸들
  modal.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      snapRect()
      action = handle.dataset.dir
      startX = e.clientX; startY = e.clientY
      origLeft = parseFloat(modal.style.left)
      origTop  = parseFloat(modal.style.top)
      origW    = parseFloat(modal.style.width)
      origH    = parseFloat(modal.style.height)
      e.preventDefault()
      e.stopPropagation()
    })
  })

  document.addEventListener('mousemove', e => {
    if (!action) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    if (action === 'drag') {
      modal.style.left = Math.max(0, Math.min(origLeft + dx, window.innerWidth  - modal.offsetWidth))  + 'px'
      modal.style.top  = Math.max(0, Math.min(origTop  + dy, window.innerHeight - modal.offsetHeight)) + 'px'
      return
    }

    let newL = origLeft, newT = origTop, newW = origW, newH = origH

    if (action.includes('r'))  newW = Math.max(MIN_W, origW + dx)
    if (action.includes('l')) { newW = Math.max(MIN_W, origW - dx); newL = origLeft + origW - newW }
    if (action.includes('b'))  newH = Math.max(MIN_H, origH + dy)
    if (action.includes('t')) { newH = Math.max(MIN_H, origH - dy); newT = origTop  + origH - newH }

    // 화면 밖으로 나가지 않게
    newL = Math.max(0, Math.min(newL, window.innerWidth  - newW))
    newT = Math.max(0, Math.min(newT, window.innerHeight - newH))

    modal.style.left   = newL + 'px'
    modal.style.top    = newT + 'px'
    modal.style.width  = newW + 'px'
    modal.style.height = newH + 'px'
  })

  document.addEventListener('mouseup', () => { action = null })
}

function copyFieldUrl(key, btn) {
  // 뷰모드: dfield-value[data-urlkey], 수정모드: textarea/input[data-key]
  const modal = document.getElementById('detailModal')
  const isEdit = modal.classList.contains('edit-mode')
  let text = ''
  if (isEdit) {
    const el = modal.querySelector(`[data-key="${key}"]`)
    text = el ? el.value.trim() : ''
  } else {
    const el = modal.querySelector(`[data-urlkey="${key}"]`)
    text = el ? el.textContent.trim() : ''
    if (text === '-') text = ''
  }
  if (!text) { showToast('복사할 URL이 없습니다.', 'warning'); return }
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent
    btn.textContent = '복사됨!'
    btn.style.background = 'var(--success)'
    setTimeout(() => { btn.textContent = orig; btn.style.background = '' }, 1500)
  }).catch(() => showToast('복사 실패', 'error'))
}

// 개별 URL 복사 (data-url 속성 또는 수정모드 textarea 기준)
function copySingleUrlFromBtn(btn) {
  const modal = document.getElementById('detailModal')
  const isEdit = modal.classList.contains('edit-mode')
  let url = ''
  if (isEdit) {
    const dfield = btn.closest('.dfield')
    const textarea = dfield ? dfield.querySelector('textarea') : null
    url = textarea ? textarea.value.trim() : (btn.dataset.url || '')
  } else {
    url = btn.dataset.url || ''
  }
  if (!url) { showToast('복사할 URL이 없습니다.', 'warning'); return }
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent
    btn.textContent = '복사됨!'
    btn.style.background = 'var(--success)'
    setTimeout(() => { btn.textContent = orig; btn.style.background = '' }, 1500)
  }).catch(() => showToast('복사 실패', 'error'))
}

function openDetailModal(productCode) {
  const p = State.allProducts.find(x => x.productCode === productCode)
  if (!p) return
  _detailCode = productCode

  const modal = document.getElementById('detailModal')
  modal.classList.remove('edit-mode')
  document.getElementById('dEditBtn').textContent = '✏️ 수정'
  // 품번확정 버튼 상태
  const lockBtn = document.getElementById('dLockCodeBtn')
  if (lockBtn) {
    lockBtn.style.display = p.productCodeLocked ? 'none' : ''
    lockBtn.textContent = '🔒 품번 확정'
  }
  // 위치 초기화 (매번 열릴 때 중앙으로)
  modal.style.left = ''
  modal.style.top  = ''

  // 헤더
  document.getElementById('dBrand').textContent   = p.brand
  document.getElementById('dNameKr').textContent  = p.nameKr || ''
  document.getElementById('dCode').textContent    = p.productCode

  // 이미지 (SUM 첫 번째 우선, 없으면 다른 이미지, 없으면 로고)
  const FALLBACK_LOGO = 'file:////lemangokorea/온라인/01.이미지/로고/Lemango/르망고_송부용_로고(WH).png'
  const allImgs = getAllImages(p)
  const sumFirst = p.images?.sum?.[0] || null
  const mainImg = document.getElementById('dImgMain')
  const noneEl  = document.getElementById('dImgNone')
  mainImg.src = sumFirst || allImgs[0] || FALLBACK_LOGO
  mainImg.style.display = ''
  noneEl.style.display = 'none'
  mainImg.style.cursor = 'pointer'
  mainImg.title = '클릭하면 새 탭에서 열립니다'
  mainImg.onclick = () => { if (mainImg.src) window.open(mainImg.src) }
  // 썸네일
  document.getElementById('dImgThumbs').innerHTML = allImgs.map((url, i) =>
    `<img src="${url}" class="dimg-thumb${i===0?' active':''}" onclick="dSwitchImg(this,'${url}')" onerror="this.style.display='none'" />`
  ).join('')

  // 영상
  const vw = document.getElementById('dVideoWrap')
  if (p.videoUrl) {
    document.getElementById('dVideoLink').href = p.videoUrl
    vw.style.display = ''
  } else {
    vw.style.display = 'none'
  }

  // 오른쪽 상세 내용
  document.getElementById('dDetailContent').innerHTML = buildDetailContent(p)

  modal.showModal()
  centerModal(modal)
}

function dSwitchImg(el, url) {
  document.getElementById('dImgMain').src = url
  document.getElementById('dImgMain').style.display = ''
  document.querySelectorAll('.dimg-thumb').forEach(t => t.classList.remove('active'))
  el.classList.add('active')
}

function buildDetailContent(p) {
  const sizes  = ['XS','S','M','L','XL']
  const platforms = _platforms

  // 품번 생성 패널 상수
  const DCG_CLS_OPT  = [['LS','르망고 수영복'],['LW','르망고 의류'],['LG','르망고 굿즈'],['NS','느와 수영복'],['NW','느와 의류'],['NG','느와 굿즈']]
  const DCG_TYP_OPT  = [['ON','원피스'],['MO','모노키니'],['BK','비키니'],['BR','브리프'],['JM','재머'],['RG','래시가드'],['AL','애슬레저'],['GM','의류'],['SC','수영모'],['BG','가방'],['ET','기타']]
  const DCG_GEN_OPT  = [['W','여성'],['M','남성'],['G','걸즈'],['B','보이즈'],['N','공용'],['K','키즈']]
  const DCG_YEAR_OPT = ['1','2','3','4','5','6','7','8','9','0']

  // 기존 품번에서 기본값 추측
  const existCode = p.productCode || ''
  const dcgClsGuess  = existCode.length >= 2  ? existCode.slice(0,2)  : (p.brand?.includes('느와') ? 'NS' : 'LS')
  const dcgGenGuess  = existCode.length >= 3  ? existCode.slice(2,3)  : 'W'
  const dcgTypGuess  = existCode.length >= 5  ? existCode.slice(3,5)  : 'ON'
  const dcgDesGuess  = existCode.length >= 9  ? existCode.slice(5,9)  : '1626'
  const dcgYearGuess = existCode.length >= 10 ? existCode.slice(9,10) : '6'
  const dcgSeaGuess  = existCode.length >= 11 ? existCode.slice(10,11): '1'

  const dcgMkSel = (id, opts, guess) =>
    `<select id="${id}" onchange="updateDetailProductCode()">${opts.map(([v,l]) => `<option value="${v}"${v===guess?' selected':''}>${v}${l?' - '+l:''}</option>`).join('')}</select>`

  const productCodeField = p.productCodeLocked
    ? `<div class="dfield">
        <span class="dfield-label">품번</span>
        <span class="dfield-value" style="display:flex;align-items:center;gap:6px">
          ${p.productCode}
          <span style="font-size:10px;background:var(--primary);color:#fff;padding:2px 7px;border-radius:10px;vertical-align:middle">확정됨</span>
        </span>
        <input type="text" data-key="productCode" value="${(p.productCode||'').replace(/"/g,'&quot;')}" readonly style="background:#f0f0f0;color:#888;cursor:not-allowed" />
      </div>`
    : `<div class="dfield span2">
        <span class="dfield-label">품번</span>
        <span class="dfield-value${!existCode ? ' empty' : ''}">${existCode || '-'}</span>
        <div class="pdcg-input-row dcg-edit-only">
          <input type="text" data-key="productCode" id="dCgProductCodeInput" value="${existCode.replace(/"/g,'&quot;')}" placeholder="품번 직접 입력" />
          <button class="btn btn-outline pdcg-toggle-btn" onclick="toggleDetailCodeGenPanel()" style="font-size:11px;padding:4px 12px;white-space:nowrap">품번 생성 ▾</button>
        </div>
        <div id="dCgPanel" class="pd-codegen-panel" style="display:none">
          <div class="pdcg-selects">
            <div class="pdcg-group"><label>분류</label>${dcgMkSel('dCgCls', DCG_CLS_OPT, dcgClsGuess)}</div>
            <div class="pdcg-group"><label>성별</label>${dcgMkSel('dCgGen', DCG_GEN_OPT, dcgGenGuess)}</div>
            <div class="pdcg-group"><label>타입</label>${dcgMkSel('dCgTyp', DCG_TYP_OPT, dcgTypGuess)}</div>
            <div class="pdcg-group"><label>연도</label>${dcgMkSel('dCgYear', DCG_YEAR_OPT.map(v=>[v,'']), dcgYearGuess)}</div>
            <div class="pdcg-group"><label>시즌</label>${dcgMkSel('dCgSeason', ['1','2','3','4','5'].map(v=>[v,'']), dcgSeaGuess)}</div>
          </div>
          <div class="pdcg-design-row">
            <label>디자인 번호 (패턴)</label>
            <input type="text" id="dCgDesignSearch" placeholder="코드 또는 패턴명 검색" oninput="filterDetailDesignList()" autocomplete="off" class="design-search-input" />
            <div id="dCgDesignDropdown" class="design-dropdown" style="max-height:160px;overflow-y:auto"></div>
            <input type="hidden" id="dCgDesign" value="${dcgDesGuess}" />
          </div>
          <div class="pdcg-preview-row">
            <span class="pdcg-label">미리보기</span>
            <code id="dCgPreview" class="pdcg-preview">-</code>
            <button class="btn btn-primary" id="dCgApplyBtn" onclick="applyDetailGeneratedCode()" disabled style="font-size:12px;padding:4px 14px">적용</button>
          </div>
        </div>
      </div>`

  const field = (label, key, val, type='text', opts='', spanClass='') =>
    `<div class="dfield ${spanClass}">
      <span class="dfield-label">${label}</span>
      <span class="dfield-value${!val ? ' empty' : ''}${type==='textarea' ? ' long' : ''}">${val || '-'}</span>
      ${type==='select'
        ? `<select data-key="${key}">${opts}</select>`
        : type==='textarea'
          ? `<textarea data-key="${key}" rows="4">${val||''}</textarea>`
          : `<input type="${type}" data-key="${key}" value="${(val||'').toString().replace(/"/g,'&quot;')}" />`
      }
    </div>`

  // URL 필드 (복사 버튼 포함) — textarea 타입은 URL별 개별 복사 버튼 표시
  const urlField = (label, key, val, type='text') => {
    if (type === 'textarea') {
      const urls = val ? val.split(/[\n\r]+/).map(u => u.trim()).filter(Boolean) : []
      const hasUrls = urls.length > 0
      const urlItems = hasUrls
        ? urls.map(u => {
            const safeU = u.replace(/"/g, '&quot;')
            return `<div class="url-item">
              <span class="url-item-text" title="${safeU}">${safeU}</span>
              <button type="button" class="btn-copy-url btn-copy-single" data-url="${safeU}" onclick="copySingleUrlFromBtn(this)">복사</button>
            </div>`
          }).join('')
        : '<span class="url-empty-text">-</span>'
      const allCopyBtn = urls.length > 1
        ? `<button type="button" class="btn-copy-url" data-url="${(val||'').replace(/"/g,'&quot;')}" onclick="copySingleUrlFromBtn(this)" title="전체 URL 복사">전체복사</button>`
        : ''
      return `<div class="dfield span3">
        <div class="dfield-label-row">
          <span class="dfield-label">${label}</span>
          ${allCopyBtn}
        </div>
        <div class="url-list${!hasUrls ? ' empty' : ''}" data-urlkey="${key}">${urlItems}</div>
        <textarea data-key="${key}" rows="4">${val||''}</textarea>
      </div>`
    }
    // text 타입 (영상 URL 등 단일값)
    const safeVal = (val||'').replace(/"/g, '&quot;')
    return `<div class="dfield span3">
      <div class="dfield-label-row">
        <span class="dfield-label">${label}</span>
        ${val ? `<button type="button" class="btn-copy-url" data-url="${safeVal}" onclick="copySingleUrlFromBtn(this)" title="클립보드 복사">복사</button>` : ''}
      </div>
      <span class="dfield-value${!val ? ' empty' : ''}" data-urlkey="${key}">${val || '-'}</span>
      <input type="${type}" data-key="${key}" value="${safeVal}" />
    </div>`
  }

  const mkOpts = (items, curVal) => items.map(item => {
    const [val, label] = Array.isArray(item) ? item : [item, item]
    return `<option value="${val}"${curVal===val?' selected':''}>${label}</option>`
  }).join('')
  const typeOpts        = mkOpts(_settings.types,          p.type)
  const legOpts         = mkOpts(_settings.legCuts,        p.legCut)
  const chestLineOpts   = mkOpts(_settings.chestLines,     p.chestLine||'')
  const transparencyOpts= mkOpts(_settings.transparencies, p.transparency||'')
  const liningOpts      = mkOpts(_settings.linings,        p.lining||'')
  const capRingOpts     = mkOpts(_settings.capRings,       p.capRing||'')
  const fabricOpts      = mkOpts(_settings.fabricTypes,    p.fabricType||'')
  const brandOpts       = mkOpts(_settings.brands,         p.brand)
  const saleStatusOpts  = mkOpts(_settings.saleStatuses,   p.saleStatus||'판매중')

  return `
    <div class="dsection">
      <div class="dsection-title">기본 정보</div>
      <div class="dsection-grid">
        ${field('브랜드',    'brand',       p.brand,    'select', brandOpts)}
        ${field('판매상태',  'saleStatus',  p.saleStatus||'판매중', 'select', saleStatusOpts)}
        ${productCodeField}
        ${field('샘플번호',  'sampleNo',    p.sampleNo)}
        ${field('카페24 코드', 'cafe24Code', p.cafe24Code)}
        ${field('바코드',    'barcode',     p.barcode)}
        ${field('상품명(한글)', 'nameKr',   p.nameKr,   'text','','span2')}
        ${field('상품명(영문)', 'nameEn',   p.nameEn,   'text','','span2')}
        ${field('색상(한글)', 'colorKr',   p.colorKr)}
        ${field('색상(영문)', 'colorEn',   p.colorEn)}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">가격 / 디자인</div>
      <div class="dsection-grid">
        ${field('판매가(원)', 'salePrice',  p.salePrice ? p.salePrice.toLocaleString()+'원' : '-', 'number')}
        ${field('원가(원)',   'costPrice',  p.costPrice ? p.costPrice.toLocaleString()+'원' : '-', 'number')}
        ${field('타입',       'type',       p.type,     'select', typeOpts)}
        ${field('원단타입',   'fabricType', p.fabricType, 'select', fabricOpts)}
        ${field('백스타일',   'backStyle',  p.backStyle)}
        ${field('다리파임',   'legCut',     p.legCut,   'select', legOpts)}
        ${field('가이드',     'guide',      p.guide)}
        ${field('가슴선',     'chestLine',  p.chestLine,'select', chestLineOpts)}
        ${field('비침',       'transparency',p.transparency,'select', transparencyOpts)}
        ${field('안감',       'lining',     p.lining,   'select', liningOpts)}
        ${field('캡고리',     'capRing',    p.capRing,  'select', capRingOpts)}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">소재</div>
      <div class="dsection-grid col1">
        ${field('소재',     'material',   p.material,   'textarea','','span3')}
        ${field('원단설명', 'fabricType', p.fabricType, 'textarea','','span3')}
        ${field('디자이너 코멘트', 'comment', p.comment, 'textarea','','span3')}
        ${field('세탁방법', 'washMethod', p.washMethod, 'textarea','','span3')}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">사이즈 규격</div>
      <div class="dsection-grid">
        ${field('가슴(cm)', 'bust',  p.bust)}
        ${field('허리(cm)', 'waist', p.waist)}
        ${field('엉덩이(cm)', 'hip', p.hip)}
        ${field('모델 착용사이즈', 'modelSize', p.modelSize, 'text','','span3')}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">제조 정보</div>
      <div class="dsection-grid">
        ${field('제조년월', 'madeMonth', p.madeMonth)}
        ${field('제조사',   'madeBy',    p.madeBy)}
        ${field('제조국',   'madeIn',    p.madeIn)}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">재고 현황</div>
      <div style="padding:10px 12px">
        <div class="dstock-row">
          ${sizes.map(sz => {
            const n = p.stock?.[sz] || 0
            return `<div class="dstock-badge">
              <span class="dstock-size">${sz}</span>
              <span class="dstock-num${n===0?' zero':''}">${n}</span>
            </div>`
          }).join('')}
          <div class="dstock-badge" style="background:var(--table-header)">
            <span class="dstock-size">합계</span>
            <span class="dstock-num">${getTotalStock(p)}</span>
          </div>
        </div>
        <div class="dprod-status-row">
          <span class="dprod-status-label">생산 상태</span>
          <button type="button"
            class="dprod-btn${(p.productionStatus||'지속생산')==='지속생산' ? ' active' : ''}"
            data-status="지속생산"
            onclick="setProductionStatus(this, '지속생산')">지속생산</button>
          <button type="button"
            class="dprod-btn${(p.productionStatus||'지속생산')==='생산중단' ? ' active danger' : ''}"
            data-status="생산중단"
            onclick="setProductionStatus(this, '생산중단')">생산중단</button>
        </div>
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">판매 현황</div>
      <div style="padding:10px 12px">
        <div class="dstock-row">
          ${platforms.map(pl => {
            const n = p.sales?.[pl] || 0
            return `<div class="dstock-badge">
              <span class="dstock-size">${pl}</span>
              <span class="dstock-num">${n}</span>
            </div>`
          }).join('')}
          <div class="dstock-badge" style="background:var(--table-header)">
            <span class="dstock-size">합계</span>
            <span class="dstock-num">${getTotalSales(p)}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">이미지 URL</div>
      <div class="dsection-grid col1">
        ${urlField('자사몰', 'urlJasa', [...(p.images?.lemango||[]), ...(p.images?.noir||[])].join('\n'), 'textarea')}
        ${urlField('외부몰',        'urlExternal',(p.images?.external||[]).join('\n'),'textarea')}
        ${urlField('SUM',           'urlSum',     (p.images?.sum||[]).join('\n'),     'textarea')}
        ${urlField('영상 URL',      'videoUrl',   p.videoUrl || '',                  'text')}
      </div>
    </div>

    ${p.scheduleLog?.length ? `
    <div class="dsection">
      <div class="dsection-title" style="color:var(--text-muted)">기획 일정 이력</div>
      <div style="padding:8px 12px">
        ${p.scheduleLog.map(entry => {
          const schLabels = { design:'디자인', production:'생산', image:'이미지', register:'상품등록', logistics:'물류입고' }
          const rows = Object.entries(entry.schedule||{}).map(([k, v]) => {
            const label = schLabels[k] || k
            const start = v?.start || '-'
            const end   = v?.end   || '-'
            if (start === '-' && end === '-') return ''
            return `<tr>
              <td style="padding:3px 8px;font-size:11px;color:var(--text-muted)">${label}</td>
              <td style="padding:3px 8px;font-size:11px">${start}</td>
              <td style="padding:3px 8px;font-size:11px">${end}</td>
            </tr>`
          }).filter(Boolean).join('')
          return rows ? `
            <div style="margin-bottom:10px">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">확정일: ${entry.confirmedAt}</div>
              <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead>
                  <tr style="background:var(--table-header)">
                    <th style="padding:3px 8px;text-align:left;border:1px solid var(--border);font-size:11px">구분</th>
                    <th style="padding:3px 8px;text-align:left;border:1px solid var(--border);font-size:11px">시작일</th>
                    <th style="padding:3px 8px;text-align:left;border:1px solid var(--border);font-size:11px">완료예정일</th>
                  </tr>
                </thead>
                <tbody style="border:1px solid var(--border)">${rows}</tbody>
              </table>
            </div>` : ''
        }).join('')}
      </div>
    </div>` : ''}

    <div class="dmodal-edit-footer">
      <button type="button" class="btn btn-outline" onclick="toggleDetailEdit()">취소</button>
      <button type="button" class="btn btn-new" onclick="saveDetailEdit()">저장</button>
    </div>
  `
}

function closeDetailModal() {
  // 미저장 임시 예약 품번 해제
  if (_detailPendingCode) {
    const currentProduct = State.allProducts.find(x => x.productCode === _detailCode)
    if (!currentProduct || currentProduct.productCode !== _detailPendingCode) {
      _reservedCodes.delete(_detailPendingCode)
    }
    _detailPendingCode = null
  }
  document.getElementById('detailModal').close()
}

function toggleDetailEdit() {
  const modal = document.getElementById('detailModal')
  const isEdit = modal.classList.toggle('edit-mode')
  document.getElementById('dEditBtn').textContent = isEdit ? '❌ 취소' : '✏️ 수정'

  // 취소 시 임시 예약 코드 해제
  if (!isEdit && _detailPendingCode) {
    const currentProduct = State.allProducts.find(x => x.productCode === _detailCode)
    if (!currentProduct || currentProduct.productCode !== _detailPendingCode) {
      _reservedCodes.delete(_detailPendingCode)
    }
    _detailPendingCode = null
  }
}

function saveDetailEdit() {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p) return

  // 일반 필드 수집
  document.querySelectorAll('#dDetailContent .dfield [data-key]').forEach(inp => {
    const key = inp.dataset.key
    const val = inp.value.trim()
    if (key === 'productCode' && p.productCodeLocked) {
      return // 품번 확정 후 변경 금지
    } else if (key === 'salePrice' || key === 'costPrice') {
      p[key] = parseInt(val) || 0
    } else if (['urlJasa','urlExternal','urlSum'].includes(key)) {
      const arr = val.split(/[\n\r]+/).map(u=>u.trim()).filter(Boolean)
      if (key === 'urlJasa')    { p.images.lemango = arr; p.images.noir = [] }
      if (key === 'urlExternal')p.images.external = arr
      if (key === 'urlSum')     p.images.sum      = arr
    } else if (key === 'videoUrl') {
      p.videoUrl = val || null
    } else {
      p[key] = val
    }
  })

  // 테이블 갱신
  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  renderProductTable()
  renderStockTable()
  renderDashboard()

  // 임시 예약 코드 확정 처리
  _detailPendingCode = null

  // 모달 뷰모드로 전환 후 재렌더
  document.getElementById('detailModal').classList.remove('edit-mode')
  document.getElementById('dEditBtn').textContent = '✏️ 수정'
  openDetailModal(_detailCode)
  showToast('상품 정보가 수정되었습니다.', 'success')
}

function lockProductCode() {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p) return
  if (!confirm(`품번 "${p.productCode}"을 확정합니다.\n확정 후에는 품번을 수정할 수 없습니다.`)) return
  p.productCodeLocked = true
  const lockBtn = document.getElementById('dLockCodeBtn')
  if (lockBtn) lockBtn.style.display = 'none'
  // 재렌더 (품번 필드를 읽기전용으로 표시)
  const content = document.getElementById('dDetailContent')
  if (content) content.innerHTML = buildDetailContent(p)
  showToast('품번이 확정되었습니다.', 'success')
}

function setProductionStatus(btn, status) {
  // 수정 모드가 아니면 무시
  const modal = document.getElementById('detailModal')
  if (!modal.classList.contains('edit-mode')) return

  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p) return
  p.productionStatus = status

  // 버튼 active 상태 갱신
  btn.closest('.dprod-status-row').querySelectorAll('.dprod-btn').forEach(b => {
    b.classList.remove('active', 'danger')
    if (b.dataset.status === status) {
      b.classList.add('active')
      if (status === '생산중단') b.classList.add('danger')
    }
  })
}

// =============================================
// ===== 상세 모달 — 품번 인라인 생성 패널 =====
// =============================================
function toggleDetailCodeGenPanel() {
  const panel = document.getElementById('dCgPanel')
  const btn   = document.querySelector('#dDetailContent .pdcg-toggle-btn')
  if (!panel) return
  const open = panel.style.display === 'none'
  panel.style.display = open ? '' : 'none'
  if (btn) btn.textContent = open ? '품번 생성 ▴' : '품번 생성 ▾'
  if (open) {
    filterDetailDesignList()
    updateDetailProductCode()
  }
}

function filterDetailDesignList() {
  const q = (document.getElementById('dCgDesignSearch')?.value || '').toLowerCase().trim()
  const list = q
    ? _designCodes.filter(([c,e,k]) => c.includes(q) || e.toLowerCase().includes(q) || k.toLowerCase().includes(q))
    : _designCodes
  const current = document.getElementById('dCgDesign')?.value
  const dd = document.getElementById('dCgDesignDropdown')
  if (!dd) return
  dd.innerHTML = list.map(([c,e,k]) =>
    `<div class="design-option${current===c?' selected':''}" onclick="selectDetailDesign('${c}')">
      <span class="design-code">${c}</span>
      <span class="design-names"><span class="design-en">${e}</span><span class="design-kr">${k}</span></span>
    </div>`
  ).join('')
  const sel = dd.querySelector('.design-option.selected')
  if (sel) sel.scrollIntoView({ block: 'nearest' })
}

function selectDetailDesign(code) {
  const found = _designCodes.find(([c]) => c === code)
  if (!found) return
  document.getElementById('dCgDesign').value = code
  const search = document.getElementById('dCgDesignSearch')
  if (search) { search.value = ''; search.placeholder = `${code} - ${found[1]} (${found[2]})` }
  filterDetailDesignList()
  updateDetailProductCode()
}

function updateDetailProductCode() {
  const cls    = document.getElementById('dCgCls')?.value
  const gen    = document.getElementById('dCgGen')?.value
  const typ    = document.getElementById('dCgTyp')?.value
  const des    = document.getElementById('dCgDesign')?.value
  const year   = document.getElementById('dCgYear')?.value
  const season = document.getElementById('dCgSeason')?.value
  if (!cls || !des) return

  const prefix = cls + gen + typ + des + year + season  // 12자리

  // 현재 상품 자신의 코드는 제외 (같은 prefix로 재생성 가능)
  const currentOwnCode = _detailCode || ''

  const used = new Set()
  ;[...State.allProducts, ...State.planItems].forEach(p => {
    const c = p.productCode || ''
    if (c === currentOwnCode) return  // 자기 자신 제외
    if (c.length === prefix.length + 2 && c.startsWith(prefix)) used.add(c.slice(-2))
  })
  _reservedCodes.forEach(c => {
    if (c === currentOwnCode) return
    if (c.length === prefix.length + 2 && c.startsWith(prefix)) used.add(c.slice(-2))
  })

  let nextNum = null
  for (let i = 0; i <= 99; i++) {
    const candidate = String(i).padStart(2, '0')
    if (!used.has(candidate)) { nextNum = candidate; break }
  }

  const preview = document.getElementById('dCgPreview')
  const applyBtn = document.getElementById('dCgApplyBtn')
  if (nextNum === null) {
    if (preview)  preview.textContent = '사용 가능한 번호 없음'
    if (applyBtn) applyBtn.disabled = true
  } else {
    if (preview)  preview.textContent = prefix + nextNum
    if (applyBtn) applyBtn.disabled = false
  }
}

function applyDetailGeneratedCode() {
  const code = document.getElementById('dCgPreview')?.textContent
  if (!code || code === '-' || code === '사용 가능한 번호 없음') return

  // 중복 최종 확인 (자기 자신 제외)
  const currentOwnCode = _detailCode || ''
  if (code !== currentOwnCode && (
      State.allProducts.some(p => p.productCode === code) ||
      State.planItems.some(p => p.productCode === code) ||
      _reservedCodes.has(code))) {
    showToast(`품번 "${code}"은 이미 사용 중입니다. 다시 생성해주세요.`, 'error')
    updateDetailProductCode()
    return
  }

  // 이전 임시 예약 해제 (자기 원래 코드가 아닌 경우만)
  if (_detailPendingCode && _detailPendingCode !== currentOwnCode) {
    _reservedCodes.delete(_detailPendingCode)
  }
  // 새 코드 예약 (원래 코드와 다를 때만)
  if (code !== currentOwnCode) {
    _reservedCodes.add(code)
  }
  _detailPendingCode = code

  const input = document.getElementById('dCgProductCodeInput')
  if (input) input.value = code

  // 패널 닫기
  const panel = document.getElementById('dCgPanel')
  if (panel) panel.style.display = 'none'
  const btn = document.querySelector('#dDetailContent .pdcg-toggle-btn')
  if (btn) btn.textContent = '품번 생성 ▾'

  showToast(`품번 "${code}" 적용됨. 저장 버튼을 눌러 확정하세요.`, 'success')
}

// =============================================
// ===== 신규등록 모달 =====
// =============================================
function openRegisterModal() {
  const form = document.getElementById('registerForm')
  form.reset()
  // 오늘 날짜를 등록일 기본값으로
  document.getElementById('rRegistDate').value = new Date().toISOString().slice(0,10)
  const modal = document.getElementById('registerModal')
  // 위치 초기화 (매번 열릴 때 중앙으로)
  modal.style.left = ''
  modal.style.top  = ''
  modal.showModal()
  // position: fixed + margin: 0 상태에서 중앙 정렬
  requestAnimationFrame(() => {
    modal.style.left = Math.max(0, (window.innerWidth  - modal.offsetWidth)  / 2) + 'px'
    modal.style.top  = Math.max(0, (window.innerHeight - modal.offsetHeight) / 2) + 'px'
  })
  initPcodePanel()
}

function closeRegisterModal() {
  // 취소 시 적용했던 품번 예약 해제
  const code = document.getElementById('rProductCode')?.value
  if (code) _reservedCodes.delete(code)
  document.getElementById('registerModal').close()
}

function submitRegister(e) {
  e.preventDefault()

  const brand       = document.getElementById('rBrand').value
  const productCode = document.getElementById('rProductCode').value.trim()
  const sampleNo    = document.getElementById('rSampleNo').value.trim()
  const cafe24Code  = document.getElementById('rCafe24Code').value.trim()
  const barcode     = document.getElementById('rBarcode').value.trim()
  const nameKr      = document.getElementById('rNameKr').value.trim()
  const nameEn      = document.getElementById('rNameEn').value.trim()
  const colorKr     = document.getElementById('rColorKr').value.trim()
  const colorEn     = document.getElementById('rColorEn').value.trim()
  const salePrice   = parseInt(document.getElementById('rSalePrice').value) || 0
  const costPrice   = parseInt(document.getElementById('rCostPrice').value) || 0
  const type        = document.getElementById('rType').value
  const fabricType  = document.getElementById('rFabricType').value
  const backStyle     = document.getElementById('rBackStyle').value.trim()
  const legCut        = document.getElementById('rLegCut').value
  const guide         = document.getElementById('rGuide').value.trim()
  const chestLine     = document.getElementById('rChestLine').value
  const transparency  = document.getElementById('rTransparency').value
  const lining        = document.getElementById('rLining').value
  const capRing       = document.getElementById('rCapRing').value
  const bust          = document.getElementById('rBust').value.trim()
  const waist         = document.getElementById('rWaist').value.trim()
  const hip           = document.getElementById('rHip').value.trim()
  const modelSize     = document.getElementById('rModelSize').value.trim()
  const material      = document.getElementById('rMaterial').value.trim()
  const madeMonth   = document.getElementById('rMadeMonth').value.trim()
  const madeIn      = document.getElementById('rMadeIn').value.trim()
  const madeBy      = document.getElementById('rMadeBy').value.trim()
  const registDate  = document.getElementById('rRegistDate').value
  const comment     = document.getElementById('rComment').value.trim()
  const img1        = document.getElementById('rImg1').value.trim()
  const img2        = document.getElementById('rImg2').value.trim()

  // 품번 중복 체크
  if (State.allProducts.some(p => p.productCode === productCode)) {
    showToast(`품번 "${productCode}"이(가) 이미 존재합니다.`, 'error')
    document.getElementById('rProductCode').focus()
    return
  }

  const newProduct = {
    no: State.allProducts.length + 1,
    brand,
    productCode,
    sampleNo,
    cafe24Code,
    barcode,
    nameKr,
    nameEn,
    colorKr,
    colorEn,
    salePrice,
    costPrice,
    type,
    fabricType,
    backStyle,
    legCut,
    guide,
    chestLine,
    transparency,
    lining,
    capRing,
    bust,
    waist,
    hip,
    material,
    madeMonth,
    madeIn,
    madeBy,
    comment,
    images: {
      lemango: [img1, img2].filter(Boolean),
      noir: [],
      design: img1 || null,
      shoot:  img2 || null
    },
    modelSize,
    washMethod: '',
    stock: { XS: 0, S: 0, M: 0, L: 0, XL: 0 },
    sales: { 공홈: 0, GS: 0, '29cm': 0, W쇼핑: 0, 기타: 0 },
    registDate: registDate || new Date().toISOString().slice(0,10),
    logisticsDate: null
  }

  // 전체 데이터에 추가 (예약 해제 후 정식 등록)
  _reservedCodes.delete(newProduct.productCode)
  State.allProducts.push(newProduct)
  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  State.sales.filtered   = [...State.allProducts]

  // 화면 갱신
  renderProductTable()
  renderStockTable()
  renderSalesTable()
  renderDashboard()

  closeRegisterModal()
  showToast(`"${nameKr}" 상품이 등록되었습니다.`, 'success')

  // 상품조회 탭으로 이동 + 방금 등록한 품번으로 검색
  switchTab('product')
  document.getElementById('pKeyword').value = productCode
  document.getElementById('pSearchField').value = 'productCode'
  searchProduct()
}

// ESC 닫기
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('registerModal').open) {
    closeRegisterModal()
  }
})

// ===== 신규등록 엑셀 업로드 =====

// 필수 항목: 품번, 상품명(한글)
const REGISTER_REQUIRED = ['품번', '상품명(한글)']

let _uploadPreviewData = null

function handleRegisterUpload(input) {
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }

  const reader = new FileReader()
  reader.onload = e => {
    try {
      const wb  = XLSX.read(e.target.result, { type: 'array' })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // 2행 헤더 구조 → 3행부터 데이터
      const dataRows = raw.slice(2).filter(r => String(r[UPLOAD_COL.code] || '').trim() || String(r[UPLOAD_COL.nameKr] || '').trim())
      if (!dataRows.length) {
        showToast('데이터가 없습니다. 샘플 형식을 확인해주세요.', 'error')
        return
      }

      _uploadPreviewData = dataRows.map((row, idx) => {
        const code   = String(row[UPLOAD_COL.code]   || '').trim()
        const nameKr = String(row[UPLOAD_COL.nameKr] || '').trim()
        const errors = []
        let status = 'ok'

        if (!code)   { errors.push('품번 없음'); status = 'error' }
        if (!nameKr) { errors.push('상품명 없음'); status = 'error' }
        if (code && status !== 'error' && State.allProducts.some(p => p.productCode === code)) {
          status = 'warn'
        }

        const codePrefix = code.slice(0, 2).toUpperCase()
        const brand = ['NS','NW','NG'].includes(codePrefix) ? '르망고 느와' : '르망고'

        return {
          rowNum: idx + 3,
          status,
          errors,
          brand,
          code,
          nameKr,
          colorKr:   String(row[UPLOAD_COL.colorKr]   || '').trim(),
          salePrice: Number(row[UPLOAD_COL.salePrice]) || 0,
          type:      String(row[UPLOAD_COL.type]       || '').trim(),
          material:  String(row[UPLOAD_COL.material]   || '').trim(),
          madeIn:    String(row[UPLOAD_COL.madeIn]     || '').trim(),
          raw: row
        }
      })

      showRegisterPreview()
    } catch (err) {
      showToast('파일 읽기 오류: ' + err.message, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
}

function showRegisterPreview() {
  const data = _uploadPreviewData
  const okCnt   = data.filter(r => r.status === 'ok').length
  const warnCnt = data.filter(r => r.status === 'warn').length
  const errCnt  = data.filter(r => r.status === 'error').length

  document.getElementById('upmSummary').innerHTML =
    `전체 <b>${data.length}</b>건 &nbsp;|&nbsp;
     <span class="upm-cnt-ok">정상 ${okCnt}건</span> &nbsp;
     <span class="upm-cnt-warn">중복 ${warnCnt}건</span> &nbsp;
     <span class="upm-cnt-err">오류 ${errCnt}건</span>`

  document.getElementById('upmTbody').innerHTML = data.map(r => `
    <tr class="upm-row-${r.status}">
      <td>${r.rowNum}</td>
      <td class="upm-status-cell">
        ${r.status === 'ok'   ? '<span class="upm-badge ok">✅ 정상</span>' : ''}
        ${r.status === 'warn' ? '<span class="upm-badge warn">⚠️ 중복</span>' : ''}
        ${r.status === 'error' ? `<span class="upm-badge err">❌ ${r.errors.join(', ')}</span>` : ''}
      </td>
      <td class="${!r.code ? 'upm-cell-err' : ''}">${r.code || '—'}</td>
      <td>${r.brand}</td>
      <td class="${!r.nameKr ? 'upm-cell-err' : ''}">${r.nameKr || '—'}</td>
      <td>${r.colorKr || '—'}</td>
      <td>${r.salePrice ? r.salePrice.toLocaleString() + '원' : '—'}</td>
      <td>${r.type || '—'}</td>
      <td class="upm-cell-long">${r.material ? r.material.slice(0, 40) + (r.material.length > 40 ? '…' : '') : '—'}</td>
      <td>${r.madeIn || '—'}</td>
    </tr>
  `).join('')

  const registerCnt = okCnt + warnCnt
  const btn = document.getElementById('upmConfirmBtn')
  btn.textContent = `${registerCnt}건 등록하기`
  btn.disabled = registerCnt === 0

  document.getElementById('uploadPreviewModal').showModal()
}

function confirmRegisterUpload() {
  const data = _uploadPreviewData
  if (!data) return
  const targets = data.filter(r => r.status === 'ok' || r.status === 'warn')
  let added = 0, updated = 0

  targets.forEach(item => {
    const row = item.raw
    const sumUrls    = parseSumUrls(row[UPLOAD_COL.urlSum])
    const lemonUrls  = String(row[UPLOAD_COL.urlLemango]  || '').split(/[\n\r]+/).map(u => u.trim()).filter(u => u.startsWith('http'))
    const noirUrls   = String(row[UPLOAD_COL.urlNoir]     || '').split(/[\n\r]+/).map(u => u.trim()).filter(u => u.startsWith('http'))

    const product = {
      no:          State.allProducts.length + added + 1,
      brand:       item.brand,
      productCode: item.code,
      sampleNo:    '',
      cafe24Code:  '',
      barcode:     '',
      nameKr:      item.nameKr,
      nameEn:      String(row[UPLOAD_COL.nameEn]    || '').trim(),
      colorKr:     item.colorKr,
      colorEn:     String(row[UPLOAD_COL.colorEn]   || '').trim(),
      salePrice:   Number(row[UPLOAD_COL.salePrice]) || 0,
      costPrice:   Number(row[UPLOAD_COL.costPrice]) || 0,
      type:        item.type || 'onepiece',
      backStyle:   String(row[UPLOAD_COL.backStyle]  || '').trim(),
      legCut:      String(row[UPLOAD_COL.legCut]     || '').trim(),
      guide:       String(row[UPLOAD_COL.guide]      || '').trim(),
      fabricType:  String(row[UPLOAD_COL.fabricType] || '').trim(),
      material:    item.material,
      comment:     String(row[UPLOAD_COL.comment]    || '').trim(),
      washMethod:  String(row[UPLOAD_COL.washMethod] || '').trim(),
      sizeSpec:    String(row[UPLOAD_COL.sizeSpec]   || '').trim(),
      modelSize:   String(row[UPLOAD_COL.modelSize]  || '').trim(),
      madeMonth:   String(row[UPLOAD_COL.madeMonth]  || '').trim(),
      madeBy:      String(row[UPLOAD_COL.madeBy]     || '').trim(),
      madeIn:      item.madeIn,
      videoUrl:    String(row[UPLOAD_COL.videoUrl]   || '').trim(),
      chestLine:   '',
      transparency:'',
      lining:      '',
      capRing:     '',
      bust:        '',
      waist:       '',
      hip:         '',
      images:      { sum: sumUrls, lemango: lemonUrls, noir: noirUrls, external: [], design: null, shoot: null },
      stock:       { XS: 0, S: 0, M: 0, L: 0, XL: 0 },
      sales:       { 공홈: 0, GS: 0, '29cm': 0, W쇼핑: 0, 기타: 0 },
      registDate:  new Date().toISOString().slice(0, 10),
      logisticsDate: null
    }

    const idx = State.allProducts.findIndex(p => p.productCode === item.code)
    if (idx !== -1) {
      // 중복 → 기본정보·이미지 업데이트, 재고·판매 유지
      State.allProducts[idx] = { ...State.allProducts[idx], ...product,
        stock: State.allProducts[idx].stock,
        sales: State.allProducts[idx].sales }
      updated++
    } else {
      State.allProducts.push(product)
      added++
    }
  })

  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  State.sales.filtered   = [...State.allProducts]
  renderProductTable()
  renderStockTable()
  renderSalesTable()
  renderDashboard()

  document.getElementById('uploadPreviewModal').close()
  _uploadPreviewData = null
  showToast(`신규 ${added}건 등록, ${updated}건 업데이트 완료`, 'success')
}

// ===== 품번 자동생성 =====

// ===== 백스타일 목록 관리 [코드4, 영문명, 한글명] =====
const DEFAULT_BACK_STYLES = [
  ['2001', 'Crossed X',           '크로스 X'],
  ['2002', 'Crossed X Modified',  '크로스 X 모디파이드'],
  ['2003', 'Ballet back',         '발레 백'],
  ['2004', 'Double Cross',        '더블 크로스'],
  ['2005', 'Fake Tie',            '페이크 타이'],
  ['2006', 'V-Shoulder',          'V-숄더'],
  ['2007', 'Perry Cross Strap',   '페리 크로스 스트랩'],
]
let _backStyles = (() => {
  try {
    const saved = localStorage.getItem('lemango_back_styles_v2')
    return saved ? JSON.parse(saved) : DEFAULT_BACK_STYLES.map(r => [...r])
  } catch { return DEFAULT_BACK_STYLES.map(r => [...r]) }
})()

function saveBackStyles() {
  localStorage.setItem('lemango_back_styles_v2', JSON.stringify(_backStyles))
}

function renderBackStyleList(query) {
  const q = query.toLowerCase().trim()
  const list = q
    ? _backStyles.filter(([code, en, kr]) =>
        code.includes(q) || en.toLowerCase().includes(q) || kr.toLowerCase().includes(q))
    : _backStyles
  const current = document.getElementById('pcBackStyle')?.value
  const dd = document.getElementById('bsDropdown')
  if (!dd) return
  if (list.length === 0) { dd.innerHTML = '<div class="design-no-result">검색 결과 없음</div>'; return }
  dd.innerHTML = list.map(([code, en, kr]) =>
    `<div class="design-option${code === current ? ' selected' : ''}" onclick="selectBackStyle('${code}')">
      <span class="design-code">${code}</span>
      <span class="design-names"><span class="design-en">${en}</span><span class="design-kr">${kr}</span></span>
    </div>`
  ).join('')
  const sel = dd.querySelector('.design-option.selected')
  if (sel) sel.scrollIntoView({ block: 'nearest' })
}

function filterBackStyleList() {
  renderBackStyleList(document.getElementById('pcBsSearch')?.value || '')
}

function selectBackStyle(code) {
  const found = _backStyles.find(([c]) => c === code)
  if (!found) return
  document.getElementById('pcBackStyle').value = code
  document.getElementById('pcBsSearch').value = ''
  document.getElementById('pcBsSearch').placeholder = `${code} - ${found[1]} (${found[2]})`
  renderBackStyleList('')
}

let _bsFormMode = 'add'
function showBsForm(mode) {
  _bsFormMode = mode
  const form = document.getElementById('bsForm')
  document.getElementById('bsFormCode').value = ''
  document.getElementById('bsFormEn').value   = ''
  document.getElementById('bsFormKr').value   = ''
  if (mode === 'edit') {
    const cur = document.getElementById('pcBackStyle')?.value
    if (!cur) { showToast('수정할 백스타일을 선택하세요.', 'warning'); return }
    const found = _backStyles.find(([c]) => c === cur)
    if (found) {
      document.getElementById('bsFormCode').value = found[0]
      document.getElementById('bsFormEn').value   = found[1]
      document.getElementById('bsFormKr').value   = found[2]
    }
  }
  form.style.display = 'flex'
  document.getElementById('bsFormCode').focus()
}

function confirmBsForm() {
  const code = document.getElementById('bsFormCode').value.trim()
  const en   = document.getElementById('bsFormEn').value.trim()
  const kr   = document.getElementById('bsFormKr').value.trim()
  if (!code || !en || !kr) { showToast('코드, 영문명, 한글명을 모두 입력하세요.', 'warning'); return }
  if (!/^\d{4}$/.test(code)) { showToast('코드는 4자리 숫자여야 합니다.', 'warning'); return }

  if (_bsFormMode === 'add') {
    if (_backStyles.some(([c]) => c === code)) { showToast('이미 존재하는 코드입니다.', 'warning'); return }
    _backStyles.push([code, en, kr])
    saveBackStyles()
    renderBackStyleList('')
    selectBackStyle(code)
  } else {
    const cur = document.getElementById('pcBackStyle').value
    const idx = _backStyles.findIndex(([c]) => c === cur)
    if (idx === -1) return
    if (code !== cur && _backStyles.some(([c]) => c === code)) { showToast('이미 존재하는 코드입니다.', 'warning'); return }
    _backStyles[idx] = [code, en, kr]
    saveBackStyles()
    renderBackStyleList('')
    selectBackStyle(code)
  }
  document.getElementById('bsForm').style.display = 'none'
}

function deleteBackStyle() {
  const cur = document.getElementById('pcBackStyle')?.value
  if (!cur) { showToast('삭제할 백스타일을 선택하세요.', 'warning'); return }
  const found = _backStyles.find(([c]) => c === cur)
  if (!found) return
  if (!confirm(`"${found[1]} (${found[2]})" 백스타일을 삭제하시겠습니까?`)) return
  _backStyles = _backStyles.filter(([c]) => c !== cur)
  saveBackStyles()
  document.getElementById('pcBackStyle').value = ''
  document.getElementById('pcBsSearch').placeholder = '코드 또는 스타일명 검색 (예: 2001 / Crossed / 크로스)'
  document.getElementById('pcBsSearch').value = ''
  renderBackStyleList('')
}

// [코드, 영문명, 한글명]
const __designCodes_DEFAULT = [
  ['0001','Backless','백리스'],['0002','Tube','튜브'],['0006','Corset Dress','코르셋 드레스'],
  ['0007','Bikini top','비키니 탑'],['0008','Bikini bottom','비키니 바텀'],
  ['0009','Bikini top OEM','비키니 탑 OEM'],['0010','Bikini bottom OEM','비키니 바텀 OEM'],
  ['0011','Bikini top_Balconette','비키니 탑 발코네트'],['0012','Bikini bottom_high waisted','비키니 바텀 하이웨이스트'],
  ['1000','Open back','오픈 백'],['1004','Open back Band','오픈 백 밴드'],
  ['1005','Kids rashguard top','키즈 래시가드 탑'],['1006','Kids rashguard bottom','키즈 래시가드 바텀'],
  ['1007','Kids rashguard zip-up','키즈 래시가드 집업'],['1008','U back All-In-One','U백 올인원'],
  ['1009','rashguard top','래시가드 탑'],['1010','rashguard bottom','래시가드 바텀'],
  ['1011','rashguard zip-up','래시가드 집업'],['1012','rashguard short zip-up','래시가드 숏 집업'],
  ['1013','rashguard short bottom','래시가드 숏 바텀'],
  ['1589','V-Shoulder Modified','V숄더 변형'],['1593','Tie back Modified','타이백 변형'],
  ['1594','V-Shoulder','V숄더'],['1596','Crossed X Band','크로스드 X 밴드'],
  ['1597','Butterfly back','버터플라이 백'],['1598','Ballet back','발레 백'],
  ['1602','V-Shoulder / V-Shoulder Modified','V숄더 / V숄더 변형'],
  ['1603','Ballet X','발레 X'],['1604','Ballet X modified','발레 X 변형'],
  ['1605','Flying cross','플라잉 크로스'],['1606','Flying cross modified','플라잉 크로스 변형'],
  ['1607','(미정)','미정'],['1608','(미정)','미정'],['1609','(미정)','미정'],['1610','(미정)','미정'],
  ['1612','Crossed X Modified','크로스드 X 변형'],['1613','Open back Band','오픈 백 밴드'],
  ['1614','I-Shaped back / Crossed X Modified','I자 백 / 크로스드 X 변형'],
  ['1615','Double cross','더블 크로스'],['1616','Crossed X Modified','크로스드 X 변형'],
  ['1617','Crossed X Piercing','크로스드 X 피어싱'],['1618','Corset','코르셋'],
  ['1620','Double cross Modified','더블 크로스 변형'],['1621','Crossed X Modified','크로스드 X 변형'],
  ['1624','Water drop','물방울'],['1625','Tie back','타이백'],['1626','Crossed X','크로스드 X'],
  ['1627','Open back','오픈 백'],['1628','V-Shoulder','V숄더'],['1629','Double cross','더블 크로스'],
  ['1630','Nil (Brief)','닐 (브리프)'],['1635','Nil (Brief)','닐 (브리프)'],['1636','Nil (Brief)','닐 (브리프)'],
  ['1679','Open back','오픈 백'],['1800','Crossed X Modified(스트렙탈부착)','크로스드 X 변형 (스트랩탈착)'],
  ['2001','Crop Rashguard','크롭 래시가드'],['2630','Nil (Jammer)','닐 (재머)'],
  ['3900','Sleeveless','민소매'],['4000','Athleisure','애슬레저'],
  ['4100','Athleisure top','애슬레저 탑'],['4110','Short sleeve','반소매'],['4120','Long sleeve','긴소매'],
  ['4300','Athleisure bottom','애슬레저 바텀'],['4310','Short pants','숏 팬츠'],['4320','Long pants','롱 팬츠'],
  ['4500','Athleisure etc','애슬레저 기타'],['5000','Garment','의류'],
  ['5100','Garment top','의류 탑'],['5300','Garment bottom','의류 바텀'],['5500','Garment etc','의류 기타'],
  ['6000','Swimming cap','수영모'],['6001','Kids Fabric Cap','키즈 패브릭 캡'],
  ['6100','General','일반'],['6900','Wrinkle free','구김없는'],
  ['7000','Bag','가방'],['7100','Mesh','메쉬'],['7900','Backpack','백팩'],
  ['8000','Long sleeve','긴소매'],['8002','Short sleeve','반소매'],
  ['8003','Corset M','코르셋 남성'],['8004','Corset F','코르셋 여성'],
  ['8005','Tube F','튜브 여성'],['8006','Ruffle sleeve F','러플 슬리브 여성'],
  ['8007','Side ribbon M','사이드 리본 남성'],['8008','Back ribbon M','백 리본 남성'],
  ['8009','Wrap Dress','랩 드레스'],['8010','Ruffle collar Dress','러플 칼라 드레스'],
  ['8011','Tankini','탱키니'],['8012','One Shoulder','원숄더'],
  ['8013','Balconette Dress','발코네트 드레스'],['8014','Short sleeve Dress','반소매 드레스'],
  ['9000','ETC','기타'],['9001','Mask','마스크'],['9002','Goggle strap','고글 스트랩'],
  ['9003','Goggle case','고글 케이스'],['9004','Goggle','고글'],
  ['9005','Silicone bra','실리콘 브라'],['9006','Shoes','신발'],['9007','Towel','타월']
]
let _designCodes = (() => {
  try {
    const saved = localStorage.getItem('lemango_design_codes_v1')
    return saved ? JSON.parse(saved) : __designCodes_DEFAULT.map(r => [...r])
  } catch { return __designCodes_DEFAULT.map(r => [...r]) }
})()
function saveDesignCodes() {
  localStorage.setItem('lemango_design_codes_v1', JSON.stringify(_designCodes))
}

function initPcodePanel() {
  if (!document.getElementById('pcDesign')) return
  renderDesignList('')
  selectDesign('1626')
  renderBackStyleList('')
  // 모달 열릴 때마다 미리보기 초기화 — "품번 생성" 버튼으로 직접 실행
  document.getElementById('pcPreview').textContent = '-'
  document.getElementById('pcSeqDisplay').textContent = '-'
  const applyBtn = document.getElementById('pcApplyBtn')
  if (applyBtn) applyBtn.disabled = true
}

function renderDesignList(query) {
  const q = query.toLowerCase().trim()
  const list = q
    ? _designCodes.filter(([code, en, kr]) =>
        code.includes(q) || en.toLowerCase().includes(q) || kr.toLowerCase().includes(q)
      )
    : _designCodes
  const current = document.getElementById('pcDesign').value
  const dd = document.getElementById('designDropdown')
  if (list.length === 0) {
    dd.innerHTML = '<div class="design-no-result">검색 결과 없음</div>'
    return
  }
  dd.innerHTML = list.map(([code, en, kr]) =>
    `<div class="design-option${code === current ? ' selected' : ''}" onclick="selectDesign('${code}')">
      <span class="design-code">${code}</span>
      <span class="design-names"><span class="design-en">${en}</span><span class="design-kr">${kr}</span></span>
    </div>`
  ).join('')
  // 선택된 항목으로 스크롤
  const sel = dd.querySelector('.design-option.selected')
  if (sel) sel.scrollIntoView({ block: 'nearest' })
}

function filterDesignList() {
  renderDesignList(document.getElementById('pcDesignSearch').value)
}

function selectDesign(code) {
  const found = _designCodes.find(([c]) => c === code)
  if (!found) return
  document.getElementById('pcDesign').value = code
  document.getElementById('pcDesignSearch').value = ''
  document.getElementById('pcDesignSearch').placeholder = `${code} - ${found[1]} (${found[2]})`
  renderDesignList('')
  // 자동 생성하지 않음 — "품번 생성" 버튼으로 직접 실행
}

function togglePcodePanel() {
  const panel = document.getElementById('pcodePanel')
  const btn = document.getElementById('pcodeToggleBtn')
  const open = panel.style.display === 'none' || panel.style.display === ''
  panel.style.display = open ? 'flex' : 'none'
  btn.textContent = open ? '자동생성 ▴' : '자동생성 ▾'
  // 열려도 자동 생성하지 않음 — 기존 미리보기 유지
}

// 적용됐지만 아직 등록 전인 품번 임시 예약 Set
const _reservedCodes = new Set()

function updateProductCode() {
  const cls = document.getElementById('pcClass')?.value
  const gen = document.getElementById('pcGender')?.value
  const typ = document.getElementById('pcType')?.value
  const des = document.getElementById('pcDesign')?.value
  const year = document.getElementById('pcYear')?.value
  const seasonNum = document.getElementById('pcSeasonNum')?.value
  if (!cls || !des) return

  const prefix = cls + gen + typ + des + year + seasonNum  // 앞 12자리

  // 이미 등록된 품번 + 기획 품번 + 임시 예약된 품번 모두 체크
  const used = new Set()
  ;[...State.allProducts, ...State.planItems].forEach(p => {
    const c = p.productCode || ''
    if (c.length === prefix.length + 2 && c.startsWith(prefix)) {
      used.add(c.slice(-2))
    }
  })
  _reservedCodes.forEach(c => {
    if (c.length === prefix.length + 2 && c.startsWith(prefix)) {
      used.add(c.slice(-2))
    }
  })

  let nextNum = null
  for (let i = 0; i <= 99; i++) {
    const candidate = String(i).padStart(2, '0')
    if (!used.has(candidate)) { nextNum = candidate; break }
  }

  const seqDisplay = document.getElementById('pcSeqDisplay')
  const applyBtn   = document.getElementById('pcApplyBtn')
  if (nextNum === null) {
    seqDisplay.textContent = '만료'
    document.getElementById('pcPreview').textContent = '사용 가능한 번호 없음'
    if (applyBtn) applyBtn.disabled = true
  } else {
    seqDisplay.textContent = nextNum
    document.getElementById('pcPreview').textContent = prefix + nextNum
    if (applyBtn) applyBtn.disabled = false
  }
}

function applyGeneratedCode() {
  const code = document.getElementById('pcPreview').textContent
  if (!code || code === '-' || code === '사용 가능한 번호 없음') return

  // 이미 등록된 품번 + 기획 품번과 중복 최종 확인
  if (State.allProducts.some(p => p.productCode === code) ||
      State.planItems.some(p => p.productCode === code) ||
      _reservedCodes.has(code)) {
    showToast(`품번 "${code}"은 이미 사용 중입니다. 다시 생성해주세요.`, 'error')
    updateProductCode()
    return
  }

  // 임시 예약 등록 (등록 완료 전까지 다른 생성에서 건너뜀)
  _reservedCodes.add(code)

  document.getElementById('rProductCode').value = code
  document.getElementById('pcodePanel').style.display = 'none'
  document.getElementById('pcodeToggleBtn').textContent = '자동생성 ▾'

  // 품번 선택 정보로 연관 필드 자동 채우기
  const cls = document.getElementById('pcClass')?.value || ''
  const typ = document.getElementById('pcType')?.value || ''

  // 브랜드 자동 채우기
  const brandEl = document.getElementById('rBrand')
  if (brandEl) {
    brandEl.value = cls.startsWith('N') ? '르망고 느와' : '르망고'
  }

  // 타입 자동 채우기
  const typeEl = document.getElementById('rType')
  if (typeEl) {
    const typeMap = { ON: 'onepiece', MO: 'onepiece', BK: 'bikini', BR: 'bikini' }
    const mapped = typeMap[typ]
    if (mapped) typeEl.value = mapped
  }

  // 백스타일 자동 채우기 (선택된 코드 → 영문명을 폼에 반영)
  const bsCode  = document.getElementById('pcBackStyle')?.value
  const bsEntry = _backStyles.find(([c]) => c === bsCode)
  const backStyleEl = document.getElementById('rBackStyle')
  if (backStyleEl && bsEntry) backStyleEl.value = bsEntry[1]

  showToast(`품번 ${code} 적용됨`, 'success')
}

// =============================================
// ===== 설정 탭 =====
// =============================================
function _renderSetCard(def) {
  const items = _settings[def.key] || []
  const listHtml = items.map((item, idx) => {
    const [val, label] = Array.isArray(item) ? item : [item, item]
    const inner = Array.isArray(item)
      ? `<span class="set-item-code">${val}</span><span class="set-item-label">${label}</span>`
      : `<span class="set-item-label">${val}</span>`
    return `<div class="set-item">${inner}
      <button class="set-item-del" onclick="removeSettingItem('${def.key}',${idx})" title="삭제">✕</button>
    </div>`
  }).join('') || '<div class="set-empty">항목 없음</div>'

  const addForm = def.type === 'pair'
    ? `<div class="set-add-row">
        <input type="text" id="setAdd_${def.key}_val"   placeholder="${def.ph1}" class="set-add-input" />
        <input type="text" id="setAdd_${def.key}_label" placeholder="${def.ph2}" class="set-add-input" />
        <button class="btn btn-new set-add-btn" onclick="addSettingItem('${def.key}')">+ 추가</button>
      </div>`
    : `<div class="set-add-row">
        <input type="text" id="setAdd_${def.key}_val" placeholder="${def.ph}" class="set-add-input" style="flex:1" />
        <button class="btn btn-new set-add-btn" onclick="addSettingItem('${def.key}')">+ 추가</button>
      </div>`

  return `<div class="set-card">
    <div class="set-card-title">${def.title}</div>
    <div class="set-list">${listHtml}</div>
    ${addForm}
  </div>`
}

function renderSettings() {
  const container = document.getElementById('settingsPage')
  if (!container) return

  // 디자인 관련 카드들
  const designCards = SETTING_DEFS.filter(d => d.group === 'design').map(_renderSetCard).join('')

  // 백스타일 카드
  const bsListHtml = _backStyles.map((bs, idx) => {
    const [code, en, kr] = bs
    return `<div class="set-item">
      <span class="set-item-code">${code}</span>
      <span class="set-item-label">${en}</span>
      <span class="set-item-label" style="color:var(--text-sub);font-size:12px">${kr}</span>
      <button class="set-item-del" onclick="removeBackStyleSetting(${idx})" title="삭제">✕</button>
    </div>`
  }).join('') || '<div class="set-empty">항목 없음</div>'
  const bsCard = `<div class="set-card set-card-wide">
    <div class="set-card-title">백스타일</div>
    <div class="set-list">${bsListHtml}</div>
    <div class="set-add-row">
      <input type="text" id="setBsCode" placeholder="코드 (4자리)" class="set-add-input" maxlength="4" style="width:100px;flex:none" />
      <input type="text" id="setBsEn"   placeholder="영문명" class="set-add-input" />
      <input type="text" id="setBsKr"   placeholder="한글명" class="set-add-input" />
      <button class="btn btn-new set-add-btn" onclick="addBackStyleSetting()">+ 추가</button>
    </div>
  </div>`

  // 디자인 번호(패턴) 카드
  const dcListHtml = _designCodes.map((dc, idx) => {
    const [code, en, kr] = dc
    return `<div class="set-item">
      <span class="set-item-code">${code}</span>
      <span class="set-item-label">${en}</span>
      <span class="set-item-label" style="color:var(--text-sub);font-size:12px">${kr}</span>
      <button class="set-item-del" onclick="removeDesignCodeSetting(${idx})" title="삭제">✕</button>
    </div>`
  }).join('') || '<div class="set-empty">항목 없음</div>'
  const dcCard = `<div class="set-card set-card-wide">
    <div class="set-card-title">디자인 번호 (패턴)</div>
    <div class="set-list" style="max-height:260px;overflow-y:auto">${dcListHtml}</div>
    <div class="set-add-row">
      <input type="text" id="setDcCode" placeholder="코드 (4자리)" class="set-add-input" maxlength="4" style="width:100px;flex:none" />
      <input type="text" id="setDcEn"   placeholder="영문명" class="set-add-input" />
      <input type="text" id="setDcKr"   placeholder="한글명" class="set-add-input" />
      <button class="btn btn-new set-add-btn" onclick="addDesignCodeSetting()">+ 추가</button>
    </div>
  </div>`

  // 일반 상품 정보 카드들
  const infoCards = SETTING_DEFS.filter(d => d.group === 'info').map(_renderSetCard).join('')

  // 판매 채널 카드
  const platListHtml = _platforms.map((pl, idx) => `
    <div class="set-item" id="platItem_${idx}">
      <span class="set-item-label" style="flex:1;font-weight:600">${pl}</span>
      <button onclick="editPlatformSetting(${idx})" style="padding:2px 10px;background:var(--accent);color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px">수정</button>
      <button class="set-item-del" onclick="removePlatformSetting(${idx})" title="삭제">✕</button>
    </div>
    <div class="set-item" id="platEdit_${idx}" style="display:none">
      <input type="text" id="platEditInput_${idx}" value="${pl}" class="set-add-input" style="flex:1" onkeydown="if(event.key==='Enter')savePlatformEdit(${idx})" />
      <button class="btn btn-new set-add-btn" onclick="savePlatformEdit(${idx})">저장</button>
      <button class="btn set-add-btn" style="background:var(--bg-card,#f0ede8)" onclick="renderSettings()">취소</button>
    </div>`).join('') || '<div class="set-empty">항목 없음</div>'
  const platCard = `<div class="set-card set-card-wide">
    <div class="set-card-title">온라인 쇼핑몰 (판매 채널)</div>
    <div class="set-list">${platListHtml}</div>
    <div class="set-add-row">
      <input type="text" id="setPlatName" placeholder="쇼핑몰명 (예: 무신사)" class="set-add-input" onkeydown="if(event.key==='Enter')addPlatformSetting()" />
      <button class="btn btn-new set-add-btn" onclick="addPlatformSetting()">+ 추가</button>
    </div>
  </div>`

  container.innerHTML = `
    <div class="settings-header">
      <h2 class="settings-title">기본 옵션 관리</h2>
      <p class="settings-desc">옵션을 추가·삭제하면 전체 시스템 선택 목록에 즉시 반영됩니다.</p>
    </div>

    <div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>🎨 디자인 관련</span><span class="set-section-arrow">▼</span>
      </button>
      <div class="set-section-body">
        <div class="set-grid">
          ${designCards}
          ${bsCard}
          ${dcCard}
        </div>
      </div>
    </div>

    <div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>📋 일반 상품 정보</span><span class="set-section-arrow">▼</span>
      </button>
      <div class="set-section-body">
        <div class="set-grid">
          ${infoCards}
        </div>
      </div>
    </div>

    <div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>🛒 판매 채널</span><span class="set-section-arrow">▼</span>
      </button>
      <div class="set-section-body">
        <div class="set-grid">
          ${platCard}
        </div>
      </div>
    </div>`
}

function toggleSetSection(btn) {
  const body = btn.nextElementSibling
  const arrow = btn.querySelector('.set-section-arrow')
  const isOpen = body.style.display !== 'none'
  body.style.display = isOpen ? 'none' : ''
  arrow.textContent = isOpen ? '▶' : '▼'
}

function addDesignCodeSetting() {
  const code = document.getElementById('setDcCode')?.value.trim()
  const en   = document.getElementById('setDcEn')?.value.trim()
  const kr   = document.getElementById('setDcKr')?.value.trim()
  if (!code || !en || !kr) { showToast('코드, 영문명, 한글명을 모두 입력해주세요.', 'warning'); return }
  if (_designCodes.some(([c]) => c === code)) { showToast('이미 존재하는 코드입니다.', 'error'); return }
  _designCodes.push([code, en, kr])
  saveDesignCodes()
  document.getElementById('setDcCode').value = ''
  document.getElementById('setDcEn').value   = ''
  document.getElementById('setDcKr').value   = ''
  renderSettings()
  showToast('디자인 코드 추가됐습니다.', 'success')
}

function removeDesignCodeSetting(idx) {
  const dc = _designCodes[idx]
  if (!dc) return
  if (!confirm(`"${dc[1]} (${dc[2]})" 디자인 코드를 삭제하시겠습니까?`)) return
  _designCodes.splice(idx, 1)
  saveDesignCodes()
  renderSettings()
  showToast('삭제됐습니다.', 'success')
}

function addSettingItem(key) {
  const def = SETTING_DEFS.find(d => d.key === key)
  if (!def) return

  if (def.type === 'pair') {
    const valEl   = document.getElementById(`setAdd_${key}_val`)
    const labelEl = document.getElementById(`setAdd_${key}_label`)
    const val   = valEl?.value.trim()
    const label = labelEl?.value.trim()
    if (!val || !label) { showToast('코드와 표시명을 모두 입력해주세요.', 'warning'); return }
    if (_settings[key].some(item => item[0] === val)) { showToast('이미 존재하는 코드입니다.', 'error'); return }
    _settings[key].push([val, label])
    if (valEl) valEl.value = ''
    if (labelEl) labelEl.value = ''
  } else {
    const valEl = document.getElementById(`setAdd_${key}_val`)
    const val = valEl?.value.trim()
    if (!val) { showToast('값을 입력해주세요.', 'warning'); return }
    if (_settings[key].includes(val)) { showToast('이미 존재하는 항목입니다.', 'error'); return }
    _settings[key].push(val)
    if (valEl) valEl.value = ''
  }

  saveSettings()
  populateAllSelects()
  renderSettings()
  showToast('추가됐습니다.', 'success')
}

function removeSettingItem(key, idx) {
  const items = _settings[key]
  if (!items) return
  const item = items[idx]
  const label = Array.isArray(item) ? item[1] : item
  if (!confirm(`"${label}" 항목을 삭제하시겠습니까?\n기존 상품에 저장된 값은 유지됩니다.`)) return
  _settings[key].splice(idx, 1)
  saveSettings()
  populateAllSelects()
  renderSettings()
  showToast('삭제됐습니다.', 'success')
}

function addBackStyleSetting() {
  const code = document.getElementById('setBsCode')?.value.trim()
  const en   = document.getElementById('setBsEn')?.value.trim()
  const kr   = document.getElementById('setBsKr')?.value.trim()
  if (!code || !en || !kr) { showToast('코드, 영문명, 한글명을 모두 입력해주세요.', 'warning'); return }
  if (_backStyles.some(([c]) => c === code)) { showToast('이미 존재하는 코드입니다.', 'error'); return }
  _backStyles.push([code, en, kr])
  saveBackStyles()
  document.getElementById('setBsCode').value = ''
  document.getElementById('setBsEn').value   = ''
  document.getElementById('setBsKr').value   = ''
  renderSettings()
  showToast('백스타일 추가됐습니다.', 'success')
}

function removeBackStyleSetting(idx) {
  const bs = _backStyles[idx]
  if (!bs) return
  if (!confirm(`"${bs[1]} (${bs[2]})" 백스타일을 삭제하시겠습니까?`)) return
  _backStyles.splice(idx, 1)
  saveBackStyles()
  renderSettings()
  showToast('삭제됐습니다.', 'success')
}

// =============================================
// ===== 공홈 주문 내역 업로드 =====
// =============================================
// 컬럼: A(0)카페24코드 B(1)자체상품코드 C(2)수량 H(7)상품옵션 L(11)바코드

let _gonghomRows = []

function parseGonghomSize(optStr) {
  if (!optStr || !String(optStr).trim()) return 'F'
  let s = String(optStr).trim().replace(/^SIZE=/i, '')
  // "85(M)" 형태에서 괄호 안 추출
  const m = s.match(/\(([^)]+)\)/)
  if (m) return m[1].toUpperCase()
  return s.toUpperCase()
}

function handleGonghomUpload(input) {
  const file = input.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const dataRows = raw.slice(1).filter(r => r[0] || r[1])
    input.value = ''
    showGonghomPreview(dataRows)
  }
  reader.readAsArrayBuffer(file)
}

function showGonghomPreview(rawRows) {
  _gonghomRows = rawRows.map(row => {
    const cafe24Code  = String(row[0]  || '').trim()
    const productCode = String(row[1]  || '').trim()
    const qty         = parseInt(row[2]) || 0
    const optStr      = String(row[7]  || '').trim()
    const barcode     = String(row[11] || '').trim()
    const size        = parseGonghomSize(optStr)

    let p = State.allProducts.find(pr => pr.productCode === productCode)
    let matchBy = 'code'
    if (!p && cafe24Code) {
      p = State.allProducts.find(pr => pr.cafe24Code === cafe24Code)
      matchBy = 'cafe24'
    }

    const status = !p ? 'error' : 'ok'
    return { cafe24Code, productCode, qty, optStr, size, barcode, p, matchBy, status }
  }).filter(r => r.qty > 0)

  const okCnt  = _gonghomRows.filter(r => r.status === 'ok').length
  const errCnt = _gonghomRows.filter(r => r.status === 'error').length

  const tbody = _gonghomRows.map((r, i) => {
    const statusBadge = r.status === 'error'
      ? '<span class="badge-preview badge-preview-error">매칭 없음</span>'
      : r.matchBy === 'cafe24'
        ? '<span class="badge-preview badge-preview-warn">카페24</span>'
        : '<span class="badge-preview badge-preview-ok">확인</span>'
    const rowStyle = r.status === 'error' ? 'background:#fff3f3' : ''
    return `<tr style="${rowStyle}">
      <td style="text-align:center;color:var(--text-sub)">${i + 1}</td>
      <td>${statusBadge}</td>
      <td style="font-family:Inter;font-size:11px">${r.productCode || r.cafe24Code}</td>
      <td>${r.p ? (r.p.nameKr || '') : '<span style="color:var(--danger)">미매칭</span>'}</td>
      <td style="text-align:center;font-weight:700">${r.qty}</td>
      <td style="text-align:center;font-family:Inter;font-weight:600;color:var(--accent)">${r.size}</td>
      <td style="font-size:11px;color:var(--text-sub)">${r.barcode || '—'}</td>
    </tr>`
  }).join('')

  document.getElementById('gonghomPreviewInfo').innerHTML =
    `총 <b>${_gonghomRows.length}</b>건 &nbsp;—&nbsp; 반영 예정 <b style="color:var(--success)">${okCnt}</b>건 / 미매칭 <b style="color:var(--danger)">${errCnt}</b>건`
  document.getElementById('gonghomPreviewBody').innerHTML = tbody || '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-sub)">데이터 없음</td></tr>'
  document.getElementById('gonghomConfirmBtn').disabled = okCnt === 0

  const modal = document.getElementById('gonghomPreviewModal')
  modal.showModal()
  centerModal(modal)
}

function confirmGonghomUpload() {
  let cnt = 0
  _gonghomRows.forEach(r => {
    if (r.status !== 'ok') return
    r.p.sales['공홈'] = (r.p.sales['공홈'] || 0) + r.qty
    cnt++
  })
  document.getElementById('gonghomPreviewModal').close()
  _gonghomRows = []
  renderSalesTable()
  renderDashboard()
  showToast(`공홈 주문 ${cnt}건 판매 반영 완료`, 'success')
}

// ===== 판매 채널 CRUD =====
function addPlatformSetting() {
  const name = document.getElementById('setPlatName')?.value.trim()
  if (!name) { showToast('쇼핑몰명을 입력해주세요.', 'warning'); return }
  if (_platforms.includes(name)) { showToast('이미 존재하는 쇼핑몰입니다.', 'error'); return }
  _platforms.push(name)
  savePlatforms()
  document.getElementById('setPlatName').value = ''
  renderSettings()
  showToast(`"${name}" 추가됐습니다.`, 'success')
}

function editPlatformSetting(idx) {
  document.getElementById('platItem_' + idx).style.display = 'none'
  document.getElementById('platEdit_' + idx).style.display = ''
  document.getElementById('platEditInput_' + idx)?.focus()
}

function savePlatformEdit(idx) {
  const newName = document.getElementById('platEditInput_' + idx)?.value.trim()
  const oldName = _platforms[idx]
  if (!newName) { showToast('쇼핑몰명을 입력해주세요.', 'warning'); return }
  if (newName === oldName) { renderSettings(); return }
  if (_platforms.includes(newName)) { showToast('이미 존재하는 쇼핑몰입니다.', 'error'); return }
  // 기존 판매 데이터 키 이전
  State.allProducts.forEach(p => {
    if (p.sales && oldName in p.sales) {
      p.sales[newName] = p.sales[oldName]
      delete p.sales[oldName]
    }
  })
  _platforms[idx] = newName
  savePlatforms()
  renderSalesTable()
  renderDashboard()
  renderSettings()
  showToast(`"${oldName}" → "${newName}" 변경됐습니다.`, 'success')
}

function removePlatformSetting(idx) {
  const name = _platforms[idx]
  if (!confirm(`"${name}" 쇼핑몰을 목록에서 제거하시겠습니까?\n기존 판매 데이터는 유지됩니다.`)) return
  _platforms.splice(idx, 1)
  savePlatforms()
  renderSalesTable()
  renderDashboard()
  renderSettings()
  showToast('삭제됐습니다.', 'success')
}

// ===== 실행 =====
document.addEventListener('DOMContentLoaded', init)
