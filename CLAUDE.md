# 르망고 상품 관리 시스템 — CLAUDE.md

## 프로젝트 개요
르망고(수영복 브랜드) 내부 상품 관리 웹 시스템.
순수 HTML + CSS + JavaScript (프레임워크 없음). 로컬 서버: `python -m http.server 8765`

## 파일 구조
```
르망고/
├── index.html              # 전체 화면 (탭 10개 + 모달들)
├── style.css               # 전체 스타일
├── firebase.json           # Firebase Hosting 설정
├── .firebaserc             # Firebase 프로젝트 (lemango-office)
├── CLAUDE.md               # 이 파일
├── .claude/agents/         # 전문 에이전트
├── js/                     # JS 모듈 분리 (23개 파일)
│   ├── core.js             # State, 설정, 플랫폼, populateAllSelects
│   ├── router.js           # 탭 바 시스템 (openTab, closeTab, resetTabs, applyTabState)
│   ├── utils.js            # 유틸, 페이지네이션, 정렬/필터(initTableFeatures), 미니달력(openMonthPicker)
│   ├── products.js         # 상품조회 검색·렌더
│   ├── stock.js            # 재고조회·입고·출고
│   ├── sales.js            # 매출현황·판매업로드모달
│   ├── sabangnet.js        # 사방넷 주문 업로드·미리보기·확정
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
│   ├── auth.js             # Firebase Auth 초기화, 로그인/로그아웃, 회원가입
│   ├── comments.js         # 모달 댓글 시스템 (buildCommentSection, loadComments, CRUD)
│   ├── board.js            # 게시판 시스템 (공지/자유, 목록/상세/글쓰기, 첨부파일)
│   ├── activity-log.js     # 활동 로그 시스템 (logActivity, 필터/KPI/테이블/페이지네이션/엑셀)
│   ├── members.js          # 회원관리 탭 CRUD, 등급/상태 관리
│   └── main.js             # init(), DOMContentLoaded
└── data/
    ├── products_lemango.json   # 르망고 26SS (실제 상품 데이터)
    ├── products_noir.json      # 르망고 느와 (실제 상품 데이터)
    └── combined.json           # 통합
```

## 화면 구성 (탭 9개)
| 탭 | ID | 설명 |
|----|----|------|
| 대시보드 | `tab-dashboard` | KPI 카드, 캘린더(좌)+매출현황·BEST TOP10(우) 2컬럼 |
| 상품조회 | `tab-product` | 검색+필터, 데이터 테이블, 품번 클릭→상세 모달 |
| 재고 관리 | `tab-stock` | 사이즈별(XS~XL) 재고 테이블 + 신규입고/개별출고 모달 |
| 매출현황 | `tab-sales` | 플랫폼별 판매 테이블 + 판매 업로드 모달 (카페24/사방넷/면세점) |
| 신규기획 | `tab-plan` | 기획 상품 관리, 일정(단계+날짜 필터), 상품조회 이전 |
| 행사일정 | `tab-event` | 월간 캘린더 + 행사 등록/수정/삭제 (localStorage) |
| 업무일정 | `tab-work` | 업무 일정 등록/조회/수정/삭제 (localStorage) |
| 게시판 | `tab-board` | 공지게시판+자유게시판 이너탭, 목록/상세/글쓰기 뷰, 댓글, 첨부파일 (Firestore) |
| 설정 | `tab-settings` | 브랜드·타입·판매채널·업무카테고리 등 기본 옵션 관리 |
| 회원관리 | `tab-members` | 회원 CRUD, 등급/상태 관리, KPI 카드 (Firebase Auth + Firestore) |

## 전역 상태 (`State` 객체)
```js
State.allProducts          // 전체 상품 배열 (단일 진실 소스)
State.planItems            // 신규기획 아이템 배열
State.product.filtered     // 상품조회 필터 결과
State.stock.filtered       // 재고조회 필터 결과
State.sales.filtered       // 매출현황 필터 결과
State.plan.filtered        // 기획조회 필터 결과
State.workItems            // 업무일정 아이템 배열
State.work.filtered        // 업무일정 필터 결과
State.boardPosts           // 게시글 배열 (Firestore)
State.boardFiltered        // 게시판 검색 필터 결과
State.boardType            // 'notice' | 'free'
State.boardPage/PageSize   // 페이지네이션
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
  registDate, logisticsDate,
  revenueLog: [{ date, channel, orderNo, qty, revenue, registeredAt }]
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
| 판매 업로드 | `salesUploadModal` | `openSalesUploadModal()` |
| 카페24 주문 미리보기 | `gonghomPreviewModal` | `showGonghomPreview(rows)` |
| 사방넷 주문 미리보기 | `sabangnetPreviewModal` | `showSabangnetPreview(rows)` |
| 기획 상세 | `planDetailModal` | `openPlanDetailModal(no)` |
| 행사 등록/수정 | `eventRegisterModal` | `openEventRegisterModal()` / `editEvent(no)` |
| 기획일정 조회 | `planScheduleModal` | `openPlanScheduleForDate(dateStr)` / `openDashEventInfo(no)` |
| 업무일정 등록 | `workRegisterModal` | `openWorkRegisterModal()` |
| 업무일정 상세 | `workDetailModal` | `openWorkDetailModal(no)` |
| 일정 상세 (Overflow) | `dashDayModal` | `openDashDayModal(dateStr)` |
| 회원가입 | `signupModal` | `openSignupModal()` |
| 회원 수정 | `memberEditModal` | `openMemberEditModal(uid)` |
| 회원 추가 | `memberAddModal` | `openMemberAddModal()` |

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

## 카페24 주문 업로드

판매 업로드 모달 (`salesUploadModal`) — 카페24/사방넷/면세점 3탭 구조

### 카페24 파일 형식 (A~AA, 27컬럼)
| 열 | 인덱스 | 내용 | 용도 |
|----|--------|------|------|
| A | 0 | 주문일시 | 미리보기 표시 |
| B | 1 | 환불완료일 | 빈값=정상, 값있음=환불 (환불행 구분) |
| C | 2 | 주문번호 | 미리보기 표시 |
| E | 4 | 자체 상품코드 | ★ 품번 매칭 키 (`State.allProducts[].productCode`) |
| F | 5 | 상품명 | 미매칭 시 표시용 |
| H | 7 | 상품옵션 | ★ 사이즈 파싱 (`parseCafe24Size`) |
| I | 8 | 쇼핑몰 | LEMANGOKOREA=자사몰, LEMANGO PARTNER=파트너 |
| M | 12 | 수량 | ★ 판매 반영 수량 |
| N | 13 | 판매가 | 미리보기 표시 |
| P | 15 | 상품구매금액 | ★ 매출액 계산 (판매가×수량, per-item) |
| Q | 16 | 총 배송비 | ★ 매출액 계산 (소스에서 첫품목만 값, 나머지 0) |
| U | 20 | 실제 환불금액 | ★ 매출액 계산 (동일주문 전행 동일값 반복 → MAX 1회) |
| W | 22 | 사용한 적립금액(최종) | 순실결제 계산용 (동일주문 전행 동일값) |
| Y | 24 | 상품별 추가할인금액 | ★ 매출액 계산 (per-item) |

### 매출액 계산 공식 (검증완료)
```
매출 = P(전체합산) + Q(전체합산) - U(주문번호당 MAX값 1회) - Y(전체합산)
```
- **P**: 상품구매금액, SUM 전체행 (판매가×수량, per-item)
- **Q**: 총배송비, SUM 전체행 (소스에서 이미 첫품목만 값있음, 나머지 0/NaN)
- **U**: 실제환불금액, **주문번호당 MAX** 후 SUM (⚠️ 동일값이 전 행에 반복기재 → SUM하면 중복계산, FIRST는 부분환불 11건 누락)
- **Y**: 상품별추가할인금액, SUM 전체행 (per-item)
- **W**: 사용한적립금액, 주문번호당 FIRST (순실결제 = 매출 - W)

검증값(2026-01): P=300,281,100 + Q=3,399,000 - U=8,329,593 - Y=87,712,735 = **207,637,772**
(이전 U=7,652,196은 FIRST방식으로 부분환불 11건 누락. MAX로 보정완료)

### 주문단위 계산 (`_cafe24Orders`)
- 주문번호(C열)로 그룹핑 → 각 주문별 P/Q/U/Y/W 집계
- `order.revenue = P + Q - U(MAX) - Y`
- 행단위 항목매출: `itemRevenue = P - Y` (상품 기여분, Q/U 제외)
- 미리보기 테이블: 행별 `P-Y` 표시, 상단 요약에 주문단위 매출총액 표시

### 채널 매핑
- `LEMANGOKOREA` → `'공홈'`
- `LEMANGO PARTNER` → `'파트너'`
- 파트너 채널이 `_platforms`에 없으면 경고 토스트

`parseCafe24Size(optStr)` 규칙:
- `SIZE=90(L)` → `L` (괄호 안 추출)
- `Size=M` → `M`
- 빈 값 → `F` (프리사이즈)

### 주문번호 중복 검출 (CRITICAL)
- 업로드 시 전체 `State.allProducts[].revenueLog[].orderNo` 수집 → Set 구축
- 각 행의 주문번호(C열)가 Set에 존재하면 `isDuplicate = true`
- 중복 행: 파란 배경 + 취소선, 체크박스 disabled, 확정 시 절대 반영 안 됨
- 같은 파일 재업로드 시 모든 행이 "중복" 표시

### 행 상태 우선순위
| 우선순위 | 조건 | 상태 | 체크박스 | 적용 |
|---------|------|------|---------|------|
| 1 | orderNo 기존 revenueLog에 있음 | 중복 | disabled | 안 됨 |
| 2 | B열 값 + 미매칭 | 환불(미매칭) | disabled | 안 됨 |
| 3 | B열 값 + 매칭 | 환불 | **checked** | **마이너스 적용** |
| 4 | 매칭 | 정상 | checked | 플러스 적용 |
| 5 | 미매칭 | 미매칭 | disabled | 안 됨 |

### 미리보기 모달 (`gonghomPreviewModal`)
- 열: 선택(체크박스) | 상태 | 주문일시 | 주문번호 | 채널 | 품번 | 상품명 | 사이즈 | 수량 | 매출액 | 매칭
- 중복행: 파란 배경 + 취소선, checkbox disabled
- 환불행: 연분홍 배경 + 취소선, checkbox checked (매칭 시), 매출액 빨간 마이너스 표시
- 환불(미매칭)행: 주황 배경, checkbox disabled
- 미매칭행: checkbox disabled
- 정상+매칭 행: 기본 체크됨
- 상단 요약: 총건수, 정상, 환불, 중복, 매칭, 미매칭, 매출액(정상-환불 순액)

### 확정 처리
- 중복 행: 무조건 skip (isDuplicate === true)
- **정상 행**: `p.sales[channel] += qty`, revenueLog `type:'sale'`, 양수 qty/revenue
- **환불 행**: `p.sales[channel] -= qty`, revenueLog `type:'refund'`, 음수 qty/revenue
- revenueLog 구조: `{ type:'sale'|'refund', date, channel, orderNo, qty, revenue, registeredAt }`
- `renderSalesTable()` + `renderDashboard()` 갱신
- 토스트: "카페24 주문 반영: 정상 N건, 환불 N건 차감 (중복 N건, 미매칭 N건 제외)"

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
- `injectSampleData()` — 샘플 데이터 주입 (5개 탭, `init()` 내에서 호출)
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
- `openSalesUploadModal()` — 판매 업로드 모달 열기 (카페24/사방넷/면세점 탭)
- `handleGonghomUpload(input)` — 카페24 주문 엑셀 파일 읽기 (CAFE24 컬럼 매핑, A~AA 27컬럼)
- `showGonghomPreview(rows)` — 카페24 주문 미리보기 (중복검출, 환불구분, 체크박스)
- `confirmGonghomUpload()` — 정상: sales += qty, 환불: sales -= qty, revenueLog 기록
- `_toNum(v)` — 안전한 숫자 변환 (NaN/empty → 0)
- `cafe24Channel(shopName)` — LEMANGOKOREA→'공홈', LEMANGO PARTNER→'파트너'
- `parseCafe24Size(optStr)` — 상품옵션 → 사이즈 파싱 (SIZE=90(L)→L, Size=M→M, 빈값→F)
- `_buildExistingOrderIndex()` — revenueLog 전체 주문번호 Set 구축 (중복 검출용)

### 업무일정
- `renderWorkCalendar()` — 업무일정 캘린더 렌더
- `placeWorkBars(gridStart, gridEnd, items, maxRows)` — 바 배치 알고리즘
- `wkPrevMonth()` / `wkNextMonth()` / `wkToday()` — 월 이동
- `wkFilterCategory(val)` — 카테고리 필터
- `openWorkRegisterModal()` / `submitWork(e)` / `closeWorkRegisterModal()` — 등록 모달
- `openWorkDetailModal(no, fromDash)` / `closeWorkDetailModal()` — 상세 모달 (`fromDash=true` 시 수정 버튼 → "업무일정에서 수정" 탭 이동 버튼으로 교체)
- `editWorkFromDetail(no)` — 상세에서 수정 모달 열기
- `deleteWork(no)` — 삭제 (korConfirm)
- `renderWorkTable()` — 호환 래퍼 (→ `renderWorkCalendar()`)

### 설정
- `renderSettings()` — 설정 탭 전체 렌더
- `addPlatformSetting()` / `editPlatformSetting(idx)` / `savePlatformEdit(idx)` / `removePlatformSetting(idx)` — 판매 채널 CRUD
- `addWorkCategorySetting()` / `editWorkCategorySetting(idx)` / `saveWorkCategoryEdit(idx)` / `removeWorkCategorySetting(idx)` — 업무 카테고리 CRUD

### 매출현황 플랫폼 관리
- `initSalesPlatforms()` — 플랫폼 active/inactive 초기화 + 설정 동기화
- `renderInactiveArea()` — 비활성 칩 렌더 + 드래그 이벤트 바인딩
- `removeSalesPlatform(pl)` / `activateSalesPlatform(pl, idx)` / `reorderSalesPlatform(from, toIdx)` — 플랫폼 상태 변경
- `bindSalesDragDrop()` — 테이블 헤더 드래그앤드롭 이벤트 바인딩
- `clearDropIndicators()` — 드래그 구분선 CSS 클래스 정리

### 테이블 공통 (정렬/필터/리사이즈)
- `initTableFeatures(tableId, tabKey, renderFnName)` — sort/filter/resize 통합 초기화
- `openColumnFilter(th, tabKey, key, renderFnName)` — 필터 드롭다운 열기 (교차 필터 지원)
- `closeColumnFilter()` — 필터 드롭다운 닫기
- `applyColFilters(data, columnFilters)` — 데이터에 컬럼 필터 적용 (AND 조건)
- `getColUniqueValues(data, key)` — 컬럼 고유값 추출 (숫자 컬럼은 숫자순 정렬)
- `clearAllColumnFilters(tabKey)` — 전체 컬럼 필터 초기화

### 공통 컬럼 드래그 관리
- `initColumnState(tabKey, allColKeys)` — activeColumns 초기화 + 신규/삭제 컬럼 동기화
- `renderColInactiveArea(areaId, tagsId, tabKey, colDefs, fixedKeys, renderFnName)` — 비활성 영역 렌더 + 드롭 이벤트
- `removeColumn(tabKey, colKey, renderFnName)` — 컬럼 숨김
- `restoreColumn(tabKey, colKey, insertIdx, renderFnName)` — 컬럼 복원
- `reorderColumn(tabKey, fromKey, toIdx, renderFnName)` — 순서 변경
- `bindColumnDragDrop(tableId, tabKey, fixedKeys, renderFnName)` — 헤더 드래그 이벤트 바인딩 (colspan th 포함)
- `clearColDropIndicators()` — 드래그 구분선 정리

### 대시보드
- `renderDashboard()` — 대시보드 전체 렌더
- `renderDashCalendar()` — 대시보드 캘린더 렌더
- `openDashEventInfo(no)` — 대시보드 행사 조회 모달 (읽기전용)
- `openPlanScheduleForDate(dateStr)` — 기획일정 날짜 조회 모달
- `openDashDayModal(dateStr)` — overflow 날짜 상세 모달 (행사/기획/업무 3섹션)
- `closeDashDayModal()` — dashDayModal 닫기 핸들러

### 기획
- `searchPlan()` — 신규기획 검색
- `renderPlanTable()` — 신규기획 테이블 렌더
- `openPlanRegisterModal()` — 기획 등록 모달 열기
- `goToPlanWithDate(dateStr)` — 기획 탭으로 이동 + 날짜 필터 자동 세팅
- `goToPlanWithItem(identifier)` — 기획 탭으로 이동 + 품번 필터 (`#npKeyword` 세팅 + `searchPlan()`)

### 유틸
- `makeDraggableResizable(modal, minW, minH)` — 드래그+리사이즈 초기화
- `centerModal(modal)` — 모달 화면 중앙 배치
- `populateAllSelects()` — 모든 select 동적 채움
- `parseKeywords(raw)` — 다중 키워드 파싱 (쉼표/줄바꿈, 최대 200)
- `handleSearchPaste(e, inputId)` — 엑셀 붙여넣기 처리
- `parseExcelDate(val)` — Excel 시리얼/문자열 → YYYY-MM-DD
- `copyFieldUrl(key, btn)` / `copySingleUrlFromBtn(btn)` — URL 클립보드 복사
- `showToast(msg, type)` — 토스트 알림
- `openMonthPicker(triggerEl, year, month, callback)` — 미니 달력 팝업 열기
- `closeMonthPicker()` — 미니 달력 팝업 닫기
- `getPageSize(tabKey)` — 탭별 커스텀 pageSize 반환
- `changeProductPageSize()` — 상품조회 페이지 사이즈 변경
- `changeStockPageSize()` — 재고관리 페이지 사이즈 변경
- `changePlanPageSize()` — 신규기획 페이지 사이즈 변경
- `changeSalesPageSize()` — 매출현황 페이지 사이즈 변경
- `fixStickySubRow(tableId)` — 2단 헤더 2행 `top` 동적 계산 적용

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

## 게시판 시스템 (`tab-board`)

### 구조
- Firestore `posts` 컬렉션 기반 (로그인 필수)
- 이너 탭 2개: 공지게시판(`notice`), 자유게시판(`free`)
- 3개 뷰: 목록(`boardListView`), 상세(`boardDetailView`), 글쓰기/수정(`boardWriteView`)

### Firestore `posts` 스키마
```js
{
  boardType,        // 'notice' | 'free'
  category,         // notice: 공지/업데이트/행사/가이드, free: 일반/질문/공유/건의
  title, content,
  authorUid, authorName, authorGrade,
  pinned,           // boolean (공지게시판 + grade>=3 만 설정 가능)
  important,        // boolean
  views,            // 조회수 (상세 열 때 +1)
  commentCount,     // 댓글 수 (comments.js에서 increment/decrement)
  attachments: [{ name, size, data(base64) }],  // 최대 5개, 10MB/개
  createdAt, updatedAt
}
```

### 카테고리
- `BOARD_CATS = { notice: ['공지','업데이트','행사','가이드'], free: ['일반','질문','공유','건의'] }`
- `getCategoryClass(cat)` → CSS 클래스 (8가지 색상 배지)

### 목록 뷰
- 고정글(pinned) 항상 최상단 ★ 아이콘, 24h 이내 NEW 배지(N), 댓글수 표시
- 분류 필터 + 검색(제목/내용/작성자/전체) + 페이지네이션(20/30/50)
- 클릭 → `openBoardPost(postId)` → 상세 뷰

### 상세 뷰
- 조회수 자동 증가, 첨부파일 다운로드, 이전/다음 글 네비게이션
- 작성자 또는 grade>=3 → 수정/삭제 버튼
- 하단 댓글 섹션 (`buildCommentSection('board', postId)`)

### 글쓰기/수정 뷰
- 분류 선택, 제목, 내용, 첨부파일 (base64, 최대 5개)
- 공지게시판 + grade>=3: 고정/중요 체크박스 표시
- 삭제 시 관련 댓글도 batch 삭제

### 댓글 연동
- `comments.js`에서 `modalType='board'` → `posts.commentCount` increment/decrement

### 주요 함수
- `renderBoard()` — 초기 렌더 (탭 열릴 때)
- `switchBoardType(type)` — 이너 탭 전환
- `loadBoardPosts()` — Firestore에서 게시글 로드
- `applyBoardSearch()` / `searchBoard()` / `resetBoardSearch()` — 검색
- `renderBoardList()` / `buildBoardRow()` — 목록 렌더
- `openBoardPost(postId)` / `renderBoardDetail()` — 상세 보기
- `openBoardWrite(editPostId?)` / `submitBoardPost()` / `cancelBoardWrite()` — 글쓰기/수정
- `deleteBoardPost(postId)` — 삭제 (댓글 batch 삭제 포함)
- `handleBoardFileSelect(input)` / `removeBoardAttachment(idx)` / `renderBoardAttachments()` / `downloadAttachment(idx)` — 첨부파일
- `renderBoardPagination()` / `goBoardPage()` / `changeBoardPageSize()` — 페이지네이션

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

#### 버그 수정
- `app.js` 레거시 script 참조 제거 (index.html에서 삭제된 파일 참조 → 전체 JS 먹통 원인)
- 페이지네이션 컨테이너 4개 복원 (`#pPagination`, `#sPagination`, `#slPagination`, `#npPagination`)
- 소진율 컬럼 깨짐 수정 (tfoot colspan 계수 오류 15→14)
- 품번 너비 미적용 수정 (`table-layout:fixed`에서 `min-width` → `width` 변경)
- 판매조회 품번 리사이즈 불가 수정 (`initColumnResize`에서 rowspan th 누락)

#### 판매조회 테이블 전면 개편
- **피벗테이블형 플랫폼 컬럼 관리**: 드래그로 컬럼 제거/복원/순서변경
- `State.sales.activePlatforms` / `State.sales.inactivePlatforms` 도입
- 비활성 플랫폼 영역 (`#slInactiveArea`) — 항상 표시, 드래그앤드롭 UI
- 2단 헤더: 플랫폼명(colspan=2) + 수량/매출액 서브행
- 매출액 계산: 수량 × 판매가, 합계는 전체 `_platforms` 기준

#### 테이블 공통 개선 (4개 탭)
- 가로/세로 구분선 추가 (`.data-table`)
- `initTableFeatures(tableId, tabKey, renderFnName)` — sort/filter/resize 통합 초기화
  - `bindSortHeader` + `updateSortIcons` + `initColumnResize` 3개 함수 대체
  - 모든 `data-key` th에 자동으로 정렬/필터 아이콘 추가
  - `data-no-sort` / `data-no-filter` 속성으로 개별 컬럼 제외 (이미지/NO만 제외)
- 컬럼 리사이즈 드래그 (2단 헤더 rowspan 호환)
- 이미지 `width:60px`, NO `width:45px`, 품번 `width:145px` 기본값
- 텍스트 오버플로우: `overflow:hidden; text-overflow:ellipsis` 전체 th/td
- 페이지 사이즈 드롭다운 (10/30/50/100/전체) — `.page-size-row`로 테이블 위 우측 배치
  - `changeProductPageSize()`, `changeStockPageSize()`, `changePlanPageSize()`, `changeSalesPageSize()`
  - `getPageSize(tabKey)` — 탭별 커스텀 pageSize 지원

#### 정렬 기능 (버튼 방식)
- `.th-sort` 버튼 클릭으로만 정렬 (헤더 텍스트 클릭은 트리거 아님)
- 3단계 토글: 없음(⇅) → 오름차순(▲) → 내림차순(▼) → 없음(⇅)
- hover 효과 + `cursor:pointer` + `border-radius` + 배경 전환

#### 엑셀 스타일 컬럼 필터
- `.th-filter` 아이콘 클릭 → 고유값 체크박스 드롭다운 (`.col-filter-dd`)
- 검색 input + 전체선택/해제 + 적용/초기화 버튼
- 여러 컬럼 동시 필터 (AND 조건)
- **교차 필터**: 필터 열 때 다른 활성 필터가 적용된 데이터 기준으로 고유값 추출
- 숫자 컬럼: 숫자순 정렬하여 드롭다운 표시
- 활성 필터 아이콘: 골드(`var(--accent)`) 강조
- `State[탭].columnFilters = { colKey: Set(선택된값들) }`

#### 테이블 헤더 틀고정 (sticky)
- `.data-table thead th`: `position:sticky; top:0; z-index:10`
- 판매조회 2단 헤더: 1행 `z-index:12`, 2행 `top:38px; z-index:11`
- 신규기획 2단 헤더: 1행 `z-index:12`, 2행 `top:38px; z-index:11`
- `.table-wrap` max-height: `calc(100vh - 260px)`
- 필터 드롭다운 `z-index:1000` > 헤더 `z-index:12` — 정상 표시

#### 멀티탭 시스템 도입
- 네비게이션 클릭 → 탭 바(`#tabBar`)에 탭 추가 (DOM 유지 전환)
- 이미 열린 메뉴 클릭 → 해당 탭으로 포커스 이동
- × 버튼으로 탭 닫기 (인접 탭 전환), LEMANGO 로고 → 전체 리셋
- `State.openTabs`, `State.activeTab`, `TAB_LABELS` 도입
- `_renderedTabs` Set: 첫 열림 시만 렌더, 이후 DOM 유지
- 탭 바 sticky (`top:56px`), `#232340` 배경, 골드 하이라이트

#### 업무일정 탭 신규 추가 (`tab-work`)
- `js/work.js` 신규 파일 — 업무일정 CRUD + 월간 캘린더
- 카테고리별 컬러 바: `WORK_CAT_COLORS` + `WORK_CAT_PALETTE`, `getWorkCatColor(cat)`
- 시작일~종료일 연속 바 표시, `placeWorkBars()` 배치 알고리즘
- 등록 모달 (`workRegisterModal`), 상세 모달 (`workDetailModal`)
- 카테고리 필터, 월 이동 (`wkPrevMonth/wkNextMonth/wkToday`)
- 설정 탭: 업무일정 카테고리 CRUD (`_workCategories`, `DEFAULT_WORK_CATEGORIES`)
- 대시보드 캘린더: 업무일정 바 표시 + 범례 "업무" 추가
- localStorage: `lemango_work_items_v1`, `lemango_work_categories_v1`

#### 상품조회 컬럼 추가
- `lastInDate` 컬럼: 제조년월 옆, `p.stockLog`에서 `type==='in'` 최신 날짜 추출
- 상세 모달 제조 정보 섹션에 `최종입고일` 읽기전용 필드 추가

#### 레이아웃 확장
- `.main`: `max-width:1600px` → `max-width:none`, `padding: 20px 20px 40px`, `margin:0`
- 전체 콘텐츠가 브라우저 전체 폭 활용

#### 캘린더 연월 미니 달력 팝업
- `openMonthPicker(triggerEl, year, month, callback)` — 공통 함수 (`js/utils.js`)
- 상단: `◀ [연도] ▶` 연도 이동, 본문: 4열×3행 월 버튼 그리드
- 선택 월: `var(--accent)` 배경, 오늘 월: `var(--accent)` 테두리
- 바깥 클릭 / ESC 닫기, 화면 밖 넘침 방지
- 3개 캘린더 적용: 대시보드, 행사일정, 업무일정
- `.cal-month-clickable` — 연월 텍스트 hover 효과 (cursor:pointer + 밑줄)
- `.month-picker` — z-index:500, border-radius:8px, box-shadow

---

### 2026-03-30

#### 2단 헤더 sticky top 버그 수정
- **원인**: 판매조회/신규기획 2단 헤더의 2행 `top: 38px` 하드코딩 — `initTableFeatures()`가 정렬/필터 아이콘을 삽입하면서 1행 높이가 증가하여 2행이 데이터 행과 겹침
- **수정**: `fixStickySubRow(tableId)` 함수 추가 (`js/utils.js`) — 렌더 후 1행 실제 높이를 측정(`getBoundingClientRect`)하여 2행 `th.style.top`에 동적 적용
- CSS `top: 38px` 하드코딩 제거 (`.sales-table thead .sales-sub-row th`, `.plan-table thead tr:nth-child(2) th`)
- `renderSalesTable()`, `renderPlanTable()` 양쪽에서 `initTableFeatures()` 직후 호출

#### 샘플 데이터 주입 (5개 탭)
- `js/main.js` — `injectSampleData()` 함수 추가, `init()` 내에서 호출
- 신규기획 15개 (르망고 10 + 느와 5, SS/FW 혼합, confirmed 4개)
- 재고관리 15개 상품 stock + stockLog 1~3건
- 판매조회 동일 15개 상품 sales (플랫폼별 배분, 소진율 현실적)
- 행사일정 15개 (공홈/GS/29cm/W쇼핑/기타, 3~8월, 중복 방지 로직)
- 업무일정 15개 (연차/차량사용/미팅일정/기타, 3~6월)

#### 전체 테이블 탭 컬럼 드래그 관리 기능
- 상품조회, 재고관리, 신규기획 3개 탭에 컬럼 표시/숨김/순서변경 드래그 기능 추가
- 판매조회는 기존 플랫폼 드래그 유지

**공통 인프라 (`js/utils.js`)**
- `initColumnState(tabKey, allColKeys)` — activeColumns 초기화 + 신규/삭제 컬럼 동기화
- `renderColInactiveArea(areaId, tagsId, tabKey, colDefs, fixedKeys, renderFnName)` — 비활성 영역 렌더 + 드롭 이벤트
- `removeColumn(tabKey, colKey, renderFnName)` — 컬럼 숨김
- `restoreColumn(tabKey, colKey, insertIdx, renderFnName)` — 컬럼 복원
- `reorderColumn(tabKey, fromKey, toIdx, renderFnName)` — 순서 변경
- `bindColumnDragDrop(tableId, tabKey, fixedKeys, renderFnName)` — 헤더 드래그 이벤트 바인딩 (colspan th 포함)
- `clearColDropIndicators()` — 드래그 구분선 정리

**State 변경 (`js/core.js`)**
- `State.product/stock/plan` 에 `activeColumns: null`, `inactiveColumns: []` 추가

**HTML (`index.html`)**
- 3개 탭에 비활성 영역 div 추가: `#pInactiveArea`, `#sInactiveArea`, `#npInactiveArea`

**CSS (`style.css`)**
- `sl-inactive-*` 스타일 → `col-inactive-*` 공통 클래스로 일반화 (기존 sl- 도 유지)
- `.col-drag-th`, `.col-dragging`, `.col-drag-over-left/right` 신규 추가

**각 탭 렌더 함수 재작성**
- `PRODUCT_COLUMNS` / `STOCK_COLUMNS` / `PLAN_ALL_COLS` 컬럼 정의 배열 도입
- 각 컬럼 정의: `{ key, label, fixed, thAttr, td(p), tf?(totals) }`
- 렌더 시 `activeColumns` 기준으로 th/td 동적 생성
- 신규기획 2단 헤더: regular(rowspan=2) + schedule group(colspan=2) 분리 처리
- tfoot도 activeColumns 기반 동적 생성

**탭별 고정 컬럼 (제거 불가)**
- 상품조회: `_image`, `productCode`
- 재고관리: `_image`, `productCode`
- 신규기획: `productCode`

**초기화 시 컬럼 상태 리셋**: `resetProduct/Stock/Plan()`에 `activeColumns=null, inactiveColumns=[]` 추가

---

### 2026-03-31

#### 대시보드 캘린더 셀 확장 + Overflow day modal

- 셀당 최대 표시 바: 4 → 6줄, `.dcal-cell` min-height: 96px → 130px
- `+N건` 클릭 → `openDashDayModal(dateStr)` 신규 함수
  - 해당 날짜의 행사일정 + 기획일정(단계별) + 업무일정 전부 수집
  - `#dashDayModal` (`<dialog class="srm-modal">`) 에 3개 섹션으로 그룹 렌더
  - 각 행 클릭 → 해당 상세 모달 열림 (event/plan/work)
  - 드래그+리사이즈, 중앙배치, ×버튼+backdrop 클릭 닫기
- `index.html` — `#dashDayModal` 다이얼로그 추가
- `js/main.js` — `makeDraggableResizable(dashDayModal)` + backdrop close 초기화
- `style.css` — `.ddm-section`, `.ddm-section-title`, `.ddm-row`, `.ddm-badge`, `.ddm-item-name`, `.ddm-item-period` 신규

#### 대시보드 업무일정 바 클릭 → 모달 (탭 이동 수정)

- 대시보드 캘린더 업무일정 바 onclick: `openTab('work')` → `openWorkDetailModal(w.no)` 수정
- 일반 바·past 바 양쪽 모두 적용
- `js/work.js`는 이미 정상 (`openWorkDetailModal` → `modal.showModal()`)

#### 기획일정 모달 → 품번 필터 조회

- `openPlanScheduleForDate()` 내 각 품번 행에 **보기** 버튼 추가
- 신규 `goToPlanWithItem(identifier)` 함수:
  - `openTab('plan')` → `#npKeyword` = identifier → 검색타입 '품번+샘플번호' → `searchPlan()`
  - 결과: 기획 탭에서 해당 품번/샘플번호 즉시 필터
- 기존 "신규기획에서 수정하기" 버튼 → `goToPlanWithDate` 유지 (날짜 전체 보기)

#### dashDayModal 버그 수정 3종

- **`centerModal()` 순서 교체**: `showModal()` 호출 전에 `centerModal()` 먼저 호출 — 이전에는 모달이 top-left에 렌더된 뒤 중앙 이동하여 순간 깜빡임 발생
- **`<dialog>` inline `style="display:flex"` 제거**: 브라우저가 dialog를 `display:none`으로 닫을 때 인라인 스타일이 우선되어 `dialog.close()`가 작동하지 않던 원인 → CSS 클래스로 flex 처리
- **`applyTabState()`에 모달 자동 닫힘 추가**: `querySelectorAll('dialog.srm-modal[open]').forEach(d => d.close())` — 탭 전환 시 열려있는 모든 srm-modal 다이얼로그 자동 닫힘

#### 대시보드 캘린더 날짜 셀 클릭 → dashDayModal

- `.dcal-cell`에 `data-date` 속성 추가 (기존에는 `+N건` 버튼만 트리거)
- 각 셀에 click 이벤트 바인딩: bar/`+N건` 클릭 이벤트는 `stopPropagation()`, 셀 배경 클릭 시 `openDashDayModal(dateStr)` 호출
- CSS: `.dcal-cell { cursor: pointer }`, hover 배경 `rgba(0,0,0,0.03)`

#### 스택 모달 — dashDayModal 위에 상세 모달

- dashDayModal 행 onclick에서 `.close()` 호출 제거 — dashDayModal은 열린 채 유지
- `showModal()` 네이티브 top-layer 스택: 상세 모달이 dashDayModal 위에 렌더됨
- 상세 모달 닫기 후 dashDayModal로 자연스럽게 복귀

#### 탭 이동 함수 수정 (dashboard context)

- `openDashEventInfo()`: 내부 `navigateTo('event')` → `openTab('event')` 수정 (탭 바 시스템 연동)
- `openWorkDetailModal(no, fromDash)`: `fromDash=true`이면 수정 버튼 대신 "업무일정에서 수정" 버튼 표시 → `openTab('work')` 후 해당 상세 모달 재오픈
- 대시보드 캘린더에서 업무일정 바 클릭 시 `openWorkDetailModal(no, true)` 호출
- `goToPlanWithDate(dateStr)`: `openTab('plan')` → `#npDateFrom/To` 날짜 필터 세팅 → `searchPlan()` 호출 순서 확인

#### 기획 바 텍스트 약어 + 툴팁

- 대시보드 캘린더 기획 바 텍스트: 기존 `"품번 단계명 시작/완료"` → 단계명만 표시 (디자인/생산/이미지/상품등록/물류입고)
- hover `title` 속성: `"품번 단계명 start~end"` 전체 정보

#### dashDayModal 그룹 정렬 + 섹션 헤더

- **행사일정**: `startDate` ASC 정렬
- **기획일정**: `productCode` ASC → 단계 순서(design → production → image → register → logistics)
- **업무일정**: `category` ASC → `startDate` ASC
- 섹션 헤더: `font-weight:500` + `.ddm-count` 뱃지 (항목 수)
- 빈 섹션 숨김 (해당 날짜에 일정이 없는 섹션은 렌더 안 함)

---

### 2026-04-01

#### dashDayModal 섹션별 컬러 코딩

- 기획일정/행사일정/업무일정 섹션 div에 타입별 CSS 클래스 추가
  - 행사일정: `ddm-section-event` (left border `var(--primary)` 네이비)
  - 기획일정: `ddm-section-plan` (left border `var(--accent)` 골드)
  - 업무일정: `ddm-section-work` (left border `var(--success)` 초록)
- 섹션 타이틀 배경 tint: 각 색상 10% opacity
- `style.css` — 6개 규칙 추가 (`.ddm-section-event/plan/work`, `.ddm-section-title` 배경)

#### dashDayModal 기획일정 단계별 서브 그룹

- 기획일정 섹션을 flat 목록 → 단계별 서브 그룹으로 재구성
- 단계 순서: 디자인 → 생산 → 이미지 → 상품등록 → 물류입고
- `PHASE_ORDER_LABELS` 배열로 순서 정의
- `phaseGroups` 객체로 `planHits`를 단계 키별 분류 → `startDate` ASC 정렬
- 빈 단계 숨김
- `hexToRgba10()` 헬퍼 추가: hex 색상 → `rgba()` 10% opacity 변환
- 서브 헤더 (`.ddm-phase-header`): phase color `border-left` + 10% tint 배경 + 항목 수 뱃지
- 아이템 행: `.ddm-phase-badge` (phase color 배경 + 흰 글자) + 품번 + 날짜 범위
- `style.css` — `.ddm-phase-header`, `.ddm-phase-badge` 2개 규칙 추가

#### dashDayModal 기획일정 조회 버튼

- 기획일정 섹션 헤더에 "전체조회" 버튼 추가 (골드 배경, 오른쪽 정렬)
- 각 단계 서브헤더에 "조회" 버튼 추가 (phase color 아웃라인)
- 신규 함수 2개 (`js/dashboard.js`):
  - `goToPlanFromDash(dateStr, codesStr)` — 모달 닫기 → plan 탭 → 품번 키워드 필터 → `searchPlan()`
  - `goToPlanPhaseFromDash(dateStr, phaseKey, codesStr)` — 위 + `npPhase` 단계 필터
- 버튼 onclick: codes 배열을 comma-join 문자열로 전달 (`JSON.stringify` 금지 — 큰따옴표가 HTML 속성 파싱을 깨뜨림)
- `allCodes`: 전체 planHits의 productCode (Set으로 중복 제거)
- `phaseCodes`: 각 단계 hits의 productCode
- `npKeyword` = `codesStr`, `npSearchType` = `'code'`, `npConfirmed` = `''` (이전 항목도 표시)
- 날짜 필터(`npDateFrom/To`)는 초기화 — 정확한 품번만 필터링

#### dashDayModal 기획일정 데이터 조건 수정 (캘린더 동기화)

- 기존: `start <= dateStr <= end` (범위 전체 매치) — 캘린더에 바 없는 날짜도 모달에 표시
- 수정: `dateStr === start || dateStr === end` (시작일/종료일만 매치) — 캘린더와 동일 조건
- `start`와 `end` 모두 존재해야 표시 (`if (!sch.start || !sch.end) return`)

#### dashDayModal 조회 버튼 이벤트 위임 방식 전환

- inline `onclick` 속성 → `data-*` 속성 + `addEventListener` event delegation 으로 전환
- 원인: onclick 문자열 내 큰따옴표/쉼표가 HTML 속성 파싱을 깨뜨려 버튼 무반응
- `goToPlanFromDash` / `goToPlanPhaseFromDash` 함수 제거 → 이벤트 핸들러 내 직접 처리
- 모달 닫기: `modal.close()` 직접 호출

#### dashDayModal 디자인 정리

- 섹션별 색상 구분 제거 (border-left, 배경 tint, `ddm-section-event/plan/work` 클래스)
- 섹션: 심플한 타이틀 + 중립 count 뱃지
- 기획 단계 서브헤더: 작은 컬러 도트(3px)로 단계 구분, 조회 버튼 중립 보더
- 모달: 420px 폭, border-radius 10px, 깔끔한 헤더 (날짜만 표시)
- 불필요한 장식 제거 (골드 바, 부제, 커스텀 닫기 버튼, 회색 body 배경)

#### dashDayModal → 신규기획 탭 이동 검색 버그 수정

- `npSearchType`(존재하지 않는 ID) → `npSearchField`(실제 ID) 수정
- `'code'` → `'productCode'` (searchPlan이 사용하는 실제 값)
- `npConfirmed = ''` → `'all'` 수정 (빈 값은 select option에 없어서 `|| 'pending'` fallback → confirmed 항목 필터됨)
- `goToPlanWithItem()` 함수도 동일하게 수정
- 기획 항목 개별 행 클릭: `openPlanScheduleForDate` → `ddm-plan-nav` event delegation으로 변경 (해당 품번으로 직접 탭 이동)

---

### 2026-04-02

#### 판매조회 → 매출현황 이름 변경

- 네비게이션 버튼, TAB_LABELS, 엑셀 시트명, HTML 주석, CLAUDE.md 전체 — "판매조회" → "매출현황"
- `index.html:26` nav 버튼, `js/core.js` TAB_LABELS, `js/excel.js` sheetName

#### 판매 업로드 모달 (`salesUploadModal`) 신규

- 공홈 주문 업로드 독립 버튼 제거 → "📦 판매 업로드" 버튼으로 통합
- `salesUploadModal` (`<dialog class="srm-modal">`) — 카페24/사방넷/면세점 3탭 구조
- 카페24 탭: 파일 선택 → `handleGonghomUpload` → `gonghomPreviewModal` 미리보기
- 사방넷/면세점: 플레이스홀더 ("준비 중")
- `js/sales.js` — `openSalesUploadModal()`, 내부 탭 전환 (DOMContentLoaded), 파일 input 바인딩
- `js/main.js` — `makeDraggableResizable(salesUploadModal, 600, 400)`
- `style.css` — `.sul-tabs`, `.sul-tab-btn`, `.sul-tab-content`, `.sul-placeholder` 스타일

#### 카페24 파싱 전면 개편 (27컬럼 A~AA)

- `CAFE24` 상수: 27개 컬럼 인덱스 매핑 (A=주문일시 ~ AA=환불금액)
- 품번 매칭: E열(4) `productCode` vs `State.allProducts[].productCode`
- 사이즈 파싱: H열(7) `parseCafe24Size()` — SIZE=90(L)→L, Size=M→M, 빈값→F
- 수량: M열(12), 판매가: N열(13)
- xlsx/xls: `readAsArrayBuffer` + `{type:'array'}`, csv: `readAsText(UTF-8)` + `{type:'string', codepage:65001}`

#### 매출액 계산 (revenue) — 주문단위 계산으로 전면 개편

- 공식: `매출 = P(전체합산) + Q(전체합산) - U(주문번호당 MAX) - Y(전체합산)`
- U: **MAX per order** (이전 FIRST 방식은 부분환불 11건 누락 → MAX로 보정)
- `_cafe24Orders` 주문번호별 집계 객체 도입
- 행단위 `itemRevenue = P - Y` (상품 기여분), 주문단위 `order.revenue = P + Q - U(MAX) - Y`
- 미리보기 요약: P/Q/U/Y 공식 분해 + 매출총액 + 채널별 분해 표시
- 검증값(2026-01): P=300,281,100 + Q=3,399,000 - U=8,329,593 - Y=87,712,735 = 207,637,772

#### 쇼핑몰 → 채널 분류

- I열(8): `LEMANGOKOREA` → `'공홈'`, `LEMANGO PARTNER` → `'파트너'`
- `cafe24Channel(shopName)` 함수
- 파트너 채널이 `_platforms`에 없으면 경고 토스트

#### 주문번호 중복 검출 (CRITICAL)

- `_buildExistingOrderIndex()` — 전체 `State.allProducts[].revenueLog[].orderNo` → Set
- 업로드 행의 주문번호가 Set에 존재하면 `isDuplicate = true`
- 중복 행: 파란 배경 + 취소선, checkbox disabled, 확정 시 절대 반영 안 됨
- 날짜 무관 — 같은 주문번호면 중복, 같은 파일 재업로드 시 전체 중복 표시

#### 환불 처리 (마이너스 적용)

- B열(환불완료일) 값 있으면 환불 행
- 환불 + 매칭: checkbox **checked**, 확정 시 `p.sales[channel] -= qty`
- `revenueLog.push({type:'refund', qty:-qty, revenue:-|revenue|, ...})`
- 환불 + 미매칭: "환불(미매칭)" 주황 배지, checkbox disabled
- 환불 + 중복: "중복" 우선, 반영 안 됨

#### revenueLog type 구분

- `type: 'sale'` — 정상 주문, 양수 qty/revenue
- `type: 'refund'` — 환불, 음수 qty/revenue
- 상품 스키마에 `revenueLog[]` 추가: `{ type, date, channel, orderNo, qty, revenue, registeredAt }`

#### 미리보기 모달 개편 (`gonghomPreviewModal`)

- 폭: 960px → 1020px (채널/매출액 컬럼 추가)
- 11컬럼: 선택 | 상태 | 주문일시 | 주문번호 | 채널 | 품번 | 상품명 | 사이즈 | 수량 | 매출액 | 매칭
- 5단계 상태 우선순위: 중복(파랑) > 환불(미매칭)(주황) > 환불(빨강) > 정상(초록) > 미매칭(빨강)
- 환불행 매출액: 빨간 마이너스 표시
- 상단 요약: 총건수, 정상, 환불, 중복, 매칭, 미매칭, 매출액(정상-환불 순액)
- 토스트: "카페24 주문 반영: 정상 N건, 환불 N건 차감 (중복 N건, 미매칭 N건 제외)"

#### CSS 추가

- `.cafe24-dup-row`: 파란 배경(`#e3f2fd`) + 취소선
- `.badge-preview-dup`: 파란 배지(`#bbdefb` bg, `#1565c0` 텍스트)
- `.cafe24-chk:disabled`: `cursor:not-allowed`, `opacity:0.4`
- `.sul-*` 클래스: 판매 업로드 모달 내부 탭 스타일

#### 탭 바 밑줄 수정

- `border-bottom` 제거 → `.tab-bar-btn-active .tab-bar-label::after` pseudo-element
- 밑줄이 텍스트 폭에만 정확히 맞춤 (× 버튼 영역 제외)
- `padding: 6px 4px`, `inline-flex`, `font-size: 13px`

#### 다음 작업 후보 업데이트

- `공홈 외 다른 쇼핑몰 주문 업로드 포맷` → salesUploadModal 사방넷/면세점 탭으로 이동 (구조 준비됨)

---

### 2026-04-03

#### 카페24 매출 계산 시스템 전면 재구축

- **U 계산 방식 변경 (CRITICAL)**: FIRST → **MAX per order**
  - 이전: `_applyU` 플래그로 주문번호 첫 행에만 적용 → 부분환불(정상+환불 혼합) 주문 11건에서 U=0 누락
  - 수정: 주문번호별 `Math.max()` → 정확한 환불금액 취득
  - 검증: U 합계 7,652,196(이전) → 8,329,593(수정후), 매출총액 207,637,772 확인

- **주문단위 계산 구조 도입**
  - `_cafe24Orders` 객체: 주문번호별 P/Q/U(MAX)/Y/W 집계
  - `order.revenue = P + Q - U(MAX) - Y` (주문단위 매출)
  - `order.netCash = revenue - W` (순실결제, 적립금 차감)
  - 행단위 `itemRevenue = P - Y` (상품 기여분, Q/U 제외)

- **미리보기 요약 3줄 구조**
  - Line 1: 총건수 | 정상 | 환불 | 중복 | 미등록
  - Line 2: P xxx + Q xxx - U xxx - Y xxx (공식 분해)
  - Line 3: 매출총액 ₩xxx (공홈 ₩xxx / 파트너 ₩xxx)

- **이전 per-row 방식 완전 제거**: `_applyQ`, `_applyU` 플래그, `calcRowRevenue()` 함수 삭제
- `_toNum(v)` 헬퍼: `Number() || 0` 대신 `isNaN` 체크 (NaN/empty → 0)
- `usedPoints` (W열, col 22) 파싱 추가 — 순실결제 계산용
- 확정(confirm) 시 주문단위 Q/-U를 첫 매칭 행에 배분

#### 기존 유지 기능
- 미등록/중복/환불 상태 배지, 체크박스, 미리보기 컬럼 헤더 필터
- 주문번호 중복 검출 (revenueLog 기반)
- 채널 분류 (LEMANGOKOREA=공홈, LEMANGO PARTNER=파트너)

#### 사방넷 업로드 시스템 신규 (`js/sabangnet.js`)

- `SABANGNET` 상수: 20컬럼 인덱스 매핑 (A~T)
  - A(0)=주문번호, B(1)=주문일시, C(2)=결제일, D(3)=상품구분, E(4)=쇼핑몰
  - F(5)=상품코드, G(6)=상품명, H(7)=결제금액, I(8)=배송비, J(9)=옵션
  - K(10)=수량, L(11)=단가, M(12)=주문자, N(13)=수령자, O(14)=연락처
  - P(15)=주소, Q(16)=옵션1, R(17)=사이즈, S(18)=메모, T(19)=환불완료일
- 매출액 계산: `H(결제금액) + I(배송비)` — **사은품 행 제외** 후 전행 합산
  - 사은품 H=항상0, I=배송비 본품과 중복기재 → 포함시 과대계상
  - 검증값(2026-01): H=26,607,452 + I=1,035,000 = **27,642,452**
- 사은품 판별: C열(주문번호)에 `_사은품` 포함 OR D열(자체상품코드)에 `사은품` 포함
- 행 상태 5단계: 중복 > 사은품 > 환불 > 신규등록(미매칭) > 정상
  - 사은품: revenue=0, 기본 unchecked, 확정 시 완전 skip (상품 미생성, sales/revenueLog 미반영)
  - 신규등록: 품번 미매칭 (체크 가능, 확정 시 자동 상품 생성)
- `_sbDetectBrand(code)`: 품번 prefix → 브랜드 (LN→르망고 느와, 기본→르망고)
- `_sbDetectType(code)`: 품번 prefix → 타입 (LSWON→onepiece, LSMBR→bikini 등)
- `_sbCreateProduct(code, name, unitPrice)`: 전체 상품 스키마 자동 생성 (stock/sales/images 포함)
- `_sbParseSize(sizeAlias, optionClean)`: R열 우선, fallback Q열 괄호 추출
- `_sbParseDate(val)`: Excel 시리얼 또는 문자열 날짜 파싱
- 컬럼 헤더 필터: `_openSbFilter`, `_closeSbFilter` (카페24와 동일 패턴)
- `confirmSabangnetUpload()`: 플랫폼 자동추가 → 상품 자동생성 → 판매 반영
- `sabangnetPreviewModal` 다이얼로그 추가 (index.html)

#### 카페24/사방넷 공통 — 신규등록 자동생성

- 미매칭 행 상태명: "미등록" → "신규등록" 변경 (badge-preview-newreg)
- 미매칭 행 체크박스: disabled → **checked** (확정 시 자동 상품 생성)
- 확정 시 자동 처리:
  1. 신규 채널 감지 → `_platforms` 추가 + 전체 상품 `p.sales[ch]=0` 초기화
  2. 미매칭 품번 → `_cafe24CreateProduct()` / `_sbCreateProduct()` 로 상품 자동 생성
  3. 생성된 상품에 판매 수량/매출 반영
- `_cafe24CreateProduct(code, name, salePrice)`: 카페24용 상품 자동생성
- CSS: `.badge-preview-newreg { background:#e8f5e9; color:#1b5e20 }` (초록 배지)

#### 파일 구조 변경
- `js/sabangnet.js` 신규 파일 (17→18개 JS 파일)
- `index.html`: 사방넷 탭 UI (파일 업로드) + `sabangnetPreviewModal` 추가
- `js/sales.js`: 사방넷 파일 input change 이벤트 바인딩
- `js/main.js`: `makeDraggableResizable(sabangnetPreviewModal)` 추가

#### 사방넷 매출액 — 사은품 행 배송비 중복 수정

- **원인**: 사은품 행의 I(배송비)=3000이 본품과 중복 기재 (77건, ₩321,000 과대계상)
- **사은품 판별 개선**: 기존 `D열="사은품(랜덤)" OR H열=0` → `C열(주문번호)에 '_사은품' 포함 OR D열에 '사은품' 포함`
- **매출액**: 사은품 행 revenue=0 (H+I 계산 제외)
- **미리보기**: 사은품 행 기본 unchecked (enabled, 사용자 수동 체크 가능)
- **매출 요약**: 3개 총액 모두 사은품 행 제외
- **확정**: 사은품 행 완전 skip (상품 미생성, sales/revenueLog 미반영)
- **검증**: ₩27,963,452(이전) → ₩27,642,452(수정후, 차이 ₩321,000 = 3000×107건)

---

### 2026-04-03 (추가)

#### 로그인/회원관리 시스템 구축 (Firebase Auth + Firestore)

- **Firebase SDK 추가**: firebase-app-compat, firebase-auth-compat, firebase-firestore-compat (v10.12.0 compat)
- **`js/auth.js` 신규**: Firebase 초기화, 로그인/로그아웃, 회원가입, 비밀번호 재설정, 초기 관리자 생성
- **`js/members.js` 신규**: 회원관리 탭 렌더, Firestore CRUD, 등급/상태 관리

**로그인 페이지 (`#loginPage`)**
- 전체 화면 (`position:fixed`, 네이비 배경)
- 이메일/비밀번호 입력 → `auth.signInWithEmailAndPassword()`
- 승인 대기(`status !== 'approved'`) → "관리자 승인 대기중" 에러
- 비밀번호 찾기 → `auth.sendPasswordResetEmail()`
- **세션 로그인** (`SESSION` persistence) — 탭/브라우저 닫으면 로그아웃, 같은 탭 새로고침은 유지
- **이메일 기억** — localStorage에 최근 이메일 저장, 다음 접속 시 자동 입력 + 비밀번호 포커스

**회원가입 모달 (`#signupModal`)**
- `auth.createUserWithEmailAndPassword()` + Firestore `users` doc 생성
- 가입 후 `status: 'pending'`, `grade: 1` (일반사용자)
- 즉시 로그아웃 → "승인 후 로그인 가능" 안내
- 비밀번호 일치 실시간 체크 (`pw-match-ok/no`)

**회원 등급 (4단계)**
| Lv | 이름 | 배지 |
|----|------|------|
| 4 | 최종관리자 | 네이비 bg + 골드 text |
| 3 | 관리자 | 골드 bg + 흰 text |
| 2 | 담당자 | 연파랑 bg + 남색 text |
| 1 | 일반사용자 | 베이지 bg + 회색 text |

**Firestore `users` 컬렉션 스키마**
```js
{ uid, email, name, phone, dept, grade(1~4), status('pending'|'approved'|'rejected'|'suspended'), createdAt, lastLogin }
```

**회원관리 탭 (`tab-members`)**
- KPI 카드 4개: 전체/최종관리자/관리자/담당자+일반
- 회원 테이블: NO/상태(dot)/이메일/이름/부서/등급(배지)/최종로그인/가입일/관리
- 상태: active(초록)/pending(주황)/suspended(빨강)
- 승인/거절/정지/해제/수정/삭제 버튼
- 수정 모달(`memberEditModal`): 이름, 전화번호, 부서, 등급(최종관리자만 변경)
- 추가 모달(`memberAddModal`): 이메일, 이름, 비밀번호, 부서, 등급 → 바로 `approved`

**헤더 사용자 영역**
- `#headerUserGrade` (등급 배지) + `#headerUserName` (이름님) + 로그아웃 버튼
- 날짜 옆 오른쪽 정렬

**앱 컨테이너 래핑 (`#appContainer`)**
- 기존 header + tabBar + main을 `#appContainer`로 래핑
- 로그인 전: loginPage 표시, appContainer 숨김
- 로그인 후: loginPage 숨김, appContainer 표시

**Auth → Firestore 자동 문서 생성**
- Firebase Auth에 직접 생성된 계정(Firestore 문서 없음) → `checkApproval()`에서 자동 생성 (grade:4, approved)
- 앱 회원가입은 `status:'pending'` → 관리자 승인 필요

**로그인 안 된 상태 최적화**
- `init()` → `initAuth()` 후 `State.currentUser` 없으면 앱 초기화 건너뜀 (데이터 로드/렌더 안 함)
- 로그인 성공 시 `showApp()` → `initApp()` 호출하여 앱 초기화

**폴백 이미지 수정**
- `file://` 로컬 네트워크 경로 → 인라인 SVG data URI (LEMANGO 로고)로 교체
- `js/modals.js` FALLBACK_LOGO + `index.html` dImgMain onerror

**파일 변경 목록**
- `js/auth.js` — 신규 (Firebase init, login, signup, admin init, SESSION persistence, 이메일 기억)
- `js/members.js` — 신규 (회원관리 탭 전체)
- `index.html` — loginPage, signupModal, appContainer 래핑, tab-members, 회원 모달 2개, 헤더 사용자 영역, Firebase SDK, 폴백 이미지 SVG
- `style.css` — 로그인/회원가입/등급배지/상태dot/헤더 사용자 영역 스타일
- `js/core.js` — State.currentUser, State.members, TAB_LABELS.members
- `js/router.js` — members 탭 렌더 트리거
- `js/main.js` — init()/initApp() 분리, initAdminAccount(), initAuth() 호출
- `js/modals.js` — FALLBACK_LOGO → SVG data URI

---

### 2026-04-06

#### 활동 로그 시스템 (Firebase Firestore)
- `js/activity-log.js` 신규 — `logActivity(action, target, detail)` fire-and-forget
- Firestore `activityLogs` 컬렉션, 31+ 함수에서 호출 (auth/register/stock/sales/plan/event/work/settings/members)
- 회원관리 탭 이너 탭: 회원목록 | 활동로그
- 활동로그 패널: KPI 카드 4개, 카테고리 필터, 검색/페이지네이션, 엑셀 다운로드

#### 모달 댓글 시스템 (Firebase Firestore)
- `js/comments.js` 신규 — `buildCommentSection(modalType, targetId)` + CRUD
- Firestore `comments` 컬렉션, 5개 모달에 적용 (상세/기획상세/행사/업무/회원프로필)
- 작성자 또는 grade>=3 수정/삭제 권한
- `korConfirm()` 한글 삭제 확인, inline 에러 표시

#### 이모티콘 선택기
- 7개 카테고리: 최근/표정/손동작/하트/자연/음식/업무
- `toggleEmojiPicker(btn, inputId)` — 팝업 패널, 탭 전환, 커서 위치 삽입
- localStorage 최근 사용 이모티콘 저장 (최대 12개)

#### 게시판 시스템 (`tab-board`) 신규
- `js/board.js` 신규 — Firestore `posts` 컬렉션
- 이너 탭: 공지게시판 + 자유게시판
- 3개 뷰: 목록 (고정글/NEW배지/댓글수/분류필터/검색/페이지네이션) + 상세 (조회수/첨부/이전다음/댓글) + 글쓰기/수정 (분류/고정/중요/첨부파일base64)
- 카테고리 8종: 공지/업데이트/행사/가이드/일반/질문/공유/건의 (색상 배지)
- 댓글 연동: `comments.js`에서 `posts.commentCount` increment/decrement
- 삭제 시 관련 댓글 batch 삭제
- `firestore.rules` — posts 컬렉션 read/write 규칙 추가, 배포 완료

#### Firestore 보안 규칙
- `firestore.rules` 신규 생성 — users/comments/activityLogs/posts 4개 컬렉션
- 인증된 사용자만 read/write 허용
- `firebase deploy --only firestore:rules` 배포

---

## 보류 중 작업

### 이미지합치기 웹 통합 (테스트 후 결정)
- `\\lemangokorea\온라인\기타\이미지 합치기\이미지합치기.pyw` 분석 완료
- 기능: HTML 소스 → 이미지 URL+텍스트 파싱 → 1000px 폭 세로 합치기 + 정사각형 변환
- 통합 방향: 순수 JS(Canvas API) + fetch() — CORS 테스트 필요
- 상세 내용: `.claude/projects/.../memory/project_image_combiner.md` 참조

---

### 2026-04-06

#### 활동 로그 시스템 구축

- **`js/activity-log.js` 신규 파일**: 활동 로그 전체 시스템
  - `logActivity(action, target, detail)` — fire-and-forget Firestore 기록 (메인 기능 블로킹 없음)
  - `loadActivityLog()` — Firestore `activityLogs` 컬렉션 조회 (날짜 필터, limit 5000)
  - `filterActivityLog()` — 클라이언트사이드 필터 (카테고리/활동유형/사용자/키워드)
  - `renderAlStats(data)` — KPI 통계 카드 (전체/로그인/데이터변경/매출업로드/회원설정)
  - `renderActivityLogTable()` — 테이블 렌더 (NO/일시/사용자/활동유형배지/대상메뉴/상세내용/IP)
  - `renderAlPagination()` — 독립 페이지네이션 (30/50/100건)
  - `exportActivityLog()` — 엑셀 다운로드 (SheetJS)
  - `populateAlUserFilter()` — Firestore users 컬렉션 기반 사용자 필터 select 동적 생성
  - `switchMembersPanel(panel)` — 회원관리 이너탭 전환 (회원목록 ↔ 활동로그)

- **Firestore 컬렉션**: `activityLogs`
  - 스키마: `{ timestamp, uid, userName, action, target, detail, ip }`
  - action 유형: `login`, `logout`, `create`, `update`, `delete`, `upload`, `approve`, `setting`

- **State 확장**: `State.activityLog = { all:[], filtered:[], page:1, pageSize:30, cat:'all' }`

- **카테고리 매핑** (`AL_CAT_MAP`):
  - `all`: 전체
  - `login`: login, logout, login_fail
  - `data`: create, update, delete
  - `upload`: upload
  - `member`: approve, setting

- **회원관리 탭 이너탭 구조**:
  - `#tab-members` 내부에 `.members-inner-tabs` (회원목록 | 활동로그)
  - `#memberListPanel` — 기존 회원관리 테이블
  - `#activityLogPanel` — 카테고리탭 + 필터 + KPI통계 + 테이블 + 페이지네이션

- **`logActivity()` 삽입 위치** (31개 지점, 10개 파일):
  - `auth.js`: 로그인 성공, 로그아웃
  - `register.js`: 신규등록
  - `modals.js`: 상품수정
  - `stock.js`: 입고(개별/일괄), 출고
  - `gonghom.js`: 카페24 업로드
  - `sabangnet.js`: 사방넷 ���로드
  - `plan.js`: 기획등록, 기획수정, 상품이전
  - `event.js`: 행사등록/수정, 행사삭제
  - `work.js`: 업무등록/수정, 업무삭제
  - `members.js`: 회원승인, 회원삭제, 회원수정
  - `settings.js`: 디자인번호/설정항목/판매채널/업무카테고리/부서 CRUD (15개 지점)

- **CSS**: `.members-inner-tabs`, `.members-itab`, `.al-cat-tabs`, `.al-cat`, `.al-filters`, `.al-stats`, `.al-stat-card`, `.al-badge-*`, `.al-time`, `.al-detail-cell`, `.al-result-header`

#### 모달 댓글 시스템 구축

- **`js/comments.js` 신규 파일**: 모달 댓글 CRUD 시스템
  - `buildCommentSection(modalType, targetId)` — 댓글 섹션 HTML 생성
  - `loadComments(modalType, targetId)` — Firestore에서 댓글 로드 + 렌더
  - `submitComment(modalType, targetId)` — 댓글 등록
  - `editComment(commentId, modalType, targetId)` — 인라인 수정 모드
  - `saveCommentEdit(commentId, modalType, targetId)` — 수정 저장
  - `deleteComment(commentId, modalType, targetId)` — 삭제 (korConfirm)

- **Firestore 컬렉션**: `comments`
  - 스키마: `{ modalType, targetId, uid, userName, userGrade, content, createdAt, updatedAt }`
  - 인덱스: modalType ASC + targetId ASC + createdAt ASC

- **적용 대상 모달** (5개):
  | Modal | modalType | targetId | 삽입 방식 |
  |-------|-----------|----------|----------|
  | 상품 상세 (`detailModal`) | `'product'` | productCode | buildDetailContent 하단 |
  | 기획 상세 (`planDetailModal`) | `'plan'` | planItem.no | buildPlanDetailContent 하단 |
  | 행사 수정 (`eventRegisterModal`) | `'event'` | event.no | `#evCommentArea` div (수정 시만) |
  | 업무 상세 (`workDetailModal`) | `'work'` | workItem.no | buildWorkDetailContent 하단 |
  | 회원 프로필 (`memberProfileModal`) | `'member'` | uid | `#mpCommentArea` div |

- **권한**: 수정/삭제 = 작성자 본인 + grade 3(관리자) + grade 4(최종관리자)
- **CSS**: `.comment-section`, `.comment-item`, `.comment-meta`, `.comment-grade-badge`, `.comment-input-area`, `.comment-edit-input`
- `logActivity` 연동: 댓글 등록/수정/삭제 시 활동 로그 기록

---

### 2026-04-06 (추가2)

#### 게시판 시스템 통합 + UI 전면 개편

- **게시판 라우팅 연동**: `js/router.js` — `triggerTabRender`에 board case 추가, 데이터 가드에 board/members 예외 처리
- **게시판 UI 전면 재설계**: `brd-*` 클래스 네이밍 (data-table 충돌 회피)
  - 목록 뷰: 커스텀 brd-toolbar, brd-table, 분류 배지 8색, 고정글 ★, NEW 배지, 댓글수
  - 상세 뷰: 카드형 레이아웃, 첨부파일 영역, 2컬럼 이전/다음글 네비게이션
  - 글쓰기 뷰: B/I/U/리스트 텍스트 툴바, 드래그앤드롭 파일 업로드 존
- **브라우저 뒤로가기 지원**: `history.pushState/popstate` — 상세 뷰 진입 시 pushState, 뒤로가기 시 목록 복귀
- **댓글 연동**: `comments.js`에서 board 타입 `posts.commentCount` increment/decrement
- **Firestore rules**: posts 컬렉션 read/write 규칙 추가 + 배포

#### 대시보드 개편 — KPI 제거 + 공지/최근등록

- **KPI 카드 완전 제거**: `renderKPI()` 함수 및 `#kpiRow` DOM 삭제
- **`dash-info-row` 추가**: 대시보드 최상단 2컬럼 (공지사항 + 최근 등록)
  - `renderDashNotice()` — Firestore posts(notice) 조회, 고정글 우선, 최근 5건, 클릭 시 게시판 탭 + 상세 오픈
  - `renderDashActivity()` → `renderDashActivity()` 변경 — Firestore activityLogs 대신 State 데이터 수집 (planItems/events/workItems), 최근 7건 표시
- **활동 배지 색상**: plan(파랑), event(앰버), work(보라)

#### 상품 삭제 기능

- **상세 모달 헤더**: `#dDeleteBtn` 삭제 버튼 추가 (grade >= 3 일 때만 표시)
- **`deleteProduct()`**: korConfirm 확인 → State.allProducts 제거 → Firestore comments batch 삭제 → 테이블 재렌더 → 활동 로그
- **매출 기록 경고**: revenueLog 존재 시 "매출 기록 N건이 있습니다" 경고 메시지

#### 상품조회 생산상태 컬럼

- `prodStatusBadge(status)` — 지속생산(초록)/단종(빨강)/시즌한정(파랑)/샘플(보라) 컬러 배지
- PRODUCT_COLUMNS에 `productionStatus` 컬럼 추가 (타입 옆, width:80px)

#### 엑셀 47컬럼 샘플 양식 + 업로드 파싱

- **`downloadSample('product')` 전면 재작성** (`_downloadProductSample()`):
  - Sheet1 "상품등록": 47컬럼 1행 헤더 + LSWON16266707 샘플 데이터 행
  - Sheet2 "입력 가이드": 컬럼별 설명/필수/입력예시 테이블
  - 헤더 스타일: 네이비(#1A1A2E) 배경 + 흰 글자, 필수 컬럼(품번/상품명/판매가/타입) 골드(#C9A96E) 배경
  - 파일명: `르망고_상품등록_샘플양식.xlsx`

- **`UPLOAD_COL` 47컬럼 인덱스**: NO(0)~최종입고일(46)
  - 신규 컬럼: sampleNo(3), cafe24Code(4), saleStatus(32), productionStatus(33), barcodeXS~XL(34-38), urlDesign(43), urlShoot(44), registDate(45), lastInDate(46)

- **`_LEGACY_COL`**: 이전 2행 헤더 양식 호환용 인덱스

- **`uploadProducts(raw)` 전면 재작성**:
  - 양식 자동 감지: `row[0][2] === '품번'` → 신규 47컬럼 (데이터 row 1~), 아니면 레거시 (데이터 row 2~)
  - 47컬럼 전체 파싱: brand, sampleNo, cafe24Code, barcode, chestLine, transparency, lining, capRing, bust, waist, hip, saleStatus, productionStatus, barcodes(XS~XL), images.design, images.shoot, registDate
  - 기존 품번 업데이트 시 stock/stockLog/sales/revenueLog/scheduleLog/productCodeLocked 보존

---

## 다음 작업 후보 (미구현)
- [ ] 면세점 주문 업로드 포맷
- [ ] 데이터 영속성 (localStorage 또는 서버 연동)
- [ ] 인쇄/PDF 출력
- [ ] 이미지합치기 웹 통합 (테스트 후)
- [ ] 업무일정 수정 권한 관리 (작성자/관리자/인사담당자만 수정 가능)
- [ ] 권한 기반 UI 숨김 (등급별 탭/기능 접근 제어)
