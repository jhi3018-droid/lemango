// =============================================
// ===== 신규등록 모달 =====
// =============================================
function openRegisterModal() {
  const form = document.getElementById('registerForm')
  form.reset()
  // 오늘 날짜를 등록일 기본값으로
  document.getElementById('rRegistDate').value = new Date().toISOString().slice(0,10)
  const modal = document.getElementById('registerModal')
  modal.showModal()
  centerModal(modal)
  initPcodePanel()
}

function closeRegisterModal() {
  // 취소 시 적용했던 품번 예약 해제
  const code = document.getElementById('rProductCode')?.value
  if (code) _reservedCodes.delete(code)
  document.getElementById('registerModal').close()
}

function submitRegister(e) {
  e.preventDefault()

  const brand       = document.getElementById('rBrand').value
  const productCode = document.getElementById('rProductCode').value.trim()
  const sampleNo    = document.getElementById('rSampleNo').value.trim()
  const cafe24Code  = document.getElementById('rCafe24Code').value.trim()
  const barcode     = document.getElementById('rBarcode').value.trim()
  const nameKr      = document.getElementById('rNameKr').value.trim()
  const nameEn      = document.getElementById('rNameEn').value.trim()
  const colorKr     = document.getElementById('rColorKr').value.trim()
  const colorEn     = document.getElementById('rColorEn').value.trim()
  const salePrice   = parseInt(document.getElementById('rSalePrice').value) || 0
  const costPrice   = parseInt(document.getElementById('rCostPrice').value) || 0
  const type        = document.getElementById('rType').value
  const fabricType  = document.getElementById('rFabricType').value
  const backStyle     = document.getElementById('rBackStyle').value.trim()
  const legCut        = document.getElementById('rLegCut').value
  const guide         = document.getElementById('rGuide').value.trim()
  const chestLine     = document.getElementById('rChestLine').value
  const transparency  = document.getElementById('rTransparency').value
  const lining        = document.getElementById('rLining').value
  const capRing       = document.getElementById('rCapRing').value
  const bust          = document.getElementById('rBust').value.trim()
  const waist         = document.getElementById('rWaist').value.trim()
  const hip           = document.getElementById('rHip').value.trim()
  const modelSize     = document.getElementById('rModelSize').value.trim()
  const material      = document.getElementById('rMaterial').value.trim()
  const madeMonth   = document.getElementById('rMadeMonth').value.trim()
  const madeIn      = document.getElementById('rMadeIn').value.trim()
  const madeBy      = document.getElementById('rMadeBy').value.trim()
  const registDate  = document.getElementById('rRegistDate').value
  const comment     = document.getElementById('rComment').value.trim()
  const img1        = document.getElementById('rImg1').value.trim()
  const img2        = document.getElementById('rImg2').value.trim()

  // 품번 중복 체크
  if (State.allProducts.some(p => p.productCode === productCode)) {
    showToast(`품번 "${productCode}"이(가) 이미 존재합니다.`, 'error')
    document.getElementById('rProductCode').focus()
    return
  }

  const newProduct = {
    no: State.allProducts.length + 1,
    brand,
    productCode,
    sampleNo,
    cafe24Code,
    barcode,
    nameKr,
    nameEn,
    colorKr,
    colorEn,
    salePrice,
    costPrice,
    type,
    fabricType,
    backStyle,
    legCut,
    guide,
    chestLine,
    transparency,
    lining,
    capRing,
    bust,
    waist,
    hip,
    material,
    madeMonth,
    madeIn,
    madeBy,
    comment,
    images: {
      lemango: [img1, img2].filter(Boolean),
      noir: [],
      design: img1 || null,
      shoot:  img2 || null
    },
    modelSize,
    washMethod: '',
    barcodes: { XS: '', S: '', M: '', L: '', XL: '' },
    stockLog: [],
    scheduleLog: [],
    saleStatus: '판매중',
    productionStatus: '지속생산',
    productCodeLocked: false,
    stock: { XS: 0, S: 0, M: 0, L: 0, XL: 0 },
    sales: { 공홈: 0, GS: 0, '29cm': 0, W쇼핑: 0, 기타: 0 },
    registDate: registDate || new Date().toISOString().slice(0,10),
    logisticsDate: null
  }

  // 전체 데이터에 추가 (예약 해제 후 정식 등록)
  _reservedCodes.delete(newProduct.productCode)
  State.allProducts.push(newProduct)
  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  State.sales.filtered   = [...State.allProducts]

  // 화면 갱신
  renderProductTable()
  renderStockTable()
  renderSalesTable()
  renderDashboard()

  closeRegisterModal()
  showToast(`"${nameKr}" 상품이 등록되었습니다.`, 'success')

  // 상품조회 탭으로 이동 + 방금 등록한 품번으로 검색
  switchTab('product')
  document.getElementById('pKeyword').value = productCode
  document.getElementById('pSearchField').value = 'productCode'
  searchProduct()
}

// ESC 닫기
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('registerModal').open) {
    closeRegisterModal()
  }
})

// ===== 신규등록 엑셀 업로드 =====

// 필수 항목: 품번, 상품명(한글)
const REGISTER_REQUIRED = ['품번', '상품명(한글)']

let _uploadPreviewData = null

function handleRegisterUpload(input) {
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }

  const reader = new FileReader()
  reader.onload = e => {
    try {
      const wb  = XLSX.read(e.target.result, { type: 'array' })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // 2행 헤더 구조 → 3행부터 데이터
      const dataRows = raw.slice(2).filter(r => String(r[UPLOAD_COL.code] || '').trim() || String(r[UPLOAD_COL.nameKr] || '').trim())
      if (!dataRows.length) {
        showToast('데이터가 없습니다. 샘플 형식을 확인해주세요.', 'error')
        return
      }

      _uploadPreviewData = dataRows.map((row, idx) => {
        const code   = String(row[UPLOAD_COL.code]   || '').trim()
        const nameKr = String(row[UPLOAD_COL.nameKr] || '').trim()
        const errors = []
        let status = 'ok'

        if (!code)   { errors.push('품번 없음'); status = 'error' }
        if (!nameKr) { errors.push('상품명 없음'); status = 'error' }
        if (code && status !== 'error' && State.allProducts.some(p => p.productCode === code)) {
          status = 'warn'
        }

        const codePrefix = code.slice(0, 2).toUpperCase()
        const brand = ['NS','NW','NG'].includes(codePrefix) ? '르망고 느와' : '르망고'

        return {
          rowNum: idx + 3,
          status,
          errors,
          brand,
          code,
          nameKr,
          colorKr:   String(row[UPLOAD_COL.colorKr]   || '').trim(),
          salePrice: Number(row[UPLOAD_COL.salePrice]) || 0,
          type:      String(row[UPLOAD_COL.type]       || '').trim(),
          material:  String(row[UPLOAD_COL.material]   || '').trim(),
          madeIn:    String(row[UPLOAD_COL.madeIn]     || '').trim(),
          raw: row
        }
      })

      showRegisterPreview()
    } catch (err) {
      showToast('파일 읽기 오류: ' + err.message, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
}

function showRegisterPreview() {
  const data = _uploadPreviewData
  const okCnt   = data.filter(r => r.status === 'ok').length
  const warnCnt = data.filter(r => r.status === 'warn').length
  const errCnt  = data.filter(r => r.status === 'error').length

  document.getElementById('upmSummary').innerHTML =
    `전체 <b>${data.length}</b>건 &nbsp;|&nbsp;
     <span class="upm-cnt-ok">정상 ${okCnt}건</span> &nbsp;
     <span class="upm-cnt-warn">중복 ${warnCnt}건</span> &nbsp;
     <span class="upm-cnt-err">오류 ${errCnt}건</span>`

  document.getElementById('upmTbody').innerHTML = data.map(r => `
    <tr class="upm-row-${r.status}">
      <td>${r.rowNum}</td>
      <td class="upm-status-cell">
        ${r.status === 'ok'   ? '<span class="upm-badge ok">✅ 정상</span>' : ''}
        ${r.status === 'warn' ? '<span class="upm-badge warn">⚠️ 중복</span>' : ''}
        ${r.status === 'error' ? `<span class="upm-badge err">❌ ${r.errors.join(', ')}</span>` : ''}
      </td>
      <td class="${!r.code ? 'upm-cell-err' : ''}">${r.code || '—'}</td>
      <td>${r.brand}</td>
      <td class="${!r.nameKr ? 'upm-cell-err' : ''}">${r.nameKr || '—'}</td>
      <td>${r.colorKr || '—'}</td>
      <td>${r.salePrice ? r.salePrice.toLocaleString() + '원' : '—'}</td>
      <td>${r.type || '—'}</td>
      <td class="upm-cell-long">${r.material ? r.material.slice(0, 40) + (r.material.length > 40 ? '…' : '') : '—'}</td>
      <td>${r.madeIn || '—'}</td>
    </tr>
  `).join('')

  const registerCnt = okCnt + warnCnt
  const btn = document.getElementById('upmConfirmBtn')
  btn.textContent = `${registerCnt}건 등록하기`
  btn.disabled = registerCnt === 0

  document.getElementById('uploadPreviewModal').showModal()
}

function confirmRegisterUpload() {
  const data = _uploadPreviewData
  if (!data) return
  const targets = data.filter(r => r.status === 'ok' || r.status === 'warn')
  let added = 0, updated = 0

  targets.forEach(item => {
    const row = item.raw
    const sumUrls    = parseSumUrls(row[UPLOAD_COL.urlSum])
    const lemonUrls  = String(row[UPLOAD_COL.urlLemango]  || '').split(/[\n\r]+/).map(u => u.trim()).filter(u => u.startsWith('http'))
    const noirUrls   = String(row[UPLOAD_COL.urlNoir]     || '').split(/[\n\r]+/).map(u => u.trim()).filter(u => u.startsWith('http'))

    const product = {
      no:          State.allProducts.length + added + 1,
      brand:       item.brand,
      productCode: item.code,
      sampleNo:    '',
      cafe24Code:  '',
      barcode:     '',
      nameKr:      item.nameKr,
      nameEn:      String(row[UPLOAD_COL.nameEn]    || '').trim(),
      colorKr:     item.colorKr,
      colorEn:     String(row[UPLOAD_COL.colorEn]   || '').trim(),
      salePrice:   Number(row[UPLOAD_COL.salePrice]) || 0,
      costPrice:   Number(row[UPLOAD_COL.costPrice]) || 0,
      type:        item.type || 'onepiece',
      backStyle:   String(row[UPLOAD_COL.backStyle]  || '').trim(),
      legCut:      String(row[UPLOAD_COL.legCut]     || '').trim(),
      guide:       String(row[UPLOAD_COL.guide]      || '').trim(),
      fabricType:  String(row[UPLOAD_COL.fabricType] || '').trim(),
      material:    item.material,
      comment:     String(row[UPLOAD_COL.comment]    || '').trim(),
      washMethod:  String(row[UPLOAD_COL.washMethod] || '').trim(),
      sizeSpec:    String(row[UPLOAD_COL.sizeSpec]   || '').trim(),
      modelSize:   String(row[UPLOAD_COL.modelSize]  || '').trim(),
      madeMonth:   String(row[UPLOAD_COL.madeMonth]  || '').trim(),
      madeBy:      String(row[UPLOAD_COL.madeBy]     || '').trim(),
      madeIn:      item.madeIn,
      videoUrl:    String(row[UPLOAD_COL.videoUrl]   || '').trim(),
      chestLine:   '',
      transparency:'',
      lining:      '',
      capRing:     '',
      bust:        '',
      waist:       '',
      hip:         '',
      images:      { sum: sumUrls, lemango: lemonUrls, noir: noirUrls, external: [], design: null, shoot: null },
      stock:       { XS: 0, S: 0, M: 0, L: 0, XL: 0 },
      sales:       { 공홈: 0, GS: 0, '29cm': 0, W쇼핑: 0, 기타: 0 },
      registDate:  new Date().toISOString().slice(0, 10),
      logisticsDate: null
    }

    const idx = State.allProducts.findIndex(p => p.productCode === item.code)
    if (idx !== -1) {
      // 중복 → 기본정보·이미지 업데이트, 재고·판매 유지
      State.allProducts[idx] = { ...State.allProducts[idx], ...product,
        stock: State.allProducts[idx].stock,
        sales: State.allProducts[idx].sales }
      updated++
    } else {
      State.allProducts.push(product)
      added++
    }
  })

  State.product.filtered = [...State.allProducts]
  State.stock.filtered   = [...State.allProducts]
  State.sales.filtered   = [...State.allProducts]
  renderProductTable()
  renderStockTable()
  renderSalesTable()
  renderDashboard()

  document.getElementById('uploadPreviewModal').close()
  _uploadPreviewData = null
  showToast(`신규 ${added}건 등록, ${updated}건 업데이트 완료`, 'success')
}
