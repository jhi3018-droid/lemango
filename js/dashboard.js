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
