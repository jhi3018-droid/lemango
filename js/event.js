// =============================================
// ===== 행사일정 탭 — 월간 캘린더 =====
// =============================================

let _evYear  = new Date().getFullYear()
let _evMonth = new Date().getMonth() // 0-based
let _editingEventNo = null

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
          onclick="openEventDetailModal(${ev.no})"
        ></div>`
      } else {
        const label = esc(`${ev.channel || ''} ${ev.name}`.trim())
        html += `<div class="evcal-bar evcal-bar-fill"
          style="background:${color.bar}; color:${color.text};"
          title="${tooltip}"
          onclick="openEventDetailModal(${ev.no})"
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

/* ================================================================
   행사 상세 모달 — 보기/수정 모드 분리
   ================================================================ */

function _evUpdateHeaderBtns(mode) {
  // mode: 'view' | 'edit' | 'new'
  const modal = document.getElementById('eventRegisterModal')
  modal.querySelectorAll('.ev-view-btn').forEach(b => b.style.display = mode === 'view' ? '' : 'none')
  modal.querySelectorAll('.ev-edit-btn').forEach(b => b.style.display = mode === 'edit' ? '' : 'none')
  modal.querySelectorAll('.ev-new-btn').forEach(b => b.style.display = mode === 'new' ? '' : 'none')
}

/* ---------- 보기 모드로 열기 (캘린더 바 클릭) ---------- */
function openEventDetailModal(no) {
  const ev = _events.find(e => e.no === no)
  if (!ev) return
  _editingEventNo = ev.no

  const modal = document.getElementById('eventRegisterModal')
  modal.querySelector('.rmodal-title').textContent = '행사일정'
  modal.classList.remove('edit-mode')
  _evUpdateHeaderBtns('view')
  buildEventDetailContent(ev)
  modal.showModal()
  centerModal(modal)
  loadComments('event', ev.no)
}

/* ---------- 신규 등록 (빈 폼, 바로 편집 상태) ---------- */
function openEventRegisterModal(dateStr) {
  _editingEventNo = null
  const modal = document.getElementById('eventRegisterModal')
  modal.querySelector('.rmodal-title').textContent = '행사 등록'
  modal.classList.add('edit-mode')
  _evUpdateHeaderBtns('new')
  buildEventNewForm(dateStr)
  modal.showModal()
  centerModal(modal)
}

/* ---------- 보기 모드 콘텐츠 생성 ---------- */
function buildEventDetailContent(ev) {
  const body = document.getElementById('eventModalBody')
  const status = getEventStatus(ev)
  const statusCls = { '예정': 'badge-warning', '진행중': 'badge-success', '종료': 'badge-muted' }

  let html = '<div class="ev-detail-fields">'

  // 행사명
  html += `<div class="dfield"><span class="dfield-label">행사명</span>
    <span class="dfield-value">${esc(ev.name)}</span>
    <input type="text" id="evName" value="${esc(ev.name)}"></div>`

  // 채널
  html += `<div class="dfield"><span class="dfield-label">채널</span>
    <span class="dfield-value">${esc(ev.channel || '-')}</span>
    <input type="text" id="evChannel" value="${esc(ev.channel || '')}"></div>`

  // 기간
  html += `<div class="dfield"><span class="dfield-label">기간</span>
    <span class="dfield-value">${ev.startDate} ~ ${ev.endDate} <span class="badge ${statusCls[status] || ''}" style="margin-left:6px">${status}</span></span>
    <div class="ev-date-pair"><input type="date" id="evStart" value="${ev.startDate}"><span>~</span><input type="date" id="evEnd" value="${ev.endDate}"></div></div>`

  // 할인율
  html += `<div class="dfield"><span class="dfield-label">할인율</span>
    <span class="dfield-value">${ev.discount ? ev.discount + '%' : '-'}</span>
    <div class="ev-pct-field"><input type="number" id="evDiscount" value="${ev.discount || ''}" min="0" max="100"><span>%</span></div></div>`

  // 당사지원
  html += `<div class="dfield"><span class="dfield-label">당사지원</span>
    <span class="dfield-value">${ev.support ? ev.support + '%' : '-'}</span>
    <div class="ev-pct-field"><input type="number" id="evSupport" value="${ev.support || ''}" min="0" max="100"><span>%</span></div></div>`

  // 메모
  html += `<div class="dfield"><span class="dfield-label">메모</span>
    <span class="dfield-value">${esc(ev.memo || '-')}</span>
    <textarea id="evMemo" rows="3">${esc(ev.memo || '')}</textarea></div>`

  html += '</div>'

  // 삭제 버튼
  html += `<div class="ev-detail-actions"><button class="btn btn-sm btn-danger" onclick="deleteEvent(${ev.no})">삭제</button></div>`

  // 댓글 섹션
  html += `<div class="ev-comment-area">${buildCommentSection('event', ev.no)}</div>`

  body.innerHTML = html
}

/* ---------- 신규 등록 폼 ---------- */
function buildEventNewForm(dateStr) {
  const body = document.getElementById('eventModalBody')
  const today = dateStr || new Date().toISOString().slice(0, 10)

  let html = '<div class="ev-detail-fields">'

  html += `<div class="dfield"><span class="dfield-label">행사명</span>
    <span class="dfield-value"></span>
    <input type="text" id="evName" value="" placeholder="행사명 입력" required></div>`

  html += `<div class="dfield"><span class="dfield-label">채널</span>
    <span class="dfield-value"></span>
    <input type="text" id="evChannel" value="" placeholder="예: 공홈, GS"></div>`

  html += `<div class="dfield"><span class="dfield-label">기간</span>
    <span class="dfield-value"></span>
    <div class="ev-date-pair"><input type="date" id="evStart" value="${today}" required><span>~</span><input type="date" id="evEnd" value="" required></div></div>`

  html += `<div class="dfield"><span class="dfield-label">할인율</span>
    <span class="dfield-value"></span>
    <div class="ev-pct-field"><input type="number" id="evDiscount" value="" min="0" max="100"><span>%</span></div></div>`

  html += `<div class="dfield"><span class="dfield-label">당사지원</span>
    <span class="dfield-value"></span>
    <div class="ev-pct-field"><input type="number" id="evSupport" value="" min="0" max="100"><span>%</span></div></div>`

  html += `<div class="dfield"><span class="dfield-label">메모</span>
    <span class="dfield-value"></span>
    <textarea id="evMemo" rows="3" placeholder="행사 메모"></textarea></div>`

  html += '</div>'
  body.innerHTML = html
}

/* ---------- 수정 모드 토글 ---------- */
function toggleEventEdit() {
  const modal = document.getElementById('eventRegisterModal')
  if (modal.classList.contains('edit-mode')) {
    // 취소 → 보기 모드 복원
    modal.classList.remove('edit-mode')
    _evUpdateHeaderBtns('view')
    const ev = _events.find(e => e.no === _editingEventNo)
    if (ev) buildEventDetailContent(ev)
    loadComments('event', _editingEventNo)
  } else {
    // 수정 모드 진입
    modal.classList.add('edit-mode')
    _evUpdateHeaderBtns('edit')
  }
}

/* ---------- 수정 모드 저장 ---------- */
function saveEventEdit() {
  const name = document.getElementById('evName')?.value.trim()
  const start = document.getElementById('evStart')?.value
  const end = document.getElementById('evEnd')?.value
  if (!name) { showToast('행사명을 입력해주세요.', 'warning'); return }
  if (!start || !end) { showToast('기간을 입력해주세요.', 'warning'); return }

  const ev = _events.find(e => e.no === _editingEventNo)
  if (!ev) return

  ev.name = name
  ev.channel = document.getElementById('evChannel')?.value.trim() || ''
  ev.startDate = start
  ev.endDate = end
  ev.discount = document.getElementById('evDiscount')?.value || ''
  ev.support = document.getElementById('evSupport')?.value || ''
  ev.memo = document.getElementById('evMemo')?.value.trim() || ''

  saveEvents()
  closeEventRegisterModal(true)
  renderEventCalendar()
  renderDashCalendar()
  showToast('행사가 수정되었습니다.', 'success')
  logActivity('update', '행사일정', `행사수정: ${ev.name}`)
}

/* ---------- 신규 등록 저장 ---------- */
function submitEventNew() {
  const name = document.getElementById('evName')?.value.trim()
  const start = document.getElementById('evStart')?.value
  const end = document.getElementById('evEnd')?.value
  if (!name) { showToast('행사명을 입력해주세요.', 'warning'); return }
  if (!start || !end) { showToast('기간을 입력해주세요.', 'warning'); return }

  const no = _events.length ? Math.max(..._events.map(ev => ev.no)) + 1 : 1
  const ev = {
    no,
    name,
    channel: document.getElementById('evChannel')?.value.trim() || '',
    startDate: start,
    endDate: end,
    discount: document.getElementById('evDiscount')?.value || '',
    support: document.getElementById('evSupport')?.value || '',
    memo: document.getElementById('evMemo')?.value.trim() || ''
  }

  _events.push(ev)
  saveEvents()
  closeEventRegisterModal(true)
  renderEventCalendar()
  renderDashCalendar()
  showToast('행사가 등록되었습니다.', 'success')
  logActivity('create', '행사일정', `행사등록: ${ev.name}`)
}

/* ---------- 닫기 ---------- */
function closeEventRegisterModal(force) {
  const modal = document.getElementById('eventRegisterModal')
  if (!modal) return
  if (force) { modal.close(); return }
  safeCloseModal(modal,
    () => modal.classList.contains('edit-mode'),
    () => modal.close()
  )
}

/* ---------- 삭제 ---------- */
async function deleteEvent(no) {
  const ok = await korConfirm('이 행사를 삭제하시겠습니까?')
  if (!ok) return
  const ev = _events.find(x => x.no === no)
  _events = _events.filter(x => x.no !== no)
  saveEvents()
  closeEventRegisterModal(true)
  renderEventCalendar()
  renderDashCalendar()
  showToast('행사가 삭제되었습니다.', 'success')
  logActivity('delete', '행사일정', `행사삭제: ${ev?.name || 'no=' + no}`)
}

/* ---------- 레거시 호환 ---------- */
function editEvent(no) { openEventDetailModal(no) }
function submitEvent(e) { if (e) e.preventDefault() }

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
