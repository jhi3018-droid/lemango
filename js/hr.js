// =============================================
// ===== 인사관리 탭 (연차/출퇴근/개인정보/급여) =====
// =============================================

// ===== Firestore 출퇴근/연차/연차쿼터 캐시 =====
var _attendCache = {}   // { uid: [ {date, checkIn, checkOut, ...} ] }
var _leaveCache = {}    // { uid: [ {id, type, startDate, ...} ] }
var _quotaCache = {}    // { uid: { total, year } }
var _hrDataLoaded = false

// 초기 로드 (앱 시작 시 호출)
// 서버 우선 조회 헬퍼 (stale 캐시 방지)
async function _fetchCollection(colName) {
  try {
    return await db.collection(colName).get({ source: 'server' })
  } catch(e) {
    return await db.collection(colName).get()
  }
}

window.loadHrData = async function() {
  if (!db) return
  try {
    var snap = await _fetchCollection('attendance')
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
    // 정합성 정리: 사유가 비었는데 신청 플래그가 남아있는 레코드 정리 (승인 안 된 건만)
    var _fixBatch = []
    Object.keys(att).forEach(function(uid) {
      (att[uid] || []).forEach(function(r) {
        var dirty = false
        if (r.lateRequested === true && !r.lateApproved && !(r.checkInMemo && r.checkInMemo.trim())) {
          r.lateRequested = false
          delete r.lateRequestedAt
          dirty = true
        }
        if (r.earlyRequested === true && !r.earlyApproved && !(r.checkOutMemo && r.checkOutMemo.trim())) {
          r.earlyRequested = false
          delete r.earlyRequestedAt
          dirty = true
        }
        if (dirty && r._docId) {
          _fixBatch.push({ docId: r._docId, lateRequested: r.lateRequested, earlyRequested: r.earlyRequested })
        }
      })
    })
    _attendCache = att
    // Firestore 일괄 반영 (fire-and-forget)
    if (_fixBatch.length > 0) {
      try {
        var fb = db.batch()
        _fixBatch.forEach(function(f) {
          var update = { lateRequested: f.lateRequested, earlyRequested: f.earlyRequested, lateRequestedAt: firebase.firestore.FieldValue.delete(), earlyRequestedAt: firebase.firestore.FieldValue.delete() }
          fb.update(db.collection('attendance').doc(f.docId), update)
        })
        fb.commit().catch(function(e) { console.warn('attendance flag cleanup failed:', e) })
      } catch(e) { console.warn('attendance flag cleanup setup failed:', e) }
    }
  } catch(e) { console.error('loadHrData attendance error:', e) }
  try {
    var snap2 = await _fetchCollection('leaves')
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
    var snap3 = await _fetchCollection('leaveQuotas')
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
  if (!db) throw new Error('Firebase Firestore 초기화 실패 — 재로그인 또는 새로고침 후 다시 시도해주세요.')
  if (!_leaveCache[uid]) _leaveCache[uid] = []
  var existing = _leaveCache[uid].find(function(l) { return l.id === entry.id })
  if (existing && existing._docId) {
    // 기존 Firestore 문서 업데이트
    Object.assign(existing, entry)
    var saveData = Object.assign({ uid: uid }, entry)
    delete saveData._docId
    await db.collection('leaves').doc(existing._docId).set(saveData, { merge: true })
    // 저장 검증
    var verify = await db.collection('leaves').doc(existing._docId).get({ source: 'server' })
    if (!verify.exists) throw new Error('Firestore 저장 검증 실패(업데이트): 문서를 찾을 수 없습니다.')
    console.log('[leave] update OK docId=' + existing._docId + ' id=' + entry.id)
  } else {
    // 신규: Firestore add → _docId 취득 → 캐시에 반영
    var saveData = Object.assign({ uid: uid }, entry)
    delete saveData._docId
    var ref = await db.collection('leaves').add(saveData)
    entry._docId = ref.id
    // 저장 검증 (Firestore 서버에서 실제 읽기)
    var verify = await db.collection('leaves').doc(ref.id).get({ source: 'server' })
    if (!verify.exists) throw new Error('Firestore 저장 검증 실패(신규): 문서가 서버에 없습니다.')
    console.log('[leave] add OK docId=' + ref.id + ' id=' + entry.id + ' uid=' + uid)
    if (existing) {
      Object.assign(existing, entry)
    } else {
      _leaveCache[uid].push(entry)
    }
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
window.renderLeaveTab = async function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  var grade = (State.currentUser && State.currentUser.grade) || 1

  // Firestore 최신 데이터 재조회 (다기기 동기화)
  try {
    if (typeof loadHrData === 'function') await loadHrData()
  } catch(e) { console.warn('renderLeaveTab refresh 실패:', e) }

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
  var canAdmin = grade >= 3
  // 행 액션 컬럼: 본인 대기건 수정 버튼 OR 관리자 승인취소/삭제 버튼
  var showActionCol = true // 본인 대기건은 항상 수정 가능
  html += '<div class="hr-section">'
  html += '<div class="hr-section-title">연차 사용 이력 <span class="hr-section-badge">' + allMyLeaves.length + '건</span></div>'
  html += '<table class="hr-table"><thead><tr><th>날짜</th><th>유형</th><th>사유</th><th>상태</th><th>승인자</th><th></th></tr></thead><tbody>'
  allMyLeaves.forEach(function(l) {
    var dateStr = l.startDate === l.endDate ? l.startDate.slice(5) : l.startDate.slice(5) + '~' + l.endDate.slice(5)
    var statusCls = l.status === '확인완료' ? 'hr-status-ok' : l.status === '승인' ? 'hr-status-info' : l.status === '대기' ? 'hr-status-wait' : 'hr-status-no'
    html += '<tr><td>' + dateStr + '</td><td>' + esc(l.type) + ' (' + l.days + '일)</td>'
    html += '<td>' + esc(l.reason || '-') + '</td>'
    html += '<td><span class="hr-status ' + statusCls + '">' + l.status + '</span></td>'
    html += '<td>' + esc(l.approverName || '-') + '</td>'
    // 액션: 대기 = 수정 (본인), 승인/확인완료 = 승인취소 (관리자), 관리자 = 삭제
    var actBtns = ''
    if (l.status === '대기') {
      actBtns += '<button class="srm-btn-outline" style="padding:3px 10px;font-size:11px;margin-right:4px" onclick="openLeaveRequestModal(\'' + l.id + '\')">수정</button>'
    }
    if (canAdmin && (l.status === '승인' || l.status === '확인완료')) {
      actBtns += '<button style="padding:3px 10px;font-size:11px;border:1px solid #F09595;background:#fff;color:#A32D2D;border-radius:4px;cursor:pointer;margin-right:4px" onclick="cancelLeaveApproval(\'' + uid + '\',\'' + l.id + '\')">승인취소</button>'
    }
    if (canAdmin) {
      actBtns += '<button class="hradmin-btn-reject" onclick="deleteLeave(\'' + uid + '\',\'' + l.id + '\')">삭제</button>'
    }
    html += '<td style="white-space:nowrap">' + (actBtns || '-') + '</td>'
    html += '</tr>'
  })
  if (allMyLeaves.length === 0) html += '<tr><td colspan="6" style="text-align:center;color:#b4b2a9">사용 이력이 없습니다</td></tr>'
  html += '</tbody></table></div>'

  document.getElementById('hrContent').innerHTML = html
  if (typeof bindLeaveCalendarClicks === 'function') bindLeaveCalendarClicks()
}

// ===== 연차 캘린더 =====
// 날짜 클릭:
//   - 빈 날짜 → 연차 신청 모달 (해당 날짜 프리셋)
//   - 대기 상태 연차 → 수정/삭제 가능 모달
//   - 승인/확인완료 연차 → 상세 조회 (읽기전용)
window.buildLeaveCalendar = function(myLeaves) {
  var now = new Date()
  var y = _leaveCalYear != null ? _leaveCalYear : now.getFullYear()
  var m = _leaveCalMonth != null ? _leaveCalMonth : now.getMonth()
  var first = new Date(y, m, 1)
  var last = new Date(y, m + 1, 0)
  var startDow = first.getDay()
  var todayStr = fmtDate(now)

  var html = '<div class="hr-section">'
  html += '<div class="hr-cal-header">'
  html += '<button class="hr-cal-nav" onclick="shiftLeaveCal(-1)">◀</button>'
  html += '<div class="hr-section-title" style="margin:0">' + y + '년 ' + (m + 1) + '월</div>'
  html += '<button class="hr-cal-nav" onclick="shiftLeaveCal(1)">▶</button>'
  html += '<button class="hr-cal-today-btn" onclick="shiftLeaveCal(0)">오늘</button>'
  html += '</div>'
  html += '<div class="hr-cal-legend">'
  html += '<span class="hr-cal-lg-item"><span class="hr-cal-lg-sw hr-cal-lg-pending"></span>대기</span>'
  html += '<span class="hr-cal-lg-item"><span class="hr-cal-lg-sw hr-cal-lg-leave"></span>연차</span>'
  html += '<span class="hr-cal-lg-item"><span class="hr-cal-lg-sw hr-cal-lg-half"></span>반차</span>'
  html += '</div>'
  html += '<div class="hr-calendar">'
  var days = ['일','월','화','수','목','금','토']
  days.forEach(function(d) { html += '<div class="hr-cal-h">' + d + '</div>' })

  for (var i = 0; i < startDow; i++) html += '<div class="hr-cal-d hr-cal-empty"></div>'

  for (var d = 1; d <= last.getDate(); d++) {
    var dateStr = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    var isToday = dateStr === todayStr
    // 반려(rejected) 제외, 대기/승인/확인완료 모두 캘린더에 표시
    var leaveOnDay = myLeaves.find(function(l) { return l.status !== '반려' && l.startDate <= dateStr && l.endDate >= dateStr })
    var cls = 'hr-cal-d hr-cal-clickable'
    if (isToday) cls += ' hr-cal-today'
    var labelHtml = String(d)
    var attrs = ' data-date="' + dateStr + '"'
    if (leaveOnDay) {
      if (leaveOnDay.status === '대기') cls += ' hr-cal-pending'
      else if ((leaveOnDay.type || '').indexOf('반차') >= 0) cls += ' hr-cal-half'
      else cls += ' hr-cal-leave'
      attrs += ' data-leave-id="' + esc(leaveOnDay.id) + '"'
      var subLabel = (leaveOnDay.type || '') + (leaveOnDay.status === '대기' ? ' ⏳' : '')
      labelHtml = '<div class="hr-cal-num">' + d + '</div><div class="hr-cal-sub">' + esc(subLabel) + '</div>'
    }
    html += '<div class="' + cls + '"' + attrs + '>' + labelHtml + '</div>'
  }
  html += '</div></div>'
  return html
}

var _leaveCalYear = null, _leaveCalMonth = null
window.shiftLeaveCal = function(delta) {
  var now = new Date()
  if (delta === 0) {
    _leaveCalYear = now.getFullYear()
    _leaveCalMonth = now.getMonth()
  } else {
    if (_leaveCalYear == null) _leaveCalYear = now.getFullYear()
    if (_leaveCalMonth == null) _leaveCalMonth = now.getMonth()
    _leaveCalMonth += delta
    if (_leaveCalMonth < 0) { _leaveCalMonth = 11; _leaveCalYear-- }
    else if (_leaveCalMonth > 11) { _leaveCalMonth = 0; _leaveCalYear++ }
  }
  renderLeaveTab()
}

// 캘린더 셀 클릭 이벤트 위임 바인더
window.bindLeaveCalendarClicks = function() {
  var cal = document.querySelector('#hrContent .hr-calendar')
  if (!cal || cal._leaveBound) return
  cal._leaveBound = true
  cal.addEventListener('click', function(e) {
    var cell = e.target.closest('.hr-cal-clickable')
    if (!cell) return
    var leaveId = cell.getAttribute('data-leave-id')
    var dateStr = cell.getAttribute('data-date')
    if (leaveId) {
      openLeaveRequestModal(leaveId)
    } else if (dateStr) {
      openLeaveRequestModal(null, dateStr)
    }
  })
}

// ===== 연차 신청 모달 =====
var _editingLeaveId = null

window.openLeaveRequestModal = function(editLeaveId, presetDate) {
  var modal = document.getElementById('leaveRequestModal')
  if (!modal) return

  _editingLeaveId = editLeaveId || null
  var titleEl = modal.querySelector('.srm-header span')
  var submitBtn = modal.querySelector('button.srm-btn-gold[onclick*="submitLeaveRequest"]')

  var preset = null
  var isReadOnly = false
  if (_editingLeaveId) {
    var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
    var leaves = _getLeaveRecords()
    preset = (leaves[uid] || []).find(function(l) { return l.id === _editingLeaveId })
    if (!preset) { showToast('연차 기록을 찾을 수 없습니다.', 'error'); _editingLeaveId = null; return }
    // 대기 상태만 편집 가능, 나머지(승인/확인완료/반려)는 읽기 전용 조회
    isReadOnly = preset.status !== '대기'
  }

  if (titleEl) {
    titleEl.textContent = isReadOnly
      ? '연차 상세 (' + (preset.status || '') + ')'
      : (_editingLeaveId ? '연차 수정' : '연차 신청')
  }
  if (submitBtn) {
    submitBtn.textContent = _editingLeaveId ? '수정' : '신청'
    submitBtn.style.display = isReadOnly ? 'none' : ''
  }
  var delBtn = document.getElementById('leaveDeleteBtn')
  if (delBtn) delBtn.style.display = (_editingLeaveId && !isReadOnly) ? '' : 'none'

  var typeEl = document.getElementById('leaveType')
  var startEl = document.getElementById('leaveStart')
  var endEl = document.getElementById('leaveEnd')
  var reasonWrap = document.getElementById('leaveReasonWrap')
  var reasonInp = document.getElementById('leaveReason')

  typeEl.value = preset ? preset.type : '연차'
  startEl.value = preset ? preset.startDate : (presetDate || '')
  endEl.value = preset ? preset.endDate : (presetDate || '')
  endEl.disabled = preset ? preset.type.indexOf('반차') >= 0 : false
  if (reasonWrap) reasonWrap.style.display = (preset && preset.type === '대체연차') ? '' : 'none'
  if (reasonInp) reasonInp.value = (preset && preset.type === '대체연차') ? (preset.reason || '') : ''

  // 읽기 전용 토글
  typeEl.disabled = isReadOnly
  startEl.disabled = isReadOnly || (preset && preset.type && preset.type.indexOf('반차') >= 0 && isReadOnly)
  endEl.disabled = isReadOnly || endEl.disabled
  if (reasonInp) reasonInp.disabled = isReadOnly

  typeEl.onchange = isReadOnly ? null : function() {
    var v = this.value
    if (v.indexOf('반차') >= 0) {
      endEl.value = startEl.value
      endEl.disabled = true
    } else {
      endEl.disabled = false
    }
    if (reasonWrap) reasonWrap.style.display = v === '대체연차' ? '' : 'none'
    if (reasonInp && v !== '대체연차') reasonInp.value = ''
  }
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
}

window.deleteMyLeaveRequest = async function() {
  if (!_editingLeaveId) return
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  if (!uid) return

  var leaves = _getLeaveRecords()
  var list = leaves[uid] || []
  var idx = list.findIndex(function(l) { return l.id === _editingLeaveId })
  if (idx < 0) { showToast('삭제할 연차를 찾을 수 없습니다.', 'error'); return }
  var entry = list[idx]
  if (entry.status !== '대기') { showToast('대기 상태만 삭제할 수 있습니다.', 'warning'); return }

  var dateStr = entry.startDate === entry.endDate ? entry.startDate : entry.startDate + '~' + entry.endDate
  var ok = await korConfirm(entry.type + ' ' + dateStr + ' (' + (entry.days || 0) + '일) 신청을 삭제하시겠습니까?', '삭제', '취소')
  if (!ok) return

  try {
    if (db && entry._docId) await db.collection('leaves').doc(entry._docId).delete()
  } catch (e) { console.error('연차 삭제 실패:', e); showToast('삭제 실패. 다시 시도해주세요.', 'error'); return }
  list.splice(idx, 1)

  document.getElementById('leaveRequestModal').close()
  _editingLeaveId = null
  showToast('연차 신청 삭제됨')
  if (typeof logActivity === 'function') logActivity('delete', '인사관리', '연차 신청 삭제: ' + entry.type + ' ' + entry.startDate + (entry.startDate !== entry.endDate ? '~' + entry.endDate : ''))
  renderLeaveTab()
}

window.submitLeaveRequest = async function() {
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

  // ===== 수정 모드 =====
  if (_editingLeaveId) {
    var entry = leaves[uid].find(function(l) { return l.id === _editingLeaveId })
    if (!entry) { showToast('수정할 연차를 찾을 수 없습니다.', 'error'); _editingLeaveId = null; return }
    if (entry.status !== '대기') { showToast('대기 상태만 수정할 수 있습니다.', 'warning'); _editingLeaveId = null; return }

    entry.type = type
    entry.startDate = startDate
    entry.endDate = endDate
    entry.days = days
    entry.reason = reason
    entry.updatedAt = new Date().toISOString()

    await _saveLeaveRecord(uid, entry)

    document.getElementById('leaveRequestModal').close()
    var editedId = _editingLeaveId
    _editingLeaveId = null
    showToast('연차 수정 완료 (' + type + ' ' + days + '일)')
    if (typeof logActivity === 'function') logActivity('update', '인사관리', '연차 수정: ' + type + ' ' + startDate + (startDate !== endDate ? '~' + endDate : ''))
    renderLeaveTab()
    return
  }

  // ===== 신규 신청 =====
  var entry = {
    id: 'lv_' + Date.now(),
    uid: uid,
    applicantName: (State.currentUser && State.currentUser.name) || _currentUserName || '',
    applicantDept: (State.currentUser && State.currentUser.dept) || _currentUserDept || '',
    applicantPosition: (State.currentUser && State.currentUser.position) || _currentUserPosition || '',
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

  try {
    await _saveLeaveRecord(uid, entry)
  } catch (e) {
    console.error('연차 신청 저장 실패:', e)
    showToast('연차 신청 저장에 실패했습니다. 다시 시도해주세요.', 'error')
    return
  }

  document.getElementById('leaveRequestModal').close()
  showToast('연차 신청 완료 (' + type + ' ' + days + '일)')
  if (typeof logActivity === 'function') logActivity('create', '인사관리', '연차 신청: ' + type + ' ' + startDate + (startDate !== endDate ? '~' + endDate : ''))

  // 부서장·관리자에게 즉시 알림
  if (typeof addNotification === 'function') {
    try {
      if (typeof loadAllUsers === 'function' && (!_allUsers || _allUsers.length === 0)) {
        await loadAllUsers(true)
      }
    } catch(e) {}
    var applicantLabel = entry.applicantName + (entry.applicantPosition ? ' ' + entry.applicantPosition : '')
    var dateStr = startDate === endDate ? startDate : startDate + '~' + endDate
    var targets = (_allUsers || []).filter(function(u) {
      if (!u || !u.uid || u.uid === uid) return false
      var g = u.grade || 1
      if (g >= 3) return true                                   // 관리자 이상 전원
      if (g === 2 && entry.applicantDept && u.dept === entry.applicantDept) return true  // 같은 부서 부서장
      return false
    }).map(function(u) { return u.uid })
    if (targets.length > 0) {
      addNotification('leave_request',
        '📋 연차 신청',
        applicantLabel + ' — ' + type + ' ' + dateStr + ' (' + days + '일)',
        '#hradmin:leaveApproval',
        { targetUids: targets })
    }
  }

  renderLeaveTab()
}

// ===== 연차 승인/반려 =====
window.buildLeaveApprovalSection = function() {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  var dept = _currentUserDept || (State.currentUser && State.currentUser.dept) || ''
  var allLeaves = _getLeaveRecords()

  var pendingList = []
  Object.keys(allLeaves).forEach(function(uid) {
    var leaves = allLeaves[uid]
    var user = (_allUsers || []).find(function(u) { return u.uid === uid })
    if (!user) user = { name: '(알 수 없음)', position: '', dept: '' }
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
  // 신청자에게 알림
  if (typeof addNotification === 'function') {
    var dateStr = entry.startDate === entry.endDate ? entry.startDate : entry.startDate + '~' + entry.endDate
    addNotification('leave_approved',
      '✅ 연차 승인',
      entry.type + ' ' + dateStr + ' 이 ' + entry.approverName + '님에 의해 승인되었습니다.',
      '#hr:leave',
      { targetUid: uid })
  }
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
  // 신청자에게 반려 알림
  if (typeof addNotification === 'function') {
    var dateStr = entry.startDate === entry.endDate ? entry.startDate : entry.startDate + '~' + entry.endDate
    addNotification('leave_rejected',
      '❌ 연차 반려',
      entry.type + ' ' + dateStr + ' 이 ' + rejectorName + '님에 의해 반려되었습니다.',
      '#hr:leave',
      { targetUid: uid })
  }
  if (State.activeTab === 'hradmin' && typeof renderLeaveApprovalTab === 'function') renderLeaveApprovalTab()
  else renderLeaveTab()
}

// ===== 연차 승인 취소 (관리자 이상, grade >= 3) =====
// 승인 상태를 대기 상태로 되돌리고, 연결된 업무일정을 제거한다.
window.cancelLeaveApproval = async function(uid, leaveId) {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  if (grade < 3) { showToast('관리자 이상만 승인 취소할 수 있습니다', 'warning'); return }

  var leaves = _getLeaveRecords()
  if (!leaves[uid]) return
  var entry = leaves[uid].find(function(l) { return l.id === leaveId })
  if (!entry) return
  if (entry.status !== '승인' && entry.status !== '확인완료') {
    showToast('승인 상태만 취소할 수 있습니다.', 'warning'); return
  }

  var dateStr = entry.startDate === entry.endDate ? entry.startDate : entry.startDate + '~' + entry.endDate
  var ok = await korConfirm(entry.type + ' ' + dateStr + ' 승인을 취소하시겠습니까?\n대기 상태로 되돌아가고 캘린더 반영이 제거됩니다.', '승인 취소', '취소')
  if (!ok) return

  // 연결된 업무일정 제거
  if (entry._workNo) {
    var wIdx = State.workItems.findIndex(function(w) { return w.no === entry._workNo })
    if (wIdx >= 0) {
      State.workItems.splice(wIdx, 1)
      _workItems = State.workItems
      saveWorkItems()
    }
    delete entry._workNo
  }

  // 상태 롤백
  entry.status = '대기'
  entry.approver = ''
  entry.approverName = ''
  delete entry.approvedAt
  delete entry.managerConfirmer
  delete entry.managerConfirmerName
  delete entry.managerConfirmedAt
  delete entry.ceoConfirmer
  delete entry.ceoConfirmerName
  delete entry.ceoConfirmedAt
  delete entry.confirmer
  delete entry.confirmerName
  delete entry.confirmedAt

  // 승인 취소자 기록
  entry.cancelledBy = firebase.auth().currentUser ? firebase.auth().currentUser.uid : ''
  entry.cancelledByName = formatUserName(_currentUserName, _currentUserPosition)
  entry.cancelledAt = new Date().toISOString()

  // Firestore에서 삭제된 필드를 실제로 제거하기 위해 문서를 교체
  try {
    if (db && entry._docId) {
      var saveData = Object.assign({ uid: uid }, entry)
      delete saveData._docId
      await db.collection('leaves').doc(entry._docId).set(saveData)
    } else {
      await _saveLeaveRecord(uid, entry)
    }
  } catch (e) {
    console.error('연차 승인 취소 저장 실패:', e)
    await _saveLeaveRecord(uid, entry)
  }

  var leaveUser = (_allUsers || []).find(function(u) { return u.uid === uid }) || {}
  showToast('연차 승인 취소 완료')
  if (typeof logActivity === 'function') logActivity('update', '인사관리', '연차 승인 취소: ' + (leaveUser.name || uid) + ' ' + entry.type + ' ' + entry.startDate)
  if (typeof addNotification === 'function') {
    addNotification('leave_cancel', '연차 승인 취소', entry.type + ' ' + dateStr + ' 승인이 취소되었습니다.', '#hr:leave', { targetUid: uid })
  }
  if (State.activeTab === 'hradmin' && typeof renderLeaveApprovalTab === 'function') renderLeaveApprovalTab()
  else renderLeaveTab()
}

// ===== 연차 사용내역 삭제 (관리자 이상, grade >= 3) =====
window.deleteLeave = async function(uid, leaveId) {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  if (grade < 3) { showToast('관리자 이상만 삭제할 수 있습니다', 'warning'); return }

  var leaves = _getLeaveRecords()
  if (!leaves[uid]) return
  var idx = leaves[uid].findIndex(function(l) { return l.id === leaveId })
  if (idx < 0) return
  var entry = leaves[uid][idx]

  var dateStr = entry.startDate === entry.endDate ? entry.startDate : entry.startDate + '~' + entry.endDate
  var ok = await korConfirm(entry.type + ' ' + dateStr + ' (' + (entry.days || 0) + '일) 사용내역을 삭제하시겠습니까?\n연차 개수가 자동 조정됩니다.', '삭제', '취소')
  if (!ok) return

  // 연결된 업무일정 삭제
  if (entry._workNo) {
    var wIdx = State.workItems.findIndex(function(w) { return w.no === entry._workNo })
    if (wIdx >= 0) {
      State.workItems.splice(wIdx, 1)
      _workItems = State.workItems
      saveWorkItems()
    }
  }

  // Firestore + 캐시에서 제거
  try {
    if (db && entry._docId) await db.collection('leaves').doc(entry._docId).delete()
  } catch (e) { console.error('연차 삭제 실패:', e) }
  leaves[uid].splice(idx, 1)

  showToast('연차 사용내역 삭제됨')
  var leaveUser = (_allUsers || []).find(function(u) { return u.uid === uid }) || {}
  if (typeof logActivity === 'function') logActivity('delete', '인사관리', '연차 삭제: ' + (leaveUser.name || uid) + ' ' + entry.type + ' ' + entry.startDate + ' (' + (entry.days || 0) + '일)')
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

// 반차(오전/오후) 반영한 출퇴근 기준시간
function _getAttendThresholds(uid, date) {
  var result = { lateH: 9, lateM: 0, earlyH: 18, earlyM: 0, leaveType: '', isHalfAm: false, isHalfPm: false }
  if (!uid || !date) return result
  var leave = _getLeaveOnDate(uid, date)
  if (!leave) return result
  result.leaveType = leave.type || ''
  if (result.leaveType.indexOf('반차(오전)') >= 0) {
    result.isHalfAm = true
    result.lateH = 13; result.lateM = 0
  } else if (result.leaveType.indexOf('반차(오후)') >= 0) {
    result.isHalfPm = true
    result.earlyH = 13; result.earlyM = 0
  }
  return result
}

// 과거 날짜 여부 (오늘 이전)
function _isPastDate(dateStr) {
  if (!dateStr) return false
  return dateStr < fmtDate(new Date())
}

// 출퇴근 상태 계산 헬퍼
function _attendStatus(r, uid) {
  if (!r) return { status: '', cls: '' }

  var th = _getAttendThresholds(uid, r.date)
  var isPast = _isPastDate(r.date)

  // 풀데이 연차 — 출근 기록 없어도 연차로 표시
  if (th.leaveType && !th.isHalfAm && !th.isHalfPm) {
    return { status: th.leaveType, cls: 'hr-status-info', isLeave: true }
  }

  // 출근 기록 없음
  if (!r.checkIn) {
    if (th.isHalfAm || th.isHalfPm) return { status: th.leaveType, cls: 'hr-status-info', isLeave: true }
    if (isPast) return { status: '미처리', cls: 'hr-status-no' }
    return { status: '', cls: '' }
  }

  // 출근만 있고 퇴근 없음 — 과거 날짜면 미처리, 오늘이면 근무중
  if (r.checkIn && !r.checkOut) {
    if (isPast) return { status: '미처리', cls: 'hr-status-no' }
    return { status: '근무중', cls: 'hr-status-wait' }
  }

  var ip = r.checkIn.split(':').map(Number)
  var op = r.checkOut.split(':').map(Number)
  var mins = (op[0] * 60 + op[1]) - (ip[0] * 60 + ip[1])
  var late = ip[0] > th.lateH || (ip[0] === th.lateH && ip[1] > th.lateM)
  var early = op[0] < th.earlyH || (op[0] === th.earlyH && op[1] < th.earlyM)
  // 승인된 지각/조기퇴근은 정상 처리
  if (late && r.lateApproved === 'approved') late = false
  if (early && r.earlyApproved === 'approved') early = false

  // 반차인데 정시 근무 → 반차 상태로 표시
  if ((th.isHalfAm || th.isHalfPm) && !late && !early) {
    return { status: th.leaveType, cls: 'hr-status-info', isLeave: true }
  }

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
  var isMobile = typeof window._isMobileDevice === 'function' && window._isMobileDevice()
  html += '<div class="hr-attend-btns">'
  if (!todayRecord || !todayRecord.checkIn) {
    if (isMobile) {
      html += '<div class="hr-attend-mobile-block">📵 출근 체크는 사무실 PC에서만 가능합니다.</div>'
    } else {
      html += '<button class="hr-attend-btn hr-attend-btn-in" onclick="doCheckIn()">출근 체크</button>'
    }
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

    var myTh = _getAttendThresholds(uid, r.date)

    // 출근 상태 (반차 오전이면 13:00 기준)
    var isLate = false
    var inStatusHtml = '-'
    if (r.checkIn) {
      var ipChk = r.checkIn.split(':').map(Number)
      isLate = ipChk[0] > myTh.lateH || (ipChk[0] === myTh.lateH && ipChk[1] > myTh.lateM)
      if (isLate) {
        if (r.lateApproved === 'approved') inStatusHtml = '<span class="hr-status hr-status-ok" style="font-size:9px">정상처리</span>'
        else if (r.lateApproved === 'rejected') inStatusHtml = '<span class="hr-status hr-status-no" style="font-size:9px">반려</span>'
        else if (r.lateRequested) inStatusHtml = '<span class="hr-status hr-status-wait" style="font-size:9px">신청중</span>'
        else inStatusHtml = '<span class="hr-status hr-status-warn" style="font-size:9px">지각</span>'
      } else {
        inStatusHtml = '<span class="hr-status hr-status-ok" style="font-size:9px">정상</span>'
      }
    }

    // 퇴근 상태 (반차 오후이면 13:00 기준)
    var isEarly = false
    var outStatusHtml = '-'
    if (r.checkOut) {
      var opChk = r.checkOut.split(':').map(Number)
      isEarly = opChk[0] < myTh.earlyH || (opChk[0] === myTh.earlyH && opChk[1] < myTh.earlyM)
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
    var isHalfLeave = leave && (leave.type || '').indexOf('반차') >= 0
    var isFullLeave = leave && !isHalfLeave
    var totalStatusHtml = ''
    var isPastDay = _isPastDate(r.date)
    if (isFullLeave) {
      totalStatusHtml = '<span class="hr-status hr-status-info" style="font-size:9px">' + esc(leave.type) + '</span>'
    } else if (!r.checkIn) {
      if (isHalfLeave) totalStatusHtml = '<span class="hr-status hr-status-info" style="font-size:9px">' + esc(leave.type) + '</span>'
      else if (isPastDay) totalStatusHtml = '<span class="hr-status hr-status-no" style="font-size:9px">미처리</span>'
    } else if (r.checkIn && !r.checkOut) {
      if (isPastDay) totalStatusHtml = '<span class="hr-status hr-status-no" style="font-size:9px">미처리</span>'
      else totalStatusHtml = '<span class="hr-status hr-status-wait" style="font-size:9px">근무중</span>'
    } else if (r.checkIn && r.checkOut) {
      var effectiveLate = isLate && r.lateApproved !== 'approved'
      var effectiveEarly = isEarly && r.earlyApproved !== 'approved'
      if (effectiveLate && effectiveEarly) totalStatusHtml = '<span class="hr-status hr-status-warn" style="font-size:9px">지각/조퇴</span>'
      else if (effectiveLate) totalStatusHtml = '<span class="hr-status hr-status-warn" style="font-size:9px">지각</span>'
      else if (effectiveEarly) totalStatusHtml = '<span class="hr-status hr-status-warn" style="font-size:9px">조퇴</span>'
      else {
        var minsT2 = (op[0] * 60 + op[1]) - (ip[0] * 60 + ip[1])
        if (isHalfLeave) totalStatusHtml = '<span class="hr-status hr-status-info" style="font-size:9px">' + esc(leave.type) + '</span>'
        else if (minsT2 > 540) totalStatusHtml = '<span class="hr-status hr-status-info" style="font-size:9px">야근</span>'
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

// ===== 지각 알림: 부서장/관리자 로그인·정기체크 시 호출 =====
// 규칙: grade === 2 (부서장) 본인 부서 지각만 / grade >= 3 (관리자) 전체 지각
// 대상: 오늘 날짜 + checkIn 09:00 초과 + lateApproved !== 'approved'
// 호출 주기: checkHrPendingItems() 안에서 함께 실행 (로그인 + 5분 자동 새로고침)
window.checkLateArrivalAlerts = async function() {
  try {
    if (!State.currentUser) return
    var grade = State.currentUser.grade || 1
    if (grade < 2) return
    if (typeof addNotification !== 'function') return

    var myUid = State.currentUser.uid
    var myDept = _currentUserDept || ''
    var today = fmtDate(new Date())

    // 오늘 출퇴근 기록에서 지각자 수집
    var records = _getAttendRecords()
    var lateList = []
    Object.keys(records).forEach(function(uid) {
      if (uid === myUid) return
      var todayRec = (records[uid] || []).find(function(r) { return r.date === today })
      if (!todayRec || !todayRec.checkIn) return
      var ip = todayRec.checkIn.split(':').map(Number)
      var th2 = _getAttendThresholds(uid, today)
      var isLate = ip[0] > th2.lateH || (ip[0] === th2.lateH && ip[1] > th2.lateM)
      if (!isLate) return
      if (todayRec.lateApproved === 'approved') return

      // 부서장(grade==2)은 본인 부서만
      if (grade === 2) {
        var user = (_allUsers || []).find(function(u) { return u.uid === uid })
        if (!user || user.dept !== myDept) return
      }
      var uInfo = (_allUsers || []).find(function(u) { return u.uid === uid }) || {}
      lateList.push({ uid: uid, name: uInfo.name || '-', dept: uInfo.dept || '-', time: todayRec.checkIn })
    })

    // 결정적 doc ID: late_arrival_{uid}_{YYYYMMDD} — 사용자/날짜 당 1개 문서만 존재
    // set({merge:true}) idempotent 사용 → 5분 새로고침마다 호출되어도 같은 문서 덮어쓰기
    var dayKey = today.replace(/-/g, '')
    var canonicalId = 'late_arrival_' + myUid + '_' + dayKey

    // 1) 레거시 late_arrival 문서 전부 제거 (canonical ID 가 아닌 것 모두)
    //    — 과거에 addNotification(.add()) 로 생긴 랜덤 ID 누적분 정리
    var removedFsIds = []
    try {
      if (db && myUid) {
        var snap = await db.collection('notifications')
          .where('uid', '==', myUid)
          .where('type', '==', 'late_arrival')
          .get({ source: 'server' })
        if (snap) {
          var deletions = []
          snap.forEach(function(d) {
            if (d.id !== canonicalId) { deletions.push(d.id); removedFsIds.push(d.id) }
          })
          for (var i = 0; i < deletions.length; i++) {
            try { await db.collection('notifications').doc(deletions[i]).delete() } catch(e) {}
          }
          if (deletions.length) console.log('[late_arrival] removed ' + deletions.length + ' legacy docs')
        }
      }
    } catch(e) { console.warn('[late_arrival] cleanup failed:', e) }

    // 2) 로컬 캐시에서 제거된 fsId 싹 빼기 + canonicalId 외 late_arrival 항목 중복 제거
    if (typeof _notifications !== 'undefined' && Array.isArray(_notifications)) {
      var seen = false
      _notifications = _notifications.filter(function(n) {
        if (n.type !== 'late_arrival') return true
        if (n.fsId && removedFsIds.indexOf(n.fsId) >= 0) return false
        if (n.fsId === canonicalId || n.id === canonicalId) {
          if (seen) return false
          seen = true
          return true
        }
        // 제거된 fsId 가 캐시에 이미 누적돼있던 건들 제거
        return false
      })
    }

    // 3) 지각자가 없으면 오늘 canonical 문서도 삭제하고 종료
    if (!lateList.length) {
      try {
        if (db && myUid) await db.collection('notifications').doc(canonicalId).delete()
      } catch(e) {}
      if (typeof _notifications !== 'undefined') {
        _notifications = _notifications.filter(function(n) { return !(n.type === 'late_arrival') })
      }
      if (typeof saveNotifications === 'function') saveNotifications()
      if (typeof renderNotifications === 'function') renderNotifications()
      return
    }

    var title = '🕐 지각 ' + lateList.length + '명'
    var body = lateList.slice(0, 5).map(function(x) { return x.name + '(' + x.dept + ') ' + x.time }).join(', ')
    if (lateList.length > 5) body += ' 외 ' + (lateList.length - 5) + '명'

    // 4) 알림 설정 OFF 체크 (addNotification 우회하므로 직접 수행)
    try {
      var ns = (typeof getNotifSettings === 'function') ? getNotifSettings() : null
      if (ns && ns.globalEnabled === false) return
      if (typeof isNotifEnabled === 'function' && !isNotifEnabled('late_arrival')) return
    } catch(e) {}

    // 5) canonicalId 에 idempotent set (중복 생성 원천 차단)
    var nowTs = Date.now()
    var existingLocal = (_notifications || []).find(function(n) { return n.type === 'late_arrival' && (n.fsId === canonicalId || n.id === canonicalId) })
    var readFlag = existingLocal ? !!existingLocal.read : false
    try {
      if (db && myUid) {
        await db.collection('notifications').doc(canonicalId).set({
          uid: myUid, type: 'late_arrival', title: title, body: body, link: '#hradmin:teamAttend',
          priority: '', ts: nowTs, read: readFlag,
          createdAt: (existingLocal && existingLocal.ts) ? new Date(existingLocal.ts).toISOString() : new Date(nowTs).toISOString()
        }, { merge: true })
      }
    } catch(e) { console.warn('[late_arrival] set failed:', e) }

    // 6) 로컬 캐시 업데이트 (항상 1개만 유지)
    if (typeof _notifications !== 'undefined') {
      _notifications = _notifications.filter(function(n) { return n.type !== 'late_arrival' })
      _notifications.unshift({
        id: canonicalId, fsId: canonicalId,
        type: 'late_arrival', title: title, body: body, link: '#hradmin:teamAttend',
        priority: '', ts: existingLocal ? existingLocal.ts : nowTs, read: readFlag
      })
      if (typeof saveNotifications === 'function') saveNotifications()
      if (typeof renderNotifications === 'function') renderNotifications()
    }
  } catch (e) { console.warn('[checkLateArrivalAlerts] error:', e) }
}

// ===== 출근/퇴근 공통: IP 검증 =====
// 반환: { ip, allowed, proceed }
//   proceed === false 면 체크 중단
async function _verifyAttendIp(action) {
  var ip = ''
  try {
    var res = await fetch('https://api.ipify.org?format=json')
    var data = await res.json()
    ip = data.ip || ''
  } catch(e) { ip = 'unknown' }

  var mode = (typeof _ipEnforceMode !== 'undefined') ? _ipEnforceMode : 'off'
  if (mode === 'off') return { ip: ip, allowed: true, proceed: true }

  var allowed = (typeof isIpAllowed === 'function') ? isIpAllowed(ip) : true
  if (allowed) return { ip: ip, allowed: true, proceed: true }

  var grade = (State.currentUser && State.currentUser.grade) || 1
  var msg = '허용되지 않은 IP에서 ' + action + ' 시도: ' + (ip || '알 수 없음')

  if (mode === 'warn') {
    var ok = await korConfirm(msg + '\n\n계속 진행하시겠습니까?', '진행', '취소')
    return { ip: ip, allowed: false, proceed: !!ok }
  }
  // mode === 'block'
  if (grade >= 3) {
    var ok2 = await korConfirm(msg + '\n\n관리자 권한으로 우회 진행하시겠습니까?', '우회 진행', '취소')
    return { ip: ip, allowed: false, proceed: !!ok2 }
  }
  showToast(msg + ' — 허용된 IP에서만 가능합니다.', 'error')
  return { ip: ip, allowed: false, proceed: false }
}

// 모바일 기기 감지 — UA 또는 좁은 화면
window._isMobileDevice = function() {
  try {
    if (/Mobi|Android|iPhone|iPad|iPod|IEMobile|BlackBerry|Opera Mini/i.test(navigator.userAgent || '')) return true
    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) return true
  } catch (e) {}
  return false
}

// ===== 출근 체크 =====
window.doCheckIn = async function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  if (!uid) return

  if (window._isMobileDevice()) {
    showToast('출근 체크는 사무실 PC에서만 가능합니다.', 'warning')
    var popupEl = document.getElementById('attendancePopup')
    if (popupEl && popupEl.open) popupEl.close()
    return
  }

  var today = fmtDate(new Date())
  var time = new Date().toTimeString().slice(0, 5)
  var memo = ''
  var memoEl = document.getElementById('attendPopupMemo')
  if (memoEl) { memo = memoEl.value.trim(); memoEl.value = '' }

  var ipCheck = await _verifyAttendIp('출근')
  if (!ipCheck.proceed) return
  var ip = ipCheck.ip

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
  if (typeof logActivity === 'function') logActivity('hr', '인사관리', '출근 체크 ' + time + ' [IP: ' + (ip || '알 수 없음') + ']' + (memo ? ' (' + memo + ')' : ''))

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

  var ipCheck = await _verifyAttendIp('퇴근')
  if (!ipCheck.proceed) return

  var records = _getAttendRecords()
  if (!records[uid]) records[uid] = []

  var todayRecord = records[uid].find(function(r) { return r.date === today })
  if (!todayRecord) {
    showToast('오늘 출근 기록이 없습니다.', 'warning')
    return
  }

  todayRecord.checkOut = time
  todayRecord.checkOutIp = ipCheck.ip
  todayRecord.checkOutMemo = memo

  _saveAttendRecord(uid, todayRecord)

  var menu = document.getElementById('userDropdownMenu')
  if (menu) menu.classList.remove('user-menu-open')
  showToast('퇴근 체크 완료 — ' + time)
  if (typeof logActivity === 'function') logActivity('hr', '인사관리', '퇴근 체크 ' + time + ' [IP: ' + (ipCheck.ip || '알 수 없음') + ']' + (memo ? ' (' + memo + ')' : ''))

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
  // 본인이 approver(grade>=2)면 즉시 알림 재계산
  if (typeof checkHrPendingItems === 'function') { try { checkHrPendingItems() } catch(e) {} }
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

  var editTh = _getAttendThresholds(uid, date)

  // 지각인데 사유가 있으면 자동 승인 신청 / 사유 비면 신청 철회 (반차 기준 반영)
  if (rec.checkIn) {
    var ipChk = rec.checkIn.split(':').map(Number)
    var isLate = ipChk[0] > editTh.lateH || (ipChk[0] === editTh.lateH && ipChk[1] > editTh.lateM)
    if (isLate && inMemo && !rec.lateApproved && !rec.lateRequested) {
      rec.lateRequested = true
      rec.lateRequestedAt = new Date().toISOString()
    } else if (!inMemo && rec.lateRequested && !rec.lateApproved) {
      rec.lateRequested = false
      delete rec.lateRequestedAt
    }
  }

  // 조퇴인데 사유가 있으면 자동 승인 신청 / 사유 비면 신청 철회 (반차 기준 반영)
  if (rec.checkOut) {
    var opChk = rec.checkOut.split(':').map(Number)
    var isEarly = opChk[0] < editTh.earlyH || (opChk[0] === editTh.earlyH && opChk[1] < editTh.earlyM)
    if (isEarly && outMemo && !rec.earlyApproved && !rec.earlyRequested) {
      rec.earlyRequested = true
      rec.earlyRequestedAt = new Date().toISOString()
    } else if (!outMemo && rec.earlyRequested && !rec.earlyApproved) {
      rec.earlyRequested = false
      delete rec.earlyRequestedAt
    }
  }

  _saveAttendRecord(uid, rec)
  showToast('사유 신청 완료')
  if (typeof logActivity === 'function') logActivity('create', '인사관리', '사유 신청: ' + date + (inMemo ? ' (출근: ' + inMemo + ')' : '') + (outMemo ? ' (퇴근: ' + outMemo + ')' : ''))
  // 본인이 approver(grade>=2)면 즉시 알림 재계산
  if (typeof checkHrPendingItems === 'function') { try { checkHrPendingItems() } catch(e) {} }
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

  // 사유가 비었으면 신청 플래그 초기화 (승인되지 않은 건만)
  if (!checkInMemo && rec.lateRequested && !rec.lateApproved) {
    rec.lateRequested = false
    delete rec.lateRequestedAt
  }
  if (!checkOutMemo && rec.earlyRequested && !rec.earlyApproved) {
    rec.earlyRequested = false
    delete rec.earlyRequestedAt
  }

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

  // 모바일에서는 자동 팝업 안 띄움
  if (typeof window._isMobileDevice === 'function' && window._isMobileDevice()) return

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
    // _attendStatus가 연차/반차/미처리/근무중/지각/조퇴/정상 모두 반환
    var stObj = _attendStatus(rec || { date: today }, user.uid)
    var status = '', statusCls = ''
    if (stObj.status) {
      status = stObj.status
      statusCls = stObj.cls
    } else if (!rec || !rec.checkIn) {
      status = '미출근'; statusCls = 'hr-status-no'
    } else {
      status = stObj.status || '-'
      statusCls = stObj.cls || ''
    }

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
// ===== 급여 명세 (본인 보기) =====
// =============================================
window.renderSalaryTab = async function() {
  var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
  var html = buildHrProfileCard()
  html += '<div class="hr-section">'
  html += '<div class="hr-section-title">급여 명세</div>'
  html += '<div id="mySalaryTable" style="min-height:80px"><div style="text-align:center;padding:24px;color:#b4b2a9;font-size:12px">로딩 중...</div></div>'
  html += '</div>'
  document.getElementById('hrContent').innerHTML = html

  try {
    var snap = await db.collection('salaries').where('uid', '==', uid).get({ source: 'server' }).catch(function() {
      return db.collection('salaries').where('uid', '==', uid).get()
    })
    var list = []
    snap.forEach(function(doc) { list.push(Object.assign({ _id: doc.id }, doc.data())) })
    list.sort(function(a, b) { return (b.month || '').localeCompare(a.month || '') })

    var area = document.getElementById('mySalaryTable')
    if (!area) return
    if (!list.length) {
      area.innerHTML = '<div style="text-align:center;padding:24px;color:#b4b2a9;font-size:12px">등록된 급여 명세가 없습니다</div>'
      return
    }
    var h = '<table class="hr-table"><thead><tr><th>월</th><th>기본급</th><th>수당</th><th>공제</th><th>실수령액</th><th>메모</th></tr></thead><tbody>'
    list.forEach(function(s) {
      h += '<tr><td>' + (s.month || '') + '</td>'
      h += '<td>' + (s.baseSalary || 0).toLocaleString() + '</td>'
      h += '<td>' + (s.allowance || 0).toLocaleString() + '</td>'
      h += '<td style="color:#A32D2D">-' + (s.deduction || 0).toLocaleString() + '</td>'
      h += '<td style="font-weight:500">' + (s.netPay || 0).toLocaleString() + '</td>'
      h += '<td style="color:#6b6b6b">' + (s.memo || '') + '</td></tr>'
    })
    h += '</tbody></table>'
    area.innerHTML = h
  } catch(e) {
    console.warn('renderSalaryTab error:', e)
    var area = document.getElementById('mySalaryTable')
    if (area) area.innerHTML = '<div style="padding:16px;color:#A32D2D;font-size:12px">급여 정보 로드 실패: ' + e.message + '</div>'
  }
}

// =============================================
// ===== 급여 관리 (관리자) =====
// =============================================
var _salaryCache = []

window.renderSalaryAdminTab = async function() {
  console.log('[salary] renderSalaryAdminTab 시작')
  var panel = document.getElementById('hrAdminContent')
  if (!panel) return
  panel.innerHTML = '<div style="padding:24px;color:#6b6b6b;font-size:12px">로딩 중...</div>'

  // 권한 체크 (UI 안내용 — 실제 보안은 Firestore 규칙)
  if (!State.currentUser || !State.currentUser.grade || State.currentUser.grade < 3) {
    panel.innerHTML = '<div style="padding:24px;color:#A32D2D;font-size:13px">급여 관리는 관리자(grade 3+)만 접근 가능합니다.<br><small style="color:#6b6b6b">현재 등급: ' + (State.currentUser && State.currentUser.grade || '?') + '</small></div>'
    return
  }

  try {
    // 회원 목록 로드 (members)
    var usersSnap = await db.collection('users').where('status', '==', 'approved').get({ source: 'server' }).catch(function() {
      return db.collection('users').where('status', '==', 'approved').get()
    })
    var users = []
    usersSnap.forEach(function(doc) { users.push(Object.assign({ uid: doc.id }, doc.data())) })
    users.sort(function(a, b) { return (a.name || '').localeCompare(b.name || '') })
    console.log('[salary] approved 회원 수:', users.length)

    // 급여 목록 로드
    var salSnap = await db.collection('salaries').get({ source: 'server' }).catch(function() {
      return db.collection('salaries').get()
    })
    _salaryCache = []
    salSnap.forEach(function(doc) { _salaryCache.push(Object.assign({ _id: doc.id }, doc.data())) })
    _salaryCache.sort(function(a, b) {
      var m = (b.month || '').localeCompare(a.month || '')
      if (m !== 0) return m
      return (a.targetName || '').localeCompare(b.targetName || '')
    })

    // 필터 UI
    var userOptions = '<option value="">전체 회원</option>' + users.map(function(u) {
      return '<option value="' + u.uid + '">' + (u.name || u.email) + (u.dept ? ' (' + u.dept + ')' : '') + '</option>'
    }).join('')

    var years = []
    var curYear = new Date().getFullYear()
    for (var y = curYear - 3; y <= curYear + 1; y++) years.push(y)
    var yearOptions = '<option value="">전체 연도</option>' + years.map(function(y) {
      return '<option value="' + y + '"' + (y === curYear ? ' selected' : '') + '>' + y + '년</option>'
    }).join('')

    var html = ''
    html += '<div class="sal-toolbar" style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">'
    html += '  <select id="salFilterUser" onchange="renderSalaryAdminList()" style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;min-width:200px">' + userOptions + '</select>'
    html += '  <select id="salFilterYear" onchange="renderSalaryAdminList()" style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">' + yearOptions + '</select>'
    html += '  <input type="text" id="salFilterKeyword" placeholder="검색 (이름/메모)" oninput="renderSalaryAdminList()" style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;flex:1;min-width:160px" />'
    html += '  <button class="btn btn-new" onclick="openSalaryAddModal()">＋ 급여 추가</button>'
    html += '</div>'
    html += '<div id="salAdminTableArea"></div>'
    panel.innerHTML = html

    // 회원 리스트 window 공유 (모달에서 사용)
    window._salaryUsers = users

    renderSalaryAdminList()
  } catch(e) {
    console.warn('renderSalaryAdminTab error:', e)
    panel.innerHTML = '<div style="padding:24px;color:#A32D2D;font-size:12px">급여 관리 로드 실패: ' + e.message + '</div>'
  }
}

window.renderSalaryAdminList = function() {
  var area = document.getElementById('salAdminTableArea')
  if (!area) return
  var fUser = (document.getElementById('salFilterUser') || {}).value || ''
  var fYear = (document.getElementById('salFilterYear') || {}).value || ''
  var fKw = ((document.getElementById('salFilterKeyword') || {}).value || '').trim().toLowerCase()

  var filtered = _salaryCache.filter(function(s) {
    if (fUser && s.uid !== fUser) return false
    if (fYear && (s.month || '').indexOf(fYear + '-') !== 0) return false
    if (fKw) {
      var hay = ((s.targetName || '') + ' ' + (s.memo || '')).toLowerCase()
      if (hay.indexOf(fKw) < 0) return false
    }
    return true
  })

  if (!filtered.length) {
    area.innerHTML = '<div style="text-align:center;padding:40px;color:#b4b2a9;font-size:12px">등록된 급여 내역이 없습니다</div>'
    return
  }

  // 집계
  var totalBase = 0, totalAllow = 0, totalDeduct = 0, totalNet = 0
  filtered.forEach(function(s) {
    totalBase += (s.baseSalary || 0)
    totalAllow += (s.allowance || 0)
    totalDeduct += (s.deduction || 0)
    totalNet += (s.netPay || 0)
  })

  var h = '<div class="table-wrap card" style="margin-top:0">'
  h += '<table class="hr-table"><thead><tr>'
  h += '<th style="width:90px">월</th><th style="width:120px">대상</th><th style="width:90px">부서</th>'
  h += '<th style="width:110px">기본급</th><th style="width:110px">수당</th><th style="width:110px">공제</th><th style="width:120px">실수령액</th>'
  h += '<th>메모</th><th style="width:110px">등록자</th><th style="width:120px">관리</th></tr></thead><tbody>'
  filtered.forEach(function(s) {
    h += '<tr>'
    h += '<td>' + (s.month || '') + '</td>'
    h += '<td>' + (s.targetName || '') + '</td>'
    h += '<td style="color:#6b6b6b">' + (s.targetDept || '') + '</td>'
    h += '<td>' + (s.baseSalary || 0).toLocaleString() + '</td>'
    h += '<td>' + (s.allowance || 0).toLocaleString() + '</td>'
    h += '<td style="color:#A32D2D">-' + (s.deduction || 0).toLocaleString() + '</td>'
    h += '<td style="font-weight:500">' + (s.netPay || 0).toLocaleString() + '</td>'
    h += '<td style="color:#6b6b6b;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(s.memo || '') + '">' + esc(s.memo || '') + '</td>'
    h += '<td style="color:#6b6b6b;font-size:11px">' + (s.createdByName || '') + '</td>'
    h += '<td>'
    h += '<button class="btn btn-sm" onclick="openSalaryEditModal(\'' + s._id + '\')" style="margin-right:4px">수정</button>'
    h += '<button class="btn btn-sm btn-danger" onclick="deleteSalary(\'' + s._id + '\')">삭제</button>'
    h += '</td>'
    h += '</tr>'
  })
  h += '</tbody><tfoot><tr style="font-weight:600;background:#f5f4f1">'
  h += '<td colspan="3">합계 (' + filtered.length + '건)</td>'
  h += '<td>' + totalBase.toLocaleString() + '</td>'
  h += '<td>' + totalAllow.toLocaleString() + '</td>'
  h += '<td style="color:#A32D2D">-' + totalDeduct.toLocaleString() + '</td>'
  h += '<td>' + totalNet.toLocaleString() + '</td>'
  h += '<td colspan="3"></td></tr></tfoot></table></div>'
  area.innerHTML = h
}

var _editingSalaryId = null

window.openSalaryAddModal = function() {
  try {
    console.log('[salary] openSalaryAddModal 시작')
    _editingSalaryId = null
    var users = window._salaryUsers || []
    console.log('[salary] users 수:', users.length)
    if (!users.length) {
      showToast('회원 목록을 불러오지 못했습니다. 급여관리 탭을 다시 열어주세요.', 'warning')
      return
    }
    var userOpts = '<option value="">선택하세요</option>' + users.map(function(u) {
      return '<option value="' + u.uid + '">' + (u.name || u.email) + (u.dept ? ' (' + u.dept + ')' : '') + '</option>'
    }).join('')
    var titleEl = document.getElementById('salModalTitle')
    var userEl = document.getElementById('salFormUser')
    var monthEl = document.getElementById('salFormMonth')
    var baseEl = document.getElementById('salFormBase')
    var allowEl = document.getElementById('salFormAllow')
    var deductEl = document.getElementById('salFormDeduct')
    var netEl = document.getElementById('salFormNet')
    var memoEl = document.getElementById('salFormMemo')
    var modal = document.getElementById('salaryFormModal')
    if (!modal || !userEl || !monthEl) {
      console.error('[salary] 필수 DOM 없음', { modal: !!modal, userEl: !!userEl, monthEl: !!monthEl })
      showToast('급여 모달을 찾을 수 없습니다. 페이지를 새로고침해주세요.', 'error')
      return
    }
    if (titleEl) titleEl.textContent = '급여 추가'
    userEl.innerHTML = userOpts
    userEl.disabled = false
    var now = new Date()
    monthEl.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
    if (baseEl) baseEl.value = ''
    if (allowEl) allowEl.value = ''
    if (deductEl) deductEl.value = ''
    if (netEl) netEl.value = ''
    if (memoEl) memoEl.value = ''
    // 이미 열린 경우 먼저 닫기
    if (modal.open) modal.close()
    modal.showModal()
    if (typeof centerModal === 'function') centerModal(modal)
    console.log('[salary] 모달 열림')
  } catch(e) {
    console.error('[salary] openSalaryAddModal error:', e)
    showToast('급여 추가 모달 열기 실패: ' + e.message, 'error')
  }
}

window.openSalaryEditModal = function(docId) {
  var row = _salaryCache.find(function(s) { return s._id === docId })
  if (!row) return
  _editingSalaryId = docId
  var users = window._salaryUsers || []
  var userOpts = '<option value="">선택하세요</option>' + users.map(function(u) {
    return '<option value="' + u.uid + '"' + (u.uid === row.uid ? ' selected' : '') + '>' + (u.name || u.email) + (u.dept ? ' (' + u.dept + ')' : '') + '</option>'
  }).join('')
  document.getElementById('salModalTitle').textContent = '급여 수정'
  document.getElementById('salFormUser').innerHTML = userOpts
  document.getElementById('salFormUser').disabled = true
  document.getElementById('salFormMonth').value = row.month || ''
  document.getElementById('salFormBase').value = row.baseSalary || 0
  document.getElementById('salFormAllow').value = row.allowance || 0
  document.getElementById('salFormDeduct').value = row.deduction || 0
  document.getElementById('salFormNet').value = row.netPay || 0
  document.getElementById('salFormMemo').value = row.memo || ''
  var modal = document.getElementById('salaryFormModal')
  if (modal) { modal.showModal(); if (typeof centerModal === 'function') centerModal(modal) }
}

window.closeSalaryFormModal = function() {
  var modal = document.getElementById('salaryFormModal')
  if (modal) modal.close()
  _editingSalaryId = null
}

window.autoCalcSalaryNet = function() {
  var b = parseInt(document.getElementById('salFormBase').value) || 0
  var a = parseInt(document.getElementById('salFormAllow').value) || 0
  var d = parseInt(document.getElementById('salFormDeduct').value) || 0
  document.getElementById('salFormNet').value = b + a - d
}

window.saveSalary = async function() {
  console.log('[salary] saveSalary 시작')
  var uid = document.getElementById('salFormUser').value
  var month = document.getElementById('salFormMonth').value
  var baseSalary = parseInt(document.getElementById('salFormBase').value) || 0
  var allowance = parseInt(document.getElementById('salFormAllow').value) || 0
  var deduction = parseInt(document.getElementById('salFormDeduct').value) || 0
  var netPay = parseInt(document.getElementById('salFormNet').value) || 0
  var memo = document.getElementById('salFormMemo').value.trim()
  console.log('[salary] 입력값:', { uid: uid, month: month, base: baseSalary, allow: allowance, deduct: deduction, net: netPay })

  if (!uid) return showToast('대상 회원을 선택해주세요.', 'warning')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return showToast('월을 YYYY-MM 형식으로 입력해주세요.', 'warning')
  if (!State.currentUser || !State.currentUser.grade || State.currentUser.grade < 3) {
    return showToast('급여 등록 권한이 없습니다. (관리자 이상만 가능)', 'error')
  }
  if (!db || !firebase.auth || !firebase.auth().currentUser) {
    return showToast('로그인 상태를 확인해주세요.', 'error')
  }

  // 대상 회원 정보 스탬프
  var users = window._salaryUsers || []
  var target = users.find(function(u) { return u.uid === uid })
  var targetName = target ? (target.name || target.email) : ''
  var targetDept = target ? (target.dept || '') : ''

  var payload = {
    uid: uid,
    targetName: targetName,
    targetDept: targetDept,
    month: month,
    baseSalary: baseSalary,
    allowance: allowance,
    deduction: deduction,
    netPay: netPay,
    memo: memo,
    updatedAt: new Date().toISOString()
  }

  try {
    if (_editingSalaryId) {
      await db.collection('salaries').doc(_editingSalaryId).update(payload)
      if (typeof logActivity === 'function') logActivity('update', '인사관리', '급여 수정: ' + targetName + ' ' + month)
    } else {
      // 중복 체크 (같은 uid+month)
      var dup = _salaryCache.find(function(s) { return s.uid === uid && s.month === month })
      if (dup) {
        var ok = await korConfirm(targetName + '님의 ' + month + ' 급여가 이미 존재합니다. 덮어쓰시겠습니까?', '덮어쓰기', '취소')
        if (!ok) return
        await db.collection('salaries').doc(dup._id).update(payload)
        if (typeof logActivity === 'function') logActivity('update', '인사관리', '급여 덮어쓰기: ' + targetName + ' ' + month)
      } else {
        payload.createdAt = new Date().toISOString()
        payload.createdBy = firebase.auth().currentUser.uid
        payload.createdByName = (typeof _currentUserName !== 'undefined' && _currentUserName) ? _currentUserName : ''
        await db.collection('salaries').add(payload)
        if (typeof logActivity === 'function') logActivity('create', '인사관리', '급여 등록: ' + targetName + ' ' + month)
      }
    }
    showToast('저장되었습니다.', 'success')
    closeSalaryFormModal()
    // 알림: 대상자에게 급여 등록 알림
    if (typeof addNotification === 'function' && uid !== firebase.auth().currentUser.uid) {
      addNotification('salary', month + ' 급여가 등록되었습니다', '실수령액 ' + netPay.toLocaleString() + '원', '#hradmin', { targetUid: uid })
    }
    renderSalaryAdminTab()
  } catch(e) {
    console.error('saveSalary error:', e)
    showToast('저장 실패: ' + e.message, 'error')
  }
}

window.deleteSalary = async function(docId) {
  var row = _salaryCache.find(function(s) { return s._id === docId })
  if (!row) return
  var ok = await korConfirm(row.targetName + ' ' + row.month + ' 급여를 삭제하시겠습니까?', '삭제', '취소')
  if (!ok) return
  try {
    await db.collection('salaries').doc(docId).delete()
    if (typeof logActivity === 'function') logActivity('delete', '인사관리', '급여 삭제: ' + row.targetName + ' ' + row.month)
    showToast('삭제되었습니다.', 'success')
    renderSalaryAdminTab()
  } catch(e) {
    console.error('deleteSalary error:', e)
    showToast('삭제 실패: ' + e.message, 'error')
  }
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
  var salaryBtn = document.getElementById('hrAdminSalaryBtn')
  if (memberBtn) memberBtn.style.display = grade >= 3 ? '' : 'none'
  if (activityBtn) activityBtn.style.display = grade >= 3 ? '' : 'none'
  if (salaryBtn) salaryBtn.style.display = grade >= 3 ? '' : 'none'
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
  // 급여 관리는 hrAdminContent 를 재사용 (별도 패널 없음)
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
    else if (tab === 'salaryAdmin') { if (typeof renderSalaryAdminTab === 'function') renderSalaryAdminTab() }
    else if (tab === 'memberList') { if (typeof loadMembers === 'function') loadMembers() }
    else if (tab === 'activityLog') { if (typeof loadActivityLog === 'function') loadActivityLog() }
    else if (tab === 'backupManage') { if (typeof renderBackupPanel === 'function') renderBackupPanel() }
  } catch(e) {
    console.error('[HRAdmin] error:', e)
    if (hrContent) hrContent.innerHTML = '<div style="padding:24px;color:#A32D2D">' + e.message + '</div>'
  }
}

// ===== 팀원 연차 현황 — 조직도 스타일 부서별 그룹핑 =====
window.renderTeamLeaveTab = function() {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  var myDept = _currentUserDept || ''
  var quota = _getQuotaRecords()
  var allLeaves = _getLeaveRecords()
  var _noDeduct = ['대체연차', '병가']

  // 직급 우선순위 (높은 직급이 위)
  var POS_ORDER = (typeof POSITIONS !== 'undefined' ? POSITIONS : ['사원','주임','대리','과장','차장','실장','팀장','부장','이사','대표이사']).slice().reverse()
  function posIdx(p) { var i = POS_ORDER.indexOf(p); return i < 0 ? 999 : i }

  // 부서 목록 (필터 select용)
  var allDepts = []
  ;(_allUsers || []).forEach(function(u) {
    if (u.dept && allDepts.indexOf(u.dept) < 0) allDepts.push(u.dept)
  })
  allDepts.sort()

  // 이전 필터값 복원
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
    allDepts.forEach(function(d) { html += '<option value="' + esc(d) + '">' + esc(d) + '</option>' })
    html += '</select>'
  }
  html += '<span class="hradmin-filter-label">이름</span>'
  html += '<input type="text" class="hradmin-filter-select" id="hradminLeaveSearch" placeholder="이름 검색" value="' + esc(prevSearch) + '" oninput="renderTeamLeaveTab()" style="width:120px">'
  html += '</div>'

  var filterDept = prevDept
  var filterName = prevSearch.trim().toLowerCase()

  // 필터 적용
  var users = (_allUsers || []).filter(function(u) {
    if (grade === 2 && u.dept !== myDept) return false
    if (grade >= 3 && filterDept && u.dept !== filterDept) return false
    if (filterName && (u.name || '').toLowerCase().indexOf(filterName) < 0) return false
    return true
  })

  // 부서별 그룹핑
  var deptMap = {}
  users.forEach(function(u) {
    var d = u.dept || '미지정'
    if (!deptMap[d]) deptMap[d] = []
    deptMap[d].push(u)
  })

  // 부서 정렬: 설정 _depts 순서 우선 → 미지정 부서는 이름순 뒤에
  var deptOrder = (typeof _depts !== 'undefined' && _depts ? _depts.slice() : []).filter(function(d) { return deptMap[d] })
  Object.keys(deptMap).forEach(function(d) { if (deptOrder.indexOf(d) < 0) deptOrder.push(d) })

  // 부서 내 직급순 정렬
  deptOrder.forEach(function(d) {
    deptMap[d].sort(function(a, b) {
      return posIdx(a.position) - posIdx(b.position) || (a.name || '').localeCompare(b.name || '')
    })
  })

  html += '<div class="hradmin-section">'
  html += '<div class="hradmin-section-title">팀원 연차 현황 <span class="hradmin-badge">' + users.length + '명 · ' + deptOrder.length + '개 부서</span></div>'

  if (users.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:#b4b2a9;font-size:12px">표시할 팀원이 없습니다</div>'
  } else {
    html += '<div class="hrteam-grid">'
    deptOrder.forEach(function(dept) {
      var members = deptMap[dept]
      html += '<div class="hrteam-dept-card">'
      html += '<div class="hrteam-dept-header">'
      html += '<span class="hrteam-dept-name">' + esc(dept) + '</span>'
      html += '<span class="hrteam-dept-count">' + members.length + '명</span>'
      html += '</div>'
      html += '<div class="hrteam-members">'
      members.forEach(function(u) {
        var uQuota = quota[u.uid] || { total: 15, year: new Date().getFullYear() }
        var uLeaves = (allLeaves[u.uid] || []).filter(function(l) { return (l.status === '승인' || l.status === '확인완료') && _noDeduct.indexOf(l.type) < 0 })
        var used = uLeaves.reduce(function(s, l) { return s + (l.days || 0) }, 0)
        var remaining = uQuota.total - used
        var pct = uQuota.total > 0 ? Math.round(used / uQuota.total * 100) : 0
        var initial = (u.name || '?').slice(0, 1)

        html += '<div class="hrteam-member" onclick="openLeaveDetail(\'' + u.uid + '\')" title="상세 보기">'
        html += '<div class="hrteam-avatar">' + esc(initial) + '</div>'
        html += '<div class="hrteam-info">'
        html += '<div class="hrteam-name-row">'
        html += '<span class="hrteam-name">' + esc(u.name || '') + '</span>'
        html += '<span class="hrteam-pos">' + esc(u.position || '') + '</span>'
        html += '</div>'
        html += '<div class="hrteam-stats">'
        html += '<span>총 <b>' + uQuota.total + '</b>일</span>'
        html += '<span>사용 <b>' + used + '</b>일</span>'
        html += '<span>잔여 <b>' + remaining + '</b>일</span>'
        html += '</div>'
        html += '<div class="hrteam-bar">'
        html += '<div class="hrteam-bar-bg"><div class="hrteam-bar-fill" style="width:' + Math.min(pct, 100) + '%"></div></div>'
        html += '<span class="hrteam-bar-pct">' + pct + '%</span>'
        html += '</div>'
        html += '</div></div>'
      })
      html += '</div></div>'
    })
    html += '</div>'
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
  var curGradeLd = (State.currentUser && State.currentUser.grade) || 1
  var canDeleteLd = curGradeLd >= 3
  html += '<div class="ld-section-title">연차 사용 이력</div>'
  var sorted = uLeaves.slice().sort(function(a, b) { return (b.startDate || '').localeCompare(a.startDate || '') })
  if (sorted.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:#b4b2a9;font-size:12px">연차 사용 이력이 없습니다</div>'
  } else {
    html += '<table class="ld-table"><thead><tr><th>유형</th><th>시작일</th><th>종료일</th><th>일수</th><th>상태</th><th>사유</th>' + (canDeleteLd ? '<th></th>' : '') + '</tr></thead><tbody>'
    sorted.forEach(function(l) {
      var statusClass = l.status === '승인' || l.status === '확인완료' ? 'ld-st-ok' : l.status === '반려' ? 'ld-st-no' : 'ld-st-wait'
      html += '<tr>'
      html += '<td>' + esc(l.type || '-') + '</td>'
      html += '<td>' + esc(l.startDate || '-') + '</td>'
      html += '<td>' + esc(l.endDate || l.startDate || '-') + '</td>'
      html += '<td>' + (l.days || 0) + '일</td>'
      html += '<td><span class="' + statusClass + '">' + esc(l.status || '-') + '</span></td>'
      html += '<td style="font-size:11px;color:#666;max-width:120px;overflow:hidden;text-overflow:ellipsis" title="' + esc(l.reason || '') + '">' + esc(l.reason || '-') + '</td>'
      if (canDeleteLd) html += '<td><button class="hradmin-btn-reject" onclick="deleteLeaveFromDetail(\'' + uid + '\',\'' + esc(l.id) + '\')">삭제</button></td>'
      html += '</tr>'
    })
    html += '</tbody></table>'
  }

  body.innerHTML = html
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
}

// ===== 연차 상세 모달에서 삭제 (관리자 전용) =====
window.deleteLeaveFromDetail = async function(uid, leaveId) {
  await window.deleteLeave(uid, leaveId)
  // 삭제 후 상세 모달 재렌더 (여전히 열려있으면)
  var modal = document.getElementById('leaveDetailModal')
  if (modal && modal.open) window.openLeaveDetail(uid)
}

// ===== 연차 일수 수정은 회원관리 탭(grade>=3)에서만 수행 — 팀원 연차 현황에서는 제거 =====

// ===== HR 미처리건 체크 (로그인 시 grade >= 2) =====
window.checkHrPendingItems = function() {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  if (grade < 2) return

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

  // 출퇴근 승인 대기 (본인 제외, 현재 연도만)
  // 조건: (1) 본인이 사유(memo)를 작성하고 (2) 명시적으로 승인 신청(lateRequested/earlyRequested===true) 한 건만
  // 관찰 대상: 부서장(grade==2)은 본인 부서만, 관리자(grade>=3)는 전체
  // ※ 단순 지각자는 별도 `late_arrival` 알림에서 처리 — 여기에 포함되면 안 됨
  var pendingAttendRecords = []  // 개별 알림용
  var allAttend = _getAttendRecords()
  Object.keys(allAttend).forEach(function(uid) {
    if (uid === myUid) return
    var user = (_allUsers || []).find(function(u) { return u.uid === uid })
    if (!user) return
    if (grade === 2 && user.dept !== dept) return
    allAttend[uid].forEach(function(r) {
      var y = (r.date || '').slice(0, 4)
      if (y && parseInt(y) !== curYear) return
      var hasLateMemo = !!(r.checkInMemo && r.checkInMemo.trim())
      var hasEarlyMemo = !!(r.checkOutMemo && r.checkOutMemo.trim())
      if (r.lateRequested === true && hasLateMemo &&
          r.lateApproved !== 'approved' && r.lateApproved !== 'rejected') {
        pendingAttend++
        pendingAttendRecords.push({ uid: uid, user: user, date: r.date, type: 'late', memo: r.checkInMemo.trim() })
      }
      if (r.earlyRequested === true && hasEarlyMemo &&
          r.earlyApproved !== 'approved' && r.earlyApproved !== 'rejected') {
        pendingAttend++
        pendingAttendRecords.push({ uid: uid, user: user, date: r.date, type: 'early', memo: r.checkOutMemo.trim() })
      }
    })
  })

  // 벨 알림 (부서장=본인부서 / 관리자=전체)
  var scopeLabel = grade === 2 ? ' [' + (dept || '내 부서') + ']' : ''
  if (pendingLeave > 0 && typeof addNotification === 'function') {
    addNotification('leave_pending', '📋 연차 승인 대기 ' + pendingLeave + '건' + scopeLabel,
      '인사관리 > 연차 승인에서 확인하세요', '#hradmin', { priority: 'urgent' })
  }
  // 출퇴근 승인 대기: 개별 알림 (해당 날짜로 바로 이동)
  if (typeof addNotification === 'function') {
    pendingAttendRecords.forEach(function(rec) {
      var userName = typeof formatUserName === 'function' ? formatUserName(rec.user.name, rec.user.position) : (rec.user.name || '')
      var typeLabel = rec.type === 'late' ? '지각' : '조퇴'
      var title = '⏰ ' + userName + ' ' + rec.date.slice(5) + ' ' + typeLabel + ' 승인 대기'
      var body = (rec.user.dept ? '[' + rec.user.dept + '] ' : '') + '사유: ' + rec.memo
      var link = '#hradmin:attend:' + rec.uid + ':' + rec.date + ':' + rec.type
      addNotification('attend_pending', title, body, link, { priority: 'urgent' })
    })
  }

  // 지각자 알림 (grade>=2)
  if (typeof window.checkLateArrivalAlerts === 'function') {
    window.checkLateArrivalAlerts()
  }

  var total = pendingLeave + pendingAttend
  if (total === 0) return

  // 모달: 오늘 이미 확인했으면 스킵 (벨 알림은 이미 등록됨)
  var dismissed = localStorage.getItem('lemango_hr_pending_dismissed_v1')
  if (dismissed === fmtDate(new Date())) return

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
  html += '<table class="hradmin-table"><thead><tr><th>이름</th><th>부서</th><th>출근</th><th>출근IP</th><th>출근상태</th><th>출근사유</th><th>퇴근</th><th>퇴근IP</th><th>퇴근상태</th><th>퇴근사유</th><th>근무시간</th><th>상태</th></tr></thead><tbody>'

  users.forEach(function(u) {
    var rec = (records[u.uid] || []).find(function(r) { return r.date === filterDate })
    var workHours = '-'
    var uTh = _getAttendThresholds(u.uid, filterDate)

    if (rec && rec.checkIn && rec.checkOut) {
      var ip = rec.checkIn.split(':').map(Number)
      var op = rec.checkOut.split(':').map(Number)
      var mins = (op[0] * 60 + op[1]) - (ip[0] * 60 + ip[1])
      workHours = Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm'
    }

    // 출근 상태 (지각 여부 — 반차 오전이면 13:00 기준)
    var inStatusHtml = '-'
    var isLate = false
    if (rec && rec.checkIn) {
      var ipChk = rec.checkIn.split(':').map(Number)
      isLate = ipChk[0] > uTh.lateH || (ipChk[0] === uTh.lateH && ipChk[1] > uTh.lateM)
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

    // 퇴근 상태 (조퇴 여부 — 반차 오후이면 13:00 기준)
    var outStatusHtml = '-'
    var isEarly = false
    if (rec && rec.checkOut) {
      var opChk = rec.checkOut.split(':').map(Number)
      isEarly = opChk[0] < uTh.earlyH || (opChk[0] === uTh.earlyH && opChk[1] < uTh.earlyM)
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
    var isHalfLeaveT = leave && (leave.type || '').indexOf('반차') >= 0
    var isFullLeaveT = leave && !isHalfLeaveT
    var isPastDayT = _isPastDate(filterDate)
    var totalStatusHtml = ''
    if (isFullLeaveT) {
      totalStatusHtml = '<span class="hradmin-st hradmin-st-info">' + esc(leave.type) + '</span>'
    } else if (!rec || !rec.checkIn) {
      if (isHalfLeaveT) totalStatusHtml = '<span class="hradmin-st hradmin-st-info">' + esc(leave.type) + '</span>'
      else if (isPastDayT) totalStatusHtml = '<span class="hradmin-st hradmin-st-no">미처리</span>'
      else totalStatusHtml = '<span class="hradmin-st hradmin-st-no">미출근</span>'
    } else if (rec.checkIn && !rec.checkOut) {
      if (isPastDayT) totalStatusHtml = '<span class="hradmin-st hradmin-st-no">미처리</span>'
      else totalStatusHtml = '<span class="hradmin-st hradmin-st-wait">근무중</span>'
    } else {
      var effectiveLate = isLate && rec.lateApproved !== 'approved'
      var effectiveEarly = isEarly && rec.earlyApproved !== 'approved'
      if (effectiveLate && effectiveEarly) totalStatusHtml = '<span class="hradmin-st hradmin-st-warn">지각/조퇴</span>'
      else if (effectiveLate) totalStatusHtml = '<span class="hradmin-st hradmin-st-warn">지각</span>'
      else if (effectiveEarly) totalStatusHtml = '<span class="hradmin-st hradmin-st-warn">조퇴</span>'
      else {
        var ipT = rec.checkIn.split(':').map(Number), opT = rec.checkOut.split(':').map(Number)
        var minsT = (opT[0] * 60 + opT[1]) - (ipT[0] * 60 + ipT[1])
        if (isHalfLeaveT) totalStatusHtml = '<span class="hradmin-st hradmin-st-info">' + esc(leave.type) + '</span>'
        else if (minsT > 540) totalStatusHtml = '<span class="hradmin-st hradmin-st-info">야근</span>'
        else totalStatusHtml = '<span class="hradmin-st hradmin-st-ok">정상</span>'
      }
    }

    var inIp = (rec && rec.ip) ? rec.ip : '-'
    var outIp = (rec && rec.checkOutIp) ? rec.checkOutIp : '-'
    var inIpCell = '<td style="font-family:monospace;font-size:11px;color:#555" title="' + esc(inIp) + '">' + esc(inIp) + '</td>'
    var outIpCell = '<td style="font-family:monospace;font-size:11px;color:#555" title="' + esc(outIp) + '">' + esc(outIp) + '</td>'

    html += '<tr><td>' + esc(formatUserName(u.name, u.position)) + '</td>'
    html += '<td>' + esc(u.dept || '-') + '</td>'
    html += '<td>' + (rec && rec.checkIn ? rec.checkIn : '-') + '</td>'
    html += inIpCell
    html += '<td style="white-space:nowrap">' + inStatusHtml + '</td>'
    html += '<td style="font-size:11px;color:#666;max-width:100px;overflow:hidden;text-overflow:ellipsis" title="' + esc(rec && rec.checkInMemo || '') + '">' + inMemoHtml + '</td>'
    html += '<td>' + (rec && rec.checkOut ? rec.checkOut : '-') + '</td>'
    html += outIpCell
    html += '<td style="white-space:nowrap">' + outStatusHtml + '</td>'
    html += '<td style="font-size:11px;color:#666;max-width:100px;overflow:hidden;text-overflow:ellipsis" title="' + esc(rec && rec.checkOutMemo || '') + '">' + outMemoHtml + '</td>'
    html += '<td>' + workHours + '</td>'
    html += '<td>' + totalStatusHtml + '</td></tr>'
  })

  if (users.length === 0) html += '<tr><td colspan="12" style="text-align:center;color:#b4b2a9">표시할 팀원이 없습니다</td></tr>'
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
window.renderLeaveApprovalTab = async function() {
  var grade = (State.currentUser && State.currentUser.grade) || 1
  // _currentUserDept fallback — State.currentUser.dept 도 확인
  var dept = _currentUserDept || (State.currentUser && State.currentUser.dept) || ''

  // ★ 진입 시 최신 데이터 재조회 (타 사용자 신청 건 즉시 반영)
  try {
    if (typeof loadAllUsers === 'function') await loadAllUsers(true)
    if (typeof loadHrData === 'function') await loadHrData()
  } catch(e) { console.warn('renderLeaveApprovalTab refresh 실패:', e) }

  var allLeaves = _getLeaveRecords()

  var pendingList = []   // 부서장 승인 대기 (status === '대기')
  var confirmList = []   // 관리자 확인 대기 (status === '승인')
  var historyList = []   // 최근 처리 이력 (status === '확인완료' or '반려')

  Object.keys(allLeaves).forEach(function(uid) {
    var leaves = allLeaves[uid]
    var user = (_allUsers || []).find(function(u) { return u.uid === uid })

    leaves.forEach(function(l) {
      // 사용자 정보 우선순위: _allUsers 조회 > entry에 저장된 신청자 정보 > 기본값
      var uName = (user && user.name) || l.applicantName || '(알 수 없음)'
      var uPos  = (user && user.position) || l.applicantPosition || ''
      var uDept = (user && user.dept) || l.applicantDept || ''

      // 부서장(grade 2): 본인 부서만 처리. 부서 정보 없는 건은 관리자 이상에만 노출
      var deptMatch
      if (grade === 2) deptMatch = !!dept && uDept === dept
      else deptMatch = true

      var row = Object.assign({}, l, { uid: uid, userName: uName, userPosition: uPos, userDept: uDept })
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
    html += '<table class="hradmin-table"><thead><tr><th>이름</th><th>부서</th><th>날짜</th><th>유형</th><th>일수</th><th>승인자</th><th>관리자 확인</th><th>대표이사 확인</th><th></th></tr></thead><tbody>'
    confirmList.forEach(function(l) {
      var dateStr = l.startDate === l.endDate ? l.startDate.slice(5) : l.startDate.slice(5) + '~' + l.endDate.slice(5)
      var mgrDone = !!l.managerConfirmer
      var ceoDone = !!l.ceoConfirmer
      html += '<tr><td>' + esc(formatUserName(l.userName, l.userPosition)) + '</td>'
      html += '<td>' + esc(l.userDept || '-') + '</td>'
      html += '<td>' + dateStr + '</td>'
      html += '<td>' + esc(l.type) + '</td>'
      html += '<td>' + (l.days || 0) + '일</td>'
      // 승인자 (+ 승인 일시)
      html += '<td style="font-size:10px;line-height:1.35">' + esc(l.approverName || '-')
      if (l.approvedAt) html += '<div style="color:#8a8880;font-size:9.5px">' + formatDateTime(l.approvedAt) + '</div>'
      html += '</td>'
      // 관리자 확인 컬럼 — grade >= 3 바로 활성화
      html += '<td style="white-space:nowrap">'
      if (mgrDone) {
        html += '<span class="hradmin-st hradmin-st-ok">✓ ' + esc(l.managerConfirmerName) + '</span>'
        if (l.managerConfirmedAt) html += '<div style="color:#8a8880;font-size:9.5px;margin-top:2px">' + formatDateTime(l.managerConfirmedAt) + '</div>'
      } else if (grade >= 3) {
        html += '<button class="hradmin-btn-confirm" onclick="confirmLeaveManager(\'' + l.uid + '\',\'' + l.id + '\')">확인</button>'
      } else {
        html += '<span style="color:#b4b2a9;font-size:10px">대기</span>'
      }
      html += '</td>'
      // 대표이사 확인 컬럼 — grade >= 3 바로 활성화 (관리자 확인과 독립적)
      html += '<td style="white-space:nowrap">'
      if (ceoDone) {
        html += '<span class="hradmin-st hradmin-st-ok">✓ ' + esc(l.ceoConfirmerName) + '</span>'
        if (l.ceoConfirmedAt) html += '<div style="color:#8a8880;font-size:9.5px;margin-top:2px">' + formatDateTime(l.ceoConfirmedAt) + '</div>'
      } else if (grade >= 3) {
        html += '<button class="hradmin-btn-confirm-ceo" onclick="confirmLeaveCeo(\'' + l.uid + '\',\'' + l.id + '\')">확인</button>'
      } else {
        html += '<span style="color:#b4b2a9;font-size:10px">대기</span>'
      }
      html += '</td>'
      // 승인취소 / 반려
      html += '<td style="white-space:nowrap">'
      if (grade >= 3) {
        html += '<button style="padding:3px 10px;font-size:11px;border:1px solid #F09595;background:#fff;color:#A32D2D;border-radius:4px;cursor:pointer;margin-right:4px" onclick="cancelLeaveApproval(\'' + l.uid + '\',\'' + l.id + '\')">승인취소</button>'
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
    html += '<table class="hradmin-table"><thead><tr><th>이름</th><th>부서</th><th>날짜</th><th>유형</th><th>승인자</th><th>관리자 확인</th><th>대표이사 확인</th><th>상태</th></tr></thead><tbody>'
    historyList.forEach(function(l) {
      var dateStr = l.startDate === l.endDate ? l.startDate.slice(5) : l.startDate.slice(5) + '~' + l.endDate.slice(5)
      var stCls = l.status === '확인완료' ? 'hradmin-st-ok' : 'hradmin-st-no'
      html += '<tr><td>' + esc(formatUserName(l.userName, l.userPosition)) + '</td>'
      html += '<td>' + esc(l.userDept || '-') + '</td>'
      html += '<td>' + dateStr + '</td>'
      html += '<td>' + esc(l.type) + '</td>'
      // 승인자 + 일시
      html += '<td style="font-size:10px;line-height:1.35">' + esc(l.approverName || '-')
      if (l.approvedAt) html += '<div style="color:#8a8880;font-size:9.5px">' + formatDateTime(l.approvedAt) + '</div>'
      html += '</td>'
      // 관리자 확인 + 일시
      html += '<td style="font-size:10px;line-height:1.35">'
      if (l.managerConfirmerName) {
        html += '✓ ' + esc(l.managerConfirmerName)
        if (l.managerConfirmedAt) html += '<div style="color:#8a8880;font-size:9.5px">' + formatDateTime(l.managerConfirmedAt) + '</div>'
      } else html += '-'
      html += '</td>'
      // 대표이사 확인 + 일시
      html += '<td style="font-size:10px;line-height:1.35">'
      if (l.ceoConfirmerName) {
        html += '✓ ' + esc(l.ceoConfirmerName)
        if (l.ceoConfirmedAt) html += '<div style="color:#8a8880;font-size:9.5px">' + formatDateTime(l.ceoConfirmedAt) + '</div>'
      } else html += '-'
      html += '</td>'
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
      var th = _getAttendThresholds(uid, r.date)
      var isLate = ip[0] > th.lateH || (ip[0] === th.lateH && ip[1] > th.lateM)
      var isEarly = op[0] < th.earlyH || (op[0] === th.earlyH && op[1] < th.earlyM)
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

      var hasLateMemo = !!(r.checkInMemo && r.checkInMemo.trim())
      var hasEarlyMemo = !!(r.checkOutMemo && r.checkOutMemo.trim())
      var latePending = isLate && r.lateRequested === true && hasLateMemo && !r.lateApproved
      var earlyPending = isEarly && r.earlyRequested === true && hasEarlyMemo && !r.earlyApproved
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
