// =============================================
// ===== 대시보드 =====
// =============================================
function renderDashboard() {
  renderDashNotice()
  renderDashFree()
  renderDashActivity()
  if (typeof renderFavoritesList === 'function') renderFavoritesList()
  renderBestList()
  renderSalesSummary()
  renderMiniChart()
  renderDashCalendar()
  checkEventAlerts()
  checkPlanAlerts()
}

/* ===== Grade-based daily activity view ===== */
function _loadRecentActivity() {
  try {
    const raw = localStorage.getItem('lemango_recent_activity_v1')
    return raw ? JSON.parse(raw) : []
  } catch(e) { return [] }
}
function _currentGradeInfo() {
  const u = State.currentUser || {}
  const grade = u.grade || (typeof _currentUserGrade !== 'undefined' ? _currentUserGrade : 1) || 1
  const uid = (window.auth && auth.currentUser) ? auth.currentUser.uid : (u.uid || '')
  const dept = (typeof _currentUserDept !== 'undefined' && _currentUserDept) || u.dept || ''
  return { grade, uid, dept }
}
function _filterByGrade(logs, info) {
  if (info.grade >= 3) return logs
  if (info.grade === 2) return logs.filter(l => l.uid === info.uid || (l.userDept && l.userDept === info.dept))
  return logs.filter(l => l.uid === info.uid)
}
function _gradeTitle(grade) {
  if (grade >= 3) return '오늘 팀 활동'
  if (grade === 2) return '오늘 부서 활동'
  return '오늘 나의 활동'
}
function buildDailyTeamSummary() {
  const area = document.getElementById('dailySummaryArea')
  if (!area) return
  const info = _currentGradeInfo()
  const todayStr = (typeof fmtDate === 'function') ? fmtDate(new Date()) : new Date().toISOString().slice(0,10)
  const all = _loadRecentActivity()
  const todayLogs = _filterByGrade(all, info).filter(l => String(l.timestamp || '').slice(0,10) === todayStr)
  todayLogs.sort((a,b) => String(b.timestamp).localeCompare(String(a.timestamp)))
  const title = _gradeTitle(info.grade)
  const count = todayLogs.length
  const showUser = info.grade >= 2
  if (!count) {
    area.innerHTML = `<div class="daily-activity-section"><div class="daily-activity-header"><div class="daily-activity-title">${esc(title)}<span class="daily-activity-count">0건</span></div><button class="daily-activity-more" onclick="openActivityDetailModal()">더보기</button></div><div class="daily-activity-empty">아직 활동이 없습니다</div></div>`
    return
  }
  const top = todayLogs.slice(0, 3)
  const rows = top.map(l => {
    const t = String(l.timestamp).slice(11,16)
    const uname = (typeof formatUserName === 'function') ? formatUserName(l.userName || '', l.userPosition || '') : (l.userName || '')
    const desc = l.detail || l.target || l.action || ''
    const userCol = showUser ? `<div class="daily-activity-user">${esc(uname)}</div>` : ''
    return `<div class="daily-activity-item"><div class="daily-activity-time">${esc(t)}</div>${userCol}<div class="daily-activity-desc">${esc(desc)}</div></div>`
  }).join('')
  const overflow = count > 3 ? `<div class="daily-activity-overflow">외 ${count - 3}건</div>` : ''
  area.innerHTML = `<div class="daily-activity-section"><div class="daily-activity-header"><div class="daily-activity-title">${esc(title)}<span class="daily-activity-count">${count}건</span></div><button class="daily-activity-more" onclick="openActivityDetailModal()">더보기</button></div>${rows}${overflow}</div>`
}
window.buildDailyTeamSummary = buildDailyTeamSummary

function openActivityDetailModal() {
  const modal = document.getElementById('activityDetailModal')
  if (!modal) return
  const info = _currentGradeInfo()
  const titleEl = document.getElementById('activityModalTitle')
  if (titleEl) {
    const map = { 1: '나의 활동 내역', 2: '부서 활동 내역' }
    titleEl.textContent = map[info.grade] || '팀 활동 내역'
  }
  const dateEl = document.getElementById('activityDateFilter')
  if (dateEl) dateEl.value = (typeof fmtDate === 'function') ? fmtDate(new Date()) : new Date().toISOString().slice(0,10)
  const searchEl = document.getElementById('activitySearchInput')
  if (searchEl) searchEl.value = ''
  filterActivityLogs()
  if (!modal.open) modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
}
window.openActivityDetailModal = openActivityDetailModal

function filterActivityLogs() {
  const listEl = document.getElementById('activityModalList')
  if (!listEl) return
  const info = _currentGradeInfo()
  const all = _loadRecentActivity()
  let data = _filterByGrade(all, info)
  const dateVal = (document.getElementById('activityDateFilter') || {}).value || ''
  const kw = ((document.getElementById('activitySearchInput') || {}).value || '').trim().toLowerCase()
  if (dateVal) data = data.filter(l => String(l.timestamp || '').slice(0,10) === dateVal)
  if (kw) data = data.filter(l => {
    const hay = `${l.userName||''} ${l.detail||''} ${l.target||''} ${l.action||''}`.toLowerCase()
    return hay.includes(kw)
  })
  data.sort((a,b) => String(b.timestamp).localeCompare(String(a.timestamp)))
  const total = data.length
  if (!total) {
    listEl.innerHTML = `<div class="activity-modal-count">총 0건</div><div class="activity-modal-empty">활동 내역이 없습니다</div>`
    return
  }
  const capped = data.slice(0, 100)
  const rows = capped.map(l => {
    const ts = String(l.timestamp || '')
    const t = ts.length >= 16 ? `${ts.slice(5,10)} ${ts.slice(11,16)}` : ts
    const uname = (typeof formatUserName === 'function') ? formatUserName(l.userName || '', l.userPosition || '') : (l.userName || '')
    const desc = l.detail || l.target || l.action || ''
    return `<div class="activity-modal-item"><div class="activity-modal-time">${esc(t)}</div><div class="activity-modal-user">${esc(uname)}</div><div class="activity-modal-desc">${esc(desc)}</div></div>`
  }).join('')
  const overflow = total > 100 ? `<div class="activity-modal-overflow">최근 100건까지 표시 (총 ${total}건)</div>` : ''
  listEl.innerHTML = `<div class="activity-modal-count">총 ${total}건</div>${rows}${overflow}</div>`
}
window.filterActivityLogs = filterActivityLogs

/* ===== Feature 8: Deadline CSS class helper ===== */
function getDeadlineClass(endDate) {
  if (!endDate) return ''
  const today = new Date(); today.setHours(0,0,0,0)
  const end = new Date(endDate); end.setHours(0,0,0,0)
  if (isNaN(end.getTime())) return ''
  const diff = Math.round((end - today) / 86400000)
  if (diff < 0) return 'deadline-overdue'
  if (diff === 0) return 'deadline-today'
  if (diff <= 2) return 'deadline-urgent'
  if (diff <= 5) return 'deadline-soon'
  return ''
}
window.getDeadlineClass = getDeadlineClass

// ===== 알림 자동 생성: 행사일정 =====
function checkEventAlerts() {
  const today = new Date().toISOString().slice(0, 10)
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  _events.forEach(ev => {
    if (ev.startDate === today) {
      addNotification('event_start', `행사 시작: ${ev.name}`, `${ev.channel || ''} ${ev.startDate}~${ev.endDate}`, '#event:' + ev.no)
    } else if (ev.startDate > today && ev.startDate <= soon) {
      const days = Math.ceil((new Date(ev.startDate) - new Date(today)) / 86400000)
      addNotification('event_start', `행사 D-${days}: ${ev.name}`, `${ev.channel || ''} ${ev.startDate} 시작`, '#event:' + ev.no)
    }
    // FIX: event_end D-3 알림 추가 (기존에는 당일만 체크, D-3 누락)
    if (ev.endDate < today) {
      // 지난 행사는 알림 생성 생략 (노이즈 방지)
    } else if (ev.endDate === today) {
      addNotification('event_end', `행사 종료: ${ev.name}`, `${ev.channel || ''} 오늘 종료`, '#event:' + ev.no)
    } else if (ev.endDate > today && ev.endDate <= soon) {
      const days = Math.ceil((new Date(ev.endDate) - new Date(today)) / 86400000)
      addNotification('event_end', `행사 종료 D-${days}: ${ev.name}`, `${ev.channel || ''} ${ev.endDate} 종료`, '#event:' + ev.no)
    }
  })
}

// ===== 알림 자동 생성: 기획일정 마감 =====
function checkPlanAlerts() {
  const today = new Date().toISOString().slice(0, 10)
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  State.planItems.filter(it => !it.confirmed).forEach(it => {
    if (!it.schedule) return
    SCHEDULE_DEFS.forEach(def => {
      const sch = it.schedule[def.key]
      if (!sch || !sch.end) return
      if (sch.end < today) {
        addNotification('plan_deadline', `기획 지연: ${def.label}`, `${it.productCode || it.nameKr || ''} ${def.label} ${sch.end} 지연`, '#plan:' + it.no)
      } else if (sch.end === today) {
        addNotification('plan_deadline', `기획 D-Day: ${def.label}`, `${it.productCode || it.nameKr || ''} ${def.label} 오늘 마감`, '#plan:' + it.no)
      } else if (sch.end > today && sch.end <= soon) {
        const days = Math.ceil((new Date(sch.end) - new Date(today)) / 86400000)
        addNotification('plan_deadline', `기획 D-${days}: ${def.label}`, `${it.productCode || it.nameKr || ''} ${def.label} ${sch.end} 마감`, '#plan:' + it.no)
      }
    })
  })
}

// ===== 알림 자동 생성: 개인일정 (작성자 본인 - 강제, 설정 무시) =====
function checkPersonalScheduleAlerts() {
  const uid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : ''
  if (!uid) return
  const schedules = (typeof _personalSchedules !== 'undefined' && _personalSchedules) ? _personalSchedules : []
  const today = new Date().toISOString().slice(0, 10)
  const tmr = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  schedules.forEach(ps => {
    if (ps.createdBy !== uid) return
    const title = ps.title || '개인일정'
    if (ps.startDate === today) {
      addNotification('ps_start', '📅 개인일정 시작', '오늘 시작: ' + title, '#work:personal:' + ps.id)
    }
    if (ps.startDate === tmr) {
      addNotification('ps_upcoming', '📅 개인일정 내일', '내일 시작: ' + title, '#work:personal:' + ps.id)
    }
    if (ps.endDate && ps.endDate === today && ps.startDate !== today) {
      addNotification('ps_end', '📅 개인일정 종료', '오늘 종료: ' + title, '#work:personal:' + ps.id)
    }
  })
}
window.checkPersonalScheduleAlerts = checkPersonalScheduleAlerts

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
      return `<div class="dash-notice-item" onclick="openDashPostPreview('notice','${p.id}')">
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

// ===== 대시보드 자유게시판 미니 섹션 =====
async function renderDashFree() {
  const el = document.getElementById('dashFreeCard')
  if (!el) return
  el.innerHTML = `<div class="dash-mini-header"><span class="dash-mini-title">자유게시판</span><span class="dash-mini-more" onclick="openTab('board');switchBoardType('free')">더보기</span></div><div class="dash-mini-body" style="color:#bbb;font-size:12px">로딩 중...</div>`
  if (!db) return
  try {
    const snap = await db.collection('posts').where('boardType', '==', 'free').get()
    let posts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    posts.sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()
      const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()
      return tb - ta
    })
    posts = posts.slice(0, 5)
    if (!posts.length) {
      el.querySelector('.dash-mini-body').innerHTML = '<div style="color:#bbb;font-size:12px;padding:8px 0">게시글이 없습니다.</div>'
      return
    }
    el.querySelector('.dash-mini-body').innerHTML = posts.map(p => {
      const ts = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)
      const dateStr = ts.toISOString().slice(0, 10)
      const isNew = (Date.now() - ts.getTime()) < 24 * 60 * 60 * 1000
      const cc = p.commentCount ? `<span class="dash-notice-date">💬${p.commentCount}</span>` : ''
      return `<div class="dash-notice-item" onclick="openDashPostPreview('free','${p.id}')">
        <span class="dash-notice-text">${esc(p.title)}</span>
        ${isNew ? '<span class="brd-new" style="font-size:8px;padding:0 3px">N</span>' : ''}
        ${cc}
        <span class="dash-notice-date">${dateStr}</span>
      </div>`
    }).join('')
  } catch (e) {
    console.error('Dashboard free error:', e)
    el.querySelector('.dash-mini-body').innerHTML = ''
  }
}
window.renderDashFree = renderDashFree

// ===== 대시보드 게시글 미리보기 모달 =====
let _dashInfoTarget = null
let _dashInfoPostId = null
async function openDashPostPreview(boardType, postId) {
  const modal = document.getElementById('dashInfoModal')
  const titleEl = document.getElementById('dashInfoTitle')
  const body = document.getElementById('dashInfoBody')
  if (!modal || !body || !db) return
  _dashInfoTarget = boardType
  _dashInfoPostId = postId
  titleEl.textContent = boardType === 'notice' ? '📢 공지사항' : '💬 자유게시판'
  body.innerHTML = '<div style="color:#999;font-size:12px">로딩 중...</div>'
  if (typeof centerModal === 'function') centerModal(modal)
  modal.showModal()
  try {
    const doc = await db.collection('posts').doc(postId).get()
    if (!doc.exists) { body.innerHTML = '<div style="color:#c00">게시글 없음</div>'; return }
    const p = doc.data()
    const ts = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)
    const dateStr = ts.toISOString().slice(0, 16).replace('T', ' ')
    const author = p.authorName || '-'
    const content = esc(p.content || '').replace(/\n/g, '<br>')
    const commentHtml = (typeof buildCommentSection === 'function') ? buildCommentSection('board', postId) : ''
    body.innerHTML = `
      <h3 style="margin:0 0 8px;font-size:17px;color:var(--primary)">${p.pinned ? '★ ' : ''}${esc(p.title || '')}</h3>
      <div style="color:#888;font-size:12px;margin-bottom:14px;border-bottom:1px solid #eee;padding-bottom:10px">${esc(author)} · ${dateStr} · 조회 ${p.views || 0}</div>
      <div style="font-size:13px;line-height:1.7;color:#333;white-space:pre-wrap;min-height:80px;margin-bottom:18px">${content}</div>
      ${commentHtml}
    `
    if (typeof loadComments === 'function') loadComments('board', postId)
  } catch (e) {
    console.error(e); body.innerHTML = '<div style="color:#c00">로드 실패</div>'
  }
}
window.openDashPostPreview = openDashPostPreview

async function openDashInfoModal(type) {
  const modal = document.getElementById('dashInfoModal')
  const titleEl = document.getElementById('dashInfoTitle')
  const body = document.getElementById('dashInfoBody')
  if (!modal || !body) return
  _dashInfoTarget = type
  let title = '', html = '<div style="color:#999;font-size:12px">로딩 중...</div>'
  if (type === 'notice') title = '📢 공지사항'
  else if (type === 'free') title = '💬 자유게시판'
  else if (type === 'activity') title = '🕒 최근 등록'
  titleEl.textContent = title
  body.innerHTML = html
  if (typeof centerModal === 'function') centerModal(modal)
  modal.showModal()

  if (type === 'notice' || type === 'free') {
    if (!db) { body.innerHTML = '<div style="color:#999">DB 연결 없음</div>'; return }
    try {
      const snap = await db.collection('posts').where('boardType', '==', type).get()
      let posts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      posts.sort((a, b) => {
        if (type === 'notice') {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
        }
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()
        return tb - ta
      })
      posts = posts.slice(0, 20)
      if (!posts.length) { body.innerHTML = '<div style="color:#999;font-size:13px;padding:12px">게시글이 없습니다.</div>'; return }
      body.innerHTML = posts.map(p => {
        const ts = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)
        const dateStr = ts.toISOString().slice(0, 10)
        const isNew = (Date.now() - ts.getTime()) < 24 * 60 * 60 * 1000
        const pin = p.pinned ? '<span style="color:var(--accent);margin-right:4px">&#9733;</span>' : ''
        const cc = p.commentCount ? `<span style="color:#888;font-size:11px;margin-left:6px">💬${p.commentCount}</span>` : ''
        const newB = isNew ? '<span class="brd-new" style="font-size:9px;padding:0 4px;margin-left:4px">N</span>' : ''
        return `<div class="dash-notice-item" style="padding:8px 4px;border-bottom:1px solid #f0f0f0" onclick="document.getElementById('dashInfoModal').close();openTab('board');switchBoardType('${type}');openBoardPost('${p.id}')">
          ${pin}<span class="dash-notice-text">${esc(p.title)}</span>${newB}${cc}
          <span class="dash-notice-date" style="margin-left:auto">${dateStr}</span>
        </div>`
      }).join('')
    } catch (e) {
      console.error(e); body.innerHTML = '<div style="color:#c00;font-size:12px">로드 실패</div>'
    }
  } else if (type === 'activity') {
    const items = []
    if (State.planItems) State.planItems.forEach(p => items.push({ type:'plan', label:'기획', text:(p.productCode||p.sampleNo||'')+' '+(p.nameKr||''), date:p.registeredAt||p.createdAt||'', tab:'plan' }))
    if (typeof _events !== 'undefined' && _events) _events.forEach(e => items.push({ type:'event', label:'행사', text:(e.name||'')+' ('+(e.startDate||'')+'~'+(e.endDate||'')+')', date:e.registeredAt||e.startDate||'', tab:'event' }))
    if (State.workItems) State.workItems.forEach(w => items.push({ type:'work', label:'업무', text:(w.title||w.category||'')+' ('+(w.startDate||'')+')', date:w.registeredAt||w.startDate||'', tab:'work' }))
    items.sort((a,b) => new Date(b.date||0) - new Date(a.date||0))
    const top = items.slice(0, 20)
    body.innerHTML = top.length ? top.map(it => {
      const ds = it.date ? String(it.date).slice(0,10) : ''
      const cls = { plan:'dash-act-plan', event:'dash-act-event', work:'dash-act-work' }[it.type] || ''
      return `<div class="dash-act-item" style="padding:8px 4px;border-bottom:1px solid #f0f0f0;cursor:pointer" onclick="document.getElementById('dashInfoModal').close();openTab('${it.tab}')">
        <span class="dash-act-badge ${cls}">${it.label}</span>
        <span class="dash-act-detail">${esc(it.text)}</span>
        <span class="dash-act-time" style="margin-left:auto">${ds}</span>
      </div>`
    }).join('') : '<div style="color:#999;font-size:13px;padding:12px">등록 항목 없음</div>'
  }
}
function dashInfoGoToTab() {
  const t = _dashInfoTarget, id = _dashInfoPostId
  document.getElementById('dashInfoModal').close()
  if (t === 'notice' || t === 'free') {
    openTab('board')
    if (typeof switchBoardType === 'function') switchBoardType(t)
    if (id && typeof openBoardPost === 'function') setTimeout(() => openBoardPost(id), 150)
  } else if (typeof t === 'string' && t.indexOf('activity:') === 0) {
    const sub = t.slice(9)
    if (sub === 'plan') {
      openTab('plan')
      setTimeout(() => { if (typeof openPlanDetailModal === 'function') openPlanDetailModal(id) }, 350)
    } else if (sub === 'event') {
      openTab('event')
      setTimeout(() => { if (typeof openEventDetailModal === 'function') openEventDetailModal(id, false) }, 350)
    } else if (sub === 'work') {
      openTab('work')
      setTimeout(() => { if (typeof openWorkDetailModal === 'function') openWorkDetailModal(id, false) }, 350)
    } else if (sub === 'personal') {
      openTab('work')
      if (typeof switchWorkTab === 'function') setTimeout(() => switchWorkTab('personal'), 100)
      setTimeout(() => { if (typeof openPersonalDetailModal === 'function') openPersonalDetailModal(id) }, 400)
    }
  }
}
window.openDashInfoModal = openDashInfoModal
window.dashInfoGoToTab = dashInfoGoToTab

function openDashActivityPreview(type, no) {
  const modal = document.getElementById('dashInfoModal')
  const titleEl = document.getElementById('dashInfoTitle')
  const body = document.getElementById('dashInfoBody')
  if (!modal || !body) return
  _dashInfoTarget = 'activity:' + type
  _dashInfoPostId = no
  let item = null, title = '', author = '', dateStr = '', content = ''
  if (type === 'plan') {
    item = (State.planItems || []).find(x => x.no === no)
    if (!item) return
    title = '📋 ' + (item.productCode || item.sampleNo || '기획')
    author = item.createdByName || '-'
    dateStr = (item.registeredAt || item.createdAt || '').slice(0, 16).replace('T', ' ')
    const parts = []
    if (item.nameKr) parts.push('상품명: ' + item.nameKr)
    if (item.brand) parts.push('브랜드: ' + item.brand)
    if (item.type) parts.push('타입: ' + item.type)
    if (item.season) parts.push('시즌: ' + item.season)
    if (item.memo) parts.push('\n' + item.memo)
    content = parts.join('\n')
  } else if (type === 'event') {
    item = (typeof _events !== 'undefined' ? _events : []).find(x => x.no === no)
    if (!item) return
    title = '🎪 ' + (item.name || '행사')
    author = item.createdByName || '-'
    dateStr = (item.registeredAt || item.startDate || '').slice(0, 16).replace('T', ' ')
    const parts = []
    if (item.channel) parts.push('채널: ' + item.channel)
    if (item.startDate) parts.push('기간: ' + item.startDate + ' ~ ' + (item.endDate || ''))
    if (item.discount) parts.push('할인: ' + item.discount + '%')
    if (item.support) parts.push('지원: ' + item.support + '%')
    if (item.memo) parts.push('\n' + item.memo)
    content = parts.join('\n')
  } else if (type === 'personal') {
    item = (typeof _personalSchedules !== 'undefined' ? _personalSchedules : []).find(x => x.id === no)
    if (!item) return
    title = '📅 ' + (item.title || '개인일정')
    author = item.createdByName || '-'
    dateStr = (item.createdAt && item.createdAt.toDate ? item.createdAt.toDate().toISOString() : (item.createdAt || item.startDate || '')).toString().slice(0, 16).replace('T', ' ')
    const parts = []
    if (item.category) parts.push('카테고리: ' + item.category)
    if (item.startDate) parts.push('기간: ' + item.startDate + ' ~ ' + (item.endDate || item.startDate))
    if (item.startTime) parts.push('시간: ' + item.startTime + (item.endTime ? ' ~ ' + item.endTime : ''))
    if (item.memo) parts.push('\n' + item.memo)
    content = parts.join('\n')
  } else if (type === 'work') {
    item = (State.workItems || []).find(x => x.no === no)
    if (!item) return
    title = '📝 ' + (item.title || item.category || '업무')
    author = item.createdByName || '-'
    dateStr = (item.registeredAt || item.startDate || '').slice(0, 16).replace('T', ' ')
    const parts = []
    if (item.category) parts.push('카테고리: ' + item.category)
    if (item.startDate) parts.push('기간: ' + item.startDate + ' ~ ' + (item.endDate || ''))
    if (item.memo) parts.push('\n' + item.memo)
    content = parts.join('\n')
  } else return
  titleEl.textContent = title
  const commentHtml = (typeof buildCommentSection === 'function') ? buildCommentSection(type, no) : ''
  body.innerHTML = `
    <h3 style="margin:0 0 8px;font-size:17px;color:var(--primary)">${esc(title)}</h3>
    <div style="color:#888;font-size:12px;margin-bottom:14px;border-bottom:1px solid #eee;padding-bottom:10px">${esc(author)}${dateStr ? ' · ' + dateStr : ''}</div>
    <div style="font-size:13px;line-height:1.7;color:#333;white-space:pre-wrap;min-height:80px;margin-bottom:18px">${esc(content)}</div>
    ${commentHtml}
  `
  if (typeof loadComments === 'function') loadComments(type, no)
  if (typeof centerModal === 'function') centerModal(modal)
  modal.showModal()
}
window.openDashActivityPreview = openDashActivityPreview

// ===== 대시보드 최근 등록 미니 섹션 =====
function renderDashActivity() {
  const el = document.getElementById('dashActivityCard')
  if (!el) return

  const items = []

  const _ts = v => { if (!v) return 0; const t = new Date(v).getTime(); return isNaN(t) ? 0 : t }

  // 1. 신규기획
  if (State.planItems && State.planItems.length) {
    State.planItems.forEach(p => {
      const d = p.createdAt || p.registeredAt || ''
      items.push({
        type: 'plan', label: '기획',
        text: (p.productCode || p.sampleNo || '') + ' ' + (p.nameKr || ''),
        date: d, sortTs: _ts(d) || (p.no || 0),
        onclick: `openDashActivityPreview('plan',${p.no})`, refId: p.no
      })
    })
  }

  // 2. 행사일정
  if (_events && _events.length) {
    _events.forEach(e => {
      const d = e.createdAt || e.registeredAt || ''
      items.push({
        type: 'event', label: '행사',
        text: (e.name || '') + ' (' + (e.startDate || '') + '~' + (e.endDate || '') + ')',
        date: d, sortTs: _ts(d) || (e.no || 0),
        onclick: `openDashActivityPreview('event',${e.no})`, refId: e.no
      })
    })
  }

  // 3. 업무일정
  if (State.workItems && State.workItems.length) {
    State.workItems.forEach(w => {
      const d = w.createdAt || w.registeredAt || ''
      items.push({
        type: 'work', label: '업무',
        text: (w.title || w.category || '') + ' (' + (w.startDate || '') + ')',
        date: d, sortTs: _ts(d) || (w.no || 0),
        onclick: `openDashActivityPreview('work',${w.no})`, refId: w.no
      })
    })
  }

  // Sort by date desc, take top 7
  items.sort((a, b) => b.sortTs - a.sortTs)
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
    const thumb = getThumbUrl(p) || PLACEHOLDER_IMG
    const rankClass = i < 3 ? `rank-${i+1}` : ''
    return `<div class="best-item" onclick="goToSales('${p.productCode}')">
      <span class="rank ${rankClass}">${i+1}</span>
      <img src="${thumb}" class="best-thumb" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" />
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

// 기획 일정 단계별 색상 — 동적 (getPlanPhases 기준)
function _getPlanPhaseColor(phaseKey) {
  const ph = getPlanPhases().find(p => p.key === phaseKey)
  return { bar: (ph && ph.color) || '#999', text: '#fff' }
}
// 이전 호환용 (코드에서 `PLAN_PHASE_COLORS[key]` 접근 시)
const PLAN_PHASE_COLORS = new Proxy({}, {
  get: (_, phaseKey) => _getPlanPhaseColor(phaseKey)
})

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
  const dateItems = {} // { 'yyyy-mm-dd': { events: [], plans: [], works: [], personal: [] } }

  // 행사일정
  _events.forEach(ev => {
    if (ev.endDate < gridStart || ev.startDate > gridEnd) return
    const s = ev.startDate < gridStart ? gridStart : ev.startDate
    const e = ev.endDate > gridEnd ? gridEnd : ev.endDate
    getDateRange(s, e).forEach(d => {
      if (!dateItems[d]) dateItems[d] = { events: [], plans: [], works: [], personal: [] }
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
        if (!dateItems[d]) dateItems[d] = { events: [], plans: [], works: [], personal: [] }
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
      if (!dateItems[d]) dateItems[d] = { events: [], plans: [], works: [], personal: [] }
      if (!dateItems[d].works.find(x => x.no === w.no)) dateItems[d].works.push(w)
    })
  })

  // 개인일정
  const psVisible = typeof getVisibleSchedules === 'function' ? getVisibleSchedules() : []
  psVisible.forEach(ps => {
    if (!ps.startDate) return
    const pEnd = ps.endDate || ps.startDate
    if (pEnd < gridStart || ps.startDate > gridEnd) return
    const s = ps.startDate < gridStart ? gridStart : ps.startDate
    const e = pEnd > gridEnd ? gridEnd : pEnd
    getDateRange(s, e).forEach(d => {
      if (!dateItems[d]) dateItems[d] = { events: [], plans: [], works: [], personal: [] }
      if (!dateItems[d].personal.find(x => x.id === ps.id)) dateItems[d].personal.push(ps)
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
    const di = dateItems[cell.date] || { events: [], plans: [], works: [], personal: [] }
    const isPast   = cell.date < todayStr
    const hasItems = di.events.length > 0 || di.plans.length > 0 || di.works.length > 0 || (di.personal && di.personal.length > 0)

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

    const MAX_VISIBLE = 9999
    let visibleCount = 0

    // 업무일정 바 (TOP)
    di.works.forEach(w => {
      if (visibleCount >= MAX_VISIBLE) return
      visibleCount++
      const wColor = getWorkCatColor(w.category)
      const timePrefix = (w.startTime && cell.date === w.startDate) ? (w.startTime + ' ') : ''
      const isVacation = w.category === '연차' || w.category === '반차'
      const authorSuffix = (isVacation && w.createdByName) ? ' ' + (typeof formatUserName === 'function' ? formatUserName(w.createdByName, w.createdByPosition) : w.createdByName) : ''
      const label = `${timePrefix}${w.category} ${w.title || ''}${authorSuffix}`.trim()
      if (isPast) {
        html += `<div class="dcal-bar dcal-bar-mini" style="background:${wColor.bg};" title="${esc(label)}" onclick="openDashActivityPreview('work',${w.no})"></div>`
      } else {
        const wAuthor = w.createdByName ? (typeof formatUserName==='function' ? formatUserName(w.createdByName, w.createdByPosition) : w.createdByName) : ''
        let wRight = ''
        if (wAuthor) wRight += `<span class="bar-author">${esc(wAuthor)}</span>`
        if (w.useVehicle === true) wRight += `<span class="bar-vehicle">🚗</span>`
        html += `<div class="dcal-bar dcal-bar-work" style="background:${wColor.bg}; color:${wColor.text};display:flex;justify-content:space-between;align-items:center;gap:4px" title="${esc(label)}" onclick="openDashActivityPreview('work',${w.no})"><span class="bar-text">${esc(label)}</span><span class="bar-right">${wRight}</span></div>`
      }
    })

    // 행사 바
    di.events.forEach(ev => {
      if (visibleCount >= MAX_VISIBLE) return
      visibleCount++
      const color = EV_COLORS[ev.no % EV_COLORS.length]
      const label = esc(`${ev.channel || ''} ${ev.name}`.trim())
      if (isPast) {
        html += `<div class="dcal-bar dcal-bar-mini" style="background:${color.bar};" title="${label}" onclick="openDashActivityPreview('event',${ev.no})"></div>`
      } else {
        html += `<div class="dcal-bar dcal-bar-ev" style="background:${color.bar}; color:${color.text};" title="${label} (${ev.startDate}~${ev.endDate})" onclick="openDashActivityPreview('event',${ev.no})">${label}</div>`
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

    // 개인일정 바
    const psUid = firebase.auth().currentUser?.uid
    if (di.personal) di.personal.forEach(ps => {
      if (visibleCount >= MAX_VISIBLE) return
      visibleCount++
      const isMine = ps.createdBy === psUid
      const barBg = isMine ? '#7C3AED' : '#0891B2'
      const psTimePrefix = (ps.startTime && cell.date === ps.startDate) ? (ps.startTime + ' ') : ''
      const label = `${psTimePrefix}${ps.category || ''} ${ps.title}`.trim()
      if (isPast) {
        html += `<div class="dcal-bar dcal-bar-mini" style="background:${barBg};opacity:0.6" title="${esc(label)}" onclick="openDashActivityPreview('personal','${ps.id}')"></div>`
      } else {
        html += `<div class="dcal-bar" style="background:${barBg};color:#fff;padding:1px 4px;border-radius:3px;font-size:10px;margin-bottom:1px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(label)}" onclick="openDashActivityPreview('personal','${ps.id}')">${esc(label)}</div>`
      }
    })


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
  const PHASE_ORDER = getPlanPhases().map(p => p.key)
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
      ${events.map(e => `<div class="ddm-row" onclick="document.getElementById('dashDayModal').close();openDashActivityPreview('event',${e.no})">
        <span class="ddm-badge" style="background:var(--primary);color:#fff">${esc(e.channel || '')}</span>
        <span class="ddm-item-name">${esc(e.name)}</span>
        <span class="ddm-item-period">${e.startDate} ~ ${e.endDate}</span>
      </div>`).join('')}
    </div>`)
  }
  if (planHits.length) {
    const PHASE_ORDER_LABELS = getPlanPhases().map(p => ({ key: p.key, label: p.label }))
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
      ${works.map(w => `<div class="ddm-row" onclick="document.getElementById('dashDayModal').close();openDashActivityPreview('work',${w.no})">
        <span class="ddm-badge" style="background:${getWorkCatColor(w.category).bg};color:${getWorkCatColor(w.category).text}">${esc(w.category || '')}</span>
        <span class="ddm-item-name">${esc(w.title)}</span>
        <span class="ddm-item-period">${w.startDate} ~ ${w.endDate || w.startDate}</span>
      </div>`).join('')}
    </div>`)
  }

  const psVisible = typeof getVisibleSchedules === 'function' ? getVisibleSchedules() : []
  const personalHits = psVisible.filter(ps => {
    const pEnd = ps.endDate || ps.startDate
    return ps.startDate && ps.startDate <= dateStr && pEnd >= dateStr
  })
  if (personalHits.length) {
    const psUid = firebase.auth().currentUser?.uid
    sections.push(`<div class="ddm-section">
      <div class="ddm-section-title">개인일정 <span class="ddm-count">${personalHits.length}</span></div>
      ${personalHits.map(ps => {
        const catColor = PS_CAT_COLORS[ps.category] || PS_CAT_COLORS['기타']
        const isMine = ps.createdBy === psUid
        return `<div class="ddm-row" onclick="document.getElementById('dashDayModal').close();openDashActivityPreview('personal','${ps.id}')">
          <span class="ddm-badge" style="background:${catColor.bg};color:#fff">${esc(ps.category || '')}</span>
          <span class="ddm-item-name">${esc(ps.title)}${!isMine ? ' <span style="color:var(--text-sub);font-size:10px">(' + esc(formatUserName(ps.createdByName, ps.createdByPosition)) + ')</span>' : ''}</span>
          <span class="ddm-item-period">${ps.startDate} ~ ${ps.endDate || ps.startDate}</span>
        </div>`
      }).join('')}
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
  const title = document.getElementById('planSchedTitle')
  const body  = document.getElementById('planSchedBody')

  title.textContent = `기획 일정 — ${dateStr}`

  const phaseGroups = {}
  SCHEDULE_DEFS.forEach(def => { phaseGroups[def.key] = [] })

  const _seen = new Set()
  State.planItems.forEach(item => {
    if (!item.schedule) return
    SCHEDULE_DEFS.forEach(def => {
      const ph = item.schedule[def.key]
      if (!ph || !ph.start || !ph.end) return
      if (ph.start === dateStr || ph.end === dateStr) {
        const dedupeKey = (item.no || item.productCode || item.sampleNo || '') + '|' + def.key
        if (_seen.has(dedupeKey)) return
        _seen.add(dedupeKey)
        const tags = []
        if (ph.start === dateStr) tags.push('시작')
        if (ph.end === dateStr) tags.push('완료')
        phaseGroups[def.key].push({ item, tag: tags.join(' / '), start: ph.start, end: ph.end })
      }
    })
  })

  const hasAny = SCHEDULE_DEFS.some(def => phaseGroups[def.key].length > 0)

  if (!hasAny) {
    body.innerHTML = '<p style="padding:20px;color:var(--text-sub);">해당 날짜에 기획 일정이 없습니다.</p>'
  } else {
    const today = new Date(); today.setHours(0,0,0,0)
    const fmtMD = s => s ? s.slice(5).replace('-', '.') : '-'
    const statusOf = (start, end) => {
      const s = new Date(start), e = new Date(end)
      if (today > e) return { cls:'ps-phase-status-done', txt:'완료' }
      if (today >= s) return { cls:'ps-phase-status-ing', txt:'진행' }
      return { cls:'ps-phase-status-wait', txt:'대기' }
    }
    let html = '<div class="ps-phase-table-header"><span style="width:96px">품번</span><span style="width:38px;text-align:center">상태</span><span style="width:110px;margin:0 6px">품명</span><span style="width:42px;text-align:center">시작</span><span style="width:42px;text-align:center">완료</span></div>'
    SCHEDULE_DEFS.forEach(def => {
      const items = phaseGroups[def.key]
      if (!items.length) return
      const phColor = PLAN_PHASE_COLORS[def.key] || { bar:'#999' }
      html += `<div class="ps-phase-group">
        <div class="ps-phase-group-header">
          <span class="ps-phase-group-dot" style="background:${phColor.bar}"></span>
          <span class="ps-phase-group-name">${esc(def.label)}</span>
          <span class="ps-phase-group-count">${items.length}건</span>
        </div>
        <div class="ps-phase-items">`
      items.forEach(({ item, start, end }) => {
        const code = item.productCode || item.sampleNo || '-'
        const identifier = item.productCode || item.sampleNo || ''
        const name = item.nameKr || item.nameEn || ''
        const st = statusOf(start, end)
        html += `<div class="ps-phase-row">
          <span class="ps-phase-code" title="${esc(code)}">${esc(code)}</span>
          <span class="ps-phase-status ${st.cls}">${st.txt}</span>
          <span class="ps-phase-name" title="${esc(name)}">${esc(name)}</span>
          <span class="ps-phase-date">${fmtMD(start)}</span>
          <span class="ps-phase-date">${fmtMD(end)}</span>
          <span class="ps-phase-spacer"></span>
          <button class="ps-phase-view-btn" onclick="goToPlanWithItem('${esc(identifier)}');document.getElementById('planScheduleModal').close()">보기</button>
        </div>`
      })
      html += `</div></div>`
    })
    html += `<div class="ps-actions" style="margin-top:8px"><button class="btn btn-primary btn-sm" onclick="goToPlanWithDate('${dateStr}')">날짜로 보기</button></div>`
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
  const title = document.getElementById('planSchedTitle')
  const body  = document.getElementById('planSchedBody')

  const status = getEventStatus(ev)
  const statusBadge = { '예정': 'badge-warning', '진행중': 'badge-success', '종료': 'badge-muted' }
  const color = EV_COLORS[ev.no % EV_COLORS.length]

  title.innerHTML = `<span class="ev-info-channel" style="background:${color.bar}">${esc(ev.channel || '')}</span> ${esc(ev.name)}`

  body.innerHTML = `
    <div class="ps-ev-info">
      <div class="ps-ev-detail">
        <table class="ps-phase-table">
          <tbody>
            <tr><td class="ps-label">기간</td><td>${ev.startDate} ~ ${ev.endDate} <span class="badge ${statusBadge[status] || ''}" style="margin-left:6px">${status}</span></td></tr>
            ${ev.discount ? `<tr><td class="ps-label">할인율</td><td>${ev.discount}%</td></tr>` : ''}
            ${ev.support ? `<tr><td class="ps-label">당사지원</td><td>${ev.support}%</td></tr>` : ''}
            ${ev.memo ? `<tr><td class="ps-label">메모</td><td>${esc(ev.memo)}</td></tr>` : ''}
          </tbody>
        </table>
        <div class="ps-actions" style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="closePlanScheduleModal(); openEventDetailModal(${ev.no}, true)">상세보기</button>
          <button class="btn btn-outline btn-sm" onclick="closePlanScheduleModal(); openTab('event')">행사일정 탭</button>
        </div>
      </div>
    </div>
    <div id="dashEvCommentArea" style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">${buildCommentSection('event', ev.no)}</div>`

  modal.showModal()
  centerModal(modal)
  loadComments('event', ev.no)
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
