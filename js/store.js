// =============================================
// ===== 매장 탭 (POS Phase 1c — shell only) =====
// =============================================
// 1c 범위: 탭 + 서브내비 6개(전부 "준비중" placeholder) + 관리자 매장 스위처.
// 재고/판매/업로드 로직 없음 (1d~ 및 Phase 3~). 권한 방침(CLAUDE.md 🔐 POS 권한 방침):
//   - 조회 화면(매출/재고)은 전 직원 개방 → 탭 자체는 TAB_PERMISSIONS.store=1
//   - 작업 화면(판매/취소/차감)은 본인 매장 직원+관리자 → 각 패널 내부에서 게이트(향후 단계)

// 서브 화면 정의 (소유주 확정 순서)
const STORE_SUBS = [
  { key: 'sale',      label: '판매' },
  { key: 'inbound',   label: '입고 스캔' },
  { key: 'stock',     label: '매장별 재고현황' },
  { key: 'replenish', label: '보충대상조회' },
  { key: 'discount',  label: '매장 할인 상품 관리' },
  { key: 'location',  label: '로케이션' },
]

// 현재 선택된 서브탭 (재렌더 시 유지). 기본값: 매장별 재고현황 (1f 에서 실제 구현되는 화면)
let _storeActiveSub = 'stock'

// 매장 id → 이름 (활성/비활성 무관 조회)
function _storeNameById(id) {
  if (!id) return ''
  const list = (typeof _stores !== 'undefined' ? _stores : [])
  const s = list.find(x => x && x.id === id)
  return s ? s.name : id
}

// 헤더의 매장 컨텍스트 (관리자=스위처 / staff=고정라벨 / 미배정=안내)
function _buildStoreContextHtml() {
  const grade = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  if (grade >= 3) {
    // 관리자: 활성 매장 스위처. 현재 값 = resolveActiveStore()
    const active = (typeof getActiveStores === 'function') ? getActiveStores() : []
    const cur = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : (active[0] && active[0].id) || ''
    if (!active.length) {
      return '<span class="store-ctx-empty">등록된 활성 매장이 없습니다 — 설정 → 🏬 매장 관리에서 추가하세요.</span>'
    }
    const opts = active.map(s => `<option value="${esc(s.id)}"${s.id === cur ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
    return `<label class="store-switcher-label">매장 선택
      <select id="storeSwitcher" class="store-switcher" onchange="onStoreSwitcherChange(this)">${opts}</select>
    </label>`
  }
  // staff: 본인 배정 매장 고정 표시
  const sid = (typeof _currentUserStoreId !== 'undefined' && _currentUserStoreId) ? _currentUserStoreId : ''
  if (!sid) {
    return '<span class="store-ctx-empty">배정된 매장이 없습니다 — 관리자에게 문의하세요.</span>'
  }
  return `<span class="store-ctx-fixed">🏬 ${esc(_storeNameById(sid))}</span>`
}

// 서브 패널. 재고현황(stock) 패널은 실제 뷰(1f), 나머지는 "준비중" placeholder.
function _storeSubPanelHtml(sub) {
  const shown = sub.key === _storeActiveSub
  const grade = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  if (sub.key === 'stock') {
    // 1f: 매장별 재고현황 뷰. 조회는 전 직원(권한 방침), 재고 업로드 버튼은 관리자(grade>=3)만.
    const uploadBtn = grade >= 3 ? `<button class="btn btn-new" onclick="openStoreStockUploadModal()">📥 재고 업로드</button>` : ''
    return `<div class="store-panel${shown ? '' : ' store-panel-hidden'}" id="storePanel_stock">
      <div class="store-panel-toolbar">
        <button class="btn btn-outline" onclick="renderStoreStockView()">↻ 새로고침</button>
        ${uploadBtn}
      </div>
      <div id="storeStockViewBody" class="store-stock-view">
        <div class="store-placeholder"><div class="store-placeholder-desc">불러오는 중…</div></div>
      </div>
    </div>`
  }
  return `<div class="store-panel${shown ? '' : ' store-panel-hidden'}" id="storePanel_${sub.key}">
    <div class="store-placeholder">
      <div class="store-placeholder-icon">🚧</div>
      <div class="store-placeholder-title">${esc(sub.label)}</div>
      <div class="store-placeholder-desc">준비중입니다</div>
    </div>
  </div>`
}

function renderStoreTab() {
  const page = document.getElementById('storePage')
  if (!page) return

  // 선택된 서브탭이 목록에 없으면 기본값으로 보정
  if (!STORE_SUBS.some(s => s.key === _storeActiveSub)) _storeActiveSub = 'stock'

  const subBar = STORE_SUBS.map(s =>
    `<button class="store-subtab${s.key === _storeActiveSub ? ' store-subtab-active' : ''}"
       onclick="switchStoreTab('${s.key}')">${esc(s.label)}</button>`
  ).join('')

  const panels = STORE_SUBS.map(_storeSubPanelHtml).join('')

  page.innerHTML = `
    <div class="store-header">
      <h2 class="store-title">🏬 매장</h2>
      <div class="store-context">${_buildStoreContextHtml()}</div>
    </div>
    <div class="store-subtabs">${subBar}</div>
    <div class="store-panels">${panels}</div>
  `
  // 재고현황이 활성 서브탭이면 즉시 로드(온디맨드). 비활성이면 전환 시 로드.
  if (_storeActiveSub === 'stock') renderStoreStockView()
}

// 서브탭 전환 (패널 표시 토글 + 활성 버튼)
function switchStoreTab(sub) {
  _storeActiveSub = sub
  document.querySelectorAll('.store-subtab').forEach(btn => {
    const on = btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf("'" + sub + "'") >= 0
    btn.classList.toggle('store-subtab-active', !!on)
  })
  document.querySelectorAll('.store-panel').forEach(p => {
    p.classList.toggle('store-panel-hidden', p.id !== 'storePanel_' + sub)
  })
  if (sub === 'stock') renderStoreStockView()   // 재고현황으로 전환 시 온디맨드 로드
}

// 관리자 매장 스위처 setter — _storeViewOverride 설정 후 재렌더
// (1b 는 _storeViewOverride 를 선언만 했고, 1c 가 이 setter 를 추가)
function onStoreSwitcherChange(sel) {
  if (typeof _storeViewOverride !== 'undefined') _storeViewOverride = sel.value || ''
  renderStoreTab()
}

window.renderStoreTab = renderStoreTab
window.switchStoreTab = switchStoreTab
window.onStoreSwitcherChange = onStoreSwitcherChange

// =============================================
// ===== 매장 재고 업로드 (POS Phase 1e) =====
// =============================================
// 엑셀: 품번 | 사이즈 | 바코드 | 수량. 이중 식별(품번+사이즈 OR 바코드), 수량 필수.
// SET(절대 덮어쓰기, 초기 시딩) / ADD(increment 증가, 진행 중 보충) 두 경로 완전 분리.
// 1d 헬퍼(writeStoreStock/storeStockDocId/buildStoreStockIndex) + findByBarcode(Phase 0) 소비.

let _ssuData = []          // 파싱·검증된 업로드 행
let _ssuMode = 'set'       // 'set'(절대) | 'add'(증가)
let _ssuTargetStore = ''   // 대상 매장 id (resolveActiveStore)

function _ssuIsAdmin() {
  const g = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  return g >= 3
}

function openStoreStockUploadModal() {
  // 1e: 시딩은 관리자 작업 → 업로드 진입은 관리자(grade>=3)만
  if (!_ssuIsAdmin()) { showToast('매장 재고 업로드는 관리자만 가능합니다.', 'warning'); return }
  const store = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
  if (!store) { showToast('대상 매장이 없습니다 — 매장을 먼저 선택/등록하세요.', 'warning'); return }
  _ssuTargetStore = store
  _ssuData = []
  _ssuMode = 'set'
  const input = document.getElementById('ssuUploadFile'); if (input) input.value = ''
  const nameEl = document.getElementById('ssuTargetStoreName'); if (nameEl) nameEl.textContent = _storeNameById(store)
  const setRadio = document.querySelector('input[name="ssuMode"][value="set"]'); if (setRadio) setRadio.checked = true
  const prev = document.getElementById('ssuPreviewArea'); if (prev) prev.style.display = 'none'
  _ssuUpdateConfirmLabel()
  const modal = document.getElementById('storeStockUploadModal')
  if (modal) { modal.showModal(); centerModal(modal) }
}

function closeStoreStockUploadModal(force) {
  const modal = document.getElementById('storeStockUploadModal')
  if (!modal) return
  const doClose = () => { _ssuData = []; modal.close() }
  if (force) { doClose(); return }
  if (typeof safeCloseModal === 'function') {
    safeCloseModal(modal, () => _ssuData && _ssuData.length > 0, doClose)
  } else { doClose() }
}

function _ssuUpdateConfirmLabel() {
  const btn = document.getElementById('ssuConfirmBtn')
  if (btn) btn.textContent = _ssuMode === 'set' ? '덮어쓰기 확정' : '추가 확정'
}

function setStoreUploadMode(mode) {
  _ssuMode = (mode === 'add') ? 'add' : 'set'
  _ssuUpdateConfirmLabel()
  if (_ssuData.length) { _ssuValidateRows(); renderStoreStockPreview() }  // 모드 바뀌면 중복 규칙 재적용
}

function downloadStoreStockSample() {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  const header = ['품번', '사이즈', '바코드', '수량']
  const sample = [
    ['LSWON16266707', 'M', '', 12],   // 방식 A: 품번+사이즈
    ['LSWON16266707', 'L', '', 8],
    ['', '', '8809100001003', 5],     // 방식 B: 바코드
  ]
  const ws = XLSX.utils.aoa_to_sheet([header, ...sample])
  ws['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 18 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '매장재고')
  XLSX.writeFile(wb, '르망고_매장재고_샘플.xlsx')
}

// 한 행의 상품 식별 (방식 A: 품번+사이즈 / 방식 B: 바코드 우선). 수량은 _ssuValidateRows 에서.
function _ssuResolveRow(r) {
  const rawCode = String(r[0] || '').trim()
  const rawSize = String(r[1] || '').trim().toUpperCase()
  const barcode = String(r[2] || '').trim()
  const qtyRaw  = String(r[3] || '').trim()
  const row = { rawCode, rawSize, barcode, qtyRaw, method: '', code: '', size: '', qty: NaN, status: '', valid: false, error: '', dupSum: false }

  if (barcode) {
    // 방식 B: 바코드 우선
    const hit = (typeof findByBarcode === 'function') ? findByBarcode(barcode) : null
    if (!hit) { row.status = 'unmatched'; row.error = '바코드 미등록: ' + barcode; return row }
    row.code = hit.productCode; row.size = hit.size; row.method = 'B'
    // 품번/사이즈도 같이 적혀 있으면 일치 검증 (불일치 시 오류로 차단 — 잘못된 데이터 방지)
    if (rawCode && rawSize && ((rawCode.toUpperCase() !== (hit.productCode || '').toUpperCase()) || rawSize !== hit.size)) {
      row.status = 'mismatch'; row.error = `바코드↔품번/사이즈 불일치 (바코드→${hit.productCode}/${hit.size})`
    }
    return row
  }
  if (rawCode && rawSize) {
    // 방식 A: 품번(대소문자 무시) + 사이즈
    const p = State.allProducts.find(x => (x.productCode || '').toUpperCase() === rawCode.toUpperCase() && !x.deleted)
    if (!p) { row.status = 'unmatched'; row.error = '품번 미등록: ' + rawCode; return row }
    if (!SIZES.includes(rawSize)) { row.status = 'unmatched'; row.error = '사이즈 인식 불가: ' + rawSize; return row }
    row.code = p.productCode; row.size = rawSize; row.method = 'A'
    return row
  }
  // 식별 불가
  row.status = 'incomplete'; row.error = '품번+사이즈 또는 바코드 필요'
  return row
}

// 수량 검증 + 모드별 중복 처리 (SET: 중복=오류 / ADD: 중복=합산)
function _ssuValidateRows() {
  _ssuData.forEach(d => {
    // 식별 단계에서 이미 실패한 행은 유지
    if (d.status === 'unmatched' || d.status === 'mismatch' || d.status === 'incomplete') { d.valid = false; d.dupSum = false; return }
    if (d.qtyRaw === '') { d.status = 'incomplete'; d.error = '수량 없음'; d.valid = false; d.dupSum = false; return }
    const n = Number(d.qtyRaw)
    if (!Number.isInteger(n) || n < 0) { d.status = 'format'; d.error = '수량은 0 이상 정수'; d.valid = false; d.dupSum = false; return }
    d.qty = n; d.status = 'ok'; d.valid = true; d.error = ''; d.dupSum = false
  })
  // 중복 (동일 품번+사이즈)
  const keyCount = {}
  _ssuData.forEach(d => { if (d.valid) { const k = d.code + '|' + d.size; keyCount[k] = (keyCount[k] || 0) + 1 } })
  _ssuData.forEach(d => {
    if (!d.valid) return
    if (keyCount[d.code + '|' + d.size] > 1) {
      if (_ssuMode === 'set') { d.status = 'duplicate'; d.valid = false; d.error = 'SET 모드 중복 (동일 품번+사이즈는 절대값 모호)' }
      else { d.dupSum = true }   // ADD: 합산 (확정 시 증분 누적)
    }
  })
}

const _SSU_PREVIEW_META = {
  ok:         { cls: 'bc-row-new',       badge: '<span class="badge-preview-ok">정상</span>' },
  format:     { cls: 'bc-row-miss',      badge: '<span class="badge-preview-error">형식오류</span>' },
  unmatched:  { cls: 'bc-row-miss',      badge: '<span class="badge-preview-error">미등록</span>' },
  incomplete: { cls: 'bc-row-miss',      badge: '<span class="badge-preview-warn">불완전</span>' },
  duplicate:  { cls: 'bc-row-dup',       badge: '<span class="badge-preview-dup">중복</span>' },
  mismatch:   { cls: 'bc-row-dup',       badge: '<span class="badge-preview-dup">불일치</span>' },
}

function handleStoreStockUpload(input) {
  const file = input.files && input.files[0]
  if (!file) return
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  // 인덱스 최신화 (바코드 조회용)
  if (typeof buildBarcodeIndex === 'function') buildBarcodeIndex()

  const reader = new FileReader()
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
      const dataRows = []
      raw.slice(1).forEach(r => {
        const code = String(r[0] || '').trim()
        const size = String(r[1] || '').trim()
        const bc   = String(r[2] || '').trim()
        const qty  = String(r[3] || '').trim()
        if (!code && !size && !bc && !qty) return   // 완전 빈 행 → 무시
        dataRows.push(r)
      })
      _ssuData = dataRows.map(_ssuResolveRow)
      _ssuValidateRows()
      renderStoreStockPreview()
    } catch (err) {
      showToast('파일 읽기 오류: ' + err.message, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
}

function renderStoreStockPreview() {
  const area = document.getElementById('ssuPreviewArea'); if (area) area.style.display = 'block'
  const total = _ssuData.length
  const valid = _ssuData.filter(d => d.valid).length
  const formatErr = _ssuData.filter(d => d.status === 'format').length
  const unmatched = _ssuData.filter(d => d.status === 'unmatched').length
  const incomplete = _ssuData.filter(d => d.status === 'incomplete').length
  const dup = _ssuData.filter(d => d.status === 'duplicate' || d.status === 'mismatch').length

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v }
  set('ssuTotalCount', total); set('ssuValidCount', valid); set('ssuFormatCount', formatErr)
  set('ssuMissCount', unmatched); set('ssuIncompleteCount', incomplete); set('ssuDupCount', dup)

  const copyBtn = document.getElementById('ssuCopyUnmatchedBtn')
  if (copyBtn) copyBtn.style.display = unmatched > 0 ? '' : 'none'

  const body = document.getElementById('ssuPreviewBody')
  if (body) body.innerHTML = _ssuData.map(d => {
    const m = _SSU_PREVIEW_META[d.status] || _SSU_PREVIEW_META.incomplete
    const codeCell = esc(d.code || d.rawCode) + (d.method === 'B' ? ' <span style="font-size:10px;color:var(--text-muted)">(바코드)</span>' : '')
    const qtyCell = (d.valid ? esc(String(d.qty)) : esc(d.qtyRaw)) + (d.dupSum ? ' <span style="font-size:10px;color:var(--warning)">합산</span>' : '')
    return `<tr class="${m.cls}">
      <td>${m.badge}</td>
      <td>${codeCell}</td>
      <td style="text-align:center">${esc(d.size || d.rawSize)}</td>
      <td style="font-family:monospace">${esc(d.barcode) || '-'}</td>
      <td style="text-align:right">${qtyCell}</td>
      <td style="font-size:11px;color:var(--danger)">${esc(d.error || '')}</td>
    </tr>`
  }).join('')

  const confirmBtn = document.getElementById('ssuConfirmBtn')
  if (confirmBtn) confirmBtn.disabled = valid === 0
}

// 미등록 행의 식별자(품번 또는 바코드) 중복 제거 → 클립보드 (엑셀 수정용)
function copyUnmatchedStoreCodes() {
  const ids = [...new Set(_ssuData.filter(d => d.status === 'unmatched').map(d => d.rawCode || d.barcode).filter(Boolean))]
  if (!ids.length) { showToast('미등록 항목이 없습니다.', 'warning'); return }
  const text = ids.join('\n')
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(`미등록 ${ids.length}개 복사됨`, 'success')).catch(() => showToast('복사 실패', 'error'))
  } else {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy'); showToast(`미등록 ${ids.length}개 복사됨`, 'success') } catch (e) { showToast('복사 실패', 'error') }
    document.body.removeChild(ta)
  }
}

async function confirmStoreStockUpload() {
  const store = _ssuTargetStore
  if (!store) { showToast('대상 매장이 없습니다.', 'warning'); return }
  if (!_ssuIsAdmin()) { showToast('권한이 없습니다.', 'warning'); return }
  const validData = _ssuData.filter(d => d.valid)
  if (!validData.length) { showToast('반영할 항목이 없습니다.', 'warning'); return }

  // 모드별 확인
  if (_ssuMode === 'set') {
    // 기존재고 가드 — 대상 매장에 이미 재고(비제로)가 있으면 경고
    try {
      if (typeof buildStoreStockIndex === 'function') await buildStoreStockIndex(store)
    } catch (e) { /* 로드 실패해도 진행(빈 것으로 간주) */ }
    const idx = (typeof _storeStockIndex !== 'undefined' && _storeStockIndex[store]) ? _storeStockIndex[store] : {}
    const hasStock = Object.keys(idx).some(code => Object.values(idx[code] || {}).some(v => Number(v) !== 0))
    if (hasStock) {
      const ok = await korConfirm('이 매장은 이미 재고가 있습니다.\n\nSET(덮어쓰기)하면 업로드한 품번/사이즈의 기존 수량이 새 값으로 교체됩니다. 계속하시겠습니까?', '덮어쓰기', '취소')
      if (!ok) return
    }
  } else {
    const ok = await korConfirm('ADD(증가) 모드입니다.\n\n이미 반영된 파일을 다시 올리면 수량이 중복 증가합니다. 계속하시겠습니까?', '추가', '취소')
    if (!ok) return
  }

  // 품번(문서)별로 사이즈 맵 구성. SET=절대값, ADD=증분 누적.
  const byCode = {}
  validData.forEach(d => {
    if (!byCode[d.code]) byCode[d.code] = {}
    if (_ssuMode === 'set') byCode[d.code][d.size] = d.qty                                   // 절대 (중복은 이미 제외됨)
    else byCode[d.code][d.size] = (byCode[d.code][d.size] || 0) + d.qty                      // 합산
  })
  const codes = Object.keys(byCode)

  const btn = document.getElementById('ssuConfirmBtn'); if (btn) btn.disabled = true
  const nowIso = new Date().toISOString()
  try {
    // 문서당 1 write → 배치, 500개씩 청크 (한 문서를 한 배치에서 두 번 쓰지 않음)
    for (let i = 0; i < codes.length; i += 500) {
      const chunk = codes.slice(i, i + 500)
      const batch = db.batch()
      chunk.forEach(code => {
        const ref = db.collection('storeStock').doc(storeStockDocId(store, code))
        const sizesMap = {}
        Object.keys(byCode[code]).forEach(sz => {
          const v = byCode[code][sz]
          sizesMap[sz] = (_ssuMode === 'set') ? v : firebase.firestore.FieldValue.increment(v)   // SET=절대 / ADD=increment
        })
        batch.set(ref, { storeId: store, productCode: code, sizes: sizesMap, updatedAt: nowIso }, { merge: true })
      })
      await batch.commit()
    }
  } catch (e) {
    console.error('confirmStoreStockUpload 실패:', e.message)
    showToast('매장 재고 저장 실패 — 다시 시도해주세요.', 'error')
    if (btn) btn.disabled = false
    return
  }

  // 인덱스 재구축
  try { if (typeof buildStoreStockIndex === 'function') await buildStoreStockIndex(store) } catch (e) {}
  const rowCount = validData.length
  const modeLabel = _ssuMode === 'set' ? 'SET(덮어쓰기)' : 'ADD(증가)'
  showToast(`매장 재고 반영: ${_storeNameById(store)} — ${codes.length}품번 / ${rowCount}행 (${modeLabel})`, 'success')
  if (typeof logActivity === 'function') logActivity('upload', '매장재고', `${modeLabel} — 매장 ${_storeNameById(store)}(${store}) : ${codes.length}품번 ${rowCount}행`)
  closeStoreStockUploadModal(true)
  if (typeof renderStoreTab === 'function') renderStoreTab()
}

window.openStoreStockUploadModal = openStoreStockUploadModal
window.closeStoreStockUploadModal = closeStoreStockUploadModal
window.setStoreUploadMode = setStoreUploadMode
window.downloadStoreStockSample = downloadStoreStockSample
window.handleStoreStockUpload = handleStoreStockUpload
window.renderStoreStockPreview = renderStoreStockPreview
window.copyUnmatchedStoreCodes = copyUnmatchedStoreCodes
window.confirmStoreStockUpload = confirmStoreStockUpload

// =============================================
// ===== 매장별 재고현황 뷰 (POS Phase 1f) =====
// =============================================
// 조회는 전 직원 개방(권한 방침). 온디맨드 로드(loadStoreStock/buildStoreStockIndex, 1d) — 라이브 리스너 없음.
// 상품 정보(상품명/이미지/정상가)는 State.allProducts 에서 read-only 조인. 품번 클릭 → 상세 모달.

let _ssvStore = ''   // 현재 뷰에 표시 중인 매장 id (상세 모달이 참조)

// 품번으로 상품 조회 (정확 매칭 → 대소문자 무시 폴백)
function _ssvFindProduct(code) {
  const list = State.allProducts || []
  return list.find(x => x.productCode === code)
      || list.find(x => (x.productCode || '').toUpperCase() === (code || '').toUpperCase())
      || null
}

// 매장별 재고 테이블 렌더 (async — buildStoreStockIndex)
async function renderStoreStockView() {
  const body = document.getElementById('storeStockViewBody')
  if (!body) return
  const store = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
  _ssvStore = store || ''
  if (!store) {
    body.innerHTML = `<div class="store-placeholder"><div class="store-placeholder-icon">🏬</div><div class="store-placeholder-desc">배정된 매장이 없습니다 — 관리자에게 문의하세요.</div></div>`
    return
  }
  body.innerHTML = `<div class="store-placeholder"><div class="store-placeholder-desc">불러오는 중…</div></div>`
  let map = {}
  try {
    map = (typeof buildStoreStockIndex === 'function') ? await buildStoreStockIndex(store) : {}
  } catch (e) {
    body.innerHTML = `<div class="store-placeholder"><div class="store-placeholder-desc" style="color:var(--danger)">재고 로드 실패: ${esc(e.message || '')}</div></div>`
    return
  }
  const codes = Object.keys(map).sort()
  if (!codes.length) {
    const admin = _ssuIsAdmin()
    body.innerHTML = `<div class="store-placeholder"><div class="store-placeholder-icon">📦</div><div class="store-placeholder-desc">재고 데이터가 없습니다${admin ? ' — 재고 업로드로 등록하세요' : ''}</div></div>`
    return
  }
  const headSizes = SIZES.map(sz => `<th class="ssv-num">${esc(sz)}</th>`).join('')
  const rows = codes.map(code => {
    const sizes = map[code] || {}
    const p = _ssvFindProduct(code)
    const nameCell = p
      ? (esc(p.nameKr || p.nameEn || '') + (p.deleted ? ' <span class="ssv-del-flag">삭제된 상품</span>' : ''))
      : '<span style="color:var(--text-muted)">(상품 정보 없음)</span>'
    let total = 0
    const sizeCells = SIZES.map(sz => {
      const v = Number(sizes[sz] || 0); total += v
      return `<td class="ssv-num${v < 0 ? ' ssv-neg' : ''}">${v}</td>`
    }).join('')
    return `<tr>
      <td><span class="code-link" onclick="openStoreStockDetail('${esc(code)}')">${esc(code)}</span></td>
      <td>${nameCell}</td>
      ${sizeCells}
      <td class="ssv-num ssv-total${total < 0 ? ' ssv-neg' : ''}">${total}</td>
    </tr>`
  }).join('')
  body.innerHTML = `
    <div class="ssv-meta">${esc(_storeNameById(store))} · 총 ${codes.length}품번</div>
    <div class="ssv-table-wrap">
      <table class="data-table ssv-table">
        <thead><tr><th style="width:150px">품번</th><th>상품명</th>${headSizes}<th class="ssv-num">합계</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

// 품번 클릭 → 상세 모달 (이미지 + 정상가 + 사이즈별 재고 + 합계). 로케이션/할인은 향후(확장 지점 주석).
function openStoreStockDetail(code) {
  const store = _ssvStore
  const sizes = (typeof getStoreStock === 'function') ? getStoreStock(store, code) : {}
  const p = _ssvFindProduct(code)
  const name = p ? (p.nameKr || p.nameEn || '') : ''
  const price = (p && (p.salePrice || p.salePrice === 0)) ? (Number(p.salePrice).toLocaleString() + '원') : '-'
  const img = (p && typeof getThumbUrl === 'function') ? getThumbUrl(p) : ''
  const imgHtml = img
    ? `<img src="${esc(img)}" class="ssv-detail-img" onerror="this.style.visibility='hidden'">`
    : `<div class="ssv-detail-img ssv-detail-noimg">이미지 없음</div>`
  let total = 0
  const sizeRows = SIZES.map(sz => {
    const v = Number(sizes[sz] || 0); total += v
    return `<div class="ssv-detail-size${v < 0 ? ' ssv-neg' : ''}"><span class="ssv-detail-size-lbl">${esc(sz)}</span><span class="ssv-detail-size-val">${v}</span></div>`
  }).join('')
  const delFlag = (p && p.deleted) ? ' <span class="ssv-del-flag">삭제된 상품</span>' : ''

  const bodyEl = document.getElementById('ssvDetailBody')
  if (bodyEl) bodyEl.innerHTML = `
    <div class="ssv-detail-head">
      ${imgHtml}
      <div class="ssv-detail-info">
        <div class="ssv-detail-code">${esc(code)}${delFlag}</div>
        <div class="ssv-detail-name">${p ? esc(name) : '(상품 정보 없음)'}</div>
        <div class="ssv-detail-price">정상가 <strong>${price}</strong></div>
      </div>
    </div>
    <div class="ssv-detail-section-title">사이즈별 재고 · ${esc(_storeNameById(store))}</div>
    <div class="ssv-detail-sizes">${sizeRows}</div>
    <div class="ssv-detail-total">합계 <strong>${total}</strong></div>
    <!-- 확장 지점(1f 범위 외, 향후 추가): 로케이션(사이즈별, 데이터구조 변경 후) / 할인(할인율·할인가, Phase 5) -->
  `
  const titleEl = document.getElementById('ssvDetailTitle')
  if (titleEl) titleEl.textContent = (p ? name : code) + ' — 매장 재고'
  const modal = document.getElementById('storeStockDetailModal')
  if (modal) { modal.showModal(); if (typeof centerModal === 'function') centerModal(modal) }
}

function closeStoreStockDetail() {
  const modal = document.getElementById('storeStockDetailModal')
  if (modal) modal.close()
}

window.renderStoreStockView = renderStoreStockView
window.openStoreStockDetail = openStoreStockDetail
window.closeStoreStockDetail = closeStoreStockDetail
