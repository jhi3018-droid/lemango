// =============================================
// ===== 엑셀 다운로드 =====
// =============================================
function downloadExcel(type) {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 라이브러리 로딩 중...', 'warning'); return }
  const data = State[type === 'product' ? 'product' : type === 'stock' ? 'stock' : type === 'plan' ? 'plan' : 'sales'].filtered
  let rows, headers, sheetName

  if (type === 'product' || type === 'plan') {
    headers = [
      'No.','브랜드','품번','샘플번호','카페24코드','바코드',
      '상품명(한글)','상품명(영문)','색상(한글)','색상(영문)',
      '판매가','원가',
      '타입','원단타입','백스타일','다리파임','가이드','가슴선','비침','안감','캡고리',
      '소재','원단설명','디자이너코멘트','세탁방법',
      '가슴(cm)','허리(cm)','엉덩이(cm)','모델착용사이즈',
      '제조년월','제조사','제조국',
      '영상URL',
      '이미지_르망고','이미지_느와','이미지_외부몰','이미지_SUM',
      '재고_XS','재고_S','재고_M','재고_L','재고_XL','재고_합계',
      ..._platforms.map(pl => '판매_' + pl), '판매_합계',
      '소진율(%)','등록일','물류완료일'
    ]
    rows = data.map(p => [
      p.no, p.brand, p.productCode, p.sampleNo||'', p.cafe24Code||'', p.barcode||'',
      p.nameKr||'', p.nameEn||'', p.colorKr||'', p.colorEn||'',
      p.salePrice||0, p.costPrice||0,
      p.type||'', p.fabricType||'', p.backStyle||'', p.legCut||'', p.guide||'', p.chestLine||'', p.transparency||'', p.lining||'', p.capRing||'',
      p.material||'', p.fabricType||'', p.comment||'', p.washMethod||'',
      p.bust||'', p.waist||'', p.hip||'', p.modelSize||'',
      p.madeMonth||'', p.madeBy||'', p.madeIn||'',
      p.videoUrl||'',
      (p.images?.lemango||[]).join('\n'),
      (p.images?.noir||[]).join('\n'),
      (p.images?.external||[]).join('\n'),
      (p.images?.sum||[]).join('\n'),
      p.stock?.XS||0, p.stock?.S||0, p.stock?.M||0, p.stock?.L||0, p.stock?.XL||0, getTotalStock(p),
      ..._platforms.map(pl => p.sales?.[pl]||0), getTotalSales(p),
      getExhaustion(p), p.registDate||'', p.logisticsDate||''
    ])
    sheetName = type === 'plan' ? '신규기획' : '상품전체'
  } else if (type === 'stock') {
    headers = ['품번','상품명','브랜드','판매가','XS','S','M','L','XL','합계']
    rows = data.map(p => [
      p.productCode, p.nameKr, p.brand, p.salePrice,
      p.stock?.XS||0, p.stock?.S||0, p.stock?.M||0, p.stock?.L||0, p.stock?.XL||0,
      getTotalStock(p)
    ])
    sheetName = '재고조회'
  } else {
    headers = ['품번','상품명','브랜드','판매가',..._platforms,'합계']
    rows = data.map(p => [
      p.productCode, p.nameKr, p.brand, p.salePrice,
      ..._platforms.map(pl => p.sales?.[pl]||0),
      getTotalSales(p)
    ])
    sheetName = '매출현황'
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  // 열 너비 자동 설정
  if (type === 'product') {
    ws['!cols'] = [
      {wch:5},{wch:12},{wch:16},{wch:12},{wch:10},
      {wch:20},{wch:20},{wch:8},{wch:8},
      {wch:8},{wch:8},
      {wch:10},{wch:8},{wch:16},{wch:10},{wch:8},{wch:8},
      {wch:30},{wch:10},{wch:40},{wch:16},
      {wch:30},{wch:14},
      {wch:12},{wch:16},{wch:10},
      {wch:35},
      {wch:50},{wch:50},{wch:50},{wch:60},
      {wch:6},{wch:6},{wch:6},{wch:6},{wch:6},{wch:8},
      {wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},
      {wch:8},{wch:10},{wch:10}
    ]
    // 줄바꿈 허용 (이미지 URL 셀)
    ws['!rows'] = rows.map(() => ({ hpt: 60 }))
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'')
  XLSX.writeFile(wb, `르망고_${sheetName}_${today}.xlsx`)
  showToast(`${sheetName} 다운로드 완료`, 'success')
}

// ===== 상품 업로드용 컬럼 인덱스 =====
// 헤더 2행 구조: 실제 데이터는 3행(index 2)부터
// col: no(0) 상품코드(1) 이미지(2) 상품명(3) 영문상품명(4)
//      색상한글(5) 색상영문(6) 원가(7) 판매가(8) 사이즈(9)
//      모델착용(10) 소재(11) 원단설명(12) 디자이너코멘트(13) 세탁방법(14)
//      type(15) backStyle(16) legCut(17) 가슴선(18) 가이드(19)
//      제조년월(20) 제조사(21) 제조국(22) 모델컷(23) 제품컷(24)
//      파일명(25) 르망고자사몰(26) 느와자사몰(27) 외부몰(28) SUM(29) 영상(30) 코디상품(31)
const UPLOAD_COL = {
  no: 0, code: 1, nameKr: 3, nameEn: 4,
  colorKr: 5, colorEn: 6, costPrice: 7, salePrice: 8,
  sizeSpec: 9, modelSize: 10, material: 11, fabricType: 12,
  comment: 13, washMethod: 14, type: 15, backStyle: 16,
  legCut: 17, guide: 19, madeMonth: 20, madeBy: 21, madeIn: 22,
  urlLemango: 26, urlNoir: 27, urlExternal: 28, urlSum: 29, videoUrl: 30
}

function parseSumUrls(cellValue) {
  if (!cellValue) return []
  const str = String(cellValue)
  // <img src="..."> 형식에서 URL 추출
  const imgMatches = [...str.matchAll(/src=["']([^"']+)["']/gi)].map(m => m[1].trim())
  if (imgMatches.length) return imgMatches.filter(u => u.startsWith('http'))
  // 줄바꿈 구분 일반 URL
  return str.split(/[\n\r]+/).map(u => u.trim()).filter(u => u.startsWith('http'))
}

// ===== 샘플 파일 (product만 실제 구조 적용) =====
function downloadSample(type) {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }

  let aoa, filename, sheetName

  if (type === 'product') {
    // 2행 헤더 구조 (원본 Sheet2와 동일)
    const row1 = ['no.','상품코드','이미지','상품명','영문상품명','색상','','금액','','사이즈(cm)','모델 착용사이즈','소재','원단설명','디자이너코멘트','세탁방법','type','back style','leg cut','가슴선','가이드','제조','','','촬영여부','','파일명','url','','','','','코디상품']
    const row2 = ['','','','','','한글','영문','원가','판매가','','','','','','','','','','','','제조년월','제조사','제조국','모델컷','제품컷','','르망고 자사몰','느와 자사몰','외부몰','SUM','영상','']
    const ex   = [
      1,'5SW029','','루나르 투피스','LUNAR Two-Piece','블랙','black','-',330000,
      's LENGTH-27.5 / BUST-30.5','s','Shell: P80% SP20%','포일',
      '플라워 모티프 아플리케와 금속장식 디테일','손세탁','bikini','','로우컷','보통','없음',
      '2025년 12월','주식회사 르망고','대한민국','o','x','5SW029',
      'https://lemango.cafe24.com/goods/noir/2025/5SW029/5SW029_01.jpg',
      'https://lemangonoir.cafe24.com/goods/2025/5SW029/5SW029_01.jpg',
      '',
      'https://lemango.cafe24.com/goods/noir/2025/5SW029_SUM/1000_1.jpg\nhttps://lemango.cafe24.com/goods/noir/2025/5SW029_SUM/1000_2.jpg',
      'https://youtube.com/shorts/example','없음'
    ]
    aoa = [row1, row2, ex]
    filename = '르망고_상품등록_샘플.xlsx'
    sheetName = '상품등록'
  } else if (type === 'stock') {
    aoa = [
      ['입고일','품번','사이즈','바코드','수량','메모'],
      ['2026-03-17','LSWON16266707','XS','8800354901570',10,''],
      ['2026-03-17','LSWON16266707','S', '8800354901587',15,''],
      ['2026-03-17','LSWON16266707','M', '8800354902027',20,''],
      ['2026-03-17','LSWON16266707','L', '8800354901594',15,''],
      ['2026-03-17','LSWON16266707','XL','8800354901600',5, '입고예시']
    ]
    filename = '르망고_재고_샘플.xlsx'
    sheetName = '재고'
  } else {
    aoa = [
      ['품번','상품명','날짜',..._platforms],
      ['LSWON16266707','코트다쥐르 쉘','2026-03-01',..._platforms.map((_,i) => i===0?10:i===1?5:i===2?8:i===3?3:2)]
    ]
    filename = '르망고_판매_샘플.xlsx'
    sheetName = '판매'
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // 열 너비 설정 (상품 샘플)
  if (type === 'product') {
    ws['!cols'] = [
      {wch:5},{wch:14},{wch:8},{wch:18},{wch:20},{wch:8},{wch:8},
      {wch:8},{wch:8},{wch:30},{wch:12},{wch:25},{wch:8},{wch:40},{wch:12},
      {wch:10},{wch:18},{wch:10},{wch:8},{wch:8},{wch:12},{wch:16},{wch:10},
      {wch:6},{wch:6},{wch:10},{wch:45},{wch:45},{wch:45},{wch:60},{wch:35},{wch:10}
    ]
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
  showToast('샘플 파일 다운로드 완료', 'success')
}

// ===== 업로드 처리 =====
function handleUpload(input, type) {
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  const reader = new FileReader()
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      if (type === 'product') {
        uploadProducts(raw)
      } else if (type === 'stock') {
        uploadStock(raw)
      } else {
        uploadSales(raw)
      }
    } catch (err) {
      showToast('파일 읽기 오류: ' + err.message, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
}

function uploadProducts(raw) {
  // 2행 헤더 → 데이터는 index 2부터
  const dataRows = raw.slice(2).filter(r => r[UPLOAD_COL.code])
  if (!dataRows.length) { showToast('데이터가 없습니다.', 'error'); return }

  let added = 0, updated = 0
  dataRows.forEach(row => {
    const code = String(row[UPLOAD_COL.code]).trim()
    if (!code) return

    const sumUrls  = parseSumUrls(row[UPLOAD_COL.urlSum])
    const lemUrls  = parseSumUrls(row[UPLOAD_COL.urlLemango])
    const noirUrls = parseSumUrls(row[UPLOAD_COL.urlNoir])
    const extUrls  = parseSumUrls(row[UPLOAD_COL.urlExternal])

    const product = {
      no:          State.allProducts.length + 1,
      brand:       '르망고 느와',
      productCode: code,
      cafe24Code:  code,
      barcode:     '',
      nameKr:      String(row[UPLOAD_COL.nameKr]  || ''),
      nameEn:      String(row[UPLOAD_COL.nameEn]  || ''),
      colorKr:     String(row[UPLOAD_COL.colorKr] || ''),
      colorEn:     String(row[UPLOAD_COL.colorEn] || ''),
      costPrice:   Number(row[UPLOAD_COL.costPrice])  || 0,
      salePrice:   Number(row[UPLOAD_COL.salePrice])  || 0,
      sizeSpec:    String(row[UPLOAD_COL.sizeSpec]    || ''),
      modelSize:   String(row[UPLOAD_COL.modelSize]   || ''),
      material:    String(row[UPLOAD_COL.material]    || ''),
      fabricType:  String(row[UPLOAD_COL.fabricType]  || ''),
      comment:     String(row[UPLOAD_COL.comment]     || ''),
      type:        String(row[UPLOAD_COL.type]        || ''),
      backStyle:   String(row[UPLOAD_COL.backStyle]   || ''),
      legCut:      String(row[UPLOAD_COL.legCut]      || ''),
      guide:       String(row[UPLOAD_COL.guide]       || ''),
      madeMonth:   String(row[UPLOAD_COL.madeMonth]   || ''),
      madeBy:      String(row[UPLOAD_COL.madeBy]      || ''),
      madeIn:      String(row[UPLOAD_COL.madeIn]      || ''),
      videoUrl:    String(row[UPLOAD_COL.videoUrl]    || '') || null,
      chestLine:   '',
      transparency:'',
      lining:      '',
      capRing:     '',
      bust:        '',
      waist:       '',
      hip:         '',
      images: {
        lemango:  lemUrls,
        noir:     noirUrls,
        external: extUrls,
        sum:      sumUrls   // ← 목록 이미지로 사용
      },
      stock: { XS: 0, S: 0, M: 0, L: 0, XL: 0 },
      sales: Object.fromEntries(_platforms.map(pl => [pl, 0])),
      registDate: new Date().toISOString().slice(0, 10),
      logisticsDate: null
    }

    const idx = State.allProducts.findIndex(p => p.productCode === code)
    if (idx >= 0) {
      // 기존 품번 → 이미지/기본정보 업데이트 (재고·판매는 유지)
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
  showToast(`업로드 완료: 신규 ${added}건 / 업데이트 ${updated}건`, 'success')
}

function uploadStock(raw) {
  // 헤더 1행, 데이터 index 1부터. 컬럼: 품번(0) 상품명(1) XS(2) S(3) M(4) L(5) XL(6)
  const dataRows = raw.slice(1).filter(r => r[0])
  let cnt = 0
  dataRows.forEach(row => {
    const code = String(row[0]).trim()
    const p = State.allProducts.find(p => p.productCode === code)
    if (!p) return
    p.stock = { XS: +row[2]||0, S: +row[3]||0, M: +row[4]||0, L: +row[5]||0, XL: +row[6]||0 }
    cnt++
  })
  State.stock.filtered = [...State.allProducts]
  renderStockTable()
  renderDashboard()
  showToast(`재고 업데이트: ${cnt}건`, 'success')
}

function uploadSales(raw) {
  // 헤더 1행. 컬럼: 품번(0) 상품명(1) 날짜(2) 공홈(3) GS(4) 29cm(5) W쇼핑(6) 기타(7)
  const dataRows = raw.slice(1).filter(r => r[0])
  let cnt = 0
  dataRows.forEach(row => {
    const code = String(row[0]).trim()
    const p = State.allProducts.find(p => p.productCode === code)
    if (!p) return
    _platforms.forEach((pl, i) => {
      p.sales[pl] = (p.sales[pl] || 0) + (+row[3 + i]||0)
    })
    cnt++
  })
  State.sales.filtered = [...State.allProducts]
  renderSalesTable()
  renderDashboard()
  showToast(`판매 업데이트: ${cnt}건`, 'success')
}
