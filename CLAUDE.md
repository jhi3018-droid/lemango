# 르망고 상품 관리 시스템 — CLAUDE.md

## 프로젝트 개요
르망고(수영복 브랜드) 내부 상품 관리 웹 시스템.
순수 HTML + CSS + JavaScript (프레임워크 없음). 로컬 서버: `python -m http.server 8765`

## 파일 구조
```
르망고/
├── index.html              # 전체 화면 (탭 6개 + 모달들)
├── style.css               # 전체 스타일
├── firebase.json           # Firebase Hosting 설정
├── .firebaserc             # Firebase 프로젝트 (lemango-office)
├── CLAUDE.md               # 이 파일
├── .claude/agents/         # 전문 에이전트
├── js/                     # JS 모듈 분리 (15개 파일)
│   ├── core.js             # State, 설정, 플랫폼, populateAllSelects
│   ├── router.js           # 해시 기반 라우팅 (navigateTo, switchTab)
│   ├── utils.js            # 유틸 함수, 페이지네이션 (renderPagination, goPage)
│   ├── products.js         # 상품조회 검색·렌더
│   ├── stock.js            # 재고조회·입고·출고
│   ├── sales.js            # 판매조회·공홈주문
│   ├── plan.js             # 신규기획
│   ├── dashboard.js        # 대시보드
│   ├── modals.js           # 모달 (이미지·상세·등록 등)
│   ├── register.js         # 신규등록 모달 로직
│   ├── excel.js            # 엑셀 업로드/다운로드 (SheetJS)
│   ├── settings.js         # 설정 탭 렌더·CRUD
│   ├── design.js           # 디자인 코드·백스타일 관리
│   ├── upload.js           # 업로드 미리보기·확정
│   └── main.js             # init(), DOMContentLoaded
└── data/
    ├── products_lemango.json   # 르망고 26SS (실제 상품 데이터)
    ├── products_noir.json      # 르망고 느와 (실제 상품 데이터)
    └── combined.json           # 통합
```

## 화면 구성 (탭 6개)
| 탭 | ID | 설명 |
|----|----|------|
| 대시보드 | `tab-dashboard` | KPI 카드, BEST TOP10, 매출현황, 막대 차트 |
| 상품조회 | `tab-product` | 검색+필터, 데이터 테이블, 품번 클릭→상세 모달 |
| 재고 관리 | `tab-stock` | 사이즈별(XS~XL) 재고 테이블 + 신규입고/개별출고 모달 |
| 판매조회 | `tab-sales` | 플랫폼별 판매 테이블 + 공홈 주문 업로드 |
| 신규기획 | `tab-plan` | 기획 상품 관리, 일정, 상품조회 이전 |
| 설정 | `tab-settings` | 브랜드·타입·판매채널 등 기본 옵션 관리 |

## 전역 상태 (`State` 객체)
```js
State.allProducts          // 전체 상품 배열 (단일 진실 소스)
State.planItems            // 신규기획 아이템 배열
State.product.filtered     // 상품조회 필터 결과
State.stock.filtered       // 재고조회 필터 결과
State.sales.filtered       // 판매조회 필터 결과
State.plan.filtered        // 기획조회 필터 결과
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
- `switchTab(tab)` — 탭 전환

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

### 설정
- `renderSettings()` — 설정 탭 전체 렌더
- `addPlatformSetting()` / `editPlatformSetting(idx)` / `savePlatformEdit(idx)` / `removePlatformSetting(idx)` — 판매 채널 CRUD

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
