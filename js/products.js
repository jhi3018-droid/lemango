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
  State.product.page = 1
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
  State.product.page = 1
  State.product.filtered = [...State.allProducts]
  renderProductTable()
}

function renderProductTable() {
  const data = State.product.filtered
  const sort = State.product.sort
  const page = State.product.page || 1
  const pageData = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  document.getElementById('pTableMeta').textContent = `검색결과 ${data.length}건`

  if (!data.length) {
    document.getElementById('pTableWrap').innerHTML = `<div class="empty-state"><p>검색 결과가 없습니다.</p></div>`
    document.getElementById('pPagination').innerHTML = ''
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
      <tbody>${pageData.map(p => {
        const st = getTotalStock(p), sl = getTotalSales(p), ex = getExhaustion(p)
        return `<tr>
          <td style="text-align:center">${p.no}</td>
          <td>${renderThumb(p)}</td>
          <td><span style="font-size:12px">${p.brand}</span></td>
          <td><span class="code-link" onclick="openDetailModal('${p.productCode}')">${p.productCode}</span></td>
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
  renderPagination('pPagination', 'product', 'renderProductTable')
}
