// =============================================
// ===== 대시보드 =====
// =============================================
function renderDashboard() {
  renderDashNotice()
  renderDashActivity()
  renderBestList()
  renderSalesSummary()
  renderMiniChart()
  renderDashCalendar()
}

// ===== 대시보드 공지사항 미니 섹션 =====
async function renderDashNotice() {
  const el = document.getElementById('dashNoticeCard')
  if (!el) return
  el.innerHTML = `<div class="dash-mini-header"><span class="dash-mini-title">공지사항</span><span class="dash-mini-more" onclick="openTab('board');switchBoardType('notice')">더보기</span></div><div class="dash-mini-body" style="color:#bbb;font-size:12px">로딩 중...</div>`
  if (!db) return

  try {
    // pinned 공지 우선, composite index 회피 — client sort
    const snap = await db.collection('posts')
      .where('boardType', '==', 'notice')
      .get()
    let posts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    // pinned first, then createdAt desc
    posts.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()
      const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()
      return tb - ta
    })
    posts = posts.slice(0, 5)

    if (!posts.length) {
      el.querySelector('.dash-mini-body').innerHTML = '<div style="color:#bbb;font-size:12px;padding:8px 0">공지사항이 없습니다.</div>'
      return
    }

    el.querySelector('.dash-mini-body').innerHTML = posts.map(p => {
      const ts = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)
      const dateStr = ts.toISOString().slice(0, 10)
      const isNew = (Date.now() - ts.getTime()) < 24 * 60 * 60 * 1000
      return `<div class="dash-notice-item" onclick="openTab('board');switchBoardType('notice');openBoardPost('${p.id}')">
        ${p.pinned ? '<span class="dash-notice-pin">&#9733;</span>' : ''}
        <span class="dash-notice-text">${esc(p.title)}</span>
        ${isNew ? '<span class="brd-new" style="font-size:8px;padding:0 3px">N</span>' : ''}
        <span class="dash-notice-date">${dateStr}</span>
      </div>`
    }).join('')
  } catch (e) {
    console.error('Dashboard notice error:', e)
    el.querySelector('.dash-mini-body').innerHTML = ''
  }
}

// ===== 대시보드 최근 등록 미니 섹션 =====
function renderDashActivity() {
  const el = document.getElementById('dashActivityCard')
  if (!el) return

  const items = []

  // 1. 신규기획
  if (State.planItems && State.planItems.length) {
    State.planItems.forEach(p => {
      const d = p.registeredAt || p.createdAt || ''
      items.push({
        type: 'plan', label: '기획',
        text: (p.productCode || p.sampleNo || '') + ' ' + (p.nameKr || ''),
        date: d, sortDate: new Date(d || 0),
        onclick: "openTab('plan')"
      })
    })
  }

  // 2. 행사일정
  if (_events && _events.length) {
    _events.forEach(e => {
      const d = e.registeredAt || e.startDate || ''
      items.push({
        type: 'event', label: '행사',
        text: (e.name || '') + ' (' + (e.startDate || '') + '~' + (e.endDate || '') + ')',
        date: d, sortDate: new Date(d || 0),
        onclick: "openTab('event')"
      })
    })
  }

  // 3. 업무일정
  if (State.workItems && State.workItems.length) {
    State.workItems.forEach(w => {
      const d = w.registeredAt || w.startDate || ''
      items.push({
        type: 'work', label: '업무',
        text: (w.title || w.category || '') + ' (' + (w.startDate || '') + ')',
        date: d, sortDate: new Date(d || 0),
        onclick: "openTab('work')"
      })
    })
  }

  // Sort by date desc, take top 7
  items.sort((a, b) => b.sortDate - a.sortDate)
  const top = items.slice(0, 7)

  el.innerHTML = `<div class="dash-mini-header"><span class="dash-mini-title">최근 등록</span></div><div class="dash-mini-body">${
    top.length ? top.map(item => {
      const dateStr = item.date ? String(item.date).slice(5, 10) : ''
      const cls = { plan: 'dash-act-plan', event: 'dash-act-event', work: 'dash-act-work' }[item.type] || ''
      return `<div class="dash-act-item" onclick="${item.onclick}" style="cursor:pointer">
        <span class="dash-act-badge ${cls}">${item.label}</span>
        <span class="dash-act-detail">${esc(item.text)}</span>
        <span class="dash-act-time">${dateStr}</span>
      </div>`
    }).join('') : '<div style="color:#bbb;font-size:12px;padding:8px 0">등록된 항목이 없습니다.</div>'
  }</div>`
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

    html += `<div class="${classes.join(' ')}" data-date="${cell.date}">`
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
      const barLabel = p.phaseLabel
      const identifier = p.item.productCode || p.item.sampleNo || ''
      const tooltip = `${identifier} ${p.phaseLabel} ${p.phase.start || ''}~${p.phase.end || ''}`
      if (isPast) {
        html += `<div class="dcal-bar dcal-bar-mini" style="background:${phaseColor.bar};" title="${esc(tooltip)}" onclick="openPlanScheduleForDate('${cell.date}')"></div>`
      } else {
        html += `<div class="dcal-bar dcal-bar-plan" style="background:${phaseColor.bar}; color:${phaseColor.text};" title="${esc(tooltip)}" onclick="openPlanScheduleForDate('${cell.date}')">${esc(barLabel)}</div>`
      }
    })

    // 업무일정 바
    di.works.forEach(w => {
      if (visibleCount >= MAX_VISIBLE) return
      visibleCount++
      const wColor = getWorkCatColor(w.category)
      const label = `${w.category} ${w.title}`.trim()
      if (isPast) {
        html += `<div class="dcal-bar dcal-bar-mini" style="background:${wColor.bg};" title="${esc(label)}" onclick="openWorkDetailModal(${w.no}, true)"></div>`
      } else {
        html += `<div class="dcal-bar dcal-bar-work" style="background:${wColor.bg}; color:${wColor.text};" title="${esc(label)}" onclick="openWorkDetailModal(${w.no}, true)">${esc(label)}</div>`
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

  // Bind cell background clicks → openDashDayModal (bar/more clicks are already handled)
  container.querySelectorAll('.dcal-cell[data-date]').forEach(td => {
    td.addEventListener('click', e => {
      if (e.target.closest('.dcal-bar') || e.target.closest('.evcal-more')) return
      openDashDayModal(td.dataset.date)
    })
  })
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
      if (!sch.start || !sch.end) return
      if (dateStr === sch.start || dateStr === sch.end) {
        planHits.push({ item, phase: s })
      }
    })
  })

  const works = (State.workItems || []).filter(w => {
    const we = w.endDate || w.startDate
    return w.startDate && w.startDate <= dateStr && we >= dateStr
  })

  // Sort: events by startDate asc
  events.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
  // Sort: planHits — primary: productCode/sampleNo asc, secondary: phase order
  const PHASE_ORDER = ['design','production','image','register','logistics']
  planHits.sort((a, b) => {
    const codeA = a.item.productCode || a.item.sampleNo || ''
    const codeB = b.item.productCode || b.item.sampleNo || ''
    if (codeA !== codeB) return codeA.localeCompare(codeB)
    return PHASE_ORDER.indexOf(a.phase.key) - PHASE_ORDER.indexOf(b.phase.key)
  })
  // Sort: works — primary: category asc, secondary: startDate asc
  works.sort((a, b) => {
    if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '')
    return (a.startDate || '').localeCompare(b.startDate || '')
  })

  const modal = document.getElementById('dashDayModal')
  const fmtKo = d => d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1년 $2월 $3일') : ''
  const sections = []

  if (events.length) {
    sections.push(`<div class="ddm-section">
      <div class="ddm-section-title">행사일정 <span class="ddm-count">${events.length}</span></div>
      ${events.map(e => `<div class="ddm-row" onclick="openDashEventInfo(${e.no})">
        <span class="ddm-badge" style="background:var(--primary);color:#fff">${esc(e.channel || '')}</span>
        <span class="ddm-item-name">${esc(e.name)}</span>
        <span class="ddm-item-period">${e.startDate} ~ ${e.endDate}</span>
      </div>`).join('')}
    </div>`)
  }
  if (planHits.length) {
    const PHASE_ORDER_LABELS = [
      { key: 'design',     label: '디자인' },
      { key: 'production', label: '생산' },
      { key: 'image',      label: '이미지' },
      { key: 'register',   label: '상품등록' },
      { key: 'logistics',  label: '물류입고' },
    ]
    const phaseGroups = {}
    PHASE_ORDER_LABELS.forEach(ph => { phaseGroups[ph.key] = [] })
    planHits.forEach(hit => {
      if (phaseGroups[hit.phase.key]) phaseGroups[hit.phase.key].push(hit)
    })
    PHASE_ORDER_LABELS.forEach(ph => {
      phaseGroups[ph.key].sort((a, b) =>
        (a.item.schedule?.[ph.key]?.start || '').localeCompare(b.item.schedule?.[ph.key]?.start || '')
      )
    })

    let planBodyHtml = ''
    PHASE_ORDER_LABELS.forEach(ph => {
      const hits = phaseGroups[ph.key]
      if (!hits.length) return
      const phColor = PLAN_PHASE_COLORS[ph.key] || { bar: '#999' }
      const phaseCodes = hits.map(h => h.item.productCode || h.item.sampleNo || '')
      planBodyHtml += `<div class="ddm-phase-header" style="display:flex;align-items:center;gap:8px">
        <span style="display:inline-block;width:3px;height:14px;border-radius:1px;background:${phColor.bar}"></span>
        ${esc(ph.label)} <span class="ddm-count">${hits.length}</span>
        <button class="ddm-plan-nav" data-action="phase" data-date="${dateStr}" data-phase="${ph.key}" data-codes="${phaseCodes.join(',')}" style="margin-left:auto;font-size:10px;padding:2px 8px;border-radius:4px;background:transparent;border:1px solid var(--border);color:var(--text-light);cursor:pointer">조회</button>
      </div>`
      hits.forEach(({item, phase}) => {
        const start = item.schedule?.[phase.key]?.start || ''
        const end   = item.schedule?.[phase.key]?.end   || ''
        const code = item.productCode || item.sampleNo || ''
        planBodyHtml += `<div class="ddm-row ddm-plan-nav" data-action="item" data-codes="${esc(code)}" data-phase="" data-date="${dateStr}">
          <span class="ddm-phase-badge" style="background:${phColor.bar}">${esc(ph.label)}</span>
          <span class="ddm-item-name">${esc(code || '-')}</span>
          <span class="ddm-item-period">${start}${end && end !== start ? ' ~ ' + end : ''}</span>
        </div>`
      })
    })

    const allCodes = [...new Set(planHits.map(h => h.item.productCode || h.item.sampleNo || ''))]
    sections.push(`<div class="ddm-section">
      <div class="ddm-section-title">기획일정 <span class="ddm-count">${planHits.length}</span><button class="ddm-plan-nav" data-action="all" data-date="${dateStr}" data-codes="${allCodes.join(',')}" style="margin-left:auto;font-size:10px;padding:2px 8px;border-radius:4px;background:var(--accent);color:#fff;border:none;cursor:pointer;font-weight:600">전체조회</button></div>
      ${planBodyHtml}
    </div>`)
  }
  if (works.length) {
    sections.push(`<div class="ddm-section">
      <div class="ddm-section-title">업무일정 <span class="ddm-count">${works.length}</span></div>
      ${works.map(w => `<div class="ddm-row" onclick="openWorkDetailModal(${w.no}, true)">
        <span class="ddm-badge" style="background:${getWorkCatColor(w.category).bg};color:${getWorkCatColor(w.category).text}">${esc(w.category || '')}</span>
        <span class="ddm-item-name">${esc(w.title)}</span>
        <span class="ddm-item-period">${w.startDate} ~ ${w.endDate || w.startDate}</span>
      </div>`).join('')}
    </div>`)
  }

  modal.querySelector('.ddm-date').textContent = fmtKo(dateStr)
  modal.querySelector('.ddm-body').innerHTML = sections.join('') || '<p style="color:var(--text-light);font-size:13px">일정 없음</p>'

  // event delegation for plan nav buttons — 모달 유지한 채 탭 이동
  modal.querySelectorAll('.ddm-plan-nav').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const { action, date, codes, phase } = btn.dataset
      openTab('plan')
      const el = id => document.getElementById(id)
      el('npKeyword').value = codes || ''
      el('npSearchField').value = 'productCode'
      if (el('npPhase')) el('npPhase').value = (action === 'phase' ? (phase || '') : 'all')
      if (el('npDateFrom')) el('npDateFrom').value = ''
      if (el('npDateTo')) el('npDateTo').value = ''
      el('npConfirmed').value = 'all'
      searchPlan()
    })
  })

  // FIX: showModal() must come before centerModal() so the element is visible
  // and has real dimensions when centerModal() calculates position.
  if (!modal.open) modal.showModal()
  centerModal(modal)
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
          <button class="btn btn-primary btn-sm" onclick="closePlanScheduleModal(); openTab('event'); setTimeout(()=>editEvent(${ev.no}),200)">수정하러 가기</button>
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
  const el = id => document.getElementById(id)
  if (el('npPhase')) el('npPhase').value = 'all'
  if (el('npDateFrom')) el('npDateFrom').value = dateStr
  if (el('npDateTo')) el('npDateTo').value = dateStr
  el('npConfirmed').value = 'all'
  searchPlan()
}

// ===== 대시보드 → 기획일정 특정 아이템 기준 검색으로 이동 =====
function goToPlanWithItem(identifier) {
  closePlanScheduleModal()
  openTab('plan')
  document.getElementById('npKeyword').value = identifier
  document.getElementById('npSearchField').value = 'productCode'
  document.getElementById('npConfirmed').value = 'all'
  searchPlan()
}
window.goToPlanWithItem = goToPlanWithItem
window.openDashDayModal = openDashDayModal
