// =============================================
// ===== Firebase Init + Auth =====
// =============================================

const firebaseConfig = {
  apiKey: "AIzaSyAaOmegOtdP6WoTZ53icm47CCBISBM-MM8",
  authDomain: "lemango-office.firebaseapp.com",
  projectId: "lemango-office",
  storageBucket: "lemango-office.firebasestorage.app",
  messagingSenderId: "1043476959297",
  appId: "1:1043476959297:web:e9a449fd5b9fac85d5b6c0",
  measurementId: "G-K28ZMPNWTN"
}

let auth, db, storage
try {
  firebase.initializeApp(firebaseConfig)
  auth = firebase.auth()
  // 세션 단위 로그인 — 브라우저 탭 닫으면 로그아웃
  auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
  db   = firebase.firestore()
  storage = firebase.storage()
} catch (e) {
  console.error('Firebase init failed:', e.message)
}

// 최근 이메일 localStorage 저장/복원
const _EMAIL_KEY = 'lemango_last_email'
function saveLastEmail(email) { localStorage.setItem(_EMAIL_KEY, email) }
function getLastEmail() { return localStorage.getItem(_EMAIL_KEY) || '' }

// 등급 정의
const GRADE_DEFS = {
  5: { name: '대표이사',   bg: '#2c2c2c', color: '#f0d68a' },
  4: { name: '시스템 관리자', bg: '#1a1a2e', color: '#c9a96e' },
  3: { name: '관리자',     bg: '#c9a96e', color: '#fff' },
  2: { name: '부서장',     bg: '#E6F1FB', color: '#0C447C' },
  1: { name: '담당자',     bg: '#F1EFE8', color: '#5F5E5A' }
}

function gradeBadgeHtml(grade) {
  const g = GRADE_DEFS[grade] || GRADE_DEFS[1]
  return `<span class="grade-badge" style="background:${g.bg};color:${g.color}">${g.name}</span>`
}

// ===== Login =====
function showLoginError(msg, type) {
  const el = document.getElementById('loginError')
  if (!el) return
  el.textContent = msg
  el.style.display = 'block'
  if (type === 'success') {
    el.style.background = '#E8F5E9'
    el.style.color = '#1B5E20'
  } else {
    el.style.background = '#FCEBEB'
    el.style.color = '#791F1F'
  }
}

function clearLoginError() {
  const el = document.getElementById('loginError')
  if (el) { el.textContent = ''; el.style.display = 'none' }
}

// handleLogin은 Auth만 처리, checkApproval은 onAuthStateChanged에서 단일 호출
let _loginInProgress = false

window.handleLogin = async function() {
  clearLoginError()
  if (!auth) { showLoginError('Firebase가 초기화되지 않았습니다. apiKey를 설정해주세요.'); return }
  const email = document.getElementById('loginEmail').value.trim()
  const password = document.getElementById('loginPassword').value
  if (!email || !password) { showLoginError('이메일과 비밀번호를 입력해주세요.'); return }

  const btn = document.getElementById('loginBtn')
  btn.disabled = true; btn.textContent = '로그인 중...'
  _loginInProgress = true
  try {
    await auth.signInWithEmailAndPassword(email, password)
    saveLastEmail(email)
    // checkApproval은 onAuthStateChanged에서 호출됨 — 여기서 중복 호출하지 않음
  } catch (err) {
    console.error('Auth error:', err)
    _loginInProgress = false
    btn.disabled = false; btn.textContent = '로그인'
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      showLoginError('이메일 또는 비밀번호가 올바르지 않습니다.')
    } else {
      showLoginError('로그인 오류: ' + err.message)
    }
  }
  // 버튼 복원은 onAuthStateChanged 콜백 완료 후 _resetLoginBtn()에서 처리
}

async function checkApproval(user) {
  const docRef = db.collection('users').doc(user.uid)
  // 항상 서버에서 직접 조회 (캐시 회피 — 승인 직후 즉시 반영)
  let doc
  try { doc = await docRef.get({ source: 'server' }) }
  catch (e) { doc = await docRef.get() }

  console.log('[checkApproval] uid:', user.uid, 'doc.exists:', doc.exists)
  if (doc.exists) console.log('[checkApproval] doc.data():', JSON.stringify(doc.data()))

  // Auth에는 있지만 Firestore 문서가 없는 경우 — 첫 시스템 초기화(users 컬렉션이 비어있음)일 때만 자동 관리자 생성
  if (!doc.exists) {
    let isFirstUser = false
    try {
      const snap = await db.collection('users').limit(1).get()
      isFirstUser = snap.empty
    } catch (e) { console.warn('users limit check 실패:', e.message) }

    if (isFirstUser) {
      const userData = {
        uid: user.uid,
        email: user.email,
        name: user.email.split('@')[0],
        phone: '', dept: '', position: '대표이사',
        grade: 4, status: 'approved',
        createdAt: new Date(), lastLogin: new Date()
      }
      await docRef.set(userData)
      showApp(userData)
      return
    }
    // 일반 케이스: 이전 가입 시 Firestore 저장 실패 등 — 안전하게 거부
    console.warn('[checkApproval] Firestore 문서 없음 — 안전 거부')
    await auth.signOut()
    showLoginError('회원 정보를 찾을 수 없습니다. 관리자에게 문의하거나 다시 가입해주세요.')
    return
  }

  const data = doc.data()
  if (data.status !== 'approved') {
    console.warn('[checkApproval] 승인 거부 — status:', data.status)
    await auth.signOut()
    const statusMsg = {
      pending:   '관리자 승인 대기중입니다.',
      rejected:  '가입이 거절되었습니다. 관리자에게 문의해주세요.',
      suspended: '계정이 정지되었습니다. 관리자에게 문의해주세요.'
    }
    showLoginError(statusMsg[data.status] || '로그인할 수 없습니다. (status: ' + data.status + ')')
    return
  }
  console.log('[checkApproval] 승인 확인 — showApp 호출')
  try { await docRef.update({ lastLogin: new Date() }) } catch (e) { console.warn('lastLogin update 실패:', e.message) }
  showApp(data)
  logActivity('login', '', '로그인 성공')
}

let _appInitialized = false

function showApp(userData) {
  const ls = document.getElementById('loadingScreen'); if (ls) ls.style.display = 'none'
  document.getElementById('loginPage').style.display = 'none'
  document.getElementById('appContainer').style.display = ''
  State.currentUser = userData
  _currentUserPosition = userData.position || ''
  _currentUserDept = userData.dept || ''
  _currentUserName = userData.name || ''
  updateHeaderUser(userData)
  applyGradeAccess(userData.grade)
  // 첫 로그인 시 앱 초기화 (init에서 return된 경우)
  if (!_appInitialized && typeof initApp === 'function') {
    _appInitialized = true
    initApp()
  }
  // URL 해시가 있으면 해당 탭 유지 (새로고침 시), 없으면 대시보드
  try {
    if (typeof openTab === 'function') {
      const hashTab = (location.hash || '').replace('#', '').split('/')[0]
      const validTab = hashTab && TAB_LABELS && TAB_LABELS[hashTab] ? hashTab : 'dashboard'
      openTab(validTab)
    }
  } catch(e){}
  // HR 미처리건 체크 (grade >= 2)
  setTimeout(function() { if (typeof checkHrPendingItems === 'function') checkHrPendingItems() }, 2000)
  // 생일 알림
  setTimeout(function() { if (typeof checkBirthdayAlerts === 'function') checkBirthdayAlerts() }, 2500)
}

function applyGradeAccess(grade) {
  // 인사관리 탭: grade 2(부서장) 이상만 접근 가능
  const hrAdminBtn = document.getElementById('tabBtnHrAdmin')
  if (hrAdminBtn) {
    if (grade >= 2) hrAdminBtn.classList.remove('hradmin-nav-hidden')
    else hrAdminBtn.classList.add('hradmin-nav-hidden')
  }
}

function showLogin() {
  const ls = document.getElementById('loadingScreen'); if (ls) ls.style.display = 'none'
  document.getElementById('loginPage').style.display = ''
  document.getElementById('appContainer').style.display = 'none'
  State.currentUser = null
}

function updateHeaderUser(userData) {
  const el = document.getElementById('headerUserName')
  if (el) el.textContent = formatUserNameHonorific(userData.name, userData.position)
  const badge = document.getElementById('headerUserGrade')
  if (badge) badge.innerHTML = gradeBadgeHtml(userData.grade)
}

window.handleLogout = function() {
  logActivity('logout', '', '로그아웃')
  // 1) 열린 모든 dialog 닫기
  try { document.querySelectorAll('dialog[open]').forEach(d => { try { d.close() } catch(e){} }) } catch(e){}
  // 2) 대시보드로 리셋
  try {
    if (typeof resetTabs === 'function') resetTabs()
    else if (typeof openTab === 'function') openTab('dashboard')
  } catch(e){}
  // 3) Firebase 로그아웃
  try { auth.signOut() } catch(e){}
  // 4) 전역 캐시 초기화
  try {
    _currentUserName = ''
    _currentUserPosition = ''
    _currentUserDept = ''
    if (typeof _notifications !== 'undefined') { _notifications = []; if (typeof saveNotifications === 'function') saveNotifications() }
  } catch(e){}
  // 5) 로그인 화면 표시
  try { showLogin() } catch(e){}
}

window.handleForgotPassword = function() {
  if (!auth) { showLoginError('Firebase가 초기화되지 않았습니다.'); return }
  const email = document.getElementById('loginEmail').value.trim()
  if (!email) { showLoginError('이메일을 입력해주세요.'); return }
  auth.sendPasswordResetEmail(email)
    .then(() => {
      showLoginError('비밀번호 재설정 이메일을 발송했습니다.', 'success')
    })
    .catch(() => showLoginError('등록되지 않은 이메일입니다.'))
}

// ===== Signup Modal =====
window.openSignupModal = function() {
  // 부서 select 채우기 (로그인 전이므로 populateAllSelects 미호출 상태)
  populateSelect('signupDept', _depts, false, true)
  const modal = document.getElementById('signupModal')
  if (modal) modal.showModal()
}
window.closeSignupModal = function() {
  const modal = document.getElementById('signupModal')
  if (modal) modal.close()
  // 폼 초기화
  ;['signupEmail','signupPassword','signupPasswordConfirm','signupName','signupPhone'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = ''
  })
  const dept = document.getElementById('signupDept'); if (dept) dept.value = ''
  const agree = document.getElementById('signupAgree'); if (agree) agree.checked = false
  const msg = document.getElementById('pwMatchMsg'); if (msg) msg.textContent = ''
  clearSignupError()
}

function showSignupError(msg) {
  const el = document.getElementById('signupError')
  if (!el) return
  el.textContent = msg
  el.className = 'signup-error'
  el.style.display = 'block'
}
function clearSignupError() {
  const el = document.getElementById('signupError')
  if (el) { el.textContent = ''; el.style.display = 'none' }
}

window.handleSignup = async function() {
  clearSignupError()
  if (!auth) { showSignupError('Firebase가 초기화되지 않았습니다.'); return }
  const email     = document.getElementById('signupEmail').value.trim()
  const pw        = document.getElementById('signupPassword').value
  const pwConfirm = document.getElementById('signupPasswordConfirm').value
  const name      = document.getElementById('signupName').value.trim()
  const phone     = document.getElementById('signupPhone').value.trim()
  const dept      = document.getElementById('signupDept').value
  const agree     = document.getElementById('signupAgree').checked

  if (!email || !pw || !name || !dept) return showSignupError('필수 항목을 입력해주세요.')
  if (pw.length < 8) return showSignupError('비밀번호는 8자 이상이어야 합니다.')
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return showSignupError('비밀번호는 영문과 숫자를 포함해야 합니다.')
  if (pw !== pwConfirm) return showSignupError('비밀번호가 일치하지 않습니다.')
  if (!agree) return showSignupError('개인정보 수집에 동의해주세요.')

  const btn = document.getElementById('signupBtn')
  if (btn) { btn.disabled = true; btn.textContent = '가입 중...' }
  let cred = null
  try {
    cred = await auth.createUserWithEmailAndPassword(email, pw)
    try {
      await db.collection('users').doc(cred.user.uid).set({
        uid: cred.user.uid,
        email: email,
        name: name,
        phone: phone,
        dept: dept,
        position: '사원',
        grade: 1,
        status: 'pending',
        createdAt: new Date(),
        lastLogin: null
      })
    } catch (firestoreErr) {
      // Firestore 저장 실패 — Auth 계정 롤백 (다음 가입 시 "이미 등록" 방지)
      try { await cred.user.delete() } catch (e) { console.warn('Auth rollback 실패:', e.message) }
      throw new Error('회원 정보 저장 실패: ' + firestoreErr.message)
    }
    await auth.signOut()
    closeSignupModal()
    showLoginError('가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.', 'success')
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      // Firestore에 해당 이메일 문서가 있는지 확인 → 안내 분기
      let existsInFirestore = false
      try {
        const snap = await db.collection('users').where('email', '==', email).limit(1).get()
        existsInFirestore = !snap.empty
      } catch (e) { console.warn('email 중복 확인 실패:', e.message) }
      if (existsInFirestore) {
        showSignupError('이미 등록된 이메일입니다. 비밀번호를 잊으셨다면 로그인 화면의 "비밀번호 찾기"를 사용해주세요.')
      } else {
        showSignupError('이전 가입이 미완료된 이메일입니다. 관리자에게 문의해주세요. (Firebase Auth 정리 필요)')
      }
    } else if (err.code === 'auth/weak-password') {
      showSignupError('비밀번호가 너무 약합니다. 6자 이상 입력해주세요.')
    } else if (err.code === 'auth/invalid-email') {
      showSignupError('이메일 형식이 올바르지 않습니다.')
    } else if (err.code === 'auth/network-request-failed') {
      showSignupError('네트워크 연결을 확인해주세요.')
    } else {
      showSignupError('가입 중 오류: ' + err.message)
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '가입하기' }
  }
}

// ===== Initial Admin Account =====
async function initAdminAccount() {
  if (!auth || !db) return
  const snapshot = await db.collection('users').limit(1).get()
  if (!snapshot.empty) return

  try {
    const cred = await auth.createUserWithEmailAndPassword('lemango@gmail.com', 'lemango2026!')
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid,
      email: 'lemango@gmail.com',
      name: '시스템 관리자',
      phone: '',
      dept: '경영지원',
      grade: 4,
      status: 'approved',
      createdAt: new Date(),
      lastLogin: null
    })
    console.log('Initial admin account created')
    await auth.signOut()
  } catch (e) {
    console.log('Admin init:', e.message)
  }
}

// ===== Auth State Listener =====
let _authInitialized = false

function _resetLoginBtn() {
  const btn = document.getElementById('loginBtn')
  if (btn) { btn.disabled = false; btn.textContent = '로그인' }
  _loginInProgress = false
}

function initAuth() {
  if (!auth) {
    showLogin()
    return Promise.resolve()
  }
  return new Promise(resolve => {
    auth.onAuthStateChanged(async user => {
      console.log('[onAuthStateChanged] user:', user ? user.uid : null)
      if (user) {
        try {
          await checkApproval(user)
        } catch (e) {
          console.error('[onAuthStateChanged] checkApproval error:', e)
          showLoginError('로그인 처리 중 오류: ' + e.message)
          showLogin()
        }
      } else {
        showLogin()
      }
      _resetLoginBtn()
      if (!_authInitialized) {
        _authInitialized = true
        resolve()
      }
    })
  })
}

// ===== Password match realtime check =====
document.addEventListener('DOMContentLoaded', () => {
  const confirmInput = document.getElementById('signupPasswordConfirm')
  if (confirmInput) {
    confirmInput.addEventListener('input', () => {
      const pw = document.getElementById('signupPassword').value
      const confirm = confirmInput.value
      const msg = document.getElementById('pwMatchMsg')
      if (!msg) return
      if (!confirm) { msg.textContent = ''; msg.className = ''; return }
      if (pw === confirm) {
        msg.textContent = '비밀번호가 일치합니다'
        msg.className = 'pw-match-ok'
      } else {
        msg.textContent = '비밀번호가 일치하지 않습니다'
        msg.className = 'pw-match-no'
      }
    })
  }

  // 최근 이메일 복원
  const loginEmailEl = document.getElementById('loginEmail')
  if (loginEmailEl) {
    loginEmailEl.value = getLastEmail()
    // 이메일 있으면 비밀번호에 포커스
    if (loginEmailEl.value) {
      const pwEl = document.getElementById('loginPassword')
      if (pwEl) pwEl.focus()
    }
  }

  // Enter key login
  ;['loginEmail', 'loginPassword'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin() })
  })
})
