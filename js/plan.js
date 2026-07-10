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
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['planItems'] = Date.now()
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

// 🔴 기획 항목 identity = `id`(전용·불변·영구유일·재사용 금지). `no`=순수 표시용 행번호(현재 뷰 위치 1~N, 식별 아님).
//   다음 id = 기존 id 최대 + 1 (숫자 monotonic counter). 생성/업로드/복제가 사용.
function _nextPlanId() {
  let maxId = 0
  ;(State.planItems || []).forEach(p => { const n = Number(p && p.id); if (Number.isFinite(n)) maxId = Math.max(maxId, n) })
  return maxId + 1
}
// 🔴 id 백필 마이그레이션(1회·결정적·persist once). id 없는 항목에 부여:
//   ⓐ 기존 저장 `no` 를 id 로 채택(고유하면) → comments/watch/lock 등 no-keyed 레거시 참조 그대로 유지.
//     중복/누락 no 는 fresh max+1 (그 항목 참조는 어차피 중복 no 로 모호했음 → 손실 아닌 모호성 해소).
//   idempotent: 전 항목 id 보유 후 재실행=무변경. deterministic: 배열순서+값에만 의존(Date/random 없음).
function _ensurePlanIds() {
  const items = State.planItems
  if (!Array.isArray(items) || !items.length) return false
  const seen = new Set()
  let maxId = 0
  items.forEach(p => {
    if (!p) return
    const i = Number(p.id); if (Number.isFinite(i)) maxId = Math.max(maxId, i)
    const n = Number(p.no); if (Number.isFinite(n)) maxId = Math.max(maxId, n)
  })
  let changed = false
  items.forEach(p => {
    if (!p) return
    let id = Number(p.id)
    if (!Number.isFinite(id)) {
      const legacyNo = Number(p.no)
      id = (Number.isFinite(legacyNo) && !seen.has(legacyNo)) ? legacyNo : ++maxId
      p.id = id; changed = true
    } else if (seen.has(id)) {
      id = ++maxId; p.id = id; changed = true
    }
    seen.add(id)
  })
  return changed
}
window._nextPlanId = _nextPlanId
window._ensurePlanIds = _ensurePlanIds



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

  // 색상 피커 (마스터 기반 검색 드롭다운)
  const colorSlot = document.getElementById('plColorPickerSlot')
  if (colorSlot && typeof buildColorPickerHtml === 'function') {
    const initial = item ? { code: item.colorCode, nameKr: item.colorKr, nameEn: item.colorEn } : {}
    colorSlot.innerHTML = buildColorPickerHtml('plColorPicker', initial, {
      krId: 'plColorKr', enId: 'plColorEn', codeId: 'plColorCode'
    })
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
  initPlanCodePicker()   // 🔴 B1: 패널 제거 → 기본정보 백스타일 picker 초기화(품번 생성 = [품번 생성] 버튼)
}

function buildPlanTempImageSection(item) {
  return `
    <div class="rform-section">
      <div class="rform-section-title">
        참고 이미지
        <span class="plan-img-badge plan-img-badge-temp">임시</span>
      </div>
      <div class="plan-img-desc">라벨 슬롯(스타일/겉감/백지/랍빠)에 <b>Ctrl+V 붙여넣기</b>·드래그·파일·URL 로 등록. 스타일=대표(임시 상태 목록 썸네일). 상품확정 시 이전됩니다.</div>
      <div class="plan-img-grid" id="planTempImgGrid"></div>
      <div class="plan-img-actions" style="margin-top:8px">
        <button type="button" class="plan-img-btn" onclick="addPlanTempImageUrl()">+ 기타 URL</button>
        <label class="plan-img-btn plan-img-upload-label">
          + 기타 파일
          <input type="file" accept="image/*" multiple style="display:none" onchange="handlePlanTempImageUpload(this)" />
        </label>
      </div>
    </div>
  `
}

function buildPlanProductImageSection(item) {
  // 🔴 B2a: 대표 = 카페24 대표 + 사방넷 대표(멀티 URL) · 상세 = 카페24/사방넷 상세 URL([HTML 복사]). 레거시 6에디터 제거.
  //   레거시 mainImage seed: cafe24Main 비었고 mainImage 있으면 대표(카페24)에 시드.
  const cafe24Main = esc((item && (item.cafe24Main || item.mainImage)) || '')
  const sabangMain = esc((item && item.sabangMain) || '')
  return `
    <div class="rform-section">
      <div class="rform-section-title">
        상품 이미지
        <span class="plan-img-badge plan-img-badge-prod">상품</span>
      </div>
      <div class="plan-img-desc">카페24 대표 = 시스템 썸네일(최우선). 상세 URL은 [HTML 복사]로 상세페이지 HTML 생성.</div>
      <div class="rform-grid">
        <div class="rform-field" style="grid-column:span 2">
          <label>카페24 대표 (시스템 썸네일)</label>
          <textarea id="npCafe24Main" rows="2" placeholder="여러 개면 줄바꿈으로 구분">${cafe24Main}</textarea>
        </div>
        <div class="rform-field" style="grid-column:span 2">
          <label>사방넷 대표</label>
          <textarea id="npSabangMain" rows="2" placeholder="여러 개면 줄바꿈으로 구분">${sabangMain}</textarea>
        </div>
        <div class="rform-field" style="grid-column:span 2">
          <label>CAFE24 상세 URL <button type="button" class="img-html-btn" onclick="copyUrlHtml('npCafe24DetailUrl')" title="이미지 URL → 상세페이지 HTML 복사">HTML 복사</button></label>
          <textarea id="npCafe24DetailUrl" rows="2" placeholder="여러 개면 줄바꿈으로 구분">${esc((item && item.cafe24DetailUrl) || '')}</textarea>
        </div>
        <div class="rform-field" style="grid-column:span 2">
          <label>사방넷 상세 URL <button type="button" class="img-html-btn" onclick="copyUrlHtml('npSabangDetailUrl')" title="이미지 URL → 상세페이지 HTML 복사">HTML 복사</button></label>
          <textarea id="npSabangDetailUrl" rows="2" placeholder="여러 개면 줄바꿈으로 구분">${esc((item && item.sabangDetailUrl) || '')}</textarea>
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

// 🔴 B3: 라벨 슬롯(PLAN_IMG_SLOTS) + 기타(레거시·미분류) 스트립. create/detail 공용(#planTempImgGrid).
function renderPlanTempImageGrid() {
  const grids = document.querySelectorAll('#planTempImgGrid')
  if (!grids.length) return
  const slots = (typeof PLAN_IMG_SLOTS !== 'undefined') ? PLAN_IMG_SLOTS : []
  const byLabel = {}, others = []
  ;(_planTempImages || []).forEach((img, i) => {
    if (img && img.label && slots.includes(img.label)) byLabel[img.label] = { img, i }
    else others.push({ img, i })
  })
  const slotHtml = slots.map(label => {
    const rec = byLabel[label]
    const primary = label === '스타일'
    const filled = !!(rec && rec.img && rec.img.url)
    const safeUrl = filled ? String(rec.img.url).replace(/"/g, '&quot;') : ''
    const pending = filled && rec.img._pending
    const caption = filled ? (rec.img.caption || '') : ''
    const inner = filled
      ? `<img src="${safeUrl}" onerror="this.onerror=null;this.src=PLACEHOLDER_IMG" onclick="event.stopPropagation();window.open('${safeUrl.replace(/'/g, "\\'")}','_blank')" />
         ${pending ? '<span class="plan-slot-badge">대기</span>' : ''}
         <button type="button" class="plan-slot-x" title="제거" onclick="event.stopPropagation();_planSlotRemove('${label}')">✕</button>`
      : `<div class="plan-slot-empty">📋 붙여넣기(Ctrl+V) / 드래그<br><span class="plan-slot-empty-sub">또는 아래 파일·URL</span></div>`
    return `<div class="plan-slot${primary ? ' plan-slot-primary' : ''}${filled ? ' filled' : ''}">
      <div class="plan-slot-label">${esc(label)}${primary ? ' <span class="plan-slot-main-tag">메인</span>' : ''}</div>
      <div class="plan-slot-drop" tabindex="0" data-plan-slot="${esc(label)}"
        ondragover="_planSlotDragOver(event, this)" ondragleave="_planSlotDragLeave(event, this)" ondrop="_planSlotDrop(event, '${label}')"
        title="클릭 후 Ctrl+V 붙여넣기 · 드래그 앤 드롭">${inner}</div>
      <input type="text" class="plan-slot-cap" data-plan-cap="${esc(label)}" value="${esc(caption)}" placeholder="그래픽명" oninput="_planSlotCaptionChange(this, '${label}')" />
      <div class="plan-slot-actions">
        <label class="plan-slot-mini">파일<input type="file" accept="image/*" style="display:none" onchange="_planSlotFileSelect(this, '${label}')" /></label>
        <button type="button" class="plan-slot-mini" onclick="_planSlotAddUrl('${label}')">URL</button>
      </div>
    </div>`
  }).join('')
  const otherHtml = others.length
    ? `<div class="plan-slot-others">
        <div class="plan-slot-others-title">기타 / 미분류 (${others.length})</div>
        <div class="plan-img-grid">${others.map(({ img, i }) => {
          const nm = (img.name || '').length > 16 ? img.name.slice(0, 14) + '..' : (img.name || '')
          const su = String(img.url).replace(/"/g, '&quot;')
          const tag = img._pending ? '대기' : '임시'
          return `<div class="plan-img-thumb plan-img-thumb-temp">
            <span class="plan-img-thumb-tag-temp">${tag}</span>
            <img src="${su}" onerror="this.onerror=null;this.src=PLACEHOLDER_IMG" onclick="window.open('${su.replace(/'/g, "\\'")}','_blank')" />
            <div class="plan-img-thumb-name">${esc(nm)}</div>
            <button type="button" class="plan-img-thumb-x temp-del-btn" onclick="removePlanTempImage(${i})">✕</button>
          </div>`
        }).join('')}</div>
      </div>`
    : ''
  const html = `<div class="plan-slots">${slotHtml}</div>${otherHtml}`
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

// =============================================
// ===== 🔴 B3: 참고 이미지 라벨 슬롯 — 붙여넣기(Ctrl+V)/드래그/파일/URL + 클라 압축 =====
// =============================================
// 🔴 클라이언트 압축: long-edge 2000px 초과 시 canvas 리사이즈 + JPEG 0.85. 작은 이미지(<800KB & ≤2000px)=원본 스킵.
//   반환 Promise<Blob>. 실패/비이미지 = 원본 그대로(안전). 압축본이 원본보다 크면 원본 유지.
function _compressImageBlob(file) {
  return new Promise((resolve) => {
    try {
      if (!file || !file.type || !file.type.startsWith('image/')) { resolve(file); return }
      const SMALL = 800 * 1024
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const longEdge = Math.max(img.naturalWidth, img.naturalHeight)
        if (file.size <= SMALL && longEdge <= 2000) { URL.revokeObjectURL(url); resolve(file); return }
        const scale = longEdge > 2000 ? 2000 / longEdge : 1
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        canvas.toBlob((blob) => {
          resolve((blob && blob.size < file.size) ? blob : file)
        }, 'image/jpeg', 0.85)
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
      img.src = url
    } catch (e) { resolve(file) }
  })
}

// 슬롯에 이미지 blob 등록(압축 → 10MB 가드 → 슬롯 덮어쓰기 → pending push → 렌더 → caption 포커스).
//   🔴 pending 업로드(현행 파일 동작과 동일 — 저장 시 _uploadPendingPlanTempImages 로 업로드). URL 은 즉시(참조).
async function _addSlotImageFromBlob(fileOrBlob, name, label) {
  if (!fileOrBlob) return
  showToast('이미지 처리 중…', 'info')
  let blob
  try { blob = await _compressImageBlob(fileOrBlob) } catch (e) { blob = fileOrBlob }
  if (blob.size > 10 * 1024 * 1024) {
    showToast(`이미지가 압축 후에도 10MB를 초과합니다 (${(blob.size / 1024 / 1024).toFixed(1)}MB).`, 'error')
    return
  }
  _planSlotClearExisting(label)   // 덮어쓰기(기존 슬롯 엔트리 정리 · caption 승계)
  const keepCaption = _planSlotPendingCaption; _planSlotPendingCaption = ''
  const fname = (name || `paste_${label}_${Date.now()}.jpg`).replace(/[^\w.\-가-힣]/g, '_')
  const previewUrl = URL.createObjectURL(blob)
  _planTempImages.push({ url: previewUrl, type: 'file', name: fname, label, caption: keepCaption, _file: blob, _pending: true, _previewUrl: previewUrl })
  renderPlanTempImageGrid()
  setTimeout(() => { const cap = document.querySelector(`[data-plan-cap="${label}"]`); if (cap) cap.focus() }, 30)
}

// 슬롯의 기존 엔트리 제거(Storage 파일=삭제예약 · 미리보기 URL 해제 · caption 은 _planSlotPendingCaption 로 승계)
let _planSlotPendingCaption = ''
function _planSlotClearExisting(label) {
  const idx = _planTempImages.findIndex(t => t && t.label === label)
  _planSlotPendingCaption = ''
  if (idx < 0) return
  const old = _planTempImages[idx]
  _planSlotPendingCaption = old.caption || ''
  if (old.path && !old._pending) _planTempImagesToDelete.push(old.path)   // 교체된 Storage 파일 삭제 시도(실패=orphan 허용)
  if (old._previewUrl) { try { URL.revokeObjectURL(old._previewUrl) } catch (e) {} }
  _planTempImages.splice(idx, 1)
}

function _planSlotFileSelect(input, label) {
  const f = input.files && input.files[0]
  input.value = ''
  if (f) _addSlotImageFromBlob(f, f.name, label)
}

async function _planSlotAddUrl(label) {
  const url = window.prompt('이미지 URL을 입력하세요 (http/https)')
  if (!url) return
  const t = url.trim()
  if (!/^https?:\/\//i.test(t)) { showToast('http:// 또는 https:// 로 시작해야 합니다.', 'error'); return }
  _planSlotClearExisting(label)
  const keepCaption = _planSlotPendingCaption; _planSlotPendingCaption = ''
  _planTempImages.push({ url: t, type: 'url', name: t, label, caption: keepCaption })
  renderPlanTempImageGrid()
}

function _planSlotDragOver(e, el) { e.preventDefault(); if (el) el.classList.add('plan-slot-hover') }
function _planSlotDragLeave(e, el) { if (el) el.classList.remove('plan-slot-hover') }
function _planSlotDrop(e, label) {
  e.preventDefault()
  const el = e.currentTarget; if (el) el.classList.remove('plan-slot-hover')
  const files = e.dataTransfer && e.dataTransfer.files
  const f = files && Array.from(files).find(x => x.type && x.type.startsWith('image/'))
  if (f) _addSlotImageFromBlob(f, f.name, label)
  else showToast('이미지 파일만 등록할 수 있습니다.', 'warning')
}

function _planSlotCaptionChange(el, label) {
  const entry = _planTempImages.find(t => t && t.label === label)
  if (entry) entry.caption = el.value
}

function _planSlotRemove(label) {
  _planSlotClearExisting(label)
  _planSlotPendingCaption = ''
  renderPlanTempImageGrid()
}

function _firstEmptyPlanSlot() {
  const slots = (typeof PLAN_IMG_SLOTS !== 'undefined') ? PLAN_IMG_SLOTS : []
  const filled = new Set(_planTempImages.filter(t => t && t.label).map(t => t.label))
  return slots.find(sName => !filled.has(sName)) || null
}

// 🔴 전역 붙여넣기 핸들러(플랜 모달 열림 시): 이미지 클립보드만 처리 · 텍스트 붙여넣기 절대 방해 안 함.
//   포커스가 슬롯([data-plan-slot]) 내부면 그 슬롯, 아니면(그리고 텍스트 입력 포커스 아니면) 첫 빈 슬롯.
function _planSlotPasteHandler(e) {
  const pd = document.getElementById('planDetailModal'), pr = document.getElementById('planRegisterModal')
  if (!((pd && pd.open) || (pr && pr.open))) return
  const items = e.clipboardData && e.clipboardData.items
  if (!items) return
  const imgItem = Array.from(items).find(it => it.kind === 'file' && it.type && it.type.startsWith('image/'))
  if (!imgItem) return   // 이미지 없음 → 텍스트 붙여넣기 그대로 통과
  const ae = document.activeElement
  const focusedSlot = (ae && ae.closest) ? ae.closest('[data-plan-slot]') : null
  let label
  if (focusedSlot) {
    label = focusedSlot.getAttribute('data-plan-slot')
  } else {
    const isText = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)
    if (isText) return   // 🔴 텍스트 입력 포커스 + 슬롯 아님 → 방해 안 함
    label = _firstEmptyPlanSlot()
  }
  if (!label) return
  e.preventDefault()
  const f = imgItem.getAsFile()
  if (f) _addSlotImageFromBlob(f, f.name || `paste_${Date.now()}.png`, label)
}
if (typeof document !== 'undefined') document.addEventListener('paste', _planSlotPasteHandler)
window._planSlotFileSelect = _planSlotFileSelect
window._planSlotAddUrl = _planSlotAddUrl
window._planSlotDragOver = _planSlotDragOver
window._planSlotDragLeave = _planSlotDragLeave
window._planSlotDrop = _planSlotDrop
window._planSlotCaptionChange = _planSlotCaptionChange
window._planSlotRemove = _planSlotRemove

function getPlanThumbUrl(item) {
  // 🔴 B3: 임시 상태 face = 스타일 슬롯 이미지 우선 → 아니면 B2a compat 체인
  const st = Array.isArray(item?.tempImages) ? item.tempImages.find(t => t && t.label === '스타일' && t.url) : null
  if (st) return st.url
  // 🔴 B2a compat: 카페24 대표[0] → 레거시 mainImage → tempImages → images.sum/lemango(레거시)
  const c24 = (typeof _firstImageUrl === 'function') ? _firstImageUrl(item?.cafe24Main) : ''
  if (c24) return c24
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

  // 신규 기획 identity 예약 — 🔴 불변 id = max(id)+1 (no 는 표시용이라 식별에 안 씀)
  const newPlanId = _nextPlanId()

  // 대기 중 파일 Storage 업로드 (Storage 폴더 = id)
  const pendingCount = _planTempImages.filter(i => i._pending && i._file).length
  if (pendingCount) {
    showToast(`참고 이미지 업로드 중... (${pendingCount}개)`, 'info')
    try { await _uploadPendingPlanTempImages(newPlanId) }
    catch (err) { showToast('이미지 업로드 실패: ' + err.message, 'error'); return }
  }

  // 🔴 B2a: 이미지 = 카페24 대표 + 사방넷 대표(멀티 URL 문자열). 레거시 6키/mainImage 미저장.
  const cafe24MainUrl = (document.getElementById('npCafe24Main')?.value || '').trim()
  const sabangMainUrl = (document.getElementById('npSabangMain')?.value || '').trim()
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
    id:          newPlanId,
    sampleNo,
    productCode: document.getElementById('plProductCode').value.trim() || '',
    brand:       document.getElementById('plBrand').value,
    nameKr:      val('plNameKr'),
    nameEn:      val('plNameEn'),
    colorKr:     val('plColorKr'),
    colorEn:     val('plColorEn'),
    colorCode:   val('plColorCode'),
    salePrice:   Number(document.getElementById('plSalePrice').value) || 0,
    costPrice:   Number(document.getElementById('plCostPrice').value) || 0,
    type:        document.getElementById('plType').value,
    year:        document.getElementById('plYear').value,
    season:      document.getElementById('plSeason').value,
    gender:      document.getElementById('plGender').value,
    // 🔴 B1: 품번 코드 필드 (엑셀 업로드와 동일 shape — 편집 시 프리필/상품확정 정합). typeCode≠type(5-2 보호)
    classCode:      document.getElementById('plClass')?.value || '',
    typeCode:       document.getElementById('plTypeCode')?.value || '',
    yearDigit:      (typeof pcodeYearDigit === 'function') ? pcodeYearDigit(document.getElementById('plYear')?.value || '') : '',
    designCode:     document.getElementById('plPcDesign')?.value || '',
    cafe24DetailUrl: (document.getElementById('npCafe24DetailUrl')?.value || '').trim(),
    sabangDetailUrl: (document.getElementById('npSabangDetailUrl')?.value || '').trim(),
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
    // 🔴 B2a 이미지: 카페24/사방넷 대표(멀티 URL 문자열). 레거시 mainImage/images 미저장.
    cafe24Main:  cafe24MainUrl,
    sabangMain:  sabangMainUrl,
    tempImages:  tempImagesSnap,
    videoUrl:    (document.getElementById('npVideoUrl')?.value || '').trim(),
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
// 🔴 B1: 신규기획 백스타일(=디자인 코드) picker 초기화. 패널 제거 → 기본정보 인라인.
//   구 renderPlBackStyleList/selectPlBackStyle/showPlBsForm/confirmPlBsForm = 존재하지 않는 plPcBackStyle/plBsDropdown 참조 dead code 였음 → 제거.
function initPlanCodePicker() {
  if (!document.getElementById('plPcDesign')) return
  // 🔴 기본 선택 없음(공란) — 백스타일=의도적 선택(업로드 designCode='' 공란과 값 정합 · 디자인 반려 테스트 가능)
  document.getElementById('plPcDesign').value = ''
  const s = document.getElementById('plPcDesignSearch'); if (s) { s.value = ''; s.placeholder = '코드 또는 패턴명 검색 (예: 1626 / Crossed / 크로스)' }
  const bs = document.getElementById('plBackStyle'); if (bs) bs.value = ''
  renderPlDesignList('')
}
window.initPlanCodePicker = initPlanCodePicker

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
  const bs = document.getElementById('plBackStyle')   // 🔴 B1: 백스타일명(EN) 자동채움(read-only)
  if (bs) bs.value = found[1] || ''
  renderPlDesignList('')
}

// 🔴 B1: 신규기획 1-버튼 품번 생성 (Phase A 공유 코어 _genCodeInto). 연도(plYear)=전체연도 → yearDigit 파생.
//   🔴 typeCode → type(plType) 절대 미기입(5-2 카테고리 할인 보호 — 구 typeMap 누출 제거). 백스타일명은 picker 가 채움.
function genPlanCode() {
  const yearFull  = document.getElementById('plYear')?.value || ''
  const yearDigit = (typeof pcodeYearDigit === 'function') ? pcodeYearDigit(yearFull) : ''
  _genCodeInto({
    cls:       document.getElementById('plClass')?.value,
    gen:       document.getElementById('plGender')?.value,
    typ:       document.getElementById('plTypeCode')?.value,
    des:       document.getElementById('plPcDesign')?.value,
    yearDigit,
    seasonNum: document.getElementById('plSeason')?.value
  }, 'plProductCode', 'plBrand')
}
window.genPlanCode = genPlanCode


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
  // 검색 필터는 영속화하지 않음 — 새로고침 시 항상 빈 상태로 시작
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
  { key:'no',         label:'No.',    fixed:false, thAttr:'data-key="no" data-no-sort data-no-filter style="width:45px;text-align:center"',
    td: (p, rowNo)=>`<td style="text-align:center">${rowNo != null ? rowNo : ''}${p.confirmed?'<br><span style="font-size:9px;background:var(--success);color:#fff;padding:1px 5px;border-radius:8px">이전됨</span>':''}</td>` },
  { key:'_image',     label:'이미지', fixed:false, thAttr:'data-no-sort data-no-filter style="width:60px"',
    td: p=>{
      const url = getPlanThumbUrl(p)
      // 🔴 B2a: 대표(카페24) 또는 레거시 이미지 없고 tempImages 만 있으면 '임시' 배지
      const _hasReal = (typeof _firstImageUrl==='function' && _firstImageUrl(p.cafe24Main)) || p.mainImage || (p.images?.sum?.length) || (p.images?.lemango?.length)
      const isTemp = !_hasReal && p.tempImages && p.tempImages.length
      const cls = isTemp ? 'plan-table-thumb plan-table-thumb-temp' : 'plan-table-thumb'
      const tag = isTemp ? '<span class="plan-table-thumb-tag">임시</span>' : ''
      return `<td><div class="${cls}"><img src="${url}" onerror="this.onerror=null;this.src=PLACEHOLDER_IMG" />${tag}</div></td>`
    } },
  { key:'sampleNo',   label:'샘플번호',fixed:false, thAttr:'data-key="sampleNo"',
    td: p=>`<td><span class="code-link" onclick="openPlanDetailModal(${p.id})">${p.sampleNo}</span></td>` },
  { key:'productCode',label:'품번',   fixed:true,  thAttr:'data-key="productCode" style="width:145px"',
    td: p=>`<td>${p.productCode?`<span class="code-link" onclick="openPlanDetailModal(${p.id})">${p.productCode}</span>`:`<span style="color:var(--text-muted);font-size:12px">-</span>`}</td>` },
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
  { key:'lastModifiedByName', label:'최종 수정자', fixed:false, thAttr:'data-key="lastModifiedByName" style="width:130px"',
    td: p=>{
      const n = p.lastModifiedByName || ''
      const at = p.lastModifiedAt ? String(p.lastModifiedAt).slice(0,10) : ''
      return `<td style="font-size:11px;color:#666">${n ? `<div>${n}</div>` : ''}${at ? `<div style="font-size:10px;color:#999">${at}</div>` : (n ? '' : '-')}</td>`
    } },
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
  // 🔴 렌더 전 id 백필(1회 persist). id 있는 항목만 있으면 무변경 → 재저장 없음.
  if (_ensurePlanIds() && typeof savePlanItems === 'function') savePlanItems().catch(()=>{})
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
  const _rowBase = (ps === 0 ? 0 : (page - 1) * ps)   // 🔴 No. = 현재 뷰 위치(1~N), 식별 아님
  const tbodyHtml = pageData.map((p, _pi) => {
    const rowNo = _rowBase + _pi + 1
    const isChecked = _planSelected.has(p.id)
    const regTds = activeRegular.map(c => c.td(p, rowNo)).join('')
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
    return `<tr class="${cls}" data-id="${p.id}"${p.confirmed?' style="opacity:0.6"':''}><td><input type="checkbox" class="np-check" data-id="${p.id}" ${isChecked?'checked':''} onchange="updatePlanSelection()"></td>${regTds}${schTds}</tr>`
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
  // Feature 6: inline edit DISABLED — all edits go through detail modal
  // (preserves edit lock, activity log, watch notifications, permission checks)
  // initInlineEdit('planTable', 'plan') — intentionally not wired
  // Feature 12: row double-click → detail (now also covers cells previously inline-editable)
  initRowDblClick('planTable', (tr) => {
    const id = Number(tr.getAttribute('data-id'))
    if (!Number.isNaN(id)) openPlanDetailModal(id)
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
    // skip rows with no data-id
    if (!tr.hasAttribute('data-id')) {
      // find first np-check checkbox for data-id fallback
      const chk = tr.querySelector('.np-check')
      if (chk) tr.setAttribute('data-id', chk.getAttribute('data-id'))
    }
    tr.setAttribute('draggable', 'true')
    tr.addEventListener('dragstart', _planDragStart)
    tr.addEventListener('dragover', _planDragOver)
    tr.addEventListener('dragleave', _planDragLeave)
    tr.addEventListener('drop', _planDrop)
    tr.addEventListener('dragend', _planDragEnd)
  })
}
let _planDragSrcId = null
function _planDragStart(e) {
  // don't start drag when starting from an input/checkbox
  const tag = (e.target.tagName || '').toLowerCase()
  if (['input','select','textarea','button','label'].includes(tag)) { e.preventDefault(); return }
  _planDragSrcId = Number(this.getAttribute('data-id'))
  this.classList.add('drag-row')
  try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(_planDragSrcId)) } catch(_){}
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
  const targetId = Number(this.getAttribute('data-id'))
  if (_planDragSrcId == null || targetId === _planDragSrcId) return
  const arr = State.planItems
  const from = arr.findIndex(x => x.id === _planDragSrcId)
  const to   = arr.findIndex(x => x.id === targetId)
  if (from < 0 || to < 0) return
  const [moved] = arr.splice(from, 1)
  arr.splice(to, 0, moved)
  // reflect in filtered order too
  if (State.plan && Array.isArray(State.plan.filtered)) {
    const fFrom = State.plan.filtered.findIndex(x => x.id === _planDragSrcId)
    const fTo   = State.plan.filtered.findIndex(x => x.id === targetId)
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
  _planDragSrcId = null
}
window.initPlanDragSort = initPlanDragSort

// ===== 신규기획 상세 모달 =====
let _editingPlanId = null

async function openPlanDetailModal(id) {
  const item = State.planItems.find(p => p.id === id)
  if (!item) return
  _editingPlanId = id
  _planTempImages = Array.isArray(item.tempImages) ? item.tempImages.map(x => ({ ...x })) : []
  if ((!window._allUsers || window._allUsers.length === 0) && typeof loadAllUsers === 'function') {
    try { await loadAllUsers() } catch(e) {}
  }
  buildPlanDetailContent(item)
  renderPlanTempImageGrid()
  // 🔴 B2b: 품번 코드 디자인 picker 드롭다운 초기화(패널 제거 → 기본정보 인라인)
  if (typeof filterPdDesignList === 'function' && document.getElementById('pdCgDesignDropdown')) {
    const dcur = document.getElementById('pdCgDesign')?.value
    const de = (typeof _designCodes !== 'undefined') ? _designCodes.find(([c]) => c === dcur) : null
    const dsearch = document.getElementById('pdCgDesignSearch')
    if (dsearch && de) dsearch.placeholder = `${de[0]} - ${de[1]} (${de[2]})`
    filterPdDesignList()
  }
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
  loadComments('plan', id)
  if (typeof pushModalHistory === 'function') pushModalHistory('plan', id)
  const favBtn = document.getElementById('pdFavBtn')
  if (favBtn) {
    const on = typeof isFavorite === 'function' && isFavorite('plan', id)
    favBtn.textContent = on ? '★' : '☆'
    favBtn.classList.toggle('fav-on', on)
  }
}

function closePlanDetailModal(force) {
  const modal = document.getElementById('planDetailModal')
  const doClose = () => {
    if (modal.classList.contains('edit-mode')) modal.classList.remove('edit-mode')
    if (_pdPendingCode) {
      const currentItem = State.planItems.find(p => p.id === _editingPlanId)
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
    try { if (typeof releaseEditLock === 'function') releaseEditLock('plan', _editingPlanId) } catch(e) {}
    modal.close()
  }
  if (force) { doClose(); return }
  safeCloseModal(modal, () => modal.classList.contains('edit-mode'), doClose)
}

async function clonePlanItem(id) {
  const original = State.planItems.find(item => item.id === id)
  if (!original) return
  const ok = await korConfirm('이 기획 상품을 복제하시겠습니까?\n동일한 정보로 새 기획이 생성됩니다.', '복제', '취소')
  if (!ok) return
  const cloned = JSON.parse(JSON.stringify(original))
  delete cloned.no                 // no=표시용(렌더 시 계산) — 복제본은 저장 안 함
  cloned.id = _nextPlanId()        // 🔴 복제본 = 새 불변 id
  if (cloned.sampleNo) cloned.sampleNo = cloned.sampleNo + '_copy'
  cloned.productCode = ''
  cloned.confirmed = false
  cloned.confirmedAt = ''
  delete cloned.confirmedBy         // 복제본은 미확정 → 확정자 스탬프 제거(원본 확정자 표시 방지)
  delete cloned.confirmedByName
  if (typeof stampCreated === 'function') stampCreated(cloned)
  State.planItems.push(cloned)
  savePlanItems().catch(e => console.error(e))
  closePlanDetailModal(true)
  if (typeof renderPlanTable === 'function') renderPlanTable()
  setTimeout(() => { openPlanDetailModal(cloned.id) }, 300)
  showToast('기획 상품이 복제되었습니다.')
  if (typeof logActivity === 'function') logActivity('create', '신규기획', '기획 복제 — ' + (original.sampleNo || original.productCode || 'ID.' + original.id))
}
window.clonePlanItem = clonePlanItem

// ===== 기획 상세 모달 — 품번 인라인 생성 =====
// 🔴 B2b: 패널 제거 → 디자인 picker 는 기본정보 인라인. selectPdDesign 이 백스타일명(pdBackStyleName) 자동채움.
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
  const bs = document.getElementById('pdBackStyleName')   // 🔴 B2b: 백스타일명(EN) 자동채움(readonly, data-pkey=backStyle)
  if (bs) bs.value = found[1] || ''
  filterPdDesignList()
}

let _pdPendingCode = null  // 이번 편집 세션에서 예약된 임시 코드

// 🔴 B2b: 기획 상세 1-버튼 품번 생성 (Phase A 공유 경로 + 자기코드 excludeCode + _pdPendingCode 예약). 연도=전체연도→yearDigit 파생.
function genPdCode() {
  const currentItem = State.planItems.find(p => p.id === _editingPlanId)
  const ownCode = (currentItem && currentItem.productCode) || ''
  const yearFull  = document.getElementById('pdCgYear')?.value || ''
  const yearDigit = (typeof pcodeYearDigit === 'function') ? pcodeYearDigit(yearFull) : ''
  const basis = {
    cls:       document.getElementById('pdCgCls')?.value,
    gen:       document.getElementById('pdCgGen')?.value,
    typ:       document.getElementById('pdCgTyp')?.value,
    des:       document.getElementById('pdCgDesign')?.value,
    yearDigit,
    seasonNum: document.getElementById('pdCgSeason')?.value
  }
  const missing = pcodeMissing(basis)
  if (missing.length) { showToast('품번 생성 반려 — 미입력: ' + missing.join(', '), 'warning'); return }
  const serial = nextSerial(basis, { excludeCode: ownCode })
  if (serial === null) { showToast('이 분류+연도+시즌 그룹의 일련번호(00~99)가 소진되었습니다.', 'error'); return }
  const code = String(basis.cls) + String(basis.gen) + String(basis.typ) + String(basis.des) + String(basis.yearDigit) + String(basis.seasonNum) + serial
  if (!pcodeIsValidCode(code)) { showToast('품번 생성 반려 — 입력값을 확인하세요.', 'warning'); return }
  if (code !== ownCode && (
      State.allProducts.some(p => p.productCode === code) ||
      State.planItems.some(p => p.productCode === code && p.id !== _editingPlanId) ||
      _reservedCodes.has(code))) {
    showToast(`품번 "${code}"은 이미 사용 중입니다. 다시 생성해주세요.`, 'error'); return
  }
  if (_pdPendingCode && _pdPendingCode !== ownCode) _reservedCodes.delete(_pdPendingCode)
  _pdPendingCode = code
  if (code !== ownCode) _reservedCodes.add(code)
  const input = document.getElementById('pdProductCodeInput')
  if (input) input.value = code
  showToast(`품번 "${code}" 생성됨. 저장 버튼을 눌러 확정하세요.`, 'success')
}
window.genPdCode = genPdCode

function _pdUpdateHeaderBtns(mode) {
  // mode: 'view' | 'edit'
  document.querySelectorAll('#planDetailModal .pd-view-btn').forEach(b => {
    b.style.display = mode === 'view' ? 'inline-block' : 'none'
  })
  document.querySelectorAll('#planDetailModal .pd-edit-btn').forEach(b => {
    b.style.display = mode === 'edit' ? 'inline-block' : 'none'
  })
  // confirmBtn 숨김 상태(confirmed) 유지
  const item = State.planItems.find(p => p.id === _editingPlanId)
  if (item && item.confirmed) {
    const cb = document.getElementById('pdConfirmBtn')
    if (cb) cb.style.display = 'none'
  }
  // Delete button — only when in edit mode AND user has permission
  const delBtn = document.getElementById('pdDeleteBtn')
  if (delBtn) {
    const canDel = item ? canDeletePlanItem(item) : false
    delBtn.style.display = (mode === 'edit' && canDel) ? 'inline-block' : 'none'
  }
}

// Plan delete permission — author OR admin (grade >= 3)
function canDeletePlanItem(item) {
  if (!item) return false
  const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null
  const uid = user?.uid || ''
  const grade = (typeof _currentUserGrade !== 'undefined') ? (_currentUserGrade || 1) : 1
  if (grade >= 3) return true
  return !!uid && item.createdBy === uid
}
window.canDeletePlanItem = canDeletePlanItem

// Open delete confirmation modal — type-to-confirm pattern
function requestPlanDelete() {
  const item = State.planItems.find(p => p.id === _editingPlanId)
  if (!item) return
  if (!canDeletePlanItem(item)) {
    showToast('삭제 권한이 없습니다 (작성자 또는 관리자만 가능).', 'warning')
    return
  }
  const expected = (item.productCode && item.productCode.trim()) || (item.sampleNo && item.sampleNo.trim()) || ''
  if (!expected) {
    showToast('삭제 식별자(품번 또는 샘플번호)를 찾을 수 없습니다.', 'error')
    return
  }
  const modal = document.getElementById('planDeleteConfirmModal')
  if (!modal) return
  document.getElementById('pdcTargetCode').textContent = expected
  const meta = []
  if (item.productCode && item.productCode.trim() && item.sampleNo) meta.push('샘플번호: ' + item.sampleNo)
  if (item.nameKr) meta.push(item.nameKr)
  if (item.brand) meta.push(item.brand)
  document.getElementById('pdcTargetMeta').textContent = meta.join(' · ')
  document.getElementById('pdcInputLabel').textContent = `위 식별자(${expected})를 정확히 입력해주세요`
  const input = document.getElementById('pdcConfirmInput')
  input.value = ''
  input.classList.remove('pdc-input-match')
  input.placeholder = expected
  document.getElementById('pdcConfirmBtn').disabled = true
  modal._pdcExpected = expected
  modal._pdcTargetId = item.id
  if (typeof centerModal === 'function') centerModal(modal)
  modal.showModal()
  setTimeout(() => input.focus(), 80)
}
window.requestPlanDelete = requestPlanDelete

// Input handler — exact-match enables confirm button
function _pdcOnInput() {
  const input = document.getElementById('pdcConfirmInput')
  const modal = document.getElementById('planDeleteConfirmModal')
  if (!input || !modal) return
  const expected = modal._pdcExpected || ''
  const match = input.value === expected
  document.getElementById('pdcConfirmBtn').disabled = !match
  input.classList.toggle('pdc-input-match', match)
}
window._pdcOnInput = _pdcOnInput

function closePlanDeleteConfirm() {
  const modal = document.getElementById('planDeleteConfirmModal')
  if (modal && modal.open) modal.close()
}
window.closePlanDeleteConfirm = closePlanDeleteConfirm

// Execute delete — splice + persist + cleanup + close
async function confirmPlanDelete() {
  const modal = document.getElementById('planDeleteConfirmModal')
  if (!modal) return
  const targetId = modal._pdcTargetId
  const idx = State.planItems.findIndex(p => p.id === targetId)
  if (idx < 0) {
    showToast('삭제 대상을 찾을 수 없습니다 (이미 삭제됨).', 'warning')
    closePlanDeleteConfirm()
    return
  }
  const item = State.planItems[idx]
  // Permission re-check — defense against UI bypass
  if (!canDeletePlanItem(item)) {
    showToast('삭제 권한이 없습니다.', 'warning')
    closePlanDeleteConfirm()
    return
  }
  // Input match re-check
  const input = document.getElementById('pdcConfirmInput')
  const expected = modal._pdcExpected || ''
  if (!input || input.value !== expected) {
    showToast('식별자가 일치하지 않습니다.', 'warning')
    return
  }

  const btn = document.getElementById('pdcConfirmBtn')
  const originalText = btn.textContent
  btn.disabled = true
  btn.textContent = '삭제 중...'

  // Best-effort Storage cleanup — orphan prevention for tempImages uploads
  if (Array.isArray(item.tempImages) && item.tempImages.length && typeof storage !== 'undefined') {
    const paths = item.tempImages.map(t => t && t.path).filter(Boolean)
    for (const p of paths) {
      try { await storage.ref().child(p).delete() } catch (e) { console.warn('storage cleanup failed:', p, e) }
    }
  }

  // Splice + persist
  State.planItems.splice(idx, 1)
  State.plan.filtered = State.planItems.filter(p => !p.confirmed)
  try {
    await savePlanItems()
  } catch (e) {
    showToast('삭제 저장 실패: ' + (e.message || e), 'error')
    btn.disabled = false
    btn.textContent = originalText
    return
  }

  // Release any held edit lock
  try {
    if (typeof releaseEditLock === 'function') releaseEditLock('plan', targetId)
  } catch (e) {}

  // Activity log
  if (typeof logActivity === 'function') {
    logActivity('delete', '신규기획', `기획삭제: ${expected}${item.nameKr ? ' (' + item.nameKr + ')' : ''}`)
  }

  // Close both modals + refresh
  closePlanDeleteConfirm()
  if (typeof closePlanDetailModal === 'function') closePlanDetailModal(true)
  if (typeof renderPlanTable === 'function') renderPlanTable()
  if (typeof renderDashboard === 'function') renderDashboard()
  showToast('삭제됐습니다.', 'success')

  btn.disabled = false
  btn.textContent = originalText
}
window.confirmPlanDelete = confirmPlanDelete

function _pdSyncWatchBtn() {
  const btn = document.getElementById('pdWatchBtn')
  if (!btn || _editingPlanId == null) return
  const on = typeof isWatching === 'function' && isWatching('plan', _editingPlanId)
  btn.textContent = on ? '💛' : '🤍'
  btn.classList.toggle('active', on)
}
window._pdSyncWatchBtn = _pdSyncWatchBtn

function _pdSyncLockWarn() {
  const el = document.getElementById('pdLockWarn')
  if (!el) return
  const info = (typeof getEditLockInfo === 'function') ? getEditLockInfo('plan', _editingPlanId) : null
  if (info) {
    const _who = (typeof formatUserName === 'function') ? formatUserName(info.name, info.position) : (info.name || '다른 사용자')
    el.textContent = `🔒 ${_who} 편집중`; el.style.display = ''
  }
  else { el.textContent = ''; el.style.display = 'none' }
}
window._pdSyncLockWarn = _pdSyncLockWarn

function togglePlanDetailEdit() {
  const modal = document.getElementById('planDetailModal')
  const willEdit = !modal.classList.contains('edit-mode')
  if (willEdit) {
    const info = (typeof getEditLockInfo === 'function') ? getEditLockInfo('plan', _editingPlanId) : null
    if (info) {
      const who = (typeof formatUserName === 'function') ? formatUserName(info.name, info.position) : (info.name || '다른 사용자')
      showToast(`${who}님이 편집 중입니다`, 'warn')
      _pdSyncLockWarn()
      return
    }
    // 락 획득 실패 시 진입 차단 (TOCTOU 보호 — acquireEditLock 자체가 토스트 표시)
    if (typeof acquireEditLock === 'function' && !acquireEditLock('plan', _editingPlanId)) {
      _pdSyncLockWarn()
      return
    }
  } else {
    if (typeof releaseEditLock === 'function') releaseEditLock('plan', _editingPlanId)
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
  const item = State.planItems.find(p => p.id === _editingPlanId)
  if (!item) return
  const modal = document.getElementById('planDetailModal')

  // 정책: 신규기획은 샘플번호만 필수, 품번은 선택 입력.
  //       품번 강제 검증은 plan→product 이전 시점(confirmPlanToProduct)에서 수행.

  // 대기 중 파일 Storage 업로드
  const pendingCount = _planTempImages.filter(i => i._pending && i._file).length
  if (pendingCount) {
    showToast(`참고 이미지 업로드 중... (${pendingCount}개)`, 'info')
    try { await _uploadPendingPlanTempImages(item.id) }
    catch (err) { showToast('이미지 업로드 실패: ' + err.message, 'error'); return }
  }

  // 🔴 B2a: 6키 이미지 에디터 제거 → cafe24Main/sabangMain/cafe24DetailUrl/sabangDetailUrl(멀티 URL 문자열)은 일반 필드로 저장.
  // 일반 input/select/textarea
  modal.querySelectorAll('[data-pkey]').forEach(el => {
    const key = el.dataset.pkey
    const val = el.tagName === 'INPUT' && el.type === 'number' ? (parseFloat(el.value) || 0) : el.value
    item[key] = val
    if (key === 'assignee') {
      const u = (Array.isArray(window._allUsers) ? window._allUsers : []).find(x => x.uid === val)
      item.assigneeName = u ? (u.name || '') : ''
      item.assigneePosition = u ? (u.position || '') : ''
    }
  })

  // 🔴 B2b: yearDigit 를 year(전체연도)와 동기화(품번 코드 연도 필드=year 저장 · 프리필은 yearDigit 우선)
  if (typeof pcodeYearDigit === 'function' && item.year) item.yearDigit = pcodeYearDigit(item.year)

  // 🔴 B2a: 레거시 이미지 필드 opportunistic strip (대량 삭제 아님 — 재저장 항목만 dead field 제거)
  delete item.mainImage
  if (item.images && typeof item.images === 'object') {
    ;['sum','lemango','noir','external','design','shoot'].forEach(k => { delete item.images[k] })
  }

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
    if (typeof notifyWatchers === 'function') notifyWatchers('plan', item.id, '수정됨')
    if (typeof releaseEditLock === 'function') releaseEditLock('plan', item.id)
  } catch(e) {}
}

// 기획 항목 → 상품 객체 빌드 (단일/일괄 확정 공용 — 동일 산출 보장). stampCreated/_stampConfirmedBy/push 는 호출부에서.
//   ⚠️ no = State.allProducts.length + 1 (호출 시점 길이 기준) → 일괄은 build→push 를 항목마다 순차 반복해야 no 연속.
function _buildProductFromPlan(item) {
  const salesInit = {}
  _platforms.forEach(pl => { salesInit[pl] = 0 })

  const cloned = JSON.parse(JSON.stringify(item))
  delete cloned.no
  delete cloned.id          // 🔴 상품 식별 = productCode. 기획 id 를 상품에 넘기지 않음
  delete cloned.schedule
  delete cloned.confirmed
  delete cloned.confirmedAt
  delete cloned.confirmedBy         // 확정 스탬프(신규)도 클론에서 제거 → 상품엔 확정 시점 값으로 재스탬프
  delete cloned.confirmedByName
  delete cloned.createdBy
  delete cloned.createdByName
  delete cloned.createdAt
  delete cloned.lastModifiedBy
  delete cloned.lastModifiedByName
  delete cloned.lastModifiedAt
  // 🔴 B2a: 레거시 6키 images 는 상품 확정 시 미승계(dead-field). 대표 = cafe24Main/sabangMain(cloned 로 승계) + 레거시 mainImage(compat, cloned 로 승계).
  delete cloned.images

  return {
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
    tempImages: (item.tempImages || []).map(img => ({ ...img, fromPlan: true })),
    // 기획 일정 이력 (상품조회 하단에 표시)
    scheduleLog: item.schedule && Object.keys(item.schedule).length
      ? [{ confirmedAt: new Date().toISOString().slice(0, 10), schedule: JSON.parse(JSON.stringify(item.schedule)) }]
      : []
  }
}

// 확정자 기록(추적성, owner decision #4) — 상품 + 소스 기획 항목 양쪽에 스탬프.
//   confirmedAt = UTC ISO instant(정렬/불변 안전 — 표시는 kstFormat). createdBy(제작자)와 별개로 "누가 확정했나" 추적.
function _stampConfirmedBy(obj) {
  const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null
  obj.confirmedBy = (user && user.uid) || ''
  obj.confirmedByName = (typeof formatUserName === 'function') ? formatUserName(_currentUserName, _currentUserPosition) : (_currentUserName || '')
  obj.confirmedAt = new Date().toISOString()
  return obj
}

async function confirmPlanToProduct() {
  const item = State.planItems.find(p => p.id === _editingPlanId)
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

  // 플랜 아이템 → 상품 객체 생성 (공용 빌더 — 일괄 확정과 동일 산출)
  const newProduct = _buildProductFromPlan(item)
  stampCreated(newProduct)
  _stampConfirmedBy(newProduct)          // 확정자 기록(추적성) — 단일 확정도 스탬프
  State.allProducts.push(newProduct)
  item.confirmed = true
  stampModified(item)
  _stampConfirmedBy(item)                // 소스 기획 항목에도 확정자 기록
  savePlanItems().catch(e => console.error(e))

  // 상품조회/재고관리/매출현황/대시보드 일괄 갱신 (sales.filtered 누락 버그 수정)
  refreshAllProductViews()
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

  // 🔴 B2a: 갤러리 = 카페24 대표 + 사방넷 대표 + 레거시 mainImage(compat). 6키 미표시.
  const _pdLines = (typeof _imageUrlLines === 'function') ? _imageUrlLines : (s => String(s||'').split(/[\n\r]+/).map(u=>u.trim()).filter(Boolean))
  const prodImgs = [
    ..._pdLines(item.cafe24Main),
    ..._pdLines(item.sabangMain),
    ...(item.mainImage ? [item.mainImage] : [])
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
  const pf = (label, key, val, type = 'text', opts = '', spanClass = '', dispOverride = '', htmlBtn = false) => {
    const dispVal = dispOverride || (val !== null && val !== undefined && val !== '' ? String(val) : '-')
    const inputEl = type === 'select'
      ? `<select data-pkey="${key}">${opts}</select>`
      : type === 'textarea'
        ? `<textarea data-pkey="${key}" rows="3">${val || ''}</textarea>`
        : `<input type="${type}" data-pkey="${key}" value="${String(val || '').replace(/"/g, '&quot;')}" />`
    // 🔴 B2a: 상세 URL 필드용 [HTML 복사](기존 convertUrlsToHtml 재사용)
    const htmlBtnHtml = htmlBtn ? `<button type="button" class="img-html-btn" onclick="event.stopPropagation();copyUrlHtml('${key}')" title="이미지 URL → 상세페이지 HTML 복사" style="margin-left:6px">HTML 복사</button>` : ''
    return `<div class="dfield ${spanClass}">
      <span class="dfield-label">${label}${htmlBtnHtml}</span>
      <span class="dfield-value${dispVal === '-' ? ' empty' : ''}">${dispVal}</span>
      ${inputEl}
    </div>`
  }

  const brandOpts  = _settings.brands.map(b => `<option value="${b}"${item.brand===b?' selected':''}>${b}</option>`).join('')
  const typeOpts   = _settings.types.map(([v,l]) => `<option value="${v}"${item.type===v?' selected':''}>${l}</option>`).join('')
  const genderOpts = (typeof PCODE_GENDERS !== 'undefined' ? PCODE_GENDERS : [])
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
  // 🔴 프리필: Phase 3 엑셀 업로드로 저장된 코드필드 우선 → 없으면 기존 추측 → 기본값.
  //   (분류←classCode · 타입←typeCode · 연도←yearDigit · 시즌←season · 성별←genderCode/gender · 디자인←designCode)
  const clsGuess    = item.classCode || (item.brand?.includes('느와') ? 'NS' : 'LS')
  const typGuess    = item.typeCode  || (item.type === 'bikini' ? 'BK' : item.type === 'two piece' ? 'JM' : 'ON')
  // yearDigit(코드) 우선 → 전체연도('2026')서 역파생 → 기본 '6' (구 버그: String(item.year||'6') 는 '2026' 이 옵션과 불일치)
  const yearGuess   = item.yearDigit || (typeof pcodeYearDigit === 'function' ? pcodeYearDigit(item.year) : '') || '6'
  const seasonGuess = String(item.season || '1')          // season 필드 = 시즌 코드(=seasonNum)
  const genGuess    = item.genderCode || item.gender || 'W'
  const designGuess = item.designCode || ''               // 디자인 코드(있으면 hidden input 프리필)
  const CLS_OPT = (typeof _classCodes !== 'undefined' && Array.isArray(_classCodes) && _classCodes.length)
    ? _classCodes.map(([c, n]) => [c, n])
    : [['LS','르망고 수영복'],['LW','르망고 의류'],['LG','르망고 굿즈'],['NS','느와 수영복'],['NW','느와 의류'],['NG','느와 굿즈']]
  // 🔴 고정 세트는 core.js PCODE_* 단일 소스 참조(form + template + validator 공용)
  const TYP_OPT  = (typeof PCODE_TYPES   !== 'undefined' ? PCODE_TYPES : [])
  const GEN_OPT  = (typeof PCODE_GENDERS !== 'undefined' ? PCODE_GENDERS : [])
  const YEAR_OPT = (typeof PCODE_YEARS   !== 'undefined' ? PCODE_YEARS : []).map(([c]) => c)
  // 🔴 B2b: 패널 제거 → 코드 셀렉트 인라인(기본정보). data-pkey 로 저장(classCode/typeCode/gender/year/season/designCode/backStyle) — B1 create 미러 · onchange 프리뷰 없음.
  const mkSel = (id, opts, guess, dataKey) =>
    `<select id="${id}"${dataKey ? ` data-pkey="${dataKey}"` : ''}>${opts.map(([v,l]) => `<option value="${v}"${v===guess?' selected':''}>${v}${l?' - '+l:''}</option>`).join('')}</select>`
  // 연도 = 전체연도(item.year 저장) · genPdCode 가 yearDigit 파생
  const FULLYEAR_OPT = [['', '선택']].concat((typeof PCODE_YEARS !== 'undefined' ? PCODE_YEARS : []).map(([c, y]) => [y, y]))
  const yearFullGuess = item.year || (typeof pcodeYearFull === 'function' ? pcodeYearFull(yearGuess) : '') || ''
  // 🔴 B2b: 레거시 out-of-vocab 값 보존(free-text→select 전환 시 미편집 재저장으로 blank 화 방지)
  if (item.year && !FULLYEAR_OPT.some(([v]) => String(v) === String(item.year))) FULLYEAR_OPT.push([String(item.year), String(item.year) + ' (기존)'])
  const SEASON_OPT = [['','선택'],['1',''],['2',''],['3',''],['4',''],['5','']]
  if (item.season && !SEASON_OPT.some(([v]) => String(v) === String(item.season))) SEASON_OPT.push([String(item.season), String(item.season) + ' (기존)'])

  const pcVal = item.productCode || ''
  const productCodeField = `<div class="dfield dfield-span2">
    <span class="dfield-label">품번</span>
    <span class="dfield-value${!pcVal ? ' empty' : ''}">${pcVal || '-'}</span>
    <div class="pdcg-input-row">
      <input type="text" data-pkey="productCode" id="pdProductCodeInput" value="${pcVal}" placeholder="[품번 생성] 버튼으로 생성 · 직접 입력도 가능 · 없으면 공란" style="flex:1" />
      <button class="btn btn-accent" onclick="genPdCode()" style="font-size:11px;padding:4px 12px;white-space:nowrap">품번 생성</button>
    </div>
  </div>`

  // 🔴 B2b: 품번 코드 필드 그룹(기본정보 인라인, edit-only). 연도/시즌/성별/백스타일 = 가격/디자인서 이전(dedup) + 분류/타입 신규.
  const pdCgCodeGroup = `
    <div class="dfield dfield-span2 dcg-edit-only">
      <span class="dfield-label">품번 코드</span>
      <div class="pdcg-selects">
        <div class="pdcg-group"><label>연도</label>${mkSel('pdCgYear', FULLYEAR_OPT, yearFullGuess, 'year')}</div>
        <div class="pdcg-group"><label>시즌</label>${mkSel('pdCgSeason', SEASON_OPT, seasonGuess, 'season')}</div>
        <div class="pdcg-group"><label>분류</label>${mkSel('pdCgCls', CLS_OPT, clsGuess, 'classCode')}</div>
        <div class="pdcg-group"><label>성별</label>${mkSel('pdCgGen', [['','선택'], ...GEN_OPT], item.gender || '', 'gender')}</div>
        <div class="pdcg-group"><label>타입(품번)</label>${mkSel('pdCgTyp', TYP_OPT, typGuess, 'typeCode')}</div>
      </div>
      <div class="pdcg-design-row">
        <label>백스타일 (디자인 코드) — 코드·영문·한글 검색</label>
        <input type="text" id="pdCgDesignSearch" placeholder="코드 또는 패턴명 검색 (예: 1626 / Crossed / 크로스)" oninput="filterPdDesignList()" autocomplete="off" class="design-search-input" />
        <div id="pdCgDesignDropdown" class="design-dropdown" style="max-height:160px;overflow-y:auto"></div>
        <input type="hidden" id="pdCgDesign" data-pkey="designCode" value="${designGuess}" />
      </div>
    </div>`
  // 백스타일명(readonly 자동) — 뷰 모드에서도 표시(edit-only 아님). picker(selectPdDesign)가 채움.
  const pdBackStyleField = `
    <div class="dfield">
      <span class="dfield-label">백스타일명</span>
      <span class="dfield-value${!item.backStyle ? ' empty' : ''}">${item.backStyle || '-'}</span>
      <input type="text" data-pkey="backStyle" id="pdBackStyleName" value="${String(item.backStyle || '').replace(/"/g,'&quot;')}" placeholder="백스타일 선택 시 자동" readonly />
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

  // 🔴 B2c: 공용 코어 6섹션(가격/소재/사이즈규격/가이드/제조/이미지) — 상품 상세와 단일 소스 공유(mode='plan'→data-pkey)
  const core = (typeof buildDetailCommonSections === 'function') ? buildDetailCommonSections(item, 'plan') : null
  document.getElementById('pdContent').innerHTML = `
    ${plPinnedMemoBlock}
    <div class="pd-section">
      <div class="pd-section-title">상품 이미지 <span class="plan-img-badge plan-img-badge-prod">상품</span></div>
      <div class="pd-img-row">${prodImgHtml}</div>
      ${item.confirmed ? '' : `<div style="margin-top:12px;text-align:right"><button class="srm-btn-gold" id="pdConfirmBtn" disabled onclick="confirmPlanWithCheck()">상품확정 →</button></div>`}
    </div>
    <div class="pd-section">
      <div class="pd-section-title">참고 이미지 <span class="plan-img-badge plan-img-badge-temp">임시</span></div>
      <div class="plan-img-desc" style="padding:0 12px 6px">라벨 슬롯에 <b>Ctrl+V 붙여넣기</b>·드래그·파일·URL 로 등록(스타일=대표). 슬롯 클릭 후 붙여넣기 또는 아무데서나 붙여넣으면 첫 빈 슬롯으로 들어갑니다.</div>
      <div class="plan-img-grid" id="planTempImgGrid"></div>
      <div class="plan-edit-img-actions" style="margin-top:8px">
        <button type="button" class="plan-img-btn" onclick="addPlanTempImageUrl()">+ 기타 URL</button>
        <label class="plan-img-btn plan-img-upload-label">
          + 기타 파일
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
        ${(() => {
          const m = (typeof resolveColorMaster === 'function')
            ? resolveColorMaster({ code: item.colorCode, nameKr: item.colorKr, nameEn: item.colorEn })
            : null
          const swatchHtml = m
            ? (m.isPattern
                ? '<span class="cp-swatch cp-swatch-pattern">🎨</span>'
                : `<span class="cp-swatch" style="background:${m.hex || '#ccc'}"></span>`)
            : ''
          const viewText = m
            ? `${m.nameKr} - ${m.nameEn} (${m.code})`
            : (item.colorKr ? item.colorKr + (item.colorEn ? ' - ' + item.colorEn : '') : '-')
          const pickerHtml = (typeof buildColorPickerHtml === 'function')
            ? buildColorPickerHtml('pdColorPicker', { code: item.colorCode, nameKr: item.colorKr, nameEn: item.colorEn }, {
                krId: 'pdColorKr', enId: 'pdColorEn', codeId: 'pdColorCode',
                dataPkey: { kr: 'colorKr', en: 'colorEn', code: 'colorCode' }
              })
            : ''
          return `<div class="dfield dfield-color dfield-span2">
            <span class="dfield-label">색상</span>
            <span class="dfield-value${!viewText || viewText === '-' ? ' empty' : ''}">${swatchHtml}${viewText}</span>
            ${pickerHtml}
          </div>`
        })()}
        ${plAssigneeField}
        ${pdBackStyleField}
        ${pdCgCodeGroup}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">가격 / 디자인</div>
      <div class="dfields-grid">
        ${core.price}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">소재</div>
      <div class="dfields-grid">
        ${core.material}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">사이즈 규격 <button type="button" class="img-html-btn-all" onclick="event.stopPropagation();copySizeGuideHtml()">사이즈 HTML 복사</button></div>
      <div style="padding:10px 12px">
        ${core.sizeSpec}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">가이드</div>
      <div class="dfields-grid">
        ${core.guide}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">제조 정보</div>
      <div class="dfields-grid">
        ${core.made}
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">이미지 URL</div>
      <div class="dfields-grid">
        ${core.image}
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
    ${buildCommentSection('plan', item.id)}`
}

// ===== 일괄 일정 설정 =====
function togglePlanCheckAll(checked) {
  const data = applyColFilters(State.plan.filtered, State.plan.columnFilters)
  data.forEach(item => {
    if (checked) _planSelected.add(item.id)
    else _planSelected.delete(item.id)
  })
  renderPlanTable()
}

function updatePlanSelection() {
  document.querySelectorAll('.np-check').forEach(cb => {
    const id = parseInt(cb.dataset.id)
    if (cb.checked) _planSelected.add(id)
    else _planSelected.delete(id)
  })
  renderPlanToolbar()
  updateCheckAllState()
}

function updateCheckAllState() {
  const cb = document.getElementById('npCheckAll')
  if (!cb) return
  const data = applyColFilters(State.plan.filtered, State.plan.columnFilters)
  const count = data.filter(item => _planSelected.has(item.id)).length
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
    if (!_planSelected.has(item.id)) return
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

// ===== 상품 일괄 확정 (bulk product confirm) =====
// 선택된 미확정(pending) 기획 항목을 상품으로 일괄 확정. applyBulkSchedule 패턴 + 원자 저장.
//   ① 검증 패스(품번 없음 / 이미 존재 / 배치 내 중복) → toConfirm / skipped 분할
//   ② 단일 확인 다이얼로그(count + skip preview) — N개 개별 korConfirm 아님
//   🔴 ③ 원자 저장: in-memory 반영 → 단일 db.batch(products chunks + meta + planItems, 전부 sharedData) → 실패 시 in-memory 롤백.
//      단일 확정의 fire-and-forget 이중 write(orphan 상품 위험)를 일괄 경로에서 제거 — half-applied 상태 구조적 불가.
//   확정자 스탬프(confirmedBy/Name/At)로 추적성. navigation 없음(탭 전환/모달 X) — 요약 후 목록 재필터(확정분 pending 필터에서 이탈).
let _bulkConfirmInFlight = false
async function applyBulkConfirm() {
  if (_bulkConfirmInFlight) return
  const selected = State.planItems.filter(p => _planSelected.has(p.id))
  if (!selected.length) { showToast('상품을 먼저 선택해주세요.', 'warning'); return }
  const alreadyConfirmed = selected.filter(p => p.confirmed).length
  const pending = selected.filter(p => !p.confirmed)

  // ── 검증 패스: 유효/제외 분할 (품번 없음 / 이미 존재 / 배치 내 중복) ──
  const existingCodes = new Set(State.allProducts.map(p => p.productCode))
  const batchCodes = new Set()
  const toConfirm = [], skipped = []
  pending.forEach(item => {
    const code = (item.productCode || '').trim()
    if (!code) { skipped.push({ item, reason: '품번 없음' }); return }
    if (existingCodes.has(code)) { skipped.push({ item, reason: '이미 존재하는 품번' }); return }
    if (batchCodes.has(code)) { skipped.push({ item, reason: '중복 품번(배치 내)' }); return }
    batchCodes.add(code)
    toConfirm.push(item)
  })
  const _label = it => it.productCode || it.sampleNo || '(무품번)'
  const _skipLines = (arr, n) => arr.slice(0, n).map(s => `· ${_label(s.item)} — ${s.reason}`).join('\n') + (arr.length > n ? `\n…외 ${arr.length - n}건` : '')

  if (!toConfirm.length) {
    // 확정 가능 0건 — 사유별 집계 토스트(정보). korConfirm 빈-취소버튼 회피.
    const byReason = {}
    skipped.forEach(s => { byReason[s.reason] = (byReason[s.reason] || 0) + 1 })
    const parts = Object.keys(byReason).map(r => `${r} ${byReason[r]}건`)
    if (alreadyConfirmed) parts.push(`이미확정 ${alreadyConfirmed}건`)
    showToast(`확정 가능한 항목이 없습니다${parts.length ? ` (${parts.join(' · ')})` : ''}`, 'warning')
    return
  }

  // ── 단일 확인 다이얼로그 (count + skip preview) ──
  let msg = `선택 ${selected.length}건 중 ${toConfirm.length}건을 상품으로 확정합니다.`
  if (alreadyConfirmed) msg += `\n(이미 확정된 ${alreadyConfirmed}건 제외)`
  if (skipped.length) msg += `\n\n제외 ${skipped.length}건:\n${_skipLines(skipped, 8)}`
  msg += `\n\n계속하시겠습니까?`
  if (!await korConfirm(msg, `${toConfirm.length}건 확정`, '취소')) return

  if (!db) { showToast('서버 연결 없음 — 잠시 후 다시 시도하세요', 'warning'); return }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { showToast('오프라인 상태 — 연결 확인 후 확정하세요', 'warning'); return }

  _bulkConfirmInFlight = true
  try {
    // 롤백 스냅샷 — 상품 push 이전 길이 + 소스 기획 항목의 변경 필드 (apply 루프 이전 캡처)
    const origLen = State.allProducts.length
    const planSnap = toConfirm.map(it => ({
      it,
      confirmed: it.confirmed,
      hadCB: ('confirmedBy' in it), confirmedBy: it.confirmedBy,
      hadCBN: ('confirmedByName' in it), confirmedByName: it.confirmedByName,
      hadCA: ('confirmedAt' in it), confirmedAt: it.confirmedAt,
      lastModifiedBy: it.lastModifiedBy, lastModifiedByName: it.lastModifiedByName, lastModifiedAt: it.lastModifiedAt
    }))
    const rollback = () => {
      State.allProducts.length = origLen   // 끝에서 truncate — push 한 신규 상품 제거(단일스레드라 안전; 부분 apply 도 안전)
      planSnap.forEach(s => {
        s.it.confirmed = s.confirmed
        s.it.lastModifiedBy = s.lastModifiedBy; s.it.lastModifiedByName = s.lastModifiedByName; s.it.lastModifiedAt = s.lastModifiedAt
        if (s.hadCB) s.it.confirmedBy = s.confirmedBy; else delete s.it.confirmedBy
        if (s.hadCBN) s.it.confirmedByName = s.confirmedByName; else delete s.it.confirmedByName
        if (s.hadCA) s.it.confirmedAt = s.confirmedAt; else delete s.it.confirmedAt
      })
    }

    const created = []
    // 🔴 apply(in-memory) + 원자 batch 저장 전체를 하나의 try 로 감쌈 → build/직렬화/commit 어느 단계 예외든 rollback (half-applied 구조적 방지)
    try {
      // in-memory 반영 (단일 확정과 동일 빌드 — build→push 순차 반복으로 no 연속)
      toConfirm.forEach(item => {
        const np = _buildProductFromPlan(item)
        stampCreated(np)
        _stampConfirmedBy(np)
        State.allProducts.push(np)
        item.confirmed = true
        stampModified(item)
        _stampConfirmedBy(item)
        created.push(np)
      })

      // 단일 원자 batch: products 청크 전체 + meta + planItems (전부 sharedData 문서 → 한 커밋으로 원자)
      const nowIso = new Date().toISOString()
      const all = State.allProducts
      const chunks = Math.ceil(all.length / _FS_PRODUCT_CHUNK)
      if (chunks + 2 > 450) { rollback(); renderPlanTable(); showToast('상품 수가 너무 많아 한 번에 저장할 수 없습니다 — 나눠서 확정하세요', 'warning'); return }
      const batch = db.batch()
      for (let i = 0; i < chunks; i++) {
        const slice = all.slice(i * _FS_PRODUCT_CHUNK, (i + 1) * _FS_PRODUCT_CHUNK)
        batch.set(db.collection('sharedData').doc('products_' + i), { data: JSON.stringify(slice), updatedAt: nowIso })
      }
      batch.set(db.collection('sharedData').doc('products_meta'), { chunks, total: all.length, updatedAt: nowIso })
      batch.set(db.collection('sharedData').doc('planItems'), { data: JSON.stringify(State.planItems), updatedAt: nowIso })
      await batch.commit()
    } catch (e) {
      console.error('applyBulkConfirm 저장 실패:', e && e.message)
      rollback()                    // 🔴 build/직렬화/commit 어느 예외든 in-memory 완전 원복 → half-applied 없음
      renderPlanTable()
      showToast('저장 실패 — 반영되지 않았습니다. 네트워크 확인 후 다시 시도하세요.', 'error')
      return
    }

    // 성공: localStorage/타임스탬프 동기화(자기 에코 억제 — savePlanItems/saveProducts 미러)
    try { localStorage.setItem('lemango_plan_items_v1', JSON.stringify(State.planItems)) } catch (e) {}
    window._lastProductSaveTime = Date.now()
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['planItems'] = Date.now()

    // 후처리 (1회): 상품 뷰 갱신 ONCE, 선택 해제 + 목록 재필터(확정분 pending 필터 이탈), 로그/이력, 요약
    refreshAllProductViews()
    _planSelected.clear()
    if (typeof searchPlan === 'function') searchPlan(); else renderPlanTable()
    logActivity('create', '신규기획', `상품 일괄 확정 — ${created.length}건 (제외 ${skipped.length}건)`)
    created.forEach(np => { try { if (typeof addProductHistory === 'function') addProductHistory(np.productCode, '기획이전', '기획→상품 일괄확정') } catch (e) {} })
    showToast(`${created.length}건 상품 확정 완료${skipped.length ? ` · ${skipped.length}건 제외` : ''}${alreadyConfirmed ? ` · 이미확정 ${alreadyConfirmed}건` : ''}`, 'success')
  } finally {
    _bulkConfirmInFlight = false
  }
}
