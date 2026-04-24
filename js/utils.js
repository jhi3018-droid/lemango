// =============================================
// ===== 유틸 함수들 =====
// =============================================

/* HTML 이스케이프 (전역 단일 소스) */
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') }

// ===== 사이즈 규격 헬퍼 (XS~XXL × 가슴/허리/엉덩이) =====
// 데이터 구조: { XS:{bust,waist,hip}, S:{...}, M:{...}, L:{...}, XL:{...}, XXL:{...} }
const SIZE_SPEC_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

// 보기모드 — 값이 있는 사이즈만 표시. 데이터 없으면 안내 문구.
window.buildSizeSpecView = function(sizeSpec) {
  if (!sizeSpec || typeof sizeSpec !== 'object' || Array.isArray(sizeSpec)) {
    return '<div style="color:#b4b2a9;font-size:12px">사이즈 규격 미등록</div>'
  }
  const sizes = SIZE_SPEC_SIZES
  const hasData = sizes.some(sz => sizeSpec[sz] && (sizeSpec[sz].bust || sizeSpec[sz].waist || sizeSpec[sz].hip))
  if (!hasData) return '<div style="color:#b4b2a9;font-size:12px">사이즈 규격 미등록</div>'

  let html = '<table class="size-spec-table">'
  html += '<thead><tr><th>사이즈</th><th>가슴(cm)</th><th>허리(cm)</th><th>엉덩이(cm)</th></tr></thead>'
  html += '<tbody>'
  sizes.forEach(sz => {
    const spec = sizeSpec[sz] || {}
    if (!spec.bust && !spec.waist && !spec.hip) return
    html += '<tr>'
    html += '<td class="size-spec-label">' + sz + '</td>'
    html += '<td>' + (esc(spec.bust) || '-') + '</td>'
    html += '<td>' + (esc(spec.waist) || '-') + '</td>'
    html += '<td>' + (esc(spec.hip) || '-') + '</td>'
    html += '</tr>'
  })
  html += '</tbody></table>'
  return html
}

// 수정모드 — 전체 사이즈 입력 그리드
window.buildSizeSpecEdit = function(sizeSpec) {
  const safe = (sizeSpec && typeof sizeSpec === 'object' && !Array.isArray(sizeSpec)) ? sizeSpec : {}
  const sizes = SIZE_SPEC_SIZES
  let html = '<table class="size-spec-table size-spec-edit">'
  html += '<thead><tr><th>사이즈</th><th>가슴(cm)</th><th>허리(cm)</th><th>엉덩이(cm)</th></tr></thead>'
  html += '<tbody>'
  sizes.forEach(sz => {
    const spec = safe[sz] || {}
    html += '<tr>'
    html += '<td class="size-spec-label">' + sz + '</td>'
    html += '<td><input type="number" data-size="' + sz + '" data-part="bust" value="' + esc(spec.bust || '') + '" placeholder="-" class="size-spec-input"></td>'
    html += '<td><input type="number" data-size="' + sz + '" data-part="waist" value="' + esc(spec.waist || '') + '" placeholder="-" class="size-spec-input"></td>'
    html += '<td><input type="number" data-size="' + sz + '" data-part="hip" value="' + esc(spec.hip || '') + '" placeholder="-" class="size-spec-input"></td>'
    html += '</tr>'
  })
  html += '</tbody></table>'
  return html
}

// 수집 — 현재 DOM의 size-spec-input 값들을 새 구조로 수집.
// root가 전달되면 root 범위 내에서만 수집 (동일 페이지 다중 그리드 대응), 기본은 document.
window.collectSizeSpec = function(root) {
  const scope = (root && root.querySelector) ? root : document
  const sizes = SIZE_SPEC_SIZES
  const spec = {}
  sizes.forEach(sz => {
    const bust  = scope.querySelector('[data-size="' + sz + '"][data-part="bust"]')
    const waist = scope.querySelector('[data-size="' + sz + '"][data-part="waist"]')
    const hip   = scope.querySelector('[data-size="' + sz + '"][data-part="hip"]')
    const b = bust  ? String(bust.value  || '').trim() : ''
    const w = waist ? String(waist.value || '').trim() : ''
    const h = hip   ? String(hip.value   || '').trim() : ''
    if (b || w || h) spec[sz] = { bust: b, waist: w, hip: h }
  })
  return spec
}

// getStartOfWeek — returns Date representing Sunday (00:00) of the week containing `date`
function getStartOfWeek(date) {
  const d = (date instanceof Date) ? new Date(date) : new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}
if (typeof window !== 'undefined') window.getStartOfWeek = getStartOfWeek


// ===== 테이블 사용자 커스터마이징 영속화 =====
const TABLE_CUSTOM_KEY = 'lemango_table_custom_'
const FILTER_DEFAULT_KEY = 'lemango_filter_default_'

function _serializeColFilters(cf) {
  if (!cf) return {}
  const out = {}
  Object.entries(cf).forEach(([k, v]) => {
    if (v instanceof Set) out[k] = [...v]
    else if (Array.isArray(v)) out[k] = v.slice()
  })
  return out
}
function _deserializeColFilters(obj) {
  const out = {}
  if (!obj) return out
  Object.entries(obj).forEach(([k, v]) => {
    if (Array.isArray(v) && v.length) out[k] = new Set(v)
  })
  return out
}

function saveTableCustom(tabKey) {
  const s = State[tabKey]
  if (!s) return
  const data = {
    activeColumns: s.activeColumns || null,
    inactiveColumns: s.inactiveColumns || [],
    colWidths: s.colWidths || {},
    pageSize: s.pageSize,
    sort: s.sort ? { key: s.sort.key, dir: s.sort.dir } : null,
    columnFilters: _serializeColFilters(s.columnFilters),
    savedAt: new Date().toISOString()
  }
  if (tabKey === 'sales') {
    data.activePlatforms = s.activePlatforms || []
    data.inactivePlatforms = s.inactivePlatforms || []
  }
  try { localStorage.setItem(TABLE_CUSTOM_KEY + tabKey, JSON.stringify(data)) } catch(e) {}
}

function loadTableCustom(tabKey) {
  try {
    const raw = localStorage.getItem(TABLE_CUSTOM_KEY + tabKey)
    if (!raw) return null
    return JSON.parse(raw)
  } catch(e) { return null }
}

function applyTableCustom(tabKey) {
  const data = loadTableCustom(tabKey)
  if (!data) return
  const s = State[tabKey]
  if (!s) return
  if (Array.isArray(data.activeColumns)) s.activeColumns = data.activeColumns.slice()
  if (Array.isArray(data.inactiveColumns)) s.inactiveColumns = data.inactiveColumns.slice()
  if (data.colWidths && typeof data.colWidths === 'object') s.colWidths = { ...data.colWidths }
  else if (!s.colWidths) s.colWidths = {}
  if (typeof data.pageSize !== 'undefined' && data.pageSize !== null) s.pageSize = data.pageSize
  if (data.sort && data.sort.key != null) s.sort = { key: data.sort.key, dir: data.sort.dir || 'asc' }
  if (data.columnFilters) s.columnFilters = _deserializeColFilters(data.columnFilters)
  if (tabKey === 'sales') {
    if (Array.isArray(data.activePlatforms)) s.activePlatforms = data.activePlatforms.slice()
    if (Array.isArray(data.inactivePlatforms)) s.inactivePlatforms = data.inactivePlatforms.slice()
  }
}

function saveFilterDefault(tabKey, filterState) {
  try {
    const data = { ...filterState, savedAt: new Date().toISOString() }
    localStorage.setItem(FILTER_DEFAULT_KEY + tabKey, JSON.stringify(data))
  } catch(e) {}
}
function loadFilterDefault(tabKey) {
  try {
    const raw = localStorage.getItem(FILTER_DEFAULT_KEY + tabKey)
    if (!raw) return null
    return JSON.parse(raw)
  } catch(e) { return null }
}

function applyFilterDefault(tabKey) {
  const data = loadFilterDefault(tabKey)
  if (!data) return false
  Object.entries(data).forEach(([id, val]) => {
    if (id === 'savedAt') return
    const el = document.getElementById(id)
    if (el && typeof val !== 'undefined' && val !== null) el.value = val
  })
  return true
}

function resetTableCustom(tabKey) {
  try {
    localStorage.removeItem(TABLE_CUSTOM_KEY + tabKey)
    localStorage.removeItem(FILTER_DEFAULT_KEY + tabKey)
  } catch(e) {}
  const s = State[tabKey]
  if (s) {
    s.activeColumns = null
    s.inactiveColumns = []
    s.colWidths = {}
    s.columnFilters = {}
    s.pageSize = 10
    if (tabKey === 'sales') {
      s.activePlatforms = []
      s.inactivePlatforms = []
    }
  }
}

function resetTableLayout(tabKey) {
  resetTableCustom(tabKey)
  if (typeof showToast === 'function') showToast('테이블 레이아웃이 초기화되었습니다.')
  const renderMap = { product: 'renderProductTable', stock: 'renderStockTable', plan: 'renderPlanTable', sales: 'renderSalesTable' }
  const fn = window[renderMap[tabKey]]
  if (typeof fn === 'function') fn()
}

function applyColWidthsToHeader(tableId, tabKey) {
  const s = State[tabKey]
  if (!s || !s.colWidths) return
  const table = document.getElementById(tableId)
  if (!table) return
  table.querySelectorAll('thead th').forEach(th => {
    const k = th.dataset.colKey || th.dataset.key
    if (k && s.colWidths[k]) th.style.width = s.colWidths[k] + 'px'
  })
}

// ===== 모달 안전 닫기 =====
async function safeCloseModal(modal, isEditing, closeFn) {
  if (modal._closingInProgress) return
  if (isEditing()) {
    modal._closingInProgress = true
    const ok = await korConfirm('수정 중인 내용이 있습니다.\n종료하시겠습니까?', '종료', '계속 수정')
    modal._closingInProgress = false
    if (!ok) return
  }
  closeFn()
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

// ===== 유사 단어 검색 (초성 + 공백무시 + 부분일치) =====
const CHOSUNG = [
  'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ',
  'ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'
]
const CHOSUNG_SET = new Set(CHOSUNG)

// 한글 문자열 → 초성 추출 (비한글은 그대로 유지)
function extractChosung(str) {
  return [...str].map(ch => {
    const code = ch.charCodeAt(0) - 0xAC00
    if (code < 0 || code > 11171) return ch
    return CHOSUNG[Math.floor(code / 588)]
  }).join('')
}

// 키워드에 초성 문자가 포함됐는지 확인
function hasChosung(kw) {
  return [...kw].some(ch => CHOSUNG_SET.has(ch))
}

// 단일 대상 문자열이 키워드와 매칭되는지 (초성·공백무시·부분일치)
function matchKeyword(target, kw) {
  if (!target) return false
  const t = target.toLowerCase()
  // 1) 일반 부분 일치
  if (t.includes(kw)) return true
  // 2) 공백 제거 후 비교
  const tNoSpace = t.replace(/\s/g, '')
  const kwNoSpace = kw.replace(/\s/g, '')
  if (tNoSpace.includes(kwNoSpace)) return true
  // 3) 초성 검색 (키워드에 초성 문자가 있을 때)
  if (hasChosung(kw)) {
    const chosung = extractChosung(t)
    if (chosung.includes(kw)) return true
    // 혼합 검색: "크X" 같은 한글+초성 혼합도 지원
    const chosungNoSpace = extractChosung(tNoSpace)
    if (chosungNoSpace.includes(kwNoSpace)) return true
  }
  return false
}

// 대상 배열 중 하나라도 키워드와 매칭되면 true
function matchAnyTarget(targets, kw) {
  return targets.some(t => matchKeyword(t, kw))
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
  if (p.mainImage)               return p.mainImage            // 대표이미지 최우선
  if (p.images?.sum?.length)     return p.images.sum[0]
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
  const url = getThumbUrl(p) || PLACEHOLDER_IMG
  const all = getAllImages(p)
  const allJson = JSON.stringify(all).replace(/"/g, '&quot;')
  return `<img src="${url}" class="thumb" loading="lazy"
    onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'"
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

// ===== 상품 품번 검색 유틸 =====
function findProductByKeyword(keyword) {
  const kw = keyword.toLowerCase()
  // 정확 일치 우선
  const exact = State.allProducts.find(x => (x.productCode || '').toLowerCase() === kw)
  if (exact) return exact
  // 부분일치 + 초성
  return State.allProducts.find(x =>
    matchKeyword(x.productCode, kw) || matchKeyword(x.nameKr, kw)
  )
}

// ===== 클립보드 복사 헬퍼 =====
function copyToClipboard(text, btn) {
  if (!text) { showToast('복사할 URL이 없습니다.', 'warning'); return }
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent
    btn.textContent = '복사됨!'
    btn.style.background = 'var(--success)'
    setTimeout(() => { btn.textContent = orig; btn.style.background = '' }, 1500)
  }).catch(() => showToast('복사 실패', 'error'))
}

// ===== 정렬 =====
function resolveValue(p, key) {
  if (key === 'totalSales')   return getTotalSales(p)
  if (key === 'totalStock')   return getTotalStock(p)
  if (key === 'totalRevenue') return getTotalSales(p) * (p.salePrice || 0)
  if (key === 'exhaustion')   return getExhaustion(p)
  if (key === 'lastInDate') {
    const ins = (p.stockLog || []).filter(l => l.type === 'in')
    return ins.length ? ins.reduce((m, l) => l.date > m ? l.date : m, '') : ''
  }
  if (key === 'totalNetRevenue') {
    return _platforms.reduce((s, pl) => {
      const q = p.sales?.[pl] || 0; const r = q * (p.salePrice || 0)
      const fee = (typeof getChannelFeeRate === 'function') ? getChannelFeeRate(pl) : 0
      return s + Math.round(r * (1 - fee / 100))
    }, 0)
  }
  if (key.startsWith('net.')) {
    const pl = key.slice(4); const qty = p.sales?.[pl] || 0; const rev = qty * (p.salePrice || 0)
    const fee = (typeof getChannelFeeRate === 'function') ? getChannelFeeRate(pl) : 0
    return Math.round(rev * (1 - fee / 100))
  }
  if (key.startsWith('rev.')) return (p.sales?.[key.slice(4)] || 0) * (p.salePrice || 0)
  if (key.includes('.'))      return key.split('.').reduce((o,k) => o?.[k], p)
  return p[key]
}

function sortData(arr, key, dir) {
  return [...arr].sort((a, b) => {
    let va = resolveValue(a, key)
    let vb = resolveValue(b, key)
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
      State[stateKey].page = 1
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

// ===== 컬럼 리사이즈 =====
function initColumnResize(tableId) {
  const table = document.getElementById(tableId)
  if (!table) return

  // 모든 thead th 대상 (2단 헤더의 rowspan>1 포함)
  const ths = table.querySelectorAll('thead th')
  ths.forEach(th => {
    // colspan > 1 인 그룹 헤더에는 핸들 안 붙임 (플랫폼 colspan=2 등)
    if (th.colSpan > 1) return
    // 기존 핸들 제거
    th.querySelectorAll('.col-resize-handle').forEach(h => h.remove())

    const handle = document.createElement('div')
    handle.className = 'col-resize-handle'
    th.appendChild(handle)

    let startX, startW

    handle.addEventListener('mousedown', e => {
      e.preventDefault()
      e.stopPropagation()
      startX = e.clientX
      startW = th.offsetWidth
      handle.classList.add('col-resizing')
      document.body.classList.add('col-resize-active')

      const onMove = ev => {
        const diff = ev.clientX - startX
        const newW = Math.max(40, startW + diff)
        th.style.width = newW + 'px'
      }
      const onUp = () => {
        handle.classList.remove('col-resizing')
        document.body.classList.remove('col-resize-active')
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
  })
}

// ===== 한글 확인 다이얼로그 =====
function korConfirm(msg, okText = '확인', cancelText = '취소') {
  return new Promise(resolve => {
    // 중복 방지
    const existing = document.querySelector('.kor-confirm-dialog')
    if (existing) { resolve(false); return }

    const dlg = document.createElement('dialog')
    dlg.className = 'kor-confirm-dialog'
    dlg.innerHTML = `<div class="kor-confirm-box">
      <div class="kor-confirm-msg">${msg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
      <div class="kor-confirm-btns">
        <button class="kor-confirm-cancel" type="button">${cancelText}</button>
        <button class="kor-confirm-ok" type="button">${okText}</button>
      </div>
    </div>`

    let resolved = false
    function cleanup(result) {
      if (resolved) return
      resolved = true
      dlg.close()
      dlg.remove()
      resolve(result)
    }

    dlg.querySelector('.kor-confirm-ok').addEventListener('click', () => cleanup(true), { once: true })
    dlg.querySelector('.kor-confirm-cancel').addEventListener('click', () => cleanup(false), { once: true })
    dlg.addEventListener('cancel', e => { e.preventDefault(); cleanup(false) }, { once: true })

    document.body.appendChild(dlg)
    dlg.showModal()
    dlg.querySelector('.kor-confirm-cancel').focus()
  })
}

// ===== 토스트 =====
function showToast(msg, type = '') {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = `toast ${type} show`
  clearTimeout(el._timer)
  el._timer = setTimeout(() => { el.className = 'toast' }, 3000)
}

// ===== 페이지네이션 =====
const PAGE_SIZE = 10
function getPageSize(tabKey) { const v = State[tabKey]?.pageSize; return v != null ? v : PAGE_SIZE }

function _getFilteredCount(tabKey) {
  return applyColFilters(State[tabKey].filtered, State[tabKey].columnFilters).length
}

function renderPagination(containerId, tabKey, renderFnName) {
  const container = document.getElementById(containerId)
  if (!container) return
  const ps = getPageSize(tabKey)
  if (ps <= 0) { container.innerHTML = ''; return }
  const total = _getFilteredCount(tabKey)
  const totalPages = Math.ceil(total / ps)
  if (totalPages <= 1) { container.innerHTML = ''; return }

  const current = State[tabKey].page || 1
  let start = current <= 5 ? 1 : current - 4
  let end   = Math.min(totalPages, start + 9)
  if (end - start < 9) start = Math.max(1, end - 9)

  const btn = (label, page, disabled, active) =>
    `<button class="pg-btn${active ? ' pg-active' : ''}${disabled ? ' pg-disabled' : ''}"
      ${disabled ? 'disabled' : `onclick="goPage('${tabKey}',${page},'${renderFnName}')"`}>${label}</button>`

  let html = `<div class="pagination">`
  html += btn('◀◀', 1,           current === 1,           false)
  html += btn('◀',  current - 1, current === 1,           false)
  for (let p = start; p <= end; p++) {
    html += btn(p, p, false, p === current)
  }
  html += btn('▶',  current + 1, current === totalPages,  false)
  html += btn('▶▶', totalPages,  current === totalPages,  false)
  html += `</div>`
  container.innerHTML = html
}

function goPage(tabKey, page, renderFnName) {
  const ps = getPageSize(tabKey)
  if (ps <= 0) return
  const totalPages = Math.ceil(_getFilteredCount(tabKey) / ps)
  State[tabKey].page = Math.max(1, Math.min(page, totalPages))
  window[renderFnName]()
}

// ===== 컬럼 필터 =====
function applyColFilters(data, columnFilters) {
  if (!columnFilters) return data
  const keys = Object.keys(columnFilters)
  if (!keys.length) return data
  return data.filter(item => {
    for (const key of keys) {
      const allowed = columnFilters[key]
      if (!allowed || !allowed.size) continue
      const val = String(resolveValue(item, key) ?? '')
      if (!allowed.has(val)) return false
    }
    return true
  })
}

function getColUniqueValues(data, key) {
  const vals = new Set()
  data.forEach(item => vals.add(String(resolveValue(item, key) ?? '')))
  const arr = [...vals]
  // 숫자로만 이루어진 목록이면 숫자 순서로 정렬
  const allNumeric = arr.every(v => v === '' || !isNaN(Number(v)))
  if (allNumeric) {
    return arr.sort((a, b) => {
      if (a === '') return -1
      if (b === '') return 1
      return Number(a) - Number(b)
    })
  }
  return arr.sort((a, b) => a.localeCompare(b, 'ko'))
}

let _colFilterDD = null
function openColumnFilter(th, tabKey, key, renderFnName) {
  closeColumnFilter()

  // 교차 필터: 현재 컬럼을 제외한 다른 필터가 적용된 데이터 기준으로 고유값 추출
  const otherFilters = {}
  Object.entries(State[tabKey].columnFilters || {}).forEach(([k, v]) => {
    if (k !== key && v && v.size) otherFilters[k] = v
  })
  const data = applyColFilters(State[tabKey].filtered, otherFilters)
  const uniqueVals = getColUniqueValues(data, key)
  const curFilter = State[tabKey].columnFilters[key]

  const dd = document.createElement('div')
  dd.className = 'col-filter-dd'
  dd.id = 'colFilterDD'

  let html = '<input type="text" class="cfd-search" placeholder="검색...">'
  html += '<div class="cfd-actions"><a href="#" class="cfd-sel-all">전체 선택</a> <a href="#" class="cfd-desel-all">전체 해제</a></div>'
  html += '<div class="cfd-list">'
  uniqueVals.forEach(val => {
    const checked = !curFilter || curFilter.has(val) ? 'checked' : ''
    const display = val || '(빈값)'
    html += `<label class="cfd-item"><input type="checkbox" value="${esc(val)}" ${checked}><span>${esc(display)}</span></label>`
  })
  html += '</div>'
  html += '<div class="cfd-btns"><button class="btn btn-primary btn-sm cfd-apply">적용</button><button class="btn btn-outline btn-sm cfd-reset">초기화</button></div>'
  dd.innerHTML = html
  document.body.appendChild(dd)

  // Position below th
  const rect = th.getBoundingClientRect()
  dd.style.top = (rect.bottom + window.scrollY) + 'px'
  dd.style.left = (rect.left + window.scrollX) + 'px'
  requestAnimationFrame(() => {
    const r = dd.getBoundingClientRect()
    if (r.right > window.innerWidth - 8) dd.style.left = Math.max(0, window.innerWidth - r.width - 8) + 'px'
    if (r.bottom > window.innerHeight - 8) dd.style.top = (rect.top + window.scrollY - r.height) + 'px'
  })

  // Search within list
  dd.querySelector('.cfd-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    dd.querySelectorAll('.cfd-item').forEach(item => {
      item.style.display = item.querySelector('span').textContent.toLowerCase().includes(q) ? '' : 'none'
    })
  })
  dd.querySelector('.cfd-sel-all').addEventListener('click', e => {
    e.preventDefault()
    dd.querySelectorAll('.cfd-item').forEach(item => { if (item.style.display !== 'none') item.querySelector('input').checked = true })
  })
  dd.querySelector('.cfd-desel-all').addEventListener('click', e => {
    e.preventDefault()
    dd.querySelectorAll('.cfd-item').forEach(item => { if (item.style.display !== 'none') item.querySelector('input').checked = false })
  })
  dd.querySelector('.cfd-apply').addEventListener('click', () => {
    const sel = new Set()
    dd.querySelectorAll('.cfd-item input:checked').forEach(cb => sel.add(cb.value))
    if (sel.size === uniqueVals.length || sel.size === 0) {
      delete State[tabKey].columnFilters[key]
    } else {
      State[tabKey].columnFilters[key] = sel
    }
    State[tabKey].page = 1
    saveTableCustom(tabKey)
    closeColumnFilter()
    window[renderFnName]()
  })
  dd.querySelector('.cfd-reset').addEventListener('click', () => {
    delete State[tabKey].columnFilters[key]
    State[tabKey].page = 1
    saveTableCustom(tabKey)
    closeColumnFilter()
    window[renderFnName]()
  })

  _colFilterDD = dd
  setTimeout(() => document.addEventListener('mousedown', _closeFilterOutside), 0)
}

function _closeFilterOutside(e) {
  const dd = document.getElementById('colFilterDD')
  if (dd && !dd.contains(e.target) && !e.target.classList.contains('th-filter')) closeColumnFilter()
}

function closeColumnFilter() {
  const dd = document.getElementById('colFilterDD')
  if (dd) dd.remove()
  _colFilterDD = null
  document.removeEventListener('mousedown', _closeFilterOutside)
}

function clearAllColumnFilters(tabKey) {
  State[tabKey].columnFilters = {}
}

// ===== initTableFeatures (sort + filter + resize 통합) =====
function initTableFeatures(tableId, tabKey, renderFnName) {
  const table = document.getElementById(tableId)
  if (!table) return

  const sort = State[tabKey].sort
  const filters = State[tabKey].columnFilters || {}

  table.querySelectorAll('thead th').forEach(th => {
    if (th.colSpan > 1) return  // skip group headers

    const key = th.dataset.key
    const noSort = th.dataset.noSort != null
    const noFilter = th.dataset.noFilter != null

    // Wrap content: replace innerHTML with th-content structure
    const label = th.textContent.trim()
    let inner = '<div class="th-content">'
    inner += `<span class="th-label">${label}</span>`
    if (key && !noSort) {
      const isActive = sort.key === key
      const icon = isActive ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'
      inner += `<span class="th-sort${isActive ? ' active' : ''}" title="정렬">${icon}</span>`
    }
    if (key && !noFilter) {
      const isFiltered = !!filters[key]
      inner += `<span class="th-filter${isFiltered ? ' active' : ''}" title="필터">▼</span>`
    }
    inner += '</div>'
    th.innerHTML = inner

    // Sort binding — 정렬 버튼(.th-sort)만 클릭 시 동작, 3단계: 없음→오름→내림→없음
    if (key && !noSort) {
      th.querySelector('.th-sort').addEventListener('click', (e) => {
        e.stopPropagation()
        const cur = State[tabKey].sort
        let newSort
        if (cur.key !== key) {
          // 다른 컬럼 → 오름차순
          newSort = { key, dir: 'asc' }
        } else if (cur.dir === 'asc') {
          // 오름 → 내림
          newSort = { key, dir: 'desc' }
        } else {
          // 내림 → 없음 (기본 정렬 해제)
          newSort = { key: '', dir: 'asc' }
        }
        State[tabKey].sort = newSort
        State[tabKey].page = 1
        if (newSort.key) {
          State[tabKey].filtered = sortData(State[tabKey].filtered, newSort.key, newSort.dir)
        }
        saveTableCustom(tabKey)
        window[renderFnName]()
      })
    }

    // Filter binding
    if (key && !noFilter) {
      th.querySelector('.th-filter').addEventListener('click', (e) => {
        e.stopPropagation()
        openColumnFilter(th, tabKey, key, renderFnName)
      })
    }

    // Resize handle
    th.style.position = 'relative'
    const handle = document.createElement('div')
    handle.className = 'col-resize-handle'
    th.appendChild(handle)
    let startX, startW
    handle.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation()
      startX = e.clientX; startW = th.offsetWidth
      handle.classList.add('col-resizing')
      document.body.classList.add('col-resize-active')
      const onMove = ev => { th.style.width = Math.max(40, startW + (ev.clientX - startX)) + 'px' }
      const onUp = () => {
        handle.classList.remove('col-resizing')
        document.body.classList.remove('col-resize-active')
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        // persist width
        const k = th.dataset.colKey || th.dataset.key
        if (k && State[tabKey]) {
          if (!State[tabKey].colWidths) State[tabKey].colWidths = {}
          State[tabKey].colWidths[k] = th.offsetWidth
          saveTableCustom(tabKey)
        }
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
  })
}

// =============================================
// ===== 공통 컬럼 드래그 관리 =====
// =============================================

// 컬럼 상태 초기화 (activeColumns가 null이면 allCols로 초기화)
function initColumnState(tabKey, allColKeys) {
  const st = State[tabKey]
  if (!st.activeColumns) {
    st.activeColumns = [...allColKeys]
    st.inactiveColumns = []
  }
  // 새로 추가된 컬럼 동기화
  allColKeys.forEach(k => {
    if (!st.activeColumns.includes(k) && !st.inactiveColumns.includes(k)) {
      st.activeColumns.push(k)
    }
  })
  // 삭제된 컬럼 제거
  st.activeColumns = st.activeColumns.filter(k => allColKeys.includes(k))
  st.inactiveColumns = st.inactiveColumns.filter(k => allColKeys.includes(k))
}

// 비활성 영역 렌더 + 드래그 이벤트
function renderColInactiveArea(areaId, tagsId, tabKey, colDefs, fixedKeys, renderFnName) {
  const area = document.getElementById(areaId)
  const tags = document.getElementById(tagsId)
  if (!area || !tags) return
  const inactive = State[tabKey].inactiveColumns
  area.style.display = 'flex'
  if (inactive.length) {
    tags.innerHTML = inactive.map(k => {
      const def = colDefs.find(c => c.key === k)
      const label = def ? def.label : k
      return `<span class="col-inactive-chip" draggable="true" data-col-key="${k}">${label}</span>`
    }).join('')
  } else {
    tags.innerHTML = ''
  }

  // 칩 drag 이벤트
  tags.querySelectorAll('.col-inactive-chip').forEach(chip => {
    chip.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', chip.dataset.colKey)
      e.dataTransfer.setData('application/x-col-source', 'inactive')
      chip.classList.add('col-dragging')
      setTimeout(() => chip.style.opacity = '0.4', 0)
    })
    chip.addEventListener('dragend', () => {
      chip.classList.remove('col-dragging')
      chip.style.opacity = ''
    })
  })

  // 비활성 영역 = 드롭 대상
  area.ondragover = e => { e.preventDefault(); area.classList.add('col-drop-target') }
  area.ondragleave = e => {
    if (!area.contains(e.relatedTarget)) area.classList.remove('col-drop-target')
  }
  area.ondrop = e => {
    e.preventDefault()
    area.classList.remove('col-drop-target')
    const src = e.dataTransfer.getData('application/x-col-source')
    const key = e.dataTransfer.getData('text/plain')
    if (src === 'header' && key && !fixedKeys.includes(key)) {
      removeColumn(tabKey, key, renderFnName)
    }
  }
}

function removeColumn(tabKey, colKey, renderFnName) {
  const st = State[tabKey]
  st.activeColumns = st.activeColumns.filter(k => k !== colKey)
  if (!st.inactiveColumns.includes(colKey)) st.inactiveColumns.push(colKey)
  saveTableCustom(tabKey)
  window[renderFnName]()
}

function restoreColumn(tabKey, colKey, insertIdx, renderFnName) {
  const st = State[tabKey]
  st.inactiveColumns = st.inactiveColumns.filter(k => k !== colKey)
  if (insertIdx === undefined || insertIdx < 0) {
    st.activeColumns.push(colKey)
  } else {
    st.activeColumns.splice(insertIdx, 0, colKey)
  }
  saveTableCustom(tabKey)
  window[renderFnName]()
}

function reorderColumn(tabKey, fromKey, toIdx, renderFnName) {
  const arr = State[tabKey].activeColumns
  const fromIdx = arr.indexOf(fromKey)
  if (fromIdx < 0) return
  arr.splice(fromIdx, 1)
  const insertAt = toIdx > fromIdx ? toIdx - 1 : toIdx
  arr.splice(insertAt < 0 ? 0 : insertAt, 0, fromKey)
  saveTableCustom(tabKey)
  window[renderFnName]()
}

// 테이블 헤더에 드래그 이벤트 바인딩 (initTableFeatures 후 호출)
function bindColumnDragDrop(tableId, tabKey, fixedKeys, renderFnName) {
  const table = document.getElementById(tableId)
  if (!table) return
  const ths = table.querySelectorAll('thead tr:first-child th')
  ths.forEach((th, idx) => {
    const key = th.dataset.colKey || (th.colSpan === 1 ? th.dataset.key : null)
    if (!key || fixedKeys.includes(key)) return
    th.draggable = true
    th.classList.add('col-drag-th')
    th.dataset.colKey = key

    th.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', key)
      e.dataTransfer.setData('application/x-col-source', 'header')
      th.classList.add('col-dragging')
    })
    th.addEventListener('dragend', () => {
      th.classList.remove('col-dragging')
      clearColDropIndicators()
    })
    th.addEventListener('dragover', e => {
      e.preventDefault()
      clearColDropIndicators()
      const rect = th.getBoundingClientRect()
      const mid = rect.left + rect.width / 2
      if (e.clientX < mid) {
        th.classList.add('col-drag-over-left')
      } else {
        th.classList.add('col-drag-over-right')
      }
    })
    th.addEventListener('dragleave', () => {
      th.classList.remove('col-drag-over-left', 'col-drag-over-right')
    })
    th.addEventListener('drop', e => {
      e.preventDefault()
      clearColDropIndicators()
      const colKey = e.dataTransfer.getData('text/plain')
      const src = e.dataTransfer.getData('application/x-col-source')
      if (!colKey) return
      const rect = th.getBoundingClientRect()
      const mid = rect.left + rect.width / 2
      const activeArr = State[tabKey].activeColumns
      const targetIdx = activeArr.indexOf(key)
      const insertIdx = e.clientX < mid ? targetIdx : targetIdx + 1
      if (src === 'inactive') {
        restoreColumn(tabKey, colKey, insertIdx, renderFnName)
      } else if (src === 'header') {
        reorderColumn(tabKey, colKey, insertIdx, renderFnName)
      }
    })
  })
}

function clearColDropIndicators() {
  document.querySelectorAll('.col-drag-over-left, .col-drag-over-right').forEach(el => {
    el.classList.remove('col-drag-over-left', 'col-drag-over-right')
  })
}

// fixStickySubRow — deprecated: thead-level sticky CSS handles 2-row headers
function fixStickySubRow(_tableId) {}

// ===== 미니 달력 (연월 선택 팝업) =====
let _monthPickerEl = null

function openMonthPicker(triggerEl, currentYear, currentMonth, callback) {
  closeMonthPicker()

  const picker = document.createElement('div')
  picker.className = 'month-picker'
  picker.id = 'monthPickerPopup'

  let displayYear = currentYear
  const todayYear = new Date().getFullYear()
  const todayMonth = new Date().getMonth()
  const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

  function render() {
    let html = '<div class="mp-year-nav">'
    html += `<button class="mp-year-btn" data-dir="-1">◀</button>`
    html += `<span class="mp-year-label">${displayYear}년</span>`
    html += `<button class="mp-year-btn" data-dir="1">▶</button>`
    html += '</div><div class="mp-grid">'
    for (let m = 0; m < 12; m++) {
      const isActive = displayYear === currentYear && m === currentMonth
      const isToday  = displayYear === todayYear && m === todayMonth
      let cls = 'mp-btn'
      if (isActive) cls += ' mp-btn-active'
      else if (isToday) cls += ' mp-btn-today'
      html += `<button class="${cls}" data-month="${m}">${MONTHS[m]}</button>`
    }
    html += '</div>'
    picker.innerHTML = html

    // 연도 이동
    picker.querySelectorAll('.mp-year-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        displayYear += parseInt(btn.dataset.dir)
        render()
      })
    })
    // 월 선택
    picker.querySelectorAll('.mp-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        const m = parseInt(btn.dataset.month)
        closeMonthPicker()
        callback(displayYear, m)
      })
    })
  }

  render()
  document.body.appendChild(picker)
  _monthPickerEl = picker

  // 위치 계산
  const rect = triggerEl.getBoundingClientRect()
  picker.style.top = (rect.bottom + window.scrollY + 4) + 'px'
  picker.style.left = (rect.left + window.scrollX + rect.width / 2) + 'px'
  picker.style.transform = 'translateX(-50%)'

  requestAnimationFrame(() => {
    const pr = picker.getBoundingClientRect()
    if (pr.right > window.innerWidth - 8) {
      picker.style.left = (window.innerWidth - pr.width - 8) + 'px'
      picker.style.transform = 'none'
    }
    if (pr.left < 8) {
      picker.style.left = '8px'
      picker.style.transform = 'none'
    }
    if (pr.bottom > window.innerHeight - 8) {
      picker.style.top = (rect.top + window.scrollY - pr.height - 4) + 'px'
    }
  })

  // 바깥 클릭 / ESC 닫기
  setTimeout(() => {
    document.addEventListener('mousedown', _mpOutsideClick)
    document.addEventListener('keydown', _mpEscKey)
  }, 0)
}

function _mpOutsideClick(e) {
  const el = document.getElementById('monthPickerPopup')
  if (el && !el.contains(e.target)) closeMonthPicker()
}
function _mpEscKey(e) {
  if (e.key === 'Escape') closeMonthPicker()
}

function closeMonthPicker() {
  const el = document.getElementById('monthPickerPopup')
  if (el) el.remove()
  _monthPickerEl = null
  document.removeEventListener('mousedown', _mpOutsideClick)
  document.removeEventListener('keydown', _mpEscKey)
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

// =============================================
// ===== 알림 렌더링 =====
// =============================================
function renderNotifications() {
  const badge = document.getElementById('notifBadge')
  const list = document.getElementById('notifList')
  const empty = document.getElementById('notifEmpty')
  if (!badge || !list) return

  const unread = _notifications.filter(n => !n.read).length
  badge.textContent = unread > 99 ? '99+' : unread
  badge.style.display = unread > 0 ? '' : 'none'

  if (_notifications.length === 0) {
    list.style.display = 'none'
    if (empty) empty.style.display = ''
    return
  }
  if (empty) empty.style.display = 'none'
  list.style.display = ''

  // Sort: urgent first, then by timestamp desc
  const sorted = _notifications.slice().sort((a, b) => {
    const au = a.priority === 'urgent' ? 1 : 0
    const bu = b.priority === 'urgent' ? 1 : 0
    if (au !== bu) return bu - au
    return (b.ts || 0) - (a.ts || 0)
  })
  list.innerHTML = sorted.slice(0, 30).map(n => {
    const icon = NOTIF_ICONS[n.type] || '🔔'
    const readCls = n.read ? ' notif-read' : ''
    const urgentCls = n.priority === 'urgent' ? ' notif-item-urgent' : ''
    return `<div class="notif-item${readCls}${urgentCls}" data-nid="${n.id}" onclick="clickNotification('${n.id}')">
      <span class="notif-icon">${icon}</span>
      <div class="notif-body">
        <div class="notif-title">${esc(n.title)}</div>
        <div class="notif-desc">${esc(n.body || '')}</div>
        <div class="notif-time">${timeAgo(n.ts)}</div>
      </div>
      <button class="notif-dismiss" onclick="event.stopPropagation();dismissNotification('${n.id}')" title="삭제">&times;</button>
    </div>`
  }).join('')
}

function toggleNotifDropdown() {
  const dd = document.getElementById('notifDropdown')
  if (!dd) return
  dd.style.display = dd.style.display === 'none' ? '' : 'none'
}

function clickNotification(id) {
  const n = _notifications.find(x => x.id === id)
  if (!n) return
  n.read = true
  saveNotifications()
  if (n.fsId && typeof _fsUpdateNotificationRead === 'function') _fsUpdateNotificationRead(n.fsId, true)
  renderNotifications()
  document.getElementById('notifDropdown').style.display = 'none'
  console.log('[notif click]', { link: n.link, type: n.type })
  if (!n.link) { console.warn('[notif] no link'); return }
  const raw = n.link.startsWith('#') ? n.link.slice(1) : n.link
  if (!raw) return
  const parts = raw.split(':')
  const tab = parts[0]
  console.log('[notif parts]', parts)
  if (!tab) return
  openTab(tab)
  const sub = parts[1], sub2 = parts[2]
  if (!sub) return
  setTimeout(() => {
    try {
      console.log('[notif exec]', tab, sub, sub2)
      if (tab === 'event') {
        const fn = window.openEventDetailModal || openEventDetailModal
        console.log('[notif] event fn?', typeof fn, 'no=', Number(sub))
        fn && fn(Number(sub), false)
      }
      else if (tab === 'plan') {
        const fn = window.openPlanDetailModal || openPlanDetailModal
        fn && fn(Number(sub))
      }
      else if (tab === 'work') {
        if (sub === 'personal') {
          if (window.switchWorkTab) window.switchWorkTab('personal')
          if (sub2) setTimeout(() => { const fn = window.openPersonalDetailModal || openPersonalDetailModal; fn && fn(sub2) }, 400)
        } else {
          const fn = window.openWorkDetailModal || openWorkDetailModal
          fn && fn(Number(sub), false)
        }
      }
      else if (tab === 'board') {
        const fn = window.openBoardPost || openBoardPost
        fn && fn(sub)
      }
      else if (tab === 'hradmin') {
        if (sub === 'attend') {
          const uid = parts[2], date = parts[3]
          if (window.switchHrAdminTab) window.switchHrAdminTab('teamAttend')
          setTimeout(() => {
            const dateEl = document.getElementById('hradminAttendDateFilter')
            if (dateEl && date) dateEl.value = date
            const searchEl = document.getElementById('hradminAttendSearch')
            if (searchEl && uid) {
              try {
                const u = (typeof _allUsers !== 'undefined' ? _allUsers : []).find(x => x.uid === uid)
                if (u && u.name) searchEl.value = u.name
              } catch(e) {}
            }
            if (window.renderTeamAttendTab) window.renderTeamAttendTab()
          }, 300)
        }
        else if (sub === 'teamAttend' || sub === 'teamLeave' || sub === 'leaveApproval' || sub === 'attendApproval' || sub === 'salaryAdmin' || sub === 'memberList' || sub === 'activityLog' || sub === 'backupManage') {
          if (window.switchHrAdminTab) window.switchHrAdminTab(sub)
        }
      }
    } catch(e) { console.error('notification nav error', e) }
  }, 600)
}

function dismissNotification(id) {
  const n = _notifications.find(x => x.id === id)
  if (n && n.fsId && typeof _fsDeleteNotification === 'function') _fsDeleteNotification(n.fsId)
  _notifications = _notifications.filter(n => n.id !== id)
  saveNotifications()
  renderNotifications()
}

function clearAllNotifications() {
  _notifications.forEach(n => {
    n.read = true
    if (n.fsId && typeof _fsUpdateNotificationRead === 'function') _fsUpdateNotificationRead(n.fsId, true)
  })
  saveNotifications()
  renderNotifications()
}

// =============================================
// ===== 사용자 프로필 팝업 =====
// =============================================

function _onProfileOutsideClick(e) {
  const popup = document.getElementById('userProfilePopup')
  if (popup && !popup.contains(e.target)) {
    closeUserProfilePopup()
  }
}

function closeUserProfilePopup() {
  document.removeEventListener('click', _onProfileOutsideClick)
  const popup = document.getElementById('userProfilePopup')
  if (popup) popup.remove()
}

window.showUserProfile = async function(uid, anchorEl) {
  if (!uid || !anchorEl) return
  closeUserProfilePopup()

  try {
    const doc = await firebase.firestore().collection('users').doc(uid).get()
    if (!doc.exists) return
    const u = doc.data()

    const popup = document.createElement('div')
    popup.className = 'user-profile-popup'
    popup.id = 'userProfilePopup'
    popup.innerHTML = `
      <div class="upp-name">${esc(formatUserName(u.name, u.position))}</div>
      <div class="upp-divider"></div>
      <div class="upp-row"><span class="upp-label">이메일</span><span>${esc(u.email || '-')}</span></div>
      <div class="upp-row"><span class="upp-label">전화</span><span>${esc(u.phone || '-')}</span></div>
      <div class="upp-row"><span class="upp-label">부서</span><span>${esc(u.dept || '-')}</span></div>
      <div class="upp-row"><span class="upp-label">직급</span><span>${esc(u.position || '-')}</span></div>
      <div class="upp-row"><span class="upp-label">등급</span><span>${gradeBadgeHtml(u.grade)}</span></div>
    `

    const rect = anchorEl.getBoundingClientRect()
    popup.style.top = (rect.bottom + window.scrollY + 4) + 'px'
    popup.style.left = rect.left + 'px'

    document.body.appendChild(popup)

    // Adjust if off-screen right
    const popRect = popup.getBoundingClientRect()
    if (popRect.right > window.innerWidth) {
      popup.style.left = (window.innerWidth - popRect.width - 8) + 'px'
    }
    // Adjust if off-screen bottom
    if (popRect.bottom > window.innerHeight) {
      popup.style.top = (rect.top + window.scrollY - popRect.height - 4) + 'px'
    }

    setTimeout(() => {
      document.addEventListener('click', _onProfileOutsideClick)
    }, 50)
  } catch(e) {
    console.error('showUserProfile error:', e)
  }
}

window.closeUserProfilePopup = closeUserProfilePopup

function formatDateTime(isoStr) {
  if (!isoStr) return ''
  if (typeof isoStr === 'object' && typeof isoStr.toDate === 'function') isoStr = isoStr.toDate()
  if (isoStr instanceof Date) isoStr = isoStr.toISOString()
  if (typeof isoStr !== 'string') return ''
  return isoStr.slice(0, 10) + ' ' + isoStr.slice(11, 16)
}

function renderStampInfo(obj) {
  obj = obj || {}
  const escFn = (typeof esc === 'function') ? esc : (s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'))
  const cName = obj.createdByName || '-'
  const cDate = obj.createdAt ? formatDateTime(obj.createdAt) : '-'
  const hasMod = obj.lastModifiedAt && obj.lastModifiedAt !== obj.createdAt
  const mName = hasMod ? (obj.lastModifiedByName || '-') : '-'
  const mDate = hasMod ? formatDateTime(obj.lastModifiedAt) : '-'
  return '<div class="stamp-info">'
    + '<span class="stamp-created">작성자: ' + escFn(cName) + ' (' + cDate + ')</span>'
    + '<span class="stamp-separator">/</span>'
    + '<span class="stamp-modified">최종수정자: ' + escFn(mName) + ' (' + mDate + ')</span>'
    + '</div>'
}

window.formatDateTime = formatDateTime
window.renderStampInfo = renderStampInfo

function convertUrlsToHtml(urlString) {
  if (!urlString) return ''
  const urls = String(urlString)
    .split(/[\n,]+/)
    .map(u => u.trim())
    .filter(u => u.length > 0 && (u.startsWith('http') || u.startsWith('//')))
  return urls.map(url => '<center><img src="' + url + '"></center>').join('\n')
}
window.convertUrlsToHtml = convertUrlsToHtml

function copyImageHtml(key) {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p) return
  let urlString = ''
  if (key === 'jasa') {
    const a = [...(p.images?.lemango||[]), ...(p.images?.noir||[])]
    urlString = a.join('\n')
  } else if (key === 'mainImage') {
    urlString = p.mainImage || ''
  } else {
    const arr = p.images?.[key]
    urlString = Array.isArray(arr) ? arr.join('\n') : (arr || '')
  }
  if (!urlString.trim()) { showToast('URL이 없습니다.', 'warning'); return }
  const html = convertUrlsToHtml(urlString)
  navigator.clipboard.writeText(html).then(() => showToast('HTML 복사 완료 (' + key + ')'))
}
window.copyImageHtml = copyImageHtml

function copyAllImageHtml() {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p) return
  const sections = ['sum', 'lemango', 'noir', 'external', 'design', 'shoot']
  let allHtml = ''
  sections.forEach(key => {
    const arr = p.images?.[key]
    const urlString = Array.isArray(arr) ? arr.join('\n') : (arr || '')
    if (urlString.trim()) allHtml += convertUrlsToHtml(urlString) + '\n'
  })
  if (!allHtml.trim()) { showToast('이미지 URL이 없습니다.', 'warning'); return }
  navigator.clipboard.writeText(allHtml.trim()).then(() => showToast('전체 이미지 HTML 복사 완료'))
}
window.copyAllImageHtml = copyAllImageHtml

// ===== 사이즈/가이드/모델 HTML 복사 (카페24 상세페이지용) =====
window.copySizeGuideHtml = function() {
  // 현재 열린 모달 → 상품 또는 기획 데이터
  let p = null
  if (typeof _detailCode !== 'undefined' && _detailCode) {
    p = State.allProducts.find(x => x.productCode === _detailCode) || null
  }
  if (!p && typeof _editingPlanNo !== 'undefined' && _editingPlanNo != null) {
    p = (State.planItems || []).find(x => x.no === _editingPlanNo) || null
  }
  if (!p) { showToast('상품 데이터를 찾을 수 없습니다.', 'warning'); return }

  const sizeSpec = (p.sizeSpec && typeof p.sizeSpec === 'object' && !Array.isArray(p.sizeSpec)) ? p.sizeSpec : {}
  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
  const activeSizes = sizes.filter(function(sz) {
    const s = sizeSpec[sz]
    return s && (s.bust || s.waist || s.hip)
  })

  if (activeSizes.length === 0) {
    showToast('사이즈 규격이 입력되지 않았습니다.', 'warning')
    return
  }

  const chestLine = p.chestLine || ''
  const legCut = p.legCut || ''
  const transparency = p.transparency || ''
  const lining = p.lining || ''
  const capRing = p.capRing || ''
  const modelSize = p.modelSize || ''

  const sizeLabels = { 'XS':'75(XS)', 'S':'80(S)', 'M':'85(M)', 'L':'90(L)', 'XL':'95(XL)', 'XXL':'100(XXL)' }

  // ========== CSS ==========
  let css = '<style>\n'
  css += '\t.sg5-wrap {\n\t\tcolor: #171717; font-size: 14px; line-height: 1.6; font-family: \'Pretendard\', \'Noto Sans KR\', sans-serif;\n\t}\n'
  css += '\t.sg5-wrap .sg5-section { margin-bottom: 28px; }\n'
  css += '\t.sg5-wrap p { margin: 0 0 10px; }\n'
  css += '\t.sg5-wrap strong { font-size: 15px; }\n'
  css += '\t.sg5-wrap table { width: 100%; border-collapse: collapse; table-layout: fixed; }\n'
  css += '\t.sg5-wrap td { border: 1px solid #ddd; padding: 10px 6px; text-align: center; white-space: nowrap; }\n'
  css += '\t.sg5-wrap .sg5-bg { background-color: #f3f3f3; }\n'
  css += '\t.sg5-wrap .sg5-head { background: #f3f3f3; font-weight: 500; }\n'
  css += '\t.sg5-wrap .sg5-td-label { background: #f3f3f3; font-weight: 500; }\n'
  // 모바일 사이즈 탭
  css += '\t.sg5-wrap .sg5-size-card { display: none; }\n'
  css += '\t.sg5-wrap .sg5-size-tabs { display: flex; gap: 6px; margin-bottom: 10px; }\n'
  css += '\t.sg5-wrap .sg5-size-tabs label { flex: 1; height: 38px; display: flex; align-items: center; justify-content: center; border: 1px solid #ddd; background: #f9f9f9; font-size: 13px; cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none; }\n'
  css += '\t.sg5-wrap .sg5-size-radio { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }\n'
  css += '\t.sg5-wrap .sg5-size-content { display: none; border: 1px solid #ddd; }\n'
  css += '\t.sg5-wrap .sg5-size-row { display: flex; justify-content: space-between; gap: 14px; padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 13px; }\n'
  css += '\t.sg5-wrap .sg5-size-row:last-child { border-bottom: none; }\n'
  css += '\t.sg5-wrap .sg5-row-label { color: #777; font-weight: 500; }\n'
  css += '\t.sg5-wrap .sg5-row-val { text-align: right; }\n'
  // 탭 활성 CSS
  activeSizes.forEach(function(sz) {
    const id = sz.toLowerCase()
    css += '\t#sg5_tab_' + id + ':checked ~ .sg5-size-tabs label[for="sg5_tab_' + id + '"] { background: #171717; color: #fff; border-color: #171717; }\n'
    css += '\t#sg5_tab_' + id + ':checked ~ .sg5-size-panels #sg5_panel_' + id + ' { display: block; }\n'
  })
  // 모바일 가이드 아코디언
  css += '\t.sg5-wrap .sg5-guide-acc { display: none; }\n'
  css += '\t.sg5-wrap .sg5-guide-acc details { border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; }\n'
  css += '\t.sg5-wrap .sg5-guide-acc summary { list-style: none; cursor: pointer; padding: 10px 0 12px; -webkit-tap-highlight-color: transparent; user-select: none; }\n'
  css += '\t.sg5-wrap .sg5-guide-acc summary::-webkit-details-marker { display: none; }\n'
  css += '\t.sg5-wrap .sg5-g-head { display: flex; align-items: center; justify-content: space-between; padding: 0 0 6px; }\n'
  css += '\t.sg5-wrap .sg5-g-head-title { font-weight: 700; font-size: 15px; color: #171717; }\n'
  css += '\t.sg5-wrap .sg5-g-tri { font-size: 12px; color: #555; line-height: 1; transform: translateY(-1px); }\n'
  css += '\t.sg5-wrap .sg5-guide-acc details[open] .sg5-g-tri { transform: rotate(180deg) translateY(1px); }\n'
  css += '\t.sg5-wrap .sg5-g-sum { font-size: 13px; color: #555; line-height: 1.55; word-break: keep-all; }\n'
  css += '\t.sg5-wrap .sg5-g-body { padding: 10px 0 0; }\n'
  css += '\t.sg5-wrap .sg5-card { border: 1px solid #ddd; margin-bottom: 12px; }\n'
  css += '\t.sg5-wrap .sg5-card-title { background: #f3f3f3; padding: 8px 10px; font-weight: 500; font-size: 13px; }\n'
  css += '\t.sg5-wrap .sg5-card-list { display: flex; gap: 12px; padding: 10px; flex-wrap: wrap; }\n'
  css += '\t.sg5-wrap .sg5-card-list span { font-size: 13px; color: #171717; }\n'
  css += '\t@media(max-width:768px) {\n'
  css += '\t\t.sg5-wrap .sg5-size-table,\n\t\t.sg5-wrap .sg5-guide-table { display: none; }\n'
  css += '\t\t.sg5-wrap .sg5-size-card { display: block; }\n'
  css += '\t\t.sg5-wrap .sg5-guide-acc { display: block; }\n'
  css += '\t\t.sg5-wrap .sg5-guide-title { display: none; }\n'
  css += '\t}\n'
  css += '</style>\n\n'

  // ========== BODY ==========
  let body = '<div class="sg5-wrap">\n'

  // ── 사이즈 정보 ──
  body += '\t<div class="sg5-section">\n'
  body += '\t\t<p><strong>사이즈 정보</strong></p>\n'

  // PC 테이블
  body += '\t\t<table class="sg5-size-table" id="sg5_sizeTable">\n\t\t\t<tbody>\n'
  body += '\t\t\t\t<tr>\n\t\t\t\t\t<td class="sg5-head">사이즈</td>\n\t\t\t\t\t<td class="sg5-head">가슴</td>\n\t\t\t\t\t<td class="sg5-head">허리</td>\n\t\t\t\t\t<td class="sg5-head">엉덩이</td>\n\t\t\t\t</tr>\n'
  activeSizes.forEach(function(sz) {
    const spec = sizeSpec[sz]
    body += '\t\t\t\t<tr>\n'
    body += '\t\t\t\t\t<td class="sg5-bg">' + (sizeLabels[sz] || sz) + '</td>\n'
    body += '\t\t\t\t\t<td>' + (spec.bust || '-') + '</td>\n'
    body += '\t\t\t\t\t<td>' + (spec.waist || '-') + '</td>\n'
    body += '\t\t\t\t\t<td>' + (spec.hip || '-') + '</td>\n'
    body += '\t\t\t\t</tr>\n'
  })
  body += '\t\t\t</tbody>\n\t\t</table>\n'

  // 모바일 탭
  body += '\t\t<div class="sg5-size-card">\n'
  activeSizes.forEach(function(sz, i) {
    const id = sz.toLowerCase()
    body += '\t\t\t<input type="radio" name="sg5_size_tab" id="sg5_tab_' + id + '"' + (i === 0 ? ' checked="true"' : '') + ' class="sg5-size-radio">\n'
  })
  body += '\t\t\t<div class="sg5-size-tabs">\n'
  activeSizes.forEach(function(sz) {
    body += '\t\t\t\t<label for="sg5_tab_' + sz.toLowerCase() + '">' + (sizeLabels[sz] || sz) + '</label>\n'
  })
  body += '\t\t\t</div>\n'
  body += '\t\t\t<div class="sg5-size-panels">\n'
  activeSizes.forEach(function(sz) {
    const id = sz.toLowerCase()
    const spec = sizeSpec[sz]
    body += '\t\t\t\t<div class="sg5-size-content" id="sg5_panel_' + id + '">\n'
    body += '\t\t\t\t\t<div class="sg5-size-row"><span class="sg5-row-label">사이즈</span><span class="sg5-row-val">' + (sizeLabels[sz] || sz) + '</span></div>\n'
    body += '\t\t\t\t\t<div class="sg5-size-row"><span class="sg5-row-label">가슴</span><span class="sg5-row-val">' + (spec.bust || '-') + 'cm</span></div>\n'
    body += '\t\t\t\t\t<div class="sg5-size-row"><span class="sg5-row-label">허리</span><span class="sg5-row-val">' + (spec.waist || '-') + 'cm</span></div>\n'
    body += '\t\t\t\t\t<div class="sg5-size-row"><span class="sg5-row-label">엉덩이</span><span class="sg5-row-val">' + (spec.hip || '-') + 'cm</span></div>\n'
    body += '\t\t\t\t</div>\n'
  })
  body += '\t\t\t</div>\n\t\t</div>\n'
  body += '\t\t<p>\n\t\t\t* 둘레 기준(cm)\n\t\t\t<br> * 측정 방법과 제품 특성에 따라 1~3cm 정도의 오차가 발생할 수 있습니다.\n\t\t</p>\n'
  body += '\t</div>\n'

  // ── 가이드 ──
  if (chestLine || legCut || transparency || lining || capRing) {
    const chestOpts = ['낮음', '보통', '높음']
    const legOpts = ['로우컷', '노멀컷', '미들컷', '하이컷']
    const transOpts = ['없음', '있음', '약간 있음']
    const liningOpts = ['없음', '있음', '부분 있음']
    const capOpts = ['없음', '있음']

    function _guideRow(label, value, options) {
      let r = '\t\t\t\t<tr>\n\t\t\t\t\t<td class="sg5-td-label">' + label + '</td>\n'
      options.forEach(function(opt) {
        r += '\t\t\t\t\t<td>' + (opt === value ? '●' : '○') + ' ' + opt + '</td>\n'
      })
      for (let i = options.length; i < 4; i++) r += '\t\t\t\t\t<td></td>\n'
      r += '\t\t\t\t</tr>\n'
      return r
    }

    function _guideCard(label, value, options) {
      let c = '\t\t\t\t\t<div class="sg5-card">\n\t\t\t\t\t\t<div class="sg5-card-title">' + label + '</div>\n\t\t\t\t\t\t<div class="sg5-card-list">\n'
      options.forEach(function(opt) {
        c += '\t\t\t\t\t\t\t<span>' + (opt === value ? '●' : '○') + ' ' + opt + '</span>\n'
      })
      c += '\t\t\t\t\t\t</div>\n\t\t\t\t\t</div>\n'
      return c
    }

    body += '\t<div class="sg5-section">\n'
    body += '\t\t<p class="sg5-guide-title"><strong>가이드</strong></p>\n'

    // PC 가이드 테이블
    body += '\t\t<table class="sg5-guide-table" id="sg5_guideTable">\n\t\t\t<tbody>\n'
    if (chestLine) body += _guideRow('가슴선', chestLine, chestOpts)
    if (legCut) body += _guideRow('다리파임', legCut, legOpts)
    if (transparency) body += _guideRow('비침', transparency, transOpts)
    if (lining) body += _guideRow('안감', lining, liningOpts)
    if (capRing) body += _guideRow('캡고리', capRing, capOpts)
    body += '\t\t\t</tbody>\n\t\t</table>\n'

    // 모바일 가이드 아코디언
    body += '\t\t<div class="sg5-guide-acc">\n\t\t\t<details>\n'
    body += '\t\t\t\t<summary>\n'
    body += '\t\t\t\t\t<div class="sg5-g-head">\n\t\t\t\t\t\t<span class="sg5-g-head-title">가이드</span>\n\t\t\t\t\t\t<span aria-hidden="true" class="sg5-g-tri">▼</span>\n\t\t\t\t\t</div>\n'
    const sumParts = []
    if (chestLine) sumParts.push('가슴선 : ' + chestLine)
    if (legCut) sumParts.push('다리파임 : ' + legCut)
    if (transparency) sumParts.push('비침 : ' + transparency)
    if (lining) sumParts.push('안감 : ' + lining)
    if (capRing) sumParts.push('캡고리 : ' + capRing)
    body += '\t\t\t\t\t<div class="sg5-g-sum">\n\t\t\t\t\t\t' + sumParts.join(' / ') + '\n\t\t\t\t\t</div>\n'
    body += '\t\t\t\t</summary>\n'
    body += '\t\t\t\t<div class="sg5-g-body">\n'
    if (chestLine) body += _guideCard('가슴선', chestLine, chestOpts)
    if (legCut) body += _guideCard('다리파임', legCut, legOpts)
    if (transparency) body += _guideCard('비침', transparency, transOpts)
    if (lining) body += _guideCard('안감', lining, liningOpts)
    if (capRing) body += _guideCard('캡고리', capRing, capOpts)
    body += '\t\t\t\t</div>\n\t\t\t</details>\n\t\t</div>\n'
    body += '\t</div>\n'
  }

  // ── 모델 사이즈 ──
  if (modelSize) {
    body += '\t<div class="sg5-section">\n'
    body += '\t\t<p><strong>모델 사이즈</strong></p>\n'
    body += '\t\t<p>' + modelSize.replace(/\n/g, '<br>') + '</p>\n'
    body += '\t</div>\n'
  }

  body += '</div>'

  const fullHtml = css + body

  const _fallback = () => {
    const ta = document.createElement('textarea')
    ta.value = fullHtml
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    showToast('사이즈/가이드 HTML 복사 완료')
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(fullHtml).then(() => showToast('사이즈/가이드 HTML 복사 완료')).catch(_fallback)
  } else {
    _fallback()
  }
}

// ===== Feature 6: Inline cell edit (double-click) =====
const _INLINE_EDIT_BOUND = new WeakSet()
function initInlineEdit(tableId, tabKey) {
  const table = document.getElementById(tableId)
  if (!table) return
  if (_INLINE_EDIT_BOUND.has(table)) return
  _INLINE_EDIT_BOUND.add(table)
  table.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td[data-editable]')
    if (!td) return
    if (td.querySelector('.inline-edit-input')) return
    const tr = td.closest('tr')
    if (!tr) return
    const key = td.getAttribute('data-editable')
    const id = tabKey === 'product' ? tr.getAttribute('data-code') : Number(tr.getAttribute('data-no'))
    if (id == null || id === '' || (typeof id === 'number' && Number.isNaN(id))) return
    e.stopPropagation()
    _startInlineEdit(td, tabKey, id, key)
  })
}
function _startInlineEdit(td, tabKey, id, key) {
  const item = tabKey === 'product'
    ? State.allProducts.find(p => p.productCode === id)
    : State.planItems.find(p => p.no === id)
  if (!item) return
  const curRaw = item[key] != null ? item[key] : ''
  const origHtml = td.innerHTML
  let inputEl
  const selectKeys = {
    type: ['onepiece','bikini','two piece'],
    saleStatus: ['판매중','종료','추가생산']
  }
  if (selectKeys[key]) {
    inputEl = document.createElement('select')
    inputEl.className = 'inline-edit-input'
    selectKeys[key].forEach(v => {
      const o = document.createElement('option')
      o.value = v; o.textContent = v
      if (String(curRaw) === v) o.selected = true
      inputEl.appendChild(o)
    })
  } else if (key === 'salePrice' || key === 'costPrice') {
    inputEl = document.createElement('input')
    inputEl.type = 'number'
    inputEl.className = 'inline-edit-input'
    inputEl.value = curRaw || 0
  } else {
    inputEl = document.createElement('input')
    inputEl.type = 'text'
    inputEl.className = 'inline-edit-input'
    inputEl.value = curRaw
  }
  td.innerHTML = ''
  td.appendChild(inputEl)
  inputEl.focus()
  if (inputEl.select) try { inputEl.select() } catch(_){}
  let done = false
  const commit = () => {
    if (done) return; done = true
    let val = inputEl.value
    if (key === 'salePrice' || key === 'costPrice') val = Number(val) || 0
    saveInlineEdit(tabKey, id, key, val)
  }
  const cancel = () => {
    if (done) return; done = true
    td.innerHTML = origHtml
  }
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
  })
  inputEl.addEventListener('blur', commit)
}
function saveInlineEdit(tabKey, id, key, value) {
  const item = tabKey === 'product'
    ? State.allProducts.find(p => p.productCode === id)
    : State.planItems.find(p => p.no === id)
  if (!item) return
  item[key] = value
  if (typeof stampModified === 'function') { try { stampModified(item) } catch(_){} }
  try {
    if (tabKey === 'product' && typeof saveProducts === 'function') saveProducts().catch(e => console.error(e))
    else if (tabKey === 'plan' && typeof savePlanItems === 'function') savePlanItems().catch(e => console.error(e))
  } catch(_){}
  if (typeof showToast === 'function') showToast('수정되었습니다')
  if (tabKey === 'product' && typeof renderProductTable === 'function') renderProductTable()
  else if (tabKey === 'plan' && typeof renderPlanTable === 'function') renderPlanTable()
}
window.initInlineEdit = initInlineEdit
window.saveInlineEdit = saveInlineEdit

// ===== Feature 12: Row double-click → detail =====
const _ROW_DBLCLICK_BOUND = new WeakSet()
function initRowDblClick(tableId, callback) {
  const table = document.getElementById(tableId)
  if (!table) return
  if (_ROW_DBLCLICK_BOUND.has(table)) return
  _ROW_DBLCLICK_BOUND.add(table)
  table.addEventListener('dblclick', (e) => {
    const tag = (e.target.tagName || '').toLowerCase()
    if (['input','select','textarea','button','label'].includes(tag)) return
    if (e.target.closest('td[data-editable]')) return
    if (e.target.closest('.code-link')) return
    const tr = e.target.closest('tbody tr')
    if (!tr) return
    callback(tr)
  })
}
window.initRowDblClick = initRowDblClick

/* ===== Feature 5: filterMyAssigned ===== */
function filterMyAssigned(tabKey) {
  try {
    const uid = (typeof _myUid === 'function') ? _myUid() : ''
    if (!uid) { if (typeof showToast === 'function') showToast('로그인이 필요합니다', 'warn'); return }
    if (!State[tabKey]) return
    const source = (tabKey === 'plan') ? (State.planItems || []) : (State.allProducts || [])
    State[tabKey].filtered = source.filter(x => x && x.assignee === uid)
    State[tabKey].page = 1
    const tableNameMap = { product: 'renderProductTable', stock: 'renderStockTable', plan: 'renderPlanTable', sales: 'renderSalesTable' }
    const fnName = tableNameMap[tabKey]
    if (fnName && typeof window[fnName] === 'function') window[fnName]()
    if (typeof showToast === 'function') showToast(`내 담당 ${State[tabKey].filtered.length}건`, 'success')
  } catch(e) { console.warn(e) }
}
window.filterMyAssigned = filterMyAssigned
