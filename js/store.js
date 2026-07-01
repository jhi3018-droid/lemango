// =============================================
// ===== 매장 탭 (POS Phase 1c — shell only) =====
// =============================================
// 1c 범위: 탭 + 서브내비 6개(전부 "준비중" placeholder) + 관리자 매장 스위처.
// 재고/판매/업로드 로직 없음 (1d~ 및 Phase 3~). 권한 방침(CLAUDE.md 🔐 POS 권한 방침):
//   - 조회 화면(매출/재고)은 전 직원 개방 → 탭 자체는 TAB_PERMISSIONS.store=1
//   - 작업 화면(판매/취소/차감)은 본인 매장 직원+관리자 → 각 패널 내부에서 게이트(향후 단계)

// 서브 화면 정의 (소유주 확정 순서)
const STORE_SUBS = [
  { key: 'sale',      label: '판매' },
  { key: 'inbound',   label: '입고 스캔' },
  { key: 'stock',     label: '매장별 재고현황' },
  { key: 'replenish', label: '보충대상조회' },
  { key: 'discount',  label: '매장 할인 상품 관리' },
  { key: 'location',  label: '로케이션' },
]

// 현재 선택된 서브탭 (재렌더 시 유지). 기본값: 매장별 재고현황 (1f 에서 실제 구현되는 화면)
let _storeActiveSub = 'stock'

// 매장 id → 이름 (활성/비활성 무관 조회)
function _storeNameById(id) {
  if (!id) return ''
  const list = (typeof _stores !== 'undefined' ? _stores : [])
  const s = list.find(x => x && x.id === id)
  return s ? s.name : id
}

// 헤더의 매장 컨텍스트 (관리자=스위처 / staff=고정라벨 / 미배정=안내)
function _buildStoreContextHtml() {
  const grade = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  if (grade >= 3) {
    // 관리자: 활성 매장 스위처. 현재 값 = resolveActiveStore()
    const active = (typeof getActiveStores === 'function') ? getActiveStores() : []
    const cur = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : (active[0] && active[0].id) || ''
    if (!active.length) {
      return '<span class="store-ctx-empty">등록된 활성 매장이 없습니다 — 설정 → 🏬 매장 관리에서 추가하세요.</span>'
    }
    const opts = active.map(s => `<option value="${esc(s.id)}"${s.id === cur ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
    return `<label class="store-switcher-label">매장 선택
      <select id="storeSwitcher" class="store-switcher" onchange="onStoreSwitcherChange(this)">${opts}</select>
    </label>`
  }
  // staff: 본인 배정 매장 고정 표시
  const sid = (typeof _currentUserStoreId !== 'undefined' && _currentUserStoreId) ? _currentUserStoreId : ''
  if (!sid) {
    return '<span class="store-ctx-empty">배정된 매장이 없습니다 — 관리자에게 문의하세요.</span>'
  }
  return `<span class="store-ctx-fixed">🏬 ${esc(_storeNameById(sid))}</span>`
}

// 서브 패널 placeholder ("준비중")
function _storeSubPanelHtml(sub) {
  const shown = sub.key === _storeActiveSub
  return `<div class="store-panel${shown ? '' : ' store-panel-hidden'}" id="storePanel_${sub.key}">
    <div class="store-placeholder">
      <div class="store-placeholder-icon">🚧</div>
      <div class="store-placeholder-title">${esc(sub.label)}</div>
      <div class="store-placeholder-desc">준비중입니다</div>
    </div>
  </div>`
}

function renderStoreTab() {
  const page = document.getElementById('storePage')
  if (!page) return

  // 선택된 서브탭이 목록에 없으면 기본값으로 보정
  if (!STORE_SUBS.some(s => s.key === _storeActiveSub)) _storeActiveSub = 'stock'

  const subBar = STORE_SUBS.map(s =>
    `<button class="store-subtab${s.key === _storeActiveSub ? ' store-subtab-active' : ''}"
       onclick="switchStoreTab('${s.key}')">${esc(s.label)}</button>`
  ).join('')

  const panels = STORE_SUBS.map(_storeSubPanelHtml).join('')

  page.innerHTML = `
    <div class="store-header">
      <h2 class="store-title">🏬 매장</h2>
      <div class="store-context">${_buildStoreContextHtml()}</div>
    </div>
    <div class="store-subtabs">${subBar}</div>
    <div class="store-panels">${panels}</div>
  `
}

// 서브탭 전환 (패널 표시 토글 + 활성 버튼)
function switchStoreTab(sub) {
  _storeActiveSub = sub
  document.querySelectorAll('.store-subtab').forEach(btn => {
    const on = btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf("'" + sub + "'") >= 0
    btn.classList.toggle('store-subtab-active', !!on)
  })
  document.querySelectorAll('.store-panel').forEach(p => {
    p.classList.toggle('store-panel-hidden', p.id !== 'storePanel_' + sub)
  })
}

// 관리자 매장 스위처 setter — _storeViewOverride 설정 후 재렌더
// (1b 는 _storeViewOverride 를 선언만 했고, 1c 가 이 setter 를 추가)
function onStoreSwitcherChange(sel) {
  if (typeof _storeViewOverride !== 'undefined') _storeViewOverride = sel.value || ''
  renderStoreTab()
}

window.renderStoreTab = renderStoreTab
window.switchStoreTab = switchStoreTab
window.onStoreSwitcherChange = onStoreSwitcherChange
