// =============================================
// ===== 공통 상수 =====
// =============================================
const SIZES = ['XS', 'S', 'M', 'L', 'XL']
const SCHEDULE_DEFS = [
  { key: 'design',     label: '디자인' },
  { key: 'production', label: '생산' },
  { key: 'image',      label: '이미지' },
  { key: 'register',   label: '상품등록' },
  { key: 'logistics',  label: '물류입고' }
]

// =============================================
// ===== 설정 관리 =====
// =============================================
const SETTINGS_KEY = 'lemango_settings_v1'

const DEFAULT_SETTINGS = {
  brands:         ['르망고', '르망고 느와'],
  types:          [['onepiece','원피스'],['bikini','비키니'],['two piece','투피스']],
  saleStatuses:   ['판매중', '종료', '추가생산'],
  legCuts:        [['low cut','로우컷'],['normal cut','노멀컷'],['middle cut','미들컷'],['high cut','하이컷']],
  fabricTypes:    ['포일', '일반'],
  chestLines:     ['낮음', '보통', '높음'],
  transparencies: ['없음', '약간있음'],
  linings:        ['없음', '있음'],
  capRings:       ['없음', '있음'],
}

const SETTING_DEFS = [
  // group: 'design'
  { key: 'types',          title: '상품 타입', group: 'design', type: 'pair',   ph1: '코드 (예: onepiece)', ph2: '표시명 (예: 원피스)' },
  { key: 'legCuts',        title: '레그컷',    group: 'design', type: 'pair',   ph1: '코드 (예: high cut)', ph2: '표시명 (예: 하이컷)' },
  { key: 'fabricTypes',    title: '원단타입',  group: 'design', type: 'simple', ph: '타입명 (예: 포일)' },
  { key: 'chestLines',     title: '가슴선',    group: 'design', type: 'simple', ph: '옵션명 (예: 낮음)' },
  { key: 'transparencies', title: '비침',      group: 'design', type: 'simple', ph: '옵션명 (예: 없음)' },
  { key: 'linings',        title: '안감',      group: 'design', type: 'simple', ph: '옵션명 (예: 없음)' },
  { key: 'capRings',       title: '캡고리',    group: 'design', type: 'simple', ph: '옵션명 (예: 없음)' },
  // group: 'info'
  { key: 'brands',         title: '브랜드',    group: 'info',   type: 'simple', ph: '브랜드명 (예: 르망고)' },
  { key: 'saleStatuses',   title: '판매상태',  group: 'info',   type: 'simple', ph: '상태명 (예: 판매중)' },
]

// =============================================
// ===== 판매 채널(플랫폼) 관리 =====
// =============================================
const DEFAULT_PLATFORMS = ['공홈', 'GS', '29cm', 'W쇼핑', '기타']

let _platforms = (() => {
  try {
    const saved = localStorage.getItem('lemango_platforms_v1')
    return saved ? JSON.parse(saved) : [...DEFAULT_PLATFORMS]
  } catch { return [...DEFAULT_PLATFORMS] }
})()

function savePlatforms() {
  localStorage.setItem('lemango_platforms_v1', JSON.stringify(_platforms))
}

let _settings = (() => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (!saved) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    const parsed = JSON.parse(saved)
    // 누락된 키는 DEFAULT로 채움
    return Object.fromEntries(
      Object.keys(DEFAULT_SETTINGS).map(k => [k, parsed[k] ?? JSON.parse(JSON.stringify(DEFAULT_SETTINGS[k]))])
    )
  } catch { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) }
})()

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(_settings))
}

// select 요소 하나를 채우는 유틸
function populateSelect(id, items, withAll = false, withBlank = false) {
  const el = document.getElementById(id)
  if (!el) return
  const current = el.value
  let html = ''
  if (withAll)   html += '<option value="all">전체</option>'
  if (withBlank) html += '<option value="">선택</option>'
  html += items.map(item => {
    const [val, label] = Array.isArray(item) ? item : [item, item]
    return `<option value="${val}">${label}</option>`
  }).join('')
  el.innerHTML = html
  // 이전 값 유지 시도
  if ([...el.options].some(o => o.value === current)) el.value = current
}

// 모든 managed select 갱신
function populateAllSelects() {
  const s = _settings
  // 상품조회 검색
  populateSelect('pBrand',       s.brands,         true)
  populateSelect('pLegCut',      s.legCuts,         true)
  populateSelect('pSaleStatus',  s.saleStatuses,    true)
  // 신규기획 검색
  populateSelect('npBrand',      s.brands,          true)
  populateSelect('npType',       s.types,           true)
  // 신규등록 모달 폼
  populateSelect('rBrand',       s.brands)
  populateSelect('rType',        s.types)
  populateSelect('rLegCut',      s.legCuts,         false, true)
  populateSelect('rFabricType',  s.fabricTypes,     false, true)
  populateSelect('rChestLine',   s.chestLines,      false, true)
  populateSelect('rTransparency',s.transparencies,  false, true)
  populateSelect('rLining',      s.linings,         false, true)
  populateSelect('rCapRing',     s.capRings,        false, true)
  // 신규기획 모달 폼
  populateSelect('plBrand',      s.brands)
  populateSelect('plType',       s.types,           false, true)
  // 판매조회 플랫폼 필터
  populateSelect('slPlatform',   _platforms,        true)
}

// ===== 전역 상태 =====
const State = {
  allProducts: [],
  planItems:   [],
  product: { filtered: [], sort: { key: 'no', dir: 'asc' }, page: 1 },
  stock:   { filtered: [], sort: { key: 'no', dir: 'asc' }, page: 1 },
  sales:   { filtered: [], sort: { key: 'totalSales', dir: 'desc' }, page: 1 },
  plan:    { filtered: [], sort: { key: 'no', dir: 'asc' }, page: 1 },
  modal:   { images: [], idx: 0 }
}
