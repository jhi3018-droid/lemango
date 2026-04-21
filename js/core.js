// =============================================
// ===== Firestore 공유 데이터 동기화 =====
// =============================================
const _FS_PRODUCT_CHUNK = 150

function _fsSync(key, data) {
  try {
    if (!db) return
    db.collection('sharedData').doc(key).set({ data: JSON.stringify(data), updatedAt: new Date().toISOString() })
      .catch(e => console.warn('_fsSync(' + key + ') failed:', e.message))
  } catch (e) { console.warn('_fsSync error:', e.message) }
}

async function _fsLoad(key) {
  try {
    if (!db) return null
    const doc = await db.collection('sharedData').doc(key).get({ source: 'server' }).catch(() => null)
    if (doc && doc.exists && doc.data().data) return JSON.parse(doc.data().data)
  } catch (e) { console.warn('_fsLoad(' + key + ') failed:', e.message) }
  return null
}

// 사용자 개인 프리퍼런스 Firestore 동기화 (users/{uid}.prefs)
function _fsSaveUserPrefs(patch) {
  try {
    if (!db || !firebase.auth || !firebase.auth().currentUser) return
    const uid = firebase.auth().currentUser.uid
    const update = {}
    Object.keys(patch).forEach(k => { update['prefs.' + k] = patch[k] })
    db.collection('users').doc(uid).set({ prefs: patch }, { merge: true })
      .catch(e => console.warn('_fsSaveUserPrefs failed:', e.message))
  } catch(e) { console.warn('_fsSaveUserPrefs error:', e.message) }
}
window._fsSaveUserPrefs = _fsSaveUserPrefs

async function _fsLoadUserPrefs() {
  try {
    if (!db || !firebase.auth || !firebase.auth().currentUser) return null
    const uid = firebase.auth().currentUser.uid
    const doc = await db.collection('users').doc(uid).get({ source: 'server' }).catch(() => null)
    if (!doc || !doc.exists) return null
    const d = doc.data()
    const prefs = d && d.prefs ? d.prefs : null
    if (!prefs) return null
    // 각 프리퍼런스를 로컬 캐시에 반영
    if (Array.isArray(prefs.favorites)) {
      if (typeof _favorites !== 'undefined') {
        _favorites.length = 0
        prefs.favorites.forEach(f => _favorites.push(f))
      }
      localStorage.setItem('lemango_favorites_v1', JSON.stringify(prefs.favorites))
    }
    if (Array.isArray(prefs.emojiRecent)) {
      localStorage.setItem('lemango_emoji_recent', JSON.stringify(prefs.emojiRecent))
    }
    if (prefs.notifSettings && typeof prefs.notifSettings === 'object') {
      localStorage.setItem('lemango_notif_settings_v1', JSON.stringify(prefs.notifSettings))
      _notifSettings = null // 다음 getNotifSettings() 호출에서 다시 로드
    }
    return prefs
  } catch(e) { console.warn('_fsLoadUserPrefs failed:', e.message); return null }
}
window._fsLoadUserPrefs = _fsLoadUserPrefs

// sharedData productHistory 로드 (앱 시작 시 1회)
async function _fsLoadProductHistory() {
  try {
    const data = await _fsLoad('productHistory')
    if (data && typeof data === 'object') {
      localStorage.setItem('lemango_product_history_v1', JSON.stringify(data))
    }
  } catch(e) { console.warn('_fsLoadProductHistory failed:', e.message) }
}
window._fsLoadProductHistory = _fsLoadProductHistory

function saveProducts() {
  if (!db || !State.allProducts) return
  const all = State.allProducts
  const chunks = Math.ceil(all.length / _FS_PRODUCT_CHUNK)
  const batch = db.batch()
  for (let i = 0; i < chunks; i++) {
    const slice = all.slice(i * _FS_PRODUCT_CHUNK, (i + 1) * _FS_PRODUCT_CHUNK)
    const ref = db.collection('sharedData').doc('products_' + i)
    batch.set(ref, { data: JSON.stringify(slice), updatedAt: new Date().toISOString() })
  }
  const metaRef = db.collection('sharedData').doc('products_meta')
  batch.set(metaRef, { chunks, total: all.length, updatedAt: new Date().toISOString() })
  batch.commit().catch(e => console.warn('saveProducts failed:', e.message))
}
window.saveProducts = saveProducts

async function _forceUploadProducts() {
  if (!db || !State.allProducts || !State.allProducts.length) return
  const all = State.allProducts
  const chunkSize = _FS_PRODUCT_CHUNK
  const totalChunks = Math.ceil(all.length / chunkSize)
  for (let i = 0; i < totalChunks; i++) {
    const slice = all.slice(i * chunkSize, (i + 1) * chunkSize)
    await db.collection('sharedData').doc('products_' + i).set({
      data: JSON.stringify(slice),
      updatedAt: new Date().toISOString()
    })
    console.log('[FORCE] products_' + i + ' 업로드 완료 (' + slice.length + '건)')
  }
  await db.collection('sharedData').doc('products_meta').set({
    chunks: totalChunks, total: all.length, updatedAt: new Date().toISOString()
  })
  console.log('[FORCE] 상품 전체 업로드 완료: ' + all.length + '개, ' + totalChunks + '개 chunk')
}
window._forceUploadProducts = _forceUploadProducts

// ===== 수동 진단 / 강제 업로드 (콘솔에서 직접 호출) =====
window.checkFirestoreData = async function() {
  console.log('===== Firestore 진단 시작 =====')
  if (!db) { console.error('db 객체 없음'); return }
  try {
    const snap = await db.collection('sharedData').get({ source: 'server' })
    console.log('sharedData 문서 수:', snap.size)
    snap.forEach(doc => {
      const size = JSON.stringify(doc.data()).length
      console.log(' -', doc.id, '(', Math.round(size/1024), 'KB)')
    })
  } catch (e) { console.error('Firestore 조회 실패:', e) }
  console.log('State.allProducts:', State.allProducts?.length || 0)
  console.log('State.planItems:', State.planItems?.length || 0)
  console.log('_events:', _events.length)
  console.log('_workItems:', _workItems.length)
  console.log('===== 진단 끝 =====')
}

window.forceUploadAll = async function() {
  console.log('===== 전체 강제 업로드 시작 =====')
  if (!db) { console.error('db 객체 없음'); return }

  // 1. 상품이 비어있으면 JSON 파일에서 로드
  if (!State.allProducts || !State.allProducts.length) {
    console.log('State.allProducts 비어있음 → JSON 파일 로드')
    try {
      const [lem, noir] = await Promise.all([
        fetch('data/products_lemango.json').then(r => r.json()),
        fetch('data/products_noir.json').then(r => r.json())
      ])
      State.allProducts = [...lem, ...noir]
      console.log('JSON 로드 완료:', State.allProducts.length, '개')
    } catch (e) { console.error('JSON 로드 실패:', e); return }
  }

  // 2. 상품 업로드
  try {
    await _forceUploadProducts()
  } catch (e) { console.error('상품 업로드 실패:', e) }

  // 3. 공유 데이터 업로드
  const payload = {
    events: _events,
    workItems: _workItems,
    workCategories: _workCategories,
    settings: _settings,
    channels: _channels,
    depts: typeof _depts !== 'undefined' ? _depts : [],
    planItems: State.planItems || [],
    planPhases: typeof _planPhases !== 'undefined' ? _planPhases : null,
    designCodes: typeof _designCodes !== 'undefined' ? _designCodes : [],
    allowedIps: typeof _allowedIps !== 'undefined' ? _allowedIps : [],
    ipEnforceMode: typeof _ipEnforceMode !== 'undefined' ? _ipEnforceMode : 'warn'
  }
  for (const [key, val] of Object.entries(payload)) {
    if (val === null || val === undefined) continue
    try {
      await db.collection('sharedData').doc(key).set({
        data: JSON.stringify(val),
        updatedAt: new Date().toISOString()
      })
      const count = Array.isArray(val) ? val.length : (typeof val === 'object' ? Object.keys(val).length : 1)
      console.log('[FORCE]', key, '업로드 완료 (', count, ')')
    } catch (e) { console.error('[FORCE]', key, '업로드 실패:', e.message) }
  }
  console.log('===== 전체 업로드 완료! 모바일에서 새로고침하세요 =====')
}

async function _fsLoadProducts() {
  try {
    if (!db) return null
    const metaDoc = await db.collection('sharedData').doc('products_meta').get({ source: 'server' }).catch(() => null)
    if (!metaDoc || !metaDoc.exists) return null
    const { chunks } = metaDoc.data()
    if (!chunks || chunks < 1) return null
    const promises = []
    for (let i = 0; i < chunks; i++) {
      promises.push(db.collection('sharedData').doc('products_' + i).get({ source: 'server' }).catch(() => null))
    }
    const docs = await Promise.all(promises)
    let all = []
    for (const doc of docs) {
      if (doc && doc.exists && doc.data().data) {
        const arr = JSON.parse(doc.data().data)
        if (Array.isArray(arr)) all = all.concat(arr)
      }
    }
    return all.length > 0 ? all : null
  } catch (e) { console.warn('_fsLoadProducts failed:', e.message) }
  return null
}

async function _fsLoadAllSharedData() {
  const results = {}
  try {
    if (!db) return results
    const snapshot = await db.collection('sharedData').get({ source: 'server' }).catch(() => null)
    if (snapshot) {
      snapshot.forEach(doc => {
        if (doc.id.startsWith('products_')) return
        try { results[doc.id] = JSON.parse(doc.data().data) } catch {}
      })
    }
  } catch (e) { console.warn('_fsLoadAllSharedData failed:', e.message) }
  return results
}

// 팀 공유 설정 재로드 (5분 백그라운드 리프레시에서 호출) — Firestore → 메모리/localStorage, 쓰기 없음
async function _fsReloadSharedSettings() {
  try {
    const fsData = await _fsLoadAllSharedData()
    if (!fsData) return
    if (fsData.settings && typeof fsData.settings === 'object') {
      Object.keys(_settings).forEach(k => delete _settings[k])
      Object.assign(_settings, fsData.settings)
      localStorage.setItem('lemango_settings_v1', JSON.stringify(_settings))
    }
    if (Array.isArray(fsData.channels)) {
      _channels.length = 0; fsData.channels.forEach(c => _channels.push(c))
      _platforms = _channels.filter(c => c.active).map(c => c.name)
      localStorage.setItem('lemango_channels_v1', JSON.stringify(_channels))
      localStorage.setItem('lemango_platforms_v1', JSON.stringify(_platforms))
    }
    if (Array.isArray(fsData.depts)) {
      _depts.length = 0; fsData.depts.forEach(d => _depts.push(d))
      localStorage.setItem('lemango_depts_v1', JSON.stringify(_depts))
    }
    if (Array.isArray(fsData.planPhases)) {
      _planPhases = fsData.planPhases
      localStorage.setItem('lemango_plan_phases_v1', JSON.stringify(_planPhases))
    }
    if (Array.isArray(fsData.workCategories)) {
      _workCategories.length = 0; fsData.workCategories.forEach(c => _workCategories.push(c))
      localStorage.setItem('lemango_work_categories_v1', JSON.stringify(_workCategories))
    }
    if (Array.isArray(fsData.designCodes) && typeof _designCodes !== 'undefined') {
      _designCodes.length = 0; fsData.designCodes.forEach(c => _designCodes.push(c))
      localStorage.setItem('lemango_design_codes_v1', JSON.stringify(_designCodes))
    }
    if (Array.isArray(fsData.allowedIps) && typeof _allowedIps !== 'undefined') {
      _allowedIps.length = 0; fsData.allowedIps.forEach(ip => _allowedIps.push(ip))
      localStorage.setItem('lemango_allowed_ips_v1', JSON.stringify(_allowedIps))
    }
    if (typeof fsData.ipEnforceMode === 'string') {
      _ipEnforceMode = fsData.ipEnforceMode
      localStorage.setItem('lemango_ip_enforce_v1', _ipEnforceMode)
    }
    if (Array.isArray(fsData.events)) {
      _events.length = 0; fsData.events.forEach(e => _events.push(e))
      localStorage.setItem('lemango_events_v1', JSON.stringify(_events))
    }
    if (Array.isArray(fsData.workItems)) {
      _workItems.length = 0; fsData.workItems.forEach(w => _workItems.push(w))
      State.workItems = [..._workItems]
      State.work.filtered = [...State.workItems]
      localStorage.setItem('lemango_work_items_v1', JSON.stringify(_workItems))
    }
    if (Array.isArray(fsData.planItems)) {
      State.planItems = fsData.planItems
      State.plan.filtered = State.planItems.filter(p => !p.confirmed)
      localStorage.setItem('lemango_plan_items_v1', JSON.stringify(State.planItems))
    }
    // select 옵션 재생성 (depts/workCategories 등 반영)
    if (typeof populateAllSelects === 'function') populateAllSelects()
  } catch (e) { console.warn('_fsReloadSharedSettings failed:', e.message) }
}
window._fsReloadSharedSettings = _fsReloadSharedSettings

// =============================================
// ===== 공통 상수 =====
// =============================================
const PLACEHOLDER_IMG = 'assets/logo-placeholder.png'
window.PLACEHOLDER_IMG = PLACEHOLDER_IMG
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'F']
const SPEC_ROWS = [
  { key: 'bust', label: '가슴' },
  { key: 'waist', label: '허리' },
  { key: 'hip', label: '엉덩이' },
  { key: 'etc', label: '기타' },
]
const GENDER_MAP = { W: '여성', M: '남성', U: '공용' }
const POSITIONS = ['사원','주임','대리','과장','차장','실장','팀장','부장','이사','대표이사']
let _currentUserPosition = ''
let _currentUserGrade = 1
let _personalSchedules = []
let _allUsers = []
window._allUsers = _allUsers
let _currentUserDept = ''
let _currentUserName = ''

// =============================================
// ===== 탭 접근 권한 (등급 기반) =====
// =============================================
// 1=담당자, 2=부서장, 3=관리자, 4=시스템관리자
const TAB_PERMISSIONS = {
  dashboard: 1, product: 1, stock: 1, sales: 1, plan: 1,
  event: 1, work: 1, board: 1, orgchart: 1, mypage: 1,
  hradmin: 2, members: 3, settings: 4,
}
window.TAB_PERMISSIONS = TAB_PERMISSIONS

window.canAccessTab = function(tab) {
  const grade = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  const required = TAB_PERMISSIONS[tab]
  if (!required) return true
  return grade >= required
}

const PS_CATEGORIES = ['외근','거래처방문','연차','반차','교육','미팅','출장','기타']
const PS_CAT_COLORS = {
  '외근':       { bg: '#7C3AED', text: '#fff' },
  '거래처방문': { bg: '#2563EB', text: '#fff' },
  '연차':       { bg: '#DC2626', text: '#fff' },
  '반차':       { bg: '#EA580C', text: '#fff' },
  '교육':       { bg: '#16A34A', text: '#fff' },
  '미팅':       { bg: '#0891B2', text: '#fff' },
  '출장':       { bg: '#854D0E', text: '#fff' },
  '기타':       { bg: '#475569', text: '#fff' },
}

function formatUserName(name, position) {
  if (!name) return '알 수 없음'
  if (!position || position === '사원') return name
  return name + ' ' + position
}

function formatUserNameHonorific(name, position) {
  if (!name) return '알 수 없음'
  if (!position || position === '사원') return name + '님'
  return name + ' ' + position + '님'
}

function stampCreated(obj) {
  const user = firebase.auth().currentUser
  obj.createdBy = user?.uid || ''
  obj.createdByName = formatUserName(_currentUserName, _currentUserPosition)
  obj.createdAt = new Date().toISOString()
  obj.lastModifiedBy = obj.createdBy
  obj.lastModifiedByName = obj.createdByName
  obj.lastModifiedAt = obj.createdAt
  return obj
}

function stampModified(obj) {
  const user = firebase.auth().currentUser
  obj.lastModifiedBy = user?.uid || ''
  obj.lastModifiedByName = formatUserName(_currentUserName, _currentUserPosition)
  obj.lastModifiedAt = new Date().toISOString()
  return obj
}

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
// ===== 기획 일정 단계 (동적 관리) =====
const DEFAULT_PLAN_PHASES = [
  { key: 'design',     label: '디자인',   color: '#c9a96e', isDefault: true },
  { key: 'production', label: '생산',     color: '#4caf7d', isDefault: true },
  { key: 'image',      label: '이미지',   color: '#7C3AED', isDefault: true },
  { key: 'register',   label: '상품등록', color: '#f0a500', isDefault: true },
  { key: 'logistics',  label: '물류입고', color: '#0891B2', isDefault: true },
]
const DEFAULT_PLAN_PHASE_KEYS = ['design','production','image','register','logistics']
const PLAN_PHASES_KEY = 'lemango_plan_phases_v1'
let _planPhases = null
function getPlanPhases() {
  if (!_planPhases) {
    try {
      const saved = JSON.parse(localStorage.getItem(PLAN_PHASES_KEY))
      if (Array.isArray(saved) && saved.length) _planPhases = saved
    } catch (e) {}
    if (!Array.isArray(_planPhases) || !_planPhases.length) {
      _planPhases = DEFAULT_PLAN_PHASES.map(p => ({ ...p }))
      savePlanPhases()
    }
    // Backfill missing colors and isDefault for saved data
    _planPhases.forEach(p => {
      if (!p.color) p.color = '#888'
      if (DEFAULT_PLAN_PHASE_KEYS.indexOf(p.key) >= 0) p.isDefault = true
    })
  }
  return _planPhases
}
function savePlanPhases() {
  _fsSync('planPhases', _planPhases || [])
  localStorage.setItem(PLAN_PHASES_KEY, JSON.stringify(_planPhases || []))
}
// SCHEDULE_DEFS: dynamic proxy — always returns current phases via getPlanPhases()
// Kept as a "variable" name for backward compatibility. Use as Array.
Object.defineProperty(window, 'SCHEDULE_DEFS', {
  get: () => getPlanPhases(),
  configurable: true
})
window.getPlanPhases = getPlanPhases
window.savePlanPhases = savePlanPhases

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
// ===== 판매 채널(플랫폼+수수료) 통합 관리 =====
// =============================================
const DEFAULT_PLATFORMS = ['공홈', 'GS', '29cm', 'W쇼핑', '기타']

// 기본 수수료율 매핑 (마이그레이션/신규 채널 기본값용)
const _DEFAULT_FEE_MAP = {
  '공홈': 0, '파트너': 0,
  '29CM': 30, '29cm': 30,
  '무신사': 25, 'GS shop': 35, 'GS': 35,
  '신세계몰': 28, 'W쇼핑': 32, '롯데ON': 30,
  '카카오': 20, '하프클럽': 33, 'SSF': 27,
  'CJ온스타일': 35, '현대Hmall': 30
}

// 신규 통합 구조: [{name, feeRate, note, active}]
// _channels: Firestore 주 저장소, localStorage 캐시. initApp()에서 Firestore 로드.
let _channels = (() => {
  // 캐시에서 빠르게 로드 (Firestore 로드 전 임시). initApp에서 Firestore 데이터로 덮어씀.
  try {
    const saved = localStorage.getItem('lemango_channels_v1')
    if (saved) return JSON.parse(saved)
  } catch {}
  // 마이그레이션: 기존 _platforms + _channelFees 병합
  let oldPlats = []
  try {
    const sp = localStorage.getItem('lemango_platforms_v1')
    oldPlats = sp ? JSON.parse(sp) : [...DEFAULT_PLATFORMS]
  } catch { oldPlats = [...DEFAULT_PLATFORMS] }
  let oldFees = []
  try {
    const sf = localStorage.getItem('lemango_channel_fees_v1')
    oldFees = sf ? JSON.parse(sf) : []
  } catch {}
  const seen = new Set()
  const merged = []
  oldPlats.forEach(name => {
    if (!name || seen.has(name)) return
    seen.add(name)
    const fee = oldFees.find(f => f.channel === name)
    const rate = fee ? (Number(fee.rate) || 0) : (_DEFAULT_FEE_MAP[name] != null ? _DEFAULT_FEE_MAP[name] : 0)
    merged.push({ name, feeRate: rate, note: '', active: true })
  })
  oldFees.forEach(f => {
    if (!f || !f.channel || seen.has(f.channel)) return
    seen.add(f.channel)
    merged.push({ name: f.channel, feeRate: Number(f.rate) || 0, note: '', active: true })
  })
  return merged
})()

let _platforms = _channels.filter(c => c.active).map(c => c.name)

function savePlatforms() {
  localStorage.setItem('lemango_platforms_v1', JSON.stringify(_platforms))
}

function getChannels() { return _channels }
function getActiveChannels() { return _channels.filter(c => c.active) }

function saveChannels() {
  _platforms = _channels.filter(c => c.active).map(c => c.name)
  // Firestore 주 저장소
  _fsSync('channels', _channels)
  // localStorage 캐시
  localStorage.setItem('lemango_channels_v1', JSON.stringify(_channels))
  savePlatforms()
}

function getChannelFeeRate(channelName) {
  const found = _channels.find(c => c.name === channelName)
  return found ? Number(found.feeRate) || 0 : 0
}

// 매출 업로드: 새 채널 자동 감지 + 추가
function detectNewChannels(uploadedChannels) {
  const existing = getChannels().map(c => c.name.toLowerCase())
  const seen = new Set()
  return (uploadedChannels || []).filter(ch => {
    if (!ch) return false
    const lower = String(ch).toLowerCase()
    if (seen.has(lower)) return false
    seen.add(lower)
    return !existing.some(ex => ex === lower || ex.includes(lower) || lower.includes(ex))
  })
}

async function promptNewChannels(newChannels) {
  if (!newChannels || !newChannels.length) return
  const list = newChannels.join(', ')
  const ok = await korConfirm('새로운 판매 채널이 발견되었습니다:\n\n' + list + '\n\n판매채널 설정에 추가하시겠습니까?', '추가', '건너뛰기')
  if (!ok) return
  const added = []
  for (const ch of newChannels) {
    const rateStr = prompt('"' + ch + '" 수수료율 (%, 0~100)', '0')
    if (rateStr === null) continue
    const rate = parseFloat(rateStr)
    const feeRate = (isNaN(rate) || rate < 0 || rate > 100) ? 0 : rate
    if (!_channels.some(c => c.name === ch)) {
      _channels.push({ name: ch, feeRate, note: '매출 업로드에서 자동 추가', active: true })
      added.push(ch)
      if (typeof State !== 'undefined' && Array.isArray(State.allProducts)) {
        State.allProducts.forEach(p => { if (p.sales && !(ch in p.sales)) p.sales[ch] = 0 })
      }
    }
  }
  if (added.length) {
    saveChannels()
    if (typeof populateAllSelects === 'function') populateAllSelects()
    if (typeof showToast === 'function') showToast(added.length + '개 새 채널이 추가되었습니다.')
    if (typeof logActivity === 'function') logActivity('setting', '설정', '매출 업로드에서 새 채널 추가 — ' + added.join(', '))
  }
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
  _fsSync('settings', _settings)
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
  _fsSync('depts', _depts)
  localStorage.setItem('lemango_depts_v1', JSON.stringify(_depts))
}

// =============================================
// ===== 출퇴근 허용 IP 관리 =====
// =============================================
// _allowedIps: [{ ip, label, active }]
// _ipEnforceMode: 'off' | 'warn' | 'block'
//   - off   : IP 기록만 (기본, 기존 동작)
//   - warn  : 허용 IP 외 접근 시 경고 후 진행
//   - block : 허용 IP 외 접근 시 차단 (grade >= 3 은 우회)
let _allowedIps = (() => {
  try {
    const saved = localStorage.getItem('lemango_allowed_ips_v1')
    return saved ? JSON.parse(saved) : []
  } catch { return [] }
})()

let _ipEnforceMode = (() => {
  try {
    return localStorage.getItem('lemango_ip_enforce_v1') || 'off'
  } catch { return 'off' }
})()

function saveAllowedIps() {
  _fsSync('allowedIps', _allowedIps)
  localStorage.setItem('lemango_allowed_ips_v1', JSON.stringify(_allowedIps))
}

function saveIpEnforceMode() {
  _fsSync('ipEnforceMode', _ipEnforceMode)
  localStorage.setItem('lemango_ip_enforce_v1', _ipEnforceMode)
}

// 현재 IP가 허용 목록에 있는지 확인 — active=true 인 항목만 검사
// 단일 IP 완전 일치 또는 와일드카드 prefix (예: "192.168.1.*") 지원
function isIpAllowed(ip) {
  if (!ip || ip === 'unknown') return false
  if (!_allowedIps || _allowedIps.length === 0) return false
  return _allowedIps.some(entry => {
    if (!entry.active) return false
    if (!entry.ip) return false
    if (entry.ip === ip) return true
    // 와일드카드: 192.168.1.* → 192.168.1. 로 시작하면 매칭
    if (entry.ip.endsWith('.*')) {
      const prefix = entry.ip.slice(0, -1) // "192.168.1."
      return ip.startsWith(prefix)
    }
    return false
  })
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
  // pType은 품번 코드 체계(ON/BK/MO...) 기반 — pcType과 동일 소스로 동적 채움
  const _pTypeItems = [['ON','원피스'],['MO','모노키니'],['BK','비키니'],['BR','브리프'],['JM','재머'],['RG','래시가드'],['AL','애슬레저'],['GM','의류'],['SC','수영모'],['BG','가방'],['ET','기타']]
  populateSelect('pType',        _pTypeItems,       true)
  populateSelect('pLegCut',      s.legCuts,         true)
  populateSelect('pSaleStatus',  s.saleStatuses,    true)
  // 신규기획 검색
  populateSelect('npBrand',      s.brands,          true)
  populateSelect('npType',       s.types,           true)
  // 신규기획 일정 단계 필터 (동적)
  const npPhaseSel = document.getElementById('npPhase')
  if (npPhaseSel) {
    const curVal = npPhaseSel.value || 'all'
    npPhaseSel.innerHTML = '<option value="all">전체</option>' +
      getPlanPhases().map(p => `<option value="${p.key}">${p.label}</option>`).join('')
    npPhaseSel.value = curVal
  }
  // 신규등록 모달 폼
  populateSelect('rBrand',       s.brands)
  populateSelect('rType',        s.types)
  populateSelect('rLegCut',      s.legCuts,         false, true)
  populateSelect('rFabricType',  s.fabricTypes,     false, true)
  populateSelect('rChestLine',   s.chestLines,      false, true)
  populateSelect('rTransparency',s.transparencies,  false, true)
  populateSelect('rLining',      s.linings,         false, true)
  populateSelect('rCapRing',     s.capRings,        false, true)
  populateSelect('rSaleStatus',  s.saleStatuses)
  populateSelect('rProductionStatus', ['지속생산','생산중단','시즌한정','샘플'])
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
  // 직급 select (회원수정·회원추가·프로필)
  populateSelect('meEditPosition', POSITIONS, false, true)
  populateSelect('maPosition',     POSITIONS)
  populateSelect('mpPosition',     POSITIONS, false, true)
}

// ===== 전역 상태 =====
const State = {
  allProducts: [],
  planItems:   [],
  product: { filtered: [], sort: { key: 'no', dir: 'asc' }, page: 1, pageSize: 10, columnFilters: {}, activeColumns: null, inactiveColumns: [], colWidths: {} },
  stock:   { filtered: [], sort: { key: 'no', dir: 'asc' }, page: 1, pageSize: 10, columnFilters: {}, activeColumns: null, inactiveColumns: [], colWidths: {} },
  sales:   { filtered: [], sort: { key: 'totalSales', dir: 'desc' }, page: 1, pageSize: 10, activePlatforms: [], inactivePlatforms: [], columnFilters: {}, colWidths: {} },
  plan:    { filtered: [], sort: { key: 'no', dir: 'asc' }, page: 1, pageSize: 10, columnFilters: {}, activeColumns: null, inactiveColumns: [], colWidths: {} },
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
  editingPostId: null,
  activityLog: { all: [], filtered: [], page: 1, pageSize: 30, cat: 'all' },
  boardToDeletePaths: [],
  eventCalView: 'month',
  workCalView: 'month'
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
  board:     '게시판',
  orgchart:  '조직도',
  mypage:    '개인정보',
  hradmin:   '인사관리'
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
function saveEvents() {
  _fsSync('events', _events)
  localStorage.setItem('lemango_events_v1', JSON.stringify(_events))
}

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
  _fsSync('workCategories', _workCategories)
  localStorage.setItem('lemango_work_categories_v1', JSON.stringify(_workCategories))
}

let _workItems = (() => {
  try { return JSON.parse(localStorage.getItem('lemango_work_items_v1')) || [] }
  catch { return [] }
})()
function saveWorkItems() {
  _fsSync('workItems', _workItems)
  localStorage.setItem('lemango_work_items_v1', JSON.stringify(_workItems))
}

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

const DEFAULT_NOTIF_SETTINGS = {
  globalEnabled: true,
  types: {
    event_start: true, event_end: true, event_share: true, plan_deadline: true,
    member_pending_urgent: true,
    board_notice: true, comment_mention: true, watch_change: true,
    work_mention: true, work_start: true, work_upcoming: true,
    personal_schedule: true, birthday: true,
    leave_pending: true, leave_request: true, leave_approved: true, leave_rejected: true, leave_cancel: true,
    attend_pending: true, late_arrival: true,
    salary: true,
  }
};
let _notifSettings = null;
window.getNotifSettings = function() {
  if (!_notifSettings) {
    try {
      const raw = localStorage.getItem('lemango_notif_settings_v1');
      _notifSettings = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_NOTIF_SETTINGS));
      if (!_notifSettings.types) _notifSettings.types = {...DEFAULT_NOTIF_SETTINGS.types};
      // legacy → 신규 키 마이그레이션
      if (_notifSettings.types.event_upcoming !== undefined && _notifSettings.types.event_start === undefined) {
        _notifSettings.types.event_start = _notifSettings.types.event_upcoming;
      }
      ['event_upcoming','member_pending','deadline_urgent','deadline_today','deadline_overdue'].forEach(k => {
        if (_notifSettings.types[k] !== undefined) delete _notifSettings.types[k];
      });
      Object.keys(DEFAULT_NOTIF_SETTINGS.types).forEach(k => {
        if (_notifSettings.types[k] === undefined) _notifSettings.types[k] = true;
      });
    } catch(e) { _notifSettings = JSON.parse(JSON.stringify(DEFAULT_NOTIF_SETTINGS)); }
  }
  return _notifSettings;
};
window.saveNotifSettings = function() {
  localStorage.setItem('lemango_notif_settings_v1', JSON.stringify(_notifSettings));
  _fsSaveUserPrefs({ notifSettings: _notifSettings })
};
window.isNotifEnabled = function(type) {
  const s = getNotifSettings();
  if (s.globalEnabled === false) return false;
  if (type && s.types && s.types[type] === false) return false;
  return true;
};
window.toggleGlobalNotif = function() {
  const s = getNotifSettings();
  s.globalEnabled = !s.globalEnabled;
  saveNotifSettings();
  if (typeof updateNotifToggleUI === 'function') updateNotifToggleUI();
  if (typeof renderNotifications === 'function') renderNotifications();
  if (typeof showToast === 'function') showToast(s.globalEnabled ? '알림 켜짐' : '알림 꺼짐');
  const gc = document.getElementById('notifGlobalCheck');
  if (gc) gc.checked = s.globalEnabled;
  document.querySelectorAll('#notifTypeList input[type="checkbox"]').forEach(cb => { cb.disabled = !s.globalEnabled; });
};
window.updateNotifToggleUI = function() {
  const btn = document.getElementById('notifGlobalToggle');
  if (!btn) return;
  const s = getNotifSettings();
  if (s.globalEnabled) {
    btn.textContent = '🔔';
    btn.classList.remove('notif-off');
    btn.classList.add('notif-on');
    btn.title = '알림 ON (클릭하여 끄기)';
  } else {
    btn.textContent = '🔕';
    btn.classList.remove('notif-on');
    btn.classList.add('notif-off');
    btn.title = '알림 OFF (클릭하여 켜기)';
  }
};

function addNotification(type, title, body, link, opts) {
  // 전체 알림 꺼짐 시 모두 차단 (ps_ 포함)
  try {
    const s = (typeof getNotifSettings === 'function') ? getNotifSettings() : null
    if (s && s.globalEnabled === false) return
  } catch(e) {}
  const isMandatory = typeof type === 'string' && type.indexOf('ps_') === 0
  if (!isMandatory && typeof isNotifEnabled === 'function' && !isNotifEnabled(type)) return

  const priority = (opts && opts.priority) || ''
  const myUid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : null
  // targetUid 미지정 → 본인 알림. 지정 → 해당 사용자 알림 (다중 사용자 targetUids 지원)
  const targetUids = (opts && Array.isArray(opts.targetUids)) ? opts.targetUids : null
  const singleTarget = (opts && opts.targetUid) ? opts.targetUid : null

  // Firestore에 저장 (대상 사용자별)
  if (db) {
    const recipients = targetUids || (singleTarget ? [singleTarget] : (myUid ? [myUid] : []))
    recipients.forEach(uid => {
      if (!uid) return
      try {
        db.collection('notifications').add({
          uid, type, title, body: body || '', link: link || '',
          priority, ts: Date.now(), read: false,
          createdAt: new Date().toISOString()
        }).catch(e => console.warn('notification add failed:', e.message))
      } catch(e) { console.warn('notification add error:', e.message) }
    })
  }

  // 로컬 캐시: 본인에게 향한 알림이거나, targetUid 지정 없음(본인용)일 때만
  const isForMe = !singleTarget && !targetUids || (singleTarget && singleTarget === myUid) || (targetUids && myUid && targetUids.includes(myUid))
  if (isForMe) {
    // 동일 type+title 중복 방지 (최근 1시간 이내)
    const oneHourAgo = Date.now() - 3600000
    if (_notifications.some(n => n.type === type && n.title === title && n.ts > oneHourAgo)) return
    _notifications.unshift({ id: Date.now() + '_' + Math.random().toString(36).slice(2,6), type, title, body, link, priority, ts: Date.now(), read: false })
    if (_notifications.length > NOTIF_MAX) _notifications.length = NOTIF_MAX
    saveNotifications()
    renderNotifications()
  }
}
window.addNotification = addNotification

// ===== Firestore 알림 로더 (로그인/폴링 시 호출) =====
async function _fsLoadNotifications() {
  try {
    if (!db) return
    const user = firebase.auth && firebase.auth().currentUser
    if (!user) return
    const cutoff = Date.now() - NOTIF_EXPIRE_DAYS * 86400000
    const snap = await db.collection('notifications')
      .where('uid', '==', user.uid)
      .get({ source: 'server' })
      .catch(() => null)
    if (!snap) return
    const fsItems = []
    snap.forEach(doc => {
      const d = doc.data()
      if (!d || !d.ts || d.ts < cutoff) return
      fsItems.push({
        id: doc.id,
        fsId: doc.id,
        type: d.type, title: d.title, body: d.body || '', link: d.link || '',
        priority: d.priority || '', ts: d.ts, read: !!d.read
      })
    })
    // 머지: 로컬 로컬온리 항목 유지 + Firestore 항목 덮어쓰기(fsId 기준)
    const localOnly = _notifications.filter(n => !n.fsId)
    const merged = [...fsItems, ...localOnly]
    // ts 역순 정렬 + NOTIF_MAX 제한
    merged.sort((a, b) => (b.ts || 0) - (a.ts || 0))
    if (merged.length > NOTIF_MAX) merged.length = NOTIF_MAX
    _notifications.length = 0
    merged.forEach(n => _notifications.push(n))
    saveNotifications()
    if (typeof renderNotifications === 'function') renderNotifications()
  } catch(e) { console.warn('_fsLoadNotifications failed:', e.message) }
}
window._fsLoadNotifications = _fsLoadNotifications

// Firestore read 상태 동기화
function _fsUpdateNotificationRead(fsId, read) {
  try {
    if (!db || !fsId) return
    db.collection('notifications').doc(fsId).update({ read: !!read })
      .catch(e => console.warn('notification read update failed:', e.message))
  } catch(e) {}
}
window._fsUpdateNotificationRead = _fsUpdateNotificationRead

// Firestore에서 알림 삭제 (dismiss 시)
function _fsDeleteNotification(fsId) {
  try {
    if (!db || !fsId) return
    db.collection('notifications').doc(fsId).delete()
      .catch(e => console.warn('notification delete failed:', e.message))
  } catch(e) {}
}
window._fsDeleteNotification = _fsDeleteNotification

function cleanOldNotifications() {
  const cutoff = Date.now() - NOTIF_EXPIRE_DAYS * 86400000
  const before = _notifications.length
  _notifications = _notifications.filter(n => n.ts > cutoff)
  if (_notifications.length !== before) saveNotifications()
  // Firestore에서도 만료 알림 삭제 (본인 것만)
  try {
    if (!db) return
    const user = firebase.auth && firebase.auth().currentUser
    if (!user) return
    db.collection('notifications')
      .where('uid', '==', user.uid)
      .where('ts', '<', cutoff)
      .get({ source: 'server' })
      .then(snap => { if (snap) snap.forEach(doc => doc.ref.delete().catch(() => {})) })
      .catch(() => {})
  } catch(e) {}
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
  event_share:  '🎪',
  plan_deadline:'📋',
  board_notice: '📢',
  member_pending:'👤',
  member_pending_urgent:'🔴',
  personal_schedule:'📋',
  ps_start: '📅',
  ps_upcoming: '📅',
  ps_end: '📅',
  ps_created: '📅',
  work_mention: '📋',
  work_start: '⏰',
  work_upcoming: '📅',
  comment_mention: '💬',
  watch_change: '💛',
  birthday: '🎂',
  leave_pending: '📋',
  leave_request: '📋',
  leave_approved: '✅',
  leave_rejected: '❌',
  leave_cancel: '↩️',
  attend_pending: '⏰',
  late_arrival: '🕐',
  salary: '💰'
}

// =============================================
// ===== Feature 1: Global Search =====
// =============================================
let _gsearchResults = []
let _gsearchIdx = -1

function globalSearch(q) {
  q = (q || '').trim().toLowerCase()
  if (!q) { hideGsearchDropdown(); _gsearchResults = []; return }
  const out = []
  const push = (item) => { if (out.length < 12) out.push(item) }
  // products
  ;(State.allProducts || []).forEach(p => {
    if (out.length >= 12) return
    const hay = ((p.productCode||'') + ' ' + (p.nameKr||'') + ' ' + (p.nameEn||'') + ' ' + (p.sampleNo||'') + ' ' + (p.brand||'')).toLowerCase()
    if (hay.includes(q)) push({ type:'product', id:p.productCode, title:p.nameKr || p.productCode, sub:`상품 · ${p.productCode}${p.brand?' · '+p.brand:''}` })
  })
  ;(State.planItems || []).forEach(p => {
    if (out.length >= 12) return
    const hay = ((p.productCode||'') + ' ' + (p.nameKr||'') + ' ' + (p.sampleNo||'') + ' ' + (p.brand||'')).toLowerCase()
    if (hay.includes(q)) push({ type:'plan', id:p.no, title:p.nameKr || p.sampleNo || ('기획 #'+p.no), sub:`기획 · ${p.sampleNo||''}${p.productCode?' · '+p.productCode:''}` })
  })
  ;(typeof _events !== 'undefined' ? _events : []).forEach(ev => {
    if (out.length >= 12) return
    const hay = ((ev.name||'') + ' ' + (ev.channel||'') + ' ' + (ev.memo||'')).toLowerCase()
    if (hay.includes(q)) push({ type:'event', id:ev.no, title:ev.name || '행사', sub:`행사 · ${ev.channel||''} · ${ev.startDate||''}~${ev.endDate||''}` })
  })
  ;(typeof _workItems !== 'undefined' ? _workItems : []).forEach(w => {
    if (out.length >= 12) return
    const hay = ((w.title||'') + ' ' + (w.category||'') + ' ' + (w.memo||'')).toLowerCase()
    if (hay.includes(q)) push({ type:'work', id:w.no, title:w.title || '업무', sub:`업무 · ${w.category||''} · ${w.startDate||''}` })
  })
  _gsearchResults = out
  _gsearchIdx = -1
  renderGsearchResults()
  showGsearchDropdown()
}

function renderGsearchResults() {
  const dd = document.getElementById('gsearchDropdown')
  if (!dd) return
  if (!_gsearchResults.length) { dd.innerHTML = '<div class="gsearch-empty">결과 없음</div>'; return }
  dd.innerHTML = _gsearchResults.map((r, i) => {
    const active = i === _gsearchIdx ? ' gsearch-active' : ''
    const icon = { product:'📦', plan:'📝', event:'🎉', work:'📋' }[r.type] || '•'
    return `<div class="gsearch-item${active}" data-idx="${i}" onclick="selectGsearchResult(${i})">
      <span class="gsearch-icon">${icon}</span>
      <span class="gsearch-body"><span class="gsearch-title">${(r.title||'').replace(/[<>]/g,'')}</span><span class="gsearch-sub">${(r.sub||'').replace(/[<>]/g,'')}</span></span>
    </div>`
  }).join('')
}

function gsearchKeyDown(e) {
  if (!_gsearchResults.length) return
  if (e.key === 'ArrowDown') { e.preventDefault(); _gsearchIdx = Math.min(_gsearchResults.length-1, _gsearchIdx+1); renderGsearchResults() }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _gsearchIdx = Math.max(0, _gsearchIdx-1); renderGsearchResults() }
  else if (e.key === 'Enter') { e.preventDefault(); if (_gsearchIdx < 0) _gsearchIdx = 0; selectGsearchResult(_gsearchIdx) }
  else if (e.key === 'Escape') { hideGsearchDropdown() }
}

function selectGsearchResult(i) {
  const r = _gsearchResults[i]
  if (!r) return
  hideGsearchDropdown()
  const input = document.getElementById('gsearchInput')
  if (input) input.value = ''
  const tabMap = { product:'product', plan:'plan', event:'event', work:'work' }
  const tab = tabMap[r.type]
  if (typeof navigateTo === 'function') navigateTo(tab)
  setTimeout(() => {
    try {
      if (r.type === 'product' && typeof openDetailModal === 'function') openDetailModal(r.id)
      else if (r.type === 'plan' && typeof openPlanDetailModal === 'function') openPlanDetailModal(r.id)
      else if (r.type === 'event' && typeof openEventDetailModal === 'function') openEventDetailModal(r.id)
      else if (r.type === 'work' && typeof openWorkDetailModal === 'function') openWorkDetailModal(r.id)
    } catch(e) { console.warn('gsearch open error', e) }
  }, 300)
}

function showGsearchDropdown() {
  const dd = document.getElementById('gsearchDropdown')
  if (dd) dd.style.display = ''
}
function hideGsearchDropdown() {
  const dd = document.getElementById('gsearchDropdown')
  if (dd) dd.style.display = 'none'
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.gsearch-wrap')
    if (wrap && !wrap.contains(e.target)) hideGsearchDropdown()
  })
})

// =============================================
// ===== Feature 3: Favorites =====
// =============================================
let _favorites = (() => {
  try { return JSON.parse(localStorage.getItem('lemango_favorites_v1') || '[]') } catch(e) { return [] }
})()

function saveFavorites() {
  try { localStorage.setItem('lemango_favorites_v1', JSON.stringify(_favorites)) } catch(e) {}
  _fsSaveUserPrefs({ favorites: _favorites })
}

function isFavorite(type, id) {
  return _favorites.some(f => f.type === type && String(f.id) === String(id))
}

function toggleFavorite(type, id, name) {
  if (id === null || id === undefined || id === '') return
  const idx = _favorites.findIndex(f => f.type === type && String(f.id) === String(id))
  if (idx >= 0) {
    _favorites.splice(idx, 1)
    if (typeof showToast === 'function') showToast('즐겨찾기 해제', 'info')
  } else {
    _favorites.unshift({ type, id, name: name || '', addedAt: new Date().toISOString() })
    if (_favorites.length > 50) _favorites = _favorites.slice(0, 50)
    if (typeof showToast === 'function') showToast('즐겨찾기 추가', 'success')
  }
  saveFavorites()
  // update any open buttons
  const btnMap = { product:'dFavBtn', plan:'pdFavBtn', event:'evFavBtn', work:'wkFavBtn' }
  const bid = btnMap[type]
  if (bid) {
    const b = document.getElementById(bid)
    if (b) {
      const on = isFavorite(type, id)
      b.textContent = on ? '★' : '☆'
      b.classList.toggle('fav-on', on)
    }
  }
  if (typeof renderFavoritesList === 'function') renderFavoritesList()
}

function renderFavoriteStar(type, id) {
  const on = isFavorite(type, id)
  return `<span class="fav-star-inline${on?' fav-on':''}">${on?'★':'☆'}</span>`
}

function openFavorite(type, id) {
  const tabMap = { product:'product', plan:'plan', event:'event', work:'work' }
  const tab = tabMap[type]
  if (typeof navigateTo === 'function') navigateTo(tab)
  setTimeout(() => {
    try {
      if (type === 'product') openDetailModal(id)
      else if (type === 'plan') openPlanDetailModal(Number(id))
      else if (type === 'event') openEventDetailModal(Number(id))
      else if (type === 'work') openWorkDetailModal(Number(id))
    } catch(e) {}
  }, 300)
}

function renderFavoritesList() {
  // Tab-scoped favorites bars
  const pArea = document.getElementById('productFavArea')
  if (pArea) pArea.innerHTML = renderFavoritesBar('product')
  const npArea = document.getElementById('planFavArea')
  if (npArea) npArea.innerHTML = renderFavoritesBar('plan')
}

function renderFavoritesBar(filterType) {
  const list = filterType === 'all' ? _favorites : _favorites.filter(f => f.type === filterType)
  if (!list.length) return ''
  const icon = { product:'📦', plan:'📝', event:'🎉', work:'📋' }
  let html = '<div class="fav-bar"><div class="fav-bar-title">★ 즐겨찾기</div><div class="fav-bar-list">'
  list.slice(0, 10).forEach(f => {
    const idJson = JSON.stringify(f.id).replace(/"/g, '&quot;')
    const name = (f.name || String(f.id)).replace(/[<>"']/g, '')
    html += `<div class="fav-bar-item" onclick="openFavorite('${f.type}', ${idJson})">
      <span class="fav-bar-icon">${icon[f.type]||'•'}</span>
      <span class="fav-bar-name">${name}</span>
      <span class="fav-bar-x" onclick="event.stopPropagation();toggleFavorite('${f.type}', ${idJson}, '')">✕</span>
    </div>`
  })
  html += '</div></div>'
  return html
}

// =============================================
// ===== Feature 13: Modal back navigation (removed) =====
function pushModalHistory() {}
function popModalHistory() { return null }
function clearModalHistory() {}
function goBack() {}

// expose globals
window.globalSearch = globalSearch
window.gsearchKeyDown = gsearchKeyDown
window.selectGsearchResult = selectGsearchResult
window.showGsearchDropdown = showGsearchDropdown
window.hideGsearchDropdown = hideGsearchDropdown
window.toggleFavorite = toggleFavorite
window.isFavorite = isFavorite
window.renderFavoritesBar = renderFavoritesBar
window.openFavorite = openFavorite
window.renderFavoritesList = renderFavoritesList

/* ========== Feature 1: Product History (Firestore sharedData) ========== */
function _loadProductHistoryLocal() {
  try { return JSON.parse(localStorage.getItem('lemango_product_history_v1') || '{}') } catch(e) { return {} }
}
function _saveProductHistoryLocal(all) {
  try { localStorage.setItem('lemango_product_history_v1', JSON.stringify(all)) } catch(e) {}
}
function addProductHistory(productCode, action, detail) {
  if (!productCode) return
  const all = _loadProductHistoryLocal()
  if (!all[productCode]) all[productCode] = []
  all[productCode].push({
    action, detail: detail || '',
    user: (typeof _currentUserName !== 'undefined' && _currentUserName) || '',
    userPosition: (typeof _currentUserPosition !== 'undefined' && _currentUserPosition) || '',
    timestamp: new Date().toISOString()
  })
  if (all[productCode].length > 50) all[productCode] = all[productCode].slice(-50)
  _fsSync('productHistory', all)
  _saveProductHistoryLocal(all)
}
function getProductHistory(productCode) {
  const all = _loadProductHistoryLocal()
  return (all[productCode] || []).slice().reverse()
}
window.addProductHistory = addProductHistory
window.getProductHistory = getProductHistory

/* ========== Feature 2: Watches (Firestore 공유 — 모든 사용자의 워치 조회 가능) ========== */
let _watches = (() => { try { return JSON.parse(localStorage.getItem('lemango_watches_v1') || '[]') } catch(e) { return [] } })()
function saveWatches() { try { localStorage.setItem('lemango_watches_v1', JSON.stringify(_watches)) } catch(e) {} }
function _myUid() { try { return (firebase.auth().currentUser && firebase.auth().currentUser.uid) || '' } catch(e) { return '' } }
function _watchDocId(uid, type, id) { return uid + '_' + type + '_' + String(id).replace(/[\/\s]/g, '-') }
async function _fsLoadWatches() {
  try {
    if (!db) return
    const snap = await db.collection('watches').get({ source: 'server' }).catch(() => null)
    if (!snap) return
    const arr = []
    snap.forEach(doc => {
      const d = doc.data()
      if (d && d.uid && d.type && d.id !== undefined) arr.push({ type: d.type, id: d.id, uid: d.uid, name: d.name || '' })
    })
    _watches = arr
    saveWatches()
  } catch(e) { console.warn('_fsLoadWatches failed:', e.message) }
}
window._fsLoadWatches = _fsLoadWatches
function isWatching(type, id) {
  const uid = _myUid()
  return _watches.some(w => w.type === type && String(w.id) === String(id) && w.uid === uid)
}
function toggleWatch(type, id, name) {
  if (id === null || id === undefined || id === '') return
  const uid = _myUid()
  const idx = _watches.findIndex(w => w.type === type && String(w.id) === String(id) && w.uid === uid)
  const docId = _watchDocId(uid, type, id)
  if (idx >= 0) {
    _watches.splice(idx, 1)
    if (typeof showToast === 'function') showToast('워치 해제', 'info')
    try { if (db) db.collection('watches').doc(docId).delete().catch(e => console.warn('watch delete failed:', e.message)) } catch(e) {}
  } else {
    _watches.push({ type, id: String(id), uid, name: name || '' })
    if (typeof showToast === 'function') showToast('워치 등록 — 변경 시 알림', 'success')
    try { if (db) db.collection('watches').doc(docId).set({ type, id: String(id), uid, name: name || '', createdAt: new Date().toISOString() }).catch(e => console.warn('watch set failed:', e.message)) } catch(e) {}
  }
  saveWatches()
  const btnMap = { product:'dWatchBtn', plan:'pdWatchBtn', event:'evWatchBtn', work:'wkWatchBtn' }
  const b = document.getElementById(btnMap[type])
  if (b) {
    const on = isWatching(type, id)
    b.textContent = on ? '💛' : '🤍'
    b.classList.toggle('watch-on', on)
  }
}
function notifyWatchers(type, id, action) {
  const uid = _myUid()
  _watches.filter(w => w.type === type && String(w.id) === String(id) && w.uid !== uid).forEach(w => {
    const who = (typeof formatUserName === 'function' ? formatUserName(_currentUserName, _currentUserPosition) : (_currentUserName || ''))
    addNotification('watch_change', '워치 알림', `${who}님이 ${w.name || id} ${action}`, '#' + type + ':' + id, { targetUid: w.uid })
  })
}
window.toggleWatch = toggleWatch
window.isWatching = isWatching
window.notifyWatchers = notifyWatchers

/* ========== Feature 9: Edit Locks (Firestore 기반 + 로컬 캐시) ========== */
// 동기 API 유지 + Firestore 동기화 — 로컬 캐시에 읽고 쓰고, 쓰기는 Firestore 에도 반영
let _editLocksCache = (() => {
  try { return JSON.parse(localStorage.getItem('lemango_edit_locks_v1') || '{}') } catch(e) { return {} }
})()

async function _fsLoadEditLocks() {
  try {
    if (!db) return
    const snap = await db.collection('editLocks').get({ source: 'server' }).catch(() => null)
    if (!snap) return
    const next = {}
    snap.forEach(doc => {
      const d = doc.data()
      if (d && d.uid && d.since) {
        // 만료된 잠금은 로컬 캐시에서 제외
        if (Date.now() - new Date(d.since).getTime() < 300000) {
          next[doc.id] = { uid: d.uid, name: d.name || '', position: d.position || '', since: d.since }
        } else {
          // 서버에서도 정리
          doc.ref.delete().catch(() => {})
        }
      }
    })
    _editLocksCache = next
    localStorage.setItem('lemango_edit_locks_v1', JSON.stringify(_editLocksCache))
  } catch (e) { console.warn('_fsLoadEditLocks failed:', e.message) }
}
window._fsLoadEditLocks = _fsLoadEditLocks

function acquireEditLock(type, id) {
  const key = type + '_' + id
  const uid = _myUid()
  const existing = _editLocksCache[key]
  if (existing && existing.uid !== uid) {
    const elapsed = Date.now() - new Date(existing.since).getTime()
    if (elapsed < 300000) {
      const lockerName = (typeof formatUserName === 'function' ? formatUserName(existing.name, existing.position) : existing.name)
      if (typeof showToast === 'function') showToast(lockerName + '님이 수정 중입니다.', 'warning')
      return false
    }
  }
  const lockData = { uid, name: _currentUserName || '', position: _currentUserPosition || '', since: new Date().toISOString() }
  _editLocksCache[key] = lockData
  localStorage.setItem('lemango_edit_locks_v1', JSON.stringify(_editLocksCache))
  // Firestore 반영 (fire-and-forget)
  try {
    if (db) db.collection('editLocks').doc(key).set(lockData).catch(e => console.warn('editLock set failed:', e.message))
  } catch(e) {}
  return true
}
function releaseEditLock(type, id) {
  const key = type + '_' + id
  delete _editLocksCache[key]
  localStorage.setItem('lemango_edit_locks_v1', JSON.stringify(_editLocksCache))
  try {
    if (db) db.collection('editLocks').doc(key).delete().catch(e => console.warn('editLock delete failed:', e.message))
  } catch(e) {}
}
function getEditLockInfo(type, id) {
  const key = type + '_' + id
  const lock = _editLocksCache[key]
  if (!lock) return null
  if (lock.uid === _myUid()) return null
  if (Date.now() - new Date(lock.since).getTime() >= 300000) return null
  return lock
}
window.acquireEditLock = acquireEditLock
window.releaseEditLock = releaseEditLock
window.getEditLockInfo = getEditLockInfo
window.renderFavoriteStar = renderFavoriteStar
window.pushModalHistory = pushModalHistory
window.popModalHistory = popModalHistory
window.clearModalHistory = clearModalHistory
window.goBack = goBack
