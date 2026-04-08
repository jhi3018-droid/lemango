// =============================================
// ===== 상품조회 =====
// =============================================
function prodStatusBadge(status) {
  if (!status) return '<span class="prod-status-badge prod-status-default">-</span>'
  const cls = {
    '지속생산': 'prod-status-active',
    '단종': 'prod-status-disc',
    '시즌한정': 'prod-status-season',
    '샘플': 'prod-status-sample'
  }[status] || 'prod-status-default'
  return `<span class="prod-status-badge ${cls}">${status}</span>`
}
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
      if (!keywords.some(kw => matchAnyTarget(targets, kw))) return false
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
  saveFilterDefault('product', {
    pKeyword: raw, pSearchField: field, pDateType: dateType, pDateFrom: dateFrom, pDateTo: dateTo,
    pBrand: brand, pGender: gender, pType: type, pLegCut: legCut,
    pSaleStatus: document.getElementById('pSaleStatus').value
  })
  renderProductTable()
}

function changeProductPageSize(val) {
  State.product.pageSize = parseInt(val) || 0
  State.product.page = 1
  saveTableCustom('product')
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
  document.getElementById('pPageSize').value = '10'
  State.product.pageSize = 10
  State.product.page = 1
  State.product.columnFilters = {}
  State.product.activeColumns = null
  State.product.inactiveColumns = []
  State.product.filtered = [...State.allProducts]
  renderProductTable()
}

function getProductThumbUrl(p) {
  const real = getThumbUrl(p)
  if (real) return { url: real, isTemp: false }
  if (p?.tempImages && p.tempImages.length) return { url: p.tempImages[0].url, isTemp: true }
  return { url: PLACEHOLDER_IMG, isTemp: false }
}
window.getProductThumbUrl = getProductThumbUrl

// 상품조회 컬럼 정의
const PRODUCT_COLUMNS = [
  { key:'_check',     label:'<input type="checkbox" onchange="toggleAllProdCheck(this)">', fixed:true, thAttr:'data-no-sort data-no-filter style="width:36px;text-align:center"',
    td:p=>`<td style="text-align:center"><input type="checkbox" class="prod-check" data-code="${p.productCode}" onclick="event.stopPropagation()"></td>` },
  { key:'no',         label:'No.',       fixed:false, thAttr:'data-key="no" data-no-filter style="width:45px;text-align:center"', td:p=>`<td style="text-align:center">${p.no}</td>` },
  { key:'_image',     label:'이미지',    fixed:true,  thAttr:'data-no-sort data-no-filter style="width:60px"', td:p=>{
    const t = getProductThumbUrl(p)
    const all = getAllImages(p)
    const allJson = JSON.stringify(all).replace(/"/g, '&quot;')
    const cls = t.isTemp ? 'table-thumb table-thumb-temp' : 'table-thumb'
    const tag = t.isTemp ? '<span class="table-thumb-tag">임시</span>' : ''
    return `<td><div class="${cls}"><img src="${t.url}" class="thumb" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" onclick='openModal(0, ${allJson})' />${tag}</div></td>`
  } },
  { key:'brand',      label:'브랜드',    fixed:false, thAttr:'data-key="brand"', td:p=>`<td><span style="font-size:12px">${p.brand}</span></td>` },
  { key:'productCode',label:'품번',      fixed:true,  thAttr:'data-key="productCode" style="width:145px"', td:p=>`<td><span class="code-link" onclick="openDetailModal('${p.productCode}')">${p.productCode}</span></td>` },
  { key:'nameKr',     label:'상품명',    fixed:false, thAttr:'data-key="nameKr"', td:p=>`<td data-editable="nameKr" style="max-width:160px;overflow:hidden;text-overflow:ellipsis" title="${p.nameKr}">${p.nameKr}</td>` },
  { key:'colorKr',    label:'색상',      fixed:false, thAttr:'data-key="colorKr"', td:p=>`<td>${p.colorKr||'-'}</td>` },
  { key:'salePrice',  label:'판매가',    fixed:false, thAttr:'data-key="salePrice" style="text-align:right"', td:p=>`<td data-editable="salePrice" style="text-align:right"><span class="price">${fmtPrice(p.salePrice)}</span></td>` },
  { key:'costPrice',  label:'원가',      fixed:false, thAttr:'data-key="costPrice" style="text-align:right"', td:p=>`<td data-editable="costPrice" style="text-align:right"><span class="price">${fmtPrice(p.costPrice)}</span></td>` },
  { key:'type',       label:'타입',      fixed:false, thAttr:'data-key="type"', td:p=>`<td data-editable="type">${typeBadge(p.type)}</td>` },
  { key:'productionStatus', label:'생산상태', fixed:false, thAttr:'data-key="productionStatus" style="width:80px"', td:p=>`<td data-editable="saleStatus">${prodStatusBadge(p.productionStatus)}</td>` },
  { key:'backStyle',  label:'백스타일',  fixed:false, thAttr:'data-key="backStyle"', td:p=>`<td style="font-size:12px;max-width:120px;overflow:hidden;text-overflow:ellipsis">${p.backStyle||'-'}</td>` },
  { key:'legCut',     label:'레그컷',    fixed:false, thAttr:'data-key="legCut"', td:p=>`<td style="font-size:12px">${p.legCut||'-'}</td>` },
  { key:'madeMonth',  label:'제조년월',  fixed:false, thAttr:'data-key="madeMonth"', td:p=>`<td style="font-size:12px">${p.madeMonth||'-'}</td>` },
  { key:'lastInDate', label:'최종입고일',fixed:false, thAttr:'data-key="lastInDate"', td:p=>`<td style="font-size:12px">${((p.stockLog||[]).filter(l=>l.type==='in').reduce((m,l)=>l.date>m?l.date:m,''))||'—'}</td>` },
  { key:'madeIn',     label:'제조국',    fixed:false, thAttr:'data-key="madeIn"', td:p=>`<td>${p.madeIn||'-'}</td>` },
  { key:'totalStock', label:'입고수량',  fixed:false, thAttr:'data-key="totalStock" style="text-align:right"', td:p=>`<td style="text-align:right;font-family:Inter">${fmtNum(getTotalStock(p))}</td>`, tfoot:true },
  { key:'totalSales', label:'판매수량',  fixed:false, thAttr:'data-key="totalSales" style="text-align:right"', td:p=>`<td style="text-align:right;font-family:Inter">${fmtNum(getTotalSales(p))}</td>`, tfoot:true },
  { key:'exhaustion', label:'소진율',    fixed:false, thAttr:'data-key="exhaustion" style="width:120px"', td:p=>`<td>${progressBar(getExhaustion(p))}</td>` },
]
const PRODUCT_FIXED_KEYS = PRODUCT_COLUMNS.filter(c=>c.fixed).map(c=>c.key)

function renderProductTable() {
  const _favArea = document.getElementById('productFavArea')
  if (_favArea && typeof renderFavoritesBar === 'function') _favArea.innerHTML = renderFavoritesBar('product')
  const allKeys = PRODUCT_COLUMNS.map(c=>c.key)
  initColumnState('product', allKeys)
  applyTableCustom('product')
  // re-sync newly added columns after restore
  allKeys.forEach(k => {
    if (!State.product.activeColumns.includes(k) && !State.product.inactiveColumns.includes(k)) State.product.activeColumns.push(k)
  })
  State.product.activeColumns = State.product.activeColumns.filter(k => allKeys.includes(k))
  State.product.inactiveColumns = State.product.inactiveColumns.filter(k => allKeys.includes(k))
  renderColInactiveArea('pInactiveArea','pInactiveTags','product',PRODUCT_COLUMNS,PRODUCT_FIXED_KEYS,'renderProductTable')

  const data = applyColFilters(State.product.filtered, State.product.columnFilters)
  const page = State.product.page || 1
  const ps = getPageSize('product')
  const pageData = ps === 0 ? data : data.slice((page - 1) * ps, page * ps)
  document.getElementById('pTableMeta').textContent = `검색결과 ${data.length}건`

  if (!data.length) {
    document.getElementById('pTableWrap').innerHTML = `<div class="empty-state"><p>검색 결과가 없습니다.</p></div>`
    document.getElementById('pPagination').innerHTML = ''
    return
  }

  const activeCols = State.product.activeColumns.map(k => PRODUCT_COLUMNS.find(c=>c.key===k)).filter(Boolean)
  const totStock = data.reduce((s,p) => s + getTotalStock(p), 0)
  const totSales = data.reduce((s,p) => s + getTotalSales(p), 0)

  const thHtml = activeCols.map(c => `<th ${c.thAttr} data-col-key="${c.key}">${c.label}</th>`).join('')
  const tbodyHtml = pageData.map(p => `<tr data-code="${p.productCode}">${activeCols.map(c => c.td(p)).join('')}</tr>`).join('')

  // tfoot: 합계 행
  const tfootCols = activeCols.map(c => {
    if (c.key === 'totalStock') return `<td style="text-align:right;font-family:Inter">${totStock.toLocaleString()}</td>`
    if (c.key === 'totalSales') return `<td style="text-align:right;font-family:Inter">${totSales.toLocaleString()}</td>`
    return null
  })
  const lastSumIdx = tfootCols.reduce((last, v, i) => v !== null ? i : last, -1)
  let tfHtml = ''
  if (lastSumIdx >= 0) {
    const beforeCount = lastSumIdx - (tfootCols.slice(0, lastSumIdx).filter(v=>v!==null).length - (tfootCols[lastSumIdx]!==null?0:0))
    // simple approach: colspan up to first tfoot col, then individual
    const firstSumIdx = tfootCols.findIndex(v=>v!==null)
    tfHtml = `<tr>`
    if (firstSumIdx > 0) tfHtml += `<td colspan="${firstSumIdx}" style="text-align:right">합계</td>`
    for (let i = firstSumIdx; i < activeCols.length; i++) {
      tfHtml += tfootCols[i] || '<td></td>'
    }
    tfHtml += '</tr>'
  }

  document.getElementById('pTableWrap').innerHTML = `
    <table class="data-table" id="productTable">
      <thead><tr>${thHtml}</tr></thead>
      <tbody>${tbodyHtml}</tbody>
      ${tfHtml ? `<tfoot>${tfHtml}</tfoot>` : ''}
    </table>`

  initTableFeatures('productTable', 'product', 'renderProductTable')
  bindColumnDragDrop('productTable', 'product', PRODUCT_FIXED_KEYS, 'renderProductTable')
  applyColWidthsToHeader('productTable', 'product')
  renderPagination('pPagination', 'product', 'renderProductTable')
  // Feature 6: inline edit
  initInlineEdit('productTable', 'product')
  // Feature 12: row double-click → detail
  initRowDblClick('productTable', (tr) => {
    const code = tr.getAttribute('data-code')
    if (code) openDetailModal(code)
  })
}

function toggleAllProdCheck(cb) {
  document.querySelectorAll('#productTable .prod-check').forEach(el => { el.checked = cb.checked })
}
window.toggleAllProdCheck = toggleAllProdCheck
