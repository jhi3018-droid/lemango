// =============================================
// ===== 엑셀 다운로드 =====
// =============================================

// 전체 다운로드 가능 컬럼 정의
const ALL_DOWNLOAD_COLUMNS = [
  { key:'no', label:'NO', fixed:true },
  { key:'brand', label:'브랜드' },
  { key:'productCode', label:'품번' },
  { key:'sampleNo', label:'샘플번호' },
  { key:'cafe24Code', label:'카페24코드' },
  { key:'barcode', label:'바코드' },
  { key:'nameKr', label:'상품명(한글)' },
  { key:'nameEn', label:'상품명(영문)' },
  { key:'colorKr', label:'색상(한글)' },
  { key:'colorEn', label:'색상(영문)' },
  { key:'salePrice', label:'판매가' },
  { key:'costPrice', label:'원가' },
  { key:'type', label:'타입' },
  { key:'backStyle', label:'백스타일' },
  { key:'legCut', label:'레그컷' },
  { key:'guide', label:'가이드' },
  { key:'fabricType', label:'원단타입' },
  { key:'chestLine', label:'가슴선' },
  { key:'transparency', label:'비침' },
  { key:'lining', label:'안감' },
  { key:'capRing', label:'캡고리' },
  { key:'material', label:'소재' },
  { key:'comment', label:'디자이너코멘트' },
  { key:'washMethod', label:'세탁방법' },
  { key:'sizeSpec_XS_bust',  label:'XS 가슴' },
  { key:'sizeSpec_XS_waist', label:'XS 허리' },
  { key:'sizeSpec_XS_hip',   label:'XS 엉덩이' },
  { key:'sizeSpec_S_bust',   label:'S 가슴' },
  { key:'sizeSpec_S_waist',  label:'S 허리' },
  { key:'sizeSpec_S_hip',    label:'S 엉덩이' },
  { key:'sizeSpec_M_bust',   label:'M 가슴' },
  { key:'sizeSpec_M_waist',  label:'M 허리' },
  { key:'sizeSpec_M_hip',    label:'M 엉덩이' },
  { key:'sizeSpec_L_bust',   label:'L 가슴' },
  { key:'sizeSpec_L_waist',  label:'L 허리' },
  { key:'sizeSpec_L_hip',    label:'L 엉덩이' },
  { key:'sizeSpec_XL_bust',  label:'XL 가슴' },
  { key:'sizeSpec_XL_waist', label:'XL 허리' },
  { key:'sizeSpec_XL_hip',   label:'XL 엉덩이' },
  { key:'sizeSpec_XXL_bust', label:'XXL 가슴' },
  { key:'sizeSpec_XXL_waist',label:'XXL 허리' },
  { key:'sizeSpec_XXL_hip',  label:'XXL 엉덩이' },
  { key:'sizeSpec_F',        label:'F' },
  { key:'bust', label:'가슴(cm)' },
  { key:'waist', label:'허리(cm)' },
  { key:'hip', label:'엉덩이(cm)' },
  { key:'modelSize', label:'모델착용사이즈' },
  { key:'madeMonth', label:'제조년월' },
  { key:'madeBy', label:'제조사' },
  { key:'madeIn', label:'제조국' },
  { key:'saleStatus', label:'판매상태' },
  { key:'productionStatus', label:'생산상태' },
  { key:'mainImage', label:'대표이미지URL' },
  { key:'images.sum', label:'이미지URL(합본)' },
  { key:'images.lemango', label:'이미지URL(자사몰)' },
  { key:'images.noir', label:'이미지URL(느와)' },
  { key:'images.external', label:'이미지URL(외부몰)' },
  { key:'images.design', label:'이미지URL(디자인)' },
  { key:'images.shoot', label:'이미지URL(촬영)' },
  { key:'videoUrl', label:'영상URL' },
  { key:'images.sum.html', label:'이미지HTML(합본)' },
  { key:'images.lemango.html', label:'이미지HTML(자사몰)' },
  { key:'images.noir.html', label:'이미지HTML(느와)' },
  { key:'images.external.html', label:'이미지HTML(외부몰)' },
  { key:'images.design.html', label:'이미지HTML(디자인)' },
  { key:'images.shoot.html', label:'이미지HTML(촬영)' },
  { key:'images.all.html', label:'이미지HTML(전체)' },
  { key:'registDate', label:'등록일' },
  { key:'lastInDate', label:'최종입고일' },
  { key:'stock.XS', label:'재고_XS' },
  { key:'stock.S', label:'재고_S' },
  { key:'stock.M', label:'재고_M' },
  { key:'stock.L', label:'재고_L' },
  { key:'stock.XL', label:'재고_XL' },
  { key:'totalStock', label:'총입고' },
  { key:'totalSales', label:'총판매' },
  { key:'exhaustion', label:'소진율(%)' },
]

function getAllDownloadColumns() {
  const cols = [...ALL_DOWNLOAD_COLUMNS]
  _platforms.forEach(pl => {
    if (!cols.find(c => c.key === 'sales.' + pl))
      cols.push({ key: 'sales.' + pl, label: pl + ' 판매' })
  })
  _platforms.forEach(pl => {
    if (!cols.find(c => c.key === 'mallCodes.' + pl))
      cols.push({ key: 'mallCodes.' + pl, label: pl + ' 쇼핑몰코드' })
  })
  return cols
}

// 기본 양식 3개 (수정/삭제 불가)
const DEFAULT_FORMATS = [
  {
    id: 'default-basic', name: '기본양식', type: 'default',
    columns: ['no','brand','productCode','nameKr','colorKr','salePrice','type','totalStock','totalSales','exhaustion']
  },
  {
    id: 'default-edit', name: '수정양식', type: 'default',
    columns: [
      'no','brand','productCode','sampleNo',
      'nameKr','nameEn','colorKr','colorEn','salePrice','costPrice',
      'type','backStyle','legCut','guide','fabricType','chestLine','transparency','lining','capRing',
      'material','comment','washMethod',
      'sizeSpec_XS_bust','sizeSpec_XS_waist','sizeSpec_XS_hip',
      'sizeSpec_S_bust','sizeSpec_S_waist','sizeSpec_S_hip',
      'sizeSpec_M_bust','sizeSpec_M_waist','sizeSpec_M_hip',
      'sizeSpec_L_bust','sizeSpec_L_waist','sizeSpec_L_hip',
      'sizeSpec_XL_bust','sizeSpec_XL_waist','sizeSpec_XL_hip',
      'sizeSpec_XXL_bust','sizeSpec_XXL_waist','sizeSpec_XXL_hip',
      'sizeSpec_F',
      'modelSize',
      'madeMonth','madeBy','madeIn',
      'saleStatus','productionStatus',
      'mainImage','images.sum','images.lemango','images.noir','images.external','images.design','images.shoot','videoUrl',
      '...mallCodes',
      'registDate','lastInDate'
    ]
  },
  {
    id: 'default-sales', name: '매출분석양식', type: 'default',
    columns: ['no','productCode','nameKr','colorKr','salePrice',...SIZES.map(sz=>'stock.'+sz),'totalStock','totalSales','exhaustion','...platforms']
  }
]

// 양식 선택 모달 상태
let _dfsSelectedId = 'default-basic'

function _getCustomFormats() {
  return JSON.parse(localStorage.getItem('lemango_download_formats_v1') || '[]')
}
function _saveCustomFormats(arr) {
  localStorage.setItem('lemango_download_formats_v1', JSON.stringify(arr))
}
function _getAllFormats() {
  return [...DEFAULT_FORMATS, ..._getCustomFormats()]
}
function _getFormatById(id) {
  return _getAllFormats().find(f => f.id === id)
}

// columns에서 '...platforms' / '...mallCodes' 확장
function _resolveColumns(columns) {
  const out = []
  columns.forEach(k => {
    if (k === '...platforms') {
      _platforms.forEach(pl => out.push('sales.' + pl))
    } else if (k === '...mallCodes') {
      _platforms.forEach(pl => out.push('mallCodes.' + pl))
    } else {
      out.push(k)
    }
  })
  return out
}

// 상품 데이터에서 키 기반 값 추출
function _getProductValue(p, key, idx) {
  if (key === 'no') return idx + 1
  if (key === 'totalStock') return getTotalStock(p)
  if (key === 'totalSales') return getTotalSales(p)
  if (key === 'exhaustion') return getExhaustion(p)
  if (key === 'lastInDate') return ((p.stockLog||[]).filter(l=>l.type==='in').reduce((m,l)=>l.date>m?l.date:m,''))||''
  if (key.startsWith('sizeSpec_')) {
    const spec = (p.sizeSpec && typeof p.sizeSpec === 'object' && !Array.isArray(p.sizeSpec)) ? p.sizeSpec : {}
    if (key === 'sizeSpec_F') {
      const f = spec['F']
      if (f == null) return ''
      if (typeof f === 'object') return f.bust || f.waist || f.hip || ''
      return f
    }
    const rest = key.slice('sizeSpec_'.length) // e.g. "XS_bust"
    const usIdx = rest.lastIndexOf('_')
    if (usIdx < 0) return ''
    const size = rest.slice(0, usIdx)
    const part = rest.slice(usIdx + 1)
    const sizeData = spec[size]
    if (!sizeData || typeof sizeData !== 'object') return ''
    return sizeData[part] || ''
  }
  if (key.startsWith('stock.')) return p.stock ? (p.stock[key.split('.')[1]]||0) : 0
  if (key.startsWith('sales.')) return p.sales ? (p.sales[key.split('.')[1]]||0) : 0
  if (key.startsWith('mallCodes.')) return p.mallCodes ? (p.mallCodes[key.split('.')[1]]||'') : ''
  if (key.endsWith('.html') && key.startsWith('images.')) {
    const baseKey = key.replace('.html', '')
    if (baseKey === 'images.all') {
      const sections = ['sum', 'lemango', 'noir', 'external', 'design', 'shoot']
      let all = ''
      sections.forEach(s => {
        const arr = p.images?.[s]
        const u = Array.isArray(arr) ? arr.join('\n') : (arr || '')
        if (u.trim()) all += u.trim() + '\n'
      })
      return convertUrlsToHtml(all)
    }
    const section = baseKey.split('.')[1]
    const arr = p.images?.[section]
    const u = Array.isArray(arr) ? arr.join('\n') : (arr || '')
    return u.trim() ? convertUrlsToHtml(u) : ''
  }
  if (key.startsWith('images.')) {
    const arr = p.images ? (p.images[key.split('.')[1]]||[]) : []
    return Array.isArray(arr) ? arr.join('\n') : String(arr||'')
  }
  return p[key] !== undefined && p[key] !== null ? p[key] : ''
}

// ===== 양식 선택 모달 =====
function openDownloadFormatModal() {
  _dfsSelectedId = 'default-basic'
  _renderFormatList()
  _renderFormatPreview()
  const modal = document.getElementById('downloadFormatModal')
  centerModal(modal)
  modal.showModal()
}
function closeDownloadFormatModal() {
  document.getElementById('downloadFormatModal').close()
}

function _renderFormatList() {
  const all = _getAllFormats()
  const html = all.map(f => {
    const isDefault = f.type === 'default'
    const cols = _resolveColumns(f.columns)
    const allCols = getAllDownloadColumns()
    const preview = cols.slice(0, 5).map(k => { const c = allCols.find(x=>x.key===k); return c ? c.label : k }).join(', ')
    const extra = cols.length > 5 ? ` 외 ${cols.length - 5}개` : ''
    const active = f.id === _dfsSelectedId ? ' active' : ''
    const badge = isDefault
      ? '<span class="dfs-preset-badge">기본</span>'
      : '<span class="dfs-preset-badge dfs-preset-badge-custom">커스텀</span>'
    const actions = isDefault ? ''
      : `<div class="dfs-preset-actions">
           <button class="dfs-action-btn" onclick="event.stopPropagation();openDownloadFormatEditor('${f.id}')">수정</button>
           <button class="dfs-action-btn dfs-action-del" onclick="event.stopPropagation();deleteDownloadFormat('${f.id}')">삭제</button>
         </div>`
    return `<div class="dfs-preset${active}" onclick="_selectFormat('${f.id}')">
      <div>
        <div class="dfs-preset-name">${badge}${f.name}</div>
        <div class="dfs-preset-cols">${preview}${extra} (${cols.length}개 항목)</div>
      </div>
      ${actions}
    </div>`
  }).join('')
  document.getElementById('dfsPresetList').innerHTML = html
}

function _selectFormat(id) {
  _dfsSelectedId = id
  _renderFormatList()
  _renderFormatPreview()
}

function _renderFormatPreview() {
  const fmt = _getFormatById(_dfsSelectedId)
  if (!fmt) return
  const cols = _resolveColumns(fmt.columns)
  const allCols = getAllDownloadColumns()
  const tags = cols.map(k => {
    const c = allCols.find(x => x.key === k)
    const label = c ? c.label : k
    const fixed = c && c.fixed ? ' dfs-tag-fixed' : ''
    return `<span class="dfs-tag${fixed}">${label}</span>`
  }).join('')
  document.getElementById('dfsPreviewTags').innerHTML = tags
}

async function deleteDownloadFormat(id) {
  const ok = await korConfirm('이 양식을 삭제하시겠습니까?')
  if (!ok) return
  const customs = _getCustomFormats().filter(f => f.id !== id)
  _saveCustomFormats(customs)
  if (_dfsSelectedId === id) _dfsSelectedId = 'default-basic'
  _renderFormatList()
  _renderFormatPreview()
  showToast('양식이 삭제되었습니다.', 'success')
}

function downloadWithSelectedFormat() {
  const fmt = _getFormatById(_dfsSelectedId)
  if (!fmt) return
  const columns = _resolveColumns(fmt.columns)
  _downloadExcelByColumns(columns, fmt.sortKey, fmt.sortOrder)
  closeDownloadFormatModal()
}

function _downloadExcelByColumns(columns, sortKey, sortOrder) {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }

  let data = applyColFilters(State.product.filtered, State.product.columnFilters)
  if (sortKey) {
    data = [...data].sort((a, b) => {
      const va = _getProductValue(a, sortKey, 0)
      const vb = _getProductValue(b, sortKey, 0)
      const na = Number(va), nb = Number(vb)
      let cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : String(va||'').localeCompare(String(vb||''), 'ko')
      return sortOrder === 'desc' ? -cmp : cmp
    })
  }

  const allCols = getAllDownloadColumns()
  const headers = columns.map(k => { const c = allCols.find(x=>x.key===k); return c ? c.label : k })
  const rows = data.map((p, i) => columns.map(k => _getProductValue(p, k, i)))

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '상품조회')
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'')
  XLSX.writeFile(wb, `르망고_상품조회_${today}.xlsx`)
  showToast('다운로드 완료', 'success')
}

// ===== 양식관리 모달 (에디터) =====
let _dfeAvailable = []
let _dfeSelected = []
let _dfeEditingId = null
let _dfeLeftSel = new Set()
let _dfeRightSel = new Set()

function openDownloadFormatEditor(formatId) {
  _dfeEditingId = formatId || null
  const allCols = getAllDownloadColumns()

  if (formatId) {
    const fmt = _getFormatById(formatId)
    if (!fmt) return
    const cols = _resolveColumns(fmt.columns)
    _dfeSelected = cols.map(k => allCols.find(c=>c.key===k)).filter(Boolean)
    _dfeAvailable = allCols.filter(c => !cols.includes(c.key) && !c.fixed)
    document.getElementById('dfeFormatName').value = fmt.name
    document.getElementById('dfeSortKey').value = fmt.sortKey || ''
    document.getElementById('dfeSortOrder').value = fmt.sortOrder || 'asc'
  } else {
    const def = DEFAULT_FORMATS[0].columns
    _dfeSelected = def.map(k => allCols.find(c=>c.key===k)).filter(Boolean)
    _dfeAvailable = allCols.filter(c => !def.includes(c.key) && !c.fixed)
    document.getElementById('dfeFormatName').value = ''
    document.getElementById('dfeSortKey').value = ''
    document.getElementById('dfeSortOrder').value = 'asc'
  }
  _dfeLeftSel = new Set()
  _dfeRightSel = new Set()
  document.getElementById('dfeSearchLeft').value = ''
  document.getElementById('dfeSearchRight').value = ''
  _renderDfeSortOptions()
  _renderDfeLists()

  const modal = document.getElementById('downloadFormatEditorModal')
  centerModal(modal)
  modal.showModal()
}
function closeDownloadFormatEditor() {
  document.getElementById('downloadFormatEditorModal').close()
}

function _renderDfeLists() {
  const searchL = (document.getElementById('dfeSearchLeft')?.value||'').toLowerCase()
  const searchR = (document.getElementById('dfeSearchRight')?.value||'').toLowerCase()

  // Left
  const leftItems = _dfeAvailable.filter(c => !searchL || c.label.toLowerCase().includes(searchL) || c.key.toLowerCase().includes(searchL))
  document.getElementById('dfeLeftList').innerHTML = leftItems.map(c =>
    `<div class="dfe-item${_dfeLeftSel.has(c.key)?' selected':''}" onclick="_toggleDfeLeft('${c.key}')">${c.label}</div>`
  ).join('') || '<div class="dfe-empty">항목 없음</div>'
  document.getElementById('dfeLeftCount').textContent = `${_dfeAvailable.length}개 항목`

  // Right
  const rightItems = _dfeSelected.filter(c => !searchR || c.label.toLowerCase().includes(searchR) || c.key.toLowerCase().includes(searchR))
  document.getElementById('dfeRightList').innerHTML = rightItems.map(c => {
    const fixed = c.fixed ? ' dfe-item-fixed' : ''
    const badge = c.fixed ? '<span class="dfe-item-badge">고정</span>' : ''
    return `<div class="dfe-item${_dfeRightSel.has(c.key)?' selected':''}${fixed}" onclick="_toggleDfeRight('${c.key}')">${c.label}${badge}</div>`
  }).join('') || '<div class="dfe-empty">항목 없음</div>'
  document.getElementById('dfeRightCount').textContent = `${_dfeSelected.length}개 선택`
}

function _toggleDfeLeft(key) {
  _dfeLeftSel.has(key) ? _dfeLeftSel.delete(key) : _dfeLeftSel.add(key)
  _renderDfeLists()
}
function _toggleDfeRight(key) {
  const col = _dfeSelected.find(c=>c.key===key)
  if (col && col.fixed) return
  _dfeRightSel.has(key) ? _dfeRightSel.delete(key) : _dfeRightSel.add(key)
  _renderDfeLists()
}

function dfeAddSelected() {
  const items = _dfeAvailable.filter(c => _dfeLeftSel.has(c.key))
  if (!items.length) return
  _dfeSelected.push(...items)
  _dfeAvailable = _dfeAvailable.filter(c => !_dfeLeftSel.has(c.key))
  _dfeLeftSel = new Set()
  _renderDfeLists()
  _renderDfeSortOptions()
}
function dfeRemoveSelected() {
  const items = _dfeSelected.filter(c => _dfeRightSel.has(c.key) && !c.fixed)
  if (!items.length) return
  _dfeAvailable.push(...items)
  _dfeSelected = _dfeSelected.filter(c => !_dfeRightSel.has(c.key) || c.fixed)
  _dfeRightSel = new Set()
  _renderDfeLists()
  _renderDfeSortOptions()
}
function dfeAddAll() {
  _dfeSelected.push(..._dfeAvailable)
  _dfeAvailable = []
  _dfeLeftSel = new Set()
  _renderDfeLists()
  _renderDfeSortOptions()
}
function dfeReset() {
  const allCols = getAllDownloadColumns()
  const def = DEFAULT_FORMATS[0].columns
  _dfeSelected = def.map(k => allCols.find(c=>c.key===k)).filter(Boolean)
  _dfeAvailable = allCols.filter(c => !def.includes(c.key) && !c.fixed)
  _dfeLeftSel = new Set()
  _dfeRightSel = new Set()
  _renderDfeLists()
  _renderDfeSortOptions()
}
function dfeMoveUp() {
  const keys = [..._dfeRightSel]
  if (keys.length !== 1) return
  const idx = _dfeSelected.findIndex(c => c.key === keys[0])
  if (idx <= 0 || _dfeSelected[idx].fixed) return
  if (_dfeSelected[idx-1].fixed) return
  ;[_dfeSelected[idx-1], _dfeSelected[idx]] = [_dfeSelected[idx], _dfeSelected[idx-1]]
  _renderDfeLists()
}
function dfeMoveDown() {
  const keys = [..._dfeRightSel]
  if (keys.length !== 1) return
  const idx = _dfeSelected.findIndex(c => c.key === keys[0])
  if (idx < 0 || idx >= _dfeSelected.length - 1 || _dfeSelected[idx].fixed) return
  ;[_dfeSelected[idx], _dfeSelected[idx+1]] = [_dfeSelected[idx+1], _dfeSelected[idx]]
  _renderDfeLists()
}
function filterDfeLeft() { _renderDfeLists() }
function filterDfeRight() { _renderDfeLists() }

function _renderDfeSortOptions() {
  const sel = document.getElementById('dfeSortKey')
  const cur = sel.value
  sel.innerHTML = '<option value="">정렬항목 선택</option>' +
    _dfeSelected.filter(c => !c.fixed).map(c => `<option value="${c.key}">${c.label}</option>`).join('')
  sel.value = cur
}

function saveDownloadFormat() {
  const name = document.getElementById('dfeFormatName').value.trim()
  if (!name) return showToast('양식명을 입력해주세요.', 'warning')
  if (_dfeSelected.length === 0) return showToast('최소 1개 항목을 선택해주세요.', 'warning')

  const customs = _getCustomFormats()
  const columns = _dfeSelected.map(c => c.key)
  const sortKey = document.getElementById('dfeSortKey').value
  const sortOrder = document.getElementById('dfeSortOrder').value

  if (_dfeEditingId) {
    const idx = customs.findIndex(f => f.id === _dfeEditingId)
    if (idx >= 0) {
      customs[idx].name = name
      customs[idx].columns = columns
      customs[idx].sortKey = sortKey
      customs[idx].sortOrder = sortOrder
    }
  } else {
    customs.push({ id: 'custom_' + Date.now(), name, type: 'custom', columns, sortKey, sortOrder })
  }

  _saveCustomFormats(customs)
  showToast('양식이 저장되었습니다.', 'success')
  if (typeof logActivity === 'function') logActivity('setting', '설정', '다운로드 양식 저장 — ' + name)
  closeDownloadFormatEditor()
  _renderFormatList()
  _renderFormatPreview()
}

// ===== downloadExcel 엔트리 =====
function downloadExcel(type) {
  if (type === 'product') {
    openDownloadFormatModal()
    return
  }
  // stock, sales, plan — 기존 SheetJS 방식 유지
  if (typeof XLSX === 'undefined') { showToast('SheetJS 라이브러리 로딩 중...', 'warning'); return }
  const data = State[type === 'stock' ? 'stock' : type === 'plan' ? 'plan' : 'sales'].filtered
  let rows, headers, sheetName

  if (type === 'plan') {
    headers = [
      'No.','브랜드','품번','샘플번호','상품명(한글)','상품명(영문)','색상(한글)','색상(영문)',
      '판매가','원가','타입','백스타일','레그컷','등록일'
    ]
    rows = data.map(p => [
      p.no, p.brand, p.productCode, p.sampleNo||'',
      p.nameKr||'', p.nameEn||'', p.colorKr||'', p.colorEn||'',
      p.salePrice||0, p.costPrice||0, p.type||'', p.backStyle||'', p.legCut||'', p.registDate||''
    ])
    sheetName = '신규기획'
  } else if (type === 'stock') {
    headers = ['품번','상품명','브랜드','판매가',...SIZES,'합계']
    rows = data.map(p => [
      p.productCode, p.nameKr, p.brand, p.salePrice,
      ...SIZES.map(sz => p.stock?.[sz]||0),
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
    sheetName = '매출현황'
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'')
  XLSX.writeFile(wb, `르망고_${sheetName}_${today}.xlsx`)
  showToast(`${sheetName} 다운로드 완료`, 'success')
}

// ===== 입출고 이력 엑셀 다운로드 =====
window.downloadStockLog = function() {
  const headers = ['품번', '상품명', '브랜드', '유형', '일자', ...SIZES, '합계', '메모', '등록일']
  const rows = []
  State.allProducts.forEach(p => {
    (p.stockLog || []).forEach(log => {
      const sizeQtys = SIZES.map(sz => log[sz] || 0)
      const total = sizeQtys.reduce((s, v) => s + v, 0)
      rows.push([
        p.productCode, p.nameKr || '', p.brand || '',
        log.type === 'in' ? '입고' : '출고',
        log.date || '', ...sizeQtys, total,
        log.memo || '', log.registeredAt || ''
      ])
    })
  })
  if (!rows.length) { showToast('입출고 이력이 없습니다.', 'warning'); return }
  rows.sort((a, b) => (b[4] || '').localeCompare(a[4] || ''))
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '입출고이력')
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  XLSX.writeFile(wb, `르망고_입출고이력_${today}.xlsx`)
  showToast('입출고이력 다운로드 완료', 'success')
}

// ===== 매출 이력 엑셀 다운로드 =====
window.downloadRevenueLog = function() {
  const headers = ['품번', '상품명', '브랜드', '유형', '일자', '채널', '주문번호', '수량', '매출액', '등록일']
  const rows = []
  State.allProducts.forEach(p => {
    (p.revenueLog || []).forEach(log => {
      rows.push([
        p.productCode, p.nameKr || '', p.brand || '',
        log.type === 'sale' ? '판매' : '환불',
        log.date || '', log.channel || '', log.orderNo || '',
        log.qty || 0, log.revenue || 0, log.registeredAt || ''
      ])
    })
  })
  if (!rows.length) { showToast('매출 이력이 없습니다.', 'warning'); return }
  rows.sort((a, b) => (b[4] || '').localeCompare(a[4] || ''))
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '매출이력')
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  XLSX.writeFile(wb, `르망고_매출이력_${today}.xlsx`)
  showToast('매출이력 다운로드 완료', 'success')
}

// ===== 상품 업로드용 컬럼 인덱스 (38컬럼 양식) =====
// 1행 헤더, 데이터는 2행(index 1)부터
// NO(0) 브랜드(1) 품번(2) 샘플번호(3) 카페24코드(4) 바코드(5)
// 상품명한글(6) 상품명영문(7) 색상한글(8) 색상영문(9) 판매가(10) 원가(11)
// 타입(12) 백스타일(13) 레그컷(14) 가이드(15) 원단타입(16) 가슴선(17) 비침(18) 안감(19) 캡고리(20)
// 소재(21) 디자이너코멘트(22) 세탁방법(23)
// 가슴cm(24) 허리cm(25) 엉덩이cm(26) 모델착용사이즈(27)
// 제조년월(28) 제조사(29) 제조국(30) 판매상태(31) 생산상태(32)
// 대표이미지(33) 이미지합본(34) 이미지자사몰(35) 이미지느와(36) 이미지외부몰(37) 이미지디자인(38) 이미지촬영(39) 영상URL(40)
// [쇼핑몰코드 동적 N개] 등록일(-2) 최종입고일(-1)
const UPLOAD_COL = {
  no: 0, brand: 1, code: 2, sampleNo: 3, cafe24Code: 4, barcode: 5,
  nameKr: 6, nameEn: 7, colorKr: 8, colorEn: 9, salePrice: 10, costPrice: 11,
  type: 12, backStyle: 13, legCut: 14, guide: 15, fabricType: 16,
  chestLine: 17, transparency: 18, lining: 19, capRing: 20,
  material: 21, comment: 22, washMethod: 23,
  bust: 24, waist: 25, hip: 26, modelSize: 27,
  madeMonth: 28, madeBy: 29, madeIn: 30,
  saleStatus: 31, productionStatus: 32,
  mainImage: 33, urlSum: 34, urlLemango: 35, urlNoir: 36, urlExternal: 37, urlDesign: 38, urlShoot: 39, videoUrl: 40
  // mallCodes 시작: 41, 등록일/최종입고일: 동적 (맨 끝 2컬럼)
}

// 레거시 2행 헤더 양식 감지 (이전 양식 호환)
const _LEGACY_COL = {
  no: 0, code: 1, nameKr: 3, nameEn: 4,
  colorKr: 5, colorEn: 6, costPrice: 7, salePrice: 8,
  sizeSpec: 9, modelSize: 10, material: 11, fabricType: 12,
  comment: 13, washMethod: 14, type: 15, backStyle: 16,
  legCut: 17, guide: 19, madeMonth: 20, madeBy: 21, madeIn: 22,
  urlLemango: 26, urlNoir: 27, urlExternal: 28, urlSum: 29, videoUrl: 30
}

// 신규양식 헤더 라벨 → 내부 키 매핑 (열 순서/누락 무관 동적 매핑용)
const HEADER_TO_KEY = {
  '브랜드': 'brand',
  '품번': 'code',
  '샘플번호': 'sampleNo',
  '카페24코드': 'cafe24Code',
  '바코드': 'barcode',
  '상품명(한글)': 'nameKr',
  '상품명(영문)': 'nameEn',
  '색상(한글)': 'colorKr',
  '색상(영문)': 'colorEn',
  '판매가': 'salePrice',
  '원가': 'costPrice',
  '타입': 'type',
  '백스타일': 'backStyle',
  '레그컷': 'legCut',
  '가이드': 'guide',
  '원단타입': 'fabricType',
  '가슴선': 'chestLine',
  '비침': 'transparency',
  '안감': 'lining',
  '캡고리': 'capRing',
  '소재': 'material',
  '디자이너코멘트': 'comment',
  '세탁방법': 'washMethod',
  '가슴(cm)': 'bust',
  '허리(cm)': 'waist',
  '엉덩이(cm)': 'hip',
  '모델착용사이즈': 'modelSize',
  '제조년월': 'madeMonth',
  '제조사': 'madeBy',
  '제조국': 'madeIn',
  '판매상태': 'saleStatus',
  '생산상태': 'productionStatus',
  '대표이미지URL': 'mainImage',
  '이미지URL(합본)': 'urlSum',
  '이미지URL(자사몰)': 'urlLemango',
  '이미지URL(느와)': 'urlNoir',
  '이미지URL(외부몰)': 'urlExternal',
  '이미지URL(디자인)': 'urlDesign',
  '이미지URL(촬영)': 'urlShoot',
  '영상URL': 'videoUrl'
}

// 헤더 행에서 라벨을 찾아 { key: colIdx } 맵 생성
function _buildColMapFromHeader(hdr) {
  const COL = {}
  hdr.forEach((h, i) => {
    const s = String(h ?? '').trim()
    const k = HEADER_TO_KEY[s]
    if (k && COL[k] == null) COL[k] = i
  })
  return COL
}

function parseSumUrls(cellValue) {
  if (!cellValue) return []
  const str = String(cellValue)
  // <img src="..."> 형식에서 URL 추출
  const imgMatches = [...str.matchAll(/src=["']([^"']+)["']/gi)].map(m => m[1].trim())
  if (imgMatches.length) return imgMatches.filter(u => u.startsWith('http'))
  // 줄바꿈 구분 일반 URL
  return str.split(/[\n\r]+/).map(u => u.trim()).filter(u => u.startsWith('http'))
}

// ===== 샘플 파일 =====
function downloadSample(type) {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }

  if (type === 'product') {
    _downloadProductSample()
    return
  }

  let aoa, filename, sheetName
  if (type === 'stock') {
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
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
  showToast('샘플 파일 다운로드 완료', 'success')
}

// 상품등록 샘플 양식 다운로드 (수정양식 기준 전체 컬럼)
function _downloadProductSample() {
  const mallHeaders = _platforms.map(pl => '쇼핑몰코드(' + pl + ')')
  const mallSamples = _platforms.map(() => '')

  const sizeSpecHeaders = [
    'XS 가슴','XS 허리','XS 엉덩이',
    'S 가슴','S 허리','S 엉덩이',
    'M 가슴','M 허리','M 엉덩이',
    'L 가슴','L 허리','L 엉덩이',
    'XL 가슴','XL 허리','XL 엉덩이',
    'XXL 가슴','XXL 허리','XXL 엉덩이',
    'F'
  ]
  const sizeSpecSamples = [
    '', '', '',
    '', '', '',
    '48','38','52',
    '', '', '',
    '', '', '',
    '', '', '',
    ''
  ]

  const HEADER = [
    'NO','브랜드','품번','샘플번호','카페24코드','바코드',
    '상품명(한글)','상품명(영문)','색상(한글)','색상(영문)','판매가','원가',
    '타입','백스타일','레그컷','가이드','원단타입','가슴선','비침','안감','캡고리',
    '소재','디자이너코멘트','세탁방법',
    '가슴(cm)','허리(cm)','엉덩이(cm)','모델착용사이즈',
    '제조년월','제조사','제조국','판매상태','생산상태',
    '대표이미지URL','이미지URL(합본)','이미지URL(자사몰)','이미지URL(느와)','이미지URL(외부몰)','이미지URL(디자인)','이미지URL(촬영)','영상URL',
    ...sizeSpecHeaders,
    ...mallHeaders,
    '등록일','최종입고일'
  ]

  const REQUIRED_IDX = [2] // 품번만 필수

  const SAMPLE_ROW = [
    1,'르망고','LSWON16266707','S-001','LC-001','',
    '코트다쥐르 쉘','Cote d\'Azur Shell','블랙','Black',330000,120000,
    'onepiece','크로스백','Normal Cut','없음','포일','보통','없음','있음','없음',
    'Shell: P80% SP20%','플라워 모티프 디테일','손세탁',
    '30.5','27.5','33','S',
    '2025년 12월','주식회사 르망고','대한민국','판매중','지속생산',
    'https://example.com/main-thumb.jpg',
    'https://example.com/sum1.jpg\nhttps://example.com/sum2.jpg',
    'https://example.com/lemango1.jpg',
    '','https://example.com/ext1.jpg','','',
    'https://youtube.com/shorts/example',
    ...sizeSpecSamples,
    ...mallSamples,
    '2026-01-15','2026-03-17'
  ]

  // Sheet1: 상품등록
  const ws = XLSX.utils.aoa_to_sheet([HEADER, SAMPLE_ROW])

  // 열 너비
  const baseCols = [
    {wch:5},{wch:12},{wch:16},{wch:12},{wch:12},{wch:14},
    {wch:20},{wch:20},{wch:10},{wch:10},{wch:10},{wch:10},
    {wch:10},{wch:14},{wch:12},{wch:8},{wch:10},{wch:8},{wch:8},{wch:8},{wch:8},
    {wch:25},{wch:20},{wch:14},
    {wch:10},{wch:10},{wch:10},{wch:14},
    {wch:12},{wch:16},{wch:10},{wch:10},{wch:10},
    {wch:40},{wch:40},{wch:40},{wch:30},{wch:40},{wch:30},{wch:30},{wch:35}
  ]
  ws['!cols'] = [...baseCols, ...sizeSpecHeaders.map(() => ({wch:10})), ..._platforms.map(() => ({wch:16})), {wch:12},{wch:12}]

  // 헤더 스타일 (네이비 배경, 품번만 골드)
  const navyFill = { fgColor: { rgb: '1A1A2E' } }
  const goldFill = { fgColor: { rgb: 'C9A96E' } }
  const whiteFont = { color: { rgb: 'FFFFFF' }, bold: true, sz: 11 }
  const headerBorder = {
    top: { style: 'thin', color: { rgb: '444444' } },
    bottom: { style: 'thin', color: { rgb: '444444' } },
    left: { style: 'thin', color: { rgb: '444444' } },
    right: { style: 'thin', color: { rgb: '444444' } }
  }

  for (let c = 0; c < HEADER.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) continue
    const isReq = REQUIRED_IDX.includes(c)
    ws[addr].s = {
      fill: isReq ? goldFill : navyFill,
      font: whiteFont,
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: headerBorder
    }
  }

  // Sheet2: 입력 가이드
  const guideData = [
    ['컬럼명', '설명', '필수', '입력 예시'],
    ['NO', '자동 부여 (입력 불필요)', '', '1'],
    ['브랜드', '르망고 / 르망고 느와', '', '르망고'],
    ['품번', '상품 고유 코드 (13자리 권장)', '★필수', 'LSWON16266707'],
    ['샘플번호', '샘플 관리 번호', '', 'S-001'],
    ['카페24코드', '카페24 연동 코드', '', 'LC-001'],
    ['바코드', '상품 바코드', '', '8809012345678'],
    ['상품명(한글)', '한글 상품명', '', '코트다쥐르 쉘'],
    ['상품명(영문)', '영문 상품명', '', 'Cote d\'Azur Shell'],
    ['색상(한글)', '한글 색상명', '', '블랙'],
    ['색상(영문)', '영문 색상명', '', 'Black'],
    ['판매가', '소비자 판매가격', '', '330000'],
    ['원가', '상품 원가', '', '120000'],
    ['타입', 'onepiece / bikini / two piece', '', 'onepiece'],
    ['백스타일', '등 디자인 스타일', '', '크로스백'],
    ['레그컷', 'Low Cut / Normal Cut / Middle Cut / High Cut', '', 'Normal Cut'],
    ['가이드', '가이드 유무', '', '없음'],
    ['원단타입', '원단 종류', '', '포일'],
    ['가슴선', '낮음 / 보통 / 높음', '', '보통'],
    ['비침', '없음 / 약간있음', '', '없음'],
    ['안감', '없음 / 있음', '', '있음'],
    ['캡고리', '없음 / 있음', '', '없음'],
    ['소재', '소재 구성', '', 'Shell: P80% SP20%'],
    ['디자이너코멘트', '디자이너 메모', '', '플라워 모티프 디테일'],
    ['세탁방법', '세탁 안내', '', '손세탁'],
    ['가슴(cm)', '가슴 사이즈 (cm)', '', '30.5'],
    ['허리(cm)', '허리 사이즈 (cm)', '', '27.5'],
    ['엉덩이(cm)', '엉덩이 사이즈 (cm)', '', '33'],
    ['모델착용사이즈', '모델 착용 사이즈', '', 'S'],
    ['제조년월', '제조 년월', '', '2025년 12월'],
    ['제조사', '제조사명', '', '주식회사 르망고'],
    ['제조국', '제조국가', '', '대한민국'],
    ['판매상태', '판매중 / 종료 / 추가생산', '', '판매중'],
    ['생산상태', '지속생산 / 단종 / 시즌한정 / 샘플', '', '지속생산'],
    ['대표이미지URL', '대표 썸네일 URL (최우선 표시)', '', 'https://...jpg'],
    ['이미지URL(합본)', '합본 이미지 URL (줄바꿈 구분)', '', 'https://...jpg'],
    ['이미지URL(자사몰)', '자사몰 이미지 URL (줄바꿈 구분)', '', 'https://...jpg'],
    ['이미지URL(느와)', '느와 이미지 URL (줄바꿈 구분)', '', ''],
    ['이미지URL(외부몰)', '외부몰 이미지 URL (줄바꿈 구분)', '', 'https://...jpg'],
    ['이미지URL(디자인)', '디자인 이미지 URL (줄바꿈 구분)', '', ''],
    ['이미지URL(촬영)', '촬영 이미지 URL (줄바꿈 구분)', '', ''],
    ['영상URL', '영상 링크 (YouTube 등)', '', 'https://youtube.com/shorts/example'],
    ...sizeSpecHeaders.map(h => [h, h === 'F' ? '프리사이즈(단일)' : (h + ' 규격 (cm, 숫자만)'), '', h === 'M 가슴' ? '48' : h === 'M 허리' ? '38' : h === 'M 엉덩이' ? '52' : '']),
    ..._platforms.map(pl => ['쇼핑몰코드(' + pl + ')', pl + ' 쇼핑몰 상품코드', '', '']),
    ['등록일', '상품 등록일 (YYYY-MM-DD)', '', '2026-01-15'],
    ['최종입고일', '최종 입고일 (참고용)', '', '2026-03-17'],
  ]
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData)
  wsGuide['!cols'] = [{wch:20},{wch:45},{wch:6},{wch:30}]

  // 가이드 헤더 스타일
  for (let c = 0; c < 4; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!wsGuide[addr]) continue
    wsGuide[addr].s = {
      fill: navyFill, font: whiteFont,
      alignment: { horizontal: 'center', vertical: 'center' },
      border: headerBorder
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '상품등록')
  XLSX.utils.book_append_sheet(wb, wsGuide, '입력 가이드')
  XLSX.writeFile(wb, '르망고_상품등록_샘플양식.xlsx', { bookSST: false, cellStyles: true })
  showToast('샘플 양식 다운로드 완료', 'success')
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

// 업로드 엑셀 → 파싱 → 변경분 있으면 미리보기, 없으면 바로 적용
let _bulkEditPending = null // { added:[], updated:[] }

function uploadProducts(raw) {
  const parsed = _parseProductUpload(raw)
  if (!parsed) return

  // 변경분이 있으면 미리보기 표시
  if (parsed.updated.length > 0) {
    _bulkEditPending = parsed
    _showBulkEditPreview(parsed)
  } else if (parsed.added.length > 0) {
    // 신규만 있으면 바로 적용
    _applyProductUpload(parsed)
  } else {
    showToast('변경 사항이 없습니다.', 'info')
  }
}

function _parseProductUpload(raw) {
  // 양식 자동 감지: 1행 헤더 어디든 '품번' 라벨이 있으면 신규양식, 아니면 레거시
  const hdr0 = raw[0] || []
  const isNew = hdr0.some(h => String(h ?? '').trim() === '품번')
  // 신규양식은 헤더 라벨 → 컬럼 인덱스 동적 매핑 (열 누락/순서변경 안전)
  // 레거시는 고정 인덱스 유지
  const COL = isNew ? _buildColMapFromHeader(hdr0) : _LEGACY_COL
  const dataStart = isNew ? 1 : 2
  if (COL.code == null) { showToast('품번 컬럼을 찾을 수 없습니다.', 'error'); return null }

  // 신규양식: 헤더에서 쇼핑몰코드/등록일/최종입고일 + 사이즈 규격 19컬럼 동적 인덱스 탐색
  let mallColMap = {}, registDateCol = null, lastInDateCol = null
  let sizeSpecColMap = {} // { 'XS_bust': idx, ..., 'F': idx }
  const SIZE_SPEC_SIZES_UP = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
  const SIZE_SPEC_PART_LABEL = { bust: '가슴', waist: '허리', hip: '엉덩이' }
  if (isNew) {
    hdr0.forEach((h, i) => {
      const s = String(h ?? '').trim()
      const m = s.match(/^쇼핑몰코드\((.+)\)$/)
      if (m) mallColMap[m[1]] = i
      if (s === '등록일') registDateCol = i
      if (s === '최종입고일') lastInDateCol = i
      // sizeSpec 19컬럼: "XS 가슴", "XS 허리", ..., "F"
      if (s === 'F') { sizeSpecColMap['F'] = i; return }
      SIZE_SPEC_SIZES_UP.forEach(sz => {
        Object.entries(SIZE_SPEC_PART_LABEL).forEach(([partKey, partLabel]) => {
          if (s === sz + ' ' + partLabel) sizeSpecColMap[sz + '_' + partKey] = i
        })
      })
    })
  }

  // 엑셀 행에서 sizeSpec 19컬럼을 읽어 {XS:{bust,waist,hip}, ..., F:{bust,waist,hip}} 구조로 반환
  function _readSizeSpec(row) {
    const spec = {}
    SIZE_SPEC_SIZES_UP.forEach(sz => {
      const b = sizeSpecColMap[sz + '_bust']  != null ? String(row[sizeSpecColMap[sz + '_bust']]  ?? '').trim().replace(/[^\d.]/g, '') : ''
      const w = sizeSpecColMap[sz + '_waist'] != null ? String(row[sizeSpecColMap[sz + '_waist']] ?? '').trim().replace(/[^\d.]/g, '') : ''
      const h = sizeSpecColMap[sz + '_hip']   != null ? String(row[sizeSpecColMap[sz + '_hip']]   ?? '').trim().replace(/[^\d.]/g, '') : ''
      if (b || w || h) spec[sz] = { bust: b, waist: w, hip: h }
    })
    if (sizeSpecColMap['F'] != null) {
      const fv = String(row[sizeSpecColMap['F']] ?? '').trim().replace(/[^\d.]/g, '')
      if (fv) spec['F'] = { bust: fv, waist: '', hip: '' }
    }
    return spec
  }

  const dataRows = raw.slice(dataStart).filter(r => String(r[COL.code] || '').trim())
  if (!dataRows.length) { showToast('데이터가 없습니다.', 'error'); return null }

  // 업로드 파일에 실제 존재하는 필드 키 집합 (누락 컬럼은 기존값 보존용)
  // 신규양식: 헤더에서 발견된 키만 / 레거시: _LEGACY_COL의 모든 키 (전체 덮어쓰기 유지)
  const presentKeys = new Set(Object.keys(COL))

  const added = [], updated = []
  dataRows.forEach(row => {
    const code = String(row[COL.code]).trim()
    if (!code) return

    const _s = (key) => COL[key] != null ? String(row[COL[key]] ?? '').trim() : ''
    const _n = (key) => COL[key] != null ? (Number(row[COL[key]]) || 0) : 0

    const sumUrls    = parseSumUrls(row[COL.urlSum])
    const lemUrls    = parseSumUrls(row[COL.urlLemango])
    const noirUrls   = COL.urlNoir != null ? parseSumUrls(row[COL.urlNoir]) : []
    const extUrls    = parseSumUrls(row[COL.urlExternal])
    const designUrls = COL.urlDesign != null ? parseSumUrls(row[COL.urlDesign]) : []
    const shootUrls  = COL.urlShoot != null ? parseSumUrls(row[COL.urlShoot]) : []

    // mallCodes 파싱
    const mallCodes = {}
    Object.entries(mallColMap).forEach(([pl, ci]) => {
      const v = String(row[ci] || '').trim()
      if (v) mallCodes[pl] = v
    })

    const product = {
      no:            State.allProducts.length + 1,
      brand:         isNew ? (_s('brand') || '르망고') : '르망고 느와',
      productCode:   code,
      sampleNo:      _s('sampleNo'),
      cafe24Code:    _s('cafe24Code') || code,
      barcode:       _s('barcode'),
      nameKr:        _s('nameKr'),
      nameEn:        _s('nameEn'),
      colorKr:       _s('colorKr'),
      colorEn:       _s('colorEn'),
      salePrice:     _n('salePrice'),
      costPrice:     _n('costPrice'),
      type:          _s('type'),
      backStyle:     _s('backStyle'),
      legCut:        _s('legCut'),
      guide:         _s('guide'),
      fabricType:    _s('fabricType'),
      material:      _s('material'),
      comment:       _s('comment'),
      washMethod:    _s('washMethod'),
      chestLine:     _s('chestLine'),
      transparency:  _s('transparency'),
      lining:        _s('lining'),
      capRing:       _s('capRing'),
      bust:          _s('bust'),
      waist:         _s('waist'),
      hip:           _s('hip'),
      sizeSpec:      (isNew && Object.keys(sizeSpecColMap).length > 0) ? _readSizeSpec(row) : null,
      modelSize:     _s('modelSize'),
      madeMonth:     _s('madeMonth'),
      madeBy:        _s('madeBy'),
      madeIn:        _s('madeIn'),
      mainImage:     _s('mainImage'),
      videoUrl:      _s('videoUrl') || null,
      saleStatus:    isNew ? (_s('saleStatus') || '판매중') : '판매중',
      productionStatus: _s('productionStatus'),
      barcodes:      Object.fromEntries(SIZES.map(sz => [sz, ''])),
      images: {
        sum:      sumUrls,
        lemango:  lemUrls,
        noir:     noirUrls,
        external: extUrls,
        design:   designUrls,
        shoot:    shootUrls
      },
      mallCodes,
      stock: Object.fromEntries(SIZES.map(sz => [sz, 0])),
      stockLog: [],
      sales: Object.fromEntries(_platforms.map(pl => [pl, 0])),
      revenueLog: [],
      registDate:    isNew && registDateCol != null ? (String(row[registDateCol]||'').trim() || new Date().toISOString().slice(0,10)) : new Date().toISOString().slice(0,10),
      logisticsDate: null
    }

    const idx = State.allProducts.findIndex(p => p.productCode === code)
    if (idx >= 0) {
      // 기존 품번 — 변경분 수집 (업로드에 없는 컬럼은 비교 제외)
      const existing = State.allProducts[idx]
      const diffs = _diffProduct(existing, product, presentKeys)
      if (diffs.length > 0) {
        updated.push({ code, idx, product, diffs, existing, presentKeys })
      }
    } else {
      added.push({ code, product })
    }
  })

  return { added, updated }
}

// 두 상품 객체 비교 → 변경된 필드 목록
const _DIFF_FIELDS = [
  { key:'brand', label:'브랜드' },
  { key:'sampleNo', label:'샘플번호' },
  { key:'cafe24Code', label:'카페24코드' },
  { key:'barcode', label:'바코드' },
  { key:'nameKr', label:'상품명(한글)' },
  { key:'nameEn', label:'상품명(영문)' },
  { key:'colorKr', label:'색상(한글)' },
  { key:'colorEn', label:'색상(영문)' },
  { key:'salePrice', label:'판매가' },
  { key:'costPrice', label:'원가' },
  { key:'type', label:'타입' },
  { key:'backStyle', label:'백스타일' },
  { key:'legCut', label:'레그컷' },
  { key:'guide', label:'가이드' },
  { key:'fabricType', label:'원단타입' },
  { key:'chestLine', label:'가슴선' },
  { key:'transparency', label:'비침' },
  { key:'lining', label:'안감' },
  { key:'capRing', label:'캡고리' },
  { key:'material', label:'소재' },
  { key:'comment', label:'코멘트' },
  { key:'washMethod', label:'세탁방법' },
  { key:'bust', label:'가슴(cm)' },
  { key:'waist', label:'허리(cm)' },
  { key:'hip', label:'엉덩이(cm)' },
  { key:'modelSize', label:'모델사이즈' },
  { key:'madeMonth', label:'제조년월' },
  { key:'madeBy', label:'제조사' },
  { key:'madeIn', label:'제조국' },
  { key:'saleStatus', label:'판매상태' },
  { key:'productionStatus', label:'생산상태' },
  { key:'mainImage', label:'대표이미지' },
  { key:'videoUrl', label:'영상URL' },
]
// _DIFF_FIELDS의 product field key → 업로드 헤더 key 매핑 (이름이 다른 것만)
const _DIFF_PRESENT_KEY = { productCode: 'code' }
// images.* 섹션 → 업로드 헤더 url* key 매핑
const _IMG_PRESENT_KEY = { sum: 'urlSum', lemango: 'urlLemango', noir: 'urlNoir', external: 'urlExternal', design: 'urlDesign', shoot: 'urlShoot' }

function _diffProduct(existing, uploaded, presentKeys) {
  const diffs = []
  _DIFF_FIELDS.forEach(f => {
    // presentKeys 있고 해당 필드의 헤더 키가 없으면 비교 스킵 (업로드 파일에 컬럼 없음)
    if (presentKeys) {
      const headerKey = _DIFF_PRESENT_KEY[f.key] || f.key
      if (!presentKeys.has(headerKey)) return
    }
    const oldVal = String(existing[f.key] ?? '')
    const newVal = String(uploaded[f.key] ?? '')
    if (oldVal !== newVal) {
      diffs.push({ key: f.key, label: f.label, oldVal, newVal })
    }
  })
  // 이미지 배열 비교
  const imgSections = ['sum','lemango','noir','external','design','shoot']
  imgSections.forEach(sec => {
    if (presentKeys && !presentKeys.has(_IMG_PRESENT_KEY[sec])) return
    const oldArr = (existing.images?.[sec] || []).join('\n')
    const newArr = (uploaded.images?.[sec] || []).join('\n')
    if (oldArr !== newArr) {
      diffs.push({ key: 'images.' + sec, label: '이미지(' + sec + ')', oldVal: oldArr, newVal: newArr })
    }
  })
  // mallCodes 비교
  const allMallKeys = new Set([...Object.keys(existing.mallCodes || {}), ...Object.keys(uploaded.mallCodes || {})])
  allMallKeys.forEach(k => {
    const oldV = (existing.mallCodes?.[k] || '')
    const newV = (uploaded.mallCodes?.[k] || '')
    if (oldV !== newV) {
      diffs.push({ key: 'mallCodes.' + k, label: k + ' 쇼핑몰코드', oldVal: oldV, newVal: newV })
    }
  })
  return diffs
}

// 일괄 수정 미리보기 모달
function _showBulkEditPreview(parsed) {
  const modal = document.getElementById('bulkEditPreviewModal')
  if (!modal) return _applyProductUpload(parsed) // 모달 없으면 바로 적용
  const body = modal.querySelector('.srm-body')
  if (!body) return

  let html = '<div class="be-summary">'
  if (parsed.updated.length) html += '<span class="be-badge be-badge-update">수정 ' + parsed.updated.length + '건</span>'
  if (parsed.added.length) html += '<span class="be-badge be-badge-add">신규 ' + parsed.added.length + '건</span>'
  html += '</div>'

  // 수정 목록
  if (parsed.updated.length) {
    html += '<div class="be-section-title">변경 사항</div>'
    parsed.updated.forEach((item, i) => {
      const nameKr = item.existing.nameKr || ''
      html += '<div class="be-product">'
      html += '<div class="be-product-header" onclick="this.nextElementSibling.classList.toggle(\'be-hidden\')">'
      html += '<span class="be-code">' + esc(item.code) + '</span>'
      html += '<span class="be-name">' + esc(nameKr) + '</span>'
      html += '<span class="be-diff-count">' + item.diffs.length + '개 필드 변경</span>'
      html += '<span class="be-toggle">▾</span>'
      html += '</div>'
      html += '<div class="be-diff-table">'
      html += '<table><thead><tr><th>필드</th><th>기존값</th><th>새값</th></tr></thead><tbody>'
      item.diffs.forEach(d => {
        const oldDisp = d.oldVal.length > 60 ? d.oldVal.slice(0,60) + '...' : d.oldVal
        const newDisp = d.newVal.length > 60 ? d.newVal.slice(0,60) + '...' : d.newVal
        html += '<tr><td class="be-field">' + esc(d.label) + '</td>'
        html += '<td class="be-old">' + esc(oldDisp || '(없음)') + '</td>'
        html += '<td class="be-new">' + esc(newDisp || '(없음)') + '</td></tr>'
      })
      html += '</tbody></table></div></div>'
    })
  }

  // 신규 목록
  if (parsed.added.length) {
    html += '<div class="be-section-title">신규 등록</div>'
    parsed.added.forEach(item => {
      html += '<div class="be-add-row"><span class="be-code">' + esc(item.code) + '</span>'
      html += '<span class="be-name">' + esc(item.product.nameKr || '') + '</span>'
      html += '<span class="be-add-label">신규</span></div>'
    })
  }

  html += '<div class="be-actions">'
  html += '<button class="btn btn-primary" onclick="confirmBulkEdit()">확정 적용</button>'
  html += '<button class="btn" onclick="cancelBulkEdit()">취소</button>'
  html += '</div>'

  body.innerHTML = html
  centerModal(modal)
  modal.showModal()
}

function confirmBulkEdit() {
  if (!_bulkEditPending) return
  _applyProductUpload(_bulkEditPending)
  _bulkEditPending = null
  document.getElementById('bulkEditPreviewModal')?.close()
}

function cancelBulkEdit() {
  _bulkEditPending = null
  document.getElementById('bulkEditPreviewModal')?.close()
  showToast('업로드가 취소되었습니다.', 'info')
}

function _applyProductUpload(parsed) {
  let added = 0, updated = 0

  // 신규 상품 추가
  parsed.added.forEach(item => {
    if (item.product.sizeSpec == null) item.product.sizeSpec = {}
    stampCreated(item.product)
    State.allProducts.push(item.product)
    added++
  })

  // 기존 상품 업데이트
  parsed.updated.forEach(item => {
    const existing = State.allProducts[item.idx]
    if (!existing) return
    // sizeSpec: 업로드 파일에 컬럼 없으면(null) 기존 보존, 컬럼 있으면 덮어쓰기
    const mergedSizeSpec = item.product.sizeSpec == null ? existing.sizeSpec : item.product.sizeSpec

    // 업로드 파일에 실제 존재한 컬럼만 적용 (누락 컬럼은 기존값 보존)
    // presentKeys 없으면 (레거시) 전체 덮어쓰기 — 기존 동작 유지
    const presentKeys = item.presentKeys
    let merged
    if (presentKeys) {
      merged = { ...existing }
      // 스칼라 필드 매핑 (헤더 키 → product 필드 키)
      const SCALAR_MAP = {
        brand:'brand', sampleNo:'sampleNo', cafe24Code:'cafe24Code', barcode:'barcode',
        nameKr:'nameKr', nameEn:'nameEn', colorKr:'colorKr', colorEn:'colorEn',
        salePrice:'salePrice', costPrice:'costPrice',
        type:'type', backStyle:'backStyle', legCut:'legCut', guide:'guide',
        fabricType:'fabricType', chestLine:'chestLine', transparency:'transparency',
        lining:'lining', capRing:'capRing', material:'material', comment:'comment',
        washMethod:'washMethod', bust:'bust', waist:'waist', hip:'hip',
        modelSize:'modelSize', madeMonth:'madeMonth', madeBy:'madeBy', madeIn:'madeIn',
        saleStatus:'saleStatus', productionStatus:'productionStatus',
        mainImage:'mainImage', videoUrl:'videoUrl'
      }
      Object.entries(SCALAR_MAP).forEach(([hdrKey, prodKey]) => {
        if (presentKeys.has(hdrKey)) merged[prodKey] = item.product[prodKey]
      })
      // 이미지 섹션: 헤더 키 있을 때만 덮어쓰기
      const IMG_MAP = { urlSum:'sum', urlLemango:'lemango', urlNoir:'noir', urlExternal:'external', urlDesign:'design', urlShoot:'shoot' }
      const mergedImages = { ...(existing.images || {}) }
      Object.entries(IMG_MAP).forEach(([hdrKey, secKey]) => {
        if (presentKeys.has(hdrKey)) mergedImages[secKey] = item.product.images?.[secKey] || []
      })
      merged.images = mergedImages
      // mallCodes: 업로드된 키만 갱신 (헤더에 없는 채널은 기존값 유지)
      merged.mallCodes = { ...(existing.mallCodes || {}), ...(item.product.mallCodes || {}) }
    } else {
      // 레거시 양식 — 기존 전체 덮어쓰기 동작
      merged = { ...existing, ...item.product }
    }

    // 항상 보존되는 필드 (스키마 무관)
    merged.no = existing.no
    merged.stock = existing.stock
    merged.stockLog = existing.stockLog
    merged.sales = existing.sales
    merged.revenueLog = existing.revenueLog
    merged.scheduleLog = existing.scheduleLog
    merged.productCodeLocked = existing.productCodeLocked
    merged.barcodes = existing.barcodes
    merged.sizeSpec = mergedSizeSpec || {}

    State.allProducts[item.idx] = merged
    stampModified(State.allProducts[item.idx])
    updated++
  })

  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  State.sales.filtered   = [...State.allProducts]
  renderProductTable()
  renderStockTable()
  renderSalesTable()
  renderDashboard()
  if (typeof saveProducts === 'function') saveProducts().catch(e => console.error(e))
  if (typeof logActivity === 'function') logActivity('upload', '상품', '엑셀 업로드: 신규 ' + added + '건, 수정 ' + updated + '건')
  showToast('업로드 완료: 신규 ' + added + '건 / 수정 ' + updated + '건', 'success')
}

window.confirmBulkEdit = confirmBulkEdit
window.cancelBulkEdit = cancelBulkEdit

function uploadStock(raw) {
  // 헤더 1행, 데이터 index 1부터. 컬럼: 품번(0) 상품명(1) 사이즈별(2~)
  const dataRows = raw.slice(1).filter(r => r[0])
  let cnt = 0
  dataRows.forEach(row => {
    const code = String(row[0]).trim()
    const p = State.allProducts.find(p => p.productCode === code)
    if (!p) return
    p.stock = Object.fromEntries(SIZES.map((sz, i) => [sz, +row[2 + i] || 0]))
    cnt++
  })
  State.stock.filtered = [...State.allProducts]
  renderStockTable()
  renderDashboard()
  if (typeof saveProducts === 'function') saveProducts().catch(e => console.error(e))
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
  if (typeof saveProducts === 'function') saveProducts().catch(e => console.error(e))
  showToast(`판매 업데이트: ${cnt}건`, 'success')
}
