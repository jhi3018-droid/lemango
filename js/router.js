// =============================================
// ===== 탭 바 + Hash Routing =====
// =============================================

// ===== 탭 바 렌더 =====
function renderTabBar() {
  const bar = document.getElementById('tabBar')
  if (!bar) return
  bar.innerHTML = State.openTabs.map(tab => {
    const label = TAB_LABELS[tab] || tab
    const active = tab === State.activeTab ? ' tab-bar-btn-active' : ''
    return `<button class="tab-bar-btn${active}" data-tab="${tab}">
      <span class="tab-bar-label">${label}</span>
      <span class="tab-bar-close" data-tab="${tab}">&times;</span>
    </button>`
  }).join('')

  // 탭 클릭 → 전환
  bar.querySelectorAll('.tab-bar-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      // × 버튼 클릭은 별도 처리
      if (e.target.classList.contains('tab-bar-close')) return
      openTab(btn.dataset.tab)
    })
  })

  // × 버튼 클릭 → 닫기
  bar.querySelectorAll('.tab-bar-close').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      closeTab(btn.dataset.tab)
    })
  })
}

// ===== 탭 열기 (nav 버튼 또는 탭 바 클릭) =====
function openTab(tab) {
  // 회원관리 탭 접근 제한: grade 3 이상만
  if (tab === 'members' && State.currentUser && State.currentUser.grade < 3) {
    showToast('관리자만 접근할 수 있습니다.', 'warning')
    return
  }
  // 이미 열려있으면 포커스만 이동
  if (!State.openTabs.includes(tab)) {
    State.openTabs.push(tab)
    // 처음 열리는 탭은 렌더 함수 호출
    triggerTabRender(tab)
  }
  State.activeTab = tab
  applyTabState()
}

// ===== 탭 닫기 =====
function closeTab(tab) {
  const idx = State.openTabs.indexOf(tab)
  if (idx < 0) return

  State.openTabs.splice(idx, 1)

  // 활성 탭을 닫은 경우 → 인접 탭으로 이동
  if (State.activeTab === tab) {
    if (State.openTabs.length === 0) {
      // 모든 탭 닫힘 → 대시보드 복원
      State.openTabs.push('dashboard')
      State.activeTab = 'dashboard'
      triggerTabRender('dashboard')
    } else {
      // 왼쪽 탭 우선, 없으면 오른쪽
      const newIdx = Math.min(idx, State.openTabs.length - 1)
      State.activeTab = State.openTabs[newIdx]
    }
  }
  applyTabState()
}

// ===== 로고 클릭 → 전체 리셋 =====
function resetTabs() {
  State.openTabs = ['dashboard']
  State.activeTab = 'dashboard'

  // 컬럼 드래그 상태 초기화 (상품조회, 재고관리, 신규기획)
  ;['product', 'stock', 'plan'].forEach(tab => {
    State[tab].activeColumns   = null
    State[tab].inactiveColumns = []
    State[tab].columnFilters   = {}
    State[tab].sort            = { key: '', dir: '' }
    State[tab].page            = 1
    State[tab].pageSize        = 10
  })

  // 판매조회 플랫폼 + 필터 + 정렬 + 페이지 초기화
  State.sales.activePlatforms   = [..._platforms]
  State.sales.inactivePlatforms = []
  State.sales.columnFilters     = {}
  State.sales.sort              = { key: '', dir: '' }
  State.sales.page              = 1
  State.sales.pageSize          = 10

  // 렌더 캐시 비우기 (non-dashboard 탭은 재열 시 새로 렌더)
  ;[..._renderedTabs].forEach(tab => { if (tab !== 'dashboard') _renderedTabs.delete(tab) })

  triggerTabRender('dashboard')
  applyTabState()
}

// ===== 탭 상태 반영 =====
function applyTabState() {
  // close any open srm-modal dialogs on tab switch
  document.querySelectorAll('dialog.srm-modal[open]').forEach(d => d.close())
  if (typeof clearModalHistory === 'function') clearModalHistory()

  // 해시 업데이트
  const hash = '#' + State.activeTab
  if (location.hash !== hash) {
    history.pushState({ tab: State.activeTab }, '', hash)
  }

  // nav 버튼 하이라이트
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === State.activeTab)
  )

  // 탭 콘텐츠 표시
  document.querySelectorAll('.tab-content').forEach(c =>
    c.classList.toggle('active', c.id === 'tab-' + State.activeTab)
  )

  // 탭 바 재렌더
  renderTabBar()

  // 설정/행사/회원관리 탭은 열 때마다 렌더
  if (State.activeTab === 'settings') renderSettings()
  if (State.activeTab === 'event') renderEventTable()
  if (State.activeTab === 'members') loadMembers()
}

// ===== 탭 첫 열림 시 렌더 호출 =====
// _renderedTabs: 이미 렌더된 탭 추적 (데이터 로드 전에는 스킵)
const _renderedTabs = new Set()

function triggerTabRender(tab) {
  // 데이터가 아직 로드 안 됐으면 스킵 (init에서 일괄 렌더)
  // dashboard, board, members는 allProducts 불필요
  if (!State.allProducts.length && !['dashboard', 'board', 'members', 'orgchart'].includes(tab)) return
  if (_renderedTabs.has(tab)) return
  _renderedTabs.add(tab)

  // 테이블 탭 첫 진입 시 저장된 필터 기본값을 복원 + 검색 실행
  const filterTabMap = {
    product: { load: 'product', search: 'searchProduct' },
    stock:   { load: 'stock',   search: 'searchStock' },
    sales:   { load: 'sales',   search: 'searchSales' },
    plan:    { load: 'plan',    search: 'searchPlan' }
  }
  if (filterTabMap[tab] && typeof applyFilterDefault === 'function') {
    if (applyFilterDefault(filterTabMap[tab].load)) {
      const fn = window[filterTabMap[tab].search]
      if (typeof fn === 'function') { try { fn() } catch(e) {} }
    }
  }

  switch (tab) {
    case 'dashboard': renderDashboard(); break
    case 'product':   renderProductTable(); break
    case 'stock':     renderStockTable(); break
    case 'sales':     renderSalesTable(); break
    case 'plan':      renderPlanTable(); break
    case 'event':     renderEventTable(); break
    case 'work':      renderWorkCalendar(); break
    case 'settings':  renderSettings(); break
    case 'members':   loadMembers(); break
    case 'board':     renderBoard(); break
    case 'orgchart':  if (typeof renderOrgChart === 'function') renderOrgChart(); break
  }
}

// ===== 네비게이션 바 바인딩 =====
function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => openTab(btn.dataset.tab))
  })

  // 로고 클릭 → 전체 리셋
  const logo = document.querySelector('.logo')
  if (logo) {
    logo.style.cursor = 'pointer'
    logo.addEventListener('click', resetTabs)
  }

  // 뒤로가기/앞으로가기
  window.addEventListener('popstate', (e) => {
    // 게시판 상세/글쓰기 → 목록 복귀
    const detailView = document.getElementById('boardDetailView')
    const writeView = document.getElementById('boardWriteView')
    if ((detailView && detailView.style.display !== 'none') ||
        (writeView && writeView.style.display !== 'none')) {
      showBoardView('list')
      renderBoardList()
      return
    }
    const raw = location.hash.replace('#', '') || 'dashboard'
    const tab = raw.split('/')[0]
    openTab(tab)
  })
}

// ===== 기존 호환: navigateTo, switchTab =====
function navigateTo(tab) {
  openTab(tab)
}

function switchTab(tab, pushHistory = true) {
  openTab(tab)
}
