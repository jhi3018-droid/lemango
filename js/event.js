// =============================================
// ===== 행사일정 탭 — 월간 캘린더 =====
// =============================================

let _evYear  = new Date().getFullYear()
let _evMonth = new Date().getMonth() // 0-based
let _editingEventNo = null
let _eventOpenedFromDash = false

// 행사별 색상 팔레트 (10색 — 진한 배경 + 흰 글자, 서로 보색 대비)
const EV_COLORS = [
  { bar: '#2563EB', text: '#ffffff' },
  { bar: '#DC2626', text: '#ffffff' },
  { bar: '#16A34A', text: '#ffffff' },
  { bar: '#EA580C', text: '#ffffff' },
  { bar: '#7C3AED', text: '#ffffff' },
  { bar: '#0891B2', text: '#ffffff' },
  { bar: '#DB2777', text: '#ffffff' },
  { bar: '#854D0E', text: '#ffffff' },
  { bar: '#475569', text: '#ffffff' },
  { bar: '#4F46E5', text: '#ffffff' },
]

/* ---------- 네비게이션 ---------- */
let _evCursor = new Date()
function evPrevMonth() {
  const mode = (State && State.eventCalView) || 'month'
  if (mode === 'week') { _evCursor = new Date(_evCursor); _evCursor.setDate(_evCursor.getDate() - 7) }
  else if (mode === 'day') { _evCursor = new Date(_evCursor); _evCursor.setDate(_evCursor.getDate() - 1) }
  else {
    _evMonth--
    if (_evMonth < 0) { _evMonth = 11; _evYear-- }
  }
  renderEventCalendar()
}
function evNextMonth() {
  const mode = (State && State.eventCalView) || 'month'
  if (mode === 'week') { _evCursor = new Date(_evCursor); _evCursor.setDate(_evCursor.getDate() + 7) }
  else if (mode === 'day') { _evCursor = new Date(_evCursor); _evCursor.setDate(_evCursor.getDate() + 1) }
  else {
    _evMonth++
    if (_evMonth > 11) { _evMonth = 0; _evYear++ }
  }
  renderEventCalendar()
}
function evToday() {
  _evYear  = new Date().getFullYear()
  _evMonth = new Date().getMonth()
  _evCursor = new Date()
  renderEventCalendar()
}

/* ---------- 캘린더 렌더 ---------- */
function renderEventCalendar() {
  const container = document.getElementById('evCalendar')
  const title     = document.getElementById('evMonthTitle')
  if (!container) return

  // Inject view toggle buttons (once per render)
  const header = container.parentElement?.querySelector('.evcal-header')
  if (header) {
    const old = header.querySelector('.cal-view-btns')
    if (old) old.remove()
    header.insertAdjacentHTML('beforeend', _calViewBtnsHtml('event', (State && State.eventCalView) || 'month'))
  }

  const mode = (State && State.eventCalView) || 'month'
  if (mode === 'week') {
    const start = getStartOfWeek(_evCursor)
    const end = new Date(start); end.setDate(start.getDate() + 6)
    title.textContent = `${start.getFullYear()}.${start.getMonth()+1}.${start.getDate()} ~ ${end.getMonth()+1}.${end.getDate()}`
    title.classList.remove('cal-month-clickable'); title.onclick = null
    container.innerHTML = renderWeekView('event', _evCursor)
    return
  }
  if (mode === 'day') {
    const d = new Date(_evCursor)
    title.textContent = `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`
    title.classList.remove('cal-month-clickable'); title.onclick = null
    container.innerHTML = renderDayView('event', _evCursor)
    return
  }

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

  // 이벤트 바 배치 (최대 5줄, 초과분은 +N건)
  const MAX_ROWS = 5
  const barRows  = placeEventBars(cells[0].date, cells[cells.length - 1].date, MAX_ROWS)

  // HTML
  let html = '<div class="evcal-grid">'
  const DOW = ['일','월','화','수','목','금','토']
  DOW.forEach((d, i) => {
    const cls = i === 0 ? ' evcal-sun' : i === 6 ? ' evcal-sat' : ''
    html += `<div class="evcal-dow${cls}">${d}</div>`
  })

  const todayStr = fmtDate(new Date())
  const _todayRef = new Date()
  const isCurrentMonthView = (_evYear === _todayRef.getFullYear() && _evMonth === _todayRef.getMonth())

  cells.forEach(cell => {
    const isPast = isCurrentMonthView && cell.date < todayStr
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

    html += `<div class="${classes.join(' ')}" data-date="${cell.date}">`
    html += `<div class="evcal-day">${cell.day}${holiday ? `<span class="dcal-hol-name">${esc(holiday)}</span>` : ''}</div>`
    html += '<div class="evcal-bars">'

    for (let row = 0; row < MAX_ROWS; row++) {
      const bar = cellBars[row]
      if (!bar) continue

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
        const author = ev.createdByName ? esc(typeof formatUserName === 'function' ? formatUserName(ev.createdByName, ev.createdByPosition) : ev.createdByName) : ''
        html += `<div class="evcal-bar evcal-bar-fill"
          style="background:${color.bar}; color:${color.text};"
          title="${tooltip}"
          onclick="openEventDetailModal(${ev.no})"
        ><span class="bar-text">${label}</span><span class="bar-author">${author}</span></div>`
      }
    }

    const overflow = cellBars._overflow || 0
    if (overflow > 0) {
      html += `<div class="evcal-more" title="외 ${overflow}건" onclick="event.stopPropagation()">+${overflow}건</div>`
    }

    html += '</div></div>'
  })

  html += '</div>'
  container.innerHTML = html

  // 빈 날짜 더블클릭 → 행사 등록 모달 (해당 날짜 프리셋)
  container.querySelectorAll('.evcal-cell[data-date]').forEach(cell => {
    cell.addEventListener('dblclick', e => {
      if (e.target.closest('.evcal-bar-fill, .evcal-bar-mini, .evcal-more')) return
      openEventRegisterModal(cell.dataset.date)
    })
  })
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
  const modal = document.getElementById('eventRegisterModal')
  const ev = _editingEventNo != null ? _events.find(e => e.no === _editingEventNo) : null
  const canDel = ev ? canDeleteEvent(ev) : false
  modal.querySelectorAll('.ev-view-btn').forEach(b => {
    if (mode !== 'view') { b.style.display = 'none'; return }
    // 삭제 버튼만 권한 체크 (srm-btn-danger 클래스로 식별)
    if (b.classList.contains('srm-btn-danger') && !canDel) { b.style.display = 'none'; return }
    b.style.display = 'inline-block'
  })
  modal.querySelectorAll('.ev-edit-btn').forEach(b => b.style.display = mode === 'edit' ? 'inline-block' : 'none')
  modal.querySelectorAll('.ev-new-btn').forEach(b => b.style.display = mode === 'new' ? 'inline-block' : 'none')
  const backBtn = modal.querySelector('.ev-back-btn')
  if (backBtn) backBtn.style.display = (mode === 'view' && _eventOpenedFromDash) ? 'inline-block' : 'none'
}

/* ---------- 보기 모드로 열기 (캘린더 바 클릭) ---------- */
function openEventDetailModal(no, fromDash) {
  const ev = _events.find(e => e.no === no)
  if (!ev) return
  _editingEventNo = ev.no
  _eventOpenedFromDash = !!fromDash
  if (typeof loadAllUsers === 'function') loadAllUsers()

  const modal = document.getElementById('eventRegisterModal')
  modal.querySelector('.rmodal-title').textContent = '행사일정'
  modal.classList.remove('edit-mode')
  _evUpdateHeaderBtns('view')
  buildEventDetailContent(ev)
  modal.showModal()
  centerModal(modal)
  _evSyncWatchBtn()
  _evSyncLockWarn()
  loadComments('event', ev.no)
  if (typeof pushModalHistory === 'function') pushModalHistory('event', ev.no)
  const favBtn = document.getElementById('evFavBtn')
  if (favBtn) {
    const on = typeof isFavorite === 'function' && isFavorite('event', ev.no)
    favBtn.textContent = on ? '★' : '☆'
    favBtn.classList.toggle('fav-on', on)
  }
}

/* ---------- 신규 등록 (빈 폼, 바로 편집 상태) ---------- */
function openEventRegisterModal(dateStr) {
  _editingEventNo = null
  if (typeof loadAllUsers === 'function') loadAllUsers()
  const modal = document.getElementById('eventRegisterModal')
  modal.querySelector('.rmodal-title').textContent = '행사 등록'
  modal.classList.add('edit-mode')
  _evUpdateHeaderBtns('new')
  buildEventNewForm(dateStr)
  modal.showModal()
  centerModal(modal)
}

/* ---------- 보기 모드 콘텐츠 생성 ---------- */
function calcTimelineProgress(start, end) {
  const s = new Date(start), e = new Date(end), t = new Date()
  if (t < s) return 0
  if (t > e) return 100
  const span = e - s
  return span <= 0 ? 100 : Math.round((t - s) / span * 100)
}
window.calcTimelineProgress = calcTimelineProgress

function buildEventDetailContent(ev) {
  const body = document.getElementById('eventModalBody')
  const status = getEventStatus(ev)
  const progress = calcTimelineProgress(ev.startDate, ev.endDate)
  const days = Math.max(1, Math.round((new Date(ev.endDate) - new Date(ev.startDate)) / 86400000) + 1)

  let html = ''

  // ===== 보기 모드 (.dview) =====
  html += '<div class="dview">'
  html += `<span class="srm-cat-tag">${esc(ev.channel || '채널')}</span>`
  html += `<div class="srm-view-value-lg" style="margin-bottom:14px">${esc(ev.name)} <span class="srm-header-badge" style="margin-left:8px">${status}</span></div>`

  // 타임라인
  html += `<div class="srm-timeline">
    <span class="srm-tl-dot"></span>
    <span class="srm-tl-date">${ev.startDate}</span>
    <div class="srm-tl-line"><div class="srm-tl-fill" style="width:${progress}%"></div><span class="srm-tl-days">${days}일간</span></div>
    <span class="srm-tl-date">${ev.endDate}</span>
    <span class="srm-tl-dot"></span>
  </div>`

  // 정보카드
  html += `<div class="srm-info-cards">
    <div class="srm-info-card"><div class="srm-info-card-label">할인율</div><div class="srm-info-card-value">${ev.discount || 0}<span class="srm-info-card-unit">%</span></div></div>
    <div class="srm-info-card"><div class="srm-info-card-label">당사지원</div><div class="srm-info-card-value">${ev.support || 0}<span class="srm-info-card-unit">%</span></div></div>
  </div>`

  if (ev.memo) {
    html += `<div class="srm-divider"></div><div class="srm-memo-label">메모</div><div class="srm-memo-text">${esc(ev.memo)}</div>`
  }

  // 참조자 (보기)
  const mList = Array.isArray(ev.mentions) ? ev.mentions : []
  if (mList.length) {
    const mTags = mList.map(m => {
      if (m.type === 'user') return `<span class="ps-mention-tag ps-mention-user">@${esc(formatUserName(m.name, m.position))}</span>`
      return `<span class="ps-mention-tag ps-mention-dept">@${esc(m.dept)}</span>`
    }).join(' ')
    html += `<div class="srm-divider"></div><div class="srm-memo-label">참조</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${mTags}</div>`
  }

  // 이미지 (보기)
  const imgs = (ev.tempImages || []).filter(i => i && i.url)
  if (imgs.length) {
    html += `<div class="srm-divider"></div><div class="srm-memo-label">이미지</div>`
    html += `<div class="ev-img-grid-view" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">`
    imgs.forEach(i => {
      html += `<img src="${esc(i.url)}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid #eee" onclick="window.open('${esc(i.url)}','_blank')">`
    })
    html += '</div>'
  }

  // 체크리스트 (보기)
  html += `<div class="srm-divider"></div><div id="evChecklistViewArea">${buildEventChecklistHtml(ev.checklist || [], false)}</div>`

  html += '</div>'

  // ===== 수정 모드 (.dedit) =====
  html += '<div class="dedit ev-detail-fields">'
  html += `<div class="srm-field"><label class="srm-field-label">행사명</label><input type="text" id="evName" value="${esc(ev.name)}"></div>`
  html += `<div class="srm-field"><label class="srm-field-label">채널</label><input type="text" id="evChannel" value="${esc(ev.channel || '')}"></div>`
  html += `<div class="srm-field-row">
    <div class="srm-field"><label class="srm-field-label">시작일</label><input type="date" id="evStart" value="${ev.startDate}"></div>
    <div class="srm-field"><label class="srm-field-label">종료일</label><input type="date" id="evEnd" value="${ev.endDate}"></div>
  </div>`
  html += `<div class="srm-field-row">
    <div class="srm-field"><label class="srm-field-label">할인율 (%)</label><input type="number" id="evDiscount" value="${ev.discount || ''}" min="0" max="100"></div>
    <div class="srm-field"><label class="srm-field-label">당사지원 (%)</label><input type="number" id="evSupport" value="${ev.support || ''}" min="0" max="100"></div>
  </div>`
  html += `<div class="srm-field"><label class="srm-field-label">메모</label><textarea id="evMemo">${esc(ev.memo || '')}</textarea></div>`

  // 참조 (@멘션) — 편집 모드
  const evMentionTags = (Array.isArray(ev.mentions) ? ev.mentions : []).map(m => {
    if (m.type === 'user') {
      return `<span class="ps-mention-tag ps-mention-user" data-type="user" data-uid="${esc(m.uid)}" data-name="${esc(m.name)}" data-position="${esc(m.position || '')}">@${esc(formatUserName(m.name, m.position))} <span class="ps-mention-x" onclick="this.parentElement.remove()">&#10005;</span></span>`
    }
    return `<span class="ps-mention-tag ps-mention-dept" data-type="dept" data-dept="${esc(m.dept)}">@${esc(m.dept)} <span class="ps-mention-x" onclick="this.parentElement.remove()">&#10005;</span></span>`
  }).join('')
  html += `<div class="srm-field" style="position:relative"><label class="srm-field-label">참조 (@이름, @부서로 공유)</label>
    <div style="flex:1">
      <div class="ps-mention-area" id="evMentionArea" style="display:flex;flex-wrap:wrap;gap:6px;padding:6px;border:0.5px solid #e8e6e0;border-radius:6px;min-height:36px;background:#fff">
        ${evMentionTags}
        <input class="ps-mention-input" id="evMentionInput" placeholder="@입력..." oninput="searchMention(this.value, 'ev')" onkeydown="mentionKeyDown(event, 'ev')" style="display:inline-block;flex:1;min-width:120px;border:none;outline:none;font-size:13px;padding:2px 4px;background:transparent">
      </div>
      <div class="ps-mention-dropdown" id="evMentionDropdown" style="display:none"></div>
      <div style="font-size:11px;color:#b4b2a9;margin-top:6px">참조자에게 알림이 전송됩니다</div>
    </div></div>`

  // 이미지 (편집) — URL 추가 + 파일 업로드 + 썸네일 그리드
  _evImages = (ev.tempImages || []).map(i => ({...i}))
  html += `<div class="srm-field"><label class="srm-field-label">이미지</label>
    <div style="flex:1">
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <input type="text" id="evImgUrlInput" placeholder="이미지 URL 입력 후 추가" style="flex:1;padding:4px 8px;font-size:12px;border:1px solid var(--border);border-radius:4px">
        <button type="button" class="btn btn-sm btn-outline" onclick="evAddImageUrl()">+ URL</button>
        <label class="btn btn-sm btn-outline" style="margin:0;cursor:pointer">+ 파일<input type="file" multiple accept="image/*" style="display:none" onchange="evHandleImageUpload(this)"></label>
      </div>
      <div id="evImgGrid" style="display:flex;flex-wrap:wrap;gap:6px"></div>
    </div></div>`

  // 체크리스트 (편집)
  html += `<div class="srm-field"><label class="srm-field-label">체크리스트</label>
    <div id="evChecklistEditArea" style="flex:1">${buildEventChecklistHtml(ev.checklist || [], true)}</div></div>`

  html += '</div>'

  html += renderStampInfo(ev)
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
    <div class="ev-date-pair"><input type="date" id="evStart" value="${today}" required><span>~</span><input type="date" id="evEnd" value="${today}" required></div></div>`

  html += `<div class="dfield"><span class="dfield-label">할인율</span>
    <span class="dfield-value"></span>
    <div class="ev-pct-field"><input type="number" id="evDiscount" value="" min="0" max="100"><span>%</span></div></div>`

  html += `<div class="dfield"><span class="dfield-label">당사지원</span>
    <span class="dfield-value"></span>
    <div class="ev-pct-field"><input type="number" id="evSupport" value="" min="0" max="100"><span>%</span></div></div>`

  html += `<div class="dfield"><span class="dfield-label">메모</span>
    <span class="dfield-value"></span>
    <textarea id="evMemo" rows="3" placeholder="행사 메모"></textarea></div>`

  html += `<div class="dfield" style="position:relative"><span class="dfield-label">참조</span>
    <span class="dfield-value"></span>
    <div style="flex:1">
      <div class="ps-mention-area" id="evMentionArea" style="display:flex;flex-wrap:wrap;gap:6px;padding:6px;border:0.5px solid #e8e6e0;border-radius:6px;min-height:36px;background:#fff">
        <input class="ps-mention-input" id="evMentionInput" placeholder="@이름 또는 @부서" oninput="searchMention(this.value, 'ev')" onkeydown="mentionKeyDown(event, 'ev')" style="display:inline-block;flex:1;min-width:120px;border:none;outline:none;font-size:13px;padding:2px 4px;background:transparent">
      </div>
      <div class="ps-mention-dropdown" id="evMentionDropdown" style="display:none"></div>
      <div style="font-size:11px;color:#b4b2a9;margin-top:6px">참조자에게 알림이 전송됩니다</div>
    </div></div>`

  html += '</div>'
  body.innerHTML = html
}

function _evSyncWatchBtn() {
  const btn = document.getElementById('evWatchBtn')
  if (!btn || _editingEventNo == null) return
  const on = typeof isWatching === 'function' && isWatching('event', _editingEventNo)
  btn.textContent = on ? '💛' : '🤍'
  btn.classList.toggle('active', on)
}
window._evSyncWatchBtn = _evSyncWatchBtn

function _evSyncLockWarn() {
  const el = document.getElementById('evLockWarn')
  if (!el) return
  const info = (typeof getEditLockInfo === 'function') ? getEditLockInfo('event', _editingEventNo) : null
  if (info) {
    const _who = (typeof formatUserName === 'function') ? formatUserName(info.name, info.position) : (info.name || '다른 사용자')
    el.textContent = `🔒 ${_who} 편집중`; el.style.display = ''
  }
  else { el.textContent = ''; el.style.display = 'none' }
}
window._evSyncLockWarn = _evSyncLockWarn

/* ---------- 수정 모드 토글 ---------- */
function toggleEventEdit() {
  const modal = document.getElementById('eventRegisterModal')
  if (modal.classList.contains('edit-mode')) {
    // 취소 → 보기 모드 복원
    try { if (typeof releaseEditLock === 'function') releaseEditLock('event', _editingEventNo) } catch(e) {}
    modal.classList.remove('edit-mode')
    _evUpdateHeaderBtns('view')
    const ev = _events.find(e => e.no === _editingEventNo)
    if (ev) buildEventDetailContent(ev)
    loadComments('event', _editingEventNo)
    _evSyncLockWarn()
  } else {
    // 수정 모드 진입 (로그인만 하면 누구나 가능)
    const ev = _events.find(e => e.no === _editingEventNo)
    if (!ev) return
    const info = (typeof getEditLockInfo === 'function') ? getEditLockInfo('event', _editingEventNo) : null
    if (info) {
      const who = (typeof formatUserName === 'function') ? formatUserName(info.name, info.position) : (info.name || '다른 사용자')
      showToast(`${who}님이 편집 중입니다`, 'warn')
      _evSyncLockWarn()
      return
    }
    // 락 획득 실패 시 진입 차단 (TOCTOU 보호 — acquireEditLock 자체가 토스트 표시)
    if (typeof acquireEditLock === 'function' && !acquireEditLock('event', _editingEventNo)) {
      _evSyncLockWarn()
      return
    }
    modal.classList.add('edit-mode')
    _evUpdateHeaderBtns('edit')
    _evSyncLockWarn()
    setTimeout(() => _evRenderImgGrid(), 0)
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

  const prevMentions = Array.isArray(ev.mentions) ? ev.mentions : []
  const newMentions = (typeof collectMentions === 'function') ? collectMentions('ev') : []

  ev.name = name
  ev.channel = document.getElementById('evChannel')?.value.trim() || ''
  ev.startDate = start
  ev.endDate = end
  ev.discount = document.getElementById('evDiscount')?.value || ''
  ev.support = document.getElementById('evSupport')?.value || ''
  ev.memo = document.getElementById('evMemo')?.value.trim() || ''
  ev.tempImages = (_evImages || []).map(i => ({...i}))
  ev.mentions = newMentions
  // checklist already mutated in-place via ev.checklist

  stampModified(ev)
  saveEvents()
  closeEventRegisterModal(true)
  renderEventCalendar()
  renderDashCalendar()
  showToast('행사가 수정되었습니다.', 'success')
  logActivity('update', '행사일정', `행사수정: ${ev.name}`)
  try {
    if (typeof notifyWatchers === 'function') notifyWatchers('event', ev.no, '수정됨')
    if (typeof releaseEditLock === 'function') releaseEditLock('event', ev.no)
  } catch(e) {}
  _notifyEventMentions(ev, prevMentions, newMentions)
}

/* ---------- 신규 등록 저장 ---------- */
function submitEventNew() {
  const name = document.getElementById('evName')?.value.trim()
  const start = document.getElementById('evStart')?.value
  const end = document.getElementById('evEnd')?.value
  if (!name) { showToast('행사명을 입력해주세요.', 'warning'); return }
  if (!start || !end) { showToast('기간을 입력해주세요.', 'warning'); return }

  const no = _events.length ? Math.max(..._events.map(ev => ev.no)) + 1 : 1
  const mentions = (typeof collectMentions === 'function') ? collectMentions('ev') : []
  const ev = {
    no,
    name,
    channel: document.getElementById('evChannel')?.value.trim() || '',
    startDate: start,
    endDate: end,
    discount: document.getElementById('evDiscount')?.value || '',
    support: document.getElementById('evSupport')?.value || '',
    memo: document.getElementById('evMemo')?.value.trim() || '',
    mentions
  }
  stampCreated(ev)

  _events.push(ev)
  saveEvents()
  closeEventRegisterModal(true)
  renderEventCalendar()
  renderDashCalendar()
  showToast('행사가 등록되었습니다.', 'success')
  logActivity('create', '행사일정', `행사등록: ${ev.name}`)
  _notifyEventMentions(ev, [], mentions)
}

/* ---------- 참조자 알림 ---------- */
function _notifyEventMentions(ev, prevMentions, newMentions) {
  if (typeof addNotification !== 'function') return
  const user = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null
  const myUid = user ? user.uid : ''
  const authorName = (typeof formatUserNameHonorific === 'function')
    ? formatUserNameHonorific(_currentUserName || '', _currentUserPosition || '')
    : (_currentUserName || '사용자')
  const prevUids = new Set((prevMentions || []).filter(m => m && m.type === 'user').map(m => m.uid))
  const prevDepts = new Set((prevMentions || []).filter(m => m && m.type === 'dept').map(m => m.dept))
  const added = (newMentions || []).filter(m => {
    if (!m) return false
    if (m.type === 'user') return m.uid && m.uid !== myUid && !prevUids.has(m.uid)
    if (m.type === 'dept') return m.dept && !prevDepts.has(m.dept)
    return false
  })
  if (!added.length) return
  const body = `${authorName}이 행사를 공유했습니다: ${ev.name}`
  const link = '#event:' + ev.no
  // 수신자 UID 수집 (user 타입 직접 + dept 타입은 해당 부서 소속 사용자들)
  const targetUids = new Set()
  added.forEach(m => {
    if (m.type === 'user' && m.uid) targetUids.add(m.uid)
    else if (m.type === 'dept' && m.dept && Array.isArray(_allUsers)) {
      _allUsers.forEach(u => {
        if (u.uid && u.uid !== myUid && u.dept === m.dept) targetUids.add(u.uid)
      })
    }
  })
  if (targetUids.size) {
    addNotification('event_share', '🎪 행사 공유', body, link, { targetUids: Array.from(targetUids) })
  }
}

/* ---------- 뒤로 (대시보드 행사 조회로 복귀) ---------- */
function backToDashEvent() {
  const no = _editingEventNo
  closeEventRegisterModal(true)
  openDashEventInfo(no)
}

/* ---------- 행사일정 탭에서 수정 ---------- */
function goToEventEdit(no) {
  closeEventRegisterModal(true)
  openTab('event')
  setTimeout(() => {
    const ev = _events.find(e => e.no === no)
    if (!ev) return
    _editingEventNo = ev.no
    _eventOpenedFromDash = false
    const modal = document.getElementById('eventRegisterModal')
    modal.querySelector('.rmodal-title').textContent = '행사일정'
    modal.classList.add('edit-mode')
    _evUpdateHeaderBtns('edit')
    buildEventDetailContent(ev)
    modal.showModal()
    centerModal(modal)
    loadComments('event', ev.no)
    setTimeout(() => _evRenderImgGrid(), 0)
  }, 300)
}

/* ---------- 삭제 권한 ---------- */
function canDeleteEvent(ev) {
  const user = typeof firebase !== 'undefined' && firebase.auth().currentUser
  if (!user) return false
  const cu = State.currentUser
  const grade = cu?.grade || 1
  if (grade >= 3) return true
  if (ev.createdBy && ev.createdBy === user.uid) return true
  return false
}
function canEditEvent(ev) {
  return !!(typeof firebase !== 'undefined' && firebase.auth().currentUser)
}

/* ---------- 닫기 ---------- */
function closeEventRegisterModal(force) {
  const modal = document.getElementById('eventRegisterModal')
  if (!modal) return
  try { if (typeof releaseEditLock === 'function' && _editingEventNo != null) releaseEditLock('event', _editingEventNo) } catch(e) {}
  if (force) { modal.close(); return }
  safeCloseModal(modal,
    () => modal.classList.contains('edit-mode'),
    () => modal.close()
  )
}

/* ---------- 삭제 ---------- */
async function deleteEvent(no) {
  const ev = _events.find(x => x.no === no)
  if (!ev) return
  if (!canDeleteEvent(ev)) { showToast('삭제 권한이 없습니다.', 'warning'); return }
  const ok = await korConfirm('이 행사를 삭제하시겠습니까?')
  if (!ok) return
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

/* ---------- 이벤트 체크리스트 ---------- */
let _evChecklistDraft = []
let _evImages = []

function buildEventChecklistHtml(list, isEdit) {
  list = list || []
  const done = list.filter(c => c.done).length
  const total = list.length
  let html = '<div class="checklist-section">'
  html += `<div class="checklist-title">체크리스트 <span class="checklist-count">${done}/${total}</span></div>`
  list.forEach(c => {
    const cid = esc(c.id)
    const text = esc(c.text || '')
    const rowStyle = 'display:flex !important;align-items:center;gap:6px;padding:5px 0;font-size:13px;width:100%;'
    const cbStyle = 'width:16px !important;height:16px !important;flex:0 0 16px !important;margin:0;cursor:pointer;'
    const txtStyle = 'flex:1 1 auto !important;min-width:0;word-break:break-all;font-size:12px;'
    const inpStyle = 'flex:1 1 auto;min-width:0;border:1px solid #ddd;padding:2px 6px;font-size:13px;display:none;'
    const btnStyle = 'background:none;border:none;color:#999;cursor:pointer;font-size:9px;line-height:1;padding:0 3px;flex:0 0 auto;'
    let trailing = ''
    if (isEdit) {
      trailing = `
        <input type="text" class="ev-chk-input" data-chk-id="${cid}" value="${text}" style="${inpStyle}">
        <button type="button" onclick="evEditChk('${cid}')" style="${btnStyle}">✎</button>
        <button type="button" class="ev-chk-save" onclick="evSaveChk('${cid}')" style="${btnStyle};display:none">저장</button>
        <button type="button" class="ev-chk-cancel" onclick="evCancelChk('${cid}')" style="${btnStyle};display:none">취소</button>
        <button type="button" onclick="evRemoveChk('${cid}')" style="${btnStyle}">✕</button>`
    } else if (c.done && c.checkedBy) {
      const who = esc((c.checkedBy || '') + (c.checkedByPosition || ''))
      trailing = `<span style="font-size:10px;color:#b4b2a9;flex-shrink:0">${who}</span>`
    }
    const cbHandler = isEdit
      ? `onclick="this.closest('.checklist-item').classList.toggle('checklist-done', this.checked)"`
      : `onchange="evToggleChk('${cid}')"`
    html += `<div class="checklist-item${c.done?' checklist-done':''}" data-chk-id="${cid}" style="${rowStyle}">
      <input type="checkbox" class="checklist-cb" ${c.done?'checked':''} ${cbHandler} style="${cbStyle}">
      <span class="checklist-text" style="${txtStyle}">${text}</span>${trailing}
    </div>`
  })
  if (isEdit) {
    html += `<div class="checklist-add" style="display:flex;gap:6px;margin-top:6px">
      <input type="text" id="evNewChkInput" class="checklist-add-input" placeholder="새 항목 추가" style="flex:1;padding:4px 8px;font-size:12px;border:1px solid var(--border);border-radius:4px" onkeydown="if(event.key==='Enter'){event.preventDefault();evAddChk()}">
      <button type="button" class="btn btn-sm btn-outline" onclick="evAddChk()">추가</button>
    </div>`
  }
  html += '</div>'
  return html
}

function _evGetEditingList() {
  const ev = _events.find(e => e.no === _editingEventNo)
  if (!ev) return null
  if (!ev.checklist) ev.checklist = []
  return ev.checklist
}

function _evRerenderEditChecklist() {
  const list = _evGetEditingList() || []
  const area = document.getElementById('evChecklistEditArea')
  if (area) area.innerHTML = buildEventChecklistHtml(list, true)
}

function evAddChk() {
  const input = document.getElementById('evNewChkInput')
  if (!input || !input.value.trim()) return
  const list = _evGetEditingList()
  if (!list) return
  list.push({ id: 'evc' + Date.now() + Math.random().toString(36).slice(2,6), text: input.value.trim(), done: false })
  input.value = ''
  _evRerenderEditChecklist()
}

function evRemoveChk(id) {
  const ev = _events.find(e => e.no === _editingEventNo)
  if (!ev || !ev.checklist) return
  ev.checklist = ev.checklist.filter(c => c.id !== id)
  _evRerenderEditChecklist()
}

function evEditChk(id) {
  const row = document.querySelector(`#evChecklistEditArea .checklist-item[data-chk-id="${id}"]`)
  if (!row) return
  row.querySelector('.checklist-text').style.display = 'none'
  row.querySelectorAll('button')[0].style.display = 'none' // ✎
  row.querySelectorAll('button')[3].style.display = 'none' // ✕
  const inp = row.querySelector('.ev-chk-input'); inp.style.display = 'block'
  row.querySelector('.ev-chk-save').style.display = 'inline-block'
  row.querySelector('.ev-chk-cancel').style.display = 'inline-block'
  inp.focus(); inp.select()
}

function evSaveChk(id) {
  const row = document.querySelector(`#evChecklistEditArea .checklist-item[data-chk-id="${id}"]`)
  if (!row) return
  const newText = row.querySelector('.ev-chk-input').value.trim()
  if (!newText) { showToast('내용을 입력하세요', 'warning'); return }
  const list = _evGetEditingList(); if (!list) return
  const c = list.find(x => x.id === id); if (c) c.text = newText
  _evRerenderEditChecklist()
}

function evCancelChk(id) { _evRerenderEditChecklist() }

function evToggleChk(id) {
  const ev = _events.find(e => e.no === _editingEventNo)
  if (!ev || !ev.checklist) return
  const c = ev.checklist.find(x => x.id === id); if (!c) return
  c.done = !c.done
  if (c.done) {
    c.checkedBy = (typeof _currentUserName !== 'undefined' && _currentUserName) || ''
    c.checkedByPosition = (typeof _currentUserPosition !== 'undefined' && _currentUserPosition) || ''
  } else { c.checkedBy = ''; c.checkedByPosition = '' }
  saveEvents()
  const area = document.getElementById('evChecklistViewArea')
  if (area) area.innerHTML = buildEventChecklistHtml(ev.checklist, false)
}

/* ---------- 이벤트 이미지 ---------- */
function _evRenderImgGrid() {
  const grid = document.getElementById('evImgGrid')
  if (!grid) return
  grid.innerHTML = _evImages.map((img, i) =>
    `<div style="position:relative;width:80px;height:80px"><img src="${esc(img.url)}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid #eee"><button type="button" onclick="evRemoveImage(${i})" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;border:none;background:#e05252;color:#fff;cursor:pointer;font-size:11px;line-height:1">✕</button></div>`
  ).join('')
}

function evAddImageUrl() {
  const inp = document.getElementById('evImgUrlInput')
  if (!inp || !inp.value.trim()) return
  _evImages.push({ url: inp.value.trim(), type: 'url' })
  inp.value = ''
  _evRenderImgGrid()
}

function evHandleImageUpload(input) {
  Array.from(input.files || []).forEach(f => {
    const reader = new FileReader()
    reader.onload = e => {
      _evImages.push({ url: e.target.result, type: 'file', name: f.name })
      _evRenderImgGrid()
    }
    reader.readAsDataURL(f)
  })
  input.value = ''
}

function evRemoveImage(idx) {
  _evImages.splice(idx, 1)
  _evRenderImgGrid()
}

if (typeof window !== 'undefined') {
  window.buildEventChecklistHtml = buildEventChecklistHtml
  window.evAddChk = evAddChk
  window.evRemoveChk = evRemoveChk
  window.evEditChk = evEditChk
  window.evSaveChk = evSaveChk
  window.evCancelChk = evCancelChk
  window.evToggleChk = evToggleChk
  window.evAddImageUrl = evAddImageUrl
  window.evHandleImageUpload = evHandleImageUpload
  window.evRemoveImage = evRemoveImage
}

/* esc() — utils.js에서 전역 정의 */
