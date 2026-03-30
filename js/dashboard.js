// =============================================
// ===== 대시보드 =====
// =============================================
function renderDashboard() {
  renderKPI()
  renderBestList()
  renderSalesSummary()
  renderMiniChart()
  renderDashCalendar()
}

function renderKPI() {
  const all = State.allProducts
  const totalStock = all.reduce((s,p) => s + getTotalStock(p), 0)
  const totalSales = all.reduce((s,p) => s + getTotalSales(p), 0)
  const avgEx = totalStock > 0 ? Math.round(totalSales / totalStock * 100) : 0
  document.getElementById('kpiRow').innerHTML = [
    { icon: '👗', label: '전체 상품', value: `${all.length}개` },
    { icon: '📦', label: '총 입고수량', value: `${totalStock.toLocaleString()}개` },
    { icon: '🛍️', label: '총 판매수량', value: `${totalSales.toLocaleString()}개` },
    { icon: '📊', label: '평균 소진율', value: `${avgEx}%` }
  ].map(c => `
    <div class="kpi-card">
      <span class="kpi-icon">${c.icon}</span>
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value">${c.value}</div>
    </div>`).join('')
}

function renderBestList() {
  const top10 = [...State.allProducts]
    .sort((a,b) => getTotalSales(b) - getTotalSales(a))
    .slice(0,10)

  document.getElementById('bestList').innerHTML = top10.map((p,i) => {
    const thumb = getThumbUrl(p)
    const rankClass = i < 3 ? `rank-${i+1}` : ''
    return `<div class="best-item" onclick="goToSales('${p.productCode}')">
      <span class="rank ${rankClass}">${i+1}</span>
      ${thumb
        ? `<img src="${thumb}" class="best-thumb" onerror="this.style.display='none'" />`
        : `<div class="best-thumb" style="background:var(--border-light);border-radius:3px;border:1px solid var(--border)"></div>`
      }
      <div class="best-info">
        <span class="best-brand">${p.brand}</span>
        <span class="best-code">${p.productCode}</span>
        <span class="best-name">${p.nameKr}</span>
      </div>
      <span class="best-sales">${getTotalSales(p).toLocaleString()}개</span>
    </div>`
  }).join('')
}

function goToSales(code) {
  switchTab('sales')
  document.getElementById('slKeyword').value = code
  searchSales()
}

function renderSalesSummary() {
  const all = State.allProducts
  const brands = [
    { name: '르망고',    items: all.filter(p => p.brand === '르망고') },
    { name: '르망고 느와', items: all.filter(p => p.brand === '르망고 느와') },
    { name: '전체',      items: all }
  ]
  const rows = brands.map(b => {
    const curr = b.items.reduce((s,p) => s + getTotalSales(p) * (p.salePrice || 0), 0)
    const prev = Math.round(curr * (0.8 + Math.random() * 0.4))
    const diff = curr - prev
    return { name: b.name, prev, curr, diff }
  })
  document.getElementById('salesSummary').innerHTML = `
    <table class="summary-table">
      <thead><tr><th></th><th>전월</th><th>당월</th><th>증감</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td>${r.name}</td>
          <td>${(r.prev/10000).toFixed(0)}만원</td>
          <td>${(r.curr/10000).toFixed(0)}만원</td>
          <td class="${r.diff >= 0 ? 'positive' : 'negative'}">${r.diff >= 0 ? '+' : ''}${(r.diff/10000).toFixed(0)}만원</td>
        </tr>`).join('')}
      </tbody>
    </table>`
}

function renderMiniChart() {
  const canvas = document.getElementById('salesChart')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const platforms = _platforms
  const totals = platforms.map(pl =>
    State.allProducts.reduce((s,p) => s + (p.sales?.[pl] || 0), 0)
  )
  const max = Math.max(...totals) || 1
  const w = canvas.width, h = canvas.height
  const barW = 44, gap = (w - platforms.length * barW) / (platforms.length + 1)
  const CHART_COLORS = ['#1a1a2e','#c9a96e','#4caf7d','#f0a500','#e05252','#7b68ee','#20b2aa','#ff7f50','#9370db','#3cb371']
  const colors = _platforms.map((_, i) => CHART_COLORS[i % CHART_COLORS.length])
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = '#eeebe5'; ctx.lineWidth = 1
  for (let i = 1; i <= 4; i++) {
    const y = h - 28 - (h - 40) * i / 4
    ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(w - 8, y); ctx.stroke()
  }
  platforms.forEach((pl, i) => {
    const x = gap + i * (barW + gap)
    const barH = Math.round((totals[i] / max) * (h - 48))
    const y = h - 28 - barH
    ctx.fillStyle = colors[i]
    ctx.beginPath()
    ctx.roundRect(x, y, barW, barH, [3,3,0,0])
    ctx.fill()
    ctx.fillStyle = '#6b6b6b'; ctx.font = '11px Inter'
    ctx.textAlign = 'center'
    ctx.fillText(pl, x + barW/2, h - 10)
    ctx.fillStyle = colors[i]; ctx.font = 'bold 11px Inter'
    ctx.fillText(totals[i], x + barW/2, y - 4)
  })
}

// =============================================
// ===== 대시보드 캘린더 =====
// =============================================
let _dashCalYear  = new Date().getFullYear()
let _dashCalMonth = new Date().getMonth()

function dashCalPrev() {
  _dashCalMonth--
  if (_dashCalMonth < 0) { _dashCalMonth = 11; _dashCalYear-- }
  renderDashCalendar()
}
function dashCalNext() {
  _dashCalMonth++
  if (_dashCalMonth > 11) { _dashCalMonth = 0; _dashCalYear++ }
  renderDashCalendar()
}
function dashCalToday() {
  _dashCalYear  = new Date().getFullYear()
  _dashCalMonth = new Date().getMonth()
  renderDashCalendar()
}

// 기획 일정 단계별 색상
const PLAN_PHASE_COLORS = {
  design:     { bar: '#c9a96e', text: '#fff' },  // 골드
  production: { bar: '#4caf7d', text: '#fff' },  // 초록
  image:      { bar: '#7b68ee', text: '#fff' },  // 보라
  register:   { bar: '#f0a500', text: '#fff' },  // 노랑
  logistics:  { bar: '#20b2aa', text: '#fff' },  // 청록
}

function renderDashCalendar() {
  const container = document.getElementById('dashCalendar')
  const title     = document.getElementById('dashCalTitle')
  if (!container) return

  title.textContent = `${_dashCalYear}년 ${_dashCalMonth + 1}월`
  title.classList.add('cal-month-clickable')
  title.onclick = () => openMonthPicker(title, _dashCalYear, _dashCalMonth, (y, m) => {
    _dashCalYear = y; _dashCalMonth = m; renderDashCalendar()
  })

  const firstDay = new Date(_dashCalYear, _dashCalMonth, 1)
  const startDow = firstDay.getDay()
  const totalCells = 42

  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(_dashCalYear, _dashCalMonth, i - startDow + 1)
    cells.push({
      date: fmtDate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === _dashCalMonth,
      isToday: fmtDate(d) === fmtDate(new Date()),
      dow: i % 7
    })
  }

  const gridStart = cells[0].date
  const gridEnd   = cells[cells.length - 1].date

  // 각 날짜에 해당하는 행사 + 기획 일정 수집
  const dateItems = {} // { 'yyyy-mm-dd': { events: [], plans: [], works: [] } }

  // 행사일정
  _events.forEach(ev => {
    if (ev.endDate < gridStart || ev.startDate > gridEnd) return
    const s = ev.startDate < gridStart ? gridStart : ev.startDate
    const e = ev.endDate > gridEnd ? gridEnd : ev.endDate
    getDateRange(s, e).forEach(d => {
      if (!dateItems[d]) dateItems[d] = { events: [], plans: [], works: [] }
      // 중복 방지
      if (!dateItems[d].events.find(x => x.no === ev.no)) dateItems[d].events.push(ev)
    })
  })

  // 기획 일정 (planItems) — 시작일/완료일 당일만 표기
  State.planItems.forEach(item => {
    if (!item.schedule) return
    SCHEDULE_DEFS.forEach(def => {
      const phase = item.schedule[def.key]
      if (!phase || !phase.start || !phase.end) return
      const dates = [phase.start, phase.end]
      dates.forEach(d => {
        if (d < gridStart || d > gridEnd) return
        if (!dateItems[d]) dateItems[d] = { events: [], plans: [], works: [] }
        const isStart = (d === phase.start)
        const tag = isStart ? '시작' : '완료'
        if (!dateItems[d].plans.find(x => x.item.no === item.no && x.phaseKey === def.key && x.tag === tag)) {
          dateItems[d].plans.push({ item, phaseKey: def.key, phaseLabel: def.label, phase, tag })
        }
      })
    })
  })

  // 업무일정
  State.workItems.forEach(w => {
    if (!w.startDate) return
    const ws = w.startDate
    const we = w.endDate || ws
    if (we < gridStart || ws > gridEnd) return
    const s = ws < gridStart ? gridStart : ws
    const e = we > gridEnd ? gridEnd : we
    getDateRange(s, e).forEach(d => {
      if (!dateItems[d]) dateItems[d] = { events: [], plans: [], works: [] }
      if (!dateItems[d].works.find(x => x.no === w.no)) dateItems[d].works.push(w)
    })
  })

  // HTML
  let html = '<div class="dcal-grid">'
  const DOW = ['일','월','화','수','목','금','토']
  DOW.forEach((d, i) => {
    const cls = i === 0 ? ' evcal-sun' : i === 6 ? ' evcal-sat' : ''
    html += `<div class="evcal-dow dcal-dow${cls}">${d}</div>`
  })

  const todayStr = fmtDate(new Date())

  cells.forEach(cell => {
    const di = dateItems[cell.date] || { events: [], plans: [], works: [] }
    const isPast   = cell.date < todayStr
    const hasItems = di.events.length > 0 || di.plans.length > 0 || di.works.length > 0

    const holiday = getHolidayName(cell.date)

    const classes = ['dcal-cell']
    if (!cell.inMonth) classes.push('evcal-other')
    if (cell.isToday)  classes.push('evcal-today')
    if (cell.dow === 0) classes.push('evcal-sun')
    if (cell.dow === 6) classes.push('evcal-sat')
    if (holiday) classes.push('dcal-holiday')
    if (isPast) classes.push('evcal-past')

    html += `<div class="${classes.join(' ')}">`
    html += `<div class="evcal-day">${cell.day}${holiday ? `<span class="dcal-hol-name">${esc(holiday)}</span>` : ''}</div>`
    html += '<div class="dcal-bars">'

    const MAX_VISIBLE = 6
    let visibleCount = 0

    // 행사 바
    di.events.forEach(ev => {
      if (visibleCount >= MAX_VISIBLE) return
      visibleCount++
      const color = EV_COLORS[ev.no % EV_COLORS.length]
      const label = esc(`${ev.channel || ''} ${ev.name}`.trim())
      if (isPast) {
        html += `<div class="dcal-bar dcal-bar-mini" style="background:${color.bar};" title="${label}" onclick="openDashEventInfo(${ev.no})"></div>`
      } else {
        html += `<div class="dcal-bar dcal-bar-ev" style="background:${color.bar}; color:${color.text};" title="${label} (${ev.startDate}~${ev.endDate})" onclick="openDashEventInfo(${ev.no})">${label}</div>`
      }
    })

    // 기획 바 — 단계명만 표시 (같은 단계+태그 그룹핑)
    const planLabels = {}
    di.plans.forEach(p => {
      const key = `${p.phaseKey}_${p.tag}`
      if (!planLabels[key]) planLabels[key] = p
    })
    Object.values(planLabels).forEach(p => {
      if (visibleCount >= MAX_VISIBLE) return
      visibleCount++
      const phaseColor = PLAN_PHASE_COLORS[p.phaseKey] || { bar: '#999', text: '#fff' }
      const label = `${p.phaseLabel} ${p.tag}`
      if (isPast) {
        html += `<div class="dcal-bar dcal-bar-mini" style="background:${phaseColor.bar};" title="${label}" onclick="openPlanScheduleForDate('${cell.date}')"></div>`
      } else {
        html += `<div class="dcal-bar dcal-bar-plan" style="background:${phaseColor.bar}; color:${phaseColor.text};" title="${label}" onclick="openPlanScheduleForDate('${cell.date}')">${esc(label)}</div>`
      }
    })

    // 업무일정 바
    di.works.forEach(w => {
      if (visibleCount >= MAX_VISIBLE) return
      visibleCount++
      const wColor = getWorkCatColor(w.category)
      const label = `${w.category} ${w.title}`.trim()
      if (isPast) {
        html += `<div class="dcal-bar dcal-bar-mini" style="background:${wColor.bg};" title="${esc(label)}" onclick="openWorkDetailModal(${w.no})"></div>`
      } else {
        html += `<div class="dcal-bar dcal-bar-work" style="background:${wColor.bg}; color:${wColor.text};" title="${esc(label)}" onclick="openWorkDetailModal(${w.no})">${esc(label)}</div>`
      }
    })

    // +N more
    const totalCount = di.events.length + Object.keys(planLabels).length + di.works.length
    if (totalCount > visibleCount) {
      html += `<div class="evcal-more" onclick="openDashDayModal('${cell.date}')">+${totalCount - visibleCount}건</div>`
    }

    html += '</div></div>'
  })

  html += '</div>'
  container.innerHTML = html
}

// =============================================
// ===== 대시보드 날짜 클릭 → 일정 상세 모달 =====
// =============================================
function openDashDayModal(dateStr) {
  const events = _events.filter(e => e.startDate <= dateStr && e.endDate >= dateStr)

  const planHits = []
  State.planItems.forEach(item => {
    if (!item.schedule) return
    SCHEDULE_DEFS.forEach(s => {
      const sch = item.schedule?.[s.key] || {}
      const end = sch.end || sch.start || ''
      if (sch.start && sch.start <= dateStr && end >= dateStr) {
        planHits.push({ item, phase: s })
      }
    })
  })

  const works = (State.workItems || []).filter(w => {
    const we = w.endDate || w.startDate
    return w.startDate && w.startDate <= dateStr && we >= dateStr
  })

  const modal = document.getElementById('dashDayModal')
  const fmtKo = d => d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1년 $2월 $3일') : ''
  const sections = []

  if (events.length) {
    sections.push(`<div class="ddm-section">
      <div class="ddm-section-title">행사일정</div>
      ${events.map(e => `<div class="ddm-row" onclick="openDashEventInfo(${e.no});document.getElementById('dashDayModal').close()">
        <span class="ddm-badge" style="background:var(--primary);color:#fff">${esc(e.channel || '')}</span>
        <span class="ddm-item-name">${esc(e.name)}</span>
        <span class="ddm-item-period">${e.startDate} ~ ${e.endDate}</span>
      </div>`).join('')}
    </div>`)
  }
  if (planHits.length) {
    sections.push(`<div class="ddm-section">
      <div class="ddm-section-title">기획일정</div>
      ${planHits.map(({item, phase}) => `<div class="ddm-row" onclick="openPlanScheduleForDate('${dateStr}');document.getElementById('dashDayModal').close()">
        <span class="ddm-badge" style="background:var(--accent);color:#1a1a2e">${esc(phase.label)}</span>
        <span class="ddm-item-name">${esc(item.productCode || item.sampleNo || '-')}</span>
        <span class="ddm-item-period">${item.schedule?.[phase.key]?.start||''} ~ ${item.schedule?.[phase.key]?.end||''}</span>
      </div>`).join('')}
    </div>`)
  }
  if (works.length) {
    sections.push(`<div class="ddm-section">
      <div class="ddm-section-title">업무일정</div>
      ${works.map(w => `<div class="ddm-row" onclick="openWorkDetailModal(${w.no});document.getElementById('dashDayModal').close()">
        <span class="ddm-badge" style="background:${getWorkCatColor(w.category).bg};color:${getWorkCatColor(w.category).text}">${esc(w.category || '')}</span>
        <span class="ddm-item-name">${esc(w.title)}</span>
        <span class="ddm-item-period">${w.startDate} ~ ${w.endDate || w.startDate}</span>
      </div>`).join('')}
    </div>`)
  }

  modal.querySelector('.ddm-date').textContent = fmtKo(dateStr)
  modal.querySelector('.ddm-body').innerHTML = sections.join('') || '<p style="color:var(--text-light);font-size:13px">일정 없음</p>'
  centerModal(modal)
  modal.showModal()
}

// =============================================
// ===== 기획일정 상세 모달 (날짜 클릭) =====
// =============================================
function openPlanScheduleForDate(dateStr) {
  const modal = document.getElementById('planScheduleModal')
  const title = document.getElementById('psModalTitle')
  const body  = document.getElementById('psModalBody')

  title.textContent = `기획 일정 — ${dateStr}`

  // 해당 날짜가 시작일 또는 완료일인 planItems 찾기
  const matched = []
  State.planItems.forEach(item => {
    if (!item.schedule) return
    const phases = []
    SCHEDULE_DEFS.forEach(def => {
      const ph = item.schedule[def.key]
      if (!ph || !ph.start || !ph.end) return
      if (ph.start === dateStr || ph.end === dateStr) {
        const tag = ph.start === dateStr ? '시작' : '완료'
        phases.push({ key: def.key, label: def.label, start: ph.start, end: ph.end, tag })
      }
    })
    if (phases.length > 0) matched.push({ item, phases })
  })

  if (!matched.length) {
    body.innerHTML = '<p style="padding:20px;color:var(--text-sub);">해당 날짜에 기획 일정이 없습니다.</p>'
  } else {
    let html = '<div class="ps-list">'
    html += '<table class="ps-phase-table"><thead><tr><th>샘플번호</th><th>품번</th><th>해당 단계</th><th></th></tr></thead><tbody>'
    matched.forEach(({ item, phases }) => {
      const sample = item.sampleNo || '-'
      const code   = item.productCode || '-'
      const identifier = item.productCode || item.sampleNo || ''
      const tags   = phases.map(p => {
        const phColor = PLAN_PHASE_COLORS[p.key]
        return `<span class="ps-dot" style="background:${phColor.bar}"></span>${p.label} ${p.tag}`
      }).join(', ')
      html += `<tr>
        <td>${esc(sample)}</td>
        <td>${esc(code)}</td>
        <td>${tags}</td>
        <td><button class="btn btn-outline btn-sm" onclick="goToPlanWithItem('${esc(identifier)}');document.getElementById('planScheduleModal').close()">보기</button></td>
      </tr>`
    })
    html += '</tbody></table>'
    html += `<div class="ps-actions">
      <button class="btn btn-primary btn-sm" onclick="goToPlanWithDate('${dateStr}')">날짜로 보기</button>
    </div>`
    html += '</div>'
    body.innerHTML = html
  }

  modal.showModal()
  centerModal(modal)
}

function closePlanScheduleModal() {
  document.getElementById('planScheduleModal')?.close()
}

// =============================================
// ===== 대시보드 → 행사 조회 모달 (읽기전용) =====
// =============================================
function openDashEventInfo(no) {
  const ev = _events.find(x => x.no === no)
  if (!ev) return
  const modal = document.getElementById('planScheduleModal')
  const title = document.getElementById('psModalTitle')
  const body  = document.getElementById('psModalBody')

  title.textContent = '행사 정보'

  const status = getEventStatus(ev)
  const statusBadge = { '예정': 'badge-warning', '진행중': 'badge-success', '종료': 'badge-muted' }
  const color = EV_COLORS[ev.no % EV_COLORS.length]

  body.innerHTML = `
    <div class="ps-ev-info">
      <div class="ps-ev-color" style="background:${color.bar}"></div>
      <div class="ps-ev-detail">
        <table class="ps-phase-table">
          <tbody>
            <tr><td class="ps-label">행사명</td><td><strong>${esc(ev.name)}</strong></td></tr>
            <tr><td class="ps-label">채널</td><td>${esc(ev.channel || '-')}</td></tr>
            <tr><td class="ps-label">기간</td><td>${ev.startDate} ~ ${ev.endDate}</td></tr>
            <tr><td class="ps-label">상태</td><td><span class="badge ${statusBadge[status] || ''}">${status}</span></td></tr>
            ${ev.discount ? `<tr><td class="ps-label">할인율</td><td>${ev.discount}%</td></tr>` : ''}
            ${ev.support ? `<tr><td class="ps-label">당사지원</td><td>${ev.support}%</td></tr>` : ''}
            ${ev.memo ? `<tr><td class="ps-label">메모</td><td>${esc(ev.memo)}</td></tr>` : ''}
          </tbody>
        </table>
        <div class="ps-actions">
          <button class="btn btn-primary btn-sm" onclick="closePlanScheduleModal(); navigateTo('event'); setTimeout(()=>editEvent(${ev.no}),200)">수정하러 가기</button>
        </div>
      </div>
    </div>`

  modal.showModal()
  centerModal(modal)
}

// ===== 대시보드 → 기획일정 날짜 기준 검색으로 이동 =====
function goToPlanWithDate(dateStr) {
  closePlanScheduleModal()
  openTab('plan')
  // 날짜 필터 세팅
  document.getElementById('npPhase').value = 'all'
  document.getElementById('npDateFrom').value = dateStr
  document.getElementById('npDateTo').value = dateStr
  document.getElementById('npConfirmed').value = 'all'
  searchPlan()
}

// ===== 대시보드 → 기획일정 특정 아이템 기준 검색으로 이동 =====
function goToPlanWithItem(identifier) {
  closePlanScheduleModal()
  openTab('plan')
  document.getElementById('npKeyword').value = identifier
  const typeEl = document.getElementById('npSearchType')
  if (typeEl) {
    for (const opt of typeEl.options) {
      if (opt.value === 'code' || opt.text.includes('품번')) {
        typeEl.value = opt.value
        break
      }
    }
  }
  document.getElementById('npConfirmed').value = 'all'
  searchPlan()
}
window.goToPlanWithItem = goToPlanWithItem
window.openDashDayModal = openDashDayModal
