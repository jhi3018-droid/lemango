# 르망고 상품 관리 시스템 — CLAUDE.md

## 프로젝트 개요
르망고(수영복 브랜드) 내부 상품 관리 웹 시스템.
순수 HTML + CSS + JavaScript (프레임워크 없음). 로컬 서버: `python -m http.server 8765`

## 파일 구조
```
르망고/
├── index.html          # 전체 화면 (탭 4개 + 모달들)
├── style.css           # 전체 스타일
├── app.js              # 전체 로직
├── CLAUDE.md           # 이 파일
├── .claude/agents/     # 전문 에이전트 5개
└── data/
    ├── products_lemango.json   # 르망고 26SS 14개
    ├── products_noir.json      # 르망고 느와 12개
    └── combined.json           # 통합 26개
```

## 화면 구성 (탭 4개)
| 탭 | ID | 설명 |
|----|----|------|
| 대시보드 | `tab-dashboard` | KPI 카드, BEST TOP10, 매출현황, 막대 차트 |
| 상품조회 | `tab-product` | 검색+필터, 데이터 테이블, 품번 클릭→상세 모달 |
| 재고 관리 | `tab-stock` | 사이즈별(XS~XL) 재고 테이블 + 재고 등록 모달 |
| 판매조회 | `tab-sales` | 플랫폼별(공홈/GS/29cm/W쇼핑/기타) 판매 테이블 |

## 전역 상태 (`State` 객체)
```js
State.allProducts          // 전체 상품 배열 (단일 진실 소스)
State.product.filtered     // 상품조회 필터 결과
State.stock.filtered       // 재고조회 필터 결과
State.sales.filtered       // 판매조회 필터 결과
State.modal.images/idx     // 이미지 모달 상태
```

## 상품 데이터 스키마
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
  images: {
    sum,          // ← 목록/상세 이미지 우선 사용 (업로드 SUM 컬럼)
    lemango, noir, external, design, shoot
  },
  stock: { XS, S, M, L, XL },
  sales: { 공홈, GS, '29cm', W쇼핑, 기타 },
  registDate, logisticsDate
}
```

## 이미지 우선순위
`getThumbUrl()`: sum → lemango → noir → design → shoot 순

## 모달 목록
| 모달 | ID | 열기 함수 |
|------|----|-----------|
| 이미지 뷰어 | `imageModal` | `openModal(idx, images[])` |
| 상품 상세 | `detailModal` | `openDetailModal(productCode)` |
| 신규등록 | `registerModal` | `openRegisterModal()` |
| 재고 등록 | `stockRegisterModal` | `openStockRegisterModal()` |
| 엑셀 업로드 미리보기 | `uploadPreviewModal` | `showRegisterPreview()` |

### 상세 모달 (`detailModal`) 특성
- **드래그**: 헤더를 마우스로 잡아 이동
- **리사이즈**: 8방향 핸들 (모서리 4 + 변 4), 최소 480×300px
- **뷰 모드**: 각 필드가 라벨 + 테두리 박스 형태로 표시 (수정 모드와 동일한 외형)
- **수정모드**: `toggleDetailEdit()` → `.edit-mode` 클래스 토글로 view↔edit 전환
- **저장**: `saveDetailEdit()` → `State.allProducts` 직접 수정 후 테이블 재렌더

### 상세 모달 섹션 구성
| 섹션 | 포함 필드 |
|------|----------|
| 기본 정보 | 브랜드, 품번, 샘플번호, 카페24코드, 바코드, 상품명(한/영), 색상(한/영) |
| 가격/디자인 | 판매가, 원가, 타입, 원단타입, 백스타일, 다리파임, 가이드, 가슴선, 비침, 안감, 캡고리 |
| 소재 | 소재, 원단설명, 디자이너코멘트, 세탁방법 |
| 사이즈 규격 | 가슴(cm), 허리(cm), 엉덩이(cm), 모델착용사이즈 |
| 제조 정보 | 제조년월, 제조사, 제조국 |
| 재고 현황 | XS/S/M/L/XL 뱃지 + 수정 시 입력 그리드 |
| 판매 현황 | 플랫폼별 판매수량 표 |
| 이미지 | SUM/르망고/느와/외부몰 URL (복사 버튼 포함) |

## 업로드 컬럼 구조 (상품 샘플 파일)
2행 헤더, 3행부터 데이터. `UPLOAD_COL` 상수로 컬럼 인덱스 관리.
- **SUM 컬럼(29)**: 줄바꿈 구분 URL → `images.sum` 배열로 파싱 → 목록 이미지로 표시
- 기존 품번 업로드 시: 기본정보·이미지 업데이트, 재고·판매는 유지

## 품번 자동생성 규칙
- 형식: `[분류2][성별1][타입2][디자인4][연도1][시즌2][일련번호2]` = 14자리
- 일련번호: 같은 prefix(12자리) 내에서 00~99 자동 선정 (중복 방지)
- `_reservedCodes` Set으로 임시 예약 → 등록 취소 시 해제, 등록 완료 시 정식 추가

## 검색 기능
- 다중 키워드: 쉼표(,) 또는 줄바꿈으로 구분, 최대 200개
- 엑셀 세로 붙여넣기 지원 (`handleSearchPaste()`)
- 검색 기준: 전체 / 상품명 / 품번 / 백스타일 / **바코드**

## CSS 변수 (브랜드 컬러)
```css
--primary: #1a1a2e      /* 다크 네이비 */
--accent:  #c9a96e      /* 골드 */
--bg:      #f5f4f1      /* 오프화이트 */
--success: #4caf7d
--warning: #f0a500
--danger:  #e05252
```

## CSS 스크롤 핵심 패턴
flex 레이아웃에서 내부 스크롤 활성화 조건:
- 스크롤 컨테이너: `overflow-y: auto` + `min-height: 0`
- 내부 자식 섹션: `flex-shrink: 0` (압축 방지 필수)

## 에이전트 목록 (`.claude/agents/`)
| 파일 | 역할 |
|------|------|
| `data-engineer.md` | 엑셀→JSON 변환, 데이터 스키마 |
| `ui-designer.md` | 레이아웃, 컬러시스템, 컴포넌트 |
| `search-filter.md` | 검색·필터·정렬 로직 |
| `table-renderer.md` | 테이블 컬럼 정의, 렌더링 패턴 |
| `excel-handler.md` | 업로드/다운로드/샘플 (SheetJS) |
| `dashboard.md` | 대시보드, BEST 목록, 차트 |

## 주요 함수 목록
- `init()` — 앱 초기화, 데이터 로드
- `switchTab(tab)` — 탭 전환
- `searchProduct/Stock/Sales()` — 각 탭 검색 (다중 키워드 OR)
- `renderProductTable/StockTable/SalesTable()` — 테이블 렌더
- `renderDashboard()` — 대시보드 전체 갱신
- `openDetailModal(code)` — 상세 모달 열기
- `buildDetailContent(p)` — 상세 모달 HTML 생성
- `toggleDetailEdit()` — 수정모드 토글
- `saveDetailEdit()` — 수정 저장
- `openRegisterModal()` — 신규등록 모달
- `submitRegister(e)` — 신규등록 처리
- `downloadExcel(type)` — 엑셀 다운로드 (전체 컬럼 포함)
- `downloadSample(type)` — 샘플 파일
- `handleUpload(input, type)` — 파일 업로드 처리
- `handleRegisterUpload()` — 신규등록 엑셀 업로드
- `showRegisterPreview()` — 업로드 미리보기 (ok/warn/error 분류)
- `confirmRegisterUpload()` — 업로드 확정 등록
- `openStockRegisterModal()` — 재고 등록 모달
- `saveSrmStock()` — 개별 재고 저장
- `confirmStockUpload()` — 재고 일괄 저장
- `initDraggable()` — 모달 드래그+리사이즈 초기화
- `parseKeywords(raw)` — 다중 키워드 파싱 (쉼표/줄바꿈, 최대 200)
- `handleSearchPaste(e, inputId)` — 엑셀 붙여넣기 처리
- `updateProductCode()` — 품번 자동생성 (00~99 중 미사용 번호)
- `copyFieldUrl(key, btn)` — 이미지 URL 클립보드 복사

## 2026-03-16 작업 내역
### 바코드 항목 추가
- 상품 스키마에 `barcode` 필드 추가
- 상품조회 테이블에 바코드 컬럼 추가 (품번 옆)
- 검색 기준에 바코드 옵션 추가
- 상세 모달 기본정보 섹션에 바코드·카페24코드 필드 추가
- 신규등록 모달에 바코드 입력 필드 추가
- 엑셀 다운로드에 바코드 컬럼 포함

### 상세 모달 뷰 모드 개선
- `.dfield-value`에 테두리·배경·패딩 추가 → 수정 모드와 동일한 외형으로 통일

### 사이즈 규격 분리
- 기존 `sizeSpec` 단일 textarea → `bust`(가슴), `waist`(허리), `hip`(엉덩이) 개별 필드로 분리
- 상세 모달, 신규등록 모달, 엑셀 다운로드 모두 반영

### 디자인 속성 필드 추가
- `chestLine` (가슴선): 낮음 / 보통 / 높음 — select
- `transparency` (비침): 없음 / 약간있음 — select
- `lining` (안감): 없음 / 있음 — select
- `capRing` (캡고리): 없음 / 있음 — select
- `guide` (가이드): 텍스트 입력
- `legCut` 라벨: '레그컷' → '다리파임' 변경

## 다음 작업 후보 (미구현)
- [ ] 재고/판매 상세 모달에서도 직접 수정
- [ ] 상품 삭제 기능
- [ ] 데이터 영속성 (localStorage 또는 서버 연동)
- [ ] 페이지네이션 (50건 이상)
- [ ] 인쇄/PDF 출력
