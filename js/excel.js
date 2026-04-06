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

// ===== 상품 업로드용 컬럼 인덱스 (47컬럼 양식) =====
// 1행 헤더, 데이터는 2행(index 1)부터
// NO(0) 브랜드(1) 품번(2) 샘플번호(3) 카페24코드(4) 바코드(5)
// 상품명한글(6) 상품명영문(7) 색상한글(8) 색상영문(9) 판매가(10) 원가(11)
// 타입(12) 백스타일(13) 레그컷(14) 가이드(15) 원단타입(16) 가슴선(17) 비침(18) 안감(19) 캡고리(20)
// 소재(21) 디자이너코멘트(22) 세탁방법(23)
// 가슴cm(24) 허리cm(25) 엉덩이cm(26) 모델착용사이즈(27)
// 제조년월(28) 제조사(29) 제조국(30) 영상URL(31) 판매상태(32) 생산상태(33)
// 바코드XS(34) 바코드S(35) 바코드M(36) 바코드L(37) 바코드XL(38)
// 이미지합본(39) 이미지자사몰(40) 이미지느와(41) 이미지외부몰(42) 이미지디자인(43) 이미지촬영(44)
// 등록일(45) 최종입고일(46)
const UPLOAD_COL = {
  no: 0, brand: 1, code: 2, sampleNo: 3, cafe24Code: 4, barcode: 5,
  nameKr: 6, nameEn: 7, colorKr: 8, colorEn: 9, salePrice: 10, costPrice: 11,
  type: 12, backStyle: 13, legCut: 14, guide: 15, fabricType: 16,
  chestLine: 17, transparency: 18, lining: 19, capRing: 20,
  material: 21, comment: 22, washMethod: 23,
  bust: 24, waist: 25, hip: 26, modelSize: 27,
  madeMonth: 28, madeBy: 29, madeIn: 30, videoUrl: 31,
  saleStatus: 32, productionStatus: 33,
  barcodeXS: 34, barcodeS: 35, barcodeM: 36, barcodeL: 37, barcodeXL: 38,
  urlSum: 39, urlLemango: 40, urlNoir: 41, urlExternal: 42, urlDesign: 43, urlShoot: 44,
  registDate: 45, lastInDate: 46
}

// 레거시 2행 헤더 양식 감지 (이전 양식 호환)
const _LEGACY_COL = {
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

// ===== 샘플 파일 =====
function downloadSample(type) {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }

  if (type === 'product') {
    _downloadProductSample()
    return
  }

  let aoa, filename, sheetName
  if (type === 'stock') {
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
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
  showToast('샘플 파일 다운로드 완료', 'success')
}

// 47컬럼 상품등록 샘플 양식 다운로드
function _downloadProductSample() {
  const HEADER = [
    'NO','브랜드','품번','샘플번호','카페24코드','바코드',
    '상품명(한글)','상품명(영문)','색상(한글)','색상(영문)','판매가','원가',
    '타입','백스타일','레그컷','가이드','원단타입','가슴선','비침','안감','캡고리',
    '소재','디자이너코멘트','세탁방법',
    '가슴(cm)','허리(cm)','엉덩이(cm)','모델착용사이즈',
    '제조년월','제조사','제조국','영상URL','판매상태','생산상태',
    '바코드_XS','바코드_S','바코드_M','바코드_L','바코드_XL',
    '이미지_SUM','이미지_자사몰','이미지_느와','이미지_외부몰','이미지_디자인','이미지_촬영',
    '등록일','최종입고일'
  ]

  // 필수 컬럼 인덱스 (골드 배경 적용)
  const REQUIRED = [2, 6, 10, 12] // 품번, 상품명(한글), 판매가, 타입

  const SAMPLE_ROW = [
    1,'르망고','LSWON16266707','S-001','LC-001','8800354901570',
    '코트다쥐르 쉘','Cote d\'Azur Shell','블랙','Black',330000,120000,
    'onepiece','크로스백','Normal Cut','없음','포일','보통','없음','있음','없음',
    'Shell: P80% SP20%','플라워 모티프 디테일','손세탁',
    '30.5','27.5','33','S',
    '2025년 12월','주식회사 르망고','대한민국','https://youtube.com/shorts/example','판매중','지속생산',
    '8800354901570','8800354901587','8800354902027','8800354901594','8800354901600',
    'https://example.com/sum1.jpg\nhttps://example.com/sum2.jpg',
    'https://example.com/lemango1.jpg',
    'https://example.com/noir1.jpg',
    'https://example.com/ext1.jpg',
    'https://example.com/design1.jpg',
    'https://example.com/shoot1.jpg',
    '2026-01-15','2026-03-17'
  ]

  // Sheet1: 상품등록
  const ws = XLSX.utils.aoa_to_sheet([HEADER, SAMPLE_ROW])

  // 열 너비
  ws['!cols'] = [
    {wch:5},{wch:12},{wch:16},{wch:12},{wch:12},{wch:16},
    {wch:20},{wch:20},{wch:10},{wch:10},{wch:10},{wch:10},
    {wch:10},{wch:14},{wch:12},{wch:8},{wch:10},{wch:8},{wch:8},{wch:8},{wch:8},
    {wch:25},{wch:20},{wch:14},
    {wch:10},{wch:10},{wch:10},{wch:14},
    {wch:12},{wch:16},{wch:10},{wch:35},{wch:10},{wch:10},
    {wch:16},{wch:16},{wch:16},{wch:16},{wch:16},
    {wch:40},{wch:40},{wch:40},{wch:40},{wch:40},{wch:40},
    {wch:12},{wch:12}
  ]

  // 헤더 스타일 (네이비 배경 + 흰 글자, 필수 컬럼은 골드 배경)
  const navyFill = { fgColor: { rgb: '1A1A2E' } }
  const goldFill = { fgColor: { rgb: 'C9A96E' } }
  const whiteFont = { color: { rgb: 'FFFFFF' }, bold: true, sz: 11 }
  const darkFont = { color: { rgb: '1A1A2E' }, bold: true, sz: 11 }
  const headerBorder = {
    top: { style: 'thin', color: { rgb: '444444' } },
    bottom: { style: 'thin', color: { rgb: '444444' } },
    left: { style: 'thin', color: { rgb: '444444' } },
    right: { style: 'thin', color: { rgb: '444444' } }
  }

  for (let c = 0; c < HEADER.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) continue
    const isRequired = REQUIRED.includes(c)
    ws[addr].s = {
      fill: isRequired ? goldFill : navyFill,
      font: isRequired ? darkFont : whiteFont,
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: headerBorder
    }
  }

  // Sheet2: 입력 가이드
  const guideData = [
    ['컬럼명', '설명', '필수', '입력 예시'],
    ['NO', '자동 부여 (입력 불필요)', '', '1'],
    ['브랜드', '르망고 / 르망고 느와', '', '르망고'],
    ['품번', '상품 고유 코드 (13자리 권장)', '★', 'LSWON16266707'],
    ['샘플번호', '샘플 관리 번호', '', 'S-001'],
    ['카페24코드', '카페24 연동 코드', '', 'LC-001'],
    ['바코드', '상품 대표 바코드', '', '8800354901570'],
    ['상품명(한글)', '한글 상품명', '★', '코트다쥐르 쉘'],
    ['상품명(영문)', '영문 상품명', '', 'Cote d\'Azur Shell'],
    ['색상(한글)', '한글 색상명', '', '블랙'],
    ['색상(영문)', '영문 색상명', '', 'Black'],
    ['판매가', '소비자 판매가격', '★', '330000'],
    ['원가', '상품 원가', '', '120000'],
    ['타입', 'onepiece / bikini / two piece', '★', 'onepiece'],
    ['백스타일', '등 디자인 스타일', '', '크로스백'],
    ['레그컷', 'Low Cut / Normal Cut / Middle Cut / High Cut', '', 'Normal Cut'],
    ['가이드', '가이드 유무', '', '없음'],
    ['원단타입', '원단 종류', '', '포일'],
    ['가슴선', '낮음 / 보통 / 높음', '', '보통'],
    ['비침', '없음 / 약간있음', '', '없음'],
    ['안감', '없음 / 있음', '', '있음'],
    ['캡고리', '없음 / 있음', '', '없음'],
    ['소재', '소재 구성', '', 'Shell: P80% SP20%'],
    ['디자이너코멘트', '디자이너 메모', '', '플라워 모티프 디테일'],
    ['세탁방법', '세탁 안내', '', '손세탁'],
    ['가슴(cm)', '가슴 사이즈 (cm)', '', '30.5'],
    ['허리(cm)', '허리 사이즈 (cm)', '', '27.5'],
    ['엉덩이(cm)', '엉덩이 사이즈 (cm)', '', '33'],
    ['모델착용사이즈', '모델 착용 사이즈', '', 'S'],
    ['제조년월', '제조 년월', '', '2025년 12월'],
    ['제조사', '제조사명', '', '주식회사 르망고'],
    ['제조국', '제조국가', '', '대한민국'],
    ['영상URL', '영상 링크 (YouTube 등)', '', 'https://youtube.com/shorts/example'],
    ['판매상태', '판매중 / 종료 / 추가생산', '', '판매중'],
    ['생산상태', '지속생산 / 단종 / 시즌한정 / 샘플', '', '지속생산'],
    ['바코드_XS~XL', '사이즈별 바코드 (5컬럼)', '', '8800354901570'],
    ['이미지_SUM', '합본 이미지 URL (줄바꿸 구분, 복수 가능)', '', 'https://...jpg'],
    ['이미지_자사몰', '자사몰 이미지 URL (줄바꿈 구분)', '', 'https://...jpg'],
    ['이미지_느와', '느와 자사몰 이미지 URL', '', 'https://...jpg'],
    ['이미지_외부몰', '외부몰 이미지 URL', '', 'https://...jpg'],
    ['이미지_디자인', '디자인 이미지 URL', '', 'https://...jpg'],
    ['이미지_촬영', '촬영 이미지 URL', '', 'https://...jpg'],
    ['등록일', '상품 등록일 (YYYY-MM-DD)', '', '2026-01-15'],
    ['최종입고일', '최종 입고일 (자동 계산, 입력 시 참고용)', '', '2026-03-17'],
  ]
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData)
  wsGuide['!cols'] = [{wch:18},{wch:45},{wch:6},{wch:30}]

  // 가이드 헤더 스타일
  for (let c = 0; c < 4; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!wsGuide[addr]) continue
    wsGuide[addr].s = {
      fill: navyFill, font: whiteFont,
      alignment: { horizontal: 'center', vertical: 'center' },
      border: headerBorder
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '상품등록')
  XLSX.utils.book_append_sheet(wb, wsGuide, '입력 가이드')
  XLSX.writeFile(wb, '르망고_상품등록_샘플양식.xlsx', { bookSST: false, cellStyles: true })
  showToast('샘플 양식 다운로드 완료', 'success')
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
  // 양식 자동 감지: 1행 헤더에 '품번'이 인덱스 2 → 신규 47컬럼, 인덱스 1 → 레거시
  const header0 = String(raw[0]?.[2] || '').trim()
  const isNew = (header0 === '품번')
  const COL = isNew ? UPLOAD_COL : _LEGACY_COL
  const dataStart = isNew ? 1 : 2  // 신규: 1행 헤더 → 데이터 row 1, 레거시: 2행 헤더 → row 2

  const dataRows = raw.slice(dataStart).filter(r => r[COL.code])
  if (!dataRows.length) { showToast('데이터가 없습니다.', 'error'); return }

  let added = 0, updated = 0
  dataRows.forEach(row => {
    const code = String(row[COL.code]).trim()
    if (!code) return

    const _s = (key) => String(row[COL[key]] ?? '').trim()
    const _n = (key) => Number(row[COL[key]]) || 0

    const sumUrls  = parseSumUrls(row[COL.urlSum])
    const lemUrls  = parseSumUrls(row[COL.urlLemango])
    const noirUrls = parseSumUrls(row[COL.urlNoir])
    const extUrls  = parseSumUrls(row[COL.urlExternal])
    const designUrls = isNew ? parseSumUrls(row[COL.urlDesign]) : []
    const shootUrls  = isNew ? parseSumUrls(row[COL.urlShoot])  : []

    const product = {
      no:            State.allProducts.length + 1,
      brand:         isNew ? (_s('brand') || '르망고') : '르망고 느와',
      productCode:   code,
      sampleNo:      isNew ? _s('sampleNo') : '',
      cafe24Code:    isNew ? _s('cafe24Code') : code,
      barcode:       isNew ? _s('barcode') : '',
      nameKr:        _s('nameKr'),
      nameEn:        _s('nameEn'),
      colorKr:       _s('colorKr'),
      colorEn:       _s('colorEn'),
      salePrice:     _n('salePrice'),
      costPrice:     _n('costPrice'),
      type:          _s('type'),
      backStyle:     _s('backStyle'),
      legCut:        _s('legCut'),
      guide:         _s('guide'),
      fabricType:    _s('fabricType'),
      material:      _s('material'),
      comment:       _s('comment'),
      washMethod:    _s('washMethod'),
      chestLine:     isNew ? _s('chestLine')    : '',
      transparency:  isNew ? _s('transparency') : '',
      lining:        isNew ? _s('lining')       : '',
      capRing:       isNew ? _s('capRing')      : '',
      bust:          isNew ? _s('bust')         : '',
      waist:         isNew ? _s('waist')        : '',
      hip:           isNew ? _s('hip')          : '',
      modelSize:     _s('modelSize'),
      madeMonth:     _s('madeMonth'),
      madeBy:        _s('madeBy'),
      madeIn:        _s('madeIn'),
      videoUrl:      _s('videoUrl') || null,
      saleStatus:    isNew ? (_s('saleStatus') || '판매중') : '판매중',
      productionStatus: isNew ? _s('productionStatus') : '',
      barcodes:      isNew ? {
        XS: String(row[COL.barcodeXS] ?? '').trim(),
        S:  String(row[COL.barcodeS]  ?? '').trim(),
        M:  String(row[COL.barcodeM]  ?? '').trim(),
        L:  String(row[COL.barcodeL]  ?? '').trim(),
        XL: String(row[COL.barcodeXL] ?? '').trim()
      } : { XS:'', S:'', M:'', L:'', XL:'' },
      images: {
        sum:      sumUrls,
        lemango:  lemUrls,
        noir:     noirUrls,
        external: extUrls,
        design:   designUrls,
        shoot:    shootUrls
      },
      stock: { XS: 0, S: 0, M: 0, L: 0, XL: 0 },
      stockLog: [],
      sales: Object.fromEntries(_platforms.map(pl => [pl, 0])),
      revenueLog: [],
      registDate:    isNew ? (_s('registDate') || new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10),
      logisticsDate: null
    }

    const idx = State.allProducts.findIndex(p => p.productCode === code)
    if (idx >= 0) {
      // 기존 품번 → 기본정보/이미지 업데이트, 재고·판매·이력 유지
      const existing = State.allProducts[idx]
      State.allProducts[idx] = { ...existing, ...product,
        no:         existing.no,
        stock:      existing.stock,
        stockLog:   existing.stockLog,
        sales:      existing.sales,
        revenueLog: existing.revenueLog,
        scheduleLog: existing.scheduleLog,
        productCodeLocked: existing.productCodeLocked
      }
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
