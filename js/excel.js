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
  { key:'colorCode', label:'색상코드' },
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
  ...buildSizeSpecColumns(),   // 사이즈규격 컬럼 — 단일 소스 (core.js)
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
    // 결정: 기본양식에도 사이즈규격 컬럼 포함 (buildSizeSpecColumns 단일 소스)
    columns: ['no','brand','productCode','nameKr','colorKr','colorCode','salePrice','type',
      ...buildSizeSpecColumns().map(c => c.key),
      'totalStock','totalSales','exhaustion']
  },
  {
    id: 'default-edit', name: '수정양식', type: 'default',
    columns: [
      'no','brand','productCode','sampleNo',
      'nameKr','nameEn','colorKr','colorEn','colorCode','salePrice','costPrice',
      'type','backStyle','legCut','guide','fabricType','chestLine','transparency','lining','capRing',
      'material','comment','washMethod',
      ...buildSizeSpecColumns().map(c => c.key),
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

  // Excel download excludes soft-deleted products (휴지통 항목은 매출분석에 포함 안 됨)
  let data = applyColFilters(State.product.filtered.filter(p => !p.deleted), State.product.columnFilters)
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
    // 기획 전용 다운로드 — 라운드트립용 (사이즈규격 동적[SIZE_SPEC_PARTS×사이즈+F] + 이미지 6+1+1 + schedule 동적)
    _downloadPlanFull(data)
    return
  } else if (type === 'stock') {
    // 바코드 관리용 LONG 포맷 — (상품 × 사이즈) 1행 + 바코드 컬럼(미등록=공란 → 등록현황 가시화) + 수량.
    // ⚠️ 앞 3열(품번|사이즈|바코드)은 바코드 일괄 업로드 파서(r[0]/r[1]/r[2], index 기반)와 호환 →
    //    다운로드 → 바코드 채움 → 재업로드 라운드트립 성립. 상품명/브랜드/판매가/수량은 업로더가 무시(참고 열).
    headers = ['품번','사이즈','바코드','상품명','브랜드','판매가','수량']
    rows = []
    data.forEach(p => {
      SIZES.forEach(sz => {
        rows.push([
          p.productCode, sz, (p.barcodes && p.barcodes[sz]) ? p.barcodes[sz] : '',
          p.nameKr, p.brand, p.salePrice, (p.stock && p.stock[sz]) || 0
        ])
      })
    })
    sheetName = '바코드관리'
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
  '색상코드': 'colorCode',
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

// Explicit field deletion token — cell value === '[삭제]' clears the field on apply
// Empty cells preserve existing (current policy unchanged); [삭제] explicitly clears
const DELETE_TOKEN = '[삭제]'

// Numeric scalar fields — explicit delete sets to 0 (vs '' for strings)
const NUMERIC_FIELDS = new Set(['salePrice', 'costPrice', 'bust', 'waist', 'hip'])

// Max rows per upload (W5: hard block instead of warn)
// Reason: Firestore sharedData/{planItems|allProducts} stored as single doc with 1MB limit
const MAX_UPLOAD_ROWS = 300

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

  // 🔴 통합(단일 소스): 모든 빈-양식 다운로드('상품등록 양식') = 신규 상품등록 양식(downloadProductTemplate).
  //   'product'/'plan' 둘 다 동일 양식 → 어디서 받아도 같은 파일(신규 양식 업로드=기획 항목 생성).
  //   기존 기획 라운드트립 내보내기는 downloadExcel('plan')(_downloadPlanFull)로 별도 유지(다른 목적).
  if (type === 'product' || type === 'plan') {
    // Phase 2: 신규 상품등록 양식(ExcelJS 인셀 드롭다운). ExcelJS 미로딩 시 친절 안내(구 SheetJS 양식 폴백).
    if (typeof ExcelJS !== 'undefined' && ExcelJS && ExcelJS.Workbook) {
      downloadProductTemplate()
    } else {
      showToast('드롭다운 양식 라이브러리(ExcelJS) 로드 실패 — 네트워크 확인 후 다시 시도하세요. 기본 양식으로 받습니다.', 'warning')  // 폴백: 구 양식(드롭다운/코드목록 없음)
      _downloadProductSample()   // 폴백: 구 양식(드롭다운 없음). 업로드 파서는 무관.
    }
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

// =============================================
// ===== Phase 2 — 신규 상품등록 양식 (ExcelJS 인셀 드롭다운) =====
// =============================================
// 컬럼 총계 = 128 (비사이즈 34[이미지URL 2열 제거(자사몰/외부몰)·대표이미지URL 복구·+CAFE24/사방넷 URL 2열] + 사이즈규격 91[buildSizeSpecColumns] + 판매상태/생산상태/등록일 3).
//   사이즈 컬럼은 buildSizeSpecColumns() 단일 소스가 authoritative(§2.7).
// 🔴 생성 전용(ExcelJS). SheetJS 는 모든 읽기/파싱/round-trip 유지. 업로드 검증/자동채움/품번차단 = Phase 3.
// 드롭다운(인라인=고정세트 / 범위참조=관리리스트) 라벨 = "이름(코드)" (시즌/단순 관리리스트는 값=코드). Phase 3 파서 계약(단일 규칙):
//   extractCode(v) = /\(([^)]+)\)\s*$/ 매칭 시 그 안, 없으면 값 전체(trim).
// 🔴 개정: 백스타일·색상코드=드롭다운 아님 → 자유입력(코드목록 시트에서 조회 후 코드 입력, Phase 3 색상명/백스타일명 자동).
// 🔴 이미지URL 3열 제거(대표/자사몰/외부몰). CAFE24/사방넷 상세 URL = 신규 필드(cafe24DetailUrl/sabangDetailUrl), 제조국 뒤(소유주 확인 요청).
// 🔴 코드목록 시트 = VISIBLE·사람이 읽는 참고(백스타일/색상 섹션 + 드롭다운 목록 I열~). 레이아웃 변경 시 rangeRef 동기 필수.
function _prodTemplateDropdownValues() {
  const s = (typeof _settings !== 'undefined') ? _settings : {}
  const cc = (typeof _classCodes !== 'undefined' && Array.isArray(_classCodes)) ? _classCodes : []
  const dc = (typeof _designCodes !== 'undefined' && Array.isArray(_designCodes)) ? _designCodes : []
  const cm = (typeof _colorMasters !== 'undefined' && Array.isArray(_colorMasters)) ? _colorMasters.filter(c => c && c.active !== false) : []
  const asStr = (arr) => (Array.isArray(arr) ? arr : []).map(String)
  const pairLabel = (arr) => (Array.isArray(arr) ? arr : []).map(x => Array.isArray(x) ? `${x[1]}(${x[0]})` : String(x))
  return {
    // 고정 하드코딩 세트(index.html 옵션과 동일) — 인라인 드롭다운
    brand:  asStr(s.brands && s.brands.length ? s.brands : ['르망고', '르망고 느와']),
    class:  cc.map(([c, n]) => `${n}(${c})`),
    // 🔴 고정 세트는 core.js 의 PCODE_* 단일 소스 참조 (form + template + validator 공용 — 드리프트 0)
    gender: (typeof PCODE_GENDERS !== 'undefined' ? PCODE_GENDERS : []).map(([c,n]) => `${n}(${c})`),
    type:   (typeof PCODE_TYPES   !== 'undefined' ? PCODE_TYPES   : []).map(([c,n]) => `${n}(${c})`),
    year:   (typeof PCODE_YEARS   !== 'undefined' ? PCODE_YEARS   : []).map(([c,y]) => `${y}(${c})`),
    season: (typeof PCODE_SEASONS  !== 'undefined' ? PCODE_SEASONS : []).slice(),
    // 관리형 리스트 — 범위참조 드롭다운(코드목록 시트). LIVE 값(설정 편집 반영).
    legCut: pairLabel(s.legCuts),
    fabricType: asStr(s.fabricTypes),
    chestLine:  asStr(s.chestLines),
    transparency: asStr(s.transparencies),
    lining: asStr(s.linings),
    capRing: asStr(s.capRings),
    washMethod: asStr(s.washMethods),
    saleStatus: asStr(s.saleStatuses),
    productionStatus: asStr(s.productionStatuses),
    // 참고 전용(드롭다운 아님, 코드목록 시트 섹션 — 백스타일/색상코드는 조회 후 코드 직접 입력). [코드,en/kr] 튜플.
    _designRef: dc.map(([c, en, kr]) => [String(c), String(en || ''), String(kr || '')]),
    _colorRef:  cm.map(c => [String(c.code || ''), String(c.nameKr || ''), String(c.nameEn || '')]),
  }
}

async function downloadProductTemplate() {
  if (typeof ExcelJS === 'undefined' || !ExcelJS || !ExcelJS.Workbook) {
    showToast('ExcelJS 로드 실패 — 네트워크 확인 후 다시 시도하세요', 'error'); return
  }
  try {
    const dd = _prodTemplateDropdownValues()
    // 관리형 리스트 = 범위참조(코드목록 시트). 고정 세트는 인라인. (🔴 백스타일=자유입력 조회, 드롭다운 아님)
    const RANGE = ['legCut','fabricType','chestLine','transparency','lining','capRing','washMethod','saleStatus','productionStatus']

    // 컬럼 정의(소유주 확정 순서). 🔴 개정: 이미지URL 3열 제거 · 백스타일/색상코드=자유입력(코드목록 조회) · CAFE24/사방넷 URL 2열=제조국 뒤.
    const sizeCols = (typeof buildSizeSpecColumns === 'function') ? buildSizeSpecColumns() : []
    const COLS = [
      { label:'NO' }, { label:'브랜드', dd:'brand', req:true }, { label:'품번', auto:true, note:'자동 입력(시스템 생성) — 작성 불필요' }, { label:'샘플번호', req:true },
      { label:'상품명(한글)' }, { label:'상품명(영문)' }, { label:'색상(한글)', auto:true, note:'자동 입력 — 색상코드 입력 시 자동 채움(작성 불필요)' }, { label:'색상(영문)', auto:true, note:'자동 입력 — 색상코드 입력 시 자동 채움(작성 불필요)' }, { label:'색상코드', note:'코드목록 시트 참고 — 코드 입력(Phase 3 색상명 자동)' },
      { label:'판매가' }, { label:'원가' },
      { label:'연도', dd:'year' }, { label:'시즌', dd:'season' }, { label:'분류', dd:'class' }, { label:'성별', dd:'gender' }, { label:'타입', dd:'type' },
      { label:'백스타일', note:'코드목록 시트 참고 — 코드 입력(Phase 3 백스타일명 자동)' }, { label:'백스타일명', auto:true, note:'자동 입력 — 백스타일 코드 입력 시 자동(작성 불필요)' },
      { label:'레그컷', dd:'legCut' }, { label:'원단타입', dd:'fabricType' }, { label:'가슴선', dd:'chestLine' }, { label:'비침', dd:'transparency' }, { label:'안감', dd:'lining' }, { label:'캡고리', dd:'capRing' },
      { label:'소재' }, { label:'디자이너코멘트' }, { label:'세탁방법', dd:'washMethod' },
      { label:'모델착용사이즈' }, { label:'제조년월' }, { label:'제조사' }, { label:'제조국' },
      { label:'대표이미지URL', note:'대표 썸네일 URL (최우선 표시)' }, { label:'CAFE24 상세 URL' }, { label:'사방넷 상세 URL' },
      ...sizeCols.map(c => ({ label: c.label })),
      { label:'판매상태', dd:'saleStatus' }, { label:'생산상태', dd:'productionStatus' },
      { label:'등록일' },
    ]

    const _navy = 'FF1A1A2E', _gold = 'FFC9A96E', _green = 'FF4CAF7D'   // 기존 팔레트(브랜드컬러)
    const _gray = 'FF6B6B6B'   // 자동입력(작성 불필요) — 기존 팔레트 CSS var --text-sub(#6b6b6b), 흰 글씨 가독
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('상품등록')
    const codeSheet = wb.addWorksheet('코드목록')   // 🔴 A2: VISIBLE — 사용자가 백스타일/색상 코드를 여기서 찾아 입력

    // ── 코드목록 시트: 사람이 읽는 참고 시트(A2) — 백스타일/색상코드 섹션 + 드롭다운 목록(범위참조 소스) ──
    const _csTitle = (cell, txt) => { cell.value = txt; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _navy } }; cell.alignment = { vertical: 'middle' } }
    const _csHdr = (cell, txt) => { cell.value = txt; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _gold } }; cell.alignment = { horizontal: 'center' } }
    // 안내 타이틀
    codeSheet.mergeCells('A1:G1')
    _csTitle(codeSheet.getCell('A1'), '📌 이 시트는 코드 참고용입니다 — 백스타일/색상코드는 여기서 찾아(Ctrl+F) 상품등록 시트에 코드를 입력하세요')
    codeSheet.getRow(1).height = 24
    // 백스타일(디자인번호) 섹션 A/B/C
    codeSheet.mergeCells('A3:C3'); _csTitle(codeSheet.getCell('A3'), '■ 백스타일(디자인번호) — 코드를 상품등록 시트 백스타일 열에 입력')
    _csHdr(codeSheet.getCell('A4'), '코드'); _csHdr(codeSheet.getCell('B4'), '영문명'); _csHdr(codeSheet.getCell('C4'), '한글명')
    ;(dd._designRef || []).forEach(([c, en, kr], i) => { const r = 5 + i; codeSheet.getCell(r, 1).value = c; codeSheet.getCell(r, 2).value = en; codeSheet.getCell(r, 3).value = kr })
    // 색상코드 섹션 E/F/G
    codeSheet.mergeCells('E3:G3'); _csTitle(codeSheet.getCell('E3'), '■ 색상코드 — 코드를 상품등록 시트 색상코드 열에 입력')
    _csHdr(codeSheet.getCell('E4'), '코드'); _csHdr(codeSheet.getCell('F4'), '색상명(한글)'); _csHdr(codeSheet.getCell('G4'), '색상명(영문)')
    ;(dd._colorRef || []).forEach(([c, kr, en], i) => { const r = 5 + i; codeSheet.getCell(r, 5).value = c; codeSheet.getCell(r, 6).value = kr; codeSheet.getCell(r, 7).value = en })
    // 관리형 드롭다운 목록(참고 + 범위참조 소스) — I열부터 각 리스트 1열. 🔴 dataValidation range 가 여기를 가리킴(레이아웃 변경 시 rangeRef 동기).
    const rangeRef = {}
    const RANGE_TITLE = { legCut: '레그컷', fabricType: '원단타입', chestLine: '가슴선', transparency: '비침', lining: '안감', capRing: '캡고리', washMethod: '세탁방법', saleStatus: '판매상태', productionStatus: '생산상태' }
    let rcol = 9   // I열
    RANGE.forEach(name => {
      const vals = dd[name] || []
      const letter = codeSheet.getColumn(rcol).letter
      _csHdr(codeSheet.getCell(4, rcol), RANGE_TITLE[name] || name)
      vals.forEach((v, i) => { codeSheet.getCell(5 + i, rcol).value = v })
      rangeRef[name] = vals.length ? `코드목록!$${letter}$5:$${letter}$${vals.length + 4}` : ''   // rows 5..(5+len-1)
      rcol++
    })
    codeSheet.mergeCells(3, 9, 3, Math.max(9, rcol - 1)); _csTitle(codeSheet.getCell(3, 9), '■ 드롭다운 목록 (상품등록 시트 드롭다운 소스)')
    ;[16, 26, 26, 4, 16, 22, 22, 4].forEach((w, i) => { codeSheet.getColumn(i + 1).width = w })
    for (let c = 9; c < rcol; c++) codeSheet.getColumn(c).width = 15

    // 헤더 행 + 스타일
    const headerRow = ws.getRow(1)
    COLS.forEach((c, i) => {
      const cell = ws.getCell(1, i + 1)
      cell.value = c.label
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      // R3 헤더 색(기존 팔레트): 필수=골드 · 드롭다운=그린(목록에서 선택) · 자동입력=그레이(작성 불필요) · 그 외=네이비
      //   🔴 색 선택은 COLS 엔트리 플래그(req/dd/auto)=컬럼 정체성 기준 → 컬럼 이동해도 정상(하드코딩 letter 없음).
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.req ? _gold : (c.dd ? _green : (c.auto ? _gray : _navy)) } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      if (c.note) cell.note = c.note
      ws.getColumn(i + 1).width = c.label.length > 12 ? 18 : 12
    })
    headerRow.height = 26

    // 드롭다운(dataValidations) — 데이터 입력행 2..(DATA_ROWS+1) 범위에 1회 add
    const DATA_ROWS = 300   // 업로드 상한(MAX_UPLOAD_ROWS)과 정합
    const lastRow = DATA_ROWS + 1
    COLS.forEach((c, i) => {
      if (!c.dd) return
      const vals = dd[c.dd] || []
      if (!vals.length) return
      const colLetter = ws.getColumn(i + 1).letter
      const addr = `${colLetter}2:${colLetter}${lastRow}`
      const inline = '"' + vals.join(',') + '"'
      const useRange = RANGE.includes(c.dd) || inline.length > 250   // 긴/관리 리스트 = 범위, 그 외 인라인(250 초과 시 폴백 불가 → 범위 없으면 스킵)
      let formula
      if (useRange && rangeRef[c.dd]) formula = rangeRef[c.dd]
      else if (!useRange) formula = inline
      else return   // 인라인 초과 + 범위없음 → 드롭다운 생략(값 자유입력, 안전)
      ws.dataValidations.add(addr, {
        type: 'list', allowBlank: true, formulae: [formula],
        showErrorMessage: false,   // 붙여넣기/오타 차단 아님 — 실제 강제는 Phase 3 업로드 검증
      })
    })

    ws.views = [{ state: 'frozen', ySplit: 1 }]   // 헤더 고정

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '상품등록_양식_' + (typeof kstDateKey === 'function' ? kstDateKey() : new Date().toISOString().slice(0, 10)) + '.xlsx'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast('상품등록 양식(드롭다운) 다운로드 완료 · ' + COLS.length + '컬럼', 'success')
  } catch (e) {
    console.error('downloadProductTemplate 실패:', e && e.message)
    showToast('양식 생성 실패 — 다시 시도하세요' + (e && e.message ? ' (' + e.message + ')' : ''), 'error')
  }
}
window.downloadProductTemplate = downloadProductTemplate

// 상품등록 샘플 양식 다운로드 (수정양식 기준 전체 컬럼)
function _downloadProductSample() {
  const mallHeaders = _platforms.map(pl => '쇼핑몰코드(' + pl + ')')
  const mallSamples = _platforms.map(() => '')

  // 사이즈규격 헤더/샘플 — buildSizeSpecColumns() 단일 소스에서 생성
  const _sizeSpecCols = buildSizeSpecColumns()
  const sizeSpecHeaders = _sizeSpecCols.map(c => c.label)
  const sizeSpecSamples = _sizeSpecCols.map(c => {
    if (c.key === 'sizeSpec_F') return ''
    const rest = c.key.slice('sizeSpec_'.length)   // "M_bust"
    const ui = rest.lastIndexOf('_')
    const sz = rest.slice(0, ui), part = rest.slice(ui + 1)
    return sz === 'M' ? (SIZE_SPEC_SAMPLE[part] || '') : ''   // M 행만 예시값
  })

  const HEADER = [
    'NO','브랜드','품번','샘플번호','카페24코드','바코드',
    '상품명(한글)','상품명(영문)','색상(한글)','색상(영문)','색상코드','판매가','원가',
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
    '코트다쥐르 쉘','Cote d\'Azur Shell','블랙','Black','BK',330000,120000,
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
    ['색상코드', '색상 마스터 약어 (예: BK=블랙, NA=네이비). 입력 시 한글/영문 자동 매칭.', '', 'BK'],
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

// ===== 신규기획 다운로드/샘플 =====
// 라운드트립용 컬럼 정의 — 사이즈규격 동적[SIZE_SPEC_PARTS×사이즈+F] + 이미지 6+1+1 + 기획전용(year/season/gender/memo) + schedule 동적
function _planFullColumns() {
  const phases = (typeof getPlanPhases === 'function') ? getPlanPhases() : []
  const cols = [
    { key:'no', label:'NO' },
    { key:'brand', label:'브랜드' },
    { key:'productCode', label:'품번' },
    { key:'sampleNo', label:'샘플번호' },
    { key:'nameKr', label:'상품명(한글)' },
    { key:'nameEn', label:'상품명(영문)' },
    { key:'colorKr', label:'색상(한글)' },
    { key:'colorEn', label:'색상(영문)' },
    { key:'colorCode', label:'색상코드' },
    { key:'salePrice', label:'판매가' },
    { key:'costPrice', label:'원가' },
    { key:'type', label:'타입' },
    { key:'year', label:'연도' },
    { key:'season', label:'시즌' },
    { key:'gender', label:'성별' },
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
    ...buildSizeSpecColumns(),   // 사이즈규격 컬럼 — 단일 소스 (core.js)
    { key:'modelSize', label:'모델착용사이즈' },
    { key:'madeMonth', label:'제조년월' },
    { key:'madeBy', label:'제조사' },
    { key:'madeIn', label:'제조국' },
    { key:'memo', label:'메모' },
    { key:'mainImage', label:'대표이미지URL' },
    { key:'images.sum', label:'이미지URL(합본)' },
    { key:'images.lemango', label:'이미지URL(자사몰)' },
    { key:'images.noir', label:'이미지URL(느와)' },
    { key:'images.external', label:'이미지URL(외부몰)' },
    { key:'images.design', label:'이미지URL(디자인)' },
    { key:'images.shoot', label:'이미지URL(촬영)' },
    { key:'videoUrl', label:'영상URL' }
  ]
  phases.forEach(ph => {
    cols.push({ key: 'schedule.' + ph.key + '.start', label: ph.label + ' 시작' })
    cols.push({ key: 'schedule.' + ph.key + '.end',   label: ph.label + ' 종료' })
  })
  cols.push({ key:'createdAt', label:'등록일' })
  return cols
}

// 기획 아이템에서 키 기반 값 추출
function _getPlanValue(p, key, idx) {
  if (key === 'no') return p.no || (idx + 1)
  if (key === 'memo') return p.memo || ''
  if (key === 'year') return p.year || ''
  if (key === 'season') return p.season || ''
  if (key === 'gender') return p.gender || ''
  if (key === 'createdAt') return (p.createdAt || '').slice(0, 10)
  if (key.startsWith('schedule.')) {
    const parts = key.split('.')
    return p.schedule?.[parts[1]]?.[parts[2]] || ''
  }
  // 그 외 — 사이즈규격 / 이미지 등은 _getProductValue 패턴 재사용
  if (key.startsWith('sizeSpec_')) {
    const spec = (p.sizeSpec && typeof p.sizeSpec === 'object' && !Array.isArray(p.sizeSpec)) ? p.sizeSpec : {}
    if (key === 'sizeSpec_F') {
      const f = spec['F']
      if (f == null) return ''
      if (typeof f === 'object') return f.bust || f.waist || f.hip || ''
      return f
    }
    const rest = key.slice('sizeSpec_'.length)
    const usIdx = rest.lastIndexOf('_')
    if (usIdx < 0) return ''
    const size = rest.slice(0, usIdx)
    const part = rest.slice(usIdx + 1)
    const sizeData = spec[size]
    if (!sizeData || typeof sizeData !== 'object') return ''
    return sizeData[part] || ''
  }
  if (key.startsWith('images.')) {
    const sec = key.split('.')[1]
    const arr = p.images ? (p.images[sec] || []) : []
    return Array.isArray(arr) ? arr.join('\n') : String(arr || '')
  }
  return p[key] !== undefined && p[key] !== null ? p[key] : ''
}

function _downloadPlanFull(data) {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  const cols = _planFullColumns()
  const headers = cols.map(c => c.label)
  const rows = data.map((p, i) => cols.map(c => _getPlanValue(p, c.key, i)))
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = headers.map(h => ({ wch: h.length > 14 ? 18 : 12 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '신규기획')
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'')
  XLSX.writeFile(wb, `르망고_신규기획_${today}.xlsx`)
  showToast('신규기획 다운로드 완료', 'success')
}

function _downloadPlanSample() {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  const cols = _planFullColumns()
  const HEADER = cols.map(c => c.label)
  const phases = (typeof getPlanPhases === 'function') ? getPlanPhases() : []

  // 샘플 행 — 핵심 값만 채우고 나머지는 빈값 (자동생성 가능 영역)
  const sampleMap = {
    no: 1, brand: '르망고', productCode: '', sampleNo: 'S-001',
    nameKr: '코트다쥐르 쉘', nameEn: "Cote d'Azur Shell",
    colorKr: '블랙', colorEn: 'Black', colorCode: 'BK',
    salePrice: 330000, costPrice: 120000,
    type: 'onepiece', year: '2026', season: '1', gender: 'W',
    backStyle: '크로스백', legCut: 'Normal Cut', guide: '없음',
    fabricType: '포일', chestLine: '보통', transparency: '없음', lining: '있음', capRing: '없음',
    material: 'Shell: P80% SP20%', comment: '플라워 모티프 디테일', washMethod: '손세탁',
    sizeSpec_M_bust: '48', sizeSpec_M_waist: '38', sizeSpec_M_hip: '52',
    modelSize: 'S', madeMonth: '2025년 12월', madeBy: '주식회사 르망고', madeIn: '대한민국',
    memo: '봄/여름 시즌 신상',
    mainImage: 'https://example.com/main-thumb.jpg',
    'images.sum': 'https://example.com/sum1.jpg\nhttps://example.com/sum2.jpg',
    'images.lemango': 'https://example.com/lemango1.jpg',
    'images.external': 'https://example.com/ext1.jpg',
    videoUrl: 'https://youtube.com/shorts/example',
    createdAt: '2026-05-01'
  }
  // 첫 단계만 일정 샘플
  if (phases[0]) {
    sampleMap['schedule.' + phases[0].key + '.start'] = '2026-05-01'
    sampleMap['schedule.' + phases[0].key + '.end']   = '2026-05-15'
  }
  const SAMPLE_ROW = cols.map(c => sampleMap[c.key] !== undefined ? sampleMap[c.key] : '')

  const ws = XLSX.utils.aoa_to_sheet([HEADER, SAMPLE_ROW])
  ws['!cols'] = HEADER.map(h => ({ wch: h.length > 14 ? 18 : 12 }))

  // 헤더 스타일 (네이비, 샘플번호만 골드)
  const navyFill = { fgColor: { rgb: '1A1A2E' } }
  const goldFill = { fgColor: { rgb: 'C9A96E' } }
  const whiteFont = { color: { rgb: 'FFFFFF' }, bold: true, sz: 11 }
  const headerBorder = {
    top: { style: 'thin', color: { rgb: '444444' } },
    bottom: { style: 'thin', color: { rgb: '444444' } },
    left: { style: 'thin', color: { rgb: '444444' } },
    right: { style: 'thin', color: { rgb: '444444' } }
  }
  const REQUIRED_LABELS = ['샘플번호']
  HEADER.forEach((h, c) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) return
    const isReq = REQUIRED_LABELS.includes(h)
    ws[addr].s = {
      fill: isReq ? goldFill : navyFill,
      font: whiteFont,
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: headerBorder
    }
  })

  // 입력 가이드 시트
  const guideData = [
    ['컬럼명', '설명', '필수', '입력 예시'],
    ['NO', '자동 부여 (입력 불필요)', '', '1'],
    ['브랜드', '르망고 / 르망고 느와', '', '르망고'],
    ['품번', '13자리 (빈값 허용, 자동생성 가능)', '', 'LSWON16266707'],
    ['샘플번호', '샘플 관리 번호', '★필수', 'S-001'],
    ['상품명(한글)', '한글 상품명', '', '코트다쥐르 쉘'],
    ['상품명(영문)', '영문 상품명', '', "Cote d'Azur Shell"],
    ['색상(한글)', '한글 색상명', '', '블랙'],
    ['색상(영문)', '영문 색상명', '', 'Black'],
    ['색상코드', '색상 마스터 약어 (예: BK=블랙, NA=네이비). 입력 시 한글/영문 자동 매칭.', '', 'BK'],
    ['판매가', '소비자 판매가격', '', '330000'],
    ['원가', '상품 원가', '', '120000'],
    ['타입', 'onepiece / bikini / two piece 등', '', 'onepiece'],
    ['연도', '기획 연도 (YYYY)', '', '2026'],
    ['시즌', 'SS=1, FW=2', '', '1'],
    ['성별', 'W=여성, M=남성, U=공용', '', 'W'],
    ['백스타일', '등 디자인 스타일', '', '크로스백'],
    ['레그컷', 'Low/Normal/Middle/High Cut', '', 'Normal Cut'],
    ['가이드', '가이드 유무', '', '없음'],
    ['원단타입', '원단 종류', '', '포일'],
    ['가슴선', '낮음 / 보통 / 높음', '', '보통'],
    ['비침', '없음 / 약간있음', '', '없음'],
    ['안감', '없음 / 있음', '', '있음'],
    ['캡고리', '없음 / 있음', '', '없음'],
    ['소재', '소재 구성', '', 'Shell: P80% SP20%'],
    ['디자이너코멘트', '디자이너 메모', '', '플라워 모티프 디테일'],
    ['세탁방법', '세탁 안내', '', '손세탁'],
    ['XS~XXL × ' + SIZE_SPEC_PARTS.map(p => p.excel).join('/') + ' (' + (SIZE_SPEC_SIZES.length * SIZE_SPEC_PARTS.length) + '셀)', '사이즈별 규격 (cm, 숫자만)', '', '48'],
    ['F', '프리사이즈 단일값 (cm, 숫자만)', '', ''],
    ['모델착용사이즈', '모델 착용 사이즈', '', 'S'],
    ['제조년월', '제조 년월', '', '2025년 12월'],
    ['제조사', '제조사명', '', '주식회사 르망고'],
    ['제조국', '제조국가', '', '대한민국'],
    ['메모', '내부 메모', '', '봄/여름 시즌 신상'],
    ['대표이미지URL', '대표 썸네일 URL', '', 'https://...jpg'],
    ['이미지URL(합본/자사몰/느와/외부몰/디자인/촬영)', '줄바꿈 구분 다중 URL', '', 'https://...jpg'],
    ['영상URL', '영상 링크', '', 'https://youtube.com/shorts/example'],
    ...phases.flatMap(ph => [
      [ph.label + ' 시작', ph.label + ' 단계 시작일 (YYYY-MM-DD)', '', '2026-05-01'],
      [ph.label + ' 종료', ph.label + ' 단계 종료일 (YYYY-MM-DD)', '', '2026-05-15']
    ]),
    ['등록일', '기획 등록일 (자동, 입력 불필요)', '', '2026-05-01']
  ]
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData)
  wsGuide['!cols'] = [{wch:30},{wch:45},{wch:6},{wch:30}]
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
  XLSX.utils.book_append_sheet(wb, ws, '신규기획')
  XLSX.utils.book_append_sheet(wb, wsGuide, '입력 가이드')
  XLSX.writeFile(wb, '르망고_신규기획_샘플양식.xlsx', { bookSST: false, cellStyles: true })
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
      // 🔴 Q4: 상품/기획 업로드는 시트를 이름으로 선택('상품등록'/'신규기획'). 없으면 참고시트(코드목록/입력 가이드) 제외한
      //   첫 데이터 시트, 그래도 없으면 [0]. → 시트 순서 재정렬·코드목록 존재 시에도 안전(reorder-safe).
      const pickByName = (names) => {
        for (const n of names) if (wb.SheetNames.includes(n)) return n
        const skip = new Set(['코드목록', '입력 가이드'])
        return wb.SheetNames.find(n => !skip.has(n)) || wb.SheetNames[0]
      }
      const sheetName = (type === 'product' || type === 'plan') ? pickByName(['상품등록', '신규기획']) : wb.SheetNames[0]
      const ws   = wb.Sheets[sheetName]
      const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // 🔴 신규 상품등록 양식('분류'+'샘플번호' 헤더)은 품번 자동생성 기획 항목을 만든다 →
      //   어느 업로드 버튼(상품조회/신규기획)이든 uploadPlans(기획 생성)로 라우팅.
      const hdr = raw[0] || []
      const isNewProdTpl = hdr.some(h => String(h ?? '').trim() === '분류') && hdr.some(h => String(h ?? '').trim() === '샘플번호')
      if (isNewProdTpl) { uploadPlans(raw); return }

      if (type === 'product') {
        uploadProducts(raw)
      } else if (type === 'plan') {
        uploadPlans(raw)
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
  } else if ((parsed.failed && parsed.failed.length > 0) || (parsed.skipped && parsed.skipped.length > 0)) {
    // 적용할 변경은 없지만 실패/스킵 내역이 있으면 결과 모달만 표시
    _showUploadResultFromParsed(parsed, 0, 0)
  } else {
    showToast('변경 사항이 없습니다.', 'info')
  }
}

// 결과 모달 빌드 + 표시 (parsed 와 실제 반영된 added/updated 카운트로 result 객체 조립)
function _showUploadResultFromParsed(parsed, addedApplied, updatedApplied) {
  if (typeof showUploadResult !== 'function') return
  const failed = parsed.failed || []
  const skipped = parsed.skipped || []
  const result = {
    total: (parsed.added || []).length + (parsed.updated || []).length + failed.length + skipped.length,
    success: (parsed.added || []).map(item => ({
      row: item.row,
      productCode: item.code,
      name: item.product.nameKr || ''
    })),
    updated: (parsed.updated || []).map(item => ({
      row: item.row,
      productCode: item.code,
      name: item.product.nameKr || (item.existing && item.existing.nameKr) || '',
      changes: (item.diffs || []).map(d => d.label).join(', ')
    })),
    failed,
    skipped
  }
  showUploadResult(result)
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

  // 신규양식: 헤더에서 쇼핑몰코드/등록일/최종입고일 + 사이즈 규격 컬럼(SIZE_SPEC_PARTS×사이즈 + F) 동적 인덱스 탐색
  let mallColMap = {}, registDateCol = null, lastInDateCol = null
  let sizeSpecColMap = {} // { 'XS_bust': idx, ..., 'F': idx } — 부위 단일 소스: SIZE_SPEC_PARTS (core.js)
  if (isNew) {
    hdr0.forEach((h, i) => {
      const s = String(h ?? '').trim()
      const m = s.match(/^쇼핑몰코드\((.+)\)$/)
      if (m) mallColMap[m[1]] = i
      if (s === '등록일') registDateCol = i
      if (s === '최종입고일') lastInDateCol = i
      // sizeSpec 컬럼: "XS 가슴", "XS 허리", ..., "F"
      if (s === 'F') { sizeSpecColMap['F'] = i; return }
      SIZE_SPEC_SIZES.forEach(sz => {
        Object.entries(SIZE_SPEC_PART_LABEL).forEach(([partKey, partLabel]) => {
          if (s === sz + ' ' + partLabel) sizeSpecColMap[sz + '_' + partKey] = i
        })
      })
    })
  }

  // 엑셀 행에서 sizeSpec 컬럼을 읽어 {XS:{<part>:v}, ..., F:{bust}} 구조로 반환
  function _readSizeSpec(row) {
    const spec = {}
    SIZE_SPEC_SIZES.forEach(sz => {
      const vals = {}
      let hasAny = false
      SIZE_SPEC_PARTS.forEach(pt => {
        const ci = sizeSpecColMap[sz + '_' + pt.key]
        const v = ci != null ? String(row[ci] ?? '').trim().replace(/[^\d.]/g, '') : ''
        vals[pt.key] = v
        if (v) hasAny = true
      })
      if (hasAny) spec[sz] = vals
    })
    if (sizeSpecColMap['F'] != null) {   // F 단일값 — 특수 처리 (loop 제외)
      const fv = String(row[sizeSpecColMap['F']] ?? '').trim().replace(/[^\d.]/g, '')
      if (fv) spec['F'] = { bust: fv, waist: '', hip: '' }
    }
    return spec
  }

  // 행번호 추적을 위해 filter 전에 인덱스 보존 (사용자 행번호 = dataStart + originalIdx + 1)
  const allRows = raw.slice(dataStart).map((row, i) => ({ row, userRowNo: dataStart + i + 1 }))
  const dataRows = allRows.filter(r => String(r.row[COL.code] || '').trim())
  const skipped = []
  // 빈 행은 스킵으로 카운트하지 않음 (의도적 공백) — 품번 누락은 별도 fail 처리

  if (!dataRows.length) { showToast('데이터가 없습니다.', 'error'); return null }

  // W5: hard block on >300 rows (Firestore sharedData/allProducts single-doc 1MB limit)
  if (dataRows.length > MAX_UPLOAD_ROWS) {
    showToast(`한 번에 업로드 가능한 최대 행 수는 ${MAX_UPLOAD_ROWS}개입니다. 현재: ${dataRows.length}개. 파일을 분할해 주세요.`, 'error')
    return null
  }

  // 업로드 파일에 실제 존재하는 필드 키 집합 (누락 컬럼은 기존값 보존용)
  // 신규양식: 헤더에서 발견된 키만 / 레거시: _LEGACY_COL의 모든 키 (전체 덮어쓰기 유지)
  const presentKeys = new Set(Object.keys(COL))
  // 사이즈 규격 컬럼이 헤더에 있으면 sizeSpec_<size>_<part> 로 등록 (diff 가 인식)
  // 예: "XS 가슴" → sizeSpec_XS_bust, "F" → sizeSpec_F
  Object.keys(sizeSpecColMap).forEach(k => presentKeys.add('sizeSpec_' + k))
  // 쇼핑몰코드 컬럼이 헤더에 있으면 mallCode_<platform> 으로 등록 (헤더 없으면 diff 스킵)
  Object.keys(mallColMap).forEach(k => presentKeys.add('mallCode_' + k))

  const added = [], updated = [], failed = []
  // C1 fix: detect intra-file duplicate productCodes (matching key for products)
  // Two rows with same code would silently collide in _applyProductUpload (last-write-wins)
  // Note: sampleNo dup not checked here — products match purely by productCode, not sampleNo
  const seenCodes = new Map()  // productCode → first row number
  const duplicates = []        // { type, identifier, firstRow, secondRow }
  const codeDeleteAttempts = [] // row numbers where user tried [삭제] in 품번 cell (rejected)

  dataRows.forEach(({ row, userRowNo }) => {
    const code = String(row[COL.code]).trim()
    if (!code) {
      failed.push({ row: userRowNo, productCode: '', name: '', reason: '품번이 비어있습니다' })
      return
    }

    // C1 fix: intra-file duplicate detection
    if (seenCodes.has(code)) {
      duplicates.push({ type: '품번', identifier: code, firstRow: seenCodes.get(code), secondRow: userRowNo })
      return
    }
    seenCodes.set(code, userRowNo)

    // [삭제] keyword + valueKeys tracking
    // - valueKeys: cells with real non-empty value (overwrite existing on apply)
    // - deleteKeys: cells with literal '[삭제]' token (clear existing on apply)
    // - empty cells: in neither set (preserve existing)
    const valueKeys = new Set()
    const deleteKeys = new Set()
    Object.keys(COL).forEach(hdrKey => {
      const raw = row[COL[hdrKey]]
      const s = (raw == null) ? '' : String(raw).trim()
      if (s === DELETE_TOKEN) {
        if (hdrKey === 'code') {
          // Matching key — silently ignored (warning toast surfaced after loop)
          codeDeleteAttempts.push(userRowNo)
          return
        }
        deleteKeys.add(hdrKey)
      } else if (s !== '') {
        valueKeys.add(hdrKey)
      }
    })
    // Detect [삭제] in mall code columns and sizeSpec columns (built dynamically — not in COL)
    Object.entries(mallColMap).forEach(([pl, ci]) => {
      const s = String(row[ci] ?? '').trim()
      if (s === DELETE_TOKEN) deleteKeys.add('mallCode_' + pl)
    })
    Object.entries(sizeSpecColMap).forEach(([sk, ci]) => {
      const s = String(row[ci] ?? '').trim()
      if (s === DELETE_TOKEN) deleteKeys.add('sizeSpec_' + sk)
    })

    // _s/_n treat [삭제] as empty — token does not propagate into product object
    const _s = (key) => {
      if (COL[key] == null) return ''
      const raw = row[COL[key]]
      const s = (raw == null) ? '' : String(raw).trim()
      return s === DELETE_TOKEN ? '' : s
    }
    const _n = (key) => {
      if (COL[key] == null) return 0
      const raw = row[COL[key]]
      const s = (raw == null) ? '' : String(raw).trim()
      if (s === DELETE_TOKEN || s === '') return 0
      return Number(raw) || 0
    }

    // parseSumUrls returns [] for non-http content (including '[삭제]') — no extra guard needed
    const sumUrls    = parseSumUrls(row[COL.urlSum])
    const lemUrls    = parseSumUrls(row[COL.urlLemango])
    const noirUrls   = COL.urlNoir != null ? parseSumUrls(row[COL.urlNoir]) : []
    const extUrls    = parseSumUrls(row[COL.urlExternal])
    const designUrls = COL.urlDesign != null ? parseSumUrls(row[COL.urlDesign]) : []
    const shootUrls  = COL.urlShoot != null ? parseSumUrls(row[COL.urlShoot]) : []

    // mallCodes 파싱 — skip [삭제] cells (handled via deleteKeys at apply time)
    const mallCodes = {}
    Object.entries(mallColMap).forEach(([pl, ci]) => {
      const v = String(row[ci] || '').trim()
      if (v && v !== DELETE_TOKEN) mallCodes[pl] = v
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
      ...(() => {
        // Color resolution: prefer 색상코드 → master, fallback to 색상(한글) → master
        const codeRaw = _s('colorCode')
        const krRaw = _s('colorKr')
        const enRaw = _s('colorEn')
        let m = null
        if (codeRaw && typeof getColorByCode === 'function') m = getColorByCode(codeRaw)
        if (!m && krRaw && typeof getColorByNameKr === 'function') m = getColorByNameKr(krRaw)
        return m
          ? { colorKr: m.nameKr, colorEn: m.nameEn, colorCode: m.code }
          : { colorKr: krRaw, colorEn: enRaw, colorCode: codeRaw }
      })(),
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
      const diffs = _diffProduct(existing, product, presentKeys, deleteKeys)
      if (diffs.length > 0) {
        updated.push({ code, idx, product, diffs, existing, presentKeys, valueKeys, deleteKeys, row: userRowNo })
      } else {
        skipped.push({ row: userRowNo, productCode: code, reason: '변경 사항 없음' })
      }
    } else {
      added.push({ code, product, valueKeys, deleteKeys, row: userRowNo })
    }
  })

  // [삭제] 키워드를 품번 셀에 사용하려 한 행 — 경고 토스트 (반영은 안 됨, 다른 변경분은 정상 처리)
  if (codeDeleteAttempts.length > 0) {
    const rows = codeDeleteAttempts.slice(0, 5).join(', ')
    const more = codeDeleteAttempts.length > 5 ? ` 외 ${codeDeleteAttempts.length - 5}건` : ''
    showToast(`품번은 [삭제] 키워드로 제거할 수 없습니다 (행 ${rows}${more}). UI에서 직접 수정하세요.`, 'warning')
  }

  // C1 fix: if any intra-file duplicates found, reject entire upload (matches plan upload pattern)
  if (duplicates.length > 0) {
    const list = duplicates.slice(0, 5)
      .map(d => `${d.type} "${d.identifier}" (행 ${d.firstRow}, ${d.secondRow})`)
      .join('\n')
    const more = duplicates.length > 5 ? `\n... 외 ${duplicates.length - 5}건` : ''
    showToast(`엑셀 파일에 중복 식별자가 있습니다:\n${list}${more}\n파일을 확인 후 다시 업로드하세요.`, 'error')
    return null
  }

  return { added, updated, failed, skipped }
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
  { key:'colorCode', label:'색상코드' },
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

// ===== Master-aware color comparison (round-trip idempotency) =====
// Color fields (colorKr/colorEn/colorCode) are the three color keys handled together.
const _COLOR_KEYS = ['colorKr', 'colorEn', 'colorCode']
// Resolve a (kr, en, code) triple to its canonical master code, or null if off-master.
// Legacy note: CSV-imported products store the color CODE in colorEn (e.g. "NA"), not the
// English name — so we also try colorEn-as-code so existing DB rows resolve to the same
// identity as the master-canonical form the upload pipeline produces.
function resolveColorIdentity(colorKr, colorEn, colorCode) {
  let m = null
  if (colorCode && typeof getColorByCode === 'function') m = getColorByCode(colorCode)
  if (!m && colorKr && typeof getColorByNameKr === 'function') m = getColorByNameKr(colorKr)
  if (!m && colorEn && typeof getColorByCode === 'function') m = getColorByCode(colorEn)
  return m ? m.code : null
}
window.resolveColorIdentity = resolveColorIdentity
// True only when BOTH sides resolve to the same non-null master color.
// Off-master / mismatched / one-sided cases return false → normal per-field diff runs.
function _sameColorIdentity(a, b) {
  const ia = resolveColorIdentity(a && a.colorKr, a && a.colorEn, a && a.colorCode)
  const ib = resolveColorIdentity(b && b.colorKr, b && b.colorEn, b && b.colorCode)
  return !!(ia && ib && ia === ib)
}

function _diffProduct(existing, uploaded, presentKeys, deleteKeys) {
  deleteKeys = deleteKeys || new Set()
  const diffs = []
  // Master-aware: same canonical color on both sides → suppress all 3 color diffs
  // (prevents false round-trip diff against non-canonical stored data)
  const colorSame = _sameColorIdentity(existing, uploaded)
  _DIFF_FIELDS.forEach(f => {
    if (colorSame && _COLOR_KEYS.indexOf(f.key) >= 0) return
    // presentKeys 있고 해당 필드의 헤더 키가 없으면 비교 스킵 (업로드 파일에 컬럼 없음)
    if (presentKeys) {
      const headerKey = _DIFF_PRESENT_KEY[f.key] || f.key
      if (!presentKeys.has(headerKey)) return
    }
    const oldVal = String(existing[f.key] ?? '')
    const newVal = String(uploaded[f.key] ?? '')
    if (oldVal !== newVal) {
      const headerKey = _DIFF_PRESENT_KEY[f.key] || f.key
      const entry = { key: f.key, label: f.label, oldVal, newVal }
      if (deleteKeys.has(headerKey)) entry.isDelete = true
      diffs.push(entry)
    }
  })
  // 이미지 배열 비교
  const imgSections = ['sum','lemango','noir','external','design','shoot']
  imgSections.forEach(sec => {
    if (presentKeys && !presentKeys.has(_IMG_PRESENT_KEY[sec])) return
    const oldArr = (existing.images?.[sec] || []).join('\n')
    const newArr = (uploaded.images?.[sec] || []).join('\n')
    if (oldArr !== newArr) {
      const entry = { key: 'images.' + sec, label: '이미지(' + sec + ')', oldVal: oldArr, newVal: newArr }
      if (deleteKeys.has(_IMG_PRESENT_KEY[sec])) entry.isDelete = true
      diffs.push(entry)
    }
  })
  // sizeSpec 비교 — 부위 단일 소스: SIZE_SPEC_PARTS (core.js). 헤더에 컬럼 있을 때만 비교.
  SIZE_SPEC_SIZES.forEach(sz => {
    SIZE_SPEC_PARTS.forEach(pt => {
      const part = pt.key
      if (presentKeys && !presentKeys.has('sizeSpec_' + sz + '_' + part)) return
      const oldV = String(existing.sizeSpec?.[sz]?.[part] ?? '')
      const newV = String(uploaded.sizeSpec?.[sz]?.[part] ?? '')
      if (oldV !== newV) {
        const entry = { key: 'sizeSpec.' + sz + '.' + part, label: sz + ' ' + pt.excel, oldVal: oldV, newVal: newV }
        if (deleteKeys.has('sizeSpec_' + sz + '_' + part)) entry.isDelete = true
        diffs.push(entry)
      }
    })
  })
  // F 사이즈 (단일 컬럼)
  if (!presentKeys || presentKeys.has('sizeSpec_F')) {
    const _fStr = (v) => v == null ? '' : (typeof v === 'object' ? String(v.bust || v.waist || v.hip || '') : String(v))
    const oldF = _fStr(existing.sizeSpec?.F)
    const newF = _fStr(uploaded.sizeSpec?.F)
    if (oldF !== newF) {
      const entry = { key: 'sizeSpec.F', label: 'F', oldVal: oldF, newVal: newF }
      if (deleteKeys.has('sizeSpec_F')) entry.isDelete = true
      diffs.push(entry)
    }
  }
  // mallCodes 비교 — 헤더에 해당 쇼핑몰 컬럼이 있을 때만 (false positive 방지)
  const allMallKeys = new Set([...Object.keys(existing.mallCodes || {}), ...Object.keys(uploaded.mallCodes || {})])
  allMallKeys.forEach(k => {
    if (presentKeys && !presentKeys.has('mallCode_' + k)) return
    const oldV = (existing.mallCodes?.[k] || '')
    const newV = (uploaded.mallCodes?.[k] || '')
    if (oldV !== newV) {
      const entry = { key: 'mallCodes.' + k, label: k + ' 쇼핑몰코드', oldVal: oldV, newVal: newV }
      if (deleteKeys.has('mallCode_' + k)) entry.isDelete = true
      diffs.push(entry)
    }
  })
  return diffs
}

// 일괄 수정 미리보기 모달
function _showBulkEditPreview(parsed) {
  const modal = document.getElementById('bulkEditPreviewModal')
  // W4: do NOT silently apply when modal is missing — surface error and abort
  if (!modal) {
    showToast('미리보기 모달을 찾을 수 없습니다. 페이지를 새로고침해 주세요.', 'error')
    _bulkEditPending = null
    return
  }
  const body = modal.querySelector('.srm-body')
  if (!body) {
    showToast('미리보기 모달 본문을 찾을 수 없습니다. 페이지를 새로고침해 주세요.', 'error')
    _bulkEditPending = null
    return
  }

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
        const rowCls = d.isDelete ? ' class="be-row-delete"' : ''
        const newCls = d.isDelete ? 'be-new be-new-delete' : 'be-new'
        const newText = d.isDelete ? '[삭제]' : (newDisp || '(없음)')
        html += '<tr' + rowCls + '><td class="be-field">' + esc(d.label) + '</td>'
        html += '<td class="be-old">' + esc(oldDisp || '(없음)') + '</td>'
        html += '<td class="' + newCls + '">' + esc(newText) + '</td></tr>'
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

    const presentKeys = item.presentKeys
    const valueKeys = item.valueKeys instanceof Set ? item.valueKeys : presentKeys
    const deleteKeys = item.deleteKeys instanceof Set ? item.deleteKeys : new Set()

    // sizeSpec: per-part merge — empty cells preserve existing parts; [삭제] sets to ''
    // (handles W6) 부위 단일 소스: SIZE_SPEC_PARTS (core.js)
    const _PARTS = SIZE_SPEC_PARTS.map(p => p.key)
    const mergedSizeSpec = (() => {
      // If no sizeSpec columns at all in the upload, preserve existing entirely
      if (item.product.sizeSpec == null) return existing.sizeSpec || {}
      const out = JSON.parse(JSON.stringify(existing.sizeSpec || {}))
      SIZE_SPEC_SIZES.forEach(sz => {
        _PARTS.forEach(part => {
          const headerKey = 'sizeSpec_' + sz + '_' + part
          if (deleteKeys.has(headerKey)) {
            if (!out[sz]) out[sz] = emptySizeSpecParts()
            out[sz][part] = ''
          } else if (presentKeys && presentKeys.has(headerKey)) {
            const v = item.product.sizeSpec?.[sz]?.[part]
            if (v != null && String(v).trim() !== '') {
              if (!out[sz]) out[sz] = emptySizeSpecParts()
              out[sz][part] = v
            }
            // empty value → preserve existing part (no override)
          }
        })
      })
      // F single-cell handling
      if (deleteKeys.has('sizeSpec_F')) {
        if (out.F && typeof out.F === 'object') out.F.bust = '' ; else out.F = { bust:'', waist:'', hip:'' }
      } else if (presentKeys && presentKeys.has('sizeSpec_F')) {
        const f = item.product.sizeSpec?.F
        if (f && (f.bust || f.waist || f.hip)) out.F = f
        // else preserve existing
      }
      return out
    })()

    let merged
    if (presentKeys) {
      merged = { ...existing }
      // 스칼라 필드 매핑 (헤더 키 → product 필드 키)
      const SCALAR_MAP = {
        brand:'brand', sampleNo:'sampleNo', cafe24Code:'cafe24Code', barcode:'barcode',
        nameKr:'nameKr', nameEn:'nameEn', colorKr:'colorKr', colorEn:'colorEn', colorCode:'colorCode',
        salePrice:'salePrice', costPrice:'costPrice',
        type:'type', backStyle:'backStyle', legCut:'legCut', guide:'guide',
        fabricType:'fabricType', chestLine:'chestLine', transparency:'transparency',
        lining:'lining', capRing:'capRing', material:'material', comment:'comment',
        washMethod:'washMethod', bust:'bust', waist:'waist', hip:'hip',
        modelSize:'modelSize', madeMonth:'madeMonth', madeBy:'madeBy', madeIn:'madeIn',
        saleStatus:'saleStatus', productionStatus:'productionStatus',
        mainImage:'mainImage', videoUrl:'videoUrl'
      }
      // Master-aware: same canonical color → preserve existing color (no harmful overwrite,
      // e.g. legacy colorEn="NA" must NOT be snapped to "Navy" on a no-edit round-trip)
      const colorSame = _sameColorIdentity(existing, item.product)
      Object.entries(SCALAR_MAP).forEach(([hdrKey, prodKey]) => {
        if (colorSame && _COLOR_KEYS.indexOf(prodKey) >= 0 && !deleteKeys.has(hdrKey)) return
        if (deleteKeys.has(hdrKey)) {
          // [삭제] keyword: numeric → 0, otherwise empty string
          merged[prodKey] = NUMERIC_FIELDS.has(prodKey) ? 0 : ''
        } else if (presentKeys.has(hdrKey) && valueKeys.has(hdrKey)) {
          merged[prodKey] = item.product[prodKey]
        }
        // else: preserve existing
      })
      // 이미지 섹션: header present + value (or [삭제]) gates override
      const IMG_MAP = { urlSum:'sum', urlLemango:'lemango', urlNoir:'noir', urlExternal:'external', urlDesign:'design', urlShoot:'shoot' }
      const mergedImages = { ...(existing.images || {}) }
      Object.entries(IMG_MAP).forEach(([hdrKey, secKey]) => {
        if (deleteKeys.has(hdrKey)) {
          mergedImages[secKey] = []
        } else if (presentKeys.has(hdrKey) && valueKeys.has(hdrKey)) {
          mergedImages[secKey] = item.product.images?.[secKey] || []
        }
      })
      merged.images = mergedImages
      // mallCodes: spread merge + [삭제] removes channel from object
      const mergedMall = { ...(existing.mallCodes || {}), ...(item.product.mallCodes || {}) }
      Array.from(deleteKeys).forEach(dk => {
        if (dk.startsWith('mallCode_')) delete mergedMall[dk.slice('mallCode_'.length)]
      })
      merged.mallCodes = mergedMall
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

  refreshAllProductViews()
  if (typeof saveProducts === 'function') saveProducts().catch(e => console.error(e))
  if (typeof logActivity === 'function') logActivity('upload', '상품', '엑셀 업로드: 신규 ' + added + '건, 수정 ' + updated + '건')
  showToast('업로드 완료: 신규 ' + added + '건 / 수정 ' + updated + '건', 'success')
  // 결과 모달 표시 (확정 적용 후 보고용)
  _showUploadResultFromParsed(parsed, added, updated)
}

// =============================================
// ===== 신규기획 업로드 =====
// =============================================
let _planBulkPending = null

function uploadPlans(raw) {
  const parsed = _parsePlanUpload(raw)
  if (!parsed) return
  const hasFail = parsed.failed && parsed.failed.length > 0
  // 🔴 신규 상품등록 양식 = 항상 미리보기-후-확정(1e 패턴): 신규만 있어도 검증 결과를 먼저 보여준다.
  if (parsed.isNewTpl) {
    if (parsed.added.length || parsed.updated.length || hasFail) {
      _planBulkPending = parsed
      _showPlanBulkPreview(parsed)
    } else {
      showToast('변경 사항이 없습니다.', 'info')
    }
    return
  }
  // 구 양식 = 기존 동작 유지(round-trip 보존)
  if (parsed.updated.length > 0) {
    _planBulkPending = parsed
    _showPlanBulkPreview(parsed)
  } else if (parsed.added.length > 0) {
    _applyPlanUpload(parsed)
  } else if (hasFail || (parsed.skipped && parsed.skipped.length > 0)) {
    _showUploadResultFromPlanParsed(parsed, 0, 0)
  } else {
    showToast('변경 사항이 없습니다.', 'info')
  }
}

// plan 헤더 라벨 → 키 매핑 (상품 매핑 + 기획 전용 추가)
const PLAN_HEADER_TO_KEY = Object.assign({}, HEADER_TO_KEY, {
  '연도': 'year',
  '시즌': 'season',
  '성별': 'gender',
  '메모': 'memo',
  // 신규 상품등록 양식(Phase 2) 전용 헤더. 구 양식엔 없음 → 있으면 신규 양식 시그니처.
  '분류': 'classInput',          // "이름(코드)" → extractCode → classCode (품번 1번째 자리)
  'CAFE24 상세 URL': 'cafe24DetailUrl',
  '사방넷 상세 URL': 'sabangDetailUrl'
  // '백스타일명'(EN) = 백스타일(디자인코드) 로부터 자동 채움 → 셀 미매핑(무시)
  // '타입'/'연도'/'백스타일' 은 HEADER_TO_KEY 상속(type/year/backStyle). 신규 양식에선 값이 코드라 파서가 재해석.
  // schedule 헤더('디자인 시작' 등)는 phase가 동적이라 _parsePlanUpload 내부에서 처리
})

// 🔴 Phase 2/3 파싱 계약: 라벨 후행 "(CODE)" 그룹 → 그 안, 없으면 값 전체(trim).
//   "원피스(ON)"→"ON", "2026(6)"→"6", "1626"(괄호없음)→"1626", ""→"". 시즌/디자인코드=값 자체=코드.
function extractCode(v) {
  const s = (v == null) ? '' : String(v).trim()
  if (!s) return ''
  const m = s.match(/\(([^)]+)\)\s*$/)
  return m ? m[1].trim() : s
}

// 관리형/고정 리스트 멤버십 (코드-쌍 [code,label] 이면 code 로, 단순 문자열이면 문자열로 비교). LIVE 소스는 호출부가 전달.
function _codeInList(list, v) {
  const target = String(v)
  return (list || []).some(x => (Array.isArray(x) ? String(x[0]) : String(x)) === target)
}

function _parsePlanUpload(raw) {
  const hdr0 = raw[0] || []
  if (!hdr0.length) { showToast('헤더가 비어있습니다.', 'error'); return null }

  // 컬럼 매핑
  const COL = {}
  hdr0.forEach((h, i) => {
    const s = String(h ?? '').trim()
    const k = PLAN_HEADER_TO_KEY[s]
    if (k && COL[k] == null) COL[k] = i
  })
  if (COL.sampleNo == null) {
    showToast('샘플번호 컬럼을 찾을 수 없습니다. 신규기획 양식인지 확인하세요.', 'error')
    return null
  }

  // 🔴 신규 상품등록 양식(Phase 2) 감지 — '분류' 헤더는 신규 양식에만 존재(구 상품/구 기획 양식엔 없음).
  //   신규 양식 = 코드 추출 + LIVE 검증 + 자동채움 + 품번 차단 적용. 구 양식 = 오늘과 동일(round-trip 보존).
  const isNewTpl = hdr0.some(h => String(h ?? '').trim() === '분류')

  // sizeSpec + schedule 동적 매핑 — 부위 단일 소스: SIZE_SPEC_PARTS (core.js)
  const sizeSpecColMap = {}
  const phases = (typeof getPlanPhases === 'function') ? getPlanPhases() : []
  const scheduleColMap = {}

  hdr0.forEach((h, i) => {
    const s = String(h ?? '').trim()
    if (s === 'F') { sizeSpecColMap['F'] = i; return }
    SIZE_SPEC_SIZES.forEach(sz => {
      Object.entries(SIZE_SPEC_PART_LABEL).forEach(([partKey, partLabel]) => {
        if (s === sz + ' ' + partLabel) sizeSpecColMap[sz + '_' + partKey] = i
      })
    })
    phases.forEach(ph => {
      if (s === ph.label + ' 시작') scheduleColMap[ph.key + '_start'] = i
      if (s === ph.label + ' 종료') scheduleColMap[ph.key + '_end']   = i
    })
  })

  // Per-row sizeSpec readers — builds object only from non-DELETE non-empty cells
  // (W6: per-part merge happens at apply time. Here we just record values that were uploaded.)
  function _readSizeSpec(row) {
    const spec = {}
    SIZE_SPEC_SIZES.forEach(sz => {
      const _cell = (part) => {
        if (sizeSpecColMap[sz + '_' + part] == null) return ''
        const raw = String(row[sizeSpecColMap[sz + '_' + part]] ?? '').trim()
        if (raw === DELETE_TOKEN) return ''   // 기획 업로드는 [삭제] 토큰 지원 (상품과 차이)
        return raw.replace(/[^\d.]/g, '')
      }
      const vals = {}
      let hasAny = false
      SIZE_SPEC_PARTS.forEach(pt => {
        const v = _cell(pt.key)
        vals[pt.key] = v
        if (v) hasAny = true
      })
      if (hasAny) spec[sz] = vals
    })
    if (sizeSpecColMap['F'] != null) {   // F 단일값 — 특수 처리 (loop 제외)
      const raw = String(row[sizeSpecColMap['F']] ?? '').trim()
      const fv = raw === DELETE_TOKEN ? '' : raw.replace(/[^\d.]/g, '')
      if (fv) spec['F'] = { bust: fv, waist: '', hip: '' }
    }
    return spec
  }

  // Schedule reader — [삭제] in start/end clears that part of the phase (W1)
  // Empty cells preserve. Phase only included if any value or any explicit delete present.
  function _readSchedule(row, deleteKeysAdd) {
    const sch = {}
    phases.forEach(ph => {
      const sIdx = scheduleColMap[ph.key + '_start']
      const eIdx = scheduleColMap[ph.key + '_end']
      const rawS = sIdx != null ? String(row[sIdx] ?? '').trim() : ''
      const rawE = eIdx != null ? String(row[eIdx] ?? '').trim() : ''
      if (rawS === DELETE_TOKEN) deleteKeysAdd('schedule_' + ph.key + '_start')
      if (rawE === DELETE_TOKEN) deleteKeysAdd('schedule_' + ph.key + '_end')
      const startV = rawS === DELETE_TOKEN ? '' : rawS
      const endV   = rawE === DELETE_TOKEN ? '' : rawE
      if (startV || endV || rawS === DELETE_TOKEN || rawE === DELETE_TOKEN) {
        sch[ph.key] = { start: startV, end: endV }
      }
    })
    return sch
  }

  const dataRows = raw.slice(1)
    .map((row, i) => ({ row, userRowNo: i + 2 }))
    .filter(r => String(r.row[COL.sampleNo] || '').trim() || (COL.code != null && String(r.row[COL.code] || '').trim()))

  if (!dataRows.length) { showToast('데이터가 없습니다.', 'error'); return null }

  // W5: hard block on >300 rows (Firestore sharedData/planItems single-doc 1MB limit)
  if (dataRows.length > MAX_UPLOAD_ROWS) {
    showToast(`한 번에 업로드 가능한 최대 행 수는 ${MAX_UPLOAD_ROWS}개입니다. 현재: ${dataRows.length}개. 파일을 분할해 주세요.`, 'error')
    return null
  }

  const presentKeys = new Set(Object.keys(COL))
  Object.keys(sizeSpecColMap).forEach(k => presentKeys.add('sizeSpec_' + k))
  Object.keys(scheduleColMap).forEach(k => presentKeys.add('schedule_' + k))
  if (isNewTpl) {
    // 🔴 Q2: 타입 코드(ON/BK…)는 type 필드에 절대 안 씀(5-2 카테고리할인 p.type===c.category 보호). typeCode 별도 필드로.
    presentKeys.delete('type')        // update 시 기존 type(long-vocab) 보존 → 코드값 유입 차단
    presentKeys.delete('classInput')  // classInput → classCode 로 재명명(아래 valueKeys 도 정리)
    if (COL.type != null)       presentKeys.add('typeCode')    // 타입 컬럼 존재 → typeCode 파생
    if (COL.year != null)       presentKeys.add('yearDigit')   // 연도 컬럼 존재 → yearDigit 파생(year 필드는 전체연도 유지)
    if (COL.backStyle != null)  presentKeys.add('designCode')  // 백스타일 컬럼 = 디자인코드(신규 양식)
    if (COL.classInput != null) presentKeys.add('classCode')
  }

  const added = [], updated = [], skipped = [], failed = []
  // C1 fix: detect intra-file duplicates BEFORE building diffs; reject whole upload if any found
  const seenCodes = new Map()    // productCode → first row number
  const seenSamples = new Map()  // sampleNo → first row number
  const duplicates = []          // { type, identifier, firstRow, secondRow }
  const sampleDeleteAttempts = [] // [삭제] in 샘플번호 cell — silently rejected with toast

  dataRows.forEach(({ row, userRowNo }) => {
    const sampleNoRaw = String(row[COL.sampleNo] || '').trim()
    // [삭제] in sampleNo cell — matching key, cannot be removed via upload
    if (sampleNoRaw === DELETE_TOKEN) {
      sampleDeleteAttempts.push(userRowNo)
      failed.push({ row: userRowNo, productCode: '', name: '', reason: '샘플번호는 [삭제] 키워드로 제거할 수 없습니다' })
      return
    }
    const sampleNo = sampleNoRaw
    if (!sampleNo) {
      failed.push({ row: userRowNo, productCode: '', name: '', reason: '샘플번호가 비어있습니다 (필수)' })
      return
    }
    // W3: numeric 0 sampleNo edge case — reject as invalid
    if (sampleNo === '0' || sampleNo === '0.0') {
      failed.push({ row: userRowNo, productCode: '', name: '', reason: '샘플번호 "0"은 유효하지 않습니다' })
      return
    }

    // [삭제]-aware extractors (return '' / 0 for [삭제], empty, or NaN)
    const _s = (key) => {
      if (COL[key] == null) return ''
      const raw = row[COL[key]]
      const s = (raw == null) ? '' : String(raw).trim()
      return s === DELETE_TOKEN ? '' : s
    }
    const _n = (key) => {
      if (COL[key] == null) return 0
      const raw = row[COL[key]]
      const s = (raw == null) ? '' : String(raw).trim()
      if (s === DELETE_TOKEN || s === '') return 0
      return Number(raw) || 0
    }
    const typedCode = _s('code')
    // 🔴 품번 차단: 신규 양식은 품번을 시스템이 생성 → 시트 입력값을 절대 STORE 안 함.
    //   매칭(기존 항목 찾기)엔 사용 허용(작업지시). 구 양식은 오늘과 동일(저장·매칭 모두).
    const matchCode = typedCode                 // 기존 항목 매칭용(신구 공통)
    const code = isNewTpl ? '' : typedCode       // 저장용(신규=항상 공란)

    // C1 fix: intra-file duplicate detection (sampleNo always checked, productCode if stored)
    if (seenSamples.has(sampleNo)) {
      duplicates.push({ type: '샘플번호', identifier: sampleNo, firstRow: seenSamples.get(sampleNo), secondRow: userRowNo })
      return
    }
    if (code && seenCodes.has(code)) {
      duplicates.push({ type: '품번', identifier: code, firstRow: seenCodes.get(code), secondRow: userRowNo })
      return
    }
    seenSamples.set(sampleNo, userRowNo)
    if (code) seenCodes.set(code, userRowNo)

    // confirmed:true 항목 차단 (이미 상품으로 이전됨) — 매칭키 기준
    const blockedExisting = matchCode
      ? State.planItems.find(p => p.productCode === matchCode && p.confirmed)
      : null
    if (blockedExisting) {
      failed.push({ row: userRowNo, productCode: matchCode, name: blockedExisting.nameKr || '', reason: '이미 상품으로 이전된 항목입니다 (수정 불가)' })
      return
    }

    // [삭제] keyword + valueKeys tracking (per-row)
    const valueKeys = new Set()
    const deleteKeys = new Set()
    Object.keys(COL).forEach(hdrKey => {
      const raw = row[COL[hdrKey]]
      const s = (raw == null) ? '' : String(raw).trim()
      if (s === DELETE_TOKEN) {
        // sampleNo already handled above (return)
        if (hdrKey === 'sampleNo') return
        deleteKeys.add(hdrKey)
      } else if (s !== '') {
        valueKeys.add(hdrKey)
      }
    })
    Object.entries(sizeSpecColMap).forEach(([sk, ci]) => {
      const s = String(row[ci] ?? '').trim()
      if (s === DELETE_TOKEN) deleteKeys.add('sizeSpec_' + sk)
    })

    const sumUrls    = COL.urlSum != null      ? parseSumUrls(row[COL.urlSum])      : []
    const lemUrls    = COL.urlLemango != null  ? parseSumUrls(row[COL.urlLemango])  : []
    const noirUrls   = COL.urlNoir != null     ? parseSumUrls(row[COL.urlNoir])     : []
    const extUrls    = COL.urlExternal != null ? parseSumUrls(row[COL.urlExternal]) : []
    const designArr  = COL.urlDesign != null   ? parseSumUrls(row[COL.urlDesign])   : []
    const shootArr   = COL.urlShoot != null    ? parseSumUrls(row[COL.urlShoot])    : []

    // ── 필드 값(구 양식=raw / 신규 양식=코드추출·파생·자동채움) ──
    let f_type = _s('type'), f_year = _s('year'), f_season = _s('season')
    let f_gender = _s('gender'), f_backStyle = _s('backStyle'), f_legCut = _s('legCut')
    let classCode = '', typeCode = '', yearDigit = '', designCode = ''
    let cafe24DetailUrl = '', sabangDetailUrl = ''
    let af_backStyleName = ''   // 자동채운 백스타일명(EN) — 미리보기 표시용
    if (isNewTpl) {
      classCode  = extractCode(_s('classInput'))   // "르망고 수영복(LS)" → LS
      typeCode   = extractCode(_s('type'))          // "원피스(ON)" → ON
      yearDigit  = extractCode(_s('year'))          // "2026(6)" → 6
      designCode = extractCode(_s('backStyle'))     // "1626" → 1626 (괄호없음=값자체)
      f_gender   = extractCode(_s('gender'))        // "여성(W)" → W (기존 저장 vocab=코드)
      f_season   = extractCode(_s('season'))        // "1" → 1
      f_legCut   = extractCode(_s('legCut'))        // 쌍이면 코드, 단순이면 값그대로(괄호없음)
      f_type     = ''                               // 🔴 Q2: type 필드 공란(코드 유입 금지 — UI 에서 후설정)
      f_year     = yearDigit ? (typeof pcodeYearFull === 'function' ? pcodeYearFull(yearDigit) : '') : ''  // "6" → "2026"
      cafe24DetailUrl = _s('cafe24DetailUrl')
      sabangDetailUrl = _s('sabangDetailUrl')
      // 자동채움: 백스타일 디자인코드 → _designCodes(LIVE) 영문명 → backStyle 필드(영문명 저장 = 기존 시맨틱)
      if (designCode && typeof _designCodes !== 'undefined' && Array.isArray(_designCodes)) {
        const de = _designCodes.find(([c]) => String(c) === designCode)
        if (de) { af_backStyleName = de[1] || ''; f_backStyle = af_backStyleName }
      }
    }

    const planItem = {
      sampleNo,
      productCode:  code,
      brand:        _s('brand') || '르망고',
      nameKr:       _s('nameKr'),
      nameEn:       _s('nameEn'),
      ...(() => {
        // Color resolution: prefer 색상코드 → master, fallback to 색상(한글) → master (🔴 코드 승리 = 자동채움)
        const codeRaw = _s('colorCode')
        const krRaw = _s('colorKr')
        const enRaw = _s('colorEn')
        let m = null
        if (codeRaw && typeof getColorByCode === 'function') m = getColorByCode(codeRaw)
        if (!m && krRaw && typeof getColorByNameKr === 'function') m = getColorByNameKr(krRaw)
        return m
          ? { colorKr: m.nameKr, colorEn: m.nameEn, colorCode: m.code }
          : { colorKr: krRaw, colorEn: enRaw, colorCode: codeRaw }
      })(),
      salePrice:    _n('salePrice'),
      costPrice:    _n('costPrice'),
      type:         f_type,
      year:         f_year,
      season:       f_season,
      gender:       f_gender,
      backStyle:    f_backStyle,
      legCut:       f_legCut,
      ...(isNewTpl ? { classCode, typeCode, yearDigit, designCode, cafe24DetailUrl, sabangDetailUrl } : {}),
      guide:        _s('guide'),
      fabricType:   _s('fabricType'),
      chestLine:    _s('chestLine'),
      transparency: _s('transparency'),
      lining:       _s('lining'),
      capRing:      _s('capRing'),
      material:     _s('material'),
      comment:      _s('comment'),
      washMethod:   _s('washMethod'),
      sizeSpec:     Object.keys(sizeSpecColMap).length ? _readSizeSpec(row) : null,
      modelSize:    _s('modelSize'),
      madeMonth:    _s('madeMonth'),
      madeBy:       _s('madeBy'),
      madeIn:       _s('madeIn'),
      memo:         _s('memo'),
      mainImage:    _s('mainImage'),
      videoUrl:     _s('videoUrl'),
      // W2: design/shoot stored as ARRAYS (consistent with sum/lemango/noir/external)
      // _diffPlan and apply normalize legacy string-typed existing data on read
      images: {
        sum:      sumUrls,
        lemango:  lemUrls,
        noir:     noirUrls,
        external: extUrls,
        design:   designArr,
        shoot:    shootArr
      },
      schedule:    Object.keys(scheduleColMap).length ? _readSchedule(row, k => deleteKeys.add(k)) : null,
      tempImages:  []
    }

    // 🔴 신규 양식 LIVE 검증(비어있지 않은 값만). 실패 → 반영 제외(failed). 구 양식 = 검증 없음(round-trip 보존).
    if (isNewTpl) {
      const vErrs = _validatePlanRowNew(planItem, {
        classCode, typeCode, yearDigit, designCode,
        brandRaw: _s('brand'),
        saleStatus: _s('saleStatus'), productionStatus: _s('productionStatus')
      })
      if (vErrs.length) {
        failed.push({ row: userRowNo, productCode: matchCode || '', name: planItem.nameKr || '', reason: vErrs.join(' · ') })
        return
      }
    }

    // 안내(info) — 반영은 하되 사용자에게 알림: 품번 무시 + 자동채움 결과
    const info = []
    if (isNewTpl && matchCode) info.push(`품번 '${matchCode}' 무시 (시스템 생성)`)
    const autofill = {}
    if (isNewTpl) {
      if (planItem.colorCode && (planItem.colorKr || planItem.colorEn)) {
        autofill.color = (planItem.colorKr || '') + (planItem.colorEn ? ' / ' + planItem.colorEn : '')
      }
      if (af_backStyleName) autofill.backStyleName = af_backStyleName
      // 파생 코드 필드를 update 병합 대상으로 등록(신규 필드는 COL 에 없어 valueKeys 자동수집 안 됨)
      if (typeCode)   valueKeys.add('typeCode')
      if (yearDigit)  valueKeys.add('yearDigit')
      if (designCode) valueKeys.add('designCode')
      if (classCode)  valueKeys.add('classCode')
      valueKeys.delete('classInput')   // classInput → classCode 로 대체
      valueKeys.delete('type')         // type 필드 갱신 금지(공란 유지)
    }

    // 매칭 우선순위: 품번(매칭키) → 샘플번호 (confirmed 제외)
    let idx = -1
    if (matchCode) idx = State.planItems.findIndex(p => p.productCode === matchCode && !p.confirmed)
    if (idx < 0) idx = State.planItems.findIndex(p => p.sampleNo === sampleNo && !p.confirmed)

    if (idx >= 0) {
      const existing = State.planItems[idx]
      const diffs = _diffPlan(existing, planItem, presentKeys, deleteKeys)
      if (diffs.length > 0) {
        updated.push({ code, sampleNo, idx, planItem, diffs, existing, presentKeys, valueKeys, deleteKeys, row: userRowNo, info, autofill })
      } else {
        skipped.push({ row: userRowNo, productCode: code || sampleNo, reason: '변경 사항 없음' })
      }
    } else {
      added.push({ code, sampleNo, planItem, valueKeys, deleteKeys, row: userRowNo, info, autofill })
    }
  })

  // [삭제] 키워드를 샘플번호 셀에 사용한 행 — 경고 토스트
  if (sampleDeleteAttempts.length > 0) {
    const rows = sampleDeleteAttempts.slice(0, 5).join(', ')
    const more = sampleDeleteAttempts.length > 5 ? ` 외 ${sampleDeleteAttempts.length - 5}건` : ''
    showToast(`샘플번호는 [삭제] 키워드로 제거할 수 없습니다 (행 ${rows}${more}). UI에서 직접 수정하세요.`, 'warning')
  }

  // C1 fix: if any intra-file duplicates found, reject entire upload (Option A — safest)
  if (duplicates.length > 0) {
    const list = duplicates.slice(0, 5)
      .map(d => `${d.type} "${d.identifier}" (행 ${d.firstRow}, ${d.secondRow})`)
      .join('\n')
    const more = duplicates.length > 5 ? `\n... 외 ${duplicates.length - 5}건` : ''
    showToast(`엑셀 파일에 중복 식별자가 있습니다:\n${list}${more}\n파일을 확인 후 다시 업로드하세요.`, 'error')
    return null
  }

  return { added, updated, failed, skipped, isNewTpl }
}

// 🔴 신규 양식 행 LIVE 검증 — 관리형/마스터 소스는 호출 시점(use-time)에 읽음(스냅샷 금지).
//   비어있지 않은 값만 검증(빈값=통과, round-trip 안전). 실패 사유는 "필드: 사유" 형식.
function _validatePlanRowNew(pi, ctx) {
  const errs = []
  const S = (typeof _settings !== 'undefined' && _settings) ? _settings : {}   // LIVE
  const brands = (S.brands && S.brands.length) ? S.brands : ['르망고', '르망고 느와']
  const brandRaw = String(ctx.brandRaw || '').trim()
  if (!brandRaw) errs.push('브랜드: 필수 입력')
  else if (!_codeInList(brands, brandRaw)) errs.push(`브랜드: 미등록 '${brandRaw}'`)
  // 색상코드 (LIVE _colorMasters via getColorByCode)
  if (pi.colorCode && typeof getColorByCode === 'function' && !getColorByCode(pi.colorCode)) errs.push(`색상코드: 미등록 코드 '${pi.colorCode}'`)
  // 분류 (LIVE _classCodes)
  const classCodesLive = (typeof _classCodes !== 'undefined' && Array.isArray(_classCodes)) ? _classCodes : []
  if (ctx.classCode && !_codeInList(classCodesLive, ctx.classCode)) errs.push(`분류: 미등록 코드 '${ctx.classCode}'`)
  // 타입/연도/성별/시즌 (고정 PCODE_* 단일 소스)
  if (ctx.typeCode  && !_codeInList((typeof PCODE_TYPES   !== 'undefined' ? PCODE_TYPES   : []), ctx.typeCode))  errs.push(`타입: 미등록 코드 '${ctx.typeCode}'`)
  if (ctx.yearDigit && !_codeInList((typeof PCODE_YEARS   !== 'undefined' ? PCODE_YEARS   : []), ctx.yearDigit)) errs.push(`연도: 미등록 코드 '${ctx.yearDigit}'`)
  if (pi.gender     && !_codeInList((typeof PCODE_GENDERS !== 'undefined' ? PCODE_GENDERS : []), pi.gender))    errs.push(`성별: 미등록 코드 '${pi.gender}'`)
  if (pi.season     && !_codeInList((typeof PCODE_SEASONS !== 'undefined' ? PCODE_SEASONS : []), pi.season))    errs.push(`시즌: 미등록 '${pi.season}'`)
  // 백스타일 디자인코드 (LIVE _designCodes)
  const designCodesLive = (typeof _designCodes !== 'undefined' && Array.isArray(_designCodes)) ? _designCodes : []
  if (ctx.designCode && !_codeInList(designCodesLive, ctx.designCode)) errs.push(`백스타일: 미등록 코드 '${ctx.designCode}'`)
  // 관리형 리스트 (LIVE _settings.*) — 판매상태/생산상태는 상품확정 단계 필드라 저장 안 함, 검증만.
  const mchecks = [
    [pi.legCut, S.legCuts, '레그컷'], [pi.fabricType, S.fabricTypes, '원단타입'],
    [pi.washMethod, S.washMethods, '세탁방법'], [pi.chestLine, S.chestLines, '가슴선'],
    [pi.transparency, S.transparencies, '비침'], [pi.lining, S.linings, '안감'],
    [pi.capRing, S.capRings, '캡고리'],
    [String(ctx.saleStatus || '').trim(), S.saleStatuses, '판매상태'],
    [String(ctx.productionStatus || '').trim(), S.productionStatuses, '생산상태']
  ]
  mchecks.forEach(([v, list, label]) => {
    if (v && Array.isArray(list) && list.length && !_codeInList(list, v)) errs.push(`${label}: 미등록 '${v}'`)
  })
  return errs
}

// 기획 전용 비교 필드
const _PLAN_DIFF_FIELDS = [
  { key:'brand', label:'브랜드' },
  { key:'productCode', label:'품번', hdrKey:'code' },
  { key:'nameKr', label:'상품명(한글)' },
  { key:'nameEn', label:'상품명(영문)' },
  { key:'colorKr', label:'색상(한글)' },
  { key:'colorEn', label:'색상(영문)' },
  { key:'colorCode', label:'색상코드' },
  { key:'salePrice', label:'판매가' },
  { key:'costPrice', label:'원가' },
  { key:'type', label:'타입' },
  { key:'year', label:'연도' },
  { key:'season', label:'시즌' },
  { key:'gender', label:'성별' },
  { key:'backStyle', label:'백스타일' },
  // 신규 양식 파생 코드 필드(품번 생성용). presentKeys 게이팅 → 구 양식 diff 는 스킵.
  { key:'classCode', label:'분류코드' },
  { key:'typeCode', label:'타입코드' },
  { key:'yearDigit', label:'연도코드' },
  { key:'designCode', label:'디자인코드' },
  { key:'cafe24DetailUrl', label:'CAFE24 상세 URL' },
  { key:'sabangDetailUrl', label:'사방넷 상세 URL' },
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
  { key:'modelSize', label:'모델사이즈' },
  { key:'madeMonth', label:'제조년월' },
  { key:'madeBy', label:'제조사' },
  { key:'madeIn', label:'제조국' },
  { key:'memo', label:'메모' },
  { key:'mainImage', label:'대표이미지' },
  { key:'videoUrl', label:'영상URL' }
]

// W2: image normalization — arrays, strings, null all coerce to '\n'-joined string
const _normImgVal = v => Array.isArray(v) ? v.join('\n') : String(v ?? '')

function _diffPlan(existing, uploaded, presentKeys, deleteKeys) {
  deleteKeys = deleteKeys || new Set()
  const diffs = []
  // Master-aware: same canonical color on both sides → suppress all 3 color diffs
  const colorSame = _sameColorIdentity(existing, uploaded)
  _PLAN_DIFF_FIELDS.forEach(f => {
    if (colorSame && _COLOR_KEYS.indexOf(f.key) >= 0) return
    if (presentKeys) {
      const hdrKey = f.hdrKey || f.key
      if (!presentKeys.has(hdrKey)) return
    }
    const oldVal = String(existing[f.key] ?? '')
    const newVal = String(uploaded[f.key] ?? '')
    if (oldVal !== newVal) {
      const headerKey = f.hdrKey || f.key
      const entry = { key: f.key, label: f.label, oldVal, newVal }
      if (deleteKeys.has(headerKey)) entry.isDelete = true
      diffs.push(entry)
    }
  })
  // W2: all 6 image sections treated uniformly (legacy strings + new arrays both normalized)
  const imgAllSec = ['sum','lemango','noir','external','design','shoot']
  imgAllSec.forEach(sec => {
    const hdrKey = _IMG_PRESENT_KEY[sec]
    if (presentKeys && !presentKeys.has(hdrKey)) return
    const oldV = _normImgVal(existing.images?.[sec])
    const newV = _normImgVal(uploaded.images?.[sec])
    if (oldV !== newV) {
      const entry = { key: 'images.' + sec, label: '이미지(' + sec + ')', oldVal: oldV, newVal: newV }
      if (deleteKeys.has(hdrKey)) entry.isDelete = true
      diffs.push(entry)
    }
  })
  // sizeSpec — 부위 단일 소스: SIZE_SPEC_PARTS (core.js)
  SIZE_SPEC_SIZES.forEach(sz => {
    SIZE_SPEC_PARTS.forEach(pt => {
      const part = pt.key
      if (presentKeys && !presentKeys.has('sizeSpec_' + sz + '_' + part)) return
      const oldV = String(existing.sizeSpec?.[sz]?.[part] ?? '')
      const newV = String(uploaded.sizeSpec?.[sz]?.[part] ?? '')
      if (oldV !== newV) {
        const entry = { key: 'sizeSpec.' + sz + '.' + part, label: sz + ' ' + pt.excel, oldVal: oldV, newVal: newV }
        if (deleteKeys.has('sizeSpec_' + sz + '_' + part)) entry.isDelete = true
        diffs.push(entry)
      }
    })
  })
  if (!presentKeys || presentKeys.has('sizeSpec_F')) {
    const _fStr = (v) => v == null ? '' : (typeof v === 'object' ? String(v.bust || v.waist || v.hip || '') : String(v))
    const oldF = _fStr(existing.sizeSpec?.F)
    const newF = _fStr(uploaded.sizeSpec?.F)
    if (oldF !== newF) {
      const entry = { key: 'sizeSpec.F', label: 'F', oldVal: oldF, newVal: newF }
      if (deleteKeys.has('sizeSpec_F')) entry.isDelete = true
      diffs.push(entry)
    }
  }
  // schedule (동적 phases)
  const phases = (typeof getPlanPhases === 'function') ? getPlanPhases() : []
  phases.forEach(ph => {
    ;['start','end'].forEach(t => {
      if (presentKeys && !presentKeys.has('schedule_' + ph.key + '_' + t)) return
      const oldV = String(existing.schedule?.[ph.key]?.[t] ?? '')
      const newV = String(uploaded.schedule?.[ph.key]?.[t] ?? '')
      if (oldV !== newV) {
        const entry = {
          key: 'schedule.' + ph.key + '.' + t,
          label: ph.label + ' ' + (t === 'start' ? '시작' : '종료'),
          oldVal: oldV, newVal: newV
        }
        if (deleteKeys.has('schedule_' + ph.key + '_' + t)) entry.isDelete = true
        diffs.push(entry)
      }
    })
  })
  return diffs
}

// 미리보기 모달 (상품 패턴 재사용 — bulkEditPreviewModal)
function _showPlanBulkPreview(parsed) {
  const modal = document.getElementById('bulkEditPreviewModal')
  // W4: do NOT silently apply when modal is missing — surface error and abort
  if (!modal) {
    showToast('미리보기 모달을 찾을 수 없습니다. 페이지를 새로고침해 주세요.', 'error')
    _planBulkPending = null
    return
  }
  const body = modal.querySelector('.srm-body')
  if (!body) {
    showToast('미리보기 모달 본문을 찾을 수 없습니다. 페이지를 새로고침해 주세요.', 'error')
    _planBulkPending = null
    return
  }

  let html = '<div class="be-summary">'
  if (parsed.updated.length) html += '<span class="be-badge be-badge-update">수정 ' + parsed.updated.length + '건</span>'
  if (parsed.added.length) html += '<span class="be-badge be-badge-add">신규 ' + parsed.added.length + '건</span>'
  if (parsed.failed && parsed.failed.length) html += '<span class="be-badge be-badge-fail">실패 ' + parsed.failed.length + '건</span>'
  if (parsed.skipped && parsed.skipped.length) html += '<span class="be-badge be-badge-skip">스킵 ' + parsed.skipped.length + '건</span>'
  html += '</div>'

  // 자동채움/안내 요약(품번 무시·색상/백스타일명 자동) — 신규·수정 행에 노출
  const _fmtItemInfo = (item) => {
    const bits = []
    if (item.autofill && item.autofill.color) bits.push('색상 자동: ' + item.autofill.color)
    if (item.autofill && item.autofill.backStyleName) bits.push('백스타일명 자동: ' + item.autofill.backStyleName)
    if (item.info && item.info.length) bits.push(...item.info)
    return bits.length ? '<div class="be-autofill-note">' + esc(bits.join(' · ')) + '</div>' : ''
  }

  if (parsed.updated.length) {
    html += '<div class="be-section-title">변경 사항 (수정)</div>'
    parsed.updated.forEach(item => {
      const label = item.code || item.sampleNo
      const nameKr = item.existing.nameKr || ''
      html += '<div class="be-product">'
      html += '<div class="be-product-header" onclick="this.nextElementSibling.classList.toggle(\'be-hidden\')">'
      html += '<span class="be-code">' + esc(label) + '</span>'
      html += '<span class="be-name">' + esc(nameKr) + '</span>'
      html += '<span class="be-diff-count">' + item.diffs.length + '개 필드 변경</span>'
      html += '<span class="be-toggle">▾</span>'
      html += '</div>'
      html += '<div class="be-diff-table">'
      html += '<table><thead><tr><th>필드</th><th>기존값</th><th>새값</th></tr></thead><tbody>'
      item.diffs.forEach(d => {
        const oldDisp = d.oldVal.length > 60 ? d.oldVal.slice(0,60) + '...' : d.oldVal
        const newDisp = d.newVal.length > 60 ? d.newVal.slice(0,60) + '...' : d.newVal
        const rowCls = d.isDelete ? ' class="be-row-delete"' : ''
        const newCls = d.isDelete ? 'be-new be-new-delete' : 'be-new'
        const newText = d.isDelete ? '[삭제]' : (newDisp || '(없음)')
        html += '<tr' + rowCls + '><td class="be-field">' + esc(d.label) + '</td>'
        html += '<td class="be-old">' + esc(oldDisp || '(없음)') + '</td>'
        html += '<td class="' + newCls + '">' + esc(newText) + '</td></tr>'
      })
      html += '</tbody></table></div>'
      html += _fmtItemInfo(item)
      html += '</div>'
    })
  }

  // 🔴 검증 실패/제외 — 필드+사유 표시(무음 금지). 이 행들은 [확정]에 반영되지 않음.
  if (parsed.failed && parsed.failed.length) {
    html += '<div class="be-section-title">반영 제외 (검증 실패 · ' + parsed.failed.length + '건)</div>'
    parsed.failed.forEach(f => {
      const idLabel = f.productCode || f.name || ('행 ' + f.row)
      html += '<div class="be-add-row be-row-delete">'
      html += '<span class="be-code">행 ' + esc(String(f.row)) + '</span>'
      html += '<span class="be-name">' + esc(idLabel) + '</span>'
      html += '<span class="be-new be-new-delete">' + esc(f.reason || '오류') + '</span></div>'
    })
  }

  if (parsed.added.length) {
    html += '<div class="be-section-title">신규 등록</div>'
    parsed.added.forEach(item => {
      const label = item.code || item.sampleNo
      html += '<div class="be-add-row"><span class="be-code">' + esc(label) + '</span>'
      html += '<span class="be-name">' + esc(item.planItem.nameKr || '') + '</span>'
      html += '<span class="be-add-label">신규</span></div>'
      html += _fmtItemInfo(item)
    })
  }

  html += '<div class="be-actions">'
  html += '<button class="btn btn-primary" onclick="confirmPlanBulkUpload()">확정 적용</button>'
  html += '<button class="btn" onclick="cancelPlanBulkUpload()">취소</button>'
  html += '</div>'

  body.innerHTML = html
  centerModal(modal)
  modal.showModal()
}

function confirmPlanBulkUpload() {
  if (!_planBulkPending) return
  _applyPlanUpload(_planBulkPending)
  _planBulkPending = null
  document.getElementById('bulkEditPreviewModal')?.close()
}

function cancelPlanBulkUpload() {
  _planBulkPending = null
  document.getElementById('bulkEditPreviewModal')?.close()
  showToast('업로드가 취소되었습니다.', 'info')
}

async function _applyPlanUpload(parsed) {
  let added = 0, updated = 0
  const baseNo = State.planItems.length
    ? Math.max(...State.planItems.map(p => Number(p.no) || 0))
    : 0

  parsed.added.forEach((item, i) => {
    const planItem = item.planItem
    if (planItem.sizeSpec == null) planItem.sizeSpec = {}
    if (planItem.schedule == null) planItem.schedule = {}
    planItem.no = baseNo + i + 1
    planItem.confirmed = false
    if (planItem.productCode) _reservedCodes.delete(planItem.productCode)
    stampCreated(planItem)
    State.planItems.push(planItem)
    added++
  })

  parsed.updated.forEach(item => {
    const existing = State.planItems[item.idx]
    if (!existing) return
    const presentKeys = item.presentKeys
    const valueKeys = item.valueKeys instanceof Set ? item.valueKeys : presentKeys
    const deleteKeys = item.deleteKeys instanceof Set ? item.deleteKeys : new Set()
    const uploaded = item.planItem

    // W6: per-part sizeSpec merge (empty cells preserve existing parts; [삭제] sets to '')
    // 부위 단일 소스: SIZE_SPEC_PARTS (core.js)
    const _PARTS = SIZE_SPEC_PARTS.map(p => p.key)
    const mergedSizeSpec = (() => {
      if (uploaded.sizeSpec == null) return existing.sizeSpec || {}
      const out = JSON.parse(JSON.stringify(existing.sizeSpec || {}))
      SIZE_SPEC_SIZES.forEach(sz => {
        _PARTS.forEach(part => {
          const headerKey = 'sizeSpec_' + sz + '_' + part
          if (deleteKeys.has(headerKey)) {
            if (!out[sz]) out[sz] = emptySizeSpecParts()
            out[sz][part] = ''
          } else if (presentKeys && presentKeys.has(headerKey)) {
            const v = uploaded.sizeSpec?.[sz]?.[part]
            if (v != null && String(v).trim() !== '') {
              if (!out[sz]) out[sz] = emptySizeSpecParts()
              out[sz][part] = v
            }
          }
        })
      })
      if (deleteKeys.has('sizeSpec_F')) {
        if (out.F && typeof out.F === 'object') out.F.bust = '' ; else out.F = { bust:'', waist:'', hip:'' }
      } else if (presentKeys && presentKeys.has('sizeSpec_F')) {
        const f = uploaded.sizeSpec?.F
        if (f && (f.bust || f.waist || f.hip)) out.F = f
      }
      return out
    })()

    // W1: schedule merge — supports per-key [삭제] (e.g., 'schedule_design_start') to clear
    const mergedSchedule = (() => {
      if (uploaded.schedule == null) return existing.schedule || {}
      const out = JSON.parse(JSON.stringify(existing.schedule || {}))
      const phasesNow = (typeof getPlanPhases === 'function') ? getPlanPhases() : []
      phasesNow.forEach(ph => {
        ;['start','end'].forEach(t => {
          const dk = 'schedule_' + ph.key + '_' + t
          if (deleteKeys.has(dk)) {
            if (!out[ph.key]) out[ph.key] = { start:'', end:'' }
            out[ph.key][t] = ''
          } else {
            const v = uploaded.schedule?.[ph.key]?.[t]
            if (v != null && String(v).trim() !== '') {
              if (!out[ph.key]) out[ph.key] = { start:'', end:'' }
              out[ph.key][t] = v
            }
          }
        })
      })
      return out
    })()

    let merged
    if (presentKeys) {
      merged = { ...existing }
      const SCALAR_MAP = {
        brand:'brand',
        nameKr:'nameKr', nameEn:'nameEn', colorKr:'colorKr', colorEn:'colorEn', colorCode:'colorCode',
        salePrice:'salePrice', costPrice:'costPrice',
        type:'type', year:'year', season:'season', gender:'gender',
        backStyle:'backStyle',
        // 신규 양식 파생 코드 필드(품번 생성용) — presentKeys/valueKeys 게이팅으로 구 양식은 무영향
        classCode:'classCode', typeCode:'typeCode', yearDigit:'yearDigit', designCode:'designCode',
        cafe24DetailUrl:'cafe24DetailUrl', sabangDetailUrl:'sabangDetailUrl',
        legCut:'legCut', guide:'guide',
        fabricType:'fabricType', chestLine:'chestLine', transparency:'transparency',
        lining:'lining', capRing:'capRing', material:'material', comment:'comment',
        washMethod:'washMethod', modelSize:'modelSize',
        madeMonth:'madeMonth', madeBy:'madeBy', madeIn:'madeIn',
        memo:'memo', mainImage:'mainImage', videoUrl:'videoUrl'
      }
      // Master-aware: same canonical color → preserve existing color (no harmful overwrite)
      const colorSame = _sameColorIdentity(existing, uploaded)
      Object.entries(SCALAR_MAP).forEach(([hdrKey, prodKey]) => {
        if (colorSame && _COLOR_KEYS.indexOf(prodKey) >= 0 && !deleteKeys.has(hdrKey)) return
        if (deleteKeys.has(hdrKey)) {
          merged[prodKey] = NUMERIC_FIELDS.has(prodKey) ? 0 : ''
        } else if (presentKeys.has(hdrKey) && valueKeys.has(hdrKey)) {
          merged[prodKey] = uploaded[prodKey]
        }
      })
      // productCode: assign only when existing is empty (never overwrite). [삭제] disallowed by parse.
      if (presentKeys.has('code') && valueKeys.has('code') && !existing.productCode && uploaded.productCode) {
        merged.productCode = uploaded.productCode
      }
      // W2: all 6 image sections stored as arrays — design/shoot unified
      const IMG_MAP = { urlSum:'sum', urlLemango:'lemango', urlNoir:'noir', urlExternal:'external', urlDesign:'design', urlShoot:'shoot' }
      const mergedImages = { ...(existing.images || {}) }
      Object.entries(IMG_MAP).forEach(([hdrKey, secKey]) => {
        if (deleteKeys.has(hdrKey)) {
          mergedImages[secKey] = []
        } else if (presentKeys.has(hdrKey) && valueKeys.has(hdrKey)) {
          mergedImages[secKey] = Array.isArray(uploaded.images?.[secKey]) ? uploaded.images[secKey] : []
        }
      })
      merged.images = mergedImages
    } else {
      merged = { ...existing, ...uploaded }
    }

    // 보존 필드
    merged.no = existing.no
    merged.tempImages = existing.tempImages || []
    merged.confirmed = existing.confirmed || false
    merged.confirmedAt = existing.confirmedAt
    merged.sizeSpec = mergedSizeSpec || {}
    merged.schedule = mergedSchedule

    State.planItems[item.idx] = merged
    stampModified(State.planItems[item.idx])
    updated++
  })

  State.plan.filtered = State.planItems.filter(p => !p.confirmed)
  if (typeof renderPlanTable === 'function') renderPlanTable()
  if (typeof renderDashboard === 'function') renderDashboard()

  if (typeof savePlanItems === 'function') {
    try { await savePlanItems() } catch (e) { console.error(e) }
  }

  if (typeof logActivity === 'function') {
    logActivity('upload', '신규기획', '엑셀 업로드: 신규 ' + added + '건, 수정 ' + updated + '건')
  }
  showToast('업로드 완료: 신규 ' + added + '건 / 수정 ' + updated + '건', 'success')

  // Firestore 1MB 한계 경고 (sharedData/planItems 단일 문서)
  if (State.planItems.length > 300) {
    showToast('기획 항목 ' + State.planItems.length + '건 — Firestore 1MB 한계에 근접합니다', 'warning')
  }

  _showUploadResultFromPlanParsed(parsed, added, updated)
}

function _showUploadResultFromPlanParsed(parsed, addedApplied, updatedApplied) {
  if (typeof showUploadResult !== 'function') return
  const failed = parsed.failed || []
  const skipped = parsed.skipped || []
  const result = {
    total: (parsed.added || []).length + (parsed.updated || []).length + failed.length + skipped.length,
    success: (parsed.added || []).map(item => ({
      row: item.row,
      productCode: item.code || item.sampleNo,
      name: item.planItem.nameKr || ''
    })),
    updated: (parsed.updated || []).map(item => ({
      row: item.row,
      productCode: item.code || item.sampleNo,
      name: item.planItem.nameKr || (item.existing && item.existing.nameKr) || '',
      changes: (item.diffs || []).map(d => d.label).join(', ')
    })),
    failed,
    skipped
  }
  showUploadResult(result)
}

// 결과 모달 — window 노출
window.showUploadResult = function(result) {
  const modal = document.getElementById('uploadResultModal')
  if (!modal) return

  const total = result.total || 0
  const success = result.success || []
  const updated = result.updated || []
  const failed = result.failed || []
  const skipped = result.skipped || []

  // 요약 카드
  let html = '<div class="upload-result-cards">'
  html += '<div class="upload-result-card upload-result-total"><div class="upload-result-card-value">' + total + '</div><div class="upload-result-card-label">전체</div></div>'
  html += '<div class="upload-result-card upload-result-new"><div class="upload-result-card-value">' + success.length + '</div><div class="upload-result-card-label">신규등록</div></div>'
  html += '<div class="upload-result-card upload-result-update"><div class="upload-result-card-value">' + updated.length + '</div><div class="upload-result-card-label">수정</div></div>'
  html += '<div class="upload-result-card upload-result-fail"><div class="upload-result-card-value">' + failed.length + '</div><div class="upload-result-card-label">실패</div></div>'
  html += '<div class="upload-result-card upload-result-skip"><div class="upload-result-card-value">' + skipped.length + '</div><div class="upload-result-card-label">스킵</div></div>'
  html += '</div>'
  document.getElementById('uploadResultSummary').innerHTML = html

  // 상세 내역
  let detail = ''

  if (failed.length > 0) {
    detail += '<div class="upload-result-section">'
    detail += '<div class="upload-result-section-title upload-result-section-fail">실패 (' + failed.length + '건)</div>'
    detail += '<table class="upload-result-table">'
    detail += '<thead><tr><th>행</th><th>품번</th><th>상품명</th><th>실패 사유</th></tr></thead><tbody>'
    failed.forEach(function(item) {
      detail += '<tr class="upload-result-row-fail">'
      detail += '<td>' + (item.row || '-') + '</td>'
      detail += '<td>' + esc(item.productCode || '-') + '</td>'
      detail += '<td>' + esc(item.name || '-') + '</td>'
      detail += '<td class="upload-result-reason">' + esc(item.reason || '알 수 없는 오류') + '</td>'
      detail += '</tr>'
    })
    detail += '</tbody></table></div>'
  }

  if (skipped.length > 0) {
    detail += '<div class="upload-result-section">'
    detail += '<div class="upload-result-section-title upload-result-section-skip">스킵 (' + skipped.length + '건)</div>'
    detail += '<table class="upload-result-table">'
    detail += '<thead><tr><th>행</th><th>품번</th><th>사유</th></tr></thead><tbody>'
    skipped.forEach(function(item) {
      detail += '<tr>'
      detail += '<td>' + (item.row || '-') + '</td>'
      detail += '<td>' + esc(item.productCode || '-') + '</td>'
      detail += '<td>' + esc(item.reason || '') + '</td>'
      detail += '</tr>'
    })
    detail += '</tbody></table></div>'
  }

  if (success.length > 0) {
    detail += '<div class="upload-result-section">'
    detail += '<div class="upload-result-section-title upload-result-section-new">신규등록 (' + success.length + '건)</div>'
    detail += '<table class="upload-result-table">'
    detail += '<thead><tr><th>행</th><th>품번</th><th>상품명</th></tr></thead><tbody>'
    success.forEach(function(item) {
      detail += '<tr>'
      detail += '<td>' + (item.row || '-') + '</td>'
      detail += '<td>' + esc(item.productCode || '-') + '</td>'
      detail += '<td>' + esc(item.name || '-') + '</td>'
      detail += '</tr>'
    })
    detail += '</tbody></table></div>'
  }

  if (updated.length > 0) {
    detail += '<div class="upload-result-section">'
    detail += '<div class="upload-result-section-title upload-result-section-update">수정 (' + updated.length + '건)</div>'
    detail += '<table class="upload-result-table">'
    detail += '<thead><tr><th>행</th><th>품번</th><th>상품명</th><th>변경 항목</th></tr></thead><tbody>'
    updated.forEach(function(item) {
      detail += '<tr>'
      detail += '<td>' + (item.row || '-') + '</td>'
      detail += '<td>' + esc(item.productCode || '-') + '</td>'
      detail += '<td>' + esc(item.name || '-') + '</td>'
      detail += '<td class="upload-result-changes">' + esc(item.changes || '') + '</td>'
      detail += '</tr>'
    })
    detail += '</tbody></table></div>'
  }

  if (!detail) detail = '<div class="upload-result-empty">상세 내역이 없습니다</div>'
  document.getElementById('uploadResultDetails').innerHTML = detail

  if (typeof centerModal === 'function') centerModal(modal)
  modal.showModal()
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
