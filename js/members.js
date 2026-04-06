// =============================================
// ===== 회원관리 탭 =====
// =============================================

const STATUS_DEFS = {
  approved:  { label: '활성',     dotClass: 'status-dot-active' },
  pending:   { label: '승인대기', dotClass: 'status-dot-pending' },
  suspended: { label: '정지',     dotClass: 'status-dot-suspended' },
  rejected:  { label: '거절',     dotClass: 'status-dot-suspended' }
}

// ===== Load members from Firestore =====
window.loadMembers = async function() {
  try {
    const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get()
    State.members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    renderMembersKPI()
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
      <div class="kpi-icon">${gradeBadgeHtml(4)}</div>
      <div class="kpi-value">${lv4}</div>
      <div class="kpi-label">최종관리자</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">${gradeBadgeHtml(3)}</div>
      <div class="kpi-value">${lv3}</div>
      <div class="kpi-label">관리자</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">📋</div>
      <div class="kpi-value">${lv12}</div>
      <div class="kpi-label">담당자 / 일반</div>
    </div>
  `
}

// ===== Members Table =====
function renderMembersTable() {
  const tbody = document.getElementById('membersTbody')
  if (!tbody) return
  const members = State.members || []

  if (!members.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">등록된 회원이 없습니다.</td></tr>'
    return
  }

  tbody.innerHTML = members.map((m, i) => {
    const st = STATUS_DEFS[m.status] || STATUS_DEFS.pending
    const lastLogin = m.lastLogin ? formatTimestamp(m.lastLogin) : '-'
    const createdAt = m.createdAt ? formatTimestamp(m.createdAt) : '-'
    const isSelf = State.currentUser && State.currentUser.uid === m.uid

    let actions = ''
    if (m.status === 'pending') {
      actions += `<button class="btn btn-sm btn-primary" onclick="approveMember('${m.uid}')">승인</button> `
      actions += `<button class="btn btn-sm btn-outline" onclick="rejectMember('${m.uid}')">거절</button> `
    }
    if (m.status === 'suspended') {
      actions += `<button class="btn btn-sm btn-outline" onclick="unsuspendMember('${m.uid}')">해제</button> `
    }
    if (m.status === 'approved' && !isSelf) {
      actions += `<button class="btn btn-sm btn-outline" onclick="suspendMember('${m.uid}')">정지</button> `
    }
    actions += `<button class="btn btn-sm btn-ghost" onclick="openMemberEditModal('${m.uid}')">수정</button>`
    if (!isSelf) {
      actions += ` <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="deleteMember('${m.uid}')">삭제</button>`
    }

    return `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td><span class="${st.dotClass}"></span> ${st.label}</td>
      <td><span class="member-email-link" onclick="openMemberProfileModal('${m.uid}')">${esc(m.email || '')}</span></td>
      <td>${esc(m.name || '')}</td>
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
  await db.collection('users').doc(uid).update({ status: 'approved' })
  showToast('회원이 승인되었습니다.')
  logActivity('approve', '회원관리', `회원승인: uid=${uid}`)
  loadMembers()
}

window.rejectMember = async function(uid) {
  const ok = await korConfirm('이 회원의 가입을 거절하시겠습니까?')
  if (!ok) return
  await db.collection('users').doc(uid).update({ status: 'rejected' })
  showToast('회원 가입이 거절되었습니다.')
  loadMembers()
}

window.suspendMember = async function(uid) {
  const ok = await korConfirm('이 회원을 정지하시겠습니까?')
  if (!ok) return
  await db.collection('users').doc(uid).update({ status: 'suspended' })
  showToast('회원이 정지되었습니다.')
  loadMembers()
}

window.unsuspendMember = async function(uid) {
  await db.collection('users').doc(uid).update({ status: 'approved' })
  showToast('회원 정지가 해제되었습니다.')
  loadMembers()
}

// ===== Delete =====
window.deleteMember = async function(uid) {
  const ok = await korConfirm('이 회원을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')
  if (!ok) return
  await db.collection('users').doc(uid).delete()
  showToast('회원이 삭제되었습니다.')
  logActivity('delete', '회원관리', `회원삭제: uid=${uid}`)
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
  document.getElementById('meEditDept').value = member.dept || ''
  document.getElementById('meEditGrade').value = member.grade || 1

  // 최종관리자만 등급 변경 가능
  const gradeSelect = document.getElementById('meEditGrade')
  gradeSelect.disabled = !(State.currentUser && State.currentUser.grade === 4)

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
  const name  = document.getElementById('meEditName').value.trim()
  const phone = document.getElementById('meEditPhone').value.trim()
  const dept  = document.getElementById('meEditDept').value
  const grade = parseInt(document.getElementById('meEditGrade').value)

  if (!name) return showToast('이름을 입력해주세요.', 'warning')

  const updates = { name, phone, dept }
  if (State.currentUser && State.currentUser.grade === 4) {
    updates.grade = grade
  }

  await db.collection('users').doc(_editingMemberUid).update(updates)
  showToast('회원 정보가 수정되었습니다.')
  logActivity('update', '회원관리', `회원수정: uid=${_editingMemberUid}`)
  closeMemberEditModal()
  loadMembers()
}

// ===== Add Member Modal =====
window.openMemberAddModal = function() {
  ;['maEmail','maName','maPhone','maPassword'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = ''
  })
  const dept = document.getElementById('maDept'); if (dept) dept.value = ''
  const grade = document.getElementById('maGrade'); if (grade) grade.value = '1'

  const modal = document.getElementById('memberAddModal')
  if (modal) { modal.showModal(); centerModal(modal) }
}

window.closeMemberAddModal = function() {
  const modal = document.getElementById('memberAddModal')
  if (modal) modal.close()
}

window.saveMemberAdd = async function() {
  const email = document.getElementById('maEmail').value.trim()
  const name  = document.getElementById('maName').value.trim()
  const phone = document.getElementById('maPhone').value.trim()
  const pw    = document.getElementById('maPassword').value
  const dept  = document.getElementById('maDept').value
  const grade = parseInt(document.getElementById('maGrade').value)

  if (!email || !name || !pw || !dept) return showToast('필수 항목을 입력해주세요.', 'warning')
  if (pw.length < 6) return showToast('비밀번호는 6자 이상이어야 합니다.', 'warning')

  try {
    // 현재 로그인 정보 저장 (Admin SDK 없이 우회)
    const currentUser = auth.currentUser
    const currentEmail = currentUser ? currentUser.email : null
    // NOTE: 클라이언트에서 다른 사용자 생성 시 현재 세션이 바뀜
    // 복원을 위해 사용자에게 안내
    const cred = await auth.createUserWithEmailAndPassword(email, pw)
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid,
      email: email,
      name: name,
      phone: phone,
      dept: dept,
      grade: grade,
      status: 'approved',
      createdAt: new Date(),
      lastLogin: null
    })
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

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

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
  const isTopAdmin = cu && cu.grade === 4
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
  const isTopAdmin = cu && cu.grade === 4
  if (!isSelf && !isTopAdmin) { _mpError('수정 권한이 없습니다.'); return }

  const email = document.getElementById('mpEmail').value.trim()
  const name  = document.getElementById('mpName').value.trim()
  const phone = document.getElementById('mpPhone').value.trim()
  const dept  = document.getElementById('mpDept').value
  const grade = parseInt(document.getElementById('mpGrade').value)

  if (!name) { _mpError('이름을 입력해주세요.'); return }
  if (!email) { _mpError('이메일을 입력해주세요.'); return }

  try {
    // 이메일 변경 처리 (Firebase Auth)
    const currentAuthUser = auth.currentUser
    if (isSelf && currentAuthUser && email !== currentAuthUser.email) {
      // 본인 이메일 변경 — reauthenticate 필요할 수 있음
      await currentAuthUser.updateEmail(email)
    } else if (isTopAdmin && !isSelf) {
      // 최종관리자가 다른 회원 이메일 변경 — Firestore만 업데이트 (Admin SDK 없이 Auth email은 변경 불가)
      // Firestore 기록만 업데이트
    }

    // Firestore 업데이트
    const updates = { email, name, phone, dept }
    if (isTopAdmin) updates.grade = grade
    await db.collection('users').doc(_profileUid).update(updates)

    // 본인 정보 변경 시 헤더 갱신
    if (isSelf) {
      State.currentUser = { ...State.currentUser, ...updates }
      updateHeaderUser(State.currentUser)
    }

    showToast('회원 정보가 저장되었습니다.')
    closeMemberProfileModal()
    // 회원관리 탭 열려있으면 새로고침
    if (State.openTabs.includes('members')) loadMembers()
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
