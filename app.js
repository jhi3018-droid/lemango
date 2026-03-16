/* ===================================================
   르망고 관리 시스템 - app.js
   =================================================== */

// ===== 전역 상태 =====
const State = {
  allProducts: [],
  product: { filtered: [], sort: { key: 'no', dir: 'asc' } },
  stock:   { filtered: [], sort: { key: 'no', dir: 'asc' } },
  sales:   { filtered: [], sort: { key: 'totalSales', dir: 'desc' } },
  modal:   { images: [], idx: 0 }
}

// ===== 초기화 =====
async function init() {
  renderDate()
  bindTabs()
  initDraggable()
  try {
    const [lem, noir] = await Promise.all([
      fetch('data/products_lemango.json').then(r => r.json()),
      fetch('data/products_noir.json').then(r => r.json())
    ])
    State.allProducts = [...lem, ...noir]
    State.product.filtered = [...State.allProducts]
    State.stock.filtered   = [...State.allProducts]
    State.sales.filtered   = [...State.allProducts]
    renderDashboard()
    renderProductTable()
    renderStockTable()
    renderSalesTable()
  } catch (e) {
    showToast('데이터 로드 실패: ' + e.message, 'error')
    console.error(e)
  }
  // Enter 키 검색
  ['pKeyword','sKeyword','slKeyword'].forEach(id => {
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
  const platforms = ['공홈','GS','29cm','W쇼핑','기타']
  const totals = platforms.map(pl =>
    State.allProducts.reduce((s,p) => s + (p.sales?.[pl] || 0), 0)
  )
  const max = Math.max(...totals) || 1
  const w = canvas.width, h = canvas.height
  const barW = 44, gap = (w - platforms.length * barW) / (platforms.length + 1)
  const colors = ['#1a1a2e','#c9a96e','#4caf7d','#f0a500','#e05252']
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
function searchProduct() {
  const raw      = document.getElementById('pKeyword').value
  const keywords = parseKeywords(raw)
  const field    = document.getElementById('pSearchField').value
  const dateType = document.getElementById('pDateType').value
  const dateFrom = document.getElementById('pDateFrom').value
  const dateTo   = document.getElementById('pDateTo').value
  const brand    = document.getElementById('pBrand').value
  const type     = document.getElementById('pType').value

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
      // 키워드 중 하나라도 포함되면 통과 (OR 검색)
      if (!keywords.some(kw => targets.some(t => (t||'').toLowerCase().includes(kw)))) return false
    }
    if (dateFrom || dateTo) {
      if (!isInRange(p[dateType], dateFrom, dateTo)) return false
    }
    if (brand !== 'all' && p.brand !== brand) return false
    if (type  !== 'all' && !((p.type||'').toLowerCase().includes(type.toLowerCase()))) return false
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
  document.getElementById('pType').value = 'all'
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
  document.getElementById('stockRegisterModal').showModal()
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
  const sizes = ['XS','S','M','L','XL']
  area.innerHTML = `
    <div class="sip-product-info" style="margin:12px 0 10px">
      <span class="sip-brand">${p.brand}</span>
      <span class="sip-code">${p.productCode}</span>
      <span class="sip-name">${p.nameKr}</span>
    </div>
    <div class="sip-sizes">
      ${sizes.map(sz => `
        <div class="sip-size-item">
          <label class="sip-size-label">${sz}</label>
          <input type="number" class="sip-size-input" id="srmStock_${sz}"
            value="${p.stock?.[sz]||0}" min="0"
            oninput="updateSrmTotal()" />
        </div>`).join('')}
      <div class="sip-size-item sip-total-item">
        <label class="sip-size-label">합계</label>
        <span class="sip-total-num" id="srmTotal">${getTotalStock(p)}</span>
      </div>
    </div>
    <div class="sip-actions">
      <button class="btn btn-primary" onclick="saveSrmStock('${p.productCode}')">저장</button>
    </div>
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
  sizes.forEach(sz => { p.stock[sz] = parseInt(document.getElementById(`srmStock_${sz}`).value)||0 })
  State.stock.filtered = State.stock.filtered.map(x => x.productCode === productCode ? p : x)
  renderStockTable()
  showToast(`${p.nameKr} 재고 저장 완료`, 'success')
  document.getElementById('srmProductArea').innerHTML = '<div class="srm-empty">저장됐습니다. 다른 품번을 입력하세요.</div>'
  document.getElementById('srmKeyword').value = ''
}

function handleStockRegisterUpload(input) {
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
      const dataRows = raw.slice(1).filter(r => String(r[0]||'').trim())
      if (!dataRows.length) { showToast('데이터가 없습니다.', 'error'); return }

      _stockUploadData = dataRows.map((row, idx) => {
        const code = String(row[0]||'').trim()
        const p = State.allProducts.find(x => x.productCode === code)
        return {
          rowNum: idx + 2,
          code,
          nameKr: p ? p.nameKr : '—',
          XS: parseInt(row[2])||0, S: parseInt(row[3])||0,
          M:  parseInt(row[4])||0, L: parseInt(row[5])||0, XL: parseInt(row[6])||0,
          found: !!p
        }
      })

      const valid = _stockUploadData.filter(r => r.found).length
      const notFound = _stockUploadData.filter(r => !r.found).length
      document.getElementById('srmPreviewCount').innerHTML =
        `<span style="font-weight:400;font-size:12px;color:var(--text-sub)">
          전체 ${_stockUploadData.length}건 | <span style="color:var(--success)">매칭 ${valid}건</span>
          ${notFound ? ` | <span style="color:var(--danger)">미매칭 ${notFound}건</span>` : ''}
        </span>`

      document.getElementById('srmPreviewTbody').innerHTML = _stockUploadData.map(r => `
        <tr class="${r.found ? '' : 'upm-row-error'}">
          <td>${r.rowNum}</td>
          <td>${r.code}</td>
          <td>${r.nameKr}</td>
          <td style="text-align:center">${r.XS}</td>
          <td style="text-align:center">${r.S}</td>
          <td style="text-align:center">${r.M}</td>
          <td style="text-align:center">${r.L}</td>
          <td style="text-align:center">${r.XL}</td>
          <td style="text-align:center;font-weight:700">${r.XS+r.S+r.M+r.L+r.XL}</td>
          <td>${r.found ? '<span class="upm-badge ok">✅ 매칭</span>' : '<span class="upm-badge err">❌ 미매칭</span>'}</td>
        </tr>`).join('')

      document.getElementById('srmPreviewSection').style.display = ''
      document.getElementById('srmConfirmBtn').style.display = valid > 0 ? '' : 'none'
      document.getElementById('srmConfirmBtn').textContent = `${valid}건 저장`
    } catch (err) {
      showToast('파일 읽기 오류: ' + err.message, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
}

function confirmStockUpload() {
  if (!_stockUploadData) return
  let cnt = 0
  _stockUploadData.filter(r => r.found).forEach(r => {
    const p = State.allProducts.find(x => x.productCode === r.code)
    if (!p) return
    p.stock = { XS: r.XS, S: r.S, M: r.M, L: r.L, XL: r.XL }
    cnt++
  })
  State.stock.filtered = [...State.allProducts]
  renderStockTable()
  showToast(`${cnt}건 재고 저장 완료`, 'success')
  document.getElementById('stockRegisterModal').close()
  _stockUploadData = null
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

  const platforms = ['공홈','GS','29cm','W쇼핑','기타']
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
  const data = State[type === 'product' ? 'product' : type === 'stock' ? 'stock' : 'sales'].filtered
  let rows, headers, sheetName

  if (type === 'product') {
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
      '판매_공홈','판매_GS','판매_29cm','판매_W쇼핑','판매_기타','판매_합계',
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
      p.sales?.공홈||0, p.sales?.GS||0, p.sales?.['29cm']||0, p.sales?.W쇼핑||0, p.sales?.기타||0, getTotalSales(p),
      getExhaustion(p), p.registDate||'', p.logisticsDate||''
    ])
    sheetName = '상품전체'
  } else if (type === 'stock') {
    headers = ['품번','상품명','브랜드','판매가','XS','S','M','L','XL','합계']
    rows = data.map(p => [
      p.productCode, p.nameKr, p.brand, p.salePrice,
      p.stock?.XS||0, p.stock?.S||0, p.stock?.M||0, p.stock?.L||0, p.stock?.XL||0,
      getTotalStock(p)
    ])
    sheetName = '재고조회'
  } else {
    headers = ['품번','상품명','브랜드','판매가','공홈','GS','29cm','W쇼핑','기타','합계']
    rows = data.map(p => [
      p.productCode, p.nameKr, p.brand, p.salePrice,
      p.sales?.공홈||0, p.sales?.GS||0, p.sales?.['29cm']||0, p.sales?.W쇼핑||0, p.sales?.기타||0,
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
      ['품번','상품명','재고XS','재고S','재고M','재고L','재고XL'],
      ['LSWON16266707','코트다쥐르 쉘',3,15,20,12,5]
    ]
    filename = '르망고_재고_샘플.xlsx'
    sheetName = '재고'
  } else {
    aoa = [
      ['품번','상품명','날짜','공홈','GS','29cm','W쇼핑','기타'],
      ['LSWON16266707','코트다쥐르 쉘','2026-03-01',10,5,8,3,2]
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
      sales: { 공홈: 0, GS: 0, '29cm': 0, W쇼핑: 0, 기타: 0 },
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
    p.sales['공홈']  = (p.sales['공홈']  || 0) + (+row[3]||0)
    p.sales['GS']   = (p.sales['GS']   || 0) + (+row[4]||0)
    p.sales['29cm'] = (p.sales['29cm'] || 0) + (+row[5]||0)
    p.sales['W쇼핑'] = (p.sales['W쇼핑'] || 0) + (+row[6]||0)
    p.sales['기타']  = (p.sales['기타']  || 0) + (+row[7]||0)
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
let _detailCode = null   // 현재 열린 상품 코드

// 드래그 + 리사이즈 초기화 (최초 1회)
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

function openDetailModal(productCode) {
  const p = State.allProducts.find(x => x.productCode === productCode)
  if (!p) return
  _detailCode = productCode

  const modal = document.getElementById('detailModal')
  modal.classList.remove('edit-mode')
  document.getElementById('dEditBtn').textContent = '✏️ 수정'
  // 위치 초기화 (매번 열릴 때 중앙으로)
  modal.style.left = ''
  modal.style.top  = ''

  // 헤더
  document.getElementById('dBrand').textContent   = p.brand
  document.getElementById('dNameKr').textContent  = p.nameKr || ''
  document.getElementById('dCode').textContent    = p.productCode

  // 이미지
  const allImgs = getAllImages(p)
  const mainImg = document.getElementById('dImgMain')
  const noneEl  = document.getElementById('dImgNone')
  if (allImgs.length) {
    mainImg.src = allImgs[0]
    mainImg.style.display = ''
    noneEl.style.display = 'none'
  } else {
    mainImg.style.display = 'none'
    noneEl.style.display = ''
  }
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
}

function dSwitchImg(el, url) {
  document.getElementById('dImgMain').src = url
  document.getElementById('dImgMain').style.display = ''
  document.querySelectorAll('.dimg-thumb').forEach(t => t.classList.remove('active'))
  el.classList.add('active')
}

function buildDetailContent(p) {
  const sizes  = ['XS','S','M','L','XL']
  const platforms = ['공홈','GS','29cm','W쇼핑','기타']

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

  // URL 필드 (복사 버튼 포함)
  const urlField = (label, key, val, type='text') =>
    `<div class="dfield span3">
      <div class="dfield-label-row">
        <span class="dfield-label">${label}</span>
        ${val ? `<button type="button" class="btn-copy-url" onclick="copyFieldUrl('${key}',this)" title="클립보드 복사">복사</button>` : ''}
      </div>
      <span class="dfield-value${!val ? ' empty' : ''}${type==='textarea' ? ' long' : ''}" data-urlkey="${key}">${val || '-'}</span>
      ${type==='textarea'
        ? `<textarea data-key="${key}" rows="4">${val||''}</textarea>`
        : `<input type="${type}" data-key="${key}" value="${(val||'').toString().replace(/"/g,'&quot;')}" />`
      }
    </div>`

  const typeOpts = ['onepiece','bikini','two piece'].map(v =>
    `<option value="${v}"${p.type===v?' selected':''}>${v}</option>`).join('')
  const legOpts = ['normal cut','middle cut','high cut','low cut'].map((v,i) =>
    `<option value="${v}"${p.legCut===v?' selected':''}>${['노멀컷','미들컷','하이컷','로우컷'][i]}</option>`).join('')
  const chestLineOpts = ['낮음','보통','높음'].map(v =>
    `<option value="${v}"${p.chestLine===v?' selected':''}>${v}</option>`).join('')
  const transparencyOpts = ['없음','약간있음'].map(v =>
    `<option value="${v}"${p.transparency===v?' selected':''}>${v}</option>`).join('')
  const liningOpts = ['없음','있음'].map(v =>
    `<option value="${v}"${p.lining===v?' selected':''}>${v}</option>`).join('')
  const capRingOpts = ['없음','있음'].map(v =>
    `<option value="${v}"${p.capRing===v?' selected':''}>${v}</option>`).join('')
  const fabricOpts = ['포일','일반'].map(v =>
    `<option value="${v}"${p.fabricType===v?' selected':''}>${v}</option>`).join('')
  const brandOpts = ['르망고','르망고 느와'].map(v =>
    `<option value="${v}"${p.brand===v?' selected':''}>${v}</option>`).join('')

  return `
    <div class="dsection">
      <div class="dsection-title">기본 정보</div>
      <div class="dsection-grid">
        ${field('브랜드',    'brand',       p.brand,    'select', brandOpts)}
        ${field('품번',      'productCode', p.productCode)}
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
              <span class="dstock-num${n===0?' zero':''}" id="dstock_${sz}">${n}</span>
            </div>`
          }).join('')}
          <div class="dstock-badge" style="background:var(--table-header)">
            <span class="dstock-size">합계</span>
            <span class="dstock-num">${getTotalStock(p)}</span>
          </div>
        </div>
        <div class="dsection-grid" style="margin-top:10px;display:none" id="dStockEditGrid">
          ${sizes.map(sz =>
            `<div class="dfield">
              <span class="dfield-label">${sz}</span>
              <input type="number" data-stock="${sz}" value="${p.stock?.[sz]||0}" min="0" style="display:none" />
            </div>`
          ).join('')}
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
        ${urlField('르망고 자사몰', 'urlLemango', (p.images?.lemango||[]).join('\n'), 'textarea')}
        ${urlField('느와 자사몰',   'urlNoir',    (p.images?.noir||[]).join('\n'),    'textarea')}
        ${urlField('외부몰',        'urlExternal',(p.images?.external||[]).join('\n'),'textarea')}
        ${urlField('SUM',           'urlSum',     (p.images?.sum||[]).join('\n'),     'textarea')}
        ${urlField('영상 URL',      'videoUrl',   p.videoUrl || '',                  'text')}
      </div>
    </div>

    <div class="dmodal-edit-footer">
      <button type="button" class="btn btn-outline" onclick="toggleDetailEdit()">취소</button>
      <button type="button" class="btn btn-new" onclick="saveDetailEdit()">저장</button>
    </div>
  `
}

function toggleDetailEdit() {
  const modal = document.getElementById('detailModal')
  const isEdit = modal.classList.toggle('edit-mode')
  document.getElementById('dEditBtn').textContent = isEdit ? '❌ 취소' : '✏️ 수정'

  // 재고 수정 입력칸 토글
  const stockGrid = document.getElementById('dStockEditGrid')
  if (stockGrid) {
    stockGrid.style.display = isEdit ? 'grid' : 'none'
    stockGrid.querySelectorAll('input').forEach(inp => inp.style.display = isEdit ? 'block' : 'none')
  }
}

function saveDetailEdit() {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p) return

  // 일반 필드 수집
  document.querySelectorAll('#dDetailContent .dfield [data-key]').forEach(inp => {
    const key = inp.dataset.key
    const val = inp.value.trim()
    if (key === 'salePrice' || key === 'costPrice') {
      p[key] = parseInt(val) || 0
    } else if (['urlLemango','urlNoir','urlExternal','urlSum'].includes(key)) {
      const arr = val.split(/[\n\r]+/).map(u=>u.trim()).filter(Boolean)
      if (key === 'urlLemango') p.images.lemango  = arr
      if (key === 'urlNoir')    p.images.noir     = arr
      if (key === 'urlExternal')p.images.external = arr
      if (key === 'urlSum')     p.images.sum      = arr
    } else if (key === 'videoUrl') {
      p.videoUrl = val || null
    } else {
      p[key] = val
    }
  })

  // 재고 수집
  document.querySelectorAll('#dDetailContent [data-stock]').forEach(inp => {
    p.stock[inp.dataset.stock] = parseInt(inp.value) || 0
  })

  // 테이블 갱신
  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  renderProductTable()
  renderStockTable()
  renderDashboard()

  // 모달 뷰모드로 전환 후 재렌더
  document.getElementById('detailModal').classList.remove('edit-mode')
  document.getElementById('dEditBtn').textContent = '✏️ 수정'
  openDetailModal(_detailCode)
  showToast('상품 정보가 수정되었습니다.', 'success')
}

// =============================================
// ===== 신규등록 모달 =====
// =============================================
function openRegisterModal() {
  const form = document.getElementById('registerForm')
  form.reset()
  // 오늘 날짜를 등록일 기본값으로
  document.getElementById('rRegistDate').value = new Date().toISOString().slice(0,10)
  document.getElementById('registerModal').showModal()
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
    stock: {
      XS: parseInt(document.getElementById('rStockXS').value) || 0,
      S:  parseInt(document.getElementById('rStockS').value)  || 0,
      M:  parseInt(document.getElementById('rStockM').value)  || 0,
      L:  parseInt(document.getElementById('rStockL').value)  || 0,
      XL: parseInt(document.getElementById('rStockXL').value) || 0
    },
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

// [코드, 영문명, 한글명]
const DESIGN_CODES = [
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

function initPcodePanel() {
  if (!document.getElementById('pcDesign')) return
  renderDesignList('')
  selectDesign('1626')
  updateProductCode()
}

function renderDesignList(query) {
  const q = query.toLowerCase().trim()
  const list = q
    ? DESIGN_CODES.filter(([code, en, kr]) =>
        code.includes(q) || en.toLowerCase().includes(q) || kr.toLowerCase().includes(q)
      )
    : DESIGN_CODES
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
  const found = DESIGN_CODES.find(([c]) => c === code)
  if (!found) return
  document.getElementById('pcDesign').value = code
  document.getElementById('pcDesignSearch').value = ''
  document.getElementById('pcDesignSearch').placeholder = `${code} - ${found[1]} (${found[2]})`
  renderDesignList('')
  updateProductCode()
}

function togglePcodePanel() {
  const panel = document.getElementById('pcodePanel')
  const btn = document.getElementById('pcodeToggleBtn')
  const open = panel.style.display === 'none' || panel.style.display === ''
  panel.style.display = open ? 'flex' : 'none'
  btn.textContent = open ? '자동생성 ▴' : '자동생성 ▾'
  if (open) updateProductCode()
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

  // 이미 등록된 품번 + 임시 예약된 품번 모두 체크
  const used = new Set()
  State.allProducts.forEach(p => {
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
  if (nextNum === null) {
    seqDisplay.textContent = '만료'
    document.getElementById('pcPreview').textContent = '사용 가능한 번호 없음'
  } else {
    seqDisplay.textContent = nextNum
    document.getElementById('pcPreview').textContent = prefix + nextNum
  }
}

function applyGeneratedCode() {
  const code = document.getElementById('pcPreview').textContent
  if (!code || code === '-' || code === '사용 가능한 번호 없음') return

  // 이미 등록된 품번과 중복 최종 확인
  if (State.allProducts.some(p => p.productCode === code) || _reservedCodes.has(code)) {
    showToast(`품번 "${code}"은 이미 사용 중입니다. 다시 생성해주세요.`, 'error')
    updateProductCode()
    return
  }

  // 임시 예약 등록 (등록 완료 전까지 다른 생성에서 건너뜀)
  _reservedCodes.add(code)

  document.getElementById('rProductCode').value = code
  document.getElementById('pcodePanel').style.display = 'none'
  document.getElementById('pcodeToggleBtn').textContent = '자동생성 ▾'
  showToast(`품번 ${code} 적용됨`, 'success')
}

// ===== 실행 =====
document.addEventListener('DOMContentLoaded', init)
