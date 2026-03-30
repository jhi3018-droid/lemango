// =============================================
// ===== 업무일정 탭 — 월간 캘린더 =====
// =============================================

let _wkYear  = new Date().getFullYear()
let _wkMonth = new Date().getMonth() // 0-based
let _wkCatFilter = 'all'

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

function closeWorkRegisterModal() {
  document.getElementById('workRegisterModal')?.close()
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
    if (idx >= 0) State.workItems[idx] = item
  } else {
    State.workItems.push(item)
  }

  _workItems = State.workItems
  saveWorkItems()
  closeWorkRegisterModal()
  renderWorkCalendar()
  showToast(isEdit ? '업무일정이 수정되었습니다.' : '업무일정이 등록되었습니다.', 'success')
}

// ===== 상세 모달 =====
function openWorkDetailModal(no) {
  const w = State.workItems.find(x => x.no === no)
  if (!w) return
  const modal = document.getElementById('workDetailModal')
  if (!modal) return

  const body = document.getElementById('wkDetailBody')
  body.innerHTML = buildWorkDetailContent(w)
  modal.querySelector('.rmodal-title').textContent = '업무일정 상세'
  modal.showModal()
  centerModal(modal)
}

function buildWorkDetailContent(w) {
  return `
    <div class="wkd-view">
      <table class="ps-phase-table">
        <tbody>
          <tr><td class="ps-label">카테고리</td><td>${workCatBadge(w.category)}</td></tr>
          <tr><td class="ps-label">제목</td><td><strong>${w.title || '-'}</strong></td></tr>
          <tr><td class="ps-label">시작일</td><td>${w.startDate || '-'}</td></tr>
          <tr><td class="ps-label">종료일</td><td>${w.endDate || '-'}</td></tr>
          <tr><td class="ps-label">메모</td><td style="white-space:pre-wrap">${w.memo || '-'}</td></tr>
          <tr><td class="ps-label">등록일</td><td>${w.registeredAt ? w.registeredAt.slice(0, 10) : '-'}</td></tr>
        </tbody>
      </table>
      <div class="ps-actions" style="margin-top:16px">
        <button class="btn btn-primary btn-sm" onclick="editWorkFromDetail(${w.no})">수정</button>
        <button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)" onclick="deleteWork(${w.no})">삭제</button>
      </div>
    </div>`
}

function workCatBadge(cat) {
  const c = getWorkCatColor(cat)
  return `<span class="wk-cat-badge" style="background:${c.bg};color:${c.text}">${cat || '-'}</span>`
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
}
