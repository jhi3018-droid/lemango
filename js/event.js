// =============================================
// ===== 행사일정 탭 — 월간 캘린더 =====
// =============================================

let _evYear  = new Date().getFullYear()
let _evMonth = new Date().getMonth() // 0-based

// 행사별 색상 팔레트 (10색 — 진한 배경 + 흰 글자, 서로 보색 대비)
const EV_COLORS = [
  { bar: '#1565c0', text: '#ffffff' },  // 진한 파랑
  { bar: '#c62828', text: '#ffffff' },  // 진한 빨강
  { bar: '#2e7d32', text: '#ffffff' },  // 진한 초록
  { bar: '#e65100', text: '#ffffff' },  // 진한 오렌지
  { bar: '#6a1b9a', text: '#ffffff' },  // 진한 보라
  { bar: '#00838f', text: '#ffffff' },  // 진한 청록
  { bar: '#ad1457', text: '#ffffff' },  // 진한 핑크
  { bar: '#283593', text: '#ffffff' },  // 진한 남색
  { bar: '#4e342e', text: '#ffffff' },  // 진한 갈색
  { bar: '#37474f', text: '#ffffff' },  // 진한 그레이블루
]

/* ---------- 네비게이션 ---------- */
function evPrevMonth() {
  _evMonth--
  if (_evMonth < 0) { _evMonth = 11; _evYear-- }
  renderEventCalendar()
}
function evNextMonth() {
  _evMonth++
  if (_evMonth > 11) { _evMonth = 0; _evYear++ }
  renderEventCalendar()
}
function evToday() {
  _evYear  = new Date().getFullYear()
  _evMonth = new Date().getMonth()
  renderEventCalendar()
}

/* ---------- 캘린더 렌더 ---------- */
function renderEventCalendar() {
  const container = document.getElementById('evCalendar')
  const title     = document.getElementById('evMonthTitle')
  if (!container) return

  title.textContent = `${_evYear}년 ${_evMonth + 1}월`
  title.classList.add('cal-month-clickable')
  title.onclick = () => openMonthPicker(title, _evYear, _evMonth, (y, m) => {
    _evYear = y; _evMonth = m; renderEventCalendar()
  })

  const firstDay   = new Date(_evYear, _evMonth, 1)
  const startDow   = firstDay.getDay()

  // 캘린더 그리드 (6주 고정)
  const totalCells = 42
  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - startDow + 1
    const d = new Date(_evYear, _evMonth, dayOffset)
    cells.push({
      date: fmtDate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === _evMonth,
      isToday: fmtDate(d) === fmtDate(new Date()),
      dow: i % 7
    })
  }

  // 이벤트 바 배치 (최대 10줄)
  const MAX_ROWS = 10
  const barRows  = placeEventBars(cells[0].date, cells[cells.length - 1].date, MAX_ROWS)

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
    // 이 셀에 실제 행사가 몇 개 있는지 세기
    const cellBars = barRows[cell.date] || {}
    let barCount = 0
    for (let r = 0; r < MAX_ROWS; r++) { if (cellBars[r]) barCount++ }
    const hasEvents = barCount > 0

    const holiday = getHolidayName(cell.date)

    const classes = ['evcal-cell']
    if (!cell.inMonth) classes.push('evcal-other')
    if (cell.isToday)  classes.push('evcal-today')
    if (cell.dow === 0) classes.push('evcal-sun')
    if (cell.dow === 6) classes.push('evcal-sat')
    if (holiday) classes.push('dcal-holiday')
    if (isPast) classes.push('evcal-past')
    if (!hasEvents) classes.push('evcal-empty')

    html += `<div class="${classes.join(' ')}">`
    html += `<div class="evcal-day">${cell.day}${holiday ? `<span class="dcal-hol-name">${esc(holiday)}</span>` : ''}</div>`
    html += '<div class="evcal-bars">'

    for (let row = 0; row < MAX_ROWS; row++) {
      const bar = cellBars[row]
      if (!bar) {
        // 지난 날짜에 빈 줄은 생략
        if (!isPast) html += '<div class="evcal-bar evcal-bar-empty"></div>'
        continue
      }

      const ev    = bar.event
      const color = EV_COLORS[ev.no % EV_COLORS.length]
      const tooltip = `${esc(ev.channel || '')} ${esc(ev.name)} (${ev.startDate} ~ ${ev.endDate})${ev.discount ? '\n할인 ' + ev.discount + '%' : ''}${ev.support ? '\n당사지원 ' + ev.support + '%' : ''}`

      if (isPast) {
        // 지난 날짜: 색상 띠만 (라벨 없음, 얇은 바)
        html += `<div class="evcal-bar evcal-bar-mini"
          style="background:${color.bar};"
          title="${tooltip}"
          onclick="editEvent(${ev.no})"
        ></div>`
      } else {
        const label = esc(`${ev.channel || ''} ${ev.name}`.trim())
        html += `<div class="evcal-bar evcal-bar-fill"
          style="background:${color.bar}; color:${color.text};"
          title="${tooltip}"
          onclick="editEvent(${ev.no})"
        >${label}</div>`
      }
    }

    // +N more
    const moreCount = (cellBars._overflow) || 0
    if (moreCount > 0) {
      html += `<div class="evcal-more">+${moreCount}건</div>`
    }

    html += '</div></div>'
  })

  html += '</div>'
  container.innerHTML = html
}

/* ---------- 이벤트 바 배치 알고리즘 ---------- */
function placeEventBars(gridStart, gridEnd, maxRows) {
  const result = {}

  const visible = _events.filter(ev =>
    ev.startDate <= gridEnd && ev.endDate >= gridStart
  ).sort((a, b) => a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0)

  const rowEnd = []

  visible.forEach(ev => {
    const vStart = ev.startDate < gridStart ? gridStart : ev.startDate
    const vEnd   = ev.endDate > gridEnd ? gridEnd : ev.endDate

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

    // 모든 날짜에 동일하게 바 배치 (1셀 = 1바, span 사용 안함)
    dates.forEach(d => {
      if (!result[d]) result[d] = {}
      result[d][assignedRow] = {
        type: 'fill',
        event: ev
      }
    })
  })

  return result
}

/* ---------- 날짜 유틸 ---------- */
function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function getDateRange(start, end) {
  const result = []
  const d = new Date(start)
  const e = new Date(end)
  while (d <= e) {
    result.push(fmtDate(d))
    d.setDate(d.getDate() + 1)
  }
  return result
}

/* ---------- 상태 헬퍼 ---------- */
function getEventStatus(ev) {
  const today = fmtDate(new Date())
  if (today < ev.startDate) return '예정'
  if (today > ev.endDate)   return '종료'
  return '진행중'
}

/* ---------- 호환 ---------- */
function populateEventChannels() {}
function searchEvent() { renderEventCalendar() }
function resetEvent()  { renderEventCalendar() }

/* ---------- 등록 모달 ---------- */
function openEventRegisterModal() {
  const modal = document.getElementById('eventRegisterModal')
  if (!modal) return
  document.getElementById('evRegForm').reset()
  document.getElementById('evRegNo').value = ''
  modal.querySelector('.rmodal-title').textContent = '행사 등록'
  // 신규 등록 시 댓글 숨김
  const commentArea = document.getElementById('evCommentArea')
  if (commentArea) { commentArea.style.display = 'none'; commentArea.innerHTML = '' }
  modal.showModal()
  centerModal(modal)
}

function closeEventRegisterModal() {
  document.getElementById('eventRegisterModal')?.close()
}

function submitEvent(e) {
  e.preventDefault()
  const noField = document.getElementById('evRegNo')
  const isEdit  = noField.value !== ''
  const no      = isEdit ? Number(noField.value) : (_events.length ? Math.max(..._events.map(ev => ev.no)) + 1 : 1)

  const ev = {
    no,
    name:      document.getElementById('evRegName').value.trim(),
    channel:   document.getElementById('evRegChannel').value.trim(),
    startDate: document.getElementById('evRegStart').value,
    endDate:   document.getElementById('evRegEnd').value,
    discount:  document.getElementById('evRegDiscount').value || '',
    support:   document.getElementById('evRegSupport').value || '',
    memo:      document.getElementById('evRegMemo').value.trim()
  }

  if (isEdit) {
    const idx = _events.findIndex(x => x.no === no)
    if (idx >= 0) _events[idx] = ev
  } else {
    _events.push(ev)
  }

  saveEvents()
  closeEventRegisterModal()
  renderEventCalendar()
  showToast(isEdit ? '행사가 수정되었습니다.' : '행사가 등록되었습니다.', 'success')
  logActivity(isEdit ? 'update' : 'create', '행사일정', `${isEdit ? '행사수정' : '행사등록'}: ${ev.name}`)
}

/* ---------- 수정 ---------- */
function editEvent(no) {
  const ev = _events.find(x => x.no === no)
  if (!ev) return
  document.getElementById('evRegNo').value       = ev.no
  document.getElementById('evRegName').value      = ev.name || ''
  document.getElementById('evRegChannel').value   = ev.channel || ''
  document.getElementById('evRegStart').value     = ev.startDate || ''
  document.getElementById('evRegEnd').value       = ev.endDate || ''
  document.getElementById('evRegDiscount').value  = ev.discount || ''
  document.getElementById('evRegSupport').value   = ev.support || ''
  document.getElementById('evRegMemo').value      = ev.memo || ''

  const modal = document.getElementById('eventRegisterModal')
  modal.querySelector('.rmodal-title').textContent = '행사 수정'
  // 댓글 영역 표시
  const commentArea = document.getElementById('evCommentArea')
  if (commentArea) {
    commentArea.style.display = ''
    commentArea.innerHTML = buildCommentSection('event', ev.no)
  }
  modal.showModal()
  centerModal(modal)
  loadComments('event', ev.no)
}

/* ---------- 삭제 ---------- */
async function deleteEvent(no) {
  const ok = await korConfirm('이 행사를 삭제하시겠습니까?')
  if (!ok) return
  _events = _events.filter(x => x.no !== no)
  saveEvents()
  renderEventCalendar()
  showToast('행사가 삭제되었습니다.', 'success')
  logActivity('delete', '행사일정', `행사삭제: no=${no}`)
}

/* ---------- 초기 렌더 ---------- */
function renderEventTable() {
  renderEventCalendar()
}

/* ---------- HTML 이스케이프 ---------- */
function esc(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}
