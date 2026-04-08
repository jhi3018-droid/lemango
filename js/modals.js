// =============================================
// ===== 이미지 모달 =====
// =============================================
function openModal(idx, images) {
  State.modal.images = images
  State.modal.idx    = idx
  updateModal()
  document.getElementById('imageModal').showModal()
}

function updateModal() {
  const { images, idx } = State.modal
  document.getElementById('modalImg').src = images[idx] || ''
  document.getElementById('modalCounter').textContent = images.length > 1 ? `${idx+1} / ${images.length}` : ''
  document.getElementById('modalPrev').style.display = images.length > 1 ? '' : 'none'
  document.getElementById('modalNext').style.display = images.length > 1 ? '' : 'none'
}

function modalNav(dir) {
  const { images } = State.modal
  State.modal.idx = (State.modal.idx + dir + images.length) % images.length
  updateModal()
}

document.addEventListener('keydown', e => {
  const modal = document.getElementById('imageModal')
  if (!modal.open) return
  if (e.key === 'ArrowLeft')  modalNav(-1)
  if (e.key === 'ArrowRight') modalNav(1)
  if (e.key === 'Escape')     modal.close()
})

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
  modal.style.left = ''
  modal.style.top  = ''
  requestAnimationFrame(() => {
    modal.style.left = Math.max(0, (window.innerWidth  - modal.offsetWidth)  / 2) + 'px'
    modal.style.top  = Math.max(0, (window.innerHeight - modal.offsetHeight) / 2) + 'px'
  })
}

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

function openDetailModal(productCode) {
  const p = State.allProducts.find(x => x.productCode === productCode)
  if (!p) return
  _detailCode = productCode

  const modal = document.getElementById('detailModal')
  modal.classList.remove('edit-mode')
  _dUpdateHeaderBtns('view')
  // 품번확정 버튼 상태
  const lockBtn = document.getElementById('dLockCodeBtn')
  if (lockBtn) {
    lockBtn.style.display = p.productCodeLocked ? 'none' : 'inline-block'
    lockBtn.textContent = '🔒 품번 확정'
  }
  // 삭제 버튼 (grade 2+ only)
  const deleteBtn = document.getElementById('dDeleteBtn')
  if (deleteBtn && !(State.currentUser && State.currentUser.grade >= 2)) {
    deleteBtn.dataset.hidden = '1'
  } else if (deleteBtn) {
    delete deleteBtn.dataset.hidden
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
  const imgs = []
  if (p.mainImage) imgs.push(p.mainImage)
  if (p.images) {
    ;['sum','lemango','noir','external','design','shoot'].forEach(key => {
      const arr = p.images[key]
      if (Array.isArray(arr)) arr.forEach(url => { if (url && !imgs.includes(url)) imgs.push(url) })
    })
  }
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
  mainImg.title = '클릭하면 새 탭에서 열립니다'
  mainImg.onclick = () => { if (mainImg.src) window.open(mainImg.src) }

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

function buildDetailContent(p) {
  const sizes  = SIZES
  const platforms = _platforms

  // 품번 생성 패널 상수
  const DCG_CLS_OPT  = [['LS','르망고 수영복'],['LW','르망고 의류'],['LG','르망고 굿즈'],['NS','느와 수영복'],['NW','느와 의류'],['NG','느와 굿즈']]
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

  const dcgMkSel = (id, opts, guess) =>
    `<select id="${id}" onchange="updateDetailProductCode()">${opts.map(([v,l]) => `<option value="${v}"${v===guess?' selected':''}>${v}${l?' - '+l:''}</option>`).join('')}</select>`

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
          <input type="text" data-key="productCode" id="dCgProductCodeInput" value="${existCode.replace(/"/g,'&quot;')}" placeholder="품번 직접 입력" />
          <button class="btn btn-outline pdcg-toggle-btn" onclick="toggleDetailCodeGenPanel()" style="font-size:11px;padding:4px 12px;white-space:nowrap">품번 생성 ▾</button>
        </div>
        <div id="dCgPanel" class="pd-codegen-panel" style="display:none">
          <div class="pdcg-selects">
            <div class="pdcg-group"><label>분류</label>${dcgMkSel('dCgCls', DCG_CLS_OPT, dcgClsGuess)}</div>
            <div class="pdcg-group"><label>성별</label>${dcgMkSel('dCgGen', DCG_GEN_OPT, dcgGenGuess)}</div>
            <div class="pdcg-group"><label>타입</label>${dcgMkSel('dCgTyp', DCG_TYP_OPT, dcgTypGuess)}</div>
            <div class="pdcg-group"><label>연도</label>${dcgMkSel('dCgYear', DCG_YEAR_OPT.map(v=>[v,'']), dcgYearGuess)}</div>
            <div class="pdcg-group"><label>시즌</label>${dcgMkSel('dCgSeason', ['1','2','3','4','5'].map(v=>[v,'']), dcgSeaGuess)}</div>
          </div>
          <div class="pdcg-design-row">
            <label>디자인 번호 (패턴)</label>
            <input type="text" id="dCgDesignSearch" placeholder="코드 또는 패턴명 검색" oninput="filterDetailDesignList()" autocomplete="off" class="design-search-input" />
            <div id="dCgDesignDropdown" class="design-dropdown" style="max-height:160px;overflow-y:auto"></div>
            <input type="hidden" id="dCgDesign" value="${dcgDesGuess}" />
          </div>
          <div class="pdcg-preview-row">
            <span class="pdcg-label">미리보기</span>
            <code id="dCgPreview" class="pdcg-preview">-</code>
            <button class="btn btn-primary" id="dCgApplyBtn" onclick="applyDetailGeneratedCode()" disabled style="font-size:12px;padding:4px 14px">적용</button>
          </div>
        </div>
      </div>`

  const field = (label, key, val, type='text', opts='', spanClass='') =>
    `<div class="dfield ${spanClass}">
      <span class="dfield-label">${label}</span>
      <span class="dfield-value${!val ? ' empty' : ''}${type==='textarea' ? ' long' : ''}">${val || '-'}</span>
      ${type==='select'
        ? `<select data-key="${key}">${opts}</select>`
        : type==='textarea'
          ? `<textarea data-key="${key}" rows="4">${val||''}</textarea>`
          : `<input type="${type}" data-key="${key}" value="${(val||'').toString().replace(/"/g,'&quot;')}" />`
      }
    </div>`

  // URL 필드 (복사 버튼 포함) — textarea 타입은 URL별 개별 복사 버튼 표시
  const urlField = (label, key, val, type='text') => {
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

  const pinnedMemoBlock = `
    <div class="pinned-memo">📌 ${esc(p.pinnedMemo || '')}</div>
    <div class="pinned-memo-edit">
      <textarea data-key="pinnedMemo" rows="2" placeholder="📌 고정 메모 (상단 상시 노출)">${esc(p.pinnedMemo || '')}</textarea>
    </div>`

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
        ${field('색상(한글)', 'colorKr',   p.colorKr)}
        ${field('색상(영문)', 'colorEn',   p.colorEn)}
        ${field('성별', 'gender', GENDER_MAP[p.gender] || p.gender || '', 'select',
          `<option value=""${!p.gender?' selected':''}>-</option>` +
          Object.entries(GENDER_MAP).map(([v,l]) => `<option value="${v}"${p.gender===v?' selected':''}>${l}</option>`).join('')
        )}
        ${field('담당자', 'assignee', assigneeView, 'select', assigneeOpts)}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">가격 / 디자인</div>
      <div class="dsection-grid">
        ${field('판매가(원)', 'salePrice',  p.salePrice ? p.salePrice.toLocaleString()+'원' : '-', 'number')}
        ${field('원가(원)',   'costPrice',  p.costPrice ? p.costPrice.toLocaleString()+'원' : '-', 'number')}
        ${field('타입',       'type',       p.type,     'select', typeOpts)}
        ${field('원단타입',   'fabricType', p.fabricType, 'select', fabricOpts)}
        ${field('백스타일',   'backStyle',  p.backStyle)}
        ${field('다리파임',   'legCut',     p.legCut,   'select', legOpts)}
        ${field('가이드',     'guide',      p.guide)}
        ${field('가슴선',     'chestLine',  p.chestLine,'select', chestLineOpts)}
        ${field('비침',       'transparency',p.transparency,'select', transparencyOpts)}
        ${field('안감',       'lining',     p.lining,   'select', liningOpts)}
        ${field('캡고리',     'capRing',    p.capRing,  'select', capRingOpts)}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">소재</div>
      <div class="dsection-grid col1">
        ${field('소재',     'material',   p.material,   'textarea','','span3')}
        ${field('원단설명', 'fabricType', p.fabricType, 'textarea','','span3')}
        ${field('디자이너 코멘트', 'comment', p.comment, 'textarea','','span3')}
        ${field('세탁방법', 'washMethod', p.washMethod, 'textarea','','span3')}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">사이즈 규격</div>
      <div style="padding:10px 12px">
        ${(() => {
          const spec = ensureSizeSpec(p)
          let h = '<div class="size-spec-table-wrap"><table class="size-spec-table"><thead><tr><th></th>'
          SIZES.forEach(sz => { h += `<th>${sz}</th>` })
          h += '</tr></thead><tbody>'
          SPEC_ROWS.forEach(r => {
            h += '<tr>'
            h += `<td class="size-spec-label">${r.label}</td>`
            SIZES.forEach(sz => {
              const v = (spec[r.key] && spec[r.key][sz]) || ''
              h += `<td><span class="dfield-value size-spec-val">${esc(v) || '-'}</span><input type="text" class="size-spec-input" data-spec="${r.key}" data-size="${sz}" value="${(v||'').replace(/"/g,'&quot;')}" /></td>`
            })
            h += '</tr>'
          })
          h += '</tbody></table></div>'
          return h
        })()}
        <div class="dfield" style="margin-top:10px">
          <span class="dfield-label">모델착용사이즈</span>
          <span class="dfield-value">${esc(p.modelSize) || '-'}</span>
          <input type="text" data-key="modelSize" value="${(p.modelSize||'').replace(/"/g,'&quot;')}" />
        </div>
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">제조 정보</div>
      <div class="dsection-grid">
        ${field('제조년월', 'madeMonth', p.madeMonth)}
        ${field('제조사',   'madeBy',    p.madeBy)}
        ${field('제조국',   'madeIn',    p.madeIn)}
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
        <button type="button" class="img-html-btn-all" onclick="event.stopPropagation();copyAllImageHtml()">전체 HTML 복사</button>
      </div>
      <div id="dImgBody" class="dsection-grid col1">
        ${(() => {
          const mainImg  = p.mainImage || ''
          const jasaUrls = [...(p.images?.lemango||[]), ...(p.images?.noir||[])]
          const extUrls  = p.images?.external || []
          const sumUrls  = p.images?.sum || []
          const vidUrl   = p.videoUrl || ''
          const preview = (arr) => {
            const first = Array.isArray(arr) ? arr[0] : arr
            return first ? `<span class="dimg-preview">${first}</span>` : ''
          }
          return `
        <div class="dimg-sub">
          <div class="dimg-sub-title collapsed" onclick="toggleDImg('dImgMain')">대표이미지 ${preview(mainImg)}<span class="dimg-arrow">▶</span>${mainImg ? `<button type="button" class="img-html-btn" onclick="event.stopPropagation();copyImageHtml('mainImage')">HTML</button>` : ''}</div>
          <div id="dImgMain" class="dimg-hidden">${(() => {
            const safeVal = (mainImg||'').replace(/"/g, '&quot;')
            return `<div class="dfield span3">
              <div class="dfield-label-row">
                <span class="dfield-label">대표이미지</span>
                ${mainImg ? `<button type="button" class="btn-copy-url" data-url="${safeVal}" onclick="copySingleUrlFromBtn(this)" title="클립보드 복사">복사</button>` : ''}
              </div>
              <span class="dfield-value${!mainImg ? ' empty' : ''}" data-urlkey="mainImage">${mainImg || '-'}</span>
              <input type="text" data-key="mainImage" value="${safeVal}" />
            </div>`
          })()}</div>
        </div>
        <div class="dimg-sub">
          <div class="dimg-sub-title collapsed" onclick="toggleDImg('dImgJasa')">자사몰 ${preview(jasaUrls)}<span class="dimg-arrow">▶</span>${jasaUrls.length ? `<button type="button" class="img-html-btn" onclick="event.stopPropagation();copyImageHtml('jasa')">HTML</button>` : ''}</div>
          <div id="dImgJasa" class="dimg-hidden">${urlField('자사몰', 'urlJasa', jasaUrls.join('\n'), 'textarea')}</div>
        </div>
        <div class="dimg-sub">
          <div class="dimg-sub-title collapsed" onclick="toggleDImg('dImgExternal')">외부몰 ${preview(extUrls)}<span class="dimg-arrow">▶</span>${extUrls.length ? `<button type="button" class="img-html-btn" onclick="event.stopPropagation();copyImageHtml('external')">HTML</button>` : ''}</div>
          <div id="dImgExternal" class="dimg-hidden">${urlField('외부몰', 'urlExternal', extUrls.join('\n'), 'textarea')}</div>
        </div>
        <div class="dimg-sub">
          <div class="dimg-sub-title collapsed" onclick="toggleDImg('dImgSum')">SUM ${preview(sumUrls)}<span class="dimg-arrow">▶</span>${sumUrls.length ? `<button type="button" class="img-html-btn" onclick="event.stopPropagation();copyImageHtml('sum')">HTML</button>` : ''}</div>
          <div id="dImgSum" class="dimg-hidden">${urlField('SUM', 'urlSum', sumUrls.join('\n'), 'textarea')}</div>
        </div>
        <div class="dimg-sub">
          <div class="dimg-sub-title collapsed" onclick="toggleDImg('dImgVideo')">영상 URL ${preview(vidUrl)}<span class="dimg-arrow">▶</span></div>
          <div id="dImgVideo" class="dimg-hidden">${urlField('영상 URL', 'videoUrl', vidUrl, 'text')}</div>
        </div>`
        })()}
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
            const nm = (img.name || '').length > 16 ? img.name.slice(0,14)+'..' : (img.name||'')
            return `<div class="plan-img-thumb plan-img-thumb-temp">
              <span class="plan-img-thumb-tag-temp">임시</span>
              <img src="${safe}" onclick="window.open('${safe.replace(/'/g,"\\'")}','_blank')" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" />
              <div class="plan-img-thumb-name">${esc(nm)}</div>
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
  openDetailModal(_detailCode)
  showToast('임시 이미지가 삭제되었습니다.', 'success')
}

async function deleteAllProductTempImages() {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p || !Array.isArray(p.tempImages) || !p.tempImages.length) return
  const ok = await korConfirm(`임시 이미지 ${p.tempImages.length}개를 모두 삭제하시겠습니까?`, '전체 삭제', '취소')
  if (!ok) return
  p.tempImages = []
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

// ===== 상품 삭제 =====
async function deleteProduct() {
  const p = State.allProducts.find(x => x.productCode === _detailCode)
  if (!p) return

  // 매출 기록 경고
  const revCount = (p.revenueLog || []).length
  let msg = '상품을 삭제하시겠습니까?\n관련 매출/재고 데이터도 함께 삭제됩니다.\n삭제 후 복구할 수 없습니다.'
  if (revCount > 0) {
    msg = `이 상품에 매출 기록 ${revCount}건이 있습니다.\n정말 삭제하시겠습니까?\n\n관련 매출/재고 데이터도 함께 삭제됩니다.\n삭제 후 복구할 수 없습니다.`
  }

  const ok = await korConfirm(msg)
  if (!ok) return

  const code = p.productCode
  const name = p.nameKr || ''

  // State.allProducts에서 제거
  const idx = State.allProducts.indexOf(p)
  if (idx >= 0) State.allProducts.splice(idx, 1)

  // Firestore comments 삭제 (product 타입)
  if (db) {
    try {
      const snap = await db.collection('comments')
        .where('modalType', '==', 'product')
        .where('targetId', '==', code)
        .get()
      if (snap.docs.length) {
        const batch = db.batch()
        snap.docs.forEach(doc => batch.delete(doc.ref))
        await batch.commit()
      }
    } catch (e) { console.warn('상품 댓글 삭제 실패:', e) }
  }

  // 모달 닫기 + 테이블 갱신
  closeDetailModal(true)
  if (typeof renderProductTable === 'function') renderProductTable()
  if (typeof renderStockTable === 'function') renderStockTable()
  if (typeof renderSalesTable === 'function') renderSalesTable()

  logActivity('delete', '상품조회', `상품 삭제 — ${code} ${name}`)
  showToast('상품이 삭제되었습니다.', 'success')
}

function _dUpdateHeaderBtns(mode) {
  // mode: 'view' | 'edit'
  document.querySelectorAll('#detailModal .d-view-btn').forEach(b => {
    if (b.id === 'dDeleteBtn' && b.dataset.hidden === '1') { b.style.display = 'none'; return }
    b.style.display = mode === 'view' ? 'inline-block' : 'none'
  })
  document.querySelectorAll('#detailModal .d-edit-btn').forEach(b => {
    b.style.display = mode === 'edit' ? 'inline-block' : 'none'
  })
}

function _dSyncWatchBtn() {
  const btn = document.getElementById('dWatchBtn')
  if (!btn || !_detailCode) return
  const on = typeof isWatching === 'function' && isWatching('product', _detailCode)
  btn.textContent = on ? '👁 활성' : '👁'
  btn.classList.toggle('active', on)
}
window._dSyncWatchBtn = _dSyncWatchBtn

function _dSyncLockWarn() {
  const el = document.getElementById('dLockWarn')
  if (!el) return
  const info = (typeof getEditLockInfo === 'function') ? getEditLockInfo('product', _detailCode) : null
  if (info) {
    el.textContent = `🔒 ${info.userName || '다른 사용자'} 편집중`
    el.style.display = ''
  } else {
    el.textContent = ''
    el.style.display = 'none'
  }
}
window._dSyncLockWarn = _dSyncLockWarn

function toggleDetailEdit() {
  const modal = document.getElementById('detailModal')
  const willEdit = !modal.classList.contains('edit-mode')
  if (willEdit) {
    const info = (typeof getEditLockInfo === 'function') ? getEditLockInfo('product', _detailCode) : null
    if (info) {
      showToast(`${info.userName || '다른 사용자'}님이 편집 중입니다`, 'warn')
      _dSyncLockWarn()
      return
    }
    if (typeof acquireEditLock === 'function') acquireEditLock('product', _detailCode)
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
    } else if (key === 'mainImage') {
      p.mainImage = val || ''
    } else if (['urlJasa','urlExternal','urlSum'].includes(key)) {
      const arr = val.split(/[\n\r]+/).map(u=>u.trim()).filter(Boolean)
      if (key === 'urlJasa')    { p.images.lemango = arr; p.images.noir = [] }
      if (key === 'urlExternal')p.images.external = arr
      if (key === 'urlSum')     p.images.sum      = arr
    } else if (key === 'videoUrl') {
      p.videoUrl = val || null
    } else if (key === 'assignee') {
      p.assignee = val || ''
      const u = (Array.isArray(window._allUsers) ? window._allUsers : []).find(x => x.uid === val)
      p.assigneeName = u ? (u.name || '') : ''
      p.assigneePosition = u ? (u.position || '') : ''
    } else {
      p[key] = val
    }
  })

  // mallCodes 저장
  if (!p.mallCodes) p.mallCodes = {}
  document.querySelectorAll('#dDetailContent .dmall-input').forEach(inp => {
    const pl = inp.dataset.mallPlatform
    if (pl) p.mallCodes[pl] = inp.value.trim()
  })

  // sizeSpec 저장
  ensureSizeSpec(p)
  document.querySelectorAll('#detailModal .size-spec-input').forEach(inp => {
    const specKey = inp.dataset.spec
    const sz = inp.dataset.size
    if (specKey && sz) p.sizeSpec[specKey][sz] = inp.value.trim()
  })

  // barcodes 저장
  if (!p.barcodes) p.barcodes = Object.fromEntries(SIZES.map(sz => [sz, '']))
  document.querySelectorAll('#detailModal .detail-bc-input').forEach(inp => {
    const sz = inp.dataset.size
    if (sz) p.barcodes[sz] = inp.value.trim()
  })

  stampModified(p)

  // 테이블 갱신
  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  renderProductTable()
  renderStockTable()
  renderDashboard()

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
function toggleDetailCodeGenPanel() {
  const panel = document.getElementById('dCgPanel')
  const btn   = document.querySelector('#dDetailContent .pdcg-toggle-btn')
  if (!panel) return
  const open = panel.style.display === 'none'
  panel.style.display = open ? '' : 'none'
  if (btn) btn.textContent = open ? '품번 생성 ▴' : '품번 생성 ▾'
  if (open) {
    filterDetailDesignList()
    updateDetailProductCode()
  }
}

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
  filterDetailDesignList()
  updateDetailProductCode()
}

function updateDetailProductCode() {
  const cls    = document.getElementById('dCgCls')?.value
  const gen    = document.getElementById('dCgGen')?.value
  const typ    = document.getElementById('dCgTyp')?.value
  const des    = document.getElementById('dCgDesign')?.value
  const year   = document.getElementById('dCgYear')?.value
  const season = document.getElementById('dCgSeason')?.value
  if (!cls || !des) return

  const prefix = cls + gen + typ + des + year + season  // 12자리

  // 현재 상품 자신의 코드는 제외 (같은 prefix로 재생성 가능)
  const currentOwnCode = _detailCode || ''

  const used = new Set()
  ;[...State.allProducts, ...State.planItems].forEach(p => {
    const c = p.productCode || ''
    if (c === currentOwnCode) return  // 자기 자신 제외
    if (c.length === prefix.length + 2 && c.startsWith(prefix)) used.add(c.slice(-2))
  })
  _reservedCodes.forEach(c => {
    if (c === currentOwnCode) return
    if (c.length === prefix.length + 2 && c.startsWith(prefix)) used.add(c.slice(-2))
  })

  let nextNum = null
  for (let i = 0; i <= 99; i++) {
    const candidate = String(i).padStart(2, '0')
    if (!used.has(candidate)) { nextNum = candidate; break }
  }

  const preview = document.getElementById('dCgPreview')
  const applyBtn = document.getElementById('dCgApplyBtn')
  if (nextNum === null) {
    if (preview)  preview.textContent = '사용 가능한 번호 없음'
    if (applyBtn) applyBtn.disabled = true
  } else {
    if (preview)  preview.textContent = prefix + nextNum
    if (applyBtn) applyBtn.disabled = false
  }
}

function applyDetailGeneratedCode() {
  const code = document.getElementById('dCgPreview')?.textContent
  if (!code || code === '-' || code === '사용 가능한 번호 없음') return

  // 중복 최종 확인 (자기 자신 제외)
  const currentOwnCode = _detailCode || ''
  if (code !== currentOwnCode && (
      State.allProducts.some(p => p.productCode === code) ||
      State.planItems.some(p => p.productCode === code) ||
      _reservedCodes.has(code))) {
    showToast(`품번 "${code}"은 이미 사용 중입니다. 다시 생성해주세요.`, 'error')
    updateDetailProductCode()
    return
  }

  // 이전 임시 예약 해제 (자기 원래 코드가 아닌 경우만)
  if (_detailPendingCode && _detailPendingCode !== currentOwnCode) {
    _reservedCodes.delete(_detailPendingCode)
  }
  // 새 코드 예약 (원래 코드와 다를 때만)
  if (code !== currentOwnCode) {
    _reservedCodes.add(code)
  }
  _detailPendingCode = code

  const input = document.getElementById('dCgProductCodeInput')
  if (input) input.value = code

  // 패널 닫기
  const panel = document.getElementById('dCgPanel')
  if (panel) panel.style.display = 'none'
  const btn = document.querySelector('#dDetailContent .pdcg-toggle-btn')
  if (btn) btn.textContent = '품번 생성 ▾'

  showToast(`품번 "${code}" 적용됨. 저장 버튼을 눌러 확정하세요.`, 'success')
}

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
