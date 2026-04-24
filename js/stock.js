// =============================================
// ===== 재고조회 =====
// =============================================
function searchStock() {
  const keywords = parseKeywords(document.getElementById('sKeyword').value)
  const dateFrom = document.getElementById('sDateFrom').value
  const dateTo   = document.getElementById('sDateTo').value
  const status   = document.getElementById('sStockStatus').value

  let result = State.allProducts.filter(p => {
    if (keywords.length) {
      const targets = [p.productCode, p.nameKr]
      if (!keywords.some(kw => matchAnyTarget(targets, kw))) return false
    }
    if (dateFrom || dateTo) {
      if (!isInRange(p.registDate, dateFrom, dateTo)) return false
    }
    if (status === 'instock' && getTotalStock(p) === 0) return false
    if (status === 'soldout' && getTotalStock(p)  >  0) return false
    return true
  })
  State.stock.page = 1
  State.stock.filtered = sortData(result, State.stock.sort.key, State.stock.sort.dir)
  saveFilterDefault('stock', {
    sKeyword: document.getElementById('sKeyword').value,
    sDateFrom: dateFrom, sDateTo: dateTo, sStockStatus: status
  })
  renderStockTable()
}

// ===== 재고 입력 패널 =====
function findStockProduct() {
  const keyword = document.getElementById('sipKeyword').value.trim()
  if (!keyword) { showToast('품번을 입력하세요.', 'warning'); return }

  const p = findProductByKeyword(keyword)
  const body = document.getElementById('sipBody')
  if (!p) {
    body.innerHTML = `<div class="sip-empty sip-notfound">품번 <b>${esc(keyword)}</b>을(를) 찾을 수 없습니다.</div>`
    return
  }

  const sizes = SIZES
  body.innerHTML = `
    <div class="sip-product-info">
      <span class="sip-brand">${p.brand}</span>
      <span class="sip-code">${p.productCode}</span>
      <span class="sip-name">${p.nameKr}</span>
    </div>
    <div class="sip-sizes">
      ${sizes.map(sz => `
        <div class="sip-size-item">
          <label class="sip-size-label">${sz}</label>
          <input type="number" class="sip-size-input" id="sipStock_${sz}"
            value="${p.stock?.[sz] || 0}" min="0"
            onkeydown="if(event.key==='Enter') saveStockInput('${p.productCode}')" />
        </div>
      `).join('')}
      <div class="sip-size-item sip-total-item">
        <label class="sip-size-label">합계</label>
        <span class="sip-total-num" id="sipTotal">${getTotalStock(p)}</span>
      </div>
    </div>
    <div class="sip-actions">
      <button class="btn btn-primary" onclick="saveStockInput('${p.productCode}')">저장</button>
      <button class="btn btn-outline" onclick="clearSipPanel()">닫기</button>
    </div>
  `

  // 입력값 변경 시 합계 실시간 업데이트 (DOM 참조 캐시)
  const sipInputs = SIZES.map(sz => document.getElementById(`sipStock_${sz}`))
  sipInputs.forEach(el => {
    el.addEventListener('input', () => {
      const total = sipInputs.reduce((s, inp) => s + (parseInt(inp.value) || 0), 0)
      document.getElementById('sipTotal').textContent = total
    })
  })
}

function saveStockInput(productCode) {
  const p = State.allProducts.find(x => x.productCode === productCode)
  if (!p) return
  const sizes = SIZES
  sizes.forEach(sz => {
    p.stock[sz] = parseInt(document.getElementById(`sipStock_${sz}`).value) || 0
  })
  State.stock.filtered = State.stock.filtered.map(x => x.productCode === productCode ? p : x)
  renderStockTable()
  showToast(`${p.nameKr} 재고가 저장됐습니다.`, 'success')
}

function clearSipPanel() {
  document.getElementById('sipKeyword').value = ''
  document.getElementById('sipBody').innerHTML = '<div class="sip-empty">품번을 입력하여 재고를 수정하세요</div>'
}

// ===== 재고 등록 모달 =====
let _stockUploadData = null

function closeStockRegisterModal(force) {
  const modal = document.getElementById('stockRegisterModal')
  const doClose = () => { _stockUploadData = null; modal.close() }
  if (force) { doClose(); return }
  safeCloseModal(modal,
    () => !document.getElementById('srmProductArea')?.textContent.includes('품번을 입력하세요'),
    doClose
  )
}

function openStockRegisterModal() {
  document.getElementById('srmKeyword').value = ''
  document.getElementById('srmProductArea').innerHTML = '<div class="srm-empty">품번을 입력하세요</div>'
  document.getElementById('srmPreviewSection').style.display = 'none'
  document.getElementById('srmConfirmBtn').style.display = 'none'
  _stockUploadData = null
  const modal = document.getElementById('stockRegisterModal')
  centerModal(modal)
  modal.showModal()
  centerModal(modal)
}

function findSrmProduct() {
  const keyword = document.getElementById('srmKeyword').value.trim()
  if (!keyword) return
  const p = findProductByKeyword(keyword)
  const area = document.getElementById('srmProductArea')
  if (!p) {
    area.innerHTML = `<div class="srm-empty srm-notfound">품번 <b>${esc(keyword)}</b>을(를) 찾을 수 없습니다.</div>`
    return
  }
  area.innerHTML = buildSrmProductArea(p)
}

function buildSrmProductArea(p) {
  const sizes = SIZES

  // 입고 이력 섹션 (날짜 역순)
  const logs = (p.stockLog || []).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''))
  const logHtml = logs.length ? `
    <div class="srm-log-section">
      <div class="srm-log-title">입고 이력</div>
      <table class="srm-log-table">
        <thead>
          <tr>
            <th>입고일</th>
            ${sizes.map(sz => `<th>${sz}</th>`).join('')}
            <th>합계</th>
            <th>메모</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(log => {
            const rowTotal = sizes.reduce((s, sz) => s + (log[sz]||0), 0)
            return `<tr>
              <td>${log.date||'-'}</td>
              ${sizes.map(sz => `<td class="${(log[sz]||0)>0?'srm-log-qty':''}">${log[sz]||0}</td>`).join('')}
              <td class="srm-log-total">${rowTotal}</td>
              <td class="srm-log-memo">${log.memo||''}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>` : ''

  return `
    <div class="sip-product-info" style="margin:12px 0 10px">
      <span class="sip-brand">${p.brand}</span>
      <span class="sip-code">${p.productCode}</span>
      <span class="sip-name">${p.nameKr}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:12px">
      <thead>
        <tr style="background:var(--table-header)">
          <th style="padding:5px 8px;text-align:left;border:1px solid var(--border)">사이즈</th>
          <th style="padding:5px 8px;text-align:left;border:1px solid var(--border)">바코드</th>
          <th style="padding:5px 8px;text-align:right;border:1px solid var(--border)">현재재고</th>
          <th style="padding:5px 8px;text-align:center;border:1px solid var(--border)">추가입고수량</th>
        </tr>
      </thead>
      <tbody>
        ${sizes.map(sz => `
          <tr>
            <td style="padding:5px 8px;border:1px solid var(--border);font-weight:600">${sz}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);font-family:Inter;color:var(--text-sub)">${p.barcodes?.[sz] || p.barcode || '-'}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);text-align:right">${p.stock?.[sz]||0}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);text-align:center">
              <input type="number" class="sip-size-input" id="srmStock_${sz}"
                value="0" min="0" style="width:70px;text-align:center"
                oninput="updateSrmTotal()" />
            </td>
          </tr>`).join('')}
        <tr style="background:var(--table-header);font-weight:700">
          <td colspan="3" style="padding:5px 8px;border:1px solid var(--border);text-align:right">입고 합계</td>
          <td style="padding:5px 8px;border:1px solid var(--border);text-align:center" id="srmTotal">0</td>
        </tr>
      </tbody>
    </table>
    <div style="display:flex;gap:8px;align-items:center;margin:8px 0 0">
      <label style="font-size:12px;white-space:nowrap">입고일</label>
      <input type="date" id="srmDate" value="${new Date().toISOString().slice(0,10)}" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px" />
      <label style="font-size:12px;white-space:nowrap">메모</label>
      <input type="text" id="srmMemo" placeholder="메모 (선택)" style="flex:2;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px" />
    </div>
    <div class="sip-actions">
      <button class="btn btn-primary" onclick="saveSrmStock('${p.productCode}')">입고 저장</button>
    </div>
    ${logHtml}
  `
}

function updateSrmTotal() {
  const sizes = SIZES
  const total = sizes.reduce((s, sz) => s + (parseInt(document.getElementById(`srmStock_${sz}`)?.value)||0), 0)
  document.getElementById('srmTotal').textContent = total
}

function saveSrmStock(productCode) {
  const p = State.allProducts.find(x => x.productCode === productCode)
  if (!p) return
  const sizes = SIZES
  const inQty = {}
  sizes.forEach(sz => { inQty[sz] = parseInt(document.getElementById(`srmStock_${sz}`)?.value)||0 })
  const total = Object.values(inQty).reduce((a,b) => a+b, 0)
  if (total === 0) { showToast('입고 수량을 입력해주세요.', 'warning'); return }

  // 누적 추가
  if (!p.stock) p.stock = Object.fromEntries(SIZES.map(sz => [sz, 0]))
  sizes.forEach(sz => { p.stock[sz] = (p.stock[sz]||0) + inQty[sz] })

  // 입고 이력 저장
  if (!p.stockLog) p.stockLog = []
  const _inLog = {
    type: 'in',
    date: document.getElementById('srmDate')?.value || new Date().toISOString().slice(0,10),
    memo: document.getElementById('srmMemo')?.value.trim() || '',
    ...inQty,
    registeredAt: new Date().toISOString()
  }
  stampCreated(_inLog)
  p.stockLog.push(_inLog)

  State.stock.filtered = State.stock.filtered.map(x => x.productCode === productCode ? p : x)
  renderStockTable()
  showToast(`${p.nameKr} 입고 ${total}개 저장 완료`, 'success')
  logActivity('create', '재고관리', `입고: ${p.productCode} ${p.nameKr} ${total}개`)
  try { if (typeof addProductHistory === 'function') addProductHistory(p.productCode, '입고', `총 ${total}개`) } catch(e) {}
  if (typeof saveProducts === 'function') saveProducts().catch(e => console.error(e))
  // 저장 후 동일 상품 다시 렌더 (현재 재고 + 입고 이력 포함)
  document.getElementById('srmProductArea').innerHTML = buildSrmProductArea(p)
}

function handleStockRegisterUpload(input) {
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const wb  = XLSX.read(e.target.result, { type: 'array', cellDates: true })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      // 1행 헤더: 입고일(0) 품번(1) 사이즈(2) 바코드(3) 수량(4) 메모(5)
      const dataRows = raw.slice(1).filter(r => String(r[1]||'').trim())
      if (!dataRows.length) { showToast('데이터가 없습니다.', 'error'); return }

      _stockUploadData = dataRows.map((row, idx) => {
        const code    = String(row[1]||'').trim()
        const p       = State.allProducts.find(x => x.productCode === code)
        return {
          rowNum:  idx + 2,
          date:    parseExcelDate(row[0]),
          code,
          size:    String(row[2]||'').trim().toUpperCase(),
          barcode: String(row[3]||'').trim(),
          qty:     parseInt(row[4]) || 0,
          memo:    String(row[5]||'').trim(),
          found:   !!p,
          nameKr:  p ? p.nameKr : '—'
        }
      })

      const valid    = _stockUploadData.filter(r => r.found).length
      const notFound = _stockUploadData.filter(r => !r.found).length
      document.getElementById('srmPreviewCount').innerHTML =
        `<span style="font-weight:400;font-size:12px;color:var(--text-sub)">
          전체 ${_stockUploadData.length}행 | <span style="color:var(--success)">매칭 ${valid}행</span>
          ${notFound ? ` | <span style="color:var(--danger)">미매칭 ${notFound}행</span>` : ''}
        </span>`

      document.getElementById('srmPreviewTbody').innerHTML = _stockUploadData.map(r => `
        <tr class="${r.found ? '' : 'upm-row-error'}">
          <td>${r.rowNum}</td>
          <td style="font-size:11px">${r.date}</td>
          <td style="font-family:Inter;font-size:11px">${r.code}</td>
          <td>${r.nameKr}</td>
          <td style="text-align:center;font-weight:600">${r.size}</td>
          <td style="font-family:Inter;font-size:11px">${r.barcode || '-'}</td>
          <td style="text-align:center;font-weight:700;color:var(--accent)">${r.qty}</td>
          <td style="font-size:11px;color:var(--text-sub)">${r.memo || '-'}</td>
          <td>${r.found ? '<span class="upm-badge ok">✅</span>' : '<span class="upm-badge err">❌ 미매칭</span>'}</td>
        </tr>`).join('')

      document.getElementById('srmPreviewSection').style.display = ''
      document.getElementById('srmConfirmBtn').style.display = valid > 0 ? '' : 'none'
      document.getElementById('srmConfirmBtn').textContent = `${valid}행 입고 저장`
    } catch (err) {
      showToast('파일 읽기 오류: ' + err.message, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
}

function confirmStockUpload() {
  if (!_stockUploadData) return

  // 품번+입고일+메모로 그룹화 → 사이즈별 합산
  const groups = {}
  _stockUploadData.filter(r => r.found).forEach(r => {
    const key = `${r.code}||${r.date}||${r.memo}`
    if (!groups[key]) groups[key] = { code: r.code, date: r.date, memo: r.memo, sizes: {}, barcodes: {} }
    const sz = r.size
    if (SIZES.includes(sz)) {
      groups[key].sizes[sz] = (groups[key].sizes[sz] || 0) + r.qty
      if (r.barcode) groups[key].barcodes[sz] = r.barcode
    }
  })

  let cnt = 0
  Object.values(groups).forEach(g => {
    const p = State.allProducts.find(x => x.productCode === g.code)
    if (!p) return
    if (!p.stock)    p.stock    = Object.fromEntries(SIZES.map(sz => [sz, 0]))
    if (!p.barcodes) p.barcodes = {}
    if (!p.stockLog) p.stockLog = []

    // 누적 입고
    Object.entries(g.sizes).forEach(([sz, qty]) => { p.stock[sz] = (p.stock[sz]||0) + qty })
    // 바코드 업데이트
    Object.entries(g.barcodes).forEach(([sz, bc]) => { p.barcodes[sz] = bc })
    // 이력
    const _bulkLog = { type:'in', date: g.date, memo: g.memo || '엑셀 일괄 입고',
      ...g.sizes, barcodes: g.barcodes, registeredAt: new Date().toISOString() }
    stampCreated(_bulkLog)
    p.stockLog.push(_bulkLog)
    cnt++
  })

  State.stock.filtered = [...State.allProducts]
  renderStockTable()
  showToast(`${cnt}개 상품 입고 저장 완료`, 'success')
  logActivity('create', '재고관리', `일괄입고: ${cnt}개 상품`)
  if (typeof saveProducts === 'function') saveProducts().catch(e => console.error(e))
  document.getElementById('stockRegisterModal').close()
  _stockUploadData = null
}

// =============================================
// ===== 개별출고 모달 =====
// =============================================
function openOutgoingModal() {
  document.getElementById('ougKeyword').value = ''
  document.getElementById('ougProductArea').innerHTML = '<div class="srm-empty">품번을 입력하세요</div>'
  document.getElementById('ougDate').value = new Date().toISOString().slice(0,10)
  document.getElementById('ougMemo').value = ''
  const modal = document.getElementById('outgoingModal')
  centerModal(modal)
  modal.showModal()
  centerModal(modal)
}

function closeOutgoingModal(force) {
  const modal = document.getElementById('outgoingModal')
  if (force) { modal.close(); return }
  safeCloseModal(modal,
    () => !document.getElementById('ougProductArea')?.textContent.includes('품번을 입력하세요'),
    () => modal.close()
  )
}

function findOutgoingProduct() {
  const keyword = document.getElementById('ougKeyword').value.trim()
  if (!keyword) { showToast('품번을 입력하세요.', 'warning'); return }
  const p = findProductByKeyword(keyword)
  const area = document.getElementById('ougProductArea')
  if (!p) {
    area.innerHTML = `<div class="srm-empty srm-notfound">품번 <b>${esc(keyword)}</b>을(를) 찾을 수 없습니다.</div>`
    return
  }
  const sizes = SIZES
  area.innerHTML = `
    <div class="sip-product-info" style="margin:12px 0 10px">
      <span class="sip-brand">${p.brand}</span>
      <span class="sip-code">${p.productCode}</span>
      <span class="sip-name">${p.nameKr}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:12px">
      <thead>
        <tr style="background:var(--table-header)">
          <th style="padding:5px 8px;text-align:left;border:1px solid var(--border)">사이즈</th>
          <th style="padding:5px 8px;text-align:left;border:1px solid var(--border)">바코드</th>
          <th style="padding:5px 8px;text-align:right;border:1px solid var(--border)">현재재고</th>
          <th style="padding:5px 8px;text-align:center;border:1px solid var(--border)">출고수량</th>
        </tr>
      </thead>
      <tbody>
        ${sizes.map(sz => `
          <tr>
            <td style="padding:5px 8px;border:1px solid var(--border);font-weight:600">${sz}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);font-family:Inter;color:var(--text-sub)">${p.barcodes?.[sz] || p.barcode || '-'}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);text-align:right" id="ougCur_${sz}">${p.stock?.[sz]||0}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);text-align:center">
              <input type="number" class="sip-size-input" id="ougStock_${sz}"
                value="0" min="0" max="${p.stock?.[sz]||0}" style="width:70px;text-align:center"
                oninput="updateOugTotal()" />
            </td>
          </tr>`).join('')}
        <tr style="background:var(--table-header);font-weight:700">
          <td colspan="3" style="padding:5px 8px;border:1px solid var(--border);text-align:right">출고 합계</td>
          <td style="padding:5px 8px;border:1px solid var(--border);text-align:center" id="ougTotal">0</td>
        </tr>
      </tbody>
    </table>
    <div class="sip-actions">
      <button class="btn btn-danger" onclick="submitOutgoing('${p.productCode}')">출고 처리</button>
    </div>
  `
}

function updateOugTotal() {
  const sizes = SIZES
  const total = sizes.reduce((s, sz) => s + (parseInt(document.getElementById(`ougStock_${sz}`)?.value)||0), 0)
  const el = document.getElementById('ougTotal')
  if (el) el.textContent = total
}

function submitOutgoing(productCode) {
  const p = State.allProducts.find(x => x.productCode === productCode)
  if (!p) return
  const sizes = SIZES
  const outQty = {}
  sizes.forEach(sz => { outQty[sz] = parseInt(document.getElementById(`ougStock_${sz}`)?.value)||0 })
  const total = Object.values(outQty).reduce((a,b) => a+b, 0)
  if (total === 0) { showToast('출고 수량을 입력해주세요.', 'warning'); return }

  // 재고 초과 체크
  const overSize = sizes.find(sz => outQty[sz] > (p.stock?.[sz]||0))
  if (overSize) {
    showToast(`${overSize} 출고 수량이 현재 재고(${p.stock?.[overSize]||0})를 초과합니다.`, 'error')
    return
  }

  // 누적 차감
  if (!p.stock) p.stock = Object.fromEntries(SIZES.map(sz => [sz, 0]))
  sizes.forEach(sz => { p.stock[sz] = (p.stock[sz]||0) - outQty[sz] })

  // 출고 이력 저장
  if (!p.stockLog) p.stockLog = []
  const _outLog = {
    type: 'out',
    date: document.getElementById('ougDate')?.value || new Date().toISOString().slice(0,10),
    memo: document.getElementById('ougMemo')?.value.trim() || '',
    ...outQty,
    registeredAt: new Date().toISOString()
  }
  stampCreated(_outLog)
  p.stockLog.push(_outLog)

  State.stock.filtered = State.stock.filtered.map(x => x.productCode === productCode ? p : x)
  renderStockTable()
  showToast(`${p.nameKr} 출고 ${total}개 처리 완료`, 'success')
  logActivity('create', '재고관리', `출고: ${p.productCode} ${p.nameKr} ${total}개`)
  try { if (typeof addProductHistory === 'function') addProductHistory(p.productCode, '출고', `총 ${total}개`) } catch(e) {}
  if (typeof saveProducts === 'function') saveProducts().catch(e => console.error(e))
  closeOutgoingModal(true)
}

function changeStockPageSize(val) {
  State.stock.pageSize = parseInt(val) || 0
  State.stock.page = 1
  saveTableCustom('stock')
  renderStockTable()
}

function resetStock() {
  ['sKeyword','sDateFrom','sDateTo'].forEach(id => document.getElementById(id).value = '')
  document.getElementById('sStockStatus').value = 'all'
  document.getElementById('sPageSize').value = '10'
  State.stock.pageSize = 10
  State.stock.page = 1
  State.stock.columnFilters = {}
  State.stock.activeColumns = null
  State.stock.inactiveColumns = []
  State.stock.filtered = [...State.allProducts]
  renderStockTable()
}

// 재고관리 컬럼 정의
const STOCK_COLUMNS = [
  { key:'_image',     label:'이미지', fixed:true,  thAttr:'data-no-sort data-no-filter style="width:60px"',   td:p=>`<td>${renderThumb(p)}</td>`,   tf:()=>`<td></td>` },
  { key:'productCode',label:'품번',   fixed:true,  thAttr:'data-key="productCode" style="width:145px"',        td:p=>`<td><span class="code-link" onclick="openDetailModal('${p.productCode}')">${p.productCode}</span></td>`, tf:()=>`<td></td>` },
  { key:'nameKr',     label:'상품명', fixed:false, thAttr:'data-key="nameKr"',    td:p=>`<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis" title="${p.nameKr}">${p.nameKr}</td>`, tf:()=>`<td></td>` },
  { key:'brand',      label:'브랜드', fixed:false, thAttr:'data-key="brand"',     td:p=>`<td style="font-size:12px">${p.brand}</td>`,  tf:()=>`<td></td>` },
  { key:'salePrice',  label:'판매가', fixed:false, thAttr:'data-key="salePrice" style="text-align:right"', td:p=>`<td style="text-align:right"><span class="price">${fmtPrice(p.salePrice)}</span></td>`, tf:()=>`<td></td>` },
  ...SIZES.map(sz => ({
    key: `stock_${sz}`, label: sz, fixed:false,
    thAttr: `data-key="stock.${sz}" style="text-align:center"`,
    td: p => `<td style="text-align:center">${stockCell(p.stock?.[sz]||0)}</td>`,
    tf: (totals) => `<td style="text-align:center">${totals[sz]||0}</td>`
  })),
  { key:'totalStock', label:'합계',   fixed:false, thAttr:'data-key="totalStock" style="text-align:right"', td:p=>`<td style="text-align:right;font-family:Inter;font-weight:600">${getTotalStock(p)}</td>`, tf:(totals,grand)=>`<td style="text-align:right;font-weight:700">${grand}</td>` },
]
const STOCK_FIXED_KEYS = STOCK_COLUMNS.filter(c=>c.fixed).map(c=>c.key)

function renderStockTable() {
  const allKeys = STOCK_COLUMNS.map(c=>c.key)
  initColumnState('stock', allKeys)
  applyTableCustom('stock')
  allKeys.forEach(k => {
    if (!State.stock.activeColumns.includes(k) && !State.stock.inactiveColumns.includes(k)) State.stock.activeColumns.push(k)
  })
  State.stock.activeColumns = State.stock.activeColumns.filter(k => allKeys.includes(k))
  State.stock.inactiveColumns = State.stock.inactiveColumns.filter(k => allKeys.includes(k))
  renderColInactiveArea('sInactiveArea','sInactiveTags','stock',STOCK_COLUMNS,STOCK_FIXED_KEYS,'renderStockTable')

  const data = applyColFilters(State.stock.filtered, State.stock.columnFilters)
  const page = State.stock.page || 1
  const ps = getPageSize('stock')
  const pageData = ps === 0 ? data : data.slice((page - 1) * ps, page * ps)
  document.getElementById('sTableMeta').textContent = `검색결과 ${data.length}건`

  if (!data.length) {
    document.getElementById('sTableWrap').innerHTML = `<div class="empty-state"><p>검색 결과가 없습니다.</p></div>`
    document.getElementById('sPagination').innerHTML = ''
    return
  }

  const totals = {}
  SIZES.forEach(sz => totals[sz] = data.reduce((s,p) => s + (p.stock?.[sz]||0), 0))
  const grandTotal = Object.values(totals).reduce((a,b)=>a+b, 0)

  const activeCols = State.stock.activeColumns.map(k => STOCK_COLUMNS.find(c=>c.key===k)).filter(Boolean)
  const thHtml = activeCols.map(c => `<th ${c.thAttr} data-col-key="${c.key}">${c.label}</th>`).join('')
  const tbodyHtml = pageData.map(p => `<tr data-code="${p.productCode}">${activeCols.map(c=>c.td(p)).join('')}</tr>`).join('')

  // tfoot: 합계 행 — 비어있지 않은 tf가 하나라도 있을 때만
  const hasTfData = activeCols.some(c => c.key.startsWith('stock_') || c.key === 'totalStock')
  const tfHtml = hasTfData
    ? `<tfoot><tr>${activeCols.map(c => c.tf(totals, grandTotal)).join('')}</tr></tfoot>`
    : ''

  document.getElementById('sTableWrap').innerHTML = `
    <table class="data-table" id="stockTable">
      <thead><tr>${thHtml}</tr></thead>
      <tbody>${tbodyHtml}</tbody>
      ${tfHtml}
    </table>`

  initTableFeatures('stockTable', 'stock', 'renderStockTable')
  bindColumnDragDrop('stockTable', 'stock', STOCK_FIXED_KEYS, 'renderStockTable')
  applyColWidthsToHeader('stockTable', 'stock')
  renderPagination('sPagination', 'stock', 'renderStockTable')
  // Feature 12: row double-click → detail
  initRowDblClick('stockTable', (tr) => {
    const code = tr.getAttribute('data-code')
    if (code) openDetailModal(code)
  })
}

// =============================================
// ===== 바코드 업로드 =====
// =============================================
let _bcUploadData = []

function openBarcodeUploadModal() {
  _bcUploadData = []
  const input = document.getElementById('bcUploadFile')
  if (input) input.value = ''
  document.getElementById('bcPreviewArea').style.display = 'none'
  const modal = document.getElementById('barcodeUploadModal')
  modal.showModal()
  centerModal(modal)
}

function closeBarcodeUploadModal(force) {
  const modal = document.getElementById('barcodeUploadModal')
  const doClose = () => { _bcUploadData = []; modal.close() }
  if (force) { doClose(); return }
  safeCloseModal(modal,
    () => _bcUploadData && _bcUploadData.length > 0,
    doClose
  )
}

function downloadBarcodeSample() {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  const header = ['품번', '사이즈', '바코드']
  const sample = [
    ['LSWON16266707', 'XS', '8809100001001'],
    ['LSWON16266707', 'S',  '8809100001002'],
    ['LSWON16266707', 'M',  '8809100001003'],
    ['LSWON16266707', 'L',  '8809100001004'],
    ['LSWON16266707', 'XL', '8809100001005'],
  ]
  const ws = XLSX.utils.aoa_to_sheet([header, ...sample])
  ws['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 18 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '바코드')
  XLSX.writeFile(wb, '르망고_바코드_샘플.xlsx')
}

function handleBarcodeUpload(input) {
  const file = input.files?.[0]
  if (!file) return
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }

  const reader = new FileReader()
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      const dataRows = raw.slice(1).filter(r => String(r[0] || '').trim() && String(r[2] || '').trim())

      _bcUploadData = dataRows.map(r => {
        const code = String(r[0]).trim()
        const size = String(r[1]).trim().toUpperCase()
        const barcode = String(r[2]).trim()
        const product = State.allProducts.find(p => p.productCode === code)
        const existing = product?.barcodes?.[size] || ''

        return {
          code, size, barcode,
          status: product ? (existing ? '덮어쓰기' : '신규') : '미등록',
          existing,
          product
        }
      })

      renderBarcodePreview()
    } catch (err) {
      showToast('파일 읽기 오류: ' + err.message, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
}

function renderBarcodePreview() {
  document.getElementById('bcPreviewArea').style.display = 'block'

  const total = _bcUploadData.length
  const matched = _bcUploadData.filter(d => d.status !== '미등록').length
  document.getElementById('bcTotalCount').textContent = total
  document.getElementById('bcMatchCount').textContent = matched
  document.getElementById('bcMissCount').textContent = total - matched

  document.getElementById('bcPreviewBody').innerHTML = _bcUploadData.map(d => {
    const cls = d.status === '미등록' ? 'bc-row-miss' : d.status === '덮어쓰기' ? 'bc-row-overwrite' : 'bc-row-new'
    const badge = d.status === '미등록' ? '<span class="badge-preview-err">미등록</span>'
      : d.status === '덮어쓰기' ? '<span class="badge-preview-warn">덮어쓰기</span>'
      : '<span class="badge-preview-ok">신규</span>'
    return `<tr class="${cls}">
      <td>${badge}</td>
      <td>${esc(d.code)}</td>
      <td style="text-align:center">${esc(d.size)}</td>
      <td style="font-family:monospace">${esc(d.barcode)}</td>
      <td style="font-family:monospace;color:var(--text-secondary)">${esc(d.existing) || '-'}</td>
    </tr>`
  }).join('')

  document.getElementById('bcConfirmBtn').disabled = matched === 0
}

function confirmBarcodeUpload() {
  const validData = _bcUploadData.filter(d => d.product && SIZES.includes(d.size))
  if (!validData.length) { showToast('매칭되는 상품이 없습니다.', 'warning'); return }

  let count = 0
  validData.forEach(d => {
    if (!d.product.barcodes) d.product.barcodes = Object.fromEntries(SIZES.map(sz => [sz, '']))
    d.product.barcodes[d.size] = d.barcode
    count++
  })

  showToast(`바코드 ${count}건 업로드 완료`, 'success')
  logActivity('upload', '재고관리', `바코드 업로드 — ${count}건`)
  closeBarcodeUploadModal(true)
  renderStockTable()
}
