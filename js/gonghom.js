// =============================================
// ===== 카페24 주문 내역 업로드 =====
// =============================================
// 카페24 실제 내보내기 양식: A~AA (27컬럼)
//
// 매출 공식 (검증완료):
//   매출 = P(전체합산) + Q(전체합산) - U(주문번호당 MAX) - Y(전체합산)
//   P: 상품구매금액 (판매가×수량, per-item)
//   Q: 총배송비 (소스에서 이미 첫품목만 값있음, 나머지 0)
//   U: 실제환불금액 (동일주문번호 전 행에 동일값 중복기재 → MAX로 1회만 취득)
//   Y: 상품별추가할인금액 (per-item)
//
// 검증값(2026-01): P=300,281,100 + Q=3,399,000 - U=8,329,593 - Y=87,712,735 = 207,637,772

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
  purchaseAmt:  15,  // P: 상품구매금액 (per-item, = N×M)
  shippingFee:  16,  // Q: 총 배송비 (첫 품목에만 값, 나머지 0/NaN)
  totalPurchase:17,  // R: 총 상품구매금액
  totalPayment: 18,  // S: 총 결제금액
  totalOrder:   19,  // T: 총 주문금액
  refundAmt:    20,  // U: 실제 환불금액 (전 행 동일값 반복 → MAX 사용)
  totalRefund:  21,  // V: 총 실제 환불금액
  usedPoints:   22,  // W: 사용한 적립금액(최종) (전 행 동일값)
  refundPoints: 23,  // X: 환불 적립금 금액
  extraDiscount:24,  // Y: 상품별 추가할인금액 (per-item)
  itemPayment:  25,  // Z: 품목별 결제금액
  itemRefund:   26   // AA: 환불금액
}

let _cafe24Rows = []       // per-item rows for display
let _cafe24Orders = {}     // orderNo → { P, Q, U, Y, W, revenue, ... } for order-level calc
let _cafe24ColFilters = {} // { colKey: Set(selectedValues) }
let _cafe24FilterDD = null // currently open dropdown element

// --- helpers ---
function _toNum(v) { const n = Number(v); return isNaN(n) ? 0 : n }

// --- Column definitions for preview table ---
const CAFE24_COLS = [
  { key: '_chk',        label: '선택',   noFilter: true },
  { key: 'status',      label: '상태' },
  { key: 'orderDate',   label: '주문일시' },
  { key: 'orderNo',     label: '주문번호' },
  { key: 'channel',     label: '채널' },
  { key: 'productCode', label: '품번' },
  { key: 'productName', label: '상품명' },
  { key: 'size',        label: '사이즈' },
  { key: 'qty',         label: '수량' },
  { key: 'revenue',     label: '매출액' },
  { key: 'matchStatus', label: '매칭' }
]

function parseCafe24Size(optStr) {
  if (!optStr || !String(optStr).trim()) return 'F'
  let s = String(optStr).trim().replace(/^SIZE=/i, '')
  const m = s.match(/\(([^)]+)\)/)
  if (m) return m[1].toUpperCase()
  return s.toUpperCase()
}

function parseGonghomSize(optStr) { return parseCafe24Size(optStr) }

function cafe24Channel(shopName) {
  return (shopName === 'LEMANGO PARTNER') ? '파트너' : '공홈'
}

// --- Existing order index for duplicate detection ---
function _buildExistingOrderIndex() {
  const set = new Set()
  State.allProducts.forEach(p => {
    (p.revenueLog || []).forEach(log => set.add(log.orderNo))
  })
  return set
}

// --- Row value resolver for column filter ---
function _cafe24ColValue(r, key) {
  switch (key) {
    case 'status':      return _rowStatus(r)
    case 'orderDate':   return r.orderDate
    case 'orderNo':     return r.orderNo
    case 'channel':     return r.channel
    case 'productCode': return r.productCode
    case 'productName': return r.p ? (r.p.nameKr || r.productName) : r.productName
    case 'size':        return r.size
    case 'qty':         return String(r.qty)
    case 'revenue':     return String(r.itemRevenue)
    case 'matchStatus': return r.matched ? '매칭' : '미등록'
    default:            return ''
  }
}

function _rowStatus(r) {
  if (r.isDuplicate) return '중복'
  if (r.isRefund && !r.matched) return '환불(미등록)'
  if (r.isRefund) return '환불'
  if (!r.matched) return '미등록'
  return '정상'
}

// ===========================================
// ===== File Upload =====
// ===========================================
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

// ===========================================
// ===== Preview: Parse & Calculate =====
// ===========================================
function showGonghomPreview(rawRows) {
  const existingOrders = _buildExistingOrderIndex()

  // --- Step 1: Parse per-item rows ---
  _cafe24Rows = rawRows.map((row, i) => {
    const orderDate    = parseExcelDate(row[CAFE24.orderDate])
    const refundDateRaw = row[CAFE24.refundDate]
    const refundDate   = (refundDateRaw && String(refundDateRaw).trim()) ? parseExcelDate(refundDateRaw) : ''
    const orderNo      = String(row[CAFE24.orderNo]     || '').trim()
    const productCode  = String(row[CAFE24.productCode] || '').trim()
    const productName  = String(row[CAFE24.productName] || '').trim()
    const optStr       = String(row[CAFE24.option]      || '').trim()
    const shopName     = String(row[CAFE24.shopName]    || '').trim()
    const qty          = _toNum(row[CAFE24.qty])
    const salePrice    = _toNum(row[CAFE24.salePrice])
    const purchaseAmt  = _toNum(row[CAFE24.purchaseAmt])
    const shippingFee  = _toNum(row[CAFE24.shippingFee])
    const refundAmt    = _toNum(row[CAFE24.refundAmt])
    const usedPoints   = _toNum(row[CAFE24.usedPoints])
    const extraDiscount= _toNum(row[CAFE24.extraDiscount])
    const size         = parseCafe24Size(optStr)
    const isRefund     = refundDate !== ''
    const isDuplicate  = existingOrders.has(orderNo)
    const channel      = cafe24Channel(shopName)

    const p = State.allProducts.find(pr => pr.productCode === productCode)
    const matched = !!p
    const checked = matched && !isDuplicate

    // Item-level revenue: P - Y (product contribution, no order-level adjustments)
    const itemRevenue = purchaseAmt - extraDiscount

    return {
      idx: i, orderDate, refundDate, orderNo, productCode, productName,
      optStr, shopName, channel, qty, salePrice, size, isRefund, isDuplicate, matched, p,
      purchaseAmt, shippingFee, refundAmt, usedPoints, extraDiscount,
      itemRevenue, checked
    }
  }).filter(r => r.qty > 0 || r.isRefund)

  // --- Step 2: Build order-level aggregation (CRITICAL: U = MAX per order) ---
  _cafe24Orders = {}
  for (const r of _cafe24Rows) {
    if (!_cafe24Orders[r.orderNo]) {
      _cafe24Orders[r.orderNo] = {
        orderNo: r.orderNo,
        channel: r.channel,
        date: r.orderDate,
        isDuplicate: r.isDuplicate,
        hasRefund: false,
        P: 0, Q: 0, U: 0, Y: 0, W: 0,
        qty: 0, itemCount: 0,
        revenue: 0, netCash: 0,
        rows: []
      }
    }
    const o = _cafe24Orders[r.orderNo]
    o.P += r.purchaseAmt           // SUM all rows
    o.Q += r.shippingFee           // SUM all rows (source: only 1st item has value, rest=0)
    o.U = Math.max(o.U, r.refundAmt) // ★ MAX per order (NOT first, NOT sum)
    o.Y += r.extraDiscount         // SUM all rows
    if (o.W === 0) o.W = r.usedPoints // FIRST non-zero (same across all rows)
    o.qty += r.qty
    o.itemCount++
    if (r.isRefund) o.hasRefund = true
    o.rows.push(r)
  }

  // Calculate order-level revenue
  for (const o of Object.values(_cafe24Orders)) {
    o.revenue = o.P + o.Q - o.U - o.Y   // 매출총액 (할인반영, 적립금미차감)
    o.netCash = o.revenue - o.W          // 순실결제 (적립금까지 차감)
  }

  // --- Step 3: Check 파트너 channel ---
  const hasPartner = _cafe24Rows.some(r => r.channel === '파트너')
  if (hasPartner && !_platforms.includes('파트너')) {
    showToast('파트너 채널이 설정에 없습니다. 설정 > 판매 채널에서 추가해주세요.', 'warning')
  }

  // Reset column filters & open modal
  _cafe24ColFilters = {}
  _closeCafe24Filter()
  const modal = document.getElementById('gonghomPreviewModal')
  modal.showModal()
  centerModal(modal)
  _renderCafe24Preview()
}

// ===========================================
// ===== Preview: Render =====
// ===========================================

function _applyCafe24Filters(rows) {
  const keys = Object.keys(_cafe24ColFilters)
  if (keys.length === 0) return rows
  return rows.filter(r => {
    for (const k of keys) {
      const allowed = _cafe24ColFilters[k]
      if (!allowed || allowed.size === 0) continue
      if (!allowed.has(_cafe24ColValue(r, k))) return false
    }
    return true
  })
}

function _renderCafe24Preview() {
  const orders = Object.values(_cafe24Orders)

  // --- Stats from order-level (non-duplicate) ---
  const newOrders   = orders.filter(o => !o.isDuplicate)
  const dupOrders   = orders.filter(o => o.isDuplicate)
  const totalRows   = _cafe24Rows.length
  const dupRowCnt   = _cafe24Rows.filter(r => r.isDuplicate).length
  const normalCnt   = _cafe24Rows.filter(r => !r.isRefund && !r.isDuplicate).length
  const refundCnt   = _cafe24Rows.filter(r => r.isRefund && !r.isDuplicate).length
  const matchCnt    = _cafe24Rows.filter(r => r.matched && !r.isDuplicate).length
  const unmatchCnt  = _cafe24Rows.filter(r => !r.matched && !r.isDuplicate).length

  // --- Revenue aggregation (order-level, non-duplicate) ---
  const totals = { P: 0, Q: 0, U: 0, Y: 0, W: 0, revenue: 0, netCash: 0 }
  const byChannel = {}
  for (const o of newOrders) {
    totals.P += o.P; totals.Q += o.Q; totals.U += o.U; totals.Y += o.Y; totals.W += o.W
    totals.revenue += o.revenue; totals.netCash += o.netCash

    if (!byChannel[o.channel]) byChannel[o.channel] = { P: 0, Q: 0, U: 0, Y: 0, revenue: 0 }
    const ch = byChannel[o.channel]
    ch.P += o.P; ch.Q += o.Q; ch.U += o.U; ch.Y += o.Y; ch.revenue += o.revenue
  }

  // --- Apply column filters for visible rows ---
  const visibleRows = _applyCafe24Filters(_cafe24Rows)

  // --- Build thead ---
  const theadHtml = CAFE24_COLS.map(col => {
    const wMap = { _chk:'32px', status:'56px', orderDate:'88px', orderNo:'90px',
      channel:'56px', size:'46px', qty:'38px', revenue:'80px', matchStatus:'56px' }
    const w = wMap[col.key] ? ` width="${wMap[col.key]}"` : ''
    const alignMap = { _chk:'center', size:'center', qty:'center', revenue:'right' }
    const align = alignMap[col.key] ? `;text-align:${alignMap[col.key]}` : ''
    if (col.noFilter) {
      return `<th style="white-space:nowrap${align}"${w}>${col.label}</th>`
    }
    const isActive = _cafe24ColFilters[col.key] && _cafe24ColFilters[col.key].size > 0
    const filterCls = isActive ? 'c24-th-filter active' : 'c24-th-filter'
    return `<th style="white-space:nowrap${align}"${w} data-c24key="${col.key}">` +
      `<div class="th-content"><span class="th-label">${col.label}</span>` +
      `<span class="${filterCls}" data-c24filter="${col.key}">▼</span></div></th>`
  }).join('')

  // --- Build tbody ---
  const tbody = visibleRows.map(r => {
    const i = _cafe24Rows.indexOf(r)
    const rowCls = r.isDuplicate ? ' class="cafe24-dup-row"'
      : r.isRefund ? ' class="cafe24-refund-row"' : ''

    let statusBadge
    if (r.isDuplicate) {
      statusBadge = '<span class="badge-preview badge-preview-dup">중복</span>'
    } else if (r.isRefund && !r.matched) {
      statusBadge = '<span class="badge-preview badge-preview-warn">환불(미등록)</span>'
    } else if (r.isRefund) {
      statusBadge = '<span class="badge-preview badge-preview-error">환불</span>'
    } else if (!r.matched) {
      statusBadge = '<span class="badge-preview badge-preview-new">미등록</span>'
    } else {
      statusBadge = '<span class="badge-preview badge-preview-ok">정상</span>'
    }

    const matchBadge = r.matched
      ? '<span class="badge-preview badge-preview-ok">매칭</span>'
      : '<span class="badge-preview badge-preview-new">미등록</span>'
    const channelBadge = r.channel === '파트너'
      ? '<span class="badge-preview" style="background:#e8eaf6;color:#3949ab">파트너</span>'
      : '<span class="badge-preview" style="background:#e8f5e9;color:#2e7d32">공홈</span>'

    const checked = r.checked ? 'checked' : ''
    const disabled = (r.isDuplicate || !r.matched) ? 'disabled' : ''

    // Item-level revenue display (P - Y)
    const revDisplay = r.isRefund
      ? `<span style="color:var(--danger)">-${Math.abs(r.itemRevenue).toLocaleString()}</span>`
      : r.itemRevenue.toLocaleString()

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

  // --- Summary ---
  const fmtW = v => `₩${v.toLocaleString()}`

  // Line 1: row counts
  let line1 =
    `총 <b>${totalRows}</b>건 &nbsp;|&nbsp; ` +
    `정상 <b style="color:var(--success)">${normalCnt}</b> &nbsp;|&nbsp; ` +
    `환불 <b style="color:var(--danger)">${refundCnt}</b>`
  if (dupRowCnt > 0) line1 += ` &nbsp;|&nbsp; 중복 <b style="color:#1565c0">${dupRowCnt}</b>`
  line1 += ` &nbsp;|&nbsp; 미등록 <b style="color:var(--warning)">${unmatchCnt}</b>`

  // Line 2: revenue formula breakdown
  const line2 =
    `P <b>${fmtW(totals.P)}</b> + Q <b>${fmtW(totals.Q)}</b>` +
    ` - U <b style="color:var(--danger)">${fmtW(totals.U)}</b>` +
    ` - Y <b>${fmtW(totals.Y)}</b>`

  // Line 3: revenue totals with channel breakdown
  let line3 = `매출총액 <b style="color:var(--primary);font-size:14px">${fmtW(totals.revenue)}</b>`
  const chKeys = Object.keys(byChannel).sort()
  if (chKeys.length > 0) {
    line3 += ' &nbsp;('
    line3 += chKeys.map(ch =>
      `${ch} <b>${fmtW(byChannel[ch].revenue)}</b>`
    ).join(' / ')
    line3 += ')'
  }

  document.getElementById('gonghomPreviewInfo').innerHTML =
    `<div style="display:flex;flex-direction:column;gap:3px">` +
    `<div>${line1}</div>` +
    `<div style="font-size:11px;color:var(--text-sub)">${line2}</div>` +
    `<div>${line3}</div>` +
    `</div>`

  // --- Write table ---
  const table = document.querySelector('#gonghomPreviewModal .srm-table')
  table.querySelector('thead').innerHTML = `<tr>${theadHtml}</tr>`
  document.getElementById('gonghomPreviewBody').innerHTML = tbody ||
    '<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text-sub)">데이터 없음</td></tr>'

  const confirmBtn = document.getElementById('gonghomConfirmBtn')
  confirmBtn.disabled = _cafe24Rows.filter(r => r.checked).length === 0

  // Checkbox events
  document.getElementById('gonghomPreviewModal').querySelectorAll('.cafe24-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const idx = parseInt(chk.dataset.idx)
      _cafe24Rows[idx].checked = chk.checked
      confirmBtn.disabled = _cafe24Rows.filter(r => r.checked).length === 0
    })
  })

  // Filter icon click events (event delegation on thead)
  table.querySelector('thead').addEventListener('click', e => {
    const filterBtn = e.target.closest('[data-c24filter]')
    if (!filterBtn) return
    e.stopPropagation()
    const key = filterBtn.dataset.c24filter
    const th = filterBtn.closest('th')
    _openCafe24Filter(th, key)
  })
}

// ===========================================
// ===== Column Filter Dropdown =====
// ===========================================
function _openCafe24Filter(th, key) {
  _closeCafe24Filter()

  // Cross-filter: unique values from rows filtered by OTHER columns only
  const otherFilters = { ..._cafe24ColFilters }
  delete otherFilters[key]
  const otherKeys = Object.keys(otherFilters)
  const baseRows = otherKeys.length > 0
    ? _cafe24Rows.filter(r => {
        for (const k of otherKeys) {
          const allowed = otherFilters[k]
          if (!allowed || allowed.size === 0) continue
          if (!allowed.has(_cafe24ColValue(r, k))) return false
        }
        return true
      })
    : _cafe24Rows

  const vals = [...new Set(baseRows.map(r => _cafe24ColValue(r, key)))]
  if (key === 'qty' || key === 'revenue') {
    vals.sort((a, b) => Number(a) - Number(b))
  } else {
    vals.sort((a, b) => String(a).localeCompare(String(b)))
  }

  const selected = _cafe24ColFilters[key] || new Set(vals)

  const dd = document.createElement('div')
  dd.className = 'col-filter-dd'
  dd.id = 'c24FilterDD'
  dd.innerHTML =
    `<input class="cfd-search" placeholder="검색..." />` +
    `<div class="cfd-actions"><a href="#" data-act="all">전체 선택</a><a href="#" data-act="none">전체 해제</a></div>` +
    `<div class="cfd-list">${vals.map(v => {
      const chk = selected.has(v) ? 'checked' : ''
      const esc = String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')
      return `<label class="cfd-item"><input type="checkbox" value="${esc}" ${chk}/><span>${esc || '(빈값)'}</span></label>`
    }).join('')}</div>` +
    `<div class="cfd-btns"><button class="btn btn-sm btn-outline" data-act="reset">초기화</button><button class="btn btn-sm btn-primary" data-act="apply">적용</button></div>`

  const rect = th.getBoundingClientRect()
  const modalBody = th.closest('.srm-body')
  const bodyRect = modalBody.getBoundingClientRect()
  dd.style.position = 'absolute'
  dd.style.top = (rect.bottom - bodyRect.top + modalBody.scrollTop) + 'px'
  dd.style.left = Math.max(0, rect.left - bodyRect.left) + 'px'
  modalBody.style.position = 'relative'
  modalBody.appendChild(dd)
  _cafe24FilterDD = dd

  dd.querySelector('.cfd-search').addEventListener('input', function () {
    const q = this.value.toLowerCase()
    dd.querySelectorAll('.cfd-item').forEach(item => {
      item.style.display = item.querySelector('span').textContent.toLowerCase().includes(q) ? '' : 'none'
    })
  })

  dd.querySelectorAll('.cfd-actions a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault()
      dd.querySelectorAll('.cfd-item input').forEach(cb => { cb.checked = a.dataset.act === 'all' })
    })
  })

  dd.querySelector('[data-act="apply"]').addEventListener('click', () => {
    const checked = [...dd.querySelectorAll('.cfd-item input:checked')].map(cb => cb.value)
    if (checked.length === vals.length || checked.length === 0) {
      delete _cafe24ColFilters[key]
    } else {
      _cafe24ColFilters[key] = new Set(checked)
    }
    _closeCafe24Filter()
    _renderCafe24Preview()
  })

  dd.querySelector('[data-act="reset"]').addEventListener('click', () => {
    delete _cafe24ColFilters[key]
    _closeCafe24Filter()
    _renderCafe24Preview()
  })

  setTimeout(() => document.addEventListener('click', _cafe24FilterOutsideClick), 0)
}

function _cafe24FilterOutsideClick(e) {
  if (_cafe24FilterDD && !_cafe24FilterDD.contains(e.target) && !e.target.closest('[data-c24filter]')) {
    _closeCafe24Filter()
  }
}

function _closeCafe24Filter() {
  if (_cafe24FilterDD) { _cafe24FilterDD.remove(); _cafe24FilterDD = null }
  document.removeEventListener('click', _cafe24FilterOutsideClick)
}

// ===========================================
// ===== Confirm: Apply to Products =====
// ===========================================
function confirmGonghomUpload() {
  let saleCnt = 0
  let refundCnt = 0
  let dupSkipped = 0
  let unmatchSkipped = 0
  const now = new Date().toISOString()

  // Track which orders have had Q/U applied (for first matched row allocation)
  const orderQUApplied = new Set()

  _cafe24Rows.forEach(r => {
    if (r.isDuplicate) { dupSkipped++; return }
    if (!r.checked) return
    if (!r.matched) { unmatchSkipped++; return }

    const ch = r.channel
    const o = _cafe24Orders[r.orderNo]
    r.p.revenueLog = r.p.revenueLog || []

    // Item-level revenue = P - Y
    let revenue = r.itemRevenue

    // Allocate order-level Q and -U to first matched row of each order
    if (!orderQUApplied.has(r.orderNo)) {
      orderQUApplied.add(r.orderNo)
      revenue += (o.Q - o.U)  // add shipping, subtract refund
    }

    if (r.isRefund) {
      r.p.sales[ch] = (r.p.sales[ch] || 0) - r.qty
      r.p.revenueLog.push({
        type: 'refund', date: r.orderDate, channel: ch, orderNo: r.orderNo,
        qty: -r.qty, revenue: -Math.abs(revenue), registeredAt: now
      })
      refundCnt++
    } else {
      r.p.sales[ch] = (r.p.sales[ch] || 0) + r.qty
      r.p.revenueLog.push({
        type: 'sale', date: r.orderDate, channel: ch, orderNo: r.orderNo,
        qty: r.qty, revenue, registeredAt: now
      })
      saleCnt++
    }
  })

  _closeCafe24Filter()
  document.getElementById('gonghomPreviewModal').close()
  _cafe24Rows = []
  _cafe24Orders = {}
  _cafe24ColFilters = {}
  renderSalesTable()
  renderDashboard()

  const parts = []
  if (saleCnt > 0) parts.push(`정상 ${saleCnt}건`)
  if (refundCnt > 0) parts.push(`환불 ${refundCnt}건 차감`)
  const excludes = []
  if (dupSkipped > 0) excludes.push(`중복 ${dupSkipped}건`)
  if (unmatchSkipped > 0) excludes.push(`미등록 ${unmatchSkipped}건`)

  if (saleCnt === 0 && refundCnt === 0) {
    showToast('반영할 건이 없습니다.', 'warning')
  } else {
    let msg = `카페24 주문 반영: ${parts.join(', ')}`
    if (excludes.length > 0) msg += ` (${excludes.join(', ')} 제외)`
    showToast(msg, 'success')
  }
}
