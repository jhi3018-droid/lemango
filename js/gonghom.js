// =============================================
// ===== 카페24 주문 내역 업로드 =====
// =============================================
// 카페24 실제 내보내기 양식: A~AA (27컬럼)

const CAFE24 = {
  orderDate:     0,  // A: 주문일시
  refundDate:    1,  // B: 환불완료일 (빈값=정상, 값있음=환불)
  orderNo:       2,  // C: 주문번호
  memberGrade:   3,  // D: 회원등급
  productCode:   4,  // E: 자체 상품코드 ★ 품번 매칭 키
  productName:   5,  // F: 상품명
  orderPath:     6,  // G: 주문경로
  option:        7,  // H: 상품옵션 ★ 사이즈 파싱
  shopName:      8,  // I: 쇼핑몰 (LEMANGOKOREA / LEMANGO PARTNER)
  trackingNo:    9,  // J: 운송장번호
  bizNo:        10,  // K: 사업자 등록번호
  shopNo:       11,  // L: 쇼핑몰번호
  qty:          12,  // M: 수량 ★
  salePrice:    13,  // N: 판매가
  brand:        14,  // O: 브랜드
  purchaseAmt:  15,  // P: 상품구매금액 (per-item)
  shippingFee:  16,  // Q: 총 배송비 (주문번호당 첫 행에만)
  totalPurchase:17,  // R: 총 상품구매금액
  totalPayment: 18,  // S: 총 결제금액
  totalOrder:   19,  // T: 총 주문금액
  refundAmt:    20,  // U: 실제 환불금액 (주문번호당 첫 행에만)
  totalRefund:  21,  // V: 총 실제 환불금액
  usedPoints:   22,  // W: 사용한 적립금액(최종)
  refundPoints: 23,  // X: 환불 적립금 금액
  extraDiscount:24,  // Y: 상품별 추가할인금액 (per-item)
  itemPayment:  25,  // Z: 품목별 결제금액
  itemRefund:   26   // AA: 환불금액
}

let _cafe24Rows = []

function parseCafe24Size(optStr) {
  if (!optStr || !String(optStr).trim()) return 'F'
  let s = String(optStr).trim().replace(/^SIZE=/i, '')
  const m = s.match(/\(([^)]+)\)/)
  if (m) return m[1].toUpperCase()
  return s.toUpperCase()
}

// 하위 호환
function parseGonghomSize(optStr) { return parseCafe24Size(optStr) }

// 쇼핑몰명 → 채널 키 변환
function cafe24Channel(shopName) {
  return (shopName === 'LEMANGO PARTNER') ? '파트너' : '공홈'
}

// 매출액 계산: P + Q(주문당1회) - U(주문당1회) - Y(행별)
function calcRowRevenue(r) {
  const P = r.purchaseAmt
  const Q = r._applyQ ? r.shippingFee : 0
  const U = r._applyU ? r.refundAmt : 0
  const Y = r.extraDiscount
  return P + Q - U - Y
}

// 기존 revenueLog에서 주문번호 인덱스 수집
function _buildExistingOrderIndex() {
  const set = new Set()
  State.allProducts.forEach(p => {
    (p.revenueLog || []).forEach(log => set.add(log.orderNo))
  })
  return set
}

function handleGonghomUpload(input) {
  const file = input.files[0]
  if (!file) return
  const isCsv = /\.csv$/i.test(file.name)
  const reader = new FileReader()
  reader.onload = e => {
    const opts = isCsv
      ? { type: 'string', codepage: 65001 }
      : { type: 'array' }
    const wb = XLSX.read(e.target.result, opts)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const dataRows = raw.slice(1).filter(r => r[CAFE24.productCode] || r[CAFE24.orderNo])
    input.value = ''
    showGonghomPreview(dataRows)
  }
  if (isCsv) reader.readAsText(file, 'UTF-8')
  else reader.readAsArrayBuffer(file)
}

function showGonghomPreview(rawRows) {
  // Step 1: Build existing orderNo index for duplicate detection
  const existingOrders = _buildExistingOrderIndex()

  // Step 2: Parse all rows
  _cafe24Rows = rawRows.map((row, i) => {
    const orderDateRaw = String(row[CAFE24.orderDate] || '').trim()
    const orderDate    = orderDateRaw.split(' ')[0] || orderDateRaw
    const refundDate   = String(row[CAFE24.refundDate]  || '').trim()
    const orderNo      = String(row[CAFE24.orderNo]     || '').trim()
    const productCode  = String(row[CAFE24.productCode] || '').trim()
    const productName  = String(row[CAFE24.productName] || '').trim()
    const optStr       = String(row[CAFE24.option]      || '').trim()
    const shopName     = String(row[CAFE24.shopName]    || '').trim()
    const qty          = parseInt(row[CAFE24.qty]) || 0
    const salePrice    = parseInt(row[CAFE24.salePrice]) || 0
    const purchaseAmt  = Number(row[CAFE24.purchaseAmt]) || 0
    const shippingFee  = Number(row[CAFE24.shippingFee]) || 0
    const refundAmt    = Number(row[CAFE24.refundAmt])   || 0
    const extraDiscount= Number(row[CAFE24.extraDiscount]) || 0
    const size         = parseCafe24Size(optStr)
    const isRefund     = refundDate !== ''
    const isDuplicate  = existingOrders.has(orderNo)
    const channel      = cafe24Channel(shopName)

    const p = State.allProducts.find(pr => pr.productCode === productCode)
    const matched = !!p

    // Row status priority: 중복 > 환불(미매칭) > 환불 > 정상 > 미매칭
    // checked: matched + not duplicate (both 정상 and 환불 are checked if matched)
    const checked = matched && !isDuplicate

    return {
      idx: i, orderDate, orderDateRaw, refundDate, orderNo, productCode, productName,
      optStr, shopName, channel, qty, salePrice, size, isRefund, isDuplicate, matched, p,
      purchaseAmt, shippingFee, refundAmt, extraDiscount,
      _applyQ: false, _applyU: false, revenue: 0,
      checked
    }
  }).filter(r => r.qty > 0)

  // Step 3: Dedup Q and U — only first row per orderNo
  const seenOrders = new Set()
  _cafe24Rows.forEach(r => {
    if (!seenOrders.has(r.orderNo)) {
      seenOrders.add(r.orderNo)
      r._applyQ = true
      r._applyU = true
    }
  })

  // Step 4: Calculate revenue per row
  _cafe24Rows.forEach(r => { r.revenue = calcRowRevenue(r) })

  // Step 5: Check 파트너 channel exists in platforms
  const hasPartner = _cafe24Rows.some(r => r.channel === '파트너')
  if (hasPartner && !_platforms.includes('파트너')) {
    showToast('파트너 채널이 설정에 없습니다. 설정 > 판매 채널에서 추가해주세요.', 'warning')
  }

  // Stats (중복 제외하고 계산)
  const total      = _cafe24Rows.length
  const dupCnt     = _cafe24Rows.filter(r => r.isDuplicate).length
  const normalCnt  = _cafe24Rows.filter(r => !r.isRefund && !r.isDuplicate).length
  const refundCnt  = _cafe24Rows.filter(r => r.isRefund && !r.isDuplicate).length
  const matchCnt   = _cafe24Rows.filter(r => r.matched && !r.isDuplicate).length
  const unmatchCnt = _cafe24Rows.filter(r => !r.matched && !r.isDuplicate).length
  // 매출액 = 정상매출 - 환불매출 (중복/미매칭 제외)
  const saleRev    = _cafe24Rows.filter(r => !r.isRefund && !r.isDuplicate && r.matched)
    .reduce((s, r) => s + r.revenue, 0)
  const refundRev  = _cafe24Rows.filter(r => r.isRefund && !r.isDuplicate && r.matched)
    .reduce((s, r) => s + Math.abs(r.revenue), 0)
  const netRev     = saleRev - refundRev

  const tbody = _cafe24Rows.map((r, i) => {
    // Row class: duplicate > refund > default
    const rowCls = r.isDuplicate ? ' class="cafe24-dup-row"'
      : r.isRefund ? ' class="cafe24-refund-row"' : ''

    // Status badge (priority: 중복 > 환불(미매칭) > 환불 > 정상 > 미매칭)
    let statusBadge
    if (r.isDuplicate) {
      statusBadge = '<span class="badge-preview badge-preview-dup">중복</span>'
    } else if (r.isRefund && !r.matched) {
      statusBadge = '<span class="badge-preview badge-preview-warn">환불(미매칭)</span>'
    } else if (r.isRefund) {
      statusBadge = '<span class="badge-preview badge-preview-error">환불</span>'
    } else if (!r.matched) {
      statusBadge = '<span class="badge-preview badge-preview-error">미매칭</span>'
    } else {
      statusBadge = '<span class="badge-preview badge-preview-ok">정상</span>'
    }

    const matchBadge = r.matched
      ? '<span class="badge-preview badge-preview-ok">매칭</span>'
      : '<span class="badge-preview badge-preview-error">미매칭</span>'
    const channelBadge = r.channel === '파트너'
      ? '<span class="badge-preview" style="background:#e8eaf6;color:#3949ab">파트너</span>'
      : '<span class="badge-preview" style="background:#e8f5e9;color:#2e7d32">공홈</span>'

    // Checkbox: disabled if duplicate or unmatched
    const checked = r.checked ? 'checked' : ''
    const disabled = (r.isDuplicate || !r.matched) ? 'disabled' : ''

    // Revenue display — show negative for refunds
    const revDisplay = r.isRefund
      ? `<span style="color:var(--danger)">-${Math.abs(r.revenue).toLocaleString()}</span>`
      : r.revenue.toLocaleString()

    return `<tr${rowCls}>
      <td style="text-align:center"><input type="checkbox" class="cafe24-chk" data-idx="${i}" ${checked} ${disabled} /></td>
      <td>${statusBadge}</td>
      <td style="font-size:11px;white-space:nowrap">${r.orderDate}</td>
      <td style="font-family:Inter;font-size:11px">${r.orderNo}</td>
      <td>${channelBadge}</td>
      <td style="font-family:Inter;font-size:11px">${r.productCode}</td>
      <td>${r.p ? (r.p.nameKr || r.productName) : r.productName}</td>
      <td style="text-align:center;font-family:Inter;font-weight:600;color:var(--accent)">${r.size}</td>
      <td style="text-align:center;font-weight:700">${r.qty}</td>
      <td style="text-align:right;font-family:Inter;font-size:11px">${revDisplay}</td>
      <td>${matchBadge}</td>
    </tr>`
  }).join('')

  document.getElementById('gonghomPreviewInfo').innerHTML =
    `총 <b>${total}</b>건 &nbsp;|&nbsp; ` +
    `정상 <b style="color:var(--success)">${normalCnt}</b> &nbsp;|&nbsp; ` +
    `환불 <b style="color:var(--danger)">${refundCnt}</b> &nbsp;|&nbsp; ` +
    (dupCnt > 0 ? `중복 <b style="color:#1565c0">${dupCnt}</b> &nbsp;|&nbsp; ` : '') +
    `매칭 <b style="color:var(--success)">${matchCnt}</b> &nbsp;|&nbsp; ` +
    `미매칭 <b style="color:var(--danger)">${unmatchCnt}</b> &nbsp;|&nbsp; ` +
    `매출액 <b style="color:var(--primary)">₩${netRev.toLocaleString()}</b>`

  document.getElementById('gonghomPreviewBody').innerHTML = tbody ||
    '<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text-sub)">데이터 없음</td></tr>'

  const confirmBtn = document.getElementById('gonghomConfirmBtn')
  confirmBtn.disabled = _cafe24Rows.filter(r => r.checked).length === 0

  const modal = document.getElementById('gonghomPreviewModal')
  modal.showModal()
  centerModal(modal)

  // 체크박스 이벤트
  modal.querySelectorAll('.cafe24-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const idx = parseInt(chk.dataset.idx)
      _cafe24Rows[idx].checked = chk.checked
      confirmBtn.disabled = _cafe24Rows.filter(r => r.checked).length === 0
    })
  })
}

function confirmGonghomUpload() {
  let saleCnt = 0
  let refundCnt = 0
  let dupSkipped = 0
  let unmatchSkipped = 0
  const now = new Date().toISOString()

  _cafe24Rows.forEach(r => {
    // 중복은 무조건 skip
    if (r.isDuplicate) { dupSkipped++; return }
    // 체크 안 된 행 skip
    if (!r.checked) return
    // 미매칭 skip
    if (!r.matched) { unmatchSkipped++; return }

    const ch = r.channel
    r.p.revenueLog = r.p.revenueLog || []

    if (r.isRefund) {
      // 환불 → 마이너스 적용
      r.p.sales[ch] = (r.p.sales[ch] || 0) - r.qty
      r.p.revenueLog.push({
        type: 'refund',
        date: r.orderDate,
        channel: ch,
        orderNo: r.orderNo,
        qty: -r.qty,
        revenue: -Math.abs(r.revenue),
        registeredAt: now
      })
      refundCnt++
    } else {
      // 정상 → 플러스 적용
      r.p.sales[ch] = (r.p.sales[ch] || 0) + r.qty
      r.p.revenueLog.push({
        type: 'sale',
        date: r.orderDate,
        channel: ch,
        orderNo: r.orderNo,
        qty: r.qty,
        revenue: r.revenue,
        registeredAt: now
      })
      saleCnt++
    }
  })

  document.getElementById('gonghomPreviewModal').close()
  _cafe24Rows = []
  renderSalesTable()
  renderDashboard()

  // 토스트 메시지 조합
  const parts = []
  if (saleCnt > 0) parts.push(`정상 ${saleCnt}건`)
  if (refundCnt > 0) parts.push(`환불 ${refundCnt}건 차감`)
  const excludes = []
  if (dupSkipped > 0) excludes.push(`중복 ${dupSkipped}건`)
  if (unmatchSkipped > 0) excludes.push(`미매칭 ${unmatchSkipped}건`)

  let msg = `카페24 주문 반영: ${parts.join(', ') || '0건'}`
  if (excludes.length > 0) msg += ` (${excludes.join(', ')} 제외)`
  showToast(msg, 'success')
}
