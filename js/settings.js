// =============================================
// ===== 설정 탭 =====
// =============================================
function _renderSetCard(def) {
  const items = _settings[def.key] || []
  const listHtml = items.map((item, idx) => {
    const [val, label] = Array.isArray(item) ? item : [item, item]
    const inner = Array.isArray(item)
      ? `<span class="set-item-code">${val}</span><span class="set-item-label">${label}</span>`
      : `<span class="set-item-label">${val}</span>`
    return `<div class="set-item">${inner}
      <button class="set-item-del" onclick="removeSettingItem('${def.key}',${idx})" title="삭제">✕</button>
    </div>`
  }).join('') || '<div class="set-empty">항목 없음</div>'

  const addForm = def.type === 'pair'
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
    <div class="set-card-title">${def.title}</div>
    <div class="set-list">${listHtml}</div>
    ${addForm}
  </div>`
}

function renderSettings() {
  const container = document.getElementById('settingsPage')
  if (!container) return

  // 디자인 관련 카드들
  const designCards = SETTING_DEFS.filter(d => d.group === 'design').map(_renderSetCard).join('')

  // 백스타일 카드 (디자인번호 통합)
  const bsListHtml = _backStyles.map((bs, idx) => {
    const [code, en, kr] = bs
    return `<div class="set-item">
      <span class="set-item-code">${code}</span>
      <span class="set-item-label">${en}</span>
      <span class="set-item-label" style="color:var(--text-sub);font-size:12px">${kr}</span>
      <button class="set-item-del" onclick="removeBackStyleSetting(${idx})" title="삭제">✕</button>
    </div>`
  }).join('') || '<div class="set-empty">항목 없음</div>'
  const bsCard = `<div class="set-card set-card-wide">
    <div class="set-card-title">백스타일</div>
    <div class="set-list">${bsListHtml}</div>
    <div class="set-add-row">
      <input type="text" id="setBsCode" placeholder="코드 (4자리)" class="set-add-input" maxlength="4" style="width:100px;flex:none" />
      <input type="text" id="setBsEn"   placeholder="영문명" class="set-add-input" />
      <input type="text" id="setBsKr"   placeholder="한글명" class="set-add-input" />
      <button class="btn btn-new set-add-btn" onclick="addBackStyleSetting()">+ 추가</button>
    </div>
  </div>`

  // 일반 상품 정보 카드들
  const infoCards = SETTING_DEFS.filter(d => d.group === 'info').map(_renderSetCard).join('')

  // 판매 채널 카드
  const platListHtml = _platforms.map((pl, idx) => `
    <div class="set-item" id="platItem_${idx}">
      <span class="set-item-label" style="flex:1;font-weight:600">${pl}</span>
      <button onclick="editPlatformSetting(${idx})" style="padding:2px 10px;background:var(--accent);color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px">수정</button>
      <button class="set-item-del" onclick="removePlatformSetting(${idx})" title="삭제">✕</button>
    </div>
    <div class="set-item" id="platEdit_${idx}" style="display:none">
      <input type="text" id="platEditInput_${idx}" value="${pl}" class="set-add-input" style="flex:1" onkeydown="if(event.key==='Enter')savePlatformEdit(${idx})" />
      <button class="btn btn-new set-add-btn" onclick="savePlatformEdit(${idx})">저장</button>
      <button class="btn set-add-btn" style="background:var(--bg-card,#f0ede8)" onclick="renderSettings()">취소</button>
    </div>`).join('') || '<div class="set-empty">항목 없음</div>'
  const platCard = `<div class="set-card set-card-wide">
    <div class="set-card-title">온라인 쇼핑몰 (판매 채널)</div>
    <div class="set-list">${platListHtml}</div>
    <div class="set-add-row">
      <input type="text" id="setPlatName" placeholder="쇼핑몰명 (예: 무신사)" class="set-add-input" onkeydown="if(event.key==='Enter')addPlatformSetting()" />
      <button class="btn btn-new set-add-btn" onclick="addPlatformSetting()">+ 추가</button>
    </div>
  </div>`

  container.innerHTML = `
    <div class="settings-header">
      <h2 class="settings-title">기본 옵션 관리</h2>
      <p class="settings-desc">옵션을 추가·삭제하면 전체 시스템 선택 목록에 즉시 반영됩니다.</p>
    </div>

    <div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>🎨 디자인 관련</span><span class="set-section-arrow">▼</span>
      </button>
      <div class="set-section-body">
        <div class="set-grid">
          ${designCards}
          ${bsCard}
        </div>
      </div>
    </div>

    <div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>📋 일반 상품 정보</span><span class="set-section-arrow">▼</span>
      </button>
      <div class="set-section-body">
        <div class="set-grid">
          ${infoCards}
        </div>
      </div>
    </div>

    <div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>🛒 판매 채널</span><span class="set-section-arrow">▼</span>
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

function addDesignCodeSetting() {
  const code = document.getElementById('setDcCode')?.value.trim()
  const en   = document.getElementById('setDcEn')?.value.trim()
  const kr   = document.getElementById('setDcKr')?.value.trim()
  if (!code || !en || !kr) { showToast('코드, 영문명, 한글명을 모두 입력해주세요.', 'warning'); return }
  if (_designCodes.some(([c]) => c === code)) { showToast('이미 존재하는 코드입니다.', 'error'); return }
  _designCodes.push([code, en, kr])
  saveDesignCodes()
  document.getElementById('setDcCode').value = ''
  document.getElementById('setDcEn').value   = ''
  document.getElementById('setDcKr').value   = ''
  renderSettings()
  showToast('디자인 코드 추가됐습니다.', 'success')
}

function removeDesignCodeSetting(idx) {
  const dc = _designCodes[idx]
  if (!dc) return
  if (!confirm(`"${dc[1]} (${dc[2]})" 디자인 코드를 삭제하시겠습니까?`)) return
  _designCodes.splice(idx, 1)
  saveDesignCodes()
  renderSettings()
  showToast('삭제됐습니다.', 'success')
}

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

function addBackStyleSetting() {
  const code = document.getElementById('setBsCode')?.value.trim()
  const en   = document.getElementById('setBsEn')?.value.trim()
  const kr   = document.getElementById('setBsKr')?.value.trim()
  if (!code || !en || !kr) { showToast('코드, 영문명, 한글명을 모두 입력해주세요.', 'warning'); return }
  if (_backStyles.some(([c]) => c === code)) { showToast('이미 존재하는 코드입니다.', 'error'); return }
  _backStyles.push([code, en, kr])
  if (!_designCodes.some(([c]) => c === code)) _designCodes.push([code, en, kr])
  saveBackStyles()
  saveDesignCodes()
  document.getElementById('setBsCode').value = ''
  document.getElementById('setBsEn').value   = ''
  document.getElementById('setBsKr').value   = ''
  renderSettings()
  showToast('백스타일 추가됐습니다.', 'success')
}

function removeBackStyleSetting(idx) {
  const bs = _backStyles[idx]
  if (!bs) return
  if (!confirm(`"${bs[1]} (${bs[2]})" 백스타일을 삭제하시겠습니까?`)) return
  const code = bs[0]
  _backStyles.splice(idx, 1)
  const dcIdx = _designCodes.findIndex(([c]) => c === code)
  if (dcIdx !== -1) _designCodes.splice(dcIdx, 1)
  saveBackStyles()
  saveDesignCodes()
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
  document.getElementById('platItem_' + idx).style.display = 'none'
  document.getElementById('platEdit_' + idx).style.display = ''
  document.getElementById('platEditInput_' + idx)?.focus()
}

function savePlatformEdit(idx) {
  const newName = document.getElementById('platEditInput_' + idx)?.value.trim()
  const oldName = _platforms[idx]
  if (!newName) { showToast('쇼핑몰명을 입력해주세요.', 'warning'); return }
  if (newName === oldName) { renderSettings(); return }
  if (_platforms.includes(newName)) { showToast('이미 존재하는 쇼핑몰입니다.', 'error'); return }
  // 기존 판매 데이터 키 이전
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
