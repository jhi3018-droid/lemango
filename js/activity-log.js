// =============================================
// ===== 활동 로그 시스템 =====
// =============================================

// State 확장
State.activityLog = {
  all: [],
  filtered: [],
  page: 1,
  pageSize: 30,
  cat: 'all'
}

// 카테고리 → action 매핑
const AL_CAT_MAP = {
  'all':    null,
  'login':  ['login', 'logout', 'login_fail'],
  'data':   ['create', 'update', 'delete'],
  'upload': ['upload'],
  'member': ['approve', 'setting'],
  'error':  ['error']
}

// ===== Core logging function (fire-and-forget) =====
async function logActivity(action, target, detail) {
  if (!auth || !auth.currentUser || !db) return
  const user = State.currentUser
  const userName = user ? user.name : auth.currentUser.email
  const userPosition = (typeof _currentUserPosition !== 'undefined' && _currentUserPosition) || ''
  const userDept = (typeof _currentUserDept !== 'undefined' && _currentUserDept) || ''
  const uid = auth.currentUser.uid
  // Mirror to localStorage (last 500, FIFO) — fire-and-forget
  try {
    const raw = localStorage.getItem('lemango_recent_activity_v1')
    const arr = raw ? JSON.parse(raw) : []
    arr.push({ timestamp: new Date().toISOString(), uid, userName, userPosition, userDept, action, target, detail })
    while (arr.length > 500) arr.shift()
    localStorage.setItem('lemango_recent_activity_v1', JSON.stringify(arr))
  } catch(e) {}
  try {
    const docId = uid + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    await db.collection('activityLogs').doc(docId).set({
      timestamp: new Date(),
      uid,
      userName,
      userPosition,
      userDept,
      action: action,
      target: target,
      detail: detail,
      ip: ''
    })
  } catch (e) { console.warn('Log failed:', e) }
}
window.logActivity = logActivity

// ===== Load from Firestore =====
async function loadActivityLog() {
  if (!db) return
  try {
    const dateFrom = document.getElementById('alDateFrom')?.value
    const dateTo   = document.getElementById('alDateTo')?.value

    let query = db.collection('activityLogs').orderBy('timestamp', 'desc')
    if (dateFrom) query = query.where('timestamp', '>=', new Date(dateFrom + 'T00:00:00'))
    if (dateTo)   query = query.where('timestamp', '<=', new Date(dateTo + 'T23:59:59'))
    query = query.limit(5000)

    const snapshot = await query.get()
    State.activityLog.all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    filterActivityLog()
    populateAlUserFilter()
  } catch (e) {
    console.error('Activity log load error:', e)
    showToast('활동 로그 로드 실패: ' + e.message, 'danger')
  }
}

// ===== Client-side filter =====
function filterActivityLog() {
  let data = [...State.activityLog.all]
  const cat     = State.activityLog.cat
  const action  = document.getElementById('alAction')?.value || ''
  const user    = document.getElementById('alUser')?.value || ''
  const keyword = (document.getElementById('alKeyword')?.value || '').trim().toLowerCase()

  if (cat !== 'all' && AL_CAT_MAP[cat]) {
    data = data.filter(d => AL_CAT_MAP[cat].includes(d.action))
  }
  if (action) data = data.filter(d => d.action === action)
  if (user)   data = data.filter(d => d.uid === user)
  if (keyword) data = data.filter(d =>
    (d.detail || '').toLowerCase().includes(keyword) ||
    (d.userName || '').toLowerCase().includes(keyword)
  )

  State.activityLog.filtered = data
  State.activityLog.page = 1
  renderAlStats(data)
  renderActivityLogTable()
}

// ===== KPI stats =====
function renderAlStats(data) {
  const el = document.getElementById('alStats')
  if (!el) return
  const total     = data.length
  const loginOk   = data.filter(d => d.action === 'login').length
  const loginFail = data.filter(d => d.action === 'login_fail').length
  const creates   = data.filter(d => d.action === 'create').length
  const updates   = data.filter(d => d.action === 'update').length
  const deletes   = data.filter(d => d.action === 'delete').length
  const uploads   = data.filter(d => d.action === 'upload').length
  const members   = data.filter(d => ['approve','setting'].includes(d.action)).length

  el.innerHTML = `
    <div class="al-stat-card"><div class="al-stat-label">전체</div><div class="al-stat-val">${total.toLocaleString()}</div></div>
    <div class="al-stat-card"><div class="al-stat-label">로그인</div><div class="al-stat-val">${loginOk + loginFail}</div><div class="al-stat-sub">성공 ${loginOk} / 실패 ${loginFail}</div></div>
    <div class="al-stat-card"><div class="al-stat-label">데이터 변경</div><div class="al-stat-val">${creates + updates + deletes}</div><div class="al-stat-sub">등록 ${creates} / 수정 ${updates} / 삭제 ${deletes}</div></div>
    <div class="al-stat-card"><div class="al-stat-label">매출 업로드</div><div class="al-stat-val">${uploads}</div></div>
    <div class="al-stat-card"><div class="al-stat-label">회원/설정</div><div class="al-stat-val">${members}</div></div>`
}

// ===== Action badge =====
function alActionBadge(action) {
  const map = {
    'login':      ['로그인',     'al-badge-login'],
    'logout':     ['로그아웃',   'al-badge-logout'],
    'login_fail': ['로그인실패', 'al-badge-delete'],
    'create':     ['등록',       'al-badge-create'],
    'update':     ['수정',       'al-badge-update'],
    'delete':     ['삭제',       'al-badge-delete'],
    'upload':     ['업로드',     'al-badge-upload'],
    'approve':    ['승인',       'al-badge-approve'],
    'setting':    ['설정',       'al-badge-setting'],
    'error':      ['에러',       'al-badge-error']
  }
  const [label, cls] = map[action] || [action, '']
  return `<span class="al-badge ${cls}">${label}</span>`
}

// ===== Render table =====
function renderActivityLogTable() {
  const data = State.activityLog.filtered
  const ps   = State.activityLog.pageSize
  const page = State.activityLog.page
  const start = (page - 1) * ps
  const pageData = data.slice(start, start + ps)

  const countEl = document.getElementById('alResultCount')
  if (countEl) countEl.textContent = '검색결과 ' + data.length.toLocaleString() + '건'

  const tbody = document.getElementById('alTableBody')
  if (!tbody) return

  if (!pageData.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">활동 로그가 없습니다.</td></tr>'
    renderAlPagination()
    return
  }

  tbody.innerHTML = pageData.map((d, i) => {
    const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp)
    const y   = ts.getFullYear()
    const mo  = String(ts.getMonth() + 1).padStart(2, '0')
    const day = String(ts.getDate()).padStart(2, '0')
    const h   = String(ts.getHours()).padStart(2, '0')
    const mi  = String(ts.getMinutes()).padStart(2, '0')
    const s   = String(ts.getSeconds()).padStart(2, '0')
    const dateStr = `${y}-${mo}-${day} ${h}:${mi}:${s}`
    const rowStyle = d.action === 'delete' ? ' style="background:#FFF5F5"' : ''
    return `<tr${rowStyle}>
      <td style="text-align:center">${start + i + 1}</td>
      <td class="al-time">${dateStr}</td>
      <td><span class="al-user-name clickable-author" onclick="event.stopPropagation();showUserProfile('${d.uid}',this)">${esc(formatUserName(d.userName, d.userPosition))}</span></td>
      <td style="text-align:center">${alActionBadge(d.action)}</td>
      <td style="text-align:center">${esc(d.target || '-')}</td>
      <td class="al-detail-cell">${esc(d.detail)}</td>
      <td class="al-ip-cell">${esc(d.ip || '-')}</td>
    </tr>`
  }).join('')

  renderAlPagination()
}

// ===== Pagination (standalone for activityLog) =====
function renderAlPagination() {
  const container = document.getElementById('alPagination')
  if (!container) return
  const total = State.activityLog.filtered.length
  const ps    = State.activityLog.pageSize
  if (ps <= 0 || total <= ps) { container.innerHTML = ''; return }

  const totalPages = Math.ceil(total / ps)
  const page = State.activityLog.page

  let startP = Math.max(1, page - 4)
  let endP   = Math.min(totalPages, startP + 9)
  if (endP - startP < 9) startP = Math.max(1, endP - 9)

  let html = '<div class="pagination">'
  html += `<button class="page-btn" onclick="goAlPage(1)" ${page === 1 ? 'disabled' : ''}>◀◀</button>`
  html += `<button class="page-btn" onclick="goAlPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>◀</button>`
  for (let p = startP; p <= endP; p++) {
    html += `<button class="page-btn ${p === page ? 'active' : ''}" onclick="goAlPage(${p})">${p}</button>`
  }
  html += `<button class="page-btn" onclick="goAlPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>▶</button>`
  html += `<button class="page-btn" onclick="goAlPage(${totalPages})" ${page === totalPages ? 'disabled' : ''}>▶▶</button>`
  html += '</div>'
  container.innerHTML = html
}

window.goAlPage = function(p) {
  const totalPages = Math.ceil(State.activityLog.filtered.length / State.activityLog.pageSize)
  if (p < 1 || p > totalPages) return
  State.activityLog.page = p
  renderActivityLogTable()
}

// ===== Search / Reset =====
window.searchActivityLog = function() { loadActivityLog() }

window.resetActivityLog = function() {
  ;['alDateFrom','alDateTo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
  ;['alAction','alUser'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
  const kw = document.getElementById('alKeyword'); if (kw) kw.value = ''
  State.activityLog.cat = 'all'
  document.querySelectorAll('.al-cat').forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'))
  loadActivityLog()
}

// ===== Category tab click =====
document.addEventListener('click', e => {
  if (!e.target.classList.contains('al-cat')) return
  State.activityLog.cat = e.target.dataset.cat
  document.querySelectorAll('.al-cat').forEach(b => b.classList.remove('active'))
  e.target.classList.add('active')
  filterActivityLog()
})

// ===== Page size =====
window.changeAlPageSize = function() {
  State.activityLog.pageSize = Number(document.getElementById('alPageSize')?.value || 30)
  State.activityLog.page = 1
  renderActivityLogTable()
}

// ===== Excel export =====
window.exportActivityLog = function() {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  const data = State.activityLog.filtered.map((d, i) => {
    const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp)
    const y   = ts.getFullYear()
    const mo  = String(ts.getMonth() + 1).padStart(2, '0')
    const day = String(ts.getDate()).padStart(2, '0')
    const h   = String(ts.getHours()).padStart(2, '0')
    const mi  = String(ts.getMinutes()).padStart(2, '0')
    const s   = String(ts.getSeconds()).padStart(2, '0')
    return {
      'NO': i + 1,
      '일시': `${y}-${mo}-${day} ${h}:${mi}:${s}`,
      '사용자': formatUserName(d.userName, d.userPosition),
      '활동유형': d.action,
      '대상메뉴': d.target || '',
      '상세내용': d.detail,
      'IP': d.ip || ''
    }
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '활동로그')
  XLSX.writeFile(wb, '활동로그_' + new Date().toISOString().slice(0, 10) + '.xlsx')
  showToast('활동 로그 다운로드 완료', 'success')
}

// ===== Populate user filter =====
async function populateAlUserFilter() {
  const sel = document.getElementById('alUser')
  if (!sel || !db) return
  try {
    const snapshot = await db.collection('users').get()
    const current = sel.value
    sel.innerHTML = '<option value="">전체</option>'
    snapshot.docs.forEach(doc => {
      const u = doc.data()
      sel.innerHTML += `<option value="${doc.id}">${esc(u.name || '')} (${esc(u.email || '')})</option>`
    })
    if (current) sel.value = current
  } catch (e) { console.warn('User filter load failed:', e) }
}

// ===== Members inner tab switch (legacy compat → delegates to switchHrAdminTab) =====
window.switchMembersPanel = function(panel) {
  if (typeof switchHrAdminTab === 'function') switchHrAdminTab(panel)
}
