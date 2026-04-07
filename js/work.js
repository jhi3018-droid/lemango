// =============================================
// ===== 업무일정 탭 — 월간 캘린더 =====
// =============================================

let _wkYear  = new Date().getFullYear()
let _wkMonth = new Date().getMonth() // 0-based
let _wkCatFilter = 'all'

let _psYear = new Date().getFullYear()
let _psMonth = new Date().getMonth()
let _editingPsId = null
let _psFilterUser = ''
let _psFilterDept = ''

/* ---------- 네비게이션 ---------- */
function wkPrevMonth() {
  _wkMonth--
  if (_wkMonth < 0) { _wkMonth = 11; _wkYear-- }
  renderWorkCalendar()
}
function wkNextMonth() {
  _wkMonth++
  if (_wkMonth > 11) { _wkMonth = 0; _wkYear++ }
  renderWorkCalendar()
}
function wkToday() {
  _wkYear  = new Date().getFullYear()
  _wkMonth = new Date().getMonth()
  renderWorkCalendar()
}
function wkFilterCategory(val) {
  _wkCatFilter = val
  renderWorkCalendar()
}

/* ---------- 캘린더 렌더 ---------- */
function renderWorkCalendar() {
  const container = document.getElementById('wkCalendar')
  const title     = document.getElementById('wkMonthTitle')
  if (!container) return

  title.textContent = `${_wkYear}년 ${_wkMonth + 1}월`
  title.classList.add('cal-month-clickable')
  title.onclick = () => openMonthPicker(title, _wkYear, _wkMonth, (y, m) => {
    _wkYear = y; _wkMonth = m; renderWorkCalendar()
  })

  const firstDay = new Date(_wkYear, _wkMonth, 1)
  const startDow = firstDay.getDay()

  // 6주 고정 그리드
  const totalCells = 42
  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(_wkYear, _wkMonth, i - startDow + 1)
    cells.push({
      date: fmtDate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === _wkMonth,
      isToday: fmtDate(d) === fmtDate(new Date()),
      dow: i % 7
    })
  }

  // 필터 적용
  const items = _wkCatFilter === 'all'
    ? State.workItems
    : State.workItems.filter(w => w.category === _wkCatFilter)

  // 바 배치
  const MAX_ROWS = 10
  const barRows = placeWorkBars(cells[0].date, cells[cells.length - 1].date, items, MAX_ROWS)

  // HTML
  let html = '<div class="evcal-grid">'
  const DOW = ['일','월','화','수','목','금','토']
  DOW.forEach((d, i) => {
    const cls = i === 0 ? ' evcal-sun' : i === 6 ? ' evcal-sat' : ''
    html += `<div class="evcal-dow${cls}">${d}</div>`
  })

  const todayStr = fmtDate(new Date())

  cells.forEach(cell => {
    const isPast = cell.date < todayStr
    const cellBars = barRows[cell.date] || {}
    let barCount = 0
    for (let r = 0; r < MAX_ROWS; r++) { if (cellBars[r]) barCount++ }
    const hasItems = barCount > 0

    const holiday = getHolidayName(cell.date)

    const classes = ['evcal-cell']
    if (!cell.inMonth) classes.push('evcal-other')
    if (cell.isToday)  classes.push('evcal-today')
    if (cell.dow === 0) classes.push('evcal-sun')
    if (cell.dow === 6) classes.push('evcal-sat')
    if (holiday) classes.push('dcal-holiday')
    if (isPast) classes.push('evcal-past')
    if (!hasItems) classes.push('evcal-empty')

    html += `<div class="${classes.join(' ')}" data-date="${cell.date}">`
    html += `<div class="evcal-day">${cell.day}${holiday ? `<span class="dcal-hol-name">${esc(holiday)}</span>` : ''}</div>`
    html += '<div class="evcal-bars">'

    for (let row = 0; row < MAX_ROWS; row++) {
      const bar = cellBars[row]
      if (!bar) {
        if (!isPast) html += '<div class="evcal-bar evcal-bar-empty"></div>'
        continue
      }

      const w = bar.item
      const color = getWorkCatColor(w.category)
      const tooltip = `${esc(w.category || '')} ${esc(w.title)} (${w.startDate}${w.endDate && w.endDate !== w.startDate ? ' ~ ' + w.endDate : ''})${w.memo ? '\n' + esc(w.memo) : ''}`

      if (isPast) {
        html += `<div class="evcal-bar evcal-bar-mini"
          style="background:${color.bg};"
          title="${tooltip}"
          onclick="event.stopPropagation();openWorkDetailModal(${w.no})"
        ></div>`
      } else {
        const label = esc(`${w.category || ''} ${w.title}`.trim())
        html += `<div class="evcal-bar evcal-bar-fill"
          style="background:${color.bg}; color:${color.text};"
          title="${tooltip}"
          onclick="event.stopPropagation();openWorkDetailModal(${w.no})"
        >${label}</div>`
      }
    }

    // +N more
    const moreCount = cellBars._overflow || 0
    if (moreCount > 0) {
      html += `<div class="evcal-more">+${moreCount}건</div>`
    }

    html += '</div></div>'
  })

  html += '</div>'
  container.innerHTML = html

  // 셀 더블클릭 → 등록 모달 (해당 날짜 자동 입력)
  container.querySelectorAll('.evcal-cell[data-date]').forEach(cell => {
    cell.addEventListener('dblclick', () => {
      openWorkRegisterModal(cell.dataset.date)
    })
  })
}

/* ---------- 바 배치 알고리즘 (placeEventBars 동일 패턴) ---------- */
function placeWorkBars(gridStart, gridEnd, items, maxRows) {
  const result = {}

  const visible = items.filter(w =>
    w.startDate && (w.endDate || w.startDate) >= gridStart && w.startDate <= gridEnd
  ).sort((a, b) => {
    // 내림차순: 최신 시작일이 위
    if (a.startDate !== b.startDate) return a.startDate > b.startDate ? -1 : 1
    const aEnd = a.endDate || a.startDate, bEnd = b.endDate || b.startDate
    if (aEnd !== bEnd) return aEnd > bEnd ? -1 : 1
    return (b.registeredAt || '') > (a.registeredAt || '') ? 1 : -1
  })

  const rowEnd = []

  visible.forEach(w => {
    const wEnd  = w.endDate || w.startDate
    const vStart = w.startDate < gridStart ? gridStart : w.startDate
    const vEnd   = wEnd > gridEnd ? gridEnd : wEnd

    let assignedRow = -1
    for (let r = 0; r < maxRows; r++) {
      if (!rowEnd[r] || rowEnd[r] < vStart) {
        assignedRow = r
        break
      }
    }

    const dates = getDateRange(vStart, vEnd)
    if (assignedRow === -1) {
      dates.forEach(d => {
        if (!result[d]) result[d] = {}
        result[d]._overflow = (result[d]._overflow || 0) + 1
      })
      return
    }

    rowEnd[assignedRow] = vEnd

    dates.forEach(d => {
      if (!result[d]) result[d] = {}
      result[d][assignedRow] = { item: w }
    })
  })

  return result
}

/* ---------- 호환: renderWorkTable → renderWorkCalendar ---------- */
function renderWorkTable() {
  renderWorkCalendar()
}

// ===== 등록 모달 =====
function openWorkRegisterModal(dateStr) {
  const modal = document.getElementById('workRegisterModal')
  if (!modal) return
  document.getElementById('wkRegForm').reset()
  document.getElementById('wkRegNo').value = ''
  modal.querySelector('.rmodal-title').textContent = '업무일정 등록'
  populateAllSelects()
  if (dateStr) {
    document.getElementById('wkRegStart').value = dateStr
    document.getElementById('wkRegEnd').value = dateStr
  }
  modal.showModal()
  centerModal(modal)
}

function closeWorkRegisterModal(force) {
  const modal = document.getElementById('workRegisterModal')
  if (!modal) return
  if (force) { modal.close(); return }
  safeCloseModal(modal, () => true, () => modal.close())
}

function submitWork(e) {
  e.preventDefault()
  const noField = document.getElementById('wkRegNo')
  const isEdit = noField.value !== ''
  const no = isEdit ? Number(noField.value) : (State.workItems.length ? Math.max(...State.workItems.map(w => w.no)) + 1 : 1)

  const item = {
    no,
    category:     document.getElementById('wkRegCategory').value,
    title:        document.getElementById('wkRegTitle').value.trim(),
    startDate:    document.getElementById('wkRegStart').value,
    endDate:      document.getElementById('wkRegEnd').value || document.getElementById('wkRegStart').value,
    memo:         document.getElementById('wkRegMemo').value.trim(),
    registeredAt: isEdit ? (State.workItems.find(w => w.no === no)?.registeredAt || new Date().toISOString()) : new Date().toISOString()
  }

  if (!item.title) { showToast('제목을 입력해주세요.', 'warning'); return }
  if (!item.startDate) { showToast('시작일을 입력해주세요.', 'warning'); return }

  if (isEdit) {
    const idx = State.workItems.findIndex(w => w.no === no)
    if (idx >= 0) {
      const old = State.workItems[idx]
      item.createdBy = old.createdBy
      item.createdByName = old.createdByName
      item.createdAt = old.createdAt
      stampModified(item)
      State.workItems[idx] = item
    }
  } else {
    stampCreated(item)
    State.workItems.push(item)
  }

  _workItems = State.workItems
  saveWorkItems()
  closeWorkRegisterModal(true)
  renderWorkCalendar()
  showToast(isEdit ? '업무일정이 수정되었습니다.' : '업무일정이 등록되었습니다.', 'success')
  logActivity(isEdit ? 'update' : 'create', '업무일정', `${isEdit ? '업무수정' : '업무등록'}: ${item.title}`)
}

// ===== 상세 모달 =====
function openWorkDetailModal(no, fromDash = false) {
  const w = State.workItems.find(x => x.no === no)
  if (!w) return
  const modal = document.getElementById('workDetailModal')
  if (!modal) return

  const body = document.getElementById('wkDetailBody')
  body.innerHTML = buildWorkDetailContent(w, fromDash)
  modal.querySelector('.rmodal-title').textContent = '업무일정 상세'
  // 헤더 액션 버튼 주입
  const hbtns = document.getElementById('wkDetailHeaderBtns')
  if (hbtns) {
    const actionBtns = fromDash
      ? `<button class="btn btn-sm btn-primary" onclick="goToWorkEdit(${w.no})">업무일정에서 수정</button>`
      : `<button class="btn btn-sm btn-primary" onclick="editWorkFromDetail(${w.no})">수정</button>
         <button class="btn btn-sm btn-outline" style="color:var(--danger);border-color:var(--danger)" onclick="deleteWork(${w.no})">삭제</button>`
    hbtns.innerHTML = actionBtns + `<button class="modal-close" onclick="closeWorkDetailModal()">✕</button>`
  }
  modal.showModal()
  centerModal(modal)
  loadComments('work', no)
}

function buildWorkDetailContent(w, fromDash = false) {
  const c = getWorkCatColor(w.category)
  const start = w.startDate || ''
  const end = w.endDate || start
  let progress = 0, days = 1
  if (start && end) {
    const s = new Date(start), e = new Date(end), t = new Date()
    days = Math.max(1, Math.round((e - s) / 86400000) + 1)
    if (t < s) progress = 0
    else if (t > e) progress = 100
    else { const span = e - s; progress = span <= 0 ? 100 : Math.round((t - s) / span * 100) }
  }
  return `
    <div class="wkd-view">
      <span class="srm-cat-tag" style="background:${c.bg};color:${c.text};border-color:${c.bg}">${w.category || '-'}</span>
      <div class="srm-view-value-lg" style="margin-bottom:14px">${w.title || '-'}</div>
      ${start ? `<div class="srm-timeline">
        <span class="srm-tl-dot" style="background:${c.bg}"></span>
        <span class="srm-tl-date">${start}</span>
        <div class="srm-tl-line"><div class="srm-tl-fill" style="width:${progress}%;background:${c.bg}"></div><span class="srm-tl-days" style="color:${c.bg}">${days}일간</span></div>
        <span class="srm-tl-date">${end}</span>
        <span class="srm-tl-dot" style="background:${c.bg}"></span>
      </div>` : ''}
      ${w.memo ? `<div class="srm-divider"></div><div class="srm-memo-label">메모</div><div class="srm-memo-text">${w.memo}</div>` : ''}
      ${renderStampInfo(w)}
      ${buildCommentSection('work', w.no)}
    </div>`
}

function workCatBadge(cat) {
  const c = getWorkCatColor(cat)
  return `<span class="wk-cat-badge" style="background:${c.bg};color:${c.text}">${cat || '-'}</span>`
}

function goToWorkEdit(no) {
  closeWorkDetailModal()
  openTab('work')
  setTimeout(() => editWorkFromDetail(no), 300)
}

function editWorkFromDetail(no) {
  closeWorkDetailModal()
  const w = State.workItems.find(x => x.no === no)
  if (!w) return
  const modal = document.getElementById('workRegisterModal')
  if (!modal) return

  document.getElementById('wkRegNo').value       = w.no
  document.getElementById('wkRegCategory').value  = w.category || ''
  document.getElementById('wkRegTitle').value     = w.title || ''
  document.getElementById('wkRegStart').value     = w.startDate || ''
  document.getElementById('wkRegEnd').value       = w.endDate || ''
  document.getElementById('wkRegMemo').value      = w.memo || ''

  modal.querySelector('.rmodal-title').textContent = '업무일정 수정'
  populateAllSelects()
  document.getElementById('wkRegCategory').value = w.category || ''
  modal.showModal()
  centerModal(modal)
}

function closeWorkDetailModal() {
  document.getElementById('workDetailModal')?.close()
}

async function deleteWork(no) {
  if (!await korConfirm('이 업무일정을 삭제하시겠습니까?')) return
  State.workItems = State.workItems.filter(w => w.no !== no)
  _workItems = State.workItems
  saveWorkItems()
  closeWorkDetailModal()
  renderWorkCalendar()
  showToast('업무일정이 삭제되었습니다.', 'success')
  logActivity('delete', '업무일정', `업무삭제: no=${no}`)
}

// =============================================
// ===== 개인일정 — Inner Tab + Firestore =====
// =============================================

function switchWorkTab(tab) {
  document.querySelectorAll('.work-inner-tab').forEach(t => t.classList.remove('active'))
  document.querySelector(`.work-inner-tab[data-tab="${tab}"]`)?.classList.add('active')
  document.getElementById('workCalendarArea').style.display = tab === 'work' ? '' : 'none'
  document.getElementById('personalCalendarArea').style.display = tab === 'personal' ? '' : 'none'
  if (tab === 'personal') {
    loadAllUsers().then(() => loadPersonalSchedules().then(() => renderPersonalCalendar()))
  }
}

async function loadPersonalSchedules() {
  try {
    const snapshot = await firebase.firestore().collection('personalSchedules').get()
    _personalSchedules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  } catch(e) { console.error('loadPersonalSchedules error:', e) }
}

async function loadAllUsers() {
  if (_allUsers.length > 0) return
  try {
    const snapshot = await firebase.firestore().collection('users').where('status', '==', 'approved').get()
    _allUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }))
  } catch(e) { console.error('loadAllUsers error:', e) }
}

function getVisibleSchedules() {
  const uid = firebase.auth().currentUser?.uid
  const grade = State.currentUser?.grade || 1
  const dept = _currentUserDept || ''
  return _personalSchedules.filter(ps => {
    if (grade >= 4) return true
    if (grade >= 2 && dept && ps.createdByDept === dept) return true
    if (ps.createdBy === uid) return true
    if (ps.mentions?.some(m => m.type === 'user' && m.uid === uid)) return true
    if (ps.mentions?.some(m => m.type === 'dept' && m.dept === dept)) return true
    return false
  })
}

/* ---------- 개인일정 캘린더 ---------- */
function psNavPrev() { _psMonth--; if (_psMonth < 0) { _psMonth = 11; _psYear-- } renderPersonalCalendar() }
function psNavNext() { _psMonth++; if (_psMonth > 11) { _psMonth = 0; _psYear++ } renderPersonalCalendar() }
function psNavToday() { _psYear = new Date().getFullYear(); _psMonth = new Date().getMonth(); renderPersonalCalendar() }

function renderPersonalCalendar() {
  const container = document.getElementById('personalCalendar')
  const title = document.getElementById('psMonthTitle')
  if (!container) return

  title.textContent = `${_psYear}년 ${_psMonth + 1}월`
  title.classList.add('cal-month-clickable')
  title.onclick = () => openMonthPicker(title, _psYear, _psMonth, (y, m) => {
    _psYear = y; _psMonth = m; renderPersonalCalendar()
  })

  const grade = State.currentUser?.grade || 1
  const adminFilter = document.getElementById('psAdminFilter')
  const adminPanel = document.getElementById('psAdminPanel')
  if (grade >= 2) {
    if (adminFilter) adminFilter.style.display = 'flex'
    if (adminPanel) adminPanel.style.display = 'block'
    populatePsAdminFilters()
    renderPsAdminPanel()
  } else {
    if (adminFilter) adminFilter.style.display = 'none'
    if (adminPanel) adminPanel.style.display = 'none'
  }

  let visible = getVisibleSchedules()
  const uid = firebase.auth().currentUser?.uid
  if (grade >= 2 && _psFilterUser) {
    visible = visible.filter(ps => ps.createdBy === _psFilterUser)
  } else if (grade >= 2 && _psFilterDept) {
    visible = visible.filter(ps => ps.createdByDept === _psFilterDept)
  }

  const firstDay = new Date(_psYear, _psMonth, 1)
  const startDow = firstDay.getDay()
  const totalCells = 42
  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(_psYear, _psMonth, i - startDow + 1)
    cells.push({
      date: fmtDate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === _psMonth,
      isToday: fmtDate(d) === fmtDate(new Date()),
      dow: i % 7
    })
  }

  const MAX_ROWS = 10
  const barRows = placePsBars(cells[0].date, cells[cells.length - 1].date, visible, MAX_ROWS)
  const todayStr = fmtDate(new Date())

  let html = '<div class="evcal-grid">'
  const DOW = ['일','월','화','수','목','금','토']
  DOW.forEach((d, i) => {
    const cls = i === 0 ? ' evcal-sun' : i === 6 ? ' evcal-sat' : ''
    html += `<div class="evcal-dow${cls}">${d}</div>`
  })

  cells.forEach(cell => {
    const isPast = cell.date < todayStr
    const cellBars = barRows[cell.date] || {}
    let barCount = 0
    for (let r = 0; r < MAX_ROWS; r++) { if (cellBars[r]) barCount++ }
    const holiday = getHolidayName(cell.date)
    const classes = ['evcal-cell']
    if (!cell.inMonth) classes.push('evcal-other')
    if (cell.isToday) classes.push('evcal-today')
    if (cell.dow === 0) classes.push('evcal-sun')
    if (cell.dow === 6) classes.push('evcal-sat')
    if (holiday) classes.push('dcal-holiday')
    if (isPast) classes.push('evcal-past')
    if (!barCount) classes.push('evcal-empty')

    html += `<div class="${classes.join(' ')}" data-date="${cell.date}">`
    html += `<div class="evcal-day">${cell.day}${holiday ? `<span class="dcal-hol-name">${esc(holiday)}</span>` : ''}</div>`
    html += '<div class="evcal-bars">'

    for (let row = 0; row < MAX_ROWS; row++) {
      const bar = cellBars[row]
      if (!bar) { if (!isPast) html += '<div class="evcal-bar evcal-bar-empty"></div>'; continue }
      const ps = bar.item
      const isMine = ps.createdBy === uid
      const catColor = PS_CAT_COLORS[ps.category] || PS_CAT_COLORS['기타']
      const barColor = isMine ? catColor : { bg: '#0891B2', text: '#fff' }
      const tooltip = `${esc(ps.category || '')} ${esc(ps.title)} (${esc(formatUserName(ps.createdByName, ps.createdByPosition))})`

      if (isPast) {
        html += `<div class="evcal-bar evcal-bar-mini" style="background:${barColor.bg};opacity:0.6" title="${tooltip}" onclick="event.stopPropagation();openPersonalDetailModal('${ps.id}')"></div>`
      } else {
        const label = esc(`${ps.category || ''} ${ps.title}`.trim())
        html += `<div class="evcal-bar evcal-bar-fill" style="background:${barColor.bg};color:${barColor.text}" title="${tooltip}" onclick="event.stopPropagation();openPersonalDetailModal('${ps.id}')">${label}</div>`
      }
    }

    const moreCount = cellBars._overflow || 0
    if (moreCount > 0) html += `<div class="evcal-more">+${moreCount}건</div>`
    html += '</div></div>'
  })

  html += '</div>'
  container.innerHTML = html

  container.querySelectorAll('.evcal-cell[data-date]').forEach(cell => {
    cell.addEventListener('dblclick', () => openPersonalRegisterModal(cell.dataset.date))
  })
}

function placePsBars(gridStart, gridEnd, items, maxRows) {
  const result = {}
  const visible = items.filter(ps =>
    ps.startDate && (ps.endDate || ps.startDate) >= gridStart && ps.startDate <= gridEnd
  ).sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1
    return (a.endDate || a.startDate) < (b.endDate || b.startDate) ? -1 : 1
  })

  const rowEnd = []
  visible.forEach(ps => {
    const pEnd = ps.endDate || ps.startDate
    const vStart = ps.startDate < gridStart ? gridStart : ps.startDate
    const vEnd = pEnd > gridEnd ? gridEnd : pEnd
    let assignedRow = -1
    for (let r = 0; r < maxRows; r++) {
      if (!rowEnd[r] || rowEnd[r] < vStart) { assignedRow = r; break }
    }
    const dates = getDateRange(vStart, vEnd)
    if (assignedRow === -1) {
      dates.forEach(d => { if (!result[d]) result[d] = {}; result[d]._overflow = (result[d]._overflow || 0) + 1 })
      return
    }
    rowEnd[assignedRow] = vEnd
    dates.forEach(d => { if (!result[d]) result[d] = {}; result[d][assignedRow] = { item: ps } })
  })
  return result
}

/* ---------- 등록/상세 모달 ---------- */
function openPersonalRegisterModal(dateStr) {
  _editingPsId = null
  const modal = document.getElementById('personalScheduleModal')
  if (!modal) { console.error('[ps] modal not found'); return }
  const headerSpan = document.getElementById('psModalHeader')?.querySelector('span')
  if (headerSpan) headerSpan.textContent = '개인일정 등록'
  const body = document.getElementById('psModalBody')
  if (!body) { console.error('[ps] psModalBody not found'); return }
  const html = buildPsForm(null)
  console.log('[ps] buildPsForm length:', html.length)
  body.innerHTML = html
  console.log('[ps] body children after set:', body.children.length)
  if (dateStr) {
    const s = document.getElementById('psStartDate'); if (s) s.value = dateStr
    const e = document.getElementById('psEndDate');   if (e) e.value = dateStr
  }
  const btns = document.getElementById('psHeaderBtns')
  if (btns) btns.innerHTML = '<button class="btn btn-primary btn-sm" onclick="savePersonalSchedule()">등록</button><button class="modal-close" onclick="closePersonalScheduleModal()">✕</button>'
  loadAllUsers()
  modal.showModal()
  centerModal(modal)
}

function openPersonalDetailModal(id) {
  const ps = _personalSchedules.find(p => p.id === id)
  if (!ps) return
  _editingPsId = ps.id
  const modal = document.getElementById('personalScheduleModal')
  const uid = firebase.auth().currentUser?.uid
  const canEdit = (ps.createdBy === uid) || (State.currentUser?.grade >= 4)

  document.getElementById('psModalHeader').querySelector('span').textContent = formatUserName(ps.createdByName, ps.createdByPosition) + '의 일정'
  document.getElementById('psModalBody').innerHTML = buildPsView(ps)
  modal.classList.remove('edit-mode')

  const btns = document.getElementById('psHeaderBtns')
  let btnHtml = ''
  if (canEdit) btnHtml += '<button class="btn btn-outline btn-sm" onclick="togglePsEdit()">수정</button>'
  if (canDeletePs(ps)) btnHtml += '<button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)" onclick="deletePersonalSchedule(\'' + ps.id + '\')">삭제</button>'
  btnHtml += '<button class="modal-close" onclick="closePersonalScheduleModal()">✕</button>'
  btns.innerHTML = btnHtml

  modal.showModal()
  centerModal(modal)
}

function closePersonalScheduleModal(force) {
  const modal = document.getElementById('personalScheduleModal')
  if (!modal) return
  const doClose = () => { modal.classList.remove('edit-mode'); _editingPsId = null; modal.close() }
  if (force) { doClose(); return }
  safeCloseModal(modal, () => modal.classList.contains('edit-mode'), doClose)
}

function canDeletePs(ps) {
  const uid = firebase.auth().currentUser?.uid
  if (!uid) return false
  if (State.currentUser?.grade >= 4) return true
  if (ps.createdBy === uid) return true
  return false
}

function togglePsEdit() {
  const modal = document.getElementById('personalScheduleModal')
  const ps = _personalSchedules.find(p => p.id === _editingPsId)
  if (!ps) return

  if (modal.classList.contains('edit-mode')) {
    modal.classList.remove('edit-mode')
    document.getElementById('psModalBody').innerHTML = buildPsView(ps)
    const btns = document.getElementById('psHeaderBtns')
    let btnHtml = '<button class="btn btn-outline btn-sm" onclick="togglePsEdit()">수정</button>'
    if (canDeletePs(ps)) btnHtml += '<button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)" onclick="deletePersonalSchedule(\'' + ps.id + '\')">삭제</button>'
    btnHtml += '<button class="modal-close" onclick="closePersonalScheduleModal()">✕</button>'
    btns.innerHTML = btnHtml
  } else {
    modal.classList.add('edit-mode')
    document.getElementById('psModalBody').innerHTML = buildPsForm(ps)
    loadAllUsers()
    const btns = document.getElementById('psHeaderBtns')
    btns.innerHTML = '<button class="btn btn-primary btn-sm" onclick="savePersonalSchedule()">저장</button><button class="btn btn-outline btn-sm" onclick="togglePsEdit()">취소</button><button class="modal-close" onclick="closePersonalScheduleModal()">✕</button>'
  }
}

/* ---------- View / Form HTML ---------- */
function buildPsView(ps) {
  const mentionHtml = (ps.mentions || []).map(m => {
    if (m.type === 'user') return `<span class="ps-mention-tag ps-mention-user">@${esc(formatUserName(m.name, m.position))}</span>`
    return `<span class="ps-mention-tag ps-mention-dept">@${esc(m.dept)}</span>`
  }).join(' ') || '-'

  const catColor = (PS_CAT_COLORS[ps.category] || PS_CAT_COLORS['기타']).bg
  const days = ps.startDate && ps.endDate ? Math.max(1, Math.round((new Date(ps.endDate) - new Date(ps.startDate)) / 86400000) + 1) : 1
  const progress = ps.startDate && ps.endDate ? (window.calcTimelineProgress ? window.calcTimelineProgress(ps.startDate, ps.endDate) : 0) : 0
  let html = ''
  html += `<span class="srm-cat-tag" style="background:${catColor};color:#fff;border-color:${catColor}">${esc(ps.category)}</span>`
  html += `<div class="srm-view-value-lg" style="margin-bottom:14px">${esc(ps.title)}</div>`
  if (ps.startDate && ps.endDate) {
    html += `<div class="srm-timeline">
      <span class="srm-tl-dot"></span>
      <span class="srm-tl-date">${ps.startDate}</span>
      <div class="srm-tl-line"><div class="srm-tl-fill" style="width:${progress}%"></div><span class="srm-tl-days">${days}일간</span></div>
      <span class="srm-tl-date">${ps.endDate}</span>
      <span class="srm-tl-dot"></span>
    </div>`
  }
  html += `<div class="srm-view-field"><div class="srm-view-label">참조</div><div class="srm-view-value">${mentionHtml}</div></div>`
  if (ps.memo) {
    html += `<div class="srm-divider"></div><div class="srm-memo-label">메모</div><div class="srm-memo-text">${esc(ps.memo)}</div>`
  }
  html += renderStampInfo(ps)
  return html
}

function buildPsForm(ps) {
  ps = ps || {}
  const catOptions = PS_CATEGORIES.map(c => `<option value="${c}"${ps.category === c ? ' selected' : ''}>${c}</option>`).join('')

  const mentionTags = (ps.mentions || []).map(m => {
    if (m.type === 'user') {
      return `<span class="ps-mention-tag ps-mention-user" data-type="user" data-uid="${m.uid}" data-name="${esc(m.name)}" data-position="${esc(m.position || '')}">@${esc(formatUserName(m.name, m.position))} <span class="ps-mention-x" onclick="this.parentElement.remove()">&#10005;</span></span>`
    }
    return `<span class="ps-mention-tag ps-mention-dept" data-type="dept" data-dept="${esc(m.dept)}">@${esc(m.dept)} <span class="ps-mention-x" onclick="this.parentElement.remove()">&#10005;</span></span>`
  }).join('')

  return `
    <div class="srm-field"><label class="srm-field-label">제목</label>
    <input type="text" id="psTitle" value="${esc(ps.title || '')}" placeholder="일정 제목"></div>

    <div class="srm-field-row">
      <div class="srm-field"><label class="srm-field-label">시작일</label>
      <input type="date" id="psStartDate" value="${ps.startDate || ''}"></div>
      <div class="srm-field"><label class="srm-field-label">종료일</label>
      <input type="date" id="psEndDate" value="${ps.endDate || ''}"></div>
    </div>

    <div class="srm-field"><label class="srm-field-label">카테고리</label>
    <select id="psCategory">${catOptions}</select></div>

    <div class="srm-field" style="position:relative"><label class="srm-field-label">참조 (@이름, @부서로 공유)</label>
    <div class="ps-mention-area" id="psMentionArea" style="display:flex;flex-wrap:wrap;gap:6px;padding:6px;border:0.5px solid #e8e6e0;border-radius:6px;min-height:36px;background:#fff">
      ${mentionTags}
      <input class="ps-mention-input" id="psMentionInput" placeholder="@입력..." oninput="searchPsMention(this.value)" style="display:inline-block;flex:1;min-width:120px;border:none;outline:none;font-size:13px;padding:2px 4px;background:transparent">
    </div>
    <div class="ps-mention-dropdown" id="psMentionDropdown" style="display:none"></div>
    <div style="font-size:11px;color:#b4b2a9;margin-top:6px">작성자 + 참조자 + 시스템 관리자만 볼 수 있습니다</div>
    </div>

    <div class="srm-field"><label class="srm-field-label">메모</label>
    <textarea id="psMemo" rows="3" placeholder="메모">${esc(ps.memo || '')}</textarea></div>`
}

/* ---------- @Mention ---------- */
function searchPsMention(query) {
  const dropdown = document.getElementById('psMentionDropdown')
  const q = query.replace(/^@/, '').toLowerCase().trim()
  if (q.length < 1) { dropdown.style.display = 'none'; return }

  let results = []
  _allUsers.forEach(u => {
    const name = formatUserName(u.name, u.position)
    if (name.toLowerCase().includes(q) || (u.dept || '').toLowerCase().includes(q)) {
      results.push({ type: 'user', uid: u.uid, name: u.name, position: u.position || '', dept: u.dept || '', display: name + (u.dept ? ' \u2014 ' + u.dept : '') })
    }
  })
  const depts = [...new Set(_allUsers.map(u => u.dept).filter(Boolean))].sort()
  depts.forEach(dept => {
    if (dept.toLowerCase().includes(q)) {
      results.push({ type: 'dept', dept, display: dept + ' (부서 전체)' })
    }
  })

  if (!results.length) { dropdown.style.display = 'none'; return }
  dropdown.style.display = 'block'
  dropdown.innerHTML = results.slice(0, 8).map(r => {
    if (r.type === 'user') {
      return `<div class="ps-mention-item" onclick="addPsMention('user','${r.uid}','${esc(r.name)}','${esc(r.position)}')"><span class="ps-mention-icon">@</span>${esc(r.display)}</div>`
    }
    return `<div class="ps-mention-item" onclick="addPsMention('dept','','${esc(r.dept)}','')"><span class="ps-mention-icon">@</span>${esc(r.display)}</div>`
  }).join('')
}

function addPsMention(type, uid, name, position) {
  const area = document.getElementById('psMentionArea')
  const input = document.getElementById('psMentionInput')
  const dropdown = document.getElementById('psMentionDropdown')

  const existing = area.querySelectorAll('.ps-mention-tag')
  for (const tag of existing) {
    if (type === 'user' && tag.dataset.uid === uid) return
    if (type === 'dept' && tag.dataset.dept === name) return
  }

  const tag = document.createElement('span')
  if (type === 'user') {
    tag.className = 'ps-mention-tag ps-mention-user'
    tag.dataset.type = 'user'
    tag.dataset.uid = uid
    tag.dataset.name = name
    tag.dataset.position = position
    tag.innerHTML = '@' + esc(formatUserName(name, position)) + ' <span class="ps-mention-x" onclick="this.parentElement.remove()">&#10005;</span>'
  } else {
    tag.className = 'ps-mention-tag ps-mention-dept'
    tag.dataset.type = 'dept'
    tag.dataset.dept = name
    tag.innerHTML = '@' + esc(name) + ' <span class="ps-mention-x" onclick="this.parentElement.remove()">&#10005;</span>'
  }
  area.insertBefore(tag, input)
  input.value = ''
  dropdown.style.display = 'none'
}

function collectMentions() {
  return Array.from(document.querySelectorAll('#psMentionArea .ps-mention-tag')).map(tag => {
    if (tag.dataset.type === 'user') return { type: 'user', uid: tag.dataset.uid, name: tag.dataset.name, position: tag.dataset.position || '' }
    return { type: 'dept', dept: tag.dataset.dept }
  })
}

/* ---------- Save / Delete ---------- */
async function savePersonalSchedule() {
  const title = document.getElementById('psTitle').value.trim()
  if (!title) { showToast('제목을 입력해주세요.', 'warning'); return }
  const startDate = document.getElementById('psStartDate').value
  if (!startDate) { showToast('시작일을 입력해주세요.', 'warning'); return }
  const endDate = document.getElementById('psEndDate').value || startDate

  const user = firebase.auth().currentUser
  const mentions = collectMentions()
  const data = {
    title, startDate, endDate,
    category: document.getElementById('psCategory').value,
    memo: document.getElementById('psMemo').value.trim(),
    mentions,
    createdByPosition: _currentUserPosition || '',
    createdByDept: _currentUserDept || '',
  }

  try {
    if (_editingPsId) {
      stampModified(data)
      await firebase.firestore().collection('personalSchedules').doc(_editingPsId).update(data)
      showToast('일정이 수정되었습니다.', 'success')
      logActivity('update', '개인일정', `일정수정: ${title}`)
    } else {
      stampCreated(data)
      await firebase.firestore().collection('personalSchedules').add(data)
      showToast('일정이 등록되었습니다.', 'success')
      logActivity('create', '개인일정', `일정등록: ${title}`)
      mentions.forEach(m => {
        if (m.type === 'user' && m.uid !== user.uid) {
          addNotification('personal_schedule', '일정 참조', formatUserNameHonorific(_currentUserName, _currentUserPosition) + '이 일정을 공유했습니다: ' + title, 'work')
        }
      })
    }
    closePersonalScheduleModal(true)
    await loadPersonalSchedules()
    renderPersonalCalendar()
  } catch(e) {
    showToast('저장 실패: ' + e.message, 'error')
  }
}

async function deletePersonalSchedule(id) {
  if (!await korConfirm('이 일정을 삭제하시겠습니까?')) return
  try {
    await firebase.firestore().collection('personalSchedules').doc(id).delete()
    showToast('일정이 삭제되었습니다.', 'success')
    logActivity('delete', '개인일정', '일정삭제')
    closePersonalScheduleModal(true)
    await loadPersonalSchedules()
    renderPersonalCalendar()
  } catch(e) {
    showToast('삭제 실패: ' + e.message, 'error')
  }
}

/* ---------- Admin Filter / Panel ---------- */
function filterPersonalSchedule() {
  _psFilterDept = document.getElementById('psFilterDept')?.value || ''
  _psFilterUser = document.getElementById('psFilterUser')?.value || ''
  renderPersonalCalendar()
}

function populatePsAdminFilters() {
  const deptSel = document.getElementById('psFilterDept')
  const userSel = document.getElementById('psFilterUser')
  if (!deptSel || !userSel) return

  const grade = State.currentUser?.grade || 1
  const myDept = _currentUserDept || ''
  let depts = [...new Set(_allUsers.map(u => u.dept).filter(Boolean))].sort()
  if (grade === 2 && myDept) depts = depts.filter(d => d === myDept)
  const currentDept = deptSel.value
  deptSel.innerHTML = '<option value="">전체 부서</option>' + depts.map(d => `<option value="${d}"${d === currentDept ? ' selected' : ''}>${d}</option>`).join('')
  if (grade === 2 && myDept) {
    deptSel.value = myDept
    _psFilterDept = myDept
    deptSel.disabled = true
  } else {
    deptSel.disabled = false
  }

  let users = _allUsers.filter(u => u.status === 'approved')
  if (grade === 2 && myDept) users = users.filter(u => u.dept === myDept)
  if (_psFilterDept) users = users.filter(u => u.dept === _psFilterDept)
  const currentUser = userSel.value
  userSel.innerHTML = '<option value="">전체 직원</option>' + users.map(u => `<option value="${u.uid}"${u.uid === currentUser ? ' selected' : ''}>${formatUserName(u.name, u.position)}</option>`).join('')
}

function renderPsAdminPanel() {
  const panel = document.getElementById('psAdminPanel')
  if (!panel) return

  const grade = State.currentUser?.grade || 1
  const myDept = _currentUserDept || ''
  let users = _allUsers.filter(u => u.status === 'approved')
  if (grade === 2 && myDept) users = users.filter(u => u.dept === myDept)
  if (_psFilterDept) users = users.filter(u => u.dept === _psFilterDept)

  let html = '<div class="card" style="margin-top:16px;padding:16px"><div class="ps-admin-title">전체 직원 일정 현황</div>'
  html += '<table class="ps-admin-table"><thead><tr><th></th><th>이름</th><th>부서</th><th>내 일정</th><th>참조됨</th><th></th></tr></thead><tbody>'

  users.forEach(u => {
    const myCount = _personalSchedules.filter(ps => ps.createdBy === u.uid).length
    const refCount = _personalSchedules.filter(ps => ps.createdBy !== u.uid && (ps.mentions?.some(m => (m.type === 'user' && m.uid === u.uid) || (m.type === 'dept' && m.dept === u.dept)))).length
    const initials = (u.name || '?')[0]
    html += `<tr>
      <td><div class="ps-admin-avatar">${initials}</div></td>
      <td class="ps-admin-name">${esc(formatUserName(u.name, u.position))}</td>
      <td>${esc(u.dept || '-')}</td>
      <td style="text-align:center">${myCount}건</td>
      <td style="text-align:center">${refCount}건</td>
      <td><button class="ps-admin-view-btn" onclick="viewUserSchedule('${u.uid}','${esc(u.name)}')">일정보기</button></td>
    </tr>`
  })

  html += '</tbody></table>'
  html += '<div style="margin-top:12px;text-align:right"><button class="np-toolbar-btn" onclick="downloadPsExcel()">엑셀 다운로드</button></div>'
  html += '</div>'
  panel.innerHTML = html
}

function viewUserSchedule(uid, name) {
  document.getElementById('psFilterUser').value = uid
  _psFilterUser = uid
  renderPersonalCalendar()
  showToast(name + ' 일정 보기', 'info')
}

function downloadPsExcel() {
  const data = _personalSchedules.map(ps => ({
    '작성자': formatUserName(ps.createdByName, ps.createdByPosition),
    '부서': ps.createdByDept || '',
    '제목': ps.title,
    '카테고리': ps.category,
    '시작일': ps.startDate,
    '종료일': ps.endDate,
    '참조': (ps.mentions || []).map(m => m.type === 'user' ? '@' + m.name : '@' + m.dept).join(', '),
    '메모': ps.memo || '',
    '등록일': ps.createdAt ? ps.createdAt.slice(0, 10) : '',
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '개인일정')
  XLSX.writeFile(wb, '르망고_개인일정_전체.xlsx')
}
