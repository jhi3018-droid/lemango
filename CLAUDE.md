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

## 화면 구성 (탭 5개)
| 탭 | ID | 설명 |
|----|----|------|
| 대시보드 | `tab-dashboard` | KPI 카드, BEST TOP10, 매출현황, 막대 차트 |
| 상품조회 | `tab-product` | 검색+필터, 데이터 테이블, 품번 클릭→상세 모달 |
| 재고 관리 | `tab-stock` | 사이즈별(XS~XL) 재고 테이블 + 신규입고/개별출고 모달 |
| 판매조회 | `tab-sales` | 플랫폼별 판매 테이블 + 공홈 주문 업로드 |
| 설정 | `tab-settings` | 브랜드·타입·판매채널 등 기본 옵션 관리 |

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
  saleStatus,     // '판매중' | '종료' | '추가생산'
  barcodes: { XS, S, M, L, XL },  // 사이즈별 바코드
  stock: { XS, S, M, L, XL },
  stockLog: [{ type:'in'|'out', date, XS,S,M,L,XL, memo, barcodes, registeredAt }],
  sales: { 공홈, GS, '29cm', W쇼핑, 기타 },  // 키는 _platforms 배열 기준 (동적)
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
| 신규입고 | `stockRegisterModal` | `openStockRegisterModal()` |
| 개별출고 | `outgoingModal` | `openOutgoingModal()` |
| 엑셀 업로드 미리보기 | `uploadPreviewModal` | `showRegisterPreview()` |
| 공홈 주문 미리보기 | `gonghomPreviewModal` | `showGonghomPreview(rows)` |

> 모든 `.srm-modal` 다이얼로그는 `makeDraggableResizable()` 적용 — 드래그+8방향 리사이즈

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
- 형식: `[분류2][성별1][타입2][디자인4][연도1][시즌1][일련번호2]` = 13자리
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

## 전역 변수 — 설정/옵션 관리

| 변수 | localStorage 키 | 설명 |
|------|----------------|------|
| `_settings` | `lemango_settings_v1` | 브랜드·타입·가슴선 등 SETTING_DEFS 기반 옵션 |
| `_platforms` | `lemango_platforms_v1` | 판매 채널 목록 (공홈/GS/29cm/W쇼핑/기타) |
| `_backStyles` | `lemango_back_styles_v2` | 백스타일 [code, en, kr] 배열 |
| `_designCodes` | `lemango_design_codes_v1` | 디자인 번호 [code, en, kr] 배열 |

- `populateAllSelects()` — _settings + _platforms 기반으로 모든 select 요소 동적 채움
- `SETTING_DEFS` — 설정 카드 메타데이터 (key, title, group, type, ph)
- `DEFAULT_PLATFORMS` = `['공홈', 'GS', '29cm', 'W쇼핑', '기타']`

## 설정 탭 (`tab-settings`) 구조

```
#settingsPage
├── 🎨 디자인 관련 (accordion)
│   ├── 상품 타입, 다리파임, 원단타입, 가슴선, 비침, 안감, 캡고리
│   ├── 백스타일 (code 4자리 + 영문 + 한글)
│   └── 디자인 번호/패턴 (code 4자리 + 영문 + 한글)
├── 📋 일반 상품 정보 (accordion)
│   ├── 브랜드
│   └── 판매상태
└── 🛒 판매 채널 (accordion)
    └── 온라인 쇼핑몰 목록 — 추가/수정/삭제
```

판매 채널 수정 시: `_platforms` 변경 + `State.allProducts` 전체 `p.sales` 키 이전 처리

## 재고 관리 구조

```
신규입고 (stockRegisterModal)
  - 엑셀 업로드: 입고일|품번|사이즈|바코드|수량|메모 (long format, 1행 헤더)
  - 업로드 미리보기 후 확정 → ADD 방식 (현재 재고에 더함)
  - p.stock[sz] += qty, p.stockLog.push({type:'in', ...})
  - p.barcodes[sz] = 바코드 (사이즈별 바코드 저장)

개별출고 (outgoingModal)
  - 품번 검색 → 사이즈별 현재재고 표시 → 출고수량 입력
  - p.stock[sz] -= qty (재고 부족 시 오류)
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

## 주요 함수 목록
- `init()` — 앱 초기화, 데이터 로드
- `switchTab(tab)` — 탭 전환 (settings → renderSettings())
- `searchProduct/Stock/Sales()` — 각 탭 검색 (다중 키워드 OR)
- `renderProductTable/StockTable/SalesTable()` — 테이블 렌더
- `renderDashboard()` — 대시보드 전체 갱신
- `renderMiniChart()` — 판매 채널별 막대 차트 (_platforms 기반 동적)
- `openDetailModal(code)` — 상세 모달 열기
- `buildDetailContent(p)` — 상세 모달 HTML 생성
- `toggleDetailEdit()` — 수정모드 토글
- `saveDetailEdit()` — 수정 저장
- `openRegisterModal()` — 신규등록 모달
- `submitRegister(e)` — 신규등록 처리
- `downloadExcel(type)` — 엑셀 다운로드 (_platforms 동적 컬럼)
- `downloadSample(type)` — 샘플 파일
- `handleUpload(input, type)` — 파일 업로드 처리
- `handleRegisterUpload()` — 신규등록 엑셀 업로드
- `showRegisterPreview()` — 업로드 미리보기 (ok/warn/error 분류)
- `confirmRegisterUpload()` — 업로드 확정 등록
- `openStockRegisterModal()` — 신규입고 모달
- `handleStockRegisterUpload()` — 재고 엑셀 업로드 (long format)
- `confirmStockUpload()` — 재고 일괄 저장 (ADD 방식)
- `openOutgoingModal()` / `submitOutgoing()` — 개별 출고 처리
- `handleGonghomUpload(input)` — 공홈 주문 엑셀 파일 읽기
- `showGonghomPreview(rows)` — 공홈 주문 미리보기 모달
- `confirmGonghomUpload()` — 공홈 주문 판매 반영
- `parseGonghomSize(optStr)` — 상품옵션 문자열 → 사이즈 파싱
- `makeDraggableResizable(modal, minW, minH)` — 드래그+리사이즈 초기화
- `centerModal(modal)` — 모달 화면 중앙 배치
- `populateAllSelects()` — 모든 select 동적 채움
- `renderSettings()` — 설정 탭 전체 렌더
- `addPlatformSetting()` / `editPlatformSetting(idx)` / `savePlatformEdit(idx)` / `removePlatformSetting(idx)` — 판매 채널 CRUD
- `parseKeywords(raw)` — 다중 키워드 파싱 (쉼표/줄바꿈, 최대 200)
- `handleSearchPaste(e, inputId)` — 엑셀 붙여넣기 처리
- `updateProductCode()` — 품번 자동생성 (00~99 중 미사용 번호)
- `copyFieldUrl(key, btn)` — 이미지 URL 클립보드 복사

## 작업 이력

### 2026-03-16

#### 바코드 항목 추가
- 상품 스키마에 `barcode` 필드 추가
- 상품조회 테이블에 바코드 컬럼 추가 (품번 옆)
- 검색 기준에 바코드 옵션 추가
- 상세 모달 기본정보 섹션에 바코드·카페24코드 필드 추가
- 신규등록 모달에 바코드 입력 필드 추가
- 엑셀 다운로드에 바코드 컬럼 포함

#### 상세 모달 뷰 모드 개선
- `.dfield-value`에 테두리·배경·패딩 추가 → 수정 모드와 동일한 외형으로 통일

#### 사이즈 규격 분리
- 기존 `sizeSpec` 단일 textarea → `bust`(가슴), `waist`(허리), `hip`(엉덩이) 개별 필드로 분리
- 상세 모달, 신규등록 모달, 엑셀 다운로드 모두 반영

#### 디자인 속성 필드 추가
- `chestLine` (가슴선): 낮음 / 보통 / 높음 — select
- `transparency` (비침): 없음 / 약간있음 — select
- `lining` (안감): 없음 / 있음 — select
- `capRing` (캡고리): 없음 / 있음 — select
- `guide` (가이드): 텍스트 입력
- `legCut` 라벨: '레그컷' → '다리파임' 변경

#### 재고 관리 품번 클릭 모달
- `renderStockTable()` 품번 셀에 `code-link` 클릭 이벤트 추가
- 재고 관리 화면에서 품번 클릭 시 상세 모달(`openDetailModal`) 오픈

#### GitHub 연동
- `https://github.com/jhi3018-droid/lemango` 저장소에 초기 커밋 및 push 완료

---

### 2026-03-17

#### 판매상태 필터 추가
- 상품 스키마에 `saleStatus` 필드 추가 ('판매중' | '종료' | '추가생산')
- 상품조회 검색바에 판매상태 select 추가 (`pSaleStatus`)
- 상세 모달 기본정보 섹션에 판매상태 필드 추가

#### 신규입고 / 개별출고 분리
- "재고 등록" → **신규입고** (stockRegisterModal): 엑셀 업로드 기반, ADD 방식
- **개별출고** (outgoingModal) 신규 추가: 품번 검색 → 사이즈별 출고수량 입력
- 재고 이력 `p.stockLog[]` 추가 (type:'in'|'out')
- 사이즈별 바코드 `p.barcodes{}` 추가

#### 신규입고 엑셀 포맷 변경 (long format)
- 기존 wide format → **long format**: 1행 = 1품번×1사이즈
- 컬럼: 입고일(0) | 품번(1) | 사이즈(2) | 바코드(3) | 수량(4) | 메모(5)
- 업로드 미리보기 모달 → 확정 저장 흐름
- `parseExcelDate()` 유틸 추가 (Excel 시리얼 숫자 + 날짜 문자열 모두 처리)

#### 모달 드래그+리사이즈 공통화
- `makeDraggableResizable(modal, minW, minH)` 범용 함수 추가
- `centerModal(modal)` 유틸 추가
- `.srm-modal { position:fixed; margin:0 }` CSS 필수 (dialog 기본 centering 해제)
- 적용: stockRegisterModal, outgoingModal, gonghomPreviewModal

#### 설정 탭 추가 (`⚙ 설정`)
- 브랜드·타입·다리파임·원단타입·가슴선·비침·안감·캡고리 CRUD
- 백스타일 관리 (code+영문+한글)
- 디자인 번호(패턴) 관리 (code+영문+한글, localStorage 영속화)
- accordion 2섹션: 🎨 디자인 관련 / 📋 일반 상품 정보
- `populateAllSelects()` — 설정 변경 시 모든 select 즉시 반영
- 신규등록·기획등록 모달의 백스타일 검색 패널 제거

#### 판매 채널 동적화 + 설정 관리
- `_platforms` (localStorage: `lemango_platforms_v1`) 도입
- 설정 탭에 🛒 판매 채널 섹션 추가 — 추가/수정/삭제
- 수정 시 `State.allProducts` 전체 `p.sales` 키 자동 이전
- 모든 하드코딩된 `['공홈','GS','29cm','W쇼핑','기타']` → `_platforms` 교체
  - `renderMiniChart`, `renderSalesTable`, `buildDetailContent`
  - 엑셀 다운로드 헤더/행, 샘플 파일, 판매 업로드, 신규상품 sales 초기화
- `slPlatform` select도 _platforms 기반 동적 채움

#### 공홈 주문 내역 업로드
- 판매조회 탭에 `🏠 공홈 주문 업로드` 버튼 추가
- 카페24 주문 내역 엑셀 포맷 파싱
  - B열(1): 자체 상품코드 (메인 매칭)
  - A열(0): 카페24코드 (보조 매칭)
  - C열(2): 수량
  - H열(7): 상품옵션 → `parseGonghomSize()` 사이즈 파싱
  - L열(11): 바코드
- 사이즈 파싱: `Size=M`→`M`, `SIZE=85(M)`→`M`, 빈값→`F`
- 미리보기 모달 (gonghomPreviewModal): 확인/카페24/미매칭 상태 표시
- 확정 시: `p.sales['공홈'] += qty`

---

## 보류 중 작업

### 이미지합치기 웹 통합 (테스트 후 결정)
- `\\lemangokorea\온라인\기타\이미지 합치기\이미지합치기.pyw` 분석 완료
- 기능: HTML 소스 → 이미지 URL+텍스트 파싱 → 1000px 폭 세로 합치기 + 정사각형 변환
- 통합 방향: 순수 JS(Canvas API) + fetch() — CORS 테스트 필요
- 상세 내용: `.claude/projects/.../memory/project_image_combiner.md` 참조

## 다음 작업 후보 (미구현)
- [ ] 공홈 외 다른 쇼핑몰 주문 업로드 포맷
- [ ] 재고/판매 상세 모달에서도 직접 수정
- [ ] 상품 삭제 기능
- [ ] 데이터 영속성 (localStorage 또는 서버 연동)
- [ ] 페이지네이션 (50건 이상)
- [ ] 인쇄/PDF 출력
- [ ] 이미지합치기 웹 통합 (테스트 후)
