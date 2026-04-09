// =============================================
// ===== 조직도 =====
// =============================================

function formatPhone(raw) {
  if (!raw) return ''
  const d = String(raw).replace(/\D/g, '')
  if (d.length === 11) return d.slice(0,3) + '-' + d.slice(3,7) + '-' + d.slice(7)
  if (d.length === 10) return d.slice(0,3) + '-' + d.slice(3,6) + '-' + d.slice(6)
  return raw
}

async function renderOrgChart() {
  const el = document.getElementById('orgchartPage')
  if (!el) return
  el.innerHTML = '<div style="padding:40px;text-align:center;color:#888">불러오는 중...</div>'

  let users = []
  try {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      const snap = await firebase.firestore().collection('users').get()
      snap.forEach(doc => {
        const u = doc.data()
        if (u.status === 'approved') users.push(u)
      })
    }
  } catch(e) {
    el.innerHTML = '<div style="padding:40px;text-align:center;color:#c44">불러오기 실패: ' + esc(e.message) + '</div>'
    return
  }

  // 직급 우선순위 (높은 직급이 위)
  const POS_ORDER = (typeof POSITIONS !== 'undefined' ? POSITIONS : ['사원','주임','대리','과장','차장','실장','팀장','부장','이사','대표이사']).slice().reverse()
  const posIdx = p => { const i = POS_ORDER.indexOf(p); return i < 0 ? 999 : i }

  // 부서별 그룹핑
  const deptMap = {}
  users.forEach(u => {
    const d = u.dept || '미지정'
    if (!deptMap[d]) deptMap[d] = []
    deptMap[d].push(u)
  })

  // 설정 부서 순서대로
  const deptOrder = (_depts || []).filter(d => deptMap[d]).concat(Object.keys(deptMap).filter(d => !(_depts || []).includes(d)))

  // 부서 내 직급 순 정렬
  deptOrder.forEach(d => {
    deptMap[d].sort((a, b) => posIdx(a.position) - posIdx(b.position) || (a.name || '').localeCompare(b.name || ''))
  })

  const total = users.length

  let html = `<div class="org-header">
    <h2 class="org-title">조직도</h2>
    <span class="org-total">전체 ${total}명 · ${deptOrder.length}개 부서</span>
  </div>
  <div class="org-grid">`

  deptOrder.forEach(dept => {
    const members = deptMap[dept]
    html += `<div class="org-dept-card">
      <div class="org-dept-header">
        <span class="org-dept-name">${esc(dept)}</span>
        <span class="org-dept-count">${members.length}명</span>
      </div>
      <div class="org-members">`
    members.forEach(u => {
      const initial = (u.name || '?').slice(0, 1)
      const posLabel = u.position || ''
      html += `<div class="org-member" onclick="showUserProfile('${u.uid || ''}', this)">
        <div class="org-avatar">${esc(initial)}</div>
        <div class="org-info">
          <div class="org-name">${esc(u.name || '')} <span class="org-pos">${esc(posLabel)}</span></div>
          <div class="org-email">${esc(formatPhone(u.phone))}</div>
        </div>
      </div>`
    })
    html += `</div></div>`
  })

  html += `</div>`
  el.innerHTML = html
}
window.renderOrgChart = renderOrgChart
