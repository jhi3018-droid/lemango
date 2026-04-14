// =============================================
// ===== 인사관리 탭 (연차/출퇴근/개인정보/급여) =====
// =============================================

// ===== Firestore 출퇴근/연차/연차쿼터 캐시 =====
var _attendCache = {}   // { uid: [ {date, checkIn, checkOut, ...} ] }
var _leaveCache = {}    // { uid: [ {id, type, startDate, ...} ] }
var _quotaCache = {}    // { uid: { total, year } }
var _hrDataLoaded = false

// 초기 로드 (앱 시작 시 호출)
window.loadHrData = async function() {
  if (!db) return
  try {
    var snap = await db.collection('attendance').get()
    var att = {}
    snap.docs.forEach(function(doc) {
      var d = doc.data()
      var uid = d.uid
      if (!uid) return
      if (!att[uid]) att[uid] = []
      var rec = Object.assign({}, d)
      delete rec.uid
      rec._docId = doc.id
      att[uid].push(rec)
    })
    _attendCache = att
  } catch(e) { console.error('loadHrData attendance error:', e) }
  try {
    var snap2 = await db.collection('leaves').get()
    var lv = {}
    snap2.docs.forEach(function(doc) {
      var d = doc.data()
      var uid = d.uid
      if (!uid) return
      if (!lv[uid]) lv[uid] = []
      var rec = Object.assign({}, d)
      delete rec.uid
      rec._docId = doc.id
      lv[uid].push(rec)
    })
    _leaveCache = lv
  } catch(e) { console.error('loadHrData leave error:', e) }
  try {
    var snap3 = await db.collection('leaveQuotas').get()
    var qt = {}
    snap3.docs.forEach(function(doc) { qt[doc.id] = doc.data() })
    _quotaCache = qt
  } catch(e) { console.error('loadHrData quota error:', e) }
  _hrDataLoaded = true
  // localStorage → Firestore 마이그레이션 (1회성)
  _migrateLocalToFirestore()
}

// localStorage 마이그레이션
async function _migrateLocalToFirestore() {
  // 출퇴근
  var localAtt = localStorage.getItem('lemango_attendance_v1')
  if (localAtt) {
    try {
      var att = JSON.parse(localAtt)
      var batch = db.batch()
      var count = 0
      Object.keys(att).forEach(function(uid) {
        ;(att[uid] || []).forEach(function(r) {
          // 이미 Firestore에 있으면 스킵
          var exists = (_attendCache[uid] || []).find(function(e) { return e.date === r.date })
          if (exists) return
          var ref = db.collection('attendance').doc()
          batch.set(ref, Object.assign({ uid: uid }, r))
          count++
        })
      })
      if (count > 0) {
        await batch.commit()
        localStorage.removeItem('lemango_attendance_v1')
        await loadHrData()
      } else {
        localStorage.removeItem('lemango_attendance_v1')
      }
    } catch(e) { console.warn('Migrate attendance error:', e) }
  }
  // 연차
  var localLv = localStorage.getItem('lemango_leave_v1')
  if (localLv) {
    try {
      var lv = JSON.parse(localLv)
      var batch2 = db.batch()
      var count2 = 0
      Object.keys(lv).forEach(function(uid) {
        ;(lv[uid] || []).forEach(function(l) {
          var exists = (_leaveCache[uid] || []).find(function(e) { return e.id === l.id })
          if (exists) return
          var ref = db.collection('leaves').doc()
          batch2.set(ref, Object.assign({ uid: uid }, l))
          count2++
        })
      })
      if (count2 > 0) {
        await batch2.commit()
        localStorage.removeItem('lemango_leave_v1')
        await loadHrData()
      } else {
        localStorage.removeItem('lemango_leave_v1')
      }
    } catch(e) { console.warn('Migrate leave error:', e) }
  }
  // 연차 쿼터
  var localQt = localStorage.getItem('lemango_leave_quota_v1')
  if (localQt) {
    try {
      var qt = JSON.parse(localQt)
      var batch3 = db.batch()
      var count3 = 0
      Object.keys(qt).forEach(function(uid) {
        if (_quotaCache[uid]) return
        batch3.set(db.collection('leaveQuotas').doc(uid), qt[uid])
        count3++
      })
      if (count3 > 0) {
        await batch3.commit()
        localStorage.removeItem('lemango_leave_quota_v1')
        await loadHrData()
      } else {
        localStorage.removeItem('lemango_leave_quota_v1')
      }
    } catch(e) { console.warn('Migrate quota error:', e) }
  }
}

// ===== 헬퍼: 캐시 읽기 (동기, 렌더링용) =====
function _getAttendRecords() { return _attendCache }
function _getLeaveRecords() { return _leaveCache }
function _getQuotaRecords() { return _quotaCache }

// ===== 헬퍼: 출퇴근 저장 (Firestore + 캐시 갱신) =====
async function _saveAttendRecord(uid, rec) {
  if (!db) return
  if (!_attendCache[uid]) _attendCache[uid] = []
  var existing = _attendCache[uid].find(function(r) { return r.date === rec.date })
  if (existing && existing._docId) {
    Object.assign(existing, rec)
    var saveData = Object.assign({ uid: uid }, rec)
    delete saveData._docId
    await db.collection('attendance').doc(existing._docId).set(saveData, { merge: true })
  } else {
    var saveData = Object.assign({ uid: uid }, rec)
    delete saveData._docId
    var ref = await db.collection('attendance').add(saveData)
    if (existing) {
      Object.assign(existing, rec)
      existing._docId = ref.id
    } else {
      rec._docId = ref.id
      _attendCache[uid].push(rec)
    }
  }
}

// ===== 헬퍼: 연차 저장 =====
async function _saveLeaveRecord(uid, entry) {
  if (!db) return
  if (!_leaveCache[uid]) _leaveCache[uid] = []
  var existing = _leaveCache[uid].find(function(l) { return l.id === entry.id })
  if (existing) {
    Object.assign(existing, entry)
    if (existing._docId) {
      var saveData = Object.assign({ uid: uid }, entry)
      delete saveData._docId
      await db.collection('leaves').doc(existing._docId).set(saveData, { merge: true })
    }
  } else {
    var saveData = Object.assign({ uid: uid }, entry)
    var ref = await db.collection('leaves').add(saveData)
    entry._docId = ref.id
    _leaveCache[uid].push(entry)
  }
}

// ===== 헬퍼: 연차 쿼터 저장 =====
async function _saveQuota(uid, quotaObj) {
  if (!db) return
  _quotaCache[uid] = quotaObj
  await db.collection('leaveQuotas').doc(uid).set(quotaObj)
}

// ===== 전체 HR 탭 비밀번호 게이트 =====
var _hrUnlocked = false

window.renderHrTab = function() {
  if (typeof _renderedTabs !== 'undefined') _renderedTabs.delete('hr')
  if (!_hrUnlocked) {
    _showHrGate()
    return
  }
  _showHrMain()
}

function _showHrGate() {
  var gate = document.getElementById('hrGateArea')
  var main = document.getElementById('hrMainArea')
  if (main) main.style.display = 'none'
  if (!gate) return
  gate.style.display = ''
  var html = '<div class="hr-profile-gate">'
  html += '<div class="hr-gate-icon">🔒</div>'
  html += '<div class="hr-gate-title">인사 정보 보호</div>'
  html += '<div class="hr-gate-desc">본인 확인을 위해 비밀번호를 입력해주세요.</div>'
  html += '<form id="hrGateForm" onsubmit="return false" autocomplete="off">'
  html += '<input type="text" name="hr_fake_user" autocomplete="off" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" tabindex="-1">'
  html += '<input type="password" id="hrGatePassword" name="hr_gate_pw_' + Date.now() + '" class="hr-gate-input" placeholder="비밀번호 입력" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" data-form-type="other">'
  html += '<button class="srm-btn-gold hr-gate-btn" onclick="verifyHrPassword()">확인</button>'
  html += '</form>'
  html += '<div id="hrGateError" class="hr-gate-error"></div>'
  html += '</div>'
  gate.innerHTML = html
  setTimeout(function() {
    var inp = document.getElementById('hrGatePassword')
    if (inp) {
      inp.focus()
      inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') verifyHrPassword() })
    }
  }, 100)
}

window.verifyHrPassword = async function() {
  var pw = (document.getElementById('hrGatePassword') || {}).value
  if (!pw) { document.getElementById('hrGateError').textContent = '비밀번호를 입력해주세요.'; return }
  var errEl = document.getElementById('hrGateError')
  errEl.textContent = ''
  try {
    var user = firebase.auth().currentUser
    var credential = firebase.auth.EmailAuthProvider.credential(user.email, pw)
    await user.reauthenticateWithCredential(credential)
    _hrUnlocked = true
    _showHrMain()
  } catch(e) {
    if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
      errEl.textContent = '비밀번호가 틀립니다.'
    } else {
      errEl.textContent = '인증 실패: ' + e.message
    }
  }
}

function _showHrMain() {
  var gate = document.getElementById('hrGateArea')
  var main = document.getElementById('hrMainArea')
  if (gate) gate.style.display = 'none'
  if (main) main.style.display = ''
  window.switchHrTab('profile')
}

// ===== 탭 전환 =====
window.switchHrTab = function(tab) {
  document.querySelectorAll('.hr-tab-btn').forEach(function(btn) { btn.classList.remove('hr-tab-active') })
  document.querySelectorAll('.hr-tab-btn').forEach(function(btn) {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf(tab) >= 0) btn.classList.add('hr-tab-active')
  })
  try {
    if (tab === 'leave') window.renderLeaveTab()
    else if (tab === 'attendance') window.renderAttendanceTab()
    else if (tab === 'profile') window.renderProfileTab()
    else if (tab === 'salary') window.renderSalaryTab()
  } catch(e) {
    console.error('[HR] switchHrTab error:', e)
    var el = document.getElementById('hrContent')
    if (el) el.innerHTML = '<div style="padding:20px;color:#A32D2D">렌더링 오류: ' + e.message + '</div>'
  }
}

// ===== 공통 프로필 카드 =====
window.buildHrProfileCard = function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  var user = (_allUsers || []).find(function(u) { return u.uid === uid }) || {}
  var initial = (user.name || '?')[0]
  var joinDate = user.joinDate || (typeof user.createdAt === 'string' ? user.createdAt.slice(0, 10) : (user.createdAt && user.createdAt.toDate ? user.createdAt.toDate().toISOString().slice(0, 10) : (user.createdAt ? String(user.createdAt).slice(0, 10) : '-')))
  var tenure = ''
  if (joinDate !== '-') {
    var join = new Date(joinDate)
    var now = new Date()
    var years = now.getFullYear() - join.getFullYear()
    var months = now.getMonth() - join.getMonth()
    if (months < 0) { years--; months += 12 }
    tenure = years + '년 ' + months + '개월'
  }
  var html = '<div class="hr-profile">'
  html += '<div class="hr-profile-avatar">' + esc(initial) + '</div>'
  html += '<div>'
  html += '<div class="hr-profile-name">' + esc(user.name || '') + '</div>'
  html += '<div class="hr-profile-meta">' + esc(user.position || '') + ' · 입사 ' + joinDate + (tenure ? ' · 근속 ' + tenure : '') + '</div>'
  html += '<span class="hr-profile-dept">' + esc(user.dept || '') + '</span>'
  html += '</div></div>'
  return html
}

// =============================================
// ===== 연차 관리 =====
// =============================================
window.renderLeaveTab = function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  var grade = (State.currentUser && State.currentUser.grade) || 1

  var quota = _getQuotaRecords()
  var myQuota = quota[uid] || { total: 15, year: 2026 }

  var leaves = _getLeaveRecords()
  var myLeaves = (leaves[uid] || []).filter(function(l) { return l.status !== '반려' })

  var _noDeduct = ['대체연차', '병가']
  var used = myLeaves.filter(function(l) { return (l.status === '승인' || l.status === '확인완료') && _noDeduct.indexOf(l.type) < 0 }).reduce(function(s, l) { return s + (l.days || 0) }, 0)
  var pending = myLeaves.filter(function(l) { return l.status === '대기' && _noDeduct.indexOf(l.type) < 0 }).reduce(function(s, l) { return s + (l.days || 0) }, 0)
  var remaining = myQuota.total - used

  var html = ''
  html += buildHrProfileCard()

  // 연차 현황 카드
  html += '<div class="hr-section">'
  html += '<div class="hr-section-title">연차 현황 <span class="hr-section-badge">' + myQuota.year + '</span></div>'
  html += '<div class="hr-cards">'
  html += '<div class="hr-card"><div class="hr-card-label">총 연차</div><div class="hr-card-value">' + myQuota.total + '</div><div class="hr-card-unit">일</div></div>'
  html += '<div class="hr-card hr-card-accent"><div class="hr-card-label">사용</div><div class="hr-card-value">' + used + '</div><div class="hr-card-unit">일</div></div>'
  html += '<div class="hr-card"><div class="hr-card-label">잔여</div><div class="hr-card-value">' + remaining + '</div><div class="hr-card-unit">일</div></div>'
  html += '<div class="hr-card' + (pending > 0 ? ' hr-card-accent' : '') + '"><div class="hr-card-label">승인 대기</div><div class="hr-card-value">' + pending + '</div><div class="hr-card-unit">일</div></div>'
  html += '</div>'

  // 프로그레스바
  var pct = myQuota.total > 0 ? Math.round(used / myQuota.total * 100) : 0
  html += '<div class="hr-progress"><div class="hr-progress-bar"><div class="hr-progress-fill" style="width:' + pct + '%"></div></div><div class="hr-progress-text">' + pct + '% 사용</div></div>'
  html += '</div>'

  // 연차 신청 버튼
  html += '<div style="margin-bottom:12px"><button class="srm-btn-gold" onclick="openLeaveRequestModal()">연차 신청</button></div>'

  // 월별 캘린더
  html += buildLeaveCalendar(myLeaves)

  // 사용 이력 테이블
  var allMyLeaves = (leaves[uid] || []).slice().sort(function(a, b) { return (b.startDate || '').localeCompare(a.startDate || '') })
  html += '<div class="hr-section">'
  html += '<div class="hr-section-title">연차 사용 이력 <span class="hr-section-badge">' + allMyLeaves.length + '건</span></div>'
  html += '<table class="hr-table"><thead><tr><th>날짜</th><th>유형</th><th>사유</th><th>상태</th><th>승인자</th></tr></thead><tbody>'
  allMyLeaves.forEach(function(l) {
    var dateStr = l.startDate === l.endDate ? l.startDate.slice(5) : l.startDate.slice(5) + '~' + l.endDate.slice(5)
    var statusCls = l.status === '확인완료' ? 'hr-status-ok' : l.status === '승인' ? 'hr-status-info' : l.status === '대기' ? 'hr-status-wait' : 'hr-status-no'
    html += '<tr><td>' + dateStr + '</td><td>' + esc(l.type) + ' (' + l.days + '일)</td>'
    html += '<td>' + esc(l.reason || '-') + '</td>'
    html += '<td><span class="hr-status ' + statusCls + '">' + l.status + '</span></td>'
    html += '<td>' + esc(l.approverName || '-') + '</td></tr>'
  })
  if (allMyLeaves.length === 0) html += '<tr><td colspan="5" style="text-align:center;color:#b4b2a9">사용 이력이 없습니다</td></tr>'
  html += '</tbody></table></div>'

  document.getElementById('hrContent').innerHTML = html
}

// ===== 연차 캘린더 =====
window.buildLeaveCalendar = function(myLeaves) {
  var now = new Date()
  var y = now.getFullYear(), m = now.getMonth()
  var first = new Date(y, m, 1)
  var last = new Date(y, m + 1, 0)
  var startDow = first.getDay()

  var html = '<div class="hr-section"><div class="hr-section-title">' + y + '년 ' + (m + 1) + '월</div>'
  html += '<div class="hr-calendar">'
  var days = ['일','월','화','수','목','금','토']
  days.forEach(function(d) { html += '<div class="hr-cal-h">' + d + '</div>' })

  // 빈 칸
  for (var i = 0; i < startDow; i++) html += '<div class="hr-cal-d hr-cal-empty"></div>'

  for (var d = 1; d <= last.getDate(); d++) {
    var dateStr = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    var isToday = d === now.getDate()
    var leaveOnDay = myLeaves.find(function(l) { return (l.status === '승인' || l.status === '확인완료') && l.startDate <= dateStr && l.endDate >= dateStr })
    var cls = 'hr-cal-d'
    if (isToday) cls += ' hr-cal-today'
    if (leaveOnDay) {
      cls += leaveOnDay.type.indexOf('반차') >= 0 ? ' hr-cal-half' : ' hr-cal-leave'
    }
    html += '<div class="' + cls + '">' + d + '</div>'
  }
  html += '</div></div>'
  return html
}

// ===== 연차 신청 모달 =====
window.openLeaveRequestModal = function() {
  var modal = document.getElementById('leaveRequestModal')
  if (!modal) return
  document.getElementById('leaveType').value = '연차'
  document.getElementById('leaveStart').value = ''
  document.getElementById('leaveEnd').value = ''
  document.getElementById('leaveEnd').disabled = false
  var reasonWrap = document.getElementById('leaveReasonWrap')
  var reasonInp = document.getElementById('leaveReason')
  if (reasonWrap) reasonWrap.style.display = 'none'
  if (reasonInp) reasonInp.value = ''
  document.getElementById('leaveType').onchange = function() {
    var v = this.value
    if (v.indexOf('반차') >= 0) {
      document.getElementById('leaveEnd').value = document.getElementById('leaveStart').value
      document.getElementById('leaveEnd').disabled = true
    } else {
      document.getElementById('leaveEnd').disabled = false
    }
    if (reasonWrap) reasonWrap.style.display = v === '대체연차' ? '' : 'none'
    if (reasonInp && v !== '대체연차') reasonInp.value = ''
  }
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
}

window.submitLeaveRequest = function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  if (!uid) return

  var type = document.getElementById('leaveType').value
  var startDate = document.getElementById('leaveStart').value
  var endDate = document.getElementById('leaveEnd').value
  if (!startDate) { showToast('시작일을 입력해주세요.', 'warning'); return }
  if (!endDate) endDate = startDate
  if (type.indexOf('반차') >= 0) endDate = startDate

  // 일수 계산
  var days = 0
  if (type.indexOf('반차') >= 0) {
    days = 0.5
  } else {
    var s = new Date(startDate), e = new Date(endDate)
    days = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1
    if (days <= 0) { showToast('종료일이 시작일보다 빠릅니다.', 'warning'); return }
  }

  var leaves = _getLeaveRecords()
  if (!leaves[uid]) leaves[uid] = []

  var reason = ''
  if (type === '대체연차') {
    reason = (document.getElementById('leaveReason') || {}).value || ''
    reason = reason.trim()
    if (!reason) { showToast('대체연차 사유를 입력해주세요.', 'warning'); return }
  }

  var entry = {
    id: 'lv_' + Date.now(),
    type: type,
    startDate: startDate,
    endDate: endDate,
    days: days,
    reason: reason,
    status: '대기',
    approver: '',
    approverName: '',
    createdAt: new Date().toISOString()
  }
  leaves[uid].push(entry)
  _saveLeaveRecord(uid, entry)

  document.getElementById('leaveRequestModal').close()
  showToast('연차 신청 완료 (' + type + ' ' + days + '일)')
  if (typeof logActivity === 'function') logActivity('create', '인사관리', '연차 신청: ' + type + ' ' + startDate + (startDate !== endDate ? '~' + endDate : ''))
  renderLeaveTab()
}

// ===== 연차 승인/반려 =====
window.buildLeaveApprovalSection = function() {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  var dept = _currentUserDept || ''
  var allLeaves = _getLeaveRecords()

  var pendingList = []
  Object.keys(allLeaves).forEach(function(uid) {
    var leaves = allLeaves[uid]
    var user = (_allUsers || []).find(function(u) { return u.uid === uid })
    if (!user) return
    if (grade === 2 && user.dept !== dept) return

    leaves.filter(function(l) { return l.status === '대기' }).forEach(function(l) {
      pendingList.push(Object.assign({}, l, { uid: uid, userName: user.name, userPosition: user.position, userDept: user.dept }))
    })
  })

  if (pendingList.length === 0) return ''

  var html = '<div class="hr-section hr-divider">'
  html += '<div class="hr-section-title">승인 대기 <span class="hr-section-badge">' + pendingList.length + '건</span></div>'
  html += '<table class="hr-table"><thead><tr><th>이름</th><th>부서</th><th>날짜</th><th>유형</th><th>사유</th><th></th></tr></thead><tbody>'
  pendingList.forEach(function(l) {
    html += '<tr><td>' + esc(formatUserName(l.userName, l.userPosition)) + '</td>'
    html += '<td>' + esc(l.userDept || '-') + '</td>'
    html += '<td>' + l.startDate.slice(5) + (l.startDate !== l.endDate ? '~' + l.endDate.slice(5) : '') + '</td>'
    html += '<td>' + esc(l.type) + '</td>'
    html += '<td>' + esc(l.reason || '-') + '</td>'
    html += '<td style="white-space:nowrap"><button class="srm-btn-gold" style="padding:3px 10px;font-size:10px" onclick="approveLeave(\'' + l.uid + '\',\'' + l.id + '\')">승인</button> '
    html += '<button style="padding:3px 10px;font-size:10px;border:1px solid #F09595;background:#fff;color:#A32D2D;border-radius:4px;cursor:pointer" onclick="rejectLeave(\'' + l.uid + '\',\'' + l.id + '\')">반려</button></td></tr>'
  })
  html += '</tbody></table></div>'
  return html
}

window.approveLeave = function(uid, leaveId) {
  var leaves = _getLeaveRecords()
  if (!leaves[uid]) return
  var entry = leaves[uid].find(function(l) { return l.id === leaveId })
  if (!entry) return
  entry.status = '승인'
  entry.approver = firebase.auth().currentUser ? firebase.auth().currentUser.uid : ''
  entry.approverName = formatUserName(_currentUserName, _currentUserPosition)
  entry.approvedAt = new Date().toISOString()

  // 승인 즉시 캘린더 반영
  var leaveUser = (_allUsers || []).find(function(u) { return u.uid === uid }) || {}
  var workNo = State.workItems.length ? Math.max.apply(null, State.workItems.map(function(w) { return w.no })) + 1 : 1
  var workItem = {
    no: workNo,
    category: '연차',
    title: entry.type + ' - ' + (leaveUser.name || uid),
    startDate: entry.startDate,
    endDate: entry.endDate,
    memo: '승인: ' + entry.approverName,
    registeredAt: new Date().toISOString(),
    createdBy: uid,
    createdByName: leaveUser.name || '',
    createdByPosition: leaveUser.position || '',
    createdAt: new Date().toISOString(),
    _leaveRef: leaveId
  }
  State.workItems.push(workItem)
  _workItems = State.workItems
  saveWorkItems()

  entry._workNo = workNo
  _saveLeaveRecord(uid, entry)
  showToast('연차 승인 완료 (캘린더 반영)')
  if (typeof logActivity === 'function') logActivity('approve', '인사관리', '연차 승인: ' + (leaveUser.name || uid) + ' ' + entry.type + ' ' + entry.startDate)
  if (State.activeTab === 'hradmin' && typeof renderLeaveApprovalTab === 'function') renderLeaveApprovalTab()
  else renderLeaveTab()
}

// 관리자 확인 (Grade 3, 승인된 건에 확인 표시만)
window.confirmLeaveManager = function(uid, leaveId) {
  var leaves = _getLeaveRecords()
  if (!leaves[uid]) return
  var entry = leaves[uid].find(function(l) { return l.id === leaveId })
  if (!entry) return
  entry.managerConfirmer = firebase.auth().currentUser ? firebase.auth().currentUser.uid : ''
  entry.managerConfirmerName = formatUserName(_currentUserName, _currentUserPosition)
  entry.managerConfirmedAt = new Date().toISOString()
  if (entry.ceoConfirmer) entry.status = '확인완료'

  _saveLeaveRecord(uid, entry)
  var leaveUser = (_allUsers || []).find(function(u) { return u.uid === uid }) || {}
  showToast('관리자 확인 완료')
  if (typeof logActivity === 'function') logActivity('approve', '인사관리', '연차 관리자 확인: ' + (leaveUser.name || uid) + ' ' + entry.type + ' ' + entry.startDate)
  if (State.activeTab === 'hradmin' && typeof renderLeaveApprovalTab === 'function') renderLeaveApprovalTab()
  else renderLeaveTab()
}

// 대표이사 확인 (Grade 5, 승인된 건에 확인 표시만)
window.confirmLeaveCeo = function(uid, leaveId) {
  var leaves = _getLeaveRecords()
  if (!leaves[uid]) return
  var entry = leaves[uid].find(function(l) { return l.id === leaveId })
  if (!entry) return
  entry.ceoConfirmer = firebase.auth().currentUser ? firebase.auth().currentUser.uid : ''
  entry.ceoConfirmerName = formatUserName(_currentUserName, _currentUserPosition)
  entry.ceoConfirmedAt = new Date().toISOString()
  if (entry.managerConfirmer) entry.status = '확인완료'

  _saveLeaveRecord(uid, entry)
  var leaveUser = (_allUsers || []).find(function(u) { return u.uid === uid }) || {}
  showToast('대표이사 확인 완료')
  if (typeof logActivity === 'function') logActivity('approve', '인사관리', '연차 확인: ' + (leaveUser.name || uid) + ' ' + entry.type + ' ' + entry.startDate)
  if (State.activeTab === 'hradmin' && typeof renderLeaveApprovalTab === 'function') renderLeaveApprovalTab()
  else renderLeaveTab()
}

window.rejectLeave = async function(uid, leaveId) {
  var ok = await korConfirm('연차를 반려하시겠습니까?', '반려', '취소')
  if (!ok) return

  var leaves = _getLeaveRecords()
  if (!leaves[uid]) return
  var entry = leaves[uid].find(function(l) { return l.id === leaveId })
  if (!entry) return

  var prevStatus = entry.status
  entry.status = '반려'

  var rejectorUid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : ''
  var rejectorName = formatUserName(_currentUserName, _currentUserPosition)

  if (prevStatus === '승인') {
    entry.confirmer = rejectorUid
    entry.confirmerName = rejectorName
    entry.confirmedAt = new Date().toISOString()
  } else {
    entry.approver = rejectorUid
    entry.approverName = rejectorName
    entry.approvedAt = new Date().toISOString()
  }

  // 안전장치: 연결된 업무일정 삭제
  if (entry._workNo) {
    var idx = State.workItems.findIndex(function(w) { return w.no === entry._workNo })
    if (idx >= 0) {
      State.workItems.splice(idx, 1)
      _workItems = State.workItems
      saveWorkItems()
    }
    delete entry._workNo
  }

  _saveLeaveRecord(uid, entry)
  showToast('연차 반려 처리됨')
  var leaveUser = (_allUsers || []).find(function(u) { return u.uid === uid }) || {}
  if (typeof logActivity === 'function') logActivity('approve', '인사관리', '연차 반려: ' + (leaveUser.name || uid) + ' ' + entry.type + ' ' + entry.startDate)
  if (State.activeTab === 'hradmin' && typeof renderLeaveApprovalTab === 'function') renderLeaveApprovalTab()
  else renderLeaveTab()
}

// =============================================
// ===== 출퇴근 기록 =====
// =============================================
// 해당 날짜에 승인된 연차가 있는지 조회
function _getLeaveOnDate(uid, dateStr) {
  var leaves = _getLeaveRecords()
  var myLeaves = leaves[uid] || []
  return myLeaves.find(function(l) {
    return (l.status === '승인' || l.status === '확인완료') && l.startDate <= dateStr && l.endDate >= dateStr
  })
}

// 출퇴근 상태 계산 헬퍼
function _attendStatus(r, uid) {
  if (!r || !r.checkIn) return { status: '', cls: '' }

  // 연차 체크 — 승인된 연차가 있으면 연차 내용 표시
  if (uid) {
    var leave = _getLeaveOnDate(uid, r.date)
    if (leave) {
      return { status: leave.type, cls: 'hr-status-info', isLeave: true }
    }
  }

  if (r.checkIn && !r.checkOut) return { status: '근무중', cls: 'hr-status-wait' }
  var ip = r.checkIn.split(':').map(Number)
  var op = r.checkOut.split(':').map(Number)
  var mins = (op[0] * 60 + op[1]) - (ip[0] * 60 + ip[1])
  var late = ip[0] > 9 || (ip[0] === 9 && ip[1] > 0)
  var early = op[0] < 18
  // 승인된 지각/조기퇴근은 정상 처리
  if (late && r.lateApproved === 'approved') late = false
  if (early && r.earlyApproved === 'approved') early = false
  // 반려된 건은 지각/조퇴 유지 (lateApproved === 'rejected')
  if (late && early) return { status: '지각/조퇴', cls: 'hr-status-wait', late: true, early: true }
  if (late) return { status: '지각', cls: 'hr-status-wait', late: true }
  if (early) return { status: '조기퇴근', cls: 'hr-status-wait', early: true }
  if (mins > 540) return { status: '야근', cls: 'hr-status-info' }
  return { status: '정상', cls: 'hr-status-ok' }
}

window.renderAttendanceTab = function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  var records = _getAttendRecords()
  var myRecords = (records[uid] || []).sort(function(a, b) { return b.date.localeCompare(a.date) })
  var today = fmtDate(new Date())
  var todayRecord = myRecords.find(function(r) { return r.date === today })

  var html = buildHrProfileCard()

  // 오늘 출퇴근 카드
  html += '<div class="hr-attend">'
  html += '<div class="hr-attend-card"><div class="hr-attend-icon hr-attend-icon-in">IN</div><div><div class="hr-attend-label">오늘 출근</div><div class="hr-attend-time">' + (todayRecord && todayRecord.checkIn ? todayRecord.checkIn : '--:--') + '</div></div></div>'
  html += '<div class="hr-attend-card"><div class="hr-attend-icon hr-attend-icon-out">OUT</div><div><div class="hr-attend-label">오늘 퇴근</div><div class="hr-attend-time">' + (todayRecord && todayRecord.checkOut ? todayRecord.checkOut : '--:--') + '</div></div></div>'
  html += '</div>'

  // 버튼
  html += '<div class="hr-attend-btns">'
  if (!todayRecord || !todayRecord.checkIn) {
    html += '<button class="hr-attend-btn hr-attend-btn-in" onclick="doCheckIn()">출근 체크</button>'
  }
  if (todayRecord && todayRecord.checkIn && !todayRecord.checkOut) {
    html += '<button class="hr-attend-btn hr-attend-btn-out" onclick="openCheckOutPrompt()">퇴근 체크</button>'
  }
  html += '</div>'

  // 기록 테이블
  html += '<div class="hr-section">'
  html += '<div class="hr-section-title">출퇴근 기록</div>'
  html += '<table class="hr-table"><thead><tr><th>날짜</th><th>출근</th><th>출근상태</th><th>사유</th><th>퇴근</th><th>퇴근상태</th><th>사유</th><th>근무시간</th><th>상태</th><th></th></tr></thead><tbody>'
  myRecords.slice(0, 30).forEach(function(r) {
    var dayName = ['일','월','화','수','목','금','토'][new Date(r.date).getDay()]
    var workHours = '-'
    var leave = _getLeaveOnDate(uid, r.date)

    if (r.checkIn && r.checkOut) {
      var ip = r.checkIn.split(':').map(Number)
      var op = r.checkOut.split(':').map(Number)
      var mins = (op[0] * 60 + op[1]) - (ip[0] * 60 + ip[1])
      workHours = Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm'
    }

    // 출근 상태
    var isLate = false
    var inStatusHtml = '-'
    if (r.checkIn) {
      var ipChk = r.checkIn.split(':').map(Number)
      isLate = ipChk[0] > 9 || (ipChk[0] === 9 && ipChk[1] > 0)
      if (isLate) {
        if (r.lateApproved === 'approved') inStatusHtml = '<span class="hr-status hr-status-ok" style="font-size:9px">정상처리</span>'
        else if (r.lateApproved === 'rejected') inStatusHtml = '<span class="hr-status hr-status-no" style="font-size:9px">반려</span>'
        else if (r.lateRequested) inStatusHtml = '<span class="hr-status hr-status-wait" style="font-size:9px">신청중</span>'
        else inStatusHtml = '<span class="hr-status hr-status-warn" style="font-size:9px">지각</span>'
      } else {
        inStatusHtml = '<span class="hr-status hr-status-ok" style="font-size:9px">정상</span>'
      }
    }

    // 퇴근 상태
    var isEarly = false
    var outStatusHtml = '-'
    if (r.checkOut) {
      var opChk = r.checkOut.split(':').map(Number)
      isEarly = opChk[0] < 18
      if (isEarly) {
        if (r.earlyApproved === 'approved') outStatusHtml = '<span class="hr-status hr-status-ok" style="font-size:9px">정상처리</span>'
        else if (r.earlyApproved === 'rejected') outStatusHtml = '<span class="hr-status hr-status-no" style="font-size:9px">반려</span>'
        else if (r.earlyRequested) outStatusHtml = '<span class="hr-status hr-status-wait" style="font-size:9px">신청중</span>'
        else outStatusHtml = '<span class="hr-status hr-status-warn" style="font-size:9px">조퇴</span>'
      } else {
        outStatusHtml = '<span class="hr-status hr-status-ok" style="font-size:9px">정상</span>'
      }
    }

    // 출근사유 (읽기전용 텍스트)
    var inMemoHtml = '<span class="hr-memo-text">' + esc(r.checkInMemo || '-') + '</span>'

    // 퇴근사유 (읽기전용 텍스트)
    var outMemoHtml = '<span class="hr-memo-text">' + esc(r.checkOutMemo || '-') + '</span>'

    // 전체 상태
    var totalStatusHtml = ''
    if (leave) {
      totalStatusHtml = '<span class="hr-status hr-status-info" style="font-size:9px">' + esc(leave.type) + '</span>'
    } else if (r.checkIn && !r.checkOut) {
      totalStatusHtml = '<span class="hr-status hr-status-wait" style="font-size:9px">근무중</span>'
    } else if (r.checkIn && r.checkOut) {
      var effectiveLate = isLate && r.lateApproved !== 'approved'
      var effectiveEarly = isEarly && r.earlyApproved !== 'approved'
      if (effectiveLate && effectiveEarly) totalStatusHtml = '<span class="hr-status hr-status-warn" style="font-size:9px">지각/조퇴</span>'
      else if (effectiveLate) totalStatusHtml = '<span class="hr-status hr-status-warn" style="font-size:9px">지각</span>'
      else if (effectiveEarly) totalStatusHtml = '<span class="hr-status hr-status-warn" style="font-size:9px">조퇴</span>'
      else {
        var minsT2 = (op[0] * 60 + op[1]) - (ip[0] * 60 + ip[1])
        if (minsT2 > 540) totalStatusHtml = '<span class="hr-status hr-status-info" style="font-size:9px">야근</span>'
        else totalStatusHtml = '<span class="hr-status hr-status-ok" style="font-size:9px">정상</span>'
      }
    }

    html += '<tr><td>' + r.date.slice(5) + ' (' + dayName + ')</td>'
    html += '<td>' + (r.checkIn || '-') + '</td>'
    html += '<td style="white-space:nowrap">' + inStatusHtml + '</td>'
    html += '<td class="hr-memo-td">' + inMemoHtml + '</td>'
    html += '<td>' + (r.checkOut || '-') + '</td>'
    html += '<td style="white-space:nowrap">' + outStatusHtml + '</td>'
    html += '<td class="hr-memo-td">' + outMemoHtml + '</td>'
    html += '<td>' + workHours + '</td>'
    html += '<td>' + totalStatusHtml + '</td>'
    html += '<td style="text-align:center"><button class="hr-reason-btn" onclick="openMyAttendEditModal(\'' + r.date + '\')">사유</button></td></tr>'
  })
  if (myRecords.length === 0) html += '<tr><td colspan="10" style="text-align:center;color:#b4b2a9">출퇴근 기록이 없습니다</td></tr>'
  html += '</tbody></table></div>'

  document.getElementById('hrContent').innerHTML = html
}

// ===== 출근 체크 =====
window.doCheckIn = async function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  if (!uid) return

  var today = fmtDate(new Date())
  var time = new Date().toTimeString().slice(0, 5)
  var memo = ''
  var memoEl = document.getElementById('attendPopupMemo')
  if (memoEl) { memo = memoEl.value.trim(); memoEl.value = '' }

  var ip = ''
  try {
    var res = await fetch('https://api.ipify.org?format=json')
    var data = await res.json()
    ip = data.ip || ''
  } catch(e) { ip = 'unknown' }

  var records = _getAttendRecords()
  if (!records[uid]) records[uid] = []

  var todayRecord = records[uid].find(function(r) { return r.date === today })
  if (!todayRecord) {
    todayRecord = { date: today, checkIn: '', checkOut: '', ip: '', checkInMemo: '', checkOutMemo: '' }
    records[uid].push(todayRecord)
  }

  todayRecord.checkIn = time
  todayRecord.ip = ip
  todayRecord.checkInMemo = memo

  _saveAttendRecord(uid, todayRecord)
  var popup = document.getElementById('attendancePopup')
  if (popup && popup.open) popup.close()
  showToast('출근 체크 완료 — ' + time)
  if (typeof logActivity === 'function') logActivity('hr', '인사관리', '출근 체크 ' + time + (memo ? ' (' + memo + ')' : ''))

  _refreshAttendanceView()
}

// ===== 퇴근 사유 입력 프롬프트 =====
window.openCheckOutPrompt = async function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  if (!uid) return

  var today = fmtDate(new Date())
  var records = _getAttendRecords()
  var todayRecord = (records[uid] || []).find(function(r) { return r.date === today })
  if (!todayRecord) { showToast('오늘 출근 기록이 없습니다.', 'warning'); return }

  if (todayRecord.checkOut) {
    var ok = await korConfirm('이미 퇴근 체크되었습니다. 다시 체크하시겠습니까?', '재체크', '취소')
    if (!ok) return
  }

  // 간단한 사유 입력 다이얼로그
  var memo = prompt('퇴근 사유 (선택, Enter로 건너뛰기):') || ''
  doCheckOut(memo.trim())
}

// ===== 퇴근 체크 =====
window.doCheckOut = async function(memo) {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  if (!uid) return

  var today = fmtDate(new Date())
  var time = new Date().toTimeString().slice(0, 5)
  if (typeof memo !== 'string') memo = ''

  var records = _getAttendRecords()
  if (!records[uid]) records[uid] = []

  var todayRecord = records[uid].find(function(r) { return r.date === today })
  if (!todayRecord) {
    showToast('오늘 출근 기록이 없습니다.', 'warning')
    return
  }

  todayRecord.checkOut = time
  todayRecord.checkOutMemo = memo

  _saveAttendRecord(uid, todayRecord)

  var menu = document.getElementById('userDropdownMenu')
  if (menu) menu.classList.remove('user-menu-open')
  showToast('퇴근 체크 완료 — ' + time)
  if (typeof logActivity === 'function') logActivity('hr', '인사관리', '퇴근 체크 ' + time + (memo ? ' (' + memo + ')' : ''))

  _refreshAttendanceView()
}

function _refreshAttendanceView() {
  var activeBtn = document.querySelector('.hr-tab-btn.hr-tab-active')
  if (activeBtn && activeBtn.getAttribute('onclick') && activeBtn.getAttribute('onclick').indexOf('attendance') >= 0) {
    renderAttendanceTab()
  }
}

// ===== 지각/조퇴 사유 승인 신청 (본인) =====
window.requestAttendApproval = function(date, type) {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  if (!uid) return

  var records = _getAttendRecords()
  var rec = (records[uid] || []).find(function(r) { return r.date === date })
  if (!rec) return

  // 사유가 있어야 신청 가능
  var memo = type === 'late' ? rec.checkInMemo : rec.checkOutMemo
  if (!memo || !memo.trim()) {
    showToast('사유를 먼저 입력해주세요.', 'warning')
    return
  }

  if (type === 'late') {
    rec.lateRequested = true
    rec.lateRequestedAt = new Date().toISOString()
  } else {
    rec.earlyRequested = true
    rec.earlyRequestedAt = new Date().toISOString()
  }

  _saveAttendRecord(uid, rec)
  var label = type === 'late' ? '지각' : '조퇴'
  showToast(label + ' 사유 승인 신청 완료')
  if (typeof logActivity === 'function') logActivity('create', '인사관리', label + ' 승인 신청: ' + date + ' (' + memo.trim() + ')')
  renderAttendanceTab()
}

// ===== 본인 출퇴근 수정 모달 =====
window.openMyAttendEditModal = function(date) {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  if (!uid) return
  var records = _getAttendRecords()
  var rec = (records[uid] || []).find(function(r) { return r.date === date })
  if (!rec) { showToast('해당 날짜 기록이 없습니다.', 'warning'); return }

  var modal = document.getElementById('myAttendEditModal')
  if (!modal) return
  document.getElementById('maeDate').textContent = date
  document.getElementById('maeCheckIn').value = rec.checkIn || ''
  document.getElementById('maeCheckOut').value = rec.checkOut || ''
  document.getElementById('maeCheckInMemo').value = rec.checkInMemo || ''
  document.getElementById('maeCheckOutMemo').value = rec.checkOutMemo || ''
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
}

window.closeMyAttendEditModal = function() {
  var modal = document.getElementById('myAttendEditModal')
  if (modal) modal.close()
}

window.saveMyAttendEdit = function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  if (!uid) return
  var date = document.getElementById('maeDate').textContent
  var records = _getAttendRecords()
  if (!records[uid]) records[uid] = []
  var rec = records[uid].find(function(r) { return r.date === date })
  if (!rec) return

  var inMemo = (document.getElementById('maeCheckInMemo').value || '').trim()
  var outMemo = (document.getElementById('maeCheckOutMemo').value || '').trim()
  rec.checkInMemo = inMemo
  rec.checkOutMemo = outMemo

  // 지각인데 사유가 있으면 자동 승인 신청
  if (rec.checkIn) {
    var ipChk = rec.checkIn.split(':').map(Number)
    var isLate = ipChk[0] > 9 || (ipChk[0] === 9 && ipChk[1] > 0)
    if (isLate && inMemo && !rec.lateApproved && !rec.lateRequested) {
      rec.lateRequested = true
      rec.lateRequestedAt = new Date().toISOString()
    }
  }

  // 조퇴인데 사유가 있으면 자동 승인 신청
  if (rec.checkOut) {
    var opChk = rec.checkOut.split(':').map(Number)
    var isEarly = opChk[0] < 18
    if (isEarly && outMemo && !rec.earlyApproved && !rec.earlyRequested) {
      rec.earlyRequested = true
      rec.earlyRequestedAt = new Date().toISOString()
    }
  }

  _saveAttendRecord(uid, rec)
  showToast('사유 신청 완료')
  if (typeof logActivity === 'function') logActivity('create', '인사관리', '사유 신청: ' + date + (inMemo ? ' (출근: ' + inMemo + ')' : '') + (outMemo ? ' (퇴근: ' + outMemo + ')' : ''))
  closeMyAttendEditModal()
  renderAttendanceTab()
}

// ===== 출퇴근 작성 모달 =====
window.openAttendWriteModal = function() {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  var dept = _currentUserDept || ''
  var sel = document.getElementById('awUser')
  if (!sel) return

  // 대상자 목록 채우기
  var users = (_allUsers || []).filter(function(u) {
    if (grade === 2) return u.dept === dept
    return true
  })
  sel.innerHTML = users.map(function(u) {
    return '<option value="' + u.uid + '">' + esc(formatUserName(u.name, u.position)) + ' (' + esc(u.dept || '-') + ')</option>'
  }).join('')

  // 기본 날짜: 필터에 있으면 그 날짜, 아니면 오늘
  var dateEl = document.getElementById('hradminAttendDateFilter')
  document.getElementById('awDate').value = (dateEl && dateEl.value) || fmtDate(new Date())
  document.getElementById('awCheckIn').value = ''
  document.getElementById('awCheckOut').value = ''
  document.getElementById('awCheckInMemo').value = ''
  document.getElementById('awCheckOutMemo').value = ''

  var modal = document.getElementById('attendWriteModal')
  if (modal) { modal.showModal(); if (typeof centerModal === 'function') centerModal(modal) }
}

window.closeAttendWriteModal = function() {
  var modal = document.getElementById('attendWriteModal')
  if (modal && modal.open) modal.close()
}

window.saveAttendWrite = function() {
  var uid = document.getElementById('awUser').value
  var date = document.getElementById('awDate').value
  var checkIn = document.getElementById('awCheckIn').value
  var checkOut = document.getElementById('awCheckOut').value
  var checkInMemo = document.getElementById('awCheckInMemo').value.trim()
  var checkOutMemo = document.getElementById('awCheckOutMemo').value.trim()

  if (!uid || !date) { showToast('대상자와 날짜를 선택해주세요.', 'warning'); return }
  if (!checkIn && !checkOut) { showToast('출근 또는 퇴근 시간을 입력해주세요.', 'warning'); return }

  var records = _getAttendRecords()
  if (!records[uid]) records[uid] = []

  var rec = records[uid].find(function(r) { return r.date === date })
  if (!rec) {
    rec = { date: date, checkIn: '', checkOut: '', ip: '', checkInMemo: '', checkOutMemo: '' }
    records[uid].push(rec)
  }

  if (checkIn) { rec.checkIn = checkIn; rec.checkInMemo = checkInMemo }
  if (checkOut) { rec.checkOut = checkOut; rec.checkOutMemo = checkOutMemo }

  _saveAttendRecord(uid, rec)
  var user = (_allUsers || []).find(function(u) { return u.uid === uid })
  showToast('출퇴근 기록 저장 — ' + (user ? user.name : uid) + ' ' + date)
  if (typeof logActivity === 'function') logActivity('create', '인사관리', '출퇴근 작성: ' + (user ? user.name : uid) + ' ' + date + ' ' + (checkIn || '') + '~' + (checkOut || ''))

  closeAttendWriteModal()
  renderTeamAttendTab()
}

// ===== 출근 팝업 (로그인 시 자동) =====
window.checkAttendancePopup = function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  if (!uid) return

  var today = fmtDate(new Date())
  var records = _getAttendRecords()
  var myRecords = records[uid] || []
  var todayRecord = myRecords.find(function(r) { return r.date === today })

  if (todayRecord && todayRecord.checkIn) return

  var modal = document.getElementById('attendancePopup')
  if (modal) {
    document.getElementById('attendPopupDate').textContent = today
    document.getElementById('attendPopupTime').textContent = new Date().toTimeString().slice(0, 5)
    modal.showModal()
    if (typeof centerModal === 'function') centerModal(modal)
  }
}

// ===== 팀 출퇴근 현황 (관리자) =====
window.buildTeamAttendanceSection = function() {
  var today = fmtDate(new Date())
  var records = _getAttendRecords()
  var grade = (State.currentUser && State.currentUser.grade) || 1
  var dept = _currentUserDept || ''

  var html = '<div class="hr-section hr-divider">'
  html += '<div class="hr-section-title">오늘 팀 출퇴근 현황</div>'
  html += '<table class="hr-table"><thead><tr><th>이름</th><th>부서</th><th>출근</th><th>퇴근</th><th>상태</th></tr></thead><tbody>'

  var hasRow = false
  ;(_allUsers || []).forEach(function(user) {
    if (grade === 2 && user.dept !== dept) return
    var rec = (records[user.uid] || []).find(function(r) { return r.date === today })
    var st = _attendStatus(rec)
    var status = '', statusCls = ''
    if (!rec || !rec.checkIn) { status = '미출근'; statusCls = 'hr-status-no' }
    else if (!rec.checkOut) { status = '근무중'; statusCls = 'hr-status-wait' }
    else { status = st.status; statusCls = st.cls }

    html += '<tr><td>' + esc(formatUserName(user.name, user.position)) + '</td>'
    html += '<td>' + esc(user.dept || '-') + '</td>'
    html += '<td>' + (rec && rec.checkIn ? rec.checkIn : '-') + '</td>'
    html += '<td>' + (rec && rec.checkOut ? rec.checkOut : '-') + '</td>'
    html += '<td><span class="hr-status ' + statusCls + '">' + status + '</span></td></tr>'
    hasRow = true
  })
  if (!hasRow) html += '<tr><td colspan="5" style="text-align:center;color:#b4b2a9">데이터 없음</td></tr>'
  html += '</tbody></table></div>'
  return html
}

// =============================================
// ===== 개인 정보 =====
// =============================================
var _hrProfileEditing = false

window.renderProfileTab = function() {
  _hrProfileEditing = false
  _renderProfileContent()
}

function _renderProfileContent() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  var user = (_allUsers || []).find(function(u) { return u.uid === uid }) || {}

  var html = buildHrProfileCard()

  // 읽기 전용 정보
  html += '<div class="hr-section">'
  html += '<div class="hr-section-title">기본 정보 (관리자가 설정)</div>'
  html += '<div class="hr-info-grid">'
  html += '<div class="hr-info-item"><div class="hr-info-label">이름</div><div class="hr-info-value">' + esc(user.name || '') + '</div></div>'
  html += '<div class="hr-info-item"><div class="hr-info-label">직급</div><div class="hr-info-value">' + esc(user.position || '') + '</div></div>'
  html += '<div class="hr-info-item"><div class="hr-info-label">부서</div><div class="hr-info-value">' + esc(user.dept || '') + '</div></div>'
  var _joinDt = user.joinDate || (typeof user.createdAt === 'string' ? user.createdAt.slice(0, 10) : (user.createdAt && user.createdAt.toDate ? user.createdAt.toDate().toISOString().slice(0, 10) : (user.createdAt ? String(user.createdAt).slice(0, 10) : '-')))
  html += '<div class="hr-info-item"><div class="hr-info-label">입사일</div><div class="hr-info-value">' + esc(_joinDt) + '</div></div>'
  html += '</div></div>'

  // 수정 가능 정보
  html += '<div class="hr-section">'
  html += '<div class="hr-section-title">연락처 정보 <button class="srm-btn-outline" style="font-size:10px;padding:3px 10px;margin-left:8px" onclick="toggleProfileEdit()">수정</button></div>'
  html += '<div id="hrProfileEditArea">'
  html += _buildProfileViewHtml(user)
  html += '</div></div>'

  // 비밀번호 변경 버튼
  html += '<div class="hr-section">'
  html += '<button class="srm-btn-outline" onclick="openChangePassword()">비밀번호 변경</button>'
  html += '</div>'

  document.getElementById('hrContent').innerHTML = html
}

function _buildProfileViewHtml(user) {
  var html = '<div class="hr-info-grid">'
  html += '<div class="hr-info-item"><div class="hr-info-label">연락처</div><div class="hr-info-value">' + esc(typeof formatPhone === 'function' ? formatPhone(user.phone || '') : (user.phone || '')) + '</div></div>'
  html += '<div class="hr-info-item"><div class="hr-info-label">이메일</div><div class="hr-info-value">' + esc(user.email || '') + '</div></div>'
  html += '<div class="hr-info-item"><div class="hr-info-label">생년월일</div><div class="hr-info-value">' + esc(user.birthday || '-') + '</div></div>'
  html += '<div class="hr-info-item"><div class="hr-info-label">비상연락처</div><div class="hr-info-value">' + esc(user.emergencyContact || '-') + '</div></div>'
  html += '</div>'
  return html
}

window.toggleProfileEdit = function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  var user = (_allUsers || []).find(function(u) { return u.uid === uid }) || {}
  var area = document.getElementById('hrProfileEditArea')
  if (!area) return

  if (_hrProfileEditing) {
    // 보기 모드로
    _hrProfileEditing = false
    area.innerHTML = _buildProfileViewHtml(user)
  } else {
    // 수정 모드로
    _hrProfileEditing = true
    var html = '<div class="hr-info-grid">'
    html += '<div class="hr-info-item"><div class="hr-info-label">연락처</div><input id="hrEditPhone" class="hr-edit-input" value="' + esc(user.phone || '') + '" placeholder="010-0000-0000"></div>'
    html += '<div class="hr-info-item"><div class="hr-info-label">이메일</div><div class="hr-info-value">' + esc(user.email || '') + '</div></div>'
    html += '<div class="hr-info-item"><div class="hr-info-label">생년월일</div><input type="date" id="hrEditBirthday" class="hr-edit-input" value="' + esc(user.birthday || '') + '"></div>'
    html += '<div class="hr-info-item"><div class="hr-info-label">비상연락처</div><input id="hrEditEmergency" class="hr-edit-input" value="' + esc(user.emergencyContact || '') + '" placeholder="연락처"></div>'
    html += '</div>'
    html += '<div style="margin-top:10px"><button class="srm-btn-gold" style="padding:5px 16px;font-size:11px" onclick="saveProfileEdit()">저장</button> <button class="srm-btn-outline" style="padding:5px 16px;font-size:11px" onclick="toggleProfileEdit()">취소</button></div>'
    area.innerHTML = html
  }
}

window.saveProfileEdit = async function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  if (!uid) return

  var phone = (document.getElementById('hrEditPhone') || {}).value || ''
  var birthday = (document.getElementById('hrEditBirthday') || {}).value || ''
  var emergency = (document.getElementById('hrEditEmergency') || {}).value || ''

  try {
    var db = firebase.firestore()
    await db.collection('users').doc(uid).update({
      phone: phone,
      birthday: birthday,
      emergencyContact: emergency
    })
    // 로컬 캐시 갱신
    var user = (_allUsers || []).find(function(u) { return u.uid === uid })
    if (user) {
      user.phone = phone
      user.birthday = birthday
      user.emergencyContact = emergency
    }
    _hrProfileEditing = false
    showToast('개인 정보 저장 완료')
    if (typeof logActivity === 'function') logActivity('update', '인사관리', '개인 정보 수정')
    renderProfileTab()
  } catch(e) {
    showToast('저장 실패: ' + e.message, 'warning')
  }
}

// ===== 비밀번호 변경 =====
window.openChangePassword = function() {
  var modal = document.getElementById('changePasswordModal')
  if (!modal) return
  document.getElementById('hrPwCurrent').value = ''
  document.getElementById('hrPwNew').value = ''
  document.getElementById('hrPwConfirm').value = ''
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
  var menu = document.getElementById('userDropdownMenu')
  if (menu) menu.classList.remove('user-menu-open')
}

window.submitChangePassword = async function() {
  var current = (document.getElementById('hrPwCurrent') || {}).value
  var newPw = (document.getElementById('hrPwNew') || {}).value
  var confirm = (document.getElementById('hrPwConfirm') || {}).value

  if (!current || !newPw || !confirm) { showToast('모든 항목을 입력해주세요.', 'warning'); return }
  if (newPw !== confirm) { showToast('새 비밀번호가 일치하지 않습니다.', 'warning'); return }
  if (newPw.length < 6) { showToast('비밀번호는 6자 이상이어야 합니다.', 'warning'); return }

  try {
    var user = firebase.auth().currentUser
    var credential = firebase.auth.EmailAuthProvider.credential(user.email, current)
    await user.reauthenticateWithCredential(credential)
    await user.updatePassword(newPw)
    document.getElementById('changePasswordModal').close()
    showToast('비밀번호 변경 완료')
    if (typeof logActivity === 'function') logActivity('update', '인사관리', '비밀번호 변경')
  } catch(e) {
    if (e.code === 'auth/wrong-password') showToast('현재 비밀번호가 틀립니다.', 'warning')
    else showToast('비밀번호 변경 실패: ' + e.message, 'warning')
  }
}

// =============================================
// ===== 급여 명세 =====
// =============================================
window.renderSalaryTab = function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  var salaries = JSON.parse(localStorage.getItem('lemango_salary_v1') || '{}')
  var mySalaries = (salaries[uid] || []).sort(function(a, b) { return b.month.localeCompare(a.month) })

  var html = buildHrProfileCard()

  html += '<div class="hr-section">'
  html += '<div class="hr-section-title">급여 명세</div>'

  if (mySalaries.length === 0) {
    html += '<div style="text-align:center;padding:24px;color:#b4b2a9;font-size:12px">등록된 급여 명세가 없습니다</div>'
  } else {
    html += '<table class="hr-table"><thead><tr><th>월</th><th>기본급</th><th>수당</th><th>공제</th><th>실수령액</th></tr></thead><tbody>'
    mySalaries.forEach(function(s) {
      html += '<tr><td>' + s.month + '</td>'
      html += '<td>' + (s.baseSalary || 0).toLocaleString() + '</td>'
      html += '<td>' + (s.allowance || 0).toLocaleString() + '</td>'
      html += '<td style="color:#A32D2D">-' + (s.deduction || 0).toLocaleString() + '</td>'
      html += '<td style="font-weight:500">' + (s.netPay || 0).toLocaleString() + '</td></tr>'
    })
    html += '</tbody></table>'
  }
  html += '</div>'

  document.getElementById('hrContent').innerHTML = html
}

// =============================================
// ===== 헤더 이름 드롭다운 =====
// =============================================
window.toggleUserMenu = function() {
  var menu = document.getElementById('userDropdownMenu')
  if (!menu) return
  menu.classList.toggle('user-menu-open')
}

// =============================================
// ===== 인사관리 탭 (Grade 2+ 전용) =====
// =============================================

window.renderHrAdminTab = function() {
  if (typeof _renderedTabs !== 'undefined') _renderedTabs.delete('hradmin')
  // Grade 3+: 회원관리/활동로그, Grade 4+: 백업관리 탭 표시
  var grade = (State.currentUser && State.currentUser.grade) || 1
  var memberBtn = document.getElementById('hrAdminMemberBtn')
  var activityBtn = document.getElementById('hrAdminActivityBtn')
  var backupBtn = document.getElementById('hrAdminBackupBtn')
  if (memberBtn) memberBtn.style.display = grade >= 3 ? '' : 'none'
  if (activityBtn) activityBtn.style.display = grade >= 3 ? '' : 'none'
  if (backupBtn) backupBtn.style.display = grade >= 4 ? '' : 'none'
  window.switchHrAdminTab('teamLeave')
}

window.switchHrAdminTab = function(tab) {
  document.querySelectorAll('.hradmin-tab-btn').forEach(function(btn) { btn.classList.remove('hradmin-tab-active') })
  document.querySelectorAll('.hradmin-tab-btn').forEach(function(btn) {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf("'" + tab + "'") >= 0) btn.classList.add('hradmin-tab-active')
  })

  // 패널 표시/숨김
  var hrContent = document.getElementById('hrAdminContent')
  var memberPanel = document.getElementById('memberListPanel')
  var alPanel = document.getElementById('activityLogPanel')
  var bkpPanel = document.getElementById('backupManagePanel')
  var specialTabs = ['memberList', 'activityLog', 'backupManage']
  if (hrContent) hrContent.style.display = specialTabs.indexOf(tab) >= 0 ? 'none' : ''
  if (memberPanel) memberPanel.style.display = tab === 'memberList' ? '' : 'none'
  if (alPanel) alPanel.style.display = tab === 'activityLog' ? '' : 'none'
  if (bkpPanel) bkpPanel.style.display = tab === 'backupManage' ? '' : 'none'

  try {
    if (tab === 'teamLeave') window.renderTeamLeaveTab()
    else if (tab === 'teamAttend') window.renderTeamAttendTab()
    else if (tab === 'leaveApproval') window.renderLeaveApprovalTab()
    else if (tab === 'attendApproval') window.renderAttendApprovalTab()
    else if (tab === 'memberList') { if (typeof loadMembers === 'function') loadMembers() }
    else if (tab === 'activityLog') { if (typeof loadActivityLog === 'function') loadActivityLog() }
    else if (tab === 'backupManage') { if (typeof renderBackupPanel === 'function') renderBackupPanel() }
  } catch(e) {
    console.error('[HRAdmin] error:', e)
    if (hrContent) hrContent.innerHTML = '<div style="padding:24px;color:#A32D2D">' + e.message + '</div>'
  }
}

// ===== 팀원 연차 현황 =====
window.renderTeamLeaveTab = function() {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  var dept = _currentUserDept || ''
  var quota = _getQuotaRecords()
  var allLeaves = _getLeaveRecords()
  var _noDeduct = ['대체연차', '병가']

  // Collect all departments for filter
  var depts = []
  ;(_allUsers || []).forEach(function(u) {
    if (u.dept && depts.indexOf(u.dept) < 0) depts.push(u.dept)
  })
  depts.sort()

  var prevDept = ''
  var prevSearch = ''
  var deptEl = document.getElementById('hradminLeaveDeptFilter')
  var searchEl = document.getElementById('hradminLeaveSearch')
  if (deptEl) prevDept = deptEl.value
  if (searchEl) prevSearch = searchEl.value

  var html = '<div class="hradmin-filter-row">'
  if (grade >= 3) {
    html += '<span class="hradmin-filter-label">부서</span>'
    html += '<select class="hradmin-filter-select" id="hradminLeaveDeptFilter" onchange="renderTeamLeaveTab()">'
    html += '<option value="">전체</option>'
    depts.forEach(function(d) { html += '<option value="' + esc(d) + '">' + esc(d) + '</option>' })
    html += '</select>'
  }
  html += '<span class="hradmin-filter-label">이름</span>'
  html += '<input type="text" class="hradmin-filter-select" id="hradminLeaveSearch" placeholder="이름 검색" value="' + esc(prevSearch) + '" oninput="renderTeamLeaveTab()" style="width:120px">'
  html += '</div>'

  // Get current filter
  var filterDept = prevDept
  var filterName = prevSearch.trim().toLowerCase()

  var users = (_allUsers || []).filter(function(u) {
    if (grade === 2 && u.dept !== dept) return false
    if (grade >= 3 && filterDept && u.dept !== filterDept) return false
    if (filterName && (u.name || '').toLowerCase().indexOf(filterName) < 0) return false
    return true
  })

  html += '<div class="hradmin-section">'
  html += '<div class="hradmin-section-title">팀원 연차 현황 <span class="hradmin-badge">' + users.length + '명</span></div>'

  if (users.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:#b4b2a9;font-size:12px">표시할 팀원이 없습니다</div>'
  } else {
    users.forEach(function(u) {
      var uQuota = quota[u.uid] || { total: 15, year: 2026 }
      var uLeaves = (allLeaves[u.uid] || []).filter(function(l) { return (l.status === '승인' || l.status === '확인완료') && _noDeduct.indexOf(l.type) < 0 })
      var used = uLeaves.reduce(function(s, l) { return s + (l.days || 0) }, 0)
      var remaining = uQuota.total - used
      var pct = uQuota.total > 0 ? Math.round(used / uQuota.total * 100) : 0
      var initial = (u.name || '?')[0]

      html += '<div class="hradmin-team-card" onclick="openLeaveDetail(\'' + u.uid + '\')" style="cursor:pointer">'
      html += '<div class="hradmin-team-avatar">' + esc(initial) + '</div>'
      html += '<div class="hradmin-team-name">' + esc(formatUserName(u.name, u.position)) + '</div>'
      html += '<div class="hradmin-team-dept">' + esc(u.dept || '-') + '</div>'
      html += '<div class="hradmin-team-info">'
      html += '<span>총 ' + uQuota.total + '일'
      if (grade >= 3) {
        html += ' <button class="hr-quota-edit-btn" onclick="event.stopPropagation();editLeaveQuota(\'' + u.uid + '\',' + uQuota.total + ')">수정</button>'
      }
      html += '</span>'
      html += '<span>사용 ' + used + '일</span>'
      html += '<span>잔여 ' + remaining + '일</span>'
      html += '<div class="hradmin-leave-bar">'
      html += '<div class="hradmin-leave-bg"><div class="hradmin-leave-fill" style="width:' + Math.min(pct, 100) + '%"></div></div>'
      html += '<span class="hradmin-leave-pct">' + pct + '%</span>'
      html += '</div></div></div>'
    })
  }
  html += '</div>'

  var el = document.getElementById('hrAdminContent')
  if (el) {
    el.innerHTML = html
    var newFilterEl = document.getElementById('hradminLeaveDeptFilter')
    if (newFilterEl && filterDept) newFilterEl.value = filterDept
    var newSearchEl = document.getElementById('hradminLeaveSearch')
    if (newSearchEl && filterName) { newSearchEl.value = prevSearch; newSearchEl.setSelectionRange(prevSearch.length, prevSearch.length) }
  }
}

// ===== 개인별 연차 상세 모달 =====
window.openLeaveDetail = function(uid) {
  var user = (_allUsers || []).find(function(u) { return u.uid === uid })
  if (!user) return
  var quota = _getQuotaRecords()
  var allLeaves = _getLeaveRecords()
  var _noDeduct = ['대체연차', '병가']
  var uQuota = quota[uid] || { total: 15, year: 2026 }
  var uLeaves = allLeaves[uid] || []
  var approvedLeaves = uLeaves.filter(function(l) { return (l.status === '승인' || l.status === '확인완료') && _noDeduct.indexOf(l.type) < 0 })
  var used = approvedLeaves.reduce(function(s, l) { return s + (l.days || 0) }, 0)
  var remaining = uQuota.total - used
  var pct = uQuota.total > 0 ? Math.round(used / uQuota.total * 100) : 0

  var modal = document.getElementById('leaveDetailModal')
  if (!modal) return
  var body = modal.querySelector('.srm-body')
  if (!body) return
  var title = modal.querySelector('.srm-header span')
  if (title) title.textContent = formatUserName(user.name, user.position) + ' 연차 상세'

  var html = ''
  // 요약 카드
  html += '<div class="ld-summary">'
  html += '<div class="ld-summary-item"><div class="ld-summary-num">' + uQuota.total + '</div><div class="ld-summary-label">총 연차</div></div>'
  html += '<div class="ld-summary-item"><div class="ld-summary-num ld-used">' + used + '</div><div class="ld-summary-label">사용</div></div>'
  html += '<div class="ld-summary-item"><div class="ld-summary-num ld-remain">' + remaining + '</div><div class="ld-summary-label">잔여</div></div>'
  html += '<div class="ld-summary-item"><div class="ld-summary-num">' + pct + '%</div><div class="ld-summary-label">소진율</div></div>'
  html += '</div>'

  // 사용 이력
  html += '<div class="ld-section-title">연차 사용 이력</div>'
  var sorted = uLeaves.slice().sort(function(a, b) { return (b.startDate || '').localeCompare(a.startDate || '') })
  if (sorted.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:#b4b2a9;font-size:12px">연차 사용 이력이 없습니다</div>'
  } else {
    html += '<table class="ld-table"><thead><tr><th>유형</th><th>시작일</th><th>종료일</th><th>일수</th><th>상태</th><th>사유</th></tr></thead><tbody>'
    sorted.forEach(function(l) {
      var statusClass = l.status === '승인' || l.status === '확인완료' ? 'ld-st-ok' : l.status === '반려' ? 'ld-st-no' : 'ld-st-wait'
      html += '<tr>'
      html += '<td>' + esc(l.type || '-') + '</td>'
      html += '<td>' + esc(l.startDate || '-') + '</td>'
      html += '<td>' + esc(l.endDate || l.startDate || '-') + '</td>'
      html += '<td>' + (l.days || 0) + '일</td>'
      html += '<td><span class="' + statusClass + '">' + esc(l.status || '-') + '</span></td>'
      html += '<td style="font-size:11px;color:#666;max-width:120px;overflow:hidden;text-overflow:ellipsis" title="' + esc(l.reason || '') + '">' + esc(l.reason || '-') + '</td>'
      html += '</tr>'
    })
    html += '</tbody></table>'
  }

  body.innerHTML = html
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
}

// ===== 연차 일수 수정 (관리자 전용) =====
window.editLeaveQuota = function(uid, currentTotal) {
  var newTotal = prompt('연차 일수를 입력하세요 (현재: ' + currentTotal + '일)', currentTotal)
  if (newTotal === null) return
  newTotal = parseInt(newTotal)
  if (isNaN(newTotal) || newTotal < 0) { showToast('올바른 숫자를 입력해주세요.', 'warning'); return }
  var quota = _getQuotaRecords()
  if (!quota[uid]) quota[uid] = { total: 15, year: new Date().getFullYear() }
  quota[uid].total = newTotal
  _saveQuota(uid, quota[uid])
  showToast('연차 일수가 ' + newTotal + '일로 변경되었습니다.')
  if (typeof logActivity === 'function') logActivity('setting', '인사관리', '연차 수정: uid=' + uid + ' → ' + newTotal + '일')
  renderTeamLeaveTab()
}

// ===== HR 미처리건 체크 (로그인 시 grade >= 2) =====
window.checkHrPendingItems = function() {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  if (grade < 2) return

  // 오늘 이미 확인했으면 스킵
  var dismissed = localStorage.getItem('lemango_hr_pending_dismissed_v1')
  if (dismissed === fmtDate(new Date())) return

  var dept = _currentUserDept || ''
  var myUid = (State.currentUser && State.currentUser.uid) || ''
  var curYear = new Date().getFullYear()
  var pendingLeave = 0, pendingAttend = 0

  // 연차 대기 (본인 제외, 현재 연도만)
  var allLeaves = _getLeaveRecords()
  Object.keys(allLeaves).forEach(function(uid) {
    if (uid === myUid) return
    var user = (_allUsers || []).find(function(u) { return u.uid === uid })
    if (grade === 2 && (!user || user.dept !== dept)) return
    allLeaves[uid].forEach(function(l) {
      if (l.status !== '대기') return
      var y = (l.startDate || '').slice(0, 4)
      if (y && parseInt(y) !== curYear) return
      pendingLeave++
    })
  })

  // 출퇴근 승인 대기 (본인 제외, 현재 연도만, 명시적 pending 체크)
  var allAttend = _getAttendRecords()
  Object.keys(allAttend).forEach(function(uid) {
    if (uid === myUid) return
    var user = (_allUsers || []).find(function(u) { return u.uid === uid })
    if (grade === 2 && (!user || user.dept !== dept)) return
    allAttend[uid].forEach(function(r) {
      var y = (r.date || '').slice(0, 4)
      if (y && parseInt(y) !== curYear) return
      if (r.lateRequested === true && r.lateApproved !== 'approved' && r.lateApproved !== 'rejected') pendingAttend++
      if (r.earlyRequested === true && r.earlyApproved !== 'approved' && r.earlyApproved !== 'rejected') pendingAttend++
    })
  })

  var total = pendingLeave + pendingAttend
  if (total === 0) return

  var modal = document.getElementById('hrPendingModal')
  if (!modal) return
  var body = modal.querySelector('.srm-body')
  if (!body) return

  var html = '<div style="padding:4px 0">'
  if (pendingLeave > 0) {
    html += '<div class="hr-pending-row" data-hrpending="leaveApproval">'
    html += '<span class="hr-pending-icon">📋</span>'
    html += '<span class="hr-pending-label">연차 승인 대기</span>'
    html += '<span class="hr-pending-count">' + pendingLeave + '건</span>'
    html += '</div>'
  }
  if (pendingAttend > 0) {
    html += '<div class="hr-pending-row" data-hrpending="teamAttend">'
    html += '<span class="hr-pending-icon">⏰</span>'
    html += '<span class="hr-pending-label">출퇴근 승인 대기</span>'
    html += '<span class="hr-pending-count">' + pendingAttend + '건</span>'
    html += '</div>'
  }
  html += '</div>'
  body.innerHTML = html

  // 확인 버튼 라우팅: 대기가 1종류만 있으면 해당 탭으로 이동, 둘 다면 연차부터
  var primarySub = pendingLeave > 0 ? 'leaveApproval' : 'teamAttend'
  modal._hrPrimarySub = primarySub

  function navToHr(sub) {
    modal.close()
    if (typeof openTab === 'function') openTab('hradmin')
    // openTab이 renderHrAdminTab → switchHrAdminTab('teamLeave') 동기 호출
    // 이후 우리가 원하는 sub로 다시 전환
    if (typeof switchHrAdminTab === 'function') {
      try { switchHrAdminTab(sub) } catch(e) { console.error('[HR] switch failed:', e) }
    }
  }

  body.querySelectorAll('.hr-pending-row').forEach(function(row) {
    row.addEventListener('click', function() {
      navToHr(row.getAttribute('data-hrpending'))
    })
  })

  modal._hrNavToHr = navToHr

  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
}

window.dismissHrPending = function(skipToday) {
  if (skipToday) localStorage.setItem('lemango_hr_pending_dismissed_v1', fmtDate(new Date()))
  var modal = document.getElementById('hrPendingModal')
  if (!modal) return
  // 확인 버튼 클릭 시 대기 탭으로 이동 (skipToday=false일 때만)
  if (!skipToday && modal._hrNavToHr && modal._hrPrimarySub) {
    modal._hrNavToHr(modal._hrPrimarySub)
  } else {
    modal.close()
  }
}

// ===== 팀원 출퇴근 =====
window.renderTeamAttendTab = function() {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  var dept = _currentUserDept || ''
  var records = _getAttendRecords()

  var depts = []
  ;(_allUsers || []).forEach(function(u) {
    if (u.dept && depts.indexOf(u.dept) < 0) depts.push(u.dept)
  })
  depts.sort()

  var prevDept = ''
  var prevDate = ''
  var prevSearch = ''
  var deptEl = document.getElementById('hradminAttendDeptFilter')
  var dateEl = document.getElementById('hradminAttendDateFilter')
  var searchEl = document.getElementById('hradminAttendSearch')
  if (deptEl) prevDept = deptEl.value
  if (dateEl) prevDate = dateEl.value
  if (searchEl) prevSearch = searchEl.value

  var today = fmtDate(new Date())
  var filterDate = prevDate || today

  var html = '<div class="hradmin-filter-row">'
  if (grade >= 3) {
    html += '<span class="hradmin-filter-label">부서</span>'
    html += '<select class="hradmin-filter-select" id="hradminAttendDeptFilter" onchange="renderTeamAttendTab()">'
    html += '<option value="">전체</option>'
    depts.forEach(function(d) { html += '<option value="' + esc(d) + '">' + esc(d) + '</option>' })
    html += '</select>'
  }
  html += '<span class="hradmin-filter-label">이름</span>'
  html += '<input type="text" class="hradmin-filter-select" id="hradminAttendSearch" placeholder="이름 검색" value="' + esc(prevSearch) + '" oninput="renderTeamAttendTab()" style="width:120px">'
  html += '<span class="hradmin-filter-label">날짜</span>'
  html += '<input type="date" class="hradmin-filter-select" id="hradminAttendDateFilter" value="' + filterDate + '" onchange="renderTeamAttendTab()">'
  html += '<button class="btn btn-new" style="margin-left:auto;font-size:12px;padding:6px 14px" onclick="openAttendWriteModal()">+ 출퇴근 작성</button>'
  html += '</div>'

  var filterDept = prevDept
  var filterName = prevSearch.trim().toLowerCase()
  var users = (_allUsers || []).filter(function(u) {
    if (grade === 2 && u.dept !== dept) return false
    if (grade >= 3 && filterDept && u.dept !== filterDept) return false
    if (filterName && (u.name || '').toLowerCase().indexOf(filterName) < 0) return false
    return true
  })

  html += '<div class="hradmin-section">'
  html += '<div class="hradmin-section-title">출퇴근 현황 (' + filterDate + ') <span class="hradmin-badge">' + users.length + '명</span></div>'
  html += '<table class="hradmin-table"><thead><tr><th>이름</th><th>부서</th><th>출근</th><th>출근상태</th><th>출근사유</th><th>퇴근</th><th>퇴근상태</th><th>퇴근사유</th><th>근무시간</th><th>상태</th></tr></thead><tbody>'

  users.forEach(function(u) {
    var rec = (records[u.uid] || []).find(function(r) { return r.date === filterDate })
    var workHours = '-'

    if (rec && rec.checkIn && rec.checkOut) {
      var ip = rec.checkIn.split(':').map(Number)
      var op = rec.checkOut.split(':').map(Number)
      var mins = (op[0] * 60 + op[1]) - (ip[0] * 60 + ip[1])
      workHours = Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm'
    }

    // 출근 상태 (지각 여부)
    var inStatusHtml = '-'
    var isLate = false
    if (rec && rec.checkIn) {
      var ipChk = rec.checkIn.split(':').map(Number)
      isLate = ipChk[0] > 9 || (ipChk[0] === 9 && ipChk[1] > 0)
      if (isLate) {
        if (rec.lateApproved === 'approved') inStatusHtml = '<span class="hradmin-st hradmin-st-ok" style="font-size:9px">정상처리</span>'
        else if (rec.lateApproved === 'rejected') inStatusHtml = '<span class="hradmin-st hradmin-st-no" style="font-size:9px">반려</span>'
        else if (rec.lateRequested) {
          // 신청됨 → 관리자 승인/반려 버튼
          if (grade >= 2) {
            inStatusHtml = '<span class="hradmin-st hradmin-st-warn" style="font-size:9px">지각</span> '
            inStatusHtml += '<button class="hradmin-btn-approve" style="font-size:9px;padding:1px 6px" onclick="approveAttendance(\'' + u.uid + '\',\'' + filterDate + '\',\'late\');renderTeamAttendTab()">승인</button> '
            inStatusHtml += '<button class="hradmin-btn-reject" style="font-size:9px;padding:1px 6px" onclick="rejectAttendance(\'' + u.uid + '\',\'' + filterDate + '\',\'late\');renderTeamAttendTab()">반려</button>'
          } else {
            inStatusHtml = '<span class="hradmin-st hradmin-st-warn" style="font-size:9px">신청중</span>'
          }
        } else {
          inStatusHtml = '<span class="hradmin-st hradmin-st-warn" style="font-size:9px">지각</span>'
        }
      } else {
        inStatusHtml = '<span class="hradmin-st hradmin-st-ok" style="font-size:9px">정상</span>'
      }
    }

    // 퇴근 상태 (조퇴 여부)
    var outStatusHtml = '-'
    var isEarly = false
    if (rec && rec.checkOut) {
      var opChk = rec.checkOut.split(':').map(Number)
      isEarly = opChk[0] < 18
      if (isEarly) {
        if (rec.earlyApproved === 'approved') outStatusHtml = '<span class="hradmin-st hradmin-st-ok" style="font-size:9px">정상처리</span>'
        else if (rec.earlyApproved === 'rejected') outStatusHtml = '<span class="hradmin-st hradmin-st-no" style="font-size:9px">반려</span>'
        else if (rec.earlyRequested) {
          if (grade >= 2) {
            outStatusHtml = '<span class="hradmin-st hradmin-st-warn" style="font-size:9px">조퇴</span> '
            outStatusHtml += '<button class="hradmin-btn-approve" style="font-size:9px;padding:1px 6px" onclick="approveAttendance(\'' + u.uid + '\',\'' + filterDate + '\',\'early\');renderTeamAttendTab()">승인</button> '
            outStatusHtml += '<button class="hradmin-btn-reject" style="font-size:9px;padding:1px 6px" onclick="rejectAttendance(\'' + u.uid + '\',\'' + filterDate + '\',\'early\');renderTeamAttendTab()">반려</button>'
          } else {
            outStatusHtml = '<span class="hradmin-st hradmin-st-warn" style="font-size:9px">신청중</span>'
          }
        } else {
          outStatusHtml = '<span class="hradmin-st hradmin-st-warn" style="font-size:9px">조퇴</span>'
        }
      } else {
        outStatusHtml = '<span class="hradmin-st hradmin-st-ok" style="font-size:9px">정상</span>'
      }
    }

    // 출근사유 (신청 버튼 포함)
    var inMemoHtml = esc(rec && rec.checkInMemo || '-')
    if (rec && isLate && rec.checkInMemo && !rec.lateApproved && !rec.lateRequested) {
      inMemoHtml += ' <span class="hradmin-st hradmin-st-wait" style="font-size:9px;cursor:default">미신청</span>'
    }

    // 퇴근사유 (신청 버튼 포함)
    var outMemoHtml = esc(rec && rec.checkOutMemo || '-')
    if (rec && isEarly && rec.checkOutMemo && !rec.earlyApproved && !rec.earlyRequested) {
      outMemoHtml += ' <span class="hradmin-st hradmin-st-wait" style="font-size:9px;cursor:default">미신청</span>'
    }

    // 전체 상태
    var leave = _getLeaveOnDate(u.uid, filterDate)
    var totalStatusHtml = ''
    if (!rec || !rec.checkIn) {
      if (leave) totalStatusHtml = '<span class="hradmin-st hradmin-st-info">' + esc(leave.type) + '</span>'
      else totalStatusHtml = '<span class="hradmin-st hradmin-st-no">미출근</span>'
    } else if (leave) {
      totalStatusHtml = '<span class="hradmin-st hradmin-st-info">' + esc(leave.type) + '</span>'
    } else if (rec.checkIn && !rec.checkOut) {
      totalStatusHtml = '<span class="hradmin-st hradmin-st-wait">근무중</span>'
    } else {
      var effectiveLate = isLate && rec.lateApproved !== 'approved'
      var effectiveEarly = isEarly && rec.earlyApproved !== 'approved'
      if (effectiveLate && effectiveEarly) totalStatusHtml = '<span class="hradmin-st hradmin-st-warn">지각/조퇴</span>'
      else if (effectiveLate) totalStatusHtml = '<span class="hradmin-st hradmin-st-warn">지각</span>'
      else if (effectiveEarly) totalStatusHtml = '<span class="hradmin-st hradmin-st-warn">조퇴</span>'
      else {
        var ipT = rec.checkIn.split(':').map(Number), opT = rec.checkOut.split(':').map(Number)
        var minsT = (opT[0] * 60 + opT[1]) - (ipT[0] * 60 + ipT[1])
        if (minsT > 540) totalStatusHtml = '<span class="hradmin-st hradmin-st-info">야근</span>'
        else totalStatusHtml = '<span class="hradmin-st hradmin-st-ok">정상</span>'
      }
    }

    html += '<tr><td>' + esc(formatUserName(u.name, u.position)) + '</td>'
    html += '<td>' + esc(u.dept || '-') + '</td>'
    html += '<td>' + (rec && rec.checkIn ? rec.checkIn : '-') + '</td>'
    html += '<td style="white-space:nowrap">' + inStatusHtml + '</td>'
    html += '<td style="font-size:11px;color:#666;max-width:100px;overflow:hidden;text-overflow:ellipsis" title="' + esc(rec && rec.checkInMemo || '') + '">' + inMemoHtml + '</td>'
    html += '<td>' + (rec && rec.checkOut ? rec.checkOut : '-') + '</td>'
    html += '<td style="white-space:nowrap">' + outStatusHtml + '</td>'
    html += '<td style="font-size:11px;color:#666;max-width:100px;overflow:hidden;text-overflow:ellipsis" title="' + esc(rec && rec.checkOutMemo || '') + '">' + outMemoHtml + '</td>'
    html += '<td>' + workHours + '</td>'
    html += '<td>' + totalStatusHtml + '</td></tr>'
  })

  if (users.length === 0) html += '<tr><td colspan="10" style="text-align:center;color:#b4b2a9">표시할 팀원이 없습니다</td></tr>'
  html += '</tbody></table></div>'

  var el = document.getElementById('hrAdminContent')
  if (el) {
    el.innerHTML = html
    var newDeptEl = document.getElementById('hradminAttendDeptFilter')
    var newDateEl = document.getElementById('hradminAttendDateFilter')
    var newSearchEl = document.getElementById('hradminAttendSearch')
    if (newDeptEl && prevDept) newDeptEl.value = prevDept
    if (newDateEl) newDateEl.value = filterDate
    if (newSearchEl && prevSearch) { newSearchEl.value = prevSearch; newSearchEl.setSelectionRange(prevSearch.length, prevSearch.length) }
  }
}

// ===== 연차 승인 =====
window.renderLeaveApprovalTab = function() {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  var dept = _currentUserDept || ''
  var allLeaves = _getLeaveRecords()

  var pendingList = []   // 부서장 승인 대기 (status === '대기')
  var confirmList = []   // 관리자 확인 대기 (status === '승인')
  var historyList = []   // 최근 처리 이력 (status === '확인완료' or '반려')

  Object.keys(allLeaves).forEach(function(uid) {
    var leaves = allLeaves[uid]
    var user = (_allUsers || []).find(function(u) { return u.uid === uid })
    if (!user) return
    var deptMatch = grade === 2 ? user.dept === dept : true

    leaves.forEach(function(l) {
      var row = Object.assign({}, l, { uid: uid, userName: user.name, userPosition: user.position, userDept: user.dept })
      if (l.status === '대기' && deptMatch) pendingList.push(row)
      else if (l.status === '승인' && deptMatch) confirmList.push(row)
      else if ((l.status === '확인완료' || l.status === '반려') && deptMatch) historyList.push(row)
    })
  })

  pendingList.sort(function(a, b) { return (b.startDate || '').localeCompare(a.startDate || '') })
  confirmList.sort(function(a, b) { return (b.startDate || '').localeCompare(a.startDate || '') })
  historyList.sort(function(a, b) { return (b.confirmedAt || b.approvedAt || '').localeCompare(a.confirmedAt || a.approvedAt || '') })
  if (historyList.length > 20) historyList = historyList.slice(0, 20)

  var html = ''

  // Section 1: 부서장 승인 대기
  html += '<div class="hradmin-section">'
  html += '<div class="hradmin-section-title">부서장 승인 대기 <span class="hradmin-badge">' + pendingList.length + '건</span></div>'
  if (pendingList.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:#b4b2a9;font-size:12px">승인 대기 중인 연차 신청이 없습니다</div>'
  } else {
    html += '<table class="hradmin-table"><thead><tr><th>이름</th><th>부서</th><th>날짜</th><th>유형</th><th>일수</th><th>사유</th><th></th></tr></thead><tbody>'
    pendingList.forEach(function(l) {
      var dateStr = l.startDate === l.endDate ? l.startDate.slice(5) : l.startDate.slice(5) + '~' + l.endDate.slice(5)
      html += '<tr><td>' + esc(formatUserName(l.userName, l.userPosition)) + '</td>'
      html += '<td>' + esc(l.userDept || '-') + '</td>'
      html += '<td>' + dateStr + '</td>'
      html += '<td>' + esc(l.type) + '</td>'
      html += '<td>' + (l.days || 0) + '일</td>'
      html += '<td>' + esc(l.reason || '-') + '</td>'
      html += '<td style="white-space:nowrap">'
      html += '<button class="hradmin-btn-approve" onclick="approveLeave(\'' + l.uid + '\',\'' + l.id + '\')">승인</button> '
      html += '<button class="hradmin-btn-reject" onclick="rejectLeave(\'' + l.uid + '\',\'' + l.id + '\')">반려</button>'
      html += '</td></tr>'
    })
    html += '</tbody></table>'
  }
  html += '</div>'

  // Section 2: 관리자 확인 대기
  html += '<div class="hradmin-section">'
  html += '<div class="hradmin-section-title">관리자 확인 대기 <span class="hradmin-badge">' + confirmList.length + '건</span></div>'
  if (confirmList.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:#b4b2a9;font-size:12px">확인 대기 중인 연차가 없습니다</div>'
  } else {
    html += '<table class="hradmin-table"><thead><tr><th>이름</th><th>부서</th><th>날짜</th><th>유형</th><th>일수</th><th>승인자</th><th>관리자</th><th>대표이사</th><th></th></tr></thead><tbody>'
    confirmList.forEach(function(l) {
      var dateStr = l.startDate === l.endDate ? l.startDate.slice(5) : l.startDate.slice(5) + '~' + l.endDate.slice(5)
      var mgrDone = !!l.managerConfirmer
      var ceoDone = !!l.ceoConfirmer
      html += '<tr><td>' + esc(formatUserName(l.userName, l.userPosition)) + '</td>'
      html += '<td>' + esc(l.userDept || '-') + '</td>'
      html += '<td>' + dateStr + '</td>'
      html += '<td>' + esc(l.type) + '</td>'
      html += '<td>' + (l.days || 0) + '일</td>'
      html += '<td style="font-size:10px">' + esc(l.approverName || '-') + '</td>'
      // 관리자 확인 컬럼
      html += '<td style="white-space:nowrap">'
      if (mgrDone) {
        html += '<span class="hradmin-st hradmin-st-ok">✓ ' + esc(l.managerConfirmerName) + '</span>'
      } else if (grade >= 3) {
        html += '<button class="hradmin-btn-confirm" onclick="confirmLeaveManager(\'' + l.uid + '\',\'' + l.id + '\')">확인</button>'
      } else {
        html += '<span style="color:#b4b2a9;font-size:10px">대기</span>'
      }
      html += '</td>'
      // 대표이사 확인 컬럼
      html += '<td style="white-space:nowrap">'
      if (ceoDone) {
        html += '<span class="hradmin-st hradmin-st-ok">✓ ' + esc(l.ceoConfirmerName) + '</span>'
      } else if (grade >= 5) {
        html += '<button class="hradmin-btn-confirm-ceo" onclick="confirmLeaveCeo(\'' + l.uid + '\',\'' + l.id + '\')">확인</button>'
      } else {
        html += '<span style="color:#b4b2a9;font-size:10px">대기</span>'
      }
      html += '</td>'
      // 반려
      html += '<td style="white-space:nowrap">'
      if (grade >= 3) {
        html += '<button class="hradmin-btn-reject" onclick="rejectLeave(\'' + l.uid + '\',\'' + l.id + '\')">반려</button>'
      }
      html += '</td></tr>'
    })
    html += '</tbody></table>'
  }
  html += '</div>'

  // Section 3: 최근 처리 이력
  html += '<div class="hradmin-section">'
  html += '<div class="hradmin-section-title">최근 처리 이력 <span class="hradmin-badge">' + historyList.length + '건</span></div>'
  if (historyList.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:#b4b2a9;font-size:12px">처리 이력이 없습니다</div>'
  } else {
    html += '<table class="hradmin-table"><thead><tr><th>이름</th><th>부서</th><th>날짜</th><th>유형</th><th>승인자</th><th>관리자</th><th>대표이사</th><th>상태</th></tr></thead><tbody>'
    historyList.forEach(function(l) {
      var dateStr = l.startDate === l.endDate ? l.startDate.slice(5) : l.startDate.slice(5) + '~' + l.endDate.slice(5)
      var stCls = l.status === '확인완료' ? 'hradmin-st-ok' : 'hradmin-st-no'
      html += '<tr><td>' + esc(formatUserName(l.userName, l.userPosition)) + '</td>'
      html += '<td>' + esc(l.userDept || '-') + '</td>'
      html += '<td>' + dateStr + '</td>'
      html += '<td>' + esc(l.type) + '</td>'
      html += '<td style="font-size:10px">' + esc(l.approverName || '-') + '</td>'
      html += '<td style="font-size:10px">' + (l.managerConfirmerName ? '✓ ' + esc(l.managerConfirmerName) : '-') + '</td>'
      html += '<td style="font-size:10px">' + (l.ceoConfirmerName ? '✓ ' + esc(l.ceoConfirmerName) : '-') + '</td>'
      html += '<td><span class="hradmin-st ' + stCls + '">' + esc(l.status) + '</span></td></tr>'
    })
    html += '</tbody></table>'
  }
  html += '</div>'

  var el = document.getElementById('hrAdminContent')
  if (el) el.innerHTML = html
}

// =============================================
// ===== 출퇴근 승인 탭 =====
// =============================================

window.renderAttendApprovalTab = function() {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  var dept = _currentUserDept || ''
  var records = _getAttendRecords()

  // 지각/조기퇴근 건 수집
  var pendingList = []    // 부서장 승인/반려 대기 (lateApproved/earlyApproved 없음)
  var confirmList = []    // 관리자 확인 대기 (승인됨, 관리자 미확인)
  var historyList = []    // 최근 처리 이력 (승인완료 or 반려)

  Object.keys(records).forEach(function(uid) {
    var user = (_allUsers || []).find(function(u) { return u.uid === uid })
    if (!user) return
    var deptMatch = grade === 2 ? user.dept === dept : true
    if (!deptMatch) return

    ;(records[uid] || []).forEach(function(r) {
      if (!r.checkIn || !r.checkOut) return
      var ip = r.checkIn.split(':').map(Number)
      var op = r.checkOut.split(':').map(Number)
      var isLate = ip[0] > 9 || (ip[0] === 9 && ip[1] > 0)
      var isEarly = op[0] < 18
      if (!isLate && !isEarly) return

      var row = {
        uid: uid, date: r.date, userName: user.name, userPosition: user.position, userDept: user.dept,
        checkIn: r.checkIn, checkOut: r.checkOut, checkInMemo: r.checkInMemo || '', checkOutMemo: r.checkOutMemo || '',
        isLate: isLate, isEarly: isEarly,
        lateApproved: r.lateApproved || '', lateApprover: r.lateApprover, lateApproverName: r.lateApproverName,
        earlyApproved: r.earlyApproved || '', earlyApprover: r.earlyApprover, earlyApproverName: r.earlyApproverName,
        lateManagerConfirmer: r.lateManagerConfirmer, lateManagerConfirmerName: r.lateManagerConfirmerName,
        earlyManagerConfirmer: r.earlyManagerConfirmer, earlyManagerConfirmerName: r.earlyManagerConfirmerName
      }

      var latePending = isLate && r.lateRequested && !r.lateApproved
      var earlyPending = isEarly && r.earlyRequested && !r.earlyApproved
      var lateNeedConfirm = isLate && r.lateApproved === 'approved' && !r.lateManagerConfirmer
      var earlyNeedConfirm = isEarly && r.earlyApproved === 'approved' && !r.earlyManagerConfirmer
      var lateDone = !isLate || r.lateApproved === 'rejected' || (r.lateApproved === 'approved' && r.lateManagerConfirmer)
      var earlyDone = !isEarly || r.earlyApproved === 'rejected' || (r.earlyApproved === 'approved' && r.earlyManagerConfirmer)
      var allDone = lateDone && earlyDone && (r.lateApproved || r.earlyApproved)

      if (latePending || earlyPending) pendingList.push(row)
      else if (lateNeedConfirm || earlyNeedConfirm) confirmList.push(row)
      else if (allDone) historyList.push(row)
    })
  })

  pendingList.sort(function(a, b) { return b.date.localeCompare(a.date) })
  confirmList.sort(function(a, b) { return b.date.localeCompare(a.date) })
  historyList.sort(function(a, b) { return b.date.localeCompare(a.date) })
  if (historyList.length > 20) historyList = historyList.slice(0, 20)

  var html = ''

  // Section 1: 부서장 승인/반려 대기
  html += '<div class="hradmin-section">'
  html += '<div class="hradmin-section-title">부서장 승인 대기 <span class="hradmin-badge">' + pendingList.length + '건</span></div>'
  if (pendingList.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:#b4b2a9;font-size:12px">승인 대기 중인 출퇴근 건이 없습니다</div>'
  } else {
    html += '<table class="hradmin-table"><thead><tr><th>이름</th><th>부서</th><th>날짜</th><th>출근</th><th>퇴근</th><th>유형</th><th>사유</th><th></th></tr></thead><tbody>'
    pendingList.forEach(function(r) {
      var types = []
      if (r.isLate && !r.lateApproved) types.push('지각')
      if (r.isEarly && !r.earlyApproved) types.push('조기퇴근')
      var memo = r.isLate && !r.lateApproved ? (r.checkInMemo || '-') : (r.checkOutMemo || '-')
      if (types.length === 2) memo = (r.checkInMemo || '-') + ' / ' + (r.checkOutMemo || '-')

      html += '<tr><td>' + esc(formatUserName(r.userName, r.userPosition)) + '</td>'
      html += '<td>' + esc(r.userDept || '-') + '</td>'
      html += '<td>' + r.date.slice(5) + '</td>'
      html += '<td>' + r.checkIn + '</td>'
      html += '<td>' + r.checkOut + '</td>'
      html += '<td><span class="hradmin-st hradmin-st-warn">' + types.join('/') + '</span></td>'
      html += '<td style="font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis" title="' + esc(memo) + '">' + esc(memo) + '</td>'
      html += '<td style="white-space:nowrap">'
      if (r.isLate && !r.lateApproved) {
        html += '<button class="hradmin-btn-approve" onclick="approveAttendance(\'' + r.uid + '\',\'' + r.date + '\',\'late\')">지각 승인</button> '
        html += '<button class="hradmin-btn-reject" onclick="rejectAttendance(\'' + r.uid + '\',\'' + r.date + '\',\'late\')">반려</button> '
      }
      if (r.isEarly && !r.earlyApproved) {
        html += '<button class="hradmin-btn-approve" onclick="approveAttendance(\'' + r.uid + '\',\'' + r.date + '\',\'early\')">조퇴 승인</button> '
        html += '<button class="hradmin-btn-reject" onclick="rejectAttendance(\'' + r.uid + '\',\'' + r.date + '\',\'early\')">반려</button>'
      }
      html += '</td></tr>'
    })
    html += '</tbody></table>'
  }
  html += '</div>'

  // Section 2: 관리자 확인 대기 (승인된 건만)
  html += '<div class="hradmin-section">'
  html += '<div class="hradmin-section-title">관리자 확인 대기 <span class="hradmin-badge">' + confirmList.length + '건</span></div>'
  if (confirmList.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:#b4b2a9;font-size:12px">확인 대기 중인 건이 없습니다</div>'
  } else {
    html += '<table class="hradmin-table"><thead><tr><th>이름</th><th>부서</th><th>날짜</th><th>유형</th><th>부서장</th><th>관리자 확인</th></tr></thead><tbody>'
    confirmList.forEach(function(r) {
      var types = []
      if (r.isLate && r.lateApproved === 'approved' && !r.lateManagerConfirmer) types.push('지각')
      if (r.isEarly && r.earlyApproved === 'approved' && !r.earlyManagerConfirmer) types.push('조기퇴근')

      var approverNames = []
      if (r.lateApproved === 'approved') approverNames.push(r.lateApproverName || '-')
      if (r.earlyApproved === 'approved' && r.earlyApproverName !== (approverNames[0] || '')) approverNames.push(r.earlyApproverName || '-')

      html += '<tr><td>' + esc(formatUserName(r.userName, r.userPosition)) + '</td>'
      html += '<td>' + esc(r.userDept || '-') + '</td>'
      html += '<td>' + r.date.slice(5) + '</td>'
      html += '<td><span class="hradmin-st hradmin-st-warn">' + types.join('/') + '</span></td>'
      html += '<td style="font-size:10px">' + esc(approverNames.join(', ')) + '</td>'
      html += '<td style="white-space:nowrap">'
      if (grade >= 3) {
        if (r.isLate && r.lateApproved === 'approved' && !r.lateManagerConfirmer) html += '<button class="hradmin-btn-confirm" onclick="confirmAttendanceManager(\'' + r.uid + '\',\'' + r.date + '\',\'late\')">지각 확인</button> '
        if (r.isEarly && r.earlyApproved === 'approved' && !r.earlyManagerConfirmer) html += '<button class="hradmin-btn-confirm" onclick="confirmAttendanceManager(\'' + r.uid + '\',\'' + r.date + '\',\'early\')">조퇴 확인</button>'
      } else {
        html += '<span style="color:#b4b2a9;font-size:10px">대기</span>'
      }
      html += '</td></tr>'
    })
    html += '</tbody></table>'
  }
  html += '</div>'

  // Section 3: 최근 처리 이력
  html += '<div class="hradmin-section">'
  html += '<div class="hradmin-section-title">최근 처리 이력 <span class="hradmin-badge">' + historyList.length + '건</span></div>'
  if (historyList.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:#b4b2a9;font-size:12px">처리 이력이 없습니다</div>'
  } else {
    html += '<table class="hradmin-table"><thead><tr><th>이름</th><th>부서</th><th>날짜</th><th>유형</th><th>부서장</th><th>관리자</th><th>상태</th></tr></thead><tbody>'
    historyList.forEach(function(r) {
      var types = []
      if (r.isLate) types.push('지각')
      if (r.isEarly) types.push('조기퇴근')

      var approvers = []
      if (r.lateApproverName) approvers.push(r.lateApproverName)
      if (r.earlyApproverName && r.earlyApproverName !== approvers[0]) approvers.push(r.earlyApproverName)
      var confirmers = []
      if (r.lateManagerConfirmerName) confirmers.push(r.lateManagerConfirmerName)
      if (r.earlyManagerConfirmerName && r.earlyManagerConfirmerName !== confirmers[0]) confirmers.push(r.earlyManagerConfirmerName)

      // 상태: 승인→정상 / 반려→지각유지
      var stLabel = '승인완료'
      var stCls = 'hradmin-st-ok'
      if ((r.isLate && r.lateApproved === 'rejected') || (r.isEarly && r.earlyApproved === 'rejected')) {
        var rejTypes = []
        if (r.isLate && r.lateApproved === 'rejected') rejTypes.push('지각')
        if (r.isEarly && r.earlyApproved === 'rejected') rejTypes.push('조퇴')
        // 혼합: 일부 승인, 일부 반려
        var appTypes = []
        if (r.isLate && r.lateApproved === 'approved') appTypes.push('지각')
        if (r.isEarly && r.earlyApproved === 'approved') appTypes.push('조퇴')
        if (appTypes.length > 0 && rejTypes.length > 0) {
          stLabel = appTypes.join('/') + ' 승인 / ' + rejTypes.join('/') + ' 반려'
          stCls = 'hradmin-st-warn'
        } else {
          stLabel = '반려'
          stCls = 'hradmin-st-no'
        }
      }

      html += '<tr><td>' + esc(formatUserName(r.userName, r.userPosition)) + '</td>'
      html += '<td>' + esc(r.userDept || '-') + '</td>'
      html += '<td>' + r.date.slice(5) + '</td>'
      html += '<td>' + types.join('/') + '</td>'
      html += '<td style="font-size:10px">' + (approvers.length ? esc(approvers.join(', ')) : '-') + '</td>'
      html += '<td style="font-size:10px">' + (confirmers.length ? '✓ ' + esc(confirmers.join(', ')) : '-') + '</td>'
      html += '<td><span class="hradmin-st ' + stCls + '">' + esc(stLabel) + '</span></td></tr>'
    })
    html += '</tbody></table>'
  }
  html += '</div>'

  var el = document.getElementById('hrAdminContent')
  if (el) el.innerHTML = html
}

// ===== 출퇴근 승인 (부서장) — 지각/조기퇴근 → 정상 처리 =====
window.approveAttendance = function(uid, date, type) {
  var records = _getAttendRecords()
  if (!records[uid]) return
  var rec = records[uid].find(function(r) { return r.date === date })
  if (!rec) return

  var approverUid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : ''
  var approverName = formatUserName(_currentUserName, _currentUserPosition)

  if (type === 'late') {
    rec.lateApproved = 'approved'
    rec.lateApprover = approverUid
    rec.lateApproverName = approverName
    rec.lateApprovedAt = new Date().toISOString()
  } else if (type === 'early') {
    rec.earlyApproved = 'approved'
    rec.earlyApprover = approverUid
    rec.earlyApproverName = approverName
    rec.earlyApprovedAt = new Date().toISOString()
  }

  _saveAttendRecord(uid, rec)
  var user = (_allUsers || []).find(function(u) { return u.uid === uid })
  var label = type === 'late' ? '지각' : '조기퇴근'
  showToast(label + ' 승인 완료 — ' + (user ? user.name : uid))
  if (typeof logActivity === 'function') logActivity('approve', '인사관리', label + ' 승인: ' + (user ? user.name : uid) + ' ' + date)
  renderAttendApprovalTab()
}

// ===== 출퇴근 반려 (부서장) — 지각/조기퇴근 유지 =====
window.rejectAttendance = function(uid, date, type) {
  var records = _getAttendRecords()
  if (!records[uid]) return
  var rec = records[uid].find(function(r) { return r.date === date })
  if (!rec) return

  var approverUid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : ''
  var approverName = formatUserName(_currentUserName, _currentUserPosition)

  if (type === 'late') {
    rec.lateApproved = 'rejected'
    rec.lateApprover = approverUid
    rec.lateApproverName = approverName
    rec.lateApprovedAt = new Date().toISOString()
  } else if (type === 'early') {
    rec.earlyApproved = 'rejected'
    rec.earlyApprover = approverUid
    rec.earlyApproverName = approverName
    rec.earlyApprovedAt = new Date().toISOString()
  }

  _saveAttendRecord(uid, rec)
  var user = (_allUsers || []).find(function(u) { return u.uid === uid })
  var label = type === 'late' ? '지각' : '조기퇴근'
  showToast(label + ' 반려 — ' + (user ? user.name : uid))
  if (typeof logActivity === 'function') logActivity('approve', '인사관리', label + ' 반려: ' + (user ? user.name : uid) + ' ' + date)
  renderAttendApprovalTab()
}

// ===== 출퇴근 관리자 확인 (Grade 3+) =====
window.confirmAttendanceManager = function(uid, date, type) {
  var records = _getAttendRecords()
  if (!records[uid]) return
  var rec = records[uid].find(function(r) { return r.date === date })
  if (!rec) return

  var confirmerUid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : ''
  var confirmerName = formatUserName(_currentUserName, _currentUserPosition)

  if (type === 'late') {
    rec.lateManagerConfirmer = confirmerUid
    rec.lateManagerConfirmerName = confirmerName
    rec.lateManagerConfirmedAt = new Date().toISOString()
  } else if (type === 'early') {
    rec.earlyManagerConfirmer = confirmerUid
    rec.earlyManagerConfirmerName = confirmerName
    rec.earlyManagerConfirmedAt = new Date().toISOString()
  }

  _saveAttendRecord(uid, rec)
  var user = (_allUsers || []).find(function(u) { return u.uid === uid })
  var label = type === 'late' ? '지각' : '조기퇴근'
  showToast(label + ' 관리자 확인 완료 — ' + (user ? user.name : uid))
  if (typeof logActivity === 'function') logActivity('approve', '인사관리', label + ' 관리자 확인: ' + (user ? user.name : uid) + ' ' + date)
  renderAttendApprovalTab()
}
