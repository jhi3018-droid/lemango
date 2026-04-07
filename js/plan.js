// =============================================
// ===== 신규기획 =====
// =============================================
let _plLocalImgUrls = []
let _planSelected = new Set()

function openPlanRegisterModal() {
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

  // 사이즈 규격 그리드 동적 생성
  const specWrap = document.getElementById('plSizeSpecGrid')
  if (specWrap) {
    let h = '<table class="size-spec-table"><thead><tr><th></th>'
    SIZES.forEach(sz => { h += `<th>${sz}</th>` })
    h += '</tr></thead><tbody>'
    SPEC_ROWS.forEach(r => {
      h += '<tr>'
      h += `<td class="size-spec-label">${r.label}</td>`
      SIZES.forEach(sz => {
        h += `<td><input type="text" class="size-spec-input" id="plSpec_${r.key}_${sz}" style="display:block" /></td>`
      })
      h += '</tr>'
    })
    h += '</tbody></table>'
    specWrap.innerHTML = h
  }

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

  const splitLines = (id) => (document.getElementById(id)?.value || '').split('\n').map(u => u.trim()).filter(Boolean)
  const sumUrls     = splitLines('plImgSum')
  const lemangoUrls = splitLines('plImgLemango')
  const noirUrls    = splitLines('plImgNoir')
  const extUrls     = splitLines('plImgExternal')

  // sizeSpec 수집
  const sizeSpec = {}
  SPEC_ROWS.forEach(r => {
    sizeSpec[r.key] = {}
    SIZES.forEach(sz => {
      const inp = document.getElementById('plSpec_' + r.key + '_' + sz)
      sizeSpec[r.key][sz] = inp ? inp.value.trim() : ''
    })
  })

  const val = (id) => document.getElementById(id)?.value.trim() || ''
  const item = {
    no:          State.planItems.length + 1,
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
    mainImage:   val('plMainImage'),
    videoUrl:    val('plVideoUrl'),
    images: {
      sum:      [...sumUrls, ..._plLocalImgUrls],
      lemango:  lemangoUrls,
      noir:     noirUrls,
      external: extUrls,
      design:   val('plImgDesign'),
      shoot:    val('plImgShoot')
    },
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
  _plLocalImgUrls = []
  renderPlanTable()
  closePlanRegisterModal()
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
  renderPlanTable()
}

function changePlanPageSize(val) {
  State.plan.pageSize = parseInt(val) || 0
  State.plan.page = 1
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
    td: p=>`<td>${renderThumb(p)}</td>` },
  { key:'sampleNo',   label:'샘플번호',fixed:false, thAttr:'data-key="sampleNo"',
    td: p=>`<td><span class="code-link" onclick="openPlanDetailModal(${p.no})">${p.sampleNo}</span></td>` },
  { key:'productCode',label:'품번',   fixed:true,  thAttr:'data-key="productCode" style="width:145px"',
    td: p=>`<td>${p.productCode?`<span class="code-link" onclick="openDetailModal('${p.productCode}')">${p.productCode}</span>`:`<span style="color:var(--text-muted);font-size:12px">-</span>`}</td>` },
  { key:'brand',      label:'브랜드', fixed:false, thAttr:'data-key="brand"',
    td: p=>`<td style="font-size:12px">${p.brand||'-'}</td>` },
  { key:'nameKr',     label:'상품명', fixed:false, thAttr:'data-key="nameKr"',
    td: p=>`<td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.nameKr||''}">${p.nameKr||'-'}</td>` },
  { key:'colorKr',    label:'색상',   fixed:false, thAttr:'data-key="colorKr"',
    td: p=>`<td style="font-size:12px">${p.colorKr||'-'}</td>` },
  { key:'type',       label:'타입',   fixed:false, thAttr:'data-key="type"',
    td: p=>`<td>${typeBadge(p.type)}</td>` },
  { key:'salePrice',  label:'판매가', fixed:false, thAttr:'data-key="salePrice" style="text-align:right"',
    td: p=>`<td style="text-align:right"><span class="price">${fmtPrice(p.salePrice)}</span></td>` },
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
  const PLAN_ALL_COLS = _getPlanAllCols()
  const PLAN_SCHEDULE_COLS = _getPlanScheduleCols()
  const PLAN_FIXED_KEYS = _getPlanFixedKeys()
  initColumnState('plan', PLAN_ALL_COLS.map(c=>c.key))
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

  const tbodyHtml = pageData.map(p => {
    const isChecked = _planSelected.has(p.no)
    const regTds = activeRegular.map(c => c.td(p)).join('')
    const schTds = activeSchedule.map(c => {
      const sch = p.schedule?.[c.scheduleKey] || {}
      return `<td class="schedule-date-cell${sch.start?' has-date':''}">${fmtD(sch.start)}</td>` +
             `<td class="schedule-date-cell${sch.end?' has-date':''}">${fmtD(sch.end)}</td>`
    }).join('')
    const cls = [isChecked ? 'np-selected' : '', p.confirmed ? '' : ''].filter(Boolean).join(' ')
    return `<tr class="${cls}"${p.confirmed?' style="opacity:0.6"':''}><td><input type="checkbox" class="np-check" data-no="${p.no}" ${isChecked?'checked':''} onchange="updatePlanSelection()"></td>${regTds}${schTds}</tr>`
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
  _pdUpdateHeaderBtns('view')
  const confirmBtn = document.getElementById('pdConfirmBtn')
  if (confirmBtn && item.confirmed) confirmBtn.style.display = 'none'
  modal.showModal()
  centerModal(modal)
  loadComments('plan', no)
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
  localStorage.setItem('lemango_plan_items_v1', JSON.stringify(State.planItems))
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

function togglePlanDetailEdit() {
  const modal = document.getElementById('planDetailModal')
  const isEdit = modal.classList.toggle('edit-mode')
  _pdUpdateHeaderBtns(isEdit ? 'edit' : 'view')
  const cb = document.getElementById('pdConfirmBtn')
  if (cb && !cb.dataset.hidden) cb.disabled = !isEdit
}

async function confirmPlanWithCheck() {
  const ok = await korConfirm('상품을 확정하시겠습니까?\n확정 후 상품조회로 이전됩니다.', '확정', '취소')
  if (!ok) return
  confirmPlanToProduct()
}
window.confirmPlanWithCheck = confirmPlanWithCheck

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
  })

  // 사이즈 규격 수집
  ensureSizeSpec(item)
  modal.querySelectorAll('.size-spec-input[data-spec]').forEach(inp => {
    const specKey = inp.dataset.spec
    const sz = inp.dataset.size
    if (specKey && sz) item.sizeSpec[specKey][sz] = inp.value.trim()
  })
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

  stampModified(item)

  buildPlanDetailContent(item)
  modal.classList.remove('edit-mode')
  _pdUpdateHeaderBtns('view')
  renderPlanTable()
  showToast('저장됐습니다.', 'success')
  logActivity('update', '신규기획', `기획수정: ${item.sampleNo || item.productCode}`)
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
    // 기획 일정 이력 (상품조회 하단에 표시)
    scheduleLog: item.schedule && Object.keys(item.schedule).length
      ? [{ confirmedAt: new Date().toISOString().slice(0, 10), schedule: JSON.parse(JSON.stringify(item.schedule)) }]
      : []
  }

  stampCreated(newProduct)
  State.allProducts.push(newProduct)
  item.confirmed = true
  stampModified(item)

  // 상품조회 필터 갱신
  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  renderProductTable()
  renderStockTable()
  renderDashboard()
  renderPlanTable()

  closePlanDetailModal(true)
  switchTab('product')

  // 상세 모달 열기 (약간 지연: 탭 전환 후)
  setTimeout(() => openDetailModal(newProduct.productCode), 100)

  showToast(`"${newProduct.productCode}" 상품이 상품조회로 이전됐습니다.`, 'success')
  logActivity('create', '신규기획', `상품이전: ${newProduct.productCode}`)
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
        `<img src="${url}" class="pd-thumb" onclick="openModal(${i}, ${JSON.stringify(allImgs).replace(/"/g, '&quot;')})" onerror="this.onerror=null;this.src=PLACEHOLDER_IMG" />`
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

  document.getElementById('pdContent').innerHTML = `
    <div class="pd-section">
      <div class="pd-section-title">이미지</div>
      <div class="pd-img-row">${imgHtml}</div>
      ${item.confirmed ? '' : `<div style="margin-top:12px;text-align:right"><button class="srm-btn-gold" id="pdConfirmBtn" disabled onclick="confirmPlanWithCheck()">상품확정 →</button></div>`}
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
        ${pf('다리파임', 'legCut',     item.legCut, 'select', legCutOpts)}
        ${pf('가이드',   'guide',      item.guide)}
        ${pf('가슴선',   'chestLine',  item.chestLine, 'select', chestLineOpts)}
        ${pf('비침',     'transparency', item.transparency, 'select', transparencyOpts)}
        ${pf('안감',     'lining',     item.lining, 'select', liningOpts)}
        ${pf('캡고리',   'capRing',    item.capRing, 'select', capRingOpts)}
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
      <div class="pd-section-title">사이즈 규격</div>
      <div style="padding:10px 12px">
        ${(() => {
          const spec = ensureSizeSpec(item)
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
        <div style="margin-top:10px">
          ${pf('모델착용사이즈', 'modelSize', item.modelSize)}
        </div>
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

  showToast(`${count}건 일정 일괄 적용 완료`, 'success')
  logActivity('update', '신규기획', `일괄 일정 설정 — ${count}건`)

  closeBulkScheduleModal(true)
  clearPlanSelection()
  renderPlanTable()
  if (typeof renderDashCalendar === 'function') renderDashCalendar()
}
