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
      if (!keywords.some(kw => matchAnyTarget(targets, kw))) return false
    }
    if (dateFrom || dateTo) {
      if (!isInRange(p.registDate, dateFrom, dateTo)) return false
    }
    if (platform !== 'all' && !(p.sales?.[platform] > 0)) return false
    return true
  })
  State.sales.page = 1
  State.sales.filtered = sortData(result, State.sales.sort.key, State.sales.sort.dir)
  renderSalesTable()
}

function resetSales() {
  ['slKeyword','slDateFrom','slDateTo'].forEach(id => document.getElementById(id).value = '')
  document.getElementById('slPlatform').value = 'all'
  State.sales.page = 1
  State.sales.filtered = [...State.allProducts]
  State.sales.sort = { key: 'totalSales', dir: 'desc' }
  renderSalesTable()
}

function renderSalesTable() {
  const data = State.sales.filtered
  const sort = State.sales.sort
  const page = State.sales.page || 1
  const pageData = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  document.getElementById('slTableMeta').textContent = `검색결과 ${data.length}건`

  if (!data.length) {
    document.getElementById('slTableWrap').innerHTML = `<div class="empty-state"><p>검색 결과가 없습니다.</p></div>`
    document.getElementById('slPagination').innerHTML = ''
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
      <tbody>${pageData.map(p => {
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
  renderPagination('slPagination', 'sales', 'renderSalesTable')
}
