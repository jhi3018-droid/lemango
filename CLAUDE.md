# 르망고 상품 관리 시스템 — CLAUDE.md

## 프로젝트 개요
르망고(수영복 브랜드) 내부 상품 관리 웹 시스템.
순수 HTML + CSS + JavaScript (프레임워크 없음). 로컬 서버: `python -m http.server 8765`

## 파일 구조
```
르망고/
├── index.html              # 전체 화면 (탭 7개 + 모달들)
├── style.css               # 전체 스타일
├── firebase.json           # Firebase Hosting 설정
├── .firebaserc             # Firebase 프로젝트 (lemango-office)
├── CLAUDE.md               # 이 파일
├── .claude/agents/         # 전문 에이전트
├── js/                     # JS 모듈 분리 (16개 파일)
│   ├── core.js             # State, 설정, 플랫폼, populateAllSelects
│   ├── router.js           # 해시 기반 라우팅 (navigateTo, switchTab)
│   ├── utils.js            # 유틸 함수, 페이지네이션 (renderPagination, goPage)
│   ├── products.js         # 상품조회 검색·렌더
│   ├── stock.js            # 재고조회·입고·출고
│   ├── sales.js            # 판매조회·공홈주문
│   ├── plan.js             # 신규기획
│   ├── event.js            # 행사일정 캘린더·CRUD
│   ├── dashboard.js        # 대시보드 + 대시보드 캘린더
│   ├── modals.js           # 모달 (이미지·상세·등록 등)
│   ├── register.js         # 신규등록 모달 로직
│   ├── excel.js            # 엑셀 업로드/다운로드 (SheetJS)
│   ├── settings.js         # 설정 탭 렌더·CRUD
│   ├── design.js           # 디자인 코드·백스타일 관리
│   ├── upload.js           # 업로드 미리보기·확정
│   ├── work.js             # 업무일정 CRUD·검색·렌더
│   └── main.js             # init(), DOMContentLoaded
└── data/
    ├── products_lemango.json   # 르망고 26SS (실제 상품 데이터)
    ├── products_noir.json      # 르망고 느와 (실제 상품 데이터)
    └── combined.json           # 통합
```

## 화면 구성 (탭 8개)
| 탭 | ID | 설명 |
|----|----|------|
| 대시보드 | `tab-dashboard` | KPI 카드, 캘린더(좌)+매출현황·BEST TOP10(우) 2컬럼 |
| 상품조회 | `tab-product` | 검색+필터, 데이터 테이블, 품번 클릭→상세 모달 |
| 재고 관리 | `tab-stock` | 사이즈별(XS~XL) 재고 테이블 + 신규입고/개별출고 모달 |
| 판매조회 | `tab-sales` | 플랫폼별 판매 테이블 + 공홈 주문 업로드 |
| 신규기획 | `tab-plan` | 기획 상품 관리, 일정(단계+날짜 필터), 상품조회 이전 |
| 행사일정 | `tab-event` | 월간 캘린더 + 행사 등록/수정/삭제 (localStorage) |
| 업무일정 | `tab-work` | 업무 일정 등록/조회/수정/삭제 (localStorage) |
| 설정 | `tab-settings` | 브랜드·타입·판매채널·업무카테고리 등 기본 옵션 관리 |

## 전역 상태 (`State` 객체)
```js
State.allProducts          // 전체 상품 배열 (단일 진실 소스)
State.planItems            // 신규기획 아이템 배열
State.product.filtered     // 상품조회 필터 결과
State.stock.filtered       // 재고조회 필터 결과
State.sales.filtered       // 판매조회 필터 결과
State.plan.filtered        // 기획조회 필터 결과
State.workItems            // 업무일정 아이템 배열
State.work.filtered        // 업무일정 필터 결과
State.modal.images/idx     // 이미지 모달 상태
```

## 상품 데이터 스키마 (`State.allProducts` 아이템)
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
  bust, waist, hip,   // 사이즈 규격 (cm 단위 텍스트)
  modelSize,
  madeMonth, madeBy, madeIn,
  videoUrl,
  saleStatus,          // '판매중' | '종료' | '추가생산'
  productionStatus,    // '지속생산' | '생산중단' (상세모달 재고현황 버튼)
  productCodeLocked,   // boolean — true 시 품번 수정 불가 (🔒 품번 확정 후)
  images: {
    sum,          // ← 목록/상세 이미지 우선 사용 (업로드 SUM 컬럼)
    lemango,      // 자사몰 URL 배열 (urlJasa 저장 시 여기에 통합)
    noir,         // 느와 자사몰 (urlJasa 저장 후 빈 배열)
    external, design, shoot
  },
  barcodes: { XS, S, M, L, XL },  // 사이즈별 바코드
  stock: { XS, S, M, L, XL },
  stockLog: [{ type:'in'|'out', date, XS,S,M,L,XL, memo, registeredAt }],
  sales: { 공홈, GS, '29cm', W쇼핑, 기타 },  // 키는 _platforms 배열 기준 (동적)
  scheduleLog: [{ confirmedAt, schedule: { design, production, image, register, logistics } }],
  registDate, logisticsDate
}
```

## 플랜 아이템 스키마 (`State.planItems` 아이템)
```js
{
  no, brand, productCode, sampleNo,
  nameKr, nameEn, colorKr, colorEn,
  salePrice, costPrice,
  type, year, season, gender, memo,
  images: { sum, lemango, noir },
  schedule: {
    design:     { start, end },
    production: { start, end },
    image:      { start, end },
    register:   { start, end },
    logistics:  { start, end }
  },
  confirmed   // boolean — true 시 상품조회로 이전됨, 기획 테이블에서 기본 숨김
}
```

## 업무일정 아이템 스키마 (`State.workItems` 아이템)
```js
{
  no,              // 자동 번호
  category,        // '연차' | '차량사용' | '미팅일정' | '기타' (동적, _workCategories 기반)
  title,           // 제목
  startDate,       // 시작일 YYYY-MM-DD
  endDate,         // 종료일 YYYY-MM-DD
  memo,            // 상세 메모
  registeredAt     // 등록 시각 ISO
}
```

## 이미지 우선순위
- `getThumbUrl()`: sum → lemango → noir → design → shoot 순
- 상세 모달 메인 이미지: `p.images.sum[0]` 우선, 없으면 전체 이미지 첫번째
- 이미지 없을 시 폴백: `file:////lemangokorea/온라인/01.이미지/로고/Lemango/르망고_송부용_로고(WH).png`
- 메인 이미지 클릭 → 새 탭에서 원본 열기

## 모달 목록
| 모달 | ID | 열기 함수 |
|------|----|-----------|
| 이미지 뷰어 | `imageModal` | `openModal(idx, images[])` |
| 상품 상세 | `detailModal` | `openDetailModal(productCode)` |
| 신규등록 | `registerModal` | `openRegisterModal()` |
| 신규입고 | `stockRegisterModal` | `openStockRegisterModal()` |
| 개별출고 | `outgoingModal` | `openOutgoingModal()` |
| 엑셀 업로드 미리보기 | `uploadPreviewModal` | `showRegisterPreview()` |
| 공홈 주문 미리보기 | `gonghomPreviewModal` | `showGonghomPreview(rows)` |
| 기획 상세 | `planDetailModal` | `openPlanDetailModal(no)` |
| 행사 등록/수정 | `eventRegisterModal` | `openEventRegisterModal()` / `editEvent(no)` |
| 기획일정 조회 | `planScheduleModal` | `openPlanScheduleForDate(dateStr)` / `openDashEventInfo(no)` |
| 업무일정 등록 | `workRegisterModal` | `openWorkRegisterModal()` |
| 업무일정 상세 | `workDetailModal` | `openWorkDetailModal(no)` |

> 모든 `.srm-modal` 다이얼로그는 `makeDraggableResizable()` 적용 — 드래그+8방향 리사이즈

### 상세 모달 (`detailModal`) 특성
- **드래그+리사이즈**: 헤더 드래그 이동, 8방향 핸들, 최소 480×300px
- **중앙 배치**: `openDetailModal()` 시 항상 `centerModal(modal)` 호출
- **뷰/수정 전환**: `toggleDetailEdit()` → `.edit-mode` 클래스 토글
- **저장**: `saveDetailEdit()` → `State.allProducts` 직접 수정 후 테이블 재렌더
- **품번 확정**: `lockProductCode()` → `p.productCodeLocked = true`, 이후 품번 수정 불가
- **🔒 품번 확정 버튼**: 헤더에 상시 표시 (확정 후 숨김)
- **품번 생성 패널**: 수정 모드에서 품번 필드 옆 "품번 생성 ▾" 버튼 → 인라인 패널

### 상세 모달 섹션 구성
| 섹션 | 포함 필드 |
|------|----------|
| 기본 정보 | 브랜드, 품번(+생성패널), 판매상태, 샘플번호, 카페24코드, 바코드, 상품명(한/영), 색상(한/영) |
| 가격/디자인 | 판매가, 원가, 타입, 원단타입, 백스타일, 다리파임, 가이드, 가슴선, 비침, 안감, 캡고리 |
| 소재 | 소재, 원단설명, 디자이너코멘트, 세탁방법 |
| 사이즈 규격 | 가슴(cm), 허리(cm), 엉덩이(cm), 모델착용사이즈 |
| 제조 정보 | 제조년월, 제조사, 제조국 |
| 재고 현황 | XS/S/M/L/XL 뱃지 (보기전용) + 생산상태 버튼(지속생산/생산중단) |
| 판매 현황 | 플랫폼별 판매수량 표 (보기전용) |
| 이미지 URL | 자사몰(lemango+noir 통합), 외부몰, SUM, 영상 URL |
| 기획 일정 이력 | `p.scheduleLog[]` 내용 — 확정일 + 일정 날짜 테이블 (신규기획 이전 시 자동 생성) |

### 기획 상세 모달 (`planDetailModal`) 특성
- 뷰/수정 모드 전환: `togglePlanDetailEdit()` / `savePlanDetailEdit()`
- 품번 생성 인라인 패널: `togglePdCodeGenPanel()`, `updatePdProductCode()`, `applyPdGeneratedCode()`
- **상품확정 버튼** (`pdConfirmBtn`): `confirmPlanToProduct()` → 상품조회로 이전, 이전 후 버튼 숨김
- `_editingPlanNo` — 현재 편집 중인 planItem.no
- `_pdPendingCode` — 패널에서 임시 예약한 품번 (닫기 시 해제)

## 품번 자동생성 규칙
- 형식: `[분류2][성별1][타입2][디자인4][연도1][시즌1][일련번호2]` = 13자리
- 일련번호: 같은 prefix(12자리) 내에서 00~99 중 미사용 번호 자동 선정
- 중복 체크: `State.allProducts` + `State.planItems` + `_reservedCodes` 전부 확인
- 자기 자신 코드는 제외 (재생성 시 동일 prefix 재사용 가능)
- `_reservedCodes` Set: 임시 예약 → 취소/닫기 시 해제, 저장 완료 시 확정
- 관련 변수: `_detailPendingCode` (상세모달), `_pdPendingCode` (기획상세모달)

## 신규기획 화면 (`tab-plan`)
```
검색바 필터:
  - 키워드 (전체/상품명/품번+샘플번호)
  - 브랜드, 타입, 연도, 시즌, 성별
  - 이전상태: 미이전(기본) / 전체 / 이전됨
    → 기본값 '미이전' — 상품확정된 항목은 기본 숨김

기획 → 상품 이전 워크플로우:
  1. 기획 등록 (openPlanRegisterModal)
  2. 기획 상세 모달에서 수정 + 품번 생성
  3. 상품확정 버튼 → confirmPlanToProduct()
     - 플랜 아이템 전체 필드 → 상품 스키마로 변환
     - State.allProducts에 추가
     - item.confirmed = true (기획 테이블에서 '이전됨' 배지)
     - p.scheduleLog에 기획 일정 스냅샷 저장
     - 상품조회 탭 전환 + 상세 모달 자동 오픈
  4. 상세 모달에서 🔒 품번 확정 → 품번 수정 불가
```

## 재고 관리 구조

```
신규입고 모달 (stockRegisterModal)
  - 품번 검색 → 현재재고 표시 + 입고수량 입력 + 입고일/메모
  - 엑셀 업로드: 입고일|품번|사이즈|바코드|수량|메모 (long format, 1행 헤더)
  - ADD 방식: p.stock[sz] += qty
  - 이력: p.stockLog.push({type:'in', date, XS~XL, memo, registeredAt})
  - 저장 후: 동일 상품 다시 렌더 (입고 이력 포함)
  - 이력 테이블: 날짜 역순, 사이즈별 수량 + 합계 + 메모

개별출고 모달 (outgoingModal)
  - 품번 검색 → 사이즈별 현재재고 → 출고수량 입력
  - p.stock[sz] -= qty (부족 시 오류)
  - p.stockLog.push({type:'out', ...})
```

## 공홈 주문 업로드

파일 형식 (카페24 주문 내역 엑셀):
| 열 | 내용 |
|----|------|
| A (0) | 카페24코드 (보조 매칭) |
| B (1) | 자체 상품코드 (메인 매칭) |
| C (2) | 수량 |
| H (7) | 상품옵션 → 사이즈 파싱 |
| L (11) | 바코드 |

`parseGonghomSize(optStr)` 규칙:
- `Size=M` → `M`
- `SIZE=85(M)` → `M` (괄호 안 추출)
- 빈 값 → `F` (프리사이즈)

처리: `p.sales['공홈'] += qty` → `renderSalesTable()` + `renderDashboard()` 갱신

## 업로드 컬럼 구조 (상품 샘플 파일)
2행 헤더, 3행부터 데이터. `UPLOAD_COL` 상수로 컬럼 인덱스 관리.
- **SUM 컬럼(29)**: 줄바꿈 구분 URL → `images.sum` 배열로 파싱 → 목록 이미지로 표시
- 기존 품번 업로드 시: 기본정보·이미지 업데이트, 재고·판매는 유지

## 전역 변수 — 설정/옵션 관리

| 변수 | localStorage 키 | 설명 |
|------|----------------|------|
| `_settings` | `lemango_settings_v1` | 브랜드·타입·가슴선 등 SETTING_DEFS 기반 옵션 |
| `_platforms` | `lemango_platforms_v1` | 판매 채널 목록 (공홈/GS/29cm/W쇼핑/기타) |
| `_designCodes` | `lemango_design_codes_v1` | 디자인번호/백스타일 [code, en, kr] 배열 (단일 소스) |
| `_events` | `lemango_events_v1` | 행사일정 배열 [{no, name, channel, startDate, endDate, discount, support, memo}] |
| `_workCategories` | `lemango_work_categories_v1` | 업무일정 카테고리 목록 (연차/차량사용/미팅일정/기타) |
| `_workItems` | `lemango_work_items_v1` | 업무일정 배열 [{no, category, title, startDate, endDate, memo, registeredAt}] |
| `_reservedCodes` | (메모리) | 임시 예약 품번 Set |
| `_detailCode` | (메모리) | 현재 열린 상세 모달 품번 |
| `_detailPendingCode` | (메모리) | 상세 모달 품번 생성 패널 임시 예약 코드 |
| `_editingPlanNo` | (메모리) | 현재 편집 중인 planItem.no |
| `_pdPendingCode` | (메모리) | 기획 상세 모달 품번 생성 패널 임시 예약 코드 |

- `populateAllSelects()` — _settings + _platforms 기반으로 모든 select 동적 채움
- `DEFAULT_PLATFORMS` = `['공홈', 'GS', '29cm', 'W쇼핑', '기타']`

## 설정 탭 (`tab-settings`) 구조
```
#settingsPage
├── 🎨 디자인 관련 (accordion)
│   ├── 상품 타입, 다리파임, 원단타입, 가슴선, 비침, 안감, 캡고리
│   └── 디자인번호/백스타일 (code 4자리 + 영문 + 한글) — _designCodes 단일 소스
├── 📋 일반 상품 정보 (accordion)
│   ├── 브랜드
│   └── 판매상태
└── 🛒 판매 채널 (accordion)
    └── 온라인 쇼핑몰 목록 — 추가/수정/삭제
```

판매 채널 수정 시: `_platforms` 변경 + `State.allProducts` 전체 `p.sales` 키 이전 처리

## CSS 변수 (브랜드 컬러)
```css
--primary: #1a1a2e      /* 다크 네이비 */
--accent:  #c9a96e      /* 골드 */
--bg:      #f5f4f1      /* 오프화이트 */
--success: #4caf7d
--warning: #f0a500
--danger:  #e05252
```

## CSS 핵심 패턴

### 스크롤
flex 레이아웃에서 내부 스크롤:
- 스크롤 컨테이너: `overflow-y: auto` + `min-height: 0`
- 내부 자식 섹션: `flex-shrink: 0` (압축 방지 필수)

### 상세 모달 수정 모드
```css
/* view → edit */
.dfield input/select/textarea { display: none }          /* 기본 숨김 */
.detail-modal.edit-mode .dfield-value { display: none }  /* 값 숨김 */
.detail-modal.edit-mode .dfield input/select/textarea { display: block } /* 입력 표시 */

/* 품번 생성 패널 (수정 모드에서만 표시) */
.dcg-edit-only { display: none }
.detail-modal.edit-mode .dcg-edit-only { display: flex }

/* 생산상태 버튼 (수정 모드에서만 클릭 가능) */
.dprod-btn { cursor: default }
.detail-modal.edit-mode .dprod-btn { cursor: pointer }
```

### `.srm-modal` 필수 CSS
```css
position: fixed; margin: 0;  /* dialog 기본 centering 해제 — draggable 필수 */
```

## 주요 함수 목록

### 초기화 / 탭 전환
- `init()` — 앱 초기화, 데이터 로드
- `openTab(tab)` — 탭 열기 (탭 바 추가 + 활성화)
- `closeTab(tab)` — 탭 닫기 (인접 탭 전환)
- `resetTabs()` — 로고 클릭 전체 리셋 (대시보드만 복원)
- `renderTabBar()` — 탭 바 렌더
- `applyTabState()` — 해시/nav/콘텐츠/탭 바 동기화
- `switchTab(tab)` — 레거시 호환 (→ `openTab` 위임)

### 검색 / 렌더
- `searchProduct/Stock/Sales/Plan()` — 각 탭 검색 (다중 키워드 OR)
- `renderProductTable/StockTable/SalesTable/PlanTable/Dashboard()` — 렌더

### 상세 모달
- `openDetailModal(code)` — 열기 (항상 중앙 배치)
- `closeDetailModal()` — 닫기 (임시 예약 코드 해제)
- `buildDetailContent(p)` — HTML 생성
- `toggleDetailEdit()` — 수정모드 토글 (취소 시 임시 예약 해제)
- `saveDetailEdit()` — 수정 저장
- `lockProductCode()` — 품번 확정 (productCodeLocked = true)
- `setProductionStatus(btn, status)` — 생산상태 토글 (수정모드에서만)
- `toggleDetailCodeGenPanel()` / `filterDetailDesignList()` / `selectDetailDesign(code)` — 품번 생성 패널
- `updateDetailProductCode()` — 품번 미리보기 계산 (자기 자신 제외)
- `applyDetailGeneratedCode()` — 품번 적용 + 임시 예약

### 기획 상세 모달
- `openPlanDetailModal(no)` — 열기
- `closePlanDetailModal()` — 닫기 (임시 예약 해제)
- `buildPlanDetailContent(item)` — HTML 생성
- `togglePlanDetailEdit()` / `savePlanDetailEdit()` — 수정 모드
- `confirmPlanToProduct()` — 상품조회로 이전
- `togglePdCodeGenPanel()` / `filterPdDesignList()` / `selectPdDesign(code)` — 품번 생성 패널
- `updatePdProductCode()` / `applyPdGeneratedCode()` — 품번 계산/적용

### 신규등록
- `openRegisterModal()` — 열기
- `submitRegister(e)` — 등록 처리
- `updateProductCode()` — 품번 자동생성 (allProducts + planItems + reservedCodes 체크)
- `applyGeneratedCode()` — 품번 적용 + 예약

### 엑셀 업로드/다운로드
- `downloadExcel(type)` — 엑셀 다운로드 (_platforms 동적 컬럼)
- `downloadSample(type)` — 샘플 파일
- `handleUpload(input, type)` — 상품 파일 업로드
- `handleRegisterUpload()` — 신규등록 엑셀 업로드
- `showRegisterPreview()` / `confirmRegisterUpload()` — 업로드 미리보기/확정

### 재고
- `openStockRegisterModal()` — 신규입고 모달
- `findSrmProduct()` — 품번 검색 → `buildSrmProductArea(p)` 렌더
- `buildSrmProductArea(p)` — 입력 폼 + 입고 이력 테이블 HTML 생성
- `saveSrmStock(productCode)` — 입고 저장 (저장 후 동일 상품 재렌더)
- `handleStockRegisterUpload()` — 재고 엑셀 업로드 (long format)
- `confirmStockUpload()` — 재고 일괄 저장 (ADD 방식)
- `openOutgoingModal()` / `submitOutgoing()` — 개별 출고

### 판매
- `handleGonghomUpload(input)` — 공홈 주문 엑셀 파일 읽기
- `showGonghomPreview(rows)` — 공홈 주문 미리보기
- `confirmGonghomUpload()` — 공홈 주문 판매 반영
- `parseGonghomSize(optStr)` — 상품옵션 문자열 → 사이즈 파싱

### 업무일정
- `renderWorkCalendar()` — 업무일정 캘린더 렌더
- `placeWorkBars(gridStart, gridEnd, items, maxRows)` — 바 배치 알고리즘
- `wkPrevMonth()` / `wkNextMonth()` / `wkToday()` — 월 이동
- `wkFilterCategory(val)` — 카테고리 필터
- `openWorkRegisterModal()` / `submitWork(e)` / `closeWorkRegisterModal()` — 등록 모달
- `openWorkDetailModal(no)` / `closeWorkDetailModal()` — 상세 모달
- `editWorkFromDetail(no)` — 상세에서 수정 모달 열기
- `deleteWork(no)` — 삭제 (korConfirm)
- `renderWorkTable()` — 호환 래퍼 (→ `renderWorkCalendar()`)

### 설정
- `renderSettings()` — 설정 탭 전체 렌더
- `addPlatformSetting()` / `editPlatformSetting(idx)` / `savePlatformEdit(idx)` / `removePlatformSetting(idx)` — 판매 채널 CRUD
- `addWorkCategorySetting()` / `editWorkCategorySetting(idx)` / `saveWorkCategoryEdit(idx)` / `removeWorkCategorySetting(idx)` — 업무 카테고리 CRUD

### 유틸
- `makeDraggableResizable(modal, minW, minH)` — 드래그+리사이즈 초기화
- `centerModal(modal)` — 모달 화면 중앙 배치
- `populateAllSelects()` — 모든 select 동적 채움
- `parseKeywords(raw)` — 다중 키워드 파싱 (쉼표/줄바꿈, 최대 200)
- `handleSearchPaste(e, inputId)` — 엑셀 붙여넣기 처리
- `parseExcelDate(val)` — Excel 시리얼/문자열 → YYYY-MM-DD
- `copyFieldUrl(key, btn)` / `copySingleUrlFromBtn(btn)` — URL 클립보드 복사
- `showToast(msg, type)` — 토스트 알림

## 에이전트 목록 (`.claude/agents/`)
| 파일 | 역할 |
|------|------|
| `data-engineer.md` | 엑셀→JSON 변환, 데이터 스키마 |
| `ui-designer.md` | 레이아웃, 컬러시스템, 컴포넌트 |
| `search-filter.md` | 검색·필터·정렬 로직 |
| `table-renderer.md` | 테이블 컬럼 정의, 렌더링 패턴 |
| `excel-handler.md` | 업로드/다운로드/샘플 (SheetJS) |
| `dashboard.md` | 대시보드, BEST 목록, 차트 |
| `layout-designer.md` | HTML/CSS 레이아웃 변경, 반응형 조정 |
| `feature-builder.md` | 새 기능 구현 (다중 파일 일관성) |
| `debugger.md` | 버그 진단·수정, 증상→파일 추적 |
| `code-reviewer.md` | 코드 리뷰, 품질/일관성 체크리스트 |

---

## 작업 이력

### 2026-03-16

#### 바코드 항목 추가
- 상품 스키마에 `barcode` 필드 추가
- 상품조회 테이블에 바코드 컬럼 추가 (품번 옆)
- 검색 기준에 바코드 옵션 추가
- 상세 모달 기본정보 섹션에 바코드·카페24코드 필드 추가
- 신규등록 모달에 바코드 입력 필드 추가
- 엑셀 다운로드에 바코드 컬럼 포함

#### 사이즈 규격 분리
- 기존 `sizeSpec` 단일 textarea → `bust`(가슴), `waist`(허리), `hip`(엉덩이) 개별 필드로 분리

#### 디자인 속성 필드 추가
- `chestLine`, `transparency`, `lining`, `capRing`, `guide` 추가
- `legCut` 라벨: '레그컷' → '다리파임' 변경

#### GitHub 연동
- `https://github.com/jhi3018-droid/lemango` 저장소 초기 커밋/push 완료

---

### 2026-03-17

#### 판매상태 필터
- `saleStatus` 필드 추가 ('판매중' | '종료' | '추가생산')
- 상품조회 검색바 + 상세 모달에 판매상태 필드 추가

#### 신규입고 / 개별출고 분리
- 신규입고 (stockRegisterModal): 엑셀 업로드 기반, ADD 방식
- 개별출고 (outgoingModal) 신규 추가
- `p.stockLog[]`, `p.barcodes{}` 추가

#### 신규입고 엑셀 long format
- 컬럼: 입고일(0) | 품번(1) | 사이즈(2) | 바코드(3) | 수량(4) | 메모(5)
- `parseExcelDate()` 유틸 추가

#### 모달 드래그+리사이즈 공통화
- `makeDraggableResizable()`, `centerModal()` 추가
- 적용: stockRegisterModal, outgoingModal, gonghomPreviewModal

#### 설정 탭 추가
- 브랜드·타입·다리파임·원단타입·가슴선·비침·안감·캡고리 CRUD
- 백스타일 / 디자인 번호(패턴) 관리 (localStorage 영속화)
- `populateAllSelects()` 도입

#### 판매 채널 동적화
- `_platforms` (localStorage) 도입, 설정 탭에서 CRUD
- 수정 시 `p.sales` 키 자동 이전

#### 공홈 주문 내역 업로드
- 카페24 주문 내역 파싱 (B열 품번, H열 옵션→사이즈, L열 바코드)
- `parseGonghomSize()`, gonghomPreviewModal 추가

#### 신규기획 탭 (`tab-plan`) 신규 추가
- 기획 상품 등록/관리/일정 테이블
- 기획 상세 모달 (planDetailModal): 수정 모드, 인라인 품번 생성 패널
- `State.planItems`, `_editingPlanNo`, `_pdPendingCode` 도입

#### 신규기획 → 상품조회 이전 워크플로우
- **품번 중복 방지**: allProducts + planItems + _reservedCodes 모두 체크, 자기 자신 제외
- **품번 확정**: `lockProductCode()` → `p.productCodeLocked = true`, 이후 수정 불가
- **상품확정**: `confirmPlanToProduct()` → 플랜 → 상품, `item.confirmed = true`
  - `p.scheduleLog[]` 에 기획 일정 스냅샷 저장
  - 상품조회 탭 자동 전환 + 상세 모달 오픈
- 이전된 항목은 기획 테이블에 '이전됨' 배지 + 흐릿하게

#### 상세 모달 개선
- 인라인 품번 생성 패널 추가 (수정 모드에서만 표시, `dcg-edit-only` CSS 클래스)
- `closeDetailModal()` / `_detailPendingCode` — 미저장 예약 코드 자동 해제
- 중앙 배치 (`centerModal` 추가)
- 자사몰 URL: 르망고+느와 → `urlJasa` 단일 필드로 통합
- 이미지: SUM[0] 우선, 클릭 시 새 탭, 없으면 로고 폴백
- 재고현황: 보기전용 (수정 그리드 제거)
- 생산상태 버튼: 지속생산/생산중단 토글 (수정 모드에서만 클릭)
- 하단 "기획 일정 이력" 섹션 (scheduleLog 기반)

#### 신규기획 이전상태 필터
- `npConfirmed` select: 미이전(기본) / 전체 / 이전됨
- 기본값 '미이전' — 확정 상품 자동 숨김

#### 재고관리 입고 이력 표시
- `buildSrmProductArea(p)` 헬퍼 분리
- 저장 후 동일 상품 재렌더 (입고 이력 포함)
- 이력 테이블: 날짜 역순, 사이즈별 수량 + 합계 + 메모

---

### 2026-03-18

#### JS 모듈 분리 + Firebase 호스팅
- 단일 `app.js` → `js/` 디렉토리 하위 15개 파일로 분리 (core, router, utils, products, stock, sales, plan, dashboard, modals, register, excel, settings, design, upload, main)
- 해시 기반 SPA 라우팅 도입: `navigateTo(tab)` → `history.pushState` + `popstate` 이벤트
- Firebase Hosting 배포: `lemango-office` 프로젝트 → https://lemango-office.web.app
- SheetJS: 로컬 파일 → CDN (`https://cdn.sheetjs.com/xlsx-0.20.0/`)

#### 실제 상품 데이터 로드
- `C:\Users\LEMANGO\Desktop\샘플.xlsx` → `data/products_lemango.json` (28개), `data/products_noir.json` (17개)
- `parseSumUrls()`: `<center><img src="..."></center>` HTML 형식도 파싱 지원

#### UI 개선
- 상품조회 테이블에서 바코드 컬럼 제거
- 레그컷 항목명 "다리파임" → "레그컷", 값: Low Cut / Normal Cut / Middle Cut / High Cut

#### 디자인번호/백스타일 통합 (단일 소스)
- `_backStyles` 변수 완전 제거 → `_designCodes` 단일 소스로 통합
- 설정 탭 "백스타일" 카드 → "디자인번호 / 백스타일" 카드로 변경, `_designCodes` 기반 CRUD
- 품번 자동생성 패널(상품조회·기획·신규등록): 모두 `_designCodes` 참조
- 설정에서 추가/삭제 시 품번 생성 패널에 즉시 반영
- `saveBackStyles()` 제거 → `saveDesignCodes()` 단일 사용

#### 이미지 URL 섹션 접기/펼치기
- 상세 모달 "이미지 URL" 섹션 전체 + 하위 항목(자사몰·외부몰·SUM·영상URL) 각각 접기 가능
- 기본 상태: 전부 접혀있음 (`dimg-hidden` CSS)
- 접혀있을 때 첫 번째 URL을 `.dimg-preview` 스팬으로 미리보기 표시
- 펼치면 미리보기 숨김 (`toggleDImg()`)

#### 설정 탭 UI 개선
- 모든 설정 리스트에 `max-height: 240px` 스크롤 적용 (커스텀 스크롤바)
- 디자인번호 목록: 실시간 검색 필터 + 항목 개수 뱃지
- 모든 항목에 인라인 수정 기능 추가 (hover 시 연필/삭제 아이콘)
- 자동완성 드롭다운: 입력 시 기존 항목 매칭, 중복 시 빨간 테두리 + "중복" 뱃지
- 디자인번호 엑셀 다운로드/업로드 (전체 교체 또는 신규만 추가 모드)

#### 한글 확인 다이얼로그
- 브라우저 기본 `confirm()` (OK/Cancel 영문) → `korConfirm()` 커스텀 모달 (확인/취소 한글)
- Promise 기반 비동기, 버튼 텍스트 커스터마이즈 가능
- 전체 7곳 교체 (품번확정, 상품이전, 삭제, 업로드 등)

#### 신규등록 모달 개선
- 디자이너 코멘트: 이미지 URL 섹션 → 기본 정보 섹션 하단으로 이동
- 이미지 URL: `URL 1/2` → 자사몰/외부몰/SUM textarea + 영상URL input (줄바꿈 다중 URL)
- 이미지 섹션 3컬럼 그리드 (`rform-img-grid`)로 공간 확보
- sales 초기화: 하드코딩 → `_platforms` 동적 참조

#### 페이지네이션 (전 탭 공통)
- 상품조회·재고관리·판매조회·신규기획 4개 탭 모두 10개씩 페이지 분리
- `renderPagination(containerId, tabKey, renderFnName)` — `js/utils.js`
- `goPage(tabKey, page, renderFnName)` — `window[renderFnName]()` 호출
- 슬라이딩 윈도우: 최대 10개 페이지 번호 표시, 현재 > 5 이면 왼쪽 1개 감소·오른쪽 1개 증가
- `◀◀` 첫 페이지, `◀` 이전, `▶` 다음, `▶▶` 마지막 페이지 버튼
- 검색·초기화·정렬 시 `State[tab].page = 1` 자동 리셋
- tfoot 합계는 전체 필터 결과 기준 (페이지 무관)
- `PAGE_SIZE = 10` 상수 (`js/utils.js`)
- 페이지네이션 컨테이너: `#pPagination`, `#sPagination`, `#slPagination`, `#npPagination`

---

### 2026-03-23

#### 행사일정 탭 (`tab-event`) 신규 추가
- 네비게이션에 "행사일정" 버튼 추가 (신규기획 ↔ 설정 사이)
- `js/event.js` 신규 파일 생성
- 월간 캘린더 뷰 (6주 고정 그리드, `◀ ▶ 오늘` 월 이동)
- 행사 등록/수정/삭제 모달 (`eventRegisterModal`)
- 행사 데이터 localStorage 영속화 (`lemango_events_v1`)
- `State.event`, `_events`, `saveEvents()` — `core.js`에 추가

#### 행사일정 캘린더 기능
- 행사별 시작일~종료일 **연속 컬러 바** 표시 (모든 날짜 동일 라벨)
- 10색 보색 팔레트 (진한 배경 + 흰 글자): 파랑, 빨강, 초록, 오렌지, 보라, 청록, 핑크, 남색, 갈색, 그레이블루
- 캘린더 바 텍스트: `채널 행사명` (예: `공홈 26SS 여름 특가전`)
- 최대 10줄, 초과 시 `+N건` 표시
- 지난 날짜: 색상 띠만 (6px 얇은 바, 라벨 없음), hover 시 tooltip
- 빈 셀/지난 셀: 최소 80px(3줄), 내용 있는 셀은 내용만큼 자동 확장

#### 행사 등록 모달 필드
- 행사명, 채널, 시작일, 종료일, 할인율(%), 당사지원(%), 메모
- 할인율 / 당사지원 분리 (`discount`, `support` 필드)

#### 대한민국 공휴일 표기
- `getHolidayName(dateStr)` — `core.js`에 추가
- 고정 공휴일: 신정, 삼일절, 어린이날, 현충일, 광복절, 개천절, 한글날, 크리스마스
- 음력 공휴일 (2024~2027): 설날 연휴, 부처님오신날, 추석 연휴 + 대체공휴일
- 공휴일 셀: 연분홍 배경 + 빨간 글자 + 공휴일명 표시
- 행사일정 캘린더 + 대시보드 캘린더 모두 적용

#### 대시보드 캘린더 추가
- KPI 카드 바로 아래 전체 폭으로 **일정 캘린더** 배치
- BEST TOP10 + 매출현황은 캘린더 아래로 이동
- 행사일정: 색상 바로 표시, 클릭 → **읽기전용 조회 모달** + `수정하러 가기` 버튼 → 행사일정 탭 이동
- 기획일정: 시작일/완료일 당일만 표기 (`품번 단계명 시작/완료`)
- 클릭 → **기획일정 조회 모달** (해당 날짜 품번 목록 + 단계별 시작일/완료일 테이블, 해당 단계 하이라이트) + `신규기획에서 수정하기` 버튼
- 범례: 공휴일(빨강) / 행사(네이비) / 기획(골드)
- `PLAN_PHASE_COLORS`: 디자인(골드), 생산(초록), 이미지(보라), 상품등록(노랑), 물류입고(청록)

#### 신규기획 검색 필터 강화
- **일정 단계** 필터 추가: 전체 / 디자인 / 생산 / 이미지 / 상품등록 / 물류입고 (`npPhase`)
- **시작일 / 종료일** 날짜 범위 필터 추가 (`npDateFrom`, `npDateTo`)
- 단계 + 날짜 조합: 해당 단계의 일정이 날짜 범위에 겹치는 품번만 필터
- 전체 단계 + 날짜 미입력: 모든 상품 표시 (기존 동작)

#### 주요 신규 함수
- `renderEventCalendar()` — 행사일정 캘린더 렌더
- `placeEventBars()` — 이벤트 바 배치 알고리즘
- `renderDashCalendar()` — 대시보드 캘린더 렌더
- `openDashEventInfo(no)` — 대시보드 행사 조회 모달 (읽기전용)
- `openPlanScheduleForDate(dateStr)` — 기획일정 날짜 조회 모달
- `goToPlanWithDate(dateStr)` — 기획 탭으로 이동 + 날짜 필터 자동 세팅
- `getHolidayName(dateStr)` — 공휴일 이름 조회
- `calcDday(startDate, endDate)` — D-Day 계산
- `fmtDate(d)` / `getDateRange(start, end)` — 날짜 유틸
- `esc(s)` — HTML 이스케이프

---

### 2026-03-24

#### 대시보드 레이아웃 개편
- 기존: KPI → 캘린더(전체폭) → BEST TOP10 + 매출현황(하단 2컬럼 `.dashboard-grid`)
- 변경: KPI → `.dashboard-main`(grid `1fr 380px`) 2컬럼
  - 좌측: 일정 캘린더 (`dash-cal-card`, flex:1)
  - 우측: `.dashboard-side`(flex-column, gap 16px) 안에 매출현황 + BEST TOP10 세로 배치
- `.dashboard-grid` 제거 → `.dashboard-main` + `.dashboard-side` 도입
- 캘린더 헤더 `flex-wrap` 추가 (좁은 폭에서 범례 줄바꿈)
- `js/dashboard.js` 수정 없음 (DOM ID 기반 렌더링이라 구조 변경 영향 없음)

#### 캘린더 높이 50% 증가
- `.dcal-cell` min-height: 64px → 96px (1.5배)

#### BEST TOP10 스크롤 처리
- `.dashboard-side .best-list`: `max-height: 355px` (5개 표시) + `overflow-y: auto`
- 커스텀 스크롤바 적용 (프로젝트 공통 패턴: 5px, `var(--border)` thumb)

---

### 2026-03-26

#### 판매조회 테이블 전면 개편 — 피벗테이블형 플랫폼 컬럼 관리
- **2단 헤더 구조**: 1행 (이미지·품번·상품명·판매가 rowspan=2 + 합계 colspan=2 + 플랫폼별 colspan=2), 2행 (수량·매출액 쌍)
- **매출액 컬럼 추가**: 각 플랫폼별 `수량 × p.salePrice`, 합계는 전체 `_platforms` 기준 (비활성 포함)
- **이미지·품번 컬럼**: 상품조회 테이블과 동일 패턴 (썸네일 + code-link 클릭)
- **tfoot 합계행**: 활성 플랫폼별 수량+매출액, 합계는 전체 플랫폼 기준
- **정렬**: 2단 헤더 하위 행에서 수량·매출액 컬럼 정렬 지원

#### 플랫폼 컬럼 드래그앤드롭 (HTML5 DnD API)
- **`State.sales.activePlatforms`**: 테이블에 표시 중인 플랫폼 배열 (순서 포함)
- **`State.sales.inactivePlatforms`**: 비활성 플랫폼 배열 (테이블 위 태그 영역에 표시)
- **컬럼 제거**: 플랫폼 헤더 ✕ 클릭 → 비활성 영역으로 이동, 테이블 즉시 재렌더
- **컬럼 복원**: 비활성 칩을 드래그 → 테이블 헤더 위 드롭 → 삽입 위치에 배치
- **컬럼 순서 변경**: 활성 플랫폼 헤더 간 드래그 → 삽입 위치에 구분선(box-shadow) 표시
- **비활성 영역으로 드롭**: 헤더에서 비활성 영역으로 드래그 → 컬럼 제거
- 합계 컬럼은 항상 고정 (제거 불가)
- `initSalesPlatforms()`: 설정 탭 플랫폼 추가/삭제 시 자동 동기화

#### 비활성 플랫폼 영역 (`#slInactiveArea`)
- 테이블 위, 검색바 아래 배치 — dashed 보더, 칩 태그 형태
- 비활성 플랫폼이 없으면 영역 숨김
- 드롭 대상: 헤더에서 드래그 시 `sl-drop-target` 하이라이트

#### 페이지당 표시 개수 드롭다운
- 판매조회 검색바에 `#slPageSize` select (10/20/50/100/전체)
- `State.sales.pageSize` 도입, `changeSalesPageSize()` 함수
- `getPageSize(tabKey)` 헬퍼 — 탭별 커스텀 pageSize 지원

#### 판매조회 주요 함수
- `initSalesPlatforms()` — 플랫폼 active/inactive 초기화 + 설정 동기화
- `renderSalesTable()` — 메인 렌더 (비활성 영역 + 테이블 + 드래그 바인딩)
- `renderInactiveArea()` — 비활성 칩 렌더 + 드래그 이벤트 바인딩
- `removeSalesPlatform(pl)` / `activateSalesPlatform(pl, idx)` / `reorderSalesPlatform(from, toIdx)` — 플랫폼 상태 변경
- `bindSalesDragDrop()` — 테이블 헤더 드래그앤드롭 이벤트 바인딩
- `clearDropIndicators()` — 드래그 구분선 CSS 클래스 정리

#### 판매조회 CSS
- `.sales-table` 2단 sticky 헤더: 1행 `top:0 z-index:4`, 2행 `top:38px z-index:3`
- `.sl-plat-th`: 드래그 가능 (`cursor:grab`), ✕ 제거 버튼, `sl-drag-over-left/right` 구분선
- `.sl-inactive-area`: dashed 보더, flex-wrap, 드롭 하이라이트
- `.sl-inactive-chip`: 둥근 칩, grab 커서, 드래그 고스트
- `.sl-qty`, `.sl-rev`, `.sl-total-col` — 수량/매출액 셀 스타일

#### 기존 유지
- `resolveValue()` (`js/utils.js`): `totalSales`, `totalRevenue`, `rev.<플랫폼>` 계산 키 지원
- `getPageSize()`, `renderPagination()`, `goPage()` — pageSize 대응
- 공홈 주문 업로드(gonghom.js) — `renderSalesTable()` 호출, 데이터 구조 변경 없음

---

### 2026-03-26 (추가)

#### 테이블 컬럼 너비 고정
- 이미지 컬럼: `width:60px` (4개 테이블)
- NO. 컬럼: `width:45px; text-align:center` (상품조회, 신규기획)
- 품번 컬럼: `width:145px` (4개 테이블 — `table-layout:fixed`에서 `min-width` 무시 → `width` 사용)
- 텍스트 오버플로우: `overflow:hidden; text-overflow:ellipsis` 전체 th/td 적용

#### initColumnResize() 버그 수정
- 기존: 2단 헤더에서 마지막 `thead tr`만 처리 → `rowspan>1` 컬럼(품번 등) 누락
- 수정: `table.querySelectorAll('thead th')` 전체 처리 (`colspan>1`만 스킵)

#### 탭 바 시스템 도입 (브라우저 탭 스타일)
- 네비게이션 바 아래 탭 바 영역 (`#tabBar`) 추가
- 열린 탭마다 `[탭이름 ×]` 형태 버튼, 활성 탭 하이라이트 (골드 하단 보더)
- 네비게이션 메뉴 클릭 → 미열림 시 탭 바에 추가, 이미 열림 시 포커스 이동
- × 버튼으로 개별 탭 닫기 (활성 탭 닫기 → 인접 탭 전환, 전부 닫기 → 대시보드 복원)
- 탭 전환 시 DOM 유지 (`display:none` 토글) — 검색/필터/스크롤/페이지네이션 상태 보존
- LEMANGO 로고 클릭 → `resetTabs()` — 열린 탭 전부 닫고 대시보드만 복원
- 초기 상태: 대시보드 탭만 열림 (해시 URL 있으면 해당 탭으로 시작)
- `State.openTabs`, `State.activeTab`, `TAB_LABELS` 도입
- `_renderedTabs` Set: 첫 열림 시만 렌더 함수 호출, 이후 전환은 DOM 유지
- 탭 바 sticky (`top:56px`), 가로 스크롤 지원

#### 탭 바 주요 함수
- `renderTabBar()` — 탭 바 HTML 생성 + 클릭/닫기 이벤트 바인딩
- `openTab(tab)` — 탭 열기 (미열림 시 추가 + 첫 렌더, 이미 열림 시 포커스만)
- `closeTab(tab)` — 탭 닫기 (인접 탭 전환 로직)
- `resetTabs()` — 로고 클릭 시 전체 리셋
- `applyTabState()` — 해시/nav/콘텐츠/탭바 일괄 갱신
- `triggerTabRender(tab)` — 첫 열림 시만 렌더 호출

#### 탭 바 CSS
- `.tab-bar`: sticky, `#232340` 배경 (header보다 약간 밝은 네이비)
- `.tab-bar-btn`: 투명 배경 + 하단 보더 하이라이트
- `.tab-bar-btn-active`: `var(--accent)` 골드 텍스트 + 하단 보더
- `.tab-bar-close`: hover 시만 표시 (opacity 0→1 전환)

#### 업무일정 탭 (`tab-work`) 신규 추가
- `js/work.js` 신규 파일 생성 — 업무일정 CRUD + 캘린더 렌더
- 데이터 스키마: `{ no, category, title, startDate, endDate, memo, registeredAt }`
- localStorage 영속화: `lemango_work_items_v1`, `lemango_work_categories_v1`
- `State.workItems` — 상태 관리
- **월간 캘린더 뷰** (행사일정 패턴 동일): 6주 고정 그리드, 공휴일 표기, 오늘 하이라이트
- 시작일~종료일 연속 컬러 바 표시: `placeWorkBars()` 바 배치 알고리즘
- 카테고리별 색상: `WORK_CAT_COLORS` + `WORK_CAT_PALETTE`, `getWorkCatColor(cat)`
- 바 텍스트: "카테고리 제목", 지난 날짜: 얇은 바(6px), 최대 10줄 + `+N건`
- 바 클릭 → `openWorkDetailModal()` → 수정/삭제 가능
- 캘린더 상단: 카테고리 필터 select + 등록 버튼 + 월 이동(◀ ▶ 오늘)
- 등록 모달 (`workRegisterModal`): 카테고리/제목/시작일/종료일/메모
- 상세 모달 (`workDetailModal`): 뷰 모드 + 수정/삭제 버튼

#### 설정 탭 — 업무일정 카테고리 관리
- 설정 탭에 "업무일정" 아코디언 섹션 추가
- `_workCategories` 기반 CRUD (추가/수정/삭제)
- 기본 항목: 연차, 차량사용, 미팅일정, 기타
- 카테고리 수정 시 기존 workItems.category 값 자동 이전
- 카테고리 삭제 시 해당 일정 → '기타'로 이전
- `DEFAULT_WORK_CATEGORIES` 상수

#### 대시보드 캘린더 업무일정 연동
- 업무일정 시작일~종료일 기간 바 표시 (카테고리 색상)
- 범례에 "업무" 항목 추가
- 클릭 시 업무일정 탭으로 이동

#### 행사일정 탭 HTML 복원
- `tab-event` 섹션 + `eventRegisterModal` + `planScheduleModal` — index.html에 추가 (이전 누락)

---

### 2026-03-26 (추가2)

#### 전체 테이블 컬럼 정렬 + 필터 기능 추가
- 4개 데이터 테이블(상품조회, 재고관리, 판매조회, 신규기획) 모든 컬럼에 정렬 + 필터 적용
- `initTableFeatures(tableId, tabKey, renderFnName)` — sort/filter/resize 통합 초기화
  - `bindSortHeader` + `updateSortIcons` + `initColumnResize` 3개 함수 대체
  - 모든 `data-key` 있는 th에 자동으로 정렬 아이콘(⇅/↑/↓) + 필터 아이콘(▼) 추가
  - `data-no-sort` / `data-no-filter` 속성으로 개별 컬럼 제외 가능
  - `colspan > 1` 그룹 헤더는 자동 스킵
- **th 내부 구조**: `<div class="th-content"><span class="th-label">라벨</span><span class="th-sort">⇅</span><span class="th-filter">▼</span></div>`
- **정렬**: th-label/th-sort 클릭 → asc/desc 토글, 모든 컬럼 data-key 기반
- **컬럼 필터 (엑셀 스타일 드롭다운)**:
  - th-filter 아이콘 클릭 → 해당 컬럼 고유값 체크박스 드롭다운 표시
  - 검색 input + 전체 선택/해제 + 고유값 체크박스 + 적용/초기화 버튼
  - 여러 컬럼 동시 필터 (AND 조건), 검색바 필터와도 AND 결합
  - 활성 필터 아이콘은 골드(`var(--accent)`) 색상으로 강조
  - 바깥 클릭 시 드롭다운 닫힘
- **상태 관리**: `State[탭].columnFilters = { colKey: Set(선택된값들) }`
  - 검색 초기화 시 columnFilters도 함께 초기화
  - 필터 적용 시 page = 1 리셋
- `applyColFilters(data, columnFilters)` — 컬럼 필터 적용 (render 함수 내에서 호출)
- `resolveValue`에 `exhaustion` 키 추가 (소진율 정렬 지원)
- 페이지네이션: `_getFilteredCount()` 헬퍼로 컬럼 필터 반영된 총 개수 계산

#### 주요 함수
- `initTableFeatures(tableId, tabKey, renderFnName)` — 통합 초기화 (`js/utils.js`)
- `openColumnFilter(th, tabKey, key, renderFnName)` — 필터 드롭다운 열기
- `closeColumnFilter()` — 필터 드롭다운 닫기
- `applyColFilters(data, columnFilters)` — 데이터에 컬럼 필터 적용
- `getColUniqueValues(data, key)` — 컬럼 고유값 추출
- `clearAllColumnFilters(tabKey)` — 전체 컬럼 필터 초기화

#### CSS
- `.th-content` — flex 컨테이너 (label + sort + filter)
- `.th-sort` / `.th-sort.active` — 정렬 아이콘 (활성 시 골드)
- `.th-filter` / `.th-filter.active` — 필터 아이콘 (활성 시 골드)
- `.col-filter-dd` — 필터 드롭다운 패널 (position: absolute, z-index: 1000)
- `.cfd-search`, `.cfd-list`, `.cfd-item`, `.cfd-btns` — 드롭다운 내부 요소

---

### 2026-03-27

#### 전체 탭 표시개수(페이지 사이즈) 드롭다운 추가
- 상품조회·재고관리·신규기획 탭에도 `표시개수` select 추가 (기존 판매조회만 존재)
- `.page-size-row` 래퍼: `table-meta` + `page-size-select` 좌우 배치 (4개 탭 공통)
- 옵션: 10개 / 30개 / 50개 / 100개 / 전체
- `State.*.pageSize` 도입 (product, stock, plan에 각각 `pageSize: 10`)
- `changeProductPageSize()`, `changeStockPageSize()`, `changePlanPageSize()` 함수 추가
- 검색 초기화 시 `pageSize = 10`, `columnFilters = {}` 자동 리셋
- `getPageSize(tabKey)` 헬퍼: 모든 탭 pageSize 지원 (0 = 전체)
- 판매조회 `#slPageSize`: 검색바 → `page-size-row`로 이동, 옵션 `20개 → 30개`로 변경
- `#pPageSize`, `#sPageSize`, `#npPageSize`, `#slPageSize` — 4개 탭 ID

#### 상세 모달 최종입고일 필드 추가
- 제조 정보 섹션에 `최종입고일` 읽기전용 필드 추가
- `p.stockLog` 중 `type === 'in'` 내 최신 날짜 자동 계산 (없으면 `—`)

#### 비활성 플랫폼 영역 UX 개선
- `#slInactiveArea`: `display:none` 조건부 → **항상 표시**로 변경
- 라벨: `"비활성 채널 — 테이블 헤더로 드래그하여 추가"` → `"채널을 여기로 드래그하여 숨기기"`
- 비활성 칩이 없어도 드롭 대상으로 활용 가능

#### CSS 추가
- `.page-size-row`: `display:flex; justify-content:space-between; align-items:center`
- `.page-size-select`: 라벨 + select 인라인 배치 (font-size: 12px)

---

## 보류 중 작업

### 이미지합치기 웹 통합 (테스트 후 결정)
- `\\lemangokorea\온라인\기타\이미지 합치기\이미지합치기.pyw` 분석 완료
- 기능: HTML 소스 → 이미지 URL+텍스트 파싱 → 1000px 폭 세로 합치기 + 정사각형 변환
- 통합 방향: 순수 JS(Canvas API) + fetch() — CORS 테스트 필요
- 상세 내용: `.claude/projects/.../memory/project_image_combiner.md` 참조

## 다음 작업 후보 (미구현)
- [ ] 공홈 외 다른 쇼핑몰 주문 업로드 포맷
- [ ] 상품 삭제 기능
- [ ] 데이터 영속성 (localStorage 또는 서버 연동)
- [ ] 인쇄/PDF 출력
- [ ] 이미지합치기 웹 통합 (테스트 후)
- [ ] 업무일정 수정 권한 관리 (작성자/관리자/인사담당자만 수정 가능)
