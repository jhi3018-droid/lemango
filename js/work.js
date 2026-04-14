// =============================================
// ===== 업무일정 탭 — 월간 캘린더 =====
// =============================================

let _wkYear  = new Date().getFullYear()
let _wkMonth = new Date().getMonth() // 0-based
let _wkCatFilter = 'all'
let _wkCursor = new Date()  // used as base date for week/day views
if (typeof State !== 'undefined') {
  State.workCalView = State.workCalView || 'month'
  State.eventCalView = State.eventCalView || 'month'
}

// ---------- Shared month/week/day view switcher ----------
function switchCalView(scope, mode) {
  if (typeof State === 'undefined') return
  if (scope === 'work') {
    State.workCalView = mode
    if (mode !== 'month') _wkCursor = new Date(_wkYear, _wkMonth, (new Date()).getDate())
    renderWorkCalendar()
  } else if (scope === 'event') {
    State.eventCalView = mode
    if (mode !== 'month' && typeof _evCursor !== 'undefined') {
      window._evCursor = new Date(_evYear, _evMonth, (new Date()).getDate())
    }
    renderEventCalendar()
  }
}
if (typeof window !== 'undefined') window.switchCalView = switchCalView

// ---------- View toggle buttons HTML ----------
function _calViewBtnsHtml(scope, mode) {
  return `<div class="cal-view-btns">
    <button class="cal-view-btn${mode==='month'?' active':''}" onclick="switchCalView('${scope}','month')">월간</button>
    <button class="cal-view-btn${mode==='week'?' active':''}" onclick="switchCalView('${scope}','week')">주간</button>
    <button class="cal-view-btn${mode==='day'?' active':''}" onclick="switchCalView('${scope}','day')">일간</button>
  </div>`
}

// ---------- Week / Day view renderers (shared by work + event) ----------
const CAL_HOUR_START = 8
const CAL_HOUR_END = 22

function _calItemsInRange(scope, startStr, endStr) {
  if (scope === 'work') {
    return (State.workItems || []).filter(w => {
      if (!w.startDate) return false
      const s = w.startDate, e = w.endDate || w.startDate
      return s <= endStr && e >= startStr &&
        (_wkCatFilter === 'all' || w.category === _wkCatFilter)
    })
  } else {
    return (typeof _events !== 'undefined' ? _events : []).filter(ev =>
      ev.startDate && ev.endDate && ev.startDate <= endStr && ev.endDate >= startStr
    )
  }
}

function _calItemColor(scope, item) {
  if (scope === 'work') {
    const c = getWorkCatColor(item.category)
    return { bg: c.bg, text: c.text }
  }
  const color = EV_COLORS[item.no % EV_COLORS.length]
  return { bg: color.bar, text: color.text }
}

function _calItemLabel(scope, item) {
  if (scope === 'work') return `${item.category || ''} ${item.title || ''}`.trim()
  return `${item.channel || ''} ${item.name || ''}`.trim()
}

function _calItemClick(scope, item) {
  if (scope === 'work') return `openWorkDetailModal(${item.no})`
  return `openEventDetailModal(${item.no})`
}

function _hourLabel(h) { return (h < 10 ? '0' + h : h) + ':00' }

function renderWeekView(scope, baseDate) {
  const start = getStartOfWeek(baseDate)
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i)
    days.push({ date: new Date(d), dateStr: fmtDate(d) })
  }
  const startStr = days[0].dateStr, endStr = days[6].dateStr
  const items = _calItemsInRange(scope, startStr, endStr)

  // split into full-day vs hourly
  const fullDay = [], hourly = []
  items.forEach(it => {
    if (scope === 'work' && it.startTime) hourly.push(it)
    else fullDay.push(it)
  })

  const DOW = ['일','월','화','수','목','금','토']
  const todayStr = fmtDate(new Date())

  let html = '<div class="week-view">'
  // Header
  html += '<div class="week-header"><div class="week-time"></div>'
  days.forEach((d, i) => {
    const cls = (d.dateStr === todayStr ? ' week-today' : '') + (i === 0 ? ' evcal-sun' : i === 6 ? ' evcal-sat' : '')
    html += `<div class="week-day-header${cls}">${DOW[i]} ${d.date.getMonth()+1}/${d.date.getDate()}</div>`
  })
  html += '</div>'

  // All-day row
  html += '<div class="week-row week-allday"><div class="week-time">종일</div>'
  days.forEach(d => {
    const dayItems = fullDay.filter(it => {
      const s = scope === 'work' ? it.startDate : it.startDate
      const e = scope === 'work' ? (it.endDate || it.startDate) : it.endDate
      return s <= d.dateStr && e >= d.dateStr
    })
    html += '<div class="week-cell">'
    dayItems.forEach(it => {
      const c = _calItemColor(scope, it)
      html += `<div class="evcal-bar evcal-bar-fill" style="background:${c.bg};color:${c.text}" onclick="${_calItemClick(scope, it)}">${esc(_calItemLabel(scope, it))}</div>`
    })
    html += '</div>'
  })
  html += '</div>'

  // Hourly rows
  for (let h = CAL_HOUR_START; h <= CAL_HOUR_END; h++) {
    html += `<div class="week-row"><div class="week-time">${_hourLabel(h)}</div>`
    days.forEach(d => {
      const hourItems = hourly.filter(it => {
        const s = it.startDate, e = it.endDate || it.startDate
        if (!(s <= d.dateStr && e >= d.dateStr)) return false
        const st = parseInt((it.startTime || '00:00').split(':')[0], 10)
        return st === h
      })
      html += '<div class="week-cell">'
      hourItems.forEach(it => {
        const c = _calItemColor(scope, it)
        const time = it.startTime + (it.endTime ? '~' + it.endTime : '')
        html += `<div class="evcal-bar evcal-bar-fill" style="background:${c.bg};color:${c.text}" onclick="${_calItemClick(scope, it)}">${esc(time + ' ' + _calItemLabel(scope, it))}</div>`
      })
      html += '</div>'
    })
    html += '</div>'
  }
  html += '</div>'
  return html
}

function renderDayView(scope, date) {
  const d = (date instanceof Date) ? new Date(date) : new Date(date)
  d.setHours(0, 0, 0, 0)
  const dateStr = fmtDate(d)
  const items = _calItemsInRange(scope, dateStr, dateStr)
  const fullDay = [], hourly = []
  items.forEach(it => {
    if (scope === 'work' && it.startTime) hourly.push(it)
    else fullDay.push(it)
  })
  const DOW = ['일','월','화','수','목','금','토']
  let html = '<div class="day-view">'
  html += `<div class="day-title">${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${DOW[d.getDay()]})</div>`

  html += '<div class="day-row"><div class="day-time">종일</div><div class="day-content">'
  if (!fullDay.length) html += '<span style="color:#999;font-size:12px">-</span>'
  fullDay.forEach(it => {
    const c = _calItemColor(scope, it)
    html += `<div class="evcal-bar evcal-bar-fill" style="background:${c.bg};color:${c.text}" onclick="${_calItemClick(scope, it)}">${esc(_calItemLabel(scope, it))}</div>`
  })
  html += '</div></div>'

  for (let h = CAL_HOUR_START; h <= CAL_HOUR_END; h++) {
    const hourItems = hourly.filter(it => parseInt((it.startTime || '00:00').split(':')[0], 10) === h)
    html += `<div class="day-row"><div class="day-time">${_hourLabel(h)}</div><div class="day-content">`
    hourItems.forEach(it => {
      const c = _calItemColor(scope, it)
      const time = it.startTime + (it.endTime ? '~' + it.endTime : '')
      html += `<div class="evcal-bar evcal-bar-fill" style="background:${c.bg};color:${c.text}" onclick="${_calItemClick(scope, it)}">${esc(time + ' ' + _calItemLabel(scope, it))}</div>`
    })
    html += '</div></div>'
  }
  html += '</div>'
  return html
}
if (typeof window !== 'undefined') {
  window.renderWeekView = renderWeekView
  window.renderDayView = renderDayView
}


let _psYear = new Date().getFullYear()
let _psMonth = new Date().getMonth()
let _editingPsId = null
let _psFilterUser = ''
let _psFilterDept = ''

/* ---------- 네비게이션 ---------- */
function wkPrevMonth() {
  const mode = (State && State.workCalView) || 'month'
  if (mode === 'week') {
    _wkCursor = new Date(_wkCursor); _wkCursor.setDate(_wkCursor.getDate() - 7)
  } else if (mode === 'day') {
    _wkCursor = new Date(_wkCursor); _wkCursor.setDate(_wkCursor.getDate() - 1)
  } else {
    _wkMonth--
    if (_wkMonth < 0) { _wkMonth = 11; _wkYear-- }
  }
  renderWorkCalendar()
}
function wkNextMonth() {
  const mode = (State && State.workCalView) || 'month'
  if (mode === 'week') {
    _wkCursor = new Date(_wkCursor); _wkCursor.setDate(_wkCursor.getDate() + 7)
  } else if (mode === 'day') {
    _wkCursor = new Date(_wkCursor); _wkCursor.setDate(_wkCursor.getDate() + 1)
  } else {
    _wkMonth++
    if (_wkMonth > 11) { _wkMonth = 0; _wkYear++ }
  }
  renderWorkCalendar()
}
function wkToday() {
  const mode = (State && State.workCalView) || 'month'
  _wkYear  = new Date().getFullYear()
  _wkMonth = new Date().getMonth()
  _wkCursor = new Date()
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

  // Inject view toggle buttons into header (once)
  const header = container.parentElement?.querySelector('.evcal-header')
  if (header && !header.querySelector('.cal-view-btns')) {
    header.insertAdjacentHTML('beforeend', _calViewBtnsHtml('work', (State && State.workCalView) || 'month'))
  } else if (header) {
    const old = header.querySelector('.cal-view-btns')
    if (old) old.outerHTML = _calViewBtnsHtml('work', (State && State.workCalView) || 'month')
  }

  const mode = (State && State.workCalView) || 'month'
  if (mode === 'week') {
    const start = getStartOfWeek(_wkCursor)
    const end = new Date(start); end.setDate(start.getDate() + 6)
    title.textContent = `${start.getFullYear()}.${start.getMonth()+1}.${start.getDate()} ~ ${end.getMonth()+1}.${end.getDate()}`
    title.classList.remove('cal-month-clickable'); title.onclick = null
    container.innerHTML = renderWeekView('work', _wkCursor)
    return
  }
  if (mode === 'day') {
    const d = new Date(_wkCursor)
    title.textContent = `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`
    title.classList.remove('cal-month-clickable'); title.onclick = null
    container.innerHTML = renderDayView('work', _wkCursor)
    return
  }

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
  const MAX_ROWS = 9999
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
      if (!bar) continue

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
        let labelRaw = `${w.category || ''} ${w.title || ''}`.trim()
        const authorRaw = w.createdByName ? (typeof formatUserName === 'function' ? formatUserName(w.createdByName, w.createdByPosition) : w.createdByName) : ''
        // 라벨에서 작성자 이름 중복 제거
        if (authorRaw && labelRaw.indexOf(authorRaw) >= 0) labelRaw = labelRaw.replace(authorRaw, '').replace(/\s*[-–]\s*$/, '').trim()
        if (w.createdByName && labelRaw.indexOf(w.createdByName) >= 0) labelRaw = labelRaw.replace(w.createdByName, '').replace(/\s*[-–]\s*$/, '').trim()
        const label = esc(labelRaw)
        const author = authorRaw ? esc(authorRaw) : ''
        html += `<div class="evcal-bar evcal-bar-fill"
          style="background:${color.bg}; color:${color.text};"
          title="${tooltip}"
          onclick="event.stopPropagation();openWorkDetailModal(${w.no})"
        ><span class="bar-text">${label}</span><span class="bar-right">${author ? `<span class="bar-author">${author}</span>` : ''}${w.useVehicle === true ? '<span class="bar-vehicle">🚗</span>' : ''}</span></div>`
      }
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
  clearWorkMentionArea()
  if (typeof loadAllUsers === 'function') loadAllUsers()
  if (dateStr) {
    document.getElementById('wkRegStart').value = dateStr
    document.getElementById('wkRegEnd').value = dateStr
  }
  _currentWorkItem = { checklist: [] }
  const chkArea = document.getElementById('wkRegChecklistArea')
  if (chkArea) chkArea.innerHTML = buildChecklistHtml([], true)
  const vBtn = document.getElementById('wkRegVehicle')
  if (vBtn) {
    vBtn.dataset.active = 'false'
    vBtn.classList.remove('vehicle-active')
    const vLbl = document.getElementById('wkRegVehicleLabel')
    if (vLbl) vLbl.textContent = '미사용'
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
    startTime:    document.getElementById('wkRegStartTime')?.value || '',
    endTime:      document.getElementById('wkRegEndTime')?.value || '',
    memo:         document.getElementById('wkRegMemo').value.trim(),
    useVehicle:   document.getElementById('wkRegVehicle')?.dataset?.active === 'true',
    mentions:     collectMentions('work'),
    registeredAt: isEdit ? (State.workItems.find(w => w.no === no)?.registeredAt || new Date().toISOString()) : new Date().toISOString()
  }

  // Collect checklist: merge text edits from inputs with done state from _currentWorkItem
  const baseList = (_currentWorkItem && _currentWorkItem.checklist) ? _currentWorkItem.checklist : []
  const editedList = baseList.map(c => {
    const inp = document.querySelector(`#wkRegChecklistArea .checklist-text-input[data-chk-id="${c.id}"]`)
    return { id: c.id, text: inp ? inp.value.trim() : (c.text || ''), done: !!c.done }
  }).filter(c => c.text)
  item.checklist = editedList

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
  if (isEdit) {
    try {
      if (typeof notifyWatchers === 'function') notifyWatchers('work', item.no, '수정됨')
      if (typeof releaseEditLock === 'function') releaseEditLock('work', item.no)
    } catch(e) {}
  }

  // 참조자에게 즉시 알림
  if (!isEdit && item.mentions && item.mentions.length) {
    const myUid = (typeof firebase !== 'undefined' && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : null
    item.mentions.forEach(m => {
      if (m.type === 'user' && m.uid !== myUid) {
        addNotification('work_mention', '업무일정 참조',
          formatUserNameHonorific(_currentUserName, _currentUserPosition) + '이 업무일정을 공유했습니다: ' + item.title,
          '#work:' + item.no)
      }
    })
  }
}

// ===== 상세 모달 =====
// 업무일정 수정/삭제 권한: 작성자 본인 OR 관리자(grade>=3) 이상
function canEditWork(w) {
  if (!w) return false
  const u = State.currentUser
  if (!u) return false
  if ((u.grade || 0) >= 3) return true
  const uid = (typeof firebase !== 'undefined' && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : null
  return !!uid && w.createdBy === uid
}
window.canEditWork = canEditWork

function openWorkDetailModal(no, fromDash = false) {
  const w = State.workItems.find(x => x.no === no)
  if (!w) return
  w.checklist = w.checklist || []
  _currentWorkItem = w
  const modal = document.getElementById('workDetailModal')
  if (!modal) return

  const body = document.getElementById('wkDetailBody')
  body.innerHTML = buildWorkDetailContent(w, fromDash)
  modal.querySelector('.rmodal-title').textContent = '업무일정 상세'
  // 헤더 액션 버튼 주입
  const hbtns = document.getElementById('wkDetailHeaderBtns')
  if (hbtns) {
    const canEdit = canEditWork(w)
    const actionBtns = fromDash
      ? (canEdit ? `<button class="btn btn-sm btn-primary" onclick="goToWorkEdit(${w.no})">업무일정에서 수정</button>` : '')
      : (canEdit
        ? `<button class="btn btn-sm btn-primary" onclick="editWorkFromDetail(${w.no})">수정</button>
           <button class="btn btn-sm btn-outline" style="color:var(--danger);border-color:var(--danger)" onclick="deleteWork(${w.no})">삭제</button>`
        : '')
    const watchLabel = (typeof isWatching === 'function' && isWatching('work', w.no)) ? '💛' : '🤍'
    const watchActive = (typeof isWatching === 'function' && isWatching('work', w.no)) ? ' active' : ''
    const watchBtn = `<button class="btn btn-sm btn-outline watch-btn${watchActive}" id="wkWatchBtn" onclick="toggleWatch('work', ${w.no}, '${(w.title||'').replace(/'/g,"\\'")}'); _wkSyncWatchBtn(${w.no})" title="변경 알림">${watchLabel}</button>`
    const lockInfo = (typeof getEditLockInfo === 'function') ? getEditLockInfo('work', w.no) : null
    const lockWarn = lockInfo ? `<span class="edit-lock-warn" id="wkLockWarn">🔒 ${esc(lockInfo.userName || '다른 사용자')} 편집중</span>` : `<span class="edit-lock-warn" id="wkLockWarn" style="display:none"></span>`
    hbtns.innerHTML = watchBtn + lockWarn + actionBtns + `<button class="modal-close" onclick="closeWorkDetailModal()">✕</button>`
  }
  modal.showModal()
  centerModal(modal)
  loadComments('work', no)
  if (typeof pushModalHistory === 'function') pushModalHistory('work', no)
}

function buildWorkDetailContent(w, fromDash = false) {
  const c = getWorkCatColor(w.category)
  const startDateStr = w.startDate || ''
  const endDateStr = w.endDate || startDateStr
  const start = startDateStr + (w.startTime ? ' ' + w.startTime : '')
  const end = endDateStr + (w.endTime ? ' ' + w.endTime : '')
  let progress = 0, days = 1
  if (startDateStr && endDateStr) {
    const s = new Date(startDateStr), e = new Date(endDateStr), t = new Date()
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
      ${w.useVehicle === true ? `<div class="dfield"><span class="dfield-label">차량 사용</span><span class="dfield-value"><span class="vehicle-badge">🚗 사용</span></span></div>` : ''}
      ${w.memo ? `<div class="srm-divider"></div><div class="srm-memo-label">메모</div><div class="srm-memo-text">${w.memo}</div>` : ''}
      ${buildChecklistHtml(w.checklist || [], false)}
      ${(w.mentions && w.mentions.length) ? `<div class="srm-divider"></div><div class="srm-memo-label">참조</div><div class="srm-view-value">${w.mentions.map(m => m.type === 'user' ? `<span class="mention-tag mention-user">@${esc(formatUserName(m.name, m.position))}</span>` : `<span class="mention-tag mention-dept">@${esc(m.dept)}</span>`).join(' ')}</div>` : ''}
      ${renderStampInfo(w)}
      ${buildCommentSection('work', w.no)}
    </div>`
}

/* ---------- Checklist (Feature 11) ---------- */
let _currentWorkItem = null

function buildChecklistHtml(checklist, isEdit) {
  checklist = checklist || []
  const done = checklist.filter(c => c.done).length
  const total = checklist.length
  let html = '<div class="checklist-section">'
  html += `<div class="checklist-title">체크리스트 <span class="checklist-count">${done}/${total}</span></div>`
  checklist.forEach(c => {
    const cid = esc(c.id)
    const text = esc(c.text || '')
    const cbHandler = isEdit
      ? `onclick="this.closest('.checklist-item').classList.toggle('checklist-done', this.checked)"`
      : `onchange="toggleChecklistItem('${cid}')"`
    const delHandler = isEdit
      ? `onclick="removeChecklistItem('${cid}')"`
      : `onclick="deleteChecklistItemView('${cid}')"`
    const rowStyle = 'display:flex !important;align-items:center;gap:6px;padding:5px 0;font-size:13px;width:100%;'
    const cbStyle = 'width:16px !important;height:16px !important;flex:0 0 16px !important;margin:0;cursor:pointer;'
    const txtStyle = 'flex:1 1 auto !important;min-width:0;word-break:break-all;font-size:12px;'
    const inpStyle = 'flex:1 1 auto;min-width:0;border:1px solid #ddd;padding:2px 6px;font-size:13px;display:none;'
    const btnStyle = 'background:none;border:none;color:#999;cursor:pointer;font-size:9px;line-height:1;padding:0 3px;flex:0 0 auto;'
    let trailing = ''
    if (isEdit) {
      trailing = `
      <input type="text" class="checklist-text-input" data-chk-id="${cid}" value="${text}" style="${inpStyle}">
      <button type="button" class="checklist-edit" onclick="editChecklistItem('${cid}', true)" style="${btnStyle}">✎</button>
      <button type="button" class="checklist-save" onclick="saveChecklistItem('${cid}', true)" style="${btnStyle};display:none">저장</button>
      <button type="button" class="checklist-cancel" onclick="cancelChecklistEdit('${cid}', true)" style="${btnStyle};display:none">취소</button>
      <button type="button" class="checklist-del" ${delHandler} style="${btnStyle}">✕</button>`
    } else if (c.done && c.checkedBy) {
      const who = esc((c.checkedBy || '') + (c.checkedByPosition || ''))
      trailing = `<span class="checklist-checker" style="font-size:10px;color:#b4b2a9;flex-shrink:0">${who}</span>`
    }
    html += `<div class="checklist-item${c.done?' checklist-done':''}" data-chk-id="${cid}" style="${rowStyle}">
      <input type="checkbox" class="checklist-cb" ${c.done?'checked':''} ${cbHandler} style="${cbStyle}">
      <span class="checklist-text" style="${txtStyle}">${text}</span>${trailing}
    </div>`
  })
  if (isEdit) {
    html += `<div class="checklist-add">
      <input type="text" id="newChecklistInput" class="checklist-add-input" placeholder="새 항목 추가" onkeydown="if(event.key==='Enter'){event.preventDefault();addChecklistItem()}">
      <button type="button" class="checklist-add-btn" onclick="addChecklistItem()">추가</button>
    </div>`
  }
  html += '</div>'
  return html
}

function toggleChecklistItem(id) {
  if (!_currentWorkItem) return
  const c = (_currentWorkItem.checklist || []).find(x => x.id === id)
  if (!c) return
  c.done = !c.done
  if (c.done) {
    c.checkedBy = (typeof _currentUserName !== 'undefined' && _currentUserName) || ''
    c.checkedByPosition = (typeof _currentUserPosition !== 'undefined' && _currentUserPosition) || ''
  } else {
    c.checkedBy = ''
    c.checkedByPosition = ''
  }
  const idx = State.workItems.findIndex(w => w.no === _currentWorkItem.no)
  if (idx >= 0) {
    State.workItems[idx].checklist = _currentWorkItem.checklist
    _workItems = State.workItems
    saveWorkItems()
  }
  const section = document.querySelector('#wkDetailBody .checklist-section')
  if (section) section.outerHTML = buildChecklistHtml(_currentWorkItem.checklist, false)
}

function addChecklistItem() {
  const input = document.getElementById('newChecklistInput')
  if (!input || !input.value.trim()) return
  if (!_currentWorkItem) _currentWorkItem = { checklist: [] }
  _currentWorkItem.checklist = _currentWorkItem.checklist || []
  _currentWorkItem.checklist.push({ id: 'c' + Date.now() + Math.random().toString(36).slice(2,6), text: input.value.trim(), done: false })
  input.value = ''
  // Re-render checklist section inline
  const host = document.querySelector('#wkRegChecklistArea, #wkDetailBody .checklist-section')?.parentElement
  const container = document.getElementById('wkRegChecklistArea')
  if (container) container.innerHTML = buildChecklistHtml(_currentWorkItem.checklist, true)
}

function _chkRow(id, isEditForm) {
  const root = isEditForm ? '#wkRegChecklistArea' : '#wkDetailBody'
  return document.querySelector(`${root} .checklist-item[data-chk-id="${id}"]`)
}

function editChecklistItem(id, isEditForm) {
  const row = _chkRow(id, isEditForm)
  if (!row) return
  row.classList.add('checklist-editing')
  row.querySelector('.checklist-text').style.display = 'none'
  row.querySelector('.checklist-edit').style.display = 'none'
  row.querySelector('.checklist-del').style.display = 'none'
  const inp = row.querySelector('.checklist-text-input')
  inp.style.display = 'block'
  row.querySelector('.checklist-save').style.display = 'inline-block'
  row.querySelector('.checklist-cancel').style.display = 'inline-block'
  inp.focus(); inp.select()
}

function saveChecklistItem(id, isEditForm) {
  const row = _chkRow(id, isEditForm)
  if (!row) return
  const newText = row.querySelector('.checklist-text-input').value.trim()
  if (!newText) { showToast('내용을 입력하세요', 'warning'); return }
  if (_currentWorkItem) {
    const c = (_currentWorkItem.checklist || []).find(x => x.id === id)
    if (c) c.text = newText
  }
  if (!isEditForm && _currentWorkItem) {
    const idx = State.workItems.findIndex(w => w.no === _currentWorkItem.no)
    if (idx >= 0) { State.workItems[idx].checklist = _currentWorkItem.checklist; _workItems = State.workItems; saveWorkItems() }
  }
  row.querySelector('.checklist-text').textContent = newText
  cancelChecklistEdit(id, isEditForm)
  if (!isEditForm) showToast('수정 완료', 'success')
}

function cancelChecklistEdit(id, isEditForm) {
  const row = _chkRow(id, isEditForm)
  if (!row) return
  const c = (_currentWorkItem?.checklist || []).find(x => x.id === id)
  row.classList.remove('checklist-editing')
  row.querySelector('.checklist-text').style.display = ''
  row.querySelector('.checklist-edit').style.display = 'inline-block'
  row.querySelector('.checklist-del').style.display = 'inline-block'
  const inp = row.querySelector('.checklist-text-input')
  inp.style.display = 'none'
  if (c) inp.value = c.text || ''
  row.querySelector('.checklist-save').style.display = 'none'
  row.querySelector('.checklist-cancel').style.display = 'none'
}

async function deleteChecklistItemView(id) {
  if (!_currentWorkItem) return
  const ok = await korConfirm('이 항목을 삭제하시겠습니까?', '삭제', '취소')
  if (!ok) return
  _currentWorkItem.checklist = (_currentWorkItem.checklist || []).filter(c => c.id !== id)
  const idx = State.workItems.findIndex(w => w.no === _currentWorkItem.no)
  if (idx >= 0) { State.workItems[idx].checklist = _currentWorkItem.checklist; _workItems = State.workItems; saveWorkItems() }
  const section = document.querySelector('#wkDetailBody .checklist-section')
  if (section) section.outerHTML = buildChecklistHtml(_currentWorkItem.checklist, false)
}

function removeChecklistItem(id) {
  if (!_currentWorkItem) return
  _currentWorkItem.checklist = (_currentWorkItem.checklist || []).filter(c => c.id !== id)
  const container = document.getElementById('wkRegChecklistArea')
  if (container) container.innerHTML = buildChecklistHtml(_currentWorkItem.checklist, true)
}

function cancelWorkEdit() {
  const noField = document.getElementById('wkRegNo')
  const editingNo = noField && noField.value ? parseInt(noField.value) : null
  closeWorkRegisterModal(true)
  if (editingNo) openWorkDetailModal(editingNo)
}

if (typeof window !== 'undefined') {
  window.cancelWorkEdit = cancelWorkEdit
  window.buildChecklistHtml = buildChecklistHtml
  window.toggleChecklistItem = toggleChecklistItem
  window.addChecklistItem = addChecklistItem
  window.removeChecklistItem = removeChecklistItem
  window.editChecklistItem = editChecklistItem
  window.saveChecklistItem = saveChecklistItem
  window.cancelChecklistEdit = cancelChecklistEdit
  window.deleteChecklistItemView = deleteChecklistItemView
}

window.toggleVehicleBtn = function(btnId) {
  const btn = document.getElementById(btnId)
  if (!btn) return
  const isActive = btn.dataset.active === 'true'
  btn.dataset.active = isActive ? 'false' : 'true'
  btn.classList.toggle('vehicle-active', !isActive)
  const label = document.getElementById(btnId + 'Label')
  if (label) label.textContent = isActive ? '미사용' : '사용'
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

function _wkSyncWatchBtn(no) {
  const btn = document.getElementById('wkWatchBtn')
  if (!btn) return
  const on = typeof isWatching === 'function' && isWatching('work', no)
  btn.textContent = on ? '💛' : '🤍'
  btn.classList.toggle('active', on)
}
window._wkSyncWatchBtn = _wkSyncWatchBtn

function editWorkFromDetail(no) {
  const w = State.workItems.find(x => x.no === no)
  if (!w) return
  if (!canEditWork(w)) {
    showToast('수정 권한이 없습니다. (작성자 또는 관리자 이상)', 'warn')
    return
  }
  const info = (typeof getEditLockInfo === 'function') ? getEditLockInfo('work', no) : null
  if (info) {
    showToast(`${info.userName || '다른 사용자'}님이 편집 중입니다`, 'warn')
    return
  }
  if (typeof acquireEditLock === 'function') acquireEditLock('work', no)
  closeWorkDetailModal()
  const modal = document.getElementById('workRegisterModal')
  if (!modal) return

  document.getElementById('wkRegNo').value       = w.no
  document.getElementById('wkRegCategory').value  = w.category || ''
  document.getElementById('wkRegTitle').value     = w.title || ''
  document.getElementById('wkRegStart').value     = w.startDate || ''
  document.getElementById('wkRegEnd').value       = w.endDate || ''
  const wkST = document.getElementById('wkRegStartTime'); if (wkST) wkST.value = w.startTime || ''
  const wkET = document.getElementById('wkRegEndTime');   if (wkET) wkET.value = w.endTime || ''
  document.getElementById('wkRegMemo').value      = w.memo || ''
  const vBtnE = document.getElementById('wkRegVehicle')
  if (vBtnE) {
    const isActive = w.useVehicle === true
    vBtnE.dataset.active = isActive ? 'true' : 'false'
    vBtnE.classList.toggle('vehicle-active', isActive)
    const vLblE = document.getElementById('wkRegVehicleLabel')
    if (vLblE) vLblE.textContent = isActive ? '사용' : '미사용'
  }

  modal.querySelector('.rmodal-title').textContent = '업무일정 수정'
  populateAllSelects()
  document.getElementById('wkRegCategory').value = w.category || ''
  clearWorkMentionArea()
  if (typeof loadAllUsers === 'function') loadAllUsers()
  ;(w.mentions || []).forEach(m => {
    if (m.type === 'user') addMention('work', 'user', m.uid, m.name, m.position || '')
    else addMention('work', 'dept', '', m.dept, '')
  })
  _currentWorkItem = { no: w.no, checklist: (w.checklist || []).map(c => ({ ...c })) }
  const chkArea = document.getElementById('wkRegChecklistArea')
  if (chkArea) chkArea.innerHTML = buildChecklistHtml(_currentWorkItem.checklist, true)
  modal.showModal()
  centerModal(modal)
}

function clearWorkMentionArea() {
  const area = document.getElementById('workMentionArea')
  if (!area) return
  area.querySelectorAll('.mention-tag, .ps-mention-tag').forEach(t => t.remove())
  const input = document.getElementById('workMentionInput')
  if (input) input.value = ''
  const dd = document.getElementById('workMentionDropdown')
  if (dd) dd.style.display = 'none'
}

function closeWorkDetailModal() {
  document.getElementById('workDetailModal')?.close()
}

async function deleteWork(no) {
  const target = State.workItems.find(w => w.no === no)
  if (!target) return
  if (!canEditWork(target)) {
    showToast('삭제 권한이 없습니다. (작성자 또는 관리자 이상)', 'warn')
    return
  }
  if (!await korConfirm('이 업무일정을 삭제하시겠습니까?')) return
  State.workItems = State.workItems.filter(w => w.no !== no)
  _workItems = State.workItems
  saveWorkItems()
  closeWorkDetailModal()
  renderWorkCalendar()
  showToast('업무일정이 삭제되었습니다.', 'success')
  logActivity('delete', '업무일정', `업무삭제: no=${no}`)
}

function checkWorkMentionAlerts() {
  if (typeof firebase === 'undefined' || !firebase.auth().currentUser) return
  const uid = firebase.auth().currentUser.uid
  const dept = _currentUserDept || ''
  const today = fmtDate(new Date())
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = fmtDate(tomorrow)
  ;(State.workItems || []).forEach(w => {
    if (!w.mentions || !w.mentions.length) return
    const isMentioned = w.mentions.some(m =>
      (m.type === 'user' && m.uid === uid) ||
      (m.type === 'dept' && m.dept === dept)
    )
    if (!isMentioned) return
    if (w.startDate === today) {
      addNotification('work_start', '업무일정 시작', '오늘 시작: ' + (w.title || '업무일정'), '#work:' + w.no)
    } else if (w.startDate === tomorrowStr) {
      addNotification('work_upcoming', '업무일정 내일 시작', '내일 시작: ' + (w.title || '업무일정'), '#work:' + w.no)
    }
  })
}

// =============================================
// ===== 개인일정 — Inner Tab + Firestore =====
// =============================================

function switchWorkTab(tab) {
  document.querySelectorAll('.work-inner-tab').forEach(t => t.classList.remove('active'))
  document.querySelector(`.work-inner-tab[data-tab="${tab}"]`)?.classList.add('active')
  document.getElementById('workCalendarArea').style.display = tab === 'work' ? '' : 'none'
  document.getElementById('personalCalendarArea').style.display = tab === 'personal' ? '' : 'none'
  const kanban = document.getElementById('kanbanArea')
  if (kanban) kanban.style.display = tab === 'kanban' ? '' : 'none'
  if (tab === 'personal') {
    loadAllUsers().then(() => loadPersonalSchedules().then(() => renderPersonalCalendar()))
  }
  if (tab === 'kanban') {
    renderKanbanBoard()
  }
}
window.switchWorkTab = switchWorkTab

/* ===== Feature 6: Kanban Board ===== */
function _deriveKanbanStatus(w) {
  if (w.kanbanStatus) return w.kanbanStatus
  const today = new Date().toISOString().slice(0,10)
  if (w.endDate && w.endDate < today) return '완료'
  if (w.startDate && w.startDate > today) return '예정'
  return '진행중'
}

function renderKanbanBoard() {
  const area = document.getElementById('kanbanArea')
  if (!area) return
  const cols = ['예정','진행중','완료']
  const items = State.workItems || []
  const grouped = { '예정': [], '진행중': [], '완료': [] }
  items.forEach(w => {
    const s = _deriveKanbanStatus(w)
    if (!grouped[s]) grouped[s] = []
    grouped[s].push(w)
  })
  let html = '<div class="kanban-board" ondragover="event.preventDefault()">'
  cols.forEach(col => {
    html += `<div class="kanban-col" ondragover="kanbanDragOver(event)" ondrop="kanbanDrop(event,'${col}')">`
    html += `<div class="kanban-col-title">${col} <span style="color:#999;font-size:11px">(${grouped[col].length})</span></div>`
    grouped[col].forEach(w => {
      const cat = esc(w.category || '')
      const title = esc(w.title || '')
      const date = esc((w.startDate || '') + (w.endDate && w.endDate !== w.startDate ? ' ~ ' + w.endDate : ''))
      html += `<div class="kanban-card" draggable="true" ondragstart="kanbanDragStart(event,${w.no})" ondragend="this.classList.remove('dragging')" onclick="openWorkDetailModal(${w.no})">
        <div style="font-size:11px;color:#666;margin-bottom:2px">${cat}</div>
        <div style="font-weight:600;font-size:13px">${title}</div>
        <div style="font-size:10px;color:#999;margin-top:4px">${date}</div>
      </div>`
    })
    html += '</div>'
  })
  html += '</div>'
  area.innerHTML = html
}
window.renderKanbanBoard = renderKanbanBoard

function kanbanDragStart(e, no) {
  try {
    e.dataTransfer.setData('text/plain', String(no))
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('dragging')
  } catch(err) {}
}
window.kanbanDragStart = kanbanDragStart

function kanbanDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
window.kanbanDragOver = kanbanDragOver

function kanbanDrop(e, status) {
  e.preventDefault()
  const no = Number(e.dataTransfer.getData('text/plain'))
  if (!no) return
  const w = State.workItems.find(x => x.no === no)
  if (!w) return
  w.kanbanStatus = status
  if (typeof saveWorkItems === 'function') saveWorkItems()
  renderKanbanBoard()
  if (typeof showToast === 'function') showToast(`"${w.title}" → ${status}`, 'success')
}
window.kanbanDrop = kanbanDrop

/* ===== Feature 7: Weekly Report ===== */
function _startOfWeekMon(date) {
  const d = new Date(date)
  d.setHours(0,0,0,0)
  const day = d.getDay() // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  return d
}

function generateWeeklyReport() {
  const body = document.getElementById('weeklyReportBody')
  if (!body) return
  const now = new Date()
  const start = _startOfWeekMon(now)
  const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23,59,59,999)
  const nextStart = new Date(end); nextStart.setDate(nextStart.getDate() + 1); nextStart.setHours(0,0,0,0)
  const nextEnd = new Date(nextStart); nextEnd.setDate(nextEnd.getDate() + 6); nextEnd.setHours(23,59,59,999)
  const items = State.workItems || []
  const inRange = (d, s, e) => { if (!d) return false; const x = new Date(d); return x >= s && x <= e }
  const completed = items.filter(w => _deriveKanbanStatus(w) === '완료' && (inRange(w.endDate, start, end) || inRange(w.startDate, start, end)))
  const inProgress = items.filter(w => _deriveKanbanStatus(w) === '진행중')
  const upcoming = items.filter(w => inRange(w.startDate, nextStart, nextEnd))
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`
  const rowHtml = w => `<div class="weekly-report-item"><strong>${esc(w.title||'')}</strong> <span style="color:#888;font-size:11px">· ${esc(w.category||'')} · ${esc(w.startDate||'')}${w.endDate && w.endDate !== w.startDate ? ' ~ ' + esc(w.endDate) : ''}</span></div>`
  body.innerHTML = `
    <div style="font-size:12px;color:#666;margin-bottom:12px">📆 ${fmt(start)} ~ ${fmt(end)}</div>
    <div class="weekly-report-section"><h4>✅ 이번 주 완료 (${completed.length})</h4>${completed.length ? completed.map(rowHtml).join('') : '<div style="color:#999;font-size:12px">완료 항목 없음</div>'}</div>
    <div class="weekly-report-section"><h4>⏳ 진행중 (${inProgress.length})</h4>${inProgress.length ? inProgress.map(rowHtml).join('') : '<div style="color:#999;font-size:12px">진행중 항목 없음</div>'}</div>
    <div class="weekly-report-section"><h4>📅 다음 주 예정 (${upcoming.length})</h4>${upcoming.length ? upcoming.map(rowHtml).join('') : '<div style="color:#999;font-size:12px">예정 항목 없음</div>'}</div>
  `
}
window.generateWeeklyReport = generateWeeklyReport

function openWeeklyReportModal() {
  const modal = document.getElementById('weeklyReportModal')
  if (!modal) return
  generateWeeklyReport()
  if (typeof centerModal === 'function') centerModal(modal)
  modal.showModal()
}
window.openWeeklyReportModal = openWeeklyReportModal

function closeWeeklyReportModal() {
  const modal = document.getElementById('weeklyReportModal')
  if (modal) modal.close()
}
window.closeWeeklyReportModal = closeWeeklyReportModal

async function loadPersonalSchedules() {
  try {
    const snapshot = await firebase.firestore().collection('personalSchedules').get()
    _personalSchedules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    if (typeof checkPersonalScheduleAlerts === 'function') checkPersonalScheduleAlerts()
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

  const MAX_ROWS = 9999
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
      if (!bar) continue
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
    const startLabel = ps.startDate + (ps.startTime ? ' ' + ps.startTime : '')
    const endLabel = ps.endDate + (ps.endTime ? ' ' + ps.endTime : '')
    html += `<div class="srm-timeline">
      <span class="srm-tl-dot"></span>
      <span class="srm-tl-date">${startLabel}</span>
      <div class="srm-tl-line"><div class="srm-tl-fill" style="width:${progress}%"></div><span class="srm-tl-days">${days}일간</span></div>
      <span class="srm-tl-date">${endLabel}</span>
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
      <div class="srm-field"><label class="srm-field-label">시작시간</label>
      <input type="time" id="psStartTime" min="00:00" max="23:59" value="${ps.startTime || ''}"></div>
      <div class="srm-field"><label class="srm-field-label">종료일</label>
      <input type="date" id="psEndDate" value="${ps.endDate || ''}"></div>
      <div class="srm-field"><label class="srm-field-label">종료시간</label>
      <input type="time" id="psEndTime" min="00:00" max="23:59" value="${ps.endTime || ''}"></div>
    </div>

    <div class="srm-field"><label class="srm-field-label">카테고리</label>
    <select id="psCategory">${catOptions}</select></div>

    <div class="srm-field" style="position:relative"><label class="srm-field-label">참조 (@이름, @부서로 공유)</label>
    <div class="ps-mention-area" id="psMentionArea" style="display:flex;flex-wrap:wrap;gap:6px;padding:6px;border:0.5px solid #e8e6e0;border-radius:6px;min-height:36px;background:#fff">
      ${mentionTags}
      <input class="ps-mention-input" id="psMentionInput" placeholder="@입력..." oninput="searchMention(this.value, 'ps')" onkeydown="mentionKeyDown(event, 'ps')" style="display:inline-block;flex:1;min-width:120px;border:none;outline:none;font-size:13px;padding:2px 4px;background:transparent">
    </div>
    <div class="ps-mention-dropdown" id="psMentionDropdown" style="display:none"></div>
    <div style="font-size:11px;color:#b4b2a9;margin-top:6px">작성자 + 참조자 + 시스템 관리자만 볼 수 있습니다</div>
    </div>

    <div class="srm-field"><label class="srm-field-label">메모</label>
    <textarea id="psMemo" rows="3" placeholder="메모">${esc(ps.memo || '')}</textarea></div>`
}

/* ---------- @Mention (공통: work + ps) ---------- */
let _mentionHighlight = -1
let _mentionResults = []

function searchMention(query, prefix) {
  const dropdown = document.getElementById(prefix + 'MentionDropdown')
  if (!dropdown) return
  _mentionHighlight = -1
  const q = (query || '').replace(/^@/, '').toLowerCase().trim()
  if (q.length < 1) { dropdown.style.display = 'none'; _mentionResults = []; return }

  let results = []
  _allUsers.forEach(u => {
    if (u.status && u.status !== 'approved') return
    const name = formatUserName(u.name, u.position)
    const dept = u.dept || u.department || ''
    if (name.toLowerCase().includes(q) || dept.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q)) {
      results.push({ type: 'user', uid: u.uid, name: u.name, position: u.position || '', dept, display: name + (dept ? ' \u2014 ' + dept : '') })
    }
  })
  const deptSet = new Set()
  if (typeof _depts !== 'undefined' && Array.isArray(_depts)) _depts.forEach(d => d && deptSet.add(d))
  _allUsers.forEach(u => { const d = u.dept || u.department; if (d) deptSet.add(d) })
  const depts = [...deptSet].sort()
  depts.forEach(dept => {
    if (dept.toLowerCase().includes(q)) {
      results.push({ type: 'dept', dept, display: dept + ' (부서 전체)' })
    }
  })

  _mentionResults = results
  if (!results.length) { dropdown.style.display = 'none'; return }
  dropdown.style.display = 'block'
  renderMentionDropdown(prefix)
}

function renderMentionDropdown(prefix) {
  const dropdown = document.getElementById(prefix + 'MentionDropdown')
  if (!dropdown) return
  dropdown.innerHTML = _mentionResults.slice(0, 8).map((r, i) => {
    const cls = i === _mentionHighlight ? 'mention-item mention-item-active' : 'mention-item'
    const icon = r.type === 'user' ? '@' : '#'
    const onclick = r.type === 'user'
      ? `addMention('${prefix}','user','${r.uid}','${esc(r.name)}','${esc(r.position)}')`
      : `addMention('${prefix}','dept','','${esc(r.dept)}','')`
    return `<div class="${cls}" onclick="${onclick}" data-idx="${i}"><span class="mention-icon">${icon}</span>${esc(r.display)}</div>`
  }).join('')
}

function mentionKeyDown(e, prefix) {
  const dropdown = document.getElementById(prefix + 'MentionDropdown')
  if (!dropdown || dropdown.style.display === 'none' || _mentionResults.length === 0) return
  const maxIdx = Math.min(_mentionResults.length, 8) - 1
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    _mentionHighlight = _mentionHighlight < maxIdx ? _mentionHighlight + 1 : 0
    renderMentionDropdown(prefix)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    _mentionHighlight = _mentionHighlight > 0 ? _mentionHighlight - 1 : maxIdx
    renderMentionDropdown(prefix)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const idx = _mentionHighlight >= 0 ? _mentionHighlight : 0
    if (idx <= maxIdx) {
      const r = _mentionResults[idx]
      if (r.type === 'user') addMention(prefix, 'user', r.uid, r.name, r.position)
      else addMention(prefix, 'dept', '', r.dept, '')
    }
  } else if (e.key === 'Escape') {
    dropdown.style.display = 'none'; _mentionResults = []; _mentionHighlight = -1
  }
}

function addMention(prefix, type, uid, name, position) {
  const area = document.getElementById(prefix + 'MentionArea')
  const input = document.getElementById(prefix + 'MentionInput')
  const dropdown = document.getElementById(prefix + 'MentionDropdown')
  if (!area || !input) return

  const existing = area.querySelectorAll('.mention-tag, .ps-mention-tag')
  for (const tag of existing) {
    if (type === 'user' && tag.dataset.uid === uid) return
    if (type === 'dept' && tag.dataset.dept === name) return
  }

  const tag = document.createElement('span')
  if (type === 'user') {
    tag.className = 'mention-tag mention-user'
    tag.dataset.type = 'user'
    tag.dataset.uid = uid
    tag.dataset.name = name
    tag.dataset.position = position
    tag.innerHTML = '@' + esc(formatUserName(name, position)) + ' <span class="mention-x" onclick="this.parentElement.remove()">&#10005;</span>'
  } else {
    tag.className = 'mention-tag mention-dept'
    tag.dataset.type = 'dept'
    tag.dataset.dept = name
    tag.innerHTML = '@' + esc(name) + ' <span class="mention-x" onclick="this.parentElement.remove()">&#10005;</span>'
  }
  area.insertBefore(tag, input)
  input.value = ''
  if (dropdown) dropdown.style.display = 'none'
  _mentionResults = []; _mentionHighlight = -1
}

function collectMentions(prefix) {
  prefix = prefix || 'ps'
  const tags = document.querySelectorAll(`#${prefix}MentionArea .mention-tag, #${prefix}MentionArea .ps-mention-tag`)
  return Array.from(tags).map(tag => {
    if (tag.dataset.type === 'user') return { type: 'user', uid: tag.dataset.uid, name: tag.dataset.name, position: tag.dataset.position || '' }
    return { type: 'dept', dept: tag.dataset.dept }
  })
}

/* 호환 alias */
function searchPsMention(q) { return searchMention(q, 'ps') }
function addPsMention(type, uid, name, position) { return addMention('ps', type, uid, name, position) }

/* ---------- Save / Delete ---------- */
async function savePersonalSchedule() {
  const title = document.getElementById('psTitle').value.trim()
  if (!title) { showToast('제목을 입력해주세요.', 'warning'); return }
  const startDate = document.getElementById('psStartDate').value
  if (!startDate) { showToast('시작일을 입력해주세요.', 'warning'); return }
  const endDate = document.getElementById('psEndDate').value || startDate
  const startTime = document.getElementById('psStartTime')?.value || ''
  const endTime = document.getElementById('psEndTime')?.value || ''

  const user = firebase.auth().currentUser
  const mentions = collectMentions('ps')
  const data = {
    title, startDate, endDate, startTime, endTime,
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
      const _psDocRef = await firebase.firestore().collection('personalSchedules').add(data)
      showToast('일정이 등록되었습니다.', 'success')
      logActivity('create', '개인일정', `일정등록: ${title}`)
      addNotification('ps_created', '📅 개인일정 등록', title + ' (' + startDate + (endDate !== startDate ? ' ~ ' + endDate : '') + ')', '#work:personal:' + _psDocRef.id)
      mentions.forEach(m => {
        if (m.type === 'user' && m.uid !== user.uid) {
          addNotification('personal_schedule', '일정 참조', formatUserNameHonorific(_currentUserName, _currentUserPosition) + '이 일정을 공유했습니다: ' + title, '#work:personal:' + _psDocRef.id)
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
