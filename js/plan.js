// =============================================
// ===== 신규기획 =====
// =============================================
let _plLocalImgUrls = []

function openPlanRegisterModal() {
  const modal = document.getElementById('planRegisterModal')
  modal.showModal()
  centerModal(modal)
  initPlPcodePanel()
}

function closePlanRegisterModal() {
  const code = document.getElementById('plProductCode')?.value
  if (code) _reservedCodes.delete(code)
  document.getElementById('planRegisterModal').close()
  document.getElementById('planRegisterForm').reset()
  const prev = document.getElementById('plImgPreview')
  if (prev) prev.innerHTML = ''
  _plLocalImgUrls = []
}

function submitPlanRegister(e) {
  e.preventDefault()
  const sampleNo = document.getElementById('plSampleNo').value.trim()
  if (!sampleNo) { showToast('샘플번호는 필수입니다.', 'error'); return }

  const sumUrls = (document.getElementById('plImgSum').value || '').split('\n').map(u => u.trim()).filter(Boolean)
  const item = {
    no:          State.planItems.length + 1,
    sampleNo,
    productCode: document.getElementById('plProductCode').value.trim() || '',
    brand:       document.getElementById('plBrand').value,
    nameKr:      document.getElementById('plNameKr').value.trim(),
    nameEn:      document.getElementById('plNameEn').value.trim(),
    colorKr:     document.getElementById('plColorKr').value.trim(),
    colorEn:     document.getElementById('plColorEn').value.trim(),
    salePrice:   Number(document.getElementById('plSalePrice').value) || 0,
    costPrice:   Number(document.getElementById('plCostPrice').value) || 0,
    type:        document.getElementById('plType').value,
    year:        document.getElementById('plYear').value,
    season:      document.getElementById('plSeason').value,
    gender:      document.getElementById('plGender').value,
    memo:        document.getElementById('plMemo').value.trim(),
    images: {
      sum:     [...sumUrls, ..._plLocalImgUrls],
      lemango: document.getElementById('plImgLemango').value.trim(),
      noir:    document.getElementById('plImgNoir').value.trim()
    },
    schedule: {
      design:     { start: document.getElementById('plDesignStart').value,     end: document.getElementById('plDesignEnd').value },
      production: { start: document.getElementById('plProductionStart').value, end: document.getElementById('plProductionEnd').value },
      image:      { start: document.getElementById('plImageStart').value,      end: document.getElementById('plImageEnd').value },
      register:   { start: document.getElementById('plRegisterStart').value,   end: document.getElementById('plRegisterEnd').value },
      logistics:  { start: document.getElementById('plLogisticsStart').value,  end: document.getElementById('plLogisticsEnd').value }
    }
  }
  if (item.productCode) _reservedCodes.delete(item.productCode)
  State.planItems.push(item)
  State.plan.filtered = State.planItems.filter(p => !p.confirmed)
  _plLocalImgUrls = []
  renderPlanTable()
  closePlanRegisterModal()
  showToast(`"${sampleNo}" 기획 등록 완료`, 'success')
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
    ? _backStyles.filter(([c,e,k]) => c.includes(q) || e.toLowerCase().includes(q) || k.toLowerCase().includes(q))
    : _backStyles
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
  const found = _backStyles.find(([c]) => c === code)
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
    const entry = _backStyles.find(([c]) => c === cur)
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
    if (_backStyles.find(([c]) => c === code)) { showToast('이미 존재하는 코드입니다.', 'error'); return }
    _backStyles.push([code, en, kr])
  } else {
    const idx = _backStyles.findIndex(([c]) => c === code)
    if (idx !== -1) _backStyles[idx] = [code, en, kr]; else _backStyles.push([code, en, kr])
  }
  saveBackStyles()
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

function handlePlImgUpload(input) {
  const files = Array.from(input.files)
  const preview = document.getElementById('plImgPreview')
  files.forEach(file => {
    const url = URL.createObjectURL(file)
    _plLocalImgUrls.push(url)
    const wrap = document.createElement('div')
    wrap.className = 'pl-img-thumb-wrap'
    const img = document.createElement('img')
    img.src = url
    img.className = 'pl-img-thumb'
    img.onclick = () => window.open(url)
    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'pl-img-del'
    del.textContent = '✕'
    del.onclick = () => {
      _plLocalImgUrls = _plLocalImgUrls.filter(u => u !== url)
      URL.revokeObjectURL(url)
      wrap.remove()
    }
    wrap.appendChild(img)
    wrap.appendChild(del)
    preview.appendChild(wrap)
  })
  input.value = ''
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
    return true
  })
  State.plan.page = 1
  State.plan.filtered = result
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
  State.plan.page = 1
  State.plan.filtered = State.planItems.filter(p => !p.confirmed)
  renderPlanTable()
}

function renderPlanTable() {
  const data = State.plan.filtered
  const sort = State.plan.sort
  const page = State.plan.page || 1
  const pageData = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  document.getElementById('npTableMeta').textContent = `검색결과 ${data.length}건`

  if (!data.length) {
    document.getElementById('npTableWrap').innerHTML = `<div class="empty-state"><p>등록된 기획 상품이 없습니다. <strong>신규기획 등록</strong> 버튼을 눌러 추가하세요.</p></div>`
    document.getElementById('npPagination').innerHTML = ''
    return
  }

  const schedules = SCHEDULE_DEFS
  const fmtD = d => d ? d.replace(/^\d{4}-(\d{2})-(\d{2})$/, '$1/$2') : '-'

  document.getElementById('npTableWrap').innerHTML = `
    <table class="data-table plan-table" id="planTable">
      <thead>
        <tr>
          <th rowspan="2" style="text-align:center">No.</th>
          <th rowspan="2">이미지</th>
          <th rowspan="2">샘플번호</th>
          <th rowspan="2">품번</th>
          <th rowspan="2">브랜드</th>
          <th rowspan="2">상품명</th>
          <th rowspan="2">색상</th>
          <th rowspan="2">타입</th>
          <th rowspan="2" style="text-align:right">판매가</th>
          ${schedules.map(s => `<th colspan="2" class="schedule-group-th">${s.label}</th>`).join('')}
        </tr>
        <tr>
          ${schedules.map(() => `<th class="schedule-sub-th">시작일</th><th class="schedule-sub-th">완료예정일</th>`).join('')}
        </tr>
      </thead>
      <tbody>${pageData.map(p => `<tr${p.confirmed ? ' style="opacity:0.6"' : ''}>
        <td style="text-align:center">${p.no}${p.confirmed ? '<br><span style="font-size:9px;background:var(--success);color:#fff;padding:1px 5px;border-radius:8px">이전됨</span>' : ''}</td>
        <td>${renderThumb(p)}</td>
        <td><span class="code-link" onclick="openPlanDetailModal(${p.no})">${p.sampleNo}</span></td>
        <td>${p.productCode ? `<span class="code-link" onclick="openDetailModal('${p.productCode}')">${p.productCode}</span>` : `<span style="color:var(--text-muted);font-size:12px">-</span>`}</td>
        <td style="font-size:12px">${p.brand || '-'}</td>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.nameKr || ''}">${p.nameKr || '-'}</td>
        <td style="font-size:12px">${p.colorKr || '-'}</td>
        <td>${typeBadge(p.type)}</td>
        <td style="text-align:right"><span class="price">${fmtPrice(p.salePrice)}</span></td>
        ${schedules.map(s => {
          const sch = p.schedule?.[s.key] || {}
          return `<td class="schedule-date-cell${sch.start?' has-date':''}">${fmtD(sch.start)}</td><td class="schedule-date-cell${sch.end?' has-date':''}">${fmtD(sch.end)}</td>`
        }).join('')}
      </tr>`).join('')}</tbody>
    </table>`

  bindSortHeader('planTable', 'plan', renderPlanTable)
  updateSortIcons('planTable', sort)
  renderPagination('npPagination', 'plan', 'renderPlanTable')
}

// ===== 신규기획 상세 모달 =====
let _editingPlanNo = null

function openPlanDetailModal(no) {
  const item = State.planItems.find(p => p.no === no)
  if (!item) return
  _editingPlanNo = no
  buildPlanDetailContent(item)
  // 뷰 모드로 초기화
  const modal = document.getElementById('planDetailModal')
  modal.classList.remove('edit-mode')
  document.getElementById('pdEditBtn').style.display = ''
  document.getElementById('pdSaveBtn').style.display = 'none'
  const confirmBtn = document.getElementById('pdConfirmBtn')
  if (confirmBtn) confirmBtn.style.display = item.confirmed ? 'none' : ''
  modal.showModal()
  centerModal(modal)
}

function closePlanDetailModal() {
  // 미확정 임시 예약 코드 해제
  if (_pdPendingCode) {
    const currentItem = State.planItems.find(p => p.no === _editingPlanNo)
    if (!currentItem || currentItem.productCode !== _pdPendingCode) {
      _reservedCodes.delete(_pdPendingCode)
    }
    _pdPendingCode = null
  }
  document.getElementById('planDetailModal').close()
}

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

function togglePlanDetailEdit() {
  const modal = document.getElementById('planDetailModal')
  const isEdit = modal.classList.toggle('edit-mode')
  document.getElementById('pdEditBtn').style.display = isEdit ? 'none' : ''
  document.getElementById('pdSaveBtn').style.display = isEdit ? '' : 'none'
}

function savePlanDetailEdit() {
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

  // 일반 input/select/textarea
  modal.querySelectorAll('[data-pkey]').forEach(el => {
    const key = el.dataset.pkey
    const val = el.tagName === 'INPUT' && el.type === 'number' ? (parseFloat(el.value) || 0) : el.value
    item[key] = val
  })
  // 일정 date inputs
  const scheduleKeys = ['design', 'production', 'image', 'register', 'logistics']
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

  buildPlanDetailContent(item)
  modal.classList.remove('edit-mode')
  document.getElementById('pdEditBtn').style.display = ''
  document.getElementById('pdSaveBtn').style.display = 'none'
  renderPlanTable()
  showToast('저장됐습니다.', 'success')
}

function confirmPlanToProduct() {
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

  if (!confirm(`신규기획 항목을 상품조회로 이전합니다.\n품번: ${item.productCode}\n상품명: ${item.nameKr || '(없음)'}\n\n계속하시겠습니까?`)) return

  // 플랜 아이템 → 상품 객체 생성
  const salesInit = {}
  _platforms.forEach(pl => { salesInit[pl] = 0 })

  const newProduct = {
    no:          State.allProducts.length + 1,
    brand:       item.brand       || '',
    productCode: item.productCode,
    sampleNo:    item.sampleNo    || '',
    cafe24Code:  item.cafe24Code  || '',
    barcode:     item.barcode     || '',
    nameKr:      item.nameKr      || '',
    nameEn:      item.nameEn      || '',
    colorKr:     item.colorKr     || '',
    colorEn:     item.colorEn     || '',
    salePrice:   item.salePrice   || 0,
    costPrice:   item.costPrice   || 0,
    type:        item.type        || '',
    backStyle:   item.backStyle   || '',
    legCut:      item.legCut      || '',
    guide:       item.guide       || '',
    fabricType:  item.fabricType  || '',
    chestLine:   item.chestLine   || '',
    transparency:item.transparency|| '',
    lining:      item.lining      || '',
    capRing:     item.capRing     || '',
    material:    item.material    || '',
    comment:     item.comment     || '',
    washMethod:  item.washMethod  || '',
    bust:        item.bust        || '',
    waist:       item.waist       || '',
    hip:         item.hip         || '',
    modelSize:   item.modelSize   || '',
    madeMonth:   item.madeMonth   || '',
    madeBy:      item.madeBy      || '',
    madeIn:      item.madeIn      || '',
    videoUrl:    item.videoUrl    || null,
    saleStatus:  item.saleStatus  || '판매중',
    images: {
      sum:      item.images?.sum      || [],
      lemango:  item.images?.lemango  || [],
      noir:     item.images?.noir     || [],
      external: item.images?.external || [],
      design:   item.images?.design   || [],
      shoot:    item.images?.shoot    || []
    },
    stock:       { XS: 0, S: 0, M: 0, L: 0, XL: 0 },
    sales:       salesInit,
    registDate:  new Date().toISOString().slice(0, 10),
    logisticsDate: '',
    // 기획 일정 이력 (상품조회 하단에 표시)
    scheduleLog: item.schedule && Object.keys(item.schedule).length
      ? [{ confirmedAt: new Date().toISOString().slice(0, 10), schedule: JSON.parse(JSON.stringify(item.schedule)) }]
      : []
  }

  State.allProducts.push(newProduct)
  item.confirmed = true

  // 상품조회 필터 갱신
  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  renderProductTable()
  renderStockTable()
  renderDashboard()
  renderPlanTable()

  closePlanDetailModal()
  switchTab('product')

  // 상세 모달 열기 (약간 지연: 탭 전환 후)
  setTimeout(() => openDetailModal(newProduct.productCode), 100)

  showToast(`"${newProduct.productCode}" 상품이 상품조회로 이전됐습니다.`, 'success')
}

function buildPlanDetailContent(item) {
  document.getElementById('pdBrand').textContent    = item.brand || ''
  document.getElementById('pdNameKr').textContent   = item.nameKr || '(상품명 없음)'
  document.getElementById('pdSampleNo').textContent = item.sampleNo

  const schedules = SCHEDULE_DEFS

  const allImgs = [
    ...(item.images?.sum    || []),
    ...(item.images?.lemango ? [item.images.lemango] : []),
    ...(item.images?.noir    ? [item.images.noir]    : [])
  ].filter(Boolean)

  const imgHtml = allImgs.length
    ? allImgs.map((url, i) =>
        `<img src="${url}" class="pd-thumb" onclick="openModal(${i}, ${JSON.stringify(allImgs).replace(/"/g, '&quot;')})" onerror="this.style.display='none'" />`
      ).join('')
    : '<span class="pd-no-img">이미지 없음</span>'

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

  document.getElementById('pdContent').innerHTML = `
    <div class="pd-section">
      <div class="pd-section-title">이미지</div>
      <div class="pd-img-row">${imgHtml}</div>
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
      </div>
    </div>
    <div class="pd-section">
      <div class="pd-section-title">가격 / 타입</div>
      <div class="dfields-grid">
        ${pf('판매가', 'salePrice', item.salePrice, 'number')}
        ${pf('원가',   'costPrice', item.costPrice, 'number')}
        ${pf('타입',   'type',      item.type, 'select', typeOpts, '', typeLabel[item.type] || item.type)}
        ${pf('연도',   'year',      item.year)}
        ${pf('시즌',   'season',    item.season)}
        ${pf('성별',   'gender',    item.gender, 'select', genderOpts, '', genderLabel[item.gender] || item.gender)}
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
    </div>`
}
