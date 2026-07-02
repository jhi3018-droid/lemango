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
  if (sub.key === 'inbound') {
    // 2b: 입고 스캔 화면. 권한 게이트 + 스캔 폼 + 입고 리스트(staging). 재고 쓰기 없음(2c).
    return `<div class="store-panel${shown ? '' : ' store-panel-hidden'}" id="storePanel_inbound">
      <div id="inbGate" class="inb-hidden"></div>
      <div id="inbScreen" class="inb-screen inb-hidden">
        <div class="inb-entry-card">
          <div class="inb-entry-storelbl" id="inbStoreLabel"></div>
          <div class="inb-entry-main">
            <div class="inb-fields">
              <div class="inb-field inb-field-barcode">
                <label class="inb-label">바코드 <span class="inb-label-hint">스캔하면 자동 인식 · 커서는 여기 고정</span></label>
                <div class="inb-barcode-row">
                  <input id="inbBarcode" class="inb-input inb-input-barcode" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="바코드를 스캔하세요">
                  <button class="btn btn-outline inb-lookup-btn" onclick="inbManualLookup()">조회</button>
                </div>
              </div>
              <div class="inb-field inb-field-qty">
                <label class="inb-label">수량</label>
                <input id="inbQty" class="inb-input inb-input-qty" type="number" min="1" step="1" value="1" onchange="onInbQtyChange(this)">
              </div>
            </div>
            <div class="inb-image" id="inbImage"></div>
          </div>
          <div class="inb-info" id="inbInfo"><span class="inb-info-empty">바코드를 스캔하세요</span></div>
          <div class="inb-field inb-field-loc">
            <label class="inb-label">로케이션 <span class="inb-label-hint">위치 확인 후 Enter = 입고 리스트에 등록</span></label>
            <input id="inbLocation" class="inb-input inb-input-loc" type="text" autocomplete="off" placeholder="위치 입력 후 Enter로 등록">
          </div>
        </div>
        <div class="inb-list-section">
          <div class="inb-list-head">입고 리스트 <span class="inb-list-count-badge"><span id="inbListCount">0</span>건</span></div>
          <div class="inb-list-wrap">
            <table class="data-table inb-list-table">
              <thead><tr><th>품번</th><th class="inb-c" style="width:64px">사이즈</th><th style="width:92px">수량</th><th style="width:160px">로케이션</th><th class="inb-c" style="width:72px">수정/삭제</th></tr></thead>
              <tbody id="inbListBody"></tbody>
            </table>
          </div>
          <div class="inb-list-footer">
            <span class="inb-confirm-note">🔒 최종 확정(재고 반영)은 다음 단계(2c)에서 활성화됩니다 — 현재는 리스트만 임시저장됩니다</span>
            <button class="btn btn-new inb-confirm-btn" id="inbConfirmBtn" onclick="inbFinalConfirm()">최종 확정 <span class="inb-confirm-tag">(2c에서 활성화)</span></button>
          </div>
        </div>
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
  else if (_storeActiveSub === 'inbound') renderInboundScreen()
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
  else if (sub === 'inbound') renderInboundScreen()   // 입고 스캔으로 전환 시 로드 + 커서 세팅
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

// =============================================
// ===== 입고 스캔 (POS Phase 2b) =====
// =============================================
// 바코드 스캔 → 수량 → 로케이션 확인 → 입고 리스트(staging)에 누적. 마우스 없이(USB 스캐너) 운영.
// 🔒 2b 범위: 재고 쓰기 없음. 최종 확정(재고+입고이력 원자적 반영)은 2c. 리스트는 localStorage draft 로 매장별 임시저장.
//
// 커서 규율(CRITICAL): 기본 포커스 = #inbBarcode. 모든 경로(스캔/등록/차단/팝업닫기/삭제)가 끝에 바코드로 복귀.
// 등록(커밋) 트리거 = 로케이션 필드 Enter 단독 (소유주 확정 — 빈 바코드 Enter 커밋 없음. 위치를 매번 눈으로 확인).
//   ⚠️ 설계문서(pos-phase2-design.md §3.3)는 dual-commit(빈 바코드 Enter OR 로케이션 Enter)이었으나
//      작업지시서에서 소유주가 로케이션 Enter 단독으로 정정 → 본 구현은 정정본을 따름.
//
// 4대 차단 규칙: (1) 미등록 바코드 (2) 진행 중 다른 상품/사이즈 (3) 로케이션 빈값 커밋 (4) 리스트 중복(스캔 시점 팝업).

let _inbStore = ''          // 현재 입고 대상 매장 id
let _inbEntry = null        // 진행 중 항목: null | { code, size, qty, product, location }
let _inbList = []           // staging 리스트: [{ code, size, qty, location }] (code,size 유니크)
let _inbComposing = false   // IME 조합 중 여부 (한글 입력 중 Enter 무시)
let _inbLastEnterTime = 0   // 스캐너 CR+LF 이중발사 디바운스용 (ms)
let _inbQuotaWarned = false // localStorage 용량 경고 1회 제한

const INB_DEBOUNCE_MS = 60  // 이 시간 내 연속 Enter 는 동일 스캔의 이중발사(CR+LF)로 간주 → 무시.
                            // 사람이 스캐너를 다시 당기는 의도적 재스캔(~150ms+)은 통과 → 수량 증가.
const INB_DRAFT_VER = 1

// ── 포커스 헬퍼 (모든 경로가 이걸로 마무리) ──
function _inbFocusBarcode() { const el = document.getElementById('inbBarcode'); if (el) { el.focus(); if (el.select) el.select() } }
function _inbFocusLocation() { const el = document.getElementById('inbLocation'); if (el) el.focus() }
function _inbFocusQty() { const el = document.getElementById('inbQty'); if (el) { el.focus(); if (el.select) el.select() } }

// ── draft (매장별 localStorage) ──
function _inbDraftKey(store) { return 'lemango_inbound_draft_' + (store || _inbStore || '') }

function _inbSaveDraft() {
  if (!_inbStore) return
  try {
    localStorage.setItem(_inbDraftKey(_inbStore), JSON.stringify({ v: INB_DRAFT_VER, items: _inbList }))
  } catch (e) {
    console.warn('입고 draft 저장 실패:', e && e.message)
    if (!_inbQuotaWarned) { _inbQuotaWarned = true; showToast('입고 임시저장 실패(저장 공간) — 최종 확정을 서둘러 주세요', 'warning') }
  }
}

// draft 로드 + 무결성 방어 (손상/구버전 → 초기화, 화면 벽돌 방지)
function _inbLoadDraft(store) {
  let raw = null
  try { raw = localStorage.getItem(_inbDraftKey(store)) } catch (e) { return [] }
  if (!raw) return []
  try {
    const obj = JSON.parse(raw)
    if (!obj || obj.v !== INB_DRAFT_VER || !Array.isArray(obj.items)) return []
    return obj.items.filter(r => r && r.code && r.size).map(r => ({
      code: String(r.code),
      size: String(r.size),
      qty: Math.max(1, Math.floor(Number(r.qty) || 1)),
      location: String(r.location || '')
    }))
  } catch (e) {
    console.warn('입고 draft 파싱 실패 — 초기화:', e && e.message)
    showToast('임시저장 데이터 손상 — 입고 리스트를 초기화했습니다', 'warning')
    try { localStorage.removeItem(_inbDraftKey(store)) } catch (e2) {}
    return []
  }
}

// ── 화면 렌더 (권한 게이트 + 폼/리스트 초기화 + 커서) ──
function renderInboundScreen() {
  const gate = document.getElementById('inbGate')
  const screen = document.getElementById('inbScreen')
  if (!gate || !screen) return

  // 권한: 본인 매장 직원 + 관리자. resolveActiveStore()가 null 이면 office/미배정 → 입고 불가.
  const store = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
  if (!store) {
    _inbStore = ''; _inbEntry = null; _inbList = []
    screen.classList.add('inb-hidden')
    gate.classList.remove('inb-hidden')
    gate.innerHTML = `<div class="store-placeholder">
      <div class="store-placeholder-icon">🚫</div>
      <div class="store-placeholder-title">입고 불가</div>
      <div class="store-placeholder-desc">배정된 매장이 없습니다 — 관리자에게 문의하세요.</div>
    </div>`
    return
  }
  gate.classList.add('inb-hidden'); gate.innerHTML = ''
  screen.classList.remove('inb-hidden')

  // 매장 전환(관리자 스위처) 시: 진행 중 항목 폐기(커밋 안 됨) + 해당 매장 draft 로드
  const storeChanged = (_inbStore !== store)
  if (storeChanged && _inbEntry) showToast('진행 중이던 항목은 초기화되었습니다', 'warning')
  _inbStore = store
  _inbEntry = null
  _inbList = _inbLoadDraft(store)

  // 읽기용 인덱스 준비 (기존 재고/위치). 매장 재고 인덱스는 async — 완료 후 진행 항목 있으면
  // 기존재고/로케이션만 보정(수량 등 조작 값은 보존). renderInboundScreen 직후엔 보통 진행 항목 없음.
  if (typeof buildStoreStockIndex === 'function') {
    buildStoreStockIndex(store).then(() => { if (_inbStore === store && _inbEntry) _inbRefreshExistingInfo() }).catch(() => {})
  }
  if (typeof buildBarcodeIndex === 'function') buildBarcodeIndex()   // 스캔 해석용 바코드 인덱스 최신화

  _inbBindEvents()
  _inbRenderEntry()
  _inbRenderList()
  const lbl = document.getElementById('inbStoreLabel')
  if (lbl) lbl.textContent = '입고 대상: ' + _storeNameById(store)
  _inbFocusBarcode()
}

// 이벤트 바인딩 (요소당 1회 — 서브탭 전환으로 renderInboundScreen 재호출돼도 중복 안 됨)
function _inbBindEvents() {
  const bc = document.getElementById('inbBarcode')
  if (bc && !bc.dataset.inbBound) {
    bc.dataset.inbBound = '1'
    bc.addEventListener('keydown', onInbBarcodeKey)
    bc.addEventListener('compositionstart', () => { _inbComposing = true })
    bc.addEventListener('compositionend', () => { _inbComposing = false })
  }
  const loc = document.getElementById('inbLocation')
  if (loc && !loc.dataset.inbBound) {
    loc.dataset.inbBound = '1'
    loc.addEventListener('keydown', onInbLocationKey)
    loc.addEventListener('compositionstart', () => { _inbComposing = true })
    loc.addEventListener('compositionend', () => { _inbComposing = false })
  }
}

// ── 바코드 필드 Enter (스캔) ──
function onInbBarcodeKey(e) {
  if (e.key !== 'Enter') return
  if (e.isComposing || _inbComposing) return   // IME 조합 중 Enter 무시 (반쪽 조합 커밋 방지)
  e.preventDefault()
  const now = Date.now()
  const el = document.getElementById('inbBarcode')
  const raw = el ? String(el.value || '') : ''
  // 이중발사(CR+LF) 디바운스: 짧은 간격 연속 Enter 무시
  if (now - _inbLastEnterTime < INB_DEBOUNCE_MS) { if (el) el.value = ''; _inbFocusBarcode(); return }
  _inbLastEnterTime = now

  const rawTrim = raw.trim()
  if (!rawTrim) {
    // 빈 바코드 Enter → 커밋 아님(소유주 정정). 진행 항목 있으면 로케이션(등록 지점)으로 안내.
    if (_inbEntry) { showToast('로케이션 칸에서 Enter로 등록하세요', 'warning'); _inbFocusLocation() }
    else { _inbFocusBarcode() }
    return
  }
  if (el) el.value = ''
  const cleaned = rawTrim.replace(/[^0-9A-Za-z]/g, '')
  const hasHangul = /[㄰-㆏가-힣]/.test(rawTrim)
  if (!cleaned || hasHangul) {   // IME 오염 스캔 → 전용 안내(일반 '미등록' 아님)
    showToast('한/영 키를 확인하세요 (영문 모드 필요)', 'warning')
    _inbFocusBarcode(); return
  }
  handleInbScan(cleaned)
}

// 조회 버튼 (타이핑한 바코드 수동 조회 — 스캔과 동일 경로)
function inbManualLookup() {
  const el = document.getElementById('inbBarcode')
  const raw = el ? String(el.value || '').trim() : ''
  if (!raw) { showToast('바코드를 입력하세요', 'warning'); _inbFocusBarcode(); return }
  if (el) el.value = ''
  const cleaned = raw.replace(/[^0-9A-Za-z]/g, '')
  const hasHangul = /[㄰-㆏가-힣]/.test(raw)
  if (!cleaned || hasHangul) { showToast('한/영 키를 확인하세요 (영문 모드 필요)', 'warning'); _inbFocusBarcode(); return }
  handleInbScan(cleaned)
}

// ── 스캔 해석 + 4대 규칙 분기 ──
function handleInbScan(barcode) {
  const store = _inbStore
  if (!store) { _inbFocusBarcode(); return }
  const hit = (typeof findByBarcode === 'function') ? findByBarcode(barcode) : null
  if (!hit) {   // Rule 1: 미등록 바코드
    showToast('등록되지 않은 바코드입니다: ' + barcode, 'warning')
    _inbFocusBarcode(); return
  }
  const code = hit.productCode, size = hit.size

  if (_inbEntry) {
    if (_inbEntry.code === code && _inbEntry.size === size) {
      // 같은 상품/사이즈 재스캔 → 수량 +1 (Rule 2 발동 안 함). 현재 필드값 기준으로 증가(타이핑 존중).
      const cur = _inbReadQtyField()
      _inbEntry.qty = cur + 1
      _inbRenderEntry()
      _inbFocusBarcode(); return
    }
    // Rule 2: 진행 중 다른 상품/사이즈 → 차단 (진행 항목 변경 안 함)
    showToast('현재 상품을 먼저 완료하세요', 'warning')
    _inbFocusBarcode(); return
  }

  // 진행 항목 없음 → Rule 4: 리스트 중복?
  const idx = _inbList.findIndex(r => r.code === code && r.size === size)
  if (idx >= 0) { _inbHandleDuplicate(idx); return }   // 스캔 시점 팝업 → 위치 충돌 구조적 불가

  // 신규 진행 항목 시작
  const product = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null
  const existingLoc = (typeof getStoreStockLocation === 'function') ? getStoreStockLocation(store, code, size) : ''
  _inbEntry = { code, size, qty: 1, product, location: existingLoc }
  _inbRenderEntry()
  _inbFocusBarcode()   // 커서는 바코드 유지 (수량 재스캔 대비)
}

// Rule 4: 이미 리스트에 있는 상품 → 스캔 즉시 팝업 [추가]/[취소]
async function _inbHandleDuplicate(idx) {
  const row = _inbList[idx]
  if (!row) { _inbFocusBarcode(); return }
  const ok = await korConfirm(
    '이미 입고 리스트에 있는 상품입니다.\n\n' + row.code + ' / ' + row.size + ' (현재 ' + row.qty + '개)\n\n수량을 1 추가하시겠습니까?',
    '추가', '취소'
  )
  if (ok) {
    row.qty = (Number(row.qty) || 0) + 1
    _inbSaveDraft()
    _inbRenderList()
    showToast(row.code + ' ' + row.size + ' → ' + row.qty + '개', 'success')
  }
  _inbFocusBarcode()   // [추가]/[취소] 양쪽 모두 바코드로 복귀
}

// ── 로케이션 필드 Enter = 등록(커밋) 단독 트리거 ──
function onInbLocationKey(e) {
  if (e.key !== 'Enter') return
  if (e.isComposing || _inbComposing) return
  e.preventDefault()
  commitInbEntry()
}

// 진행 항목 → 입고 리스트에 등록
function commitInbEntry() {
  if (!_inbEntry) { _inbFocusBarcode(); return }
  const qty = _inbReadQtyField()
  if (!(Number.isInteger(qty) && qty >= 1)) { showToast('수량은 1 이상이어야 합니다', 'warning'); _inbFocusQty(); return }
  const locEl = document.getElementById('inbLocation')
  const loc = locEl ? String(locEl.value || '').trim() : ''
  if (!loc) {   // Rule 3: 로케이션 빈값 → 커밋 차단, 로케이션으로 포커스
    showToast('로케이션을 입력하세요', 'warning')
    _inbFocusLocation(); return
  }
  const code = _inbEntry.code, size = _inbEntry.size
  // Rule 4 로 유니크 보장되지만 방어적으로 병합
  const idx = _inbList.findIndex(r => r.code === code && r.size === size)
  if (idx >= 0) { _inbList[idx].qty = (Number(_inbList[idx].qty) || 0) + qty; _inbList[idx].location = loc }
  else { _inbList.push({ code, size, qty, location: loc }) }
  _inbSaveDraft()
  _inbEntry = null
  _inbRenderEntry()   // 폼 리셋
  _inbRenderList()
  showToast('입고 리스트에 추가: ' + code + ' ' + size + ' ' + qty + '개', 'success')
  _inbFocusBarcode()  // 등록 후 커서 복귀
}

// 진행 항목의 정보 블록(품번/사이즈/상품명/기존재고) HTML — display-only (입력 필드 아님).
function _inbInfoHtml(e) {
  const p = e.product
  const name = p ? (p.nameKr || p.nameEn || '') : '(상품 정보 없음)'
  const existStock = (typeof getStoreStock === 'function') ? Number(getStoreStock(_inbStore, e.code)[e.size] || 0) : 0
  return `
    <div class="inb-info-code">${esc(e.code)} <span class="inb-info-size">${esc(e.size)}</span></div>
    <div class="inb-info-name">${esc(name)}</div>
    <div class="inb-info-stock">기존 재고 <strong>${existStock}</strong>개 <span class="inb-info-stock-sz">(${esc(e.size)} 사이즈)</span></div>`
}

// 진행 항목 카드 렌더 (이미지/품번/사이즈/기존재고 + 수량/로케이션 프리필). null 이면 폼 리셋.
function _inbRenderEntry() {
  const qtyEl = document.getElementById('inbQty')
  const locEl = document.getElementById('inbLocation')
  const infoEl = document.getElementById('inbInfo')
  const imgEl = document.getElementById('inbImage')
  if (!_inbEntry) {
    if (qtyEl) qtyEl.value = '1'
    if (locEl) locEl.value = ''
    if (infoEl) infoEl.innerHTML = '<span class="inb-info-empty">바코드를 스캔하세요</span>'
    if (imgEl) imgEl.innerHTML = ''
    return
  }
  const e = _inbEntry
  const p = e.product
  if (qtyEl) qtyEl.value = String(e.qty)
  if (locEl) locEl.value = e.location || ''
  if (infoEl) infoEl.innerHTML = _inbInfoHtml(e)
  const img = (p && typeof getThumbUrl === 'function') ? getThumbUrl(p) : ''
  if (imgEl) imgEl.innerHTML = img
    ? `<img src="${esc(img)}" onerror="this.style.visibility='hidden'">`
    : '<div class="inb-noimg">이미지 없음</div>'
}

// 재고 인덱스 async 빌드 완료 후 보정 (🟡#1): 기존재고 숫자 최신화 + 로케이션 프리필.
// ⚠️ 수량 필드는 절대 건드리지 않음(조작 값 보존). 로케이션은 필드가 비어있을 때만 채움(조작 값 클로버 방지).
function _inbRefreshExistingInfo() {
  if (!_inbEntry) return
  const e = _inbEntry
  const infoEl = document.getElementById('inbInfo')
  if (infoEl) infoEl.innerHTML = _inbInfoHtml(e)   // 기존재고 숫자 갱신 (display-only)
  const locEl = document.getElementById('inbLocation')
  if (locEl && !String(locEl.value || '').trim() && !e.location && typeof getStoreStockLocation === 'function') {
    const loc = getStoreStockLocation(_inbStore, e.code, e.size)
    if (loc) { e.location = loc; locEl.value = loc }
  }
}

// 수량 엄격 파싱: 순수 양의 정수만 허용 (0/음수/소수/지수표기/문자 → NaN)
function _inbParseQty(v) {
  const s = String(v == null ? '' : v).trim()
  if (!/^\d+$/.test(s)) return NaN
  const n = parseInt(s, 10)
  return (n >= 1) ? n : NaN
}

// 진행 항목 수량 필드 읽기 (유효하면 그 값, 아니면 진행 항목 qty, 최종 1)
function _inbReadQtyField() {
  const el = document.getElementById('inbQty')
  const n = _inbParseQty(el ? el.value : '')
  if (!isNaN(n)) return n
  return (_inbEntry && _inbEntry.qty >= 1) ? _inbEntry.qty : 1
}

// 진행 항목 수량 직접 편집 (양의 정수 클램프, 무효 시 복원)
function onInbQtyChange(el) {
  const n = _inbParseQty(el.value)
  if (!isNaN(n)) {
    el.value = String(n)
    if (_inbEntry) _inbEntry.qty = n
  } else {
    el.value = String((_inbEntry && _inbEntry.qty) ? _inbEntry.qty : 1)
    showToast('수량은 1 이상 정수만 가능합니다', 'warning')
  }
}

// ── 입고 리스트 렌더 ──
function _inbRenderList() {
  const body = document.getElementById('inbListBody')
  const countEl = document.getElementById('inbListCount')
  if (countEl) countEl.textContent = String(_inbList.length)
  if (!body) return
  if (!_inbList.length) {
    body.innerHTML = '<tr><td colspan="5" class="inb-list-empty">스캔한 항목이 여기에 쌓입니다</td></tr>'
    return
  }
  body.innerHTML = _inbList.map((r, i) => `<tr>
    <td>${esc(r.code)}</td>
    <td class="inb-c">${esc(r.size)}</td>
    <td><input type="number" class="inb-list-qty" min="1" step="1" value="${esc(String(r.qty))}" onchange="onInbListQty(${i}, this)"></td>
    <td><input type="text" class="inb-list-loc" value="${esc(r.location)}" onchange="onInbListLoc(${i}, this)"></td>
    <td class="inb-c"><button class="inb-del-btn" onclick="removeInbRow(${i})">삭제</button></td>
  </tr>`).join('')
}

// 리스트 수량 인라인 편집 (양의 정수 클램프, 무효 시 복원)
function onInbListQty(i, el) {
  if (i < 0 || i >= _inbList.length) return
  const n = _inbParseQty(el.value)
  if (!isNaN(n)) { _inbList[i].qty = n; el.value = String(n); _inbSaveDraft() }
  else { el.value = String(_inbList[i].qty); showToast('수량은 1 이상 정수만 가능합니다', 'warning') }
}

// 리스트 로케이션 인라인 편집 (trim, 빈값 거부 — staging 행에 빈 로케이션 불허)
function onInbListLoc(i, el) {
  if (i < 0 || i >= _inbList.length) return
  const v = String(el.value || '').trim()
  if (!v) { el.value = _inbList[i].location; showToast('로케이션은 비울 수 없습니다', 'warning'); return }
  _inbList[i].location = v; el.value = v; _inbSaveDraft()
}

// 리스트 행 삭제
function removeInbRow(i) {
  if (i < 0 || i >= _inbList.length) return
  _inbList.splice(i, 1)
  _inbSaveDraft()
  _inbRenderList()
  _inbFocusBarcode()
}

// 🔒 최종 확정 — 2b 에서는 재고 쓰기 없음. 스텁(안내만). 원자적 반영(재고+입고이력)은 2c.
function inbFinalConfirm() {
  if (!_inbList.length) { showToast('입고 리스트가 비어 있습니다', 'warning'); _inbFocusBarcode(); return }
  showToast('최종 확정(재고 반영)은 다음 단계(2c)에서 구현됩니다 — 현재는 리스트만 임시저장됩니다', 'warning')
  _inbFocusBarcode()
}

// 포커스 스틸 복구 (B3): 다른 창 다녀온 뒤(visibilitychange) 입고 화면이 보이면 커서 재확보
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return
  if (_storeActiveSub !== 'inbound' || !_inbStore) return
  const panel = document.getElementById('storePanel_inbound')
  if (panel && panel.offsetParent !== null) _inbFocusBarcode()   // offsetParent!==null = 실제 표시 중
})

window.renderInboundScreen = renderInboundScreen
window.onInbBarcodeKey = onInbBarcodeKey
window.onInbLocationKey = onInbLocationKey
window.inbManualLookup = inbManualLookup
window.handleInbScan = handleInbScan
window.commitInbEntry = commitInbEntry
window.onInbQtyChange = onInbQtyChange
window.onInbListQty = onInbListQty
window.onInbListLoc = onInbListLoc
window.removeInbRow = removeInbRow
window.inbFinalConfirm = inbFinalConfirm
