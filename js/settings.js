// =============================================
// ===== 설정 탭 =====
// =============================================

// 일반 설정 카드 (simple/pair)
function _renderSetCard(def) {
  const items = _settings[def.key] || []
  const isPair = def.type === 'pair'

  const listHtml = items.map((item, idx) => {
    const [val, label] = Array.isArray(item) ? item : [item, item]
    // 보기 모드
    const viewInner = isPair
      ? `<span class="set-item-code">${val}</span><span class="set-item-label">${label}</span>`
      : `<span class="set-item-label">${val}</span>`
    // 수정 모드
    const editInner = isPair
      ? `<input type="text" class="set-edit-input" value="${val}" data-field="val" style="width:80px;flex:none" />
         <input type="text" class="set-edit-input" value="${label}" data-field="label" style="flex:1" />`
      : `<input type="text" class="set-edit-input" value="${val}" data-field="val" style="flex:1" />`

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

  const addForm = isPair
    ? `<div class="set-add-row">
        <input type="text" id="setAdd_${def.key}_val"   placeholder="${def.ph1}" class="set-add-input" />
        <input type="text" id="setAdd_${def.key}_label" placeholder="${def.ph2}" class="set-add-input" />
        <button class="btn btn-new set-add-btn" onclick="addSettingItem('${def.key}')">+ 추가</button>
      </div>`
    : `<div class="set-add-row">
        <input type="text" id="setAdd_${def.key}_val" placeholder="${def.ph}" class="set-add-input" style="flex:1" />
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

  // 디자인 관련 카드들
  const designCards = SETTING_DEFS.filter(d => d.group === 'design').map(_renderSetCard).join('')

  // 디자인번호/백스타일 카드 (_designCodes 단일 소스)
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
        <input type="text" class="set-edit-input" value="${code}" data-field="code" maxlength="4" style="width:70px;flex:none" />
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
    </div>
    <div class="set-search-row">
      <input type="text" id="setDcSearch" placeholder="코드, 영문, 한글 검색..." class="set-search-input" oninput="filterDesignCodeList()" />
    </div>
    <div class="set-list set-list-scroll" id="setDcList">${dcListHtml}</div>
    <div class="set-add-row">
      <input type="text" id="setBsCode" placeholder="코드 (4자리)" class="set-add-input" maxlength="4" style="width:90px;flex:none" />
      <input type="text" id="setBsEn"   placeholder="영문명" class="set-add-input" />
      <input type="text" id="setBsKr"   placeholder="한글명" class="set-add-input" />
      <button class="btn btn-new set-add-btn" onclick="addDesignCodeSetting()">+ 추가</button>
    </div>
  </div>`

  // 일반 상품 정보 카드들
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
        <input type="text" class="set-edit-input" id="platEditInput_${idx}" value="${pl}" style="flex:1" onkeydown="if(event.key==='Enter')savePlatformEdit(${idx})" />
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
      <input type="text" id="setPlatName" placeholder="쇼핑몰명 (예: 무신사)" class="set-add-input" style="flex:1" onkeydown="if(event.key==='Enter')addPlatformSetting()" />
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
  const code = document.getElementById('setBsCode')?.value.trim()
  const en   = document.getElementById('setBsEn')?.value.trim()
  const kr   = document.getElementById('setBsKr')?.value.trim()
  if (!code || !en || !kr) { showToast('코드, 영문명, 한글명을 모두 입력해주세요.', 'warning'); return }
  if (_designCodes.some(([c]) => c === code)) { showToast('이미 존재하는 코드입니다.', 'error'); return }
  _designCodes.push([code, en, kr])
  saveDesignCodes()
  document.getElementById('setBsCode').value = ''
  document.getElementById('setBsEn').value   = ''
  document.getElementById('setBsKr').value   = ''
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
  // 코드 변경 시 중복 체크 (자기 자신 제외)
  if (code !== _designCodes[idx][0] && _designCodes.some(([c]) => c === code)) {
    showToast('이미 존재하는 코드입니다.', 'error'); return
  }
  _designCodes[idx] = [code, en, kr]
  saveDesignCodes()
  renderSettings()
  showToast('수정됐습니다.', 'success')
}

function removeDesignCodeSetting(idx) {
  const dc = _designCodes[idx]
  if (!dc) return
  if (!confirm(`"${dc[0]} - ${dc[1]} (${dc[2]})" 삭제하시겠습니까?`)) return
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
    if (_settings[key].some(item => item[0] === val)) { showToast('이미 존재하는 코드입니다.', 'error'); return }
    _settings[key].push([val, label])
    if (valEl) valEl.value = ''
    if (labelEl) labelEl.value = ''
  } else {
    const valEl = document.getElementById(`setAdd_${key}_val`)
    const val = valEl?.value.trim()
    if (!val) { showToast('값을 입력해주세요.', 'warning'); return }
    if (_settings[key].includes(val)) { showToast('이미 존재하는 항목입니다.', 'error'); return }
    _settings[key].push(val)
    if (valEl) valEl.value = ''
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
    if (val !== old[0] && _settings[key].some(item => item[0] === val)) { showToast('이미 존재하는 코드입니다.', 'error'); return }
    _settings[key][idx] = [val, label]
  } else {
    const val = el.querySelector('[data-field="val"]')?.value.trim()
    if (!val) { showToast('값을 입력해주세요.', 'warning'); return }
    const old = _settings[key][idx]
    if (val !== old && _settings[key].includes(val)) { showToast('이미 존재하는 항목입니다.', 'error'); return }
    _settings[key][idx] = val
  }

  saveSettings()
  populateAllSelects()
  renderSettings()
  showToast('수정됐습니다.', 'success')
}

function removeSettingItem(key, idx) {
  const items = _settings[key]
  if (!items) return
  const item = items[idx]
  const label = Array.isArray(item) ? item[1] : item
  if (!confirm(`"${label}" 항목을 삭제하시겠습니까?\n기존 상품에 저장된 값은 유지됩니다.`)) return
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
  if (_platforms.includes(name)) { showToast('이미 존재하는 쇼핑몰입니다.', 'error'); return }
  _platforms.push(name)
  savePlatforms()
  document.getElementById('setPlatName').value = ''
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
  if (_platforms.includes(newName)) { showToast('이미 존재하는 쇼핑몰입니다.', 'error'); return }
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

function removePlatformSetting(idx) {
  const name = _platforms[idx]
  if (!confirm(`"${name}" 쇼핑몰을 목록에서 제거하시겠습니까?\n기존 판매 데이터는 유지됩니다.`)) return
  _platforms.splice(idx, 1)
  savePlatforms()
  renderSalesTable()
  renderDashboard()
  renderSettings()
  showToast('삭제됐습니다.', 'success')
}
