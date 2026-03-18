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
  const header = modal.querySelector('.srm-header, .rmodal-header, .dmodal-header')
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
  document.getElementById('dEditBtn').textContent = '✏️ 수정'
  // 품번확정 버튼 상태
  const lockBtn = document.getElementById('dLockCodeBtn')
  if (lockBtn) {
    lockBtn.style.display = p.productCodeLocked ? 'none' : ''
    lockBtn.textContent = '🔒 품번 확정'
  }
  // 위치 초기화 (매번 열릴 때 중앙으로)
  modal.style.left = ''
  modal.style.top  = ''

  // 헤더
  document.getElementById('dBrand').textContent   = p.brand
  document.getElementById('dNameKr').textContent  = p.nameKr || ''
  document.getElementById('dCode').textContent    = p.productCode

  // 이미지 (SUM 첫 번째 우선, 없으면 다른 이미지, 없으면 로고)
  const FALLBACK_LOGO = 'file:////lemangokorea/온라인/01.이미지/로고/Lemango/르망고_송부용_로고(WH).png'
  const allImgs = getAllImages(p)
  const sumFirst = p.images?.sum?.[0] || null
  const mainImg = document.getElementById('dImgMain')
  const noneEl  = document.getElementById('dImgNone')
  mainImg.src = sumFirst || allImgs[0] || FALLBACK_LOGO
  mainImg.style.display = ''
  noneEl.style.display = 'none'
  mainImg.style.cursor = 'pointer'
  mainImg.title = '클릭하면 새 탭에서 열립니다'
  mainImg.onclick = () => { if (mainImg.src) window.open(mainImg.src) }
  // 썸네일
  document.getElementById('dImgThumbs').innerHTML = allImgs.map((url, i) =>
    `<img src="${url}" class="dimg-thumb${i===0?' active':''}" onclick="dSwitchImg(this,'${url}')" onerror="this.style.display='none'" />`
  ).join('')

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
}

function dSwitchImg(el, url) {
  document.getElementById('dImgMain').src = url
  document.getElementById('dImgMain').style.display = ''
  document.querySelectorAll('.dimg-thumb').forEach(t => t.classList.remove('active'))
  el.classList.add('active')
}

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

  return `
    <div class="dsection">
      <div class="dsection-title">기본 정보</div>
      <div class="dsection-grid">
        ${field('브랜드',    'brand',       p.brand,    'select', brandOpts)}
        ${field('판매상태',  'saleStatus',  p.saleStatus||'판매중', 'select', saleStatusOpts)}
        ${productCodeField}
        ${field('샘플번호',  'sampleNo',    p.sampleNo)}
        ${field('카페24 코드', 'cafe24Code', p.cafe24Code)}
        ${field('바코드',    'barcode',     p.barcode)}
        ${field('상품명(한글)', 'nameKr',   p.nameKr,   'text','','span2')}
        ${field('상품명(영문)', 'nameEn',   p.nameEn,   'text','','span2')}
        ${field('색상(한글)', 'colorKr',   p.colorKr)}
        ${field('색상(영문)', 'colorEn',   p.colorEn)}
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
      <div class="dsection-grid">
        ${field('가슴(cm)', 'bust',  p.bust)}
        ${field('허리(cm)', 'waist', p.waist)}
        ${field('엉덩이(cm)', 'hip', p.hip)}
        ${field('모델 착용사이즈', 'modelSize', p.modelSize, 'text','','span3')}
      </div>
    </div>

    <div class="dsection">
      <div class="dsection-title">제조 정보</div>
      <div class="dsection-grid">
        ${field('제조년월', 'madeMonth', p.madeMonth)}
        ${field('제조사',   'madeBy',    p.madeBy)}
        ${field('제조국',   'madeIn',    p.madeIn)}
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
      <div class="dsection-title dimg-toggle collapsed" onclick="toggleDImg('dImgBody')">
        이미지 URL <span class="dimg-arrow">▶</span>
      </div>
      <div id="dImgBody" class="dsection-grid col1 dimg-hidden">
        ${(() => {
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
          <div class="dimg-sub-title collapsed" onclick="toggleDImg('dImgJasa')">자사몰 ${preview(jasaUrls)}<span class="dimg-arrow">▶</span></div>
          <div id="dImgJasa" class="dimg-hidden">${urlField('자사몰', 'urlJasa', jasaUrls.join('\n'), 'textarea')}</div>
        </div>
        <div class="dimg-sub">
          <div class="dimg-sub-title collapsed" onclick="toggleDImg('dImgExternal')">외부몰 ${preview(extUrls)}<span class="dimg-arrow">▶</span></div>
          <div id="dImgExternal" class="dimg-hidden">${urlField('외부몰', 'urlExternal', extUrls.join('\n'), 'textarea')}</div>
        </div>
        <div class="dimg-sub">
          <div class="dimg-sub-title collapsed" onclick="toggleDImg('dImgSum')">SUM ${preview(sumUrls)}<span class="dimg-arrow">▶</span></div>
          <div id="dImgSum" class="dimg-hidden">${urlField('SUM', 'urlSum', sumUrls.join('\n'), 'textarea')}</div>
        </div>
        <div class="dimg-sub">
          <div class="dimg-sub-title collapsed" onclick="toggleDImg('dImgVideo')">영상 URL ${preview(vidUrl)}<span class="dimg-arrow">▶</span></div>
          <div id="dImgVideo" class="dimg-hidden">${urlField('영상 URL', 'videoUrl', vidUrl, 'text')}</div>
        </div>`
        })()}
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

    <div class="dmodal-edit-footer">
      <button type="button" class="btn btn-outline" onclick="toggleDetailEdit()">취소</button>
      <button type="button" class="btn btn-new" onclick="saveDetailEdit()">저장</button>
    </div>
  `
}

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

function closeDetailModal() {
  // 미저장 임시 예약 품번 해제
  if (_detailPendingCode) {
    const currentProduct = State.allProducts.find(x => x.productCode === _detailCode)
    if (!currentProduct || currentProduct.productCode !== _detailPendingCode) {
      _reservedCodes.delete(_detailPendingCode)
    }
    _detailPendingCode = null
  }
  document.getElementById('detailModal').close()
}

function toggleDetailEdit() {
  const modal = document.getElementById('detailModal')
  const isEdit = modal.classList.toggle('edit-mode')
  document.getElementById('dEditBtn').textContent = isEdit ? '❌ 취소' : '✏️ 수정'

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

  // 일반 필드 수집
  document.querySelectorAll('#dDetailContent .dfield [data-key]').forEach(inp => {
    const key = inp.dataset.key
    const val = inp.value.trim()
    if (key === 'productCode' && p.productCodeLocked) {
      return // 품번 확정 후 변경 금지
    } else if (key === 'salePrice' || key === 'costPrice') {
      p[key] = parseInt(val) || 0
    } else if (['urlJasa','urlExternal','urlSum'].includes(key)) {
      const arr = val.split(/[\n\r]+/).map(u=>u.trim()).filter(Boolean)
      if (key === 'urlJasa')    { p.images.lemango = arr; p.images.noir = [] }
      if (key === 'urlExternal')p.images.external = arr
      if (key === 'urlSum')     p.images.sum      = arr
    } else if (key === 'videoUrl') {
      p.videoUrl = val || null
    } else {
      p[key] = val
    }
  })

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
  document.getElementById('dEditBtn').textContent = '✏️ 수정'
  openDetailModal(_detailCode)
  showToast('상품 정보가 수정되었습니다.', 'success')
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
