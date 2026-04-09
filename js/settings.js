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

  // 판매 채널 통합 카드 (이름 + 수수료율 + 비고)
  const curGradeCh = (State.currentUser && State.currentUser.grade) || 1
  const canEditCh = curGradeCh >= 3
  const chListHtml = _channels.map((c, idx) => {
    const rate = Number(c.feeRate) || 0
    const note = c.note || ''
    return `<div class="set-item" id="chItem_${idx}">
      <div class="set-item-view">
        <span class="set-item-label" style="font-weight:600">${esc(c.name)}</span>
        <span class="set-item-label set-item-sub" style="font-family:monospace;color:var(--accent);font-weight:600">${rate}%</span>
        <span class="set-item-label set-item-sub" style="flex:1;color:var(--text-light)">${esc(note)}</span>
        ${canEditCh ? `
          <button class="set-item-action set-item-edit" onclick="editChannel(${idx})" title="수정">&#9998;</button>
          <button class="set-item-action set-item-del" onclick="removeChannel(${idx})" title="삭제">&#10005;</button>
        ` : ''}
      </div>
      <div class="set-item-editrow" style="display:none">
        <input type="text" class="set-edit-input" value="${esc(c.name)}" data-field="name" placeholder="채널명" style="flex:1" />
        <input type="number" class="set-edit-input" value="${rate}" data-field="rate" placeholder="수수료%" min="0" max="100" step="0.1" style="width:90px" />
        <input type="text" class="set-edit-input" value="${esc(note)}" data-field="note" placeholder="비고" style="flex:1" />
        <button class="set-edit-save" onclick="saveChannelEdit(${idx})">저장</button>
        <button class="set-edit-cancel" onclick="cancelChannelEdit(${idx})">취소</button>
      </div>
    </div>`
  }).join('') || '<div class="set-empty">항목 없음</div>'

  const platCard = `<div class="set-card set-card-wide">
    <div class="set-card-header">
      <span class="set-card-title">온라인 쇼핑몰 (판매 채널)</span>
      <span class="set-card-count">${_channels.length}</span>
    </div>
    <div class="set-list set-list-scroll">${chListHtml}</div>
    ${canEditCh ? `<div class="set-add-row">
      <input type="text" id="setAddChName" placeholder="채널명 (예: 무신사)" class="set-add-input" style="flex:1" />
      <input type="number" id="setAddChRate" placeholder="수수료%" class="set-add-input" min="0" max="100" step="0.1" style="width:90px" />
      <input type="text" id="setAddChNote" placeholder="비고" class="set-add-input" style="flex:1" />
      <button class="btn btn-new set-add-btn" onclick="addChannel()">+ 채널 추가</button>
    </div>` : ''}
  </div>`

  // 업무일정 카테고리 카드
  const wkCatListHtml = _workCategories.map((cat, idx) => {
    const color = getWorkCatColor(cat)
    return `<div class="set-item" id="wkCatItem_${idx}">
      <div class="set-item-view">
        <span class="wk-cat-badge" style="background:${color.bg};color:${color.text}">${cat}</span>
        <span style="flex:1"></span>
        <button class="set-item-action set-item-edit" onclick="editWorkCategorySetting(${idx})" title="수정">&#9998;</button>
        <button class="set-item-action set-item-del" onclick="removeWorkCategorySetting(${idx})" title="삭제">&#10005;</button>
      </div>
      <div class="set-item-editrow" style="display:none">
        <input type="text" class="set-edit-input" value="${cat}" data-field="val" style="flex:1" />
        <button class="set-edit-save" onclick="saveWorkCategoryEdit(${idx})">저장</button>
        <button class="set-edit-cancel" onclick="renderSettings()">취소</button>
      </div>
    </div>`
  }).join('') || '<div class="set-empty">항목 없음</div>'

  const wkCatCard = `<div class="set-card set-card-wide">
    <div class="set-card-header">
      <span class="set-card-title">업무일정 카테고리</span>
      <span class="set-card-count">${_workCategories.length}</span>
    </div>
    <div class="set-list set-list-scroll">${wkCatListHtml}</div>
    <div class="set-add-row">
      <input type="text" id="setWkCatName" placeholder="카테고리명 (예: 출장)" class="set-add-input" style="flex:1"
        onkeydown="if(event.key==='Enter')addWorkCategorySetting()" />
      <button class="btn btn-new set-add-btn" onclick="addWorkCategorySetting()">+ 추가</button>
    </div>
  </div>`

  // 기획 일정 단계 카드 (판매 채널과 동일한 인라인 에디트 패턴)
  const phases = getPlanPhases()
  const curGradePh = (State.currentUser && State.currentUser.grade) || 1
  const canEditPhases = curGradePh >= 3
  const phListHtml = phases.map((ph, idx) => {
    const color = ph.color || '#888'
    const isDef = !!ph.isDefault
    return `<div class="set-item" id="phItem_${idx}">
      <div class="set-item-view">
        <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${color};flex:none;box-shadow:0 0 0 1px rgba(0,0,0,0.1)"></span>
        <span class="set-item-label" style="font-weight:600">${esc(ph.label)}</span>
        <span class="set-item-label set-item-sub" style="font-family:monospace;color:var(--text-light);background:#f5f4f1;padding:2px 6px;border-radius:3px">${esc(ph.key)}</span>
        <span style="flex:1"></span>
        ${canEditPhases ? `
          <button class="set-item-action set-item-edit" onclick="editPlanPhase(${idx})" title="수정">&#9998;</button>
          ${isDef ? '' : `<button class="set-item-action set-item-del" onclick="deletePlanPhase(${idx})" title="삭제">&#10005;</button>`}
        ` : ''}
      </div>
      <div class="set-item-editrow" style="display:none">
        <input type="text" class="set-edit-input" value="${esc(ph.label)}" data-field="label" placeholder="단계명" style="flex:1" />
        <input type="color" class="set-edit-input" value="${color}" data-field="color" style="width:50px;padding:2px" />
        <button class="set-edit-save" onclick="savePlanPhaseEdit(${idx})">저장</button>
        <button class="set-edit-cancel" onclick="cancelPlanPhaseEdit(${idx})">취소</button>
      </div>
    </div>`
  }).join('') || '<div class="set-empty">항목 없음</div>'

  const phCard = `<div class="set-card set-card-wide">
    <div class="set-card-header">
      <span class="set-card-title">📅 기획 일정 단계</span>
      <span class="set-card-count">${phases.length}</span>
    </div>
    <div class="set-list set-list-scroll">${phListHtml}</div>
    ${canEditPhases ? `<div class="set-add-row">
      <input type="text" id="setAddPhLabel" placeholder="단계명 (예: 검수)" class="set-add-input" style="flex:1"
        onkeydown="if(event.key==='Enter')addPlanPhase()" />
      <input type="color" id="setAddPhColor" value="#c9a96e" class="set-add-input" style="width:50px;padding:2px" />
      <button class="btn btn-new set-add-btn" onclick="addPlanPhase()">+ 단계 추가</button>
    </div>` : ''}
  </div>`

  // 부서 카드 (시스템 관리자 grade 4만 표시)
  const isTopAdmin = State.currentUser && State.currentUser.grade === 4
  let deptSection = ''
  if (isTopAdmin) {
    const deptListHtml = _depts.map((d, idx) => `
      <div class="set-item" id="deptItem_${idx}">
        <div class="set-item-view">
          <span class="set-item-label" style="font-weight:600">${d}</span>
          <button class="set-item-action set-item-edit" onclick="editDeptSetting(${idx})" title="수정">&#9998;</button>
          <button class="set-item-action set-item-del" onclick="removeDeptSetting(${idx})" title="삭제">&#10005;</button>
        </div>
        <div class="set-item-editrow" style="display:none">
          <input type="text" class="set-edit-input" value="${d}" data-field="val" style="flex:1" />
          <button class="set-edit-save" onclick="saveDeptEdit(${idx})">저장</button>
          <button class="set-edit-cancel" onclick="renderSettings()">취소</button>
        </div>
      </div>`).join('') || '<div class="set-empty">항목 없음</div>'

    const deptCard = `<div class="set-card set-card-wide">
      <div class="set-card-header">
        <span class="set-card-title">부서 목록</span>
        <span class="set-card-count">${_depts.length}</span>
      </div>
      <div class="set-list set-list-scroll">${deptListHtml}</div>
      <div class="set-add-row">
        <input type="text" id="setDeptName" placeholder="부서명 (예: 해외사업)" class="set-add-input" style="flex:1"
          onkeydown="if(event.key==='Enter')addDeptSetting()" />
        <button class="btn btn-new set-add-btn" onclick="addDeptSetting()">+ 추가</button>
      </div>
    </div>`

    deptSection = `<div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>회원 관리</span><span class="set-section-arrow">▼</span>
      </button>
      <div class="set-section-body">
        <div class="set-grid">${deptCard}</div>
      </div>
    </div>`
  }

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
    </div>

    <div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>업무일정</span><span class="set-section-arrow">▼</span>
      </button>
      <div class="set-section-body">
        <div class="set-grid">
          ${wkCatCard}
        </div>
      </div>
    </div>

    <div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>기획 일정 단계</span><span class="set-section-arrow">▼</span>
      </button>
      <div class="set-section-body">
        <div class="set-grid">
          ${phCard}
        </div>
      </div>
    </div>

    ${deptSection}

    <div class="set-section">
      <button class="set-section-btn" onclick="toggleSetSection(this)">
        <span>🔔 알림 설정</span><span class="set-section-arrow">▼</span>
      </button>
      <div class="set-section-body">
        <div class="set-grid">
          ${renderNotifSettingsCard()}
        </div>
      </div>
    </div>`
}

const NOTIF_TYPE_LABELS = {
  event_upcoming: { label: '행사 임박 (D-3)', desc: '행사 시작 3일 전 알림' },
  event_end: { label: '행사 종료', desc: '행사 종료일 알림' },
  plan_deadline: { label: '기획 마감 (D-3)', desc: '기획 마감 3일 전 알림' },
  member_pending: { label: '회원 승인 대기', desc: '신규 가입 승인 요청' },
  member_pending_urgent: { label: '회원 승인 긴급', desc: '신규 가입 최우선 알림' },
  board_notice: { label: '게시판 공지', desc: '새 공지사항 등록' },
  comment_mention: { label: '@멘션 댓글', desc: '댓글에서 나를 언급' },
  watch_change: { label: '워치 변경', desc: '관심 상품/기획 변경' },
  work_mention: { label: '업무 참조', desc: '업무일정에서 나를 참조' },
  work_start: { label: '업무 시작일', desc: '참조된 업무 시작일 알림' },
  work_upcoming: { label: '업무 내일 시작', desc: '참조된 업무 내일 시작' },
  deadline_urgent: { label: '마감 긴급 (D-1)', desc: '마감일 하루 전' },
  deadline_today: { label: '마감 오늘', desc: '오늘 마감인 항목' },
  deadline_overdue: { label: '마감 초과', desc: '마감일 지난 항목' },
};

window.renderNotifSettingsCard = function() {
  const s = getNotifSettings();
  const globalOn = s.globalEnabled !== false;
  const items = Object.keys(NOTIF_TYPE_LABELS).map(k => {
    const meta = NOTIF_TYPE_LABELS[k];
    const enabled = s.types && s.types[k] !== false;
    return `<div class="notif-set-item">
      <div class="notif-set-item-info">
        <span class="notif-set-item-label">${meta.label}</span>
        <span class="notif-set-item-desc">${meta.desc}</span>
      </div>
      <label class="notif-switch notif-switch-sm">
        <input type="checkbox" data-notif-type="${k}" ${enabled ? 'checked' : ''} ${globalOn ? '' : 'disabled'} onchange="onNotifTypeChange('${k}', this.checked)">
        <span class="notif-slider"></span>
      </label>
    </div>`;
  }).join('');
  return `<div class="set-card set-card-wide">
    <div class="set-card-header">
      <span class="set-card-title">🔔 알림 환경설정</span>
      <span class="set-card-count">${Object.keys(NOTIF_TYPE_LABELS).length}</span>
    </div>
    <div class="notif-set-global">
      <span class="notif-set-global-label">전체 알림</span>
      <label class="notif-switch">
        <input type="checkbox" id="notifGlobalCheck" ${globalOn ? 'checked' : ''} onchange="onGlobalNotifChange(this.checked)">
        <span class="notif-slider"></span>
      </label>
    </div>
    <div class="notif-set-divider"></div>
    <div class="notif-set-list" id="notifTypeList">${items}</div>
  </div>`;
};

window.onGlobalNotifChange = function(enabled) {
  const s = getNotifSettings();
  s.globalEnabled = enabled;
  saveNotifSettings();
  if (typeof updateNotifToggleUI === 'function') updateNotifToggleUI();
  document.querySelectorAll('#notifTypeList input[type="checkbox"]').forEach(cb => { cb.disabled = !enabled; });
  if (typeof showToast === 'function') showToast(enabled ? '전체 알림 켜짐' : '전체 알림 꺼짐');
};
window.onNotifTypeChange = function(type, enabled) {
  const s = getNotifSettings();
  if (!s.types) s.types = {};
  s.types[type] = enabled;
  saveNotifSettings();
  if (typeof showToast === 'function') {
    const lbl = (NOTIF_TYPE_LABELS[type] && NOTIF_TYPE_LABELS[type].label) || type;
    showToast(lbl + (enabled ? ' 켜짐' : ' 꺼짐'));
  }
};

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
  logActivity('setting', '설정', `디자인번호 추가: ${code}`)
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
  logActivity('setting', '설정', `디자인번호 수정: ${code}`)
}

async function removeDesignCodeSetting(idx) {
  const dc = _designCodes[idx]
  if (!dc) return
  if (!await korConfirm(`"${dc[0]} — ${dc[1]} (${dc[2]})" 삭제하시겠습니까?`)) return
  _designCodes.splice(idx, 1)
  saveDesignCodes()
  renderSettings()
  showToast('삭제됐습니다.', 'success')
  logActivity('setting', '설정', `디자인번호 삭제: ${dc[0]}`)
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
  logActivity('setting', '설정', `설정항목 추가: ${key}`)
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
  logActivity('setting', '설정', `설정항목 수정: ${key}`)
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
  logActivity('setting', '설정', `설정항목 삭제: ${key} "${label}"`)
}

// ===== 판매 채널(통합) CRUD =====
function _checkChAdmin() {
  const g = (State.currentUser && State.currentUser.grade) || 1
  if (g < 3) { showToast('권한이 없습니다.', 'error'); return false }
  return true
}

function addChannel() {
  if (!_checkChAdmin()) return
  const nameEl = document.getElementById('setAddChName')
  const rateEl = document.getElementById('setAddChRate')
  const noteEl = document.getElementById('setAddChNote')
  const name = (nameEl?.value || '').trim()
  if (!name) { showToast('채널명을 입력해주세요.', 'warning'); nameEl?.focus(); return }
  if (_channels.some(c => c.name === name)) { showToast(`"${name}"은 이미 존재하는 채널입니다.`, 'error'); return }
  const rateStr = (rateEl?.value || '0').trim()
  const rate = Number(rateStr)
  if (isNaN(rate) || rate < 0 || rate > 100) { showToast('수수료율은 0~100 사이 숫자여야 합니다.', 'error'); return }
  const note = (noteEl?.value || '').trim()
  _channels.push({ name, feeRate: rate, note, active: true })
  // 기존 상품에 sales 키 초기화
  State.allProducts.forEach(p => {
    if (!p.sales) p.sales = {}
    if (!(name in p.sales)) p.sales[name] = 0
  })
  saveChannels()
  populateAllSelects()
  renderSettings()
  if (typeof renderSalesTable === 'function') renderSalesTable()
  if (typeof renderDashboard === 'function') renderDashboard()
  showToast(`"${name}" 추가됐습니다.`, 'success')
  if (typeof logActivity === 'function') logActivity('setting', '설정', `판매채널 추가: ${name} (수수료 ${rate}%)`)
}

function editChannel(idx) {
  if (!_checkChAdmin()) return
  const el = document.getElementById('chItem_' + idx)
  if (!el) return
  el.querySelector('.set-item-view').style.display = 'none'
  el.querySelector('.set-item-editrow').style.display = ''
  el.querySelector('[data-field="name"]')?.focus()
}

function cancelChannelEdit(idx) {
  const el = document.getElementById('chItem_' + idx)
  if (!el) return
  el.querySelector('.set-item-view').style.display = ''
  el.querySelector('.set-item-editrow').style.display = 'none'
}

function saveChannelEdit(idx) {
  if (!_checkChAdmin()) return
  const cur = _channels[idx]
  if (!cur) return
  const el = document.getElementById('chItem_' + idx)
  if (!el) return
  const oldName = cur.name
  const name = (el.querySelector('[data-field="name"]')?.value || '').trim()
  const rateStr = (el.querySelector('[data-field="rate"]')?.value || '').trim()
  const note = (el.querySelector('[data-field="note"]')?.value || '').trim()
  if (!name) { showToast('채널명을 입력해주세요.', 'warning'); return }
  if (_channels.some((c, i) => i !== idx && c.name === name)) { showToast(`"${name}"은 이미 존재하는 채널입니다.`, 'error'); return }
  const rate = Number(rateStr)
  if (isNaN(rate) || rate < 0 || rate > 100) { showToast('수수료율은 0~100 사이 숫자여야 합니다.', 'error'); return }
  // 이름 변경 시 sales 키 이전
  if (name !== oldName) {
    State.allProducts.forEach(p => {
      if (p.sales && oldName in p.sales) {
        p.sales[name] = p.sales[oldName]
        delete p.sales[oldName]
      }
    })
  }
  _channels[idx] = { ...cur, name, feeRate: rate, note }
  saveChannels()
  populateAllSelects()
  renderSettings()
  if (typeof renderSalesTable === 'function') renderSalesTable()
  if (typeof renderDashboard === 'function') renderDashboard()
  showToast(`"${oldName}" 수정됐습니다.`, 'success')
  if (typeof logActivity === 'function') logActivity('setting', '설정', `판매채널 수정: ${oldName} → ${name} (수수료 ${rate}%)`)
}

async function removeChannel(idx) {
  if (!_checkChAdmin()) return
  const cur = _channels[idx]
  if (!cur) return
  if (!await korConfirm(`"${cur.name}" 채널을 삭제하시겠습니까?\n기존 판매 데이터는 유지되지만 목록에서 제거됩니다.`)) return
  // 기존 상품 sales 키 삭제
  State.allProducts.forEach(p => {
    if (p.sales && cur.name in p.sales) delete p.sales[cur.name]
  })
  _channels.splice(idx, 1)
  saveChannels()
  populateAllSelects()
  renderSettings()
  if (typeof renderSalesTable === 'function') renderSalesTable()
  if (typeof renderDashboard === 'function') renderDashboard()
  showToast('삭제됐습니다.', 'success')
  if (typeof logActivity === 'function') logActivity('setting', '설정', `판매채널 삭제: ${cur.name}`)
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

// =============================================
// ===== 업무일정 카테고리 CRUD =====
// =============================================
function addWorkCategorySetting() {
  const name = document.getElementById('setWkCatName')?.value.trim()
  if (!name) { showToast('카테고리명을 입력해주세요.', 'warning'); return }
  if (_workCategories.includes(name)) { showToast(`"${name}"은 이미 존재합니다.`, 'error'); return }
  _workCategories.push(name)
  saveWorkCategories()
  populateAllSelects()
  renderSettings()
  showToast(`"${name}" 추가됐습니다.`, 'success')
  logActivity('setting', '설정', `업무카테고리 추가: ${name}`)
}

function editWorkCategorySetting(idx) {
  const el = document.getElementById('wkCatItem_' + idx)
  if (!el) return
  el.querySelector('.set-item-view').style.display = 'none'
  el.querySelector('.set-item-editrow').style.display = ''
  el.querySelector('.set-edit-input')?.focus()
}

function saveWorkCategoryEdit(idx) {
  const el = document.getElementById('wkCatItem_' + idx)
  if (!el) return
  const newName = el.querySelector('[data-field="val"]')?.value.trim()
  const oldName = _workCategories[idx]
  if (!newName) { showToast('카테고리명을 입력해주세요.', 'warning'); return }
  if (newName === oldName) { renderSettings(); return }
  if (_workCategories.includes(newName)) { showToast(`"${newName}"은 이미 존재합니다.`, 'error'); return }
  // 기존 업무일정 카테고리 이전
  State.workItems.forEach(w => {
    if (w.category === oldName) w.category = newName
  })
  _workItems = State.workItems
  saveWorkItems()
  _workCategories[idx] = newName
  saveWorkCategories()
  populateAllSelects()
  renderSettings()
  showToast(`"${oldName}" → "${newName}" 변경됐습니다.`, 'success')
  logActivity('setting', '설정', `업무카테고리 수정: ${oldName} → ${newName}`)
}

async function removeWorkCategorySetting(idx) {
  const name = _workCategories[idx]
  if (!await korConfirm(`"${name}" 카테고리를 삭제하시겠습니까?\n해당 카테고리의 기존 일정은 "기타"로 이전됩니다.`)) return
  // 기존 일정 → '기타'로 이전
  const fallback = _workCategories.includes('기타') ? '기타' : (_workCategories.find(c => c !== name) || '기타')
  State.workItems.forEach(w => {
    if (w.category === name) w.category = fallback
  })
  _workItems = State.workItems
  saveWorkItems()
  _workCategories.splice(idx, 1)
  // '기타'가 없으면 추가
  if (!_workCategories.includes('기타')) _workCategories.push('기타')
  saveWorkCategories()
  populateAllSelects()
  renderSettings()
  showToast('삭제됐습니다.', 'success')
  logActivity('setting', '설정', `업무카테고리 삭제: ${name}`)
}

// =============================================
// ===== 부서 CRUD (시스템 관리자 전용) =====
// =============================================
function addDeptSetting() {
  const name = document.getElementById('setDeptName')?.value.trim()
  if (!name) { showToast('부서명을 입력해주세요.', 'warning'); return }
  if (_depts.includes(name)) { showToast(`"${name}"은 이미 존재합니다.`, 'error'); return }
  _depts.push(name)
  saveDepts()
  populateAllSelects()
  renderSettings()
  showToast(`"${name}" 추가됐습니다.`, 'success')
  logActivity('setting', '설정', `부서 추가: ${name}`)
}

function editDeptSetting(idx) {
  const el = document.getElementById('deptItem_' + idx)
  if (!el) return
  el.querySelector('.set-item-view').style.display = 'none'
  el.querySelector('.set-item-editrow').style.display = ''
  el.querySelector('.set-edit-input')?.focus()
}

function saveDeptEdit(idx) {
  const el = document.getElementById('deptItem_' + idx)
  if (!el) return
  const newName = el.querySelector('[data-field="val"]')?.value.trim()
  const oldName = _depts[idx]
  if (!newName) { showToast('부서명을 입력해주세요.', 'warning'); return }
  if (newName === oldName) { renderSettings(); return }
  if (_depts.includes(newName)) { showToast(`"${newName}"은 이미 존재합니다.`, 'error'); return }
  _depts[idx] = newName
  saveDepts()
  populateAllSelects()
  renderSettings()
  showToast(`"${oldName}" → "${newName}" 변경됐습니다.`, 'success')
  logActivity('setting', '설정', `부서 수정: ${oldName} → ${newName}`)
}

async function removeDeptSetting(idx) {
  const name = _depts[idx]
  if (!await korConfirm(`"${name}" 부서를 삭제하시겠습니까?`)) return
  _depts.splice(idx, 1)
  saveDepts()
  populateAllSelects()
  renderSettings()
  showToast('삭제됐습니다.', 'success')
  logActivity('setting', '설정', `부서 삭제: ${name}`)
}

// ===== 기획 일정 단계 CRUD (인라인 에디트) =====
function _phAdminCheck() {
  const g = (State.currentUser && State.currentUser.grade) || 1
  if (g < 3) { showToast('관리자만 변경할 수 있습니다.', 'error'); return false }
  return true
}

function _phRerender() {
  if (typeof populateAllSelects === 'function') populateAllSelects()
  renderSettings()
  if (typeof renderDashCalendar === 'function') renderDashCalendar()
  if (typeof renderPlanTable === 'function') renderPlanTable()
}

function addPlanPhase() {
  if (!_phAdminCheck()) return
  const labelEl = document.getElementById('setAddPhLabel')
  const colorEl = document.getElementById('setAddPhColor')
  if (!labelEl) return
  const label = (labelEl.value || '').trim()
  const color = (colorEl && colorEl.value) ? colorEl.value : '#888'
  if (!label) { showToast('단계명을 입력하세요.', 'error'); labelEl.focus(); return }
  const phases = getPlanPhases()
  if (phases.some(p => p.label === label)) { showToast('이미 존재하는 단계명입니다.', 'error'); return }
  // key 자동 생성
  let key = label.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!key) key = 'phase_' + (phases.length + 1)
  let base = key, n = 2
  while (phases.some(p => p.key === key)) { key = base + n; n++ }
  phases.push({ key, label, color })
  savePlanPhases()
  _phRerender()
  showToast(`"${label}" 단계 추가됨`, 'success')
  logActivity('setting', '설정', `기획 일정 단계 추가: ${label} (${key})`)
}

function editPlanPhase(idx) {
  if (!_phAdminCheck()) return
  const item = document.getElementById('phItem_' + idx)
  if (!item) return
  // 다른 열린 에디트 모두 닫기
  document.querySelectorAll('[id^="phItem_"]').forEach(el => {
    const v = el.querySelector('.set-item-view')
    const e = el.querySelector('.set-item-editrow')
    if (v) v.style.display = ''
    if (e) e.style.display = 'none'
  })
  const view = item.querySelector('.set-item-view')
  const edit = item.querySelector('.set-item-editrow')
  if (view) view.style.display = 'none'
  if (edit) {
    edit.style.display = 'flex'
    const inp = edit.querySelector('input[data-field="label"]')
    if (inp) { inp.focus(); inp.select && inp.select() }
  }
}

function cancelPlanPhaseEdit(idx) {
  const item = document.getElementById('phItem_' + idx)
  if (!item) return
  const view = item.querySelector('.set-item-view')
  const edit = item.querySelector('.set-item-editrow')
  if (view) view.style.display = ''
  if (edit) edit.style.display = 'none'
}

function savePlanPhaseEdit(idx) {
  if (!_phAdminCheck()) return
  const phases = getPlanPhases()
  const ph = phases[idx]; if (!ph) return
  const item = document.getElementById('phItem_' + idx)
  if (!item) return
  const labelInp = item.querySelector('input[data-field="label"]')
  const colorInp = item.querySelector('input[data-field="color"]')
  const lbl = (labelInp && labelInp.value || '').trim()
  const col = (colorInp && colorInp.value) || ph.color || '#888'
  if (!lbl) { showToast('단계명이 비어 있습니다.', 'error'); return }
  if (phases.some((p, i) => i !== idx && p.label === lbl)) {
    showToast('이미 존재하는 단계명입니다.', 'error'); return
  }
  const oldLabel = ph.label
  ph.label = lbl
  ph.color = col
  savePlanPhases()
  _phRerender()
  showToast('수정됨', 'success')
  logActivity('setting', '설정', `기획 일정 단계 수정: ${oldLabel} → ${lbl}`)
}

async function deletePlanPhase(idx) {
  if (!_phAdminCheck()) return
  const phases = getPlanPhases()
  const ph = phases[idx]; if (!ph) return
  if (ph.isDefault) { showToast('기본 단계는 삭제할 수 없습니다.', 'error'); return }
  if (phases.length <= 1) { showToast('최소 1개 단계는 유지해야 합니다.', 'error'); return }
  const inUse = (State.planItems || []).some(item => item.schedule && item.schedule[ph.key] && (item.schedule[ph.key].start || item.schedule[ph.key].end))
  let msg = `"${ph.label}" 단계를 삭제하시겠습니까?`
  if (inUse) msg += '\n\n⚠️ 이미 이 단계를 사용 중인 기획 항목이 있습니다. 저장된 일정 데이터는 유지되지만 UI에서 표시되지 않습니다.'
  if (!await korConfirm(msg)) return
  phases.splice(idx, 1)
  savePlanPhases()
  _phRerender()
  showToast('삭제됨', 'success')
  logActivity('setting', '설정', `기획 일정 단계 삭제: ${ph.label}`)
}

window.addPlanPhase = addPlanPhase
window.editPlanPhase = editPlanPhase
window.savePlanPhaseEdit = savePlanPhaseEdit
window.cancelPlanPhaseEdit = cancelPlanPhaseEdit
window.deletePlanPhase = deletePlanPhase
