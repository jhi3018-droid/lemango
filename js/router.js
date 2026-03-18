// =============================================
// ===== 탭 전환 + Hash Routing =====
// =============================================

function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.tab))
  })
  // 뒤로가기/앞으로가기
  window.addEventListener('popstate', () => {
    const tab = location.hash.replace('#', '') || 'dashboard'
    switchTab(tab, false)  // false = don't push history
  })
}

function navigateTo(tab) {
  history.pushState({ tab }, '', '#' + tab)
  switchTab(tab, false)
}

function switchTab(tab, pushHistory = true) {
  if (pushHistory) history.pushState({ tab }, '', '#' + tab)
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab))
  if (tab === 'settings') renderSettings()
}
