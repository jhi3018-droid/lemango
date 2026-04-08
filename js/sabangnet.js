// =============================================
// ===== 사방넷 주문 내역 업로드 =====
// =============================================
// 사방넷 엑셀 양식: A~T (20컬럼)
//
// 매출 공식: H(결제금액) + I(배송비) — 사은품 행 제외 후 전행 합산
// 사은품 판별: C열(주문번호)에 '_사은품' 포함 OR D열(자체상품코드)에 '사은품' 포함
// 사은품 H=항상0, I=배송비 본품과 중복기재 → 포함시 과대계상
// 검증값(2026-01): H=26,607,452 + I=1,035,000 = 27,642,452

const SABANGNET = {
  no:           0,  // A: No.
  shopName:     1,  // B: 쇼핑몰명 (29CM, 신세계몰, W쇼핑 등)
  orderNo:      2,  // C: 주문번호(쇼핑몰)
  productCode:  3,  // D: 자체상품코드 ★ 품번 매칭
  productName:  4,  // E: 상품명(확정)
  optionRaw:    5,  // F: 옵션(수집) — "[SIZE]85(M)" format
  qty:          6,  // G: 수량
  paymentAmt:   7,  // H: 결제금액 ★
  shippingFee:  8,  // I: 배송비(상품) ★
  priceXqty:    9,  // J: 판매가(상품)*수량
  unitPrice:   10,  // K: 판매가(상품)
  collectPrice:11,  // L: 판매가(수집)
  orderDate:   12,  // M: 주문일시
  refundDate:  13,  // N: 반품완료일자 (추후 사용)
  collectDate: 14,  // O: 수집일시
  collectName: 15,  // P: 상품명(수집)
  optionClean: 16,  // Q: 옵션(확정) — "85(M)"
  sizeAlias:   17,  // R: 옵션별칭 ★ 사이즈 (M, XL, F 등)
  courier:     18,  // S: 택배사
  trackingNo:  19   // T: 송장번호
}

let _sbRows = []
let _sbColFilters = {}
let _sbFilterDD = null

const SB_COLS = [
  { key: '_chk',        label: '선택',   noFilter: true },
  { key: 'status',      label: '상태' },
  { key: 'orderDate',   label: '주문일시' },
  { key: 'orderNo',     label: '주문번호' },
  { key: 'shopName',    label: '쇼핑몰' },
  { key: 'productCode', label: '품번' },
  { key: 'productName', label: '상품명' },
  { key: 'size',        label: '사이즈' },
  { key: 'qty',         label: '수량' },
  { key: 'revenue',     label: '매출액' },
  { key: 'matchStatus', label: '매칭' }
]

// --- helpers ---
function _sbToNum(v) { const n = Number(v); return isNaN(n) ? 0 : n }

function _sbParseDate(val) {
  if (!val) return ''
  if (typeof val === 'number') return parseExcelDate(val)
  return String(val).split(' ')[0] || ''
}

function _sbParseSize(sizeAlias, optionClean) {
  const s = String(sizeAlias || '').trim().toUpperCase()
  if (s && s !== '-') return s
  // fallback: optionClean "85(M)" → M
  const opt = String(optionClean || '').trim()
  const m = opt.match(/\(([^)]+)\)/)
  if (m) return m[1].toUpperCase()
  return 'F'
}

// --- Brand / Type detection from productCode prefix ---
function _sbDetectBrand(code) {
  if (!code) return '르망고'
  const c = code.toUpperCase()
  if (c.startsWith('LN')) return '르망고 느와'
  return '르망고'
}

function _sbDetectType(code) {
  if (!code) return ''
  const c = code.toUpperCase()
  if (c.startsWith('LSWON') || c.startsWith('LSGON')) return 'onepiece'
  if (c.startsWith('LSMBR')) return 'bikini'
  return ''
}

function _sbIsFreebie(row) {
  const orderNo = String(row[SABANGNET.orderNo] || '').trim()
  const code = String(row[SABANGNET.productCode] || '').trim()
  return orderNo.includes('_사은품') || code.includes('사은품')
}

function _sbRowStatus(r) {
  if (r.isDuplicate) return '중복'
  if (r.isFreebie) return '사은품'
  if (!r.matched) return '신규등록'
  return '정상'
}

function _sbColValue(r, key) {
  switch (key) {
    case 'status':      return _sbRowStatus(r)
    case 'orderDate':   return r.orderDate
    case 'orderNo':     return r.orderNo
    case 'shopName':    return r.shopName
    case 'productCode': return r.productCode
    case 'productName': return r.p ? (r.p.nameKr || r.productName) : r.productName
    case 'size':        return r.size
    case 'qty':         return String(r.qty)
    case 'revenue':     return String(r.revenue)
    case 'matchStatus': return r.matched ? '매칭' : '신규등록'
    default:            return ''
  }
}

// --- Auto-create product ---
function _sbCreateProduct(code, name, unitPrice) {
  const newP = {
    no: State.allProducts.length + 1,
    brand: _sbDetectBrand(code),
    productCode: code,
    sampleNo: '', cafe24Code: '', barcode: '',
    nameKr: name, nameEn: '',
    colorKr: '', colorEn: '',
    salePrice: unitPrice || 0, costPrice: 0,
    type: _sbDetectType(code),
    backStyle: '', legCut: '', guide: '', fabricType: '',
    chestLine: '', transparency: '', lining: '', capRing: '',
    material: '', comment: '', washMethod: '',
    bust: '', waist: '', hip: '', modelSize: '',
    madeMonth: '', madeBy: '', madeIn: '',
    videoUrl: '',
    saleStatus: '판매중', productionStatus: '지속생산',
    productCodeLocked: false,
    images: { sum: [], lemango: [], noir: [], external: [], design: [], shoot: [] },
    barcodes: Object.fromEntries(SIZES.map(sz => [sz, ''])),
    stock: Object.fromEntries(SIZES.map(sz => [sz, 0])),
    stockLog: [],
    sales: {},
    revenueLog: [],
    scheduleLog: [],
    registDate: new Date().toISOString().split('T')[0],
    logisticsDate: ''
  }
  _platforms.forEach(pl => { newP.sales[pl] = 0 })
  return newP
}

// ===========================================
// ===== File Upload =====
// ===========================================
function extractSabangnetChannels(rows) {
  const set = new Set()
  ;(rows || []).forEach(r => {
    const shop = String(r[SABANGNET.shopName] || '').trim()
    if (shop) set.add(shop)
  })
  return [...set]
}

function handleSabangnetUpload(input) {
  const file = input.files[0]
  if (!file) return
  const isCsv = /\.csv$/i.test(file.name)
  const reader = new FileReader()
  reader.onload = async e => {
    const opts = isCsv
      ? { type: 'string', codepage: 65001 }
      : { type: 'array' }
    const wb = XLSX.read(e.target.result, opts)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const dataRows = raw.slice(1).filter(r =>
      (r[SABANGNET.productCode] || r[SABANGNET.orderNo]) &&
      String(r[SABANGNET.productCode] || '').trim() !== ''
    )
    input.value = ''
    const newCh = detectNewChannels(extractSabangnetChannels(dataRows))
    if (newCh.length) await promptNewChannels(newCh)
    showSabangnetPreview(dataRows)
  }
  if (isCsv) reader.readAsText(file, 'UTF-8')
  else reader.readAsArrayBuffer(file)
}

// ===========================================
// ===== Preview: Parse & Calculate =====
// ===========================================
function showSabangnetPreview(rawRows) {
  const existingOrders = _buildExistingOrderIndex()

  _sbRows = rawRows.map((row, i) => {
    const shopName     = String(row[SABANGNET.shopName]    || '').trim()
    const orderNo      = String(row[SABANGNET.orderNo]     || '').trim()
    const productCode  = String(row[SABANGNET.productCode] || '').trim()
    const productName  = String(row[SABANGNET.productName] || '').trim()
    const qty          = _sbToNum(row[SABANGNET.qty])
    const paymentAmt   = _sbToNum(row[SABANGNET.paymentAmt])
    const shippingFee  = _sbToNum(row[SABANGNET.shippingFee])
    const unitPrice    = _sbToNum(row[SABANGNET.unitPrice])
    const orderDate    = _sbParseDate(row[SABANGNET.orderDate])
    const size         = _sbParseSize(row[SABANGNET.sizeAlias], row[SABANGNET.optionClean])
    const isDuplicate  = existingOrders.has(orderNo)
    const isFreebie    = _sbIsFreebie(row)
    const revenue      = isFreebie ? 0 : (paymentAmt + shippingFee)

    const p = State.allProducts.find(pr => pr.productCode === productCode)
    const matched = !!p

    // 사은품: unchecked (배송비 중복 방지); 중복: disabled; 나머지: checked
    const checked = !isDuplicate && !isFreebie

    return {
      idx: i, shopName, orderNo, productCode, productName,
      qty, paymentAmt, shippingFee, unitPrice, orderDate, size,
      isDuplicate, isFreebie, matched, p, revenue, checked
    }
  }).filter(r => r.qty > 0)

  // Detect new platforms
  const uploadShops = [...new Set(_sbRows.map(r => r.shopName).filter(Boolean))]
  const newShops = uploadShops.filter(s => !_platforms.includes(s))
  // Store for summary display (applied at confirm time)
  _sbRows._newShops = newShops

  // Detect new products (exclude gift rows)
  const newProductCodes = new Set()
  _sbRows.forEach(r => {
    if (!r.matched && !r.isDuplicate && !r.isFreebie && r.productCode) {
      newProductCodes.add(r.productCode)
    }
  })
  _sbRows._newProductCodes = newProductCodes

  // Reset filters & open modal
  _sbColFilters = {}
  _closeSbFilter()
  const modal = document.getElementById('sabangnetPreviewModal')
  modal.showModal()
  centerModal(modal)
  _renderSbPreview()
}

// ===========================================
// ===== Preview: Render =====
// ===========================================
function _applySbFilters(rows) {
  const keys = Object.keys(_sbColFilters)
  if (keys.length === 0) return rows
  return rows.filter(r => {
    for (const k of keys) {
      const allowed = _sbColFilters[k]
      if (!allowed || allowed.size === 0) continue
      if (!allowed.has(_sbColValue(r, k))) return false
    }
    return true
  })
}

function _renderSbPreview() {
  const total      = _sbRows.length
  const dupCnt     = _sbRows.filter(r => r.isDuplicate).length
  const normalCnt  = _sbRows.filter(r => r.matched && !r.isDuplicate && !r.isFreebie).length
  const newRegCnt  = _sbRows.filter(r => !r.matched && !r.isDuplicate && !r.isFreebie).length
  const freebieCnt = _sbRows.filter(r => r.isFreebie && !r.isDuplicate).length

  // Revenue — exclude gift rows (배송비 중복 방지)
  const nonDupNonGift = _sbRows.filter(r => !r.isDuplicate && !r.isFreebie)
  const matchedRev   = nonDupNonGift.filter(r => r.matched).reduce((s, r) => s + r.revenue, 0)
  const unmatchedRev  = nonDupNonGift.filter(r => !r.matched).reduce((s, r) => s + r.revenue, 0)
  const totalRev      = matchedRev + unmatchedRev

  const fmtW = v => `₩${v.toLocaleString()}`
  const newShops = _sbRows._newShops || []
  const newProductCodes = _sbRows._newProductCodes || new Set()

  // Filtered rows
  const visibleRows = _applySbFilters(_sbRows)

  // thead
  const theadHtml = SB_COLS.map(col => {
    const wMap = { _chk:'32px', status:'64px', orderDate:'88px', orderNo:'100px',
      shopName:'70px', size:'46px', qty:'38px', revenue:'80px', matchStatus:'56px' }
    const w = wMap[col.key] ? ` width="${wMap[col.key]}"` : ''
    const alignMap = { _chk:'center', size:'center', qty:'center', revenue:'right' }
    const align = alignMap[col.key] ? `;text-align:${alignMap[col.key]}` : ''
    if (col.noFilter) {
      return `<th style="white-space:nowrap${align}"${w}>${col.label}</th>`
    }
    const isActive = _sbColFilters[col.key] && _sbColFilters[col.key].size > 0
    const filterCls = isActive ? 'c24-th-filter active' : 'c24-th-filter'
    return `<th style="white-space:nowrap${align}"${w} data-sbkey="${col.key}">` +
      `<div class="th-content"><span class="th-label">${col.label}</span>` +
      `<span class="${filterCls}" data-sbfilter="${col.key}">▼</span></div></th>`
  }).join('')

  // tbody
  const tbody = visibleRows.map(r => {
    const i = _sbRows.indexOf(r)
    const rowCls = r.isDuplicate ? ' class="cafe24-dup-row"'
      : r.isFreebie ? ' class="cafe24-refund-row"' : ''

    let statusBadge
    if (r.isDuplicate) {
      statusBadge = '<span class="badge-preview badge-preview-dup">중복</span>'
    } else if (r.isFreebie) {
      statusBadge = '<span class="badge-preview badge-preview-warn">사은품</span>'
    } else if (!r.matched) {
      statusBadge = '<span class="badge-preview badge-preview-newreg">신규등록</span>'
    } else {
      statusBadge = '<span class="badge-preview badge-preview-ok">정상</span>'
    }

    const matchBadge = r.matched
      ? '<span class="badge-preview badge-preview-ok">매칭</span>'
      : '<span class="badge-preview badge-preview-newreg">신규등록</span>'

    const checked = r.checked ? 'checked' : ''
    const disabled = r.isDuplicate ? 'disabled' : ''
    // 사은품 rows: enabled but unchecked by default (user can manually check)

    return `<tr${rowCls}>
      <td style="text-align:center"><input type="checkbox" class="sb-chk" data-idx="${i}" ${checked} ${disabled} /></td>
      <td>${statusBadge}</td>
      <td style="font-size:11px;white-space:nowrap">${r.orderDate}</td>
      <td style="font-family:Inter;font-size:11px">${r.orderNo}</td>
      <td style="font-size:11px">${r.shopName}</td>
      <td style="font-family:Inter;font-size:11px">${r.productCode}</td>
      <td>${r.p ? (r.p.nameKr || r.productName) : r.productName}</td>
      <td style="text-align:center;font-family:Inter;font-weight:600;color:var(--accent)">${r.size}</td>
      <td style="text-align:center;font-weight:700">${r.qty}</td>
      <td style="text-align:right;font-family:Inter;font-size:11px">${r.revenue.toLocaleString()}</td>
      <td>${matchBadge}</td>
    </tr>`
  }).join('')

  // Summary
  let line1 =
    `총 <b>${total}</b>건 &nbsp;|&nbsp; ` +
    `정상 <b style="color:var(--success)">${normalCnt}</b> &nbsp;|&nbsp; ` +
    `신규등록 <b style="color:#1b5e20">${newRegCnt}</b> &nbsp;|&nbsp; ` +
    `사은품 <b style="color:var(--warning)">${freebieCnt}</b>`
  if (dupCnt > 0) line1 += ` &nbsp;|&nbsp; 중복 <b style="color:#1565c0">${dupCnt}</b>`

  const line2 =
    `매출액 <b style="color:var(--primary)">${fmtW(matchedRev)}</b> &nbsp;|&nbsp; ` +
    `신규매출액 <b style="color:#1b5e20">${fmtW(unmatchedRev)}</b> &nbsp;|&nbsp; ` +
    `총매출액 <b style="color:var(--primary);font-size:14px">${fmtW(totalRev)}</b>`

  let line3 = ''
  if (newShops.length > 0) {
    line3 += `신규 쇼핑몰: ${newShops.map(s => `<b style="color:#1565c0">[${s}]</b>`).join(' ')} (자동 추가 예정)`
  }
  if (newProductCodes.size > 0) {
    if (line3) line3 += ' &nbsp;|&nbsp; '
    line3 += `신규 상품: <b style="color:#1b5e20">${newProductCodes.size}</b>개 (자동 등록 예정)`
  }

  const infoEl = document.getElementById('sabangnetPreviewInfo')
  infoEl.innerHTML =
    `<div style="display:flex;flex-direction:column;gap:3px">` +
    `<div>${line1}</div>` +
    `<div>${line2}</div>` +
    (line3 ? `<div style="font-size:11px;color:var(--text-sub)">${line3}</div>` : '') +
    `</div>`

  // Write table
  const table = document.querySelector('#sabangnetPreviewModal .srm-table')
  table.querySelector('thead').innerHTML = `<tr>${theadHtml}</tr>`
  document.getElementById('sabangnetPreviewBody').innerHTML = tbody ||
    '<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text-sub)">데이터 없음</td></tr>'

  const confirmBtn = document.getElementById('sabangnetConfirmBtn')
  confirmBtn.disabled = _sbRows.filter(r => r.checked).length === 0

  // Checkbox events
  document.getElementById('sabangnetPreviewModal').querySelectorAll('.sb-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const idx = parseInt(chk.dataset.idx)
      _sbRows[idx].checked = chk.checked
      confirmBtn.disabled = _sbRows.filter(r => r.checked).length === 0
    })
  })

  // Filter icon events
  table.querySelector('thead').addEventListener('click', e => {
    const filterBtn = e.target.closest('[data-sbfilter]')
    if (!filterBtn) return
    e.stopPropagation()
    _openSbFilter(filterBtn.closest('th'), filterBtn.dataset.sbfilter)
  })
}

// ===========================================
// ===== Column Filter Dropdown =====
// ===========================================
function _openSbFilter(th, key) {
  _closeSbFilter()
  const otherFilters = { ..._sbColFilters }
  delete otherFilters[key]
  const otherKeys = Object.keys(otherFilters)
  const baseRows = otherKeys.length > 0
    ? _sbRows.filter(r => {
        for (const k of otherKeys) {
          const allowed = otherFilters[k]
          if (!allowed || allowed.size === 0) continue
          if (!allowed.has(_sbColValue(r, k))) return false
        }
        return true
      })
    : _sbRows

  const vals = [...new Set(baseRows.map(r => _sbColValue(r, key)))]
  if (key === 'qty' || key === 'revenue') vals.sort((a, b) => Number(a) - Number(b))
  else vals.sort((a, b) => String(a).localeCompare(String(b)))

  const selected = _sbColFilters[key] || new Set(vals)
  const dd = document.createElement('div')
  dd.className = 'col-filter-dd'
  dd.id = 'sbFilterDD'
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
  _sbFilterDD = dd

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
    if (checked.length === vals.length || checked.length === 0) delete _sbColFilters[key]
    else _sbColFilters[key] = new Set(checked)
    _closeSbFilter()
    _renderSbPreview()
  })
  dd.querySelector('[data-act="reset"]').addEventListener('click', () => {
    delete _sbColFilters[key]
    _closeSbFilter()
    _renderSbPreview()
  })
  setTimeout(() => document.addEventListener('click', _sbFilterOutsideClick), 0)
}

function _sbFilterOutsideClick(e) {
  if (_sbFilterDD && !_sbFilterDD.contains(e.target) && !e.target.closest('[data-sbfilter]')) {
    _closeSbFilter()
  }
}

function _closeSbFilter() {
  if (_sbFilterDD) { _sbFilterDD.remove(); _sbFilterDD = null }
  document.removeEventListener('click', _sbFilterOutsideClick)
}

// ===========================================
// ===== Confirm: Apply =====
// ===========================================
function confirmSabangnetUpload() {
  const now = new Date().toISOString()
  let saleCnt = 0, freebieCnt = 0, dupSkipped = 0
  let newProductCnt = 0, newPlatformCnt = 0

  // --- Step 1: Auto-add new platforms ---
  const newShops = _sbRows._newShops || []
  if (newShops.length > 0) {
    newShops.forEach(shop => {
      _platforms.push(shop)
      State.allProducts.forEach(p => {
        if (!p.sales[shop]) p.sales[shop] = 0
      })
    })
    savePlatforms()
    populateAllSelects()
    newPlatformCnt = newShops.length
  }

  // --- Step 2: Auto-create new products (skip gift rows) ---
  const createdCodes = new Set()
  _sbRows.forEach(r => {
    if (r.isDuplicate || r.isFreebie || !r.checked) return
    if (!r.matched && r.productCode && !r.productCode.includes('사은품') && !createdCodes.has(r.productCode)) {
      const newP = _sbCreateProduct(r.productCode, r.productName, r.unitPrice)
      State.allProducts.push(newP)
      createdCodes.add(r.productCode)
      newProductCnt++
      // Update row reference
      r.p = newP
      r.matched = true
    }
  })

  // Also update other rows referencing newly created products
  if (createdCodes.size > 0) {
    _sbRows.forEach(r => {
      if (!r.p && createdCodes.has(r.productCode)) {
        r.p = State.allProducts.find(pr => pr.productCode === r.productCode)
        r.matched = !!r.p
      }
    })
  }

  // --- Step 3: Apply sales (skip gift rows entirely) ---
  _sbRows.forEach(r => {
    if (r.isDuplicate) { dupSkipped++; return }
    if (r.isFreebie) { freebieCnt++; return }
    if (!r.checked) return
    if (!r.p) return

    const ch = r.shopName
    r.p.revenueLog = r.p.revenueLog || []

    // Ensure sales key exists
    if (r.p.sales[ch] === undefined) r.p.sales[ch] = 0

    r.p.sales[ch] += r.qty
    r.p.revenueLog.push({
      type: 'sale', source: '사방넷', date: r.orderDate, channel: ch, orderNo: r.orderNo,
      qty: r.qty, revenue: r.revenue, registeredAt: now
    })
    saleCnt++
    try { if (typeof addProductHistory === 'function') addProductHistory(r.p.productCode, '사방넷매출', `${ch} ${r.qty}개 (주문 ${r.orderNo})`) } catch(e) {}
  })

  _closeSbFilter()
  document.getElementById('sabangnetPreviewModal').close()
  _sbRows = []
  _sbColFilters = {}
  renderSalesTable()
  renderDashboard()

  // Toast
  const parts = [`${saleCnt}건 반영`]
  if (freebieCnt > 0) parts.push(`사은품 ${freebieCnt}건`)
  if (newProductCnt > 0) parts.push(`신규상품 ${newProductCnt}개 등록`)
  if (newPlatformCnt > 0) parts.push(`신규채널 ${newPlatformCnt}개 추가`)
  const excludes = []
  if (dupSkipped > 0) excludes.push(`중복 ${dupSkipped}건 제외`)

  if (saleCnt === 0 && freebieCnt === 0) {
    showToast('반영할 건이 없습니다.', 'warning')
  } else {
    let msg = `사방넷 주문: ${parts.join(', ')}`
    if (excludes.length > 0) msg += ` (${excludes.join(', ')})`
    showToast(msg, 'success')
    logActivity('upload', '매출현황', `사방넷 업로드: ${parts.join(', ')}`)
  }
}
