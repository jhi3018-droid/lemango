# 르망고 상품 관리 시스템 — CLAUDE.md

> 순수 HTML + CSS + JavaScript (프레임워크 없음). 로컬 서버: `python -m http.server 8765`. Firebase Hosting(`lemango-office`) + Auth + Firestore + Storage.
> 이 파일은 **살아있는 규칙(1~4장)을 최상단**에 두고, 완료 이력은 5장 압축 changelog로 유지한다. 상세 play-by-play는 git 이력 참조.

---

# 1. 살아있는 규칙 & 정책 (Living Rules & Policies)

## 1.1 📋 보고서 형식 규칙 (MANDATORY)
**모든 보고서·작업 결과·설계 문서는 반드시 아래 시작 마커로 시작한다.** 소유주가 영문을 못 읽어 CC 결과물을 Claude.ai에 붙여 한글 요약함 → 작업 로그와 실제 결과물이 섞이므로 시작 지점 표시 필수.

시작 마커(필수):
```
========================================
📋 작업 결과 / REPORT START
========================================
```
종료 마커(권장):
```
========================================
✅ 작업 결과 끝 / REPORT END
========================================
```
- 사용: 모든 작업완료 보고서 · 조사/설계 문서 · Claude.ai에 붙여넣을 결과물. 한 줄 확인 응답엔 불필요(있어도 무해).
- 한글 문구(`작업 결과`)는 반드시 포함 — 소유주가 시작 지점을 즉시 알아보기 위함.

## 1.2 🔐 POS 권한 방침 (POS 전 단계 필수 준수 — 확정/불변)
원칙: **조회(보기)=전 직원 개방 · 작업(등록/취소/차감)=본인 매장 직원만 · 관리자(grade≥3)=전 매장 전권.**

| 기능 | 권한 |
|------|------|
| 매출 조회 | **전 직원** (회사 매출 전원 공유) |
| 매장별 재고 조회 | **전 직원** (회사 공용 데이터) |
| POS 판매 등록 | **본인 매장 직원만** (사무직/미배정 불가) |
| 판매 취소/환불 | **본인 매장 직원만** + 🔴 **로그 + 사유 필수** |
| 강제 재고 차감 (불량/오류) | **본인 매장 직원만** + 🔴 **로그 + 사유 필수** |
| 관리자 (grade≥3) | **위 전부 + 모든 매장** |

### 🔴 감사 로그 (민감 작업 필수 — 가장 중요)
**판매 취소(void) · 환불(refund) · 강제 재고 차감**은 반드시 기록:
- **누가(WHO) · 언제(WHEN) · 무엇을(WHAT) · 사유(REASON)** 4가지 모두 기록.
- **사유는 필수 입력** — 빈 사유 → 작업 차단.
- 방식: `logActivity(action, target, detail)` (activity-log.js) 감사 추적 + 해당 작업을 **자체 레코드로도 저장**(사유 필드 포함).
- 목적: 사후 정산·추적("이 재고가 왜 사라졌는가?"). 없으면 재고 불일치 추적 불가.

> 조회 화면(매출·재고)은 전원 접근, **작업 화면(판매·취소·차감)만 본인 매장 직원+관리자로 게이트**. 취소/환불/차감 세부 UI/흐름은 추가 지시 예정 — 단 위 권한·로그·사유 방침은 확정(불변).

## 1.3 Working Rules (확립된 작업 규칙)
- **배포는 소유주 수동이 기본** — 단, 소유주가 명시 요청 시 배포·푸시 모두 수행 OK.
- **묻지 말고 결정·보고** — 최선 판단으로 반영 후 변경 요약. 애매하면 보수적으로 판단.
- **레거시 데이터 인지** — localStorage/Firestore 스키마 변경 시 변경 전 레코드가 새 코드와 다르게 동작할 수 있음을 반드시 명시.
- **대시보드 모달 재사용** — 신규 대시보드 프리뷰는 `dashInfoModal` 프레임 재사용(새 dialog 세우지 말 것).
- **헤더 span 너비 ≡ CSS 컬럼 너비** — 모달 내 표(`.ps-phase-*` 등) 손댈 때 `<span>` inline 너비와 CSS 클래스를 함께 수정(안 하면 헤더-행 desync).
- **`makeDraggableResizable()`는 `.srm-header`/`.srm-modal-header`/`.rmodal-header`/`.dmodal-header` 필요** — 신규 draggable dialog는 타이틀바에 이 클래스 중 하나 포함.
- **알림 링크는 refId 필수** — `#tab:id` (또는 `#tab:personal:id`); 절대 `#tab`만 저장 금지.
- **선택적 git 스테이징** — `git add js/ index.html style.css firebase.json CLAUDE.md` (harness 파일 제외). `.claude/settings.local.json`·`.firebase/` 등 스테이징 금지.
- **신규 탭 추가 시 `TAB_PERMISSIONS`에 반드시 등록** — 미등록 탭은 `canAccessTab`이 true(전체개방) 반환.
- **CSS `<dialog>` 함정**: `.srm-modal{display:none}` / `[open]{display:flex}`가 열림 제어 → 추가 클래스에 `display` 주지 말 것(닫힌 dialog가 보이는 버그). `inb-hidden`류 숨김 클래스와 `display:flex` 클래스가 equal-specificity로 충돌하면 전용 `.x.hidden{display:none}`(특이도 up) 규칙 추가.
- **숨김 탭 재렌더 금지** — `display:none` 테이블 렌더 시 sticky 헤더/컬럼 너비 측정(getBoundingClientRect=0) 깨짐. dirty-flag 후 전환 시 렌더.

## 1.4 🔴 매출 공식 (절대 변경 금지)
- **Cafe24: 매출 = P(전체합산) + Q(전체합산) − U(주문번호당 MAX 1회) − Y(전체합산)**
  - P=상품구매금액(per-item SUM), Q=총배송비(SUM), U=실제환불금액(주문번호당 MAX 후 SUM — FIRST는 부분환불 누락), Y=상품별추가할인(SUM). W=적립금(주문당 FIRST, 순실결제=매출−W).
  - 검증값(2026-01): 300,281,100 + 3,399,000 − 8,329,593 − 87,712,735 = **207,637,772**.
- **사방넷: 매출 = H(결제금액) + I(배송비)** — **사은품 행 제외** 후 전행 합산.
  - 사은품 판별: C열(주문번호)에 `_사은품` 포함 OR D열(자체코드)에 `사은품` 포함. 사은품 H=0, I는 본품과 중복기재 → 포함 시 과대계상.
  - 검증값(2026-01): 26,607,452 + 1,035,000 = **27,642,452**.

---

# 2. 아키텍처 불변식 & 데이터 모델 (Architecture Invariants & Data Models)

## 2.1 POS 재고 쓰기 3원칙 (비협상)
1. **`FieldValue.increment`만** 사용 — read-modify-write `+=` 절대 금지(동시성 유실).
2. **`set({merge:true})`** 사용, `update()` 금지 — 문서 없으면 throw. merge+increment가 문서/필드를 0부터 자동 생성.
3. **모든 write에 `storeId` 포함** — Firestore 규칙 + 쿼리가 의존.

## 2.2 POS 아키텍처 불변식
- **storeStock = 별도 per-doc 컬렉션** `storeStock/{storeId}_{productCode}` — 기존 `sharedData/products_*` 청크 모델 아님. 이유: 판매마다 전체 카탈로그 재다운로드 방지 + 원자적 차감.
- **`sizeLocations`는 `sizes`와 별개 top-level 키** — 위치=overwrite(setStoreStockLocation), 재고=increment(writeStoreStock). **math에 절대 안 섞임.**
- **append-only 원장**: `storeSales`·`storeInbound` = `update/delete: if false`. 예외: storeInbound는 **취소 전용 field-restricted update**(2.5 참조). storeSales **취소=새 레코드(역기록)** — 돈 장부는 불변(inbound-cancel의 update 방식과 의도적 divergence).
- **복합 ID** `{storeId}_{productCode}` — 품번 언더스코어 0건 확인 → 첫 `_` 분리 안전.
- **SIZES = `['XS','S','M','L','XL','2XL','F']`** (설계문서의 'XXL'은 오류). `SIZE_SPEC_SIZES`의 XXL은 사이즈규격 **측정용** 별개 상수(재고 무관).
- **정수 KRW 전용** — 라인 int×int, 파생값 항상 재계산(호출 totals 불신).
- **음수 재고 = 경고만**(차단 아님, 이미 판매 가능성, 1f 빨강 표시). **오프라인 확정 차단**(팬텀 큐 방지). **double-confirm 가드**(in-flight flag를 try 첫 줄 동기 set + finally 항상 release).
- **입고 등록 대상 = 바코드 등록된 (품번, 사이즈)만.** 바코드 추가 시 조회 재검색/재오픈 시 즉시 반영.
- **바코드**: 13자리(`/^\d{13}$/`), 엑셀 파싱 `raw:false`(텍스트 서식 보존). 앞자리 0은 엑셀 숫자 저장 시점에 파일 레벨 손실 → 복구 불가(경고만).

## 2.3 Firestore 규칙 지식 (비협상)
- **규칙은 OR-합집합** — "가장 구체적 규칙 우선" 아님. 매칭되는 어떤 allow든 true면 허용. 특정 문서 제한하려면 **일반 규칙에서 `docId != 'x'` 배제 + 구체 규칙 추가**.
- **office/미배정 staff `storeId != ''` 가드** — 빈값 `'' == ''` write 뚫림 방지.
- **미존재 필드는 `resource.data.get('field', default)`** — dot-access는 에러→거부(기존 문서에 필드 없으면 100% 거부).
- 헬퍼: `isAuth()` / `isApproved()`(status=='approved') / `isAdmin()`(grade≥3) / `userDoc`. **`isApproved()` 게이트**: `users` 본인 self-read 제외 전 컬렉션이 승인자만 통과(pending/rejected/suspended 차단). users self-read는 미승인도 허용(`checkApproval()`이 본인 doc 읽어야 함).
- **회원 self-update**: `grade`/`status` 불변(본인 승격 불가), `isAdmin`은 전 필드 가능.
- **users create**: `grade==1 && status=='pending'` 강제(권한상승 차단). 부작용: 첫 사용자 자동셋업(grade4) 차단 — 새 환경은 콘솔에서 첫 관리자 doc 수동 시드.
- **personalSchedules update/delete**: `createdBy == uid` 전용(관리자 override 없음).
- **삭제 규칙**: `comments`=작성자 OR admin, `leaves`=본인 OR admin, `users`=admin.
- **복합 인덱스**: `storeStock`/`storeInbound`/`storeSales` 각 (storeId ASC, dateKey ASC). storeInbound/storeSales 기간조회는 equality+range라 이 단일 복합인덱스로 서빙(orderBy 미사용, 클라 정렬).
- **storeInbound 취소 update**: admin OR 본인매장 + `get('cancelled',false)!=true` + `cancelled==true` + `cancelReason is string && size()>0` + `cancelledBy==auth.uid` + `affectedKeys.hasOnly([취소 5필드])`. delete=`if false`.
- **storeSales void**: id=`void_{saleDocId}` 결정적 → 2차 취소=기존 doc set=update로 평가→`update:if false` 거부 → **double-void 구조적 불가**(트랜잭션 불필요, batch로 원자 처리). create: `type∈['sale','void']`, void는 `voidReason` 비어있지않음 + `voidedBy==uid`.
- **sharedData/{key} 단일 문서 JSON 직렬화** (products/plan/events/work/settings/stores/inboundTypes 등) → per-row 권한 규칙 강제 불가, 클라 검증만(`canDeleteProduct`/`canDeletePlanItem`/`canDeleteEvent`/`canDeleteWork`). ~798개 상품이 단일 문서 976KB(1MB의 93%) — 청크/컬렉션 전환 향후 검토.
- **Storage 규칙**: `board/{postId}/`·`plan/{planNo}/`·`backups/{type}/` = `request.auth != null`(50MB). cross-service `firestore.get()` grade 체크는 IAM 권한 추가 필요→미설정 시 403 → JS 레이어(`_backupHasPermission` 등)로 admin 게이트.

## 2.4 POS 핵심 프리미티브 (core.js / store.js, window 노출)
- `resolveActiveStore()` — 관리자→`_storeViewOverride || 첫활성`, staff→`_currentUserStoreId || null`. self-heal: override가 활성목록에 없으면 리셋. (`_currentUserStoreId`는 로그인 시 캐시, 로그아웃 시 리셋.)
- `findByBarcode(bc)`→`{productCode,size}` (buildBarcodeIndex, O(1) Map, soft-deleted 제외). `getBarcodeCollisions()`.
- `storeStockDocId(storeId,code)` / `writeStoreStock(storeId,code,size,delta)`(merge+increment) / `setStoreStockLocation(storeId,code,size,loc)`(merge overwrite) / `loadStoreStock(storeId)`(server+cache fallback) / `buildStoreStockIndex(storeId)`(재고 `_storeStockIndex` + 위치 `_storeLocIndex` 둘 다) / `getStoreStock(storeId,code)`(0맵 폴백) / `getStoreStockLocation(storeId,code,size)`.
- `normalizeLocation(loc)` — trim + 내부공백 제거 + 영문 대문자화(한글/숫자/하이픈 보존). choke point: 스캔 커밋·인라인 편집·확정 배치.
- 판매 원장 생성자: `generateSaleNo()`(SL-YYYYMMDD-HHMMSS KST) / `buildSaleDoc()`(totals 재계산·정수·payMethod 화이트리스트) / `buildVoidDoc()` / `voidDocId()`(결정적) / `normalizePhone()`(숫자만) / `maskPhone()`(010-****-5678).
- `refreshAllProductViews()` — 3개 filtered(`[...allProducts]`) 재구축 + product/stock/sales/dashboard 렌더. 상품 생성/수정/삭제/복원 후 호출(sales.filtered 누락 방지).
- `_reNarrowFiltered(tab)` — `searchCriteria ? _narrowX(criteria) : [...allProducts]`. 검색 영속화(편집/동기화로 `.filtered` 재구축돼도 활성 검색 유지).

## 2.5 데이터 모델 (POS 컬렉션)
- **storeStock doc**: `{ storeId, productCode, sizes:{XS..F:qty}, sizeLocations:{size:라벨}, updatedAt }`
- **storeInbound doc (라인당 1)**: `{ storeId, productCode, size, qty, location, inboundNo(IN-YYYYMMDD-HHMMSS KST), inboundType(라벨 스냅샷 — rename돼도 원본 보존), memo, workerUid, workerName, confirmedAt, dateKey(KST), batchId }` + 취소 시 `{ cancelled:true, cancelReason, cancelledBy, cancelledByName, cancelledAt }`
- **storeSales sale doc**: `{ type:'sale', saleNo(SL-...), storeId, lines[{productCode,size,qty,unitPrice,unitDiscount,lineNormal,lineDiscount,lineTotal,discountSource}], totals{total,discountTotal,qtyTotal}, payMethod(카드/현금/계좌이체/기타), customerPhone(숫자정규화·마스킹표시), workerUid, workerName, soldAt, dateKey }`
- **storeSales void doc**: `{ type:'void', originalSaleId, originalSaleNo, storeId, lines, totals, voidReason, voidedBy, voidedByName, voidedAt, dateKey, customerPhone }`
  - customerPhone: 공홈 적립금 대사 전용(회원관리 아님). 선택 입력, 숫자만 저장('010-1234-5678'→'01012345678'), 일반 이력=마스킹, 폰검색=전체(equality→단일필드 auto 인덱스).
- **_stores config**: `[{id(st1,st2..), name, active, order, location}]` — localStorage `lemango_stores_v1` + `sharedData/stores`(admin write). 기본 부산점(st1)/성남점(st2). `generateStoreId`=soft-disabled 포함 최대 접미사+1. 삭제 가드 `storeHasData`(재고/매출 있으면 hard-delete 거부→비활성화). `getActiveStores()`.
- **_inboundTypes config**: `[{id, name, active, order}]` — localStorage `lemango_inbound_types_v1` + `sharedData/inboundTypes`(admin write). DEFAULT 신규입고/조정입고/이관입고. `getActiveInboundTypes`/`inboundTypeHasData`. **"입고취소"는 유형 아님 — 별도 cancelled 상태.**

## 2.6 데이터 모델 (기존 앱)
### 상품 (`State.allProducts` 아이템)
```js
{ no, brand, productCode, sampleNo, cafe24Code, barcode,
  nameKr, nameEn, colorKr, colorEn, colorCode, salePrice, costPrice,
  type, backStyle, legCut, guide, fabricType,
  chestLine, transparency, lining, capRing, material, comment, washMethod,
  sizeSpec,        // size-first 중첩 객체 (2.7 참조)
  modelSize, madeMonth, madeBy, madeIn, videoUrl,
  saleStatus('판매중'|'종료'|'추가생산'), productionStatus('지속생산'|'생산중단'),
  productCodeLocked, assignee/assigneeName/assigneePosition, pinnedMemo,
  deleted, deletedAt, deletedBy, deletedByName,   // soft-delete (휴지통)
  images:{ sum, lemango, noir, external, design, shoot },
  tempImages:[{url,type,name,path?,fromPlan?}],   // 참고 이미지
  barcodes:{ XS..F },  stock:{ XS..F },
  stockLog:[{type:'in'|'out', date, XS..F, memo, registeredAt}],
  sales:{ 공홈, GS, ... },   // 키는 _platforms 동적
  scheduleLog:[{confirmedAt, schedule:{design,production,image,register,logistics}}],
  registDate, logisticsDate,
  revenueLog:[{type:'sale'|'refund', date, channel, orderNo, qty, revenue, registeredAt}],
  createdBy/createdByName/createdAt, lastModifiedBy/lastModifiedByName/lastModifiedAt }
```
- 기본 정렬: **registDate desc(최신 등록순)** — product/stock/sales 3뷰 공통. 렌더 시 `State.X.sort`로 정렬(단일 권위). cross-reload 정렬 영속화는 의도적 제거.

### 플랜 (`State.planItems`) — 상품 필드와 동일화 + `year, season, gender, memo`, `schedule:{design/production/image/register/logistics:{start,end}}`, `confirmed`, `tempImages`. localStorage `lemango_plan_items_v1` + Firestore `sharedData/planItems`(단일 문서, ~300건에서 1MB 접근). `savePlanItems()`/`loadPlanItems()`.

### 업무일정 (`State.workItems`) — `{no, category, title, startDate, endDate, memo, useVehicle, checklist:[{id,text,done}], kanbanStatus, registeredAt, createdBy}`. localStorage `lemango_work_items_v1`.

### users (Firestore) — `{ uid, email, name, phone, dept, position, grade(1~4), storeId, status('pending'|'approved'|'rejected'|'suspended'), createdAt, lastLogin }`
- **등급 4단계**: 4=시스템 관리자 / 3=관리자 / 2=부서장 / 1=담당자. (GRADE_DEFS엔 grade5(대표이사)도 있으나 KPI 외 미사용.)
- 신규 가입: `grade:1, status:'pending'` → 관리자 승인 필요.

### personalSchedules (Firestore) — `{ title, startDate, endDate, category, memo, mentions:[{type:'user'|'dept',uid?,name?,dept?}], createdBy/createdByName/createdByDept, createdAt }`. 가시성: grade≥4=전체, 본인/멘션유저/멘션부서=O. 수정/삭제=본인만(2.3).

### posts (게시판, Firestore) — `{ boardType('notice'|'free'), category, title, content, authorUid/Name/Grade/Position, pinned, important, views, commentCount, attachments:[{name,size,url,path}], createdAt, updatedAt }`. 첨부=Storage `board/{postId}/`(base64→Storage 이관 완료).

### comments (Firestore) — `{ modalType('product'|'plan'|'event'|'work'|'member'|'board'), targetId, uid, userName, userGrade, userPosition, content, createdAt, updatedAt }`. 수정/삭제=작성자 OR grade≥3.

### activityLogs (Firestore) — `{ timestamp, uid, userName, userPosition, userDept, action, target, detail, ip }`. `logActivity()` fire-and-forget + localStorage mirror `lemango_recent_activity_v1`(500 FIFO). action: login/logout/create/update/delete/upload/approve/setting/error/inbound/inbound-cancel.

## 2.7 사이즈 규격 단일 소스 (SIZE_SPEC_PARTS)
- **측정 부위 추가 = `SIZE_SPEC_PARTS`(core.js)에 1줄 append만으로 화면·엑셀·HTML 전체 자동 반영** — Phase A 리팩터 성과.
- 데이터: **size-first 중첩** `sizeSpec = {XS:{bust,waist,...}, S:{...}, ..., F}`.
- `SIZE_SPEC_SIZES = ['XS','S','M','L','XL','XXL']` + F. `SIZE_SPEC_PARTS` = 15개 부위: 가슴/허리/엉덩이/총장/어깨/소매/밑단/총장(상)/총장(하)/밑가슴/허벅지단면/컵가로/컵세로/앞허리/뒤허리.
- `buildSizeSpecColumns()` = 6사이즈×15부위+F = **91 엑셀 컬럼**. `console.assert`로 드리프트 감지. 엑셀 컬럼 생성은 **반드시 이 함수로만**(하드코딩 금지).
- 헬퍼(utils.js): `buildSizeSpecView`/`buildSizeSpecEdit`/`collectSizeSpec` (모두 `SIZE_SPEC_PARTS` 루프). `getActiveParts(sizeSpec, activeSizes)`(core.js) = 값 있는 부위만 반환 → 보기 테이블 + `copySizeGuideHtml`(HTML 복사)이 **빈 측정항목 제외**(filled-only). 수정모드는 항상 15종 표시.
- 부위 추가는 가산적(마이그레이션 불필요, 기존 데이터는 신규 부위 빈값→보기/HTML 자동 숨김). F 단일값 특수처리 유지.

## 2.8 품번 자동생성 규칙
- 형식: `[분류2][성별1][타입2][디자인4][연도1][시즌1][일련번호2]` = 13자리. **prefix=11자**(분류2+성별1+타입2+디자인4+연도1+시즌1).
- 일련번호: 같은 prefix 내 00~99 미사용 자동. canonical 패턴: `c.length === prefix.length + 2 && c.startsWith(prefix)` + `c.slice(-2)` (4 사이트 통일: 상품 등록/수정 + 기획 등록/수정).
- 중복 체크: `State.allProducts` + `State.planItems` + `_reservedCodes`(임시예약 Set, 취소/닫기 시 해제). 자기 코드 제외.
- 분류 dropdown은 `_classCodes` **라이브 읽기**(하드코딩 literal은 fallback만). 디자인번호는 `_designCodes` 단일 소스.
- **Plan은 sampleNo만 필수, productCode 선택** — 단 `confirmPlanToProduct()`(상품 이전) 시점엔 품번 필수(매칭 키).

---

# 3. 현재 상태 & 로드맵 (Current Status & Roadmap)

## 3.1 완료
- **Phase 1 ✅** 매장 기반: 1a 매장 config → 1b 사용자 storeId + `resolveActiveStore()` → 1c 매장 탭 shell + 관리자 스위처 → 1d storeStock 모델 + Firestore 규칙 → 1e 재고 엑셀 업로드(SET/ADD) → 1f 매장별 재고현황 뷰 + 상세 모달.
- **Phase 2 ✅** 입고 스캔: 2a 고정 로케이션(sizeLocations) → 2b 스캔 화면(커서 상태머신 + 4대 차단규칙 + staging + draft) → 2b-r 허브 창 재하우징 + UX 재설계 + 품번조회 → 2c 최종 확정 원자적 반영(storeStock increment + sizeLocations + storeInbound 이력, double-confirm) → 2d 입고 내역 뷰. + 업그레이드(기간조회/입고번호/메모/엑셀) + 입고 취소(runTransaction 역반영 + 사유 필수) + 입고 물류 강화(입고유형/유형설정/유형·상태필터/로케이션 정규화).
- **Phase 3 진행 중**: 3a ✅ 매출 원장 데이터층 + 규칙 refinement + 복합인덱스 · 3b ✅ 판매 화면(스캔→리스트→합계→draft, 확정 stub) · 공용 상품 상세 모달(판매/1f 재고뷰 공용).

## 3.2 다음 = POS Phase 3c
**원자적 판매 확정** — storeStock `increment(-qty)` + 매출 원장 doc(batch), double-confirm 가드, 음수 경고, 오프라인 차단. 이후 3d 매출조회 → 3e 판매취소(void=역기록, id=`void_{saleId}`) → Phase 4 환불/부분환불 → Phase 5 매장 할인·보충대상·로케이션 화면 → Phase 6 통합 재고 뷰.
> ⚠️ Phase 3c는 stock-critical. 매출 공식(1.4)·재고 3원칙(2.1)·규칙 지식(2.3) 반드시 준수. 규칙/인덱스 변경 시 `firebase deploy --only firestore:rules,firestore:indexes,hosting`.

## 3.3 배포 관련
- 통상 변경: `firebase deploy --only hosting`. 규칙 변경 포함: `firebase deploy --only firestore:rules,hosting`. Storage: `firebase deploy --only storage`.
- **캐시 헤더**(firebase.json): `**/*.@(js|css)`·`/index.html`·`/`에 `Cache-Control: no-cache, max-age=0, must-revalidate`(ETag 재검증). 헤더는 **다음 배포부터 효력** — 배포 후 1회 하드 새로고침 필요.

---

# 4. 알려진 한계 / 보류 (Known Limitations / Deferred)
- **강제 재고 차감** — Phase 3 이후 (사유+로그 필수, 방침 확정).
- **이관(매장간)** — 입고유형에 '이관입고'만 있음, 실제 이관 흐름 미구현.
- **Phase 4 환불/부분환불**, **Phase 5 로케이션 탭 / 매장 할인**(현재 placeholder).
- **적립금 지급표시 / 거스름돈 계산 / 분할결제**(payMethod 단일값) — 추후 옵션.
- **activityLogs 무제한 증가** — retention(예: 90일) 정책 미도입.
- **레거시 Firestore 백업**(`backups/{type}/items/`) — 복원만, 신규는 Storage `backups/{type}/{date}.json`. 수동 정리 대기.
- **엑셀 업로드 엣지**: 소프트삭제 품번과 동일 품번 업로드 시 삭제 항목 조용히 업데이트 → 거부+경고 추가 검토.
- **cross-tab 품번 race** — `_reservedCodes`가 탭별 메모리 비공유.
- **Option E 색상 데이터 정규화**(1회, 수동) — 백업 검증 후 설정→🎨 색상 관리→🔍 마스터 매칭(`runColorMigration`)으로 ~798개 colorCode 백필 + colorEn canonical화. 긴급 아님(Option B diff가 이미 라운드트립 보호).
- **RC2 잔여**: `refreshAllProductViews`(로컬 편집)는 3개 테이블 무조건 렌더(기존 동작). POS 도입 시 `_fsLoadProducts` 전체 재로드 granularity가 병목 — 별도 아키텍처 검토.
- **undefined CSS vars** — cosmetic.
- **정품 확정 전 활성화 주의**: `dashboard.js` 매출 "전월"이 `Math.random()` 가짜 데이터(실데이터 결선 필요), 초기 관리자 비번 평문 하드코딩(auth.js).

---

# 5. 도메인 레퍼런스 (Domain Reference)

## 5.1 파일 구조
```
index.html · style.css · firebase.json · .firebaserc · firestore.rules · firestore.indexes.json · storage.rules
js/  core.js(State/설정/POS 프리미티브/populateAllSelects) · router.js(탭 바) · utils.js(유틸/페이지네이션/정렬필터/사이즈규격뷰)
     products.js · stock.js(재고·입고·출고·바코드업로드) · sales.js · gonghom.js(cafe24) · sabangnet.js · plan.js
     event.js · dashboard.js · modals.js · register.js · excel.js · settings.js · design.js · upload.js · work.js
     auth.js · comments.js · board.js · activity-log.js · members.js · hr.js · orgchart.js · color-master.js · trash.js
     backup.js · store.js(POS 매장 탭 전체) · product-code.js · main.js(init/initApp)
data/ products_lemango.json · products_noir.json · combined.json
docs/ pos-phase1~3-design.md · phase-a-report.md · permission-model.md · pre-activation-audit.md 등
```

## 5.2 탭 (권한: TAB_PERMISSIONS)
| 탭 | ID | 최소 grade | 비고 |
|----|----|:-:|------|
| 대시보드 | tab-dashboard | 1 | 공지/최근등록, 캘린더(행사/기획/업무/개인), 오늘의 팀 활동 |
| 상품조회 | tab-product | 1 | 검색/필터/정렬, 멀티선택, 인라인편집, 품번→상세모달 |
| 재고 관리 | tab-stock | 1 | 사이즈별 재고, 신규입고/출고/바코드 업로드 |
| 매출현황 | tab-sales | 1 | 플랫폼별 피벗, 판매 업로드(카페24/사방넷/면세점) |
| 신규기획 | tab-plan | 1 | 기획 관리, 일괄일정, 상품 이전, 복제, 삭제 |
| 🏬 매장 | tab-store | 1 | POS. 조회=전원, 작업=본인매장+관리자(권한방침) |
| 행사일정 | tab-event | 1 | 월/주/일 캘린더 |
| 업무일정 | tab-work | 1 | 업무/개인(이너탭) + 칸반 + 주간리포트 |
| 게시판 | tab-board | 1 | 공지/자유, 첨부(Storage) |
| 조직도 | tab-orgchart | 1 | 부서별 카드, 전화번호 |
| 인사관리 | tab-hradmin | 2 | 회원관리 병합 + 백업관리(grade4) |
| 🗑️ 휴지통 | tab-trash | 3 | 소프트삭제 상품 복원/영구삭제 |
| 설정 | tab-settings | 4 | 기본 옵션·매장·입고유형·색상·알림 관리 |
- 이중 차단: nav 버튼 숨김(`updateTabVisibility`) + 라우터 가드(`canAccessTab` in openTab/navigateTo/hashchange/popstate). 미등록 탭=전체개방(신규 탭 추가 시 TAB_PERMISSIONS 필수 등록).

## 5.3 전역 상태 & 설정 변수
- **State**: `allProducts, planItems, workItems, boardPosts`, 탭별 `{filtered, page, pageSize, sort, columnFilters, searchCriteria, needsRerender, activeColumns, inactiveColumns}`, `currentUser, members, selectedProducts(Set), sales.activePlatforms/inactivePlatforms, workCalView/eventCalView, barcodeIndex`.
- **설정(localStorage + Firestore sharedData 이중)**: `_settings`(SETTING_DEFS 옵션) · `_channels`(판매채널 [{name,feeRate,note,active}]) · `_platforms`(활성 채널명, _channels서 동기화) · `_designCodes`([code,en,kr]) · `_classCodes` · `_depts` · `_events` · `_workCategories`/`_workItems` · `_stores` · `_inboundTypes` · `_colorMasters`(111색 10카테고리, color-master.js).
- **메모리 변수**: `_reservedCodes, _detailCode, _detailPendingCode, _editingPlanNo, _pdPendingCode, _planSelected, _personalSchedules, _allUsers, _currentUserName/Position/Dept/Grade/StoreId, _storeViewOverride, _editingPsId, _notifications, _watches, _storeStockIndex, _storeLocIndex, _inbList` 등.
- `POSITIONS`=['사원','주임','대리','과장','차장','실장','팀장','부장','이사','대표이사']. `DEFAULT_PLATFORMS`=['공홈','GS','29cm','W쇼핑','기타'].
- `populateAllSelects()` — _settings + _platforms + POSITIONS + 각 config 기반 모든 select 동적 채움.

## 5.4 이미지 우선순위
- `getThumbUrl()`: sum → lemango → noir → design → shoot. 폴백: `PLACEHOLDER_IMG = 'assets/logo-placeholder.png'`(SVG data URI 아님, assets 파일). 로고: `assets/logo-white.png`(다크), `logo-black.png`(라이트).

## 5.5 모달 목록 (핵심)
`imageModal, detailModal(openDetailModal, readOnly opt), registerModal, stockRegisterModal, outgoingModal, barcodeUploadModal, salesUploadModal(카페24/사방넷/면세점), gonghomPreviewModal, sabangnetPreviewModal, planDetailModal, planDeleteConfirmModal, productDeleteConfirmModal, eventRegisterModal, planScheduleModal, workRegisterModal, workDetailModal, weeklyReportModal, dashDayModal, dashInfoModal, signupModal, memberEditModal, memberAddModal, memberProfileModal, bulkScheduleModal, personalScheduleModal, activityDetailModal`.
POS: `storeStockUploadModal, storeStockDetailModal(공용 상품 상세 openStoreProductDetail), inboundScanModal(ESC 차단·명시적 닫기), inbLookupModal, inbCloseConfirmModal, inbHistoryModal, inbCancelModal, saleLookupModal`.
> 모든 `.srm-modal`은 `makeDraggableResizable()` 적용. 수정모드 모달은 `safeCloseModal(modal, isEditing, closeFn)`로 종료 확인. `korConfirm()` = `<dialog>` 한글 확인.

## 5.6 카페24 주문 업로드 (매출 공식은 1.4)
- 파일 A~AA 27컬럼. 매칭 키=E열 자체상품코드. 사이즈=H열 `parseCafe24Size`(SIZE=90(L)→L, Size=M→M, 빈값→F). 채널: I열 LEMANGOKOREA→공홈, LEMANGO PARTNER→파트너(`cafe24Channel`). `_cafe24Orders` 주문번호 그룹핑.
- **주문번호 중복 검출(CRITICAL)**: `_buildExistingOrderIndex()` = 전체 revenueLog orderNo Set. 존재 시 `isDuplicate`(파란 배경+취소선, checkbox disabled, 절대 반영 안 됨).
- 행 상태 우선순위: ①중복(disabled) ②환불+미매칭(disabled) ③환불+매칭(checked, 마이너스) ④정상+매칭(checked, 플러스) ⑤미매칭(신규등록 auto 생성, checked). 확정: 정상 `p.sales[ch]+=qty`(type:'sale'), 환불 `-=qty`(type:'refund' 음수).
- 신규 채널 자동감지(`detectNewChannels`/`promptNewChannels`) → 수수료율 입력 → saveChannels + p.sales 키 0 초기화. 미매칭 품번 자동생성(`_cafe24CreateProduct`/`_sbCreateProduct`).
- 사방넷: 20컬럼 A~T, `js/sabangnet.js`. 사은품 판별 = 매출 제외(1.4).

## 5.7 엑셀 상품 업로드/다운로드
- 신규 47컬럼 양식(1행 헤더) `_downloadProductSample()` + 입력 가이드 시트. `ALL_DOWNLOAD_COLUMNS`(마스터 딕셔너리) vs `DEFAULT_FORMATS[*].columns`(실제 export selector) **분리** — 신규 컬럼은 **양쪽 다** 등록해야 함(False-PASS 교훈). 사이즈규격 컬럼은 `buildSizeSpecColumns()`로만 생성.
- 색상 라운드트립: `resolveColorIdentity()`/`_sameColorIdentity()` — 무수정 재업로드 시 거짓 색상 diff 억제 + colorEn 덮어쓰기 방지(마스터 인식 diff, Option B). 색상코드→마스터 조회→colorKr/colorEn 자동 채움.
- 신규기획 라운드트립 양식 `_downloadPlanFull`/`_downloadPlanSample`/`uploadPlans`(sampleNo 필수, confirmed:true 거부). schedule 단계는 `getPlanPhases()` 동적.

## 5.8 CSS
- 브랜드 컬러: `--primary:#1a1a2e`(네이비) `--accent:#c9a96e`(골드) `--bg:#f5f4f1` `--success:#4caf7d` `--warning:#f0a500` `--danger:#e05252`.
- 스크롤: flex 내부 스크롤=컨테이너 `overflow-y:auto`+`min-height:0`, 자식 `flex-shrink:0`.
- 상세 모달 수정모드: `.detail-modal.edit-mode` 클래스로 `.dfield-value`↔input 토글. `.srm-modal{position:fixed;margin:0}`(draggable 필수).
- 2단 헤더 sticky: `fixStickySubRow(tableId)`가 렌더 후 1행 실제 높이 측정→2행 top 동적 적용(하드코딩 금지). 헤더 span 너비 ≡ CSS 컬럼 너비.
- 사이즈규격 input: `.size-spec-input` 스피너 제거(`appearance:textfield`). `size-spec-view-wrap`↔`edit-wrap` 토글.

## 5.9 에이전트 (`.claude/agents/`)
`data-engineer`(엑셀→JSON) · `ui-designer`(레이아웃/컬러) · `search-filter` · `table-renderer` · `excel-handler`(SheetJS) · `dashboard` · `layout-designer` · `feature-builder`(다중파일) · `debugger`(증상→파일) · `code-reviewer`(품질 체크리스트) · `qa-tester`(제3자 검증).

## 5.10 공통 시스템
- **테이블**: `initTableFeatures(tableId, tabKey, renderFnName)`(정렬/필터/리사이즈 통합), `applyColFilters`, 컬럼 드래그(`initColumnState`/`bindColumnDragDrop`), 페이지네이션(`renderPagination`/`goPage`/`getPageSize`), 렌더 시 `State.X.sort`로 정렬(단일 권위).
- **작성자/수정자 스탬프**: `stampCreated(obj)`/`stampModified(obj)` → `renderStampInfo(obj)`. `formatUserName(name,position)`="이름 직급"(사원이면 이름만), `formatUserNameHonorific`. `showUserProfile(uid,anchorEl)` 프로필 팝업.
- **알림**: `addNotification(type,title,body,link,opts)` (link=`#tab:id`/`#tab:personal:id`), `isNotifEnabled(type)` 게이트, 설정 토글(`lemango_notif_settings_v1`). 자동생성: event_start/end, plan_deadline, board_notice, member_pending_urgent(🔴 grade≥2), comment_mention, watch_change, personal_schedule.
- **댓글**: `buildCommentSection(modalType, targetId)` 5개 모달(상세/기획/행사/업무/회원/게시판). `@멘션` 알림.
- **감시(Watch)**: `_watches`, `toggleWatch`/`notifyWatchers`. **편집잠금**: `acquireEditLock`/`releaseEditLock`(5분 timeout). **고정메모**: `pinnedMemo`. **상품 히스토리**: `addProductHistory`/`getProductHistory`(localStorage 50건).
- **자동 백업**(backup.js): 매일 23:59 + 주간/월간, Storage `backups/{type}/{date}.json`(grade≥3 게이트, 실패 토스트 admin-only). `restoreBackup`/`manualBackup`/`getBackupStatus`.
- **전역 에러**: `window.onerror`/`unhandledrejection` → `logActivity('error',...)`(3초 throttle).
- **실시간 동기화**: `setupRealtimeSync`(main.js) — `_onProductsChanged`가 `.filtered` 재구축 + **활성 탭만 렌더**, 비활성 product/stock/sales는 `needsRerender=true`(dirty flag) → `applyTabState` 전환 시 렌더. `buildBarcodeIndex` 재구축. 5분 폴링은 sync로 대체.
- **캘린더 뷰**: 월/주/일(`switchCalView`, `renderWeekView`/`renderDayView`), `getStartOfWeek`, 공휴일(`getHolidayName`), 미니 달력(`openMonthPicker`).

---

# 6. 압축 Changelog (Compact Changelog)
> 완료 sub-phase 1줄 요약. 상세는 git 이력. 🟢=code-reviewer 통과.

## 2026-03 (기반 구축)
- 03-16: 바코드 필드 추가, sizeSpec 분리(bust/waist/hip), 디자인 속성(chestLine/transparency/lining/capRing/guide), GitHub 연동.
- 03-17: saleStatus 필터, 신규입고/개별출고 분리(stockLog/barcodes), 입고 엑셀 long format, `makeDraggableResizable`/`centerModal`, 설정 탭 + `populateAllSelects`, 판매채널 동적화(_platforms), 공홈 주문 업로드, 신규기획 탭 + 상품 이전 워크플로우(품번 중복방지·lock·scheduleLog).
- 03-18: **JS 모듈 분리**(app.js→js/ 15파일) + 해시 SPA 라우팅 + Firebase Hosting 배포. 실제 상품 데이터 로드. 디자인번호/백스타일 `_designCodes` 단일 소스 통합. `korConfirm()` 한글 다이얼로그. **페이지네이션 전 탭 공통**(PAGE_SIZE).
- 03-23: 행사일정 탭(월 캘린더, 컬러 바, 공휴일 `getHolidayName`) + 대시보드 캘린더(행사/기획 연동) + 신규기획 일정 단계·날짜 필터.
- 03-24: 대시보드 레이아웃 2컬럼(캘린더 + 매출/BEST TOP10).
- 03-26: **매출현황 피벗테이블 개편**(2단 헤더, 플랫폼 드래그앤드롭, activePlatforms/inactivePlatforms). 테이블 컬럼 너비 고정. **탭 바 시스템**(멀티탭, DOM 유지 전환, `openTab`/`closeTab`/`resetTabs`). **업무일정 탭**(work.js, 캘린더, 카테고리 색상). **전체 테이블 컬럼 정렬+필터**(`initTableFeatures`, 엑셀 스타일 드롭다운, 교차 필터).
- 03-27: 버그 수정(레거시 app.js 참조 제거, 페이지네이션 컨테이너 복원). sticky 헤더 틀고정. 상품조회 lastInDate 컬럼. 레이아웃 전체 폭 확장.
- 03-30: 2단 헤더 sticky top 버그 수정(`fixStickySubRow`). 샘플 데이터 주입(이후 제거됨). **전체 테이블 컬럼 드래그 관리**(activeColumns/inactiveColumns, 상품/재고/기획).
- 03-31~04-02: dashDayModal(overflow 날짜 상세, 스택 모달, 단계별 서브그룹, 조회 버튼 이벤트 위임). **판매조회→매출현황 이름 변경**. **판매 업로드 모달**(카페24/사방넷/면세점 3탭). **카페24 파싱 전면 개편**(27컬럼, 매출=P+Q−U(MAX)−Y, 주문번호 중복검출, 환불 마이너스, revenueLog type).

## 2026-04 (인증·협업·POS 준비)
- 04-03: **카페24 매출 계산 재구축**(U=주문당 MAX, `_cafe24Orders`, 순실결제). **사방넷 업로드**(sabangnet.js, 매출=H+I, 사은품 제외, 신규등록 자동생성). **로그인/회원관리 시스템**(auth.js/members.js, Firebase Auth+Firestore users, 등급 4단계, 승인 워크플로우, SESSION persistence).
- 04-06: **활동 로그**(activity-log.js, `logActivity`, 회원관리 이너탭). **모달 댓글**(comments.js, 5개 모달). 이모티콘 선택기. **게시판**(board.js, 공지/자유, 첨부 base64). firestore.rules 신규(users/comments/activityLogs/posts). 대시보드 KPI 제거→공지/최근등록. 상품 삭제·생산상태 컬럼. **엑셀 47컬럼 양식**. 바코드 엑셀 업로드. sizeSpec 7사이즈 그리드 + 성별. `safeCloseModal` 수정모드 종료 확인. `korConfirm`→`<dialog>`. 알림 시스템. 행사 모달 보기/수정 분리.
- 04-07: 작성자/수정자 스탬프. **직급 시스템**(POSITIONS, formatUserName). 작성자→프로필 팝업. 신규기획 일괄 일정. **개인일정 시스템**(personalSchedules, @멘션, 가시성 규칙, 관리자 패널). 기획 필드=상품 필드 동일화 + 복제. 로고 이미지 + 로딩 스크린.
- 04-08: 매출 업로드 새 채널 자동감지. 기획 이미지 tempImages(참고)/images(상품) 분리. **9종 기능**(hover/멀티선택/인라인편집/재고경고/채널칩/기획 드래그/단축키/대시보드 필터/캘린더 주·일 뷰+체크리스트). **10종 팀 협업**(상품 히스토리/Watch/팀 활동/@멘션 알림/담당자/칸반/주간 리포트/마감 컬러/편집잠금/고정메모). 신규 가입 최우선 알림(🔴 grade≥2).
- 04-09: 업무일정 차량 사용여부. 대시보드 활동 뷰 등급 기반. 알림 설정 토글. Notification 링크 직접 네비(`#tab:id`). dashInfoModal UI 표준. planScheduleModal 컴팩트. **조직도 탭**(orgchart.js, 부서별 카드, 전화번호). 헤더 3존 레이아웃.
- 04-13: **샘플 데이터 전체 제거** + 일회성 리셋. **자동 백업 시스템**(backup.js). 에러 로그 자동 기록. **Cafe24 CSV 798개 상품 일괄 변환**(products_lemango 633 + noir 165, 품번 prefix→타입 자동감지, 색상코드 매핑).
- 04-14: Firebase Storage 마이그레이션(첨부/기획 임시이미지 base64→Storage, 고아 파일 방지). 신규기획 영속화 버그 수정(savePlanItems). 회원가입 원자성 + 중복 이메일 안내. 회원 승인 즉시 반영(캐시 우회). **checkApproval 보안 구멍 차단**(첫 사용자만 grade4). 5분 자동 새로고침. 업무일정 수정/삭제 권한(canEditWork).
- 04-21: **권한 기반 탭 접근 제어**(TAB_PERMISSIONS + canAccessTab, nav 숨김 + 라우터/hashchange/popstate 가드).
- 04-24: S-01 수정양식 카페24/바코드 제거. S-02 사이즈규격 size-first 그리드. S-03 가이드 섹션 분리. S-04 엑셀 19컬럼 + 사이즈/가이드 HTML 복사.

## 2026-05
- 05-08: S-05 신규기획 엑셀 라운드트립(~70컬럼, sampleNo 필수, confirmed 거부). S-06 신규기획 삭제(작성자/grade≥3, type-to-confirm, Storage 정리).
- 05-XX: **S-07 색상 마스터 시스템**(color-master.js, 111색 10카테고리, 드롭다운 피커, 설정 카드, 마이그레이션, 색상코드 엑셀 통합). 색상 피커 UX 5종. 색상코드 다운로드 누락 수정(False-PASS #1: ALL_DOWNLOAD vs DEFAULT_FORMATS 분리). **S-08 상품 soft-delete + 휴지통 탭**(trash.js, deleted 플래그, 4뷰 필터, 복원/영구삭제). S-09 휴지통 조회 모드(readOnly) + dLockCodeBtn 버그 수정(False-PASS #2: helper 호출 후 override).
- 05-21: **Phase A 보안 수정**(firestore.rules): 회원 self-update grade/status 불변, 삭제 규칙 3건 동기화(comments/leaves/users), personalSchedules 작성자 전용, isApproved 게이트. **Phase A-2 U1**: users create grade1/pending 강제. 신규기획 품번 생성 시리얼 슬라이스 버그(prefix 11자) + 수정 시 품번 필수 차단 제거. 백업 Storage 403 핫픽스(cross-service grade→auth!=null + JS 게이트). 백업 Firestore→Storage 이전(1MB 한도 회피, Option C). 품번 분류 dropdown `_classCodes` 라이브. 진단 문서(permission-model/pre-activation-audit).

## 2026-06
- 06-22: **사이즈 규격 Phase A**(SIZE_SPEC_PARTS 단일 소스 리팩터, buildSizeSpecColumns 19컬럼, 동작 동일) → **Phase B**(측정부위 4종 추가, core.js 1파일, 43컬럼) → **Phase C**(빈 측정항목 제외 getActiveParts, 보기/HTML filled-only). `fc04ef1`/`d602aa8`.
- 06-23: **색상 라운드트립 버그 수정**(`8e66142`, resolveColorIdentity/_sameColorIdentity, 마스터 인식 diff, Option B). **재고/매출 상품 누락 RC1**(`f6d6cf6`, refreshAllProductViews 헬퍼, sales.filtered 누락 4경로). **휴지통 stale RC2 2a**(`e166bab`). **기본 정렬 registDate desc + 재고/매출 브랜드 필터**(`1198c8c`). **RC2 2b**(dirty flag 타 탭 stale + 검색 영속화 searchCriteria/_reNarrowFiltered) — 재고/매출 stale 시리즈 완결.
- 06-24: 사이즈 규격 비키니 상/하의 4종(11부위 67컬럼) + 컵/허리 4종(15부위 91컬럼) — 각 core.js 1파일. 사이즈규격 input 숫자 스피너 제거(CSS).

## 2026-06-30 ~ 07-02 (POS)
- 06-30: **POS Phase 0**(바코드 업로드 하드닝: 13자리 검증/유니크/raw:false + 역인덱스 buildBarcodeIndex/findByBarcode). 캐시 무효화(firebase.json Cache-Control) + 바코드 저장 하드닝(saveProducts 반환값). 바코드 대소문자 무시 + 미등록 복사 + 불완전 행 경고.
- 07-01: POS Phase 1 설계 문서. **Phase 1a**(매장 config `_stores`) → **1b**(사용자 storeId + resolveActiveStore) → **1c**(매장 탭 shell store.js + 서브내비 + 관리자 스위처) → **1d**(storeStock per-doc 모델 + FieldValue.increment 헬퍼 + Firestore 규칙, SIZES 확정, OR-union 정정) → **1e**(재고 엑셀 SET/ADD, 이중 식별) → **1f**(매장별 재고현황 뷰 + 상세 모달). Phase 2 설계 문서. **2a**(sizeLocations 데이터층, 재고 코어 불변). **✅ Phase 1 완료**.
- 07-02: **Phase 2b**(입고 스캔 화면: 커서 상태머신 + 4대 차단규칙 + staging + localStorage draft + IME/디바운스, 재고 쓰기 없음) → **2b-r**(서브메뉴 6→4, 허브 창 재하우징 inboundScanModal, UX 재설계, 품번조회 inbLookupModal, 5종 폴리시, 입고 오류 배너 버그 수정) → **2c**(최종 확정 원자적 배치: storeStock increment + sizeLocations overwrite + storeInbound 이력, double-confirm 가드, 청크 코드 경계, 규칙+인덱스) → **2d**(입고 내역 날짜별 조회). **✅ Phase 2 완료**. 입고 이력 업그레이드(기간조회/입고번호 IN-.../메모/엑셀). **입고 취소**(runTransaction 역반영 increment(-qty) + 사유 필수 클라+서버 + 취소필드 field-restricted update, 코드베이스 첫 트랜잭션). 입고 물류 강화(_inboundTypes 유형 설정 + 확정 시 유형 스냅샷 + 유형/상태 필터 + normalizeLocation).
- 07-02: POS Phase 3 설계 문서. **Phase 3a**(매출 원장 데이터층: buildSaleDoc/buildVoidDoc/generateSaleNo/normalizePhone/maskPhone/voidDocId, storeSales 규칙 refinement, 복합인덱스, customerPhone, double-void 구조적 불가 증명). **Phase 3b**(판매 화면: 스캔→즉시 라인 추가/병합→합계→draft, saleLookupModal, 확정 stub, 재고/원장 쓰기 없음). **공용 상품 상세 모달**(openStoreProductDetail, 판매 리스트 + 1f 재고뷰 공용, 이미지/상품명/사이즈별 재고·로케이션, 읽기전용). **다음=Phase 3c**.
