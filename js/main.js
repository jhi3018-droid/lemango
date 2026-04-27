// =============================================
// ===== 초기화 =====
// =============================================
async function init() {
  // Firebase 초기 관리자 계정 생성 (Firestore에 유저 없을 때만)
  try { await initAdminAccount() } catch (e) { console.log('initAdmin skip:', e.message) }

  // Auth 상태 리스너 등록 + 초기 상태 대기
  await initAuth()

  // 로그인 안 된 상태면 앱 초기화 건너뜀 (로그인 페이지만 표시)
  if (!State.currentUser) return

  initApp()
}

async function initApp() {
  // 2026-04-13 일회성 마이그레이션 코드 제거됨.
  // (per-device localStorage 게이팅 → 신규 디바이스마다 Firestore posts/comments/activityLogs/personalSchedules 전체 삭제하는 데이터 파괴 버그)

  // 상품조회/신규기획은 검색 필터 영속화 안 함 — 기존 저장값 정리
  try {
    localStorage.removeItem('lemango_filter_default_product')
    localStorage.removeItem('lemango_filter_default_plan')
  } catch(e) {}

  renderDate()
  bindTabs()
  loadAllUsers()
  if (typeof loadHrData === 'function') await loadHrData()
  if (typeof updateNotifToggleUI === 'function') updateNotifToggleUI()
  makeDraggableResizable(document.getElementById('activityDetailModal'))
  makeDraggableResizable(document.getElementById('dashInfoModal'))
  makeDraggableResizable(document.getElementById('memberEditModal'))
  makeDraggableResizable(document.getElementById('memberAddModal'))
  makeDraggableResizable(document.getElementById('salaryFormModal'))
  makeDraggableResizable(document.getElementById('memberProfileModal'))
  makeDraggableResizable(document.getElementById('detailModal'), 480, 300)
  makeDraggableResizable(document.getElementById('compareModal'), 600, 400)
  makeDraggableResizable(document.getElementById('registerModal'))
  makeDraggableResizable(document.getElementById('planRegisterModal'))
  makeDraggableResizable(document.getElementById('planDetailModal'))
  makeDraggableResizable(document.getElementById('stockRegisterModal'))
  makeDraggableResizable(document.getElementById('outgoingModal'))
  makeDraggableResizable(document.getElementById('weeklyReportModal'), 600, 400)
  makeDraggableResizable(document.getElementById('salesUploadModal'), 600, 400)
  makeDraggableResizable(document.getElementById('gonghomPreviewModal'))
  makeDraggableResizable(document.getElementById('sabangnetPreviewModal'))
  makeDraggableResizable(document.getElementById('eventRegisterModal'))
  makeDraggableResizable(document.getElementById('planScheduleModal'))
  makeDraggableResizable(document.getElementById('workRegisterModal'))
  makeDraggableResizable(document.getElementById('workDetailModal'))
  makeDraggableResizable(document.getElementById('personalScheduleModal'), 440, 300)
  makeDraggableResizable(document.getElementById('dashDayModal'), 360, 200)
  makeDraggableResizable(document.getElementById('barcodeUploadModal'), 500, 300)
  makeDraggableResizable(document.getElementById('downloadFormatModal'), 400, 300)
  makeDraggableResizable(document.getElementById('downloadFormatEditorModal'), 600, 400)
  makeDraggableResizable(document.getElementById('bulkEditPreviewModal'), 600, 400)
  makeDraggableResizable(document.getElementById('uploadResultModal'), 600, 400)
  makeDraggableResizable(document.getElementById('bulkScheduleModal'), 400, 300)
  makeDraggableResizable(document.getElementById('attendancePopup'), 300, 200)
  makeDraggableResizable(document.getElementById('leaveRequestModal'), 400, 300)
  makeDraggableResizable(document.getElementById('changePasswordModal'), 360, 250)
  makeDraggableResizable(document.getElementById('hrPendingModal'), 340, 200)
  makeDraggableResizable(document.getElementById('attendWriteModal'), 440, 300)
  makeDraggableResizable(document.getElementById('myAttendEditModal'), 400, 280)
  makeDraggableResizable(document.getElementById('leaveDetailModal'), 500, 300)
  document.getElementById('dashDayModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.close()
  })

  // 모든 모달 ESC(cancel) 키 차단 → 각 close 함수로 위임
  const modalCloseMap = {
    detailModal: closeDetailModal,
    planDetailModal: closePlanDetailModal,
    registerModal: closeRegisterModal,
    eventRegisterModal: closeEventRegisterModal,
    stockRegisterModal: closeStockRegisterModal,
    outgoingModal: closeOutgoingModal,
    barcodeUploadModal: closeBarcodeUploadModal,
    workRegisterModal: closeWorkRegisterModal,
    planRegisterModal: closePlanRegisterModal,
    personalScheduleModal: closePersonalScheduleModal,
    bulkScheduleModal: closeBulkScheduleModal,
  }
  document.querySelectorAll('dialog').forEach(modal => {
    modal.addEventListener('cancel', e => {
      const handler = modalCloseMap[modal.id]
      if (handler) {
        e.preventDefault()
        handler()
      }
      // modals not in the map close normally via default ESC behavior
    })
  })

  // 해시 기반 초기 탭
  const initTab = location.hash.replace('#', '') || 'dashboard'
  State.openTabs = [initTab]
  if (initTab !== 'dashboard' && !State.openTabs.includes('dashboard')) {
    // 대시보드도 같이 열어둠 (선택)
  }
  State.activeTab = initTab
  applyTabState()

  try {
    // ===== Firestore 우선 로드 (공유 데이터) =====
    let fsData = {}
    try {
      if (typeof _fsLoadAllSharedData === 'function') {
        fsData = await _fsLoadAllSharedData()
      }
    } catch (e) { console.warn('Firestore 공유 데이터 로드 실패:', e.message) }

    // 설정 데이터 Firestore → localStorage 동기화
    if (fsData.settings && typeof fsData.settings === 'object') {
      Object.assign(_settings, fsData.settings)
      localStorage.setItem('lemango_settings_v1', JSON.stringify(_settings))
    }
    if (Array.isArray(fsData.channels) && fsData.channels.length) {
      _channels.length = 0; fsData.channels.forEach(c => _channels.push(c))
      _platforms = _channels.filter(c => c.active).map(c => c.name)
      localStorage.setItem('lemango_channels_v1', JSON.stringify(_channels))
      savePlatforms()
    }
    if (Array.isArray(fsData.depts) && fsData.depts.length) {
      _depts.length = 0; fsData.depts.forEach(d => _depts.push(d))
      localStorage.setItem('lemango_depts_v1', JSON.stringify(_depts))
    }
    if (Array.isArray(fsData.planPhases) && fsData.planPhases.length) {
      _planPhases = fsData.planPhases
      localStorage.setItem('lemango_plan_phases_v1', JSON.stringify(_planPhases))
    }
    if (Array.isArray(fsData.workCategories) && fsData.workCategories.length) {
      _workCategories.length = 0; fsData.workCategories.forEach(c => _workCategories.push(c))
      localStorage.setItem('lemango_work_categories_v1', JSON.stringify(_workCategories))
    }
    if (Array.isArray(fsData.designCodes) && fsData.designCodes.length) {
      _designCodes.length = 0; fsData.designCodes.forEach(c => _designCodes.push(c))
      localStorage.setItem('lemango_design_codes_v1', JSON.stringify(_designCodes))
    }
    if (Array.isArray(fsData.classCodes) && fsData.classCodes.length) {
      _classCodes.length = 0; fsData.classCodes.forEach(c => _classCodes.push(c))
      localStorage.setItem('lemango_class_codes_v1', JSON.stringify(_classCodes))
    }
    if (Array.isArray(fsData.allowedIps)) {
      _allowedIps.length = 0; fsData.allowedIps.forEach(ip => _allowedIps.push(ip))
      localStorage.setItem('lemango_allowed_ips_v1', JSON.stringify(_allowedIps))
    }
    if (typeof fsData.ipEnforceMode === 'string') {
      _ipEnforceMode = fsData.ipEnforceMode
      localStorage.setItem('lemango_ip_enforce_v1', _ipEnforceMode)
    }
    if (Array.isArray(fsData.events)) {
      _events.length = 0; fsData.events.forEach(e => _events.push(e))
      localStorage.setItem('lemango_events_v1', JSON.stringify(_events))
    }
    if (Array.isArray(fsData.workItems)) {
      _workItems.length = 0; fsData.workItems.forEach(w => _workItems.push(w))
      localStorage.setItem('lemango_work_items_v1', JSON.stringify(_workItems))
    }
    if (Array.isArray(fsData.planItems) && fsData.planItems.length) {
      State.planItems = fsData.planItems
      localStorage.setItem('lemango_plan_items_v1', JSON.stringify(State.planItems))
    } else if (typeof loadPlanItems === 'function') {
      loadPlanItems()
    }

    // ===== 상품 데이터: Firestore 우선, 없으면 JSON 파일 =====
    let fsProducts = null
    let productsFromJson = false
    try {
      if (typeof _fsLoadProducts === 'function') fsProducts = await _fsLoadProducts()
    } catch (e) { console.warn('Firestore 상품 로드 실패:', e.message) }

    if (fsProducts && fsProducts.length) {
      State.allProducts = fsProducts
    } else {
      const [lem, noir] = await Promise.all([
        fetch('data/products_lemango.json').then(r => r.json()),
        fetch('data/products_noir.json').then(r => r.json())
      ])
      State.allProducts = [...lem, ...noir]
      productsFromJson = true
    }

    // ===== Firestore에 상품이 없으면 항상 강제 업로드 =====
    if (productsFromJson && State.allProducts.length > 0) {
      console.log('[FORCE] JSON에서 로드된 상품 ' + State.allProducts.length + '개 Firestore 업로드...')
      try { await _forceUploadProducts() } catch (e) { console.warn('강제 상품 업로드 실패:', e.message) }
    }

    // ===== localStorage → Firestore 초기 마이그레이션 (Firestore에 데이터 없을 때만) =====
    // Firestore가 주 저장소. Firestore에 이미 데이터가 로드되었으면 재동기화 불필요.
    const _fsWasEmpty = !fsData || Object.keys(fsData).length === 0
    if (_fsWasEmpty && typeof _fsSync === 'function') {
      try {
        console.log('[MIGRATE] Firestore 비어있음 — localStorage 데이터 업로드')
        if (_events.length) _fsSync('events', _events)
        if (_workItems.length) _fsSync('workItems', _workItems)
        if (_workCategories.length) _fsSync('workCategories', _workCategories)
        if (Object.keys(_settings).length) _fsSync('settings', _settings)
        if (_channels.length) _fsSync('channels', _channels)
        if (_depts && _depts.length) _fsSync('depts', _depts)
        if (State.planItems.length) _fsSync('planItems', State.planItems)
        if (_planPhases) _fsSync('planPhases', _planPhases)
        if (typeof _designCodes !== 'undefined' && _designCodes.length) _fsSync('designCodes', _designCodes)
        if (typeof _classCodes !== 'undefined' && _classCodes.length) _fsSync('classCodes', _classCodes)
        if (typeof _allowedIps !== 'undefined') _fsSync('allowedIps', _allowedIps)
        if (typeof _ipEnforceMode !== 'undefined') _fsSync('ipEnforceMode', _ipEnforceMode)
      } catch (e) { console.warn('초기 마이그레이션 실패:', e.message) }
    }

    State.product.filtered = [...State.allProducts]
    State.stock.filtered   = [...State.allProducts]
    State.sales.filtered   = [...State.allProducts]
    State.plan.filtered    = State.planItems.filter(p => !p.confirmed)
    State.workItems = [..._workItems]
    State.work.filtered = [...State.workItems]

    populateAllSelects()

    // 열린 탭들만 렌더 (첫 렌더 마킹)
    _renderedTabs.clear()
    State.openTabs.forEach(tab => triggerTabRender(tab))
  } catch (e) {
    showToast('데이터 로드 실패: ' + e.message, 'error')
    console.error(e)
  }
  // Enter 키 검색
  ;['pKeyword','sKeyword','slKeyword','npKeyword'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') el.closest('.tab-content')?.querySelector('.btn-primary')?.click() })
  })
  // 알림 초기화 — Firestore 에서 다기기 동기화된 알림 먼저 로드
  if (typeof _fsLoadNotifications === 'function') await _fsLoadNotifications()
  // 편집 잠금 Firestore 로드 (다른 사용자가 편집 중인 것 확인)
  if (typeof _fsLoadEditLocks === 'function') await _fsLoadEditLocks()
  // 사용자 프리퍼런스 (favorites/emojiRecent/notifSettings) Firestore 로드
  if (typeof _fsLoadUserPrefs === 'function') await _fsLoadUserPrefs()
  // Watches 공유 Firestore 로드 (notifyWatchers가 다른 사용자의 워치도 조회해야 함)
  if (typeof _fsLoadWatches === 'function') await _fsLoadWatches()
  // 상품 히스토리 공유 로드
  if (typeof _fsLoadProductHistory === 'function') await _fsLoadProductHistory()
  cleanOldNotifications()
  renderNotifications()
  checkMemberAlerts()
  if (typeof checkEventAlerts === 'function') checkEventAlerts()
  if (typeof checkPlanAlerts === 'function') checkPlanAlerts()
  if (typeof checkWorkMentionAlerts === 'function') checkWorkMentionAlerts()
  if (typeof checkPersonalScheduleAlerts === 'function') checkPersonalScheduleAlerts()
  // 로그인 직후 미읽은 알림 있으면 드롭다운 자동 표시 (urgent: 1초/5초유지, normal: 2초/3초유지)
  // 알림 전체 OFF 시 자동 팝업 생략
  const _nsLogin = (typeof getNotifSettings === 'function') ? getNotifSettings() : null
  const _notifOff = _nsLogin && _nsLogin.globalEnabled === false
  const hasUrgent = !_notifOff && (_notifications || []).some(n => !n.dismissed && !n.read && n.priority === 'urgent')
  setTimeout(() => {
    if (_notifOff) return
    const unread = (_notifications || []).filter(n => !n.dismissed && !n.read).length
    if (unread > 0) {
      const dd = document.getElementById('notifDropdown')
      if (dd) {
        renderNotifications()
        dd.style.display = 'block'
        setTimeout(() => { dd.style.display = 'none' }, hasUrgent ? 5000 : 3000)
      }
    }
  }, hasUrgent ? 1000 : 2000)
  // 알림 드롭다운 외부 클릭 닫기
  document.addEventListener('click', e => {
    const wrap = document.getElementById('notifWrap')
    const dd = document.getElementById('notifDropdown')
    if (wrap && dd && !wrap.contains(e.target)) dd.style.display = 'none'
    // 헤더 이름 드롭다운 외부 클릭 닫기
    const userWrap = document.querySelector('.header-user-wrap')
    if (userWrap && !userWrap.contains(e.target)) {
      const menu = document.getElementById('userDropdownMenu')
      if (menu) menu.classList.remove('user-menu-open')
    }
  })
  // 등급 뱃지: Grade 3+ 만 표시
  const gradeBadge = document.getElementById('headerUserGrade')
  if (gradeBadge && State.currentUser) {
    gradeBadge.style.display = State.currentUser.grade >= 3 ? 'inline-block' : 'none'
  }
  // 권한 기반 탭 가시성 적용
  updateTabVisibility()
  // 출근 팝업 (로그인 시 1.5초 후)
  setTimeout(() => { if (typeof checkAttendancePopup === 'function') checkAttendancePopup() }, 1500)

  // 자동 백업 시스템 시작
  if (typeof scheduleBackupTimer === 'function') scheduleBackupTimer()
  if (typeof runAutoBackup === 'function') runAutoBackup()

  // 편집 잠금 30초 백그라운드 폴링 (다른 사용자 편집 상태 반영)
  setInterval(() => {
    if (document.hidden) return
    if (typeof _fsLoadEditLocks === 'function') _fsLoadEditLocks()
  }, 30 * 1000)

  // 실시간 동기화 리스너 등록 (기존 5분 폴링 대체)
  if (typeof setupRealtimeSync === 'function') setupRealtimeSync()
}

// =============================================
// ===== 권한 기반 탭 가시성 =====
// =============================================
function updateTabVisibility() {
  const grade = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    const tab = btn.dataset.tab
    const required = (typeof TAB_PERMISSIONS !== 'undefined') ? TAB_PERMISSIONS[tab] : null
    if (required && grade < required) btn.style.display = 'none'
    else btn.style.display = ''
  })
  // 레거시 호환: 인사관리 버튼 (hradmin-nav-hidden 클래스 제거)
  const hrAdminBtn = document.getElementById('tabBtnHrAdmin')
  if (hrAdminBtn) {
    hrAdminBtn.classList.remove('hradmin-nav-hidden')
    hrAdminBtn.style.display = (grade >= 2) ? '' : 'none'
  }
}
window.updateTabVisibility = updateTabVisibility

document.addEventListener('wheel', function(e) {
  const t = e.target
  if (!t || t.tagName !== 'INPUT' || t.type !== 'time') return
  const val = t.value
  if (!val) return
  const [h, m] = val.split(':').map(Number)
  if (e.deltaY < 0 && h === 23 && m === 59) e.preventDefault()
  if (e.deltaY > 0 && h === 0 && m === 0) e.preventDefault()
}, { passive: false })

document.addEventListener('DOMContentLoaded', init)

// ===== 전역 에러 핸들러 → 활동 로그 자동 기록 =====
let _errorLogThrottle = 0
window.onerror = function(msg, source, line, col, error) {
  const now = Date.now()
  if (now - _errorLogThrottle < 3000) return // 3초 내 중복 방지
  _errorLogThrottle = now
  const file = source ? source.split('/').pop() : 'unknown'
  const detail = `${msg} (${file}:${line}:${col})`
  if (typeof logActivity === 'function') {
    logActivity('error', file, detail)
  }
}
window.addEventListener('unhandledrejection', function(e) {
  const now = Date.now()
  if (now - _errorLogThrottle < 3000) return
  _errorLogThrottle = now
  const msg = e.reason ? (e.reason.message || String(e.reason)) : 'Promise rejected'
  const stack = e.reason && e.reason.stack ? e.reason.stack.split('\n')[1] || '' : ''
  const file = stack.match(/\/([^/]+\.js)/) ? stack.match(/\/([^/]+\.js)/)[1] : 'async'
  const detail = `${msg} | ${stack.trim().slice(0, 200)}`
  if (typeof logActivity === 'function') {
    logActivity('error', file, detail)
  }
})
