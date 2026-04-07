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
      'no','brand','productCode','sampleNo','cafe24Code','barcode',
      'nameKr','nameEn','colorKr','colorEn','salePrice','costPrice',
      'type','backStyle','legCut','guide','fabricType','chestLine','transparency','lining','capRing',
      'material','comment','washMethod',
      'bust','waist','hip','modelSize',
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
  if (key.startsWith('stock.')) return p.stock ? (p.stock[key.split('.')[1]]||0) : 0
  if (key.startsWith('sales.')) return p.sales ? (p.sales[key.split('.')[1]]||0) : 0
  if (key.startsWith('mallCodes.')) return p.mallCodes ? (p.mallCodes[key.split('.')[1]]||'') : ''
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

  const HEADER = [
    'NO','브랜드','품번','샘플번호','카페24코드','바코드',
    '상품명(한글)','상품명(영문)','색상(한글)','색상(영문)','판매가','원가',
    '타입','백스타일','레그컷','가이드','원단타입','가슴선','비침','안감','캡고리',
    '소재','디자이너코멘트','세탁방법',
    '가슴(cm)','허리(cm)','엉덩이(cm)','모델착용사이즈',
    '제조년월','제조사','제조국','판매상태','생산상태',
    '대표이미지URL','이미지URL(합본)','이미지URL(자사몰)','이미지URL(느와)','이미지URL(외부몰)','이미지URL(디자인)','이미지URL(촬영)','영상URL',
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
  ws['!cols'] = [...baseCols, ..._platforms.map(() => ({wch:16})), {wch:12},{wch:12}]

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

function uploadProducts(raw) {
  // 양식 자동 감지: 1행 헤더에 '품번'이 인덱스 2 → 신규양식, 아니면 레거시
  const header0 = String(raw[0]?.[2] || '').trim()
  const isNew = (header0 === '품번')
  const COL = isNew ? UPLOAD_COL : _LEGACY_COL
  const dataStart = isNew ? 1 : 2

  // 신규양식: 헤더에서 쇼핑몰코드/등록일/최종입고일 동적 인덱스 탐색
  let mallColMap = {}, registDateCol = null, lastInDateCol = null
  if (isNew) {
    const hdr = raw[0] || []
    hdr.forEach((h, i) => {
      const s = String(h || '').trim()
      const m = s.match(/^쇼핑몰코드\((.+)\)$/)
      if (m) mallColMap[m[1]] = i
      if (s === '등록일') registDateCol = i
      if (s === '최종입고일') lastInDateCol = i
    })
  }

  const dataRows = raw.slice(dataStart).filter(r => String(r[COL.code] || '').trim())
  if (!dataRows.length) { showToast('데이터가 없습니다.', 'error'); return }

  let added = 0, updated = 0
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
      // 기존 품번 → 기본정보/이미지 업데이트, 재고·판매·이력 유지
      const existing = State.allProducts[idx]
      State.allProducts[idx] = { ...existing, ...product,
        no:         existing.no,
        stock:      existing.stock,
        stockLog:   existing.stockLog,
        sales:      existing.sales,
        revenueLog: existing.revenueLog,
        scheduleLog: existing.scheduleLog,
        productCodeLocked: existing.productCodeLocked,
        barcodes:   existing.barcodes
      }
      stampModified(State.allProducts[idx])
      updated++
    } else {
      stampCreated(product)
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
  showToast(`판매 업데이트: ${cnt}건`, 'success')
}
