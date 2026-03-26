// =============================================
// ===== 판매조회 =====
// =============================================

// ===== 플랫폼 상태 초기화 =====
function initSalesPlatforms() {
  if (!State.sales.activePlatforms.length && !State.sales.inactivePlatforms.length) {
    State.sales.activePlatforms = [..._platforms]
    State.sales.inactivePlatforms = []
  }
  // 설정 탭에서 플랫폼 추가/삭제 시 동기화
  const known = new Set([...State.sales.activePlatforms, ...State.sales.inactivePlatforms])
  _platforms.forEach(pl => {
    if (!known.has(pl)) State.sales.activePlatforms.push(pl)
  })
  State.sales.activePlatforms = State.sales.activePlatforms.filter(pl => _platforms.includes(pl))
  State.sales.inactivePlatforms = State.sales.inactivePlatforms.filter(pl => _platforms.includes(pl))
}

// ===== 검색 =====
function searchSales() {
  const keywords = parseKeywords(document.getElementById('slKeyword').value)
  const dateFrom = document.getElementById('slDateFrom').value
  const dateTo   = document.getElementById('slDateTo').value
  const platform = document.getElementById('slPlatform').value

  let result = State.allProducts.filter(p => {
    if (keywords.length) {
      const targets = [p.productCode, p.nameKr]
      if (!keywords.some(kw => matchAnyTarget(targets, kw))) return false
    }
    if (dateFrom || dateTo) {
      if (!isInRange(p.registDate, dateFrom, dateTo)) return false
    }
    if (platform !== 'all' && !(p.sales?.[platform] > 0)) return false
    return true
  })
  State.sales.page = 1
  State.sales.filtered = sortData(result, State.sales.sort.key, State.sales.sort.dir)
  renderSalesTable()
}

function resetSales() {
  ;['slKeyword','slDateFrom','slDateTo'].forEach(id => document.getElementById(id).value = '')
  document.getElementById('slPlatform').value = 'all'
  document.getElementById('slPageSize').value = '10'
  State.sales.page = 1
  State.sales.pageSize = 10
  State.sales.activePlatforms = [..._platforms]
  State.sales.inactivePlatforms = []
  State.sales.filtered = [...State.allProducts]
  State.sales.sort = { key: 'totalSales', dir: 'desc' }
  renderSalesTable()
}

function changeSalesPageSize(val) {
  State.sales.pageSize = parseInt(val) || 0
  State.sales.page = 1
  renderSalesTable()
}

// ===== 플랫폼 컬럼 제거/추가 =====
function removeSalesPlatform(pl) {
  State.sales.activePlatforms = State.sales.activePlatforms.filter(x => x !== pl)
  State.sales.inactivePlatforms.push(pl)
  renderSalesTable()
}

function activateSalesPlatform(pl, insertIdx) {
  State.sales.inactivePlatforms = State.sales.inactivePlatforms.filter(x => x !== pl)
  if (insertIdx === undefined || insertIdx < 0) {
    State.sales.activePlatforms.push(pl)
  } else {
    State.sales.activePlatforms.splice(insertIdx, 0, pl)
  }
  renderSalesTable()
}

function reorderSalesPlatform(fromPl, toIdx) {
  const arr = State.sales.activePlatforms
  const fromIdx = arr.indexOf(fromPl)
  if (fromIdx < 0) return
  arr.splice(fromIdx, 1)
  const insertAt = toIdx > fromIdx ? toIdx - 1 : toIdx
  arr.splice(insertAt < 0 ? 0 : insertAt, 0, fromPl)
  renderSalesTable()
}

// ===== 비활성 영역 렌더 =====
function renderInactiveArea() {
  const area = document.getElementById('slInactiveArea')
  const tags = document.getElementById('slInactiveTags')
  const inactive = State.sales.inactivePlatforms
  if (!inactive.length) { area.style.display = 'none'; return }
  area.style.display = 'flex'
  tags.innerHTML = inactive.map(pl =>
    `<span class="sl-inactive-chip" draggable="true" data-platform="${pl}">${pl}</span>`
  ).join('')

  // 비활성 칩 drag 이벤트
  tags.querySelectorAll('.sl-inactive-chip').forEach(chip => {
    chip.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', chip.dataset.platform)
      e.dataTransfer.setData('application/x-sl-source', 'inactive')
      chip.classList.add('sl-dragging')
      setTimeout(() => chip.style.opacity = '0.4', 0)
    })
    chip.addEventListener('dragend', () => {
      chip.classList.remove('sl-dragging')
      chip.style.opacity = ''
    })
  })

  // 비활성 영역 자체가 드롭 대상 (플랫폼 헤더에서 여기로 드래그하면 제거)
  area.ondragover = e => { e.preventDefault(); area.classList.add('sl-drop-target') }
  area.ondragleave = () => area.classList.remove('sl-drop-target')
  area.ondrop = e => {
    e.preventDefault()
    area.classList.remove('sl-drop-target')
    const src = e.dataTransfer.getData('application/x-sl-source')
    const pl  = e.dataTransfer.getData('text/plain')
    if (src === 'header' && pl) removeSalesPlatform(pl)
  }
}

// ===== 메인 렌더 =====
function renderSalesTable() {
  initSalesPlatforms()
  renderInactiveArea()

  const data = State.sales.filtered
  const sort = State.sales.sort
  const page = State.sales.page || 1
  const ps   = getPageSize('sales')
  const pageData = ps > 0 ? data.slice((page - 1) * ps, page * ps) : data
  document.getElementById('slTableMeta').textContent = `검색결과 ${data.length}건`

  if (!data.length) {
    document.getElementById('slTableWrap').innerHTML = `<div class="empty-state"><p>검색 결과가 없습니다.</p></div>`
    document.getElementById('slPagination').innerHTML = ''
    return
  }

  const active = State.sales.activePlatforms

  // tfoot 합계 (전체 필터 결과 기준, 전체 _platforms 기준)
  const allPlatTotals = {}, allPlatRevTotals = {}
  _platforms.forEach(pl => {
    allPlatTotals[pl]    = data.reduce((s, p) => s + (p.sales?.[pl] || 0), 0)
    allPlatRevTotals[pl] = data.reduce((s, p) => s + (p.sales?.[pl] || 0) * (p.salePrice || 0), 0)
  })
  const grandQty = _platforms.reduce((s, pl) => s + allPlatTotals[pl], 0)
  const grandRev = _platforms.reduce((s, pl) => s + allPlatRevTotals[pl], 0)

  // 2단 헤더 — 1행
  let h1 = `
    <th rowspan="2">이미지</th>
    <th rowspan="2" class="sortable" data-key="productCode">품번<span class="sort-icon">⇅</span></th>
    <th rowspan="2" class="sortable" data-key="nameKr">상품명<span class="sort-icon">⇅</span></th>
    <th rowspan="2" class="sortable" data-key="salePrice" style="text-align:right">판매가<span class="sort-icon">⇅</span></th>
    <th colspan="2" class="sales-group-th">합계</th>`
  active.forEach((pl, i) => {
    h1 += `<th colspan="2" class="sales-group-th sl-plat-th" draggable="true" data-platform="${pl}" data-pidx="${i}">` +
      `${pl}<span class="sl-plat-remove" onclick="event.stopPropagation();removeSalesPlatform('${pl}')">✕</span></th>`
  })

  // 2단 헤더 — 2행
  let h2 = `
    <th class="sortable sales-sub-th" data-key="totalSales" style="text-align:right">수량<span class="sort-icon">⇅</span></th>
    <th class="sortable sales-sub-th" data-key="totalRevenue" style="text-align:right">매출액<span class="sort-icon">⇅</span></th>`
  active.forEach(pl => {
    h2 += `<th class="sortable sales-sub-th" data-key="sales.${pl}" style="text-align:right">수량<span class="sort-icon">⇅</span></th>` +
      `<th class="sortable sales-sub-th" data-key="rev.${pl}" style="text-align:right">매출액<span class="sort-icon">⇅</span></th>`
  })

  // tbody
  const tbody = pageData.map(p => {
    const totalQty = getTotalSales(p)
    const totalRev = totalQty * (p.salePrice || 0)
    let row = `<tr>
      <td>${renderThumb(p)}</td>
      <td><span class="code-link" onclick="openDetailModal('${p.productCode}')">${p.productCode}</span></td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis" title="${p.nameKr}">${p.nameKr}</td>
      <td style="text-align:right"><span class="price">${fmtPrice(p.salePrice)}</span></td>
      <td class="sl-qty sl-total-col">${fmtNum(totalQty)}</td>
      <td class="sl-rev sl-total-col">${fmtNum(totalRev)}</td>`
    active.forEach(pl => {
      const qty = p.sales?.[pl] || 0
      const rev = qty * (p.salePrice || 0)
      row += `<td class="sl-qty">${fmtNum(qty)}</td><td class="sl-rev">${fmtNum(rev)}</td>`
    })
    return row + '</tr>'
  }).join('')

  // tfoot
  let tf = `<tr><td colspan="3" style="text-align:right">합계</td><td></td>
    <td class="sl-qty sl-total-col">${fmtNum(grandQty)}</td>
    <td class="sl-rev sl-total-col">${fmtNum(grandRev)}</td>`
  active.forEach(pl => {
    tf += `<td class="sl-qty">${fmtNum(allPlatTotals[pl])}</td><td class="sl-rev">${fmtNum(allPlatRevTotals[pl])}</td>`
  })
  tf += '</tr>'

  document.getElementById('slTableWrap').innerHTML = `
    <table class="data-table sales-table" id="salesTable">
      <thead>
        <tr>${h1}</tr>
        <tr class="sales-sub-row">${h2}</tr>
      </thead>
      <tbody>${tbody}</tbody>
      <tfoot>${tf}</tfoot>
    </table>`

  bindSortHeader('salesTable', 'sales', renderSalesTable)
  updateSortIcons('salesTable', sort)
  if (ps > 0) {
    renderPagination('slPagination', 'sales', 'renderSalesTable')
  } else {
    document.getElementById('slPagination').innerHTML = ''
  }

  // 드래그앤드롭 바인딩
  bindSalesDragDrop()
}

// =============================================
// ===== 드래그앤드롭 (플랫폼 헤더 간 이동) =====
// =============================================
function bindSalesDragDrop() {
  const platThs = document.querySelectorAll('#salesTable thead .sl-plat-th')

  platThs.forEach(th => {
    th.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', th.dataset.platform)
      e.dataTransfer.setData('application/x-sl-source', 'header')
      th.classList.add('sl-dragging')
    })
    th.addEventListener('dragend', () => {
      th.classList.remove('sl-dragging')
      clearDropIndicators()
    })

    // 드롭 대상 (다른 플랫폼 헤더 위)
    th.addEventListener('dragover', e => {
      e.preventDefault()
      clearDropIndicators()
      const rect = th.getBoundingClientRect()
      const mid = rect.left + rect.width / 2
      if (e.clientX < mid) {
        th.classList.add('sl-drag-over-left')
      } else {
        th.classList.add('sl-drag-over-right')
      }
    })
    th.addEventListener('dragleave', () => {
      th.classList.remove('sl-drag-over-left', 'sl-drag-over-right')
    })
    th.addEventListener('drop', e => {
      e.preventDefault()
      clearDropIndicators()
      const pl  = e.dataTransfer.getData('text/plain')
      const src = e.dataTransfer.getData('application/x-sl-source')
      if (!pl) return

      const rect = th.getBoundingClientRect()
      const mid = rect.left + rect.width / 2
      const targetIdx = parseInt(th.dataset.pidx)
      const insertIdx = e.clientX < mid ? targetIdx : targetIdx + 1

      if (src === 'inactive') {
        activateSalesPlatform(pl, insertIdx)
      } else if (src === 'header') {
        reorderSalesPlatform(pl, insertIdx)
      }
    })
  })
}

function clearDropIndicators() {
  document.querySelectorAll('.sl-drag-over-left, .sl-drag-over-right').forEach(el => {
    el.classList.remove('sl-drag-over-left', 'sl-drag-over-right')
  })
}
