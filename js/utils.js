// =============================================
// ===== 유틸 함수들 =====
// =============================================

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

function renderPagination(containerId, tabKey, renderFnName) {
  const container = document.getElementById(containerId)
  if (!container) return
  const total = State[tabKey].filtered.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
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
  const totalPages = Math.ceil(State[tabKey].filtered.length / PAGE_SIZE)
  State[tabKey].page = Math.max(1, Math.min(page, totalPages))
  window[renderFnName]()
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
