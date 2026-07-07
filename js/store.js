// =============================================
// ===== 매장 탭 (POS Phase 1c — shell only) =====
// =============================================
// 1c 범위: 탭 + 서브내비 6개(전부 "준비중" placeholder) + 관리자 매장 스위처.
// 재고/판매/업로드 로직 없음 (1d~ 및 Phase 3~). 권한 방침(CLAUDE.md 🔐 POS 권한 방침):
//   - 조회 화면(매출/재고)은 전 직원 개방 → 탭 자체는 TAB_PERMISSIONS.store=1
//   - 작업 화면(판매/취소/차감)은 본인 매장 직원+관리자 → 각 패널 내부에서 게이트(향후 단계)

// 서브 화면 정의 (소유주 확정 순서). 2b-r: 6→4 축소.
//   입고 스캔 → 재고현황 툴바 버튼(window), 보충대상조회 → 재고현황 툴바 버튼(보충 발주 window, R1)
const STORE_SUBS = [
  { key: 'sale',      label: '판매' },
  { key: 'sales',     label: '매출 조회' },   // 3e: 조회 전 직원 개방(작업 게이트 없음) — 판매와 재고현황 사이
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
    // 재고수정(실사) = 작업 → 본인 매장 직원 + 관리자만. 입고와 동일 게이트(resolveActiveStore null 이면 비활성).
    const adjustBtn = store
      ? `<button class="btn btn-new" onclick="openAdjustModal()">🛠 재고수정</button>`
      : `<button class="btn btn-new" disabled title="배정된 매장이 없습니다 — 재고수정 불가">🛠 재고수정</button>`
    // 입고 내역 = 조회 → 전 직원 개방(권한 방침). office 직원도 표시(매장 선택기 제공). (매출 조회는 3e 에서 전용 서브탭으로 승격)
    const historyBtn = `<button class="btn btn-outline" onclick="openInbHistoryModal()">📋 입출고 내역</button>`
    // 6d: 품목 이동 원장(조회 전 직원) + 기준 재고 설정(관리자 전용)
    const ledgerBtn = `<button class="btn btn-outline" onclick="openLedger('', _ssvStore)">📊 품목 원장</button>`
    const baselineBtn = grade >= 3 ? `<button class="btn btn-outline" onclick="openBaselineConfirm()">🧭 기준 재고 설정</button>` : ''
    const replenishBtn = `<button class="btn btn-outline" onclick="openReplenishModal()">📋 보충대상조회</button>`
    return `<div class="store-panel${shown ? '' : ' store-panel-hidden'}" id="storePanel_stock">
      <div class="store-panel-toolbar">
        ${scanBtn}
        ${adjustBtn}
        ${historyBtn}
        ${ledgerBtn}
        ${replenishBtn}
        ${uploadBtn}
        ${baselineBtn}
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
          <div class="sale-entry-head">
            <div class="sale-entry-storelbl" id="saleStoreLabel"></div>
            <button class="btn btn-outline btn-sm sale-hist-link" onclick="switchStoreTab('sales')">📊 매출 조회</button>
          </div>
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
            <div id="saleAppliedPromos" class="sale-applied-promos inb-hidden"></div>
            <div class="sale-pay-row">
              <label class="inb-type-label">결제수단 <select id="salePayMethod" class="inb-type-select" onchange="onSalePayChange()">
                <option value="카드">카드</option><option value="현금">현금</option><option value="계좌이체">계좌이체</option><option value="기타">기타</option>
              </select></label>
              <input id="salePhone" class="sale-phone-input" type="text" autocomplete="off" maxlength="20" placeholder="휴대폰 번호 (선택 · 적립금 대사)" oninput="onSalePhoneInput()">
              <button class="btn btn-new sale-confirm-btn" id="saleConfirmBtn" onclick="saleFinalConfirm()">최종 확정</button>
            </div>
            <div class="inb-confirm-note">확정 시 재고가 차감되고 매출 원장에 기록됩니다 — 확정 전 확인 창이 열립니다</div>
          </div>
        </div>
      </div>
    </div>`
  }
  if (sub.key === 'sales') {
    // 3e: 매출 조회 서브탭 (3d 모달 UI 를 패널로 승격). 읽기 전용, 조회 전 직원 개방. 영수증 상세는 모달 유지.
    return `<div class="store-panel${shown ? '' : ' store-panel-hidden'}" id="storePanel_sales">
      <div class="shist-panel">
        <div class="shist-controls">
          <div class="shist-mode">
            <button id="shModeRange" class="shist-mode-btn shist-mode-active" onclick="_shSetMode('range')">기간 조회</button>
            <button id="shModePhone" class="shist-mode-btn" onclick="_shSetMode('phone')">📱 번호 검색</button>
          </div>
          <div class="shist-query" id="shRangeQuery">
            <label class="inbhist-ctl">시작일 <input type="date" id="shStart" class="inbhist-date" onchange="_shLoad()"></label>
            <label class="inbhist-ctl">마지막일 <input type="date" id="shEnd" class="inbhist-date" onchange="_shLoad()"></label>
            <label class="inbhist-ctl">매장 <select id="shStore" class="inbhist-store" onchange="_shLoad()"></select></label>
            <button class="btn btn-outline" onclick="_shLoad()">↻ 새로고침</button>
          </div>
          <div class="shist-query inb-hidden" id="shPhoneQuery">
            <label class="inbhist-ctl">휴대폰 <input type="text" id="shPhone" class="inbhist-store" autocomplete="off" placeholder="번호 입력 (숫자만)" onkeydown="if(event.key==='Enter')_shPhoneSearch()"></label>
            <button class="btn btn-new" onclick="_shPhoneSearch()">🔍 검색</button>
            <span class="shist-phonenote">전 매장 · 전 기간 · 적립금 대조용(전체번호 표시)</span>
          </div>
          <div class="shist-filters">
            <label class="inbhist-ctl">결제수단 <select id="shPay" class="inbhist-store" onchange="_shApplyFilters()"><option value="">전체</option><option value="카드">카드</option><option value="현금">현금</option><option value="계좌이체">계좌이체</option><option value="기타">기타</option></select></label>
            <label class="inbhist-ctl">상태 <select id="shStatus" class="inbhist-store" onchange="_shApplyFilters()"><option value="all">전체</option><option value="active">정상만</option><option value="cancelled">취소만</option></select></label>
            <button class="btn btn-outline" id="shExportBtn" onclick="downloadSalesHistory()">📤 엑셀 다운로드</button>
            <span class="inbhist-summary inb-list-count-badge" id="shSummary"></span>
          </div>
        </div>
        <div class="shist-table-wrap">
          <table class="data-table inbhist-table shist-table">
            <thead><tr><th style="width:170px">판매번호</th><th style="width:90px">일시</th><th>품목</th><th style="width:56px">수량</th><th style="width:96px">합계</th><th style="width:72px">결제</th><th style="width:120px">휴대폰</th><th style="width:70px">상태</th></tr></thead>
            <tbody id="shBody"></tbody>
          </table>
        </div>
      </div>
    </div>`
  }
  if (sub.key === 'discount') {
    // 5-1 매장 할인 규칙 관리 (설정 카드에서 이전). 패널=조회 전 직원 / 관리(추가·수정·삭제)=grade≥4.
    // 본문은 renderStoreDiscountPanel() 이 온디맨드로 채움(_storeDiscounts 변경/실시간 동기화 시 재호출).
    return `<div class="store-panel${shown ? '' : ' store-panel-hidden'}" id="storePanel_discount">
      <div id="storeDiscountBody" class="store-disc-panel">
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
  else if (_storeActiveSub === 'sale') renderSaleScreen()
  else if (_storeActiveSub === 'sales') renderSalesHistoryPanel()
  else if (_storeActiveSub === 'discount') renderStoreDiscountPanel()
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
  else if (sub === 'sales') renderSalesHistoryPanel()   // 매출 조회 전환 시 초기화 + 자동 조회
  else if (sub === 'discount') renderStoreDiscountPanel()   // 매장 할인 관리 전환 시 렌더(관리=grade≥4)
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
// ===== 매장 할인 규칙 관리 (POS Phase 5-1 — 설정 카드에서 서브탭으로 이전) =====
// =============================================
// UI 위치만 이전 — 규칙 모델/엔진(_saleApplyDiscounts)/판매경로(discountSource·appliedRule)/Firestore 규칙은 5-1 그대로.
// 데이터층(_storeDiscounts / saveStoreDiscounts / generateDiscountId / getActiveDiscounts)=core.js 무변경.
// 조회=전 직원(서브탭 진입 가능) · 관리(추가/수정/삭제/토글)=grade≥4(설정 카드 isTopAdmin 게이트와 동일).

function _discCanManage() {
  const grade = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  return grade >= 4
}

// 신규 규칙 storeScope 기본값 = 현재 매장 컨텍스트(resolveActiveStore). 활성 매장이면 그 매장, 아니면 '전 매장'.
// (모델은 5-1 그대로 all|storeId — 이전으로 매장 컨텍스트가 손에 잡히니 기본값만 합리적으로 연결.)
function _discDefaultScope() {
  const s = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
  if (!s) return 'all'
  const active = (typeof getActiveStores === 'function') ? getActiveStores() : []
  return active.some(x => x && x.id === s) ? s : 'all'
}

// 5-2: 조건 종류별 허용 혜택 옵션. 총액(cartTotal)=%/정액 · 그 외(상품/브랜드/카테고리)=%/특정가.
function _discBenefitOptions(ctype, curType) {
  const opts = (ctype === 'cartTotal' || ctype === 'combo')
    ? [['percent', '％ 할인'], ['amount', '정액(−원)']]
    : (ctype === 'qty')
      ? [['nplus', 'N+M 증정'], ['secondHalf', 'n번째 %할인']]   // 5-3
      : (ctype === 'bundle')
        ? [['bundlePrice', '고정가(원)']]   // 5-4
        : [['percent', '％ 할인'], ['fixed', '특정가']]
  return opts.map(([v, l]) => `<option value="${v}"${v === curType ? ' selected' : ''}>${l}</option>`).join('')
}

// 5-2/5-3: 조건 종류 변경 → 해당 조건 입력만 노출(CSS .disc-ct-*) + 혜택 옵션 재구성(총액=%/정액 · 수량=N+M/n번째 · 그 외=%/특정가).
function _discCondToggle(sel) {
  const fs = sel && sel.closest ? sel.closest('.disc-fieldset') : null
  if (!fs) return
  const ct = sel.value || 'product'
  fs.classList.remove('disc-ct-product', 'disc-ct-brand', 'disc-ct-category', 'disc-ct-cartTotal', 'disc-ct-qty', 'disc-ct-combo', 'disc-ct-bundle')
  fs.classList.add('disc-ct-' + ct)
  const bsel = fs.querySelector('.disc-btype')
  if (bsel) { const cur = bsel.value; bsel.innerHTML = _discBenefitOptions(ct, cur) }   // fixed↔amount 비호환 시 첫 옵션(percent) 자동 선택
}
window._discCondToggle = _discCondToggle

// 서브탭 본문 렌더 (온디맨드 + 실시간 동기화/CRUD 후 재호출). #storeDiscountBody 없으면 no-op(타 탭에서 안전).
function renderStoreDiscountPanel() {
  const body = document.getElementById('storeDiscountBody')
  if (!body) return
  const canManage = _discCanManage()

  const _sdList = (typeof _storeDiscounts !== 'undefined' ? _storeDiscounts : [])
    .map((r, i) => ({ r, i })).sort((a, b) => (a.r.order || 0) - (b.r.order || 0))
  const activeStores = (typeof getActiveStores === 'function') ? getActiveStores() : []
  const storeOptsAll = '<option value="all">전 매장</option>' + activeStores.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')
  const prodDatalist = `<datalist id="discProdList">` + (State.allProducts || []).filter(p => p && !p.deleted).slice(0, 2000)
    .map(p => `<option value="${esc(p.productCode)}">${esc(p.nameKr || p.nameEn || '')}</option>`).join('') + `</datalist>`
  // 5-2: 브랜드(상품 brand)·카테고리(상품 type) 후보 — 기존 값에서 distinct.
  const _pAll = (State.allProducts || []).filter(p => p && !p.deleted)
  const brands = [...new Set(_pAll.map(p => String(p.brand || '')).filter(Boolean))].sort()
  const cats = [...new Set(_pAll.map(p => String(p.type || '')).filter(Boolean))].sort()
  const brandOpts = (cur) => '<option value="">브랜드 선택</option>' + brands.map(x => `<option value="${esc(x)}"${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join('')
  const catOpts = (cur) => '<option value="">카테고리 선택</option>' + cats.map(x => `<option value="${esc(x)}"${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join('')
  const sumOf = (r) => {
    const c = r.condition || {}, b = r.benefit || {}, p = r.period || {}
    let cond
    if (c.type === 'product') { const prod = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(c.productCode) : null; cond = '상품 ' + esc(c.productCode || '') + (prod ? ' · ' + esc(prod.nameKr || prod.nameEn || '') : '') }
    else if (c.type === 'brand') cond = '브랜드 ' + esc(c.brand || '')
    else if (c.type === 'category') cond = '카테고리 ' + esc(c.category || '')
    else if (c.type === 'cartTotal') cond = '🛒 총액 ≥ ₩' + Number(c.minTotal || 0).toLocaleString()
    else if (c.type === 'qty') cond = '🎁 수량 ' + (c.scope === 'product' ? '상품' : c.scope === 'brand' ? '브랜드' : '카테고리') + ' ' + esc(c.ref || '')
    else if (c.type === 'combo' || c.type === 'bundle') cond = (c.type === 'bundle' ? '🎁 번들 ' : '🎁 콤보 ') + (Array.isArray(c.items) ? c.items.map(m => esc((m.scope === 'product' ? '' : (m.scope + ':')) + (m.ref || ''))).join('+') : '') + ((c.eachQty || 1) > 1 ? ' ×' + c.eachQty : '')
    else cond = esc(c.type || '')
    let ben
    if (b.type === 'percent') ben = Number(b.value || 0) + '%'
    else if (b.type === 'fixed') ben = '특정가 ₩' + Number(b.price || 0).toLocaleString()
    else if (b.type === 'amount') ben = '정액 −₩' + Number(b.minus || 0).toLocaleString()
    else if (b.type === 'nplus') ben = Number(b.buy || 0) + '+' + Number(b.free || 0) + ' 증정(최저가 무료)'
    else if (b.type === 'secondHalf') ben = Number(b.nth || 0) + '번째 ' + Number(b.value || 0) + '% (최저가)'
    else if (b.type === 'bundlePrice') ben = '고정가 ₩' + Number(b.price || 0).toLocaleString()
    else ben = esc(b.type || '')
    const per = (p.start || p.end) ? ((p.start || '~') + ' ~ ' + (p.end || '~')) : '상시'
    const scope = (!r.storeScope || r.storeScope === 'all') ? '전 매장' : (Array.isArray(r.storeScope) ? r.storeScope.map(x => esc(_storeNameById(x))).join(',') : esc(_storeNameById(r.storeScope)))
    return `<span class="disc-sum-cond">${cond}</span> · <span class="disc-sum-ben">${ben}</span> · ${esc(per)} · ${scope}`
  }
  // 조건타입별 동적 필드(disc-fieldset). 조건=상품/브랜드/카테고리/총액, 혜택=조건에 따라 %/특정가 또는 %/정액.
  //   disc-cv-* 은 CSS(.disc-ct-*)로 토글, _discCondToggle(this) 가 조건 변경 시 클래스+혜택옵션 갱신.
  const editFields = (r) => {
    const c = (r && r.condition) || {}, b = (r && r.benefit) || {}
    const ct = c.type || 'product'
    // 혜택 값: 비-qty = 단일(%/원). qty = bval(buy/nth) + bval2(free/value).
    let bval, bval2 = ''
    if (ct === 'qty') {
      if (b.type === 'secondHalf') { bval = b.nth; bval2 = b.value } else { bval = b.buy; bval2 = b.free }
    } else if (ct === 'bundle') { bval = b.price }
    else if (ct === 'combo') { bval = (b.type === 'amount') ? b.minus : b.value }
    else { bval = (b.type === 'fixed') ? b.price : (b.type === 'amount') ? b.minus : b.value }
    const qscope = (ct === 'qty') ? (c.scope || 'product') : 'product'
    const qref = (ct === 'qty') ? (c.ref || '') : ''
    const membersStr = (ct === 'combo' || ct === 'bundle') && Array.isArray(c.items) ? c.items.map(m => (m.scope || 'product') + ':' + (m.ref || '')).join(',') : ''
    const eachQtyV = (ct === 'combo' || ct === 'bundle') ? String(c.eachQty || 1) : ''
    const scope = (r && r.storeScope) || 'all'
    return `<div class="disc-fieldset disc-ct-${esc(ct)}">
      <input type="text" class="set-edit-input disc-f-name" value="${esc((r && r.name) || '')}" placeholder="규칙명" style="flex:1 1 120px" />
      <select class="set-edit-input disc-f-ctype disc-ctype" onchange="_discCondToggle(this)" style="flex:0 0 100px" title="할인 조건 종류">
        <option value="product"${ct === 'product' ? ' selected' : ''}>상품</option>
        <option value="brand"${ct === 'brand' ? ' selected' : ''}>브랜드</option>
        <option value="category"${ct === 'category' ? ' selected' : ''}>카테고리</option>
        <option value="cartTotal"${ct === 'cartTotal' ? ' selected' : ''}>총액(카트)</option>
        <option value="qty"${ct === 'qty' ? ' selected' : ''}>수량(N+1·반값)</option>
        <option value="combo"${ct === 'combo' ? ' selected' : ''}>콤보</option>
        <option value="bundle"${ct === 'bundle' ? ' selected' : ''}>번들(고정가)</option>
      </select>
      <input type="text" class="set-edit-input disc-cv disc-cv-product disc-f-code" list="discProdList" value="${esc(c.productCode || '')}" placeholder="품번" style="flex:1 1 120px" />
      <select class="set-edit-input disc-cv disc-cv-brand disc-f-brand" style="flex:0 0 120px">${brandOpts(c.brand || '')}</select>
      <select class="set-edit-input disc-cv disc-cv-category disc-f-category" style="flex:0 0 120px">${catOpts(c.category || '')}</select>
      <input type="number" class="set-edit-input disc-cv disc-cv-cartTotal disc-f-mintotal" value="${esc(ct === 'cartTotal' ? String(c.minTotal ?? '') : '')}" placeholder="총액 ≥ 원" min="1" style="flex:0 0 120px" title="이 금액 이상이면 카트 할인" />
      <select class="set-edit-input disc-cv disc-cv-qty disc-f-qscope" style="flex:0 0 96px" title="수량 promo 범위">
        <option value="product"${qscope === 'product' ? ' selected' : ''}>상품</option>
        <option value="brand"${qscope === 'brand' ? ' selected' : ''}>브랜드</option>
        <option value="category"${qscope === 'category' ? ' selected' : ''}>카테고리</option>
      </select>
      <input type="text" class="set-edit-input disc-cv disc-cv-qty disc-f-qref" list="discProdList" value="${esc(qref)}" placeholder="품번/브랜드/카테고리" style="flex:1 1 120px" title="수량 promo 대상(품번 또는 브랜드/카테고리 값)" />
      <input type="text" class="set-edit-input disc-cv disc-cv-cb disc-f-members" value="${esc(membersStr)}" placeholder="멤버: scope:ref, 콤마 (예: product:ABC,category:bikini)" style="flex:2 1 240px" title="콤보/번들 멤버 — scope:ref 콤마구분(scope=product/brand/category), 2개 이상" />
      <input type="number" class="set-edit-input disc-cv disc-cv-cb disc-f-eachqty" value="${esc(eachQtyV)}" placeholder="각 N개" min="1" style="flex:0 0 76px" title="멤버당 필요 수량(기본1)" />
      <select class="set-edit-input disc-f-btype disc-btype" style="flex:0 0 116px" title="혜택 종류">${_discBenefitOptions(ct, b.type || 'percent')}</select>
      <input type="number" class="set-edit-input disc-f-bval" value="${esc(String(bval ?? ''))}" placeholder="값(%/원/N)" min="0" style="flex:0 0 96px" title="%/원, 또는 N+M 의 N(구매수)·n번째의 n" />
      <input type="number" class="set-edit-input disc-bval2 disc-f-bval2" value="${esc(String(bval2 ?? ''))}" placeholder="M/할인%" min="0" style="flex:0 0 90px" title="N+M 의 M(무료수, 기본1) 또는 n번째 할인율%(기본50)" />
      <input type="date" class="set-edit-input disc-f-start" value="${esc((r && r.period && r.period.start) || '')}" style="flex:0 0 138px" title="시작일(비우면 상시)" />
      <input type="date" class="set-edit-input disc-f-end" value="${esc((r && r.period && r.period.end) || '')}" style="flex:0 0 138px" title="종료일(비우면 상시)" />
      <select class="set-edit-input disc-f-scope" style="flex:0 0 110px">${storeOptsAll.replace('value="' + scope + '"', 'value="' + scope + '" selected')}</select>
    </div>`
  }
  const actions = (i, r) => canManage ? `
        <button class="set-item-action store-toggle-btn" onclick="toggleStoreDiscountActive(${i})" title="${r.active === false ? '활성화' : '비활성화'}">${r.active === false ? '&#9898;' : '&#128309;'}</button>
        <button class="set-item-action set-item-edit" onclick="editStoreDiscount(${i})" title="수정">&#9998;</button>
        <button class="set-item-action set-item-del" onclick="removeStoreDiscount(${i})" title="삭제">&#10005;</button>` : ''
  const editRow = (i, r) => canManage ? `
      <div class="set-item-editrow disc-editrow">
        ${editFields(r)}
        <button class="set-edit-save" onclick="saveStoreDiscountEdit(${i})">저장</button>
        <button class="set-edit-cancel" onclick="renderStoreDiscountPanel()">취소</button>
      </div>` : ''
  const sdListHtml = _sdList.map(({ r, i }) => `
    <div class="set-item store-item disc-item${r.active === false ? ' store-item-inactive' : ''}" id="discItem_${i}">
      <div class="set-item-view">
        <span class="set-item-label" style="font-weight:600">${esc(r.name || '(이름없음)')}</span>
        <span class="store-id-tag" title="규칙 ID (수정 불가)">${esc(r.id)}</span>
        ${r.active === false ? '<span class="store-inactive-badge">비활성</span>' : ''}
        <span class="disc-summary">${sumOf(r)}</span>
        ${actions(i, r)}
      </div>
      ${editRow(i, r)}
    </div>`).join('') || '<div class="set-empty">할인 규칙 없음</div>'

  const addRow = canManage ? `
    <div class="set-add-row disc-add-row">
      ${editFields({ storeScope: _discDefaultScope() }).split('disc-f-').join('disc-add-')}
      <button class="btn btn-new set-add-btn" onclick="addStoreDiscount()">+ 규칙 추가</button>
    </div>` : ''
  const note = canManage
    ? `<div class="disc-help">조건: <b>상품/브랜드/카테고리</b>(라인 %/특정가) · <b>총액(카트)</b>(%/정액, 소계 ≥ 기준 시 라인 분배). 판매 스캔마다 자동 적용 — 라인은 최대 절감 1개, 총액은 라인+카트 병존. 신규 규칙 매장 기본값=현재 선택 매장.</div>`
    : `<div class="disc-help">할인 규칙 관리(추가·수정·삭제)는 시스템 관리자(grade 4+)만 가능합니다. 현재 활성 규칙 조회만 가능합니다.</div>`

  body.innerHTML = `<div class="set-grid">
    <div class="set-card set-card-wide">
      <div class="set-card-header"><span class="set-card-title">🏷 매장 할인 규칙</span><span class="set-card-count">${_sdList.length}</span></div>
      <div class="set-list set-list-scroll">${sdListHtml}</div>
      ${addRow}
      ${prodDatalist}
      ${note}
    </div>
  </div>`
}

// ===== 매장 할인 규칙 CRUD (POS Phase 5-1 — settings.js 에서 이전, renderStoreDiscountPanel 로 재렌더) =====
// 필드 파서 — 컨테이너(el) 안의 disc-{prefix}-* 입력값 → 규칙 조각. 검증 후 반환 { ok, rule|msg }. (5-1 로직 무변경)
function _discReadFields(el, prefix) {
  const g = (suffix) => el.querySelector('.disc-' + prefix + '-' + suffix)
  const name = (g('name')?.value || '').trim()
  const ctype = (g('ctype')?.value || 'product')
  const btype = (g('btype')?.value || 'percent')
  const bvalRaw = (g('bval')?.value || '').trim()
  const start = (g('start')?.value || '').trim()
  const end = (g('end')?.value || '').trim()
  const scope = (g('scope')?.value || 'all')
  if (!name) return { ok: false, msg: '규칙명을 입력하세요.' }
  // ── 조건 (5-2: product/brand/category/cartTotal) ──
  let condition, prod = null
  if (ctype === 'product') {
    const code = (g('code')?.value || '').trim()
    if (!code) return { ok: false, msg: '품번을 입력하세요.' }
    prod = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null
    if (!prod) return { ok: false, msg: `품번 "${code}"을(를) 찾을 수 없습니다.` }
    condition = { type: 'product', productCode: code }
  } else if (ctype === 'brand') {
    const brand = (g('brand')?.value || '').trim()
    if (!brand) return { ok: false, msg: '브랜드를 선택하세요.' }
    condition = { type: 'brand', brand }
  } else if (ctype === 'category') {
    const category = (g('category')?.value || '').trim()
    if (!category) return { ok: false, msg: '카테고리를 선택하세요.' }
    condition = { type: 'category', category }
  } else if (ctype === 'cartTotal') {
    const mt = parseInt((g('mintotal')?.value || '').trim(), 10)
    if (!(mt > 0)) return { ok: false, msg: '총액 조건(최소 금액)은 1 이상 정수여야 합니다.' }
    condition = { type: 'cartTotal', minTotal: mt }
  } else if (ctype === 'qty') {
    // 5-3: 수량 promo — scope(product/brand/category) + ref. 대상 존재 검증.
    const qscope = (g('qscope')?.value || 'product')
    const qref = (g('qref')?.value || '').trim()
    if (!qref) return { ok: false, msg: '수량 promo 대상(품번/브랜드/카테고리)을 입력하세요.' }
    if (qscope === 'product') {
      if (!((typeof _ssvFindProduct === 'function') && _ssvFindProduct(qref))) return { ok: false, msg: `품번 "${qref}"을(를) 찾을 수 없습니다.` }
    } else {
      const exists = (State.allProducts || []).some(p => p && !p.deleted && (qscope === 'brand' ? String(p.brand || '') === qref : String(p.type || '') === qref))
      if (!exists) return { ok: false, msg: `${qscope === 'brand' ? '브랜드' : '카테고리'} "${qref}"을(를) 찾을 수 없습니다.` }
    }
    condition = { type: 'qty', scope: qscope, ref: qref }
    // 수량 혜택 (nplus / secondHalf) — bval + bval2
    const bval2Raw = (g('bval2')?.value || '').trim()
    if (!/^\d+$/.test(bvalRaw)) return { ok: false, msg: '혜택 값(N 또는 n)은 정수여야 합니다.' }
    const nval = parseInt(bvalRaw, 10)
    if (btype === 'nplus') {
      const buy = nval, free = bval2Raw ? parseInt(bval2Raw, 10) : 1
      if (!(buy >= 1)) return { ok: false, msg: 'N+M 증정: 구매수 N 은 1 이상이어야 합니다.' }
      if (!(free >= 1)) return { ok: false, msg: 'N+M 증정: 무료수 M 은 1 이상이어야 합니다.' }
      if (start && end && start > end) return { ok: false, msg: '시작일이 종료일보다 늦습니다.' }
      return { ok: true, rule: { name, condition, benefit: { type: 'nplus', buy, free }, period: { start, end }, storeScope: scope } }
    } else if (btype === 'secondHalf') {
      const nth = nval, value = bval2Raw ? parseInt(bval2Raw, 10) : 50
      if (!(nth >= 2)) return { ok: false, msg: 'n번째 할인: n 은 2 이상이어야 합니다.' }
      if (!(value >= 1 && value <= 100)) return { ok: false, msg: '할인율은 1~100 사이여야 합니다.' }
      if (start && end && start > end) return { ok: false, msg: '시작일이 종료일보다 늦습니다.' }
      return { ok: true, rule: { name, condition, benefit: { type: 'secondHalf', nth, value }, period: { start, end }, storeScope: scope } }
    }
    return { ok: false, msg: '수량 혜택 종류가 올바르지 않습니다.' }
  } else if (ctype === 'combo' || ctype === 'bundle') {
    // 5-4: 멤버 파싱 — "scope:ref" 콤마 구분, 2개 이상. 각 존재 검증.
    const tokens = (g('members')?.value || '').split(',').map(t => t.trim()).filter(Boolean)
    if (tokens.length < 2) return { ok: false, msg: '콤보/번들은 멤버가 2개 이상이어야 합니다 (형식: scope:ref, 콤마 구분).' }
    const items = []
    for (const t of tokens) {
      const idx = t.indexOf(':'); if (idx < 0) return { ok: false, msg: `멤버 형식 오류 — "scope:ref" 필요: "${t}"` }
      const sc = t.slice(0, idx).trim(), rf = t.slice(idx + 1).trim()
      if (!(sc === 'product' || sc === 'brand' || sc === 'category')) return { ok: false, msg: `멤버 scope 는 product/brand/category: "${t}"` }
      if (!rf) return { ok: false, msg: `멤버 값(ref) 누락: "${t}"` }
      if (sc === 'product') { if (!((typeof _ssvFindProduct === 'function') && _ssvFindProduct(rf))) return { ok: false, msg: `품번 "${rf}"을(를) 찾을 수 없습니다.` } }
      else { const ex = (State.allProducts || []).some(p => p && !p.deleted && (sc === 'brand' ? String(p.brand || '') === rf : String(p.type || '') === rf)); if (!ex) return { ok: false, msg: `${sc === 'brand' ? '브랜드' : '카테고리'} "${rf}"을(를) 찾을 수 없습니다.` } }
      items.push({ scope: sc, ref: rf })
    }
    const eachQty = Math.max(1, parseInt((g('eachqty')?.value || '1').trim(), 10) || 1)
    const condition = { type: ctype, items, eachQty }
    if (ctype === 'combo') {
      if (!(btype === 'percent' || btype === 'amount')) return { ok: false, msg: '콤보 혜택은 ％ 또는 정액만 가능합니다.' }
      if (!/^\d+$/.test(bvalRaw)) return { ok: false, msg: '혜택 값은 0 이상 정수여야 합니다.' }
      const bv = parseInt(bvalRaw, 10)
      let benefit
      if (btype === 'percent') { if (bv < 1 || bv > 100) return { ok: false, msg: '％ 할인은 1~100 사이여야 합니다.' }; benefit = { type: 'percent', value: bv } }
      else { if (bv < 1) return { ok: false, msg: '정액 할인은 1원 이상이어야 합니다.' }; benefit = { type: 'amount', minus: bv } }
      if (start && end && start > end) return { ok: false, msg: '시작일이 종료일보다 늦습니다.' }
      return { ok: true, rule: { name, condition, benefit, period: { start, end }, storeScope: scope } }
    } else {   // bundle — 고정가
      if (!/^\d+$/.test(bvalRaw)) return { ok: false, msg: '번들 고정가는 0 이상 정수여야 합니다.' }
      const price = parseInt(bvalRaw, 10)
      if (!(price > 0)) return { ok: false, msg: '번들 고정가는 1 이상이어야 합니다.' }
      if (start && end && start > end) return { ok: false, msg: '시작일이 종료일보다 늦습니다.' }   // 🔴 warn 반환 전에 검증(역전 기간 저장 방지)
      // product 멤버들의 정상가 합(×eachQty) 대비 경고 — 고정가가 합 이상이면 할인 없음(설정 오류)
      const sumList = items.reduce((a, m) => { if (m.scope === 'product') { const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(m.ref) : null; return a + (p ? Math.max(0, Math.floor(Number(p.salePrice) || 0)) : 0) * eachQty } return a }, 0)
      if (sumList > 0 && price >= sumList) return { ok: false, warn: `번들 고정가(₩${price.toLocaleString()})가 멤버 정상가 합(₩${sumList.toLocaleString()}) 이상 — 할인이 없습니다. 그래도 저장할까요?`, rule: { name, condition, benefit: { type: 'bundlePrice', price }, period: { start, end }, storeScope: scope } }
      return { ok: true, rule: { name, condition, benefit: { type: 'bundlePrice', price }, period: { start, end }, storeScope: scope } }
    }
  } else return { ok: false, msg: '조건 종류가 올바르지 않습니다.' }
  // ── 혜택 (조건별 허용: 총액=%/정액 · 그 외=%/특정가) ──
  const isCart = (ctype === 'cartTotal')
  if (isCart && !(btype === 'percent' || btype === 'amount')) return { ok: false, msg: '총액 할인은 ％ 또는 정액만 가능합니다.' }
  if (!isCart && !(btype === 'percent' || btype === 'fixed')) return { ok: false, msg: '상품/브랜드/카테고리 할인은 ％ 또는 특정가만 가능합니다.' }
  if (!/^\d+$/.test(bvalRaw)) return { ok: false, msg: '혜택 값은 0 이상 정수여야 합니다.' }
  const bval = parseInt(bvalRaw, 10)
  let benefit
  if (btype === 'percent') {
    if (bval < 1 || bval > 100) return { ok: false, msg: '％ 할인은 1~100 사이여야 합니다.' }
    benefit = { type: 'percent', value: bval }
  } else if (btype === 'amount') {
    if (bval < 1) return { ok: false, msg: '정액 할인은 1원 이상이어야 합니다.' }
    benefit = { type: 'amount', minus: bval }
  } else {   // fixed(특정가) — product/brand/category
    if (start && end && start > end) return { ok: false, msg: '시작일이 종료일보다 늦습니다.' }
    // 정상가 초과 경고는 단일 정상가가 명확한 product 만(brand/category 는 대표가 불명 → 생략).
    if (ctype === 'product' && prod) {
      const listPrice = Math.max(0, Math.floor(Number(prod.salePrice) || 0))
      if (bval > listPrice) return { ok: false, warn: `특정가(₩${bval.toLocaleString()})가 정상가(₩${listPrice.toLocaleString()})보다 높습니다. 그래도 저장할까요?`, rule: { name, condition, benefit: { type: 'fixed', price: bval }, period: { start, end }, storeScope: scope } }
    }
    benefit = { type: 'fixed', price: bval }
  }
  if (start && end && start > end) return { ok: false, msg: '시작일이 종료일보다 늦습니다.' }
  return { ok: true, rule: { name, condition, benefit, period: { start, end }, storeScope: scope } }
}

async function addStoreDiscount() {
  if (!_discCanManage()) { showToast('할인 규칙 관리 권한이 없습니다(시스템 관리자 전용).', 'warning'); return }
  const el = document.querySelector('.disc-add-row')
  if (!el) return
  let res = _discReadFields(el, 'add')
  if (!res.ok && res.warn) { if (!await korConfirm(res.warn, '저장', '취소')) return; res = { ok: true, rule: res.rule } }
  if (!res.ok) { showToast(res.msg, 'warning'); return }
  const id = generateDiscountId()
  const nextOrder = _storeDiscounts.length ? Math.max(..._storeDiscounts.map(r => r.order || 0)) + 1 : 1
  _storeDiscounts.push(Object.assign({ id, active: true, order: nextOrder }, res.rule))
  saveStoreDiscounts(); renderStoreDiscountPanel()
  showToast(`할인 규칙 "${res.rule.name}" (${id}) 추가됐습니다.`, 'success')
  logActivity('setting', '매장할인', `할인규칙 추가: ${res.rule.name} (${id})`)
}

function editStoreDiscount(idx) {
  if (!_discCanManage()) return
  const el = document.getElementById('discItem_' + idx); if (!el) return
  el.classList.add('disc-editing')   // 편집행 표시 (CSS 클래스 토글, 인라인 display 미사용)
  el.querySelector('.disc-f-name')?.focus()
}

async function saveStoreDiscountEdit(idx) {
  if (!_discCanManage()) { showToast('할인 규칙 관리 권한이 없습니다(시스템 관리자 전용).', 'warning'); return }
  const el = document.getElementById('discItem_' + idx); if (!el) return
  const cur = _storeDiscounts[idx]; if (!cur) return
  let res = _discReadFields(el, 'f')
  if (!res.ok && res.warn) { if (!await korConfirm(res.warn, '저장', '취소')) return; res = { ok: true, rule: res.rule } }
  if (!res.ok) { showToast(res.msg, 'warning'); return }
  // ID/order 불변, 조건/혜택은 통째 교체(옛 키 잔류 없음 — condition/benefit 객체 전체 대체). 과거 판매는 스냅샷이라 이력 불변.
  cur.condition = null; cur.benefit = null   // 방어: 타입 변경 시 옛 필드 잔류 방지
  Object.assign(cur, res.rule)
  saveStoreDiscounts(); renderStoreDiscountPanel()
  showToast(`할인 규칙 "${cur.name}" 수정됐습니다.`, 'success')
  logActivity('setting', '매장할인', `할인규칙 수정: ${cur.name} (${cur.id})`)
}

function toggleStoreDiscountActive(idx) {
  if (!_discCanManage()) { showToast('할인 규칙 관리 권한이 없습니다(시스템 관리자 전용).', 'warning'); return }
  const r = _storeDiscounts[idx]; if (!r) return
  r.active = (r.active === false)
  saveStoreDiscounts(); renderStoreDiscountPanel()
  showToast(`"${r.name}" ${r.active ? '활성화' : '비활성화'}됐습니다.`, 'success')
  logActivity('setting', '매장할인', `할인규칙 ${r.active ? '활성화' : '비활성화'}: ${r.name} (${r.id})`)
}

async function removeStoreDiscount(idx) {
  if (!_discCanManage()) { showToast('할인 규칙 관리 권한이 없습니다(시스템 관리자 전용).', 'warning'); return }
  const r = _storeDiscounts[idx]; if (!r) return
  // 과거 판매는 적용값을 라인에 스냅샷 저장 → 규칙 삭제는 향후 적용만 중단(이력 안전). hard-delete OK.
  if (!await korConfirm(`할인 규칙 "${r.name}"을(를) 삭제하시겠습니까?\n\n과거 판매 기록은 영향받지 않습니다(적용값이 이미 저장됨). 향후 적용만 중단됩니다.`, '삭제', '취소')) return
  _storeDiscounts.splice(idx, 1)
  saveStoreDiscounts(); renderStoreDiscountPanel()
  showToast('할인 규칙이 삭제됐습니다.', 'success')
  logActivity('setting', '매장할인', `할인규칙 삭제: ${r.name} (${r.id})`)
}

window.renderStoreDiscountPanel = renderStoreDiscountPanel
window.addStoreDiscount = addStoreDiscount
window.editStoreDiscount = editStoreDiscount
window.saveStoreDiscountEdit = saveStoreDiscountEdit
window.toggleStoreDiscountActive = toggleStoreDiscountActive
window.removeStoreDiscount = removeStoreDiscount

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
    // 6c: 불량 총합 배지(불량>0 일 때만) — 정상 그리드 어지럽히지 않도록 상품명 옆 배지(Q7)
    const defMap = (typeof getStoreDefect === 'function') ? getStoreDefect(store, code) : {}
    const defTotal = SIZES.reduce((s, sz) => s + Number(defMap[sz] || 0), 0)
    const defBadge = defTotal ? ` <span class="ssv-defect-badge${defTotal < 0 ? ' ssv-defect-neg' : ''}" title="불량재고(판매불가) ${defTotal}개">불량 ${defTotal}</span>` : ''
    const nameCell = (p
      ? (esc(p.nameKr || p.nameEn || '') + (p.deleted ? ' <span class="ssv-del-flag">삭제된 상품</span>' : ''))
      : '<span style="color:var(--text-muted)">(상품 정보 없음)</span>') + defBadge
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
  const defect = (typeof getStoreDefect === 'function') ? getStoreDefect(store, code) : {}   // 6c
  const imgHtml = img
    ? `<img src="${esc(img)}" class="ssv-detail-img" onerror="this.style.visibility='hidden'">`
    : `<div class="ssv-detail-img ssv-detail-noimg">이미지 없음</div>`
  let total = 0, defTotal = 0
  const rows = SIZES.map(sz => {
    const v = Number(sizes[sz] || 0); total += v
    const dv = Number(defect[sz] || 0); defTotal += dv   // 6c 불량
    const loc = (typeof getStoreStockLocation === 'function') ? getStoreStockLocation(store, code, sz) : ''
    return `<tr>
      <td class="spd-sz">${esc(sz)}</td>
      <td class="spd-qty${v < 0 ? ' ssv-neg' : ''}">${v}</td>
      <td class="spd-qty spd-defect${dv < 0 ? ' ssv-neg' : (dv > 0 ? ' spd-defect-has' : '')}">${dv}</td>
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
    <div class="ssv-detail-section-title">사이즈별 재고 · 불량 · 로케이션 · ${esc(_storeNameById(store))}
      <button class="btn btn-outline btn-sm spd-ledger-btn" onclick="openLedger('${esc(code)}','${esc(store)}')">📊 이동 원장</button></div>
    <table class="data-table spd-table">
      <thead><tr><th>사이즈</th><th>정상재고</th><th>불량</th><th>로케이션</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>합계</td><td class="${total < 0 ? 'ssv-neg' : ''}">${total}</td><td class="${defTotal < 0 ? 'ssv-neg' : (defTotal > 0 ? 'spd-defect-has' : '')}">${defTotal}</td><td>-</td></tr></tfoot>
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

// ── 6b: 작업 방향 (입고 스캔 창 공용) ──
// 'inbound' = 정상입고(기존 흐름 불변, +qty, auto-id doc, 청크 허용) · 'outbound' = 정상반출(-qty, moveType:'outbound',
//   결정적 id {OUT-…}_{seq}, 단일 원자 배치·청크 금지 — 6a 재고수정과 동일한 exactly-once 패턴).
// 방향별 draft 분리(lemango_inbound_draft_* vs lemango_outbound_draft_*) → +qty 라인이 -qty 로 재해석되는 일 없음(설계 §3.1).
let _inbDirection = 'inbound'
let _pendingOutNo = ''      // 이 반출 세션의 결정적 반출번호(OUT-…) — 첫 확정 1회 생성·draft 영속, 성공 시 소거(3c/6a 미러)
let _outInFlight = false    // 🔴 반출 확정 in-flight 가드

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

// 6b/6c: 반출 계열 방향인가 (정상반출 + 불량반출) — sizes 차감 vs defectSizes 차감만 다르고 확정 골격 공유
function _inbIsOut(dir) { const d = dir || _inbDirection; return d === 'outbound' || d === 'defect-outbound' }

// ── draft (매장별 + 방향별 localStorage) ──
// 방향별 키 분리: 입고=lemango_inbound_draft_{store}(기존 키 불변) · 정상반출=lemango_outbound_draft_ · 불량반출=lemango_defect_outbound_draft_.
// → 입고/반출/불량반출 staging 이 서로 섞이지 않음(설계 §3.1, §7-C15).
function _inbDraftKey(store) {
  let prefix = 'lemango_inbound_draft_'
  if (_inbDirection === 'outbound') prefix = 'lemango_outbound_draft_'
  else if (_inbDirection === 'defect-outbound') prefix = 'lemango_defect_outbound_draft_'
  return prefix + (store || _inbStore || '')
}

function _inbSaveDraft() {
  if (!_inbStore) return
  try {
    const payload = { v: INB_DRAFT_VER, items: _inbList }
    if (_inbIsOut()) payload.pendingOutNo = _pendingOutNo || ''   // 반출/불량반출 결정적 번호 영속(재시도 멱등)
    localStorage.setItem(_inbDraftKey(_inbStore), JSON.stringify(payload))
  } catch (e) {
    console.warn('입고 draft 저장 실패:', e && e.message)
    if (!_inbQuotaWarned) { _inbQuotaWarned = true; showToast('입고 임시저장 실패(저장 공간) — 최종 확정을 서둘러 주세요', 'warning') }
  }
}

// draft 로드 + 무결성 방어 (손상/구버전 → 초기화, 화면 벽돌 방지)
// 현재 방향(_inbDirection)의 draft 를 로드. 반출이면 pendingOutNo 도 _pendingOutNo 로 복원(exactly-once 재시도용).
function _inbLoadDraft(store) {
  _pendingOutNo = ''   // 방향 전환/로드마다 초기화(입고면 항상 '', 반출이면 아래에서 복원)
  let raw = null
  try { raw = localStorage.getItem(_inbDraftKey(store)) } catch (e) { return [] }
  if (!raw) return []
  try {
    const obj = JSON.parse(raw)
    if (!obj || obj.v !== INB_DRAFT_VER || !Array.isArray(obj.items)) return []
    if (_inbIsOut()) _pendingOutNo = String(obj.pendingOutNo || '')
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
  _inbApplyDirectionUI()   // 6b: 방향(입고/반출) UI 반영 — draft 는 이미 방향별 로드됨
  _inbFocusBarcode()
}

// ── 6b/6c: 방향 UI 반영 (버튼 활성/헤더 배지/타이틀/리스트 헤더/확정 라벨/입고유형 표시) ──
function _inbApplyDirectionUI() {
  const dir = _inbDirection
  const out = _inbIsOut()                        // 반출 계열(정상/불량) = 재고 차감 모드
  const defectOut = dir === 'defect-outbound'    // 불량반출
  const modal = document.getElementById('inboundScanModal')
  if (modal) { modal.classList.toggle('inb-out-mode', out); modal.classList.toggle('inb-defout-mode', defectOut) }
  const dIn = document.getElementById('inbDirIn'), dOut = document.getElementById('inbDirOut'), dDef = document.getElementById('inbDirDefOut')
  if (dIn) dIn.classList.toggle('inb-dir-active', dir === 'inbound')
  if (dOut) dOut.classList.toggle('inb-dir-active', dir === 'outbound')
  if (dDef) dDef.classList.toggle('inb-dir-active', defectOut)
  const badge = document.getElementById('inbDirModeBadge')
  if (badge) { badge.classList.toggle('inb-hidden', !out); badge.textContent = defectOut ? '불량반출 모드 — 불량재고 차감' : '반출 모드 — 재고 차감' }
  const titleText = document.getElementById('inbModalTitleText')
  if (titleText) titleText.textContent = defectOut ? '🚫 불량반출 스캔' : (out ? '📤 반출 스캔' : '📥 입고 스캔')
  const hint = document.getElementById('inbDirHint')
  if (hint) hint.innerHTML = defectOut ? '스캔한 상품의 <strong>불량재고</strong>가 차감됩니다 (불량품 물류 반출 · 정상재고 무관)'
    : (out ? '스캔한 상품이 매장 재고에서 <strong>차감</strong>됩니다 (물류/본사 반출)' : '스캔한 상품이 매장 재고에 <strong>추가</strong>됩니다')
  const listHead = document.getElementById('inbListHeadText')
  if (listHead) listHead.textContent = defectOut ? '불량반출 리스트' : (out ? '반출 리스트' : '입고 리스트')
  const note = document.getElementById('inbConfirmNote')
  if (note) note.textContent = defectOut ? '⚠️ 확정 시 불량재고가 즉시 차감됩니다 + 반출 이력(OUT-) 기록 (정상재고 안 건드림)'
    : (out ? '⚠️ 반출 확정 시 매장 재고가 즉시 차감됩니다 + 반출 이력(OUT-) 기록' : '✅ 최종 확정 시 매장 재고에 즉시 반영 + 입고 이력 기록')
  const typeLbl = document.getElementById('inbTypeLabel')
  if (typeLbl) typeLbl.classList.toggle('inb-hidden', out)   // 반출/불량반출은 입고유형 없음
  const btn = document.getElementById('inbConfirmBtn')
  if (btn && btn.dataset.orig == null) btn.textContent = defectOut ? '불량반출 확정' : (out ? '반출 확정' : '최종 확정')   // busy 중이 아닐 때만
}

// ── 6b/6c: 방향 전환 ── (staging 있는 채로 전환해도 +qty 라인이 -qty 로 재해석되지 않음 — 방향별 draft 분리)
function inbSetDirection(dir) {
  if (dir !== 'inbound' && dir !== 'outbound' && dir !== 'defect-outbound') return
  if (dir === _inbDirection) { _inbFocusBarcode(); return }
  if (_inbInFlight || _outInFlight) { showToast('반영 중에는 방향을 전환할 수 없습니다', 'warning'); return }
  _inbSaveDraft()   // 현재 방향 리스트를 자기 draft 에 확정 저장(편집마다 저장되지만 방어적)
  if (_inbEntry) { _inbEntry = null; showToast('진행 중이던 항목은 초기화되었습니다', 'warning') }   // 미완료 진행 항목 폐기
  _inbDirection = dir
  _inbList = _inbLoadDraft(_inbStore)   // 새 방향 draft 로드(+ 반출 pendingOutNo 복원)
  _inbApplyDirectionUI()
  _inbRenderEntry()
  _inbRenderList()
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
  if (!loc && !_inbIsOut()) {   // Rule 3: (입고만) 로케이션 빈값 → 커밋 차단. 반출/불량반출은 로케이션=참고용 → 빈값 허용
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
  const out = _inbIsOut()
  const defectOut = _inbDirection === 'defect-outbound'
  body.innerHTML = _inbList.map((r, i) => {
    let sub = '', rowCls = ''
    if (out) {   // 6b/6c Q3: 반출 라인별 현재재고(불량반출=불량재고) 표시 + 부족(음수) 빨강 경고
      const cur = defectOut
        ? ((typeof getStoreDefect === 'function') ? Number(getStoreDefect(_inbStore, r.code)[r.size] || 0) : 0)
        : ((typeof getStoreStock === 'function') ? Number(getStoreStock(_inbStore, r.code)[r.size] || 0) : 0)
      const lbl = defectOut ? '불량' : '재고'
      const q = Number(r.qty) || 0
      if (q > cur) { sub = `<div class="inb-list-shortage">${lbl} ${cur} · 부족 → 음수</div>`; rowCls = ' inb-list-neg-row' }
      else sub = `<div class="inb-list-stockok">${lbl} ${cur}</div>`
    }
    return `<tr${rowCls ? ' class="' + rowCls.trim() + '"' : ''}>
    <td>${esc(r.code)}${sub}</td>
    <td class="inb-c">${esc(r.size)}</td>
    <td><input type="number" class="inb-list-qty" min="1" step="1" value="${esc(String(r.qty))}" onchange="onInbListQty(${i}, this)"></td>
    <td><input type="text" class="inb-list-loc" value="${esc(r.location)}" onchange="onInbListLoc(${i}, this)"></td>
    <td class="inb-c"><button class="inb-del-btn" onclick="removeInbRow(${i})">삭제</button></td>
  </tr>`
  }).join('')
}

// 리스트 수량 인라인 편집 (양의 정수 클램프, 무효 시 복원)
function onInbListQty(i, el) {
  if (i < 0 || i >= _inbList.length) return
  const n = _inbParseQty(el.value)
  if (!isNaN(n)) {
    _inbList[i].qty = n; el.value = String(n); _inbSaveDraft()
    if (_inbIsOut()) _inbRenderList()   // 반출/불량반출: 재고부족 경고 재계산(전체 재렌더)
    else _inbUpdateListHeader()
  }
  else { el.value = String(_inbList[i].qty); showToast('수량은 1 이상 정수만 가능합니다', 'warning') }
}

// 리스트 로케이션 인라인 편집 (입고=빈값 거부 / 반출=참고용이라 빈값 허용)
function onInbListLoc(i, el) {
  if (i < 0 || i >= _inbList.length) return
  const v = (typeof normalizeLocation === 'function') ? normalizeLocation(el.value) : String(el.value || '').trim()   // 정규화
  if (!v && !_inbIsOut()) { el.value = _inbList[i].location; showToast('로케이션은 비울 수 없습니다', 'warning'); return }
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

// ─────────────────────────────────────────────────────────
// 🕐 KST 표준 시각 유틸 (POS 공통 · 단일 소스) — UTC+9 **산술** 고정.
//   ⚠️ Intl timeZone / ICU / 클라이언트 로컬 TZ 에 절대 의존하지 않음 (Date.getTime()+9h 를 getUTC* 로 읽음).
//     → ICU 없는 webview·UTC 로 설정된 기기에서도 항상 KST 벽시계를 반환. (구 코드는 Intl 실패 시 catch 에서
//        로컬시간으로 폴백 → 기기 TZ 가 KST 가 아니면 saleNo/dateKey 가 UTC/로컬로 새는 버그의 원인이었음.)
//   전제: 기기의 UTC 시계(Date.now())가 정확할 것. 물리 시계 자체가 틀리면 SW 로 교정 불가(기기 시간/시간대 확인 필요).
const _KST_OFFSET_MS = 9 * 60 * 60 * 1000
function _kstParts(dateLike) {
  const base = (dateLike == null) ? new Date() : new Date(dateLike)
  if (isNaN(base.getTime())) return null
  const k = new Date(base.getTime() + _KST_OFFSET_MS)   // KST 벽시계를 UTC 게터로 읽기
  const p = n => String(n).padStart(2, '0')
  return {
    y: String(k.getUTCFullYear()), mo: p(k.getUTCMonth() + 1), d: p(k.getUTCDate()),
    h: p(k.getUTCHours()), mi: p(k.getUTCMinutes()), s: p(k.getUTCSeconds()),
    ms: String(k.getUTCMilliseconds()).padStart(3, '0')   // 밀리초(오프셋 무관) — 판매번호 충돌 억제용
  }
}
// YYYY-MM-DD (dateKey — 🔴 MONEY-CRITICAL: KST 자정 경계로 매출 귀속일 결정). now 또는 저장 instant 기준.
function kstDateKey(dateLike) { const p = _kstParts(dateLike); return p ? (p.y + '-' + p.mo + '-' + p.d) : '' }
// YYYYMMDD-HHMMSS (판매번호/입고번호 등 사람이 읽는 시각 키)
function kstStamp(dateLike) { const p = _kstParts(dateLike); return p ? (p.y + p.mo + p.d + '-' + p.h + p.mi + p.s) : '' }
// 저장 instant(ISO/UTC) → KST 표시. fmt: 'time'=HH:MM · 'md'=MM-DD HH:MM · 'full'=YYYY-MM-DD HH:MM
function kstFormat(dateLike, fmt) {
  const p = _kstParts(dateLike); if (!p) return ''
  if (fmt === 'full') return p.y + '-' + p.mo + '-' + p.d + ' ' + p.h + ':' + p.mi
  if (fmt === 'md') return p.mo + '-' + p.d + ' ' + p.h + ':' + p.mi
  return p.h + ':' + p.mi
}
window.kstDateKey = kstDateKey; window.kstStamp = kstStamp; window.kstFormat = kstFormat

// Korea-local YYYY-MM-DD (storeInbound dateKey). → 표준 유틸 위임(이름 유지, 전 호출부 무변).
function _inbDateKeyKST() { return kstDateKey() }

// 입고번호 IN-YYYYMMDD-HHMMSS (KST) — 사람이 읽는 업무 키. 초 단위 granularity + 가드로 사실상 충돌 없음(카운터 불요).
// (기술적 유니크 그룹핑은 batchId=…+Date.now()ms 가 담당; inboundNo 는 표시/업무용)
function _inbInboundNo() { return 'IN-' + kstStamp() }

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
  if (_inbIsOut()) { _outFinalConfirm(); return }   // 6b/6c: 반출·불량반출은 별도 exactly-once 경로(6a 미러)
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

// ═══════════════════════════════════════════════════════════════
// ===== 6b: 반출(Outbound) 확정 — 음수 movement, exactly-once (6a 미러) =====
// ═══════════════════════════════════════════════════════════════
// 반출 = 입고 스캔 창을 방향 토글로 재사용. 확정만 입고와 분기:
//   storeStock sizes:increment(-qty) · 이동 doc moveType:'outbound' stockDelta:-qty · 번호 OUT-…
//   결정적 doc id {OUT-…}_{seq} + pendingOutNo(draft 동결) → 재시도 시 기존 doc set=update 평가 →
//   storeInbound update 규칙(취소 5필드만) 거부 → 배치 전체 거부 → 재차감 불가(exactly-once, 6a 와 동일 증명).
//   단일 원자 배치(청크 절대 금지 — 부분반영 방지). sizeLocations 안 건드림(반출=위치 유지, 참고용).

// 반출번호 = OUT-YYYYMMDD-HHMMSS-<8자 접미사>(generateSaleNo/generateAdjNo 와 동일 강도 — 동일-초 다중단말 충돌 방지)
function generateOutNo() { return 'OUT-' + kstStamp() + '-' + _saleNoSuffix() }

// 성공(또는 기반영 확인) 정리 — 이 매장 반출 상태만 소거 + 인덱스/뷰 갱신 + 토스트/로그.
function _outSuccessCleanup(store, outNo, count, already, totalQty) {
  _inbList = []; _inbEntry = null; _pendingOutNo = ''
  try { localStorage.removeItem(_inbDraftKey(store)) } catch (e) {}   // _inbDirection==='outbound' → 반출 draft 제거
  const memoEl = document.getElementById('inbMemo'); if (memoEl) memoEl.value = ''
  _inbRenderEntry(); _inbRenderList()
  Promise.resolve().then(() => { if (typeof buildStoreStockIndex === 'function') return buildStoreStockIndex(store) })
    .then(() => { if (typeof renderStoreStockView === 'function') renderStoreStockView() }).catch(() => {})
  const noun = _inbDirection === 'defect-outbound' ? '불량반출' : '반출'
  if (already) showToast('이미 반영된 ' + noun + '입니다 (' + outNo + ')', 'warning')
  else showToast(noun + ' 완료 · ' + outNo + ' · ' + count + '건 · 총 -' + (totalQty || 0) + '개', 'success')
  _inbFocusBarcode()
}

// 반출 확정 1단계 — 재검증 + over-limit 차단 + Q3 재고부족 미리보기(음수 라인 열거) 확인창 → 2단계 위임
async function _outFinalConfirm() {
  if (_outInFlight) return
  if (!_inbList.length) { _inbShowBanner('반출 리스트가 비어 있습니다'); _inbFocusBarcode(); return }
  const store = _inbStore
  if (!store) { _inbShowBanner('대상 매장이 없습니다'); return }
  if (!db) { _inbShowBanner('서버 연결 없음 — 잠시 후 다시 시도하세요'); return }
  // 확정 시점 재검증(draft 손상/수기수정 대비). 로케이션은 참고용 → 필수 아님.
  for (let i = 0; i < _inbList.length; i++) {
    const r = _inbList[i]
    const q = Math.floor(Number(r.qty))
    if (!r.code || !r.size) { _inbShowBanner((i + 1) + '번 항목 오류: 품번/사이즈 누락'); return }
    if (!(Number.isInteger(q) && q >= 1)) { _inbShowBanner(r.code + ' ' + r.size + ': 수량 오류(1 이상 정수)'); return }
  }
  // over-limit 차단(청크 금지 — 6a 와 동일, 부분반영 방지). op = 코드수(storeStock) + 라인수(이동 doc)
  const codeSet = new Set(_inbList.map(r => r.code))
  if (codeSet.size + _inbList.length > 450) { _inbShowBanner('항목이 너무 많습니다 — 세션을 나눠 진행하세요'); return }
  // Q3 재고부족(경고+진행) — 음수 되는 라인 수집 + 총수량. 불량반출은 불량재고 기준.
  const defectOut = _inbDirection === 'defect-outbound'
  const noun = defectOut ? '불량반출' : '반출'
  const bucketLbl = defectOut ? '불량재고' : '재고'
  const negs = []
  let totalQty = 0
  _inbList.forEach(r => {
    const q = Math.floor(Number(r.qty)); totalQty += q
    const cur = defectOut
      ? ((typeof getStoreDefect === 'function') ? Number(getStoreDefect(store, r.code)[r.size] || 0) : 0)
      : ((typeof getStoreStock === 'function') ? Number(getStoreStock(store, r.code)[r.size] || 0) : 0)
    if (q > cur) negs.push({ code: r.code, size: r.size, cur: cur, after: cur - q })
  })
  let msg = noun + ' 확정\n\n' + _inbList.length + '건 · 총 -' + totalQty + '개\n\n확정 시 매장 ' + bucketLbl + '가 즉시 차감됩니다.' +
    (defectOut ? '\n(정상재고는 건드리지 않습니다)' : '')
  if (negs.length) {
    msg += '\n\n⚠️ ' + bucketLbl + ' 부족 — 아래 항목은 음수가 됩니다:\n' +
      negs.slice(0, 12).map(n => '· ' + n.code + ' ' + n.size + ': ' + n.cur + ' → ' + n.after).join('\n') +
      (negs.length > 12 ? '\n· 외 ' + (negs.length - 12) + '건' : '')
  }
  const ok = await korConfirm(msg, negs.length ? '음수 감수하고 ' + noun : noun + ' 확정', '취소')
  if (!ok) { _inbFocusBarcode(); return }
  _outConfirmProceed(totalQty)
}

// 반출 확정 2단계 — 프리플라이트 → 가드 → 단일 원자 배치(storeStock -qty + 이동 doc 결정적 id) → 성공/모호/거부(6a 미러)
async function _outConfirmProceed(totalQty) {
  if (_outInFlight) return
  const store = _inbStore
  if (!store) { _inbShowBanner('대상 매장이 없습니다'); return }
  if (!db) { _inbShowBanner('서버 연결 없음 — 잠시 후 다시 시도하세요'); return }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { _inbShowBanner('오프라인 상태 — 연결 확인 후 확정하세요'); return }
  try {
    _outInFlight = true
    _inbSetConfirmBusy(true)
    if (!_pendingOutNo) { _pendingOutNo = generateOutNo(); _inbSaveDraft() }   // 첫 확정 1회 생성·draft 동결(재시도 멱등)
    const outNo = _pendingOutNo
    const firstId = outNo + '_0001'
    // 프리플라이트 + 착지 감지(서버 read). 6a _adjReadDoc 재사용(storeInbound doc get).
    const pre = await _adjReadDoc(firstId, 5000)
    if (!pre.ok) { _inbShowBanner('오프라인 상태 — 연결 확인 후 확정하세요'); return }
    if (pre.exists) { _outSuccessCleanup(store, outNo, _inbList.length, true, totalQty); return }   // 이전 시도 착지 → 성공 처리(재차감 없음)

    const uid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : ''
    const workerName = (typeof formatUserName === 'function')
      ? formatUserName(_currentUserName, (typeof _currentUserPosition !== 'undefined' ? _currentUserPosition : ''))
      : ((typeof _currentUserName !== 'undefined' && _currentUserName) || '')
    const nowIso = new Date().toISOString()
    const dateKey = _inbDateKeyKST()
    const batchId = dateKey + '_' + (uid || 'x') + '_' + Date.now()
    const memo = String((document.getElementById('inbMemo') || {}).value || '').trim()
    const lines = _inbList.slice()   // 스냅샷
    const defectOut = _inbDirection === 'defect-outbound'   // 6c: 불량반출=defectSizes 차감 / 정상반출=sizes 차감

    // 코드별 그룹: 해당 버킷 합산 차감(increment(-qty)). sizeLocations 안 건드림(반출=위치 유지, 참고용).
    const byCode = {}
    lines.forEach(r => {
      const c = byCode[r.code] || (byCode[r.code] = {})
      c[r.size] = (c[r.size] || 0) + Math.floor(Number(r.qty))
    })
    const batch = db.batch()
    Object.keys(byCode).forEach(code => {
      const bucketMap = {}
      Object.keys(byCode[code]).forEach(sz => { bucketMap[sz] = firebase.firestore.FieldValue.increment(-byCode[code][sz]) })
      const doc = { storeId: store, productCode: code, updatedAt: nowIso }
      if (defectOut) doc.defectSizes = bucketMap   // 불량반출: 불량 버킷만 (정상 sizes 무관)
      else doc.sizes = bucketMap                   // 정상반출: 정상 버킷
      batch.set(db.collection('storeStock').doc(storeStockDocId(store, code)), doc, { merge: true })
    })
    // 이동 원장 doc — 라인당 1, 결정적 id {outNo}_{seq}. set(merge 아님)=create; 재시도 시 update 평가 → 규칙 거부.
    lines.forEach((r, i) => {
      const seq = String(i + 1).padStart(4, '0')
      const q = Math.floor(Number(r.qty))
      batch.set(db.collection('storeInbound').doc(outNo + '_' + seq), {
        storeId: store, productCode: r.code, size: r.size,
        moveType: defectOut ? 'defect-outbound' : 'outbound',
        qty: q, stockDelta: defectOut ? 0 : -q, defectDelta: defectOut ? -q : 0,
        location: (typeof normalizeLocation === 'function') ? normalizeLocation(r.location) : String(r.location || '').trim(),
        inboundNo: outNo, memo: memo,
        workerUid: uid, workerName: workerName, confirmedAt: nowIso, dateKey: dateKey, batchId: batchId
      })
    })

    const res = await _saleCommitWithTimeout(batch, 15000)
    if (res.ok) {
      if (typeof logActivity === 'function') logActivity('outbound', defectOut ? '불량반출' : '반출', _storeNameById(store) + '(' + store + '): ' + outNo + ' · ' + lines.length + '건 · 총 -' + totalQty + '개 · batch ' + batchId)
      _outSuccessCleanup(store, outNo, lines.length, false, totalQty)
      return
    }
    if (res.timeout) { _inbShowBanner('네트워크 불안정 — 반영 여부 확인 중입니다. 다시 [' + (defectOut ? '불량반출' : '반출') + ' 확정]을 누르면 안전하게 재시도됩니다'); return }
    const err = res.error
    const denied = err && (err.code === 'permission-denied' || err.code === 7 || /permission/i.test(String(err.message || '')))
    if (denied) {
      const re = await _adjReadDoc(firstId, 5000)   // 이미 착지 vs 진짜 권한
      if (re.ok && re.exists) { _outSuccessCleanup(store, outNo, lines.length, true, totalQty); return }
      _inbShowBanner('권한 오류로 반영되지 않았습니다 — 매장/권한을 확인하세요' + (err && err.message ? ' (' + err.message + ')' : ''))
      return
    }
    _inbShowBanner('반영 실패 — 다시 시도하세요' + (err && err.message ? ' (' + err.message + ')' : ''))
  } catch (e) {
    console.error('_outConfirmProceed 예외:', e && e.message)
    _inbShowBanner('반영 실패 — 다시 시도하세요' + (e && e.message ? ' (' + e.message + ')' : ''))
  } finally {
    _outInFlight = false
    _inbSetConfirmBusy(false)
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
  _inbDirection = 'inbound'   // 6b: 열 때마다 기본 = 정상입고
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

// 보충대상조회(발주) — 실제 구현은 파일 하단 "매장 보충 발주 (POS R1)" 섹션.
//   openReplenishModal/closeReplenishModal + 전 R1 함수/exports 는 거기서 정의(함수 선언 hoisting).

// ── 입고 내역 뷰 (POS Phase 2d) — 날짜별 storeInbound 조회 (읽기 전용). 전 직원 개방(권한 방침) ──
// 2c 복합인덱스(storeId, dateKey) 사용. 쓰기 없음. ESC 로 닫히는 일반 뷰어(작업 창 아님).

// confirmedAt(ISO/UTC) → KST HH:MM
// confirmedAt(ISO/UTC) → KST. fmt: 'time'=HH:MM, 'md'=MM-DD HH:MM(이력 표시), 'full'=YYYY-MM-DD HH:MM(엑셀)
function _inbHistDateTime(iso, fmt) {
  if (!iso) return ''
  return kstFormat(iso, fmt)   // 표준 KST 유틸 위임(Intl 비의존) — 저장 instant 를 항상 KST 로 표시
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
  // 유형 필터 (전체 + 활성 입고유형 + 재고수정[moveType]), 상태 필터 기본 전체
  const typeSel = document.getElementById('inbHistType')
  if (typeSel) {
    const types = (typeof getActiveInboundTypes === 'function') ? getActiveInboundTypes() : []
    typeSel.innerHTML = '<option value="">전체 유형</option>' + types.map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('')
      + '<option value="__adjust__">재고수정</option>'                 // moveType 기반(입고유형 아님)
      + '<option value="__outbound__">반출</option>'                   // 6b: moveType 기반
      + '<option value="__defect-in__">정상→불량</option>'             // 6c
      + '<option value="__defect-out__">불량→정상</option>'            // 6c
      + '<option value="__defect-outbound__">불량반출</option>'        // 6c
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
  const COLS = 11
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
// ── 이동 원장 legacy-compat 헬퍼 (기존 입고 doc 은 moveType/stockDelta 없음) ──
function _mvType(r) { return (r && r.moveType) ? r.moveType : 'inbound' }          // 레거시 = inbound
function _mvSignedQty(r) { return (r && typeof r.stockDelta === 'number') ? r.stockDelta : (Number(r && r.qty) || 0) }   // 부호 있는 정상재고 변동
function _mvDefectDelta(r) { return (r && typeof r.defectDelta === 'number') ? r.defectDelta : 0 }   // 6c: 부호 있는 불량재고 변동(레거시=0)
function _mvIsDefect(r) { const mt = _mvType(r); return mt === 'defect-in' || mt === 'defect-out' || mt === 'defect-outbound' }   // 6c
function _mvTypeLabel(r) {                                                          // 표시 유형
  const mt = _mvType(r)
  if (mt === 'adjust') return '재고수정'
  if (mt === 'outbound') return '반출'
  if (mt === 'defect-in') return '정상→불량'       // 6c
  if (mt === 'defect-out') return '불량→정상'      // 6c
  if (mt === 'defect-outbound') return '불량반출'  // 6c
  return (r && r.inboundType) || INB_LEGACY_TYPE
}
// 사유 표시: 재고수정·불량전환(전환은 사유 필수) = reason 우선 · 입고/반출 = memo
function _mvNote(r) { return (_mvType(r) === 'adjust' || _mvIsDefect(r)) ? (r.reason || r.memo || '') : (r.memo || '') }
function _inbHistApplyFilters() {
  const body = document.getElementById('inbHistBody')
  const sumEl = document.getElementById('inbHistSummary')
  if (!body) return
  const COLS = 11
  const typeF = (document.getElementById('inbHistType') || {}).value || ''
  const statusF = (document.getElementById('inbHistStatus') || {}).value || 'all'
  // moveType 기반 특수 필터(__x__) → 정확히 그 유형만. 일반 값 → 실제 입고유형(moveType 'inbound')만.
  const MV_FILTERS = { '__adjust__': 'adjust', '__outbound__': 'outbound', '__defect-in__': 'defect-in', '__defect-out__': 'defect-out', '__defect-outbound__': 'defect-outbound' }
  const rows = (_inbHistRows || []).filter(r => {
    if (_mvType(r) === 'baseline') return false   // 6d: 기준(baseline) 이동은 입출고 내역이 아님 → 품목 원장에서만 표시
    if (MV_FILTERS[typeF]) { if (_mvType(r) !== MV_FILTERS[typeF]) return false }
    else if (typeF) { if (_mvType(r) !== 'inbound' || (r.inboundType || INB_LEGACY_TYPE) !== typeF) return false }   // 입고유형 필터=입고만
    if (statusF === 'active' && r.cancelled === true) return false
    if (statusF === 'cancelled' && r.cancelled !== true) return false
    return true
  })
  _inbHistView = rows
  _inbHistUpdateExportBtn()
  if (!rows.length) {
    const msg = (_inbHistRows && _inbHistRows.length) ? '조건(유형/상태)에 맞는 내역이 없습니다' : '해당 기간의 입출고 내역이 없습니다'
    body.innerHTML = `<tr><td colspan="${COLS}" class="inbhist-empty">${esc(msg)}</td></tr>`
    if (sumEl) sumEl.textContent = ''
    return
  }
  const active = rows.filter(r => r.cancelled !== true)
  const net = active.reduce((s, r) => s + _mvSignedQty(r), 0)          // 순 정상재고 변동(부호 합, 취소 제외)
  const netDef = active.reduce((s, r) => s + _mvDefectDelta(r), 0)     // 6c: 순 불량재고 변동
  if (sumEl) sumEl.innerHTML = `표시 <strong>${rows.length}</strong>건 · 정상 순변동 <strong>${net > 0 ? '+' : ''}${net}</strong>개` +
    (netDef ? ` · 불량 순변동 <strong class="spd-defect-has">${netDef > 0 ? '+' : ''}${netDef}</strong>개` : '') +
    ` <span class="inbhist-sum-note">(취소 제외)</span>`
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
    const sq = _mvSignedQty(r)
    const dq = _mvDefectDelta(r)   // 6c 불량증감
    return `<tr${rowCls}>
      <td class="inbhist-no">${esc(r.inboundNo || '-')}</td>
      <td class="inbhist-time">${esc(_inbHistDateTime(r.confirmedAt, 'md'))}</td>
      <td>${esc(r.productCode || '')}</td>
      <td style="text-align:center">${esc(r.size || '')}</td>
      <td style="text-align:right" class="${sq < 0 ? 'ssv-neg' : ''}">${sq > 0 ? '+' : ''}${sq}</td>
      <td style="text-align:right" class="${dq < 0 ? 'ssv-neg' : (dq > 0 ? 'spd-defect-has' : '')}">${dq !== 0 ? (dq > 0 ? '+' : '') + dq : '-'}</td>
      <td>${esc(r.location || '')}</td>
      <td>${esc(r.workerName || '')}</td>
      <td class="inbhist-memo">${esc(_mvNote(r))}</td>
      <td class="inbhist-type">${esc(_mvTypeLabel(r))}</td>
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
  const header = ['번호', '일시', '품번', '사이즈', '정상증감', '불량증감', '로케이션', '작업자', '사유/메모', '유형', '상태', '취소사유']
  const aoa = [header].concat(_inbHistView.map(r => [
    r.inboundNo || '-', _inbHistDateTime(r.confirmedAt, 'full'), r.productCode || '', r.size || '',
    _mvSignedQty(r), _mvDefectDelta(r), r.location || '', r.workerName || '', _mvNote(r),
    _mvTypeLabel(r),
    (r.cancelled === true ? '취소됨' : '정상'), (r.cancelled === true ? (r.cancelReason || '') : '')
  ]))
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 20 }, { wch: 17 }, { wch: 16 }, { wch: 7 }, { wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 8 }, { wch: 24 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '입출고내역')
  const storeName = _storeNameById(_inbHistCtx.store) || _inbHistCtx.store || '매장'
  const fname = '입출고내역_' + storeName + '_' + (_inbHistCtx.start || '') + '~' + (_inbHistCtx.end || '') + '.xlsx'
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
  const sd = _mvSignedQty(row)          // 부호 있는 정상재고 변동 — 취소는 이를 역반영
  const dd = _mvDefectDelta(row)       // 6c: 부호 있는 불량재고 변동 — 취소는 이것도 역반영
  const varTxt = `정상 <strong>${sd > 0 ? '+' : ''}${sd}</strong>` + (dd ? ` · 불량 <strong>${dd > 0 ? '+' : ''}${dd}</strong>` : '')
  if (sumEl) sumEl.innerHTML = `<div class="inbcancel-line"><span class="inbcancel-mvtype">${esc(_mvTypeLabel(row))}</span> <strong>${esc(row.productCode || '')}</strong> <span class="inbcancel-sz">${esc(row.size || '')}</span> · 변동 ${varTxt} · ${esc(row.location || '')}</div><div class="inbcancel-no">${esc(row.inboundNo || '-')}</div>`
  const prevEl = document.getElementById('inbCancelPreview')
  if (prevEl) prevEl.textContent = '재고 계산 중…'
  const reasonEl = document.getElementById('inbCancelReason'); if (reasonEl) reasonEl.value = ''
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
  // 결과 재고 미리보기 — 해당 매장 인덱스 보장 후 계산(비동기). 취소 = 기존 변동 역반영 → cur - delta (두 버킷).
  ;(async () => {
    try { if (typeof buildStoreStockIndex === 'function') await buildStoreStockIndex(row.storeId) } catch (e) {}
    if (_inbCancelTarget !== row) return   // 그 사이 다른 대상으로 바뀌면 무시
    const cur = (typeof getStoreStock === 'function') ? Number(getStoreStock(row.storeId, row.productCode)[row.size] || 0) : 0
    const after = cur - sd
    let html = `취소 시 정상재고: <strong>${cur}</strong> → <strong class="${after < 0 ? 'inbcancel-neg' : ''}">${after}</strong>` + (after < 0 ? ' <span class="inbcancel-neg">(음수 — 이미 판매됨 가능)</span>' : '')
    if (dd) {   // 6c 불량 이동 취소 미리보기
      const curD = (typeof getStoreDefect === 'function') ? Number(getStoreDefect(row.storeId, row.productCode)[row.size] || 0) : 0
      const afterD = curD - dd
      html += `<br>취소 시 불량재고: <strong>${curD}</strong> → <strong class="${afterD < 0 ? 'inbcancel-neg' : ''}">${afterD}</strong>` + (afterD < 0 ? ' <span class="inbcancel-neg">(음수)</span>' : '')
    }
    if (prevEl) prevEl.innerHTML = html
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
      // 역반영 = 기존 변동(stockDelta, 레거시=+qty) 부호 반전. 재고수정 +3 취소→-3 / -1 취소→+1.
      const delta = (typeof d.stockDelta === 'number') ? d.stockDelta : (Number(d.qty || 0))
      const stockRef = db.collection('storeStock').doc(storeStockDocId(d.storeId, d.productCode))
      const stockWrite = {
        storeId: d.storeId, productCode: d.productCode,
        sizes: { [d.size]: firebase.firestore.FieldValue.increment(-delta) },   // 역반영. sizeLocations 안 건드림
        updatedAt: nowIso
      }
      // 불량 이동(6c)도 역반영 — 6a 는 defectDelta 0 이라 무영향, 전방호환.
      const dd = Number(d.defectDelta || 0)
      if (dd) stockWrite.defectSizes = { [d.size]: firebase.firestore.FieldValue.increment(-dd) }
      tx.set(stockRef, stockWrite, { merge: true })
      tx.update(inbRef, {
        cancelled: true, cancelledAt: nowIso, cancelledBy: uid, cancelledByName: workerName, cancelReason: reason
      })
    })

    const sd = _mvSignedQty(row)
    showToast(_mvTypeLabel(row) + ' 취소 완료: ' + (row.inboundNo || '') + ' ' + (row.productCode || '') + ' ' + (row.size || '') + ' (역반영 ' + (-sd > 0 ? '+' : '') + (-sd) + ')', 'success')
    if (typeof logActivity === 'function') logActivity('inbound-cancel', _mvTypeLabel(row) + '취소', (row.inboundNo || '') + ' ' + (row.productCode || '') + '/' + (row.size || '') + ' 역반영' + (-sd > 0 ? '+' : '') + (-sd) + ' · 사유: ' + reason)
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
window.inbSetDirection = inbSetDirection   // 6b: 방향(입고/반출) 토글

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

// 판매번호 충돌 억제 접미사 (2자 base36 대문자). 초 단위 판매번호가 문서 id(결정적)로 쓰이므로
//   같은 초에 두 단말이 확정 → 결정적 id 충돌 → 한쪽이 거짓 거부되는 문제를 막는다.
// 판매번호 충돌 억제 접미사 = <ms 3자리><세션 카운터 2자 base36><랜덤 3자 base36> = 8자.
//   ⚠️ 판매 doc id = saleNo(3c exactly-once) 이므로, 동일 초에 여러 단말이 같은 계정으로 확정 시 saleNo 충돌 → 2번째 확정이
//     기존 id update 로 평가·거부 → 판매 조용히 유실. 이를 막기 위해 강화:
//     - ms(3): 같은 초 안에서 1/1000 로 분리
//     - 세션 카운터(2, base36 0..1295): 같은 ms 에 한 단말이 여러 번 호출해도 유일(단조 증가)
//     - 랜덤(3, base36 36³=46,656): 교차 단말(다른 세션, 같은 ms·카운터) 최종 방어
//   접미사는 pendingSaleNo 에 1회 동결되어 재시도 시 그대로 재사용됨(멱등 — exactly-once 불변).
let _saleNoCounter = Math.floor(Math.random() * 1296)   // 세션마다 랜덤 시작(단말 간 카운터 상관 약화)
function _saleRand36(n) {
  let s = ''
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 36).toString(36)
  return s.toUpperCase()
}
function _saleNoSuffix(nowLike) {
  const parts = _kstParts(nowLike)
  const ms = parts ? parts.ms : '000'
  _saleNoCounter = (_saleNoCounter + 1) % 1296
  const ctr = _saleNoCounter.toString(36).toUpperCase().padStart(2, '0')
  return ms + ctr + _saleRand36(3)   // 총 8자, [0-9A-Z] — Firestore 문서 id 안전(‘/’·공백·‘.’ 없음)
}

// 판매번호 SL-YYYYMMDD-HHMMSS-<8자 접미사> (KST) — 고객 1명(1 체크아웃) 단위 + 강화 충돌 접미사.
//   ⚠️ 3c 부터 이 판매번호가 곧 storeSales 문서 id(결정적) — 재시도 멱등/exactly-once 의 기반.
//   시각부/접미부 ms 를 같은 순간(now)에서 산출(초·ms 일관). KST 산술 유틸만 사용(Intl/로컬 비의존).
function generateSaleNo() {
  const now = new Date()
  return 'SL-' + kstStamp(now) + '-' + _saleNoSuffix(now)
}

// 판매 라인 정규화 — 정수 KRW, 파생값(정상가/할인가/판매가) 항상 재계산(입력 totals 신뢰 안 함). 0 ≤ 할인단가 ≤ 단가.
function _buildSaleLine(raw) {
  const qty = Math.max(1, Math.floor(Number(raw && raw.qty) || 0))
  const unitPrice = Math.max(0, Math.floor(Number(raw && raw.unitPrice) || 0))
  let unitDiscount = Math.max(0, Math.floor(Number(raw && raw.unitDiscount) || 0))
  if (unitDiscount > unitPrice) unitDiscount = unitPrice
  const lineNormal = unitPrice * qty         // 정상가
  const lineDiscount = unitDiscount * qty     // 할인가
  const srcRaw = raw && raw.discountSource
  const line = {
    productCode: String((raw && raw.productCode) || ''),
    size: String((raw && raw.size) || ''),
    qty, unitPrice, unitDiscount,
    lineNormal, lineDiscount,
    lineTotal: lineNormal - lineDiscount,     // 판매가 = 정상가 - 할인가
    // 5-1: 자동('store-discount') / 미할인·기본('manual') / 수동 잠금('manual-override'). 화이트리스트 강제.
    discountSource: (srcRaw === 'store-discount' || srcRaw === 'manual-override') ? srcRaw : 'manual'
  }
  // 5-1: 적용된 라인 할인 규칙 스냅샷(감사/분석용, additive). ⚠️ Firestore 는 undefined 거부 → 있을 때만 부착.
  if (raw && raw.appliedRuleId) { line.appliedRuleId = String(raw.appliedRuleId); line.appliedRuleName = String(raw.appliedRuleName || '') }
  // 5-2: 카트레벨(cartTotal) 분배 몫 스냅샷(additive). cartDiscount=per-unit 카트 몫(unitDiscount 에 이미 폴딩됨 — 표시/귀속 전용, 머니 math 무관).
  if (raw && raw.cartRuleId) {
    line.cartRuleId = String(raw.cartRuleId); line.cartRuleName = String(raw.cartRuleName || '')
    let cd = Math.max(0, Math.floor(Number(raw.cartDiscount) || 0)); if (cd > unitDiscount) cd = unitDiscount
    if (cd > 0) line.cartDiscount = cd
  }
  // 5-3: split 라인 식별자(additive). lineId 있으면 부분취소/집계/취소UI 가 (품번,사이즈) 대신 이걸로 라인 독립 식별 → 무료/유료 split 구분.
  //   lineNote(무료/반값/콤보/번들) = 표시 전용. lineId 없는 라인(레거시/비-split)=기존 (품번,사이즈) 키(byte-identical).
  if (raw && raw.lineId) line.lineId = String(raw.lineId)
  if (raw && raw.lineNote) line.lineNote = String(raw.lineNote)
  // 5-4: 번들 인스턴스 식별(additive) → 취소 시 whole-bundle-void 정책(같은 instanceId 전부 함께 취소). cbDiscount=콤보/번들 per-unit 몫(표시/귀속).
  if (raw && raw.bundleInstanceId) line.bundleInstanceId = String(raw.bundleInstanceId)
  if (raw && raw.cbDiscount != null) { let cd = Math.max(0, Math.floor(Number(raw.cbDiscount) || 0)); if (cd > unitDiscount) cd = unitDiscount; if (cd > 0) line.cbDiscount = cd }
  return line
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
  // 5-1/5-2: 적용 행사 요약(분석용 "그 행사로 얼마 나갔나", additive). store-discount 라인의 규칙별 절감 집계.
  //   5-2: unitDiscount = 라인할인 + 카트분배(per-unit). cartDiscount 로 분리해 라인/카트 각각 정확 귀속(level 태그).
  const promoMap = {}
  lines.forEach(l => {
    if (l.discountSource !== 'store-discount') return
    const cartUnit = Math.max(0, Math.min(l.unitDiscount, Math.floor(Number(l.cartDiscount) || 0)))
    const lineUnit = Math.max(0, l.unitDiscount - cartUnit)
    if (l.appliedRuleId && lineUnit > 0) {
      const k = 'L:' + l.appliedRuleId
      const m = promoMap[k] || (promoMap[k] = { ruleId: l.appliedRuleId, name: l.appliedRuleName || '', level: 'line', saving: 0, qty: 0 })
      m.saving += lineUnit * l.qty; m.qty += l.qty
    }
    if (l.cartRuleId && cartUnit > 0) {
      const k = 'C:' + l.cartRuleId
      const m = promoMap[k] || (promoMap[k] = { ruleId: l.cartRuleId, name: l.cartRuleName || '', level: 'cart', saving: 0, qty: 0 })
      m.saving += cartUnit * l.qty; m.qty += l.qty
    }
  })
  const appliedDiscounts = Object.keys(promoMap).map(k => promoMap[k])
  const PAY = ['카드', '현금', '계좌이체', '기타']
  return {
    type: 'sale',
    saleNo: opts.saleNo || generateSaleNo(),
    storeId: String(opts.storeId || ''),
    lines: lines,
    totals: totals,
    appliedDiscounts: appliedDiscounts,   // 5-1 (빈 배열 가능) — 매출 형식(1.4)·재고 차감·void 무관

    payMethod: PAY.indexOf(opts.payMethod) >= 0 ? opts.payMethod : '카드',
    customerPhone: normalizePhone(opts.customerPhone),
    workerUid: String(opts.workerUid || ''),
    workerName: String(opts.workerName || ''),
    soldAt: opts.soldAt || new Date().toISOString(),   // UTC instant(불변·정렬안전) — 표시는 항상 kstFormat 로 KST 변환
    dateKey: opts.dateKey || kstDateKey()   // 🔴 KST YYYY-MM-DD (매출 귀속일 — 산술 KST, Intl 비의존)
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
    voidedAt: opts.voidedAt || new Date().toISOString(),   // UTC instant — 표시는 kstFormat 로 KST
    dateKey: opts.dateKey || kstDateKey(),   // 🔴 KST 귀속일 (산술 KST)
    customerPhone: normalizePhone(original.customerPhone)   // 적립금-지급-후-취소 대사용 상속
  }
}

// (레거시) 전량취소 결정적 id — 원본 판매 doc id 기반. 3e(전량) 시절 id. 부분취소 도입 후엔 회차별 voidSeqId 사용.
//   존재 시 = 구 전량취소 = 남은수량 0 → 신규 취소 차단. 검출/트랜잭션이 이 레거시 id 도 함께 읽어 정합 유지.
function voidDocId(saleDocId) { return 'void_' + String(saleDocId || '') }

// 부분취소 회차별 id — void_{saleId}_{NNNN}. seq=1..N 정수(연속 append) → 트랜잭션에서 결정적 id 로 순회 열거 가능(쿼리 불가 회피).
//   ⚠️ 결정적 순번이므로 동시 취소가 같은 seq 를 노려 write→트랜잭션 read-conflict 재실행 → 누적 상한 재검증 → over-void 방지.
function voidSeqId(saleDocId, seq) { return 'void_' + String(saleDocId || '') + '_' + String(seq).padStart(4, '0') }

// 라인 식별 키 (품번+사이즈). 누적 취소수량 집계용.
function _lineKey(code, size) { return String(code == null ? '' : code) + '' + String(size == null ? '' : size) }

// 5-3: 라인 식별 키. lineId(split 라인) 있으면 그걸로, 없으면 (품번,사이즈)(레거시/비-split=byte-identical).
//   부분취소/집계/취소UI/트랜잭션 누적상한이 이 키로 라인 독립 식별 → 같은 (품번,사이즈) split(무료/유료)도 구분.
function _lineIdOf(l) { return (l && l.lineId != null && l.lineId !== '') ? String(l.lineId) : _lineKey(l && l.productCode, l && l.size) }
function _selKey(s) { return (s && s.lineId != null && s.lineId !== '') ? String(s.lineId) : _lineKey(s && s.productCode, s && s.size) }

// 부분취소 문서 생성자 — 원본 판매 + 선택(라인별 취소수량) → 취소 라인/합계 재계산(원본 단가로, per-unit 정확).
//   selections: [{ productCode, size, lineId?, voidQty }]. 원본 lines 에서 단가/할인단가 조회(클라 값 불신). lineId 로 split 라인 독립 식별.
function buildPartialVoidDoc(saleDoc, saleDocId, selections, opts) {
  saleDoc = saleDoc || {}; opts = opts || {}
  const byKey = {}
  ;(saleDoc.lines || []).forEach(l => { byKey[_lineIdOf(l)] = l })
  const lines = []
  ;(selections || []).forEach(s => {
    const vq = Math.max(0, Math.floor(Number(s.voidQty) || 0))
    if (vq < 1) return
    const sl = byKey[_selKey(s)]
    if (!sl) return
    const unitPrice = Math.max(0, Math.floor(Number(sl.unitPrice) || 0))
    let unitDiscount = Math.max(0, Math.floor(Number(sl.unitDiscount) || 0)); if (unitDiscount > unitPrice) unitDiscount = unitPrice
    const lineNormal = unitPrice * vq, lineDiscount = unitDiscount * vq
    const vl = {
      productCode: String(sl.productCode || ''), size: String(sl.size || ''),
      qty: vq, unitPrice, unitDiscount, lineNormal, lineDiscount, lineTotal: lineNormal - lineDiscount
    }
    if (sl.lineId != null && sl.lineId !== '') vl.lineId = String(sl.lineId)   // void 라인도 lineId 보존 → voidedByKey 집계가 split 별로 정확
    if (sl.lineNote) vl.lineNote = String(sl.lineNote)
    lines.push(vl)
  })
  const totals = {
    total: lines.reduce((a, l) => a + l.lineTotal, 0),
    discountTotal: lines.reduce((a, l) => a + l.lineDiscount, 0),
    qtyTotal: lines.reduce((a, l) => a + l.qty, 0)
  }
  return {
    type: 'void',
    originalSaleId: String(saleDocId || ''),
    originalSaleNo: String(saleDoc.saleNo || ''),
    storeId: String(saleDoc.storeId || ''),
    lines, totals,
    voidReason: String(opts.voidReason || ''),
    voidedBy: String(opts.voidedBy || ''),
    voidedByName: String(opts.voidedByName || ''),
    voidedAt: opts.voidedAt || new Date().toISOString(),   // UTC instant — 표시는 kstFormat
    dateKey: opts.dateKey || kstDateKey(),                 // 🔴 KST 귀속일
    voidSeq: Math.floor(Number(opts.voidSeq) || 0),
    clientToken: String(opts.clientToken || ''),           // 멱등 토큰(모호 재시도 중복 방지)
    partial: !!opts.partial,                               // false = 이 취소로 남은 전량이 0 이 됨(전체 취소 완료)
    customerPhone: normalizePhone(saleDoc.customerPhone)
  }
}

window.normalizePhone = normalizePhone
window.maskPhone = maskPhone
window.generateSaleNo = generateSaleNo
window.buildSaleDoc = buildSaleDoc
window.buildVoidDoc = buildVoidDoc
window.buildPartialVoidDoc = buildPartialVoidDoc
window.voidDocId = voidDocId
window.voidSeqId = voidSeqId

// =============================================
// ===== 판매 화면 (POS Phase 3b) =====
// =============================================
// 판매 서브탭. 스캔 → 판매 리스트 즉시 추가/병합 → 합계 → 결제수단/휴대폰 → 최종확정(3c stub).
// 🔒 재고/원장 쓰기 없음. 입고 스캔과 병렬 코드(파이프라인 공유 안 함). 순수 헬퍼만 재사용(findByBarcode/_ssvFindProduct/_inbBarcodedSizes/_inbParseQty/getStoreStock/getThumbUrl).

let _saleStore = ''         // 현재 판매 매장
let _saleList = []          // 판매 라인(편집 가능 부모) [{productCode,size,qty,unitPrice,unitDiscount,discountSource, _qtyFree?,_qtyHalf?,_qtyHalfVal?,_qtyRuleId?,_qtyRuleName?}]
let _saleEffLines = []      // 5-3: 엔진 파생 effective(split) 라인 — 총계/표시/카트/확정 소스. 매 평가마다 재구성(부모 → 정상/반값/무료 분할, split 시 lineId 부여)
let _saleCardKey = null     // 마지막 스캔 (카드 표시용)
let _saleComposing = false  // IME 조합 중
let _saleLastEnterTime = 0  // 스캐너 이중발사 디바운스
let _saleBannerTimer = null // 오류 배너 타이머
let _saleLookupCode = ''    // 품번조회 선택 상품
let _saleInFlight = false   // 🔴 최종 확정 in-flight 가드 (중복 반영 방지 — increment 는 비멱등)
let _salePendingSaleNo = '' // 🔴 exactly-once: 이 체크아웃의 판매번호(=문서 id). 첫 확정 시 1회 생성·draft 영속 → 재시도 시 재사용, 성공 시에만 소거

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
      phone: phoneEl ? phoneEl.value : '',
      pendingSaleNo: _salePendingSaleNo || ''   // exactly-once: 재시도 멱등을 위해 판매번호도 draft 에 동결
    }))
  } catch (e) { console.warn('판매 draft 저장 실패:', e && e.message) }
}
function _saleLoadDraft(store) {
  const EMPTY = { items: [], payMethod: '카드', phone: '', pendingSaleNo: '' }
  let raw = null
  try { raw = localStorage.getItem(_saleDraftKey(store)) } catch (e) { return EMPTY }
  if (!raw) return EMPTY
  try {
    const o = JSON.parse(raw)
    if (!o || o.v !== 1) return EMPTY
    const items = Array.isArray(o.items) ? o.items.filter(l => l && l.productCode && l.size).map(l => {
      const it = {
        productCode: String(l.productCode), size: String(l.size),
        qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
        unitPrice: Math.max(0, Math.floor(Number(l.unitPrice) || 0)),
        unitDiscount: Math.max(0, Math.floor(Number(l.unitDiscount) || 0)),
        // 5-1: 수동 잠금('manual-override')·자동('store-discount')·기본('manual') 보존
        discountSource: (l.discountSource === 'store-discount' || l.discountSource === 'manual-override') ? l.discountSource : 'manual'
      }
      if (l.appliedRuleId) { it.appliedRuleId = String(l.appliedRuleId); it.appliedRuleName = String(l.appliedRuleName || '') }
      return it
    }) : []
    return { items, payMethod: o.payMethod || '카드', phone: o.phone || '', pendingSaleNo: String(o.pendingSaleNo || '') }
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
    _saleStore = ''; _saleList = []; _saleEffLines = []   // 5-3: 게이트 시 파생 라인도 리셋(대칭)
    screen.classList.add('inb-hidden'); gate.classList.remove('inb-hidden')
    gate.innerHTML = `<div class="store-placeholder"><div class="store-placeholder-icon">🚫</div><div class="store-placeholder-title">판매 불가</div><div class="store-placeholder-desc">배정된 매장이 없습니다 — 관리자에게 문의하세요.</div></div>`
    return
  }
  gate.classList.add('inb-hidden'); gate.innerHTML = ''
  screen.classList.remove('inb-hidden')
  _saleStore = store
  const draft = _saleLoadDraft(store)   // 매장 전환 시 해당 매장 draft
  _saleList = draft.items
  _saleApplyDiscounts()   // 5-1: draft 복원 시 규칙 재평가(기간 만료·규칙 변경 반영; 수동 잠금 라인은 유지). 스냅샷 갱신
  _salePendingSaleNo = draft.pendingSaleNo || ''   // exactly-once: 이전(모호) 확정 시도의 판매번호 복원(재시도 멱등)
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
// ── 5-1 자동 할인 엔진 (line-level: product 조건 × %/특정가 혜택) ──
// 규칙 매칭 여부(5-1=product; 5-2+ 에서 category/brand/… 추가). 라인 상품코드 기준.
function _ruleMatchesLine(rule, code) {
  const c = (rule && rule.condition) || {}
  if (c.type === 'product') return String(c.productCode || '') === String(code || '')
  // 5-2: brand=상품 brand 필드 · category=상품 type 필드(설계 §1.3). cartTotal 은 라인 매칭 아님(pass 2 카트레벨).
  if (c.type === 'brand' || c.type === 'category') {
    const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null
    if (!p) return false
    if (c.type === 'brand') return String(p.brand || '') === String(c.brand || '')
    return String(p.type || '') === String(c.category || '')
  }
  return false   // cartTotal(cart-level, pass 2) · 미지원 타입(5-3~5-4)
}
// 규칙의 단위당 할인(정수 KRW, Q8 per-unit floor). percent=floor(단가×%) · fixed(특정가)=max(0,단가−특정가).
function _ruleUnitDiscount(rule, unitPrice) {
  const b = (rule && rule.benefit) || {}
  const up = Math.max(0, Math.floor(Number(unitPrice) || 0))
  if (b.type === 'percent') { const pct = Math.max(0, Math.min(100, Number(b.value) || 0)); return Math.min(up, Math.floor(up * pct / 100)) }
  if (b.type === 'fixed') { const price = Math.max(0, Math.floor(Number(b.price) || 0)); return Math.max(0, up - price) }
  return 0
}
// 판매 리스트 전체 재평가 — 활성/기간/매장 통과 규칙 중 라인별 '최대 절감 1개'(Q5 no-stack) 자동 적용.
//   ⚠️ 'manual-override'(운영자 수동 편집) 라인은 잠금 — 절대 덮어쓰지 않음(Q3).
//   매칭 없음 → 이전 store-discount 는 해제(규칙 만료/삭제 대응), manual(미할인)은 유지.
function _saleApplyDiscounts() {
  const store = _saleStore
  const rules = (typeof getActiveDiscounts === 'function') ? getActiveDiscounts(store) : []
  // ── Pass 1: 라인 레벨 (product/brand/category × percent/fixed). unitDiscount=라인할인만(수량/카트 폴딩 전 baseline).
  _saleList.forEach(l => {
    // 수량/카트 파생값은 매 평가마다 재계산 → 우선 제거(재평가 idempotent).
    delete l.cartDiscount; delete l.cartRuleId; delete l.cartRuleName
    delete l._qtyFree; delete l._qtyHalf; delete l._qtyHalfVal; delete l._qtyRuleId; delete l._qtyRuleName
    delete l._cbUnits; delete l._bundleGroups   // 5-4 콤보/번들 파생값도 매 평가 재계산
    if (l.discountSource === 'manual-override') return   // 수동 잠금(라인+수량+콤보/번들+카트 모두 제외)
    const up = Math.max(0, Math.floor(Number(l.unitPrice) || 0))
    let best = null, bestDisc = 0
    rules.forEach(r => {
      if (!_ruleMatchesLine(r, l.productCode)) return
      const d = _ruleUnitDiscount(r, up)
      if (d > bestDisc || (d === bestDisc && d > 0 && best && (Number(r.priority) || 0) < (Number(best.priority) || 0))) { bestDisc = d; best = r }
    })
    if (best && bestDisc > 0) {
      l.unitDiscount = bestDisc; l.discountSource = 'store-discount'
      l.appliedRuleId = best.id; l.appliedRuleName = best.name
    } else if (l.discountSource === 'store-discount') {   // 더 이상 매칭 안 됨 → 자동할인 해제(수량/카트가 다시 채울 수 있음)
      l.unitDiscount = 0; l.discountSource = 'manual'
      delete l.appliedRuleId; delete l.appliedRuleName
    }
  })
  // ── Pass 1.5: 수량(5-3) — N+1/두번째반값. 부모 라인에 무료/반값 유닛 수 breakdown(_qty*) 기록(라인할인 후 최저가 유닛 선택).
  _saleApplyQtyDiscounts(rules)
  // ── Pass 1.7: 콤보/번들(5-4) — 조합 조건(멤버 전부 present). 미claimed 유닛으로 인스턴스 형성 → per-unit 분배 → _bundleGroups.
  _saleApplyComboBundle(rules)
  // ── effective(split) 라인 빌드 — 부모 → 정상/반값/무료/콤보/번들 분할(각 균일 unitDiscount, split 시 lineId). 총계/표시/카트/확정 소스.
  _saleEffLines = _buildEffectiveLines()
  // ── Pass 2: 카트 레벨 (cartTotal). 수량/콤보/번들 적용 후 effective 라인 소계 ≥ minTotal → 최대 절감 1개 분배(콤보/번들 라인 제외).
  _saleApplyCartDiscounts(rules, _saleEffLines)
}

// 수량 규칙 scope 매칭 — product(품번)/brand(상품 brand)/category(상품 type).
function _qtyMatch(cond, code) {
  const scope = cond && cond.scope, ref = cond && cond.ref
  if (scope === 'product') return String(ref || '') === String(code || '')
  if (scope === 'brand' || scope === 'category') {
    const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null
    if (!p) return false
    return scope === 'brand' ? String(p.brand || '') === String(ref || '') : String(p.type || '') === String(ref || '')
  }
  return false
}

// Pass 1.5 — 수량 promo(N+1 nplus / 두번째반값 secondHalf). v1=최대 절감 1개(no-stack, 카트레벨 미러). 🔴 무료/할인 유닛=최저가(오너 확정).
//   자격 유닛=manual-override 제외 · scope 매칭 · 라인할인 후 단가(postLine). 부모 라인에 _qtyFree/_qtyHalf/_qtyHalfVal/_qtyRule* tally.
function _saleApplyQtyDiscounts(rules) {
  const qtyRules = (rules || []).filter(r => r && r.condition && r.condition.type === 'qty')
  if (!qtyRules.length) return
  let best = null, bestSave = 0, bestPlan = null
  qtyRules.forEach(r => {
    const units = []
    _saleList.forEach((l, i) => {
      if (l.discountSource === 'manual-override') return
      if (!_qtyMatch(r.condition, l.productCode)) return
      const up = Math.max(0, Math.floor(Number(l.unitPrice) || 0))
      let ud = Math.max(0, Math.floor(Number(l.unitDiscount) || 0)); if (ud > up) ud = up
      const price = up - ud   // 라인할인 후 단가(수량 promo 는 이 위에 얹힘 — 파이프라인 line→quantity)
      const qty = Math.max(1, Math.floor(Number(l.qty) || 1))
      for (let u = 0; u < qty; u++) units.push({ i, price })
    })
    if (units.length < 2) return
    units.sort((a, b) => a.price - b.price)   // 🔴 최저가 우선(무료/할인 대상)
    const b = r.benefit || {}
    let plan = null, save = 0
    if (b.type === 'nplus') {
      const buy = Math.max(1, Math.floor(Number(b.buy) || 0)), free = Math.max(1, Math.floor(Number(b.free) || 0))
      const cycle = buy + free
      const freeCount = Math.floor(units.length / cycle) * free
      if (freeCount > 0) { const chosen = units.slice(0, freeCount); save = chosen.reduce((a, u) => a + u.price, 0); plan = { kind: 'free', chosen } }
    } else if (b.type === 'secondHalf') {
      const nth = Math.max(2, Math.floor(Number(b.nth) || 0)), val = Math.max(1, Math.min(100, Math.floor(Number(b.value) || 0)))
      const cnt = Math.floor(units.length / nth)
      if (cnt > 0) { const chosen = units.slice(0, cnt); save = chosen.reduce((a, u) => a + Math.floor(u.price * val / 100), 0); plan = { kind: 'half', chosen, val } }
    }
    if (plan && save > 0 && (save > bestSave || (save === bestSave && best && (Number(r.priority) || 0) < (Number(best.priority) || 0)))) {
      best = r; bestSave = save; bestPlan = plan
    }
  })
  if (!best || !bestPlan) return
  bestPlan.chosen.forEach(u => {
    const l = _saleList[u.i]; if (!l) return
    if (bestPlan.kind === 'free') l._qtyFree = (l._qtyFree || 0) + 1
    else { l._qtyHalf = (l._qtyHalf || 0) + 1; l._qtyHalfVal = bestPlan.val }
  })
  _saleList.forEach(l => {
    if ((l._qtyFree || 0) > 0 || (l._qtyHalf || 0) > 0) {
      l._qtyRuleId = best.id; l._qtyRuleName = best.name || ''
      if (l.discountSource !== 'manual-override') l.discountSource = 'store-discount'
    }
  })
}

// Pass 1.7 — 콤보/번들(5-4). 조건 combo/bundle = items[{scope,ref}] 멤버 전부 present(각 eachQty). 미claimed 유닛(수량promo 제외)으로 인스턴스 형성.
//   🔴 멤버 유닛=최저가 예약(5-3 일관). 인스턴스 반복(제한 멤버 floor). combo=%/정액 · bundle=고정가(S−price). per-unit 분배(비례 floor+잔액 최고가).
//   부모 라인에 _bundleGroups(instanceId+share 그룹) 기록 → _buildEffectiveLines 가 서브라인 분할. bundle 은 instanceId 태그(전체취소 정책).
function _saleApplyComboBundle(rules) {
  const cb = (rules || []).filter(r => r && r.condition && (r.condition.type === 'combo' || r.condition.type === 'bundle'))
    .slice().sort((a, b) => ((Number(a.priority) || 0) - (Number(b.priority) || 0)) || String(a.id || '').localeCompare(String(b.id || '')))
  if (!cb.length) return
  const cI = v => Math.max(0, Math.floor(Number(v) || 0))
  const priceOf = i => { const l = _saleList[i]; const up = cI(l.unitPrice); return up - Math.min(cI(l.unitDiscount), up) }   // 라인할인 후 단가
  // 라인별 가용 유닛 수(manual-override·수량promo(free/half) 제외) — 콤보/번들 claim 대상
  const avail = _saleList.map(l => {
    if (l.discountSource === 'manual-override') return 0
    const qty = Math.max(1, cI(l.qty)); const used = cI(l._qtyFree) + cI(l._qtyHalf); return Math.max(0, qty - used)
  })
  let instCounter = 0
  cb.forEach(rule => {
    const cond = rule.condition || {}, members = Array.isArray(cond.items) ? cond.items : []
    if (members.length < 2) return
    const eachQty = Math.max(1, cI(cond.eachQty) || 1)
    const b = rule.benefit || {}
    let guard = 0
    while (guard++ < 10000) {
      // 한 인스턴스 형성 — 멤버별 eachQty 최저가 예약(temp; 멤버 간 유닛 중복 방지). 하나라도 부족하면 종료.
      const temp = avail.slice(); const reserved = []; let ok = true
      for (const m of members) {
        const us = []
        _saleList.forEach((l, i) => { for (let u = 0; u < temp[i]; u++) if (_qtyMatch(m, l.productCode)) us.push({ i, price: priceOf(i) }) })
        us.sort((a, b2) => a.price - b2.price)
        if (us.length < eachQty) { ok = false; break }
        for (let k = 0; k < eachQty; k++) { reserved.push(us[k].i); temp[us[k].i]-- }
      }
      if (!ok) break
      // 인스턴스 확정 — 소계 S(예약 유닛 판매가) → 할인 disc
      const units = reserved.map(i => ({ i, price: priceOf(i) }))
      const S = units.reduce((a, u) => a + u.price, 0)
      let disc = 0
      if (cond.type === 'combo') {
        if (b.type === 'percent') { const pct = Math.max(0, Math.min(100, Number(b.value) || 0)); disc = Math.min(S, Math.floor(S * pct / 100)) }
        else if (b.type === 'amount') { disc = Math.min(S, cI(b.minus)) }
      } else { const price = cI(b.price); disc = (S > price) ? (S - price) : 0 }   // bundle: S≤price=설정오류(할인0, settings 경고)
      if (disc <= 0) break   // 유닛 미claim(avail 미commit) → 무한루프 방지 + 의미없는 인스턴스 skip
      // per-unit 분배(price 비례 floor + 잔액 최고가, share ≤ price 클램프=판매가 음수 방지)
      const totalPrice = units.reduce((a, u) => a + u.price, 0) || 1
      let acc = 0
      units.forEach(u => { u.share = Math.min(u.price, Math.floor(disc * u.price / totalPrice)); acc += u.share })
      let rem = disc - acc
      const byPrice = units.slice().sort((a, b2) => b2.price - a.price)
      for (let k = 0; k < byPrice.length && rem > 0; k++) { if (byPrice[k].share < byPrice[k].price) { byPrice[k].share++; rem-- } }
      const instanceId = String(rule.id) + '#' + instCounter; instCounter++
      units.forEach(u => { const l = _saleList[u.i]; if (!l._cbUnits) l._cbUnits = []; l._cbUnits.push({ instanceId, ruleId: rule.id, ruleName: rule.name || '', kind: cond.type, share: u.share }) })
      for (let i = 0; i < avail.length; i++) avail[i] = temp[i]   // commit(유닛 소진)
    }
  })
  // 부모 라인별 _cbUnits → _bundleGroups (instanceId+share 그룹핑 → 균일 unitDiscount 서브라인)
  _saleList.forEach(l => {
    if (!l._cbUnits || !l._cbUnits.length) return
    const up = cI(l.unitPrice); const lud = Math.min(cI(l.unitDiscount), up)
    const groups = {}
    l._cbUnits.forEach(u => {
      const key = u.instanceId + '|' + u.share
      const g = groups[key] || (groups[key] = { qty: 0, share: u.share, instanceId: u.instanceId, ruleId: u.ruleId, ruleName: u.ruleName, kind: u.kind })
      g.qty++
    })
    l._bundleGroups = Object.keys(groups).map(k => {
      const g = groups[k]; let ud = lud + g.share; if (ud > up) ud = up
      return { qty: g.qty, unitDiscount: ud, bundleShare: g.share, instanceId: g.instanceId, ruleId: g.ruleId, ruleName: g.ruleName, kind: g.kind, note: g.kind === 'bundle' ? '번들' : '콤보' }
    })
    if (l.discountSource !== 'manual-override') l.discountSource = 'store-discount'
  })
}

// effective(split) 라인 빌드 — 부모 _saleList → 정상(paid)/반값(half)/무료(free)/콤보/번들 서브라인(각 균일 unitDiscount).
//   split(서브라인 ≥2) 시에만 lineId 부여(`{code}#{size}#{n}`) → 부분취소 라인 독립 식별. 단일 서브라인=lineId 없음(레거시/비-split=byte-identical void).
//   🔴 재고=전체 qty(무료 포함) — free 유닛도 qty 로 확정 라인에 남아 차감됨. bundle 서브라인=bundleInstanceId 태그(전체취소).
function _buildEffectiveLines() {
  const out = []
  _saleList.forEach((l, i) => {
    const up = Math.max(0, Math.floor(Number(l.unitPrice) || 0))
    let lud = Math.max(0, Math.floor(Number(l.unitDiscount) || 0)); if (lud > up) lud = up   // 라인할인 per-unit
    const qty = Math.max(1, Math.floor(Number(l.qty) || 1))
    let free = Math.max(0, Math.min(qty, Math.floor(Number(l._qtyFree) || 0)))
    let half = Math.max(0, Math.min(qty - free, Math.floor(Number(l._qtyHalf) || 0)))
    const cbGroups = Array.isArray(l._bundleGroups) ? l._bundleGroups : []
    const cbQty = cbGroups.reduce((a, g) => a + Math.max(0, Math.floor(Number(g.qty) || 0)), 0)
    const paid = Math.max(0, qty - free - half - cbQty)
    const postLine = up - lud
    const halfVal = Math.max(0, Math.min(100, Math.floor(Number(l._qtyHalfVal) || 0)))
    const parts = []
    if (paid > 0) parts.push({ qty: paid, unitDiscount: lud, rid: l.appliedRuleId, rname: l.appliedRuleName, kind: 'paid' })
    if (half > 0) { let hud = up - Math.floor(postLine * (100 - halfVal) / 100); if (hud > up) hud = up; parts.push({ qty: half, unitDiscount: hud, rid: l._qtyRuleId, rname: l._qtyRuleName, kind: 'half', note: '반값' }) }
    if (free > 0) parts.push({ qty: free, unitDiscount: up, rid: l._qtyRuleId, rname: l._qtyRuleName, kind: 'free', note: '무료' })
    // 5-4: 콤보/번들 서브라인(각 균일 unitDiscount). bundle=instanceId 태그(전체취소). cb 유닛은 카트 제외(_cbKind).
    cbGroups.forEach(g => { if (g && g.qty > 0) parts.push({ qty: Math.floor(g.qty), unitDiscount: g.unitDiscount, rid: g.ruleId, rname: g.ruleName, kind: g.kind === 'bundle' ? 'bundle' : 'combo', note: g.note, instanceId: g.kind === 'bundle' ? g.instanceId : '', cbShare: g.bundleShare }) })
    const split = parts.length > 1
    parts.forEach((p, n) => {
      const eff = {
        productCode: l.productCode, size: l.size, qty: p.qty,
        unitPrice: up, unitDiscount: p.unitDiscount,
        discountSource: p.kind === 'paid' ? l.discountSource : 'store-discount',
        _parentIdx: i, _kind: p.kind
      }
      if (p.rid) { eff.appliedRuleId = p.rid; eff.appliedRuleName = p.rname || '' }
      if (p.note) eff.lineNote = p.note
      if (p.kind === 'combo' || p.kind === 'bundle') { eff._cbKind = p.kind; if (p.cbShare > 0) eff.cbDiscount = p.cbShare }
      if (p.kind === 'bundle' && p.instanceId) eff.bundleInstanceId = p.instanceId
      if (split) eff.lineId = String(l.productCode) + '#' + String(l.size) + '#' + n
      out.push(eff)
    })
  })
  return out
}

// 카트 규칙의 총 절감(정수 KRW). amount=정액 min(소계,minus) · percent=floor(소계×%). (cartTotal 전용 — 라인 fixed 와 분리)
function _cartRuleSaving(rule, cartSubtotal) {
  const b = (rule && rule.benefit) || {}
  const sub = Math.max(0, Math.floor(Number(cartSubtotal) || 0))
  if (b.type === 'amount') { const minus = Math.max(0, Math.floor(Number(b.minus) || 0)); return Math.min(sub, minus) }
  if (b.type === 'percent') { const pct = Math.max(0, Math.min(100, Number(b.value) || 0)); return Math.min(sub, Math.floor(sub * pct / 100)) }
  return 0
}

// Pass 2 — 카트레벨(cartTotal) 평가 + 분배. 자격 라인=manual-override 제외(Q3 확장: 수동잠금은 자격·분배 모두 제외).
//   라인+카트 across-level 병존(브랜드 15% 라인도 소계에 포함되고 카트 분배 몫도 받음 — 작업지시 확정). no-stack within cart level.
function _saleApplyCartDiscounts(rules, lines) {
  const src = lines || _saleEffLines || []
  const q = []
  src.forEach((l) => {
    if (l.discountSource === 'manual-override') return
    if (l._cbKind) return   // 5-4: 콤보/번들 유닛은 결합 promo 종결 → 카트 제외(중복할인 방지, 번들 고정가 보존)
    const up = Math.max(0, Math.floor(Number(l.unitPrice) || 0))
    let ud = Math.max(0, Math.floor(Number(l.unitDiscount) || 0)); if (ud > up) ud = up
    const qty = Math.max(1, Math.floor(Number(l.qty) || 1))
    const unit = up - ud                 // 라인/수량 할인 후 단위 판매가
    const lineTotal = unit * qty         // 라인 판매가 (무료 라인=0 → 카트 자격 제외)
    if (lineTotal <= 0) return
    q.push({ l, up, ud, qty, unit, lineTotal })
  })
  if (!q.length) return
  const cartSubtotal = q.reduce((a, x) => a + x.lineTotal, 0)
  // 자격 cartTotal 규칙 중 최대 절감 1개(no-stack, tiebreak priority 낮은 것)
  let best = null, bestSave = 0
  rules.forEach(r => {
    const c = (r && r.condition) || {}
    if (c.type !== 'cartTotal') return
    const min = Math.max(0, Math.floor(Number(c.minTotal) || 0))
    if (cartSubtotal < min) return
    const save = _cartRuleSaving(r, cartSubtotal)
    if (save > bestSave || (save === bestSave && save > 0 && best && (Number(r.priority) || 0) < (Number(best.priority) || 0))) { bestSave = save; best = r }
  })
  if (!best || bestSave <= 0) return
  _distributeCartDiscount(q, bestSave, best)
}

// 카트 절감 S 를 자격 라인에 분배 → 각 라인 unitDiscount 에 per-unit 폴딩 + cartDiscount/cartRuleId 태그.
//   알고리즘(Q8): per-line 비례(floor) + 잔액 최고가 라인 → per-unit floor → 우수리 최고가 라인부터 per-unit 흡수.
//   ⚠️ per-unit 균일 제약(라인당 unitDiscount 단일값) + 부분취소 per-unit 정확성 유지 → 자격 라인에 qty=1 이 있으면 Σ=S 정확,
//     전 라인 qty≥2 인 경우에만 최대 (min qty−1)원 잔여(미분배, 매장 유리) — 요약은 실제 분배액을 표시(정직).
function _distributeCartDiscount(q, S, rule) {
  const cartSubtotal = q.reduce((a, x) => a + x.lineTotal, 0)
  if (cartSubtotal <= 0 || S <= 0) return
  // 1) per-line 목표(floor) + 잔액을 최고가(unit desc) 라인에
  let acc = 0
  q.forEach(x => { x._target = Math.floor(S * x.lineTotal / cartSubtotal); acc += x._target })
  let rem = S - acc   // 0 ≤ rem < q.length
  const byPrice = q.slice().sort((a, b) => (b.unit - a.unit) || (b.lineTotal - a.lineTotal))
  for (let k = 0; k < byPrice.length && rem > 0; k++) { byPrice[k]._target += 1; rem-- }
  // 2) per-unit 폴딩(floor) — cartUnit ≤ unit(=up−ud) 보장(target ≤ lineTotal=unit×qty)
  q.forEach(x => { x._cartUnit = Math.floor(x._target / x.qty) })
  // 3) 우수리(Σ target − Σ cartUnit×qty) 를 최고가 라인부터 per-unit +1(=qty 소비)로 흡수 (unit 상한 내)
  let leftover = q.reduce((a, x) => a + (x._target - x._cartUnit * x.qty), 0)
  for (let k = 0; k < byPrice.length && leftover > 0; k++) {
    const x = byPrice[k]
    while (leftover >= x.qty && x._cartUnit < x.unit) { x._cartUnit += 1; leftover -= x.qty }
  }
  // 4) 적용: unitDiscount 에 per-unit 카트 몫 폴딩 + 태그(감사/표시)
  q.forEach(x => {
    if (x._cartUnit <= 0) return
    let nud = x.ud + x._cartUnit; if (nud > x.up) nud = x.up   // 단가 초과 클램프(방어)
    x.l.unitDiscount = nud
    x.l.cartDiscount = nud - x.ud          // 실제 폴딩된 per-unit 카트 몫(클램프 반영)
    x.l.cartRuleId = rule.id; x.l.cartRuleName = rule.name || ''
    x.l.discountSource = 'store-discount'  // 카트만 있어도 자동 할인
  })
}
// 스캔 카드용 — 이 상품(단가)에 적용될 최적 규칙(표시용). 없으면 null.
function _saleBestRuleFor(code, unitPrice) {
  const store = _saleStore
  const rules = (typeof getActiveDiscounts === 'function') ? getActiveDiscounts(store) : []
  let best = null, bestDisc = 0
  rules.forEach(r => {   // _saleApplyDiscounts 와 동일 tiebreak(할인 동점 → priority 낮은 것) — 카드 미리보기와 실제 적용 규칙명 일치
    if (!_ruleMatchesLine(r, code)) return
    const d = _ruleUnitDiscount(r, unitPrice)
    if (d > bestDisc || (d === bestDisc && d > 0 && best && (Number(r.priority) || 0) < (Number(best.priority) || 0))) { bestDisc = d; best = r }
  })
  return best ? { rule: best, disc: bestDisc } : null
}

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
  _saleApplyDiscounts()   // 5-1: 스캔 즉시 자동 할인 채움(수동 잠금 라인 제외)
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
  // 5-1: 이 상품에 매칭되는 행사가 있으면 적용가 표시
  const best = _saleBestRuleFor(code, price)
  const priceLine = (best && best.disc > 0)
    ? `<div class="sale-card-price">판매가 <s>${price.toLocaleString()}</s> → <strong class="sale-card-promo-price">${(price - best.disc).toLocaleString()}</strong>원 <span class="sale-card-promo-tag">🏷 ${esc(best.rule.name)}</span></div>`
    : `<div class="sale-card-price">판매가 <strong>${price.toLocaleString()}</strong>원</div>`
  if (infoEl) infoEl.innerHTML = `
    <div class="inb-card-code">${esc(code)} <span class="inb-card-size">${esc(size)}</span></div>
    <div class="inb-card-name">${esc(name)}</div>
    ${priceLine}
    <div class="inb-card-stock${stockCls}">현재 재고 <strong>${stock}</strong>개 <span class="inb-card-stock-sz">(${esc(size)})</span></div>`
  const img = (p && typeof getThumbUrl === 'function') ? getThumbUrl(p) : ''
  if (imgEl) imgEl.innerHTML = img
    ? `<img src="${esc(img)}" onerror="this.parentNode.innerHTML='<div class=\\'inb-card-noimg\\'>이미지 없음</div>'">`
    : '<div class="inb-card-noimg">이미지 없음</div>'
}

// 부모 라인 i 의 effective(split) 집계 — 금액(정상/할인/판매)·paid 단위할인(입력값)·카트 행사명.
function _saleParentEff(i) {
  let lineNormal = 0, lineDiscount = 0, lineTotal = 0, paidUd = 0, hasPaid = false, cartName = ''
  ;(_saleEffLines || []).forEach(e => {
    if (e._parentIdx !== i) return
    const up = Math.max(0, Math.floor(Number(e.unitPrice) || 0))
    let ud = Math.max(0, Math.floor(Number(e.unitDiscount) || 0)); if (ud > up) ud = up
    const q = Math.max(1, Math.floor(Number(e.qty) || 1))
    lineNormal += up * q; lineDiscount += ud * q; lineTotal += (up - ud) * q
    if (e._kind === 'paid') { paidUd = ud; hasPaid = true }
    if (e.cartRuleName && !cartName) cartName = e.cartRuleName
  })
  return { lineNormal, lineDiscount, lineTotal, paidUd, hasPaid, cartName }
}

// 판매 리스트 렌더 — 부모 라인당 1행(편집), 금액=effective 집계(수량/카트 반영), 수량 promo=배지. 🔴 split 실물은 판매 doc/영수증에 표기.
function _saleRenderList() {
  const body = document.getElementById('saleListBody')
  const countEl = document.getElementById('saleListCount')
  if (countEl) countEl.textContent = String(_saleList.length)
  if (!body) { _saleUpdateTotals(); return }
  if (!_saleList.length) { body.innerHTML = '<tr><td colspan="10" class="inbhist-empty">스캔한 상품이 여기에 쌓입니다</td></tr>'; _saleUpdateTotals(); return }
  body.innerHTML = _saleList.map((l, i) => {
    const unitPrice = Math.max(0, Math.floor(Number(l.unitPrice) || 0))
    const qty = Math.max(1, Math.floor(Number(l.qty) || 1))
    const eff = _saleParentEff(i)
    // 입력 표시용 단위할인 = paid 라인 unitDiscount(라인+카트, 수동 잠금 시 그 값). 편집=수동 잠금(promo 해제).
    let inputUd = eff.hasPaid ? eff.paidUd : Math.max(0, Math.floor(Number(l.unitDiscount) || 0))
    if (inputUd > unitPrice) inputUd = unitPrice
    const lineNormal = unitPrice * qty, lineDiscount = eff.lineDiscount, lineTotal = eff.lineTotal
    const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(l.productCode) : null
    const nm = p ? (p.nameKr || p.nameEn || '') : ''
    const curPrice = p ? Math.max(0, Math.floor(Number(p.salePrice) || 0)) : null
    const staleHint = (curPrice != null && curPrice !== unitPrice)
      ? `<div class="sale-line-stale">⚠ 가격 변경됨: 현재 ₩${curPrice.toLocaleString()}</div>` : ''
    // 적용 할인 표시 — 라인 행사(🏷) + 수량 promo(🎁 무료/반값) + 카트 행사(🛒) / 수동 잠금(수동)
    let discBadge = ''
    if (l.discountSource === 'manual-override') discBadge = `<div class="sale-line-manual">수동</div>`
    else {
      const chips = []
      if (l.appliedRuleName) chips.push(`<span class="sale-line-promo-chip">🏷 ${esc(l.appliedRuleName)}</span>`)
      const free = Math.max(0, Math.floor(Number(l._qtyFree) || 0)), half = Math.max(0, Math.floor(Number(l._qtyHalf) || 0))
      if (l._qtyRuleName && (free || half)) {
        const parts = []
        if (free) parts.push(`${free}개 무료`)
        if (half) parts.push(`${half}개 ${Math.floor(Number(l._qtyHalfVal) || 50)}%`)
        chips.push(`<span class="sale-line-promo-chip sale-line-qty-chip">🎁 ${esc(l._qtyRuleName)} (${parts.join(', ')})</span>`)
      }
      // 5-4: 콤보/번들 칩
      const cbGroups = Array.isArray(l._bundleGroups) ? l._bundleGroups : []
      if (cbGroups.length) {
        const g0 = cbGroups[0]
        chips.push(`<span class="sale-line-promo-chip sale-line-cb-chip">🎁 ${esc(g0.ruleName || '')}${g0.kind === 'bundle' ? ' (번들)' : ' (콤보)'}</span>`)
      }
      if (eff.cartName) chips.push(`<span class="sale-line-promo-chip sale-line-cart-chip">🛒 ${esc(eff.cartName)}</span>`)
      if (chips.length) discBadge = `<div class="sale-line-promo">${chips.join(' ')}</div>`
    }
    return `<tr>
      <td class="inb-c">${i + 1}</td>
      <td><span class="code-link" onclick="openStoreProductDetail('${esc(l.productCode)}', '${esc(_saleStore)}')">${esc(l.productCode)}</span>${nm ? `<div class="sale-line-name">${esc(nm)}</div>` : ''}${discBadge}${staleHint}</td>
      <td class="inb-c">${esc(l.size)}</td>
      <td style="text-align:right">${unitPrice.toLocaleString()}</td>
      <td><input type="number" class="sale-line-input" min="0" step="1" value="${inputUd}" onchange="onSaleLineDiscount(${i}, this)"></td>
      <td style="text-align:right">${lineNormal.toLocaleString()}</td>
      <td style="text-align:right">${lineDiscount.toLocaleString()}</td>
      <td style="text-align:right;font-weight:700">${lineTotal.toLocaleString()}</td>
      <td><input type="number" class="sale-line-input" min="1" step="1" value="${qty}" onchange="onSaleLineQty(${i}, this)"></td>
      <td class="inb-c"><button class="inb-del-btn" onclick="removeSaleLine(${i})">삭제</button></td>
    </tr>`
  }).join('')
  _saleUpdateTotals()
}

// 합계 실시간 (합계=Σ판매가, 할인합계=Σ할인가, 수량합계=Σ수량). 정수. 🔴 5-3: effective(split) 라인 기준(수량 promo 반영).
function _saleUpdateTotals() {
  let sum = 0, disc = 0, qty = 0
  ;(_saleEffLines || []).forEach(l => {
    const up = Math.max(0, Math.floor(Number(l.unitPrice) || 0))
    let ud = Math.max(0, Math.floor(Number(l.unitDiscount) || 0)); if (ud > up) ud = up
    const q = Math.max(1, Math.floor(Number(l.qty) || 1))
    disc += ud * q; sum += (up * q - ud * q); qty += q
  })
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v }
  set('saleTotalSum', sum.toLocaleString())
  set('saleTotalDiscount', disc.toLocaleString())
  set('saleTotalQty', String(qty))
  _saleRenderPromos()
}

// 5-1/5-2: "적용 행사" 요약 — store-discount 라인의 규칙별 절감 집계. 라인 행사와 카트(총액) 행사를 분리 집계.
//   unitDiscount = 라인할인 + 카트분배(per-unit) → cartDiscount 로 분리해 각 규칙에 정확 귀속. 카트 칩은 🛒 로 구분.
function _saleRenderPromos() {
  const el = document.getElementById('saleAppliedPromos'); if (!el) return
  const map = {}
  ;(_saleEffLines || []).forEach(l => {   // 🔴 5-3: effective 라인 — 라인/수량 promo(appliedRuleId) + 카트(cartRuleId) 자동 분리 귀속
    if (l.discountSource !== 'store-discount') return
    const up = Math.max(0, Math.floor(Number(l.unitPrice) || 0))
    let ud = Math.max(0, Math.floor(Number(l.unitDiscount) || 0)); if (ud > up) ud = up
    const q = Math.max(1, Math.floor(Number(l.qty) || 1))
    const cartUnit = Math.max(0, Math.min(ud, Math.floor(Number(l.cartDiscount) || 0)))
    const lineUnit = ud - cartUnit
    if (l.appliedRuleId && lineUnit > 0) { const k = 'L:' + l.appliedRuleId; const m = map[k] || (map[k] = { name: l.appliedRuleName || '', saving: 0, cart: false }); m.saving += lineUnit * q }
    if (l.cartRuleId && cartUnit > 0) { const k = 'C:' + l.cartRuleId; const m = map[k] || (map[k] = { name: l.cartRuleName || '', saving: 0, cart: true }); m.saving += cartUnit * q }
  })
  const rules = Object.keys(map).map(k => map[k]).filter(r => r.saving > 0)
  if (!rules.length) { el.innerHTML = ''; el.classList.add('inb-hidden'); return }
  el.classList.remove('inb-hidden')
  el.innerHTML = '적용 행사: ' + rules.map(r => `<span class="sale-promo-chip${r.cart ? ' sale-promo-chip-cart' : ''}">${r.cart ? '🛒 ' : ''}${esc(r.name)} <strong>−₩${r.saving.toLocaleString()}</strong></span>`).join(' ')
}

// 수량 인라인 편집 (양의 정수)
function onSaleLineQty(i, el) {
  if (i < 0 || i >= _saleList.length) return
  const n = (typeof _inbParseQty === 'function') ? _inbParseQty(el.value) : (/^\d+$/.test(String(el.value).trim()) ? parseInt(el.value, 10) : NaN)
  // 🔴 5-2: 수량 변경은 카트 소계에 영향 → 재평가 필수(카트 분배 pass2 재실행). 5-1(라인 독립) 땐 불요였음.
  if (!isNaN(n) && n >= 1) { _saleList[i].qty = n; _saleApplyDiscounts(); _saleSaveDraft(); _saleRenderList() }
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
  // 5-1 Q3: 운영자가 할인단가를 직접 편집 → 그 라인 '수동 잠금'(자동 엔진이 이후 덮어쓰지 않음). 삭제 전까지 유지.
  _saleList[i].discountSource = 'manual-override'
  delete _saleList[i].appliedRuleId; delete _saleList[i].appliedRuleName
  if (clamped !== n) showToast('할인단가는 단가를 초과할 수 없습니다', 'warning')
  // 🔴 5-2: 수동 잠금 라인은 카트 자격/분배에서 빠짐 → 재평가로 잔여 자격 라인 카트 재분배 + 이 라인 stale 카트태그 정리(pass1 delete).
  _saleApplyDiscounts()
  _saleSaveDraft(); _saleRenderList()
}

function removeSaleLine(i) {
  if (i < 0 || i >= _saleList.length) return
  // 🔴 5-2: 라인 삭제는 카트 소계/자격집합 변경 → 재평가 필수(소계가 minTotal 밑이면 카트 해제, 아니면 재분배).
  _saleList.splice(i, 1); _saleApplyDiscounts(); _saleSaveDraft(); _saleRenderList(); _saleFocusBarcode()
}

function onSalePayChange() { _saleSaveDraft() }
function onSalePhoneInput() { _saleSaveDraft() }   // 원시값 저장(정규화는 3c 확정 시)

// ============================================================
// ===== 최종 확정 (POS Phase 3c) — 원자적 재고 차감 + 매출 원장, exactly-once =====
// ============================================================
// 배치 1건: storeStock increment(-qty) 코드별 그룹 + storeSales 판매 doc(id=판매번호).
//   exactly-once: 판매 doc id 를 결정적(=pendingSaleNo)으로 고정 → 재시도 시 기존 doc = 'update' 평가
//   → 규칙 update:false 로 배치 전체 거부 → 재차감 구조적 불가. 모호 실패 시 서버 재확인으로 착지 여부 판별.

// 확정 버튼 busy 토글 (disabled + "반영 중…"). 2c inb 패턴 미러.
function _saleSetConfirmBusy(busy) {
  const btn = document.getElementById('saleConfirmBtn')
  if (!btn) return
  btn.disabled = !!busy
  if (busy) { if (btn.dataset.orig == null) btn.dataset.orig = btn.innerHTML; btn.textContent = '반영 중…' }
  else if (btn.dataset.orig != null) { btn.innerHTML = btn.dataset.orig; delete btn.dataset.orig }
}

// 확정 시점 재검증 (draft 손상/수기수정 대비). 정상 → {ok:true, store}. 무효 → {ok:false, msg}.
function _saleValidate() {
  if (!_saleList.length) return { ok: false, msg: '판매 리스트가 비어 있습니다' }
  const store = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
  if (!store) return { ok: false, msg: '배정된 매장이 없습니다 — 판매 불가' }
  for (let i = 0; i < _saleList.length; i++) {
    const l = _saleList[i]
    const qty = Number(l.qty)
    if (!l.productCode || !l.size) return { ok: false, msg: (i + 1) + '번 항목 오류: 품번/사이즈 누락' }
    if (!(Number.isInteger(qty) && qty >= 1)) return { ok: false, msg: l.productCode + ' ' + l.size + ': 수량 오류(1 이상 정수)' }
    const up = Math.floor(Number(l.unitPrice) || 0)
    const ud = Math.floor(Number(l.unitDiscount) || 0)
    if (up < 0) return { ok: false, msg: l.productCode + ' ' + l.size + ': 단가 오류' }
    if (ud < 0 || ud > up) return { ok: false, msg: l.productCode + ' ' + l.size + ': 할인단가 오류(0~단가)' }   // ud==up(전액할인=0원 영수증) 허용
  }
  return { ok: true, store }
}

// 최종 확정 진입 — 검증 후 사전 확인 다이얼로그 오픈(영수증 종료 순간). 실제 커밋은 saleConfirmProceed.
function saleFinalConfirm() {
  if (_saleInFlight) return                         // 이미 반영 중(가드)
  const v = _saleValidate()
  if (!v.ok) { _saleShowBanner(v.msg); _saleFocusBarcode(); return }
  _openSaleConfirmDialog(v.store)
}

// 사전 확인 다이얼로그 — 합계/할인/수량/결제/휴대폰 + 음수 재고 경고. [확정](기본 포커스)/[취소].
function _openSaleConfirmDialog(store) {
  const modal = document.getElementById('saleConfirmModal')
  if (!modal) { saleConfirmProceed(); return }      // 다이얼로그 없으면 바로 진행(폴백)
  if (modal.open) return                            // 중복 오픈 방지(showModal on open → throw)
  let sum = 0, disc = 0, qty = 0
  const neg = []
  _saleList.forEach(l => {
    const up = Math.max(0, Math.floor(Number(l.unitPrice) || 0))
    let ud = Math.max(0, Math.floor(Number(l.unitDiscount) || 0)); if (ud > up) ud = up
    const q = Math.max(1, Math.floor(Number(l.qty) || 1))
    sum += up * q - ud * q; disc += ud * q; qty += q
    const cur = (typeof getStoreStock === 'function') ? Number(getStoreStock(store, l.productCode)[l.size] || 0) : 0
    if (q > cur) neg.push({ code: l.productCode, size: l.size, qty: q, cur })
  })
  const payEl = document.getElementById('salePayMethod'); const pay = payEl ? payEl.value : '카드'
  const phoneEl = document.getElementById('salePhone')
  const digits = (typeof normalizePhone === 'function') ? normalizePhone(phoneEl ? phoneEl.value : '') : ''
  const phoneShow = digits ? ((typeof maskPhone === 'function') ? maskPhone(digits) : digits) : '—'
  const sumEl = document.getElementById('saleConfirmSummary')
  if (sumEl) sumEl.innerHTML = `
    <div class="sale-confirm-row"><span>합계</span><strong class="sale-confirm-total">₩${sum.toLocaleString()}</strong></div>
    <div class="sale-confirm-row"><span>할인합계</span><span>₩${disc.toLocaleString()}</span></div>
    <div class="sale-confirm-row"><span>수량합계</span><span>${qty}개</span></div>
    <div class="sale-confirm-row"><span>결제수단</span><span>${esc(pay)}</span></div>
    <div class="sale-confirm-row"><span>휴대폰</span><span>${esc(phoneShow)}</span></div>`
  const warnEl = document.getElementById('saleConfirmWarn')
  if (warnEl) {
    warnEl.innerHTML = neg.length
      ? `<div class="sale-confirm-negbox"><div class="sale-confirm-negtitle">⚠ 판매 후 음수 재고 ${neg.length}건</div>` +
        neg.map(n => `<div class="sale-confirm-negline">${esc(n.code)} ${esc(n.size)} · 현재 ${n.cur} → 판매 ${n.qty}</div>`).join('') +
        `<div class="sale-confirm-neghint">경고만 — 확정하면 재고가 음수로 반영됩니다</div></div>`
      : ''
  }
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
  const ok = document.getElementById('saleConfirmOkBtn')
  if (ok) setTimeout(() => ok.focus(), 30)          // 기본 포커스 = 확정 (Enter 로 확정)
}

function closeSaleConfirmDialog() { const m = document.getElementById('saleConfirmModal'); if (m && m.open) m.close(); _saleFocusBarcode() }

// 서버 소스로 판매 doc 존재 확인 (연결 프리플라이트 + 착지 여부 판별 공용). 타임아웃/오류 → {ok:false}.
function _saleReadSaleDoc(saleNo, timeoutMs) {
  return new Promise(resolve => {
    let settled = false
    const finish = r => { if (settled) return; settled = true; clearTimeout(t); resolve(r) }
    const t = setTimeout(() => finish({ ok: false, exists: false, timeout: true }), timeoutMs || 5000)
    try {
      db.collection('storeSales').doc(saleNo).get({ source: 'server' })
        .then(snap => finish({ ok: true, exists: !!(snap && snap.exists), data: (snap && snap.exists) ? (snap.data() || {}) : null }))
        .catch(err => finish({ ok: false, exists: false, error: err }))
    } catch (e) { finish({ ok: false, exists: false, error: e }) }
  })
}

// 배치 커밋 + 타임아웃 (모호 창 처리). 15s 미해결 → {timeout:true}.
function _saleCommitWithTimeout(batch, timeoutMs) {
  return new Promise(resolve => {
    let settled = false
    const finish = r => { if (settled) return; settled = true; clearTimeout(t); resolve(r) }
    const t = setTimeout(() => finish({ ok: false, timeout: true }), timeoutMs || 15000)
    batch.commit().then(() => finish({ ok: true })).catch(err => finish({ ok: false, error: err }))
  })
}

// 성공(또는 기반영 확인) 정리 — 이 매장 판매 상태만 소거 + 인덱스/뷰 갱신 + 토스트/로그.
function _saleSuccessCleanup(store, saleNo, total, alreadyLanded) {
  const totalQty = _saleList.reduce((s, l) => s + Math.max(1, Math.floor(Number(l.qty) || 1)), 0)
  const lineCount = _saleList.length
  _saleList = []
  _saleEffLines = []   // 🔴 5-3: 총계/적용행사 footer 가 직전 판매 stale effLines 표시하지 않도록 리셋(_saleUpdateTotals/_saleRenderPromos 가 effLines 순회)
  _salePendingSaleNo = ''
  try { localStorage.removeItem(_saleDraftKey(store)) } catch (e) {}
  const payEl = document.getElementById('salePayMethod'); if (payEl) payEl.value = '카드'   // 결제수단 기본 복귀
  const phoneEl = document.getElementById('salePhone'); if (phoneEl) phoneEl.value = ''      // 휴대폰 초기화
  _saleCardKey = null
  _saleRenderCard(null)
  _saleRenderList()
  Promise.resolve().then(() => { if (typeof buildStoreStockIndex === 'function') return buildStoreStockIndex(store) })
    .then(() => { if (typeof renderStoreStockView === 'function') renderStoreStockView() }).catch(() => {})
  if (alreadyLanded) {
    showToast('이미 반영된 판매입니다 (판매번호 ' + saleNo + ')', 'success')
    if (typeof logActivity === 'function') logActivity('sale', '판매', _storeNameById(store) + '(' + store + '): 기반영 확인 · ' + saleNo)
  } else {
    showToast('판매 완료 · ' + saleNo + ' · ₩' + (Number(total) || 0).toLocaleString(), 'success')
    if (typeof logActivity === 'function') logActivity('sale', '판매', _storeNameById(store) + '(' + store + '): ' + lineCount + '건 총 ' + totalQty + '개 · ₩' + (Number(total) || 0).toLocaleString() + ' · ' + saleNo)
  }
  _saleFocusBarcode()
}

// 실제 커밋 (다이얼로그 [확정]) — 프리플라이트 → 가드 → 배치 커밋 → 성공/모호/거부 분기.
async function saleConfirmProceed() {
  closeSaleConfirmDialog()
  if (_saleInFlight) return
  const v = _saleValidate()
  if (!v.ok) { _saleShowBanner(v.msg); _saleFocusBarcode(); return }
  const store = v.store
  if (!db) { _saleShowBanner('서버 연결 없음 — 잠시 후 다시 시도하세요'); return }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { _saleShowBanner('오프라인 상태 — 연결 확인 후 확정하세요'); return }

  try {
    _saleInFlight = true                            // 첫 await 이전 동기 set(재진입 즉시 차단)
    _saleSetConfirmBusy(true)

    // 판매번호(=문서 id) 1회 생성·draft 영속 → 재시도 시 재사용(멱등)
    if (!_salePendingSaleNo) { _salePendingSaleNo = generateSaleNo(); _saleSaveDraft() }
    const saleNo = _salePendingSaleNo

    // 연결 프리플라이트 + 사전 착지 감지 (서버 소스 read, 5s)
    const pre = await _saleReadSaleDoc(saleNo, 5000)
    if (!pre.ok) { _saleShowBanner('오프라인 상태 — 연결 확인 후 확정하세요'); return }   // 도달 불가 → 차단, draft 보존
    if (pre.exists) { _saleSuccessCleanup(store, saleNo, null, true); return }             // 이전 시도 실제 착지 → 성공 처리(재차감 없음)

    // 판매 문서 빌드 (totals 재계산, phone 정규화, 정수 — buildSaleDoc 이 강제)
    const uid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : ''
    const workerName = (typeof formatUserName === 'function')
      ? formatUserName(_currentUserName, (typeof _currentUserPosition !== 'undefined' ? _currentUserPosition : ''))
      : ((typeof _currentUserName !== 'undefined' && _currentUserName) || '')
    const payEl = document.getElementById('salePayMethod')
    const phoneEl = document.getElementById('salePhone')
    // 5-3: 확정 직전 재평가 → effective(split) 라인 최신화. 판매 doc = effective 라인(정상/반값/무료 split, lineId).
    //   🔴 재고는 아래에서 (code,size)별 qty 합산 = 전체 qty(무료 유닛 포함) → 무료 상품도 물리적으로 나가므로 정상 차감.
    _saleApplyDiscounts()
    const effLines = (_saleEffLines && _saleEffLines.length) ? _saleEffLines : _buildEffectiveLines()
    const saleDoc = buildSaleDoc({
      saleNo, storeId: store, lines: effLines,
      payMethod: payEl ? payEl.value : '카드',
      customerPhone: phoneEl ? phoneEl.value : '',
      workerUid: uid, workerName
    })

    // 코드별 사이즈 차감 합산 (split 라인도 같은 코드+사이즈로 합산 → 전체 qty 차감; 무료 유닛 포함). op 수 = 코드수 + 1(판매 doc).
    const codeSizeQty = {}
    saleDoc.lines.forEach(l => {
      codeSizeQty[l.productCode] = codeSizeQty[l.productCode] || {}
      codeSizeQty[l.productCode][l.size] = (codeSizeQty[l.productCode][l.size] || 0) + l.qty
    })
    const codes = Object.keys(codeSizeQty)
    if (codes.length + 1 > 450) { _saleShowBanner('한 번에 확정 가능한 품목 수 초과 — 나눠서 판매하세요'); return }   // 사실상 도달 불가(자명), 방어적

    const batch = db.batch()
    // ⚠️ merge 아님 = create 의도. 재시도 시 doc 존재 → 'update' 평가 → 규칙 update:false → 배치 전체 거부(재차감 불가).
    batch.set(db.collection('storeSales').doc(saleNo), saleDoc)
    const nowIso = new Date().toISOString()
    codes.forEach(code => {
      const sizesMap = {}
      Object.keys(codeSizeQty[code]).forEach(sz => { sizesMap[sz] = firebase.firestore.FieldValue.increment(-codeSizeQty[code][sz]) })
      batch.set(db.collection('storeStock').doc(storeStockDocId(store, code)),
        { storeId: store, productCode: code, sizes: sizesMap, updatedAt: nowIso }, { merge: true })
    })

    const res = await _saleCommitWithTimeout(batch, 15000)
    if (res.ok) { _saleSuccessCleanup(store, saleNo, saleDoc.totals.total, false); return }
    if (res.timeout) {
      // 모호 — 착지 여부 불명. draft+pendingSaleNo 보존. 재시도는 설계상 안전(같은 판매번호 재사용).
      _saleShowBanner('네트워크 불안정 — 반영 여부 확인 중입니다. 다시 확정을 누르면 안전하게 재시도됩니다')
      return
    }
    const err = res.error
    const denied = err && (err.code === 'permission-denied' || err.code === 7 || /permission/i.test(String(err.message || '')))
    if (denied) {
      // 거부 원인 판별: 이미 착지(이전 시도 성공)인지 vs 진짜 권한 문제인지 → 서버 재확인
      const re = await _saleReadSaleDoc(saleNo, 5000)
      if (re.ok && re.exists) { _saleSuccessCleanup(store, saleNo, null, true); return }
      _saleShowBanner('권한 오류로 반영되지 않았습니다 — 매장/권한을 확인하세요' + (err && err.message ? ' (' + err.message + ')' : ''))
      return
    }
    // 기타 오류(네트워크 등) — 전부 보존. 재시도 시 프리플라이트가 착지 여부 재확인 → 안전.
    _saleShowBanner('반영 실패 — 다시 시도하세요' + (err && err.message ? ' (' + err.message + ')' : ''))
  } catch (e) {
    console.error('saleConfirmProceed 예외:', e && e.message)
    _saleShowBanner('반영 실패 — 다시 시도하세요' + (e && e.message ? ' (' + e.message + ')' : ''))
  } finally {
    _saleInFlight = false
    _saleSetConfirmBusy(false)                      // 성공/실패 무관 항상 release + 라벨 복원
    _saleFocusBarcode()
  }
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
window.saleConfirmProceed = saleConfirmProceed
window.closeSaleConfirmDialog = closeSaleConfirmDialog
window.openSaleLookup = openSaleLookup
window.closeSaleLookup = closeSaleLookup
window.renderSaleLookupResults = renderSaleLookupResults
window.selectSaleLookupProduct = selectSaleLookupProduct
window.chooseSaleLookupSize = chooseSaleLookupSize

// =============================================
// ===== 매출 조회 (POS Phase 3d) — 기간/번호 조회 · 필터 · 영수증 상세 · 엑셀 =====
// =============================================
// 읽기 전용(쓰기 0건). 조회=전 직원 개방(권한 방침). storeSales 3a 복합인덱스(storeId,dateKey) EXACT 사용(orderBy 없음, 클라 정렬).
// 🔴 취소 상태 정합성(부분취소): 판매의 모든 취소 doc(originalSaleId==saleId)을 조회·집계 → 라인별 누적 취소수량 →
//    상태 정상/일부취소/전체취소 판별 + 요약은 '남은 금액'만 순액 반영. 취소가 다른 날(범위 밖)이어도 originalSaleId 조회로 포착.

let _shMode = 'range'          // 'range'(기간) | 'phone'(번호)
let _shSales = []              // 조회 결과 중 type:'sale' 문서
let _shVoidsByOrig = {}        // originalSaleId → [void 문서…] (범위 내 + originalSaleId 조회 병합)
let _shAgg = {}                // originalSaleId → 집계 {voidedByKey, voidedTotal/…, soldQtyTotal, remainingTotal/Qty, status}
let _shOrphanVoids = []        // 원본 판매가 결과에 없는 취소(반품) 문서 — 반전 항목으로 표시
let _shView = []              // 필터 적용 표시 행 (엑셀 export 대상)
let _shCtx = { store: '', start: '', end: '', phone: '', mode: 'range' }   // 파일명/표시용 컨텍스트
let _shReceiptSale = null    // 영수증 모달이 현재 보고 있는 판매 doc ([판매 취소] 대상)

// 취소 doc → 원 판매 id. originalSaleId 우선(항상 설정됨). 폴백은 근사(구 레코드용).
function _shVoidOrigId(v) {
  if (v && v.originalSaleId) return String(v.originalSaleId)
  const id = String((v && v._id) || '')
  return (id.indexOf('void_') === 0) ? id.slice(5).replace(/_\d{1,6}$/, '') : ''
}

// 판매 + 그 취소 문서들 → 집계. 라인별 누적 취소수량, 취소 합계/할인/수량, 남은 금액/수량, 상태.
function _shComputeAgg(saleDoc, voidDocs) {
  const soldByKey = {}
  ;(saleDoc.lines || []).forEach(l => { const k = _lineIdOf(l); soldByKey[k] = (soldByKey[k] || 0) + (Number(l.qty) || 0) })
  const voidedByKey = {}
  let voidedTotal = 0, voidedDiscount = 0, voidedQty = 0
  ;(voidDocs || []).forEach(v => {
    ;(v.lines || []).forEach(l => { const k = _lineIdOf(l); voidedByKey[k] = (voidedByKey[k] || 0) + (Number(l.qty) || 0) })
    const t = v.totals || {}
    voidedTotal += Number(t.total) || 0; voidedDiscount += Number(t.discountTotal) || 0; voidedQty += Number(t.qtyTotal) || 0
  })
  const st = saleDoc.totals || {}
  const soldQtyTotal = Number(st.qtyTotal) || 0
  const soldTotal = Number(st.total) || 0, soldDiscount = Number(st.discountTotal) || 0
  const status = voidedQty <= 0 ? 'normal' : (voidedQty >= soldQtyTotal ? 'full' : 'partial')
  return {
    docs: (voidDocs || []).slice(), voidedByKey, voidedTotal, voidedDiscount, voidedQty,
    soldByKey, soldQtyTotal, soldTotal, soldDiscount,
    remainingTotal: soldTotal - voidedTotal, remainingDiscount: soldDiscount - voidedDiscount, remainingQty: soldQtyTotal - voidedQty,
    status
  }
}

// 매출 조회 패널 초기화 + 자동 조회 (3e: 서브탭 진입 시). 3d 모달-오픈 동작과 동일(오늘~오늘 기본, 자동 로드).
function renderSalesHistoryPanel() {
  if (!document.getElementById('shBody')) return   // 패널 미렌더 시 방어
  // 매장 선택기 — 조회 개방(전원). 기본 = resolveActiveStore() 또는 첫 활성 매장(office 는 own store 없음)
  const active = (typeof getActiveStores === 'function') ? getActiveStores() : []
  const cur = (typeof resolveActiveStore === 'function') ? (resolveActiveStore() || (active[0] && active[0].id) || '') : ''
  const sel = document.getElementById('shStore')
  if (sel) sel.innerHTML = active.length
    ? active.map(s => `<option value="${esc(s.id)}"${s.id === cur ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
    : '<option value="">(활성 매장 없음)</option>'
  const today = _inbDateKeyKST()
  const startEl = document.getElementById('shStart'); if (startEl) startEl.value = today   // 기본 오늘~오늘
  const endEl = document.getElementById('shEnd'); if (endEl) endEl.value = today
  const payEl = document.getElementById('shPay'); if (payEl) payEl.value = ''
  const statusEl = document.getElementById('shStatus'); if (statusEl) statusEl.value = 'all'
  const phoneEl = document.getElementById('shPhone'); if (phoneEl) phoneEl.value = ''
  _shSetMode('range')
  _shLoad()
}

// 모드 전환 (기간 조회 ↔ 번호 검색). 표시 토글 = inb-hidden 클래스(인라인 display:none 금지 정책 준수).
function _shSetMode(mode) {
  _shMode = (mode === 'phone') ? 'phone' : 'range'
  const rq = document.getElementById('shRangeQuery'), pq = document.getElementById('shPhoneQuery')
  if (rq) rq.classList.toggle('inb-hidden', _shMode !== 'range')
  if (pq) pq.classList.toggle('inb-hidden', _shMode !== 'phone')
  const rb = document.getElementById('shModeRange'), pb = document.getElementById('shModePhone')
  if (rb) rb.classList.toggle('shist-mode-active', _shMode === 'range')
  if (pb) pb.classList.toggle('shist-mode-active', _shMode === 'phone')
  // 모드 전환 시 이전 결과 비우기(혼동 방지)
  _shSales = []; _shVoidsByOrig = {}; _shAgg = {}; _shOrphanVoids = []; _shView = []
  const body = document.getElementById('shBody'), sumEl = document.getElementById('shSummary')
  if (body) body.innerHTML = `<tr><td colspan="8" class="inbhist-empty">${_shMode === 'phone' ? '휴대폰 번호를 입력하고 검색하세요' : '조건을 선택하면 자동 조회됩니다'}</td></tr>`
  if (sumEl) sumEl.textContent = ''
  _shUpdateExportBtn()
  if (_shMode === 'phone') { const p = document.getElementById('shPhone'); if (p) setTimeout(() => p.focus(), 30) }
}

// 판매들의 모든 취소 doc 조회 — where('originalSaleId','in',[saleIds]) 30개 청크. 단일필드 in → auto 인덱스(복합 불요).
//   판매당 취소가 여러 개(부분취소 회차) + 다른 날(범위 밖)이어도 전부 포착.
async function _shFetchVoidsByOrig(saleIds) {
  if (!db || !saleIds || !saleIds.length) return []
  const CHUNK = 30
  const out = []
  for (let i = 0; i < saleIds.length; i += CHUNK) {
    const slice = saleIds.slice(i, i + CHUNK)
    try {
      const qq = db.collection('storeSales').where('originalSaleId', 'in', slice)   // 취소 doc 만 originalSaleId 보유
      let snap
      try { snap = await qq.get({ source: 'server' }) } catch (e) { snap = await qq.get() }
      snap.forEach(d => out.push(Object.assign({ _id: d.id }, d.data() || {})))
    } catch (e) { console.warn('취소 조회 실패(무시):', e && e.message) }
  }
  return out
}

// 결과 문서 sale/void 분리 → 판매별 취소 문서 집계(_shVoidsByOrig/_shAgg) + orphan void.
async function _shIngest(snap) {
  const sales = [], voidsInResult = []
  snap.forEach(d => { const o = Object.assign({ _id: d.id }, d.data() || {}); (o.type === 'void' ? voidsInResult : sales).push(o) })
  const saleIds = sales.map(s => s._id)
  // 판매별 전체 취소 문서 = 결과 내 취소 + originalSaleId 조회(범위 밖 회차 포함), _id 로 dedupe
  const byOrig = {}, seen = new Set()
  const add = v => { if (!v || seen.has(v._id)) return; seen.add(v._id); const o = _shVoidOrigId(v); if (o) (byOrig[o] = byOrig[o] || []).push(v) }
  voidsInResult.forEach(add)
  ;(await _shFetchVoidsByOrig(saleIds)).forEach(add)
  _shVoidsByOrig = byOrig
  _shSales = sales
  _shAgg = {}
  sales.forEach(s => { _shAgg[s._id] = _shComputeAgg(s, byOrig[s._id] || []) })
  const saleIdSet = new Set(saleIds)
  // orphan = 원본 판매가 결과에 없는 취소(전 회차). 반전(반품) 행으로 표시.
  const orphans = []
  Object.keys(byOrig).forEach(o => { if (!saleIdSet.has(o)) orphans.push(...byOrig[o]) })
  _shOrphanVoids = orphans
}

const _shIndexBuilding = (e) => e && (e.code === 'failed-precondition' || /index/i.test(e.message || ''))

// 기간 조회 (기본 진입). storeId equality + dateKey range → 3a 복합인덱스 EXACT (orderBy 없음).
async function _shLoad() {
  if (_shMode !== 'range') return
  const body = document.getElementById('shBody'), sumEl = document.getElementById('shSummary')
  if (!body) return
  const COLS = 8
  const setEmpty = msg => { body.innerHTML = `<tr><td colspan="${COLS}" class="inbhist-empty">${esc(msg)}</td></tr>`; if (sumEl) sumEl.textContent = ''; _shSales = []; _shVoidsByOrig = {}; _shAgg = {}; _shOrphanVoids = []; _shView = []; _shUpdateExportBtn() }
  const store = (document.getElementById('shStore') || {}).value || ''
  const startEl = document.getElementById('shStart'), endEl = document.getElementById('shEnd')
  let start = (startEl || {}).value || '', end = (endEl || {}).value || ''
  if (!store) { setEmpty('매장을 선택하세요'); return }
  if (!start || !end) { setEmpty('시작일/마지막일을 선택하세요'); return }
  if (start > end) { const t = start; start = end; end = t; if (startEl) startEl.value = start; if (endEl) endEl.value = end; showToast('시작일이 마지막일보다 늦어 자동 교정했습니다', 'warning') }
  if (!db) { setEmpty('서버 연결 없음'); return }
  _shCtx = { store, start, end, phone: '', mode: 'range' }
  setEmpty('불러오는 중…')
  const q = db.collection('storeSales').where('storeId', '==', store).where('dateKey', '>=', start).where('dateKey', '<=', end)
  let snap = null
  try { snap = await q.get({ source: 'server' }) }
  catch (e) {
    if (_shIndexBuilding(e)) { setEmpty('인덱스 준비 중 — 잠시 후 다시 시도하세요'); return }
    try { snap = await q.get() } catch (e2) { if (_shIndexBuilding(e2)) { setEmpty('인덱스 준비 중 — 잠시 후 다시 시도하세요'); return } setEmpty('불러오기 실패: ' + (e2 && e2.message ? e2.message : '')); return }
  }
  await _shIngest(snap)
  _shApplyFilters()
}

// 번호 검색 — customerPhone equality (전 매장·전 기간). 단일필드 auto 인덱스(복합 불요). 전체 번호 표시(마스킹 예외).
async function _shPhoneSearch() {
  const body = document.getElementById('shBody'), sumEl = document.getElementById('shSummary')
  if (!body) return
  const COLS = 8
  const setEmpty = msg => { body.innerHTML = `<tr><td colspan="${COLS}" class="inbhist-empty">${esc(msg)}</td></tr>`; if (sumEl) sumEl.textContent = ''; _shSales = []; _shVoidsByOrig = {}; _shAgg = {}; _shOrphanVoids = []; _shView = []; _shUpdateExportBtn() }
  const raw = (document.getElementById('shPhone') || {}).value || ''
  const digits = (typeof normalizePhone === 'function') ? normalizePhone(raw) : String(raw).replace(/\D/g, '')
  if (digits.length < 4) { setEmpty('휴대폰 번호를 입력하세요 (숫자 4자리 이상)'); return }
  if (!db) { setEmpty('서버 연결 없음'); return }
  _shCtx = { store: '', start: '', end: '', phone: digits, mode: 'phone' }
  setEmpty('검색 중…')
  const q = db.collection('storeSales').where('customerPhone', '==', digits)
  let snap = null
  try { snap = await q.get({ source: 'server' }) }
  catch (e) {
    if (_shIndexBuilding(e)) { setEmpty('인덱스 준비 중 — 잠시 후 다시 시도하세요'); return }
    try { snap = await q.get() } catch (e2) { setEmpty('검색 실패: ' + (e2 && e2.message ? e2.message : '')); return }
  }
  await _shIngest(snap)
  _shApplyFilters()
}

function _shRowTime(r) { return r.kind === 'void' ? (r.doc.voidedAt || '') : (r.doc.soldAt || '') }
function _shItemsSummary(lines) {
  const arr = Array.isArray(lines) ? lines : []
  if (!arr.length) return '-'
  const first = arr[0].productCode || ''
  return arr.length > 1 ? (first + ' 외 ' + (arr.length - 1) + '건') : first
}

// 필터(결제수단/상태) 적용 + 렌더 + 요약 + 엑셀버튼. 재조회 없음 — 쿼리는 인덱스 고정, 필터는 메모리.
// ⚠️ 결제수단/상태를 Firestore where 에 넣지 말 것(인덱스 깨짐).
function _shApplyFilters() {
  const body = document.getElementById('shBody'), sumEl = document.getElementById('shSummary')
  if (!body) return
  const COLS = 8
  const payF = (document.getElementById('shPay') || {}).value || ''
  const statusF = (document.getElementById('shStatus') || {}).value || 'all'
  const full = _shCtx.mode === 'phone'   // 번호 검색 결과에서만 전체번호 표시
  const rows = []
  ;(_shSales || []).forEach(s => {
    const agg = _shAgg[s._id] || _shComputeAgg(s, [])
    const st = agg.status   // 'normal' | 'partial' | 'full'
    if (payF && s.payMethod !== payF) return
    if (statusF === 'active' && st !== 'normal') return          // 정상만 = 취소 없는 판매
    if (statusF === 'cancelled' && st === 'normal') return       // 취소만 = 일부/전체 취소
    rows.push({ kind: 'sale', id: s._id, doc: s, agg: agg })
  })
  // orphan void(반전 항목): 원본 판매가 범위 밖 → 그날의 반품 이벤트로 표시. 결제수단 없음 → payF 지정 시 제외.
  if (!payF && (statusF === 'all' || statusF === 'cancelled')) {
    ;(_shOrphanVoids || []).forEach(v => rows.push({ kind: 'void', id: v._id, doc: v, voided: true, voidDoc: v }))
  }
  rows.sort((a, b) => String(_shRowTime(b)).localeCompare(String(_shRowTime(a))))   // 최신 위(DESC)
  _shView = rows
  _shUpdateExportBtn()
  if (!rows.length) {
    const msg = (_shSales && _shSales.length) ? '조건(결제수단/상태)에 맞는 매출이 없습니다' : (_shCtx.mode === 'phone' ? '해당 번호의 매출이 없습니다' : '해당 기간의 매출이 없습니다')
    body.innerHTML = `<tr><td colspan="${COLS}" class="inbhist-empty">${esc(msg)}</td></tr>`
  } else {
    body.innerHTML = rows.map(r => _shRenderRow(r, full)).join('')
  }
  _shRenderSummary(payF)
}

// 취소 문서의 원(原) 판매번호 — originalSaleNo 우선, 없으면 doc id 에서 'void_' 제거(구 레코드 방어; sale doc id=saleNo).
function _shOrigSaleNo(voidDoc) {
  if (!voidDoc) return '-'
  if (voidDoc.originalSaleNo) return String(voidDoc.originalSaleNo)
  const id = String(voidDoc._id || '')   // 폴백(구 레코드): void_{saleId}[_{seq}] → 회차 접미사 제거
  return (id.indexOf('void_') === 0) ? id.slice(5).replace(/_\d{1,6}$/, '') : '-'
}

function _shRenderRow(r, full) {
  const d = r.doc
  const phoneRaw = d.customerPhone || ''
  const phoneCell = phoneRaw ? (full ? esc(phoneRaw) : esc((typeof maskPhone === 'function') ? maskPhone(phoneRaw) : phoneRaw)) : '-'
  if (r.kind === 'void') {
    const t = _inbHistDateTime(d.voidedAt, 'md')
    const tot = (d.totals && Number(d.totals.total)) || 0
    const qt = (d.totals && Number(d.totals.qtyTotal)) || 0
    return `<tr class="shist-void-row" onclick="openSaleReceipt('${esc(r.id)}','void')">
      <td class="inbhist-no">${esc(_shOrigSaleNo(d))} <span class="shist-revtag" title="원 판매의 취소(반품) 전표">반품</span></td>
      <td class="inbhist-time">${esc(t)}</td>
      <td>${esc(_shItemsSummary(d.lines))}</td>
      <td style="text-align:right">-${qt}</td>
      <td style="text-align:right">-₩${tot.toLocaleString()}</td>
      <td style="text-align:center">-</td>
      <td>${phoneCell}</td>
      <td style="text-align:center"><span class="shist-badge shist-badge-void">취소</span></td>
    </tr>`
  }
  const t = _inbHistDateTime(d.soldAt, 'md')
  const agg = r.agg || _shComputeAgg(d, [])
  const tot = agg.soldTotal
  const qt = agg.soldQtyTotal
  let statusCell, rowCls = ''
  if (agg.status === 'full') {
    statusCell = '<span class="shist-badge shist-badge-void">취소됨</span>'; rowCls = ' shist-cancelled-row'
  } else if (agg.status === 'partial') {
    statusCell = `<span class="shist-badge shist-badge-partial" title="남은 ₩${agg.remainingTotal.toLocaleString()} · 취소 ${agg.voidedQty}개">일부취소</span><div class="shist-remain">남은 ₩${agg.remainingTotal.toLocaleString()}</div>`
  } else {
    statusCell = '<span class="shist-badge shist-badge-ok">정상</span>'
  }
  return `<tr class="shist-sale-row${rowCls}" onclick="openSaleReceipt('${esc(r.id)}','sale')">
    <td class="inbhist-no">${esc(d.saleNo || '-')}</td>
    <td class="inbhist-time">${esc(t)}</td>
    <td>${esc(_shItemsSummary(d.lines))}</td>
    <td style="text-align:right">${qt}</td>
    <td style="text-align:right">₩${tot.toLocaleString()}</td>
    <td style="text-align:center">${esc(d.payMethod || '-')}</td>
    <td>${phoneCell}</td>
    <td style="text-align:center">${statusCell}</td>
  </tr>`
}

// 요약 — 🔴 부분취소 순액(netting): 매출 = Σ(판매 − 그 판매의 취소들). 일부취소는 '남은 금액'만, 전체취소는 0.
//   결제수단 필터 반영. 상태 필터는 표시 렌즈일 뿐 매출 계산엔 무관(항상 남은 실현매출 집계). orphan void(원본 범위 밖)는 미포함.
function _shRenderSummary(payF) {
  const sumEl = document.getElementById('shSummary')
  if (!sumEl) return
  let rev = 0, disc = 0, qty = 0, n = 0
  ;(_shSales || []).forEach(s => {
    if (payF && s.payMethod !== payF) return
    const agg = _shAgg[s._id] || _shComputeAgg(s, [])
    rev += agg.remainingTotal; disc += agg.remainingDiscount; qty += agg.remainingQty
    if (agg.remainingQty > 0) n++   // 남은 수량이 있는(=완전취소 아님) 판매 건수
  })
  sumEl.innerHTML = `기간 판매 <strong>${n}</strong>건 · 매출 <strong>₩${rev.toLocaleString()}</strong> · 할인 ₩${disc.toLocaleString()} · 수량 ${qty}개 <span class="inbhist-sum-note">(취소분 차감·순액)</span>`
}

function _shUpdateExportBtn() { const btn = document.getElementById('shExportBtn'); if (btn) btn.disabled = !(_shView && _shView.length) }

// ── 영수증 상세 모달 ──
function openSaleReceipt(id, kind) {
  const modal = document.getElementById('saleReceiptModal')
  if (!modal) return
  let d = null, voided = false, agg = null
  if (kind === 'void') { d = (_shOrphanVoids || []).find(v => v._id === id) || (_shView.find(r => r.id === id) || {}).doc; voided = true }
  else { d = (_shSales || []).find(s => s._id === id); agg = d ? (_shAgg[d._id] || _shComputeAgg(d, [])) : null; voided = !!(agg && agg.status !== 'normal') }
  if (!d) { showToast('영수증을 찾을 수 없습니다', 'warning'); return }
  const isVoidDoc = kind === 'void'
  const headEl = document.getElementById('shReceiptHead')
  const origNo = isVoidDoc ? _shOrigSaleNo(d) : (d.saleNo || '-')   // 취소 전표 = 원 판매번호 표시(연결)
  const when = isVoidDoc ? _inbHistDateTime(d.voidedAt, 'full') : _inbHistDateTime(d.soldAt, 'full')
  const phoneShow = d.customerPhone ? (_shCtx.mode === 'phone' ? esc(d.customerPhone) : esc((typeof maskPhone === 'function') ? maskPhone(d.customerPhone) : d.customerPhone)) : '-'
  const statusTag = isVoidDoc ? ' <span class="shist-revtag">반품 전표</span>'
    : (agg && agg.status === 'full') ? ' <span class="shist-badge shist-badge-void">취소됨</span>'
    : (agg && agg.status === 'partial') ? ' <span class="shist-badge shist-badge-partial">일부취소</span>' : ''
  if (headEl) headEl.innerHTML = `
    <div class="shist-rc-title">${esc(origNo)}${statusTag}</div>
    ${isVoidDoc ? `<div class="shist-rc-orig">원 판매번호 <strong>${esc(origNo)}</strong> 의 취소(반품) 전표</div>` : ''}
    <div class="shist-rc-grid">
      <span>${isVoidDoc ? '취소일시' : '일시'}</span><span>${esc(when)}</span>
      <span>매장</span><span>${esc(_storeNameById(d.storeId) || d.storeId || '-')}</span>
      <span>${isVoidDoc ? '취소자' : '작업자'}</span><span>${esc((isVoidDoc ? d.voidedByName : d.workerName) || '-')}</span>
      <span>결제수단</span><span>${esc(isVoidDoc ? '-' : (d.payMethod || '-'))}</span>
      <span>휴대폰</span><span>${phoneShow}</span>
    </div>`
  const linesEl = document.getElementById('shReceiptLines')
  const lines = Array.isArray(d.lines) ? d.lines : []
  // 판매 영수증: 판매수량/취소수량/남은수량 표시. 취소 전표: 취소된 수량만.
  if (linesEl) linesEl.innerHTML = lines.length ? lines.map(l => {
    const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(l.productCode) : null
    const nm = p ? (p.nameKr || p.nameEn || '') : ''
    const soldQ = Number(l.qty) || 0
    const vQ = (!isVoidDoc && agg) ? (agg.voidedByKey[_lineIdOf(l)] || 0) : 0   // 🔴 5-3: split 라인 lineId 키
    const remQ = soldQ - vQ
    const note = l.lineNote ? ` <span class="svoid-note">${esc(l.lineNote)}</span>` : ''
    const qtyCell = isVoidDoc
      ? `<td style="text-align:right">${soldQ}</td>`
      : `<td style="text-align:right">${soldQ}${vQ > 0 ? ` <span class="shist-rc-vq">-${vQ}</span> <span class="shist-rc-rem">남은 ${remQ}</span>` : ''}</td>`
    return `<tr${(!isVoidDoc && remQ <= 0) ? ' class="shist-cancelled-row"' : ''}>
      <td><span class="code-link" onclick="openStoreProductDetail('${esc(l.productCode)}','${esc(d.storeId || '')}')">${esc(l.productCode)}</span>${note}</td>
      <td>${esc(nm)}</td>
      <td style="text-align:center">${esc(l.size || '')}</td>
      ${qtyCell}
      <td style="text-align:right">${(Number(l.unitPrice) || 0).toLocaleString()}</td>
      <td style="text-align:right">${(Number(l.unitDiscount) || 0).toLocaleString()}</td>
      <td style="text-align:right;font-weight:700">${(Number(l.lineTotal) || 0).toLocaleString()}</td>
    </tr>`
  }).join('') : '<tr><td colspan="7" class="inbhist-empty">품목 없음</td></tr>'
  const totalsEl = document.getElementById('shReceiptTotals')
  const tt = d.totals || {}
  if (totalsEl) totalsEl.innerHTML = (!isVoidDoc && agg && agg.status !== 'normal')
    ? `판매 ₩${(Number(tt.total) || 0).toLocaleString()} · 취소 -₩${agg.voidedTotal.toLocaleString()} · <strong>남은 ₩${agg.remainingTotal.toLocaleString()}</strong> · 수량 ${agg.remainingQty}/${agg.soldQtyTotal}`
    : `합계 <strong>₩${(Number(tt.total) || 0).toLocaleString()}</strong> · 할인 ₩${(Number(tt.discountTotal) || 0).toLocaleString()} · 수량 ${Number(tt.qtyTotal) || 0}개`
  // 취소 이력 (판매 영수증: 회차별 취소 목록) / 취소 전표: 사유·취소자·일시
  const voidEl = document.getElementById('shReceiptVoid')
  if (voidEl) {
    if (isVoidDoc) {
      voidEl.innerHTML = `<div class="shist-rc-void"><div class="shist-rc-void-title">🚫 취소(반품)</div>
        <div>취소자: ${esc(d.voidedByName || '-')}</div>
        <div>취소일시: ${esc(_inbHistDateTime(d.voidedAt, 'full'))}</div>
        <div>사유: ${esc(d.voidReason || '-')}</div></div>`
    } else if (agg && agg.docs.length) {
      const items = agg.docs.slice().sort((a, b) => String(a.voidedAt || '').localeCompare(String(b.voidedAt || ''))).map((v, i) =>
        `<div class="shist-rc-vh-row">${i + 1}. ${esc(_inbHistDateTime(v.voidedAt, 'full'))} · ${Number(v.totals && v.totals.qtyTotal) || 0}개 · -₩${(Number(v.totals && v.totals.total) || 0).toLocaleString()} · ${esc(v.voidedByName || '-')} · ${esc(v.voidReason || '-')}</div>`).join('')
      voidEl.innerHTML = `<div class="shist-rc-void"><div class="shist-rc-void-title">🚫 취소 이력 (${agg.docs.length}회 · 총 ${agg.voidedQty}개)</div>${items}</div>`
    } else voidEl.innerHTML = ''
  }
  // [판매 취소] (부분취소) — 남은 수량 > 0 인 판매 + 권한(관리자 OR 본인 매장)에서만 표시. office/타매장 숨김(서버 규칙이 최종 방어).
  _shReceiptSale = (!isVoidDoc && agg && agg.remainingQty > 0) ? d : null
  const vbtn = document.getElementById('shVoidBtn')
  const canVoid = !!_shReceiptSale && _svCanVoid(d)
  if (vbtn) vbtn.classList.toggle('shist-hidden', !canVoid)
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
}
function closeSaleReceipt() { const m = document.getElementById('saleReceiptModal'); if (m) m.close() }

// ============================================================
// ===== 판매 취소 (부분취소) — 라인/수량 선택 + 재고 복원, 누적 상한 트랜잭션, append-only =====
// ============================================================
// 각 취소 = 새 문서 storeSales/void_{saleId}_{NNNN}(회차별) — 원본 판매 doc 절대 불변(append-only, update/delete 규칙 거부).
//   🔴 누적 상한(라인별 취소 ≤ 판매)은 runTransaction 이 authoritative: 판매 doc + 그 판매의 취소 doc들(결정적 seq id 로 순회 read)
//   을 트랜잭션 내에서 읽어 누적 계산 → 초과 시 abort. 동시 취소는 같은 seq write→read-conflict 재실행→재검증 → over-void 불가.
//   멱등: clientToken(회차 단위) — 모호(타임아웃) 재시도 시 같은 토큰의 취소가 이미 있으면 no-op(중복 복원 방지).
//   재고 복원 = increment(+voidQty), sizeLocations 불변. 정수 KRW.

let _svTarget = null        // 취소 대상 판매 doc (_id 포함)
let _svInFlight = false      // 🔴 in-flight 가드
let _svToken = ''            // 멱등 토큰 (모호 재시도 대비). 성공/확정거부 시 소거, 타임아웃 시 유지.
let _svTokenSaleId = ''      // 토큰이 묶인 판매 id (다른 판매로 전환 시 토큰 리셋)

// 취소 권한 — 관리자(grade≥3) OR 본인 배정 매장. office/타매장 = 불가(정책: 판매 취소 = 본인 매장 + 사유·로그).
function _svCanVoid(sale) {
  if (!sale) return false
  const g = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  const ms = (typeof _currentUserStoreId !== 'undefined' && _currentUserStoreId) ? _currentUserStoreId : ''
  return (g >= 3) || (!!ms && ms === sale.storeId)
}

// [판매 취소] 클릭 (영수증) → 부분취소 다이얼로그: 라인별 판매/이미취소/남은 + 취소수량 입력 + 사유.
function requestSaleVoid() {
  const sale = _shReceiptSale
  if (!sale) { showToast('취소할 판매를 찾을 수 없습니다', 'warning'); return }
  if (!_svCanVoid(sale)) { showToast('본인 매장 판매만 취소할 수 있습니다', 'warning'); return }
  const agg = _shAgg[sale._id] || _shComputeAgg(sale, [])
  if (agg.remainingQty <= 0) { showToast('이미 전체 취소된 판매입니다', 'warning'); return }
  // 다른 판매로 전환 시 멱등 토큰 리셋(같은 판매면 유지 → 타임아웃 재시도 멱등)
  if (_svTokenSaleId && _svTokenSaleId !== sale._id) { _svToken = ''; _svTokenSaleId = '' }
  _svTarget = sale
  const modal = document.getElementById('saleVoidModal')
  if (!modal) return
  const tt = sale.totals || {}
  const sumEl = document.getElementById('svSummary')
  if (sumEl) sumEl.innerHTML = `<div class="svoid-line"><strong>${esc(sale.saleNo || '')}</strong> · ${esc(_inbHistDateTime(sale.soldAt, 'full'))}</div>
    <div class="svoid-amt">판매 ₩${(Number(tt.total) || 0).toLocaleString()} · 수량 ${Number(tt.qtyTotal) || 0}개 · 남은 <strong>${agg.remainingQty}개(₩${agg.remainingTotal.toLocaleString()})</strong></div>`
  const bodyEl = document.getElementById('svLinesBody')
  const lines = Array.isArray(sale.lines) ? sale.lines : []
  let hasBundle = false
  if (bodyEl) bodyEl.innerHTML = lines.map((l, i) => {
    const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(l.productCode) : null
    const nm = p ? (p.nameKr || p.nameEn || '') : ''
    const soldQ = Number(l.qty) || 0
    const vQ = agg.voidedByKey[_lineIdOf(l)] || 0   // 🔴 5-3: split 라인 독립 집계(lineId)
    const remQ = soldQ - vQ
    const lid = (l.lineId != null && l.lineId !== '') ? String(l.lineId) : ''
    const iid = (l.bundleInstanceId != null && l.bundleInstanceId !== '') ? String(l.bundleInstanceId) : ''   // 🔴 5-4: 번들 인스턴스
    if (iid) hasBundle = true
    const note = l.lineNote ? ` <span class="svoid-note">${esc(l.lineNote)}</span>` : ''   // 무료/반값/콤보/번들 라벨
    // 🔴 5-4 번들 = whole-instance-void-only: 부분 qty 입력 차단, "번들 전체" 체크박스만(같은 instanceId 함께 취소).
    let control
    if (remQ <= 0) control = '<span class="svoid-done">취소 완료</span>'
    else if (iid) control = `<label class="svoid-bundle-lbl"><input type="checkbox" class="svoid-bundle-chk" data-instance="${esc(iid)}" data-code="${esc(l.productCode)}" data-size="${esc(l.size)}" data-lineid="${esc(lid)}" data-rem="${remQ}" onchange="onSvBundleToggle(this)"> 번들 전체</label>`
    else control = `<input type="number" class="svoid-qty-input" min="0" max="${remQ}" step="1" value="0" data-i="${i}" data-code="${esc(l.productCode)}" data-size="${esc(l.size)}" data-lineid="${esc(lid)}" oninput="onSvQtyInput(this)">`
    return `<tr${remQ <= 0 ? ' class="svoid-row-done"' : (iid ? ' class="svoid-row-bundle"' : '')}>
      <td>${esc(l.productCode)}${note}${nm ? `<div class="svoid-nm">${esc(nm)}</div>` : ''}</td>
      <td style="text-align:center">${esc(l.size)}</td>
      <td style="text-align:right">${soldQ}</td>
      <td style="text-align:right">${vQ}</td>
      <td style="text-align:right;font-weight:700">${remQ}</td>
      <td style="text-align:center">${control}</td>
    </tr>`
  }).join('') + (hasBundle ? '<tr class="svoid-bundle-hint-row"><td colspan="6" class="svoid-bundle-hint">🎁 번들 상품은 부분 취소 불가 — 같은 번들 전체 단위로만 취소됩니다(재고 전량 복원).</td></tr>' : '')
  const reasonEl = document.getElementById('svReason'); if (reasonEl) reasonEl.value = ''
  _svUpdateLiveTotal()
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
  setTimeout(() => { const r = document.getElementById('svReason'); if (r) r.focus() }, 40)   // 포커스 = 사유(파괴 버튼 아님)
}
function closeSaleVoidModal() { const m = document.getElementById('saleVoidModal'); if (m) m.close() }

// 취소수량 입력 clamp(0..max) + 라이브 합계
function onSvQtyInput(el) {
  const max = Math.max(0, Math.floor(Number(el.max) || 0))
  let n = Math.floor(Number(el.value))
  if (isNaN(n) || n < 0) n = 0
  if (n > max) n = max
  if (String(n) !== String(el.value)) el.value = String(n)
  _svUpdateLiveTotal()
}
// 전체 취소(남은 전량) 편의 버튼 — 일반 라인 max + 번들 체크박스 전부 체크
function svVoidAll() {
  document.querySelectorAll('#svLinesBody .svoid-qty-input').forEach(el => { el.value = el.max })
  document.querySelectorAll('#svLinesBody .svoid-bundle-chk').forEach(el => { el.checked = true })
  _svUpdateLiveTotal()
}
// 🔴 5-4: 번들 체크박스 토글 → 같은 instanceId 의 모든 체크박스 동기(전체 단위 취소만 허용)
function onSvBundleToggle(el) {
  const iid = el.getAttribute('data-instance')
  document.querySelectorAll('#svLinesBody .svoid-bundle-chk').forEach(c => { if (c.getAttribute('data-instance') === iid) c.checked = el.checked })
  _svUpdateLiveTotal()
}
// 선택 수집 [{productCode,size,lineId?,voidQty}] — 5-3: split 라인 data-lineid 독립 식별. 5-4: 체크된 번들=남은 전량.
function _svCollectSelections() {
  const sels = []
  document.querySelectorAll('#svLinesBody .svoid-qty-input').forEach(el => {
    const q = Math.floor(Number(el.value) || 0)
    if (q >= 1) {
      const sel = { productCode: el.getAttribute('data-code'), size: el.getAttribute('data-size'), voidQty: q }
      const lid = el.getAttribute('data-lineid'); if (lid) sel.lineId = lid
      sels.push(sel)
    }
  })
  document.querySelectorAll('#svLinesBody .svoid-bundle-chk').forEach(el => {   // 🔴 5-4: 체크된 번들 라인 = 남은 전량 취소
    if (!el.checked) return
    const rem = Math.max(0, Math.floor(Number(el.getAttribute('data-rem')) || 0))
    if (rem >= 1) {
      const sel = { productCode: el.getAttribute('data-code'), size: el.getAttribute('data-size'), voidQty: rem }
      const lid = el.getAttribute('data-lineid'); if (lid) sel.lineId = lid
      sels.push(sel)
    }
  })
  return sels
}
// 라이브 "이번 취소" 금액/수량 (원본 라인 단가로 per-unit 계산)
function _svUpdateLiveTotal() {
  const el = document.getElementById('svLiveTotal'); if (!el) return
  const sale = _svTarget || {}
  const byKey = {}; (sale.lines || []).forEach(l => { byKey[_lineIdOf(l)] = l })
  let amt = 0, qty = 0
  _svCollectSelections().forEach(s => {
    const l = byKey[_selKey(s)]
    if (!l) return
    const up = Math.max(0, Math.floor(Number(l.unitPrice) || 0))
    let ud = Math.max(0, Math.floor(Number(l.unitDiscount) || 0)); if (ud > up) ud = up
    amt += (up - ud) * s.voidQty; qty += s.voidQty
  })
  el.textContent = '이번 취소 ₩' + amt.toLocaleString() + ' · ' + qty + '개'
}

// 취소 버튼 busy 토글
function _svSetBusy(busy) {
  const btn = document.getElementById('svConfirmBtn')
  if (!btn) return
  btn.disabled = !!busy
  if (busy) { if (btn.dataset.orig == null) btn.dataset.orig = btn.textContent; btn.textContent = '취소 중…' }
  else if (btn.dataset.orig != null) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig }
}

// promise 타임아웃 레이스 — {value} | {timeout:true} | {error}
function _svRaceTimeout(p, ms) {
  return new Promise(resolve => {
    let done = false
    const t = setTimeout(() => { if (!done) { done = true; resolve({ timeout: true }) } }, ms || 20000)
    p.then(v => { if (!done) { done = true; clearTimeout(t); resolve({ value: v }) } })
     .catch(e => { if (!done) { done = true; clearTimeout(t); resolve({ error: e }) } })
  })
}

// 취소 후(성공/기반영/abort) — 서버 authoritative 재로드 + 영수증/1f 갱신.
async function _svAfterVoid(sale, opts) {
  opts = opts || {}
  closeSaleVoidModal()
  _svTarget = null
  try { if (typeof buildStoreStockIndex === 'function') await buildStoreStockIndex(sale.storeId) } catch (e) {}
  if (typeof renderStoreStockView === 'function') renderStoreStockView()
  try { if (_shMode === 'phone') await _shPhoneSearch(); else await _shLoad() } catch (e) {}   // 취소 문서/집계 최신화
  const rc = document.getElementById('saleReceiptModal')
  if (rc && rc.open) openSaleReceipt(sale._id, 'sale')   // 남은수량 갱신 + 버튼 재판정
  if (opts.abort) return
  if (opts.already) showToast('이미 반영된 취소입니다 (' + (sale.saleNo || '') + ')', 'warning')
  else showToast('부분 취소 완료 · ' + (sale.saleNo || '') + ' · ' + (opts.qty || 0) + '개', 'success')
}

// 취소 실행 — 검증 → 프리플라이트 → runTransaction(누적 상한 재검증 + 재고 복원 + void doc) → 성공/모호/거부.
async function confirmSaleVoid() {
  if (_svInFlight) return
  const sale = _svTarget
  if (!sale) return
  const reasonEl = document.getElementById('svReason')
  const reason = reasonEl ? String(reasonEl.value || '').trim() : ''
  const sels = _svCollectSelections()
  if (!sels.length) { showToast('취소할 수량을 1개 이상 입력하세요', 'warning'); return }
  if (!reason) { showToast('취소 사유를 입력하세요', 'warning'); if (reasonEl) reasonEl.focus(); return }
  if (!_svCanVoid(sale)) { showToast('본인 매장 판매만 취소할 수 있습니다', 'warning'); return }
  if (!db) { showToast('서버 연결 없음 — 잠시 후 다시 시도하세요', 'warning'); return }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { showToast('오프라인 상태 — 연결 확인 후 취소하세요', 'warning'); return }
  // 클라 사전 상한 검증(서버 트랜잭션이 authoritative). 🔴 5-3: split 라인 lineId 키로 독립 상한.
  const agg0 = _shAgg[sale._id] || _shComputeAgg(sale, [])
  for (const s of sels) {
    const k = _selKey(s)
    const remain = (agg0.soldByKey[k] || 0) - (agg0.voidedByKey[k] || 0)
    if (s.voidQty > remain) { showToast(s.productCode + ' ' + s.size + ': 남은 수량(' + remain + ') 초과', 'warning'); return }
  }
  const store = sale.storeId
  const uid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : ''
  const workerName = (typeof formatUserName === 'function')
    ? formatUserName(_currentUserName, (typeof _currentUserPosition !== 'undefined' ? _currentUserPosition : ''))
    : ((typeof _currentUserName !== 'undefined' && _currentUserName) || '')
  if (!_svToken) { _svToken = kstStamp() + '-' + Math.floor(Math.random() * 1e8).toString(36); _svTokenSaleId = sale._id }
  const token = _svToken
  const saleRef = db.collection('storeSales').doc(sale._id)

  try {
    _svInFlight = true
    _svSetBusy(true)
    // 연결 프리플라이트 (오프라인/도달불가 fail-fast) — 트랜잭션도 서버 read 하지만 모호창 축소
    const pre = await _saleReadSaleDoc(sale._id, 5000)
    if (!pre.ok) { showToast('오프라인 상태 — 연결 확인 후 취소하세요', 'warning'); return }
    if (!pre.exists) { showToast('판매를 찾을 수 없습니다', 'warning'); closeSaleVoidModal(); return }

    const txnP = db.runTransaction(async (tx) => {
      // ── READS (모든 read 를 write 이전에) ──
      const saleSnap = await tx.get(saleRef)
      if (!saleSnap.exists) throw new Error('SALE_NOT_FOUND')
      const sd = saleSnap.data() || {}
      const soldByKey = {}
      ;(sd.lines || []).forEach(l => { const k = _lineIdOf(l); soldByKey[k] = (soldByKey[k] || 0) + (Number(l.qty) || 0) })   // 🔴 5-3: lineId 키
      const existing = []
      // 레거시 전량취소 id (구 3e) 도 포함
      const legacySnap = await tx.get(db.collection('storeSales').doc(voidDocId(sale._id)))
      if (legacySnap.exists) existing.push(Object.assign({ _id: legacySnap.id }, legacySnap.data()))
      // 회차 seq 1..firstEmpty (결정적 id 순회 — 판매수량+2 상한). 비존재 read 도 트랜잭션이 추적 → 동시 write 시 재실행.
      const maxSeq = (Number(sd.totals && sd.totals.qtyTotal) || 0) + 2
      let seq = 1, target = 0
      while (seq <= maxSeq) {
        const vs = await tx.get(db.collection('storeSales').doc(voidSeqId(sale._id, seq)))
        if (!vs.exists) { target = seq; break }
        existing.push(Object.assign({ _id: vs.id }, vs.data()))
        seq++
      }
      if (!target) throw new Error('TOO_MANY_VOIDS')
      // 멱등: 이 회차 토큰이 이미 있으면 no-op(모호 재시도 중복 방지)
      if (existing.some(v => v.clientToken && v.clientToken === token)) return { already: true }
      // 누적 상한 재검증 (authoritative)
      const voidedByKey = {}
      existing.forEach(v => (v.lines || []).forEach(l => { const k = _lineIdOf(l); voidedByKey[k] = (voidedByKey[k] || 0) + (Number(l.qty) || 0) }))   // 🔴 5-3: lineId 키
      for (const s of sels) {
        const k = _selKey(s)
        if ((voidedByKey[k] || 0) + s.voidQty > (soldByKey[k] || 0)) throw new Error('EXCEEDS_REMAINING')
      }
      const soldQtyTotal = Number(sd.totals && sd.totals.qtyTotal) || 0
      const priorQty = Object.keys(voidedByKey).reduce((a, k) => a + voidedByKey[k], 0)
      const thisQty = sels.reduce((a, s) => a + s.voidQty, 0)
      const fully = (priorQty + thisQty) >= soldQtyTotal
      const voidDoc = buildPartialVoidDoc(sd, sale._id, sels, { voidReason: reason, voidedBy: uid, voidedByName: workerName, voidSeq: target, clientToken: token, partial: !fully })
      // ── WRITES ──
      const wStore = String(sd.storeId || store)   // 서버 판매 doc 의 storeId 를 권위로 사용(재고 write 대상 매장)
      tx.set(db.collection('storeSales').doc(voidSeqId(sale._id, target)), voidDoc)   // create (신규 seq)
      const codeSizeQty = {}
      voidDoc.lines.forEach(l => { codeSizeQty[l.productCode] = codeSizeQty[l.productCode] || {}; codeSizeQty[l.productCode][l.size] = (codeSizeQty[l.productCode][l.size] || 0) + l.qty })
      const nowIso = new Date().toISOString()
      Object.keys(codeSizeQty).forEach(code => {
        const sizesMap = {}
        Object.keys(codeSizeQty[code]).forEach(sz => { sizesMap[sz] = firebase.firestore.FieldValue.increment(codeSizeQty[code][sz]) })   // 복원 = increment(+qty). sizeLocations 불변
        tx.set(db.collection('storeStock').doc(storeStockDocId(wStore, code)), { storeId: wStore, productCode: code, sizes: sizesMap, updatedAt: nowIso }, { merge: true })
      })
      return { ok: true, qty: thisQty }
    })

    const raced = await _svRaceTimeout(txnP, 20000)
    if (raced.timeout) { showToast('네트워크 불안정 — 반영 여부 확인 중입니다. 다시 [취소 실행]을 누르면 안전하게 재시도됩니다', 'warning'); return }   // 토큰 유지(멱등 재시도)
    if (raced.error) throw raced.error
    const result = raced.value || {}
    // 성공 또는 기반영 → 토큰 소거
    _svToken = ''; _svTokenSaleId = ''
    if (!result.already && typeof logActivity === 'function') {
      logActivity('sale-void', '판매취소', _storeNameById(store) + '(' + store + '): ' + (sale.saleNo || '') + ' · ' + (result.qty || 0) + '개 · 사유: ' + reason)
    }
    await _svAfterVoid(sale, { already: !!result.already, qty: result.qty || 0 })
  } catch (e) {
    const msg = e && e.message
    if (msg === 'EXCEEDS_REMAINING') {
      _svToken = ''; _svTokenSaleId = ''
      showToast('남은 수량을 초과했습니다 (다른 취소가 먼저 반영됨)', 'warning')
      await _svAfterVoid(sale, { abort: true })   // 최신 남은수량으로 갱신
    } else if (msg === 'SALE_NOT_FOUND') {
      _svToken = ''; _svTokenSaleId = ''; showToast('판매를 찾을 수 없습니다', 'warning'); closeSaleVoidModal()
    } else if (msg === 'TOO_MANY_VOIDS') {
      showToast('취소 회차가 너무 많습니다 — 관리자에게 문의하세요', 'error')
    } else {
      const denied = e && (e.code === 'permission-denied' || e.code === 7 || /permission/i.test(String(msg || '')))
      if (denied) showToast('권한 오류로 취소되지 않았습니다 — 매장/권한을 확인하세요', 'error')
      else showToast('판매 취소 실패 — 다시 시도하세요' + (msg ? ' (' + msg + ')' : ''), 'error')   // 토큰 유지 → 안전 재시도
      console.error('confirmSaleVoid 실패:', msg)
    }
  } finally {
    _svInFlight = false
    _svSetBusy(false)
  }
}

// 엑셀 다운로드 — 라인당 1행, 판매수준 컬럼 반복. 현재 뷰(_shView) 대상. 휴대폰 마스킹(전역 규칙).
function downloadSalesHistory() {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  if (!_shView || !_shView.length) { showToast('내보낼 매출 내역이 없습니다', 'warning'); return }
  const header = ['판매번호', '일시', '매장', '상태', '결제수단', '휴대폰', '품번', '상품명', '사이즈', '수량', '단가', '할인단가', '정상가', '할인가', '판매가', '취소사유']
  const aoa = [header]
  // 한 문서(판매 또는 취소)의 라인들을 행으로 push. sign=-1 이면 수량/정상가/할인가/판매가 음수(취소=반전) → 열 합계가 실현매출로 순액됨.
  //   단가/할인단가는 per-unit 참조값이라 부호 유지(합산 대상 아님). 판매번호는 원(原) 판매번호로 통일 → 판매+취소 쌍이 같은 번호로 그룹핑.
  const pushDoc = (doc, saleNo, when, status, pay, reason, sign) => {
    const storeName = _storeNameById(doc.storeId) || doc.storeId || ''
    const phone = doc.customerPhone ? ((typeof maskPhone === 'function') ? maskPhone(doc.customerPhone) : doc.customerPhone) : ''
    const lines = Array.isArray(doc.lines) ? doc.lines : []
    if (!lines.length) { aoa.push([saleNo, when, storeName, status, pay, phone, '', '', '', 0, 0, 0, 0, 0, 0, reason]); return }
    lines.forEach(l => {
      const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(l.productCode) : null
      const nm = p ? (p.nameKr || p.nameEn || '') : ''
      aoa.push([saleNo, when, storeName, status, pay, phone,
        l.productCode || '', nm, l.size || '',
        sign * (Number(l.qty) || 0), Number(l.unitPrice) || 0, Number(l.unitDiscount) || 0,
        sign * (Number(l.lineNormal) || 0), sign * (Number(l.lineDiscount) || 0), sign * (Number(l.lineTotal) || 0), reason])
    })
  }
  _shView.forEach(r => {
    const d = r.doc
    if (r.kind === 'void') {   // orphan 취소(반품) — 음수 반전 행
      pushDoc(d, _shOrigSaleNo(d), _inbHistDateTime(d.voidedAt, 'full'), '취소', '-', d.voidReason || '', -1)
      return
    }
    // 판매 행(양수). 판매 이벤트는 양수, 각 회차 취소 행(음수)이 상쇄 → 판매가 열 합계 = 실현매출(남은).
    const agg = r.agg || _shComputeAgg(d, [])
    const saleStatus = agg.status === 'full' ? '취소됨' : (agg.status === 'partial' ? '일부취소' : '정상')
    pushDoc(d, d.saleNo || '-', _inbHistDateTime(d.soldAt, 'full'), saleStatus, d.payMethod || '', '', 1)
    // 이 판매의 모든 취소 회차(음수, 판매번호 동일 → 그룹핑). 부분취소=여러 음수 행.
    ;(agg.docs || []).slice().sort((a, b) => String(a.voidedAt || '').localeCompare(String(b.voidedAt || ''))).forEach(v => {
      pushDoc(v, d.saleNo || '-', _inbHistDateTime(v.voidedAt, 'full'), '취소', '-', v.voidReason || '', -1)
    })
  })
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 20 }, { wch: 17 }, { wch: 10 }, { wch: 6 }, { wch: 9 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 7 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 22 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '매출내역')
  let fname
  if (_shCtx.mode === 'phone') fname = '매출내역_번호검색_' + (_shCtx.phone || '') + '.xlsx'
  else fname = '매출내역_' + (_storeNameById(_shCtx.store) || _shCtx.store || '매장') + '_' + (_shCtx.start || '') + '~' + (_shCtx.end || '') + '.xlsx'
  XLSX.writeFile(wb, fname)
}

window.renderSalesHistoryPanel = renderSalesHistoryPanel
window._shSetMode = _shSetMode
window._shLoad = _shLoad
window._shPhoneSearch = _shPhoneSearch
window._shApplyFilters = _shApplyFilters
window.openSaleReceipt = openSaleReceipt
window.closeSaleReceipt = closeSaleReceipt
window.requestSaleVoid = requestSaleVoid
window.closeSaleVoidModal = closeSaleVoidModal
window.confirmSaleVoid = confirmSaleVoid
window.onSvQtyInput = onSvQtyInput
window.svVoidAll = svVoidAll
window.onSvBundleToggle = onSvBundleToggle
window.downloadSalesHistory = downloadSalesHistory

// =============================================
// ===== 재고수정 / 실사 조정 (POS Phase 6a) — 이동 원장 앵커 =====
// =============================================
// 품번 조회 기반(바코드 아님) · 전 사이즈 조정 가능(실사) · ±증감 · 상쇄 세션 허용 · 사유 필수.
// 각 라인 = storeInbound 이동 원장 doc { moveType:'adjust', stockDelta:±N, ... } (기존 입고 doc 은 moveType 없음 → 레거시=inbound).
// 🔴 원자 단일 배치(상쇄 세션은 절대 부분반영 금지·청크 금지), double-confirm 가드, 프리플라이트, 사유 필수(클라).
// exactly-once: 이동 doc id = {adjNo}_{seq} 결정적 → 재시도 시 기존 doc set=update 평가 → storeInbound update 규칙(취소 5필드만) 거부
//   → 배치 전체 거부 → 재차감/재증가 불가. adjNo 는 pendingAdjNo 로 draft 에 동결(재시도 멱등, 3c pendingSaleNo 미러).

let _adjStore = ''
let _adjList = []            // [{ code, size, delta(±≠0), location }]
let _adjInFlight = false
let _pendingAdjNo = ''       // 이 세션의 결정적 조정번호(ADJ-…) — 첫 확정 1회 생성·draft 영속, 성공 시 소거
let _adjLookupCode = ''
let _adjBannerTimer = null

// 조정번호 = ADJ-YYYYMMDD-HHMMSS-<8자 접미사>(generateSaleNo 와 동일 강도 — 동일-초 다중단말 충돌 방지, 세션 유일)
function generateAdjNo() { return 'ADJ-' + kstStamp() + '-' + _saleNoSuffix() }

function _adjFocusSearch() { const el = document.getElementById('adjSearch'); if (el) { el.focus(); if (el.select) el.select() } }
function _adjShowBanner(msg) {
  const b = document.getElementById('adjBanner')
  if (!b) { showToast(msg, 'warning'); return }
  b.innerHTML = `<div class="inb-banner-inner"><div class="inb-banner-icon">🚫</div><div class="inb-banner-msg">${esc(msg)}</div></div>`
  b.classList.add('inb-banner-show')
  if (_adjBannerTimer) clearTimeout(_adjBannerTimer)
  _adjBannerTimer = setTimeout(() => { b.classList.remove('inb-banner-show'); b.innerHTML = '' }, 2500)
}

// ── draft (매장별) ── {v:1, items:[…], pendingAdjNo}
function _adjDraftKey(store) { return 'lemango_adjust_draft_' + (store || _adjStore || '') }
function _adjSaveDraft() {
  if (!_adjStore) return
  try { localStorage.setItem(_adjDraftKey(_adjStore), JSON.stringify({ v: 1, items: _adjList, pendingAdjNo: _pendingAdjNo || '' })) }
  catch (e) { console.warn('재고수정 draft 저장 실패:', e && e.message) }
}
function _adjLoadDraft(store) {
  const EMPTY = { items: [], pendingAdjNo: '' }
  let raw = null
  try { raw = localStorage.getItem(_adjDraftKey(store)) } catch (e) { return EMPTY }
  if (!raw) return EMPTY
  try {
    const o = JSON.parse(raw)
    if (!o || o.v !== 1) return EMPTY
    const items = Array.isArray(o.items) ? o.items.filter(l => l && l.code && l.size).map(l => ({
      code: String(l.code), size: String(l.size),
      delta: Math.trunc(Number(l.delta) || 0),
      location: String(l.location || ''),
      op: (l.op === 'defect-in' || l.op === 'defect-out') ? l.op : 'adjust'   // 6c: 전환 유형 복원(레거시 draft=재고조정)
    })).filter(l => l.delta !== 0) : []
    return { items, pendingAdjNo: String(o.pendingAdjNo || '') }
  } catch (e) {
    console.warn('재고수정 draft 파싱 실패 — 초기화:', e && e.message)
    try { localStorage.removeItem(_adjDraftKey(store)) } catch (e2) {}
    return EMPTY
  }
}

// ── 창 열기/닫기 (명시적 닫기 전용 — ESC/백드롭 없음, main.js 등록) ──
function openAdjustModal() {
  const store = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
  if (!store) { showToast('배정된 매장이 없습니다 — 재고수정 불가', 'warning'); return }
  const modal = document.getElementById('adjustModal')
  if (!modal) return
  modal.showModal()
  if (typeof centerModal === 'function') centerModal(modal)
  renderAdjustScreen()
}
function closeAdjustModal() {
  if (_adjList && _adjList.length) { _openAdjCloseConfirm(); return }
  _doCloseAdj(false)
}
function _doCloseAdj(clearDraft) {
  if (clearDraft) {
    _adjList = []; _pendingAdjNo = ''
    try { localStorage.removeItem(_adjDraftKey(_adjStore)) } catch (e) {}
    _adjRenderList()
  }
  const modal = document.getElementById('adjustModal'); if (modal) modal.close()
  if (!clearDraft && _adjList && _adjList.length) showToast('재고수정 리스트가 임시저장되어 있습니다', '')
  if (typeof renderStoreStockView === 'function') renderStoreStockView()
}
function _openAdjCloseConfirm() {
  const m = document.getElementById('adjCloseConfirmModal')
  if (!m) { _doCloseAdj(false); return }
  const cnt = document.getElementById('adjCloseConfirmCount'); if (cnt) cnt.textContent = String(_adjList.length)
  m.showModal(); if (typeof centerModal === 'function') centerModal(m)
  const c = document.getElementById('adjCloseCancelBtn'); if (c) setTimeout(() => c.focus(), 30)
}
function _closeAdjCloseConfirm() { const m = document.getElementById('adjCloseConfirmModal'); if (m) m.close() }
function adjCloseKeep() { _closeAdjCloseConfirm(); _doCloseAdj(false) }
function adjCloseDiscard() { _closeAdjCloseConfirm(); _doCloseAdj(true) }
function adjCloseCancelChoice() { _closeAdjCloseConfirm(); _adjFocusSearch() }

// ── 화면 렌더 (게이트 + draft) ──
function renderAdjustScreen() {
  const gate = document.getElementById('adjGate'), screen = document.getElementById('adjScreen')
  if (!gate || !screen) return
  const store = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
  if (!store) {
    _adjStore = ''; _adjList = []
    screen.classList.add('inb-hidden'); gate.classList.remove('inb-hidden')
    gate.innerHTML = `<div class="store-placeholder"><div class="store-placeholder-icon">🚫</div><div class="store-placeholder-title">재고수정 불가</div><div class="store-placeholder-desc">배정된 매장이 없습니다 — 관리자에게 문의하세요.</div></div>`
    return
  }
  gate.classList.add('inb-hidden'); gate.innerHTML = ''
  screen.classList.remove('inb-hidden')
  _adjStore = store
  const draft = _adjLoadDraft(store)
  _adjList = draft.items
  _pendingAdjNo = draft.pendingAdjNo || ''
  _adjLookupCode = ''
  if (typeof buildStoreStockIndex === 'function') buildStoreStockIndex(store).then(() => { if (_adjStore === store) { _adjHideSizes(); _adjRenderList() } }).catch(() => {})
  const lbl = document.getElementById('adjStoreLabel'); if (lbl) lbl.textContent = _storeNameById(store)
  const s = document.getElementById('adjSearch'); if (s) s.value = ''
  _adjHideResults(); _adjHideSizes(); _adjRenderList()
  _adjFocusSearch()
}

// ── 품번 조회 (전 상품 · 바코드 무관 — 실사는 모든 재고 대상) ──
function _adjHideResults() { const r = document.getElementById('adjLookupResults'); if (r) r.innerHTML = '' }
function _adjHideSizes() { _adjLookupCode = ''; const z = document.getElementById('adjSizePicker'); if (z) { z.classList.add('inb-hidden'); z.innerHTML = '' } }
function renderAdjLookup() {
  const out = document.getElementById('adjLookupResults'); if (!out) return
  _adjHideSizes()
  const q = String((document.getElementById('adjSearch') || {}).value || '').trim().toLowerCase()
  if (!q) { out.innerHTML = '<div class="inb-lookup-hint">품번 또는 상품명을 입력하세요</div>'; return }
  const list = (State.allProducts || []).filter(p => {
    if (!p || p.deleted) return false   // 실사는 바코드 필터 없음(전 사이즈 대상), soft-deleted 만 제외
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
    return `<div class="inb-lookup-row" onclick="selectAdjLookupProduct('${esc(p.productCode)}')">${thumb}<span class="inb-lookup-code">${esc(p.productCode)}</span><span class="inb-lookup-name">${name}</span></div>`
  }).join('') + more
}
// 상품 선택 → 전 7 사이즈 버튼(현재 재고 힌트). ⚠️ 입고와 달리 바코드 없는 사이즈도 전부 표시(실사).
function selectAdjLookupProduct(code) {
  _adjLookupCode = code
  const z = document.getElementById('adjSizePicker'); if (!z) return
  const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null
  const name = p ? esc(p.nameKr || p.nameEn || '') : ''
  const stockMap = (typeof getStoreStock === 'function') ? getStoreStock(_adjStore, code) : {}
  const btns = SIZES.map(sz => {
    const st = Number(stockMap[sz] || 0)
    return `<button class="inb-size-btn${st < 0 ? ' inb-size-btn-neg' : ''}" onclick="chooseAdjSize('${esc(sz)}')"><span class="inb-size-lbl">${esc(sz)}</span><span class="inb-size-stock">재고 ${st}</span></button>`
  }).join('')
  z.innerHTML = `<div class="inb-lookup-sizes-head">${esc(code)} <span class="inb-lookup-sizes-name">${name}</span> — 조정할 사이즈 선택 (전 사이즈)</div><div class="inb-size-grid">${btns}</div>`
  z.classList.remove('inb-hidden')
}
// 사이즈 선택 → 라인 추가/포커스 (기본 +1)
function chooseAdjSize(size) {
  const code = _adjLookupCode
  if (!code || !size) return
  _adjBeginLine(code, size)
}
function _adjBeginLine(code, size) {
  if (!_adjStore || !code || !size) return
  const idx = _adjList.findIndex(l => l.code === code && l.size === size)
  if (idx >= 0) {
    // 이미 있는 라인 → 델타 +1 (재선택 편의). 0 이 되면 아래 렌더에서 처리
    _adjList[idx].delta = Math.trunc(Number(_adjList[idx].delta) || 0) + 1
    if (_adjList[idx].delta === 0) _adjList[idx].delta = 1   // 0 회피(재선택 의도=증가)
  } else {
    const loc = (typeof getStoreStockLocation === 'function') ? getStoreStockLocation(_adjStore, code, size) : ''
    _adjList.push({ code, size, delta: 1, location: loc || '', op: 'adjust' })   // 6c: op 기본 재고조정
  }
  _adjSaveDraft()
  _adjRenderList()
  showToast(code + ' ' + size + ' 추가 — 유형/증감을 조정하세요', '')
}

// 6c: 라인 op → {stockDelta, defectDelta, qty, moveType}. op='adjust'=기존(6a) 동작(defectDelta 0). 전환=듀얼 델타.
//   adjust: delta 부호 그대로 · defect-in(정상→불량): sizes-N/defect+N · defect-out(불량→정상): sizes+N/defect-N (N=|delta|)
function _adjLineDeltas(l) {
  const op = (l && l.op) || 'adjust'
  const raw = Math.trunc(Number(l && l.delta) || 0)
  if (op === 'defect-in') { const n = Math.abs(raw); return { stockDelta: -n, defectDelta: n, qty: n, moveType: 'defect-in' } }
  if (op === 'defect-out') { const n = Math.abs(raw); return { stockDelta: n, defectDelta: -n, qty: n, moveType: 'defect-out' } }
  return { stockDelta: raw, defectDelta: 0, qty: Math.abs(raw), moveType: 'adjust' }
}
const ADJ_OPS = [['adjust', '재고조정(±)'], ['defect-in', '정상→불량'], ['defect-out', '불량→정상']]

// ── 스테이징 리스트 렌더 ──
function _adjRenderList() {
  const body = document.getElementById('adjListBody'), countEl = document.getElementById('adjListCount')
  if (countEl) countEl.textContent = String(_adjList.length)
  if (!body) { _adjUpdateTotals(); return }
  if (!_adjList.length) { body.innerHTML = '<tr><td colspan="9" class="inbhist-empty">품번을 조회해 조정할 사이즈를 추가하세요</td></tr>'; _adjUpdateTotals(); return }
  body.innerHTML = _adjList.map((l, i) => {
    const op = l.op || 'adjust'
    const cur = (typeof getStoreStock === 'function') ? Number(getStoreStock(_adjStore, l.code)[l.size] || 0) : 0
    const curDef = (typeof getStoreDefect === 'function') ? Number(getStoreDefect(_adjStore, l.code)[l.size] || 0) : 0
    const dd = _adjLineDeltas(l)
    const delta = Math.trunc(Number(l.delta) || 0)
    const afterS = cur + dd.stockDelta
    const afterD = curDef + dd.defectDelta
    const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(l.code) : null
    const nm = p ? (p.nameKr || p.nameEn || '') : ''
    const locBlank = !String(l.location || '').trim()
    const warnLoc = op === 'adjust' && delta > 0 && locBlank   // Q4: +조정 & 로케이션 없음 → 경고(전환은 위치 무관)
    const isDefect = op !== 'adjust'
    const rowNeg = afterS < 0 || afterD < 0
    const opSel = `<select class="adj-op-select" data-i="${i}" onchange="onAdjOp(${i}, this)">${ADJ_OPS.map(o => `<option value="${o[0]}"${op === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`
    // 반영후: 정상 X (+ 불량 Y 전환 시)
    const afterCell = isDefect
      ? `정상 <strong class="${afterS < 0 ? 'ssv-neg' : ''}">${afterS}</strong> · 불량 <strong class="${afterD < 0 ? 'ssv-neg' : 'spd-defect-has'}">${afterD}</strong>`
      : `<strong class="${afterS < 0 ? 'ssv-neg' : ''}">${afterS}</strong>`
    return `<tr${rowNeg ? ' class="adj-row-neg"' : ''}>
      <td><span class="code-link" onclick="openStoreProductDetail('${esc(l.code)}','${esc(_adjStore)}')">${esc(l.code)}</span>${nm ? `<div class="sale-line-name">${esc(nm)}</div>` : ''}</td>
      <td class="inb-c">${esc(l.size)}</td>
      <td>${opSel}</td>
      <td style="text-align:right">${cur}</td>
      <td style="text-align:right" class="${curDef ? 'spd-defect-has' : ''}">${curDef}</td>
      <td><input type="number" class="adj-delta-input" step="1"${isDefect ? ' min="1"' : ''} value="${delta}" data-i="${i}" onchange="onAdjDelta(${i}, this)"></td>
      <td style="text-align:right;font-weight:700">${afterCell}</td>
      <td><input type="text" class="adj-loc-input${warnLoc ? ' adj-loc-warn' : ''}"${isDefect ? ' disabled title="전환은 로케이션을 바꾸지 않습니다"' : ''} value="${esc(l.location || '')}" placeholder="${warnLoc ? '⚠ 위치 없음(+조정)' : '로케이션'}" data-i="${i}" onchange="onAdjLoc(${i}, this)"></td>
      <td class="inb-c"><button class="inb-del-btn" onclick="removeAdjRow(${i})">삭제</button></td>
    </tr>`
  }).join('')
  _adjUpdateTotals()
}
function _adjUpdateTotals() {
  let inc = 0, dec = 0, defInc = 0, defDec = 0
  _adjList.forEach(l => {
    const dd = _adjLineDeltas(l)
    if (dd.stockDelta > 0) inc += dd.stockDelta; else dec += dd.stockDelta
    if (dd.defectDelta > 0) defInc += dd.defectDelta; else defDec += dd.defectDelta
  })
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v }
  set('adjTotalInc', '+' + inc); set('adjTotalDec', String(dec))
}
// 6c: op 변경 → 전환 유형으로 바꾸면 수량을 양수 크기로 정규화(부호 혼동 방지)
function onAdjOp(i, el) {
  if (i < 0 || i >= _adjList.length) return
  const op = el.value
  _adjList[i].op = (op === 'defect-in' || op === 'defect-out') ? op : 'adjust'
  if (_adjList[i].op !== 'adjust') {
    const n = Math.abs(Math.trunc(Number(_adjList[i].delta) || 0)) || 1   // 전환은 양수 크기
    _adjList[i].delta = n
  }
  _adjSaveDraft(); _adjRenderList()
}
// 증감/수량 인라인 편집 (재고조정=정수≠0, 0→삭제 · 전환=양수 크기≥1)
function onAdjDelta(i, el) {
  if (i < 0 || i >= _adjList.length) return
  const isDefect = (_adjList[i].op === 'defect-in' || _adjList[i].op === 'defect-out')
  const s = String(el.value || '').trim()
  const n = /^-?\d+$/.test(s) ? parseInt(s, 10) : NaN
  if (isNaN(n)) { el.value = String(_adjList[i].delta); showToast('정수만 가능합니다', 'warning'); return }
  if (isDefect) {
    const mag = Math.abs(n)
    if (mag === 0) { _adjList.splice(i, 1); _adjSaveDraft(); _adjRenderList(); showToast('수량 0 — 라인을 제거했습니다', ''); return }
    _adjList[i].delta = mag
  } else {
    if (n === 0) { _adjList.splice(i, 1); _adjSaveDraft(); _adjRenderList(); showToast('증감 0 — 라인을 제거했습니다', ''); return }
    _adjList[i].delta = n
  }
  _adjSaveDraft(); _adjRenderList()
}
function onAdjLoc(i, el) {
  if (i < 0 || i >= _adjList.length) return
  const loc = (typeof normalizeLocation === 'function') ? normalizeLocation(el.value) : String(el.value || '').trim()
  _adjList[i].location = loc
  _adjSaveDraft(); _adjRenderList()
}
function removeAdjRow(i) {
  if (i < 0 || i >= _adjList.length) return
  _adjList.splice(i, 1); _adjSaveDraft(); _adjRenderList(); _adjFocusSearch()
}

// ── 확정 (검증 → Q4 경고 → 사유 다이얼로그) ──
function _adjSetBusy(busy) {
  const btn = document.getElementById('adjConfirmBtn')
  if (!btn) return
  btn.disabled = !!busy
  if (busy) { if (btn.dataset.orig == null) btn.dataset.orig = btn.innerHTML; btn.textContent = '반영 중…' }
  else if (btn.dataset.orig != null) { btn.innerHTML = btn.dataset.orig; delete btn.dataset.orig }
}
function _adjValidate() {
  if (!_adjList.length) return { ok: false, msg: '조정할 항목이 없습니다' }
  const store = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
  if (!store) return { ok: false, msg: '배정된 매장이 없습니다 — 재고수정 불가' }
  for (let i = 0; i < _adjList.length; i++) {
    const l = _adjList[i]
    const d = Math.trunc(Number(l.delta) || 0)
    if (!l.code || !l.size) return { ok: false, msg: (i + 1) + '번 항목 오류: 품번/사이즈 누락' }
    if (!(Number.isInteger(d) && d !== 0)) return { ok: false, msg: l.code + ' ' + l.size + ': 증감 오류(0 아닌 정수)' }
  }
  // op 수 = distinct codes + lines. 450 초과 → 청크 금지(상쇄 부분반영 방지) → 차단.
  const codes = new Set(_adjList.map(l => l.code))
  if (codes.size + _adjList.length > 450) return { ok: false, msg: '항목이 너무 많습니다 — 세션을 나눠 진행하세요' }
  return { ok: true, store }
}
async function adjFinalConfirm() {
  if (_adjInFlight) return
  const v = _adjValidate()
  if (!v.ok) { _adjShowBanner(v.msg); return }
  // Q4: +조정 & 로케이션 없음 라인 경고(진행 허용 — 차단 아님). 전환(defect)은 로케이션 무관 → 제외. korConfirm 은 Promise<boolean>.
  const noLoc = _adjList.filter(l => (l.op || 'adjust') === 'adjust' && Math.trunc(Number(l.delta) || 0) > 0 && !String(l.location || '').trim())
  if (noLoc.length && typeof korConfirm === 'function') {
    const ok = await korConfirm('로케이션이 없는 +조정 ' + noLoc.length + '건이 있습니다.\n위치 없이 그대로 진행할까요? (취소 후 로케이션을 입력할 수 있습니다)', '진행', '취소')
    if (!ok) { _adjFocusSearch(); return }
  }
  _openAdjConfirmDialog(v.store)
}
// 사유 입력 다이얼로그
function _openAdjConfirmDialog(store) {
  const modal = document.getElementById('adjConfirmModal')
  if (!modal) { adjConfirmProceed(); return }
  if (modal.open) return
  let inc = 0, dec = 0, neg = 0, defMoves = 0
  _adjList.forEach(l => {
    const dd = _adjLineDeltas(l)
    if (dd.stockDelta > 0) inc += dd.stockDelta; else dec += dd.stockDelta
    if (dd.moveType !== 'adjust') defMoves++
    const cur = (typeof getStoreStock === 'function') ? Number(getStoreStock(store, l.code)[l.size] || 0) : 0
    const curDef = (typeof getStoreDefect === 'function') ? Number(getStoreDefect(store, l.code)[l.size] || 0) : 0
    if (cur + dd.stockDelta < 0 || curDef + dd.defectDelta < 0) neg++   // 6c: 두 버킷 중 하나라도 음수면 경고
  })
  const sumEl = document.getElementById('adjConfirmSummary')
  if (sumEl) sumEl.innerHTML = `<div class="svoid-amt">${_adjList.length}건 · 정상재고 증가 <strong>+${inc}</strong> · 감소 <strong>${dec}</strong>${defMoves ? ` · 불량전환 <strong>${defMoves}</strong>건` : ''}</div>` +
    (neg ? `<div class="adj-confirm-neg">⚠ 반영 후 음수(정상/불량) ${neg}건 (경고만 — 진행됩니다)</div>` : '')
  const reasonEl = document.getElementById('adjReason'); if (reasonEl) reasonEl.value = ''
  const memoEl = document.getElementById('adjMemo'); if (memoEl) memoEl.value = ''
  modal.showModal(); if (typeof centerModal === 'function') centerModal(modal)
  setTimeout(() => { const r = document.getElementById('adjReason'); if (r) r.focus() }, 40)
}
function closeAdjConfirmDialog() { const m = document.getElementById('adjConfirmModal'); if (m && m.open) m.close(); _adjFocusSearch() }

// storeInbound 이동 doc 서버 read (프리플라이트/착지 판별)
function _adjReadDoc(id, timeoutMs) {
  return new Promise(resolve => {
    let done = false
    const fin = r => { if (done) return; done = true; clearTimeout(t); resolve(r) }
    const t = setTimeout(() => fin({ ok: false, exists: false, timeout: true }), timeoutMs || 5000)
    try {
      db.collection('storeInbound').doc(id).get({ source: 'server' })
        .then(s => fin({ ok: true, exists: !!(s && s.exists) }))
        .catch(e => fin({ ok: false, exists: false, error: e }))
    } catch (e) { fin({ ok: false, exists: false, error: e }) }
  })
}
function _adjSuccessCleanup(store, adjNo, count, already) {
  _adjList = []; _pendingAdjNo = ''
  try { localStorage.removeItem(_adjDraftKey(store)) } catch (e) {}
  _adjHideSizes()
  const s = document.getElementById('adjSearch'); if (s) s.value = ''
  _adjHideResults(); _adjRenderList()
  Promise.resolve().then(() => { if (typeof buildStoreStockIndex === 'function') return buildStoreStockIndex(store) })
    .then(() => { if (typeof renderStoreStockView === 'function') renderStoreStockView() }).catch(() => {})
  if (already) showToast('이미 반영된 재고수정입니다 (' + adjNo + ')', 'warning')
  else showToast('재고수정 완료 · ' + adjNo + ' · ' + count + '건', 'success')
  _adjFocusSearch()
}
// 실제 확정 — 프리플라이트 → 가드 → 단일 원자 배치(storeStock ± + 이동 doc 결정적 id) → 성공/모호/거부
async function adjConfirmProceed() {
  closeAdjConfirmDialog()
  if (_adjInFlight) return
  const v = _adjValidate()
  if (!v.ok) { _adjShowBanner(v.msg); return }
  const store = v.store
  const reasonEl = document.getElementById('adjReason')
  const reason = reasonEl ? String(reasonEl.value || '').trim() : ''
  if (!reason) { showToast('조정 사유를 입력하세요', 'warning'); if (reasonEl) reasonEl.focus(); _openAdjConfirmDialog(store); return }
  const memo = String((document.getElementById('adjMemo') || {}).value || '').trim()
  if (!db) { _adjShowBanner('서버 연결 없음 — 잠시 후 다시 시도하세요'); return }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { _adjShowBanner('오프라인 상태 — 연결 확인 후 확정하세요'); return }
  try {
    _adjInFlight = true
    _adjSetBusy(true)
    if (!_pendingAdjNo) { _pendingAdjNo = generateAdjNo(); _adjSaveDraft() }
    const adjNo = _pendingAdjNo
    const firstId = adjNo + '_0001'
    // 프리플라이트 + 착지 감지 (서버 read)
    const pre = await _adjReadDoc(firstId, 5000)
    if (!pre.ok) { _adjShowBanner('오프라인 상태 — 연결 확인 후 확정하세요'); return }
    if (pre.exists) { _adjSuccessCleanup(store, adjNo, _adjList.length, true); return }   // 이전 시도 착지 → 성공 처리(재반영 없음)

    const uid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : ''
    const workerName = (typeof formatUserName === 'function')
      ? formatUserName(_currentUserName, (typeof _currentUserPosition !== 'undefined' ? _currentUserPosition : ''))
      : ((typeof _currentUserName !== 'undefined' && _currentUserName) || '')
    const nowIso = new Date().toISOString()
    const dateKey = kstDateKey()
    const batchId = dateKey + '_' + (uid || 'x') + '_' + Date.now()
    const lines = _adjList.slice()

    // 코드별 그룹: sizes/defectSizes 합산 증감(increment) + sizeLocations(재고조정·편집·비공란만 overwrite)
    // 6c: 전환(defect-in/out)은 sizes−/defect+ 또는 sizes+/defect− 두 버킷 동시 increment (같은 doc merge-set 원자).
    const byCode = {}
    lines.forEach(l => {
      const dd = _adjLineDeltas(l)
      const c = byCode[l.code] || (byCode[l.code] = { sizes: {}, defects: {}, locs: {} })
      if (dd.stockDelta) c.sizes[l.size] = (c.sizes[l.size] || 0) + dd.stockDelta
      if (dd.defectDelta) c.defects[l.size] = (c.defects[l.size] || 0) + dd.defectDelta
      if ((l.op || 'adjust') === 'adjust') {   // 전환은 로케이션 안 건드림
        const loc = (typeof normalizeLocation === 'function') ? normalizeLocation(l.location) : String(l.location || '').trim()
        if (loc) c.locs[l.size] = loc   // 비공란만 (공란은 sizeLocations 안 건드림)
      }
    })

    const batch = db.batch()
    Object.keys(byCode).forEach(code => {
      const c = byCode[code]
      const doc = { storeId: store, productCode: code, updatedAt: nowIso }
      if (Object.keys(c.sizes).length) { const m = {}; Object.keys(c.sizes).forEach(sz => { m[sz] = firebase.firestore.FieldValue.increment(c.sizes[sz]) }); doc.sizes = m }
      if (Object.keys(c.defects).length) { const m = {}; Object.keys(c.defects).forEach(sz => { m[sz] = firebase.firestore.FieldValue.increment(c.defects[sz]) }); doc.defectSizes = m }
      if (Object.keys(c.locs).length) doc.sizeLocations = c.locs   // 편집된 위치만
      batch.set(db.collection('storeStock').doc(storeStockDocId(store, code)), doc, { merge: true })
    })
    // 이동 원장 doc — 라인당 1, 결정적 id {adjNo}_{seq}. set(merge 아님)=create; 재시도 시 update 평가 → 규칙 거부.
    // 6c: 전환 라인은 moveType='defect-in'/'defect-out' + 양쪽 델타. 재고조정=기존(6a) 그대로(stockDelta 부호, defectDelta 0).
    lines.forEach((l, i) => {
      const seq = String(i + 1).padStart(4, '0')
      const dd = _adjLineDeltas(l)
      batch.set(db.collection('storeInbound').doc(adjNo + '_' + seq), {
        storeId: store, productCode: l.code, size: l.size,
        moveType: dd.moveType, qty: dd.qty, stockDelta: dd.stockDelta, defectDelta: dd.defectDelta,
        location: (typeof normalizeLocation === 'function') ? normalizeLocation(l.location) : String(l.location || '').trim(),
        inboundNo: adjNo, inboundType: '재고수정', reason: reason, memo: memo,
        workerUid: uid, workerName: workerName, confirmedAt: nowIso, dateKey: dateKey, batchId: batchId
      })
    })

    const res = await _saleCommitWithTimeout(batch, 15000)
    if (res.ok) {
      if (typeof logActivity === 'function') logActivity('adjust', '재고수정', _storeNameById(store) + '(' + store + '): ' + adjNo + ' · ' + lines.length + '건 · 사유: ' + reason)
      _adjSuccessCleanup(store, adjNo, lines.length, false)
      return
    }
    if (res.timeout) { _adjShowBanner('네트워크 불안정 — 반영 여부 확인 중입니다. 다시 [최종 확정]을 누르면 안전하게 재시도됩니다'); return }
    const err = res.error
    const denied = err && (err.code === 'permission-denied' || err.code === 7 || /permission/i.test(String(err.message || '')))
    if (denied) {
      const re = await _adjReadDoc(firstId, 5000)   // 이미 착지 vs 진짜 권한
      if (re.ok && re.exists) { _adjSuccessCleanup(store, adjNo, lines.length, true); return }
      _adjShowBanner('권한 오류로 반영되지 않았습니다 — 매장/권한을 확인하세요' + (err && err.message ? ' (' + err.message + ')' : ''))
      return
    }
    _adjShowBanner('반영 실패 — 다시 시도하세요' + (err && err.message ? ' (' + err.message + ')' : ''))
  } catch (e) {
    console.error('adjConfirmProceed 예외:', e && e.message)
    _adjShowBanner('반영 실패 — 다시 시도하세요' + (e && e.message ? ' (' + e.message + ')' : ''))
  } finally {
    _adjInFlight = false
    _adjSetBusy(false)
  }
}

window.openAdjustModal = openAdjustModal
window.closeAdjustModal = closeAdjustModal
window.renderAdjustScreen = renderAdjustScreen
window.renderAdjLookup = renderAdjLookup
window.selectAdjLookupProduct = selectAdjLookupProduct
window.chooseAdjSize = chooseAdjSize
window.onAdjDelta = onAdjDelta
window.onAdjLoc = onAdjLoc
window.onAdjOp = onAdjOp   // 6c: 재고수정 라인 op(재고조정/정상↔불량) 전환
window.removeAdjRow = removeAdjRow
window.adjFinalConfirm = adjFinalConfirm
window.adjConfirmProceed = adjConfirmProceed
window.closeAdjConfirmDialog = closeAdjConfirmDialog
window.adjCloseKeep = adjCloseKeep
window.adjCloseDiscard = adjCloseDiscard
window.adjCloseCancelChoice = adjCloseCancelChoice
window.generateAdjNo = generateAdjNo

// ═══════════════════════════════════════════════════════════════
// ===== POS Phase 6d — 품목 이동 원장(Unified Ledger) + 기준재고(baseline) + 대조(reconciliation) =====
// ═══════════════════════════════════════════════════════════════
// 조회=전 직원. 품번+기간별 전 이동 통합 타임라인:
//   이동(입고/반출/조정/불량/기준) = storeInbound (storeId,productCode,dateKey) 인덱스[6a] — 품번당 저렴
//   판매/취소 = storeSales (storeId,dateKey)[3a] 기간 스캔 + 클라 라인 필터(embedded lines → 품번 쿼리 불가, 설계 Q5 MVP)
//   → 병합·시각 ASC 정렬 · 누계(기준 이후 절대치) · 장부↔실재고 대조(기준 있을 때만, 정직 — 없으면 '대조 불가').
// baseline(관리자) = SET origin movement(moveType:'baseline', stockDelta=현재 정상, defectDelta=현재 불량). now(KST).
//   재실행=새 BASE 번호로 대체(대조=사이즈별 '최신' 기준만 사용 → 이중계상 없음). 청크 안전(SET origin, 상쇄 세션 아님).
//   ⚠️ 신규 인덱스/규칙 불요(6a·3a 인덱스 재사용, storeInbound create 규칙 field-agnostic).

let _ldgStore = ''
let _ldgCode = ''
let _ldgRows = []
let _ldgRecon = {}
let _ldgCtx = { store: '', code: '', start: '', end: '' }
let _ldgBaselineInFlight = false
let _baselineTargetStore = ''

function _ldgTypeLabel(mt) {
  switch (mt) {
    case 'sale': return '판매'
    case 'void': return '판매취소'
    case 'outbound': return '반출'
    case 'defect-outbound': return '불량반출'
    case 'defect-in': return '정상→불량'
    case 'defect-out': return '불량→정상'
    case 'adjust': return '재고수정'
    case 'baseline': return '기준'
    default: return ''   // inbound/레거시 → inboundType 라벨을 행에서 사용
  }
}

// KST dateKey ± days (문자열 YYYY-MM-DD 산술, UTC 자정 기준 — 표시 무관 안전)
function _ldgAddDays(dateKey, days) {
  const p = String(dateKey || '').split('-')
  if (p.length !== 3) return dateKey
  const d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])))
  d.setUTCDate(d.getUTCDate() + Number(days || 0))
  const pad = n => String(n).padStart(2, '0')
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
}

// 품번 선택 UI
function _ledgerRenderPick() {
  const out = document.getElementById('ledgerPick'); if (!out) return
  const q = String((document.getElementById('ledgerSearch') || {}).value || '').trim().toLowerCase()
  if (!q) { out.classList.add('inb-hidden'); out.innerHTML = ''; return }
  const list = (State.allProducts || []).filter(p => {
    if (!p) return false
    const c = (p.productCode || '').toLowerCase(), nk = (p.nameKr || '').toLowerCase(), ne = (p.nameEn || '').toLowerCase()
    return c.indexOf(q) >= 0 || nk.indexOf(q) >= 0 || ne.indexOf(q) >= 0
  }).slice(0, 40)
  out.classList.remove('inb-hidden')
  out.innerHTML = list.length
    ? list.map(p => `<div class="ledger-pick-row" onclick="selectLedgerProduct('${esc(p.productCode)}')">${esc(p.productCode)} <span class="ledger-pick-name">${esc(p.nameKr || p.nameEn || '')}</span></div>`).join('')
    : '<div class="inb-lookup-hint">검색 결과 없음</div>'
}
function selectLedgerProduct(code) {
  _ldgCode = code
  const s = document.getElementById('ledgerSearch'); if (s) s.value = code
  const pick = document.getElementById('ledgerPick'); if (pick) { pick.classList.add('inb-hidden'); pick.innerHTML = '' }
  _ledgerReload()
}

async function openLedger(code, storeId) {
  const modal = document.getElementById('ledgerModal'); if (!modal) return
  const active = (typeof getActiveStores === 'function') ? getActiveStores() : []
  const store = storeId || (typeof resolveActiveStore === 'function' ? (resolveActiveStore() || (active[0] && active[0].id) || '') : '') || _ssvStore || ''
  _ldgStore = store; _ldgCode = code || ''
  const sel = document.getElementById('ledgerStore')
  if (sel) sel.innerHTML = active.length ? active.map(s => `<option value="${esc(s.id)}"${s.id === store ? ' selected' : ''}>${esc(s.name)}</option>`).join('') : '<option value="">(활성 매장 없음)</option>'
  const searchEl = document.getElementById('ledgerSearch'); if (searchEl) searchEl.value = code || ''
  const pick = document.getElementById('ledgerPick'); if (pick) { pick.classList.add('inb-hidden'); pick.innerHTML = '' }
  const today = kstDateKey()
  let start = _ldgAddDays(today, -30)
  if (code && store) { try { const bk = await _ledgerFindBaselineDateKey(store, code); if (bk) start = bk } catch (e) {} }
  const startEl = document.getElementById('ledgerStart'); if (startEl) startEl.value = start
  const endEl = document.getElementById('ledgerEnd'); if (endEl) endEl.value = today
  modal.showModal(); if (typeof centerModal === 'function') centerModal(modal)
  if (code) _ledgerReload()
  else {
    const b = document.getElementById('ledgerBody'); if (b) b.innerHTML = '<tr><td colspan="9" class="inbhist-empty">품번을 검색·선택하세요</td></tr>'
    const r = document.getElementById('ledgerRecon'); if (r) r.innerHTML = ''
    const t = document.getElementById('ledgerTitleCode'); if (t) t.textContent = ''
  }
}
function closeLedger() { const m = document.getElementById('ledgerModal'); if (m) m.close() }

// 최신 baseline dateKey (품번 전기간 이동 쿼리 — 품번 인덱스라 저렴). 없으면 ''.
async function _ledgerFindBaselineDateKey(store, code) {
  if (!db || !store || !code) return ''
  const q = db.collection('storeInbound').where('storeId', '==', store).where('productCode', '==', code).where('dateKey', '>=', '2000-01-01').where('dateKey', '<=', kstDateKey())
  let snap = null
  try { snap = await q.get({ source: 'server' }) } catch (e) { try { snap = await q.get() } catch (e2) { return '' } }
  let latest = ''
  snap.forEach(d => { const x = d.data() || {}; if (x.moveType === 'baseline') { const t = String(x.confirmedAt || ''); if (t > latest) latest = t } })
  return latest ? kstDateKey(latest) : ''
}

function _ledgerSetBaseRange() {
  if (!_ldgStore || !_ldgCode) { showToast('먼저 품번을 선택하세요', 'warning'); return }
  ;(async () => {
    const bk = await _ledgerFindBaselineDateKey(_ldgStore, _ldgCode)
    if (!bk) { showToast('이 품번엔 설정된 기준이 없습니다 — 관리자 [기준 재고 설정] 필요', 'warning'); return }
    const se = document.getElementById('ledgerStart'); if (se) se.value = bk
    const ee = document.getElementById('ledgerEnd'); if (ee) ee.value = kstDateKey()
    _ledgerReload()
  })()
}

async function _ledgerReload() {
  const body = document.getElementById('ledgerBody'), reconEl = document.getElementById('ledgerRecon')
  const titleEl = document.getElementById('ledgerTitleCode')
  if (!body) return
  const COLS = 9
  const setEmpty = msg => { body.innerHTML = `<tr><td colspan="${COLS}" class="inbhist-empty">${esc(msg)}</td></tr>`; if (reconEl) reconEl.innerHTML = ''; _ldgRows = []; _ldgRecon = {}; _ldgUpdateExportBtn() }
  const store = (document.getElementById('ledgerStore') || {}).value || _ldgStore || ''
  const code = (_ldgCode || String((document.getElementById('ledgerSearch') || {}).value || '').trim())
  _ldgStore = store; _ldgCode = code
  if (titleEl) titleEl.textContent = code ? ('· ' + code) : ''
  if (!store) { setEmpty('매장을 선택하세요'); return }
  if (!code) { setEmpty('품번을 검색·선택하세요'); return }
  let start = (document.getElementById('ledgerStart') || {}).value || ''
  let end = (document.getElementById('ledgerEnd') || {}).value || ''
  if (!start || !end) { setEmpty('기간을 선택하세요'); return }
  if (start > end) { const t = start; start = end; end = t; const se = document.getElementById('ledgerStart'), ee = document.getElementById('ledgerEnd'); if (se) se.value = start; if (ee) ee.value = end }
  if (!db) { setEmpty('서버 연결 없음'); return }
  _ldgCtx = { store, code, start, end }
  // 넓은 기간 경고 — 판매 스캔 비용 ∝ 매장 기간 판매량(embedded lines, 설계 Q5)
  const spanDays = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000)
  if (spanDays > 120) showToast('조회 기간이 넓어(' + spanDays + '일) 판매 스캔이 느릴 수 있습니다', 'warning')
  setEmpty('불러오는 중…')
  const idxBuilding = e => e && (e.code === 'failed-precondition' || /index/i.test(e.message || ''))

  // 1) 이동(storeInbound) — 품번 인덱스[6a]
  const mq = db.collection('storeInbound').where('storeId', '==', store).where('productCode', '==', code).where('dateKey', '>=', start).where('dateKey', '<=', end)
  let mSnap = null
  try { mSnap = await mq.get({ source: 'server' }) }
  catch (e) { if (idxBuilding(e)) { setEmpty('인덱스 준비 중 — 잠시 후 다시 시도'); return } try { mSnap = await mq.get() } catch (e2) { setEmpty('이동 조회 실패: ' + (e2 && e2.message || '')); return } }

  // 2) 판매/취소(storeSales) — 기간 스캔[3a] + 라인 필터
  const sq = db.collection('storeSales').where('storeId', '==', store).where('dateKey', '>=', start).where('dateKey', '<=', end)
  let sSnap = null
  try { sSnap = await sq.get({ source: 'server' }) }
  catch (e) { if (idxBuilding(e)) { setEmpty('인덱스 준비 중 — 잠시 후 다시 시도'); return } try { sSnap = await sq.get() } catch (e2) { setEmpty('판매 조회 실패: ' + (e2 && e2.message || '')); return } }

  // 3) 행 정규화
  const rows = []
  mSnap.forEach(d => {
    const x = d.data() || {}
    rows.push({
      ts: String(x.confirmedAt || ''), size: String(x.size || ''),
      moveType: _mvType(x), inboundType: x.inboundType || '',
      stockDelta: _mvSignedQty(x), defectDelta: _mvDefectDelta(x),
      no: x.inboundNo || '-', worker: x.workerName || '', note: _mvNote(x),
      cancelled: x.cancelled === true, kind: 'move'
    })
  })
  sSnap.forEach(d => {
    const x = d.data() || {}
    const isVoid = x.type === 'void'
    if (x.type !== 'sale' && !isVoid) return
    ;(Array.isArray(x.lines) ? x.lines : []).forEach(l => {
      if (String(l.productCode || '') !== code) return
      const q = Math.max(0, Math.floor(Number(l.qty) || 0)); if (!q) return
      rows.push({
        ts: String((isVoid ? x.voidedAt : x.soldAt) || ''), size: String(l.size || ''),
        moveType: isVoid ? 'void' : 'sale', inboundType: '',
        stockDelta: isVoid ? q : -q, defectDelta: 0,
        no: isVoid ? (x.originalSaleNo || x.saleNo || '-') : (x.saleNo || '-'),
        worker: isVoid ? (x.voidedByName || '') : (x.workerName || ''),
        note: isVoid ? (x.voidReason || '') : '', cancelled: false, kind: isVoid ? 'void' : 'sale'
      })
    })
  })
  rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)))   // ASC — 누계 계산

  // 4) 누계 per size — baseline=리셋(절대치), 취소 이동=제외
  const bal = {}, defBal = {}, hasBaseline = {}
  rows.forEach(r => {
    if (r.moveType === 'baseline') { bal[r.size] = r.stockDelta; defBal[r.size] = r.defectDelta; hasBaseline[r.size] = true }
    else if (!r.cancelled) { bal[r.size] = (bal[r.size] || 0) + r.stockDelta; defBal[r.size] = (defBal[r.size] || 0) + r.defectDelta }
    r._bal = (bal[r.size] || 0)
  })
  _ldgRows = rows

  // 5) 대조 — 기준 있고 기간이 오늘까지 커버할 때만(정직). 이론치=최신 baseline(명시 or 암묵0) + 그 시점 이후 이동 합산.
  //    ⚠️ baseline 시점(baselineTs) 기준으로 계산 — 기준 시점 0이던 사이즈(baseline doc 없음)도 '암묵 0'으로 대조에 포함
  //    → 원장 우회 변경이 녹색 헤더 아래 숨는 사각지대 제거(리뷰 지적). 표시 누계(_bal)와 분리(시각 정합).
  try { if (typeof buildStoreStockIndex === 'function') await buildStoreStockIndex(store) } catch (e) {}
  const todayKey = kstDateKey()
  const liveSizes = (typeof getStoreStock === 'function') ? getStoreStock(store, code) : {}
  const liveDef = (typeof getStoreDefect === 'function') ? getStoreDefect(store, code) : {}
  const coversToday = end >= todayKey
  // 최신 baseline 시점(한 run 은 confirmedAt 공유) + 사이즈별 명시 baseline doc
  let baselineTs = ''
  const baselineBySize = {}
  rows.forEach(r => {
    if (r.moveType !== 'baseline') return
    if (r.ts > baselineTs) baselineTs = r.ts
    if (!baselineBySize[r.size] || r.ts > baselineBySize[r.size].ts) baselineBySize[r.size] = r
  })
  const anyBaseline = !!baselineTs
  const recon = {}
  SIZES.forEach(sz => {
    let theo = 0, theoD = 0
    if (anyBaseline) {
      const b = baselineBySize[sz]
      if (b && b.ts >= baselineTs) { theo = b.stockDelta; theoD = b.defectDelta }   // 최신 run 의 명시 기준만; 아니면 암묵 0(재기준 시 0이던 사이즈 포함)
      rows.forEach(r => {   // 최신 baseline 시점 이후 이동만(취소·baseline 제외)
        if (r.size !== sz || r.moveType === 'baseline' || r.cancelled) return
        if (r.ts >= baselineTs) { theo += r.stockDelta; theoD += r.defectDelta }
      })
    }
    const live = Number(liveSizes[sz] || 0), liveD = Number(liveDef[sz] || 0)
    let status = 'no-baseline'
    if (anyBaseline && coversToday) status = (theo === live && theoD === liveD) ? 'match' : 'mismatch'
    else if (anyBaseline) status = 'range-incomplete'
    recon[sz] = { hasBaseline: anyBaseline, hasExplicit: !!baselineBySize[sz], theoretical: theo, live: live, theoDef: theoD, liveDef: liveD, status: status }
  })
  _ldgRecon = { bySize: recon, coversToday: coversToday, anyBaseline: anyBaseline }
  _ldgRenderTable()
  _ldgRenderRecon()
  _ldgUpdateExportBtn()
}

function _ldgRenderTable() {
  const body = document.getElementById('ledgerBody'); if (!body) return
  if (!_ldgRows.length) { body.innerHTML = '<tr><td colspan="9" class="inbhist-empty">해당 기간의 이동 내역이 없습니다</td></tr>'; return }
  body.innerHTML = _ldgRows.map(r => {
    const cancelled = r.cancelled === true
    const label = _ldgTypeLabel(r.moveType) || r.inboundType || '입고'
    const sq = r.stockDelta, dq = r.defectDelta
    return `<tr${cancelled ? ' class="inbhist-cancelled-row"' : ''}>
      <td class="inbhist-time">${esc(_inbHistDateTime(r.ts, 'md'))}</td>
      <td class="inbhist-type">${esc(label)}</td>
      <td style="text-align:center">${esc(r.size)}</td>
      <td style="text-align:right" class="${sq < 0 ? 'ssv-neg' : ''}">${sq !== 0 ? (sq > 0 ? '+' : '') + sq : '-'}</td>
      <td style="text-align:right" class="${dq < 0 ? 'ssv-neg' : (dq > 0 ? 'spd-defect-has' : '')}">${dq !== 0 ? (dq > 0 ? '+' : '') + dq : '-'}</td>
      <td style="text-align:right;font-weight:700" class="${(r._bal < 0) ? 'ssv-neg' : ''}">${cancelled ? '—' : r._bal}</td>
      <td class="inbhist-no">${esc(r.no)}</td>
      <td>${esc(r.worker)}</td>
      <td class="inbhist-memo">${esc(r.note)}</td>
    </tr>`
  }).join('')
}

function _ldgRenderRecon() {
  const el = document.getElementById('ledgerRecon'); if (!el) return
  const R = _ldgRecon || {}
  if (!_ldgCode) { el.innerHTML = ''; return }
  if (!R.anyBaseline) {
    el.innerHTML = `<div class="ledger-recon-msg">🧭 <strong>기준 미설정 — 장부↔실재고 대조 불가.</strong> 관리자가 [🧭 기준 재고 설정]을 실행하면 이후 이동과 합산해 대조할 수 있습니다.</div>`
    return
  }
  if (!R.coversToday) {
    el.innerHTML = `<div class="ledger-recon-msg">정확한 대조는 <strong>기간 마지막일 = 오늘</strong>일 때만 가능합니다. <button class="btn btn-outline btn-sm" onclick="_ledgerSetBaseRange()">기준일~오늘로 조회</button></div>`
    return
  }
  // 칩: 불일치는 항상 표시(암묵0 사이즈 포함) · 일치는 값이 있는 사이즈만(0=0 클러터 억제)
  const chips = SIZES.map(sz => {
    const c = R.bySize[sz]; if (!c) return ''
    if (c.status === 'mismatch') return `<span class="ledger-chip ledger-chip-bad">${esc(sz)} 불일치 (장부 ${c.theoretical}/실 ${c.live}${(c.theoDef !== c.liveDef) ? ' · 불량 장부 ' + c.theoDef + '/실 ' + c.liveDef : ''})</span>`
    if (c.status === 'match' && (c.live !== 0 || c.theoretical !== 0 || c.liveDef !== 0 || c.theoDef !== 0))
      return `<span class="ledger-chip ledger-chip-ok">${esc(sz)} 일치 ${c.live}${c.liveDef ? ' · 불량 ' + c.liveDef : ''}</span>`
    return ''
  }).filter(Boolean).join('')
  const anyBad = SIZES.some(sz => R.bySize[sz] && R.bySize[sz].status === 'mismatch')
  el.innerHTML = `<div class="ledger-recon-head">장부 ↔ 실재고 대조 ${anyBad ? '<span class="ledger-recon-bad">🔴 불일치 있음</span>' : '<span class="ledger-recon-ok">✅ 일치</span>'}</div>`
    + `<div class="ledger-recon-chips">${chips || '<span class="ledger-recon-msg">전 사이즈 일치 (재고 0)</span>'}</div>`
    + (anyBad ? `<div class="ledger-recon-note">불일치 = 장부(기준+이동 합산)와 실재고가 다름 → 원장을 우회한 재고 변경 또는 데이터 오류 가능. 기간에 기준일이 포함됐는지 확인하세요.</div>` : '')
}

function _ldgUpdateExportBtn() {
  const btn = document.getElementById('ledgerExportBtn')
  if (btn) btn.disabled = !(_ldgRows && _ldgRows.length)
}

function downloadLedger() {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  if (!_ldgRows || !_ldgRows.length) { showToast('내보낼 이동 내역이 없습니다', 'warning'); return }
  const header = ['일시', '유형', '사이즈', '정상증감', '불량증감', '누계(정상)', '번호', '작업자', '사유/메모', '상태']
  const aoa = [header].concat(_ldgRows.map(r => [
    _inbHistDateTime(r.ts, 'full'), (_ldgTypeLabel(r.moveType) || r.inboundType || '입고'), r.size,
    r.stockDelta, r.defectDelta, (r.cancelled ? '' : r._bal), r.no, r.worker, r.note,
    r.cancelled ? '취소됨' : '정상'
  ]))
  // 대조 요약 라인
  const R = _ldgRecon || {}
  aoa.push([])
  if (R.anyBaseline && R.coversToday) {
    SIZES.forEach(sz => { const c = R.bySize && R.bySize[sz]; if (c && c.hasBaseline) aoa.push(['대조', sz, (c.status === 'match' ? '일치' : '불일치'), '장부 ' + c.theoretical, '실 ' + c.live, '', '', '', '', '']) })
  } else {
    aoa.push(['대조', R.anyBaseline ? '기간에 오늘 미포함 — 대조 불가' : '기준 미설정 — 대조 불가', '', '', '', '', '', '', '', ''])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 17 }, { wch: 10 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 24 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '이동원장')
  const storeName = _storeNameById(_ldgCtx.store) || _ldgCtx.store || '매장'
  XLSX.writeFile(wb, '이동원장_' + storeName + '_' + (_ldgCtx.code || '') + '_' + (_ldgCtx.start || '') + '~' + (_ldgCtx.end || '') + '.xlsx')
}

// ── 기준 재고 설정(baseline) — 관리자 전용, 청크 SET origin ──
function openBaselineConfirm() {
  const g = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  if (g < 3) { showToast('기준 재고 설정은 관리자만 가능합니다', 'warning'); return }
  const store = _ssvStore || (typeof resolveActiveStore === 'function' ? resolveActiveStore() : '') || ''
  if (!store) { showToast('대상 매장이 없습니다 — 매장을 선택하세요', 'warning'); return }
  _baselineTargetStore = store
  const modal = document.getElementById('baselineConfirmModal'); if (!modal) return
  const sumEl = document.getElementById('baselineSummary')
  if (sumEl) sumEl.innerHTML = '<div class="svoid-amt">집계 중…</div>'
  ;(async () => {
    try { if (typeof buildStoreStockIndex === 'function') await buildStoreStockIndex(store) } catch (e) {}
    const idx = (typeof _storeStockIndex !== 'undefined' && _storeStockIndex[store]) ? _storeStockIndex[store] : {}
    const defIdx = (typeof _storeDefectIndex !== 'undefined' && _storeDefectIndex[store]) ? _storeDefectIndex[store] : {}
    let codes = 0, docs = 0
    Object.keys(idx).forEach(code => {
      let any = false
      SIZES.forEach(sz => { const s = Number((idx[code] || {})[sz] || 0), d = Number((defIdx[code] || {})[sz] || 0); if (s !== 0 || d !== 0) { docs++; any = true } })
      if (any) codes++
    })
    if (sumEl) sumEl.innerHTML = `<div class="svoid-amt">${esc(_storeNameById(store))} · <strong>${codes}</strong>품번 · <strong>${docs}</strong>개 기준 이동 생성 (비어있지 않은 사이즈만)</div>`
  })()
  modal.showModal(); if (typeof centerModal === 'function') centerModal(modal)
}
function closeBaselineConfirm() { const m = document.getElementById('baselineConfirmModal'); if (m) m.close() }

async function confirmBaselineSnapshot() {
  if (_ldgBaselineInFlight) return
  const g = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  if (g < 3) { showToast('기준 재고 설정은 관리자만 가능합니다', 'warning'); return }
  const store = _baselineTargetStore || _ssvStore || ''
  if (!store || !db) { showToast('대상 매장/서버 연결 없음', 'warning'); return }
  const btn = document.getElementById('baselineConfirmBtn')
  try {
    _ldgBaselineInFlight = true
    if (btn) { btn.disabled = true; if (btn.dataset.orig == null) btn.dataset.orig = btn.textContent; btn.textContent = '설정 중…' }
    try { if (typeof buildStoreStockIndex === 'function') await buildStoreStockIndex(store) } catch (e) {}
    const idx = (typeof _storeStockIndex !== 'undefined' && _storeStockIndex[store]) ? _storeStockIndex[store] : {}
    const defIdx = (typeof _storeDefectIndex !== 'undefined' && _storeDefectIndex[store]) ? _storeDefectIndex[store] : {}
    const uid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : ''
    const workerName = (typeof formatUserName === 'function') ? formatUserName(_currentUserName, (typeof _currentUserPosition !== 'undefined' ? _currentUserPosition : '')) : ((typeof _currentUserName !== 'undefined' && _currentUserName) || '')
    const nowIso = new Date().toISOString(), dateKey = kstDateKey()
    const baseNo = 'BASE-' + kstStamp() + '-' + _saleNoSuffix()   // 재실행마다 새 번호 → 최신 기준이 이전 대체
    const batchId = dateKey + '_' + (uid || 'x') + '_' + Date.now()
    const items = []
    Object.keys(idx).forEach(code => {
      SIZES.forEach(sz => {
        const s = Number((idx[code] || {})[sz] || 0), d = Number((defIdx[code] || {})[sz] || 0)
        if (s === 0 && d === 0) return   // 비어있지 않은 (품번,사이즈)만
        items.push({ code, sz, s, d })
      })
    })
    if (!items.length) { showToast('기준으로 기록할 재고가 없습니다', 'warning'); return }
    const CHUNK = 450   // 청크 안전(각 doc 독립 SET origin, 상쇄 세션 아님 — 부분완료 무해, 재실행이 대체)
    for (let i = 0; i < items.length; i += CHUNK) {
      const batch = db.batch()
      items.slice(i, i + CHUNK).forEach(it => {
        batch.set(db.collection('storeInbound').doc(baseNo + '_' + it.code + '_' + it.sz), {
          storeId: store, productCode: it.code, size: it.sz,
          moveType: 'baseline', qty: Math.abs(it.s), stockDelta: it.s, defectDelta: it.d,
          location: '', inboundNo: baseNo, inboundType: '기준', reason: '기준 재고 설정', memo: '',
          workerUid: uid, workerName: workerName, confirmedAt: nowIso, dateKey: dateKey, batchId: batchId
        })
      })
      await batch.commit()
    }
    if (typeof logActivity === 'function') logActivity('baseline', '기준재고설정', _storeNameById(store) + '(' + store + '): ' + baseNo + ' · ' + items.length + '개 기준 이동')
    showToast('기준 재고 설정 완료 · ' + items.length + '개 · ' + baseNo, 'success')
    closeBaselineConfirm()
    if (_ldgStore === store && _ldgCode) _ledgerReload()
  } catch (e) {
    console.error('baseline 실패:', e && e.message)
    showToast('기준 설정 실패 — 다시 시도하세요 (재실행 시 새 기준으로 안전)' + (e && e.message ? ' (' + e.message + ')' : ''), 'error')
  } finally {
    _ldgBaselineInFlight = false
    if (btn) { btn.disabled = false; if (btn.dataset.orig != null) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig } }
  }
}

window.openLedger = openLedger
window.closeLedger = closeLedger
window._ledgerRenderPick = _ledgerRenderPick
window.selectLedgerProduct = selectLedgerProduct
window._ledgerReload = _ledgerReload
window._ledgerSetBaseRange = _ledgerSetBaseRange
window.downloadLedger = downloadLedger
window.openBaselineConfirm = openBaselineConfirm
window.closeBaselineConfirm = closeBaselineConfirm
window.confirmBaselineSnapshot = confirmBaselineSnapshot

// =============================================
// ===== 매장 보충 발주 (POS R1) — 추천 + 개별추가, 요청 문서(재고 무접촉) =====
// =============================================
// 🔴 발주 = 요청(request) 문서. storeStock/storeInbound/storeSales 를 절대 건드리지 않음(재고 무접촉, grep 검증 대상).
//   ① 추천: 마지막 (미취소) 발주 이후 순판매(sales−voids) 집계 → 제안 → 담기 → 확정.  ② 개별추가: 품번 조회(전 사이즈) → 담기 → 확정.
//   exactly-once: doc id = roNo(결정적). 재제출 set 은 기존 doc 'update' 로 평가 → replenishOrders update 규칙(취소/체크 한정) 거부 → 중복 발주 구조적 불가.
//     pendingRoNo 를 draft 에 동결(3c pendingSaleNo 미러) → 크래시/리로드 후 재시도 멱등. permission-denied → 서버 존재조회로 착지 판별.
//   R2(물류)용 확인✓/발송✓ 체크 필드는 예약(create 시 false) — R2 는 hosting-only(규칙 이미 정의).
//   ⚠️ 규칙은 lines[] 내부를 검증 못 함 → buildReplenishDoc 이 라인 shape authoritative(정직한 한계).

let _roStore = ''            // 현재 발주 매장
let _roList = []             // staging(담은 항목) [{ productCode, productName(snapshot), size, requestQty }]
let _roActiveTab = 'suggest' // 'suggest' | 'manual' | 'orders'
let _roInFlight = false       // 확정 재진입 가드
let _pendingRoNo = ''         // 이 세션의 결정적 발주번호(RO-…) — 첫 확정 1회 생성·draft 영속, 성공 시 소거(멱등)
let _roSuggest = { rows: [], start: '', anchorRo: '', anchorTs: '' }
let _roManualCode = ''
let _roMyOrders = []          // 내 발주 조회 결과(raw)
let _roMyView = []            // 엑셀 export 대상(현재 표시 = 조회 결과)
let _roMyCtx = { store: '', start: '', end: '' }
let _roCancelTarget = ''
let _roCancelInFlight = false

// 발주번호 = RO-YYYYMMDD-HHMMSS-<8자 접미사>(KST, generateSaleNo 강도 — 동일-초 다중단말 충돌 방지).
//   단일 now 로 stamp·suffix 산출(초·ms 일관 — generateSaleNo 미러). KST 산술 유틸만(Intl 비의존).
function generateRoNo() { const now = new Date(); return 'RO-' + kstStamp(now) + '-' + _saleNoSuffix(now) }

// 발주 문서 생성자 — shape 강제(requestQty 정수≥1, totals 재계산, status='requested', 체크 false). 재고/DB 쓰기 없음.
function buildReplenishDoc(opts) {
  opts = opts || {}
  const lines = (Array.isArray(opts.lines) ? opts.lines : []).map(l => {
    const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(l.productCode) : null
    return {
      productCode: String((l && l.productCode) || ''),
      productName: String(((l && l.productName != null) ? l.productName : (p ? (p.nameKr || p.nameEn || '') : '')) || ''),
      size: String((l && l.size) || ''),
      requestQty: Math.max(1, Math.floor(Number(l && l.requestQty) || 0))
    }
  }).filter(l => l.productCode && l.size)
  const totals = { lineCount: lines.length, qtyTotal: lines.reduce((s, l) => s + l.requestQty, 0) }
  return {
    roNo: String(opts.roNo || generateRoNo()),
    storeId: String(opts.storeId || ''),
    storeName: String(opts.storeName || _storeNameById(opts.storeId) || ''),
    lines: lines,
    totals: totals,
    memo: String(opts.memo || ''),
    status: 'requested',
    confirmChecked: false, confirmCheckedBy: '', confirmCheckedAt: '',   // R2 확인✓ 예약(표시 전용)
    shipChecked: false, shipCheckedBy: '', shipCheckedAt: '',            // R2 발송✓ 예약(표시 전용)
    createdByUid: String(opts.createdByUid || ''),
    createdByName: String(opts.createdByName || ''),
    createdAt: opts.createdAt || new Date().toISOString(),   // UTC instant — 표시는 kstFormat 로 KST
    dateKey: opts.dateKey || kstDateKey()                    // 🔴 KST 귀속일(산술 KST)
  }
}

// ── draft (매장별, 손상 안전, pendingRoNo 포함) ──
function _roDraftKey(store) { return 'lemango_replenish_draft_' + (store || _roStore || '') }
function _roSaveDraft() {
  if (!_roStore) return
  const memoEl = document.getElementById('roMemo')
  try {
    localStorage.setItem(_roDraftKey(_roStore), JSON.stringify({
      v: 1, items: _roList, memo: memoEl ? memoEl.value : '',
      pendingRoNo: _pendingRoNo || ''   // exactly-once: 재시도 멱등을 위해 발주번호도 draft 에 동결
    }))
  } catch (e) { console.warn('발주 draft 저장 실패:', e && e.message) }
}
function _roLoadDraft(store) {
  const EMPTY = { items: [], memo: '', pendingRoNo: '' }
  let raw = null
  try { raw = localStorage.getItem(_roDraftKey(store)) } catch (e) { return EMPTY }
  if (!raw) return EMPTY
  try {
    const o = JSON.parse(raw)
    if (!o || o.v !== 1) return EMPTY
    const items = Array.isArray(o.items) ? o.items.filter(l => l && l.productCode && l.size).map(l => ({
      productCode: String(l.productCode), productName: String(l.productName || ''), size: String(l.size),
      requestQty: Math.max(1, Math.floor(Number(l.requestQty) || 1))
    })) : []
    return { items, memo: String(o.memo || ''), pendingRoNo: String(o.pendingRoNo || '') }
  } catch (e) {
    console.warn('발주 draft 파싱 실패 — 초기화:', e && e.message)
    showToast('발주 임시저장 손상 — 초기화했습니다', 'warning')
    try { localStorage.removeItem(_roDraftKey(store)) } catch (e2) {}
    return EMPTY
  }
}

// ── 창 열기/렌더 (작업 게이트 = 본인 매장 직원 + 관리자; office/미배정 = 게이트 화면) ──
function openReplenishModal() {
  const modal = document.getElementById('replenishModal'); if (!modal) return
  if (!modal.open) { modal.showModal(); if (typeof centerModal === 'function') centerModal(modal) }
  renderReplenishScreen()
}
function renderReplenishScreen() {
  const gate = document.getElementById('roGate'), screen = document.getElementById('roScreen')
  if (!gate || !screen) return
  const store = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
  if (!store) {   // 발주 = 작업 → office/미배정 차단(조회도 own-store 라 함께 게이트)
    _roStore = ''; _roList = []
    screen.classList.add('inb-hidden'); gate.classList.remove('inb-hidden')
    gate.innerHTML = '<div class="store-placeholder"><div class="store-placeholder-icon">🚫</div><div class="store-placeholder-title">발주 불가</div><div class="store-placeholder-desc">배정된 매장이 없습니다 — 발주는 본인 매장 직원/관리자만 가능합니다.</div></div>'
    return
  }
  gate.classList.add('inb-hidden'); gate.innerHTML = ''
  screen.classList.remove('inb-hidden')
  _roStore = store
  const draft = _roLoadDraft(store)
  _roList = draft.items
  _pendingRoNo = draft.pendingRoNo || ''
  const memoEl = document.getElementById('roMemo'); if (memoEl) memoEl.value = draft.memo || ''
  const lbl = document.getElementById('roStoreLabel'); if (lbl) lbl.textContent = '발주 매장: ' + _storeNameById(store)
  _roActiveTab = 'suggest'
  roSwitchTab('suggest')
  _roRenderStaging()
}

// 닫기 시도: staging 있으면 3지선다(보존/삭제/취소), 없으면 즉시 닫기. (입고 스캔 창 미러 — 명시적-닫기-전용)
function closeReplenishModal() { if (_roList && _roList.length) { _openRoCloseConfirm(); return } _doCloseReplenish(false) }
function _doCloseReplenish(clearDraft) {
  if (clearDraft) { _roList = []; try { localStorage.removeItem(_roDraftKey(_roStore)) } catch (e) {}; _roRenderStaging() }
  const modal = document.getElementById('replenishModal'); if (modal) modal.close()
}
function _openRoCloseConfirm() {
  const m = document.getElementById('roCloseConfirmModal'); if (!m) { _doCloseReplenish(false); return }
  const c = document.getElementById('roCloseConfirmCount'); if (c) c.textContent = String(_roList.length)
  m.showModal(); if (typeof centerModal === 'function') centerModal(m)
  const cb = document.getElementById('roCloseCancelBtn'); if (cb) setTimeout(() => cb.focus(), 30)   // 기본 포커스 = 취소(파괴적 아님)
}
function _closeRoCloseConfirm() { const m = document.getElementById('roCloseConfirmModal'); if (m) m.close() }
function roCloseKeep() { _closeRoCloseConfirm(); _doCloseReplenish(false) }
function roCloseDiscard() { _closeRoCloseConfirm(); _doCloseReplenish(true) }
function roCloseCancelChoice() { _closeRoCloseConfirm() }

// ── 탭 전환 (추천/개별/내 발주). staging 은 내 발주 탭에서 숨김. ──
function roSwitchTab(tab) {
  _roActiveTab = (tab === 'manual' || tab === 'orders') ? tab : 'suggest'
  ;['suggest', 'manual', 'orders'].forEach(k => {
    const p = document.getElementById('roPanel_' + k); if (p) p.classList.toggle('ro-panel-hidden', k !== _roActiveTab)
    const b = document.getElementById('roTab_' + k); if (b) b.classList.toggle('ro-tab-active', k === _roActiveTab)
  })
  const stage = document.getElementById('roStagingSection'); if (stage) stage.classList.toggle('inb-hidden', _roActiveTab === 'orders')
  if (_roActiveTab === 'suggest') roSuggestReload()
  else if (_roActiveTab === 'manual') { renderRoManualResults(); const s = document.getElementById('roManualSearch'); if (s) setTimeout(() => s.focus(), 30) }
  else if (_roActiveTab === 'orders') {
    const s = document.getElementById('roMyStart'), en = document.getElementById('roMyEnd')   // 기본 = 최근 30일 ~ 오늘(비어있을 때만)
    if (s && !s.value) s.value = _ldgAddDays(kstDateKey(), -30)
    if (en && !en.value) en.value = kstDateKey()
    roLoadMyOrders()
  }
}

// ── 매장 발주 전체 조회(1회) — 추천 앵커(마지막 미취소 발주) + 요청중 수량 계산. where(storeId==) 단일필드 auto 인덱스. 비용 ∝ 매장 누적 발주수(소량). ──
async function _roFetchStoreOrders(store) {
  if (!db || !store) return []
  const q = db.collection('replenishOrders').where('storeId', '==', store)
  let snap = null
  try { snap = await q.get({ source: 'server' }) } catch (e) { try { snap = await q.get() } catch (e2) { return [] } }
  const out = []; snap.forEach(d => out.push(Object.assign({ _id: d.id }, d.data() || {}))); return out
}

// 🔴 추천 계산 — 순판매(sales−voids) per (품번,사이즈), 마지막 (미취소) 발주 createdAt 이후. 없으면 최근 7일.
//   A1: 취소된 발주는 앵커가 되지 않음(실제 발주 안 나감). A2: 요청중 = status=='requested' && shipChecked==false 만(미발송) — 무한누적 방지.
async function _roComputeSuggestions(store) {
  const orders = await _roFetchStoreOrders(store)
  // 앵커 = 가장 최근 '미취소' 발주 createdAt (A1)
  let anchorTs = '', anchorRo = ''
  orders.forEach(o => { if (o.status === 'cancelled') return; const t = String(o.createdAt || ''); if (t > anchorTs) { anchorTs = t; anchorRo = String(o.roNo || o._id || '') } })
  // 요청중 수량 (A2): 미발송·요청상태 발주만 합산 → 발송✓ 되면 pending 에서 자동 이탈
  const pending = {}
  orders.forEach(o => {
    if (o.status !== 'requested' || o.shipChecked === true) return
    ;(Array.isArray(o.lines) ? o.lines : []).forEach(l => {
      const k = String(l.productCode || '') + '#' + String(l.size || '')
      pending[k] = (pending[k] || 0) + Math.max(0, Math.floor(Number(l.requestQty) || 0))
    })
  })
  const today = kstDateKey()
  const start = anchorTs ? kstDateKey(anchorTs) : _ldgAddDays(today, -7)
  // storeSales 기간 스캔[3a 인덱스] + 클라 라인 필터. 정밀: anchorTs 있으면 이벤트 시각 ≥ anchorTs 만(같은 날 발주 이전 판매 제외).
  const sq = db.collection('storeSales').where('storeId', '==', store).where('dateKey', '>=', start).where('dateKey', '<=', today)
  let sSnap = null
  try { sSnap = await sq.get({ source: 'server' }) }
  catch (e) { if (_shIndexBuilding(e)) throw e; sSnap = await sq.get() }
  const net = {}   // k -> { code, size, qty }
  sSnap.forEach(d => {
    const x = d.data() || {}
    const isVoid = x.type === 'void'
    if (x.type !== 'sale' && !isVoid) return
    const ts = String((isVoid ? x.voidedAt : x.soldAt) || '')
    if (anchorTs && ts && ts < anchorTs) return   // 마지막 발주 시각 이후만(정밀)
    ;(Array.isArray(x.lines) ? x.lines : []).forEach(l => {
      const q = Math.max(0, Math.floor(Number(l.qty) || 0)); if (!q) return
      const code = String(l.productCode || ''), size = String(l.size || ''); if (!code || !size) return
      const k = code + '#' + size
      if (!net[k]) net[k] = { code, size, qty: 0 }
      net[k].qty += (isVoid ? -q : q)   // 순판매 = 판매 − 취소
    })
  })
  try { if (typeof buildStoreStockIndex === 'function') await buildStoreStockIndex(store) } catch (e) {}
  const rows = []
  Object.keys(net).forEach(k => {
    const e = net[k]; if (e.qty <= 0) return   // 순판매 양수만 제안
    const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(e.code) : null
    const name = p ? (p.nameKr || p.nameEn || '') : ''
    const stock = (typeof getStoreStock === 'function') ? Number(getStoreStock(store, e.code)[e.size] || 0) : 0
    rows.push({ code: e.code, name, size: e.size, net: e.qty, stock, pending: pending[k] || 0, suggest: e.qty })
  })
  rows.sort((a, b) => (b.net - a.net) || String(a.code).localeCompare(String(b.code)) || (SIZES.indexOf(a.size) - SIZES.indexOf(b.size)))
  return { rows, start, anchorRo, anchorTs }
}

async function roSuggestReload() {
  const body = document.getElementById('roSuggestBody'), info = document.getElementById('roSuggestInfo')
  if (!body) return
  const COLS = 7
  const store = _roStore
  if (!store) { body.innerHTML = '<tr><td colspan="' + COLS + '" class="inbhist-empty">배정된 매장이 없습니다</td></tr>'; return }
  body.innerHTML = '<tr><td colspan="' + COLS + '" class="inbhist-empty">추천 계산 중…</td></tr>'
  let res = null
  try { res = await _roComputeSuggestions(store) }
  catch (e) {
    if (_shIndexBuilding(e)) { body.innerHTML = '<tr><td colspan="' + COLS + '" class="inbhist-empty">인덱스 준비 중 — 잠시 후 다시 시도하세요</td></tr>'; return }
    body.innerHTML = '<tr><td colspan="' + COLS + '" class="inbhist-empty">추천 계산 실패: ' + esc(e && e.message || '') + '</td></tr>'; return
  }
  _roSuggest = res
  if (info) info.innerHTML = res.anchorRo
    ? ('기준: 마지막 발주 <strong>' + esc(res.anchorRo) + '</strong> 이후 순판매 · ' + esc(res.start) + ' ~ ' + esc(kstDateKey()))
    : ('기준: 최근 7일 순판매 · ' + esc(res.start) + ' ~ ' + esc(kstDateKey()) + ' <span class="ro-info-note">(이전 발주 없음)</span>')
  if (!res.rows.length) { body.innerHTML = '<tr><td colspan="' + COLS + '" class="inbhist-empty">해당 기간 순판매가 없습니다 — [개별 추가]로 담으세요</td></tr>'; return }
  body.innerHTML = res.rows.map((r, i) =>
    '<tr>'
    + '<td class="inbhist-no ro-code-cell" onclick="openStoreProductDetail(\'' + esc(r.code) + '\',\'' + esc(store) + '\')" title="상품 상세">' + esc(r.code) + ' <span class="ro-stage-name">' + esc(r.name) + '</span></td>'
    + '<td style="text-align:center">' + esc(r.size) + '</td>'
    + '<td style="text-align:right">' + r.net + '</td>'
    + '<td style="text-align:right" class="' + (r.stock <= 0 ? 'ssv-neg' : '') + '">' + r.stock + '</td>'
    + '<td style="text-align:right">' + (r.pending > 0 ? ('<span class="ro-pending" title="미발송 발주 기준">' + r.pending + '</span>') : '-') + '</td>'
    + '<td style="text-align:right"><input class="inb-input ro-qty-input" type="number" min="1" step="1" value="' + r.suggest + '" onchange="onRoSuggestQty(' + i + ',this)"></td>'
    + '<td style="text-align:center"><button class="btn btn-outline btn-sm" onclick="roAddSuggest(' + i + ')">담기</button></td>'
    + '</tr>'
  ).join('')
}
function onRoSuggestQty(i, el) { const r = _roSuggest.rows[i]; if (!r) return; let v = Math.floor(Number(el.value) || 0); if (v < 1) { v = 1; el.value = '1' } r.suggest = v }
function roAddSuggest(i) { const r = _roSuggest.rows[i]; if (!r) return; _roStageAdd(r.code, r.size, r.suggest) }

// ── 개별 추가 (품번/상품명 조회 → 전 사이즈 선택 → 담기). 주문은 바코드 비의존 → 전 상품·전 사이즈 대상. ──
function renderRoManualResults() {
  const out = document.getElementById('roManualResults'); if (!out) return
  _roManualHideSizes()
  const q = String((document.getElementById('roManualSearch') || {}).value || '').trim().toLowerCase()
  if (!q) { out.innerHTML = '<div class="inb-lookup-hint">품번 또는 상품명을 입력하세요</div>'; return }
  const list = (State.allProducts || []).filter(p => {
    if (!p || p.deleted) return false   // 발주는 바코드 무관(전 상품) — 판매 조회와 의도적 차이
    const c = (p.productCode || '').toLowerCase(), nk = (p.nameKr || '').toLowerCase(), ne = (p.nameEn || '').toLowerCase()
    return c.indexOf(q) >= 0 || nk.indexOf(q) >= 0 || ne.indexOf(q) >= 0
  })
  if (!list.length) { out.innerHTML = '<div class="inb-lookup-hint">검색 결과가 없습니다</div>'; return }
  const capped = list.slice(0, 60)
  const more = list.length > 60 ? ('<div class="inb-lookup-hint">상위 60건만 표시 — 검색어를 더 입력하세요 (전체 ' + list.length + '건)</div>') : ''
  out.innerHTML = capped.map(p => {
    const name = esc(p.nameKr || p.nameEn || '')
    const img = (typeof getThumbUrl === 'function') ? getThumbUrl(p) : ''
    const thumb = img ? ('<img src="' + esc(img) + '" class="inb-lookup-thumb" onerror="this.style.visibility=\'hidden\'">') : '<span class="inb-lookup-thumb inb-lookup-thumb-none">—</span>'
    return '<div class="inb-lookup-row" onclick="selectRoManualProduct(\'' + esc(p.productCode) + '\')">' + thumb + '<span class="inb-lookup-code">' + esc(p.productCode) + '</span><span class="inb-lookup-name">' + name + '</span></div>'
  }).join('') + more
}
function _roManualHideSizes() { _roManualCode = ''; const z = document.getElementById('roManualSizes'); if (z) { z.classList.add('inb-hidden'); z.innerHTML = '' } }
function selectRoManualProduct(code) {
  _roManualCode = code
  const sizes = document.getElementById('roManualSizes'); if (!sizes) return
  const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null
  const name = p ? esc(p.nameKr || p.nameEn || '') : ''
  const stockMap = (typeof getStoreStock === 'function') ? getStoreStock(_roStore, code) : {}
  sizes.innerHTML = '<div class="inb-lookup-sizes-head">' + esc(code) + ' <span class="inb-lookup-sizes-name">' + name + '</span> — 사이즈 선택(전 사이즈)</div><div class="inb-size-grid">'
    + SIZES.map(sz => { const st = Number(stockMap[sz] || 0); return '<button class="inb-size-btn" onclick="chooseRoManualSize(\'' + esc(sz) + '\')"><span class="inb-size-lbl">' + esc(sz) + '</span><span class="inb-size-stock">재고 ' + st + '</span></button>' }).join('')
    + '</div>'
  sizes.classList.remove('inb-hidden')
}
function chooseRoManualSize(size) { const code = _roManualCode; if (!code || !size) return; _roStageAdd(code, size, 1) }

// ── staging (담은 목록) — 추천/개별 공용. 같은 (품번,사이즈) 담으면 수량 합산(merge). ──
function _roStageAdd(code, size, qty) {
  code = String(code || ''); size = String(size || ''); qty = Math.max(1, Math.floor(Number(qty) || 1))
  if (!code || !size) return
  const ex = _roList.find(l => l.productCode === code && l.size === size)
  if (ex) { ex.requestQty = Math.max(1, Math.floor(Number(ex.requestQty) || 1)) + qty }
  else { const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(code) : null; _roList.push({ productCode: code, productName: (p ? (p.nameKr || p.nameEn || '') : ''), size, requestQty: qty }) }
  _roSaveDraft(); _roRenderStaging()
  showToast(code + ' ' + size + ' · ' + qty + '개 담김', '')
}
function _roRenderStaging() {
  const body = document.getElementById('roStageBody'); if (!body) return
  if (!_roList.length) { body.innerHTML = '<tr><td colspan="4" class="inbhist-empty">담은 항목이 없습니다 — [추천]/[개별 추가]에서 담으세요</td></tr>' }
  else {
    body.innerHTML = _roList.map((l, i) => {
      const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(l.productCode) : null
      const nm = esc(l.productName || (p ? (p.nameKr || p.nameEn || '') : ''))
      return '<tr>'
        + '<td class="inbhist-no ro-code-cell" onclick="openStoreProductDetail(\'' + esc(l.productCode) + '\',\'' + esc(_roStore) + '\')" title="상품 상세">' + esc(l.productCode) + ' <span class="ro-stage-name">' + nm + '</span></td>'
        + '<td style="text-align:center">' + esc(l.size) + '</td>'
        + '<td style="text-align:right"><input class="inb-input ro-qty-input" type="number" min="1" step="1" value="' + Math.max(1, Math.floor(Number(l.requestQty) || 1)) + '" onchange="onRoStageQty(' + i + ',this)"></td>'
        + '<td class="inb-c"><button class="inb-del-btn" onclick="removeRoStage(' + i + ')">삭제</button></td>'
        + '</tr>'
    }).join('')
  }
  const qt = _roList.reduce((s, l) => s + Math.max(1, Math.floor(Number(l.requestQty) || 1)), 0)
  const cnt = document.getElementById('roStageCount'); if (cnt) cnt.textContent = String(_roList.length)
  const tot = document.getElementById('roStageTotal'); if (tot) tot.textContent = String(qt)
  const btn = document.getElementById('roSubmitBtn'); if (btn) btn.disabled = !_roList.length
}
function onRoStageQty(i, el) { const l = _roList[i]; if (!l) return; let v = Math.floor(Number(el.value) || 0); if (v < 1) { v = 1; el.value = '1' } l.requestQty = v; _roSaveDraft(); _roRenderStaging() }
function removeRoStage(i) { if (i < 0 || i >= _roList.length) return; _roList.splice(i, 1); _roSaveDraft(); _roRenderStaging() }
function onRoMemoInput() { _roSaveDraft() }

// ── 발주 확정 (exactly-once, 단일 doc set, 재고 무접촉) ──
function _roSetSubmitBusy(busy) {
  const btn = document.getElementById('roSubmitBtn'); if (!btn) return
  btn.disabled = !!busy
  if (busy) { if (btn.dataset.orig == null) btn.dataset.orig = btn.innerHTML; btn.textContent = '접수 중…' }
  else if (btn.dataset.orig != null) { btn.innerHTML = btn.dataset.orig; delete btn.dataset.orig }
}
function _roReadDoc(roNo, ms) {
  return new Promise(resolve => {
    let s = false; const f = r => { if (s) return; s = true; clearTimeout(t); resolve(r) }
    const t = setTimeout(() => f({ ok: false, exists: false, timeout: true }), ms || 5000)
    try { db.collection('replenishOrders').doc(roNo).get({ source: 'server' }).then(sn => f({ ok: true, exists: !!(sn && sn.exists) })).catch(err => f({ ok: false, exists: false, error: err })) }
    catch (e) { f({ ok: false, exists: false, error: e }) }
  })
}
function _roCommitWithTimeout(p, ms) {
  return new Promise(resolve => {
    let s = false; const f = r => { if (s) return; s = true; clearTimeout(t); resolve(r) }
    const t = setTimeout(() => f({ ok: false, timeout: true }), ms || 15000)
    Promise.resolve(p).then(() => f({ ok: true })).catch(err => f({ ok: false, error: err }))
  })
}
function roSubmit() {
  if (_roInFlight) return
  if (!_roList.length) { showToast('담은 항목이 없습니다', 'warning'); return }
  const store = (typeof resolveActiveStore === 'function') ? resolveActiveStore() : ''
  if (!store) { showToast('배정된 매장이 없습니다 — 발주 불가', 'warning'); return }
  for (let i = 0; i < _roList.length; i++) {
    const q = Math.floor(Number(_roList[i].requestQty) || 0)
    if (!(Number.isInteger(q) && q >= 1)) { showToast(_roList[i].productCode + ' ' + _roList[i].size + ': 수량 오류(1 이상)', 'warning'); return }
  }
  _openRoConfirmDialog(store)
}
function _openRoConfirmDialog(store) {
  const modal = document.getElementById('roConfirmModal'); if (!modal) { roConfirmProceed(); return }
  if (modal.open) return
  const n = _roList.length, qt = _roList.reduce((s, l) => s + Math.max(1, Math.floor(Number(l.requestQty) || 1)), 0)
  const memoEl = document.getElementById('roMemo'); const memo = memoEl ? String(memoEl.value || '').trim() : ''
  const sumEl = document.getElementById('roConfirmSummary')
  if (sumEl) sumEl.innerHTML =
    '<div class="sale-confirm-row"><span>발주 품목</span><strong>' + n + '건</strong></div>'
    + '<div class="sale-confirm-row"><span>총 수량</span><strong>' + qt + '개</strong></div>'
    + '<div class="sale-confirm-row"><span>매장</span><span>' + esc(_storeNameById(store)) + '</span></div>'
    + '<div class="sale-confirm-row"><span>메모</span><span>' + (memo ? esc(memo) : '—') + '</span></div>'
  const listEl = document.getElementById('roConfirmList')
  if (listEl) listEl.innerHTML = _roList.map(l => '<div class="ro-confirm-line">' + esc(l.productCode) + ' <span>' + esc(l.size) + '</span> × ' + Math.max(1, Math.floor(Number(l.requestQty) || 1)) + '</div>').join('')
  modal.showModal(); if (typeof centerModal === 'function') centerModal(modal)
  const ok = document.getElementById('roConfirmOkBtn'); if (ok) setTimeout(() => ok.focus(), 30)
}
function closeRoConfirmDialog() { const m = document.getElementById('roConfirmModal'); if (m && m.open) m.close() }
function _roSubmitSuccess(store, roNo, already, totals) {
  const n = _roList.length, qt = _roList.reduce((s, l) => s + Math.max(1, Math.floor(Number(l.requestQty) || 1)), 0)
  _roList = []; _pendingRoNo = ''
  try { localStorage.removeItem(_roDraftKey(store)) } catch (e) {}
  const memoEl = document.getElementById('roMemo'); if (memoEl) memoEl.value = ''
  _roRenderStaging()
  if (already) {
    showToast('이미 접수된 발주입니다 · ' + roNo, 'success')
    if (typeof logActivity === 'function') logActivity('replenish', '보충발주', _storeNameById(store) + '(' + store + '): 기접수 확인 · ' + roNo)
  } else {
    showToast('발주 완료 · ' + roNo + ' · ' + n + '건', 'success')
    if (typeof logActivity === 'function') logActivity('replenish', '보충발주', _storeNameById(store) + '(' + store + '): ' + n + '건 총 ' + qt + '개 · ' + roNo)
  }
  if (_roActiveTab === 'suggest') roSuggestReload()   // 요청중 수량 반영
}
async function roConfirmProceed() {
  closeRoConfirmDialog()
  if (_roInFlight) return
  const store = _roStore
  if (!_roList.length) { showToast('담은 항목이 없습니다', 'warning'); return }
  if (!store) { showToast('배정된 매장이 없습니다 — 발주 불가', 'warning'); return }
  if (!db) { showToast('서버 연결 없음 — 잠시 후 다시 시도', 'warning'); return }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { showToast('오프라인 상태 — 연결 확인 후 확정하세요', 'warning'); return }
  try {
    _roInFlight = true                                // 첫 await 이전 동기 set(재진입 즉시 차단)
    _roSetSubmitBusy(true)
    if (!_pendingRoNo) { _pendingRoNo = generateRoNo(); _roSaveDraft() }   // 발주번호(=doc id) 1회 생성·draft 영속(멱등)
    const roNo = _pendingRoNo
    const pre = await _roReadDoc(roNo, 5000)           // 연결 프리플라이트 + 사전 착지 감지
    if (!pre.ok) { showToast('오프라인 상태 — 연결 확인 후 확정하세요', 'warning'); return }
    if (pre.exists) { _roSubmitSuccess(store, roNo, true); return }        // 이전 시도 실제 착지 → 성공 처리(중복 발주 없음)
    const uid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : ''
    const workerName = (typeof formatUserName === 'function')
      ? formatUserName(_currentUserName, (typeof _currentUserPosition !== 'undefined' ? _currentUserPosition : ''))
      : ((typeof _currentUserName !== 'undefined' && _currentUserName) || '')
    const memoEl = document.getElementById('roMemo')
    const doc = buildReplenishDoc({ roNo, storeId: store, storeName: _storeNameById(store), lines: _roList, memo: memoEl ? memoEl.value : '', createdByUid: uid, createdByName: workerName })
    // 🔴 단일 doc set(merge 아님 = create 의도). 재시도 시 doc 존재 → 'update' 평가 → replenishOrders update 규칙(취소/체크 한정) 거부 → 중복 발주 불가.
    const res = await _roCommitWithTimeout(db.collection('replenishOrders').doc(roNo).set(doc), 15000)
    if (res.ok) { _roSubmitSuccess(store, roNo, false, doc.totals); return }
    if (res.timeout) { showToast('네트워크 불안정 — 반영 여부 확인 중입니다. 다시 확정을 누르면 안전하게 재시도됩니다', 'warning'); return }
    const err = res.error
    const denied = err && (err.code === 'permission-denied' || err.code === 7 || /permission/i.test(String(err.message || '')))
    if (denied) {
      const re = await _roReadDoc(roNo, 5000)          // 거부 판별: 이미 착지(재시도) vs 진짜 권한
      if (re.ok && re.exists) { _roSubmitSuccess(store, roNo, true); return }
      showToast('권한 오류로 발주가 저장되지 않았습니다 — 매장/권한을 확인하세요' + (err && err.message ? ' (' + err.message + ')' : ''), 'error'); return
    }
    showToast('발주 실패 — 다시 시도하세요' + (err && err.message ? ' (' + err.message + ')' : ''), 'error')
  } catch (e) {
    console.error('roConfirmProceed 예외:', e && e.message)
    showToast('발주 실패 — 다시 시도하세요' + (e && e.message ? ' (' + e.message + ')' : ''), 'error')
  } finally { _roInFlight = false; _roSetSubmitBusy(false) }
}

// ── 내 발주 (매장 발주 조회 · 취소 · 엑셀 · 상세) ──
function _roCanCancel(o) {
  const grade = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  if (grade >= 3) return true
  return !!(o && o.storeId && (typeof _currentUserStoreId !== 'undefined') && o.storeId === _currentUserStoreId)
}
async function roLoadMyOrders() {
  const body = document.getElementById('roMyBody'); if (!body) return
  const COLS = 7
  const setEmpty = msg => { body.innerHTML = '<tr><td colspan="' + COLS + '" class="inbhist-empty">' + esc(msg) + '</td></tr>'; _roMyOrders = []; _roMyView = []; const b = document.getElementById('roMyExportBtn'); if (b) b.disabled = true; const sm = document.getElementById('roMySummary'); if (sm) sm.textContent = '' }
  const store = _roStore
  if (!store) { setEmpty('배정된 매장이 없습니다'); return }
  const startEl = document.getElementById('roMyStart'), endEl = document.getElementById('roMyEnd')
  let start = (startEl || {}).value || '', end = (endEl || {}).value || ''
  if (!start || !end) { setEmpty('기간을 선택하세요'); return }
  if (start > end) { const t = start; start = end; end = t; if (startEl) startEl.value = start; if (endEl) endEl.value = end }
  if (!db) { setEmpty('서버 연결 없음'); return }
  _roMyCtx = { store, start, end }
  setEmpty('불러오는 중…')
  const q = db.collection('replenishOrders').where('storeId', '==', store).where('dateKey', '>=', start).where('dateKey', '<=', end)
  let snap = null
  try { snap = await q.get({ source: 'server' }) }
  catch (e) {
    if (_shIndexBuilding(e)) { setEmpty('인덱스 준비 중 — 잠시 후 다시 시도하세요'); return }
    try { snap = await q.get() } catch (e2) { if (_shIndexBuilding(e2)) { setEmpty('인덱스 준비 중 — 잠시 후 다시 시도하세요'); return } setEmpty('불러오기 실패: ' + (e2 && e2.message || '')); return }
  }
  const rows = []; snap.forEach(d => rows.push(Object.assign({ _id: d.id }, d.data() || {})))
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))   // 최신 위(DESC)
  _roMyOrders = rows; _roMyView = rows
  _roRenderMyOrders()
}
function _roRenderMyOrders() {
  const body = document.getElementById('roMyBody'); if (!body) return
  const COLS = 7
  const b = document.getElementById('roMyExportBtn'); if (b) b.disabled = !(_roMyView && _roMyView.length)
  const sm = document.getElementById('roMySummary')
  if (!_roMyOrders.length) { body.innerHTML = '<tr><td colspan="' + COLS + '" class="inbhist-empty">해당 기간의 발주가 없습니다</td></tr>'; if (sm) sm.textContent = ''; return }
  body.innerHTML = _roMyOrders.map(o => {
    const t = _inbHistDateTime(o.createdAt, 'md')
    const st = String(o.status || 'requested')
    const statusCell = st === 'cancelled' ? '<span class="shist-badge shist-badge-void">취소</span>' : '<span class="shist-badge shist-badge-ok">요청됨</span>'
    const conf = o.confirmChecked === true ? '<span class="ro-check ro-check-on" title="확인 ' + esc(_inbHistDateTime(o.confirmCheckedAt, 'md')) + '">확인✓</span>' : '<span class="ro-check">확인</span>'
    const ship = o.shipChecked === true ? '<span class="ro-check ro-check-on" title="발송 ' + esc(_inbHistDateTime(o.shipCheckedAt, 'md')) + '">발송✓</span>' : '<span class="ro-check">발송</span>'
    const tot = o.totals || {}
    const canCancel = st === 'requested' && o.shipChecked !== true && _roCanCancel(o)
    const cancelBtn = canCancel ? '<button class="btn btn-outline btn-sm ro-cancel-btn" onclick="event.stopPropagation();requestRoCancel(\'' + esc(o._id) + '\')">취소</button>' : ''
    return '<tr class="' + (st === 'cancelled' ? 'shist-cancelled-row' : '') + '" onclick="openRoDetail(\'' + esc(o._id) + '\')" style="cursor:pointer">'
      + '<td class="inbhist-no">' + esc(o.roNo || o._id) + '</td>'
      + '<td class="inbhist-time">' + esc(t) + '</td>'
      + '<td style="text-align:center">' + (Number(tot.lineCount) || 0) + '건 / ' + (Number(tot.qtyTotal) || 0) + '개</td>'
      + '<td style="text-align:center">' + statusCell + '</td>'
      + '<td style="text-align:center">' + conf + ' ' + ship + '</td>'
      + '<td class="inbhist-memo">' + esc(o.memo || '') + '</td>'
      + '<td style="text-align:center">' + cancelBtn + '</td>'
      + '</tr>'
  }).join('')
  if (sm) { const active = _roMyOrders.filter(o => o.status !== 'cancelled').length; sm.innerHTML = '발주 <strong>' + _roMyOrders.length + '</strong>건 (유효 ' + active + ')' }
}
function openRoDetail(id) {
  const o = _roMyOrders.find(x => x._id === id); if (!o) return
  const modal = document.getElementById('roDetailModal'); if (!modal) return
  const st = String(o.status || 'requested')
  const head = document.getElementById('roDetailHead')
  if (head) head.innerHTML = '<div class="ro-detail-no">' + esc(o.roNo || o._id) + '</div>'
    + '<div class="ro-detail-meta">' + esc(_inbHistDateTime(o.createdAt, 'full')) + ' · ' + esc(_storeNameById(o.storeId) || o.storeId) + ' · ' + (st === 'cancelled' ? '취소' : '요청됨') + (o.confirmChecked ? ' · 확인✓' : '') + (o.shipChecked ? ' · 발송✓' : '') + '</div>'
    + (o.memo ? ('<div class="ro-detail-memo">메모: ' + esc(o.memo) + '</div>') : '')
    + (st === 'cancelled' && o.cancelledReason ? ('<div class="ro-detail-memo">취소사유: ' + esc(o.cancelledReason) + '</div>') : '')
  const body = document.getElementById('roDetailBody')
  if (body) body.innerHTML = (Array.isArray(o.lines) ? o.lines : []).map(l => {
    const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(l.productCode) : null
    const nm = esc(l.productName || (p ? (p.nameKr || p.nameEn || '') : ''))
    return '<tr><td class="inbhist-no">' + esc(l.productCode) + '</td><td>' + nm + '</td><td style="text-align:center">' + esc(l.size) + '</td><td style="text-align:right">' + Math.max(0, Math.floor(Number(l.requestQty) || 0)) + '</td></tr>'
  }).join('') || '<tr><td colspan="4" class="inbhist-empty">라인 없음</td></tr>'
  modal.showModal(); if (typeof centerModal === 'function') centerModal(modal)
}
function closeRoDetail() { const m = document.getElementById('roDetailModal'); if (m) m.close() }
function downloadRoOrders() {
  if (typeof XLSX === 'undefined') { showToast('SheetJS 로딩 중...', 'warning'); return }
  if (!_roMyView || !_roMyView.length) { showToast('내보낼 발주가 없습니다', 'warning'); return }
  const header = ['발주번호', '일시', '매장', '상태', '확인', '발송', '품번', '상품명', '사이즈', '요청수량', '메모']
  const aoa = [header]
  _roMyView.forEach(o => {
    const when = _inbHistDateTime(o.createdAt, 'full'); const storeName = _storeNameById(o.storeId) || o.storeId || ''
    const st = o.status === 'cancelled' ? '취소' : '요청됨'; const conf = o.confirmChecked ? 'Y' : ''; const ship = o.shipChecked ? 'Y' : ''
    const lines = Array.isArray(o.lines) ? o.lines : []
    if (!lines.length) { aoa.push([o.roNo || o._id, when, storeName, st, conf, ship, '', '', '', 0, o.memo || '']); return }
    lines.forEach(l => {
      const p = (typeof _ssvFindProduct === 'function') ? _ssvFindProduct(l.productCode) : null
      const nm = p ? (p.nameKr || p.nameEn || '') : ''
      aoa.push([o.roNo || o._id, when, storeName, st, conf, ship, l.productCode || '', nm, l.size || '', Math.max(0, Math.floor(Number(l.requestQty) || 0)), o.memo || ''])
    })
  })
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 22 }, { wch: 17 }, { wch: 10 }, { wch: 7 }, { wch: 6 }, { wch: 6 }, { wch: 16 }, { wch: 22 }, { wch: 7 }, { wch: 9 }, { wch: 20 }]
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '보충발주')
  XLSX.writeFile(wb, '보충발주_' + (_storeNameById(_roMyCtx.store) || _roMyCtx.store || '매장') + '_' + (_roMyCtx.start || '') + '~' + (_roMyCtx.end || '') + '.xlsx')
}

// 발주 취소 (본인 매장/관리자 · status=='requested' && 미발송 · 사유 필수 · 1회성). field-restricted update — 규칙 (a) 분기.
function requestRoCancel(id) {
  const o = _roMyOrders.find(x => x._id === id); if (!o) { showToast('발주를 찾을 수 없습니다', 'warning'); return }
  if (String(o.status || '') !== 'requested' || o.shipChecked === true) { showToast('이미 발송/취소된 발주는 취소할 수 없습니다 (물류에 문의)', 'warning'); return }
  if (!_roCanCancel(o)) { showToast('본인 매장 발주만 취소할 수 있습니다', 'warning'); return }
  _roCancelTarget = id
  const modal = document.getElementById('roCancelModal'); if (!modal) return
  const info = document.getElementById('roCancelInfo'); if (info) info.textContent = (o.roNo || o._id) + ' · ' + (Number((o.totals || {}).qtyTotal) || 0) + '개'
  const r = document.getElementById('roCancelReason'); if (r) r.value = ''
  modal.showModal(); if (typeof centerModal === 'function') centerModal(modal)
  if (r) setTimeout(() => r.focus(), 30)
}
function closeRoCancelModal() { const m = document.getElementById('roCancelModal'); if (m) m.close(); _roCancelTarget = '' }
async function confirmRoCancel() {
  const roNo = _roCancelTarget; if (!roNo) return
  if (_roCancelInFlight) return
  const reasonEl = document.getElementById('roCancelReason')
  const reason = String(reasonEl ? reasonEl.value : '').trim()
  if (!reason) { showToast('취소 사유를 입력하세요', 'warning'); if (reasonEl) reasonEl.focus(); return }
  if (!db) { showToast('서버 연결 없음', 'warning'); return }
  try {
    _roCancelInFlight = true
    const uid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : ''
    // 🔴 field-restricted update — 규칙 (a) 취소 분기가 취소 4필드만 허용 + shipChecked==false && status=='requested' 서버 강제.
    await db.collection('replenishOrders').doc(roNo).update({
      status: 'cancelled', cancelledBy: uid, cancelledAt: new Date().toISOString(), cancelledReason: reason
    })
    if (typeof logActivity === 'function') logActivity('replenish', '발주취소', _storeNameById(_roStore) + '(' + _roStore + '): ' + roNo + ' · ' + reason)
    showToast('발주 취소 완료 · ' + roNo, 'success')
    closeRoCancelModal()
    roLoadMyOrders()
  } catch (e) {
    const denied = e && (e.code === 'permission-denied' || /permission/i.test(String(e.message || '')))
    showToast(denied ? '취소할 수 없습니다 — 이미 발송/취소되었거나 권한이 없습니다' : ('취소 실패 — 다시 시도하세요' + (e && e.message ? ' (' + e.message + ')' : '')), 'error')
  } finally { _roCancelInFlight = false }
}

window.openReplenishModal = openReplenishModal
window.closeReplenishModal = closeReplenishModal
window.roCloseKeep = roCloseKeep
window.roCloseDiscard = roCloseDiscard
window.roCloseCancelChoice = roCloseCancelChoice
window.roSwitchTab = roSwitchTab
window.roSuggestReload = roSuggestReload
window.onRoSuggestQty = onRoSuggestQty
window.roAddSuggest = roAddSuggest
window.renderRoManualResults = renderRoManualResults
window.selectRoManualProduct = selectRoManualProduct
window.chooseRoManualSize = chooseRoManualSize
window.onRoStageQty = onRoStageQty
window.removeRoStage = removeRoStage
window.onRoMemoInput = onRoMemoInput
window.roSubmit = roSubmit
window.roConfirmProceed = roConfirmProceed
window.closeRoConfirmDialog = closeRoConfirmDialog
window.roLoadMyOrders = roLoadMyOrders
window.openRoDetail = openRoDetail
window.closeRoDetail = closeRoDetail
window.downloadRoOrders = downloadRoOrders
window.requestRoCancel = requestRoCancel
window.closeRoCancelModal = closeRoCancelModal
window.confirmRoCancel = confirmRoCancel
