// =============================================
// ===== 공통 상수 =====
// =============================================
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'F']
const SPEC_ROWS = [
  { key: 'bust', label: '가슴' },
  { key: 'waist', label: '허리' },
  { key: 'hip', label: '엉덩이' },
  { key: 'etc', label: '기타' },
]
const GENDER_MAP = { W: '여성', M: '남성', U: '공용' }

function ensureSizeSpec(p) {
  if (!p.sizeSpec) {
    const empty = () => Object.fromEntries(SIZES.map(sz => [sz, '']))
    p.sizeSpec = { bust: empty(), waist: empty(), hip: empty(), etc: empty() }
  }
  // ensure all sizes exist in each row
  SPEC_ROWS.forEach(r => {
    if (!p.sizeSpec[r.key]) p.sizeSpec[r.key] = {}
    SIZES.forEach(sz => { if (p.sizeSpec[r.key][sz] === undefined) p.sizeSpec[r.key][sz] = '' })
  })
  return p.sizeSpec
}
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
  types:          [['onepiece','원피스'],['bikini','비키니'],['two piece','투피스'],['monokini','모노키니'],['tankini','탱키니'],['rashguard','래쉬가드'],['beachwear','비치웨어'],['cover-up','커버업'],['swim pants','수영팬츠'],['board shorts','보드숏'],['trunks','트렁크'],['leggings','레깅스'],['beach dress','비치드레스'],['sarong','사롱'],['accessories','악세서리']],
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

// =============================================
// ===== 부서 관리 =====
// =============================================
const DEFAULT_DEPTS = ['경영지원', '디자인', '생산관리', '영업/마케팅', '물류', 'IT']

let _depts = (() => {
  try {
    const saved = localStorage.getItem('lemango_depts_v1')
    return saved ? JSON.parse(saved) : [...DEFAULT_DEPTS]
  } catch { return [...DEFAULT_DEPTS] }
})()

function saveDepts() {
  localStorage.setItem('lemango_depts_v1', JSON.stringify(_depts))
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
  // 업무일정 카테고리
  populateSelect('wkCategory',   _workCategories,   true)
  populateSelect('wkRegCategory', _workCategories)
  // 부서 select (회원가입·회원수정·회원추가·프로필)
  populateSelect('signupDept',   _depts, false, true)
  populateSelect('meEditDept',   _depts, false, true)
  populateSelect('maDept',       _depts, false, true)
  populateSelect('mpDept',       _depts, false, true)
}

// ===== 전역 상태 =====
const State = {
  allProducts: [],
  planItems:   [],
  product: { filtered: [], sort: { key: 'no', dir: 'asc' }, page: 1, pageSize: 10, columnFilters: {}, activeColumns: null, inactiveColumns: [] },
  stock:   { filtered: [], sort: { key: 'no', dir: 'asc' }, page: 1, pageSize: 10, columnFilters: {}, activeColumns: null, inactiveColumns: [] },
  sales:   { filtered: [], sort: { key: 'totalSales', dir: 'desc' }, page: 1, pageSize: 10, activePlatforms: [], inactivePlatforms: [], columnFilters: {} },
  plan:    { filtered: [], sort: { key: 'no', dir: 'asc' }, page: 1, pageSize: 10, columnFilters: {}, activeColumns: null, inactiveColumns: [] },
  event:   { filtered: [], sort: { key: 'startDate', dir: 'asc' }, page: 1 },
  work:    { filtered: [], sort: { key: 'startDate', dir: 'desc' }, page: 1 },
  workItems: [],
  members: [],
  currentUser: null,
  modal:   { images: [], idx: 0 },
  openTabs:  ['dashboard'],
  activeTab: 'dashboard',
  boardPosts: [],
  boardFiltered: [],
  boardPage: 1,
  boardPageSize: 20,
  boardType: 'notice',
  boardAttachments: [],
  currentPost: null,
  editingPostId: null
}

// 탭 ID → 표시 라벨 매핑
const TAB_LABELS = {
  dashboard: '대시보드',
  product:   '상품조회',
  stock:     '재고 관리',
  sales:     '매출현황',
  plan:      '신규기획',
  event:     '행사일정',
  work:      '업무일정',
  settings:  '설정',
  members:   '회원관리',
  board:     '게시판'
}

// =============================================
// ===== 대한민국 공휴일 =====
// =============================================
// 고정 공휴일 (월-일, 0-based month 아님 — 1-based)
const KR_FIXED_HOLIDAYS = {
  '01-01': '신정',
  '03-01': '삼일절',
  '05-05': '어린이날',
  '06-06': '현충일',
  '08-15': '광복절',
  '10-03': '개천절',
  '10-09': '한글날',
  '12-25': '크리스마스',
}

// 음력 기반 공휴일 (연도별 양력 변환 — 2024~2027)
const KR_LUNAR_HOLIDAYS = {
  // 설날 (음력 1/1 전후)
  '2024-02-09': '설날 연휴', '2024-02-10': '설날', '2024-02-11': '설날 연휴', '2024-02-12': '대체공휴일(설날)',
  '2025-01-28': '설날 연휴', '2025-01-29': '설날', '2025-01-30': '설날 연휴',
  '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
  '2027-02-06': '설날 연휴', '2027-02-07': '설날', '2027-02-08': '설날 연휴',
  // 석가탄신일 (음력 4/8)
  '2024-05-15': '부처님오신날', '2025-05-05': '부처님오신날', '2025-05-06': '대체공휴일(부처님오신날)',
  '2026-05-24': '부처님오신날', '2027-05-13': '부처님오신날',
  // 추석 (음력 8/15 전후)
  '2024-09-16': '추석 연휴', '2024-09-17': '추석', '2024-09-18': '추석 연휴',
  '2025-10-05': '추석 연휴', '2025-10-06': '추석', '2025-10-07': '추석 연휴', '2025-10-08': '대체공휴일(추석)',
  '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
  '2027-09-14': '추석 연휴', '2027-09-15': '추석', '2027-09-16': '추석 연휴',
}

function getHolidayName(dateStr) {
  // 음력 기반 먼저 확인
  if (KR_LUNAR_HOLIDAYS[dateStr]) return KR_LUNAR_HOLIDAYS[dateStr]
  // 고정 공휴일
  const mmdd = dateStr.slice(5) // 'MM-DD'
  return KR_FIXED_HOLIDAYS[mmdd] || null
}

// 행사일정 데이터
let _events = (() => {
  try { return JSON.parse(localStorage.getItem('lemango_events_v1')) || [] }
  catch { return [] }
})()
function saveEvents() { localStorage.setItem('lemango_events_v1', JSON.stringify(_events)) }

// =============================================
// ===== 업무일정 카테고리 + 데이터 =====
// =============================================
const DEFAULT_WORK_CATEGORIES = ['연차', '차량사용', '미팅일정', '기타']

let _workCategories = (() => {
  try {
    const saved = localStorage.getItem('lemango_work_categories_v1')
    return saved ? JSON.parse(saved) : [...DEFAULT_WORK_CATEGORIES]
  } catch { return [...DEFAULT_WORK_CATEGORIES] }
})()
function saveWorkCategories() {
  localStorage.setItem('lemango_work_categories_v1', JSON.stringify(_workCategories))
}

let _workItems = (() => {
  try { return JSON.parse(localStorage.getItem('lemango_work_items_v1')) || [] }
  catch { return [] }
})()
function saveWorkItems() { localStorage.setItem('lemango_work_items_v1', JSON.stringify(_workItems)) }

// 업무일정 카테고리별 색상
const WORK_CAT_COLORS = {
  '연차':     { bg: '#1565c0', text: '#fff' },
  '차량사용': { bg: '#2e7d32', text: '#fff' },
  '미팅일정': { bg: '#6a1b9a', text: '#fff' },
  '기타':     { bg: '#78909c', text: '#fff' },
}
const WORK_CAT_PALETTE = [
  { bg: '#1565c0', text: '#fff' },
  { bg: '#2e7d32', text: '#fff' },
  { bg: '#6a1b9a', text: '#fff' },
  { bg: '#78909c', text: '#fff' },
  { bg: '#e65100', text: '#fff' },
  { bg: '#00838f', text: '#fff' },
  { bg: '#c62828', text: '#fff' },
  { bg: '#f0a500', text: '#fff' },
]
function getWorkCatColor(cat) {
  if (WORK_CAT_COLORS[cat]) return WORK_CAT_COLORS[cat]
  const idx = _workCategories.indexOf(cat)
  if (idx >= 0) return WORK_CAT_PALETTE[idx % WORK_CAT_PALETTE.length]
  return { bg: '#78909c', text: '#fff' }
}

// =============================================
// ===== 알림 시스템 =====
// =============================================
const NOTIF_KEY = 'lemango_notifications_v1'
const NOTIF_MAX = 50
const NOTIF_EXPIRE_DAYS = 30

let _notifications = (() => {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY)) || [] }
  catch { return [] }
})()

function saveNotifications() {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(_notifications))
}

function addNotification(type, title, body, link) {
  // 동일 type+title 중복 방지 (최근 1시간 이내)
  const oneHourAgo = Date.now() - 3600000
  if (_notifications.some(n => n.type === type && n.title === title && n.ts > oneHourAgo)) return
  _notifications.unshift({ id: Date.now() + '_' + Math.random().toString(36).slice(2,6), type, title, body, link, ts: Date.now(), read: false })
  if (_notifications.length > NOTIF_MAX) _notifications.length = NOTIF_MAX
  saveNotifications()
  renderNotifications()
}

function cleanOldNotifications() {
  const cutoff = Date.now() - NOTIF_EXPIRE_DAYS * 86400000
  const before = _notifications.length
  _notifications = _notifications.filter(n => n.ts > cutoff)
  if (_notifications.length !== before) saveNotifications()
}

function timeAgo(ts) {
  const diff = Date.now() - ts
  if (diff < 60000) return '방금'
  if (diff < 3600000) return Math.floor(diff / 60000) + '분 전'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '시간 전'
  if (diff < 604800000) return Math.floor(diff / 86400000) + '일 전'
  return new Date(ts).toLocaleDateString('ko-KR')
}

const NOTIF_ICONS = {
  event_start:  '📅',
  event_end:    '📅',
  plan_deadline:'📋',
  board_notice: '📢',
  member_pending:'👤'
}
