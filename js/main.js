// =============================================
// ===== 초기화 =====
// =============================================
async function init() {
  renderDate()
  bindTabs()
  initDraggable()
  initRegisterDraggable()
  initPlanRegisterDraggable()
  initPlanDetailDraggable()
  makeDraggableResizable(document.getElementById('stockRegisterModal'))
  makeDraggableResizable(document.getElementById('outgoingModal'))
  makeDraggableResizable(document.getElementById('gonghomPreviewModal'))

  // 해시 기반 초기 탭
  const initTab = location.hash.replace('#', '') || 'dashboard'
  switchTab(initTab, false)

  try {
    const [lem, noir] = await Promise.all([
      fetch('data/products_lemango.json').then(r => r.json()),
      fetch('data/products_noir.json').then(r => r.json())
    ])
    State.allProducts = [...lem, ...noir]
    State.product.filtered = [...State.allProducts]
    State.stock.filtered   = [...State.allProducts]
    State.sales.filtered   = [...State.allProducts]
    // 샘플 기획 데이터
    State.planItems.push({
      no: 1,
      sampleNo: '26SS0201',
      productCode: '',
      brand: '르망고',
      nameKr: '아말피 홀터넥',
      nameEn: 'Amalfi Halterneck',
      colorKr: '코랄 핑크',
      colorEn: 'Coral Pink',
      salePrice: 168000,
      costPrice: 58000,
      type: 'onepiece',
      year: '2026',
      season: '2',
      gender: 'W',
      memo: '26SS2 시즌 원피스 신규 기획. 홀터넥 + 오픈백 구조. 포일 원단 검토 중.',
      images: {
        sum: ['https://images.unsplash.com/photo-1604871000636-074fa5117945?w=400'],
        lemango: '',
        noir: ''
      },
      schedule: {
        design:     { start: '2026-02-01', end: '2026-02-20' },
        production: { start: '2026-02-21', end: '2026-03-25' },
        image:      { start: '2026-03-26', end: '2026-04-05' },
        register:   { start: '2026-04-06', end: '2026-04-10' },
        logistics:  { start: '2026-04-11', end: '2026-04-20' }
      }
    })
    State.plan.filtered    = State.planItems.filter(p => !p.confirmed)
    populateAllSelects()
    renderDashboard()
    renderProductTable()
    renderStockTable()
    renderSalesTable()
    renderPlanTable()
  } catch (e) {
    showToast('데이터 로드 실패: ' + e.message, 'error')
    console.error(e)
  }
  // Enter 키 검색
  ;['pKeyword','sKeyword','slKeyword','npKeyword'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') el.closest('.tab-content')?.querySelector('.btn-primary')?.click() })
  })
}

document.addEventListener('DOMContentLoaded', init)
