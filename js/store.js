// =============================================
// ===== 매장 탭 (POS Phase 1c — shell only) =====
// =============================================
// 1c 범위: 탭 + 서브내비 6개(전부 "준비중" placeholder) + 관리자 매장 스위처.
// 재고/판매/업로드 로직 없음 (1d~ 및 Phase 3~). 권한 방침(CLAUDE.md 🔐 POS 권한 방침):
//   - 조회 화면(매출/재고)은 전 직원 개방 → 탭 자체는 TAB_PERMISSIONS.store=1
//   - 작업 화면(판매/취소/차감)은 본인 매장 직원+관리자 → 각 패널 내부에서 게이트(향후 단계)

// 서브 화면 정의 (소유주 확정 순서). 2b-r: 6→4 축소.
//   입고 스캔 → 재고현황 툴바 버튼(window), 보충대상조회 → 재고현황 툴바 버튼(placeholder window)
const STORE_SUBS = [
  { key: 'sale',      label: '판매' },
  { key: 'stock',     label: '매장별 재고현황' },
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
    // 1f: 매장별 재고현황 뷰 = 허브(hub). 조회는 전 직원(권한 방침).
    // 2b-r/2d 툴바: [입고 스캔(작업 게이트)] [입고 내역(조회, 전 직원)] [보충대상조회(조회)] [재고 업로드(관리자)] [새로고침]
    const uploadBtn = grade >= 3 ? `<button class="btn btn-outline" onclick="openStoreStockUploadModal()">📥 재고 업로드</button>` : ''
    // 입고 스캔 = 작업 → 본인 매장 직원 + 관리자만. resolveActiveStore() null(office/미배정)이면 비활성 + 사유.
    const store = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
    const scanBtn = store
      ? `<button class="btn btn-new" onclick="openInboundScanModal()">📥 입고 스캔</button>`
      : `<button class="btn btn-new" disabled title="배정된 매장이 없습니다 — 입고 불가">📥 입고 스캔</button>`
    // 입고 내역 = 조회 → 전 직원 개방(권한 방침). office 직원도 표시(매장 선택기 제공).
    const historyBtn = `<button class="btn btn-outline" onclick="openInbHistoryModal()">📋 입고 내역</button>`
    const replenishBtn = `<button class="btn btn-outline" onclick="openReplenishModal()">📋 보충대상조회</button>`
    return `<div class="store-panel${shown ? '' : ' store-panel-hidden'}" id="storePanel_stock">
      <div class="store-panel-toolbar">
        ${scanBtn}
        ${historyBtn}
        ${replenishBtn}
        ${uploadBtn}
        <button class="btn btn-outline" onclick="renderStoreStockView()">↻ 새로고침</button>
      </div>
      <div id="storeStockViewBody" class="store-stock-view">
        <div class="store-placeholder"><div class="store-placeholder-desc">불러오는 중…</div></div>
      </div>
    </div>`
  }
  if (sub.key === 'sale') {
    // 3b: 판매 화면. 스캔 → 판매 리스트(즉시 추가/병합) → 합계 → 결제수단/휴대폰 → 최종확정(3c stub).
    // 재고/원장 쓰기 없음. 권한 게이트 + draft. 입고 스캔과 병렬 코드(파이프라인 공유 안 함).
    return `<div class="store-panel${shown ? '' : ' store-panel-hidden'}" id="storePanel_sale">
      <div id="saleGate" class="inb-hidden"></div>
      <div id="saleScreen" class="sale-screen inb-hidden">
        <div class="sale-entry-card">
          <div class="sale-entry-storelbl" id="saleStoreLabel"></div>
          <div class="sale-top">
            <div class="sale-left">
              <div class="inb-field inb-field-barcode">
                <label class="inb-label">바코드 <span class="inb-label-hint">스캔하면 판매 리스트에 바로 추가 · 커서 고정</span></label>
                <div class="inb-barcode-row">
                  <input id="saleBarcode" class="inb-input inb-input-barcode" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="바코드를 스캔하세요">
                  <button class="btn btn-outline inb-lookup-btn" onclick="saleManualLookup()">조회</button>
                </div>
              </div>
            </div>
            <div class="sale-right">
              <div class="inb-card">
                <div class="inb-card-img" id="saleImage"><div class="inb-card-noimg inb-card-noimg-empty">📷</div></div>
                <div class="inb-card-info" id="saleInfo"><div class="inb-card-empty">바코드를 스캔하면<br>상품 정보가 여기에 표시됩니다</div></div>
              </div>
              <div id="saleBanner" class="inb-banner" aria-live="assertive"></div>
            </div>
          </div>
        </div>
        <div class="sale-list-section">
          <div class="inb-list-head">판매 리스트 <span class="inb-list-count-badge"><span id="saleListCount">0</span>건</span></div>
          <div class="sale-list-wrap">
            <table class="data-table sale-list-table">
              <thead><tr>
                <th style="width:40px">순번</th><th>품번</th><th class="inb-c" style="width:56px">사이즈</th>
                <th style="width:84px">단가</th><th style="width:96px">할인단가</th>
                <th style="width:88px">정상가</th><th style="width:88px">할인가</th><th style="width:96px">판매가</th>
                <th style="width:84px">수량</th><th class="inb-c" style="width:52px">삭제</th>
              </tr></thead>
              <tbody id="saleListBody"></tbody>
            </table>
          </div>
          <div class="sale-footer">
            <div class="sale-totals">
              <span class="sale-total-item">합계 <strong id="saleTotalSum">0</strong>원</span>
              <span class="sale-total-item">할인합계 <strong id="saleTotalDiscount">0</strong>원</span>
              <span class="sale-total-item">수량합계 <strong id="saleTotalQty">0</strong></span>
            </div>
            <div class="sale-pay-row">
              <label class="inb-type-label">결제수단 <select id="salePayMethod" class="inb-type-select" onchange="onSalePayChange()">
                <option value="카드">카드</option><option value="현금">현금</option><option value="계좌이체">계좌이체</option><option value="기타">기타</option>
              </select></label>
              <input id="salePhone" class="sale-phone-input" type="text" autocomplete="off" maxlength="20" placeholder="휴대폰 번호 (선택 · 적립금 대사)" oninput="onSalePhoneInput()">
              <button class="btn btn-new sale-confirm-btn" id="saleConfirmBtn" onclick="saleFinalConfirm()">최종 확정 <span class="inb-confirm-tag">(3c에서 활성화)</span></button>
            </div>
            <div class="inb-confirm-note">🔒 최종 확정(재고 차감·매출 기록)은 다음 단계(3c)에서 활성화됩니다 — 현재는 판매 리스트만 임시저장됩니다</div>
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
  else if (_storeActiveSub === 'sale') renderSaleScreen()
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
  else if (sub === 'sale') renderSaleScreen()   // 판매 화면 전환 시 로드 + 커서 세팅
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

// ── 공유 상품 상세 모달 — 이미지 + 상품명 + 정상가 + 사이즈별 재고·로케이션 (매장별, 읽기 전용) ──
// 판매 리스트(3b) + 매장별 재고현황(1f) 두 곳에서 동일 모달 사용(분기 방지). storeId 미지정 시 resolveActiveStore.
async function openStoreProductDetail(code, storeId) {
  const modal = document.getElementById('storeStockDetailModal')
  if (!modal) return
  const store = storeId
    || (typeof resolveActiveStore === 'function' ? resolveActiveStore() : '')
    || _ssvStore || _saleStore || ''
  // 재고+위치 인덱스 최신화 (2a: buildStoreStockIndex 가 _storeStockIndex + _storeLocIndex 둘 다 채움)
  if (store && typeof buildStoreStockIndex === 'function') { try { await buildStoreStockIndex(store) } catch (e) {} }
  const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null
  const name = p ? (p.nameKr || p.nameEn || '') : ''
  const price = (p && (p.salePrice || p.salePrice === 0)) ? (Number(p.salePrice).toLocaleString() + '원') : '-'
  const img = (p && typeof getThumbUrl === 'function') ? getThumbUrl(p) : ''
  const sizes = (typeof getStoreStock === 'function') ? getStoreStock(store, code) : {}
  const imgHtml = img
    ? `<img src="${esc(img)}" class="ssv-detail-img" onerror="this.style.visibility='hidden'">`
    : `<div class="ssv-detail-img ssv-detail-noimg">이미지 없음</div>`
  let total = 0
  const rows = SIZES.map(sz => {
    const v = Number(sizes[sz] || 0); total += v
    const loc = (typeof getStoreStockLocation === 'function') ? getStoreStockLocation(store, code, sz) : ''
    return `<tr>
      <td class="spd-sz">${esc(sz)}</td>
      <td class="spd-qty${v < 0 ? ' ssv-neg' : ''}">${v}</td>
      <td class="spd-loc">${loc ? esc(loc) : '-'}</td>
    </tr>`
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
    <div class="ssv-detail-section-title">사이즈별 재고 · 로케이션 · ${esc(_storeNameById(store))}</div>
    <table class="data-table spd-table">
      <thead><tr><th>사이즈</th><th>재고</th><th>로케이션</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>합계</td><td class="${total < 0 ? 'ssv-neg' : ''}">${total}</td><td>-</td></tr></tfoot>
    </table>`
  const titleEl = document.getElementById('ssvDetailTitle')
  if (titleEl) titleEl.textContent = (p ? name : code) + ' — 매장 재고'
  modal.showModal(); if (typeof centerModal === 'function') centerModal(modal)
}

// 1f 호환 래퍼 — 기존 onclick(openStoreStockDetail) 유지, 공유 모달로 위임(현재 뷰 매장)
function openStoreStockDetail(code) { openStoreProductDetail(code, _ssvStore) }

function closeStoreStockDetail() {
  const modal = document.getElementById('storeStockDetailModal')
  if (modal) modal.close()
}

window.renderStoreStockView = renderStoreStockView
window.openStoreProductDetail = openStoreProductDetail
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
let _inbLookupCode = ''     // 품번 조회에서 선택된 상품 코드 (사이즈 선택 대기)
let _inbLastEnterTime = 0   // 스캐너 CR+LF 이중발사 디바운스용 (ms)
let _inbQuotaWarned = false // localStorage 용량 경고 1회 제한
let _inbBannerTimer = null  // 인-윈도우 오류 배너 자동 숨김 타이머
let _inbInFlight = false    // 🔴 최종 확정 in-flight 가드 (중복 반영 방지 — increment 는 비멱등)

const INB_DEBOUNCE_MS = 60  // 이 시간 내 연속 Enter 는 동일 스캔의 이중발사(CR+LF)로 간주 → 무시.
                            // 사람이 스캐너를 다시 당기는 의도적 재스캔(~150ms+)은 통과 → 수량 증가.
const INB_DRAFT_VER = 1

// ── 인-윈도우 오류 배너 (Item 2) ──
// 스캔 오류 토스트는 <dialog> top-layer 뒤에 가려 안 보임 → 창 안(제품 카드 영역) 큰 배너로 표시.
// 진행 항목 카드는 파괴하지 않음 — .inb-right 위 absolute 오버레이. ~2.5s 자동 소멸(클릭 불필요, 커서 유지).
function _inbShowBanner(msg) {
  const b = document.getElementById('inbBanner')
  if (!b) { showToast(msg, 'warning'); return }   // 배너 없으면 토스트 폴백
  b.innerHTML = `<div class="inb-banner-inner"><div class="inb-banner-icon">🚫</div><div class="inb-banner-msg">${esc(msg)}</div></div>`
  b.classList.add('inb-banner-show')              // 전용 표시 클래스 (inb-hidden 아님 — override 버그 회피)
  if (_inbBannerTimer) clearTimeout(_inbBannerTimer)   // 연속 오류 → 타이머 재시작(누적 아님), 텍스트만 교체
  _inbBannerTimer = setTimeout(() => { b.classList.remove('inb-banner-show'); b.innerHTML = '' }, 2500)  // 소멸 시 완전 숨김 + 잔여 제거
}

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
  // 입고 유형 드롭다운 (활성 유형, 기본 첫 활성 / 이전 선택 유지)
  const typeSel = document.getElementById('inbType')
  if (typeSel) {
    const types = (typeof getActiveInboundTypes === 'function') ? getActiveInboundTypes() : []
    const prev = typeSel.value
    typeSel.innerHTML = types.length
      ? types.map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('')
      : '<option value="신규입고">신규입고</option>'
    if (prev && types.some(t => t.name === prev)) typeSel.value = prev
  }
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
    _inbShowBanner('한/영 키를 확인하세요 (영문 모드 필요)')
    _inbFocusBarcode(); return
  }
  handleInbScan(cleaned)
}

// 조회 버튼 (타이핑한 바코드 수동 조회 — 스캔과 동일 경로)
// 조회 버튼: 값이 바코드로 해석되면 기존 스캔 경로, 아니면 품번 검색 창을 연다.
function inbManualLookup() {
  const el = document.getElementById('inbBarcode')
  const raw = el ? String(el.value || '').trim() : ''
  if (raw) {
    const cleaned = raw.replace(/[^0-9A-Za-z]/g, '')
    const hasHangul = /[㄰-㆏가-힣]/.test(raw)
    // 입력값이 등록된 바코드로 해석되면 스캔과 동일 경로 (변경 없음)
    if (!hasHangul && cleaned && typeof findByBarcode === 'function' && findByBarcode(cleaned)) {
      if (el) el.value = ''
      handleInbScan(cleaned)
      return
    }
    // 바코드로 해석 안 됨 → 품번 검색 창 (입력값을 검색어 시드로)
    openInbLookup(raw)
    return
  }
  // 빈 값 → 품번 검색 창
  openInbLookup('')
}

// ── 스캔 해석 (바코드 → code/size) → 공용 진입점 위임 ──
function handleInbScan(barcode) {
  const store = _inbStore
  if (!store) { _inbFocusBarcode(); return }
  const hit = (typeof findByBarcode === 'function') ? findByBarcode(barcode) : null
  if (!hit) {   // Rule 1: 미등록 바코드 → 인-윈도우 배너
    _inbShowBanner('등록되지 않은 바코드입니다: ' + barcode)
    _inbFocusBarcode(); return
  }
  _inbBeginEntry(hit.productCode, hit.size)   // 스캔·조회 공용 파이프라인으로 수렴
}

// ── 공용 진입점: (code, size) → 4대 규칙 분기 (스캔·품번조회가 동일하게 호출) ──
// 스캔 해석과 조회 선택이 여기로 수렴 → 규칙 로직 중복 없음. barcode 유무와 무관.
function _inbBeginEntry(code, size) {
  const store = _inbStore
  if (!store) { _inbFocusBarcode(); return }
  if (!code || !size) { _inbFocusBarcode(); return }

  if (_inbEntry) {
    if (_inbEntry.code === code && _inbEntry.size === size) {
      // 같은 상품/사이즈 재입력(재스캔/재선택) → 수량 +1 (Rule 2 발동 안 함). 현재 필드값 기준(타이핑 존중).
      const cur = _inbReadQtyField()
      _inbEntry.qty = cur + 1
      _inbRenderEntry()
      _inbFocusBarcode(); return
    }
    // Rule 2: 진행 중 다른 상품/사이즈 → 차단 (진행 항목 변경 안 함)
    _inbShowBanner('현재 상품을 먼저 완료하세요')
    _inbFocusBarcode(); return
  }

  // 진행 항목 없음 → Rule 4: 리스트 중복?
  const idx = _inbList.findIndex(r => r.code === code && r.size === size)
  if (idx >= 0) { _inbHandleDuplicate(idx); return }   // 입력 시점 팝업 → 위치 충돌 구조적 불가

  // 신규 진행 항목 시작
  const product = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null
  const existingLoc = (typeof getStoreStockLocation === 'function') ? getStoreStockLocation(store, code, size) : ''
  _inbEntry = { code, size, qty: 1, product, location: existingLoc }
  _inbRenderEntry()
  _inbFocusBarcode()   // 커서는 바코드 유지 (수량 재입력 대비)
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
  if (!(Number.isInteger(qty) && qty >= 1)) { _inbShowBanner('수량은 1 이상이어야 합니다'); _inbFocusQty(); return }
  const locEl = document.getElementById('inbLocation')
  const loc = locEl ? ((typeof normalizeLocation === 'function') ? normalizeLocation(locEl.value) : String(locEl.value || '').trim()) : ''
  if (!loc) {   // Rule 3: 로케이션 빈값 → 커밋 차단, 로케이션으로 포커스
    _inbShowBanner('로케이션을 입력하세요')
    _inbFocusLocation(); return
  }
  if (locEl) locEl.value = loc   // 정규화 값 반영(사용자에게 보이도록)
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

// 진행 항목의 제품 카드 정보(품번/사이즈/상품명/기존재고/기존로케이션) HTML — display-only.
// 2b-r: 큰 글씨 카드. 기존재고 0 은 색상 구분(신규 위치 필요 인지). 반응형 타이포는 CSS(clamp/cqi).
function _inbInfoHtml(e) {
  const p = e.product
  const name = p ? (p.nameKr || p.nameEn || '') : '(상품 정보 없음)'
  const existStock = (typeof getStoreStock === 'function') ? Number(getStoreStock(_inbStore, e.code)[e.size] || 0) : 0
  const stockCls = existStock === 0 ? ' inb-card-stock-zero' : ''
  const loc = e.location ? esc(e.location) : '<span class="inb-card-loc-none">미지정</span>'
  return `
    <div class="inb-card-code">${esc(e.code)} <span class="inb-card-size">${esc(e.size)}</span></div>
    <div class="inb-card-name">${esc(name)}</div>
    <div class="inb-card-stock${stockCls}">기존 재고 <strong>${existStock}</strong><span class="inb-card-stock-unit">개</span> <span class="inb-card-stock-sz">(${esc(e.size)} 사이즈)</span></div>
    <div class="inb-card-loc">기존 로케이션 <strong>${loc}</strong></div>`
}

// 진행 항목 카드 렌더 (큰 이미지 + 품번/사이즈/기존재고/기존위치 + 수량/로케이션 프리필). null 이면 폼 리셋.
function _inbRenderEntry() {
  const qtyEl = document.getElementById('inbQty')
  const locEl = document.getElementById('inbLocation')
  const infoEl = document.getElementById('inbInfo')
  const imgEl = document.getElementById('inbImage')
  if (!_inbEntry) {
    if (qtyEl) qtyEl.value = '1'
    if (locEl) locEl.value = ''
    if (infoEl) infoEl.innerHTML = '<div class="inb-card-empty">바코드를 스캔하면<br>상품 정보가 여기에 크게 표시됩니다</div>'
    if (imgEl) imgEl.innerHTML = '<div class="inb-card-noimg inb-card-noimg-empty">📷</div>'
    return
  }
  const e = _inbEntry
  const p = e.product
  if (qtyEl) qtyEl.value = String(e.qty)
  if (locEl) locEl.value = e.location || ''
  if (infoEl) infoEl.innerHTML = _inbInfoHtml(e)
  const img = (p && typeof getThumbUrl === 'function') ? getThumbUrl(p) : ''
  if (imgEl) imgEl.innerHTML = img
    ? `<img src="${esc(img)}" onerror="this.parentNode.innerHTML='<div class=\\'inb-card-noimg\\'>이미지 없음</div>'">`
    : '<div class="inb-card-noimg">이미지 없음</div>'
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
// 리스트 헤더(건수 + 총 수량) 갱신. 전체 재렌더 없이 헤더만 — 인라인 수량 편집 시 포커스 유실 방지.
function _inbUpdateListHeader() {
  const countEl = document.getElementById('inbListCount')
  const totalEl = document.getElementById('inbListTotal')
  const wrap = document.getElementById('inbListTotalWrap')
  if (countEl) countEl.textContent = String(_inbList.length)
  const total = _inbList.reduce((s, r) => s + (Number(r.qty) || 0), 0)
  if (totalEl) totalEl.textContent = String(total)
  if (wrap) wrap.classList.toggle('inb-hidden', _inbList.length === 0)   // 빈 리스트면 "총 N개" 숨김
}

function _inbRenderList() {
  const body = document.getElementById('inbListBody')
  _inbUpdateListHeader()
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
  if (!isNaN(n)) { _inbList[i].qty = n; el.value = String(n); _inbSaveDraft(); _inbUpdateListHeader() }
  else { el.value = String(_inbList[i].qty); showToast('수량은 1 이상 정수만 가능합니다', 'warning') }
}

// 리스트 로케이션 인라인 편집 (trim, 빈값 거부 — staging 행에 빈 로케이션 불허)
function onInbListLoc(i, el) {
  if (i < 0 || i >= _inbList.length) return
  const v = (typeof normalizeLocation === 'function') ? normalizeLocation(el.value) : String(el.value || '').trim()   // 정규화
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

// Korea-local YYYY-MM-DD (클라이언트 TZ 무관, Asia/Seoul 기준) — storeInbound dateKey
function _inbDateKeyKST() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch (e) {
    const d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
}

// 입고번호 IN-YYYYMMDD-HHMMSS (KST) — 사람이 읽는 업무 키. 초 단위 granularity + 가드로 사실상 충돌 없음(카운터 불요).
// (기술적 유니크 그룹핑은 batchId=…+Date.now()ms 가 담당; inboundNo 는 표시/업무용)
function _inbInboundNo() {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date())
    const g = {}; parts.forEach(p => { g[p.type] = p.value })
    return 'IN-' + g.year + g.month + g.day + '-' + g.hour + g.minute + g.second
  } catch (e) {
    const d = new Date(), p = n => String(n).padStart(2, '0')
    return 'IN-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
  }
}

// 최종 확정 버튼 busy 상태 토글 (disabled + "반영 중…")
function _inbSetConfirmBusy(busy) {
  const btn = document.getElementById('inbConfirmBtn')
  if (!btn) return
  btn.disabled = !!busy
  if (busy) { if (btn.dataset.orig == null) btn.dataset.orig = btn.innerHTML; btn.textContent = '반영 중…' }
  else if (btn.dataset.orig != null) { btn.innerHTML = btn.dataset.orig; delete btn.dataset.orig }
}

// storeStock 문서 1개 + 그 코드의 storeInbound 라인들을 배치에 추가 (단일/청크 공용).
// ⚠️ 재고(sizes)=increment, 위치(sizeLocations)=overwrite — 같은 merge-set 안이지만 서로 다른 top-level 키라 math 안 섞임.
function _inbAddCodeToBatch(batch, store, code, codeLines, meta) {
  const sizesMap = {}, locMap = {}
  // 같은 code+size 중복 라인 방어적 합산 (Rule4 로 유니크하지만 draft 손상 대비) + 위치는 마지막 라인 값
  const sumBySize = {}, locBySize = {}
  codeLines.forEach(r => {
    sumBySize[r.size] = (sumBySize[r.size] || 0) + Math.floor(Number(r.qty))
    locBySize[r.size] = (typeof normalizeLocation === 'function') ? normalizeLocation(r.location) : String(r.location || '').trim()   // 정규화(방어)
  })
  Object.keys(sumBySize).forEach(sz => {
    sizesMap[sz] = firebase.firestore.FieldValue.increment(sumBySize[sz])   // 재고 = increment
    locMap[sz] = locBySize[sz]                                              // 위치 = overwrite
  })
  const stockRef = db.collection('storeStock').doc(storeStockDocId(store, code))
  batch.set(stockRef, { storeId: store, productCode: code, sizes: sizesMap, sizeLocations: locMap, updatedAt: meta.nowIso }, { merge: true })
  // storeInbound: 라인당 1 doc (감사 이력)
  codeLines.forEach(r => {
    const inbRef = db.collection('storeInbound').doc()
    batch.set(inbRef, {
      storeId: store, productCode: r.code, size: r.size, qty: Math.floor(Number(r.qty)),
      location: (typeof normalizeLocation === 'function') ? normalizeLocation(r.location) : String(r.location || '').trim(),
      workerUid: meta.uid, workerName: meta.workerName,
      confirmedAt: meta.nowIso, dateKey: meta.dateKey, batchId: meta.batchId,
      inboundNo: meta.inboundNo, memo: meta.memo,   // (추가 필드) 입고번호 + 메모 — 라인 전체 동일
      inboundType: meta.inboundType                 // (추가 필드) 입고 유형(라벨 스냅샷) — 라인 전체 동일
    })
  })
}

// 🟢 최종 확정 (POS Phase 2c) — staging → 실재고 원자적 반영.
//   storeStock: 코드당 1 merge-set (sizes increment + sizeLocations overwrite)
//   storeInbound: 라인당 1 doc (batchId 공유 = 한 입고 그룹)
//   정상 입고는 단일 배치(전부-또는-전무). >450 op 메가입고만 청크(코드 경계로만 분할 → 부분반영 시 남은 것 보존).
async function inbFinalConfirm() {
  if (_inbInFlight) return                    // 🔴 중복 클릭/Enter/재클릭 무시 (increment 비멱등)
  if (!_inbList.length) { _inbShowBanner('입고 리스트가 비어 있습니다'); _inbFocusBarcode(); return }
  const store = _inbStore
  if (!store) { _inbShowBanner('대상 매장이 없습니다'); return }
  if (!db) { _inbShowBanner('서버 연결 없음 — 잠시 후 다시 시도하세요'); return }

  // 1) 확정 시점 재검증 (draft 손상/수기수정 대비). 무효 라인 → 행 지목 + 차단(조용히 skip 금지)
  for (let i = 0; i < _inbList.length; i++) {
    const r = _inbList[i]
    const q = Math.floor(Number(r.qty))
    if (!r.code || !r.size) { _inbShowBanner((i + 1) + '번 항목 오류: 품번/사이즈 누락'); return }
    if (!(Number.isInteger(q) && q >= 1)) { _inbShowBanner(r.code + ' ' + r.size + ': 수량 오류(1 이상 정수)'); return }
    if (!String(r.location || '').trim()) { _inbShowBanner(r.code + ' ' + r.size + ': 로케이션 비어 있음'); return }
  }

  // 2) in-flight ON + busy (이 지점 이후 모든 경로는 finally 에서 release)
  // flag 는 첫 await 이전 동기 set(재진입 즉시 차단) + try 안에 두어 어떤 throw 든 finally 로 release (stuck 방지)
  let appliedCodes = []
  try {
    _inbInFlight = true
    _inbSetConfirmBusy(true)
    const CHUNK_LIMIT = 450   // 500 op 한계 안전 마진
    const lines = _inbList.slice()   // 스냅샷
    const uid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : ''
    const workerName = (typeof formatUserName === 'function')
      ? formatUserName(_currentUserName, (typeof _currentUserPosition !== 'undefined' ? _currentUserPosition : ''))
      : ((typeof _currentUserName !== 'undefined' && _currentUserName) || '')
    const nowIso = new Date().toISOString()
    const dateKey = _inbDateKeyKST()
    const batchId = dateKey + '_' + (uid || 'x') + '_' + Date.now()
    const inboundNo = _inbInboundNo()                                        // 입고번호 (표시/업무 키)
    const memo = String((document.getElementById('inbMemo') || {}).value || '').trim()   // 선택 메모
    // 입고 유형(라벨 스냅샷). 드롭다운 값 없으면 첫 활성 유형, 그것도 없으면 '신규입고'
    const typeEl = document.getElementById('inbType')
    const activeTypes = (typeof getActiveInboundTypes === 'function') ? getActiveInboundTypes() : []
    const inboundType = (typeEl && typeEl.value) || (activeTypes[0] && activeTypes[0].name) || '신규입고'
    const meta = { uid, workerName, nowIso, dateKey, batchId, inboundNo, memo, inboundType }

    // 코드별 라인 그룹 + op 수 (코드당 1 storeStock + 라인수 storeInbound)
    const codeLines = {}
    lines.forEach(r => { (codeLines[r.code] = codeLines[r.code] || []).push(r) })
    const codes = Object.keys(codeLines)
    const totalOps = codes.length + lines.length

    // 청크 구성 (코드 경계로만 분할 — 한 코드의 재고+이력은 절대 쪼개지 않음). 정상 입고면 청크 1개=단일 원자 배치.
    const chunks = []
    { let ops = 0, cur = []
      codes.forEach(code => {
        const u = 1 + codeLines[code].length
        if (cur.length && ops + u > CHUNK_LIMIT) { chunks.push(cur); cur = []; ops = 0 }
        cur.push(code); ops += u
      })
      if (cur.length) chunks.push(cur)
    }

    for (const chunkCodes of chunks) {
      const batch = db.batch()
      chunkCodes.forEach(code => _inbAddCodeToBatch(batch, store, code, codeLines[code], meta))
      await batch.commit()
      appliedCodes.push(...chunkCodes)   // 커밋 성공한 코드만 기록
    }

    // ── 성공 (전 청크 반영) ──
    const totalQty = lines.reduce((s, r) => s + Math.floor(Number(r.qty)), 0)
    const lineCount = lines.length
    _inbList = []
    _inbEntry = null
    try { localStorage.removeItem(_inbDraftKey(store)) } catch (e) {}
    const memoEl = document.getElementById('inbMemo'); if (memoEl) memoEl.value = ''   // 메모 초기화(성공 시)
    _inbRenderEntry()
    _inbRenderList()
    try { if (typeof buildStoreStockIndex === 'function') await buildStoreStockIndex(store) } catch (e) {}
    if (typeof renderStoreStockView === 'function') renderStoreStockView()
    showToast('입고 ' + lineCount + '건 · 총 ' + totalQty + '개 반영 완료', 'success')
    if (typeof logActivity === 'function') logActivity('inbound', '매장입고', _storeNameById(store) + '(' + store + '): ' + lineCount + '건 총 ' + totalQty + '개 · batch ' + batchId)
    _inbFocusBarcode()
  } catch (e) {
    console.error('inbFinalConfirm 실패:', e && e.message)
    if (!appliedCodes.length) {
      // 아무것도 반영 안 됨 → list + draft 완전 보존, 재시도 가능
      _inbShowBanner('반영 실패 — 다시 시도하세요' + (e && e.message ? ' (' + e.message + ')' : ''))
    } else {
      // 부분 반영(메가 입고 청크 중간 실패) → 반영된 코드 라인 제거, 남은 것 보존 + draft 갱신
      const appliedSet = new Set(appliedCodes)
      const before = _inbList.length
      _inbList = _inbList.filter(r => !appliedSet.has(r.code))
      _inbSaveDraft(); _inbRenderList()
      const done = before - _inbList.length
      _inbShowBanner('일부만 반영됨: ' + done + '건 완료, ' + _inbList.length + '건 남음 — 다시 확정하세요')
      try { if (typeof buildStoreStockIndex === 'function') await buildStoreStockIndex(store) } catch (e2) {}
      if (typeof renderStoreStockView === 'function') renderStoreStockView()
    }
  } finally {
    _inbInFlight = false
    _inbSetConfirmBusy(false)   // 성공/실패 무관 항상 release + 버튼 라벨 복원
  }
}

// ── 입고 스캔 창(window) 열기/닫기 (2b-r) ──
// 재고현황 허브의 [📥 입고 스캔] 버튼 → 준풀스크린 창. 명시적 닫기 전용(ESC/백드롭 닫기 없음 — main.js 참조).
function openInboundScanModal() {
  // 작업 게이트 재확인 (버튼도 게이트되지만 방어적)
  const store = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
  if (!store) { showToast('배정된 매장이 없습니다 — 입고 불가', 'warning'); return }
  const modal = document.getElementById('inboundScanModal')
  if (!modal) return
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
  renderInboundScreen()   // 게이트 + draft 로드 + 렌더 + 바코드 포커스
}

// 닫기 시도: 항목이 있으면 3지선다 확인(보존/삭제/취소), 없으면 즉시 닫기.
// 명시적-닫기-전용 유지 — 확인창은 '닫기 시도'에 뜨는 것이지 새 닫기 경로가 아님.
function closeInboundScanModal() {
  if (_inbList && _inbList.length) { _openInbCloseConfirm(); return }
  _doCloseInbScan(false)   // 빈 리스트 → 즉시 닫기 (변경 없음)
}

// 실제 닫기. clearDraft=true 면 이 매장 staging + localStorage draft 삭제 후 닫기.
function _doCloseInbScan(clearDraft) {
  if (clearDraft) {
    _inbList = []
    _inbEntry = null
    try { localStorage.removeItem(_inbDraftKey(_inbStore)) } catch (e) {}
    _inbRenderList()   // 헤더/총합 0 으로 갱신
  }
  const modal = document.getElementById('inboundScanModal')
  if (modal) modal.close()
  if (!clearDraft && _inbList && _inbList.length) showToast('입고 리스트가 임시저장되어 있습니다', '')
  if (typeof renderStoreStockView === 'function') renderStoreStockView()   // 아래 재고현황 새로고침
}

function _openInbCloseConfirm() {
  const m = document.getElementById('inbCloseConfirmModal')
  if (!m) { _doCloseInbScan(false); return }   // 확인창 없으면 보존 닫기 폴백
  const cntEl = document.getElementById('inbCloseConfirmCount')
  if (cntEl) cntEl.textContent = String(_inbList.length)
  m.showModal()
  if (typeof centerModal === 'function') centerModal(m)
  const cancelBtn = document.getElementById('inbCloseCancelBtn')
  if (cancelBtn) setTimeout(() => cancelBtn.focus(), 30)   // 기본 포커스 = 취소 (파괴적 옵션 아님)
}

function _closeInbCloseConfirm() { const m = document.getElementById('inbCloseConfirmModal'); if (m) m.close() }
function inbCloseKeep() { _closeInbCloseConfirm(); _doCloseInbScan(false) }        // 보존하고 닫기 (draft 유지)
function inbCloseDiscard() { _closeInbCloseConfirm(); _doCloseInbScan(true) }      // 삭제하고 닫기 (draft 삭제)
function inbCloseCancelChoice() { _closeInbCloseConfirm(); _inbFocusBarcode() }    // 취소 → 창 유지, 커서 복귀

// 보충대상조회 — Phase 5 placeholder 창 (조회 → 전 직원)
function openReplenishModal() {
  const modal = document.getElementById('replenishModal')
  if (modal) { modal.showModal(); if (typeof centerModal === 'function') centerModal(modal) }
}
function closeReplenishModal() {
  const modal = document.getElementById('replenishModal')
  if (modal) modal.close()
}

// ── 입고 내역 뷰 (POS Phase 2d) — 날짜별 storeInbound 조회 (읽기 전용). 전 직원 개방(권한 방침) ──
// 2c 복합인덱스(storeId, dateKey) 사용. 쓰기 없음. ESC 로 닫히는 일반 뷰어(작업 창 아님).

// confirmedAt(ISO/UTC) → KST HH:MM
// confirmedAt(ISO/UTC) → KST. fmt: 'time'=HH:MM, 'md'=MM-DD HH:MM(이력 표시), 'full'=YYYY-MM-DD HH:MM(엑셀)
function _inbHistDateTime(iso, fmt) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  try {
    const opt = { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }
    if (fmt === 'md') { opt.month = '2-digit'; opt.day = '2-digit' }
    if (fmt === 'full') { opt.year = 'numeric'; opt.month = '2-digit'; opt.day = '2-digit' }
    const parts = new Intl.DateTimeFormat('en-CA', opt).formatToParts(d)
    const g = {}; parts.forEach(p => { g[p.type] = p.value })
    if (fmt === 'md') return g.month + '-' + g.day + ' ' + g.hour + ':' + g.minute
    if (fmt === 'full') return g.year + '-' + g.month + '-' + g.day + ' ' + g.hour + ':' + g.minute
    return g.hour + ':' + g.minute
  } catch (e) {
    const p = n => String(n).padStart(2, '0')
    if (fmt === 'full') return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    if (fmt === 'md') return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    return p(d.getHours()) + ':' + p(d.getMinutes())
  }
}

let _inbHistRows = []                     // 조회된 전체(기간) 행 (정렬 완료)
let _inbHistView = []                     // 유형/상태 필터 적용된 표시 행 — 엑셀 export 대상
let _inbHistCtx = { store: '', start: '', end: '' }   // 파일명용 컨텍스트

function openInbHistoryModal() {
  const modal = document.getElementById('inbHistoryModal')
  if (!modal) return
  // 매장 선택기 — 조회 개방이라 전원 제공. 기본 = resolveActiveStore() 또는 첫 활성 매장(office 는 own store 없음)
  const active = (typeof getActiveStores === 'function') ? getActiveStores() : []
  const cur = (typeof resolveActiveStore === 'function') ? (resolveActiveStore() || (active[0] && active[0].id) || '') : ''
  const sel = document.getElementById('inbHistStore')
  if (sel) {
    sel.innerHTML = active.length
      ? active.map(s => `<option value="${esc(s.id)}"${s.id === cur ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
      : '<option value="">(활성 매장 없음)</option>'
  }
  const today = _inbDateKeyKST()
  const startEl = document.getElementById('inbHistStart'); if (startEl) startEl.value = today   // 기본 = 오늘~오늘
  const endEl = document.getElementById('inbHistEnd'); if (endEl) endEl.value = today
  // 유형 필터 (전체 + 활성 유형), 상태 필터 기본 전체
  const typeSel = document.getElementById('inbHistType')
  if (typeSel) {
    const types = (typeof getActiveInboundTypes === 'function') ? getActiveInboundTypes() : []
    typeSel.innerHTML = '<option value="">전체 유형</option>' + types.map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('')
  }
  const statusSel = document.getElementById('inbHistStatus'); if (statusSel) statusSel.value = 'all'
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
  _inbHistoryLoad()
}

function closeInbHistoryModal() {
  const modal = document.getElementById('inbHistoryModal')
  if (modal) modal.close()
}

// 조회 실행 (열림/날짜·매장 변경/새로고침). 기간(시작~마지막) 쿼리. 서버 우선 + 캐시 폴백. 인덱스 빌드 중이면 친절 안내.
async function _inbHistoryLoad() {
  const body = document.getElementById('inbHistBody')
  const sumEl = document.getElementById('inbHistSummary')
  if (!body) return
  const COLS = 10
  const setEmpty = (msg) => { body.innerHTML = `<tr><td colspan="${COLS}" class="inbhist-empty">${esc(msg)}</td></tr>`; if (sumEl) sumEl.textContent = ''; _inbHistRows = []; _inbHistView = []; _inbHistUpdateExportBtn() }
  const store = (document.getElementById('inbHistStore') || {}).value || ''
  const startEl = document.getElementById('inbHistStart'), endEl = document.getElementById('inbHistEnd')
  let start = (startEl || {}).value || '', end = (endEl || {}).value || ''
  if (!store) { setEmpty('매장을 선택하세요'); return }
  if (!start || !end) { setEmpty('시작일/마지막일을 선택하세요'); return }
  if (start > end) {   // 역순 입력 → 스왑(친절) + 입력칸 보정
    const t = start; start = end; end = t
    if (startEl) startEl.value = start; if (endEl) endEl.value = end
    showToast('시작일이 마지막일보다 늦어 자동으로 교정했습니다', 'warning')
  }
  if (!db) { setEmpty('서버 연결 없음'); return }
  _inbHistCtx = { store, start, end }
  setEmpty('불러오는 중…')

  // ⚠️ 쿼리: equality(storeId) + range(dateKey) → 배포된 복합인덱스(storeId ASC, dateKey ASC)로 서빙. orderBy 미사용(정렬은 클라이언트) → 새 인덱스 불요
  const q = db.collection('storeInbound').where('storeId', '==', store).where('dateKey', '>=', start).where('dateKey', '<=', end)
  const isIndexBuilding = (e) => e && (e.code === 'failed-precondition' || /index/i.test(e.message || ''))
  let snap = null
  try {
    snap = await q.get({ source: 'server' })
  } catch (e) {
    if (isIndexBuilding(e)) { setEmpty('인덱스 준비 중 — 잠시 후 다시 시도하세요'); return }
    try { snap = await q.get() }   // 네트워크 등 → 캐시 폴백
    catch (e2) {
      if (isIndexBuilding(e2)) { setEmpty('인덱스 준비 중 — 잠시 후 다시 시도하세요'); return }
      setEmpty('불러오기 실패: ' + (e2 && e2.message ? e2.message : '')); return
    }
  }
  const rows = []
  snap.forEach(d => rows.push(Object.assign({ _id: d.id }, d.data() || {})))   // _id = 취소 대상 식별용
  rows.sort((a, b) => String(b.confirmedAt || '').localeCompare(String(a.confirmedAt || '')))   // 최신 위 (DESC, 기간 전체)
  _inbHistRows = rows
  _inbHistApplyFilters()   // 유형/상태 클라이언트 필터 + 렌더 + 요약 + export
}

// 유형/상태 클라이언트 필터 적용 + 테이블/요약/엑셀버튼 렌더 (재조회 없음 — 쿼리는 storeId+dateKey range 로 고정, 인덱스 안전)
// ⚠️ 유형/상태를 Firestore where 에 넣지 말 것(인덱스 깨짐) — 반드시 메모리 필터.
const INB_LEGACY_TYPE = '신규입고'   // 유형 없는 구 레코드 표시/필터 기본값
function _inbHistApplyFilters() {
  const body = document.getElementById('inbHistBody')
  const sumEl = document.getElementById('inbHistSummary')
  if (!body) return
  const COLS = 10
  const typeF = (document.getElementById('inbHistType') || {}).value || ''
  const statusF = (document.getElementById('inbHistStatus') || {}).value || 'all'
  const rows = (_inbHistRows || []).filter(r => {
    const rt = r.inboundType || INB_LEGACY_TYPE
    if (typeF && rt !== typeF) return false
    if (statusF === 'active' && r.cancelled === true) return false
    if (statusF === 'cancelled' && r.cancelled !== true) return false
    return true
  })
  _inbHistView = rows
  _inbHistUpdateExportBtn()
  if (!rows.length) {
    const msg = (_inbHistRows && _inbHistRows.length) ? '조건(유형/상태)에 맞는 내역이 없습니다' : '해당 기간의 입고 내역이 없습니다'
    body.innerHTML = `<tr><td colspan="${COLS}" class="inbhist-empty">${esc(msg)}</td></tr>`
    if (sumEl) sumEl.textContent = ''
    return
  }
  const totalQty = rows.filter(r => r.cancelled !== true).reduce((s, r) => s + (Number(r.qty) || 0), 0)
  if (sumEl) sumEl.innerHTML = `표시 <strong>${rows.length}</strong>건 · 총 <strong>${totalQty}</strong>개 <span class="inbhist-sum-note">(취소 제외)</span>`
  // 취소 권한 = 관리자(grade>=3) OR 본인 매장 직원. 권한 없으면 버튼 숨김(서버 규칙이 최종 방어)
  const myGrade = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  const myStore = (typeof _currentUserStoreId !== 'undefined' && _currentUserStoreId) ? _currentUserStoreId : ''
  body.innerHTML = rows.map(r => {
    const cancelled = r.cancelled === true
    const rowCls = cancelled ? ' class="inbhist-cancelled-row"' : ''
    const canCancel = (myGrade >= 3) || (myStore && myStore === r.storeId)
    const actionCell = cancelled
      ? `<span class="inbhist-cancel-badge" title="${esc('취소: ' + (r.cancelledByName || '') + ' (' + _inbHistDateTime(r.cancelledAt, 'full') + ') · ' + (r.cancelReason || ''))}">취소됨</span>`
      : (canCancel
          ? `<button class="inbhist-cancel-btn" onclick="requestInbCancel('${esc(r._id)}')">취소</button>`
          : '<span class="inbhist-noperm">-</span>')
    return `<tr${rowCls}>
      <td class="inbhist-no">${esc(r.inboundNo || '-')}</td>
      <td class="inbhist-time">${esc(_inbHistDateTime(r.confirmedAt, 'md'))}</td>
      <td>${esc(r.productCode || '')}</td>
      <td style="text-align:center">${esc(r.size || '')}</td>
      <td style="text-align:right">${Number(r.qty) || 0}</td>
      <td>${esc(r.location || '')}</td>
      <td>${esc(r.workerName || '')}</td>
      <td class="inbhist-memo">${esc(r.memo || '')}</td>
      <td class="inbhist-type">${esc(r.inboundType || INB_LEGACY_TYPE)}</td>
      <td class="inbhist-action">${actionCell}</td>
    </tr>`
  }).join('')
}

// 엑셀 버튼 활성/비활성 (필터 결과 빈 → 비활성)
function _inbHistUpdateExportBtn() {
  const btn = document.getElementById('inbHistExportBtn')
  if (btn) btn.disabled = !(_inbHistView && _inbHistView.length)
}

// 필터 적용된 결과 엑셀 다운로드 (읽기 전용). 입고유형 + 상태/취소사유 컬럼 포함. 최신순(화면과 동일).
function downloadInbHistory() {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  if (!_inbHistView || !_inbHistView.length) { showToast('내보낼 입고 내역이 없습니다', 'warning'); return }
  const header = ['입고번호', '일시', '품번', '사이즈', '수량', '로케이션', '작업자', '메모', '입고유형', '상태', '취소사유']
  const aoa = [header].concat(_inbHistView.map(r => [
    r.inboundNo || '-', _inbHistDateTime(r.confirmedAt, 'full'), r.productCode || '', r.size || '',
    Number(r.qty) || 0, r.location || '', r.workerName || '', r.memo || '',
    (r.inboundType || INB_LEGACY_TYPE),
    (r.cancelled === true ? '취소됨' : '정상'), (r.cancelled === true ? (r.cancelReason || '') : '')
  ]))
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 18 }, { wch: 17 }, { wch: 16 }, { wch: 7 }, { wch: 7 }, { wch: 16 }, { wch: 12 }, { wch: 24 }, { wch: 10 }, { wch: 8 }, { wch: 24 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '입고내역')
  const storeName = _storeNameById(_inbHistCtx.store) || _inbHistCtx.store || '매장'
  const fname = '입고내역_' + storeName + '_' + (_inbHistCtx.start || '') + '~' + (_inbHistCtx.end || '') + '.xlsx'
  XLSX.writeFile(wb, fname)
}

// ── 입고 취소 (역반영 + 사유 필수 + 기록 보존) — 재고 변경, 2c 급 엄격도 ──
// runTransaction: 원본 doc read → !cancelled 검증 → storeStock increment(-qty) + 원본에 취소 필드 write (원자적 check-and-set).
// 동시 취소 레이스를 완전 차단(트랜잭션 재시도) — batch+precheck 의 미세 window 없음.
let _inbCancelInFlight = false
let _inbCancelTarget = null   // 취소 대상 행 (_inbHistRows 항목, _id 포함)

function requestInbCancel(docId) {
  const row = (_inbHistRows || []).find(r => r._id === docId)
  if (!row) { showToast('내역을 찾을 수 없습니다', 'warning'); return }
  if (row.cancelled === true) { showToast('이미 취소된 내역입니다', 'warning'); _inbHistoryLoad(); return }
  // 권한 방어(버튼 게이트 + 서버 규칙 외 추가) — 관리자 OR 본인 매장만
  const g = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  const ms = (typeof _currentUserStoreId !== 'undefined' && _currentUserStoreId) ? _currentUserStoreId : ''
  if (!(g >= 3 || (ms && ms === row.storeId))) { showToast('본인 매장 입고만 취소할 수 있습니다', 'warning'); return }
  _inbCancelTarget = row
  const modal = document.getElementById('inbCancelModal')
  if (!modal) return
  const sumEl = document.getElementById('inbCancelSummary')
  if (sumEl) sumEl.innerHTML = `<div class="inbcancel-line"><strong>${esc(row.productCode || '')}</strong> <span class="inbcancel-sz">${esc(row.size || '')}</span> · 수량 <strong>${Number(row.qty) || 0}</strong> · ${esc(row.location || '')}</div><div class="inbcancel-no">${esc(row.inboundNo || '-')}</div>`
  const prevEl = document.getElementById('inbCancelPreview')
  if (prevEl) prevEl.textContent = '재고 계산 중…'
  const reasonEl = document.getElementById('inbCancelReason'); if (reasonEl) reasonEl.value = ''
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
  // 결과 재고 미리보기 — 해당 매장 인덱스 보장 후 계산(비동기)
  ;(async () => {
    try { if (typeof buildStoreStockIndex === 'function') await buildStoreStockIndex(row.storeId) } catch (e) {}
    if (_inbCancelTarget !== row) return   // 그 사이 다른 대상으로 바뀌면 무시
    const cur = (typeof getStoreStock === 'function') ? Number(getStoreStock(row.storeId, row.productCode)[row.size] || 0) : 0
    const after = cur - (Number(row.qty) || 0)
    if (prevEl) prevEl.innerHTML = `취소 시 재고: <strong>${cur}</strong> → <strong class="${after < 0 ? 'inbcancel-neg' : ''}">${after}</strong>` + (after < 0 ? ' <span class="inbcancel-neg">(음수 — 이미 판매됨 가능)</span>' : '')
  })()
  setTimeout(() => { const r = document.getElementById('inbCancelReason'); if (r) r.focus() }, 40)   // 포커스 = 사유(파괴 버튼 아님)
}

function closeInbCancelModal() {
  const modal = document.getElementById('inbCancelModal')
  if (modal) modal.close()
}

async function confirmInbCancel() {
  if (_inbCancelInFlight) return
  const row = _inbCancelTarget
  if (!row) return
  const reasonEl = document.getElementById('inbCancelReason')
  const reason = reasonEl ? String(reasonEl.value || '').trim() : ''
  if (!reason) { showToast('취소 사유를 입력하세요', 'warning'); if (reasonEl) reasonEl.focus(); return }
  if (!db) { showToast('서버 연결 없음', 'warning'); return }
  const btn = document.getElementById('inbCancelConfirmBtn')
  try {
    _inbCancelInFlight = true
    if (btn) { btn.disabled = true; if (btn.dataset.orig == null) btn.dataset.orig = btn.textContent; btn.textContent = '취소 중…' }
    const uid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : ''
    const workerName = (typeof formatUserName === 'function')
      ? formatUserName(_currentUserName, (typeof _currentUserPosition !== 'undefined' ? _currentUserPosition : ''))
      : ((typeof _currentUserName !== 'undefined' && _currentUserName) || '')
    const nowIso = new Date().toISOString()
    const inbRef = db.collection('storeInbound').doc(row._id)

    // 원자적 check-and-set: read → !cancelled 확인 → 재고 역반영 + 취소 필드 기록
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(inbRef)
      if (!snap.exists) throw new Error('NOT_FOUND')
      const d = snap.data() || {}
      if (d.cancelled === true) throw new Error('ALREADY_CANCELLED')
      const stockRef = db.collection('storeStock').doc(storeStockDocId(d.storeId, d.productCode))
      tx.set(stockRef, {
        storeId: d.storeId, productCode: d.productCode,
        sizes: { [d.size]: firebase.firestore.FieldValue.increment(-Number(d.qty || 0)) },   // 역반영 = increment(-qty). sizeLocations 안 건드림
        updatedAt: nowIso
      }, { merge: true })
      tx.update(inbRef, {
        cancelled: true, cancelledAt: nowIso, cancelledBy: uid, cancelledByName: workerName, cancelReason: reason
      })
    })

    showToast('입고 취소 완료: ' + (row.inboundNo || '') + ' ' + (row.productCode || '') + ' ' + (row.size || '') + ' -' + (Number(row.qty) || 0), 'success')
    if (typeof logActivity === 'function') logActivity('inbound-cancel', '입고취소', (row.inboundNo || '') + ' ' + (row.productCode || '') + '/' + (row.size || '') + ' -' + (Number(row.qty) || 0) + ' · 사유: ' + reason)
    try { if (typeof buildStoreStockIndex === 'function') await buildStoreStockIndex(row.storeId) } catch (e) {}
    if (typeof renderStoreStockView === 'function') renderStoreStockView()
    closeInbCancelModal()
    _inbCancelTarget = null
    _inbHistoryLoad()   // 이력 새로고침 (취소됨 표시)
  } catch (e) {
    const msg = e && e.message
    if (msg === 'ALREADY_CANCELLED') { showToast('이미 취소된 내역입니다', 'warning'); closeInbCancelModal(); _inbCancelTarget = null; _inbHistoryLoad() }
    else if (msg === 'NOT_FOUND') { showToast('내역을 찾을 수 없습니다', 'warning'); closeInbCancelModal(); _inbCancelTarget = null; _inbHistoryLoad() }
    else { console.error('입고 취소 실패:', msg); showToast('입고 취소 실패 — 다시 시도하세요' + (msg ? ' (' + msg + ')' : ''), 'error') }   // 재시도 위해 창 유지
  } finally {
    _inbCancelInFlight = false
    if (btn) { btn.disabled = false; if (btn.dataset.orig != null) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig } }
  }
}

// ── 품번 조회 (조회 버튼) — 바코드 없는 상품/스캔 불가 상황용. 스캔과 동일 파이프라인으로 수렴 ──
// 서브 다이얼로그(빠른 검색) — 작업 창(inboundScanModal)의 명시적-닫기-전용과 별개로 ESC 로 닫힘(빠른 취소).
function openInbLookup(seed) {
  const modal = document.getElementById('inbLookupModal')
  if (!modal) return
  _inbLookupCode = ''
  const searchEl = document.getElementById('inbLookupSearch')
  if (searchEl) searchEl.value = seed || ''
  _inbHideLookupSizes()
  renderInbLookupResults()
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
  if (searchEl) setTimeout(() => searchEl.focus(), 30)   // 열림 → 검색창 포커스
}

function closeInbLookup() {
  const modal = document.getElementById('inbLookupModal')
  if (modal) modal.close()   // close 이벤트 → 바코드 재포커스 (main.js 등록)
}

function _inbHideLookupSizes() {
  _inbLookupCode = ''
  const sizes = document.getElementById('inbLookupSizes')
  if (sizes) { sizes.classList.add('inb-hidden'); sizes.innerHTML = '' }
}

// 바코드 등록 여부 (Item 5 정책): 입고는 바코드 기반 작업 → 바코드 등록된 (품번,사이즈)만 등록 대상.
function _inbHasBarcode(p, size) {
  return !!(p && p.barcodes && p.barcodes[size] && String(p.barcodes[size]).trim())
}
// 바코드 등록된 사이즈 목록. State.allProducts 의 p.barcodes 를 실시간으로 읽음 → 나중에 추가된 바코드 즉시 반영(Item 6).
function _inbBarcodedSizes(p) {
  return SIZES.filter(sz => _inbHasBarcode(p, sz))
}

// 검색: 품번 또는 상품명(한/영) 부분일치(대소문자 무시), soft-deleted 제외, 바코드 등록 사이즈 0인 상품 제외(Item 5). 최대 60건.
// ⚠️ 매 호출마다 State.allProducts 를 새로 읽음 → 스냅샷 캐시 없음. 바코드 나중에 추가돼도 조회 재검색/재오픈 시 즉시 반영(Item 6).
function renderInbLookupResults() {
  const out = document.getElementById('inbLookupResults')
  if (!out) return
  _inbHideLookupSizes()
  const q = String((document.getElementById('inbLookupSearch') || {}).value || '').trim().toLowerCase()
  if (!q) { out.innerHTML = '<div class="inb-lookup-hint">품번 또는 상품명을 입력하세요</div>'; return }
  const list = (State.allProducts || []).filter(p => {
    if (!p || p.deleted) return false
    if (_inbBarcodedSizes(p).length === 0) return false   // Item 5: 바코드 없는 상품은 조회에서 제외
    const code = (p.productCode || '').toLowerCase()
    const nk = (p.nameKr || '').toLowerCase()
    const ne = (p.nameEn || '').toLowerCase()
    return code.indexOf(q) >= 0 || nk.indexOf(q) >= 0 || ne.indexOf(q) >= 0
  })
  if (!list.length) { out.innerHTML = '<div class="inb-lookup-hint">검색 결과가 없습니다</div>'; return }
  const capped = list.slice(0, 60)
  const more = list.length > 60 ? `<div class="inb-lookup-hint">상위 60건만 표시 — 검색어를 더 입력하세요 (전체 ${list.length}건)</div>` : ''
  out.innerHTML = capped.map(p => {
    const name = esc(p.nameKr || p.nameEn || '')
    const img = (typeof getThumbUrl === 'function') ? getThumbUrl(p) : ''
    const thumb = img
      ? `<img src="${esc(img)}" class="inb-lookup-thumb" onerror="this.style.visibility='hidden'">`
      : '<span class="inb-lookup-thumb inb-lookup-thumb-none">—</span>'
    return `<div class="inb-lookup-row" onclick="selectInbLookupProduct('${esc(p.productCode)}')">
      ${thumb}
      <span class="inb-lookup-code">${esc(p.productCode)}</span>
      <span class="inb-lookup-name">${name}</span>
    </div>`
  }).join('') + more
}

// 상품 선택 → 사이즈 선택기 표시. Item 5: 바코드 등록된 사이즈만 표시(나머지는 숨김). 사이즈별 기존재고 힌트.
function selectInbLookupProduct(code) {
  _inbLookupCode = code
  const sizes = document.getElementById('inbLookupSizes')
  if (!sizes) return
  const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null
  const name = p ? esc(p.nameKr || p.nameEn || '') : ''
  const stockMap = (typeof getStoreStock === 'function') ? getStoreStock(_inbStore, code) : {}
  const bcSizes = p ? _inbBarcodedSizes(p) : []   // 바코드 등록된 사이즈만 (실시간 p.barcodes)
  if (!bcSizes.length) {
    // 이론상 도달 안 함(결과에서 이미 제외) — 방어적
    sizes.innerHTML = '<div class="inb-lookup-hint">이 상품은 바코드가 등록되어 있지 않습니다</div>'
    sizes.classList.remove('inb-hidden'); return
  }
  const btns = bcSizes.map(sz => {
    const st = Number(stockMap[sz] || 0)
    return `<button class="inb-size-btn" onclick="chooseInbLookupSize('${esc(sz)}')">
      <span class="inb-size-lbl">${esc(sz)}</span>
      <span class="inb-size-stock">재고 ${st}</span>
    </button>`
  }).join('')
  sizes.innerHTML = `<div class="inb-lookup-sizes-head">${esc(code)} <span class="inb-lookup-sizes-name">${name}</span> — 사이즈 선택</div>
    <div class="inb-size-grid">${btns}</div>`
  sizes.classList.remove('inb-hidden')
}

// 사이즈 선택 → 조회 창 닫고 공용 진입점 호출 (스캔과 100% 동일 처리)
function chooseInbLookupSize(size) {
  const code = _inbLookupCode
  if (!code || !size) return
  closeInbLookup()
  _inbBeginEntry(code, size)   // ← 스캔과 동일 파이프라인 (Rule 2/4, 재입력 qty++, 카드/프리필)
}

// 포커스 스틸 복구 (B3): 다른 창 다녀온 뒤(visibilitychange) 입고 스캔 창이 열려있으면 커서 재확보
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return
  const lookup = document.getElementById('inbLookupModal')
  if (lookup && lookup.open) { const s = document.getElementById('inbLookupSearch'); if (s) s.focus(); return }  // 조회 창이 위면 검색창 유지
  const modal = document.getElementById('inboundScanModal')
  if (modal && modal.open && _inbStore) _inbFocusBarcode()
})

// 품번 조회 창 / 닫기 확인창이 닫히면(ESC/×/선택 후) 스캔 창이 열려있는 한 바코드로 커서 복귀
;(function () {
  const refocusIfScanOpen = () => {
    const scan = document.getElementById('inboundScanModal')
    if (scan && scan.open) _inbFocusBarcode()
  }
  const lookup = document.getElementById('inbLookupModal')
  if (lookup) lookup.addEventListener('close', refocusIfScanOpen)
  // 닫기 확인창 ESC → 취소(창 유지) 취급: close 이벤트로 커서만 복귀 (버튼 경로는 각자 처리)
  const closeConf = document.getElementById('inbCloseConfirmModal')
  if (closeConf) closeConf.addEventListener('close', refocusIfScanOpen)
})()

window.openInboundScanModal = openInboundScanModal
window.closeInboundScanModal = closeInboundScanModal
window.inbCloseKeep = inbCloseKeep
window.inbCloseDiscard = inbCloseDiscard
window.inbCloseCancelChoice = inbCloseCancelChoice
window.openReplenishModal = openReplenishModal
window.closeReplenishModal = closeReplenishModal
window.openInbHistoryModal = openInbHistoryModal
window.closeInbHistoryModal = closeInbHistoryModal
window._inbHistoryLoad = _inbHistoryLoad
window._inbHistApplyFilters = _inbHistApplyFilters
window.downloadInbHistory = downloadInbHistory
window.requestInbCancel = requestInbCancel
window.closeInbCancelModal = closeInbCancelModal
window.confirmInbCancel = confirmInbCancel
window.renderInboundScreen = renderInboundScreen
window.openInbLookup = openInbLookup
window.closeInbLookup = closeInbLookup
window.renderInbLookupResults = renderInbLookupResults
window.selectInbLookupProduct = selectInbLookupProduct
window.chooseInbLookupSize = chooseInbLookupSize
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

// =============================================
// ===== 매출 원장 데이터층 (POS Phase 3a) =====
// =============================================
// 콘솔 테스트용 생성자/헬퍼만 — UI 없음, 재고/DB 쓰기 없음. 실제 판매 확정 배치는 3c, 판매 취소는 3e.
// 설계: append-only 거래 단위 문서(영수증형), 취소=역기록(deterministic id). 정수 KRW 전용. 설계문서 pos-phase3-design.md §2/§7 준거.

// 전화번호 정규화 — 숫자만(적립금 대사 매칭용). '' → ''. 길이 검증 안 함(자릿수 다양).
function normalizePhone(raw) {
  return String(raw == null ? '' : raw).replace(/\D/g, '')
}

// 전화번호 마스킹 표시 — 가운데 마스킹. '01012345678' → '010-****-5678'. 짧으면 graceful.
function maskPhone(digits) {
  const d = String(digits == null ? '' : digits).replace(/\D/g, '')
  if (!d) return ''
  if (d.length <= 4) return d
  const head = d.slice(0, d.length >= 11 ? 3 : 2)   // 010 / 02 등
  return head + '-****-' + d.slice(-4)
}

// 판매번호 SL-YYYYMMDD-HHMMSS (KST) — 고객 1명(1 체크아웃) 단위. 표시/업무 키(문서 id 는 auto).
function generateSaleNo() {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date())
    const g = {}; parts.forEach(p => { g[p.type] = p.value })
    return 'SL-' + g.year + g.month + g.day + '-' + g.hour + g.minute + g.second
  } catch (e) {
    const d = new Date(), p = n => String(n).padStart(2, '0')
    return 'SL-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
  }
}

// 판매 라인 정규화 — 정수 KRW, 파생값(정상가/할인가/판매가) 항상 재계산(입력 totals 신뢰 안 함). 0 ≤ 할인단가 ≤ 단가.
function _buildSaleLine(raw) {
  const qty = Math.max(1, Math.floor(Number(raw && raw.qty) || 0))
  const unitPrice = Math.max(0, Math.floor(Number(raw && raw.unitPrice) || 0))
  let unitDiscount = Math.max(0, Math.floor(Number(raw && raw.unitDiscount) || 0))
  if (unitDiscount > unitPrice) unitDiscount = unitPrice
  const lineNormal = unitPrice * qty         // 정상가
  const lineDiscount = unitDiscount * qty     // 할인가
  return {
    productCode: String((raw && raw.productCode) || ''),
    size: String((raw && raw.size) || ''),
    qty, unitPrice, unitDiscount,
    lineNormal, lineDiscount,
    lineTotal: lineNormal - lineDiscount,     // 판매가 = 정상가 - 할인가
    discountSource: (raw && raw.discountSource === 'store-discount') ? 'store-discount' : 'manual'
  }
}

// 판매 문서 생성자 — spec 강제(totals 재계산, phone 정규화, 정수, payMethod 화이트리스트). 재고/DB 쓰기 없음.
function buildSaleDoc(opts) {
  opts = opts || {}
  const lines = (opts.lines || []).map(_buildSaleLine)
  const totals = {
    total: lines.reduce((s, l) => s + l.lineTotal, 0),          // 합계
    discountTotal: lines.reduce((s, l) => s + l.lineDiscount, 0), // 할인합계
    qtyTotal: lines.reduce((s, l) => s + l.qty, 0)               // 수량합계
  }
  const PAY = ['카드', '현금', '계좌이체', '기타']
  return {
    type: 'sale',
    saleNo: opts.saleNo || generateSaleNo(),
    storeId: String(opts.storeId || ''),
    lines: lines,
    totals: totals,
    payMethod: PAY.indexOf(opts.payMethod) >= 0 ? opts.payMethod : '카드',
    customerPhone: normalizePhone(opts.customerPhone),
    workerUid: String(opts.workerUid || ''),
    workerName: String(opts.workerName || ''),
    soldAt: opts.soldAt || new Date().toISOString(),
    dateKey: opts.dateKey || _inbDateKeyKST()   // KST YYYY-MM-DD (2c/2d 와 동일 헬퍼)
  }
}

// 취소(역기록) 문서 생성자 — 원본 lines/totals/phone 복사, 사유·voidedBy 필수(호출부/규칙 보장). 재고/DB 쓰기 없음.
function buildVoidDoc(original, originalSaleId, opts) {
  original = original || {}; opts = opts || {}
  return {
    type: 'void',
    originalSaleId: String(originalSaleId || ''),
    originalSaleNo: String(original.saleNo || ''),
    storeId: String(original.storeId || ''),
    lines: (original.lines || []).map(l => Object.assign({}, l)),   // 되돌릴 대상(원본 라인 스냅샷)
    totals: original.totals ? Object.assign({}, original.totals) : { total: 0, discountTotal: 0, qtyTotal: 0 },
    voidReason: String(opts.voidReason || ''),
    voidedBy: String(opts.voidedBy || ''),
    voidedByName: String(opts.voidedByName || ''),
    voidedAt: opts.voidedAt || new Date().toISOString(),
    dateKey: opts.dateKey || _inbDateKeyKST(),
    customerPhone: normalizePhone(original.customerPhone)   // 적립금-지급-후-취소 대사용 상속
  }
}

// 취소 문서 결정적 id — 원본 판매 doc id 기반. 동일 판매의 취소는 항상 같은 id →
// 2번째 취소 write 는 기존 doc 에 대한 'update' 로 평가됨 → 규칙 update:false 로 거부 → double-void 구조적 불가.
function voidDocId(saleDocId) { return 'void_' + String(saleDocId || '') }

window.normalizePhone = normalizePhone
window.maskPhone = maskPhone
window.generateSaleNo = generateSaleNo
window.buildSaleDoc = buildSaleDoc
window.buildVoidDoc = buildVoidDoc
window.voidDocId = voidDocId

// =============================================
// ===== 판매 화면 (POS Phase 3b) =====
// =============================================
// 판매 서브탭. 스캔 → 판매 리스트 즉시 추가/병합 → 합계 → 결제수단/휴대폰 → 최종확정(3c stub).
// 🔒 재고/원장 쓰기 없음. 입고 스캔과 병렬 코드(파이프라인 공유 안 함). 순수 헬퍼만 재사용(findByBarcode/_ssvFindProduct/_inbBarcodedSizes/_inbParseQty/getStoreStock/getThumbUrl).

let _saleStore = ''         // 현재 판매 매장
let _saleList = []          // 판매 라인 [{productCode,size,qty,unitPrice,unitDiscount,discountSource}]
let _saleCardKey = null     // 마지막 스캔 (카드 표시용)
let _saleComposing = false  // IME 조합 중
let _saleLastEnterTime = 0  // 스캐너 이중발사 디바운스
let _saleBannerTimer = null // 오류 배너 타이머
let _saleLookupCode = ''    // 품번조회 선택 상품

function _saleFocusBarcode() { const el = document.getElementById('saleBarcode'); if (el) { el.focus(); if (el.select) el.select() } }

function _saleShowBanner(msg) {
  const b = document.getElementById('saleBanner')
  if (!b) { showToast(msg, 'warning'); return }
  b.innerHTML = `<div class="inb-banner-inner"><div class="inb-banner-icon">🚫</div><div class="inb-banner-msg">${esc(msg)}</div></div>`
  b.classList.add('inb-banner-show')
  if (_saleBannerTimer) clearTimeout(_saleBannerTimer)
  _saleBannerTimer = setTimeout(() => { b.classList.remove('inb-banner-show'); b.innerHTML = '' }, 2500)
}

// ── draft (매장별) ──
function _saleDraftKey(store) { return 'lemango_sale_draft_' + (store || _saleStore || '') }
function _saleSaveDraft() {
  if (!_saleStore) return
  const payEl = document.getElementById('salePayMethod'), phoneEl = document.getElementById('salePhone')
  try {
    localStorage.setItem(_saleDraftKey(_saleStore), JSON.stringify({
      v: 1, items: _saleList,
      payMethod: payEl ? payEl.value : '카드',
      phone: phoneEl ? phoneEl.value : ''
    }))
  } catch (e) { console.warn('판매 draft 저장 실패:', e && e.message) }
}
function _saleLoadDraft(store) {
  const EMPTY = { items: [], payMethod: '카드', phone: '' }
  let raw = null
  try { raw = localStorage.getItem(_saleDraftKey(store)) } catch (e) { return EMPTY }
  if (!raw) return EMPTY
  try {
    const o = JSON.parse(raw)
    if (!o || o.v !== 1) return EMPTY
    const items = Array.isArray(o.items) ? o.items.filter(l => l && l.productCode && l.size).map(l => ({
      productCode: String(l.productCode), size: String(l.size),
      qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
      unitPrice: Math.max(0, Math.floor(Number(l.unitPrice) || 0)),
      unitDiscount: Math.max(0, Math.floor(Number(l.unitDiscount) || 0)),
      discountSource: l.discountSource === 'store-discount' ? 'store-discount' : 'manual'
    })) : []
    return { items, payMethod: o.payMethod || '카드', phone: o.phone || '' }
  } catch (e) {
    console.warn('판매 draft 파싱 실패 — 초기화:', e && e.message)
    showToast('판매 임시저장 손상 — 초기화했습니다', 'warning')
    try { localStorage.removeItem(_saleDraftKey(store)) } catch (e2) {}
    return EMPTY
  }
}

// ── 화면 렌더 (권한 게이트 + draft 로드 + 커서) ──
function renderSaleScreen() {
  const gate = document.getElementById('saleGate'), screen = document.getElementById('saleScreen')
  if (!gate || !screen) return
  const store = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
  if (!store) {   // 판매 = 작업 → office/미배정 차단
    _saleStore = ''; _saleList = []
    screen.classList.add('inb-hidden'); gate.classList.remove('inb-hidden')
    gate.innerHTML = `<div class="store-placeholder"><div class="store-placeholder-icon">🚫</div><div class="store-placeholder-title">판매 불가</div><div class="store-placeholder-desc">배정된 매장이 없습니다 — 관리자에게 문의하세요.</div></div>`
    return
  }
  gate.classList.add('inb-hidden'); gate.innerHTML = ''
  screen.classList.remove('inb-hidden')
  _saleStore = store
  const draft = _saleLoadDraft(store)   // 매장 전환 시 해당 매장 draft
  _saleList = draft.items
  _saleCardKey = null
  if (typeof buildStoreStockIndex === 'function') buildStoreStockIndex(store).then(() => { if (_saleStore === store && _saleCardKey) _saleRenderCard(_saleCardKey.code, _saleCardKey.size) }).catch(() => {})
  if (typeof buildBarcodeIndex === 'function') buildBarcodeIndex()
  _saleBindEvents()
  const payEl = document.getElementById('salePayMethod'); if (payEl) payEl.value = draft.payMethod || '카드'
  const phoneEl = document.getElementById('salePhone'); if (phoneEl) phoneEl.value = draft.phone || ''
  _saleRenderCard(null)
  _saleRenderList()
  const lbl = document.getElementById('saleStoreLabel'); if (lbl) lbl.textContent = '판매 매장: ' + _storeNameById(store)
  _saleFocusBarcode()
}

function _saleBindEvents() {
  const bc = document.getElementById('saleBarcode')
  if (bc && !bc.dataset.saleBound) {
    bc.dataset.saleBound = '1'
    bc.addEventListener('keydown', onSaleBarcodeKey)
    bc.addEventListener('compositionstart', () => { _saleComposing = true })
    bc.addEventListener('compositionend', () => { _saleComposing = false })
  }
}

// ── 바코드 Enter (스캔) ──
function onSaleBarcodeKey(e) {
  if (e.key !== 'Enter') return
  if (e.isComposing || _saleComposing) return
  e.preventDefault()
  const now = Date.now()
  const el = document.getElementById('saleBarcode')
  const raw = el ? String(el.value || '') : ''
  if (now - _saleLastEnterTime < INB_DEBOUNCE_MS) { if (el) el.value = ''; _saleFocusBarcode(); return }   // CR+LF 디바운스(입고와 공유 상수)
  _saleLastEnterTime = now
  const rawTrim = raw.trim()
  if (!rawTrim) { _saleFocusBarcode(); return }
  if (el) el.value = ''
  const cleaned = rawTrim.replace(/[^0-9A-Za-z]/g, '')
  const hasHangul = /[㄰-㆏가-힣]/.test(rawTrim)
  if (!cleaned || hasHangul) { _saleShowBanner('한/영 키를 확인하세요 (영문 모드 필요)'); _saleFocusBarcode(); return }
  handleSaleScan(cleaned)
}

// 조회 버튼: 바코드로 해석되면 스캔, 아니면 품번 검색 창
function saleManualLookup() {
  const el = document.getElementById('saleBarcode')
  const raw = el ? String(el.value || '').trim() : ''
  if (raw) {
    const cleaned = raw.replace(/[^0-9A-Za-z]/g, '')
    const hasHangul = /[㄰-㆏가-힣]/.test(raw)
    if (!hasHangul && cleaned && typeof findByBarcode === 'function' && findByBarcode(cleaned)) { if (el) el.value = ''; handleSaleScan(cleaned); return }
    openSaleLookup(raw); return
  }
  openSaleLookup('')
}

// 스캔 해석 → Rule 1(미등록)만 차단, 나머지는 라인 추가/병합
function handleSaleScan(barcode) {
  if (!_saleStore) { _saleFocusBarcode(); return }
  const hit = (typeof findByBarcode === 'function') ? findByBarcode(barcode) : null
  if (!hit) { _saleShowBanner('등록되지 않은 바코드입니다: ' + barcode); _saleFocusBarcode(); return }
  _saleBeginLine(hit.productCode, hit.size)
}

// 판매 라인 추가/병합 (스캔·조회 공용). 같은 (품번,사이즈) → qty++ 병합(팝업 없음).
function _saleBeginLine(code, size) {
  if (!_saleStore || !code || !size) { _saleFocusBarcode(); return }
  const idx = _saleList.findIndex(l => l.productCode === code && l.size === size)
  if (idx >= 0) {
    _saleList[idx].qty = (Number(_saleList[idx].qty) || 0) + 1
  } else {
    const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null
    const unitPrice = p ? Math.max(0, Math.floor(Number(p.salePrice) || 0)) : 0
    _saleList.push({ productCode: code, size, qty: 1, unitPrice, unitDiscount: 0, discountSource: 'manual' })
  }
  _saleCardKey = { code, size }
  _saleSaveDraft()
  _saleRenderCard(code, size)
  _saleRenderList()
  _saleFocusBarcode()   // 커서 바코드 유지
}

// 스캔 상품 카드 (이미지 + 품번/사이즈 + 판매가/할인가 + 현재재고 red if ≤0)
function _saleRenderCard(code, size) {
  const infoEl = document.getElementById('saleInfo'), imgEl = document.getElementById('saleImage')
  if (!code) {
    if (infoEl) infoEl.innerHTML = '<div class="inb-card-empty">바코드를 스캔하면<br>상품 정보가 여기에 표시됩니다</div>'
    if (imgEl) imgEl.innerHTML = '<div class="inb-card-noimg inb-card-noimg-empty">📷</div>'
    return
  }
  const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null
  const name = p ? (p.nameKr || p.nameEn || '') : '(상품 정보 없음)'
  const price = p ? Math.max(0, Math.floor(Number(p.salePrice) || 0)) : 0
  const stock = (typeof getStoreStock === 'function') ? Number(getStoreStock(_saleStore, code)[size] || 0) : 0
  const stockCls = stock <= 0 ? ' inb-card-stock-zero' : ''
  if (infoEl) infoEl.innerHTML = `
    <div class="inb-card-code">${esc(code)} <span class="inb-card-size">${esc(size)}</span></div>
    <div class="inb-card-name">${esc(name)}</div>
    <div class="sale-card-price">판매가 <strong>${price.toLocaleString()}</strong>원 · 할인가 <strong>0</strong>원</div>
    <div class="inb-card-stock${stockCls}">현재 재고 <strong>${stock}</strong>개 <span class="inb-card-stock-sz">(${esc(size)})</span></div>`
  const img = (p && typeof getThumbUrl === 'function') ? getThumbUrl(p) : ''
  if (imgEl) imgEl.innerHTML = img
    ? `<img src="${esc(img)}" onerror="this.parentNode.innerHTML='<div class=\\'inb-card-noimg\\'>이미지 없음</div>'">`
    : '<div class="inb-card-noimg">이미지 없음</div>'
}

// 판매 리스트 렌더 (파생값 항상 재계산, 정수 KRW). mockup: 정상가=단가×수량, 할인가=할인단가×수량, 판매가=정상가−할인가.
function _saleRenderList() {
  const body = document.getElementById('saleListBody')
  const countEl = document.getElementById('saleListCount')
  if (countEl) countEl.textContent = String(_saleList.length)
  if (!body) { _saleUpdateTotals(); return }
  if (!_saleList.length) { body.innerHTML = '<tr><td colspan="10" class="inbhist-empty">스캔한 상품이 여기에 쌓입니다</td></tr>'; _saleUpdateTotals(); return }
  body.innerHTML = _saleList.map((l, i) => {
    const unitPrice = Math.max(0, Math.floor(Number(l.unitPrice) || 0))
    let unitDiscount = Math.max(0, Math.floor(Number(l.unitDiscount) || 0)); if (unitDiscount > unitPrice) unitDiscount = unitPrice
    const qty = Math.max(1, Math.floor(Number(l.qty) || 1))
    const lineNormal = unitPrice * qty, lineDiscount = unitDiscount * qty, lineTotal = lineNormal - lineDiscount
    const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(l.productCode) : null
    const nm = p ? (p.nameKr || p.nameEn || '') : ''
    return `<tr>
      <td class="inb-c">${i + 1}</td>
      <td><span class="code-link" onclick="openStoreProductDetail('${esc(l.productCode)}', '${esc(_saleStore)}')">${esc(l.productCode)}</span>${nm ? `<div class="sale-line-name">${esc(nm)}</div>` : ''}</td>
      <td class="inb-c">${esc(l.size)}</td>
      <td style="text-align:right">${unitPrice.toLocaleString()}</td>
      <td><input type="number" class="sale-line-input" min="0" step="1" value="${unitDiscount}" onchange="onSaleLineDiscount(${i}, this)"></td>
      <td style="text-align:right">${lineNormal.toLocaleString()}</td>
      <td style="text-align:right">${lineDiscount.toLocaleString()}</td>
      <td style="text-align:right;font-weight:700">${lineTotal.toLocaleString()}</td>
      <td><input type="number" class="sale-line-input" min="1" step="1" value="${qty}" onchange="onSaleLineQty(${i}, this)"></td>
      <td class="inb-c"><button class="inb-del-btn" onclick="removeSaleLine(${i})">삭제</button></td>
    </tr>`
  }).join('')
  _saleUpdateTotals()
}

// 합계 실시간 (합계=Σ판매가, 할인합계=Σ할인가, 수량합계=Σ수량). 정수.
function _saleUpdateTotals() {
  let sum = 0, disc = 0, qty = 0
  _saleList.forEach(l => {
    const up = Math.max(0, Math.floor(Number(l.unitPrice) || 0))
    let ud = Math.max(0, Math.floor(Number(l.unitDiscount) || 0)); if (ud > up) ud = up
    const q = Math.max(1, Math.floor(Number(l.qty) || 1))
    disc += ud * q; sum += (up * q - ud * q); qty += q
  })
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v }
  set('saleTotalSum', sum.toLocaleString())
  set('saleTotalDiscount', disc.toLocaleString())
  set('saleTotalQty', String(qty))
}

// 수량 인라인 편집 (양의 정수)
function onSaleLineQty(i, el) {
  if (i < 0 || i >= _saleList.length) return
  const n = (typeof _inbParseQty === 'function') ? _inbParseQty(el.value) : (/^\d+$/.test(String(el.value).trim()) ? parseInt(el.value, 10) : NaN)
  if (!isNaN(n) && n >= 1) { _saleList[i].qty = n; _saleSaveDraft(); _saleRenderList() }
  else { el.value = String(_saleList[i].qty); showToast('수량은 1 이상 정수만 가능합니다', 'warning') }
}

// 할인단가 인라인 편집 (0 이상 정수, 단가 초과 시 클램프)
function onSaleLineDiscount(i, el) {
  if (i < 0 || i >= _saleList.length) return
  const s = String(el.value || '').trim()
  const n = /^\d+$/.test(s) ? parseInt(s, 10) : NaN
  if (isNaN(n)) { el.value = String(_saleList[i].unitDiscount || 0); showToast('할인단가는 0 이상 정수만 가능합니다', 'warning'); return }
  const up = Math.max(0, Math.floor(Number(_saleList[i].unitPrice) || 0))
  const clamped = Math.min(n, up)
  _saleList[i].unitDiscount = clamped
  if (clamped !== n) showToast('할인단가는 단가를 초과할 수 없습니다', 'warning')
  _saleSaveDraft(); _saleRenderList()
}

function removeSaleLine(i) {
  if (i < 0 || i >= _saleList.length) return
  _saleList.splice(i, 1); _saleSaveDraft(); _saleRenderList(); _saleFocusBarcode()
}

function onSalePayChange() { _saleSaveDraft() }
function onSalePhoneInput() { _saleSaveDraft() }   // 원시값 저장(정규화는 3c 확정 시)

// 🔒 최종 확정 — 3b stub. 재고/원장 쓰기 없음. 실제 반영은 3c.
function saleFinalConfirm() {
  if (!_saleList.length) { _saleShowBanner('판매 리스트가 비어 있습니다'); _saleFocusBarcode(); return }
  showToast('최종 확정(재고 차감·매출 기록)은 다음 단계(3c)에서 구현됩니다 — 현재는 판매 리스트만 임시저장됩니다', 'warning')
  _saleFocusBarcode()
}

// ── 품번 조회 (조회 버튼) — 입고 조회와 병렬. 바코드 등록 사이즈만. 스캔과 동일 라인 추가로 수렴. ──
function openSaleLookup(seed) {
  const modal = document.getElementById('saleLookupModal'); if (!modal) return
  _saleLookupCode = ''
  const s = document.getElementById('saleLookupSearch'); if (s) s.value = seed || ''
  _saleHideLookupSizes()
  renderSaleLookupResults()
  modal.showModal(); if (typeof centerModal === 'function') centerModal(modal)
  if (s) setTimeout(() => s.focus(), 30)
}
function closeSaleLookup() { const m = document.getElementById('saleLookupModal'); if (m) m.close() }
function _saleHideLookupSizes() { _saleLookupCode = ''; const z = document.getElementById('saleLookupSizes'); if (z) { z.classList.add('inb-hidden'); z.innerHTML = '' } }

function renderSaleLookupResults() {
  const out = document.getElementById('saleLookupResults'); if (!out) return
  _saleHideLookupSizes()
  const q = String((document.getElementById('saleLookupSearch') || {}).value || '').trim().toLowerCase()
  if (!q) { out.innerHTML = '<div class="inb-lookup-hint">품번 또는 상품명을 입력하세요</div>'; return }
  const list = (State.allProducts || []).filter(p => {
    if (!p || p.deleted) return false
    if ((typeof _inbBarcodedSizes === 'function' ? _inbBarcodedSizes(p) : []).length === 0) return false   // 바코드 등록 상품만
    const c = (p.productCode || '').toLowerCase(), nk = (p.nameKr || '').toLowerCase(), ne = (p.nameEn || '').toLowerCase()
    return c.indexOf(q) >= 0 || nk.indexOf(q) >= 0 || ne.indexOf(q) >= 0
  })
  if (!list.length) { out.innerHTML = '<div class="inb-lookup-hint">검색 결과가 없습니다</div>'; return }
  const capped = list.slice(0, 60)
  const more = list.length > 60 ? `<div class="inb-lookup-hint">상위 60건만 표시 — 검색어를 더 입력하세요 (전체 ${list.length}건)</div>` : ''
  out.innerHTML = capped.map(p => {
    const name = esc(p.nameKr || p.nameEn || '')
    const img = (typeof getThumbUrl === 'function') ? getThumbUrl(p) : ''
    const thumb = img ? `<img src="${esc(img)}" class="inb-lookup-thumb" onerror="this.style.visibility='hidden'">` : '<span class="inb-lookup-thumb inb-lookup-thumb-none">—</span>'
    return `<div class="inb-lookup-row" onclick="selectSaleLookupProduct('${esc(p.productCode)}')">${thumb}<span class="inb-lookup-code">${esc(p.productCode)}</span><span class="inb-lookup-name">${name}</span></div>`
  }).join('') + more
}
function selectSaleLookupProduct(code) {
  _saleLookupCode = code
  const sizes = document.getElementById('saleLookupSizes'); if (!sizes) return
  const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null
  const name = p ? esc(p.nameKr || p.nameEn || '') : ''
  const stockMap = (typeof getStoreStock === 'function') ? getStoreStock(_saleStore, code) : {}
  const bc = p ? (typeof _inbBarcodedSizes === 'function' ? _inbBarcodedSizes(p) : []) : []
  if (!bc.length) { sizes.innerHTML = '<div class="inb-lookup-hint">이 상품은 바코드가 등록되어 있지 않습니다</div>'; sizes.classList.remove('inb-hidden'); return }
  sizes.innerHTML = `<div class="inb-lookup-sizes-head">${esc(code)} <span class="inb-lookup-sizes-name">${name}</span> — 사이즈 선택</div>
    <div class="inb-size-grid">` + bc.map(sz => {
    const st = Number(stockMap[sz] || 0)
    return `<button class="inb-size-btn" onclick="chooseSaleLookupSize('${esc(sz)}')"><span class="inb-size-lbl">${esc(sz)}</span><span class="inb-size-stock">재고 ${st}</span></button>`
  }).join('') + '</div>'
  sizes.classList.remove('inb-hidden')
}
function chooseSaleLookupSize(size) {
  const code = _saleLookupCode
  if (!code || !size) return
  closeSaleLookup()
  _saleBeginLine(code, size)
}

// 다른 창 복귀 시 판매 화면 보이면 커서 재확보 + 조회창 닫힘 시 복귀
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return
  const lookup = document.getElementById('saleLookupModal')
  if (lookup && lookup.open) { const s = document.getElementById('saleLookupSearch'); if (s) s.focus(); return }
  const panel = document.getElementById('storePanel_sale')
  if (panel && panel.offsetParent !== null && _saleStore) _saleFocusBarcode()
})
;(function () {
  const lookup = document.getElementById('saleLookupModal')
  if (lookup) lookup.addEventListener('close', () => {
    const panel = document.getElementById('storePanel_sale')
    if (panel && panel.offsetParent !== null) _saleFocusBarcode()
  })
})()

window.renderSaleScreen = renderSaleScreen
window.onSaleBarcodeKey = onSaleBarcodeKey
window.saleManualLookup = saleManualLookup
window.handleSaleScan = handleSaleScan
window.onSaleLineQty = onSaleLineQty
window.onSaleLineDiscount = onSaleLineDiscount
window.removeSaleLine = removeSaleLine
window.onSalePayChange = onSalePayChange
window.onSalePhoneInput = onSalePhoneInput
window.saleFinalConfirm = saleFinalConfirm
window.openSaleLookup = openSaleLookup
window.closeSaleLookup = closeSaleLookup
window.renderSaleLookupResults = renderSaleLookupResults
window.selectSaleLookupProduct = selectSaleLookupProduct
window.chooseSaleLookupSize = chooseSaleLookupSize
