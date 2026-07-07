// =============================================
// ===== Firestore 공유 데이터 동기화 =====
// =============================================
const _FS_PRODUCT_CHUNK = 150

// Firestore 단일 문서 동기화 — 쓰기 Promise 반환 (호출자가 await/catch 가능)
function _fsSync(key, data) {
  if (!db) return Promise.resolve()
  try {
    return db.collection('sharedData').doc(key).set({
      data: JSON.stringify(data),
      updatedAt: new Date().toISOString()
    })
  } catch (e) {
    return Promise.reject(e)
  }
}

// 저장 실패 공통 핸들러 — 에러 로그 + 사용자 토스트 (저장 실패 안내)
function _onSaveFailed(label, err) {
  console.error(label + ' failed:', err)
  if (typeof showToast === 'function') {
    showToast('저장 실패 — 네트워크를 확인하세요. 새로고침 시 일부 변경이 사라질 수 있습니다.', 'warning')
  }
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

// 반환값: true=쓰기 성공, false=쓰기 실패. db/State 없으면 undefined(쓰기 미수행).
// (기존 호출자는 반환값을 무시하므로 영향 없음. 실패를 await로 분기하려는 호출자만 사용.)
async function saveProducts() {
  if (!db || !State.allProducts) return
  try {
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
    await batch.commit()
    window._lastProductSaveTime = Date.now()
    return true
  } catch (e) {
    _onSaveFailed('saveProducts', e)
    return false
  }
}
window.saveProducts = saveProducts

// 한 뷰의 .filtered를 커밋된 검색조건(State.X.searchCriteria) 기준으로 재구축.
// 검색조건 없으면 전체 목록. 활성 검색이 데이터 갱신(편집/동기화)에도 유지되도록 함.
// 정렬은 렌더에서, 컬럼필터는 applyColFilters에서 적용 → 여기선 검색 narrowing만 담당.
function _reNarrowFiltered(tab) {
  const c = State[tab] && State[tab].searchCriteria
  if (!c) return [...State.allProducts]
  if (tab === 'product' && typeof _narrowProduct === 'function') return _narrowProduct(c)
  if (tab === 'stock'   && typeof _narrowStock   === 'function') return _narrowStock(c)
  if (tab === 'sales'   && typeof _narrowSales   === 'function') return _narrowSales(c)
  return [...State.allProducts]
}
window._reNarrowFiltered = _reNarrowFiltered

// Rebuilds all 3 product view-projection arrays and re-renders all product-derived tables.
// Use after ANY product create/edit/delete so 상품조회/재고관리/매출현황/dashboard stay consistent.
// 활성 검색은 유지(_reNarrowFiltered), 페이지는 보존(여기서 리셋 안 함).
function refreshAllProductViews() {
  State.product.filtered = _reNarrowFiltered('product')
  State.stock.filtered   = _reNarrowFiltered('stock')
  State.sales.filtered   = _reNarrowFiltered('sales')
  if (typeof renderProductTable === 'function') renderProductTable()
  if (typeof renderStockTable === 'function')   renderStockTable()
  if (typeof renderSalesTable === 'function')   renderSalesTable()
  if (typeof renderDashboard === 'function')    renderDashboard()
}
window.refreshAllProductViews = refreshAllProductViews

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
    stores: typeof _stores !== 'undefined' ? _stores : [],
    inboundTypes: typeof _inboundTypes !== 'undefined' ? _inboundTypes : [],
    storeDiscounts: typeof _storeDiscounts !== 'undefined' ? _storeDiscounts : [],
    planItems: State.planItems || [],
    planPhases: typeof _planPhases !== 'undefined' ? _planPhases : null,
    designCodes: typeof _designCodes !== 'undefined' ? _designCodes : [],
    classCodes: typeof _classCodes !== 'undefined' ? _classCodes : [],
    colorMasters: typeof _colorMasters !== 'undefined' ? _colorMasters : [],
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
    if (Array.isArray(fsData.stores) && typeof _stores !== 'undefined') {
      _stores.length = 0; fsData.stores.forEach(s => _stores.push(s))
      localStorage.setItem('lemango_stores_v1', JSON.stringify(_stores))
    }
    if (Array.isArray(fsData.inboundTypes) && typeof _inboundTypes !== 'undefined') {
      _inboundTypes.length = 0; fsData.inboundTypes.forEach(t => _inboundTypes.push(t))
      localStorage.setItem('lemango_inbound_types_v1', JSON.stringify(_inboundTypes))
    }
    if (Array.isArray(fsData.storeDiscounts) && typeof _storeDiscounts !== 'undefined') {
      _storeDiscounts.length = 0; fsData.storeDiscounts.forEach(r => _storeDiscounts.push(r))
      localStorage.setItem('lemango_store_discounts_v1', JSON.stringify(_storeDiscounts))
    }
    if (Array.isArray(fsData.planPhases)) {
      _planPhases = fsData.planPhases
      localStorage.setItem('lemango_plan_phases_v1', JSON.stringify(_planPhases))
    }
    if (Array.isArray(fsData.workCategories)) {
      _workCategories.length = 0; fsData.workCategories.forEach(c => _workCategories.push(c))
      localStorage.setItem('lemango_work_categories_v1', JSON.stringify(_workCategories))
    }
    if (Array.isArray(fsData.colorMasters) && typeof _colorMasters !== 'undefined') {
      _colorMasters.length = 0; fsData.colorMasters.forEach(c => _colorMasters.push(c))
      localStorage.setItem('lemango_color_masters_v1', JSON.stringify(_colorMasters))
    }
    if (Array.isArray(fsData.designCodes) && typeof _designCodes !== 'undefined') {
      _designCodes.length = 0; fsData.designCodes.forEach(c => _designCodes.push(c))
      localStorage.setItem('lemango_design_codes_v1', JSON.stringify(_designCodes))
    }
    if (Array.isArray(fsData.classCodes) && typeof _classCodes !== 'undefined') {
      _classCodes.length = 0; fsData.classCodes.forEach(c => _classCodes.push(c))
      localStorage.setItem('lemango_class_codes_v1', JSON.stringify(_classCodes))
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
// ===== 실시간 동기화 (onSnapshot) =====
// =============================================
let _snapshotUnsubscribes = []
window._lastProductSaveTime = 0
window._lastSharedSaveTime = {}  // { events: ts, workItems: ts, ... }

// 디바운스 타이머들
let _productReloadTimer = null
let _sharedReloadTimer = null
let _postsReloadTimer = null
let _commentsReloadTimer = null
let _attendReloadTimer = null
let _leavesReloadTimer = null
let _usersReloadTimer = null

window.setupRealtimeSync = function() {
  // 기존 리스너 해제 (중복 방지)
  _snapshotUnsubscribes.forEach(u => { try { u() } catch(e) {} })
  _snapshotUnsubscribes = []

  if (!db) { console.warn('[RealtimeSync] db 없음 — 리스너 등록 스킵'); return }

  // 1) sharedData (products_meta + products_* 청크 + 기타 공유 도큐먼트)
  try {
    const u1 = db.collection('sharedData').onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'modified' && ch.type !== 'added') return
        const docId = ch.doc.id
        const data = ch.doc.data()
        if (docId === 'products_meta') { _onProductsChanged(data); return }
        if (docId.startsWith('products_')) return  // 청크 변경은 meta로 트리거
        _onSharedDataChanged(docId, data)
      })
    }, err => console.error('[RealtimeSync] sharedData listener error:', err))
    _snapshotUnsubscribes.push(u1)
  } catch (e) { console.error('[RealtimeSync] sharedData listener setup failed:', e) }

  // 2) posts
  try {
    const u2 = db.collection('posts').onSnapshot(snap => {
      if (snap.docChanges().length > 0) _onPostsChanged()
    }, err => console.error('[RealtimeSync] posts listener error:', err))
    _snapshotUnsubscribes.push(u2)
  } catch (e) { console.error('[RealtimeSync] posts listener setup failed:', e) }

  // 3) notifications (본인 것만)
  try {
    const uid = (firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : null
    if (uid) {
      const u3 = db.collection('notifications').where('uid', '==', uid).onSnapshot(snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type === 'added') _onNewNotification(ch.doc.data())
        })
      }, err => console.error('[RealtimeSync] notifications listener error:', err))
      _snapshotUnsubscribes.push(u3)
    }
  } catch (e) { console.error('[RealtimeSync] notifications listener setup failed:', e) }

  // 4) comments
  try {
    const u4 = db.collection('comments').onSnapshot(snap => {
      if (snap.docChanges().length > 0) _onCommentsChanged()
    }, err => console.error('[RealtimeSync] comments listener error:', err))
    _snapshotUnsubscribes.push(u4)
  } catch (e) { console.error('[RealtimeSync] comments listener setup failed:', e) }

  // 5) attendance
  try {
    const u5 = db.collection('attendance').onSnapshot(snap => {
      if (snap.docChanges().length > 0) _onAttendanceChanged()
    }, err => console.error('[RealtimeSync] attendance listener error:', err))
    _snapshotUnsubscribes.push(u5)
  } catch (e) { console.error('[RealtimeSync] attendance listener setup failed:', e) }

  // 6) leaves
  try {
    const u6 = db.collection('leaves').onSnapshot(snap => {
      if (snap.docChanges().length > 0) _onLeavesChanged()
    }, err => console.error('[RealtimeSync] leaves listener error:', err))
    _snapshotUnsubscribes.push(u6)
  } catch (e) { console.error('[RealtimeSync] leaves listener setup failed:', e) }

  // 7) personalSchedules
  try {
    const u7 = db.collection('personalSchedules').onSnapshot(snap => {
      if (snap.docChanges().length > 0) _onPersonalSchedulesChanged()
    }, err => console.error('[RealtimeSync] personalSchedules listener error:', err))
    _snapshotUnsubscribes.push(u7)
  } catch (e) { console.error('[RealtimeSync] personalSchedules listener setup failed:', e) }

  // 8) users (회원가입/승인/수정/삭제)
  try {
    const u8 = db.collection('users').onSnapshot(snap => {
      if (snap.docChanges().length > 0) _onUsersChanged()
    }, err => console.error('[RealtimeSync] users listener error:', err))
    _snapshotUnsubscribes.push(u8)
  } catch (e) { console.error('[RealtimeSync] users listener setup failed:', e) }

  console.log('[RealtimeSync] ' + _snapshotUnsubscribes.length + '개 리스너 등록 완료')
}

window.teardownRealtimeSync = function() {
  _snapshotUnsubscribes.forEach(u => { try { u() } catch(e) {} })
  _snapshotUnsubscribes = []
  // 디바운스 타이머도 정리
  if (_productReloadTimer) { clearTimeout(_productReloadTimer); _productReloadTimer = null }
  if (_sharedReloadTimer) { clearTimeout(_sharedReloadTimer); _sharedReloadTimer = null }
  if (_postsReloadTimer) { clearTimeout(_postsReloadTimer); _postsReloadTimer = null }
  if (_commentsReloadTimer) { clearTimeout(_commentsReloadTimer); _commentsReloadTimer = null }
  if (_attendReloadTimer) { clearTimeout(_attendReloadTimer); _attendReloadTimer = null }
  if (_leavesReloadTimer) { clearTimeout(_leavesReloadTimer); _leavesReloadTimer = null }
  if (_usersReloadTimer) { clearTimeout(_usersReloadTimer); _usersReloadTimer = null }
  console.log('[RealtimeSync] 리스너 해제 완료')
}

// ── 활성 탭 헬퍼 ──
window._getActiveTab = function() {
  if (typeof State !== 'undefined' && State.activeTab) return State.activeTab
  return (location.hash.replace('#', '').split(':')[0]) || 'dashboard'
}

// ── 상품 변경 ──
window._onProductsChanged = function(meta) {
  if (_productReloadTimer) clearTimeout(_productReloadTimer)
  _productReloadTimer = setTimeout(async () => {
    try {
      // 본인 저장이면 스킵
      const myLastSave = window._lastProductSaveTime || 0
      const serverTime = meta && meta.updatedAt ? new Date(meta.updatedAt).getTime() : 0
      if (serverTime && serverTime <= myLastSave + 500) return
      console.log('[RealtimeSync] 상품 데이터 재로드')
      const fresh = await _fsLoadProducts()
      if (fresh && fresh.length) {
        State.allProducts = fresh
        if (typeof buildBarcodeIndex === 'function') buildBarcodeIndex()  // 타 세션 등록 바코드 즉시 조회 가능
        // 활성 검색 유지하며 .filtered 재구축 (검색조건 없으면 전체)
        State.product.filtered = _reNarrowFiltered('product')
        State.stock.filtered   = _reNarrowFiltered('stock')
        State.sales.filtered   = _reNarrowFiltered('sales')
        // 활성 탭만 즉시 렌더(보이는 화면). 나머지 product/stock/sales 탭은 dirty 표시 →
        // 탭 전환 시 applyTabState에서 재렌더(숨김 테이블 렌더로 인한 sticky/너비 측정 깨짐 방지)
        const tab = _getActiveTab()
        ;['product','stock','sales'].forEach(t => {
          if (t === tab) {
            const fn = { product:'renderProductTable', stock:'renderStockTable', sales:'renderSalesTable' }[t]
            if (typeof window[fn] === 'function') window[fn]()
          } else {
            State[t].needsRerender = true
          }
        })
        if (tab === 'dashboard' && typeof renderDashboard === 'function') renderDashboard()
      }
    } catch(e) { console.error('[RealtimeSync] 상품 재로드 실패:', e) }
  }, 1000)
}

// ── sharedData (events/workItems/planItems/settings/channels/etc.) ──
window._onSharedDataChanged = function(docId, data) {
  if (_sharedReloadTimer) clearTimeout(_sharedReloadTimer)
  _sharedReloadTimer = setTimeout(() => {
    try {
      if (!data || !data.data) return
      // 본인 저장이면 스킵
      const myLastSave = (window._lastSharedSaveTime || {})[docId] || 0
      const serverTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0
      if (serverTime && serverTime <= myLastSave + 500) return

      const parsed = JSON.parse(data.data)
      const tab = _getActiveTab()

      switch(docId) {
        case 'events':
          _events.length = 0
          ;(parsed || []).forEach(e => _events.push(e))
          localStorage.setItem('lemango_events_v1', JSON.stringify(_events))
          if (tab === 'event' && typeof renderEventCalendar === 'function') renderEventCalendar()
          else if (tab === 'dashboard' && typeof renderDashboard === 'function') renderDashboard()
          console.log('[RealtimeSync] 행사일정 동기화')
          break
        case 'workItems':
          _workItems.length = 0
          ;(parsed || []).forEach(w => _workItems.push(w))
          State.workItems = [..._workItems]
          State.work.filtered = [...State.workItems]
          localStorage.setItem('lemango_work_items_v1', JSON.stringify(_workItems))
          if (tab === 'work' && typeof renderWorkCalendar === 'function') renderWorkCalendar()
          else if (tab === 'dashboard' && typeof renderDashboard === 'function') renderDashboard()
          console.log('[RealtimeSync] 업무일정 동기화')
          break
        case 'planItems':
          State.planItems = parsed || []
          State.plan.filtered = State.planItems.filter(p => !p.confirmed)
          localStorage.setItem('lemango_plan_items_v1', JSON.stringify(State.planItems))
          if (tab === 'plan' && typeof renderPlanTable === 'function') renderPlanTable()
          else if (tab === 'dashboard' && typeof renderDashboard === 'function') renderDashboard()
          console.log('[RealtimeSync] 기획 동기화')
          break
        case 'settings':
          Object.keys(_settings).forEach(k => delete _settings[k])
          Object.assign(_settings, parsed || {})
          localStorage.setItem('lemango_settings_v1', JSON.stringify(_settings))
          if (typeof populateAllSelects === 'function') populateAllSelects()
          console.log('[RealtimeSync] 설정 동기화')
          break
        case 'channels':
          _channels.length = 0
          ;(parsed || []).forEach(c => _channels.push(c))
          _platforms = _channels.filter(c => c.active).map(c => c.name)
          localStorage.setItem('lemango_channels_v1', JSON.stringify(_channels))
          localStorage.setItem('lemango_platforms_v1', JSON.stringify(_platforms))
          if (typeof populateAllSelects === 'function') populateAllSelects()
          console.log('[RealtimeSync] 채널 동기화')
          break
        case 'depts':
          if (typeof _depts !== 'undefined') {
            _depts.length = 0; (parsed || []).forEach(d => _depts.push(d))
            localStorage.setItem('lemango_depts_v1', JSON.stringify(_depts))
            if (typeof populateAllSelects === 'function') populateAllSelects()
          }
          console.log('[RealtimeSync] 부서 동기화')
          break
        case 'stores':
          if (typeof _stores !== 'undefined') {
            _stores.length = 0; (parsed || []).forEach(s => _stores.push(s))
            localStorage.setItem('lemango_stores_v1', JSON.stringify(_stores))
            if (typeof populateAllSelects === 'function') populateAllSelects()
            if (tab === 'settings' && typeof renderSettings === 'function') renderSettings()
          }
          console.log('[RealtimeSync] 매장 동기화')
          break
        case 'inboundTypes':
          if (typeof _inboundTypes !== 'undefined') {
            _inboundTypes.length = 0; (parsed || []).forEach(t => _inboundTypes.push(t))
            localStorage.setItem('lemango_inbound_types_v1', JSON.stringify(_inboundTypes))
            if (typeof populateAllSelects === 'function') populateAllSelects()
            if (tab === 'settings' && typeof renderSettings === 'function') renderSettings()
          }
          console.log('[RealtimeSync] 입고 유형 동기화')
          break
        case 'storeDiscounts':
          if (typeof _storeDiscounts !== 'undefined') {
            _storeDiscounts.length = 0; (parsed || []).forEach(r => _storeDiscounts.push(r))
            localStorage.setItem('lemango_store_discounts_v1', JSON.stringify(_storeDiscounts))
            if (tab === 'settings' && typeof renderSettings === 'function') renderSettings()
            // 5-1 할인 관리 UI 이전: 매장 탭 '매장 할인 상품 관리' 서브탭이 열려 있으면 재렌더(패널 없으면 no-op)
            if (typeof renderStoreDiscountPanel === 'function') renderStoreDiscountPanel()
          }
          console.log('[RealtimeSync] 매장 할인 동기화')
          break
        case 'workCategories':
          _workCategories.length = 0
          ;(parsed || []).forEach(c => _workCategories.push(c))
          localStorage.setItem('lemango_work_categories_v1', JSON.stringify(_workCategories))
          console.log('[RealtimeSync] 업무 카테고리 동기화')
          break
        case 'designCodes':
          if (typeof _designCodes !== 'undefined') {
            _designCodes.length = 0; (parsed || []).forEach(c => _designCodes.push(c))
            localStorage.setItem('lemango_design_codes_v1', JSON.stringify(_designCodes))
          }
          console.log('[RealtimeSync] 디자인코드 동기화')
          break
        case 'classCodes':
          if (typeof _classCodes !== 'undefined') {
            _classCodes.length = 0; (parsed || []).forEach(c => _classCodes.push(c))
            localStorage.setItem('lemango_class_codes_v1', JSON.stringify(_classCodes))
            if (typeof populateAllSelects === 'function') populateAllSelects()
          }
          console.log('[RealtimeSync] 분류코드 동기화')
          break
        case 'planPhases':
          _planPhases = parsed || []
          localStorage.setItem('lemango_plan_phases_v1', JSON.stringify(_planPhases))
          console.log('[RealtimeSync] 기획 단계 동기화')
          break
        case 'allowedIps':
          if (typeof _allowedIps !== 'undefined') {
            _allowedIps.length = 0; (parsed || []).forEach(ip => _allowedIps.push(ip))
            localStorage.setItem('lemango_allowed_ips_v1', JSON.stringify(_allowedIps))
          }
          break
        case 'ipEnforceMode':
          if (typeof parsed === 'string') {
            _ipEnforceMode = parsed
            localStorage.setItem('lemango_ip_enforce_v1', _ipEnforceMode)
          }
          break
        case 'productHistory':
          if (typeof _saveProductHistoryLocal === 'function') _saveProductHistoryLocal(parsed)
          break
        default:
          console.log('[RealtimeSync] 기타 sharedData:', docId)
      }
    } catch(e) { console.error('[RealtimeSync] sharedData 처리 오류:', docId, e) }
  }, 500)
}

window._onPostsChanged = function() {
  if (_postsReloadTimer) clearTimeout(_postsReloadTimer)
  _postsReloadTimer = setTimeout(() => {
    const tab = _getActiveTab()
    if (tab === 'board' && typeof loadBoardPosts === 'function') {
      loadBoardPosts()
      console.log('[RealtimeSync] 게시판 동기화')
    } else if (tab === 'dashboard' && typeof renderDashNotice === 'function') {
      try { renderDashNotice() } catch(e) {}
    }
  }, 1000)
}

window._onCommentsChanged = function() {
  if (_commentsReloadTimer) clearTimeout(_commentsReloadTimer)
  _commentsReloadTimer = setTimeout(() => {
    // 열려있는 모달의 댓글 섹션을 다시 로드
    const openDialogs = document.querySelectorAll('dialog[open]')
    openDialogs.forEach(d => {
      const sec = d.querySelector('.comment-section[data-modal-type][data-target-id]')
      if (sec && typeof loadComments === 'function') {
        try { loadComments(sec.dataset.modalType, sec.dataset.targetId) } catch(e) {}
      }
    })
    console.log('[RealtimeSync] 댓글 동기화')
  }, 1000)
}

window._onNewNotification = function() {
  if (typeof _fsLoadNotifications === 'function') _fsLoadNotifications()
  else if (typeof renderNotifications === 'function') renderNotifications()
}

window._onAttendanceChanged = function() {
  if (_attendReloadTimer) clearTimeout(_attendReloadTimer)
  _attendReloadTimer = setTimeout(() => {
    if (typeof loadHrData === 'function') loadHrData().catch(()=>{})
    if (_getActiveTab() === 'hradmin' && typeof renderHrAdminContent === 'function') {
      try { renderHrAdminContent() } catch(e) {}
    }
    console.log('[RealtimeSync] 출퇴근 동기화')
  }, 1000)
}

window._onLeavesChanged = function() {
  if (_leavesReloadTimer) clearTimeout(_leavesReloadTimer)
  _leavesReloadTimer = setTimeout(() => {
    if (typeof loadHrData === 'function') loadHrData().catch(()=>{})
    const tab = _getActiveTab()
    if (tab === 'hradmin' && typeof renderHrAdminContent === 'function') {
      try { renderHrAdminContent() } catch(e) {}
    } else if (tab === 'mypage' && typeof renderMyPage === 'function') {
      try { renderMyPage() } catch(e) {}
    }
    console.log('[RealtimeSync] 연차 동기화')
  }, 1000)
}

window._onPersonalSchedulesChanged = function() {
  if (_getActiveTab() === 'work' && typeof loadPersonalSchedules === 'function') {
    loadPersonalSchedules()
    console.log('[RealtimeSync] 개인일정 동기화')
  }
}

window._onUsersChanged = function() {
  if (_usersReloadTimer) clearTimeout(_usersReloadTimer)
  _usersReloadTimer = setTimeout(() => {
    // _allUsers 캐시 강제 재로드 (멘션·담당자·조직도가 즉시 신규/변경 사용자 반영)
    const refresh = (typeof loadAllUsers === 'function')
      ? loadAllUsers(true).catch(err => console.warn('[RealtimeSync] loadAllUsers failed:', err))
      : Promise.resolve()
    refresh.then(() => {
      const tab = _getActiveTab()
      // 회원관리 패널이 표시 중일 때만 테이블 다시 로드 (hradmin 의 sub-panel)
      const memberPanel = document.getElementById('memberListPanel')
      const memberPanelVisible = memberPanel && memberPanel.style.display !== 'none'
      if (tab === 'hradmin' && memberPanelVisible && typeof loadMembers === 'function') {
        try { loadMembers() } catch (e) {}
      }
      // 조직도 탭: 즉시 재렌더 (_allUsers 기반)
      if (tab === 'orgchart' && typeof renderOrgChart === 'function') {
        try { renderOrgChart() } catch (e) {}
      }
      console.log('[RealtimeSync] 회원 동기화')
    })
  }, 1000)
}

// =============================================
// ===== 공통 상수 =====
// =============================================
const PLACEHOLDER_IMG = 'assets/logo-placeholder.png'
window.PLACEHOLDER_IMG = PLACEHOLDER_IMG
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'F']

// === 사이즈 규격 — 단일 소스 (앱 전역) ===
// 데이터 구조: { XS:{bust,waist,hip}, S:{...}, ..., XXL:{...}, F:{bust} }
// 측정 부위(parts)를 추가/변경하려면 SIZE_SPEC_PARTS 한 곳만 수정하면 화면/엑셀이 자동 반영된다.
const SIZE_SPEC_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']   // utils.js 에서 이관
const SIZE_SPEC_PARTS = [
  { key: 'torso',    label: '토르소', excel: '토르소' }, // 최좌측
  { key: 'bust',     label: '가슴',   excel: '가슴' },
  { key: 'waist',    label: '허리',   excel: '허리' },
  { key: 'hip',      label: '엉덩이', excel: '엉덩이' },
  { key: 'length',   label: '총장',   excel: '총장' },   // Phase B 추가
  { key: 'shoulder', label: '어깨',   excel: '어깨' },   // Phase B 추가
  { key: 'sleeve',   label: '소매',   excel: '소매' },   // Phase B 추가
  { key: 'hem',      label: '밑단',   excel: '밑단' },   // Phase B 추가
  { key: 'lengthTop',    label: '총장(상)',   excel: '총장(상)' },   // 비키니 상의
  { key: 'underBust',    label: '밑가슴',     excel: '밑가슴' },     // 비키니 상의
  { key: 'cupWidth',     label: '컵가로',     excel: '컵가로' },     // 비키니 컵 (밑가슴 우측)
  { key: 'cupHeight',    label: '컵세로',     excel: '컵세로' },     // 비키니 컵 (밑가슴 우측)
  { key: 'lengthBottom', label: '총장(하)',   excel: '총장(하)' },   // 비키니 하의
  { key: 'thighWidth',   label: '허벅지단면', excel: '허벅지단면' }, // 비키니 하의
  { key: 'frontWaist',   label: '앞허리',     excel: '앞허리' },     // 비키니 하의
  { key: 'backWaist',    label: '뒤허리',     excel: '뒤허리' },     // 비키니 하의
]

// 엑셀 사이즈규격 컬럼 생성기 — 사이즈규격 컬럼은 반드시 이 함수로만 생성한다 (triple-list desync 방지)
function buildSizeSpecColumns() {
  const cols = []
  SIZE_SPEC_SIZES.forEach(sz =>
    SIZE_SPEC_PARTS.forEach(pt =>
      cols.push({ key: `sizeSpec_${sz}_${pt.key}`, label: `${sz} ${pt.excel}` })))
  cols.push({ key: 'sizeSpec_F', label: 'F' })   // F 는 단일값 유지 (decision)
  return cols
}

// 업로드 헤더 → part key 매칭용 라벨맵 (SIZE_SPEC_PARTS 에서 파생)
const SIZE_SPEC_PART_LABEL = Object.fromEntries(SIZE_SPEC_PARTS.map(p => [p.key, p.excel]))

// 빈 part 객체 생성 ({bust:'',waist:'',hip:''} 와 동등, 부위 추가 시 자동 확장)
function emptySizeSpecParts() {
  return Object.fromEntries(SIZE_SPEC_PARTS.map(p => [p.key, '']))
}

// 값이 1개 이상 존재하는 측정부위만 반환 (Phase C: 보기/HTML 빈항목 제외 — item-level)
// activeSizes 범위 내에서만 판정 → 제외된 사이즈에만 값이 있는 부위는 되살아나지 않음
function getActiveParts(sizeSpec, activeSizes) {
  return SIZE_SPEC_PARTS.filter(pt =>
    (activeSizes || []).some(sz => sizeSpec && sizeSpec[sz] && String(sizeSpec[sz][pt.key] ?? '').trim() !== ''))
}

// 샘플 엑셀 예시 셀 값 (part key 기준, 미정의 부위는 '')
const SIZE_SPEC_SAMPLE = { torso: '130', bust: '48', waist: '38', hip: '52', length: '68', shoulder: '37', sleeve: '58', hem: '45', lengthTop: '32', lengthBottom: '24', underBust: '40', thighWidth: '28', cupWidth: '13', cupHeight: '15', frontWaist: '30', backWaist: '32' }

// 방어적 window 미러
window.SIZE_SPEC_SIZES = SIZE_SPEC_SIZES
window.SIZE_SPEC_PARTS = SIZE_SPEC_PARTS
window.buildSizeSpecColumns = buildSizeSpecColumns
window.SIZE_SPEC_PART_LABEL = SIZE_SPEC_PART_LABEL
window.emptySizeSpecParts = emptySizeSpecParts
window.getActiveParts = getActiveParts
window.SIZE_SPEC_SAMPLE = SIZE_SPEC_SAMPLE

// 컬럼 수 드리프트 감지 (사이즈×부위 + F)
console.assert(
  buildSizeSpecColumns().length === SIZE_SPEC_SIZES.length * SIZE_SPEC_PARTS.length + 1,
  'size-spec column count drift'
)

// =============================================
// ===== 바코드 역인덱스 (barcode → {productCode, size}) — POS Phase 0 =====
// =============================================
// State.allProducts 의 p.barcodes(사이즈별 객체)를 스캔하여 바코드→상품/사이즈 O(1) 조회 Map 구축.
// POS 스캔(scan-to-find)의 기반. 로드/실시간동기화/바코드 업로드 후 재구축한다.
// 규모: 798상품 × 7사이즈 = 약 5,586엔트리 — 재구축 비용 무시 가능.
const _barcodeIndex = new Map()      // barcode(string) → { productCode, size }
let _barcodeCollisions = []          // [{ barcode, existing:{productCode,size}, dupe:{productCode,size} }]

function buildBarcodeIndex() {
  _barcodeIndex.clear()
  _barcodeCollisions = []
  ;(State.allProducts || []).forEach(p => {
    if (!p || p.deleted === true || !p.barcodes) return
    SIZES.forEach(sz => {
      const bc = String(p.barcodes[sz] || '').trim()
      if (!bc) return
      if (_barcodeIndex.has(bc)) {
        // 동일 바코드가 2개 상품/사이즈에 등록됨 — 데이터 정합성 문제
        _barcodeCollisions.push({
          barcode: bc,
          existing: _barcodeIndex.get(bc),
          dupe: { productCode: p.productCode, size: sz }
        })
      } else {
        _barcodeIndex.set(bc, { productCode: p.productCode, size: sz })
      }
    })
  })
  State.barcodeIndex = _barcodeIndex
  if (_barcodeCollisions.length) {
    console.warn('[BarcodeIndex] 바코드 충돌 ' + _barcodeCollisions.length + '건 (동일 바코드가 복수 상품/사이즈에 등록):', _barcodeCollisions)
  }
  return { idx: _barcodeIndex, collisions: _barcodeCollisions }
}
window.buildBarcodeIndex = buildBarcodeIndex

// 바코드 1건 조회 — POS 스캔이 호출. O(1). 미등록이면 null.
function findByBarcode(barcode) {
  const bc = String(barcode || '').trim()
  if (!bc) return null
  return _barcodeIndex.get(bc) || null
}
window.findByBarcode = findByBarcode

function getBarcodeCollisions() { return _barcodeCollisions.slice() }
window.getBarcodeCollisions = getBarcodeCollisions

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
// POS Phase 1b — 현재 사용자 매장 캐시 + 관리자 스위처 오버라이드
let _currentUserStoreId = ''    // 로그인 시 users.storeId 에서 캐시 (staff = 고정 매장)
let _storeViewOverride = ''     // 관리자(grade>=3) 스위처가 선택한 매장 (1c 에서 설정, 여기선 선언만)

// 활성 매장 중 첫 번째 id (관리자 매장 미배정 시 기본값)
function firstActiveStoreId() {
  const list = (typeof getActiveStores === 'function') ? getActiveStores() : []
  return list.length ? list[0].id : null
}

// 현재 보고 있는 매장 id 를 결정하는 POS 핵심 프리미티브.
//   - 관리자(grade>=3): 스위처 오버라이드 우선, 없으면 첫 활성 매장
//   - staff(grade<3)  : 본인 배정 매장 (미배정이면 null)
// storeStock/storeSales 읽기·쓰기(1d~), 재고현황 뷰(1f) 등 POS 전체가 이 함수로 매장을 정함.
function resolveActiveStore() {
  const grade = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  if (grade >= 3) {
    // self-heal: 오버라이드가 현재 활성 매장 목록에 없으면(소프트 비활성/삭제됨) 리셋 → 표시/오버라이드 desync 방지
    if (_storeViewOverride) {
      const active = (typeof getActiveStores === 'function') ? getActiveStores() : []
      if (!active.some(s => s.id === _storeViewOverride)) _storeViewOverride = ''
    }
    return _storeViewOverride || firstActiveStoreId()
  }
  return _currentUserStoreId || null
}

window.firstActiveStoreId = firstActiveStoreId
window.resolveActiveStore = resolveActiveStore

// =============================================
// ===== 탭 접근 권한 (등급 기반) =====
// =============================================
// 1=담당자, 2=부서장, 3=관리자, 4=시스템관리자
const TAB_PERMISSIONS = {
  dashboard: 1, product: 1, stock: 1, sales: 1, plan: 1,
  event: 1, work: 1, board: 1, orgchart: 1, mypage: 1,
  store: 1,   // POS 매장 탭 — 조회는 전 직원 개방(권한 방침), 작업 화면은 내부에서 게이트(Phase 3~). 물류 발주 확인(R2)=매장 서브탭(07-07 이전)
  hradmin: 2, trash: 3, settings: 4,
  // members: 제거됨 — hradmin 의 sub-panel(memberListPanel)로 통합. 진입은 hradmin 권한으로 충분
  // trash: 휴지통 — 소프트 삭제된 상품 복원/영구삭제 (Grade 3+ admin only)
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
async function savePlanPhases() {
  localStorage.setItem(PLAN_PHASES_KEY, JSON.stringify(_planPhases || []))
  try {
    await _fsSync('planPhases', _planPhases || [])
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['planPhases'] = Date.now()
  } catch (e) {
    _onSaveFailed('savePlanPhases', e)
  }
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

async function saveChannels() {
  _platforms = _channels.filter(c => c.active).map(c => c.name)
  // localStorage 캐시 (즉시)
  localStorage.setItem('lemango_channels_v1', JSON.stringify(_channels))
  savePlatforms()
  // Firestore 주 저장소
  try {
    await _fsSync('channels', _channels)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['channels'] = Date.now()
  } catch (e) {
    _onSaveFailed('saveChannels', e)
  }
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

async function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(_settings))
  try {
    await _fsSync('settings', _settings)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['settings'] = Date.now()
  } catch (e) {
    _onSaveFailed('saveSettings', e)
  }
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

async function saveDepts() {
  localStorage.setItem('lemango_depts_v1', JSON.stringify(_depts))
  try {
    await _fsSync('depts', _depts)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['depts'] = Date.now()
  } catch (e) {
    _onSaveFailed('saveDepts', e)
  }
}

// =============================================
// ===== 매장 관리 (POS Phase 1a) =====
// =============================================
// _stores: [{ id, name, active, order, location }]
//   - id      : 안정적·불변·재사용 금지. storeStock/storeSales 가 이 id 를 참조 (1d~)
//   - name    : 표시명 (수정 가능)
//   - active  : soft-disable 플래그 (데이터 있는 매장은 hard-delete 금지)
//   - order   : 표시 순서
//   - location: 자유 텍스트 (향후 사용, 지금은 빈값 무해)
// _depts 패턴을 그대로 미러링하되, flat string[] 이 아니라 stable id 를 가진 객체 배열.
const DEFAULT_STORES = [
  { id: 'st1', name: '부산점', active: true, order: 1, location: '' },
  { id: 'st2', name: '성남점', active: true, order: 2, location: '' }
]

let _stores = (() => {
  try {
    const saved = localStorage.getItem('lemango_stores_v1')
    return saved ? JSON.parse(saved) : DEFAULT_STORES.map(s => ({ ...s }))
  } catch { return DEFAULT_STORES.map(s => ({ ...s })) }
})()

async function saveStores() {
  localStorage.setItem('lemango_stores_v1', JSON.stringify(_stores))
  try {
    await _fsSync('stores', _stores)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['stores'] = Date.now()
  } catch (e) {
    _onSaveFailed('saveStores', e)
  }
}

// 안정적 매장 ID 생성: st + (모든 매장 중 최대 숫자 접미사 + 1).
// ⚠️ soft-disable 된 매장도 _stores 에 남아있으므로 max 계산에 포함 → ID 재사용 방지.
// (데이터 있는 매장은 hard-delete 불가 → 배열에 남음 → ID 영구 점유. empty 매장만 hard-delete 되고
//  그 ID 재사용은 참조 데이터가 없어 안전.)
function generateStoreId() {
  let maxN = 0
  ;(_stores || []).forEach(s => {
    const m = /^st(\d+)$/.exec(s.id || '')
    if (m) { const n = parseInt(m[1], 10); if (n > maxN) maxN = n }
  })
  return 'st' + (maxN + 1)
}

// 운영용 선택자(1b 회원배정·1c 스위처)에서 쓸 활성 매장 목록 (order 순).
function getActiveStores() {
  return (_stores || []).filter(s => s && s.active).sort((a, b) => (a.order || 0) - (b.order || 0))
}

// 매장 삭제 가드용 프로브 — 해당 매장에 재고/매출 데이터가 있는지 확인.
// storeStock/storeSales 컬렉션은 1d~ 에서 생성됨. 존재하지 않는 컬렉션 쿼리는 빈 결과 반환(에러 아님)이므로
// 지금은 항상 false 반환하지만, 1d/1e 가 데이터를 넣으면 코드 변경 없이 자동으로 동작.
async function storeHasData(storeId) {
  if (!db || !storeId) return false
  try {
    const stockSnap = await db.collection('storeStock').where('storeId', '==', storeId).limit(1).get()
    if (!stockSnap.empty) return true
    const salesSnap = await db.collection('storeSales').where('storeId', '==', storeId).limit(1).get()
    if (!salesSnap.empty) return true
    return false
  } catch (e) {
    // 조회 실패(권한/네트워크) 시 안전측: 데이터 있다고 간주 → hard-delete 차단 → soft-disable 유도
    console.warn('storeHasData 조회 실패, 안전상 삭제 차단:', e.message)
    return true
  }
}

window.getActiveStores = getActiveStores
window.generateStoreId = generateStoreId
window.storeHasData = storeHasData

// =============================================
// ===== 입고 유형 설정 (POS — _stores 패턴 미러) =====
// =============================================
// _inboundTypes: [{ id, name, active, order }] — 입고가 왜 들어왔는지(신규/조정/이관). "입고취소"는 유형 아님(별도 cancelled 상태).
//   id: 안정적·불변·재사용 금지 / name: 표시명(수정 가능) / active: soft-disable / order: 순서
//   ⚠️ storeInbound.inboundType 에는 확정 시점의 name(라벨)을 스냅샷 저장 → 이후 rename 돼도 원본 이력 보존(감사).
const DEFAULT_INBOUND_TYPES = [
  { id: 'it1', name: '신규입고', active: true, order: 1 },
  { id: 'it2', name: '조정입고', active: true, order: 2 },
  { id: 'it3', name: '이관입고', active: true, order: 3 }
]

let _inboundTypes = (() => {
  try {
    const saved = localStorage.getItem('lemango_inbound_types_v1')
    return saved ? JSON.parse(saved) : DEFAULT_INBOUND_TYPES.map(t => ({ ...t }))
  } catch { return DEFAULT_INBOUND_TYPES.map(t => ({ ...t })) }
})()

async function saveInboundTypes() {
  localStorage.setItem('lemango_inbound_types_v1', JSON.stringify(_inboundTypes))
  try {
    await _fsSync('inboundTypes', _inboundTypes)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['inboundTypes'] = Date.now()
  } catch (e) {
    _onSaveFailed('saveInboundTypes', e)
  }
}

// 안정적 유형 ID 생성: it + (모든 유형 중 최대 숫자 접미사 + 1). soft-disable 포함 → 재사용 방지.
function generateInboundTypeId() {
  let maxN = 0
  ;(_inboundTypes || []).forEach(t => {
    const m = /^it(\d+)$/.exec(t.id || '')
    if (m) { const n = parseInt(m[1], 10); if (n > maxN) maxN = n }
  })
  return 'it' + (maxN + 1)
}

// 활성 유형 목록 (order 순) — 확정 드롭다운/이력 필터가 사용.
function getActiveInboundTypes() {
  return (_inboundTypes || []).filter(t => t && t.active).sort((a, b) => (a.order || 0) - (b.order || 0))
}

// ===== 매장 할인 규칙 (POS Phase 5-1) — condition×benefit 프레임워크(설계 pos-phase5-discount-design.md) =====
// _storeDiscounts: [{ id, name, active, condition{type,productCode…}, benefit{type,value|price}, period{start,end}, storeScope, priority, order }]
//   5-1 = condition.type:'product' + benefit.type:'percent'|'fixed'. 스키마는 5-2~5-4(category/brand/total/qty/combo · amount/nplus/bundle) 확장 대비 — 타입만 추가.
//   inboundTypes/stores 패턴 미러(메모리 var + localStorage + _fsSync + onSnapshot). DEFAULT=빈 배열.
let _storeDiscounts = (() => {
  try { const s = localStorage.getItem('lemango_store_discounts_v1'); return s ? JSON.parse(s) : [] } catch { return [] }
})()

async function saveStoreDiscounts() {
  localStorage.setItem('lemango_store_discounts_v1', JSON.stringify(_storeDiscounts))
  try {
    await _fsSync('storeDiscounts', _storeDiscounts)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['storeDiscounts'] = Date.now()
  } catch (e) { _onSaveFailed('saveStoreDiscounts', e) }
}

// 안정적 규칙 ID: sd + (최대 접미사 + 1). soft-disable 포함 → 재사용 금지.
function generateDiscountId() {
  let maxN = 0
  ;(_storeDiscounts || []).forEach(r => { const m = /^sd(\d+)$/.exec(r.id || ''); if (m) { const n = parseInt(m[1], 10); if (n > maxN) maxN = n } })
  return 'sd' + (maxN + 1)
}

// 판매 엔진용 필터 — 활성 + 기간(KST 오늘 포함) + 매장(storeScope) 통과 규칙만.
//   period.start/end 는 KST dateKey(YYYY-MM-DD, inclusive), 빈값=제한 없음. storeScope='all' | storeId | [storeId…].
//   ⚠️ kstDateKey 는 store.js(나중 로드) 정의 → 호출 시점(판매 중)엔 존재. typeof 가드.
function getActiveDiscounts(store, dateKey) {
  const today = dateKey || ((typeof kstDateKey === 'function') ? kstDateKey() : '')
  return (_storeDiscounts || []).filter(r => {
    if (!r || r.active === false) return false
    const p = r.period || {}
    if (p.start && today && today < p.start) return false
    if (p.end && today && today > p.end) return false
    const sc = r.storeScope
    if (sc && sc !== 'all') {
      if (Array.isArray(sc)) { if (store && sc.indexOf(store) < 0) return false }
      else if (sc !== store) return false
    }
    return true
  })
}
window.getActiveDiscounts = getActiveDiscounts

// 삭제 가드 프로브 — 해당 유형(name)을 쓰는 storeInbound 가 있는지. 있으면 hard-delete 금지 → soft-disable 유도.
async function inboundTypeHasData(typeName) {
  if (!db || !typeName) return false
  try {
    const snap = await db.collection('storeInbound').where('inboundType', '==', typeName).limit(1).get()
    return !snap.empty
  } catch (e) {
    console.warn('inboundTypeHasData 조회 실패, 안전상 삭제 차단:', e.message)
    return true
  }
}

window.getActiveInboundTypes = getActiveInboundTypes
window.generateInboundTypeId = generateInboundTypeId
window.inboundTypeHasData = inboundTypeHasData
window.saveInboundTypes = saveInboundTypes

// 로케이션 정규화 (유령 로케이션 방지) — 모든 위치 쓰기의 choke point.
// trim + 내부 공백 제거 + 영문 대문자화(한글/숫자/하이픈은 그대로). 예: " aa-01 "→"AA-01", "AA -01"→"AA-01"
function normalizeLocation(loc) {
  return String(loc == null ? '' : loc).trim().replace(/\s+/g, '').toUpperCase()
}
window.normalizeLocation = normalizeLocation

// =============================================
// ===== 매장 재고 데이터 모델 (POS Phase 1d) =====
// =============================================
// 컬렉션 storeStock/{storeId}_{productCode} — 매장별·상품별 1문서.
//   { storeId, productCode, sizes:{XS..2XL,F}, location, updatedAt }
// ⚠️ 안전 3원칙:
//   1) 원자적 차감/증가는 FieldValue.increment (read-modify-write += 절대 금지 — 동시성 유실)
//   2) set({merge:true}) 사용 (update() 금지 — 문서 없으면 throw). merge+increment 는 문서/필드 자동 생성(0부터)
//   3) 모든 write 에 storeId 포함 (Firestore 규칙 + 쿼리가 의존)
// SIZES 는 앱 전역 상수(2XL 포함) 재사용 — 별도 키 도입 금지.

// 매장 재고 인메모리 인덱스: { [storeId]: { [productCode]: sizesObj } }
let _storeStockIndex = {}
// POS Phase 6c — 불량재고 인덱스 {store:{code:{size:qty}}}. _storeStockIndex(정상)과 완전 분리 — 판매/1f 정상재고 math 에 절대 안 섞임.
let _storeDefectIndex = {}
// 매장 위치(로케이션) 인메모리 인덱스 — 재고 인덱스와 별개 병렬 맵 (POS Phase 2a).
// { [storeId]: { [productCode]: { [size]: '위치라벨' } } }. 재고 읽기(getStoreStock/1f)에 영향 없음.
let _storeLocIndex = {}

// 복합 문서 ID. productCode 는 언더스코어 없음(데이터 검증 완료) → 첫 '_' 분리 안전.
function storeStockDocId(storeId, code) {
  return String(storeId || '') + '_' + String(code || '')
}

// 빈 사이즈 맵 (0 채움) — 문서 없을 때 기본값
function _emptyStoreSizes() {
  return Object.fromEntries(SIZES.map(sz => [sz, 0]))
}

// 원자적 재고 변경 (판매 -qty / 입고·조정 +qty). merge-set + increment.
// size 는 SIZES 에 포함돼야 하며, storeId/code 필수. 실패 시 false 반환(throw 안 함).
async function writeStoreStock(storeId, code, size, delta) {
  if (!db) { console.warn('writeStoreStock: db 없음'); return false }
  if (!storeId || !code) { console.warn('writeStoreStock: storeId/code 필수'); return false }
  if (!SIZES.includes(size)) { console.warn('writeStoreStock: 잘못된 사이즈', size); return false }
  const n = Number(delta)
  if (!isFinite(n) || n === 0) { console.warn('writeStoreStock: delta 무효', delta); return false }
  try {
    await db.collection('storeStock').doc(storeStockDocId(storeId, code)).set({
      storeId: storeId,
      productCode: code,
      sizes: { [size]: firebase.firestore.FieldValue.increment(n) },
      updatedAt: new Date().toISOString()
    }, { merge: true })
    return true
  } catch (e) {
    console.error('writeStoreStock 실패:', e.message)
    return false
  }
}

// 위치(로케이션) 라벨 덮어쓰기 (POS Phase 2a). ⚠️ increment 아님 — merge-set 로 sizeLocations[size] 만 교체.
// sizes(재고)는 절대 건드리지 않음 — 1d 원자적 재고 코어와 완전 분리. storeId 포함(규칙 의존).
// code 는 writeStoreStock 과 동일하게 그대로 사용(호출부가 정규 productCode 로 해석) → 같은 문서 대상.
// 빈 위치는 쓰지 않음(위치 지우기는 Phase 2 범위 밖). 실패 시 false 반환(throw 안 함).
async function setStoreStockLocation(storeId, code, size, location) {
  if (!db) { console.warn('setStoreStockLocation: db 없음'); return false }
  if (!storeId || !code) { console.warn('setStoreStockLocation: storeId/code 필수'); return false }
  if (!SIZES.includes(size)) { console.warn('setStoreStockLocation: 잘못된 사이즈', size); return false }
  const loc = String(location || '').trim()
  if (!loc) { console.warn('setStoreStockLocation: 빈 위치 무시'); return false }
  try {
    await db.collection('storeStock').doc(storeStockDocId(storeId, code)).set({
      storeId: storeId,
      productCode: code,
      sizeLocations: { [size]: loc },
      updatedAt: new Date().toISOString()
    }, { merge: true })
    // 인메모리 위치 인덱스 즉시 반영 — 버킷이 없으면 생성(read-after-write 가 rebuild 없이 동작).
    // ⚠️ 위치 인덱스만 갱신 — 재고 인덱스(_storeStockIndex)/getStoreStock 은 건드리지 않음.
    _storeLocIndex[storeId] = _storeLocIndex[storeId] || {}
    _storeLocIndex[storeId][code] = _storeLocIndex[storeId][code] || {}
    _storeLocIndex[storeId][code][size] = loc
    return true
  } catch (e) {
    console.error('setStoreStockLocation 실패:', e.message)
    return false
  }
}

// 매장 전체 재고 로드 — where(storeId) + 캐시 폴백(서버 우선, 실패 시 기본 캐시).
// 반환: [{ productCode, sizes, sizeLocations, updatedAt, storeId }]
async function loadStoreStock(storeId) {
  if (!db || !storeId) return []
  const q = db.collection('storeStock').where('storeId', '==', storeId)
  let snap = null
  try {
    snap = await q.get({ source: 'server' })
  } catch (e) {
    try { snap = await q.get() } catch (e2) { console.warn('loadStoreStock 실패:', e2.message); return [] }
  }
  const rows = []
  snap.forEach(doc => {
    const d = doc.data() || {}
    rows.push({
      productCode: d.productCode || '',
      storeId: d.storeId || storeId,
      sizes: Object.assign(_emptyStoreSizes(), d.sizes || {}),
      defectSizes: Object.assign(_emptyStoreSizes(), d.defectSizes || {}),   // POS Phase 6c — 불량재고(판매불가) 병렬 버킷. 절대 sizes 와 합산 안 함
      sizeLocations: d.sizeLocations || {},   // POS Phase 2a — 기존 whole-doc location(미사용) 대체
      updatedAt: d.updatedAt || ''
    })
  })
  return rows
}

// 인메모리 인덱스 구축 (매장별). buildBarcodeIndex 선례 미러. 재고현황 뷰(1f)/업로드(1e) 확정 후 호출.
// 재고 인덱스(_storeStockIndex)는 기존과 동일 — getStoreStock/1f 동작 불변.
// 위치 인덱스(_storeLocIndex)는 병렬로 추가만 함(POS Phase 2a) — 재고 읽기에 영향 없음.
async function buildStoreStockIndex(storeId) {
  if (!storeId) return {}
  const rows = await loadStoreStock(storeId)
  const map = {}
  const locMap = {}
  const defMap = {}   // POS Phase 6c — 불량 인덱스(정상과 분리)
  rows.forEach(r => {
    if (!r.productCode) return
    map[r.productCode] = r.sizes
    locMap[r.productCode] = r.sizeLocations || {}
    defMap[r.productCode] = r.defectSizes || {}
  })
  _storeStockIndex[storeId] = map
  _storeLocIndex[storeId] = locMap
  _storeDefectIndex[storeId] = defMap
  return map
}

// 인덱스에서 (매장, 상품) 재고 조회 — 없으면 0 채운 맵. (동기, 인덱스 선구축 전제)
// ⚠️ 항상 복사본 반환 — 호출부가 반환값을 mutate 해도 인메모리 인덱스 오염 방지.
// ⚠️ 재고(sizes)만 반환 — 위치는 섞지 않음(1f 의존). 위치는 getStoreStockLocation 사용.
function getStoreStock(storeId, code) {
  const m = _storeStockIndex[storeId]
  return Object.assign(_emptyStoreSizes(), (m && m[code]) ? m[code] : {})
}

// 위치 인덱스에서 (매장, 상품, 사이즈) 위치 라벨 조회 — 없으면 '' (동기, 인덱스 선구축 전제). POS Phase 2a.
function getStoreStockLocation(storeId, code, size) {
  const m = _storeLocIndex[storeId]
  const locs = (m && m[code]) ? m[code] : null
  return (locs && locs[size]) ? String(locs[size]) : ''
}

// POS Phase 6c — 불량재고 조회. getStoreStock 미러(0채운 복사본). ⚠️ 정상재고(sizes)와 별개 버킷 — 판매 불가.
function getStoreDefect(storeId, code) {
  const m = _storeDefectIndex[storeId]
  return Object.assign(_emptyStoreSizes(), (m && m[code]) ? m[code] : {})
}
window.getStoreDefect = getStoreDefect

window.storeStockDocId = storeStockDocId
window.writeStoreStock = writeStoreStock
window.loadStoreStock = loadStoreStock
window.buildStoreStockIndex = buildStoreStockIndex
window.getStoreStock = getStoreStock
window.setStoreStockLocation = setStoreStockLocation
window.getStoreStockLocation = getStoreStockLocation

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

async function saveAllowedIps() {
  localStorage.setItem('lemango_allowed_ips_v1', JSON.stringify(_allowedIps))
  try {
    await _fsSync('allowedIps', _allowedIps)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['allowedIps'] = Date.now()
  } catch (e) {
    _onSaveFailed('saveAllowedIps', e)
  }
}

async function saveIpEnforceMode() {
  localStorage.setItem('lemango_ip_enforce_v1', _ipEnforceMode)
  try {
    await _fsSync('ipEnforceMode', _ipEnforceMode)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['ipEnforceMode'] = Date.now()
  } catch (e) {
    _onSaveFailed('saveIpEnforceMode', e)
  }
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
  populateSelect('sBrand',       s.brands,         true)  // 재고관리 브랜드 필터
  populateSelect('slBrand',      s.brands,         true)  // 매출현황 브랜드 필터
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
  // 품번 자동생성 분류 select (신규등록 + 신규기획)
  if (typeof _classCodes !== 'undefined' && Array.isArray(_classCodes)) {
    const _classItems = _classCodes.map(([code, name]) => [code, code + ' - ' + name])
    populateSelect('pcClass',   _classItems)
    populateSelect('plPcClass', _classItems)
  }
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
  product: { filtered: [], sort: { key: 'registDate', dir: 'desc' }, page: 1, pageSize: 10, columnFilters: {}, activeColumns: null, inactiveColumns: [], colWidths: {}, searchCriteria: null, needsRerender: false },
  stock:   { filtered: [], sort: { key: 'registDate', dir: 'desc' }, page: 1, pageSize: 10, columnFilters: {}, activeColumns: null, inactiveColumns: [], colWidths: {}, searchCriteria: null, needsRerender: false },
  sales:   { filtered: [], sort: { key: 'registDate', dir: 'desc' }, page: 1, pageSize: 10, activePlatforms: [], inactivePlatforms: [], columnFilters: {}, colWidths: {}, searchCriteria: null, needsRerender: false },
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
  store:     '🏬 매장',
  hradmin:   '인사관리',
  trash:     '🗑️ 휴지통'
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
async function saveEvents() {
  localStorage.setItem('lemango_events_v1', JSON.stringify(_events))
  try {
    await _fsSync('events', _events)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['events'] = Date.now()
  } catch (e) {
    _onSaveFailed('saveEvents', e)
  }
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
async function saveWorkCategories() {
  localStorage.setItem('lemango_work_categories_v1', JSON.stringify(_workCategories))
  try {
    await _fsSync('workCategories', _workCategories)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['workCategories'] = Date.now()
  } catch (e) {
    _onSaveFailed('saveWorkCategories', e)
  }
}

let _workItems = (() => {
  try { return JSON.parse(localStorage.getItem('lemango_work_items_v1')) || [] }
  catch { return [] }
})()
async function saveWorkItems() {
  localStorage.setItem('lemango_work_items_v1', JSON.stringify(_workItems))
  try {
    await _fsSync('workItems', _workItems)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['workItems'] = Date.now()
  } catch (e) {
    _onSaveFailed('saveWorkItems', e)
  }
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

// ===== 알림 캔버스 ID 헬퍼 (uid + type + link + 오늘날짜) =====
// 결정적 ID: 같은 uid/type/link/날짜 조합은 같은 doc. 5분 폴링·onSnapshot 트리거에도 단일 doc 유지.
function _notifCanonicalId(uid, type, link) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const linkSafe = String(link || 'none').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 60)
  return `${type}_${linkSafe}_${today}_${uid}`
}

// ===== 사용자가 오늘 dismiss 한 알림 ID 저장소 (재생성 차단) =====
const _NOTIF_DISMISSED_KEY = 'lemango_notif_dismissed_v1'
function _loadDismissedNotifs() {
  try {
    const raw = localStorage.getItem(_NOTIF_DISMISSED_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    const today = new Date().toISOString().slice(0, 10)
    // 오늘이 아닌 키 제거 (자동 만료)
    if (data._date !== today) return { _date: today, ids: [] }
    return data
  } catch(e) { return { _date: new Date().toISOString().slice(0,10), ids: [] } }
}
function _saveDismissedNotifs(data) {
  try { localStorage.setItem(_NOTIF_DISMISSED_KEY, JSON.stringify(data)) } catch(e) {}
}
function _isDismissedToday(canonicalId) {
  const d = _loadDismissedNotifs()
  return Array.isArray(d.ids) && d.ids.indexOf(canonicalId) >= 0
}
function markNotifDismissed(canonicalId) {
  const d = _loadDismissedNotifs()
  if (!Array.isArray(d.ids)) d.ids = []
  if (d.ids.indexOf(canonicalId) < 0) d.ids.push(canonicalId)
  if (d.ids.length > 500) d.ids = d.ids.slice(-500)
  _saveDismissedNotifs(d)
}
window.markNotifDismissed = markNotifDismissed
window._notifCanonicalId = _notifCanonicalId
window._isDismissedToday = _isDismissedToday

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

  // Firestore에 저장 (대상 사용자별, 결정적 ID + set merge → 중복 방지)
  if (db) {
    const recipients = targetUids || (singleTarget ? [singleTarget] : (myUid ? [myUid] : []))
    const nowTs = Date.now()
    const nowIso = new Date(nowTs).toISOString()
    recipients.forEach(uid => {
      if (!uid) return
      const canonicalId = _notifCanonicalId(uid, type, link || '')
      // 본인이 오늘 dismiss 한 알림이면 재생성 차단
      if (uid === myUid && _isDismissedToday(canonicalId)) return
      try {
        db.collection('notifications').doc(canonicalId).set({
          uid, type, title, body: body || '', link: link || '',
          priority, ts: nowTs, read: false,
          createdAt: nowIso
        }, { merge: true }).catch(e => console.warn('notification set failed:', e.message))
      } catch(e) { console.warn('notification set error:', e.message) }
    })
  }

  // 로컬 캐시: 본인에게 향한 알림이거나, targetUid 지정 없음(본인용)일 때만
  const isForMe = !singleTarget && !targetUids || (singleTarget && singleTarget === myUid) || (targetUids && myUid && targetUids.includes(myUid))
  if (isForMe && myUid) {
    const canonicalId = _notifCanonicalId(myUid, type, link || '')
    if (_isDismissedToday(canonicalId)) return
    // 동일 canonical ID 가 이미 캐시에 있으면 갱신만 (중복 추가 X)
    const existIdx = _notifications.findIndex(n => (n.fsId === canonicalId || n.id === canonicalId))
    if (existIdx >= 0) {
      const old = _notifications[existIdx]
      _notifications[existIdx] = { ...old, type, title, body, link, priority, ts: Date.now() }
    } else {
      _notifications.unshift({ id: canonicalId, fsId: canonicalId, type, title, body, link, priority, ts: Date.now(), read: false })
    }
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
