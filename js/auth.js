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

let auth, db
try {
  firebase.initializeApp(firebaseConfig)
  auth = firebase.auth()
  // 세션 단위 로그인 — 브라우저 탭 닫으면 로그아웃
  auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
  db   = firebase.firestore()
} catch (e) {
  console.error('Firebase init failed:', e.message)
}

// 최근 이메일 localStorage 저장/복원
const _EMAIL_KEY = 'lemango_last_email'
function saveLastEmail(email) { localStorage.setItem(_EMAIL_KEY, email) }
function getLastEmail() { return localStorage.getItem(_EMAIL_KEY) || '' }

// 등급 정의
const GRADE_DEFS = {
  4: { name: '최종관리자', bg: '#1a1a2e', color: '#c9a96e' },
  3: { name: '관리자',     bg: '#c9a96e', color: '#fff' },
  2: { name: '담당자',     bg: '#E6F1FB', color: '#0C447C' },
  1: { name: '일반사용자', bg: '#F1EFE8', color: '#5F5E5A' }
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

window.handleLogin = async function() {
  clearLoginError()
  if (!auth) { showLoginError('Firebase가 초기화되지 않았습니다. apiKey를 설정해주세요.'); return }
  const email = document.getElementById('loginEmail').value.trim()
  const password = document.getElementById('loginPassword').value
  if (!email || !password) { showLoginError('이메일과 비밀번호를 입력해주세요.'); return }

  const btn = document.getElementById('loginBtn')
  btn.disabled = true; btn.textContent = '로그인 중...'
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password)
    saveLastEmail(email)
    try {
      await checkApproval(cred.user)
    } catch (fsErr) {
      console.error('Firestore error:', fsErr)
      showLoginError('Firestore 오류: ' + fsErr.message)
    }
  } catch (err) {
    console.error('Auth error:', err)
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      showLoginError('이메일 또는 비밀번호가 올바르지 않습니다.')
    } else {
      showLoginError('로그인 오류: ' + err.message)
    }
  } finally {
    btn.disabled = false; btn.textContent = '로그인'
  }
}

async function checkApproval(user) {
  const docRef = db.collection('users').doc(user.uid)
  let doc = await docRef.get()

  // Auth에는 있지만 Firestore 문서가 없는 경우 → 자동 생성
  if (!doc.exists) {
    const userData = {
      uid: user.uid,
      email: user.email,
      name: user.email.split('@')[0],
      phone: '',
      dept: '',
      grade: 4,          // 직접 생성 = 최종관리자
      status: 'approved',
      createdAt: new Date(),
      lastLogin: new Date()
    }
    await docRef.set(userData)
    showApp(userData)
    return
  }

  if (doc.data().status !== 'approved') {
    await auth.signOut()
    showLoginError('관리자 승인 대기중입니다.')
    return
  }
  docRef.update({ lastLogin: new Date() })
  showApp(doc.data())
}

let _appInitialized = false

function showApp(userData) {
  document.getElementById('loginPage').style.display = 'none'
  document.getElementById('appContainer').style.display = ''
  State.currentUser = userData
  updateHeaderUser(userData)
  // 첫 로그인 시 앱 초기화 (init에서 return된 경우)
  if (!_appInitialized && typeof initApp === 'function') {
    _appInitialized = true
    initApp()
  }
}

function showLogin() {
  document.getElementById('loginPage').style.display = ''
  document.getElementById('appContainer').style.display = 'none'
  State.currentUser = null
}

function updateHeaderUser(userData) {
  const el = document.getElementById('headerUserName')
  if (el) el.textContent = userData.name + '님'
  const badge = document.getElementById('headerUserGrade')
  if (badge) badge.innerHTML = gradeBadgeHtml(userData.grade)
}

window.handleLogout = function() {
  auth.signOut()
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
}

window.handleSignup = async function() {
  if (!auth) { showToast('Firebase가 초기화되지 않았습니다.', 'danger'); return }
  const email     = document.getElementById('signupEmail').value.trim()
  const pw        = document.getElementById('signupPassword').value
  const pwConfirm = document.getElementById('signupPasswordConfirm').value
  const name      = document.getElementById('signupName').value.trim()
  const phone     = document.getElementById('signupPhone').value.trim()
  const dept      = document.getElementById('signupDept').value
  const agree     = document.getElementById('signupAgree').checked

  if (!email || !pw || !name || !dept) return showToast('필수 항목을 입력해주세요.', 'warning')
  if (pw.length < 8) return showToast('비밀번호는 8자 이상이어야 합니다.', 'warning')
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return showToast('비밀번호는 영문과 숫자를 포함해야 합니다.', 'warning')
  if (pw !== pwConfirm) return showToast('비밀번호가 일치하지 않습니다.', 'warning')
  if (!agree) return showToast('개인정보 수집에 동의해주세요.', 'warning')

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pw)
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid,
      email: email,
      name: name,
      phone: phone,
      dept: dept,
      grade: 1,
      status: 'pending',
      createdAt: new Date(),
      lastLogin: null
    })
    await auth.signOut()
    closeSignupModal()
    showLoginError('가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.', 'success')
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      showToast('이미 등록된 이메일입니다.', 'danger')
    } else {
      showToast('가입 중 오류가 발생했습니다: ' + err.message, 'danger')
    }
  }
}

// ===== Initial Admin Account =====
async function initAdminAccount() {
  if (!auth || !db) return
  const snapshot = await db.collection('users').limit(1).get()
  if (!snapshot.empty) return

  try {
    const cred = await auth.createUserWithEmailAndPassword('jhi3018@gmail.com', '1234')
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid,
      email: 'jhi3018@gmail.com',
      name: '최종관리자',
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

function initAuth() {
  if (!auth) {
    showLogin()
    return Promise.resolve()
  }
  return new Promise(resolve => {
    auth.onAuthStateChanged(async user => {
      if (user) {
        try {
          await checkApproval(user)
        } catch (e) {
          showLogin()
        }
      } else {
        showLogin()
      }
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
