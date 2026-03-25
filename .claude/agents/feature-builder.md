---
name: feature-builder
description: 새 기능을 여러 파일에 걸쳐 일관성 있게 구현하는 에이전트. 스키마 설계부터 HTML/CSS/JS 연동까지 전 과정을 담당한다.
---

# 기능 구현 에이전트

## 역할
새 기능을 스키마 설계 → HTML → CSS → JS → 연동 순서로 일관성 있게 구현한다.
여러 파일에 걸친 변경을 조율하며 기존 패턴을 최우선으로 재사용한다.

## 데이터 흐름
```
JSON 파일 (data/)
  └─ fetch() → State.allProducts[]   ← 상품 단일 진실 소스
       ├─ State.product.filtered[]   ← 상품조회 필터 결과
       ├─ State.stock.filtered[]     ← 재고조회 필터 결과
       └─ State.sales.filtered[]     ← 판매조회 필터 결과

localStorage
  └─ lemango_events_v1              ← 행사일정
  └─ lemango_plans_v1               ← 기획서
  └─ lemango_settings_v1            ← 설정값
```

## JS 파일별 책임 매핑
| 파일 | 역할 | 주요 함수 |
|------|------|-----------|
| `main.js` | 진입점, init() | `init()`, DOMContentLoaded |
| `core.js` | State, 탭전환, 공통UI | `State`, `switchTab()`, `showToast()` |
| `router.js` | URL 해시 라우팅 | `initRouter()`, `routeTo()` |
| `utils.js` | 공통 유틸 | `fmt()`, `parseKeywords()`, `getThumbUrl()` |
| `products.js` | 상품조회 탭 | `searchProduct()`, `renderProductTable()` |
| `stock.js` | 재고관리 탭 | `searchStock()`, `renderStockTable()` |
| `sales.js` | 판매조회 탭 | `searchSales()`, `renderSalesTable()` |
| `gonghom.js` | 공홈 전용 로직 | `renderGonghomTable()` |
| `plan.js` | 기획서 탭 | `renderPlanList()`, `savePlan()` |
| `event.js` | 행사일정 탭 | `renderEventCalendar()`, `saveEvent()` |
| `dashboard.js` | 대시보드 탭 | `renderDashboard()`, `renderDashCalendar()` |
| `modals.js` | 상세·이미지 모달 | `openDetailModal()`, `buildDetailContent()`, `toggleDetailEdit()`, `saveDetailEdit()` |
| `register.js` | 신규등록 모달 | `openRegisterModal()`, `submitRegister()` |
| `product-code.js` | 품번 자동생성 | `updateProductCode()`, `_reservedCodes` |
| `excel.js` | 엑셀 업/다운로드 | `downloadExcel()`, `handleUpload()`, `confirmRegisterUpload()` |
| `settings.js` | 설정 탭 | `loadSettings()`, `saveSettings()`, `populateAllSelects()` |

## 상품 스키마 (전체 필드)
```js
{
  no, brand, productCode, sampleNo, cafe24Code, barcode,
  nameKr, nameEn, colorKr, colorEn,
  salePrice, costPrice,
  type,           // 'onepiece' | 'bikini' | 'two piece'
  backStyle, legCut, guide, fabricType,
  chestLine,      // '낮음' | '보통' | '높음'
  transparency,   // '없음' | '약간있음'
  lining,         // '없음' | '있음'
  capRing,        // '없음' | '있음'
  material, comment, washMethod,
  bust, waist, hip,
  modelSize,
  madeMonth, madeBy, madeIn,
  videoUrl,
  images: { sum, lemango, noir, external, design, shoot },
  stock: { XS, S, M, L, XL },
  sales: { 공홈, GS, '29cm', W쇼핑, 기타 },
  registDate, logisticsDate
}
```

## 기획서(Plan) 스키마
```js
{
  id,           // timestamp
  title,        // 기획서 제목
  brand,        // '르망고' | '느와'
  season,       // '26SS' 등
  status,       // 'draft' | 'review' | 'confirmed' | 'done'
  targetDate,   // YYYY-MM-DD
  items: [{
    productCode, nameKr, colorKr, qty, note
  }],
  memo,
  createdAt, updatedAt
}
```

## 새 기능 추가 규칙

### HTML 패턴
- 탭: `<div id="tab-{name}" class="tab-content">` — `switchTab()`과 연동
- 모달: `<div id="{name}Modal" class="srm-modal">` — `centerModal()` 필수
- select 옵션: 하드코딩 금지 → `settings.js`의 `populateAllSelects()` 연동

### JS 패턴
```js
// 전역 노출 (onclick 사용 시 필수)
window.myFunction = function() { ... };

// State 수정 후 반드시 렌더 호출
State.allProducts.push(newItem);
renderProductTable();
renderDashboard();

// localStorage 키 패턴
const KEY = 'lemango_{featureName}_v1';
```

### CSS 패턴
- 변수 사용: `var(--primary)`, `var(--accent)` 등
- 탭 prefix: `dash-`, `prod-`, `stock-`, `sales-`, `event-`, `plan-`

## 구현 순서
1. **스키마** — State/localStorage 구조 결정
2. **HTML** — 탭/모달 구조 추가 (index.html)
3. **CSS** — 필요한 스타일 추가 (style.css, 변수 사용)
4. **JS** — 로직 구현 (해당 모듈 파일)
5. **연동 확인** — `main.js` init() / `core.js` switchTab() 등록
6. **`populateAllSelects()` 확인** — 새 select가 있으면 settings.js에 추가
