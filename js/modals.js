// =============================================
// ===== 🔴 전역 이미지 뷰어(라이트박스) — 새 탭 오픈 대체, 앱 전역 단일 컴포넌트 =====
// =============================================
// openImageViewer(images, startIndex): images = URL 문자열 배열 또는 {url,label?,caption?,name?} 객체 배열(혼용 OK).
//   메타 라인 = label · caption (B3 슬롯) / 아니면 파일명·URL 호스트. ◀▶(다중), ESC/backdrop/✕ 닫기, 로딩 스피너·오류 플레이스홀더.
function openImageViewer(images, startIndex) {
  const arr = (Array.isArray(images) ? images : [images])
    .map(x => (typeof x === 'string') ? { url: x } : (x || {}))
    .filter(x => x && x.url)
  if (!arr.length) return
  State.modal.images = arr
  State.modal.idx = Math.max(0, Math.min(startIndex || 0, arr.length - 1))
  updateModal()
  document.getElementById('imageModal').showModal()
}
window.openImageViewer = openImageViewer

// 하위호환: 기존 openModal(idx, images) 호출부(상품조회 테이블 등)는 그대로 → 뷰어로 위임.
function openModal(idx, images) { openImageViewer(images, idx) }

// 🔴 단일 닫기 루틴 — ✕/ESC/backdrop/프로그램 전 경로 공통. close() + 이미지 src/스피너/오류 상태 정리(잔상 방어).
function closeImageViewer() {
  const modal = document.getElementById('imageModal')
  if (!modal) return
  modal.close()
  const imgEl = document.getElementById('modalImg')
  if (imgEl) { imgEl.onload = null; imgEl.onerror = null; imgEl.src = ''; imgEl.style.visibility = '' }
  const spinner = document.getElementById('modalSpinner'); if (spinner) spinner.style.display = 'none'
  const errEl = document.getElementById('modalError'); if (errEl) errEl.style.display = 'none'
}
window.closeImageViewer = closeImageViewer

function _imgMetaText(im) {
  if (!im) return ''
  const bits = []
  if (im.label) bits.push(im.label)
  if (im.caption) bits.push(im.caption)
  if (bits.length) return bits.join(' · ')
  if (im.name) return im.name
  try { const u = new URL(im.url); return u.hostname } catch (e) { return String(im.url || '') }
}

function updateModal() {
  const { images, idx } = State.modal
  const im = (images && images[idx]) || {}
  const imgEl = document.getElementById('modalImg')
  const spinner = document.getElementById('modalSpinner')
  const errEl = document.getElementById('modalError')
  if (spinner) spinner.style.display = ''
  if (errEl) errEl.style.display = 'none'
  if (imgEl) {
    imgEl.style.visibility = 'hidden'
    imgEl.onload = () => { if (spinner) spinner.style.display = 'none'; imgEl.style.visibility = 'visible' }
    imgEl.onerror = () => { if (spinner) spinner.style.display = 'none'; imgEl.style.visibility = 'hidden'; if (errEl) errEl.style.display = '' }
    imgEl.src = im.url || ''
    // 🔴 캐시된/동일 이미지 재오픈 시 onload 미발화 → 동기 완료 처리(스피너 잔존 방지)
    if (imgEl.complete && imgEl.naturalWidth) { if (spinner) spinner.style.display = 'none'; imgEl.style.visibility = 'visible' }
  }
  const cnt = document.getElementById('modalCounter'); if (cnt) cnt.textContent = images.length > 1 ? `${idx + 1} / ${images.length}` : ''
  const prev = document.getElementById('modalPrev'); if (prev) prev.style.display = images.length > 1 ? '' : 'none'
  const next = document.getElementById('modalNext'); if (next) next.style.display = images.length > 1 ? '' : 'none'
  const meta = document.getElementById('modalMeta'); if (meta) meta.textContent = _imgMetaText(im)
  const orig = document.getElementById('modalOrig'); if (orig) orig.href = im.url || '#'
}

function modalNav(dir) {
  const { images } = State.modal
  if (!images || images.length < 2) return
  State.modal.idx = (State.modal.idx + dir + images.length) % images.length
  updateModal()
}

// ESC/◀▶ — imageModal 이 최상위 dialog(showModal)라 ESC 는 뷰어를 먼저 닫음(하위 상세 모달 유지). arrows=페이지 스크롤 방지.
document.addEventListener('keydown', e => {
  const modal = document.getElementById('imageModal')
  if (!modal || !modal.open) return
  if (e.key === 'ArrowLeft')  { e.preventDefault(); modalNav(-1) }
  else if (e.key === 'ArrowRight') { e.preventDefault(); modalNav(1) }
  // 🔴 ESC 스택: preventDefault 로 네이티브 dialog ESC(다음 하위 dialog 닫기)까지 억제 → 뷰어만 닫고 상세 모달 유지.
  else if (e.key === 'Escape')     { e.preventDefault(); e.stopPropagation(); closeImageViewer() }
}, true)   // capture: 하위 모달 핸들러보다 먼저 처리
// backdrop(다이얼로그 바깥 영역) 클릭 → 닫기 (단일 close 루틴)
;(function () {
  const m = document.getElementById('imageModal')
  if (m) m.addEventListener('click', e => { if (e.target === m || e.target.classList.contains('modal-img-wrap')) closeImageViewer() })
})()

// 🔴 상품 상세 참고 이미지(tempImages) 뷰어 — 라벨/캡션 포함 세트로 ◀▶ 순환.
function _prodTempViewer(idx) {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  const all = (p && Array.isArray(p.tempImages)) ? p.tempImages : []
  const set = all.filter(t => t && t.url).map(t => ({ url: t.url, label: t.label, caption: t.caption, name: t.name }))
  const clicked = all[idx]
  const start = clicked ? set.findIndex(s => s.url === clicked.url) : 0
  openImageViewer(set, start < 0 ? 0 : start)
}
window._prodTempViewer = _prodTempViewer

// =============================================
// ===== 범용 드래그 + 리사이즈 초기화 =====
// =============================================
function makeDraggableResizable(modal, minW = 420, minH = 300) {
  if (!modal || modal._dragInit) return   // 중복 초기화 방지
  const header = modal.querySelector('.srm-modal-header, .srm-header, .rmodal-header, .dmodal-header')
  if (!header) return
  modal._dragInit = true

  let action = null, startX, startY, origLeft, origTop, origW, origH

  function snapRect() {
    const r = modal.getBoundingClientRect()
    modal.style.left   = r.left   + 'px'
    modal.style.top    = r.top    + 'px'
    modal.style.width  = r.width  + 'px'
    modal.style.height = r.height + 'px'
  }

  // 드래그
  header.addEventListener('mousedown', e => {
    if (e.target.closest('button, input, label, select, textarea, a')) return
    snapRect()
    action = 'drag'
    startX = e.clientX; startY = e.clientY
    origLeft = parseFloat(modal.style.left)
    origTop  = parseFloat(modal.style.top)
    e.preventDefault()
  })

  // 리사이즈 핸들 주입 (이미 있으면 스킵)
  const DIRS = ['t','b','l','r','lt','rt','lb','rb']
  DIRS.forEach(dir => {
    if (modal.querySelector(`.resize-handle.${dir}`)) return
    const h = document.createElement('div')
    h.className = `resize-handle ${dir}`
    h.dataset.dir = dir
    modal.appendChild(h)
    h.addEventListener('mousedown', e => {
      snapRect()
      action = dir
      startX = e.clientX; startY = e.clientY
      origLeft = parseFloat(modal.style.left); origTop = parseFloat(modal.style.top)
      origW = parseFloat(modal.style.width);   origH  = parseFloat(modal.style.height)
      e.preventDefault(); e.stopPropagation()
    })
  })

  document.addEventListener('mousemove', e => {
    if (!action) return
    const dx = e.clientX - startX, dy = e.clientY - startY
    if (action === 'drag') {
      modal.style.left = Math.max(0, Math.min(origLeft + dx, window.innerWidth  - modal.offsetWidth))  + 'px'
      modal.style.top  = Math.max(0, Math.min(origTop  + dy, window.innerHeight - modal.offsetHeight)) + 'px'
      return
    }
    let newL = origLeft, newT = origTop, newW = origW, newH = origH
    if (action.includes('r'))  newW = Math.max(minW, origW + dx)
    if (action.includes('l')) { newW = Math.max(minW, origW - dx); newL = origLeft + origW - newW }
    if (action.includes('b'))  newH = Math.max(minH, origH + dy)
    if (action.includes('t')) { newH = Math.max(minH, origH - dy); newT = origTop  + origH - newH }
    newL = Math.max(0, Math.min(newL, window.innerWidth  - newW))
    newT = Math.max(0, Math.min(newT, window.innerHeight - newH))
    modal.style.left = newL + 'px'; modal.style.top  = newT  + 'px'
    modal.style.width = newW + 'px'; modal.style.height = newH + 'px'
  })

  document.addEventListener('mouseup', () => { action = null })
}

function centerModal(modal) {
  if (!modal) return
  modal.style.left = ''
  modal.style.top  = ''
  const apply = () => {
    modal.style.left = Math.max(0, (window.innerWidth  - modal.offsetWidth)  / 2) + 'px'
    modal.style.top  = Math.max(0, (window.innerHeight - modal.offsetHeight) / 2) + 'px'
  }
  if (modal.offsetWidth && modal.offsetHeight) apply()
  requestAnimationFrame(apply)
}

// 모든 .srm-modal 다이얼로그는 showModal() 직후 자동으로 중앙 배치
// 모든 dialog 는 showModal() 직후 스크롤을 최상단으로 리셋 (이전 위치 기억 안 함)
;(function patchShowModal() {
  if (typeof HTMLDialogElement === 'undefined') return
  const proto = HTMLDialogElement.prototype
  if (proto.__srmCenterPatched) return
  proto.__srmCenterPatched = true
  const orig = proto.showModal
  proto.showModal = function () {
    const ret = orig.apply(this, arguments)
    if (this.classList && this.classList.contains('srm-modal')) {
      centerModal(this)
    }
    // 모든 다이얼로그: 스크롤을 최상단으로 리셋
    try {
      this.scrollTop = 0
      const bodies = this.querySelectorAll('.srm-body, .srm-modal-body, [class*="modal-body"], .modal-body, .dlg-body, dialog > div')
      bodies.forEach(el => { try { el.scrollTop = 0 } catch(e) {} })
    } catch(e) {}
    return ret
  }
})()

function copyFieldUrl(key, btn) {
  const modal = document.getElementById('detailModal')
  const isEdit = modal.classList.contains('edit-mode')
  let text = ''
  if (isEdit) {
    const el = modal.querySelector(`[data-key="${key}"]`)
    text = el ? el.value.trim() : ''
  } else {
    const el = modal.querySelector(`[data-urlkey="${key}"]`)
    text = el ? el.textContent.trim() : ''
    if (text === '-') text = ''
  }
  copyToClipboard(text, btn)
}

function copySingleUrlFromBtn(btn) {
  const modal = document.getElementById('detailModal')
  const isEdit = modal.classList.contains('edit-mode')
  let url = ''
  if (isEdit) {
    const dfield = btn.closest('.dfield')
    const textarea = dfield ? dfield.querySelector('textarea') : null
    url = textarea ? textarea.value.trim() : (btn.dataset.url || '')
  } else {
    url = btn.dataset.url || ''
  }
  copyToClipboard(url, btn)
}

// =============================================
// ===== 상품 상세 모달 =====
// =============================================
let _detailCode = null        // 현재 열린 상품 코드
let _detailPendingCode = null  // 상세 모달 품번 생성 패널에서 임시 예약한 코드

async function openDetailModal(productCode, opts) {
  opts = opts || {}
  const readOnly = !!opts.readOnly
  // 🔴 fromTrash = 휴지통 메뉴에서 열림(복원/영구삭제 파괴적 액션 허용). 분석 화면(매트릭스 등)은 readOnly 만 → 파괴적 액션 절대 노출 금지.
  const fromTrash = !!opts.fromTrash
  const p = State.allProducts.find(x => x.productCode === productCode)
  if (!p) return
  _detailCode = productCode

  // 담당자 드롭다운을 위해 사용자 목록 선로드
  if ((!window._allUsers || window._allUsers.length === 0) && typeof loadAllUsers === 'function') {
    try { await loadAllUsers() } catch(e) {}
  }

  const modal = document.getElementById('detailModal')
  modal.classList.remove('edit-mode')
  // Read-only flag (used by _dUpdateHeaderBtns + toggleDetailEdit guards)
  if (readOnly) modal.dataset.readonly = '1'
  else delete modal.dataset.readonly
  // fromTrash flag (used by _dUpdateHeaderBtns to gate 복원/영구삭제 = 휴지통 메뉴 전용)
  if (fromTrash) modal.dataset.fromtrash = '1'
  else delete modal.dataset.fromtrash
  // Inject/remove read-only banner (fromTrash=휴지통 배너 · 그 외 삭제상품=중립 [삭제된 상품] 표시)
  _renderDetailReadOnlyBanner(p, readOnly, fromTrash)
  _dUpdateHeaderBtns('view')
  // 품번확정 버튼 상태 — 읽기전용(휴지통)에서는 항상 숨김 (이전 false-PASS 수정)
  const lockBtn = document.getElementById('dLockCodeBtn')
  if (lockBtn) {
    if (readOnly) {
      lockBtn.style.display = 'none'
    } else {
      lockBtn.style.display = p.productCodeLocked ? 'none' : 'inline-block'
      lockBtn.textContent = '🔒 품번 확정'
    }
  }
  // 삭제 버튼 (작성자 OR grade>=3)
  const deleteBtn = document.getElementById('dDeleteBtn')
  if (deleteBtn) {
    const uid = typeof firebase !== 'undefined' ? firebase.auth().currentUser?.uid : null
    const grade = State.currentUser?.grade || 0
    const canDel = (grade >= 3) || (p.createdBy && p.createdBy === uid)
    if (canDel) delete deleteBtn.dataset.hidden
    else deleteBtn.dataset.hidden = '1'
  }
  // 위치 초기화 (매번 열릴 때 중앙으로)
  modal.style.left = ''
  modal.style.top  = ''

  // 헤더
  document.getElementById('dBrand').textContent   = p.brand
  document.getElementById('dNameKr').textContent  = p.nameKr || ''
  document.getElementById('dCode').textContent    = p.productCode

  // 이미지 네비게이션 초기화
  initDetailImages(p)

  // 영상
  const vw = document.getElementById('dVideoWrap')
  if (p.videoUrl) {
    document.getElementById('dVideoLink').href = p.videoUrl
    vw.style.display = ''
  } else {
    vw.style.display = 'none'
  }

  // 오른쪽 상세 내용
  document.getElementById('dDetailContent').innerHTML = buildDetailContent(p)
  // 🔴 B2b: 품번 코드 디자인 picker 드롭다운 초기화(패널 제거 → 기본정보 인라인). 현재 디자인 placeholder 표기.
  if (typeof filterDetailDesignList === 'function' && document.getElementById('dCgDesignDropdown')) {
    const dcur = document.getElementById('dCgDesign')?.value
    const de = (typeof _designCodes !== 'undefined') ? _designCodes.find(([c]) => c === dcur) : null
    const dsearch = document.getElementById('dCgDesignSearch')
    if (dsearch && de) dsearch.placeholder = `${de[0]} - ${de[1]} (${de[2]})`
    filterDetailDesignList()
  }

  modal.showModal()
  centerModal(modal)
  _dSyncWatchBtn()
  _dSyncLockWarn()
  loadComments('product', p.productCode)
  if (typeof pushModalHistory === 'function') pushModalHistory('product', p.productCode)
  const favBtn = document.getElementById('dFavBtn')
  if (favBtn) {
    const on = typeof isFavorite === 'function' && isFavorite('product', p.productCode)
    favBtn.textContent = on ? '★' : '☆'
    favBtn.classList.toggle('fav-on', on)
  }
}

// ===== 상세 모달 이미지 네비게이션 =====
const FALLBACK_LOGO = (typeof PLACEHOLDER_IMG !== 'undefined') ? PLACEHOLDER_IMG : 'assets/logo-placeholder.png'
let _detailImgList = []
let _detailImgIdx = 0

function getDetailImages(p) {
  // 🔴 B2a: 카페24 대표 + 사방넷 대표 + 레거시 mainImage(compat). 6키 에디터 제거 → 갤러리에서 6키 미표시.
  const imgs = []
  const push = (u) => { if (u && !imgs.includes(u)) imgs.push(u) }
  ;(typeof _imageUrlLines === 'function' ? _imageUrlLines(p.cafe24Main) : []).forEach(push)
  ;(typeof _imageUrlLines === 'function' ? _imageUrlLines(p.sabangMain) : []).forEach(push)
  push(p.mainImage)   // 레거시 대표 compat
  return imgs
}

function initDetailImages(p) {
  _detailImgList = getDetailImages(p)
  _detailImgIdx = 0

  const mainImg = document.getElementById('dImgMain')
  const noneEl  = document.getElementById('dImgNone')
  mainImg.src = _detailImgList[0] || FALLBACK_LOGO
  mainImg.style.display = ''
  noneEl.style.display = 'none'
  mainImg.style.cursor = 'pointer'
  mainImg.title = '클릭하면 크게 보기'
  mainImg.onclick = () => { if (_detailImgList.length) openImageViewer(_detailImgList, _detailImgIdx) }   // 🔴 뷰어(새 탭 대체)

  // 화살표 표시/숨김
  const hasMulti = _detailImgList.length > 1
  document.getElementById('dImgPrev').style.display = hasMulti ? '' : 'none'
  document.getElementById('dImgNext').style.display = hasMulti ? '' : 'none'
  updateDetailImgCounter()
  renderDetailThumbs()
}

function updateDetailMainImg() {
  const img = document.getElementById('dImgMain')
  if (_detailImgList.length > 0) {
    img.src = _detailImgList[_detailImgIdx]
  }
  updateDetailImgCounter()
  // 썸네일 active 동기화
  document.querySelectorAll('#dImgThumbs .dimg-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === _detailImgIdx)
  })
}

function updateDetailImgCounter() {
  const counter = document.getElementById('dImgCounter')
  if (_detailImgList.length > 1) {
    counter.textContent = `${_detailImgIdx + 1} / ${_detailImgList.length}`
    counter.style.display = ''
  } else {
    counter.style.display = 'none'
  }
}

function detailImgPrev() {
  if (_detailImgList.length <= 1) return
  _detailImgIdx = (_detailImgIdx - 1 + _detailImgList.length) % _detailImgList.length
  updateDetailMainImg()
}

function detailImgNext() {
  if (_detailImgList.length <= 1) return
  _detailImgIdx = (_detailImgIdx + 1) % _detailImgList.length
  updateDetailMainImg()
}

function detailImgGoTo(idx) {
  _detailImgIdx = idx
  updateDetailMainImg()
}

let _thumbMoved = 0

function renderDetailThumbs() {
  const container = document.getElementById('dImgThumbs')
  if (!container) return
  if (_detailImgList.length <= 1) { container.innerHTML = ''; return }
  container.innerHTML = _detailImgList.map((url, i) =>
    `<img class="dimg-thumb${i === _detailImgIdx ? ' active' : ''}" src="${url}" draggable="false" onmouseup="if(_thumbMoved<5)detailImgGoTo(${i})" onerror="this.onerror=null;this.src=PLACEHOLDER_IMG" />`
  ).join('')
  _initThumbDragScroll(container)
}

function _initThumbDragScroll(el) {
  let isDown = false, startX = 0, scrollLeft = 0

  el.onmousedown = function(e) {
    isDown = true
    _thumbMoved = 0
    startX = e.pageX
    scrollLeft = el.scrollLeft
    el.style.cursor = 'grabbing'
    e.preventDefault()
  }

  document.addEventListener('mousemove', function(e) {
    if (!isDown) return
    const dx = e.pageX - startX
    _thumbMoved = Math.abs(dx)
    el.scrollLeft = scrollLeft - dx
  })

  document.addEventListener('mouseup', function() {
    if (!isDown) return
    isDown = false
    el.style.cursor = 'grab'
  })

  el.ontouchstart = function(e) {
    startX = e.touches[0].pageX
    scrollLeft = el.scrollLeft
    _thumbMoved = 0
  }
  el.ontouchmove = function(e) {
    const dx = e.touches[0].pageX - startX
    _thumbMoved = Math.abs(dx)
    el.scrollLeft = scrollLeft - dx
  }
}

function buildProductHistoryHtml(productCode) {
  const list = (typeof getProductHistory === 'function' ? getProductHistory(productCode) : []) || []
  if (!list.length) {
    return `<div class="prod-history-section">
      <div class="phs-title">이력</div>
      <div class="phs-empty">이력 없음</div>
    </div>`
  }
  const rows = list.slice().reverse().map(h => {
    const when = (typeof timeAgo === 'function' && h.ts) ? timeAgo(h.ts) : ''
    const user = h.userName || ''
    return `<div class="phs-item">
      <span class="phs-action">${esc(h.action || '')}</span>
      <span class="phs-detail">${esc(h.detail || '')}</span>
      <span class="phs-meta">${esc(user)} · ${esc(when)}</span>
    </div>`
  }).join('')
  return `<div class="prod-history-section">
    <div class="phs-title">이력 (${list.length})</div>
    <div class="phs-list">${rows}</div>
  </div>`
}
window.buildProductHistoryHtml = buildProductHistoryHtml

// 🔴 B2c: 공용 코어 섹션 빌더 — 상품/기획 상세가 공통으로 렌더하는 6섹션(가격/소재/사이즈규격/가이드/제조/이미지)을 단일 소스로.
//   반환 = 섹션별 필드 HTML 조각(섹션 래퍼 없음) → 각 화면이 자기 섹션 마크업(.dsection/.pd-section)으로 감쌈(CSS 스코프 보존).
//   mode='product' → data-key(saveDetailEdit 제네릭 루프) · 'plan' → data-pkey(savePlanDetailEdit 제네릭 루프). 제네릭 저장이라 필드 무손실.
//   🔴 기본정보(브랜드/품번+코드생성/색상/성별/담당자/판매상태/연도·시즌)는 mode-specific(데이터모델·순서 상이) → 화면별 유지(공용 아님).
function buildDetailCommonSections(item, mode) {
  const A = mode === 'plan' ? 'data-pkey' : 'data-key'
  const s = (typeof _settings !== 'undefined' && _settings) ? _settings : {}
  const escv = v => String(v == null ? '' : v).replace(/"/g, '&quot;')
  const mkOpts = (arr, cur) => (arr || []).map(it => { const [v, l] = Array.isArray(it) ? it : [it, it]; return `<option value="${v}"${cur === v ? ' selected' : ''}>${l}</option>` }).join('')
  const F = (label, key, val, type = 'text', opts = '', spanClass = '', dispOverride = '') => {
    let inputVal
    if (type === 'number') { const st = String(val ?? '').replace(/[^\d.-]/g, ''); inputVal = (st === '-' || st === '') ? '' : st }
    else inputVal = escv(val)
    const disp = dispOverride || (val != null && val !== '' ? String(val) : '-')
    const inp = type === 'select' ? `<select ${A}="${key}">${opts}</select>`
      : type === 'textarea' ? `<textarea ${A}="${key}" rows="4">${val || ''}</textarea>`
      : `<input type="${type}" ${A}="${key}" value="${inputVal}" />`
    return `<div class="dfield ${spanClass}"><span class="dfield-label">${label}</span><span class="dfield-value${disp === '-' ? ' empty' : ''}${type === 'textarea' ? ' long' : ''}">${disp}</span>${inp}</div>`
  }
  // 이미지 멀티-URL 필드(줄바꿈 문자열). htmlBtn=상세 URL([HTML 복사]→convertUrlsToHtml).
  const UF = (label, key, val, htmlBtn = false) => {
    const v = val || ''
    const urls = v ? v.split(/[\n\r]+/).map(u => u.trim()).filter(Boolean) : []
    const htmlB = htmlBtn ? `<button type="button" class="img-html-btn" onclick="event.stopPropagation();copyUrlHtml('${key}')" title="이미지 URL → 상세페이지 HTML 복사">HTML 복사</button>` : ''
    const allCopyBtn = urls.length > 1 ? `<button type="button" class="btn-copy-url" data-url="${v.replace(/"/g, '&quot;')}" onclick="copySingleUrlFromBtn(this)" title="전체 URL 복사">전체복사</button>` : ''
    const view = urls.length
      ? urls.map(u => { const su = u.replace(/"/g, '&quot;'); return `<div class="url-item"><span class="url-item-text" title="${su}">${su}</span><button type="button" class="btn-copy-url btn-copy-single" data-url="${su}" onclick="copySingleUrlFromBtn(this)">복사</button></div>` }).join('')
      : '<span class="url-empty-text">-</span>'
    return `<div class="dfield span3"><div class="dfield-label-row"><span class="dfield-label">${label}</span>${htmlB}${allCopyBtn}</div><div class="url-list${urls.length ? '' : ' empty'}">${view}</div><textarea ${A}="${key}" rows="3">${v}</textarea></div>`
  }
  const price =
      F('판매가(원)', 'salePrice', item.salePrice ? item.salePrice.toLocaleString() + '원' : '-', 'number')
    + F('원가(원)', 'costPrice', item.costPrice ? item.costPrice.toLocaleString() + '원' : '-', 'number')
    + F('타입', 'type', item.type, 'select', mkOpts(s.types, item.type))
    + F('원단타입', 'fabricType', item.fabricType, 'select', mkOpts(s.fabricTypes, item.fabricType || ''))
    + F('가이드', 'guide', item.guide)
  const material =
      F('소재', 'material', item.material, 'textarea', '', 'span3')
    + (mode === 'product' ? F('원단설명', 'fabricDesc', item.fabricDesc, 'textarea', '', 'span3') : '')
    + F('디자이너 코멘트', 'comment', item.comment, 'textarea', '', 'span3')
    + F('세탁방법', 'washMethod', item.washMethod, 'textarea', '', 'span3')
  const sizeSpec = `<div class="size-spec-view-wrap">${buildSizeSpecView(item.sizeSpec)}</div><div class="size-spec-edit-wrap">${buildSizeSpecEdit(item.sizeSpec)}</div>`
  const guide =
      F('가슴선', 'chestLine', item.chestLine, 'select', mkOpts(s.chestLines, item.chestLine || ''))
    + F('다리파임', 'legCut', item.legCut, 'select', mkOpts(s.legCuts, item.legCut || ''))
    + F('비침', 'transparency', item.transparency, 'select', mkOpts(s.transparencies, item.transparency || ''))
    + F('안감', 'lining', item.lining, 'select', mkOpts(s.linings, item.lining || ''))
    + F('캡고리', 'capRing', item.capRing, 'select', mkOpts(s.capRings, item.capRing || ''))
    + F('모델착용사이즈', 'modelSize', item.modelSize)
  const made =
      F('제조년월', 'madeMonth', item.madeMonth)
    + F('제조사', 'madeBy', item.madeBy)
    + F('제조국', 'madeIn', item.madeIn)
  const image =
      UF('카페24 대표 (시스템 썸네일)', 'cafe24Main', item.cafe24Main || (item.mainImage || ''))
    + UF('사방넷 대표', 'sabangMain', item.sabangMain || '')
    + UF('CAFE24 상세 URL', 'cafe24DetailUrl', item.cafe24DetailUrl || '', true)
    + UF('사방넷 상세 URL', 'sabangDetailUrl', item.sabangDetailUrl || '', true)
    + F('영상 URL', 'videoUrl', item.videoUrl || '', 'text', '', 'span3')
  return { price, material, sizeSpec, guide, made, image }
}
window.buildDetailCommonSections = buildDetailCommonSections

function buildDetailContent(p) {
  const sizes  = SIZES
  const platforms = _platforms

  // 품번 생성 패널 상수
  const DCG_CLS_OPT  = (typeof _classCodes !== 'undefined' && Array.isArray(_classCodes) && _classCodes.length)
    ? _classCodes.map(([c, n]) => [c, n])
    : [['LS','르망고 수영복'],['LW','르망고 의류'],['LG','르망고 굿즈'],['NS','느와 수영복'],['NW','느와 의류'],['NG','느와 굿즈']]
  const DCG_TYP_OPT  = [['ON','원피스'],['MO','모노키니'],['BK','비키니'],['BR','브리프'],['JM','재머'],['RG','래시가드'],['AL','애슬레저'],['GM','의류'],['SC','수영모'],['BG','가방'],['ET','기타']]
  const DCG_GEN_OPT  = [['W','여성'],['M','남성'],['G','걸즈'],['B','보이즈'],['N','공용'],['K','키즈']]
  const DCG_YEAR_OPT = ['1','2','3','4','5','6','7','8','9','0']

  // 기존 품번에서 기본값 추측
  const existCode = p.productCode || ''
  const dcgClsGuess  = existCode.length >= 2  ? existCode.slice(0,2)  : (p.brand?.includes('느와') ? 'NS' : 'LS')
  const dcgGenGuess  = existCode.length >= 3  ? existCode.slice(2,3)  : 'W'
  const dcgTypGuess  = existCode.length >= 5  ? existCode.slice(3,5)  : 'ON'
  const dcgDesGuess  = existCode.length >= 9  ? existCode.slice(5,9)  : '1626'
  const dcgYearGuess = existCode.length >= 10 ? existCode.slice(9,10) : '6'
  const dcgSeaGuess  = existCode.length >= 11 ? existCode.slice(10,11): '1'

  // 🔴 B2b: 품번 생성 패널 제거 → 코드 셀렉트를 기본정보에 인라인(edit-only). onchange 프리뷰 없음(1-버튼).
  const dcgMkSel = (id, opts, guess) =>
    `<select id="${id}">${opts.map(([v,l]) => `<option value="${v}"${v===guess?' selected':''}>${v}${l?' - '+l:''}</option>`).join('')}</select>`

  const productCodeField = p.productCodeLocked
    ? `<div class="dfield">
        <span class="dfield-label">품번</span>
        <span class="dfield-value" style="display:flex;align-items:center;gap:6px">
          ${p.productCode}
          <span style="font-size:10px;background:var(--primary);color:#fff;padding:2px 7px;border-radius:10px;vertical-align:middle">확정됨</span>
        </span>
        <input type="text" data-key="productCode" value="${(p.productCode||'').replace(/"/g,'&quot;')}" readonly style="background:#f0f0f0;color:#888;cursor:not-allowed" />
      </div>`
    : `<div class="dfield span2">
        <span class="dfield-label">품번</span>
        <span class="dfield-value${!existCode ? ' empty' : ''}">${existCode || '-'}</span>
        <div class="pdcg-input-row dcg-edit-only">
          <input type="text" data-key="productCode" id="dCgProductCodeInput" value="${existCode.replace(/"/g,'&quot;')}" placeholder="[품번 생성] 버튼으로 생성 · 직접 입력도 가능" />
          <button class="btn btn-accent" onclick="genDetailCode()" style="font-size:11px;padding:4px 12px;white-space:nowrap">품번 생성</button>
        </div>
      </div>`

  // 🔴 B2b: 품번 코드 필드 그룹(기본정보 인라인, edit-only). 상품=positional 프리필. designCode/백스타일명 = data-key 로 저장(B1 register 미러).
  const dcgCodeGroup = p.productCodeLocked ? '' : `
    <div class="dfield span2 dcg-edit-only">
      <span class="dfield-label">품번 코드</span>
      <div class="pdcg-selects">
        <div class="pdcg-group"><label>분류</label>${dcgMkSel('dCgCls', DCG_CLS_OPT, dcgClsGuess)}</div>
        <div class="pdcg-group"><label>성별</label>${dcgMkSel('dCgGen', DCG_GEN_OPT, dcgGenGuess)}</div>
        <div class="pdcg-group"><label>타입</label>${dcgMkSel('dCgTyp', DCG_TYP_OPT, dcgTypGuess)}</div>
        <div class="pdcg-group"><label>연도</label>${dcgMkSel('dCgYear', DCG_YEAR_OPT.map(v=>[v,'']), dcgYearGuess)}</div>
        <div class="pdcg-group"><label>시즌</label>${dcgMkSel('dCgSeason', ['1','2','3','4','5'].map(v=>[v,'']), dcgSeaGuess)}</div>
      </div>
      <div class="pdcg-design-row">
        <label>백스타일 (디자인 코드) — 코드·영문·한글 검색</label>
        <input type="text" id="dCgDesignSearch" placeholder="코드 또는 패턴명 검색 (예: 1626 / Crossed / 크로스)" oninput="filterDetailDesignList()" autocomplete="off" class="design-search-input" />
        <div id="dCgDesignDropdown" class="design-dropdown" style="max-height:160px;overflow-y:auto"></div>
        <input type="hidden" id="dCgDesign" data-key="designCode" value="${dcgDesGuess}" />
      </div>
    </div>`

  const field = (label, key, val, type='text', opts='', spanClass='') => {
    // type=number 일 때 입력값 정제: "55,000원" / "-" 같은 표시용 포맷이 들어와도
    // <input type="number"> 가 거부하지 않도록 숫자/소수점/음수만 남기고 "-" 단독은 빈값으로
    let inputVal
    if (type === 'number') {
      const stripped = String(val ?? '').replace(/[^\d.-]/g, '')
      inputVal = (stripped === '-' || stripped === '') ? '' : stripped
    } else {
      inputVal = (val || '').toString().replace(/"/g, '&quot;')
    }
    return `<div class="dfield ${spanClass}">
      <span class="dfield-label">${label}</span>
      <span class="dfield-value${!val ? ' empty' : ''}${type==='textarea' ? ' long' : ''}">${val || '-'}</span>
      ${type==='select'
        ? `<select data-key="${key}">${opts}</select>`
        : type==='textarea'
          ? `<textarea data-key="${key}" rows="4">${val||''}</textarea>`
          : `<input type="${type}" data-key="${key}" value="${inputVal}" />`
      }
    </div>`
  }

  // URL 필드 (복사 버튼 포함) — textarea 타입은 URL별 개별 복사 버튼 표시. htmlBtn=true → [HTML 복사](상세 URL용)
  const urlField = (label, key, val, type='text', htmlBtn=false) => {
    const htmlBtnHtml = htmlBtn ? `<button type="button" class="img-html-btn" onclick="event.stopPropagation();copyUrlHtml('${key}')" title="이미지 URL → 상세페이지 HTML 복사">HTML 복사</button>` : ''
    if (type === 'textarea') {
      const urls = val ? val.split(/[\n\r]+/).map(u => u.trim()).filter(Boolean) : []
      const hasUrls = urls.length > 0
      const urlItems = hasUrls
        ? urls.map(u => {
            const safeU = u.replace(/"/g, '&quot;')
            return `<div class="url-item">
              <span class="url-item-text" title="${safeU}">${safeU}</span>
              <button type="button" class="btn-copy-url btn-copy-single" data-url="${safeU}" onclick="copySingleUrlFromBtn(this)">복사</button>
            </div>`
          }).join('')
        : '<span class="url-empty-text">-</span>'
      const allCopyBtn = urls.length > 1
        ? `<button type="button" class="btn-copy-url" data-url="${(val||'').replace(/"/g,'&quot;')}" onclick="copySingleUrlFromBtn(this)" title="전체 URL 복사">전체복사</button>`
        : ''
      return `<div class="dfield span3">
        <div class="dfield-label-row">
          <span class="dfield-label">${label}</span>
          ${htmlBtnHtml}
          ${allCopyBtn}
        </div>
        <div class="url-list${!hasUrls ? ' empty' : ''}" data-urlkey="${key}">${urlItems}</div>
        <textarea data-key="${key}" rows="4">${val||''}</textarea>
      </div>`
    }
    // text 타입 (영상 URL 등 단일값)
    const safeVal = (val||'').replace(/"/g, '&quot;')
    return `<div class="dfield span3">
      <div class="dfield-label-row">
        <span class="dfield-label">${label}</span>
        ${val ? `<button type="button" class="btn-copy-url" data-url="${safeVal}" onclick="copySingleUrlFromBtn(this)" title="클립보드 복사">복사</button>` : ''}
      </div>
      <span class="dfield-value${!val ? ' empty' : ''}" data-urlkey="${key}">${val || '-'}</span>
      <input type="${type}" data-key="${key}" value="${safeVal}" />
    </div>`
  }

  const mkOpts = (items, curVal) => items.map(item => {
    const [val, label] = Array.isArray(item) ? item : [item, item]
    return `<option value="${val}"${curVal===val?' selected':''}>${label}</option>`
  }).join('')
  const typeOpts        = mkOpts(_settings.types,          p.type)
  const legOpts         = mkOpts(_settings.legCuts,        p.legCut)
  const chestLineOpts   = mkOpts(_settings.chestLines,     p.chestLine||'')
  const transparencyOpts= mkOpts(_settings.transparencies, p.transparency||'')
  const liningOpts      = mkOpts(_settings.linings,        p.lining||'')
  const capRingOpts     = mkOpts(_settings.capRings,       p.capRing||'')
  const fabricOpts      = mkOpts(_settings.fabricTypes,    p.fabricType||'')
  const brandOpts       = mkOpts(_settings.brands,         p.brand)
  const saleStatusOpts  = mkOpts(_settings.saleStatuses,   p.saleStatus||'판매중')

  // Assignee options from _allUsers
  const _users = Array.isArray(window._allUsers) ? window._allUsers : []
  const assigneeName = p.assigneeName || (p.assignee ? (_users.find(u=>u.uid===p.assignee)?.name || '') : '')
  const assigneePos  = p.assigneePosition || (p.assignee ? (_users.find(u=>u.uid===p.assignee)?.position || '') : '')
  const assigneeView = (assigneeName && typeof formatUserName === 'function') ? formatUserName(assigneeName, assigneePos) : (assigneeName || '-')
  const assigneeOpts = `<option value="">- 미지정 -</option>` + _users.map(u => `<option value="${u.uid}"${p.assignee===u.uid?' selected':''}>${esc((typeof formatUserName==='function')?formatUserName(u.name, u.position):u.name)}</option>`).join('')
  // 검색형 콤보박스용 데이터
  const assigneeCurrentLabel = assigneeName ? ((typeof formatUserName==='function') ? formatUserName(assigneeName, assigneePos) : assigneeName) : ''

  const pinnedMemoBlock = `
    <div class="pinned-memo">📌 ${esc(p.pinnedMemo || '')}</div>
    <div class="pinned-memo-edit">
      <textarea data-key="pinnedMemo" rows="2" placeholder="📌 고정 메모 (상단 상시 노출)">${esc(p.pinnedMemo || '')}</textarea>
    </div>`

  // 🔴 B2c: 공용 코어 6섹션(가격/소재/사이즈규격/가이드/제조/이미지) 단일 소스
  const core = buildDetailCommonSections(p, 'product')

  return `
    ${pinnedMemoBlock}
    <div class="dsection">
      <div class="dsection-title">기본 정보</div>
      <div class="detail-basic-grid">
        ${field('브랜드',    'brand',       p.brand,    'select', brandOpts)}
        ${productCodeField}
        ${field('판매상태',  'saleStatus',  p.saleStatus||'판매중', 'select', saleStatusOpts)}
        ${field('샘플번호',  'sampleNo',    p.sampleNo)}
        ${field('상품명(한글)', 'nameKr',   p.nameKr)}
        ${field('상품명(영문)', 'nameEn',   p.nameEn)}
        ${(() => {
          // 색상 — 마스터 기반 피커 (보기/수정 통합)
          const m = (typeof resolveColorMaster === 'function')
            ? resolveColorMaster({ code: p.colorCode, nameKr: p.colorKr, nameEn: p.colorEn })
            : null
          const swatchHtml = m
            ? (m.isPattern
                ? '<span class="cp-swatch cp-swatch-pattern" style="margin-right:6px">🎨</span>'
                : `<span class="cp-swatch" style="background:${m.hex || '#ccc'};margin-right:6px"></span>`)
            : ''
          const viewText = m
            ? `${m.nameKr} - ${m.nameEn} (${m.code})`
            : (p.colorKr ? p.colorKr + (p.colorEn ? ' - ' + p.colorEn : '') : '-')
          const pickerHtml = (typeof buildColorPickerHtml === 'function')
            ? buildColorPickerHtml('dColorPicker', { code: p.colorCode, nameKr: p.colorKr, nameEn: p.colorEn }, {
                krId: 'dColorKr', enId: 'dColorEn', codeId: 'dColorCode',
                dataKey: { kr: 'colorKr', en: 'colorEn', code: 'colorCode' }
              })
            : ''
          return `<div class="dfield dfield-color" style="grid-column:span 2">
            <span class="dfield-label">색상</span>
            <span class="dfield-value${!viewText ? ' empty' : ''}">${swatchHtml}${viewText}</span>
            ${pickerHtml}
          </div>`
        })()}
        ${field('성별', 'gender', GENDER_MAP[p.gender] || p.gender || '', 'select',
          `<option value=""${!p.gender?' selected':''}>-</option>` +
          Object.entries(GENDER_MAP).map(([v,l]) => `<option value="${v}"${p.gender===v?' selected':''}>${l}</option>`).join('')
        )}
        <div class="dfield">
          <span class="dfield-label">담당자</span>
          <span class="dfield-value${!assigneeCurrentLabel ? ' empty' : ''}">${assigneeCurrentLabel || '-'}</span>
          <div class="assignee-combo" data-combo="assignee">
            <input type="hidden" data-key="assignee" value="${p.assignee || ''}" />
            <input type="text" class="assignee-search" value="${esc(assigneeCurrentLabel)}" placeholder="이름·직급·부서 검색" autocomplete="off"
              oninput="filterAssigneeDropdown(this)" onfocus="showAssigneeDropdown(this)" onkeydown="assigneeKeyNav(event, this)" />
            <button type="button" class="assignee-clear" title="미지정으로" onclick="clearAssignee(this)">✕</button>
            <div class="assignee-dd" style="display:none">
              <div class="assignee-opt" data-uid="" onmousedown="selectAssignee(this)">- 미지정 -</div>
              ${_users.map(u => {
                const lbl = (typeof formatUserName==='function') ? formatUserName(u.name, u.position) : (u.name||'')
                const dept = u.dept || ''
                return `<div class="assignee-opt" data-uid="${u.uid}" data-name="${esc(lbl)}" data-dept="${esc(dept)}" onmousedown="selectAssignee(this)">
                  <span class="aopt-name">${esc(lbl)}</span>${dept ? `<span class="aopt-dept">${esc(dept)}</span>` : ''}
                </div>`
              }).join('')}
            </div>
          </div>
        </div>
        ${dcgCodeGroup}
        ${(() => {
          // 🔴 B2b: 백스타일명(EN, readonly 자동) — picker(selectDetailDesign)가 채움. 가격/디자인의 backStyle 이전.
          const bsVal = (p.backStyle || '').replace(/"/g,'&quot;')
          return `<div class="dfield">
            <span class="dfield-label">백스타일명</span>
            <span class="dfield-value${!p.backStyle ? ' empty' : ''}">${p.backStyle || '-'}</span>
            <input type="text" data-key="backStyle" id="dBackStyleName" value="${bsVal}" placeholder="백스타일 선택 시 자동" readonly />
          </div>`
        })()}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">가격 / 디자인</div>
      <div class="dsection-grid">
        ${core.price}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">소재</div>
      <div class="dsection-grid col1">
        ${core.material}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">사이즈 규격 <button type="button" class="img-html-btn-all" onclick="event.stopPropagation();copySizeGuideHtml()">사이즈 HTML 복사</button></div>
      <div style="padding:10px 12px">
        ${core.sizeSpec}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">가이드</div>
      <div class="dsection-grid">
        ${core.guide}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">제조 정보</div>
      <div class="dsection-grid">
        ${core.made}
        <div class="dfield">
          <label class="dfield-label">최종입고일</label>
          <span class="dfield-value">${((p.stockLog||[]).filter(l=>l.type==='in').reduce((m,l)=>l.date>m?l.date:m,'')) || '—'}</span>
        </div>
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">재고 현황</div>
      <div style="padding:10px 12px">
        <div class="dstock-row">
          ${sizes.map(sz => {
            const n = p.stock?.[sz] || 0
            return `<div class="dstock-badge">
              <span class="dstock-size">${sz}</span>
              <span class="dstock-num${n===0?' zero':''}">${n}</span>
            </div>`
          }).join('')}
          <div class="dstock-badge" style="background:var(--table-header)">
            <span class="dstock-size">합계</span>
            <span class="dstock-num">${getTotalStock(p)}</span>
          </div>
        </div>
        <div class="dprod-status-row">
          <span class="dprod-status-label">생산 상태</span>
          <button type="button"
            class="dprod-btn${(p.productionStatus||'지속생산')==='지속생산' ? ' active' : ''}"
            data-status="지속생산"
            onclick="setProductionStatus(this, '지속생산')">지속생산</button>
          <button type="button"
            class="dprod-btn${(p.productionStatus||'지속생산')==='생산중단' ? ' active danger' : ''}"
            data-status="생산중단"
            onclick="setProductionStatus(this, '생산중단')">생산중단</button>
        </div>
        <div class="detail-bc-section">
          <div class="detail-bc-title">바코드</div>
          <table class="detail-bc-table">
            <thead><tr><th>사이즈</th><th>바코드</th></tr></thead>
            <tbody>
              ${sizes.map(sz => {
                const bc = (p.barcodes && p.barcodes[sz]) || ''
                return `<tr>
                  <td class="detail-bc-sz">${sz}</td>
                  <td><span class="dfield-value detail-bc-val">${esc(bc) || '-'}</span><input type="text" class="detail-bc-input" data-size="${sz}" value="${(bc||'').replace(/"/g,'&quot;')}" /></td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">판매 현황</div>
      <div style="padding:10px 12px">
        <div class="dstock-row">
          ${platforms.map(pl => {
            const n = p.sales?.[pl] || 0
            return `<div class="dstock-badge">
              <span class="dstock-size">${pl}</span>
              <span class="dstock-num">${n}</span>
            </div>`
          }).join('')}
          <div class="dstock-badge" style="background:var(--table-header)">
            <span class="dstock-size">합계</span>
            <span class="dstock-num">${getTotalSales(p)}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title dimg-toggle" onclick="toggleDImg('dImgBody')">
        이미지 URL <span class="dimg-arrow">▼</span>
      </div>
      <div id="dImgBody" class="dsection-grid col1">
        ${core.image}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title dimg-toggle collapsed" onclick="toggleDImg('dMallBody')">
        쇼핑몰 코드 <span class="dimg-arrow">▶</span>
      </div>
      <div id="dMallBody" class="dimg-hidden">
        ${_platforms.map(pl => {
          const code = (p.mallCodes && p.mallCodes[pl]) || ''
          return `<div class="dmall-row dfield">
            <span class="dmall-label">${pl}</span>
            <span class="dfield-value dmall-value">${code || '-'}</span>
            <input type="text" class="dmall-input" data-mall-platform="${pl}" value="${(code||'').replace(/"/g,'&quot;')}" />
          </div>`
        }).join('')}
      </div>
    </div>

    ${p.scheduleLog?.length ? `
    <div class="dsection">
      <div class="dsection-title" style="color:var(--text-muted)">기획 일정 이력</div>
      <div style="padding:8px 12px">
        ${p.scheduleLog.map(entry => {
          const schLabels = Object.fromEntries(SCHEDULE_DEFS.map(s => [s.key, s.label]))
          const rows = Object.entries(entry.schedule||{}).map(([k, v]) => {
            const label = schLabels[k] || k
            const start = v?.start || '-'
            const end   = v?.end   || '-'
            if (start === '-' && end === '-') return ''
            return `<tr>
              <td style="padding:3px 8px;font-size:11px;color:var(--text-muted)">${label}</td>
              <td style="padding:3px 8px;font-size:11px">${start}</td>
              <td style="padding:3px 8px;font-size:11px">${end}</td>
            </tr>`
          }).filter(Boolean).join('')
          return rows ? `
            <div style="margin-bottom:10px">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">확정일: ${entry.confirmedAt}</div>
              <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead>
                  <tr style="background:var(--table-header)">
                    <th style="padding:3px 8px;text-align:left;border:1px solid var(--border);font-size:11px">구분</th>
                    <th style="padding:3px 8px;text-align:left;border:1px solid var(--border);font-size:11px">시작일</th>
                    <th style="padding:3px 8px;text-align:left;border:1px solid var(--border);font-size:11px">완료예정일</th>
                  </tr>
                </thead>
                <tbody style="border:1px solid var(--border)">${rows}</tbody>
              </table>
            </div>` : ''
        }).join('')}
      </div>
    </div>` : ''}

    ${(Array.isArray(p.tempImages) && p.tempImages.length > 0) ? `
    <div class="dsection">
      <div class="dsection-title">참고 이미지 <span class="plan-img-badge plan-img-badge-temp">임시</span></div>
      <div style="padding:8px 12px">
        <div class="temp-img-bar">
          <span class="temp-img-bar-text">임시 이미지 ${p.tempImages.length}개 — 확인 후 삭제하세요</span>
          <button type="button" class="temp-img-del-all" onclick="deleteAllProductTempImages()">전체 삭제</button>
        </div>
        <div class="plan-img-grid">
          ${p.tempImages.map((img, i) => {
            const safe = String(img.url || '').replace(/"/g,'&quot;')
            // 🔴 B3: 라벨(슬롯) 우선 표시 + 그래픽명(caption). 라벨 없으면 파일명.
            const label = img.label ? esc(img.label) : ''
            const nmSrc = img.caption || img.name || ''
            const nm = nmSrc.length > 18 ? nmSrc.slice(0,16)+'..' : nmSrc
            return `<div class="plan-img-thumb plan-img-thumb-temp">
              <span class="plan-img-thumb-tag-temp">${label || '임시'}</span>
              <img src="${safe}" onclick="_prodTempViewer(${i})" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" />
              <div class="plan-img-thumb-name" title="${esc(nmSrc)}">${esc(nm)}</div>
              <button type="button" class="plan-img-thumb-x temp-del-btn" onclick="deleteProductTempImage(${i})">✕</button>
            </div>`
          }).join('')}
        </div>
      </div>
    </div>` : ''}

    <div class="dmodal-edit-footer">
      <button type="button" class="btn btn-outline" onclick="toggleDetailEdit()">취소</button>
      <button type="button" class="btn btn-new" onclick="saveDetailEdit()">저장</button>
    </div>

    ${buildProductHistoryHtml(p.productCode)}
    ${renderStampInfo(p)}
    ${buildCommentSection('product', p.productCode)}
  `
}

async function deleteProductTempImage(idx) {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p || !Array.isArray(p.tempImages)) return
  const ok = await korConfirm('이 임시 이미지를 삭제하시겠습니까?', '삭제', '취소')
  if (!ok) return
  p.tempImages.splice(idx, 1)
  if (typeof saveProducts === 'function') saveProducts().catch(e => console.error(e))
  openDetailModal(_detailCode)
  showToast('임시 이미지가 삭제되었습니다.', 'success')
}

async function deleteAllProductTempImages() {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p || !Array.isArray(p.tempImages) || !p.tempImages.length) return
  const ok = await korConfirm(`임시 이미지 ${p.tempImages.length}개를 모두 삭제하시겠습니까?`, '전체 삭제', '취소')
  if (!ok) return
  p.tempImages = []
  if (typeof saveProducts === 'function') saveProducts().catch(e => console.error(e))
  openDetailModal(_detailCode)
  showToast('임시 이미지가 모두 삭제되었습니다.', 'success')
}

window.deleteProductTempImage = deleteProductTempImage
window.deleteAllProductTempImages = deleteAllProductTempImages

function toggleDImg(id) {
  const body = document.getElementById(id)
  if (!body) return
  const isHidden = body.classList.toggle('dimg-hidden')
  const title = body.previousElementSibling
  if (title) {
    title.classList.toggle('collapsed', isHidden)
    const arrow = title.querySelector('.dimg-arrow')
    if (arrow) arrow.textContent = isHidden ? '▶' : '▼'
    const preview = title.querySelector('.dimg-preview')
    if (preview) preview.style.display = isHidden ? '' : 'none'
  }
}

function closeDetailModal(force) {
  const modal = document.getElementById('detailModal')
  const doClose = () => {
    if (modal.classList.contains('edit-mode')) modal.classList.remove('edit-mode')
    if (_detailPendingCode) {
      const currentProduct = State.allProducts.find(x => x.productCode === _detailCode)
      if (!currentProduct || currentProduct.productCode !== _detailPendingCode) {
        _reservedCodes.delete(_detailPendingCode)
      }
      _detailPendingCode = null
    }
    try { if (typeof releaseEditLock === 'function') releaseEditLock('product', _detailCode) } catch(e) {}
    modal.close()
  }
  if (force) { doClose(); return }
  safeCloseModal(modal, () => modal.classList.contains('edit-mode'), doClose)
}

// ===== 상품 삭제 (소프트 삭제 → 휴지통) =====
// Permission helper — author OR admin (grade >= 3)
function canDeleteProduct(p) {
  if (!p) return false
  const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null
  const uid = user?.uid || ''
  const grade = (typeof _currentUserGrade !== 'undefined' ? _currentUserGrade : (State.currentUser?.grade || 1)) || 1
  if (grade >= 3) return true
  return !!uid && p.createdBy === uid
}
window.canDeleteProduct = canDeleteProduct

// Open type-to-confirm modal — mirrors plan's requestPlanDelete pattern
function requestProductDelete() {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p) return
  if (!canDeleteProduct(p)) {
    showToast('삭제 권한이 없습니다 (작성자 또는 관리자 이상).', 'warning')
    return
  }
  const expected = (p.productCode || '').trim()
  if (!expected) { showToast('품번이 없어 삭제할 수 없습니다.', 'error'); return }
  const modal = document.getElementById('productDeleteConfirmModal')
  if (!modal) return
  // Reset modal state to soft-delete defaults (in case trash menu set permanent copy earlier)
  modal._prodDelMode = undefined
  document.getElementById('prodDelTitle').textContent = '⚠ 상품 삭제 (휴지통 이동)'
  document.getElementById('prodDelWarning').innerHTML =
    '삭제 시 <strong>휴지통으로 이동</strong>됩니다. 매출/재고 이력은 보존됩니다. 삭제하려면 아래 품번을 정확히 입력하세요.'
  document.getElementById('prodDelTargetCode').textContent = expected
  const meta = []
  if (p.nameKr) meta.push(p.nameKr)
  if (p.brand) meta.push(p.brand)
  const revCount = (p.revenueLog || []).length
  if (revCount > 0) meta.push(`매출 기록 ${revCount}건 (보존됨)`)
  document.getElementById('prodDelTargetMeta').textContent = meta.join(' · ')
  document.getElementById('prodDelInputLabel').textContent = `위 품번(${expected})을 정확히 입력해주세요`
  const input = document.getElementById('prodDelInput')
  input.value = ''
  input.classList.remove('pdc-input-match')
  input.placeholder = expected
  document.getElementById('prodDelConfirmBtn').disabled = true
  modal._prodDelExpected = expected
  modal._prodDelCode = expected
  if (typeof centerModal === 'function') centerModal(modal)
  modal.showModal()
  setTimeout(() => input.focus(), 80)
}
window.requestProductDelete = requestProductDelete

// Input handler — exact-match enables confirm button (case-sensitive)
function _pcdOnInput() {
  const input = document.getElementById('prodDelInput')
  const modal = document.getElementById('productDeleteConfirmModal')
  if (!input || !modal) return
  const expected = modal._prodDelExpected || ''
  const match = input.value === expected
  document.getElementById('prodDelConfirmBtn').disabled = !match
  input.classList.toggle('pdc-input-match', match)
}
window._pcdOnInput = _pcdOnInput

function closeProductDeleteConfirm() {
  const modal = document.getElementById('productDeleteConfirmModal')
  if (modal && modal.open) modal.close()
}
window.closeProductDeleteConfirm = closeProductDeleteConfirm

// Confirm product delete — branches on modal._prodDelMode:
// - 'permanent' (set by trash menu's requestPermanentDelete): hard delete via _trashPermanentDeleteExec
// - default/undefined (from detail modal's requestProductDelete): soft delete (deleted:true)
async function confirmProductDelete() {
  const modal = document.getElementById('productDeleteConfirmModal')
  if (!modal) return
  const code = modal._prodDelCode
  const isPermanent = modal._prodDelMode === 'permanent'
  const p = State.allProducts.find(x => x.productCode === code)
  if (!p) {
    showToast('삭제 대상을 찾을 수 없습니다.', 'warning')
    closeProductDeleteConfirm()
    return
  }
  // Permission re-check (defense)
  if (isPermanent) {
    const grade = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
    if (grade < 3) { showToast('영구삭제 권한이 없습니다 (Grade 3+).', 'warning'); closeProductDeleteConfirm(); return }
  } else {
    if (!canDeleteProduct(p)) {
      showToast('삭제 권한이 없습니다.', 'warning')
      closeProductDeleteConfirm()
      return
    }
  }
  // Input match re-check
  const input = document.getElementById('prodDelInput')
  const expected = modal._prodDelExpected || ''
  if (!input || input.value !== expected) {
    showToast('품번이 일치하지 않습니다.', 'warning')
    return
  }

  const btn = document.getElementById('prodDelConfirmBtn')
  const originalText = btn.textContent
  btn.disabled = true
  btn.textContent = '삭제 중...'

  if (isPermanent) {
    // Hard delete via trash module — splices State + deletes Firestore comments + saves
    let ok = false
    try { ok = await _trashPermanentDeleteExec(code) } catch (e) { console.error(e) }
    closeProductDeleteConfirm()
    if (ok) {
      // Auto-close detail modal if it's open (e.g., user clicked 영구삭제 from detail header)
      const dm = document.getElementById('detailModal')
      if (dm && dm.open) closeDetailModal(true)
      showToast('영구 삭제되었습니다.', 'success')
    }
    btn.disabled = false; btn.textContent = originalText
    // Reset modal state for future soft-delete reuse
    modal._prodDelMode = undefined
    return
  }

  // === Soft delete path (from detail modal) ===
  const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null
  const uid = user?.uid || ''
  const userName = (typeof formatUserName === 'function')
    ? formatUserName(_currentUserName, _currentUserPosition)
    : (typeof _currentUserName !== 'undefined' ? _currentUserName : '')
  p.deleted = true
  p.deletedAt = new Date().toISOString()
  p.deletedBy = uid
  p.deletedByName = userName

  try { if (typeof releaseEditLock === 'function') releaseEditLock('product', code) } catch (e) {}

  try {
    if (typeof saveProducts === 'function') await saveProducts()
  } catch (e) {
    showToast('삭제 저장 실패: ' + (e.message || e), 'error')
    delete p.deleted; delete p.deletedAt; delete p.deletedBy; delete p.deletedByName
    btn.disabled = false; btn.textContent = originalText
    return
  }

  if (typeof logActivity === 'function') {
    logActivity('delete', '상품조회', `상품삭제(휴지통): ${code}${p.nameKr ? ' (' + p.nameKr + ')' : ''}`)
  }
  try { if (typeof notifyWatchers === 'function') notifyWatchers('product', code, '삭제(휴지통 이동)') } catch (e) {}

  closeProductDeleteConfirm()
  closeDetailModal(true)
  if (typeof renderProductTable === 'function') renderProductTable()
  if (typeof renderStockTable === 'function') renderStockTable()
  if (typeof renderSalesTable === 'function') renderSalesTable()
  if (typeof renderDashboard === 'function') renderDashboard()
  showToast('휴지통으로 이동되었습니다.', 'success')

  btn.disabled = false; btn.textContent = originalText
}
window.confirmProductDelete = confirmProductDelete

// Legacy alias retained for any stragglers (no longer wired in HTML).
// Routes to the new type-to-confirm flow rather than executing directly.
async function deleteProduct() { return requestProductDelete() }
window.deleteProduct = deleteProduct

// ===== Trash detail-header actions (visible only in read-only mode) =====
async function dRestoreFromDetail() {
  const code = _detailCode
  if (!code) return
  // 🔴 방어적 가드: 파괴적/상태변경 액션은 휴지통 메뉴(fromTrash)에서만. 분석 화면(매트릭스 등) 진입점 이중 차단.
  const _dm = document.getElementById('detailModal')
  if (!_dm || _dm.dataset.fromtrash !== '1') return
  // Permission re-check via trash module
  if (typeof _trashCanAccess === 'function' && !_trashCanAccess()) {
    showToast('권한이 없습니다.', 'warning'); return
  }
  // restoreProduct internally calls korConfirm + saveProducts + refreshes views
  if (typeof restoreProduct === 'function') {
    await restoreProduct(code)
    // After successful restore, auto-close the detail modal (product no longer in trash)
    const dm = document.getElementById('detailModal')
    if (dm && dm.open) closeDetailModal(true)
  }
}
window.dRestoreFromDetail = dRestoreFromDetail

function dPermDeleteFromDetail() {
  const code = _detailCode
  if (!code) return
  // 🔴 방어적 가드: 영구삭제는 휴지통 메뉴(fromTrash)에서만 도달 가능. 분석 화면 진입점 절대 차단.
  const _dm = document.getElementById('detailModal')
  if (!_dm || _dm.dataset.fromtrash !== '1') return
  if (typeof _trashCanAccess === 'function' && !_trashCanAccess()) {
    showToast('권한이 없습니다.', 'warning'); return
  }
  // Opens productDeleteConfirmModal in 'permanent' mode.
  // confirmProductDelete (permanent branch) auto-closes detailModal after success.
  if (typeof requestPermanentDelete === 'function') {
    requestPermanentDelete(code)
  }
}
window.dPermDeleteFromDetail = dPermDeleteFromDetail

function _dUpdateHeaderBtns(mode) {
  // mode: 'view' | 'edit'
  const modal = document.getElementById('detailModal')
  const readOnly = modal && modal.dataset.readonly === '1'
  const fromTrash = modal && modal.dataset.fromtrash === '1'
  document.querySelectorAll('#detailModal .d-view-btn').forEach(b => {
    if (readOnly) { b.style.display = 'none'; return }
    b.style.display = mode === 'view' ? 'inline-block' : 'none'
  })
  document.querySelectorAll('#detailModal .d-edit-btn').forEach(b => {
    if (readOnly) { b.style.display = 'none'; return }
    if (b.id === 'dDeleteBtn' && b.dataset.hidden === '1') { b.style.display = 'none'; return }
    b.style.display = mode === 'edit' ? 'inline-block' : 'none'
  })
  // d-trash-btn group (복원/영구삭제): 🔴 휴지통 메뉴(fromTrash)에서만 노출. 분석 화면(매트릭스 등 readOnly-only)은 파괴적 액션 절대 금지.
  document.querySelectorAll('#detailModal .d-trash-btn').forEach(b => {
    b.style.display = (readOnly && fromTrash) ? 'inline-block' : 'none'
  })
  // Other write-action buttons (not in d-view/d-edit/d-trash groups)
  if (readOnly) {
    const watchBtn = document.getElementById('dWatchBtn')
    const favBtn = document.getElementById('dFavBtn')
    if (watchBtn) watchBtn.style.display = 'none'
    if (favBtn) favBtn.style.display = 'none'
    // dLockCodeBtn hide is enforced by openDetailModal (canonical place — see prior false-PASS fix)
  } else {
    const watchBtn = document.getElementById('dWatchBtn')
    const favBtn = document.getElementById('dFavBtn')
    if (watchBtn) watchBtn.style.display = ''
    if (favBtn) favBtn.style.display = ''
  }
}

// Read-only header indicator: shows compact pill in modal header when product is in trash.
// (Previously this was a large body-width banner; redesigned to be header-inline per UX feedback.)
function _renderDetailReadOnlyBanner(p, readOnly, fromTrash) {
  const modal = document.getElementById('detailModal')
  if (!modal) return
  // Clean up legacy body banner from any prior version (defensive)
  const legacy = modal.querySelector('.dmodal-readonly-banner')
  if (legacy) legacy.remove()
  // Compact header pill
  const indicator = document.getElementById('dTrashIndicator')
  if (!indicator) return
  // 🔴 배너 표시 규칙:
  //   - !readOnly → 숨김(일반 편집뷰)
  //   - readOnly && fromTrash(휴지통 메뉴) → "휴지통 — 조회전용"(복원/영구삭제 동반, 변경 없음)
  //   - readOnly && !fromTrash && p.deleted(분석 화면서 삭제된 상품) → 중립 "[삭제된 상품]" 표시만(파괴적 액션 없음)
  //   - readOnly && !fromTrash && live 상품(매트릭스 정상 상품) → 숨김(깨끗한 뷰)
  if (!readOnly || (!fromTrash && !p.deleted)) {
    indicator.style.display = 'none'
    indicator.title = ''
    return
  }
  const fmt = (iso) => iso ? (String(iso).slice(0, 10) + ' ' + String(iso).slice(11, 16)) : ''
  const at = fmt(p.deletedAt)
  const by = (p.deletedByName || '').toString()
  let tipParts = []
  if (at) tipParts.push('삭제일: ' + at)
  if (by) tipParts.push('삭제자: ' + by)
  indicator.textContent = fromTrash ? '🗑️ 휴지통 — 조회전용' : '🗑️ 삭제된 상품'
  indicator.title = tipParts.join(' / ')
  indicator.style.display = ''
}

function _dSyncWatchBtn() {
  const btn = document.getElementById('dWatchBtn')
  if (!btn || !_detailCode) return
  const on = typeof isWatching === 'function' && isWatching('product', _detailCode)
  btn.textContent = on ? '💛' : '🤍'
  btn.classList.toggle('active', on)
}
window._dSyncWatchBtn = _dSyncWatchBtn

function _dSyncLockWarn() {
  const el = document.getElementById('dLockWarn')
  if (!el) return
  const info = (typeof getEditLockInfo === 'function') ? getEditLockInfo('product', _detailCode) : null
  if (info) {
    const _who = (typeof formatUserName === 'function') ? formatUserName(info.name, info.position) : (info.name || '다른 사용자')
    el.textContent = `🔒 ${_who} 편집중`
    el.style.display = ''
  } else {
    el.textContent = ''
    el.style.display = 'none'
  }
}
window._dSyncLockWarn = _dSyncLockWarn

function toggleDetailEdit() {
  const modal = document.getElementById('detailModal')
  // Read-only guard — block any attempt to enter edit mode (휴지통 메뉴 = 조회전용 · 분석 화면 = 조회전용)
  if (modal && modal.dataset.readonly === '1') {
    showToast(modal.dataset.fromtrash === '1' ? '읽기 전용 모드입니다 (휴지통 조회).' : '읽기 전용 모드입니다 (조회 전용).', 'info')
    return
  }
  const willEdit = !modal.classList.contains('edit-mode')
  if (willEdit) {
    const info = (typeof getEditLockInfo === 'function') ? getEditLockInfo('product', _detailCode) : null
    if (info) {
      const who = (typeof formatUserName === 'function') ? formatUserName(info.name, info.position) : (info.name || '다른 사용자')
      showToast(`${who}님이 편집 중입니다`, 'warn')
      _dSyncLockWarn()
      return
    }
    // 락 획득 실패 시 진입 차단 (TOCTOU 보호 — acquireEditLock 자체가 토스트 표시)
    if (typeof acquireEditLock === 'function' && !acquireEditLock('product', _detailCode)) {
      _dSyncLockWarn()
      return
    }
  } else {
    if (typeof releaseEditLock === 'function') releaseEditLock('product', _detailCode)
  }
  const isEdit = modal.classList.toggle('edit-mode')
  _dUpdateHeaderBtns(isEdit ? 'edit' : 'view')
  _dSyncLockWarn()

  // 취소 시 임시 예약 코드 해제
  if (!isEdit && _detailPendingCode) {
    const currentProduct = State.allProducts.find(x => x.productCode === _detailCode)
    if (!currentProduct || currentProduct.productCode !== _detailPendingCode) {
      _reservedCodes.delete(_detailPendingCode)
    }
    _detailPendingCode = null
  }
}

// ===== 담당자 검색형 콤보박스 =====
function _positionAssigneeDd(inputEl, dd) {
  const r = inputEl.getBoundingClientRect()
  dd.style.left = r.left + 'px'
  dd.style.width = r.width + 'px'
  // 아래 공간 부족 시 위로 표시
  const spaceBelow = window.innerHeight - r.bottom
  const ddH = Math.min(dd.scrollHeight || 114, 114)
  if (spaceBelow < ddH + 8 && r.top > ddH + 8) {
    dd.style.top = (r.top - ddH - 2) + 'px'
  } else {
    dd.style.top = (r.bottom + 2) + 'px'
  }
}
function _assigneeReposHandler(e) {
  document.querySelectorAll('.assignee-combo .assignee-dd').forEach(dd => {
    if (dd.style.display === 'none') return
    const input = dd.parentElement.querySelector('.assignee-search')
    if (input) _positionAssigneeDd(input, dd)
  })
}
function showAssigneeDropdown(inputEl) {
  const dd = inputEl.parentElement.querySelector('.assignee-dd')
  if (!dd) return
  filterAssigneeDropdown(inputEl)
  dd.style.display = ''
  _positionAssigneeDd(inputEl, dd)
  window.addEventListener('scroll', _assigneeReposHandler, true)
  window.addEventListener('resize', _assigneeReposHandler)
}
function filterAssigneeDropdown(inputEl) {
  const dd = inputEl.parentElement.querySelector('.assignee-dd')
  if (!dd) return
  const q = (inputEl.value || '').trim().toLowerCase()
  let visible = 0
  dd.querySelectorAll('.assignee-opt').forEach(opt => {
    if (!q) { opt.style.display = ''; visible++; return }
    const name = (opt.dataset.name || opt.textContent || '').toLowerCase()
    const dept = (opt.dataset.dept || '').toLowerCase()
    const show = name.includes(q) || dept.includes(q) || (!opt.dataset.uid && '미지정'.includes(q))
    opt.style.display = show ? '' : 'none'
    if (show) visible++
  })
  dd.style.display = visible > 0 ? '' : 'none'
  if (visible > 0) _positionAssigneeDd(inputEl, dd)
}
function selectAssignee(optEl) {
  const combo = optEl.closest('.assignee-combo')
  if (!combo) return
  const hidden = combo.querySelector('input[type="hidden"][data-key="assignee"], input[type="hidden"][data-pkey="assignee"]')
  const search = combo.querySelector('.assignee-search')
  const dd = combo.querySelector('.assignee-dd')
  const uid = optEl.dataset.uid || ''
  const label = uid ? (optEl.dataset.name || '') : ''
  if (hidden) hidden.value = uid
  if (search) search.value = label
  if (dd) dd.style.display = 'none'
  window.removeEventListener('scroll', _assigneeReposHandler, true)
  window.removeEventListener('resize', _assigneeReposHandler)
}
function clearAssignee(btnEl) {
  const combo = btnEl.closest('.assignee-combo')
  if (!combo) return
  const hidden = combo.querySelector('input[type="hidden"][data-key="assignee"], input[type="hidden"][data-pkey="assignee"]')
  const search = combo.querySelector('.assignee-search')
  if (hidden) hidden.value = ''
  if (search) { search.value = ''; search.focus() }
}
function assigneeKeyNav(e, inputEl) {
  const dd = inputEl.parentElement.querySelector('.assignee-dd')
  if (!dd || dd.style.display === 'none') return
  const opts = Array.from(dd.querySelectorAll('.assignee-opt')).filter(o => o.style.display !== 'none')
  if (!opts.length) return
  let idx = opts.findIndex(o => o.classList.contains('aopt-hover'))
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    idx = (idx + 1) % opts.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    idx = (idx - 1 + opts.length) % opts.length
  } else if (e.key === 'Enter' && idx >= 0) {
    e.preventDefault()
    selectAssignee(opts[idx])
    return
  } else if (e.key === 'Escape') {
    dd.style.display = 'none'
    window.removeEventListener('scroll', _assigneeReposHandler, true)
    window.removeEventListener('resize', _assigneeReposHandler)
    return
  } else return
  opts.forEach(o => o.classList.remove('aopt-hover'))
  opts[idx].classList.add('aopt-hover')
  opts[idx].scrollIntoView({ block: 'nearest' })
}
// 바깥 클릭 시 드롭다운 닫기
document.addEventListener('click', function(e) {
  let anyOpen = false
  document.querySelectorAll('.assignee-combo').forEach(combo => {
    const dd = combo.querySelector('.assignee-dd')
    if (!dd) return
    if (!combo.contains(e.target)) {
      dd.style.display = 'none'
    } else if (dd.style.display !== 'none') {
      anyOpen = true
    }
  })
  if (!anyOpen) {
    window.removeEventListener('scroll', _assigneeReposHandler, true)
    window.removeEventListener('resize', _assigneeReposHandler)
  }
})

function saveDetailEdit() {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p) return
  const _changedKeys = []
  // 일반 필드 수집
  document.querySelectorAll('#dDetailContent .dfield [data-key]').forEach(inp => {
    try {
      const k = inp.dataset.key
      const old = (p[k] == null ? '' : String(p[k]))
      if (old !== (inp.value || '').trim() && !_changedKeys.includes(k)) _changedKeys.push(k)
    } catch(e) {}
  })
  document.querySelectorAll('#dDetailContent .dfield [data-key]').forEach(inp => {
    const key = inp.dataset.key
    const val = inp.value.trim()
    if (key === 'productCode' && p.productCodeLocked) {
      return // 품번 확정 후 변경 금지
    } else if (key === 'salePrice' || key === 'costPrice') {
      p[key] = parseInt(val) || 0
    } else if (key === 'videoUrl') {
      p.videoUrl = val || null
    } else if (key === 'assignee') {
      p.assignee = val || ''
      const u = (Array.isArray(window._allUsers) ? window._allUsers : []).find(x => x.uid === val)
      p.assigneeName = u ? (u.name || '') : ''
      p.assigneePosition = u ? (u.position || '') : ''
    } else {
      // 🔴 B2a: cafe24Main/sabangMain/cafe24DetailUrl/sabangDetailUrl(멀티 URL 문자열) 포함 일반 필드
      p[key] = val
    }
  })

  // 🔴 B2a: 레거시 이미지 필드 opportunistic strip (대량 삭제 아님 — 재저장되는 상품만 dead field 제거).
  //   대표는 cafe24Main 로 승격(빌더가 mainImage seed) → mainImage/6키 제거해도 손실 없음.
  delete p.mainImage
  if (p.images && typeof p.images === 'object') {
    ;['sum','lemango','noir','external','design','shoot'].forEach(k => { delete p.images[k] })
  }

  // mallCodes 저장
  if (!p.mallCodes) p.mallCodes = {}
  document.querySelectorAll('#dDetailContent .dmall-input').forEach(inp => {
    const pl = inp.dataset.mallPlatform
    if (pl) p.mallCodes[pl] = inp.value.trim()
  })

  // sizeSpec 저장 (XS~2XL, F × 부위별 구조 — collectSizeSpec 이 캐논 SIZES 순회, XXL 잔존 없음)
  const _detailModal = document.getElementById('detailModal')
  if (Array.isArray(p.sizeSpec) || !p.sizeSpec || typeof p.sizeSpec !== 'object') p.sizeSpec = {}
  p.sizeSpec = collectSizeSpec(_detailModal)

  // barcodes 저장
  if (!p.barcodes) p.barcodes = Object.fromEntries(SIZES.map(sz => [sz, '']))
  document.querySelectorAll('#detailModal .detail-bc-input').forEach(inp => {
    const sz = inp.dataset.size
    if (sz) p.barcodes[sz] = inp.value.trim()
  })

  stampModified(p)

  // 테이블 갱신 (product/stock/sales/dashboard 일괄 — sales.filtered 누락 버그 수정)
  refreshAllProductViews()

  // 임시 예약 코드 확정 처리
  _detailPendingCode = null

  // 모달 뷰모드로 전환 후 재렌더
  document.getElementById('detailModal').classList.remove('edit-mode')
  _dUpdateHeaderBtns('view')
  openDetailModal(_detailCode)
  showToast('상품 정보가 수정되었습니다.', 'success')
  logActivity('update', '상품조회', `상품수정: ${_detailCode}`)
  try {
    const detail = _changedKeys.length ? `필드: ${_changedKeys.join(', ')}` : '정보 수정'
    if (typeof addProductHistory === 'function') addProductHistory(_detailCode, '수정', detail)
    if (typeof notifyWatchers === 'function') notifyWatchers('product', _detailCode, '수정됨')
    if (typeof releaseEditLock === 'function') releaseEditLock('product', _detailCode)
  } catch(e) {}
  if (typeof saveProducts === 'function') saveProducts().catch(e => console.error(e))
}

async function lockProductCode() {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p) return
  if (!await korConfirm(`품번 "${p.productCode}"을 확정합니다.\n확정 후에는 품번을 수정할 수 없습니다.`)) return
  p.productCodeLocked = true
  const lockBtn = document.getElementById('dLockCodeBtn')
  if (lockBtn) lockBtn.style.display = 'none'
  // 재렌더 (품번 필드를 읽기전용으로 표시)
  const content = document.getElementById('dDetailContent')
  if (content) content.innerHTML = buildDetailContent(p)
  showToast('품번이 확정되었습니다.', 'success')
}

function setProductionStatus(btn, status) {
  // 수정 모드가 아니면 무시
  const modal = document.getElementById('detailModal')
  if (!modal.classList.contains('edit-mode')) return

  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p) return
  p.productionStatus = status

  // 버튼 active 상태 갱신
  btn.closest('.dprod-status-row').querySelectorAll('.dprod-btn').forEach(b => {
    b.classList.remove('active', 'danger')
    if (b.dataset.status === status) {
      b.classList.add('active')
      if (status === '생산중단') b.classList.add('danger')
    }
  })
}

// =============================================
// ===== 상세 모달 — 품번 인라인 생성 패널 =====
// =============================================
// 🔴 B2b: 패널 제거 → 디자인 picker 는 기본정보 인라인. selectDetailDesign 이 백스타일명(dBackStyleName) 자동채움.
function filterDetailDesignList() {
  const q = (document.getElementById('dCgDesignSearch')?.value || '').toLowerCase().trim()
  const list = q
    ? _designCodes.filter(([c,e,k]) => c.includes(q) || e.toLowerCase().includes(q) || k.toLowerCase().includes(q))
    : _designCodes
  const current = document.getElementById('dCgDesign')?.value
  const dd = document.getElementById('dCgDesignDropdown')
  if (!dd) return
  dd.innerHTML = list.map(([c,e,k]) =>
    `<div class="design-option${current===c?' selected':''}" onclick="selectDetailDesign('${c}')">
      <span class="design-code">${c}</span>
      <span class="design-names"><span class="design-en">${e}</span><span class="design-kr">${k}</span></span>
    </div>`
  ).join('')
  const sel = dd.querySelector('.design-option.selected')
  if (sel) sel.scrollIntoView({ block: 'nearest' })
}

function selectDetailDesign(code) {
  const found = _designCodes.find(([c]) => c === code)
  if (!found) return
  document.getElementById('dCgDesign').value = code
  const search = document.getElementById('dCgDesignSearch')
  if (search) { search.value = ''; search.placeholder = `${code} - ${found[1]} (${found[2]})` }
  const bs = document.getElementById('dBackStyleName')   // 🔴 B2b: 백스타일명(EN) 자동채움(readonly, data-key=backStyle)
  if (bs) bs.value = found[1] || ''
  filterDetailDesignList()
}

// 🔴 B2b: 상품 상세 1-버튼 품번 생성 (Phase A 공유 경로 + 자기코드 excludeCode + _detailPendingCode 예약).
function genDetailCode() {
  const basis = {
    cls:       document.getElementById('dCgCls')?.value,
    gen:       document.getElementById('dCgGen')?.value,
    typ:       document.getElementById('dCgTyp')?.value,
    des:       document.getElementById('dCgDesign')?.value,
    yearDigit: document.getElementById('dCgYear')?.value,
    seasonNum: document.getElementById('dCgSeason')?.value
  }
  const missing = pcodeMissing(basis)
  if (missing.length) { showToast('품번 생성 반려 — 미입력: ' + missing.join(', '), 'warning'); return }
  const ownCode = _detailCode || ''
  const serial = nextSerial(basis, { excludeCode: ownCode })   // 자기 코드 제외(같은 basis 재생성 허용)
  if (serial === null) { showToast('이 분류+연도+시즌 그룹의 일련번호(00~99)가 소진되었습니다.', 'error'); return }
  const code = String(basis.cls) + String(basis.gen) + String(basis.typ) + String(basis.des) + String(basis.yearDigit) + String(basis.seasonNum) + serial
  if (!pcodeIsValidCode(code)) { showToast('품번 생성 반려 — 입력값을 확인하세요.', 'warning'); return }
  // 🔴 full-code 유일성 최종 가드(authoritative) — 자기 자신 제외
  if (code !== ownCode && (
      State.allProducts.some(p => p.productCode === code) ||
      State.planItems.some(p => p.productCode === code) ||
      _reservedCodes.has(code))) {
    showToast(`품번 "${code}"은 이미 사용 중입니다. 다시 생성해주세요.`, 'error'); return
  }
  if (_detailPendingCode && _detailPendingCode !== ownCode) _reservedCodes.delete(_detailPendingCode)
  if (code !== ownCode) _reservedCodes.add(code)
  _detailPendingCode = code
  const input = document.getElementById('dCgProductCodeInput')
  if (input) input.value = code
  showToast(`품번 "${code}" 생성됨. 저장 버튼을 눌러 확정하세요.`, 'success')
}
window.genDetailCode = genDetailCode

// ===== Feature 8: Product compare =====
function getSelectedProducts() {
  const codes = Array.from(document.querySelectorAll('#productTable .prod-check:checked'))
    .map(el => el.getAttribute('data-code'))
  return codes.map(c => State.allProducts.find(p => p.productCode === c)).filter(Boolean)
}
window.getSelectedProducts = getSelectedProducts

function openCompareModal() {
  const products = getSelectedProducts()
  if (products.length < 2) { showToast('2개 이상의 상품을 선택해주세요.', 'warning'); return }
  if (products.length > 3) { showToast('최대 3개까지 비교 가능합니다.', 'warning'); return }
  const modal = document.getElementById('compareModal')
  if (!modal) return
  const fields = [
    { key:'brand',      label:'브랜드' },
    { key:'nameKr',     label:'상품명' },
    { key:'type',       label:'타입' },
    { key:'salePrice',  label:'판매가', fmt: v => (typeof fmtPrice==='function'?fmtPrice(v):v) },
    { key:'costPrice',  label:'원가',   fmt: v => (typeof fmtPrice==='function'?fmtPrice(v):v) },
    { key:'material',   label:'소재' },
    { key:'gender',     label:'성별' },
    { key:'saleStatus', label:'판매상태' },
  ]
  // Header row: thumbnails + productCode
  const headHtml = products.map(p => {
    const thumb = (typeof getThumbUrl === 'function' ? (getThumbUrl(p) || PLACEHOLDER_IMG) : PLACEHOLDER_IMG)
    return `<th class="compare-th"><div class="compare-thumb"><img src="${thumb}" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'"></div><div class="compare-code">${p.productCode||''}</div></th>`
  }).join('')
  const bodyRows = fields.map(f => {
    const vals = products.map(p => {
      const raw = p[f.key]
      return f.fmt ? f.fmt(raw) : (raw != null && raw !== '' ? raw : '-')
    })
    const allSame = vals.every(v => String(v) === String(vals[0]))
    const tds = vals.map(v => `<td class="${allSame?'':'compare-diff'}">${v}</td>`).join('')
    return `<tr><td class="compare-label">${f.label}</td>${tds}</tr>`
  }).join('')
  document.getElementById('compareBody').innerHTML = `
    <table class="compare-table">
      <thead><tr><th class="compare-label"></th>${headHtml}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`
  if (typeof centerModal === 'function') centerModal(modal)
  modal.showModal()
}
window.openCompareModal = openCompareModal
