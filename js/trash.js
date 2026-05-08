// =============================================
// ===== 휴지통 (Soft-deleted Products Trash) =====
// =============================================
// Grade 3+ admin only. Restore (deleted:false) or permanent delete (Firestore deleteDoc + State splice).

let _trashSearch = ''
let _trashDateFrom = ''
let _trashDateTo = ''
let _trashDeleter = ''

function _trashCanAccess() {
  const grade = (typeof _currentUserGrade !== 'undefined' && _currentUserGrade) ? _currentUserGrade : 1
  return grade >= 3
}

function _trashGetItems() {
  const all = (State.allProducts || []).filter(p => p.deleted === true)
  // Sort by deletedAt desc (newest first)
  all.sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')))
  return all
}

function _trashApplyFilters(items) {
  const q = (_trashSearch || '').trim().toLowerCase()
  return items.filter(p => {
    if (q) {
      const haystack = [p.productCode, p.nameKr, p.nameEn, p.colorKr]
        .map(s => String(s || '').toLowerCase())
      if (!haystack.some(h => h.includes(q))) return false
    }
    if (_trashDateFrom) {
      const at = String(p.deletedAt || '').slice(0, 10)
      if (!at || at < _trashDateFrom) return false
    }
    if (_trashDateTo) {
      const at = String(p.deletedAt || '').slice(0, 10)
      if (!at || at > _trashDateTo) return false
    }
    if (_trashDeleter && p.deletedBy !== _trashDeleter) return false
    return true
  })
}

function renderTrashTab() {
  if (!_trashCanAccess()) {
    const page = document.getElementById('trashPage')
    if (page) page.innerHTML = '<div class="empty-state"><p>접근 권한이 없습니다 (Grade 3+ 관리자 전용).</p></div>'
    return
  }
  const page = document.getElementById('trashPage')
  if (!page) return
  const allDeleted = _trashGetItems()
  const filtered = _trashApplyFilters(allDeleted)
  const escFn = (typeof esc === 'function') ? esc : (s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'))

  // Build distinct deleter list (uid → name) for filter dropdown
  const deleters = {}
  allDeleted.forEach(p => {
    if (p.deletedBy) deleters[p.deletedBy] = p.deletedByName || p.deletedBy
  })
  const deleterOpts = Object.entries(deleters)
    .map(([uid, name]) => `<option value="${escFn(uid)}"${_trashDeleter === uid ? ' selected' : ''}>${escFn(name)}</option>`)
    .join('')

  const fmtDateTime = (iso) => {
    if (!iso) return '-'
    return String(iso).slice(0, 10) + ' ' + String(iso).slice(11, 16)
  }

  const rowsHtml = filtered.length
    ? filtered.map(p => {
        const code = escFn(p.productCode || '')
        const name = escFn(p.nameKr || '')
        const brand = escFn(p.brand || '')
        const color = escFn(p.colorKr || '')
        const at = fmtDateTime(p.deletedAt)
        const by = escFn(p.deletedByName || '-')
        return `<tr>
          <td><span style="font-family:'SF Mono',Consolas,monospace;font-weight:600">${code}</span></td>
          <td>${brand}</td>
          <td>${name}</td>
          <td>${color || '-'}</td>
          <td style="font-size:12px;color:#666">${at}</td>
          <td style="font-size:12px">${by}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm btn-outline" onclick="viewTrashedProduct('${code.replace(/'/g, "\\'")}')">🔍 조회</button>
            <button class="btn btn-sm btn-outline" onclick="restoreProduct('${code.replace(/'/g, "\\'")}')">🔄 복원</button>
            <button class="btn btn-sm btn-outline btn-danger-sm" onclick="requestPermanentDelete('${code.replace(/'/g, "\\'")}')">🗑️ 영구삭제</button>
          </td>
        </tr>`
      }).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:32px;color:#999">휴지통이 비어있습니다.</td></tr>'

  page.innerHTML = `
    <div class="trash-header">
      <h2 class="trash-title">🗑️ 휴지통</h2>
      <p class="trash-desc">소프트 삭제된 상품 ${allDeleted.length}건. 복원하면 활성 상품으로 돌아갑니다. 영구삭제는 되돌릴 수 없습니다.</p>
    </div>
    <div class="trash-filters">
      <input type="text" id="trashSearchInput" placeholder="품번/상품명/색상 검색..." class="trash-search" value="${escFn(_trashSearch)}" oninput="_trashOnSearch(this.value)" />
      <input type="date" class="trash-date" value="${escFn(_trashDateFrom)}" onchange="_trashOnDateFrom(this.value)" placeholder="삭제일 시작" />
      <span style="color:#999">~</span>
      <input type="date" class="trash-date" value="${escFn(_trashDateTo)}" onchange="_trashOnDateTo(this.value)" placeholder="삭제일 끝" />
      <select class="trash-deleter" onchange="_trashOnDeleter(this.value)">
        <option value="">전체 삭제자</option>
        ${deleterOpts}
      </select>
      <button class="btn btn-outline" onclick="_trashResetFilters()">초기화</button>
      <span style="flex:1"></span>
      <span class="trash-count">${filtered.length}건 / ${allDeleted.length}건</span>
    </div>
    <div class="trash-table-wrap">
      <table class="data-table trash-table">
        <thead>
          <tr>
            <th style="width:140px">품번</th>
            <th style="width:100px">브랜드</th>
            <th>상품명</th>
            <th style="width:100px">색상</th>
            <th style="width:140px">삭제일</th>
            <th style="width:120px">삭제자</th>
            <th style="width:200px">액션</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `
}
window.renderTrashTab = renderTrashTab

function _trashOnSearch(v) { _trashSearch = v || ''; renderTrashTab() }
function _trashOnDateFrom(v) { _trashDateFrom = v || ''; renderTrashTab() }
function _trashOnDateTo(v) { _trashDateTo = v || ''; renderTrashTab() }
function _trashOnDeleter(v) { _trashDeleter = v || ''; renderTrashTab() }
function _trashResetFilters() {
  _trashSearch = ''; _trashDateFrom = ''; _trashDateTo = ''; _trashDeleter = ''
  renderTrashTab()
}
window._trashOnSearch = _trashOnSearch
window._trashOnDateFrom = _trashOnDateFrom
window._trashOnDateTo = _trashOnDateTo
window._trashOnDeleter = _trashOnDeleter
window._trashResetFilters = _trashResetFilters

// ===== Restore =====
async function restoreProduct(code) {
  if (!_trashCanAccess()) { showToast('권한이 없습니다.', 'warning'); return }
  const p = State.allProducts.find(x => x.productCode === code)
  if (!p) { showToast('상품을 찾을 수 없습니다.', 'error'); return }
  if (!p.deleted) { showToast('이미 활성 상품입니다.', 'info'); return }
  const ok = await (typeof korConfirm === 'function'
    ? korConfirm(`"${p.productCode}" 상품을 복원하시겠습니까?\n활성 상품 목록으로 돌아갑니다.`, '복원', '취소')
    : Promise.resolve(confirm('복원하시겠습니까?')))
  if (!ok) return

  // Clear deletion flags
  delete p.deleted
  delete p.deletedAt
  delete p.deletedBy
  delete p.deletedByName

  try {
    if (typeof saveProducts === 'function') await saveProducts()
  } catch (e) {
    showToast('복원 저장 실패: ' + (e.message || e), 'error')
    // Re-mark deleted on failure
    p.deleted = true
    return
  }

  if (typeof logActivity === 'function') {
    logActivity('update', '상품조회', `상품복원: ${code}${p.nameKr ? ' (' + p.nameKr + ')' : ''}`)
  }
  if (typeof renderProductTable === 'function') renderProductTable()
  if (typeof renderStockTable === 'function') renderStockTable()
  if (typeof renderSalesTable === 'function') renderSalesTable()
  if (typeof renderDashboard === 'function') renderDashboard()
  renderTrashTab()
  showToast(`"${code}" 복원되었습니다.`, 'success')
}
window.restoreProduct = restoreProduct

// ===== Permanent delete (type-to-confirm) =====
function requestPermanentDelete(code) {
  if (!_trashCanAccess()) { showToast('권한이 없습니다.', 'warning'); return }
  const p = State.allProducts.find(x => x.productCode === code)
  if (!p || !p.deleted) { showToast('대상 상품을 찾을 수 없습니다.', 'error'); return }
  // Reuse the productDeleteConfirmModal but with stronger warning
  const modal = document.getElementById('productDeleteConfirmModal')
  if (!modal) { showToast('모달을 찾을 수 없습니다.', 'error'); return }
  const expected = p.productCode
  document.getElementById('prodDelTitle').textContent = '⚠️ 상품 영구삭제 (복구 불가)'
  document.getElementById('prodDelWarning').innerHTML =
    '<strong>⚠️ 영구 삭제는 되돌릴 수 없습니다.</strong> 매출 기록은 그대로 남지만 상품 정보는 완전히 사라집니다. 삭제하려면 아래 품번을 정확히 입력하세요.'
  document.getElementById('prodDelTargetCode').textContent = expected
  const meta = []
  if (p.nameKr) meta.push(p.nameKr)
  if (p.brand) meta.push(p.brand)
  const revCount = (p.revenueLog || []).length
  if (revCount > 0) meta.push(`매출 기록 ${revCount}건 (보존됨 — 통계엔 영향 없음)`)
  document.getElementById('prodDelTargetMeta').textContent = meta.join(' · ')
  document.getElementById('prodDelInputLabel').textContent = `위 품번(${expected})을 정확히 입력해주세요`
  const input = document.getElementById('prodDelInput')
  input.value = ''
  input.classList.remove('pdc-input-match')
  input.placeholder = expected
  document.getElementById('prodDelConfirmBtn').disabled = true
  modal._prodDelExpected = expected
  modal._prodDelCode = expected
  modal._prodDelMode = 'permanent' // marker for confirmProductDelete to branch
  if (typeof centerModal === 'function') centerModal(modal)
  modal.showModal()
  setTimeout(() => input.focus(), 80)
}
window.requestPermanentDelete = requestPermanentDelete

// confirmProductDelete in modals.js handles soft-delete; permanent-delete branch checks _prodDelMode === 'permanent'
async function _trashPermanentDeleteExec(code) {
  if (!_trashCanAccess()) { showToast('권한이 없습니다.', 'warning'); return false }
  const idx = State.allProducts.findIndex(x => x.productCode === code)
  if (idx < 0) { showToast('대상을 찾을 수 없습니다.', 'error'); return false }
  const p = State.allProducts[idx]
  const name = p.nameKr || ''

  // Splice from State
  State.allProducts.splice(idx, 1)

  // Delete related Firestore comments (per existing pattern)
  if (typeof db !== 'undefined' && db) {
    try {
      const snap = await db.collection('comments')
        .where('modalType', '==', 'product')
        .where('targetId', '==', code)
        .get()
      if (snap.docs.length) {
        const batch = db.batch()
        snap.docs.forEach(doc => batch.delete(doc.ref))
        await batch.commit()
      }
    } catch (e) { console.warn('상품 댓글 삭제 실패:', e) }
  }

  try {
    if (typeof saveProducts === 'function') await saveProducts()
  } catch (e) {
    showToast('영구삭제 저장 실패: ' + (e.message || e), 'error')
    // Restore in memory (best effort)
    State.allProducts.splice(idx, 0, p)
    return false
  }

  if (typeof logActivity === 'function') {
    logActivity('delete', '상품조회', `상품영구삭제: ${code}${name ? ' (' + name + ')' : ''}`)
  }
  if (typeof renderProductTable === 'function') renderProductTable()
  if (typeof renderStockTable === 'function') renderStockTable()
  if (typeof renderSalesTable === 'function') renderSalesTable()
  if (typeof renderDashboard === 'function') renderDashboard()
  renderTrashTab()
  return true
}
window._trashPermanentDeleteExec = _trashPermanentDeleteExec

// View a soft-deleted product in read-only mode — reuses the existing detail modal
function viewTrashedProduct(code) {
  if (!_trashCanAccess()) { showToast('권한이 없습니다.', 'warning'); return }
  const p = State.allProducts.find(x => x.productCode === code)
  if (!p || !p.deleted) { showToast('대상 상품을 찾을 수 없습니다.', 'error'); return }
  if (typeof openDetailModal === 'function') openDetailModal(code, { readOnly: true })
}
window.viewTrashedProduct = viewTrashedProduct
