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
  // ── 일회성 전체 데이터 초기화 (Firebase users 제외) ──
  if (!localStorage.getItem('lemango_full_reset_v1')) {
    // 1) localStorage 전체 초기화
    const keysToRemove = [
      'lemango_events_v1', 'lemango_work_items_v1',
      'lemango_product_history_v1', 'lemango_notifications_v1',
      'lemango_recent_activity_v1', 'lemango_watches_v1',
      'lemango_edit_locks_v1', 'lemango_notif_settings_v1',
      'lemango_cleanup_done'
    ]
    keysToRemove.forEach(k => localStorage.removeItem(k))
    // 메모리 상태 초기화
    _events.length = 0
    _workItems.length = 0

    // 2) Firestore 컬렉션 초기화 (users 제외)
    const collectionsToClean = ['posts', 'comments', 'activityLogs', 'personalSchedules']
    for (const col of collectionsToClean) {
      try {
        const snap = await db.collection(col).get()
        const batch = db.batch()
        snap.docs.forEach(doc => batch.delete(doc.ref))
        if (snap.docs.length > 0) await batch.commit()
        console.log(`[RESET] ${col}: ${snap.docs.length}건 삭제`)
      } catch (e) { console.warn(`[RESET] ${col} 실패:`, e.message) }
    }

    localStorage.setItem('lemango_full_reset_v1', '1')
    console.log('[RESET] 전체 초기화 완료')
  }

  renderDate()
  bindTabs()
  loadAllUsers()
  if (typeof loadHrData === 'function') await loadHrData()
  if (typeof updateNotifToggleUI === 'function') updateNotifToggleUI()
  makeDraggableResizable(document.getElementById('activityDetailModal'))
  makeDraggableResizable(document.getElementById('dashInfoModal'))
  makeDraggableResizable(document.getElementById('memberEditModal'))
  makeDraggableResizable(document.getElementById('memberAddModal'))
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
    const [lem, noir] = await Promise.all([
      fetch('data/products_lemango.json').then(r => r.json()),
      fetch('data/products_noir.json').then(r => r.json())
    ])
    State.allProducts = [...lem, ...noir]
    if (typeof loadPlanItems === 'function') loadPlanItems()
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
  // 알림 초기화
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
  // 출근 팝업 (로그인 시 1.5초 후)
  setTimeout(() => { if (typeof checkAttendancePopup === 'function') checkAttendancePopup() }, 1500)

  // 자동 백업 시스템 시작
  if (typeof scheduleBackupTimer === 'function') scheduleBackupTimer()
  if (typeof runAutoBackup === 'function') runAutoBackup()

  // ===== 5분 자동 새로고침 (사용자 작업 방해 없이 백그라운드 갱신) =====
  setInterval(async () => {
    // 모달 열려있으면 skip (편집 중)
    if (document.querySelector('dialog[open]')) return
    // 입력 중이면 skip
    const ae = document.activeElement
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
    // 탭 비활성(다른 창 보는 중)이면 skip
    if (document.hidden) return

    try {
      // 회원/알림 관련은 항상 갱신 (헤더 벨/배지 반영)
      if (typeof loadMembers === 'function') await loadMembers()
      if (typeof checkMemberAlerts === 'function') checkMemberAlerts()
      if (typeof checkEventAlerts === 'function') checkEventAlerts()
      if (typeof checkPlanAlerts === 'function') checkPlanAlerts()
      if (typeof checkWorkMentionAlerts === 'function') checkWorkMentionAlerts()
      if (typeof checkPersonalScheduleAlerts === 'function') checkPersonalScheduleAlerts()
      if (typeof renderNotifications === 'function') renderNotifications()

      // 활성 탭별 데이터 갱신
      const tab = State.activeTab
      if (tab === 'dashboard' && typeof renderDashboard === 'function') renderDashboard()
      if (tab === 'board' && typeof loadBoardPosts === 'function') await loadBoardPosts()
      if (tab === 'members' && typeof renderMembersTable === 'function') renderMembersTable()
      if (tab === 'work' && typeof loadPersonalSchedules === 'function') await loadPersonalSchedules()
    } catch (e) {
      console.warn('자동 새로고침 실패:', e.message)
    }
  }, 5 * 60 * 1000)
}

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
