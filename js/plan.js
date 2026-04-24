// =============================================
// ===== 신규기획 =====
// =============================================
let _planTempImages = [] // [{url, type:'url'|'file', name, path?, _file?, _pending?, _previewUrl?}]
let _planTempImagesToDelete = [] // Storage 경로 삭제 예약
let _planSelected = new Set()

// 신규기획 Firestore 주 저장소 + localStorage 캐시
async function savePlanItems() {
  // localStorage 캐시는 즉시 (동기)
  try { localStorage.setItem('lemango_plan_items_v1', JSON.stringify(State.planItems)) } catch (e) { console.warn('savePlanItems localStorage 실패:', e.message) }
  if (typeof _fsSync !== 'function') return
  try {
    await _fsSync('planItems', State.planItems)
  } catch (e) {
    if (typeof _onSaveFailed === 'function') _onSaveFailed('savePlanItems', e)
    else console.error('savePlanItems failed:', e)
  }
}

function loadPlanItems() {
  try {
    const raw = localStorage.getItem('lemango_plan_items_v1')
    if (raw) State.planItems = JSON.parse(raw) || []
  } catch (e) {
    console.warn('loadPlanItems 실패:', e.message)
    State.planItems = []
  }
}
window.savePlanItems = savePlanItems
window.loadPlanItems = loadPlanItems



function openPlanRegisterModal(item) {
  const modal = document.getElementById('planRegisterModal')
  // Populate schedule rows dynamically from plan phases
  const tbody = modal.querySelector('.plan-schedule-table tbody')
  if (tbody) {
    tbody.innerHTML = getPlanPhases().map(ph => `
      <tr>
        <td class="pst-label"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${ph.color || '#888'};margin-right:6px;vertical-align:middle"></span>${esc(ph.label)}</td>
        <td><input type="date" class="pst-date-input pl-sched-input" data-pkey="${esc(ph.key)}" data-ptype="start" /></td>
        <td><input type="date" class="pst-date-input pl-sched-input" data-pkey="${esc(ph.key)}" data-ptype="end" /></td>
      </tr>`).join('')
  }

  // 설정 기반 select 옵션 채우기 (_settings 기반)
  const fillSel = (id, list, withBlank = true) => {
    const el = document.getElementById(id)
    if (!el) return
    const opts = (list || []).map(v => {
      if (Array.isArray(v)) return `<option value="${v[0]}">${v[1] || v[0]}</option>`
      return `<option value="${v}">${v}</option>`
    }).join('')
    el.innerHTML = (withBlank ? '<option value="">선택</option>' : '') + opts
  }
  fillSel('plFabricType',   _settings?.fabricTypes)
  fillSel('plLegCut',       _settings?.legCuts)
  fillSel('plChestLine',    _settings?.chestLines)
  fillSel('plTransparency', _settings?.transparencies)
  fillSel('plLining',       _settings?.linings)
  fillSel('plCapRing',      _settings?.capRings)

  // 사이즈 규격 그리드 동적 생성 (XS~XXL × 가슴/허리/엉덩이)
  const specWrap = document.getElementById('plSizeSpecGrid')
  if (specWrap) {
    const existingSpec = (item && item.sizeSpec && typeof item.sizeSpec === 'object' && !Array.isArray(item.sizeSpec)) ? item.sizeSpec : {}
    specWrap.innerHTML = buildSizeSpecEdit(existingSpec)
  }

  // Init image sections
  _planTempImages = (item && Array.isArray(item.tempImages))
    ? item.tempImages.map(x => ({ ...x }))
    : []
  const tempSec = document.getElementById('planTempImageSection')
  if (tempSec) tempSec.innerHTML = buildPlanTempImageSection(item || {})
  const prodSec = document.getElementById('planProductImageSection')
  if (prodSec) prodSec.innerHTML = buildPlanProductImageSection(item || {})
  renderPlanTempImageGrid()

  modal.showModal()
  centerModal(modal)
  initPlPcodePanel()
}

function buildPlanTempImageSection(item) {
  return `
    <div class="rform-section">
      <div class="rform-section-title">
        참고 이미지
        <span class="plan-img-badge plan-img-badge-temp">임시</span>
      </div>
      <div class="plan-img-desc">샘플/참고용 임시 이미지. 상품확정 시 상품조회로 이전되어 확인 후 삭제할 수 있습니다.</div>
      <div class="plan-img-actions">
        <button type="button" class="plan-img-btn" onclick="addPlanTempImageUrl()">+ URL 추가</button>
        <label class="plan-img-btn plan-img-upload-label">
          + 파일 업로드
          <input type="file" accept="image/*" multiple style="display:none" onchange="handlePlanTempImageUpload(this)" />
        </label>
      </div>
      <div class="plan-img-grid" id="planTempImgGrid"></div>
    </div>
  `
}

function buildPlanProductImageSection(item) {
  const mainImg = (item && item.mainImage) ? String(item.mainImage).replace(/"/g,'&quot;') : ''
  const getArr = k => {
    const v = item?.images?.[k]
    if (Array.isArray(v)) return v.join('\n')
    return v || ''
  }
  return `
    <div class="rform-section">
      <div class="rform-section-title">
        상품 이미지
        <span class="plan-img-badge plan-img-badge-prod">상품</span>
      </div>
      <div class="plan-img-desc">실제 상품 이미지 URL. 상품조회 이전 후에도 유지됩니다.</div>
      <div class="rform-grid">
        <div class="rform-field" style="grid-column:span 2">
          <label>대표이미지 URL</label>
          <input type="text" id="npMainImage" placeholder="https://..." value="${mainImg}" />
        </div>
        <div class="rform-field" style="grid-column:span 2">
          <label>SUM (한 줄에 하나)</label>
          <textarea id="npImg_sum" rows="2" placeholder="https://...">${esc(getArr('sum'))}</textarea>
        </div>
        <div class="rform-field" style="grid-column:span 2">
          <label>자사몰 (lemango)</label>
          <textarea id="npImg_lemango" rows="2" placeholder="https://...">${esc(getArr('lemango'))}</textarea>
        </div>
        <div class="rform-field" style="grid-column:span 2">
          <label>느와 (noir)</label>
          <textarea id="npImg_noir" rows="2" placeholder="https://...">${esc(getArr('noir'))}</textarea>
        </div>
        <div class="rform-field" style="grid-column:span 2">
          <label>외부몰 (external)</label>
          <textarea id="npImg_external" rows="2" placeholder="https://...">${esc(getArr('external'))}</textarea>
        </div>
        <div class="rform-field" style="grid-column:span 2">
          <label>디자인 (design)</label>
          <textarea id="npImg_design" rows="2" placeholder="https://...">${esc(getArr('design'))}</textarea>
        </div>
        <div class="rform-field" style="grid-column:span 2">
          <label>촬영 (shoot)</label>
          <textarea id="npImg_shoot" rows="2" placeholder="https://...">${esc(getArr('shoot'))}</textarea>
        </div>
        <div class="rform-field" style="grid-column:span 2">
          <label>영상 URL</label>
          <input type="text" id="npVideoUrl" placeholder="https://..." value="${(item && item.videoUrl) ? String(item.videoUrl).replace(/"/g,'&quot;') : ''}" />
        </div>
      </div>
    </div>
  `
}

async function addPlanTempImageUrl() {
  const url = window.prompt('참고 이미지 URL을 입력하세요 (http/https)')
  if (!url) return
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) {
    showToast('http:// 또는 https:// 로 시작해야 합니다.', 'error')
    return
  }
  if (_planTempImages.some(i => i.url === trimmed)) {
    showToast('이미 추가된 URL입니다.', 'warning')
    return
  }
  _planTempImages.push({ url: trimmed, type: 'url', name: trimmed })
  renderPlanTempImageGrid()
}

function handlePlanTempImageUpload(input) {
  const files = Array.from(input.files || [])
  if (!files.length) return
  files.forEach(file => {
    if (file.size > 10 * 1024 * 1024) {
      showToast(`${file.name} — 10MB 초과`, 'warning')
      return
    }
    if (_planTempImages.some(i => i.type === 'file' && i.name === file.name && !i._pending)) return
    const previewUrl = URL.createObjectURL(file)
    _planTempImages.push({
      url: previewUrl, type: 'file', name: file.name,
      _file: file, _pending: true, _previewUrl: previewUrl
    })
  })
  renderPlanTempImageGrid()
  input.value = ''
}

function renderPlanTempImageGrid() {
  const grids = document.querySelectorAll('#planTempImgGrid')
  if (!grids.length) return
  let html
  if (!_planTempImages.length) {
    html = '<div style="color:var(--text-muted);font-size:12px;padding:8px">참고 이미지 없음</div>'
  } else {
    html = _planTempImages.map((img, i) => {
      const nameDisp = (img.name || '').length > 16 ? img.name.slice(0, 14) + '..' : (img.name || '')
      const safeUrl = String(img.url).replace(/"/g, '&quot;')
      const tagText = img._pending ? '대기' : '임시'
      return `<div class="plan-img-thumb plan-img-thumb-temp">
        <span class="plan-img-thumb-tag-temp">${tagText}</span>
        <img src="${safeUrl}" onerror="this.onerror=null;this.src=PLACEHOLDER_IMG" onclick="window.open('${safeUrl.replace(/'/g,"\\'")}','_blank')" />
        <div class="plan-img-thumb-name">${esc(nameDisp)}</div>
        <button type="button" class="plan-img-thumb-x temp-del-btn" onclick="removePlanTempImage(${i})">✕</button>
      </div>`
    }).join('')
  }
  grids.forEach(g => { g.innerHTML = html })
}

function removePlanTempImage(idx) {
  const entry = _planTempImages[idx]
  if (!entry) return
  // 업로드 완료된 Storage 파일은 삭제 예약
  if (entry.path && !entry._pending) {
    _planTempImagesToDelete.push(entry.path)
  }
  // 아직 업로드 안 된 대기 파일의 미리보기 URL 해제
  if (entry._previewUrl) {
    try { URL.revokeObjectURL(entry._previewUrl) } catch(e) {}
  }
  _planTempImages.splice(idx, 1)
  renderPlanTempImageGrid()
}

// 대기 파일을 Storage에 업로드 → _planTempImages 교체
async function _uploadPendingPlanTempImages(planNo) {
  const pendings = _planTempImages.filter(i => i._pending && i._file)
  if (!pendings.length) return
  const folder = planNo ? `plan/${planNo}` : `plan/tmp_${Date.now()}`
  for (const entry of pendings) {
    const safeName = entry.name.replace(/[^\w.\-]/g, '_')
    const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2,6)}_${safeName}`
    try {
      const ref = storage.ref().child(path)
      const snap = await ref.put(entry._file)
      const url = await snap.ref.getDownloadURL()
      // 대기 항목 내부 값을 업로드 결과로 교체
      if (entry._previewUrl) { try { URL.revokeObjectURL(entry._previewUrl) } catch(e) {} }
      entry.url = url
      entry.path = path
      delete entry._file
      delete entry._pending
      delete entry._previewUrl
    } catch (e) {
      console.error('Storage 업로드 실패:', entry.name, e.message)
      throw e
    }
  }
}

// 예약된 Storage 경로 삭제
async function _flushPlanStorageDeletions() {
  if (!_planTempImagesToDelete.length) return
  for (const p of _planTempImagesToDelete) {
    try { await storage.ref().child(p).delete() }
    catch (e) { console.warn('Storage 삭제 실패:', p, e.message) }
  }
  _planTempImagesToDelete = []
}

function getPlanThumbUrl(item) {
  if (item?.mainImage) return item.mainImage
  if (item?.tempImages && item.tempImages.length) return item.tempImages[0].url
  if (item?.images?.sum?.length) return item.images.sum[0]
  if (item?.images?.lemango?.length) return item.images.lemango[0]
  return 'assets/logo-placeholder.png'
}

window.addPlanTempImageUrl = addPlanTempImageUrl
window.handlePlanTempImageUpload = handlePlanTempImageUpload
window.renderPlanTempImageGrid = renderPlanTempImageGrid
window.removePlanTempImage = removePlanTempImage
window.getPlanThumbUrl = getPlanThumbUrl

function closePlanRegisterModal(force) {
  const modal = document.getElementById('planRegisterModal')
  const doClose = () => {
    const code = document.getElementById('plProductCode')?.value
    if (code) _reservedCodes.delete(code)
    modal.close()
    document.getElementById('planRegisterForm').reset()
    // 미리보기 URL 정리 (대기 중이던 파일들)
    _planTempImages.forEach(i => {
      if (i._previewUrl) { try { URL.revokeObjectURL(i._previewUrl) } catch(e) {} }
    })
    _planTempImages = []
    _planTempImagesToDelete = []
    const ts = document.getElementById('planTempImageSection')
    if (ts) ts.innerHTML = ''
    const ps = document.getElementById('planProductImageSection')
    if (ps) ps.innerHTML = ''
  }
  if (force) { doClose(); return }
  const isEditing = () => {
    const form = document.getElementById('planRegisterForm')
    if (!form) return false
    return Array.from(form.querySelectorAll('input, textarea, select')).some(el => {
      if (el.type === 'checkbox' || el.type === 'radio') return el.checked
      if (el.tagName === 'SELECT') return el.selectedIndex > 0
      return (el.value || '').trim() !== ''
    })
  }
  if (typeof safeCloseModal === 'function') safeCloseModal(modal, isEditing, doClose)
  else doClose()
}

async function submitPlanRegister(e) {
  e.preventDefault()
  const sampleNo = document.getElementById('plSampleNo').value.trim()
  if (!sampleNo) { showToast('샘플번호는 필수입니다.', 'error'); return }

  // 신규 planNo 예약
  const newPlanNo = State.planItems.length + 1

  // 대기 중 파일 Storage 업로드
  const pendingCount = _planTempImages.filter(i => i._pending && i._file).length
  if (pendingCount) {
    showToast(`참고 이미지 업로드 중... (${pendingCount}개)`, 'info')
    try { await _uploadPendingPlanTempImages(newPlanNo) }
    catch (err) { showToast('이미지 업로드 실패: ' + err.message, 'error'); return }
  }

  // Image collection — separate temp (reference) vs product images
  const splitLines = (id) => (document.getElementById(id)?.value || '')
    .split(/[\n\r]+/).map(s => s.trim()).filter(Boolean)
  const mainImageUrl = (document.getElementById('npMainImage')?.value || '').trim()
  const prodImages = {
    sum:      splitLines('npImg_sum'),
    lemango:  splitLines('npImg_lemango'),
    noir:     splitLines('npImg_noir'),
    external: splitLines('npImg_external'),
    design:   splitLines('npImg_design').join('\n'),
    shoot:    splitLines('npImg_shoot').join('\n')
  }
  // 저장용 정리 (내부 플래그 제거)
  const tempImagesSnap = _planTempImages.map(x => {
    const { _file, _pending, _previewUrl, ...rest } = x
    return rest
  })

  // sizeSpec 수집 (XS~XXL × bust/waist/hip 구조)
  const _plRegModal = document.getElementById('planRegisterModal')
  const sizeSpec = collectSizeSpec(_plRegModal)

  const val = (id) => document.getElementById(id)?.value.trim() || ''
  const item = {
    no:          newPlanNo,
    sampleNo,
    productCode: document.getElementById('plProductCode').value.trim() || '',
    brand:       document.getElementById('plBrand').value,
    nameKr:      val('plNameKr'),
    nameEn:      val('plNameEn'),
    colorKr:     val('plColorKr'),
    colorEn:     val('plColorEn'),
    salePrice:   Number(document.getElementById('plSalePrice').value) || 0,
    costPrice:   Number(document.getElementById('plCostPrice').value) || 0,
    type:        document.getElementById('plType').value,
    year:        document.getElementById('plYear').value,
    season:      document.getElementById('plSeason').value,
    gender:      document.getElementById('plGender').value,
    // 디자인 속성
    fabricType:   val('plFabricType'),
    backStyle:    val('plBackStyle'),
    legCut:       val('plLegCut'),
    guide:        val('plGuide'),
    chestLine:    val('plChestLine'),
    transparency: val('plTransparency'),
    lining:       val('plLining'),
    capRing:      val('plCapRing'),
    // 소재
    material:    val('plMaterial'),
    comment:     val('plComment'),
    washMethod:  val('plWashMethod'),
    // 사이즈 규격
    sizeSpec,
    modelSize:   val('plModelSize'),
    // 제조 정보
    madeMonth:   val('plMadeMonth'),
    madeBy:      val('plMadeBy'),
    madeIn:      val('plMadeIn'),
    // 메모
    memo:        val('plMemo'),
    // 이미지
    mainImage:   mainImageUrl,
    tempImages:  tempImagesSnap,
    videoUrl:    (document.getElementById('npVideoUrl')?.value || '').trim(),
    images:      prodImages,
    schedule: (() => {
      const sch = {}
      document.querySelectorAll('#planRegisterModal .pl-sched-input').forEach(el => {
        const k = el.dataset.pkey
        if (!sch[k]) sch[k] = { start: '', end: '' }
        sch[k][el.dataset.ptype] = el.value || ''
      })
      return sch
    })()
  }
  if (item.productCode) _reservedCodes.delete(item.productCode)
  stampCreated(item)
  State.planItems.push(item)
  State.plan.filtered = State.planItems.filter(p => !p.confirmed)
  savePlanItems().catch(e => console.error(e))
  _planTempImages = []
  renderPlanTable()
  closePlanRegisterModal(true)
  showToast(`"${sampleNo}" 기획 등록 완료`, 'success')
  logActivity('create', '신규기획', `기획등록: ${sampleNo}`)
}

// ===== 신규기획 품번 자동생성 =====
function togglePlPcodePanel() {
  const panel = document.getElementById('plPcodePanel')
  const btn   = document.getElementById('plPcodeToggleBtn')
  const open  = panel.style.display === 'none' || panel.style.display === ''
  panel.style.display = open ? 'block' : 'none'
  btn.textContent = open ? '자동생성 ▴' : '자동생성 ▾'
  if (open) initPlPcodePanel()
}

function initPlPcodePanel() {
  if (!document.getElementById('plPcDesign')) return
  renderPlDesignList('')
  selectPlDesign('1626')
  renderPlBackStyleList('')
  document.getElementById('plPcPreview').textContent = '-'
  document.getElementById('plPcSeqDisplay').textContent = '-'
  const applyBtn = document.getElementById('plPcApplyBtn')
  if (applyBtn) applyBtn.disabled = true
}

function renderPlBackStyleList(query) {
  const q = (query || '').toLowerCase().trim()
  const list = q
    ? _designCodes.filter(([c,e,k]) => c.includes(q) || e.toLowerCase().includes(q) || k.toLowerCase().includes(q))
    : _designCodes
  const current = document.getElementById('plPcBackStyle')?.value
  const dd = document.getElementById('plBsDropdown')
  if (!dd) return
  dd.innerHTML = list.map(([c,e,k]) =>
    `<div class="design-listitem${current===c?' selected':''}" onclick="selectPlBackStyle('${c}')">[${c}] ${e} / ${k}</div>`
  ).join('') || '<div class="design-no-result">없음</div>'
}

function filterPlBackStyleList() {
  renderPlBackStyleList(document.getElementById('plPcBsSearch')?.value || '')
}

function selectPlBackStyle(code) {
  const found = _designCodes.find(([c]) => c === code)
  if (!found) return
  document.getElementById('plPcBackStyle').value = code
  document.getElementById('plPcBsSearch').value = ''
  document.getElementById('plPcBsSearch').placeholder = `${code} - ${found[1]} (${found[2]})`
  renderPlBackStyleList('')
}

function showPlBsForm(mode) {
  const form = document.getElementById('plBsForm')
  if (!form) return
  if (mode === 'edit') {
    const cur = document.getElementById('plPcBackStyle')?.value
    if (!cur) { showToast('수정할 백스타일을 선택하세요.', 'warning'); return }
    const entry = _designCodes.find(([c]) => c === cur)
    if (entry) {
      document.getElementById('plBsFormCode').value = entry[0]
      document.getElementById('plBsFormEn').value   = entry[1]
      document.getElementById('plBsFormKr').value   = entry[2]
    }
  } else {
    document.getElementById('plBsFormCode').value = ''
    document.getElementById('plBsFormEn').value   = ''
    document.getElementById('plBsFormKr').value   = ''
  }
  form.dataset.mode = mode
  form.style.display = 'flex'
}

function confirmPlBsForm() {
  const form = document.getElementById('plBsForm')
  const mode = form?.dataset.mode
  const code = document.getElementById('plBsFormCode')?.value.trim()
  const en   = document.getElementById('plBsFormEn')?.value.trim()
  const kr   = document.getElementById('plBsFormKr')?.value.trim()
  if (!code || !en || !kr) { showToast('코드, 영문, 한글 모두 입력해주세요.', 'warning'); return }
  if (mode === 'add') {
    if (_designCodes.find(([c]) => c === code)) { showToast('이미 존재하는 코드입니다.', 'error'); return }
    _designCodes.push([code, en, kr])
  } else {
    const idx = _designCodes.findIndex(([c]) => c === code)
    if (idx !== -1) _designCodes[idx] = [code, en, kr]; else _designCodes.push([code, en, kr])
  }
  saveDesignCodes()
  renderPlBackStyleList('')
  document.getElementById('plPcBackStyle').value = code
  if (form) form.style.display = 'none'
}

function renderPlDesignList(query) {
  const q = (query || '').toLowerCase().trim()
  const list = q
    ? _designCodes.filter(([c,e,k]) => c.includes(q) || e.toLowerCase().includes(q) || k.toLowerCase().includes(q))
    : _designCodes
  const current = document.getElementById('plPcDesign')?.value
  const dd = document.getElementById('plDesignDropdown')
  if (!dd) return
  dd.innerHTML = list.map(([c,e,k]) =>
    `<div class="design-option${current===c?' selected':''}" onclick="selectPlDesign('${c}')">
      <span class="design-code">${c}</span>
      <span class="design-names"><span class="design-en">${e}</span><span class="design-kr">${k}</span></span>
    </div>`
  ).join('') || '<div class="design-no-result">검색 결과 없음</div>'
  const sel = dd.querySelector('.design-option.selected')
  if (sel) sel.scrollIntoView({ block: 'nearest' })
}

function filterPlDesignList() {
  renderPlDesignList(document.getElementById('plPcDesignSearch')?.value || '')
}

function selectPlDesign(code) {
  const found = _designCodes.find(([c]) => c === code)
  if (!found) return
  document.getElementById('plPcDesign').value = code
  document.getElementById('plPcDesignSearch').value = ''
  document.getElementById('plPcDesignSearch').placeholder = `${code} - ${found[1]} (${found[2]})`
  renderPlDesignList('')
}

function updatePlProductCode() {
  const cls       = document.getElementById('plPcClass')?.value
  const gen       = document.getElementById('plPcGender')?.value
  const typ       = document.getElementById('plPcType')?.value
  const des       = document.getElementById('plPcDesign')?.value
  const year      = document.getElementById('plPcYear')?.value
  const seasonNum = document.getElementById('plPcSeasonNum')?.value
  if (!cls || !des) return

  const prefix = cls + gen + typ + des + year + seasonNum
  const usedNums = new Set(
    [...State.allProducts, ...State.planItems]
      .map(p => p.productCode)
      .filter(c => c && c.slice(0, 12) === prefix)
      .map(c => c.slice(12))
  )
  _reservedCodes.forEach(c => { if (c.slice(0,12) === prefix) usedNums.add(c.slice(12)) })

  let nextNum = null
  for (let i = 0; i <= 99; i++) {
    const n = String(i).padStart(2,'0')
    if (!usedNums.has(n)) { nextNum = n; break }
  }

  const seqDisplay = document.getElementById('plPcSeqDisplay')
  const applyBtn   = document.getElementById('plPcApplyBtn')
  if (nextNum === null) {
    seqDisplay.textContent = '만료'
    document.getElementById('plPcPreview').textContent = '사용 가능한 번호 없음'
    if (applyBtn) applyBtn.disabled = true
  } else {
    seqDisplay.textContent = nextNum
    document.getElementById('plPcPreview').textContent = prefix + nextNum
    if (applyBtn) applyBtn.disabled = false
  }
}

function applyPlGeneratedCode() {
  const code = document.getElementById('plPcPreview').textContent
  if (!code || code === '-' || code === '사용 가능한 번호 없음') return

  if (State.allProducts.some(p => p.productCode === code) ||
      State.planItems.some(p => p.productCode === code) ||
      _reservedCodes.has(code)) {
    showToast(`품번 "${code}"은 이미 사용 중입니다.`, 'error')
    updatePlProductCode()
    return
  }
  _reservedCodes.add(code)
  document.getElementById('plProductCode').value = code
  document.getElementById('plPcodePanel').style.display = 'none'
  document.getElementById('plPcodeToggleBtn').textContent = '자동생성 ▾'

  const cls = document.getElementById('plPcClass')?.value || ''
  const typ = document.getElementById('plPcType')?.value || ''
  document.getElementById('plBrand').value = cls.startsWith('N') ? '르망고 느와' : '르망고'

  const typeEl = document.getElementById('plType')
  if (typeEl) {
    const typeMap = { ON: 'onepiece', MO: 'onepiece', BK: 'bikini', BR: 'bikini' }
    const mapped = typeMap[typ]
    if (mapped) typeEl.value = mapped
  }

  const yearMap = {'1':'2021','2':'2022','3':'2023','4':'2024','5':'2025','6':'2026','7':'2027','8':'2028','9':'2029','0':'2030'}
  const yearVal = document.getElementById('plPcYear')?.value
  const yearEl = document.getElementById('plYear')
  if (yearEl && yearVal) yearEl.value = yearMap[yearVal] || yearVal
  const seasonEl = document.getElementById('plSeason')
  if (seasonEl) seasonEl.value = document.getElementById('plPcSeasonNum')?.value || ''
  const genderEl = document.getElementById('plGender')
  if (genderEl) genderEl.value = document.getElementById('plPcGender')?.value || ''

  showToast(`품번 ${code} 적용됨`, 'success')
}


function searchPlan() {
  const raw    = document.getElementById('npKeyword').value
  const keywords = parseKeywords(raw)
  const field     = document.getElementById('npSearchField').value
  const brand     = document.getElementById('npBrand').value
  const type      = document.getElementById('npType').value
  const year      = document.getElementById('npYear').value
  const season    = document.getElementById('npSeason').value
  const gender    = document.getElementById('npGenderFilter').value
  const confirmed = document.getElementById('npConfirmed')?.value || 'pending'
  const phase     = document.getElementById('npPhase')?.value || 'all'
  const dateFrom  = document.getElementById('npDateFrom')?.value || ''
  const dateTo    = document.getElementById('npDateTo')?.value || ''

  let result = State.planItems.filter(p => {
    // 이전 상태 필터 (기본: 미이전만 표시)
    if (confirmed === 'pending'   &&  p.confirmed) return false
    if (confirmed === 'confirmed' && !p.confirmed) return false

    if (keywords.length) {
      const getTargets = () => {
        if (field === 'nameKr')      return [p.nameKr, p.nameEn]
        if (field === 'productCode') return [p.productCode, p.sampleNo]
        return [p.nameKr, p.nameEn, p.productCode, p.sampleNo, p.colorKr, p.memo]
      }
      const targets = getTargets()
      if (!keywords.some(kw => matchAnyTarget(targets, kw))) return false
    }
    if (brand  !== 'all' && p.brand  !== brand)       return false
    if (type   !== 'all' && p.type   !== type)         return false
    if (year   !== 'all' && p.year   !== year)         return false
    if (season !== 'all' && String(p.season) !== season) return false
    if (gender !== 'all' && p.gender !== gender)       return false

    // 일정 단계 + 날짜 필터
    if (phase !== 'all' || dateFrom || dateTo) {
      if (!p.schedule) return false
      const phases = phase === 'all' ? SCHEDULE_DEFS.map(d => d.key) : [phase]
      const matched = phases.some(pk => {
        const ph = p.schedule[pk]
        if (!ph || !ph.start || !ph.end) return false
        if (dateFrom && ph.end < dateFrom) return false
        if (dateTo   && ph.start > dateTo) return false
        return true
      })
      if (!matched) return false
    }

    return true
  })
  State.plan.page = 1
  State.plan.filtered = result
  saveFilterDefault('plan', {
    npKeyword: raw, npSearchField: field, npBrand: brand, npType: type, npYear: year,
    npSeason: season, npGenderFilter: gender, npConfirmed: confirmed, npPhase: phase,
    npDateFrom: dateFrom, npDateTo: dateTo
  })
  renderPlanTable()
}

function changePlanPageSize(val) {
  State.plan.pageSize = parseInt(val) || 0
  State.plan.page = 1
  saveTableCustom('plan')
  renderPlanTable()
}

function resetPlan() {
  document.getElementById('npKeyword').value = ''
  document.getElementById('npSearchField').value = 'all'
  document.getElementById('npBrand').value = 'all'
  document.getElementById('npType').value = 'all'
  document.getElementById('npYear').value = 'all'
  document.getElementById('npSeason').value = 'all'
  document.getElementById('npGenderFilter').value = 'all'
  const confirmedEl = document.getElementById('npConfirmed')
  if (confirmedEl) confirmedEl.value = 'pending'
  document.getElementById('npPhase').value = 'all'
  document.getElementById('npDateFrom').value = ''
  document.getElementById('npDateTo').value = ''
  document.getElementById('npPageSize').value = '10'
  State.plan.pageSize = 10
  State.plan.page = 1
  State.plan.columnFilters = {}
  State.plan.activeColumns = null
  State.plan.inactiveColumns = []
  State.plan.filtered = State.planItems.filter(p => !p.confirmed)
  _planSelected.clear()
  closeBulkScheduleModal(true)
  renderPlanTable()
}

// 신규기획 컬럼 정의 — regular(rowspan=2) + schedule group(colspan=2)
const PLAN_REGULAR_COLS = [
  { key:'no',         label:'No.',    fixed:false, thAttr:'data-key="no" data-no-filter style="width:45px;text-align:center"',
    td: p=>`<td style="text-align:center">${p.no}${p.confirmed?'<br><span style="font-size:9px;background:var(--success);color:#fff;padding:1px 5px;border-radius:8px">이전됨</span>':''}</td>` },
  { key:'_image',     label:'이미지', fixed:false, thAttr:'data-no-sort data-no-filter style="width:60px"',
    td: p=>{
      const url = getPlanThumbUrl(p)
      const isTemp = !p.mainImage && !(p.images?.sum?.length) && !(p.images?.lemango?.length) && !(p.images?.noir?.length) && p.tempImages && p.tempImages.length
      const cls = isTemp ? 'plan-table-thumb plan-table-thumb-temp' : 'plan-table-thumb'
      const tag = isTemp ? '<span class="plan-table-thumb-tag">임시</span>' : ''
      return `<td><div class="${cls}"><img src="${url}" onerror="this.onerror=null;this.src=PLACEHOLDER_IMG" />${tag}</div></td>`
    } },
  { key:'sampleNo',   label:'샘플번호',fixed:false, thAttr:'data-key="sampleNo"',
    td: p=>`<td><span class="code-link" onclick="openPlanDetailModal(${p.no})">${p.sampleNo}</span></td>` },
  { key:'productCode',label:'품번',   fixed:true,  thAttr:'data-key="productCode" style="width:145px"',
    td: p=>`<td>${p.productCode?`<span class="code-link" onclick="openDetailModal('${p.productCode}')">${p.productCode}</span>`:`<span style="color:var(--text-muted);font-size:12px">-</span>`}</td>` },
  { key:'brand',      label:'브랜드', fixed:false, thAttr:'data-key="brand"',
    td: p=>`<td style="font-size:12px">${p.brand||'-'}</td>` },
  { key:'nameKr',     label:'상품명', fixed:false, thAttr:'data-key="nameKr"',
    td: p=>`<td data-editable="nameKr" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.nameKr||''}">${p.nameKr||'-'}</td>` },
  { key:'colorKr',    label:'색상',   fixed:false, thAttr:'data-key="colorKr"',
    td: p=>`<td style="font-size:12px">${p.colorKr||'-'}</td>` },
  { key:'type',       label:'타입',   fixed:false, thAttr:'data-key="type"',
    td: p=>`<td data-editable="type">${typeBadge(p.type)}</td>` },
  { key:'salePrice',  label:'판매가', fixed:false, thAttr:'data-key="salePrice" style="text-align:right"',
    td: p=>`<td data-editable="salePrice" style="text-align:right"><span class="price">${fmtPrice(p.salePrice)}</span></td>` },
]
function _getPlanScheduleCols() {
  return getPlanPhases().map(s => ({
    key: `schedule_${s.key}`, label: s.label, fixed:false, isSchedule:true, scheduleKey: s.key,
    thAttr: `class="schedule-group-th"`,
  }))
}
function _getPlanAllCols() { return [...PLAN_REGULAR_COLS, ..._getPlanScheduleCols()] }
function _getPlanFixedKeys() { return _getPlanAllCols().filter(c=>c.fixed).map(c=>c.key) }

function renderPlanTable() {
  const _favArea = document.getElementById('planFavArea')
  if (_favArea && typeof renderFavoritesBar === 'function') _favArea.innerHTML = renderFavoritesBar('plan')
  const PLAN_ALL_COLS = _getPlanAllCols()
  const PLAN_SCHEDULE_COLS = _getPlanScheduleCols()
  const PLAN_FIXED_KEYS = _getPlanFixedKeys()
  const allKeys = PLAN_ALL_COLS.map(c=>c.key)
  initColumnState('plan', allKeys)
  applyTableCustom('plan')
  allKeys.forEach(k => {
    if (!State.plan.activeColumns.includes(k) && !State.plan.inactiveColumns.includes(k)) State.plan.activeColumns.push(k)
  })
  State.plan.activeColumns = State.plan.activeColumns.filter(k => allKeys.includes(k))
  State.plan.inactiveColumns = State.plan.inactiveColumns.filter(k => allKeys.includes(k))
  renderColInactiveArea('npInactiveArea','npInactiveTags','plan',PLAN_ALL_COLS,PLAN_FIXED_KEYS,'renderPlanTable')

  const data = applyColFilters(State.plan.filtered, State.plan.columnFilters)
  const page = State.plan.page || 1
  const ps = getPageSize('plan')
  const pageData = ps === 0 ? data : data.slice((page-1)*ps, page*ps)
  document.getElementById('npTableMeta').textContent = `검색결과 ${data.length}건`

  if (!data.length) {
    document.getElementById('npTableWrap').innerHTML = `<div class="empty-state"><p>등록된 기획 상품이 없습니다. <strong>신규기획 등록</strong> 버튼을 눌러 추가하세요.</p></div>`
    document.getElementById('npPagination').innerHTML = ''
    return
  }

  const fmtD = d => d ? d.replace(/^\d{4}-(\d{2})-(\d{2})$/, '$1/$2') : '-'
  const activeKeys = State.plan.activeColumns
  const activeRegular  = PLAN_REGULAR_COLS.filter(c => activeKeys.includes(c.key))
  const activeSchedule = PLAN_SCHEDULE_COLS.filter(c => activeKeys.includes(c.key))

  // 1행: checkbox + regular cols (rowspan=2) + active schedule groups (colspan=2)
  const row1 = [
    `<th rowspan="2" style="width:70px" data-no-sort data-no-filter><label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;white-space:nowrap"><input type="checkbox" id="npCheckAll" onchange="togglePlanCheckAll(this.checked)">전체선택</label></th>`,
    ...activeRegular.map(c => `<th rowspan="2" ${c.thAttr} data-col-key="${c.key}">${c.label}</th>`),
    ...activeSchedule.map(c => `<th colspan="2" ${c.thAttr} data-col-key="${c.key}">${c.label}</th>`)
  ].join('')

  // 2행: schedule sub-headers only
  const row2 = activeSchedule.map(c =>
    `<th class="schedule-sub-th" data-key="schedule.${c.scheduleKey}.start">시작일</th>` +
    `<th class="schedule-sub-th" data-key="schedule.${c.scheduleKey}.end">완료예정일</th>`
  ).join('')

  const _today = new Date().toISOString().slice(0, 10)
  const tbodyHtml = pageData.map(p => {
    const isChecked = _planSelected.has(p.no)
    const regTds = activeRegular.map(c => c.td(p)).join('')
    const schTds = activeSchedule.map(c => {
      const sch = p.schedule?.[c.scheduleKey] || {}
      let cellCls = 'schedule-date-cell'
      if (sch.start) cellCls += ' has-date'
      // 지연 표시: 완료일이 오늘 이전이고 미이전 상품
      let delayBadge = ''
      if (!p.confirmed && sch.end && sch.end < _today) {
        cellCls += ' schedule-overdue'
        const daysLate = Math.ceil((new Date(_today) - new Date(sch.end)) / 86400000)
        delayBadge = `<span class="plan-delay-badge">+${daysLate}일</span>`
      } else if (!p.confirmed && sch.end && sch.end === _today) {
        cellCls += ' schedule-today'
      }
      return `<td class="${cellCls}">${fmtD(sch.start)}</td>` +
             `<td class="${cellCls}">${fmtD(sch.end)}${delayBadge}</td>`
    }).join('')
    const cls = [isChecked ? 'np-selected' : '', p.confirmed ? '' : ''].filter(Boolean).join(' ')
    return `<tr class="${cls}" data-no="${p.no}"${p.confirmed?' style="opacity:0.6"':''}><td><input type="checkbox" class="np-check" data-no="${p.no}" ${isChecked?'checked':''} onchange="updatePlanSelection()"></td>${regTds}${schTds}</tr>`
  }).join('')

  document.getElementById('npTableWrap').innerHTML = `
    <table class="data-table plan-table" id="planTable">
      <thead>
        <tr>${row1}</tr>
        ${row2 ? `<tr>${row2}</tr>` : ''}
      </thead>
      <tbody>${tbodyHtml}</tbody>
    </table>`

  renderPlanToolbar()
  updateCheckAllState()

  initTableFeatures('planTable', 'plan', 'renderPlanTable')
  // fixStickySubRow 불필요 — .plan-table thead { position: sticky } CSS로 처리
  bindColumnDragDrop('planTable', 'plan', PLAN_FIXED_KEYS, 'renderPlanTable')
  applyColWidthsToHeader('planTable', 'plan')
  renderPagination('npPagination', 'plan', 'renderPlanTable')
  // Feature 5: row drag sort
  initPlanDragSort()
  // Feature 6: inline edit
  initInlineEdit('planTable', 'plan')
  // Feature 12: row double-click → detail
  initRowDblClick('planTable', (tr) => {
    const no = Number(tr.getAttribute('data-no'))
    if (!Number.isNaN(no)) openPlanDetailModal(no)
  })
}

// ===== Feature 5: Plan row drag sort =====
function initPlanDragSort() {
  const table = document.getElementById('planTable')
  if (!table) return
  const tbody = table.querySelector('tbody')
  if (!tbody) return
  const rows = Array.from(tbody.querySelectorAll('tr'))
  rows.forEach(tr => {
    // skip rows with no data-no
    if (!tr.hasAttribute('data-no')) {
      // find first np-check checkbox for data-no fallback
      const chk = tr.querySelector('.np-check')
      if (chk) tr.setAttribute('data-no', chk.getAttribute('data-no'))
    }
    tr.setAttribute('draggable', 'true')
    tr.addEventListener('dragstart', _planDragStart)
    tr.addEventListener('dragover', _planDragOver)
    tr.addEventListener('dragleave', _planDragLeave)
    tr.addEventListener('drop', _planDrop)
    tr.addEventListener('dragend', _planDragEnd)
  })
}
let _planDragSrcNo = null
function _planDragStart(e) {
  // don't start drag when starting from an input/checkbox
  const tag = (e.target.tagName || '').toLowerCase()
  if (['input','select','textarea','button','label'].includes(tag)) { e.preventDefault(); return }
  _planDragSrcNo = Number(this.getAttribute('data-no'))
  this.classList.add('drag-row')
  try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(_planDragSrcNo)) } catch(_){}
}
function _planDragOver(e) {
  e.preventDefault()
  try { e.dataTransfer.dropEffect = 'move' } catch(_){}
  this.classList.add('drag-over')
}
function _planDragLeave() { this.classList.remove('drag-over') }
function _planDrop(e) {
  e.preventDefault()
  this.classList.remove('drag-over')
  const targetNo = Number(this.getAttribute('data-no'))
  if (_planDragSrcNo == null || targetNo === _planDragSrcNo) return
  const arr = State.planItems
  const from = arr.findIndex(x => x.no === _planDragSrcNo)
  const to   = arr.findIndex(x => x.no === targetNo)
  if (from < 0 || to < 0) return
  const [moved] = arr.splice(from, 1)
  arr.splice(to, 0, moved)
  // reflect in filtered order too
  if (State.plan && Array.isArray(State.plan.filtered)) {
    const fFrom = State.plan.filtered.findIndex(x => x.no === _planDragSrcNo)
    const fTo   = State.plan.filtered.findIndex(x => x.no === targetNo)
    if (fFrom >= 0 && fTo >= 0) {
      const [m2] = State.plan.filtered.splice(fFrom, 1)
      State.plan.filtered.splice(fTo, 0, m2)
    }
  }
  savePlanItems().catch(e => console.error(e))
  if (typeof showToast === 'function') showToast('기획 순서가 변경되었습니다')
  renderPlanTable()
}
function _planDragEnd() {
  this.classList.remove('drag-row')
  document.querySelectorAll('#planTable tr.drag-over').forEach(tr => tr.classList.remove('drag-over'))
  _planDragSrcNo = null
}
window.initPlanDragSort = initPlanDragSort

// ===== 신규기획 상세 모달 =====
let _editingPlanNo = null

async function openPlanDetailModal(no) {
  const item = State.planItems.find(p => p.no === no)
  if (!item) return
  _editingPlanNo = no
  _planTempImages = Array.isArray(item.tempImages) ? item.tempImages.map(x => ({ ...x })) : []
  if ((!window._allUsers || window._allUsers.length === 0) && typeof loadAllUsers === 'function') {
    try { await loadAllUsers() } catch(e) {}
  }
  buildPlanDetailContent(item)
  renderPlanTempImageGrid()
  // 뷰 모드로 초기화
  const modal = document.getElementById('planDetailModal')
  modal.classList.remove('edit-mode')
  _pdUpdateHeaderBtns('view')
  const confirmBtn = document.getElementById('pdConfirmBtn')
  if (confirmBtn && item.confirmed) confirmBtn.style.display = 'none'
  modal.showModal()
  centerModal(modal)
  _pdSyncWatchBtn()
  _pdSyncLockWarn()
  loadComments('plan', no)
  if (typeof pushModalHistory === 'function') pushModalHistory('plan', no)
  const favBtn = document.getElementById('pdFavBtn')
  if (favBtn) {
    const on = typeof isFavorite === 'function' && isFavorite('plan', no)
    favBtn.textContent = on ? '★' : '☆'
    favBtn.classList.toggle('fav-on', on)
  }
}

function closePlanDetailModal(force) {
  const modal = document.getElementById('planDetailModal')
  const doClose = () => {
    if (modal.classList.contains('edit-mode')) modal.classList.remove('edit-mode')
    if (_pdPendingCode) {
      const currentItem = State.planItems.find(p => p.no === _editingPlanNo)
      if (!currentItem || currentItem.productCode !== _pdPendingCode) {
        _reservedCodes.delete(_pdPendingCode)
      }
      _pdPendingCode = null
    }
    // 대기 중이던 미리보기 URL 정리
    _planTempImages.forEach(i => {
      if (i._previewUrl) { try { URL.revokeObjectURL(i._previewUrl) } catch(e) {} }
    })
    _planTempImages = []
    // 편집 취소 시 삭제 예약 무시 (실제 삭제 안 함)
    _planTempImagesToDelete = []
    try { if (typeof releaseEditLock === 'function') releaseEditLock('plan', _editingPlanNo) } catch(e) {}
    modal.close()
  }
  if (force) { doClose(); return }
  safeCloseModal(modal, () => modal.classList.contains('edit-mode'), doClose)
}

async function clonePlanItem(no) {
  const original = State.planItems.find(item => item.no === no)
  if (!original) return
  const ok = await korConfirm('이 기획 상품을 복제하시겠습니까?\n동일한 정보로 새 기획이 생성됩니다.', '복제', '취소')
  if (!ok) return
  const cloned = JSON.parse(JSON.stringify(original))
  const maxNo = State.planItems.reduce((max, item) => Math.max(max, item.no || 0), 0)
  cloned.no = maxNo + 1
  if (cloned.sampleNo) cloned.sampleNo = cloned.sampleNo + '_copy'
  cloned.productCode = ''
  cloned.confirmed = false
  cloned.confirmedAt = ''
  if (typeof stampCreated === 'function') stampCreated(cloned)
  State.planItems.push(cloned)
  savePlanItems().catch(e => console.error(e))
  closePlanDetailModal(true)
  if (typeof renderPlanTable === 'function') renderPlanTable()
  setTimeout(() => { openPlanDetailModal(cloned.no) }, 300)
  showToast('기획 상품이 복제되었습니다.')
  if (typeof logActivity === 'function') logActivity('create', '신규기획', '기획 복제 — ' + (original.sampleNo || original.productCode || 'NO.' + original.no))
}
window.clonePlanItem = clonePlanItem

// ===== 기획 상세 모달 — 품번 인라인 생성 =====
function togglePdCodeGenPanel() {
  const panel = document.getElementById('pdCodeGenPanel')
  const btn   = document.querySelector('.pdcg-toggle-btn')
  if (!panel) return
  const open = panel.style.display === 'none'
  panel.style.display = open ? '' : 'none'
  if (btn) btn.textContent = open ? '품번 생성 ▴' : '품번 생성 ▾'
  if (open) {
    filterPdDesignList()
    updatePdProductCode()
  }
}

function filterPdDesignList() {
  const q = (document.getElementById('pdCgDesignSearch')?.value || '').toLowerCase().trim()
  const list = q
    ? _designCodes.filter(([c,e,k]) => c.includes(q) || e.toLowerCase().includes(q) || k.toLowerCase().includes(q))
    : _designCodes
  const current = document.getElementById('pdCgDesign')?.value
  const dd = document.getElementById('pdCgDesignDropdown')
  if (!dd) return
  dd.innerHTML = list.map(([c,e,k]) =>
    `<div class="design-option${current===c?' selected':''}" onclick="selectPdDesign('${c}')">
      <span class="design-code">${c}</span>
      <span class="design-names"><span class="design-en">${e}</span><span class="design-kr">${k}</span></span>
    </div>`
  ).join('') || '<div class="design-no-result">검색 결과 없음</div>'
}

function selectPdDesign(code) {
  const found = _designCodes.find(([c]) => c === code)
  if (!found) return
  document.getElementById('pdCgDesign').value = code
  document.getElementById('pdCgDesignSearch').value = ''
  document.getElementById('pdCgDesignSearch').placeholder = `${code} - ${found[1]} (${found[2]})`
  filterPdDesignList()
  updatePdProductCode()
}

function updatePdProductCode() {
  const cls    = document.getElementById('pdCgCls')?.value    || ''
  const gen    = document.getElementById('pdCgGen')?.value    || ''
  const typ    = document.getElementById('pdCgTyp')?.value    || ''
  const des    = document.getElementById('pdCgDesign')?.value || ''
  const year   = document.getElementById('pdCgYear')?.value   || ''
  const season = document.getElementById('pdCgSeason')?.value || ''

  const previewEl = document.getElementById('pdCgPreview')
  const applyBtn  = document.getElementById('pdCgApplyBtn')
  if (!des) {
    if (previewEl) previewEl.textContent = '디자인 번호를 선택하세요'
    if (applyBtn)  applyBtn.disabled = true
    return
  }

  const prefix = cls + gen + typ + des + year + season
  // 현재 편집 중인 아이템의 기존 품번은 제외 (재생성 허용)
  const currentItem = State.planItems.find(p => p.no === _editingPlanNo)
  const currentOwnCode = currentItem?.productCode || ''
  const usedNums = new Set(
    [...State.allProducts, ...State.planItems]
      .map(p => p.productCode)
      .filter(c => c && c !== currentOwnCode && c.slice(0, 12) === prefix)
      .map(c => c.slice(12))
  )
  _reservedCodes.forEach(c => {
    if (c !== currentOwnCode && c.slice(0, 12) === prefix) usedNums.add(c.slice(12))
  })

  let nextNum = null
  for (let i = 0; i <= 99; i++) {
    const n = String(i).padStart(2, '0')
    if (!usedNums.has(n)) { nextNum = n; break }
  }

  if (nextNum === null) {
    if (previewEl) previewEl.textContent = '사용 가능한 번호 없음'
    if (applyBtn)  applyBtn.disabled = true
  } else {
    if (previewEl) previewEl.textContent = prefix + nextNum
    if (applyBtn)  applyBtn.disabled = false
  }
}

let _pdPendingCode = null  // 이번 편집 세션에서 예약된 임시 코드

function applyPdGeneratedCode() {
  const code = document.getElementById('pdCgPreview')?.textContent?.trim()
  if (!code || code === '-' || code.includes('없음') || code.includes('선택')) return

  const currentItem = State.planItems.find(p => p.no === _editingPlanNo)
  const currentOwnCode = currentItem?.productCode || ''

  // 최종 중복 검사 (자기 자신 기존 코드는 허용)
  if ((State.allProducts.some(p => p.productCode === code) ||
       State.planItems.some(p => p.productCode === code && p.no !== _editingPlanNo) ||
       _reservedCodes.has(code)) && code !== currentOwnCode) {
    showToast(`품번 "${code}"은 이미 사용 중입니다.`, 'error')
    updatePdProductCode()
    return
  }

  // 이전에 예약했던 임시 코드 해제
  if (_pdPendingCode && _pdPendingCode !== currentOwnCode) {
    _reservedCodes.delete(_pdPendingCode)
  }

  _pdPendingCode = code
  if (code !== currentOwnCode) _reservedCodes.add(code)

  const input = document.getElementById('pdProductCodeInput')
  if (input) input.value = code
  document.getElementById('pdCodeGenPanel').style.display = 'none'
  const toggleBtn = document.querySelector('.pdcg-toggle-btn')
  if (toggleBtn) toggleBtn.textContent = '품번 생성 ▾'
  showToast(`품번 "${code}" 적용됐습니다.`, 'success')
}

function _pdUpdateHeaderBtns(mode) {
  // mode: 'view' | 'edit'
  document.querySelectorAll('#planDetailModal .pd-view-btn').forEach(b => {
    b.style.display = mode === 'view' ? 'inline-block' : 'none'
  })
  document.querySelectorAll('#planDetailModal .pd-edit-btn').forEach(b => {
    b.style.display = mode === 'edit' ? 'inline-block' : 'none'
  })
  // confirmBtn 숨김 상태(confirmed) 유지
  const item = State.planItems.find(p => p.no === _editingPlanNo)
  if (item && item.confirmed) {
    const cb = document.getElementById('pdConfirmBtn')
    if (cb) cb.style.display = 'none'
  }
}

function _pdSyncWatchBtn() {
  const btn = document.getElementById('pdWatchBtn')
  if (!btn || _editingPlanNo == null) return
  const on = typeof isWatching === 'function' && isWatching('plan', _editingPlanNo)
  btn.textContent = on ? '💛' : '🤍'
  btn.classList.toggle('active', on)
}
window._pdSyncWatchBtn = _pdSyncWatchBtn

function _pdSyncLockWarn() {
  const el = document.getElementById('pdLockWarn')
  if (!el) return
  const info = (typeof getEditLockInfo === 'function') ? getEditLockInfo('plan', _editingPlanNo) : null
  if (info) { el.textContent = `🔒 ${info.userName || '다른 사용자'} 편집중`; el.style.display = '' }
  else { el.textContent = ''; el.style.display = 'none' }
}
window._pdSyncLockWarn = _pdSyncLockWarn

function togglePlanDetailEdit() {
  const modal = document.getElementById('planDetailModal')
  const willEdit = !modal.classList.contains('edit-mode')
  if (willEdit) {
    const info = (typeof getEditLockInfo === 'function') ? getEditLockInfo('plan', _editingPlanNo) : null
    if (info) {
      showToast(`${info.userName || '다른 사용자'}님이 편집 중입니다`, 'warn')
      _pdSyncLockWarn()
      return
    }
    if (typeof acquireEditLock === 'function') acquireEditLock('plan', _editingPlanNo)
  } else {
    if (typeof releaseEditLock === 'function') releaseEditLock('plan', _editingPlanNo)
  }
  const isEdit = modal.classList.toggle('edit-mode')
  _pdUpdateHeaderBtns(isEdit ? 'edit' : 'view')
  _pdSyncLockWarn()
  const cb = document.getElementById('pdConfirmBtn')
  if (cb && !cb.dataset.hidden) cb.disabled = !isEdit
}

async function confirmPlanWithCheck() {
  const ok = await korConfirm('상품을 확정하시겠습니까?\n확정 후 상품조회로 이전됩니다.', '확정', '취소')
  if (!ok) return
  confirmPlanToProduct()
}
window.confirmPlanWithCheck = confirmPlanWithCheck

async function savePlanDetailEdit() {
  const item = State.planItems.find(p => p.no === _editingPlanNo)
  if (!item) return
  const modal = document.getElementById('planDetailModal')

  // 품번 빈 값 체크 → 생성 패널 열기
  const pcInput = document.getElementById('pdProductCodeInput')
  if (pcInput && !pcInput.value.trim()) {
    showToast('품번이 비어있습니다. 품번을 입력하거나 생성해주세요.', 'warning')
    const panel = document.getElementById('pdCodeGenPanel')
    if (panel && panel.style.display === 'none') togglePdCodeGenPanel()
    pcInput.focus()
    return
  }

  // 대기 중 파일 Storage 업로드
  const pendingCount = _planTempImages.filter(i => i._pending && i._file).length
  if (pendingCount) {
    showToast(`참고 이미지 업로드 중... (${pendingCount}개)`, 'info')
    try { await _uploadPendingPlanTempImages(item.no) }
    catch (err) { showToast('이미지 업로드 실패: ' + err.message, 'error'); return }
  }

  // 이미지 URL pseudo 키 매핑
  const IMG_KEYS = {
    imgLemango:  'lemango',
    imgNoir:     'noir',
    imgExternal: 'external',
    imgSum:      'sum',
    imgDesign:   'design',
    imgShoot:    'shoot'
  }
  if (!item.images) item.images = {}

  // 일반 input/select/textarea
  modal.querySelectorAll('[data-pkey]').forEach(el => {
    const key = el.dataset.pkey
    if (IMG_KEYS[key]) {
      const imgKey = IMG_KEYS[key]
      if (imgKey === 'design' || imgKey === 'shoot') {
        item.images[imgKey] = el.value.trim() || null
      } else {
        item.images[imgKey] = (el.value || '').split('\n').map(u => u.trim()).filter(Boolean)
      }
      return
    }
    const val = el.tagName === 'INPUT' && el.type === 'number' ? (parseFloat(el.value) || 0) : el.value
    item[key] = val
    if (key === 'assignee') {
      const u = (Array.isArray(window._allUsers) ? window._allUsers : []).find(x => x.uid === val)
      item.assigneeName = u ? (u.name || '') : ''
      item.assigneePosition = u ? (u.position || '') : ''
    }
  })

  // 사이즈 규격 수집 (XS~XXL × bust/waist/hip 구조)
  if (Array.isArray(item.sizeSpec) || !item.sizeSpec || typeof item.sizeSpec !== 'object') item.sizeSpec = {}
  item.sizeSpec = collectSizeSpec(modal)
  // 일정 date inputs (dynamic phases)
  const scheduleKeys = getPlanPhases().map(p => p.key)
  scheduleKeys.forEach(k => {
    if (!item.schedule) item.schedule = {}
    if (!item.schedule[k]) item.schedule[k] = {}
    const startEl = modal.querySelector(`[data-sched="${k}-start"]`)
    const endEl   = modal.querySelector(`[data-sched="${k}-end"]`)
    if (startEl) item.schedule[k].start = startEl.value || null
    if (endEl)   item.schedule[k].end   = endEl.value   || null
  })

  // 헤더 텍스트 즉시 반영
  document.getElementById('pdBrand').textContent  = item.brand || ''
  document.getElementById('pdNameKr').textContent = item.nameKr || '(상품명 없음)'
  document.getElementById('pdSampleNo').textContent = item.sampleNo

  // 임시 이미지 저장 (내부 플래그 제거)
  item.tempImages = _planTempImages.map(x => {
    const { _file, _pending, _previewUrl, ...rest } = x
    return rest
  })

  // 삭제 예약된 Storage 파일 정리
  await _flushPlanStorageDeletions()

  stampModified(item)
  savePlanItems().catch(e => console.error(e))

  buildPlanDetailContent(item)
  renderPlanTempImageGrid()
  modal.classList.remove('edit-mode')
  _pdUpdateHeaderBtns('view')
  renderPlanTable()
  showToast('저장됐습니다.', 'success')
  logActivity('update', '신규기획', `기획수정: ${item.sampleNo || item.productCode}`)
  try {
    if (typeof notifyWatchers === 'function') notifyWatchers('plan', item.no, '수정됨')
    if (typeof releaseEditLock === 'function') releaseEditLock('plan', item.no)
  } catch(e) {}
}

async function confirmPlanToProduct() {
  const item = State.planItems.find(p => p.no === _editingPlanNo)
  if (!item) return

  if (!item.productCode || !item.productCode.trim()) {
    showToast('품번이 없습니다. 먼저 품번을 생성/입력 후 저장해주세요.', 'warning')
    return
  }

  if (State.allProducts.some(p => p.productCode === item.productCode)) {
    showToast(`품번 "${item.productCode}"은 이미 상품조회에 존재합니다.`, 'warning')
    return
  }

  if (!await korConfirm(`신규기획 항목을 상품조회로 이전합니다.\n품번: ${item.productCode}\n상품명: ${item.nameKr || '(없음)'}\n\n계속하시겠습니까?`)) return

  // 플랜 아이템 → 상품 객체 생성 (기획 필드 전체 복사)
  const salesInit = {}
  _platforms.forEach(pl => { salesInit[pl] = 0 })

  const cloned = JSON.parse(JSON.stringify(item))
  delete cloned.no
  delete cloned.schedule
  delete cloned.confirmed
  delete cloned.confirmedAt
  delete cloned.createdBy
  delete cloned.createdByName
  delete cloned.createdAt
  delete cloned.lastModifiedBy
  delete cloned.lastModifiedByName
  delete cloned.lastModifiedAt

  const newProduct = {
    ...cloned,
    no:            State.allProducts.length + 1,
    productCode:   item.productCode,
    saleStatus:    item.saleStatus || '판매대기',
    productionStatus: item.productionStatus || '지속생산',
    productCodeLocked: false,
    stock:         Object.fromEntries(SIZES.map(sz => [sz, 0])),
    barcodes:      Object.fromEntries(SIZES.map(sz => [sz, ''])),
    mallCodes:     {},
    stockLog:      [],
    sales:         salesInit,
    revenueLog:    [],
    registDate:    new Date().toISOString().slice(0, 10),
    logisticsDate: '',
    images: {
      sum:      item.images?.sum      || [],
      lemango:  Array.isArray(item.images?.lemango) ? item.images.lemango : (item.images?.lemango ? [item.images.lemango] : []),
      noir:     Array.isArray(item.images?.noir)    ? item.images.noir    : (item.images?.noir    ? [item.images.noir]    : []),
      external: item.images?.external || [],
      design:   item.images?.design   || null,
      shoot:    item.images?.shoot    || null
    },
    tempImages: (item.tempImages || []).map(img => ({ ...img, fromPlan: true })),
    // 기획 일정 이력 (상품조회 하단에 표시)
    scheduleLog: item.schedule && Object.keys(item.schedule).length
      ? [{ confirmedAt: new Date().toISOString().slice(0, 10), schedule: JSON.parse(JSON.stringify(item.schedule)) }]
      : []
  }

  stampCreated(newProduct)
  State.allProducts.push(newProduct)
  item.confirmed = true
  stampModified(item)
  savePlanItems().catch(e => console.error(e))

  // 상품조회 필터 갱신
  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  renderProductTable()
  renderStockTable()
  if (typeof renderSalesTable === 'function') renderSalesTable()
  renderDashboard()
  renderPlanTable()

  closePlanDetailModal(true)
  switchTab('product')

  // 상세 모달 열기 (약간 지연: 탭 전환 후)
  setTimeout(() => openDetailModal(newProduct.productCode), 100)

  showToast(`"${newProduct.productCode}" 상품이 상품조회로 이전됐습니다.`, 'success')
  logActivity('create', '신규기획', `상품이전: ${newProduct.productCode}`)
  try { if (typeof addProductHistory === 'function') addProductHistory(newProduct.productCode, '기획이전', '기획→상품 확정') } catch(e) {}
  if (typeof saveProducts === 'function') saveProducts().catch(e => console.error(e))
}

function buildPlanDetailContent(item) {
  document.getElementById('pdBrand').textContent    = item.brand || ''
  document.getElementById('pdNameKr').textContent   = item.nameKr || '(상품명 없음)'
  document.getElementById('pdSampleNo').textContent = item.sampleNo

  const schedules = SCHEDULE_DEFS

  const prodImgs = [
    ...(item.mainImage ? [item.mainImage] : []),
    ...(Array.isArray(item.images?.sum) ? item.images.sum : []),
    ...(Array.isArray(item.images?.lemango) ? item.images.lemango : (item.images?.lemango ? [item.images.lemango] : [])),
    ...(Array.isArray(item.images?.noir) ? item.images.noir : (item.images?.noir ? [item.images.noir] : []))
  ].filter(Boolean)
  const tempImgs = Array.isArray(item.tempImages) ? item.tempImages : []

  const prodImgHtml = prodImgs.length
    ? prodImgs.map(url =>
        `<img src="${url}" class="pd-thumb" onclick="window.open('${String(url).replace(/'/g,"\\'")}','_blank')" onerror="this.onerror=null;this.src=PLACEHOLDER_IMG" />`
      ).join('')
    : '<span class="pd-no-img">등록된 상품 이미지 없음</span>'
  const tempImgHtml = tempImgs.length
    ? tempImgs.map(img => {
        const safe = String(img.url).replace(/"/g,'&quot;')
        const nm = (img.name || '').length > 16 ? img.name.slice(0,14)+'..' : (img.name||'')
        return `<div class="plan-img-thumb plan-img-thumb-temp">
          <span class="plan-img-thumb-tag-temp">임시</span>
          <img src="${safe}" onclick="window.open('${safe.replace(/'/g,"\\'")}','_blank')" onerror="this.onerror=null;this.src=PLACEHOLDER_IMG" />
          <div class="plan-img-thumb-name">${esc(nm)}</div>
        </div>`
      }).join('')
    : ''

  const fmtDate = d => d || '-'
  const typeLabel   = { onepiece: '원피스', bikini: '비키니', 'two piece': '투피스' }
  const genderLabel = { W: '여성', M: '남성', G: '걸즈', B: '보이즈', N: '공용', K: '키즈' }

  // 뷰/편집 겸용 필드 헬퍼 (dispOverride: select일 때 표시용 한글 레이블)
  const pf = (label, key, val, type = 'text', opts = '', spanClass = '', dispOverride = '') => {
    const dispVal = dispOverride || (val !== null && val !== undefined && val !== '' ? String(val) : '-')
    const inputEl = type === 'select'
      ? `<select data-pkey="${key}">${opts}</select>`
      : type === 'textarea'
        ? `<textarea data-pkey="${key}" rows="3">${val || ''}</textarea>`
        : `<input type="${type}" data-pkey="${key}" value="${String(val || '').replace(/"/g, '&quot;')}" />`
    return `<div class="dfield ${spanClass}">
      <span class="dfield-label">${label}</span>
      <span class="dfield-value${dispVal === '-' ? ' empty' : ''}">${dispVal}</span>
      ${inputEl}
    </div>`
  }

  const brandOpts  = _settings.brands.map(b => `<option value="${b}"${item.brand===b?' selected':''}>${b}</option>`).join('')
  const typeOpts   = _settings.types.map(([v,l]) => `<option value="${v}"${item.type===v?' selected':''}>${l}</option>`).join('')
  const genderOpts = [['W','여성'],['M','남성'],['G','걸즈'],['B','보이즈'],['N','공용'],['K','키즈']]
    .map(([v,l]) => `<option value="${v}"${item.gender===v?' selected':''}>${l}</option>`).join('')
  const mkOptsCur = (list, cur) => '<option value="">-</option>' + (list||[]).map(v => {
    const [val, lbl] = Array.isArray(v) ? v : [v, v]
    return `<option value="${val}"${cur===val?' selected':''}>${lbl}</option>`
  }).join('')
  const fabricOpts       = mkOptsCur(_settings?.fabricTypes,    item.fabricType || '')
  const legCutOpts       = mkOptsCur(_settings?.legCuts,        item.legCut || '')
  const chestLineOpts    = mkOptsCur(_settings?.chestLines,     item.chestLine || '')
  const transparencyOpts = mkOptsCur(_settings?.transparencies, item.transparency || '')
  const liningOpts       = mkOptsCur(_settings?.linings,        item.lining || '')
  const capRingOpts      = mkOptsCur(_settings?.capRings,       item.capRing || '')

  // 품번 생성 패널용 옵션 (item 데이터로 기본값 추측)
  const clsGuess    = item.brand?.includes('느와') ? 'NS' : 'LS'
  const typGuess    = item.type === 'bikini' ? 'BK' : item.type === 'two piece' ? 'JM' : 'ON'
  const yearGuess   = String(item.year  || '6')
  const seasonGuess = String(item.season || '1')
  const genGuess    = item.gender || 'W'
  const CLS_OPT = [['LS','르망고 수영복'],['LW','르망고 의류'],['LG','르망고 굿즈'],['NS','느와 수영복'],['NW','느와 의류'],['NG','느와 굿즈']]
  const TYP_OPT = [['ON','원피스'],['MO','모노키니'],['BK','비키니'],['BR','브리프'],['JM','재머'],['RG','래시가드'],['AL','애슬레저'],['GM','의류'],['SC','수영모'],['BG','가방'],['ET','기타']]
  const GEN_OPT = [['W','여성'],['M','남성'],['G','걸즈'],['B','보이즈'],['N','공용'],['K','키즈']]
  const YEAR_OPT = ['1','2','3','4','5','6','7','8','9','0']
  const mkSel = (id, opts, guess, fn) =>
    `<select id="${id}" onchange="${fn}()">${opts.map(([v,l]) => `<option value="${v}"${v===guess?' selected':''}>${v}${l?' - '+l:''}</option>`).join('')}</select>`

  const pcVal = item.productCode || ''
  const productCodeField = `<div class="dfield dfield-span2">
    <span class="dfield-label">품번</span>
    <span class="dfield-value${!pcVal ? ' empty' : ''}">${pcVal || '-'}</span>
    <div class="pdcg-input-row">
      <input type="text" data-pkey="productCode" id="pdProductCodeInput" value="${pcVal}" placeholder="품번 직접 입력" style="flex:1" />
      <button class="btn btn-outline pdcg-toggle-btn" onclick="togglePdCodeGenPanel()" style="font-size:11px;padding:4px 12px;white-space:nowrap">품번 생성 ▾</button>
    </div>
    <div id="pdCodeGenPanel" class="pd-codegen-panel" style="display:none">
      <div class="pdcg-selects">
        <div class="pdcg-group"><label>분류</label>${mkSel('pdCgCls', CLS_OPT, clsGuess, 'updatePdProductCode')}</div>
        <div class="pdcg-group"><label>성별</label>${mkSel('pdCgGen', GEN_OPT, genGuess, 'updatePdProductCode')}</div>
        <div class="pdcg-group"><label>타입</label>${mkSel('pdCgTyp', TYP_OPT, typGuess, 'updatePdProductCode')}</div>
        <div class="pdcg-group"><label>연도</label>${mkSel('pdCgYear', YEAR_OPT.map(v => [v, '']), yearGuess, 'updatePdProductCode')}</div>
        <div class="pdcg-group"><label>시즌</label>${mkSel('pdCgSeason', ['1','2','3','4','5'].map(v => [v,'']), seasonGuess, 'updatePdProductCode')}</div>
      </div>
      <div class="pdcg-design-row">
        <label>디자인 번호 (패턴)</label>
        <input type="text" id="pdCgDesignSearch" placeholder="코드 또는 패턴명 검색" oninput="filterPdDesignList()" autocomplete="off" class="design-search-input" />
        <div id="pdCgDesignDropdown" class="design-dropdown" style="max-height:160px;overflow-y:auto"></div>
        <input type="hidden" id="pdCgDesign" />
      </div>
      <div class="pdcg-preview-row">
        <span class="pdcg-label">미리보기</span>
        <code id="pdCgPreview" class="pdcg-preview">-</code>
        <button class="btn btn-primary" id="pdCgApplyBtn" onclick="applyPdGeneratedCode()" disabled style="font-size:12px;padding:4px 14px">적용</button>
      </div>
    </div>
  </div>`

  // Pinned memo + Assignee (Feature 5 & 11)
  const _plUsers = Array.isArray(window._allUsers) ? window._allUsers : []
  const plAssigneeName = item.assigneeName || (item.assignee ? (_plUsers.find(u=>u.uid===item.assignee)?.name || '') : '')
  const plAssigneePos  = item.assigneePosition || (item.assignee ? (_plUsers.find(u=>u.uid===item.assignee)?.position || '') : '')
  const plAssigneeView = (plAssigneeName && typeof formatUserName === 'function') ? formatUserName(plAssigneeName, plAssigneePos) : (plAssigneeName || '-')
  const plAssigneeCurrentLabel = plAssigneeName ? plAssigneeView : ''
  const plAssigneeField = `
    <div class="dfield">
      <span class="dfield-label">담당자</span>
      <span class="dfield-value${!plAssigneeCurrentLabel ? ' empty' : ''}">${plAssigneeCurrentLabel || '-'}</span>
      <div class="assignee-combo" data-combo="assignee">
        <input type="hidden" data-pkey="assignee" value="${item.assignee || ''}" />
        <input type="text" class="assignee-search" value="${esc(plAssigneeCurrentLabel)}" placeholder="이름·직급·부서 검색" autocomplete="off"
          oninput="filterAssigneeDropdown(this)" onfocus="showAssigneeDropdown(this)" onkeydown="assigneeKeyNav(event, this)" />
        <button type="button" class="assignee-clear" title="미지정으로" onclick="clearAssignee(this)">✕</button>
        <div class="assignee-dd" style="display:none">
          <div class="assignee-opt" data-uid="" onmousedown="selectAssignee(this)">- 미지정 -</div>
          ${_plUsers.map(u => {
            const lbl = (typeof formatUserName==='function') ? formatUserName(u.name, u.position) : (u.name||'')
            const dept = u.dept || ''
            return `<div class="assignee-opt" data-uid="${u.uid}" data-name="${esc(lbl)}" data-dept="${esc(dept)}" onmousedown="selectAssignee(this)">
              <span class="aopt-name">${esc(lbl)}</span>${dept ? `<span class="aopt-dept">${esc(dept)}</span>` : ''}
            </div>`
          }).join('')}
        </div>
      </div>
    </div>`
  const plPinnedMemoBlock = `
    <div class="pinned-memo">📌 ${esc(item.pinnedMemo || '')}</div>
    <div class="pinned-memo-edit">
      <textarea data-pkey="pinnedMemo" rows="2" placeholder="📌 고정 메모 (상단 상시 노출)">${esc(item.pinnedMemo || '')}</textarea>
    </div>`

  document.getElementById('pdContent').innerHTML = `
    ${plPinnedMemoBlock}
    <div class="pd-section">
      <div class="pd-section-title">상품 이미지 <span class="plan-img-badge plan-img-badge-prod">상품</span></div>
      <div class="pd-img-row">${prodImgHtml}</div>
      ${item.confirmed ? '' : `<div style="margin-top:12px;text-align:right"><button class="srm-btn-gold" id="pdConfirmBtn" disabled onclick="confirmPlanWithCheck()">상품확정 →</button></div>`}
    </div>
    <div class="pd-section">
      <div class="pd-section-title">참고 이미지 <span class="plan-img-badge plan-img-badge-temp">임시</span></div>
      <div class="plan-img-grid" id="planTempImgGrid"></div>
      <div class="plan-edit-img-actions">
        <button type="button" class="plan-img-btn" onclick="addPlanTempImageUrl()">+ URL 추가</button>
        <label class="plan-img-btn plan-img-upload-label">
          + 파일 업로드
          <input type="file" accept="image/*" multiple style="display:none" onchange="handlePlanTempImageUpload(this)" />
        </label>
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">기본 정보</div>
      <div class="dfields-grid">
        ${pf('샘플번호', 'sampleNo', item.sampleNo)}
        ${productCodeField}
        ${pf('브랜드',        'brand',      item.brand,   'select', brandOpts, '', item.brand)}
        ${pf('상품명 (한글)', 'nameKr',     item.nameKr,  'text',   '', 'dfield-span2')}
        ${pf('상품명 (영문)', 'nameEn',     item.nameEn,  'text',   '', 'dfield-span2')}
        ${pf('색상 (한글)',   'colorKr',    item.colorKr)}
        ${pf('색상 (영문)',   'colorEn',    item.colorEn)}
        ${plAssigneeField}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">가격 / 디자인</div>
      <div class="dfields-grid">
        ${pf('판매가', 'salePrice', item.salePrice, 'number')}
        ${pf('원가',   'costPrice', item.costPrice, 'number')}
        ${pf('타입',   'type',      item.type, 'select', typeOpts, '', typeLabel[item.type] || item.type)}
        ${pf('연도',   'year',      item.year)}
        ${pf('시즌',   'season',    item.season)}
        ${pf('성별',   'gender',    item.gender, 'select', genderOpts, '', genderLabel[item.gender] || item.gender)}
        ${pf('원단타입', 'fabricType', item.fabricType, 'select', fabricOpts)}
        ${pf('백스타일', 'backStyle',  item.backStyle)}
        ${pf('가이드',   'guide',      item.guide)}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">소재</div>
      <div class="dfields-grid">
        ${pf('소재',            'material',   item.material,   'textarea', '', 'dfield-span2')}
        ${pf('디자이너 코멘트', 'comment',    item.comment,    'textarea', '', 'dfield-span2')}
        ${pf('세탁방법',        'washMethod', item.washMethod, 'textarea', '', 'dfield-span2')}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">사이즈 규격 <button type="button" class="img-html-btn-all" onclick="event.stopPropagation();copySizeGuideHtml()">사이즈 HTML 복사</button></div>
      <div style="padding:10px 12px">
        <div class="size-spec-view-wrap">${buildSizeSpecView(item.sizeSpec)}</div>
        <div class="size-spec-edit-wrap">${buildSizeSpecEdit(item.sizeSpec)}</div>
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">가이드</div>
      <div class="dfields-grid">
        ${pf('가슴선',   'chestLine',    item.chestLine,    'select', chestLineOpts)}
        ${pf('다리파임', 'legCut',       item.legCut,       'select', legCutOpts)}
        ${pf('비침',     'transparency', item.transparency, 'select', transparencyOpts)}
        ${pf('안감',     'lining',       item.lining,       'select', liningOpts)}
        ${pf('캡고리',   'capRing',      item.capRing,      'select', capRingOpts)}
        ${pf('모델착용사이즈', 'modelSize', item.modelSize)}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">제조 정보</div>
      <div class="dfields-grid">
        ${pf('제조년월', 'madeMonth', item.madeMonth)}
        ${pf('제조사',   'madeBy',    item.madeBy)}
        ${pf('제조국',   'madeIn',    item.madeIn)}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">이미지 URL</div>
      <div class="dfields-grid">
        ${pf('대표이미지', 'mainImage', item.mainImage, 'text', '', 'dfield-span2')}
        ${pf('자사몰',     'imgLemango', Array.isArray(item.images?.lemango) ? (item.images.lemango||[]).join('\n') : (item.images?.lemango||''), 'textarea', '', 'dfield-span2')}
        ${pf('느와',       'imgNoir',    Array.isArray(item.images?.noir)    ? (item.images.noir||[]).join('\n')    : (item.images?.noir||''),    'textarea', '', 'dfield-span2')}
        ${pf('외부몰',     'imgExternal',(item.images?.external||[]).join('\n'), 'textarea', '', 'dfield-span2')}
        ${pf('SUM',        'imgSum',     (item.images?.sum||[]).join('\n'),      'textarea', '', 'dfield-span2')}
        ${pf('디자인',     'imgDesign',  item.images?.design || '',              'text',     '', 'dfield-span2')}
        ${pf('촬영',       'imgShoot',   item.images?.shoot  || '',              'text',     '', 'dfield-span2')}
        ${pf('영상 URL',   'videoUrl',   item.videoUrl || '',                    'text',     '', 'dfield-span2')}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">메모</div>
      ${pf('메모', 'memo', item.memo, 'textarea', '', 'dfield-span2')}
    </div>
    <div class="pd-section">
      <div class="pd-section-title">일정 관리</div>
      <table class="plan-schedule-table">
        <thead><tr>
          <th class="pst-label-th">담당</th>
          <th class="pst-date-th">시작일</th>
          <th class="pst-date-th">완료예정일</th>
        </tr></thead>
        <tbody>${schedules.map(s => {
          const sch = item.schedule?.[s.key] || {}
          return `<tr>
            <td class="pst-label">${s.label}</td>
            <td class="pst-date-val${sch.start ? ' has-date' : ''}">
              <span class="pst-view">${fmtDate(sch.start)}</span>
              <input type="date" class="pst-edit" data-sched="${s.key}-start" value="${sch.start || ''}" />
            </td>
            <td class="pst-date-val${sch.end ? ' has-date' : ''}">
              <span class="pst-view">${fmtDate(sch.end)}</span>
              <input type="date" class="pst-edit" data-sched="${s.key}-end" value="${sch.end || ''}" />
            </td>
          </tr>`
        }).join('')}</tbody>
      </table>
    </div>

    ${renderStampInfo(item)}
    ${buildCommentSection('plan', item.no)}`
}

// ===== 일괄 일정 설정 =====
function togglePlanCheckAll(checked) {
  const data = applyColFilters(State.plan.filtered, State.plan.columnFilters)
  data.forEach(item => {
    if (checked) _planSelected.add(item.no)
    else _planSelected.delete(item.no)
  })
  renderPlanTable()
}

function updatePlanSelection() {
  document.querySelectorAll('.np-check').forEach(cb => {
    const no = parseInt(cb.dataset.no)
    if (cb.checked) _planSelected.add(no)
    else _planSelected.delete(no)
  })
  renderPlanToolbar()
  updateCheckAllState()
}

function updateCheckAllState() {
  const cb = document.getElementById('npCheckAll')
  if (!cb) return
  const data = applyColFilters(State.plan.filtered, State.plan.columnFilters)
  const count = data.filter(item => _planSelected.has(item.no)).length
  cb.checked = count === data.length && data.length > 0
  cb.indeterminate = count > 0 && count < data.length
}

function renderPlanToolbar() {
  const toolbar = document.getElementById('npToolbar')
  if (!toolbar) return
  const count = _planSelected.size
  if (count > 0) {
    toolbar.style.display = 'flex'
    document.getElementById('npSelCount').textContent = count
  } else {
    toolbar.style.display = 'none'
  }
}

function clearPlanSelection() {
  _planSelected.clear()
  renderPlanToolbar()
  renderPlanTable()
}

function _bulkHasInput() {
  const modal = document.getElementById('bulkScheduleModal')
  return modal ? Array.from(modal.querySelectorAll('.np-bulk-input')).some(i => i.value) : false
}

function openBulkScheduleModal() {
  if (_planSelected.size === 0) { showToast('상품을 먼저 선택해주세요.', 'warning'); return }
  const modal = document.getElementById('bulkScheduleModal')
  document.getElementById('npBulkCount').textContent = _planSelected.size
  // Dynamically render phase rows
  const grid = modal.querySelector('.np-bulk-grid')
  if (grid) {
    grid.innerHTML = getPlanPhases().map(ph => `
      <div class="np-bulk-label"><span class="np-bulk-dot" style="background:${ph.color || '#888'}"></span>${esc(ph.label)}</div>
      <input type="date" class="np-bulk-input" data-pkey="${esc(ph.key)}" data-ptype="start">
      <input type="date" class="np-bulk-input" data-pkey="${esc(ph.key)}" data-ptype="end">
    `).join('')
  }
  modal.querySelectorAll('.np-bulk-input').forEach(input => { input.value = '' })
  modal.showModal()
  centerModal(modal)
}

function closeBulkScheduleModal(force) {
  const modal = document.getElementById('bulkScheduleModal')
  if (!modal) return
  const doClose = () => { modal.close() }
  if (force) { doClose(); return }
  safeCloseModal(modal, _bulkHasInput, doClose)
}

function applyBulkSchedule() {
  const keys = getPlanPhases().map(p => p.key)

  const scheduleInput = {}
  let hasAny = false
  keys.forEach(key => { scheduleInput[key] = { start: '', end: '' } })
  document.querySelectorAll('#bulkScheduleModal .np-bulk-input').forEach(el => {
    const k = el.dataset.pkey
    if (!k || !scheduleInput[k]) return
    const v = el.value || ''
    scheduleInput[k][el.dataset.ptype] = v
    if (v) hasAny = true
  })

  if (!hasAny) { showToast('최소 1개 단계의 날짜를 입력해주세요.', 'warning'); return }

  let count = 0
  State.planItems.forEach(item => {
    if (!_planSelected.has(item.no)) return
    if (!item.schedule) item.schedule = {}
    keys.forEach(key => {
      const input = scheduleInput[key]
      if (!item.schedule[key]) item.schedule[key] = { start: '', end: '' }
      if (input.start) item.schedule[key].start = input.start
      if (input.end) item.schedule[key].end = input.end
    })
    count++
  })

  savePlanItems().catch(e => console.error(e))
  showToast(`${count}건 일정 일괄 적용 완료`, 'success')
  logActivity('update', '신규기획', `일괄 일정 설정 — ${count}건`)

  closeBulkScheduleModal(true)
  clearPlanSelection()
  renderPlanTable()
  if (typeof renderDashCalendar === 'function') renderDashCalendar()
}
