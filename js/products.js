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

// =============================================
// ===== 정보 미완성 판정 (기획 인사이트 Phase 1) =====
// =============================================
// 🔴 판정 기준 = **실제 필드 공백**(복종/백스타일/레그컷). `infoIncomplete` 플래그는 출처 기록 전용이며 판정에 쓰지 않는다
//    (작업지시 결정 #4) → 스텁이 아닌 기존 상품(대부분)도 정확히 잡히고, 속성을 채우면 플래그와 무관하게 배지가 사라진다.
//    공백 판정 = null/undefined/공백문자열 전부 미입력으로 간주(trim 후 비교).
const PROD_ATTR_FIELDS = [
  { key: 'type',      short: '복', label: '복종' },
  { key: 'backStyle', short: '백', label: '백스타일' },
  { key: 'legCut',    short: '레', label: '레그컷' }
]
function _prodAttrEmpty(v) { return String(v == null ? '' : v).trim() === '' }
// 미입력 속성 목록 반환(순서 고정) — 배지/카운트/일괄입력 공용 단일 소스
function _prodMissingAttrs(p) {
  if (!p) return []
  return PROD_ATTR_FIELDS.filter(f => _prodAttrEmpty(p[f.key]))
}
function _prodIsInfoIncomplete(p) { return _prodMissingAttrs(p).length > 0 }
window._prodMissingAttrs = _prodMissingAttrs
window._prodIsInfoIncomplete = _prodIsInfoIncomplete

// 검색 조건(c)으로 상품 좁히기 — 순수 함수(렌더/DOM 없음).
// searchProduct + refreshAllProductViews/실시간 동기화 재적용 공용 → 검색이 데이터 갱신에도 유지됨
function _narrowProduct(c) {
  return State.allProducts.filter(p => {
    // Soft-deleted products are hidden from main 상품조회 (휴지통에서만 노출)
    if (p.deleted === true) return false
    if (c.keywords.length) {
      const getTargets = () => {
        if (c.field === 'nameKr')      return [p.nameKr, p.nameEn]
        if (c.field === 'productCode') return [p.productCode, p.sampleNo]
        if (c.field === 'backStyle')   return [p.backStyle]
        if (c.field === 'barcode')     return [p.barcode]
        return [p.nameKr, p.nameEn, p.productCode, p.sampleNo, p.colorKr, p.backStyle, p.barcode]
      }
      if (!c.keywords.some(kw => matchAnyTarget(getTargets(), kw))) return false
    }
    if (c.dateFrom || c.dateTo) {
      if (!isInRange(p[c.dateType], c.dateFrom, c.dateTo)) return false
    }
    if (c.brand !== 'all' && p.brand !== c.brand) return false

    // 성별 필터 — 품번 3번째 자리에서 추출
    if (c.gender !== 'all') {
      const g = _codeGender(p.productCode)
      if (!g || g !== c.gender) return false
    }

    // 타입 필터 — 품번 4-5번째 자리 우선, p.type fallback
    if (c.type !== 'all') {
      const t = _codeType(p.productCode)
      if (t) {
        if (t !== c.type) return false
      } else {
        const fallbackTypes = _TYPE_FALLBACK[c.type] || []
        if (!fallbackTypes.includes((p.type||'').toLowerCase())) return false
      }
    }

    if (c.legCut !== 'all' && (p.legCut || '') !== c.legCut) return false
    if (c.saleStatus !== 'all' && (p.saleStatus || '판매중') !== c.saleStatus) return false

    // 정보 완성도 필터(Phase 1) — 미지정('all')이면 미필터
    if (c.infoState === 'incomplete' && !_prodIsInfoIncomplete(p)) return false
    if (c.infoState === 'complete' && _prodIsInfoIncomplete(p)) return false

    return true
  })
}
window._narrowProduct = _narrowProduct

function searchProduct() {
  const c = {
    keywords: parseKeywords(document.getElementById('pKeyword').value),
    field:    document.getElementById('pSearchField').value,
    dateType: document.getElementById('pDateType').value,
    dateFrom: document.getElementById('pDateFrom').value,
    dateTo:   document.getElementById('pDateTo').value,
    brand:    document.getElementById('pBrand').value,
    gender:   document.getElementById('pGender').value,
    type:     document.getElementById('pType').value,
    legCut:   document.getElementById('pLegCut').value,
    saleStatus: document.getElementById('pSaleStatus').value,
    infoState: (document.getElementById('pInfoState') || {}).value || 'all'
  }
  State.product.searchCriteria = c   // 커밋된 검색조건 저장 → 데이터 갱신 시 재적용
  State.product.page = 1
  State.product.filtered = _narrowProduct(c)   // 정렬은 렌더에서 적용(render-sort)
  // 검색 필터는 localStorage 영속화하지 않음 — 새로고침 시 빈 상태로 시작
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
  const _infoSel = document.getElementById('pInfoState'); if (_infoSel) _infoSel.value = 'all'
  document.getElementById('pPageSize').value = '10'
  State.product.pageSize = 10
  State.product.page = 1
  State.product.columnFilters = {}
  State.product.activeColumns = null
  State.product.inactiveColumns = []
  State.product.sort = { key: 'registDate', dir: 'desc' }
  State.product.searchCriteria = null
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
  { key:'no',         label:'No.',       fixed:false, thAttr:'data-key="no" data-no-filter style="width:45px;text-align:center"', td:(p,n)=>`<td style="text-align:center">${n}</td>` },
  { key:'_image',     label:'이미지',    fixed:true,  thAttr:'data-no-sort data-no-filter style="width:60px"', td:p=>{
    const t = getProductThumbUrl(p)
    const all = getAllImages(p)
    const allJson = JSON.stringify(all).replace(/"/g, '&quot;')
    const cls = t.isTemp ? 'table-thumb table-thumb-temp' : 'table-thumb'
    const tag = t.isTemp ? '<span class="table-thumb-tag">임시</span>' : ''
    return `<td><div class="${cls}"><img src="${t.url}" class="thumb" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" onclick='openModal(0, ${allJson})' />${tag}</div></td>`
  } },
  { key:'brand',      label:'브랜드',    fixed:false, thAttr:'data-key="brand"', td:p=>`<td><span style="font-size:12px">${p.brand||''}</span></td>` },
  { key:'productCode',label:'품번',      fixed:true,  thAttr:'data-key="productCode" style="width:145px"', td:p=>`<td><span class="code-link" onclick="openDetailModal('${p.productCode}')">${p.productCode}</span></td>` },
  { key:'nameKr',     label:'상품명',    fixed:false, thAttr:'data-key="nameKr"', td:p=>`<td data-editable="nameKr" style="max-width:160px;overflow:hidden;text-overflow:ellipsis" title="${p.nameKr}">${p.nameKr}</td>` },
  { key:'colorKr',    label:'색상',      fixed:false, thAttr:'data-key="colorKr"', td:p=>`<td>${p.colorKr||'-'}</td>` },
  { key:'salePrice',  label:'판매가',    fixed:false, thAttr:'data-key="salePrice" style="text-align:right"', td:p=>`<td data-editable="salePrice" style="text-align:right"><span class="price">${fmtPrice(p.salePrice)}</span></td>` },
  { key:'costPrice',  label:'원가',      fixed:false, thAttr:'data-key="costPrice" style="text-align:right"', td:p=>`<td data-editable="costPrice" style="text-align:right"><span class="price">${fmtPrice(p.costPrice)}</span></td>` },
  { key:'type',       label:'타입',      fixed:false, thAttr:'data-key="type"', td:p=>`<td data-editable="type">${typeBadge(p.type)}</td>` },
  { key:'productionStatus', label:'생산상태', fixed:false, thAttr:'data-key="productionStatus" style="width:80px"', td:p=>`<td data-editable="saleStatus">${prodStatusBadge(p.productionStatus)}</td>` },
  { key:'backStyle',  label:'백스타일',  fixed:false, thAttr:'data-key="backStyle"', td:p=>`<td style="font-size:12px;max-width:120px;overflow:hidden;text-overflow:ellipsis">${p.backStyle||'-'}</td>` },
  { key:'legCut',     label:'레그컷',    fixed:false, thAttr:'data-key="legCut"', td:p=>`<td style="font-size:12px">${p.legCut||'-'}</td>` },
  // 정보 미완성 배지(Phase 1) — 어떤 속성이 비었는지 한눈에(복/백/레). 완성이면 '—'.
  { key:'_infoBadge', label:'정보',      fixed:false, thAttr:'data-no-sort data-no-filter style="width:78px;text-align:center"', td:p=>{
    const miss = _prodMissingAttrs(p)
    if (!miss.length) return `<td style="text-align:center"><span class="info-ok" title="속성 입력 완료">—</span></td>`
    const chips = miss.map(f=>`<span class="info-miss-chip" title="${f.label} 미입력">${f.short}</span>`).join('')
    return `<td style="text-align:center" title="미입력: ${miss.map(f=>f.label).join(', ')}">${chips}</td>`
  } },
  { key:'madeMonth',  label:'제조년월',  fixed:false, thAttr:'data-key="madeMonth"', td:p=>`<td style="font-size:12px">${p.madeMonth||'-'}</td>` },
  { key:'lastInDate', label:'최종입고일',fixed:false, thAttr:'data-key="lastInDate"', td:p=>`<td style="font-size:12px">${((p.stockLog||[]).filter(l=>l.type==='in').reduce((m,l)=>l.date>m?l.date:m,''))||'—'}</td>` },
  { key:'madeIn',     label:'제조국',    fixed:false, thAttr:'data-key="madeIn"', td:p=>`<td>${p.madeIn||'-'}</td>` },
  { key:'totalStock', label:'입고수량',  fixed:false, thAttr:'data-key="totalStock" style="text-align:right"', td:p=>`<td style="text-align:right;font-family:Inter">${fmtNum(getTotalStock(p))}</td>`, tfoot:true },
  { key:'totalSales', label:'판매수량',  fixed:false, thAttr:'data-key="totalSales" style="text-align:right"', td:p=>`<td style="text-align:right;font-family:Inter">${fmtNum(getTotalSales(p))}</td>`, tfoot:true },
  { key:'exhaustion', label:'소진율',    fixed:false, thAttr:'data-key="exhaustion" style="width:120px"', td:p=>`<td>${progressBar(getExhaustion(p))}</td>` },
  { key:'lastModifiedByName', label:'최종 수정자', fixed:false, thAttr:'data-key="lastModifiedByName" style="width:130px"', td:p=>{
    const n = p.lastModifiedByName || ''
    const at = p.lastModifiedAt ? String(p.lastModifiedAt).slice(0,10) : ''
    return `<td style="font-size:11px;color:#666">${n ? `<div>${n}</div>` : ''}${at ? `<div style="font-size:10px;color:#999">${at}</div>` : (n ? '' : '-')}</td>`
  } },
]
const PRODUCT_FIXED_KEYS = PRODUCT_COLUMNS.filter(c=>c.fixed).map(c=>c.key)

function renderProductTable() {
  // 사용자가 선택한 정렬이 없으면 등록일(createdAt) 최신순 기본 정렬
  if (!State.product.sort || !State.product.sort.key) {
    State.product.filtered.sort(function(a, b) {
      var ta = a.createdAt || a.registeredAt || ''
      var tb = b.createdAt || b.registeredAt || ''
      return String(tb).localeCompare(String(ta))
    })
  }
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

  // Soft-deleted always excluded at render — defense in depth (search also filters)
  // 정렬은 항상 State.product.sort 기준으로 렌더 시 재적용 → 기본정렬(등록일 desc)이 첫 렌더부터 보장되고
  // refreshAllProductViews/실시간 동기화로 .filtered 재구축돼도 정렬 유지
  const _sorted = State.product.sort.key
    ? sortData(State.product.filtered, State.product.sort.key, State.product.sort.dir)
    : State.product.filtered
  const data = applyColFilters(_sorted.filter(p => !p.deleted), State.product.columnFilters)
  const page = State.product.page || 1
  const ps = getPageSize('product')
  const pageData = ps === 0 ? data : data.slice((page - 1) * ps, page * ps)
  const baseRowNum = ps === 0 ? 1 : (page - 1) * ps + 1
  const incompleteCnt = data.filter(_prodIsInfoIncomplete).length
  document.getElementById('pTableMeta').textContent =
    `검색결과 ${data.length}건` + (incompleteCnt ? ` · 정보 미완성 ${incompleteCnt.toLocaleString()}건` : '')

  if (!data.length) {
    document.getElementById('pTableWrap').innerHTML = `<div class="empty-state"><p>검색 결과가 없습니다.</p></div>`
    document.getElementById('pPagination').innerHTML = ''
    return
  }

  const activeCols = State.product.activeColumns.map(k => PRODUCT_COLUMNS.find(c=>c.key===k)).filter(Boolean)
  const totStock = data.reduce((s,p) => s + getTotalStock(p), 0)
  const totSales = data.reduce((s,p) => s + getTotalSales(p), 0)

  const thHtml = activeCols.map(c => `<th ${c.thAttr} data-col-key="${c.key}">${c.label}</th>`).join('')
  const tbodyHtml = pageData.map((p, i) => `<tr data-code="${p.productCode}">${activeCols.map(c => c.td(p, baseRowNum + i)).join('')}</tr>`).join('')

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
  // Feature 6: inline edit DISABLED — all edits go through detail modal
  // (preserves edit lock, activity log, watch notifications, permission checks)
  // initInlineEdit('productTable', 'product') — intentionally not wired
  // Feature 12: row double-click → detail (now also covers cells previously inline-editable)
  initRowDblClick('productTable', (tr) => {
    const code = tr.getAttribute('data-code')
    if (code) openDetailModal(code)
  })
}

function toggleAllProdCheck(cb) {
  document.querySelectorAll('#productTable .prod-check').forEach(el => { el.checked = cb.checked })
}
window.toggleAllProdCheck = toggleAllProdCheck

// =============================================
// ===== 속성 일괄 입력 (기획 인사이트 Phase 1 B5) =====
// =============================================
// applyBulkConfirm(plan.js:1980+) 패턴: 선택 N → 단일 모달 → 인메모리 적용 → 원자 저장 → 예외 시 전체 롤백.
// 🔴 저장은 saveProducts() 1회(150건 청킹 batch = op 상한 자동 준수). 재고/바코드/매출/POS 무접촉.
// 선택 = 체크된 행 우선, 없으면 검색결과 전체(hybrid — exportCafe24Csv/_c24Selection 하우스 패턴 미러).
function _prodBulkSelection() {
  const checked = Array.prototype.slice.call(document.querySelectorAll('#productTable .prod-check:checked'))
    .map(el => el.getAttribute('data-code'))
  if (checked.length) {
    const byCode = checked.map(c => (State.allProducts || []).find(p => p.productCode === c)).filter(Boolean)
    return { mode: '선택 상품', products: byCode }
  }
  const filtered = ((State.product && State.product.filtered) || []).filter(p => p && !p.deleted)
  return { mode: '검색결과 전체', products: filtered }
}

// 🔴 F3(리뷰): 대상은 **모달 열 때 1회 고정**한다. 적용 시점에 다시 계산하면, 모달이 열려 있는 동안 실시간 동기화가
//   상품 테이블을 재렌더(체크박스 전부 해제)했을 때 "선택 3건" → "검색결과 전체 N건" 으로 조용히 바뀌어 대량 덮어쓰기가 된다.
let _bulkAttrTarget = null

function openBulkAttrModal() {
  const sel = _prodBulkSelection()
  if (!sel.products.length) { showToast('대상 상품이 없습니다.', 'warning'); return }
  _bulkAttrTarget = sel   // 확정 시점까지 고정
  const modal = document.getElementById('bulkAttrModal'); if (!modal) return
  const body = document.getElementById('bulkAttrBody'); if (!body) return

  const S = (typeof _settings !== 'undefined' && _settings) ? _settings : {}
  const pairOpts = (arr) => (Array.isArray(arr) ? arr : []).map(x => {
    const code = Array.isArray(x) ? x[0] : x
    const label = Array.isArray(x) ? (x[1] || x[0]) : x
    return `<option value="${esc(String(code))}">${esc(String(label))} (${esc(String(code))})</option>`
  }).join('')
  // 백스타일 = 디자인 코드 마스터(_designCodes: [code, en, kr]) — 자유 텍스트 금지(Phase 2 롤업 일관성).
  const dOpts = (typeof _designCodes !== 'undefined' && Array.isArray(_designCodes) ? _designCodes : [])
    .map(d => `<option value="${esc(String(d[0]))}">${esc(String(d[1] || ''))} ${esc(String(d[2] || ''))} (${esc(String(d[0]))})</option>`).join('')

  const missTotal = sel.products.filter(_prodIsInfoIncomplete).length
  body.innerHTML = `
    <div class="bulkattr-head">
      대상: <b>${esc(sel.mode)} ${sel.products.length.toLocaleString()}건</b>
      ${missTotal ? `<span class="bulkattr-miss">(정보 미완성 ${missTotal.toLocaleString()}건)</span>` : ''}
      <div class="bulkattr-hint">각 항목은 기본값이 <b>“변경 안 함”</b>입니다. 선택한 항목만 덮어씁니다.</div>
    </div>
    <div class="bulkattr-row">
      <label>복종(타입)</label>
      <select id="baType"><option value="">— 변경 안 함 —</option>${pairOpts(S.types)}</select>
    </div>
    <div class="bulkattr-row">
      <label>레그컷</label>
      <select id="baLegCut"><option value="">— 변경 안 함 —</option>${pairOpts(S.legCuts)}</select>
    </div>
    <div class="bulkattr-row">
      <label>백스타일</label>
      <select id="baDesign"><option value="">— 변경 안 함 —</option>${dOpts}</select>
      <div class="bulkattr-sub">디자인 코드 목록에서 선택 → <code>designCode</code> + <code>backStyle</code>(영문명)이 함께 저장됩니다.</div>
    </div>
    <label class="bulkattr-only"><input type="checkbox" id="baOnlyEmpty" checked /> 비어 있는 항목만 채우기 (이미 값이 있으면 건드리지 않음)</label>
    <div class="bulkattr-actions">
      <button class="btn btn-outline" onclick="closeBulkAttrModal()">취소</button>
      <button class="btn btn-new" onclick="applyBulkAttr()">적용</button>
    </div>`
  if (!modal.open) modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
}
function closeBulkAttrModal() {
  const modal = document.getElementById('bulkAttrModal'); if (modal && modal.open) modal.close()
  _bulkAttrTarget = null
}

let _bulkAttrBusy = false
async function applyBulkAttr() {
  if (_bulkAttrBusy) return
  const sel = _bulkAttrTarget   // 모달 열 때 고정된 대상(F3) — 재계산 금지
  if (!sel || !sel.products.length) { showToast('대상 상품이 없습니다. 창을 닫고 다시 선택하세요.', 'warning'); return }

  const type = (document.getElementById('baType') || {}).value || ''
  const legCut = (document.getElementById('baLegCut') || {}).value || ''
  const designCode = (document.getElementById('baDesign') || {}).value || ''
  const onlyEmpty = !!(document.getElementById('baOnlyEmpty') || {}).checked
  if (!type && !legCut && !designCode) { showToast('변경할 항목을 1개 이상 선택하세요.', 'warning'); return }

  // 백스타일 = 디자인 코드에서 영문명 파생(register.js/modals.js 자동채움과 동일 시맨틱: backStyle=영문명)
  let backStyle = ''
  if (designCode) {
    const de = (typeof _designCodes !== 'undefined' && Array.isArray(_designCodes) ? _designCodes : [])
      .find(d => String(d[0]) === String(designCode))
    backStyle = de ? String(de[1] || '') : ''
  }

  const parts = []
  if (type) parts.push('복종 = ' + type)
  if (legCut) parts.push('레그컷 = ' + legCut)
  if (designCode) parts.push('백스타일 = ' + (backStyle || designCode))
  const ok = await korConfirm(
    `속성 일괄 입력\n\n대상: ${sel.mode} ${sel.products.length.toLocaleString()}건\n${parts.join('\n')}\n` +
    (onlyEmpty ? '\n※ 비어 있는 항목만 채웁니다(기존 값 보존).' : '\n⚠️ 기존 값도 덮어씁니다.'),
    '적용', '취소')
  if (!ok) return

  _bulkAttrBusy = true
  // 🔴 원자성: 변경 전 스냅샷(변경 대상 필드만) → 저장 실패/예외 시 전체 롤백(half-applied 방지)
  const undo = []
  let changed = 0
  try {
    // 🔴 R1(리뷰): 대상은 **품번으로 live 배열에서 재해소**한다. 모달 열려 있는 동안 실시간 동기화가
    //   State.allProducts 를 새 객체로 통째 교체하면, 캡처해둔 예전 객체를 고쳐도 saveProducts 는 새 배열을 직렬화 →
    //   "N건 입력됨" 토스트만 뜨고 아무것도 저장 안 되는 silent no-op(가짜 성공 보고). productCode 로 현재 객체를 다시 잡아 방지.
    const liveByCode = new Map((State.allProducts || []).map(p => [p.productCode, p]))
    const targets = sel.products.map(p => liveByCode.get(p.productCode)).filter(Boolean)
    if (!targets.length) { showToast('대상 상품을 찾지 못했습니다. 창을 닫고 다시 시도하세요.', 'warning'); return }
    targets.forEach(p => {
      const before = { type: p.type, legCut: p.legCut, backStyle: p.backStyle, designCode: p.designCode,
        lastModifiedBy: p.lastModifiedBy, lastModifiedByName: p.lastModifiedByName, lastModifiedAt: p.lastModifiedAt }
      let touched = false
      if (type && (!onlyEmpty || _prodAttrEmpty(p.type))) { p.type = type; touched = true }
      if (legCut && (!onlyEmpty || _prodAttrEmpty(p.legCut))) { p.legCut = legCut; touched = true }
      if (designCode && (!onlyEmpty || _prodAttrEmpty(p.backStyle))) {
        p.designCode = designCode
        p.backStyle = backStyle
        touched = true
      }
      if (touched) {
        undo.push({ p, before })
        if (typeof stampModified === 'function') { try { stampModified(p) } catch (e) {} }
        changed++
      }
    })
    if (!changed) { showToast('변경된 상품이 없습니다 (이미 값이 채워져 있습니다).', 'warning'); return }
    const saved = await saveProducts()
    // 🔴 F2(리뷰): saveProducts 는 db/State 부재 시 undefined 반환 → `=== false` 만 보면 "저장 안 됐는데 성공 토스트"가 뜬다.
    if (saved !== true) throw new Error('상품 저장 실패')
    if (typeof logActivity === 'function') {
      try { logActivity('update', '속성 일괄 입력', `${changed}건 · ${parts.join(' / ')}`) } catch (e) {}
    }
    showToast(`${changed.toLocaleString()}건 속성이 입력되었습니다.`, 'success')
    closeBulkAttrModal()
  } catch (e) {
    undo.forEach(u => {
      u.p.type = u.before.type; u.p.legCut = u.before.legCut
      u.p.backStyle = u.before.backStyle; u.p.designCode = u.before.designCode
      // 수정 스탬프도 원복(롤백 후 잘못된 최종수정자/일시가 남지 않도록)
      u.p.lastModifiedBy = u.before.lastModifiedBy; u.p.lastModifiedByName = u.before.lastModifiedByName
      u.p.lastModifiedAt = u.before.lastModifiedAt
    })
    console.error('applyBulkAttr failed:', e)
    showToast('저장 실패 — 변경사항을 되돌렸습니다: ' + (e && e.message || e), 'error')
  } finally {
    _bulkAttrBusy = false
    if (typeof refreshAllProductViews === 'function') refreshAllProductViews()
  }
}
window._prodBulkSelection = _prodBulkSelection
window.openBulkAttrModal = openBulkAttrModal
window.closeBulkAttrModal = closeBulkAttrModal
window.applyBulkAttr = applyBulkAttr
