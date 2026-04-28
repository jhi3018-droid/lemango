// =============================================
// ===== 회원관리 탭 =====
// =============================================

const STATUS_DEFS = {
  approved:  { label: '활성',     dotClass: 'status-dot-active' },
  pending:   { label: '승인대기', dotClass: 'status-dot-pending' },
  suspended: { label: '정지',     dotClass: 'status-dot-suspended' },
  rejected:  { label: '거절',     dotClass: 'status-dot-suspended' }
}

// ===== 신규 입사자 연차 자동 계산 =====
// 한국 근로기준법 기준:
//  - 입사일 기준 경과 개월 수 = 연차 (최대 11일)
//  - 입사 1년(12개월) 이상 경과 시 15일, isNewHire 자동 해제
// 반환: { total, expired, months }
//  - total: 부여할 연차 일수
//  - expired: true면 1년 경과 → 호출자가 isNewHire=false로 세팅
//  - months: 경과 개월 수 (표시용)
window.calcNewHireQuota = function(joinDate) {
  const now = new Date()
  if (!joinDate) return { total: 15, expired: false, months: 0 }
  const join = new Date(joinDate)
  if (isNaN(join.getTime())) return { total: 15, expired: false, months: 0 }
  let months = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth())
  if (now.getDate() < join.getDate()) months--
  if (months < 0) months = 0
  if (months >= 12) return { total: 15, expired: true, months }
  return { total: Math.min(months, 11), expired: false, months }
}

// ===== 체크박스/입사일 변경 시 연차 필드 자동 업데이트 =====
// isInit=true 로 호출 시: 체크 해제 상태면 기존 값 유지 (모달 오픈 초기화용)
// isInit 생략(사용자 동작)시: 체크 해제 시 무조건 15로 리셋
window.onNewHireInputChange = function(mode, isInit) {
  const cbId    = mode === 'add' ? 'maIsNewHire'   : 'meEditIsNewHire'
  const jdId    = mode === 'add' ? 'maJoinDate'    : 'meEditJoinDate'
  const lqId    = mode === 'add' ? 'maLeaveQuota'  : 'meEditLeaveQuota'
  const hintId  = mode === 'add' ? 'maQuotaHint'   : 'meEditQuotaHint'
  const cb   = document.getElementById(cbId)
  const jd   = document.getElementById(jdId)
  const lq   = document.getElementById(lqId)
  const hint = document.getElementById(hintId)
  if (!lq) return
  if (cb && cb.checked) {
    const q = calcNewHireQuota(jd ? jd.value : '')
    if (q.expired) {
      // 1년 경과 → 자동 15일로 전환 + 체크박스 해제
      lq.value = 15
      cb.checked = false
      lq.disabled = false
      if (hint) hint.textContent = `입사 ${q.months}개월 경과 → 정규 15일로 자동 전환`
    } else {
      lq.value = q.total
      lq.disabled = true
      if (hint) hint.textContent = jd && jd.value
        ? `입사 ${q.months}개월 경과 → ${q.total}일 자동 계산`
        : '입사일을 먼저 입력하세요'
    }
  } else {
    lq.disabled = false
    if (hint) hint.textContent = ''
    // 사용자가 체크 해제 시 무조건 15로 리셋 (초기화 호출은 기존 값 유지)
    if (!isInit) lq.value = 15
  }
}

// ===== Load members from Firestore =====
window.loadMembers = async function() {
  try {
    // onSnapshot(users) 가 캐시를 항상 최신 상태로 유지 — 일반 .get() 으로 충분
    const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get()
    State.members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    renderMembersKPI()
    populateMemberDeptFilter()
    renderMembersTable()
  } catch (e) {
    console.error('회원 로드 실패:', e)
    showToast('회원 정보를 불러올 수 없습니다.', 'danger')
  }
}

// ===== KPI Cards =====
function renderMembersKPI() {
  const members = State.members || []
  const total = members.length
  const lv5 = members.filter(m => m.grade === 5).length
  const lv4 = members.filter(m => m.grade === 4).length
  const lv3 = members.filter(m => m.grade === 3).length
  const lv12 = members.filter(m => m.grade <= 2).length

  const kpiRow = document.getElementById('membersKpiRow')
  if (!kpiRow) return
  kpiRow.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon">👥</div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-label">전체 회원</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">${gradeBadgeHtml(5)}</div>
      <div class="kpi-value">${lv5}</div>
      <div class="kpi-label">대표이사</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">${gradeBadgeHtml(4)}</div>
      <div class="kpi-value">${lv4}</div>
      <div class="kpi-label">시스템 관리자</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">${gradeBadgeHtml(3)}</div>
      <div class="kpi-value">${lv3}</div>
      <div class="kpi-label">관리자</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">📋</div>
      <div class="kpi-value">${lv12}</div>
      <div class="kpi-label">부서장 / 담당자</div>
    </div>
  `
}

// ===== Dept filter populate =====
function populateMemberDeptFilter() {
  const sel = document.getElementById('memberFilterDept')
  if (!sel) return
  const prev = sel.value
  const deptsFromMembers = [...new Set((State.members || []).map(m => m.dept).filter(Boolean))]
  const deptList = (typeof _depts !== 'undefined' && _depts && _depts.length)
    ? [..._depts, ...deptsFromMembers.filter(d => !_depts.includes(d))]
    : deptsFromMembers
  sel.innerHTML = '<option value="">전체 부서</option>' +
    deptList.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('')
  if (prev && deptList.includes(prev)) sel.value = prev
}

window.filterMembers = function() { renderMembersTable() }
window.resetMemberFilter = function() {
  const deptEl = document.getElementById('memberFilterDept'); if (deptEl) deptEl.value = ''
  const nameEl = document.getElementById('memberFilterName'); if (nameEl) nameEl.value = ''
  const statusEl = document.getElementById('memberFilterStatus'); if (statusEl) statusEl.value = ''
  renderMembersTable()
}

// ===== Members Table =====
function renderMembersTable() {
  const tbody = document.getElementById('membersTbody')
  if (!tbody) return
  let members = State.members || []

  // 필터 적용
  const deptEl = document.getElementById('memberFilterDept')
  const nameEl = document.getElementById('memberFilterName')
  const statusEl = document.getElementById('memberFilterStatus')
  const fDept = deptEl ? deptEl.value : ''
  const fName = nameEl ? nameEl.value.trim().toLowerCase() : ''
  const fStatus = statusEl ? statusEl.value : ''
  if (fDept) members = members.filter(m => (m.dept || '') === fDept)
  if (fName) members = members.filter(m => (m.name || '').toLowerCase().includes(fName))
  if (fStatus) members = members.filter(m => (m.status || '') === fStatus)

  const countEl = document.getElementById('memberFilterCount')
  if (countEl) {
    const total = (State.members || []).length
    countEl.textContent = (fDept || fName || fStatus) ? `${members.length} / ${total} 명` : `${total} 명`
  }

  if (!members.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-row">조건에 맞는 회원이 없습니다.</td></tr>'
    return
  }

  tbody.innerHTML = members.map((m, i) => {
    const st = STATUS_DEFS[m.status] || STATUS_DEFS.pending
    const lastLogin = m.lastLogin ? formatTimestamp(m.lastLogin) : '-'
    const createdAt = m.createdAt ? formatTimestamp(m.createdAt) : '-'
    const isSelf = State.currentUser && State.currentUser.uid === m.uid

    const myGrade = (State.currentUser && State.currentUser.grade) || 0
    const canApprove = myGrade >= 2
    const canManage = myGrade >= 3
    let actions = ''
    if (m.status === 'pending' && canApprove) {
      actions += `<button class="btn btn-sm btn-primary" onclick="approveMember('${m.uid}')">승인</button> `
      actions += `<button class="btn btn-sm btn-outline" onclick="rejectMember('${m.uid}')">거절</button> `
    }
    if (m.status === 'suspended' && canManage) {
      actions += `<button class="btn btn-sm btn-outline" onclick="unsuspendMember('${m.uid}')">해제</button> `
    }
    if (m.status === 'approved' && !isSelf && canManage) {
      actions += `<button class="btn btn-sm btn-outline" onclick="suspendMember('${m.uid}')">정지</button> `
    }
    if (canManage) {
      actions += `<button class="btn btn-sm btn-ghost" onclick="openMemberEditModal('${m.uid}')">수정</button>`
      if (!isSelf) {
        actions += ` <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="deleteMember('${m.uid}')">삭제</button>`
      }
    }

    return `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td><span class="${st.dotClass}"></span> ${st.label}</td>
      <td><span class="member-email-link" onclick="openMemberProfileModal('${m.uid}')">${esc(m.email || '')}</span></td>
      <td>${esc(m.name || '')}</td>
      <td>${esc(m.position || '')}</td>
      <td>${esc(m.dept || '')}</td>
      <td>${gradeBadgeHtml(m.grade)}</td>
      <td>${lastLogin}</td>
      <td>${createdAt}</td>
      <td class="member-actions">${actions}</td>
    </tr>`
  }).join('')
}

function formatTimestamp(ts) {
  if (!ts) return '-'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

// ===== Approve / Reject / Suspend =====
window.approveMember = async function(uid) {
  if (!State.currentUser || State.currentUser.grade < 2) return showToast('권한이 없습니다.', 'warning')
  const m = (State.members || []).find(x => x.uid === uid) || {}
  const label = (typeof formatUserName === 'function') ? formatUserName(m.name || '', m.position || '') : (m.name || uid)
  await db.collection('users').doc(uid).update({ status: 'approved' })
  showToast('회원이 승인되었습니다.')
  logActivity('approve', '회원관리', `회원승인: ${label}`)
  loadMembers()
}

window.rejectMember = async function(uid) {
  if (!State.currentUser || State.currentUser.grade < 2) return showToast('권한이 없습니다.', 'warning')
  const ok = await korConfirm('이 회원의 가입을 거절하시겠습니까?')
  if (!ok) return
  await db.collection('users').doc(uid).update({ status: 'rejected' })
  showToast('회원 가입이 거절되었습니다.')
  loadMembers()
}

window.suspendMember = async function(uid) {
  if (!State.currentUser || State.currentUser.grade < 3) { showToast('권한이 없습니다. (관리자 이상)', 'warning'); return }
  const ok = await korConfirm('이 회원을 정지하시겠습니까?')
  if (!ok) return
  await db.collection('users').doc(uid).update({ status: 'suspended' })
  showToast('회원이 정지되었습니다.')
  loadMembers()
}

window.unsuspendMember = async function(uid) {
  if (!State.currentUser || State.currentUser.grade < 3) { showToast('권한이 없습니다. (관리자 이상)', 'warning'); return }
  await db.collection('users').doc(uid).update({ status: 'approved' })
  showToast('회원 정지가 해제되었습니다.')
  loadMembers()
}

// ===== Delete =====
window.deleteMember = async function(uid) {
  if (!State.currentUser || State.currentUser.grade < 3) { showToast('권한이 없습니다. (관리자 이상)', 'warning'); return }
  const m = (State.members || []).find(x => x.uid === uid) || {}
  const label = (typeof formatUserName === 'function') ? formatUserName(m.name || '', m.position || '') : (m.name || uid)
  const ok = await korConfirm('이 회원을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')
  if (!ok) return
  await db.collection('users').doc(uid).delete()
  showToast('회원이 삭제되었습니다.')
  logActivity('delete', '회원관리', `회원삭제: ${label}`)
  loadMembers()
}

// ===== Edit Modal =====
let _editingMemberUid = null

window.openMemberEditModal = function(uid) {
  const member = (State.members || []).find(m => m.uid === uid)
  if (!member) return
  _editingMemberUid = uid

  document.getElementById('meEditName').value = member.name || ''
  document.getElementById('meEditPhone').value = member.phone || ''
  document.getElementById('meEditPosition').value = member.position || ''
  document.getElementById('meEditDept').value = member.dept || ''
  document.getElementById('meEditGrade').value = member.grade || 1

  // 입사일 + 연차 일수
  const joinDateEl = document.getElementById('meEditJoinDate')
  if (joinDateEl) joinDateEl.value = member.joinDate || ''
  const leaveQuotaEl = document.getElementById('meEditLeaveQuota')
  if (leaveQuotaEl) {
    const quota = JSON.parse(localStorage.getItem('lemango_leave_quota_v1') || '{}')
    const uQuota = quota[uid] || { total: 15 }
    leaveQuotaEl.value = uQuota.total
  }

  // 시스템 관리자만 등급 변경 가능
  const gradeSelect = document.getElementById('meEditGrade')
  gradeSelect.disabled = !(State.currentUser && State.currentUser.grade >= 4)

  // 신규 입사자 체크 — 관리자 이상(grade>=3)만 노출/수정
  const newHireWrap = document.getElementById('meEditNewHireWrap')
  const newHireCb = document.getElementById('meEditIsNewHire')
  const canEditNewHire = !!(State.currentUser && State.currentUser.grade >= 3)
  if (newHireWrap) newHireWrap.style.display = canEditNewHire ? '' : 'none'
  if (newHireCb) {
    newHireCb.checked = !!member.isNewHire
    newHireCb.disabled = !canEditNewHire
  }
  // 초기 UI 상태 반영 (체크된 상태면 자동 계산 값으로 덮어쓰기 + disabled, 체크 해제면 기존값 유지)
  onNewHireInputChange('edit', true)

  const modal = document.getElementById('memberEditModal')
  if (modal) { modal.showModal(); centerModal(modal) }
}

window.closeMemberEditModal = function() {
  const modal = document.getElementById('memberEditModal')
  if (modal) modal.close()
  _editingMemberUid = null
}

window.saveMemberEdit = async function() {
  if (!_editingMemberUid) return
  const name     = document.getElementById('meEditName').value.trim()
  const phone    = document.getElementById('meEditPhone').value.trim()
  const position = document.getElementById('meEditPosition').value
  const dept     = document.getElementById('meEditDept').value
  const grade    = parseInt(document.getElementById('meEditGrade').value)

  if (!name) return showToast('이름을 입력해주세요.', 'warning')

  const joinDate = document.getElementById('meEditJoinDate') ? document.getElementById('meEditJoinDate').value : ''
  let leaveQuota = parseInt(document.getElementById('meEditLeaveQuota') ? document.getElementById('meEditLeaveQuota').value : '15') || 15

  const updates = { name, phone, position, dept, joinDate }
  if (State.currentUser && State.currentUser.grade >= 4) {
    updates.grade = grade
  }
  // 신규 입사자 체크 (관리자 이상만) — 자동 계산 + 1년 경과 시 해제
  if (State.currentUser && State.currentUser.grade >= 3) {
    const newHireCb = document.getElementById('meEditIsNewHire')
    const checked = !!(newHireCb && newHireCb.checked)
    if (checked) {
      const q = calcNewHireQuota(joinDate)
      if (q.expired) {
        updates.isNewHire = false          // 1년 경과 → 자동 해제
        updates.newHireGranted = true      // 더 이상 부여 불필요
        leaveQuota = 15                    // 정규 15일
      } else {
        updates.isNewHire = true
        leaveQuota = q.total               // 경과 개월 수 (최대 11)
      }
    } else {
      updates.isNewHire = false
      // 체크 해제 시 연차 수동 입력값 유지 (기본 15)
    }
  }

  // 연차 일수 저장 (Firestore + localStorage + HR 캐시 즉시 동기화)
  const year = new Date().getFullYear()
  const quotaObj = { total: leaveQuota, year }
  // HR 캐시(_quotaCache) + Firestore 동시 저장 — _saveQuota 헬퍼 사용
  if (typeof _saveQuota === 'function') {
    try { await _saveQuota(_editingMemberUid, quotaObj) } catch (e) { console.warn('_saveQuota error:', e) }
  } else {
    try {
      await db.collection('leaveQuotas').doc(_editingMemberUid).set(quotaObj, { merge: true })
    } catch (e) { console.warn('leaveQuotas save error:', e) }
    if (typeof _quotaCache !== 'undefined') _quotaCache[_editingMemberUid] = quotaObj
  }
  // window 스코프에도 미러 (팀원 연차 현황이 다른 탭에서 읽을 때 확실히 동기화)
  if (typeof window !== 'undefined') {
    window._quotaCache = window._quotaCache || {}
    window._quotaCache[_editingMemberUid] = quotaObj
  }
  const quota = JSON.parse(localStorage.getItem('lemango_leave_quota_v1') || '{}')
  quota[_editingMemberUid] = quotaObj
  localStorage.setItem('lemango_leave_quota_v1', JSON.stringify(quota))
  // 팀원 연차 현황이 DOM에 렌더되어 있으면 무조건 재렌더 (visibility 무관)
  if (typeof renderTeamLeaveTab === 'function' && document.getElementById('hrAdminContent')) {
    try { renderTeamLeaveTab() } catch (e) { console.warn('renderTeamLeaveTab error:', e) }
  }

  await db.collection('users').doc(_editingMemberUid).update(updates)
  if (State.currentUser && State.currentUser.uid === _editingMemberUid) {
    State.currentUser = { ...State.currentUser, ...updates }
    _currentUserPosition = position
    updateHeaderUser(State.currentUser)
  }
  showToast('회원 정보가 수정되었습니다.')
  const editLabel = (typeof formatUserName === 'function') ? formatUserName(name, position) : name
  logActivity('update', '회원관리', `회원수정: ${editLabel}`)
  closeMemberEditModal()
  loadMembers()
}

// ===== Add Member Modal =====
window.openMemberAddModal = function() {
  ;['maEmail','maName','maPhone','maPassword','maJoinDate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = ''
  })
  const pos = document.getElementById('maPosition'); if (pos) pos.value = '사원'
  const dept = document.getElementById('maDept'); if (dept) dept.value = ''
  const grade = document.getElementById('maGrade'); if (grade) grade.value = '1'
  const lq = document.getElementById('maLeaveQuota'); if (lq) { lq.value = 15; lq.disabled = false }
  const hint = document.getElementById('maQuotaHint'); if (hint) hint.textContent = ''

  // 신규 입사자 체크 — 관리자 이상만 노출
  const newHireWrap = document.getElementById('maNewHireWrap')
  const newHireCb = document.getElementById('maIsNewHire')
  const canEditNewHire = !!(State.currentUser && State.currentUser.grade >= 3)
  if (newHireWrap) newHireWrap.style.display = canEditNewHire ? '' : 'none'
  if (newHireCb) { newHireCb.checked = false; newHireCb.disabled = !canEditNewHire }

  const modal = document.getElementById('memberAddModal')
  if (modal) { modal.showModal(); centerModal(modal) }
}

window.closeMemberAddModal = function() {
  const modal = document.getElementById('memberAddModal')
  if (modal) modal.close()
}

window.saveMemberAdd = async function() {
  const email    = document.getElementById('maEmail').value.trim()
  const name     = document.getElementById('maName').value.trim()
  const phone    = document.getElementById('maPhone').value.trim()
  const pw       = document.getElementById('maPassword').value
  const position = document.getElementById('maPosition')?.value || '사원'
  const dept     = document.getElementById('maDept').value
  const grade    = parseInt(document.getElementById('maGrade').value)

  if (!email || !name || !pw || !dept) return showToast('필수 항목을 입력해주세요.', 'warning')
  if (pw.length < 6) return showToast('비밀번호는 6자 이상이어야 합니다.', 'warning')

  try {
    // 현재 로그인 정보 저장 (Admin SDK 없이 우회)
    const currentUser = auth.currentUser
    const currentEmail = currentUser ? currentUser.email : null
    // NOTE: 클라이언트에서 다른 사용자 생성 시 현재 세션이 바뀜
    // 복원을 위해 사용자에게 안내
    const cred = await auth.createUserWithEmailAndPassword(email, pw)
    const joinDate = document.getElementById('maJoinDate') ? document.getElementById('maJoinDate').value : ''
    const isNewHireCb = document.getElementById('maIsNewHire')
    let isNewHire = !!(State.currentUser && State.currentUser.grade >= 3 && isNewHireCb && isNewHireCb.checked)
    let newHireGranted = false
    let leaveQuota = parseInt(document.getElementById('maLeaveQuota') ? document.getElementById('maLeaveQuota').value : '15') || 15
    if (isNewHire) {
      const q = calcNewHireQuota(joinDate)
      if (q.expired) {
        isNewHire = false          // 1년 경과 → 정규 전환
        newHireGranted = true
        leaveQuota = 15
      } else {
        leaveQuota = q.total       // 경과 개월 수
      }
    }
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid,
      email: email,
      name: name,
      phone: phone,
      position: position,
      dept: dept,
      grade: grade,
      status: 'approved',
      joinDate: joinDate,
      isNewHire: isNewHire,
      newHireGranted: newHireGranted,
      createdAt: new Date(),
      lastLogin: null
    })
    // 연차 쿼터 초기 저장 + HR 캐시 반영
    const quotaObjAdd = { total: leaveQuota, year: new Date().getFullYear() }
    try {
      await db.collection('leaveQuotas').doc(cred.user.uid).set(quotaObjAdd)
    } catch (e) { console.warn('leaveQuotas init error:', e) }
    if (typeof _quotaCache !== 'undefined') _quotaCache[cred.user.uid] = quotaObjAdd
    // 생성 후 원래 사용자로 복원은 Admin SDK 없이 불가
    // 그래서 로그아웃 후 재로그인 필요 알림
    showToast(`${name} 회원이 추가되었습니다. 페이지가 새로고침됩니다.`)
    closeMemberAddModal()
    // 현재 auth가 새 유저로 바뀌었으므로 로그아웃 후 페이지 리로드
    await auth.signOut()
    setTimeout(() => location.reload(), 1000)
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      showToast('이미 등록된 이메일입니다.', 'danger')
    } else {
      showToast('회원 추가 실패: ' + err.message, 'danger')
    }
  }
}

/* esc() — utils.js에서 전역 정의 */

// =============================================
// ===== 회원 프로필 모달 =====
// =============================================
let _profileUid = null

function _mpError(msg) {
  const el = document.getElementById('mpError')
  if (!el) return
  el.textContent = msg; el.style.display = 'block'
}
function _mpClearError() {
  const el = document.getElementById('mpError')
  if (el) { el.textContent = ''; el.style.display = 'none' }
}

window.openMemberProfileModal = async function(uid) {
  _profileUid = uid
  _mpClearError()

  // Firestore에서 최신 데이터 로드
  let member
  try {
    const doc = await db.collection('users').doc(uid).get()
    if (!doc.exists) { showToast('회원 정보를 찾을 수 없습니다.', 'danger'); return }
    member = { id: doc.id, ...doc.data() }
  } catch (e) {
    showToast('회원 정보 로드 실패: ' + e.message, 'danger'); return
  }

  const cu = State.currentUser
  const isSelf = cu && cu.uid === uid
  const isTopAdmin = cu && cu.grade >= 4
  const canEditInfo = isSelf || isTopAdmin
  const canEditEmail = isSelf || isTopAdmin

  // 부서 select 채우기 (populateAllSelects에서도 하지만 모달 열 때 최신화)
  populateSelect('mpDept', _depts, false, true)

  // 필드 채우기
  document.getElementById('mpTitle').textContent = isSelf ? '내 프로필' : `${member.name || member.email} 정보`
  document.getElementById('mpEmail').value = member.email || ''
  document.getElementById('mpEmail').readOnly = !canEditEmail
  document.getElementById('mpName').value = member.name || ''
  document.getElementById('mpName').readOnly = !canEditInfo
  document.getElementById('mpPhone').value = member.phone || ''
  document.getElementById('mpPhone').readOnly = !canEditInfo
  const posSel = document.getElementById('mpPosition')
  if (posSel) { posSel.value = member.position || ''; posSel.disabled = !canEditInfo }
  const deptSel = document.getElementById('mpDept')
  deptSel.value = member.dept || ''
  deptSel.disabled = !canEditInfo
  const gradeSel = document.getElementById('mpGrade')
  gradeSel.value = member.grade || 1
  gradeSel.disabled = !isTopAdmin
  const created = member.createdAt ? formatTimestamp(member.createdAt) : '-'
  document.getElementById('mpCreatedAt').value = created

  // 비밀번호 섹션
  const pwSelf = document.getElementById('mpPwSelf')
  const pwAdmin = document.getElementById('mpPwAdmin')
  ;['mpPwCurrent','mpPwNew','mpPwConfirm'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = ''
  })
  if (isSelf) {
    pwSelf.style.display = ''; pwAdmin.style.display = 'none'
  } else if (isTopAdmin) {
    pwSelf.style.display = 'none'; pwAdmin.style.display = ''
  } else {
    pwSelf.style.display = 'none'; pwAdmin.style.display = 'none'
  }

  // 댓글 영역
  const commentArea = document.getElementById('mpCommentArea')
  if (commentArea) commentArea.innerHTML = buildCommentSection('member', uid)

  const modal = document.getElementById('memberProfileModal')
  if (modal) { modal.showModal(); centerModal(modal) }
  loadComments('member', uid)
}

window.openMyProfile = function() {
  if (!State.currentUser) return
  openMemberProfileModal(State.currentUser.uid)
}

window.closeMemberProfileModal = function() {
  const modal = document.getElementById('memberProfileModal')
  if (modal) modal.close()
  _profileUid = null
}

window.saveMemberProfile = async function() {
  if (!_profileUid) return
  _mpClearError()

  const cu = State.currentUser
  const isSelf = cu && cu.uid === _profileUid
  const isTopAdmin = cu && cu.grade >= 4
  if (!isSelf && !isTopAdmin) { _mpError('수정 권한이 없습니다.'); return }

  const email    = document.getElementById('mpEmail').value.trim()
  const name     = document.getElementById('mpName').value.trim()
  const phone    = document.getElementById('mpPhone').value.trim()
  const position = document.getElementById('mpPosition')?.value || ''
  const dept     = document.getElementById('mpDept').value
  const grade    = parseInt(document.getElementById('mpGrade').value)

  if (!name) { _mpError('이름을 입력해주세요.'); return }
  if (!email) { _mpError('이메일을 입력해주세요.'); return }

  try {
    // 이메일 변경 처리 (Firebase Auth)
    const currentAuthUser = auth.currentUser
    if (isSelf && currentAuthUser && email !== currentAuthUser.email) {
      // 본인 이메일 변경 — reauthenticate 필요할 수 있음
      await currentAuthUser.updateEmail(email)
    } else if (isTopAdmin && !isSelf) {
      // 시스템 관리자가 다른 회원 이메일 변경 — Firestore만 업데이트 (Admin SDK 없이 Auth email은 변경 불가)
      // Firestore 기록만 업데이트
    }

    // Firestore 업데이트
    const updates = { email, name, phone, position, dept }
    if (isTopAdmin) updates.grade = grade
    await db.collection('users').doc(_profileUid).update(updates)

    // 본인 정보 변경 시 헤더 갱신 + position 캐시
    if (isSelf) {
      State.currentUser = { ...State.currentUser, ...updates }
      _currentUserPosition = position
      updateHeaderUser(State.currentUser)
    }

    showToast('회원 정보가 저장되었습니다.')
    closeMemberProfileModal()
    // 회원관리 탭 열려있으면 새로고침
    if (State.openTabs.includes('hradmin')) loadMembers()
  } catch (err) {
    if (err.code === 'auth/requires-recent-login') {
      _mpError('이메일 변경을 위해 재로그인이 필요합니다. 로그아웃 후 다시 시도해주세요.')
    } else {
      _mpError('저장 실패: ' + err.message)
    }
  }
}

window.changeMemberPassword = async function() {
  _mpClearError()
  const cu = State.currentUser
  if (!cu || cu.uid !== _profileUid) { _mpError('본인만 비밀번호를 변경할 수 있습니다.'); return }

  const currentPw = document.getElementById('mpPwCurrent').value
  const newPw     = document.getElementById('mpPwNew').value
  const confirmPw = document.getElementById('mpPwConfirm').value

  if (!currentPw) { _mpError('현재 비밀번호를 입력해주세요.'); return }
  if (newPw.length < 6) { _mpError('새 비밀번호는 6자 이상이어야 합니다.'); return }
  if (newPw !== confirmPw) { _mpError('새 비밀번호가 일치하지 않습니다.'); return }

  try {
    const user = auth.currentUser
    // reauthenticate
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPw)
    await user.reauthenticateWithCredential(credential)
    await user.updatePassword(newPw)
    ;['mpPwCurrent','mpPwNew','mpPwConfirm'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = ''
    })
    showToast('비밀번호가 변경되었습니다.', 'success')
  } catch (err) {
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      _mpError('현재 비밀번호가 올바르지 않습니다.')
    } else {
      _mpError('비밀번호 변경 실패: ' + err.message)
    }
  }
}

window.resetMemberPassword = async function() {
  if (!_profileUid) return
  // Firestore에서 이메일 가져오기
  try {
    const doc = await db.collection('users').doc(_profileUid).get()
    if (!doc.exists) { _mpError('회원 정보를 찾을 수 없습니다.'); return }
    const email = doc.data().email
    await auth.sendPasswordResetEmail(email)
    showToast(`${email}로 비밀번호 초기화 이메일을 발송했습니다.`, 'success')
  } catch (err) {
    _mpError('이메일 발송 실패: ' + err.message)
  }
}

// ===== 신규 입사자 연차 자동 재계산 (dormant — 수동/크론 호출용) =====
// 동작: isNewHire === true 인 모든 회원에 대해 입사일 기준 개월 수로 leaveQuotas.total 재계산
//   - < 12개월: total = min(months, 11)
//   - ≥ 12개월: total = 15, isNewHire = false, newHireGranted = true (정규 전환)
// NOTE: 자동 호출 없음. 추후 크론/관리자 버튼에서 grantNewHireLeave() 호출
window.grantNewHireLeave = async function() {
  if (!db) { console.warn('[grantNewHireLeave] db not ready'); return { updated: 0, graduated: 0, skipped: 0 } }
  const year = new Date().getFullYear()
  let updated = 0, graduated = 0, skipped = 0
  try {
    const snap = await db.collection('users').where('isNewHire', '==', true).get()
    for (const doc of snap.docs) {
      const u = doc.data()
      if (!u.joinDate) { skipped++; continue }
      const q = calcNewHireQuota(u.joinDate)
      const quotaRef = db.collection('leaveQuotas').doc(u.uid)
      const quotaDoc = await quotaRef.get()
      const cur = quotaDoc.exists ? quotaDoc.data() : { total: 0, year }

      if (q.expired) {
        // 1년 경과 → 15일로 전환 + 체크 해제
        await quotaRef.set({ total: 15, year }, { merge: true })
        await db.collection('users').doc(u.uid).set({ isNewHire: false, newHireGranted: true, newHireGrantedAt: new Date() }, { merge: true })
        if (typeof logActivity === 'function') {
          logActivity('setting', '인사관리', `신규→정규 전환: ${u.name || u.uid} (입사 ${u.joinDate}, ${q.months}개월 경과) → 15일`)
        }
        graduated++
      } else if ((cur.total || 0) !== q.total) {
        // 월별 누적 재계산
        await quotaRef.set({ total: q.total, year }, { merge: true })
        if (typeof logActivity === 'function') {
          logActivity('setting', '인사관리', `신규 입사자 연차 재계산: ${u.name || u.uid} (입사 ${u.joinDate}, ${q.months}개월) → ${q.total}일`)
        }
        updated++
      } else {
        skipped++
      }
    }
  } catch (e) { console.error('[grantNewHireLeave] error:', e) }
  console.log(`[grantNewHireLeave] updated=${updated}, graduated=${graduated}, skipped=${skipped}`)
  return { updated, graduated, skipped }
}

// ===== 알림: 승인대기 회원 =====
async function checkMemberAlerts() {
  if (!db || !State.currentUser || State.currentUser.grade < 2) return
  try {
    const snap = await db.collection('users').where('status', '==', 'pending').get()
    if (!snap.empty) {
      addNotification('member_pending_urgent', `🔴 신규 가입 승인 대기 ${snap.size}명`, '인사관리 > 회원관리에서 즉시 승인/거절해 주세요.', '#hradmin', { priority: 'urgent' })
    }
  } catch (e) { console.warn('checkMemberAlerts error:', e) }
}
