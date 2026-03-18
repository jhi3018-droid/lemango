// =============================================
// ===== 공홈 주문 내역 업로드 =====
// =============================================
// 컬럼: A(0)카페24코드 B(1)자체상품코드 C(2)수량 H(7)상품옵션 L(11)바코드

let _gonghomRows = []

function parseGonghomSize(optStr) {
  if (!optStr || !String(optStr).trim()) return 'F'
  let s = String(optStr).trim().replace(/^SIZE=/i, '')
  // "85(M)" 형태에서 괄호 안 추출
  const m = s.match(/\(([^)]+)\)/)
  if (m) return m[1].toUpperCase()
  return s.toUpperCase()
}

function handleGonghomUpload(input) {
  const file = input.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const dataRows = raw.slice(1).filter(r => r[0] || r[1])
    input.value = ''
    showGonghomPreview(dataRows)
  }
  reader.readAsArrayBuffer(file)
}

function showGonghomPreview(rawRows) {
  _gonghomRows = rawRows.map(row => {
    const cafe24Code  = String(row[0]  || '').trim()
    const productCode = String(row[1]  || '').trim()
    const qty         = parseInt(row[2]) || 0
    const optStr      = String(row[7]  || '').trim()
    const barcode     = String(row[11] || '').trim()
    const size        = parseGonghomSize(optStr)

    let p = State.allProducts.find(pr => pr.productCode === productCode)
    let matchBy = 'code'
    if (!p && cafe24Code) {
      p = State.allProducts.find(pr => pr.cafe24Code === cafe24Code)
      matchBy = 'cafe24'
    }

    const status = !p ? 'error' : 'ok'
    return { cafe24Code, productCode, qty, optStr, size, barcode, p, matchBy, status }
  }).filter(r => r.qty > 0)

  const okCnt  = _gonghomRows.filter(r => r.status === 'ok').length
  const errCnt = _gonghomRows.filter(r => r.status === 'error').length

  const tbody = _gonghomRows.map((r, i) => {
    const statusBadge = r.status === 'error'
      ? '<span class="badge-preview badge-preview-error">매칭 없음</span>'
      : r.matchBy === 'cafe24'
        ? '<span class="badge-preview badge-preview-warn">카페24</span>'
        : '<span class="badge-preview badge-preview-ok">확인</span>'
    const rowStyle = r.status === 'error' ? 'background:#fff3f3' : ''
    return `<tr style="${rowStyle}">
      <td style="text-align:center;color:var(--text-sub)">${i + 1}</td>
      <td>${statusBadge}</td>
      <td style="font-family:Inter;font-size:11px">${r.productCode || r.cafe24Code}</td>
      <td>${r.p ? (r.p.nameKr || '') : '<span style="color:var(--danger)">미매칭</span>'}</td>
      <td style="text-align:center;font-weight:700">${r.qty}</td>
      <td style="text-align:center;font-family:Inter;font-weight:600;color:var(--accent)">${r.size}</td>
      <td style="font-size:11px;color:var(--text-sub)">${r.barcode || '—'}</td>
    </tr>`
  }).join('')

  document.getElementById('gonghomPreviewInfo').innerHTML =
    `총 <b>${_gonghomRows.length}</b>건 &nbsp;—&nbsp; 반영 예정 <b style="color:var(--success)">${okCnt}</b>건 / 미매칭 <b style="color:var(--danger)">${errCnt}</b>건`
  document.getElementById('gonghomPreviewBody').innerHTML = tbody || '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-sub)">데이터 없음</td></tr>'
  document.getElementById('gonghomConfirmBtn').disabled = okCnt === 0

  const modal = document.getElementById('gonghomPreviewModal')
  modal.showModal()
  centerModal(modal)
}

function confirmGonghomUpload() {
  let cnt = 0
  _gonghomRows.forEach(r => {
    if (r.status !== 'ok') return
    r.p.sales['공홈'] = (r.p.sales['공홈'] || 0) + r.qty
    cnt++
  })
  document.getElementById('gonghomPreviewModal').close()
  _gonghomRows = []
  renderSalesTable()
  renderDashboard()
  showToast(`공홈 주문 ${cnt}건 판매 반영 완료`, 'success')
}
