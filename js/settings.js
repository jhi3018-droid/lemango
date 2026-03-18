// =============================================
// ===== 설정 탭 =====
// =============================================

// ===== 자동완성 + 중복 검사 공통 =====
// 현재 열려있는 자동완성 드롭다운 닫기
function _closeAllAc() {
  document.querySelectorAll('.set-ac-dropdown').forEach(d => d.remove())
}

// input 아래에 자동완성 드롭다운 표시
function _showAc(input, matches, onSelect) {
  _closeAcFor(input)
  if (!matches.length) return
  const rect = input.getBoundingClientRect()
  const dd = document.createElement('div')
  dd.className = 'set-ac-dropdown'
  dd.style.width = input.offsetWidth + 'px'
  matches.forEach(m => {
    const row = document.createElement('div')
    row.className = 'set-ac-item'
    row.textContent = m.display
    if (m.isDup) row.classList.add('set-ac-dup')
    row.onmousedown = e => { e.preventDefault(); onSelect(m); dd.remove() }
    dd.appendChild(row)
  })
  input._acDd = dd
  // 드롭다운을 input의 부모 .set-add-row 또는 .set-item-editrow 안에 배치
  const wrap = input.closest('.set-ac-wrap')
  if (wrap) { wrap.appendChild(dd) }
  else { input.parentElement.appendChild(dd) }
}

function _closeAcFor(input) {
  if (input._acDd) { input._acDd.remove(); input._acDd = null }
}

// 중복 상태를 input에 표시
function _markDup(input, isDup) {
  const wrap = input.closest('.set-ac-wrap') || input.parentElement
  let badge = wrap.querySelector('.set-dup-badge')
  if (isDup) {
    input.classList.add('set-input-dup')
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'set-dup-badge'
      badge.textContent = '중복'
      wrap.appendChild(badge)
    }
  } else {
    input.classList.remove('set-input-dup')
    if (badge) badge.remove()
  }
}

// 일반 설정(simple) 자동완성 핸들러
function _acSimple(input, key) {
  const q = input.value.trim().toLowerCase()
  if (!q) { _closeAcFor(input); _markDup(input, false); return }
  const items = _settings[key] || []
  const vals = items.map(it => Array.isArray(it) ? it[0] : it)
  const exactDup = vals.some(v => v.toLowerCase() === q)
  _markDup(input, exactDup)
  const matches = vals
    .filter(v => v.toLowerCase().includes(q))
    .slice(0, 8)
    .map(v => ({ display: v, val: v, isDup: v.toLowerCase() === q }))
  _showAc(input, matches, m => { input.value = m.val })
}

// pair 설정 (코드 필드) 자동완성 핸들러
function _acPairVal(input, key) {
  const q = input.value.trim().toLowerCase()
  if (!q) { _closeAcFor(input); _markDup(input, false); return }
  const items = _settings[key] || []
  const exactDup = items.some(it => it[0].toLowerCase() === q)
  _markDup(input, exactDup)
  const matches = items
    .filter(([v]) => v.toLowerCase().includes(q))
    .slice(0, 8)
    .map(([v, l]) => ({ display: `${v} — ${l}`, val: v, label: l, isDup: v.toLowerCase() === q }))
  _showAc(input, matches, m => {
    input.value = m.val
    // 코드 선택 시 표시명도 자동 채움
    const labelInput = input.closest('.set-add-row, .set-item-editrow')?.querySelector('[data-field="label"], [id$="_label"]')
    if (labelInput && m.label) labelInput.value = m.label
  })
}

// 디자인코드 자동완성 핸들러
function _acDesignCode(input, field) {
  const q = input.value.trim().toLowerCase()
  if (!q) { _closeAcFor(input); _markDup(input, false); return }
  if (field === 'code') {
    const exactDup = _designCodes.some(([c]) => c.toLowerCase() === q)
    _markDup(input, exactDup)
    const matches = _designCodes
      .filter(([c]) => c.toLowerCase().includes(q))
      .slice(0, 8)
      .map(([c, e, k]) => ({ display: `${c} — ${e} (${k})`, val: c, isDup: c.toLowerCase() === q }))
    _showAc(input, matches, m => { input.value = m.val })
  } else {
    _markDup(input, false)
    const matches = _designCodes
      .filter(([c, e, k]) => e.toLowerCase().includes(q) || k.toLowerCase().includes(q))
      .slice(0, 8)
      .map(([c, e, k]) => ({ display: `${c} — ${e} (${k})`, val: field === 'en' ? e : k, isDup: false }))
    _showAc(input, matches, m => { input.value = m.val })
  }
}

// 플랫폼 자동완성 핸들러
function _acPlatform(input) {
  const q = input.value.trim().toLowerCase()
  if (!q) { _closeAcFor(input); _markDup(input, false); return }
  const exactDup = _platforms.some(p => p.toLowerCase() === q)
  _markDup(input, exactDup)
  const matches = _platforms
    .filter(p => p.toLowerCase().includes(q))
    .slice(0, 8)
    .map(p => ({ display: p, val: p, isDup: p.toLowerCase() === q }))
  _showAc(input, matches, m => { input.value = m.val })
}

// blur 시 드롭다운 닫기 (약간 지연으로 클릭 이벤트 보장)
function _acBlur(input) { setTimeout(() => _closeAcFor(input), 150) }

// ===== 카드 렌더 =====
function _renderSetCard(def) {
  const items = _settings[def.key] || []
  const isPair = def.type === 'pair'

  const listHtml = items.map((item, idx) => {
    const [val, label] = Array.isArray(item) ? item : [item, item]
    const viewInner = isPair
      ? `<span class="set-item-code">${val}</span><span class="set-item-label">${label}</span>`
      : `<span class="set-item-label">${val}</span>`
    const acKeyAttr = isPair ? `oninput="_acPairVal(this,'${def.key}')"` : `oninput="_acSimple(this,'${def.key}')"`
    const editInner = isPair
      ? `<div class="set-ac-wrap" style="width:80px;flex:none;position:relative">
           <input type="text" class="set-edit-input" value="${val}" data-field="val" ${acKeyAttr} onblur="_acBlur(this)" style="width:100%" />
         </div>
         <input type="text" class="set-edit-input" value="${label}" data-field="label" style="flex:1" />`
      : `<div class="set-ac-wrap" style="flex:1;position:relative">
           <input type="text" class="set-edit-input" value="${val}" data-field="val" ${acKeyAttr} onblur="_acBlur(this)" style="width:100%" />
         </div>`

    return `<div class="set-item" id="setItem_${def.key}_${idx}">
      <div class="set-item-view">${viewInner}
        <button class="set-item-action set-item-edit" onclick="editSettingItem('${def.key}',${idx})" title="수정">&#9998;</button>
        <button class="set-item-action set-item-del" onclick="removeSettingItem('${def.key}',${idx})" title="삭제">&#10005;</button>
      </div>
      <div class="set-item-editrow" style="display:none">${editInner}
        <button class="set-edit-save" onclick="saveSettingItem('${def.key}',${idx})">저장</button>
        <button class="set-edit-cancel" onclick="cancelEditSettingItem('${def.key}',${idx})">취소</button>
      </div>
    </div>`
  }).join('') || '<div class="set-empty">항목 없음</div>'

  const acAddAttr = isPair
    ? `oninput="_acPairVal(this,'${def.key}')" onblur="_acBlur(this)"`
    : `oninput="_acSimple(this,'${def.key}')" onblur="_acBlur(this)"`

  const addForm = isPair
    ? `<div class="set-add-row">
        <div class="set-ac-wrap" style="flex:1;position:relative">
          <input type="text" id="setAdd_${def.key}_val" placeholder="${def.ph1}" class="set-add-input" ${acAddAttr} />
        </div>
        <input type="text" id="setAdd_${def.key}_label" placeholder="${def.ph2}" class="set-add-input" />
        <button class="btn btn-new set-add-btn" onclick="addSettingItem('${def.key}')">+ 추가</button>
      </div>`
    : `<div class="set-add-row">
        <div class="set-ac-wrap" style="flex:1;position:relative">
          <input type="text" id="setAdd_${def.key}_val" placeholder="${def.ph}" class="set-add-input" style="width:100%" ${acAddAttr} />
        </div>
        <button class="btn btn-new set-add-btn" onclick="addSettingItem('${def.key}')">+ 추가</button>
      </div>`

  return `<div class="set-card">
    <div class="set-card-header">
      <span class="set-card-title">${def.title}</span>
      <span class="set-card-count">${items.length}</span>
    </div>
    <div class="set-list set-list-scroll">${listHtml}</div>
    ${addForm}
  </div>`
}

function renderSettings() {
  const container = document.getElementById('settingsPage')
  if (!container) return

  const designCards = SETTING_DEFS.filter(d => d.group === 'design').map(_renderSetCard).join('')

  // 디자인번호/백스타일 카드
  const dcListHtml = _designCodes.map((dc, idx) => {
    const [code, en, kr] = dc
    return `<div class="set-item" id="setDcItem_${idx}">
      <div class="set-item-view">
        <span class="set-item-code">${code}</span>
        <span class="set-item-label">${en}</span>
        <span class="set-item-label set-item-sub">${kr}</span>
        <button class="set-item-action set-item-edit" onclick="editDesignCodeSetting(${idx})" title="수정">&#9998;</button>
        <button class="set-item-action set-item-del" onclick="removeDesignCodeSetting(${idx})" title="삭제">&#10005;</button>
      </div>
      <div class="set-item-editrow" style="display:none">
        <div class="set-ac-wrap" style="width:70px;flex:none;position:relative">
          <input type="text" class="set-edit-input" value="${code}" data-field="code" maxlength="4" oninput="_acDesignCode(this,'code')" onblur="_acBlur(this)" style="width:100%" />
        </div>
        <input type="text" class="set-edit-input" value="${en}" data-field="en" style="flex:1" />
        <input type="text" class="set-edit-input" value="${kr}" data-field="kr" style="flex:1" />
        <button class="set-edit-save" onclick="saveDesignCodeEdit(${idx})">저장</button>
        <button class="set-edit-cancel" onclick="cancelDesignCodeEdit(${idx})">취소</button>
      </div>
    </div>`
  }).join('') || '<div class="set-empty">항목 없음</div>'

  const dcCard = `<div class="set-card set-card-wide">
    <div class="set-card-header">
      <span class="set-card-title">디자인번호 / 백스타일</span>
      <span class="set-card-count">${_designCodes.length}</span>
      <span style="flex:1"></span>
      <button class="set-excel-btn" onclick="downloadDesignCodes()" title="엑셀 다운로드">&#11015; 다운로드</button>
      <label class="set-excel-btn set-excel-upload" title="엑셀 업로드">&#11014; 업로드
        <input type="file" accept=".xlsx,.xls,.csv" onchange="uploadDesignCodes(this)" hidden />
      </label>
    </div>
    <div class="set-search-row">
      <input type="text" id="setDcSearch" placeholder="코드, 영문, 한글 검색..." class="set-search-input" oninput="filterDesignCodeList()" />
    </div>
    <div class="set-list set-list-scroll" id="setDcList">${dcListHtml}</div>
    <div class="set-add-row">
      <div class="set-ac-wrap" style="width:90px;flex:none;position:relative">
        <input type="text" id="setBsCode" placeholder="코드 (4자리)" class="set-add-input" maxlength="4" style="width:100%" oninput="_acDesignCode(this,'code')" onblur="_acBlur(this)" />
      </div>
      <div class="set-ac-wrap" style="flex:1;position:relative">
        <input type="text" id="setBsEn" placeholder="영문명" class="set-add-input" style="width:100%" oninput="_acDesignCode(this,'en')" onblur="_acBlur(this)" />
      </div>
      <div class="set-ac-wrap" style="flex:1;position:relative">
        <input type="text" id="setBsKr" placeholder="한글명" class="set-add-input" style="width:100%" oninput="_acDesignCode(this,'kr')" onblur="_acBlur(this)" />
      </div>
      <button class="btn btn-new set-add-btn" onclick="addDesignCodeSetting()">+ 추가</button>
    </div>
  </div>`

  const infoCards = SETTING_DEFS.filter(d => d.group === 'info').map(_renderSetCard).join('')

  // 판매 채널 카드
  const platListHtml = _platforms.map((pl, idx) => `
    <div class="set-item" id="platItem_${idx}">
      <div class="set-item-view">
        <span class="set-item-label" style="font-weight:600">${pl}</span>
        <button class="set-item-action set-item-edit" onclick="editPlatformSetting(${idx})" title="수정">&#9998;</button>
        <button class="set-item-action set-item-del" onclick="removePlatformSetting(${idx})" title="삭제">&#10005;</button>
      </div>
      <div class="set-item-editrow" id="platEdit_${idx}" style="display:none">
        <div class="set-ac-wrap" style="flex:1;position:relative">
          <input type="text" class="set-edit-input" id="platEditInput_${idx}" value="${pl}" style="width:100%"
            oninput="_acPlatform(this)" onblur="_acBlur(this)"
            onkeydown="if(event.key==='Enter')savePlatformEdit(${idx})" />
        </div>
        <button class="set-edit-save" onclick="savePlatformEdit(${idx})">저장</button>
        <button class="set-edit-cancel" onclick="renderSettings()">취소</button>
      </div>
    </div>`).join('') || '<div class="set-empty">항목 없음</div>'

  const platCard = `<div class="set-card set-card-wide">
    <div class="set-card-header">
      <span class="set-card-title">온라인 쇼핑몰 (판매 채널)</span>
      <span class="set-card-count">${_platforms.length}</span>
    </div>
    <div class="set-list set-list-scroll">${platListHtml}</div>
    <div class="set-add-row">
      <div class="set-ac-wrap" style="flex:1;position:relative">
        <input type="text" id="setPlatName" placeholder="쇼핑몰명 (예: 무신사)" class="set-add-input" style="width:100%"
          oninput="_acPlatform(this)" onblur="_acBlur(this)"
          onkeydown="if(event.key==='Enter')addPlatformSetting()" />
      </div>
      <button class="btn btn-new set-add-btn" onclick="addPlatformSetting()">+ 추가</button>
    </div>
  </div>`

  container.innerHTML = `
    <div class="settings-header">
      <h2 class="settings-title">기본 옵션 관리</h2>
      <p class="settings-desc">옵션을 추가·수정·삭제하면 전체 시스템 선택 목록에 즉시 반영됩니다.</p>
    </div>

    <div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>디자인 관련</span><span class="set-section-arrow">▼</span>
      </button>
      <div class="set-section-body">
        <div class="set-grid">
          ${designCards}
          ${dcCard}
        </div>
      </div>
    </div>

    <div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>일반 상품 정보</span><span class="set-section-arrow">▼</span>
      </button>
      <div class="set-section-body">
        <div class="set-grid">
          ${infoCards}
        </div>
      </div>
    </div>

    <div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>판매 채널</span><span class="set-section-arrow">▼</span>
      </button>
      <div class="set-section-body">
        <div class="set-grid">
          ${platCard}
        </div>
      </div>
    </div>`
}

function toggleSetSection(btn) {
  const body = btn.nextElementSibling
  const arrow = btn.querySelector('.set-section-arrow')
  const isOpen = body.style.display !== 'none'
  body.style.display = isOpen ? 'none' : ''
  arrow.textContent = isOpen ? '▶' : '▼'
}

// ===== 디자인번호 검색 필터 =====
function filterDesignCodeList() {
  const q = (document.getElementById('setDcSearch')?.value || '').toLowerCase().trim()
  const items = document.querySelectorAll('#setDcList > .set-item')
  items.forEach((el, idx) => {
    if (!q) { el.style.display = ''; return }
    const dc = _designCodes[idx]
    if (!dc) { el.style.display = 'none'; return }
    const match = dc[0].toLowerCase().includes(q) || dc[1].toLowerCase().includes(q) || dc[2].toLowerCase().includes(q)
    el.style.display = match ? '' : 'none'
  })
}

// ===== 디자인번호 CRUD =====
function addDesignCodeSetting() {
  const codeEl = document.getElementById('setBsCode')
  const enEl   = document.getElementById('setBsEn')
  const krEl   = document.getElementById('setBsKr')
  const code = codeEl?.value.trim()
  const en   = enEl?.value.trim()
  const kr   = krEl?.value.trim()
  if (!code || !en || !kr) { showToast('코드, 영문명, 한글명을 모두 입력해주세요.', 'warning'); return }
  if (_designCodes.some(([c]) => c === code)) { showToast(`코드 "${code}"은 이미 존재합니다.`, 'error'); return }
  _designCodes.push([code, en, kr])
  saveDesignCodes()
  renderSettings()
  showToast('디자인번호 추가됐습니다.', 'success')
}

function editDesignCodeSetting(idx) {
  const el = document.getElementById('setDcItem_' + idx)
  if (!el) return
  el.querySelector('.set-item-view').style.display = 'none'
  el.querySelector('.set-item-editrow').style.display = ''
  el.querySelector('.set-edit-input')?.focus()
}

function cancelDesignCodeEdit(idx) {
  const el = document.getElementById('setDcItem_' + idx)
  if (!el) return
  el.querySelector('.set-item-view').style.display = ''
  el.querySelector('.set-item-editrow').style.display = 'none'
}

function saveDesignCodeEdit(idx) {
  const el = document.getElementById('setDcItem_' + idx)
  if (!el) return
  const code = el.querySelector('[data-field="code"]')?.value.trim()
  const en   = el.querySelector('[data-field="en"]')?.value.trim()
  const kr   = el.querySelector('[data-field="kr"]')?.value.trim()
  if (!code || !en || !kr) { showToast('코드, 영문명, 한글명을 모두 입력해주세요.', 'warning'); return }
  if (code !== _designCodes[idx][0] && _designCodes.some(([c]) => c === code)) {
    showToast(`코드 "${code}"은 이미 존재합니다.`, 'error'); return
  }
  _designCodes[idx] = [code, en, kr]
  saveDesignCodes()
  renderSettings()
  showToast('수정됐습니다.', 'success')
}

async function removeDesignCodeSetting(idx) {
  const dc = _designCodes[idx]
  if (!dc) return
  if (!await korConfirm(`"${dc[0]} — ${dc[1]} (${dc[2]})" 삭제하시겠습니까?`)) return
  _designCodes.splice(idx, 1)
  saveDesignCodes()
  renderSettings()
  showToast('삭제됐습니다.', 'success')
}

// ===== 일반 설정 항목 CRUD =====
function addSettingItem(key) {
  const def = SETTING_DEFS.find(d => d.key === key)
  if (!def) return

  if (def.type === 'pair') {
    const valEl   = document.getElementById(`setAdd_${key}_val`)
    const labelEl = document.getElementById(`setAdd_${key}_label`)
    const val   = valEl?.value.trim()
    const label = labelEl?.value.trim()
    if (!val || !label) { showToast('코드와 표시명을 모두 입력해주세요.', 'warning'); return }
    if (_settings[key].some(item => item[0] === val)) { showToast(`"${val}"은 이미 존재하는 코드입니다.`, 'error'); return }
    _settings[key].push([val, label])
  } else {
    const valEl = document.getElementById(`setAdd_${key}_val`)
    const val = valEl?.value.trim()
    if (!val) { showToast('값을 입력해주세요.', 'warning'); return }
    if (_settings[key].includes(val)) { showToast(`"${val}"은 이미 존재하는 항목입니다.`, 'error'); return }
    _settings[key].push(val)
  }

  saveSettings()
  populateAllSelects()
  renderSettings()
  showToast('추가됐습니다.', 'success')
}

function editSettingItem(key, idx) {
  const el = document.getElementById(`setItem_${key}_${idx}`)
  if (!el) return
  el.querySelector('.set-item-view').style.display = 'none'
  el.querySelector('.set-item-editrow').style.display = ''
  el.querySelector('.set-edit-input')?.focus()
}

function cancelEditSettingItem(key, idx) {
  const el = document.getElementById(`setItem_${key}_${idx}`)
  if (!el) return
  el.querySelector('.set-item-view').style.display = ''
  el.querySelector('.set-item-editrow').style.display = 'none'
}

function saveSettingItem(key, idx) {
  const def = SETTING_DEFS.find(d => d.key === key)
  if (!def) return
  const el = document.getElementById(`setItem_${key}_${idx}`)
  if (!el) return

  if (def.type === 'pair') {
    const val   = el.querySelector('[data-field="val"]')?.value.trim()
    const label = el.querySelector('[data-field="label"]')?.value.trim()
    if (!val || !label) { showToast('코드와 표시명을 모두 입력해주세요.', 'warning'); return }
    const old = _settings[key][idx]
    if (val !== old[0] && _settings[key].some(item => item[0] === val)) { showToast(`"${val}"은 이미 존재하는 코드입니다.`, 'error'); return }
    _settings[key][idx] = [val, label]
  } else {
    const val = el.querySelector('[data-field="val"]')?.value.trim()
    if (!val) { showToast('값을 입력해주세요.', 'warning'); return }
    const old = _settings[key][idx]
    if (val !== old && _settings[key].includes(val)) { showToast(`"${val}"은 이미 존재하는 항목입니다.`, 'error'); return }
    _settings[key][idx] = val
  }

  saveSettings()
  populateAllSelects()
  renderSettings()
  showToast('수정됐습니다.', 'success')
}

async function removeSettingItem(key, idx) {
  const items = _settings[key]
  if (!items) return
  const item = items[idx]
  const label = Array.isArray(item) ? item[1] : item
  if (!await korConfirm(`"${label}" 항목을 삭제하시겠습니까?\n기존 상품에 저장된 값은 유지됩니다.`)) return
  _settings[key].splice(idx, 1)
  saveSettings()
  populateAllSelects()
  renderSettings()
  showToast('삭제됐습니다.', 'success')
}

// ===== 판매 채널 CRUD =====
function addPlatformSetting() {
  const name = document.getElementById('setPlatName')?.value.trim()
  if (!name) { showToast('쇼핑몰명을 입력해주세요.', 'warning'); return }
  if (_platforms.includes(name)) { showToast(`"${name}"은 이미 존재하는 쇼핑몰입니다.`, 'error'); return }
  _platforms.push(name)
  savePlatforms()
  renderSettings()
  showToast(`"${name}" 추가됐습니다.`, 'success')
}

function editPlatformSetting(idx) {
  const el = document.getElementById('platItem_' + idx)
  if (!el) return
  el.querySelector('.set-item-view').style.display = 'none'
  el.querySelector('.set-item-editrow').style.display = ''
  document.getElementById('platEditInput_' + idx)?.focus()
}

function savePlatformEdit(idx) {
  const newName = document.getElementById('platEditInput_' + idx)?.value.trim()
  const oldName = _platforms[idx]
  if (!newName) { showToast('쇼핑몰명을 입력해주세요.', 'warning'); return }
  if (newName === oldName) { renderSettings(); return }
  if (_platforms.includes(newName)) { showToast(`"${newName}"은 이미 존재하는 쇼핑몰입니다.`, 'error'); return }
  State.allProducts.forEach(p => {
    if (p.sales && oldName in p.sales) {
      p.sales[newName] = p.sales[oldName]
      delete p.sales[oldName]
    }
  })
  _platforms[idx] = newName
  savePlatforms()
  renderSalesTable()
  renderDashboard()
  renderSettings()
  showToast(`"${oldName}" → "${newName}" 변경됐습니다.`, 'success')
}

async function removePlatformSetting(idx) {
  const name = _platforms[idx]
  if (!await korConfirm(`"${name}" 쇼핑몰을 목록에서 제거하시겠습니까?\n기존 판매 데이터는 유지됩니다.`)) return
  _platforms.splice(idx, 1)
  savePlatforms()
  renderSalesTable()
  renderDashboard()
  renderSettings()
  showToast('삭제됐습니다.', 'success')
}

// ===== 디자인번호 엑셀 다운로드 =====
function downloadDesignCodes() {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  const headers = ['코드', '영문명', '한글명']
  const rows = _designCodes.map(([c, e, k]) => [c, e, k])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 30 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '디자인번호')
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  XLSX.writeFile(wb, `르망고_디자인번호_${today}.xlsx`)
  showToast(`디자인번호 ${_designCodes.length}건 다운로드 완료`, 'success')
}

// ===== 디자인번호 엑셀 업로드 =====
function uploadDesignCodes(input) {
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }

  const reader = new FileReader()
  reader.onload = async e => {
    try {
      const wb  = XLSX.read(e.target.result, { type: 'array' })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // 첫 행이 헤더인지 판단 (코드/영문/한글 or 첫 셀이 4자리 이하면 데이터)
      let startIdx = 0
      if (raw.length > 0) {
        const first = String(raw[0][0] || '').trim().toLowerCase()
        if (['코드', 'code', '번호', '디자인'].some(h => first.includes(h))) startIdx = 1
      }

      const dataRows = raw.slice(startIdx).filter(r => r[0] && String(r[0]).trim())
      if (!dataRows.length) { showToast('데이터가 없습니다.', 'error'); return }

      // 파싱: [코드, 영문, 한글]
      const parsed = []
      const errors = []
      dataRows.forEach((row, i) => {
        const code = String(row[0]).trim()
        const en   = String(row[1] || '').trim()
        const kr   = String(row[2] || '').trim()
        if (!code) return
        if (!en && !kr) { errors.push(`${i + startIdx + 1}행: 영문/한글명 누락 (${code})`); return }
        parsed.push([code, en || code, kr || en || code])
      })

      if (!parsed.length) {
        showToast('유효한 데이터가 없습니다.' + (errors.length ? '\n' + errors[0] : ''), 'error')
        return
      }

      // 중복 검사 + 병합 모드 선택
      const existingCodes = new Set(_designCodes.map(([c]) => c))
      const newItems   = parsed.filter(([c]) => !existingCodes.has(c))
      const dupItems   = parsed.filter(([c]) => existingCodes.has(c))

      let msg = `총 ${parsed.length}건 읽음`
      if (newItems.length) msg += ` / 신규 ${newItems.length}건`
      if (dupItems.length) msg += ` / 기존 중복 ${dupItems.length}건`
      if (errors.length)   msg += ` / 오류 ${errors.length}건`

      // 덮어쓰기 or 추가만 선택
      const mode = dupItems.length
        ? (await korConfirm(`${msg}\n\n전체 교체: 기존 목록을 업로드 내용으로 교체\n신규만 추가: 중복 ${dupItems.length}건 건너뛰기`, '전체 교체', '신규만 추가'))
          ? 'replace' : 'append'
        : 'append'

      if (mode === 'replace') {
        // 전체 교체: 업로드 데이터에서 코드 중복 제거 (마지막 우선)
        const map = new Map()
        parsed.forEach(([c, e, k]) => map.set(c, [c, e, k]))
        _designCodes.length = 0
        _designCodes.push(...map.values())
      } else {
        // 신규만 추가
        newItems.forEach(item => _designCodes.push(item))
      }

      saveDesignCodes()
      renderSettings()
      const resultMsg = mode === 'replace'
        ? `전체 교체 완료: ${_designCodes.length}건`
        : `신규 ${newItems.length}건 추가 완료 (총 ${_designCodes.length}건)`
      showToast(resultMsg, 'success')
    } catch (err) {
      showToast('파일 읽기 오류: ' + err.message, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
}
