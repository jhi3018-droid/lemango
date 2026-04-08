// =============================================
// ===== 샘플 데이터 주입 =====
// =============================================
function injectSampleData() {
  // ─── 1. 신규기획 15개 ───
  const planSamples = [
    { no:2, sampleNo:'26SS0301', productCode:'', brand:'르망고', nameKr:'오션브리즈', nameEn:'Ocean Breeze', colorKr:'네이비', colorEn:'Navy', salePrice:89000, costPrice:32000, type:'onepiece', year:'2026', season:'1', gender:'W', memo:'깔끔한 라인의 원피스. 네이비 단색 포일.', confirmed:false, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-03-01',end:'2026-03-15'},production:{start:'2026-03-16',end:'2026-04-20'},image:{start:'2026-04-21',end:'2026-04-30'},register:{start:'2026-05-01',end:'2026-05-05'},logistics:{start:'2026-05-06',end:'2026-05-15'}} },
    { no:3, sampleNo:'26SS0302', productCode:'', brand:'르망고 느와', nameKr:'코랄리프', nameEn:'Coral Reef', colorKr:'코랄', colorEn:'Coral', salePrice:129000, costPrice:45000, type:'bikini', year:'2026', season:'1', gender:'W', memo:'산호초 패턴 비키니. 여름 메인 아이템.', confirmed:false, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-03-05',end:'2026-03-20'},production:{start:'2026-03-21',end:'2026-04-25'},image:{start:'2026-04-26',end:'2026-05-05'},register:{start:'2026-05-06',end:'2026-05-10'},logistics:{start:'2026-05-11',end:'2026-05-20'}} },
    { no:4, sampleNo:'26SS0303', productCode:'', brand:'르망고', nameKr:'선셋글로우', nameEn:'Sunset Glow', colorKr:'오렌지', colorEn:'Orange', salePrice:98000, costPrice:35000, type:'onepiece', year:'2026', season:'1', gender:'W', memo:'일몰 그라데이션 원피스. 포일 원단.', confirmed:true, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-02-10',end:'2026-02-25'},production:{start:'2026-02-26',end:'2026-03-30'},image:{start:'2026-03-31',end:'2026-04-10'},register:{start:'2026-04-11',end:'2026-04-15'},logistics:{start:'2026-04-16',end:'2026-04-25'}} },
    { no:5, sampleNo:'26SS0304', productCode:'', brand:'르망고', nameKr:'아쿠아블룸', nameEn:'Aqua Bloom', colorKr:'민트', colorEn:'Mint', salePrice:79000, costPrice:28000, type:'two piece', year:'2026', season:'1', gender:'W', memo:'민트 꽃무늬 투피스. 가볍고 시원한 느낌.', confirmed:false, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-03-10',end:'2026-03-25'},production:{start:'2026-03-26',end:'2026-04-30'},image:{start:'2026-05-01',end:'2026-05-10'},register:{start:'2026-05-11',end:'2026-05-15'},logistics:{start:'2026-05-16',end:'2026-05-25'}} },
    { no:6, sampleNo:'26SS0305', productCode:'', brand:'르망고 느와', nameKr:'미드나잇펄', nameEn:'Midnight Pearl', colorKr:'블랙', colorEn:'Black', salePrice:119000, costPrice:42000, type:'onepiece', year:'2026', season:'1', gender:'W', memo:'블랙 펄 원피스. 느와 시그니처.', confirmed:true, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-02-15',end:'2026-03-01'},production:{start:'2026-03-02',end:'2026-04-05'},image:{start:'2026-04-06',end:'2026-04-15'},register:{start:'2026-04-16',end:'2026-04-20'},logistics:{start:'2026-04-21',end:'2026-04-30'}} },
    { no:7, sampleNo:'26FW0301', productCode:'', brand:'르망고', nameKr:'윈터웨이브', nameEn:'Winter Wave', colorKr:'그레이', colorEn:'Gray', salePrice:109000, costPrice:38000, type:'onepiece', year:'2026', season:'2', gender:'W', memo:'FW시즌 래쉬가드 겸용 원피스.', confirmed:false, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-05-01',end:'2026-05-20'},production:{start:'2026-05-21',end:'2026-06-25'},image:{start:'2026-06-26',end:'2026-07-05'},register:{start:'2026-07-06',end:'2026-07-10'},logistics:{start:'2026-07-11',end:'2026-07-20'}} },
    { no:8, sampleNo:'26FW0302', productCode:'', brand:'르망고', nameKr:'벨벳타이드', nameEn:'Velvet Tide', colorKr:'버건디', colorEn:'Burgundy', salePrice:99000, costPrice:36000, type:'bikini', year:'2026', season:'2', gender:'W', memo:'벨벳 느낌 비키니. FW 시즌 신규 소재.', confirmed:false, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-05-10',end:'2026-05-30'},production:{start:'2026-06-01',end:'2026-07-05'},image:{start:'2026-07-06',end:'2026-07-15'},register:{start:'2026-07-16',end:'2026-07-20'},logistics:{start:'2026-07-21',end:'2026-07-30'}} },
    { no:9, sampleNo:'26SS0306', productCode:'', brand:'르망고 느와', nameKr:'실버미스트', nameEn:'Silver Mist', colorKr:'실버', colorEn:'Silver', salePrice:125000, costPrice:44000, type:'onepiece', year:'2026', season:'1', gender:'W', memo:'실버 메탈릭 원피스. 파티 착용 가능.', confirmed:true, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-02-20',end:'2026-03-05'},production:{start:'2026-03-06',end:'2026-04-10'},image:{start:'2026-04-11',end:'2026-04-20'},register:{start:'2026-04-21',end:'2026-04-25'},logistics:{start:'2026-04-26',end:'2026-05-05'}} },
    { no:10, sampleNo:'26SS0307', productCode:'', brand:'르망고', nameKr:'트로피칼선', nameEn:'Tropical Sun', colorKr:'옐로우', colorEn:'Yellow', salePrice:85000, costPrice:30000, type:'two piece', year:'2026', season:'1', gender:'W', memo:'열대 느낌 투피스. 밝은 옐로우.', confirmed:false, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-03-15',end:'2026-04-01'},production:{start:'2026-04-02',end:'2026-05-05'},image:{start:'2026-05-06',end:'2026-05-15'},register:{start:'2026-05-16',end:'2026-05-20'},logistics:{start:'2026-05-21',end:'2026-05-30'}} },
    { no:11, sampleNo:'26SS0308', productCode:'', brand:'르망고', nameKr:'라벤더드림', nameEn:'Lavender Dream', colorKr:'라벤더', colorEn:'Lavender', salePrice:92000, costPrice:33000, type:'onepiece', year:'2026', season:'1', gender:'W', memo:'라벤더 톤 원피스. 로맨틱 무드.', confirmed:false, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-03-20',end:'2026-04-05'},production:{start:'2026-04-06',end:'2026-05-10'},image:{start:'2026-05-11',end:'2026-05-20'},register:{start:'2026-05-21',end:'2026-05-25'},logistics:{start:'2026-05-26',end:'2026-06-05'}} },
    { no:12, sampleNo:'26SS0309', productCode:'', brand:'르망고 느와', nameKr:'누아르엘레강스', nameEn:'Noir Elegance', colorKr:'화이트', colorEn:'White', salePrice:115000, costPrice:40000, type:'bikini', year:'2026', season:'1', gender:'W', memo:'화이트 레이스 비키니. 느와 컬렉션.', confirmed:false, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-04-01',end:'2026-04-15'},production:{start:'2026-04-16',end:'2026-05-20'},image:{start:'2026-05-21',end:'2026-05-30'},register:{start:'2026-06-01',end:'2026-06-05'},logistics:{start:'2026-06-06',end:'2026-06-15'}} },
    { no:13, sampleNo:'26FW0303', productCode:'', brand:'르망고', nameKr:'스노우크리스탈', nameEn:'Snow Crystal', colorKr:'화이트', colorEn:'White', salePrice:105000, costPrice:37000, type:'onepiece', year:'2026', season:'2', gender:'W', memo:'FW 화이트 결정 패턴 원피스.', confirmed:false, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-05-15',end:'2026-06-01'},production:{start:'2026-06-02',end:'2026-07-05'},image:{start:'2026-07-06',end:'2026-07-15'},register:{start:'2026-07-16',end:'2026-07-20'},logistics:{start:'2026-07-21',end:'2026-08-01'}} },
    { no:14, sampleNo:'26SS0310', productCode:'', brand:'르망고', nameKr:'마린스트라이프', nameEn:'Marine Stripe', colorKr:'네이비/화이트', colorEn:'Navy/White', salePrice:75000, costPrice:27000, type:'two piece', year:'2026', season:'1', gender:'W', memo:'클래식 스트라이프 투피스.', confirmed:true, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-02-05',end:'2026-02-20'},production:{start:'2026-02-21',end:'2026-03-25'},image:{start:'2026-03-26',end:'2026-04-05'},register:{start:'2026-04-06',end:'2026-04-10'},logistics:{start:'2026-04-11',end:'2026-04-20'}} },
    { no:15, sampleNo:'26SS0311', productCode:'', brand:'르망고', nameKr:'피치소르벳', nameEn:'Peach Sorbet', colorKr:'피치', colorEn:'Peach', salePrice:88000, costPrice:31000, type:'bikini', year:'2026', season:'1', gender:'W', memo:'피치 톤 비키니. 여름 베이직.', confirmed:false, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-04-05',end:'2026-04-20'},production:{start:'2026-04-21',end:'2026-05-25'},image:{start:'2026-05-26',end:'2026-06-05'},register:{start:'2026-06-06',end:'2026-06-10'},logistics:{start:'2026-06-11',end:'2026-06-20'}} },
    { no:16, sampleNo:'26FW0304', productCode:'', brand:'르망고 느와', nameKr:'오닉스나이트', nameEn:'Onyx Night', colorKr:'블랙', colorEn:'Black', salePrice:135000, costPrice:48000, type:'onepiece', year:'2026', season:'2', gender:'W', memo:'FW 블랙 프리미엄 원피스. 느와 시그니처.', confirmed:false, images:{sum:[],lemango:'',noir:''}, schedule:{design:{start:'2026-06-01',end:'2026-06-20'},production:{start:'2026-06-21',end:'2026-07-25'},image:{start:'2026-07-26',end:'2026-08-05'},register:{start:'2026-08-06',end:'2026-08-10'},logistics:{start:'2026-08-11',end:'2026-08-20'}} },
  ]
  planSamples.forEach(p => State.planItems.push(p))

  // ─── 2. 재고 + 3. 판매 데이터 (기존 상품 15개에 주입) ───
  // 르망고 1~10번, 느와 1~5번 = 15개
  const stockSalesData = [
    // [productCode, stock{XS,S,M,L,XL}, stockLog[], sales{공홈,GS,29cm,W쇼핑,기타}]
    ['LSWON16266707', {XS:5,S:15,M:25,L:20,XL:8}, [{type:'in',date:'2026-01-10',XS:5,S:15,M:25,L:20,XL:8,memo:'초도입고',registeredAt:'2026-01-10T09:00:00'}], {공홈:12,GS:8,['29cm']:5,W쇼핑:3,기타:2}],
    ['LSWON15986708', {XS:3,S:12,M:20,L:18,XL:5}, [{type:'in',date:'2026-01-15',XS:3,S:12,M:20,L:18,XL:5,memo:'초도입고',registeredAt:'2026-01-15T09:00:00'}], {공홈:8,GS:5,['29cm']:3,W쇼핑:2,기타:1}],
    ['LSWON16156709', {XS:2,S:10,M:22,L:22,XL:6}, [{type:'in',date:'2026-01-20',XS:0,S:5,M:12,L:12,XL:3,memo:'초도입고',registeredAt:'2026-01-20T09:00:00'},{type:'in',date:'2026-02-15',XS:2,S:5,M:10,L:10,XL:3,memo:'추가입고',registeredAt:'2026-02-15T10:00:00'}], {공홈:15,GS:10,['29cm']:7,W쇼핑:4,기타:1}],
    ['LSWON16156710', {XS:4,S:14,M:18,L:16,XL:7}, [{type:'in',date:'2026-01-22',XS:4,S:14,M:18,L:16,XL:7,memo:'초도입고',registeredAt:'2026-01-22T09:00:00'}], {공홈:10,GS:6,['29cm']:4,W쇼핑:2,기타:0}],
    ['LSWON16106711', {XS:6,S:18,M:30,L:25,XL:10}, [{type:'in',date:'2026-01-25',XS:3,S:10,M:18,L:15,XL:5,memo:'초도입고',registeredAt:'2026-01-25T09:00:00'},{type:'in',date:'2026-02-20',XS:3,S:8,M:12,L:10,XL:5,memo:'리오더 입고',registeredAt:'2026-02-20T14:00:00'}], {공홈:20,GS:15,['29cm']:10,W쇼핑:8,기타:3}],
    ['LSWON16286712', {XS:1,S:8,M:15,L:12,XL:4}, [{type:'in',date:'2026-02-01',XS:1,S:8,M:15,L:12,XL:4,memo:'초도입고',registeredAt:'2026-02-01T09:00:00'}], {공홈:6,GS:4,['29cm']:2,W쇼핑:1,기타:0}],
    ['LSWON16096713', {XS:3,S:11,M:20,L:17,XL:6}, [{type:'in',date:'2026-02-05',XS:3,S:11,M:20,L:17,XL:6,memo:'초도입고',registeredAt:'2026-02-05T09:00:00'}], {공홈:9,GS:7,['29cm']:5,W쇼핑:3,기타:1}],
    ['LSWON16166714', {XS:2,S:9,M:16,L:14,XL:5}, [{type:'in',date:'2026-02-10',XS:2,S:9,M:16,L:14,XL:5,memo:'초도입고',registeredAt:'2026-02-10T09:00:00'},{type:'in',date:'2026-03-05',XS:0,S:3,M:5,L:4,XL:0,memo:'추가입고',registeredAt:'2026-03-05T11:00:00'}], {공홈:14,GS:8,['29cm']:6,W쇼핑:4,기타:2}],
    ['LSWON15986715', {XS:0,S:7,M:14,L:11,XL:3}, [{type:'in',date:'2026-02-12',XS:0,S:7,M:14,L:11,XL:3,memo:'초도입고',registeredAt:'2026-02-12T09:00:00'}], {공홈:5,GS:3,['29cm']:2,W쇼핑:1,기타:0}],
    ['LSWON16286716', {XS:4,S:13,M:24,L:20,XL:9}, [{type:'in',date:'2026-02-18',XS:2,S:7,M:14,L:12,XL:5,memo:'초도입고',registeredAt:'2026-02-18T09:00:00'},{type:'in',date:'2026-03-10',XS:2,S:6,M:10,L:8,XL:4,memo:'리오더 입고',registeredAt:'2026-03-10T13:00:00'}], {공홈:18,GS:12,['29cm']:8,W쇼핑:5,기타:2}],
    // 느와 5개
    ['5SW029', {XS:1,S:6,M:12,L:10,XL:3}, [{type:'in',date:'2026-01-18',XS:1,S:6,M:12,L:10,XL:3,memo:'초도입고',registeredAt:'2026-01-18T09:00:00'}], {공홈:7,GS:4,['29cm']:3,W쇼핑:2,기타:1}],
    ['5SW030', {XS:2,S:8,M:15,L:13,XL:4}, [{type:'in',date:'2026-01-20',XS:2,S:8,M:15,L:13,XL:4,memo:'초도입고',registeredAt:'2026-01-20T09:00:00'},{type:'in',date:'2026-03-01',XS:0,S:2,M:5,L:3,XL:0,memo:'추가입고',registeredAt:'2026-03-01T10:00:00'}], {공홈:11,GS:6,['29cm']:4,W쇼핑:3,기타:1}],
    ['5SW019', {XS:0,S:5,M:10,L:8,XL:2}, [{type:'in',date:'2026-02-01',XS:0,S:5,M:10,L:8,XL:2,memo:'초도입고',registeredAt:'2026-02-01T09:00:00'}], {공홈:4,GS:2,['29cm']:1,W쇼핑:0,기타:0}],
    ['5SW020', {XS:3,S:10,M:18,L:15,XL:5}, [{type:'in',date:'2026-02-08',XS:3,S:10,M:18,L:15,XL:5,memo:'초도입고',registeredAt:'2026-02-08T09:00:00'}], {공홈:13,GS:8,['29cm']:5,W쇼핑:4,기타:2}],
    ['5SW021', {XS:2,S:7,M:13,L:11,XL:4}, [{type:'in',date:'2026-02-15',XS:2,S:7,M:13,L:11,XL:4,memo:'초도입고',registeredAt:'2026-02-15T09:00:00'}], {공홈:6,GS:3,['29cm']:2,W쇼핑:1,기타:0}],
  ]
  stockSalesData.forEach(([code, stock, logs, sales]) => {
    const p = State.allProducts.find(x => x.productCode === code)
    if (!p) return
    p.stock = stock
    p.stockLog = logs
    p.sales = { ...p.sales, ...sales }
  })

  // ─── 4. 행사일정 15개 ───
  const eventSamples = [
    {no:1, name:'26SS 여름 특가전', channel:'공홈', startDate:'2026-03-15', endDate:'2026-03-28', discount:30, support:15, memo:'시즌 오픈 기념 전 품목 할인'},
    {no:2, name:'신상 런칭 프로모션', channel:'GS', startDate:'2026-04-01', endDate:'2026-04-07', discount:20, support:10, memo:'GS 신상품 런칭 기획전'},
    {no:3, name:'회원 감사 세일', channel:'공홈', startDate:'2026-04-10', endDate:'2026-04-20', discount:25, support:12, memo:'자사몰 VIP 회원 대상'},
    {no:4, name:'시즌오프 클리어런스', channel:'29cm', startDate:'2026-05-20', endDate:'2026-06-02', discount:50, support:25, memo:'25FW 재고 소진 목적'},
    {no:5, name:'브랜드위크', channel:'W쇼핑', startDate:'2026-05-01', endDate:'2026-05-07', discount:15, support:8, memo:'W쇼핑 브랜드위크 참여'},
    {no:6, name:'타임딜 이벤트', channel:'공홈', startDate:'2026-03-20', endDate:'2026-03-22', discount:40, support:20, memo:'48시간 한정 타임딜'},
    {no:7, name:'여름맞이 기획전', channel:'GS', startDate:'2026-05-15', endDate:'2026-05-28', discount:25, support:10, memo:'GS 여름 수영복 기획전'},
    {no:8, name:'얼리버드 세일', channel:'29cm', startDate:'2026-03-01', endDate:'2026-03-10', discount:15, support:5, memo:'시즌 얼리버드 선구매 혜택'},
    {no:9, name:'느와 런칭전', channel:'공홈', startDate:'2026-04-25', endDate:'2026-05-05', discount:10, support:5, memo:'르망고 느와 신규 컬렉션 런칭'},
    {no:10, name:'어린이날 이벤트', channel:'기타', startDate:'2026-05-03', endDate:'2026-05-06', discount:20, support:10, memo:'키즈 라인 프로모션 (팝업)'},
    {no:11, name:'무료배송 이벤트', channel:'공홈', startDate:'2026-06-01', endDate:'2026-06-14', discount:0, support:0, memo:'5만원 이상 전 품목 무료배송'},
    {no:12, name:'여름 빅세일', channel:'GS', startDate:'2026-06-15', endDate:'2026-06-28', discount:35, support:15, memo:'GS 여름 대규모 할인전'},
    {no:13, name:'플래시세일', channel:'29cm', startDate:'2026-06-05', endDate:'2026-06-07', discount:45, support:20, memo:'29cm 48시간 한정 세일'},
    {no:14, name:'7월 썸머 페스타', channel:'W쇼핑', startDate:'2026-07-01', endDate:'2026-07-14', discount:30, support:15, memo:'W쇼핑 썸머 페스타 참여'},
    {no:15, name:'시즌엔드 세일', channel:'공홈', startDate:'2026-08-15', endDate:'2026-08-31', discount:50, support:30, memo:'SS시즌 마무리 대규모 할인'},
    // ===== TEST DATA (for verification — remove later) =====
    {no:901, name:'공홈 회원 감사 세일', channel:'공홈', startDate:'2026-04-10', endDate:'2026-04-20', discount:30, support:15, memo:'테스트 행사', createdByName:'조현일', createdByPosition:'과장'},
    {no:902, name:'GS 산산 현장 프로모션', channel:'GS', startDate:'2026-04-07', endDate:'2026-04-09', discount:20, support:10, memo:'테스트 행사2', createdByName:'김민수', createdByPosition:'대리'},
  ]
  // 기존 이벤트 유지하면서 추가 (no 중복 방지)
  const existingMaxNo = _events.reduce((mx, e) => Math.max(mx, e.no || 0), 0)
  eventSamples.forEach((ev, i) => {
    if (!_events.find(e => e.name === ev.name && e.startDate === ev.startDate)) {
      _events.push({ ...ev, no: existingMaxNo + i + 1 })
    }
  })
  saveEvents()

  // ─── 5. 업무일정 15개 ───
  const workSamples = [
    {category:'연차', title:'하계휴가', startDate:'2026-04-13', endDate:'2026-04-17', memo:'가족여행 (제주도)'},
    {category:'연차', title:'개인연차', startDate:'2026-03-25', endDate:'2026-03-25', memo:'개인 사유'},
    {category:'연차', title:'반차(오전)', startDate:'2026-04-02', endDate:'2026-04-02', memo:'병원 방문'},
    {category:'연차', title:'병가', startDate:'2026-05-08', endDate:'2026-05-09', memo:'감기 몸살'},
    {category:'차량사용', title:'거래처 방문(성수)', startDate:'2026-03-30', endDate:'2026-03-30', memo:'원단 샘플 수령'},
    {category:'차량사용', title:'물류센터 출장', startDate:'2026-04-07', endDate:'2026-04-07', memo:'입고 검수 확인'},
    {category:'차량사용', title:'촬영장 이동', startDate:'2026-04-20', endDate:'2026-04-21', memo:'26SS 룩북 촬영'},
    {category:'미팅일정', title:'GS홈쇼핑 미팅', startDate:'2026-04-03', endDate:'2026-04-03', memo:'26SS 여름 기획전 협의'},
    {category:'미팅일정', title:'디자이너 미팅', startDate:'2026-03-31', endDate:'2026-03-31', memo:'FW 시즌 디자인 방향 논의'},
    {category:'미팅일정', title:'시즌 기획회의', startDate:'2026-04-08', endDate:'2026-04-08', memo:'26FW 시즌 기획 킥오프'},
    {category:'미팅일정', title:'바이어 미팅', startDate:'2026-05-12', endDate:'2026-05-13', memo:'해외 바이어 미팅 (일본)'},
    {category:'기타', title:'사내 교육', startDate:'2026-04-15', endDate:'2026-04-16', memo:'디지털 마케팅 교육'},
    {category:'기타', title:'건강검진', startDate:'2026-05-20', endDate:'2026-05-20', memo:'연간 건강검진'},
    {category:'기타', title:'워크숍', startDate:'2026-06-01', endDate:'2026-06-02', memo:'팀 빌딩 워크숍 (가평)'},
    {category:'기타', title:'재고실사', startDate:'2026-03-28', endDate:'2026-03-29', memo:'분기 재고실사'},
    // ===== TEST DATA (for verification — remove later) =====
    {category:'연차', title:'하계휴가', startDate:'2026-04-10', endDate:'2026-04-12', memo:'', createdByName:'조현일', createdByPosition:'과장'},
    {category:'반차', title:'오전반차', startDate:'2026-04-11', endDate:'2026-04-11', memo:'', createdByName:'김민수', createdByPosition:'대리'},
    {category:'미팅일정', title:'GS홈쇼핑 미팅', startDate:'2026-04-14', endDate:'2026-04-14', memo:'', startTime:'10:00', endTime:'12:00', createdByName:'박지영', createdByPosition:'사원'},
    {category:'기타', title:'촬영 스케줄', startDate:'2026-04-15', endDate:'2026-04-16', memo:'', createdByName:'이수진', createdByPosition:'주임'},
  ]
  const wkMaxNo = _workItems.reduce((mx, w) => Math.max(mx, w.no || 0), 0)
  workSamples.forEach((w, i) => {
    if (!_workItems.find(e => e.title === w.title && e.startDate === w.startDate)) {
      _workItems.push({
        no: wkMaxNo + i + 1,
        category: w.category,
        title: w.title,
        startDate: w.startDate,
        endDate: w.endDate,
        memo: w.memo,
        startTime: w.startTime || '',
        endTime: w.endTime || '',
        createdByName: w.createdByName || '',
        createdByPosition: w.createdByPosition || '',
        registeredAt: new Date().toISOString()
      })
    }
  })
  saveWorkItems()
  State.workItems = [..._workItems]
  State.work.filtered = [...State.workItems]
}

// =============================================
// ===== 초기화 =====
// =============================================
async function init() {
  // Firebase 초기 관리자 계정 생성 (Firestore에 유저 없을 때만)
  try { await initAdminAccount() } catch (e) { console.log('initAdmin skip:', e.message) }

  // Auth 상태 리스너 등록 + 초기 상태 대기
  await initAuth()

  // 로그인 안 된 상태면 앱 초기화 건너뜀 (로그인 페이지만 표시)
  if (!State.currentUser) return

  initApp()
}

async function initApp() {
  renderDate()
  bindTabs()
  loadAllUsers()
  makeDraggableResizable(document.getElementById('memberEditModal'))
  makeDraggableResizable(document.getElementById('memberAddModal'))
  makeDraggableResizable(document.getElementById('memberProfileModal'))
  makeDraggableResizable(document.getElementById('detailModal'), 480, 300)
  makeDraggableResizable(document.getElementById('compareModal'), 600, 400)
  makeDraggableResizable(document.getElementById('registerModal'))
  makeDraggableResizable(document.getElementById('planRegisterModal'))
  makeDraggableResizable(document.getElementById('planDetailModal'))
  makeDraggableResizable(document.getElementById('stockRegisterModal'))
  makeDraggableResizable(document.getElementById('outgoingModal'))
  makeDraggableResizable(document.getElementById('weeklyReportModal'), 600, 400)
  makeDraggableResizable(document.getElementById('salesUploadModal'), 600, 400)
  makeDraggableResizable(document.getElementById('gonghomPreviewModal'))
  makeDraggableResizable(document.getElementById('sabangnetPreviewModal'))
  makeDraggableResizable(document.getElementById('eventRegisterModal'))
  makeDraggableResizable(document.getElementById('planScheduleModal'))
  makeDraggableResizable(document.getElementById('workRegisterModal'))
  makeDraggableResizable(document.getElementById('workDetailModal'))
  makeDraggableResizable(document.getElementById('personalScheduleModal'), 440, 300)
  makeDraggableResizable(document.getElementById('dashDayModal'), 360, 200)
  makeDraggableResizable(document.getElementById('barcodeUploadModal'), 500, 300)
  makeDraggableResizable(document.getElementById('downloadFormatModal'), 400, 300)
  makeDraggableResizable(document.getElementById('downloadFormatEditorModal'), 600, 400)
  makeDraggableResizable(document.getElementById('bulkScheduleModal'), 400, 300)
  document.getElementById('dashDayModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.close()
  })

  // 모든 모달 ESC(cancel) 키 차단 → 각 close 함수로 위임
  const modalCloseMap = {
    detailModal: closeDetailModal,
    planDetailModal: closePlanDetailModal,
    registerModal: closeRegisterModal,
    eventRegisterModal: closeEventRegisterModal,
    stockRegisterModal: closeStockRegisterModal,
    outgoingModal: closeOutgoingModal,
    barcodeUploadModal: closeBarcodeUploadModal,
    workRegisterModal: closeWorkRegisterModal,
    planRegisterModal: closePlanRegisterModal,
    personalScheduleModal: closePersonalScheduleModal,
    bulkScheduleModal: closeBulkScheduleModal,
  }
  document.querySelectorAll('dialog').forEach(modal => {
    modal.addEventListener('cancel', e => {
      const handler = modalCloseMap[modal.id]
      if (handler) {
        e.preventDefault()
        handler()
      }
      // modals not in the map close normally via default ESC behavior
    })
  })

  // 해시 기반 초기 탭
  const initTab = location.hash.replace('#', '') || 'dashboard'
  State.openTabs = [initTab]
  if (initTab !== 'dashboard' && !State.openTabs.includes('dashboard')) {
    // 대시보드도 같이 열어둠 (선택)
  }
  State.activeTab = initTab
  applyTabState()

  try {
    const [lem, noir] = await Promise.all([
      fetch('data/products_lemango.json').then(r => r.json()),
      fetch('data/products_noir.json').then(r => r.json())
    ])
    State.allProducts = [...lem, ...noir]
    State.product.filtered = [...State.allProducts]
    State.stock.filtered   = [...State.allProducts]
    State.sales.filtered   = [...State.allProducts]
    // 샘플 기획 데이터
    State.planItems.push({
      no: 1,
      sampleNo: '26SS0201',
      productCode: '',
      brand: '르망고',
      nameKr: '아말피 홀터넥',
      nameEn: 'Amalfi Halterneck',
      colorKr: '코랄 핑크',
      colorEn: 'Coral Pink',
      salePrice: 168000,
      costPrice: 58000,
      type: 'onepiece',
      year: '2026',
      season: '2',
      gender: 'W',
      memo: '26SS2 시즌 원피스 신규 기획. 홀터넥 + 오픈백 구조. 포일 원단 검토 중.',
      images: {
        sum: ['https://images.unsplash.com/photo-1604871000636-074fa5117945?w=400'],
        lemango: '',
        noir: ''
      },
      schedule: {
        design:     { start: '2026-02-01', end: '2026-02-20' },
        production: { start: '2026-02-21', end: '2026-03-25' },
        image:      { start: '2026-03-26', end: '2026-04-05' },
        register:   { start: '2026-04-06', end: '2026-04-10' },
        logistics:  { start: '2026-04-11', end: '2026-04-20' }
      }
    })
    // 샘플 데이터 주입 (재고/판매/기획/행사/업무)
    injectSampleData()

    State.plan.filtered    = State.planItems.filter(p => !p.confirmed)
    // 업무일정은 injectSampleData()에서 이미 초기화됨

    populateAllSelects()

    // 열린 탭들만 렌더 (첫 렌더 마킹)
    _renderedTabs.clear()
    State.openTabs.forEach(tab => triggerTabRender(tab))
  } catch (e) {
    showToast('데이터 로드 실패: ' + e.message, 'error')
    console.error(e)
  }
  // Enter 키 검색
  ;['pKeyword','sKeyword','slKeyword','npKeyword'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') el.closest('.tab-content')?.querySelector('.btn-primary')?.click() })
  })
  // 알림 초기화
  cleanOldNotifications()
  renderNotifications()
  checkMemberAlerts()
  if (typeof checkEventAlerts === 'function') checkEventAlerts()
  if (typeof checkPlanAlerts === 'function') checkPlanAlerts()
  if (typeof checkWorkMentionAlerts === 'function') checkWorkMentionAlerts()
  // 로그인 직후 미읽은 알림 있으면 드롭다운 자동 표시
  setTimeout(() => {
    const unread = (_notifications || []).filter(n => !n.dismissed && !n.read).length
    if (unread > 0) {
      const dd = document.getElementById('notifDropdown')
      if (dd) {
        renderNotifications()
        dd.style.display = 'block'
        setTimeout(() => { dd.style.display = 'none' }, 5000)
      }
    }
  }, 2000)
  // 알림 드롭다운 외부 클릭 닫기
  document.addEventListener('click', e => {
    const wrap = document.getElementById('notifWrap')
    const dd = document.getElementById('notifDropdown')
    if (wrap && dd && !wrap.contains(e.target)) dd.style.display = 'none'
  })
}

document.addEventListener('wheel', function(e) {
  const t = e.target
  if (!t || t.tagName !== 'INPUT' || t.type !== 'time') return
  const val = t.value
  if (!val) return
  const [h, m] = val.split(':').map(Number)
  if (e.deltaY < 0 && h === 23 && m === 59) e.preventDefault()
  if (e.deltaY > 0 && h === 0 && m === 0) e.preventDefault()
}, { passive: false })

document.addEventListener('DOMContentLoaded', init)
