# 르망고 시스템 권한 모델 분석

**작성일**: 2026-05-21
**분석 범위**: 현재 코드(클라이언트 + Firestore 규칙)에서 실제로 동작 중인 권한 모델 추출
**목적**: 보안 규칙 강화 전, 의도된 정책과 현재 구현의 차이 파악
**방식**: 진단 전용 — 코드 수정 없음, 모든 항목 `file:line` 인용

---

## Part 1: 등급 체계

### 1-1. 등급 정의

| 등급 번호 | 라벨 (한글) | 정의 위치 | 비고 |
|-----------|------------|-----------|------|
| 1 | 담당자 | `js/auth.js:43` (GRADE_DEFS) | 기본 등급. 회원가입 시 자동 부여 (`js/auth.js:319`) |
| 2 | 부서장 | `js/auth.js:42` (GRADE_DEFS) | 인사관리 탭 접근, 부서 단위 일부 권한 |
| 3 | 관리자 | `js/auth.js:41` (GRADE_DEFS) | 삭제·승인·정지·휴지통·급여 등 관리자 권한 |
| 4 | 시스템 관리자 | `js/auth.js:40` (GRADE_DEFS) | 설정 탭, 등급 변경, 백업, 부서/IP 관리 |
| 5 | 대표이사 | `js/auth.js:39` (GRADE_DEFS) | **UNKNOWN — 코드 내 권한 분기는 grade≥3/4 까지만 사용. grade 5 는 회원관리 KPI(`js/members.js:87,101`) 외 실제 권한 분기 없음. CLAUDE.md 의 4단계 표는 grade 5 미반영 → 문서/코드 불일치** |

> **확인 필요(소유주)**: grade 5(대표이사) 가 grade 4 와 동일 권한인지, 혹은 더 높은 권한이 의도되었는지. 현재 코드는 `grade >= 4` 로 묶여 동작합니다.

### 1-2. 탭별 최소 등급 (TAB_PERMISSIONS)

`js/core.js:685-691` 에 정의. 라우터/UI 가드는 `canAccessTab` (`js/core.js:694-699`) + `updateTabVisibility` (`js/main.js:320-340`).

| 탭 | 최소 등급 | 담당자(1) | 부서장(2) | 관리자(3) | 시스템관리자(4) |
|----|-----------|-----------|-----------|-----------|-----------------|
| dashboard, product, stock, sales, plan, event, work, board, orgchart, mypage | 1 | O | O | O | O |
| hradmin (인사관리) | 2 | X | O | O | O |
| trash (휴지통) | 3 | X | X | O | O |
| settings (설정) | 4 | X | X | X | O |

**참고**: 이중 가드 — (1) `updateTabVisibility` 가 nav 버튼을 `style.display='none'` 으로 숨기고 (`js/main.js:325`), (2) `openTab` 첫 줄에서 `canAccessTab` 호출 (`js/router.js:39-42`) 해 거부 시 대시보드로 리디렉트.

---

## Part 2: 데이터별 권한 현황

> 표기 규칙
> - **rules** = `firestore.rules` 서버 규칙
> - **client** = 자바스크립트에서 실제로 행위 호출 직전 검증되는 권한
> - 🔴 = rules 와 client 가 불일치 (서버에서 막힘 / 또는 서버가 클라이언트보다 느슨)
> - 🟡 = 서버 검증 없음 (rules 가 모든 인증 사용자에게 허용)

### 2-1. products (상품)

- **저장 위치**: Firestore `sharedData/products_*` 청크 + `sharedData/products_meta` (`js/core.js:89-127`)
- **단일 문서 공유 패턴** — 서버는 문서 단위 권한만 검증, 행 단위 권한 강제 불가능

| 작업 | rules (위치) | client (위치) | 불일치 |
|------|--------------|---------------|--------|
| CREATE | 인증된 모든 사용자 (`firestore.rules:8-10` `sharedData` 전체) | 인증 사용자 누구나 (`js/register.js:200` `submitRegister`, 등급 게이트 없음) | 🟡 서버 검증 없음 |
| EDIT (필드 수정) | 인증된 모든 사용자 (`firestore.rules:8-10`) | 인증 사용자 누구나 (`js/modals.js:1357` `saveDetailEdit`, 등급 게이트 없음) | 🟡 서버 검증 없음 |
| DELETE (소프트, 휴지통 이동) | 인증된 모든 사용자 (`firestore.rules:8-10`) | 작성자 OR grade≥3 (`js/modals.js:927-934` `canDeleteProduct`) | 🟡 서버 검증 없음 (클라이언트만 강제) |
| DELETE (영구) | 인증된 모든 사용자 (`firestore.rules:8-10`) | grade≥3 (`js/trash.js:11-14` `_trashCanAccess`) | 🟡 서버 검증 없음 |
| RESTORE (휴지통→복원) | 인증된 모든 사용자 (`firestore.rules:8-10`) | grade≥3 (`js/trash.js:148` `restoreProduct`) | 🟡 서버 검증 없음 |

**평문 설명**: 누구나 로그인하면 모든 상품 정보를 수정할 수 있습니다. 삭제는 화면에서는 작성자/관리자만 보이지만, 개발자 도구로 직접 호출하면 차단되지 않습니다.

---

### 2-2. planItems (신규기획)

- **저장 위치**: Firestore `sharedData/planItems` 단일 문서 (`js/plan.js:9-21` `savePlanItems` → `_fsSync` → `sharedData/planItems`) + localStorage 캐시
- 단일 문서이므로 서버는 per-row 권한 강제 불가

| 작업 | rules (위치) | client (위치) | 불일치 |
|------|--------------|---------------|--------|
| CREATE | 인증된 모든 사용자 (`firestore.rules:8-10`) | 인증 사용자 누구나 (`js/plan.js:420` `submitPlanRegister`) | 🟡 |
| EDIT | 인증된 모든 사용자 (`firestore.rules:8-10`) | 인증 사용자 누구나 (`js/plan.js:1301` `togglePlanDetailEdit` — 등급 게이트 없음. `editLock`만 존재) | 🟡 |
| DELETE | 인증된 모든 사용자 (`firestore.rules:8-10`) | 작성자 OR grade≥3 (`js/plan.js:1143-1152` `canDeletePlanItem`) | 🟡 |

**평문 설명**: 신규기획은 모든 상품 데이터와 같은 문서에 저장되어 있어, 한 사람이 1개 항목을 저장하면 전체 항목이 함께 덮어써집니다. 서버는 누가 어떤 행을 건드렸는지 알 수 없습니다.

---

### 2-3. events (행사일정)

- **저장 위치**: Firestore `sharedData/events` 단일 문서 (`js/core.js:1228-1236` `saveEvents` → `_fsSync`) + localStorage 캐시 `lemango_events_v1`

| 작업 | rules (위치) | client (위치) | 불일치 |
|------|--------------|---------------|--------|
| CREATE | 인증된 모든 사용자 (`firestore.rules:8-10`) | 인증 사용자 누구나 (`js/event.js:578` `submitEventNew`) | 🟡 |
| EDIT | 인증된 모든 사용자 (`firestore.rules:8-10`) | 인증 사용자 누구나 (`js/event.js:696-698` `canEditEvent` → `firebase.auth().currentUser` 만 확인) | 🟡 |
| DELETE | 인증된 모든 사용자 (`firestore.rules:8-10`) | 작성자 OR grade≥3 (`js/event.js:687-695` `canDeleteEvent`) | 🟡 |

---

### 2-4. workItems (업무일정)

- **저장 위치**: Firestore `sharedData/workItems` 단일 문서 (`js/core.js:1265-1273` `saveWorkItems`) + localStorage 캐시 `lemango_work_items_v1`

| 작업 | rules (위치) | client (위치) | 불일치 |
|------|--------------|---------------|--------|
| CREATE | 인증된 모든 사용자 (`firestore.rules:8-10`) | 인증 사용자 누구나 (`js/work.js:551` `submitWork`) | 🟡 |
| EDIT | 인증된 모든 사용자 (`firestore.rules:8-10`) | 인증 사용자 누구나 (`js/work.js:636-638` `canEditWork` → 로그인만 체크. 단 `editWorkFromDetail` 에서 `canEditWork` 재확인 `js/work.js:926`) | 🟡 |
| DELETE | 인증된 모든 사용자 (`firestore.rules:8-10`) | 작성자 OR grade≥3 (`js/work.js:639-646` `canDeleteWork`) | 🟡 |

---

### 2-5. attendance (출퇴근)

- **저장 위치**: Firestore `attendance/{doc}` 컬렉션 (`js/hr.js:185,189`)

| 작업 | rules (위치) | client (위치) | 불일치 |
|------|--------------|---------------|--------|
| CREATE | 인증된 모든 사용자 (`firestore.rules:52-56`) | 본인 출퇴근만 — 사용자가 자기 doc 작성 (`js/hr.js:185-189`) | 🟡 서버 — 누구나 가능 / 클라이언트 — 본인만 호출 |
| EDIT (update) | 인증된 모든 사용자 (`firestore.rules:55`) | 본인 행 (`js/hr.js:185` `set merge`) | 🟡 서버 — 다른 사용자 doc도 수정 가능 |
| DELETE | **차단됨** (`firestore.rules:56` `allow delete: if false`) | 호출 없음 | ✅ 일치 |

**평문 설명**: 본인의 출퇴근 기록을 수정해 지각/조퇴 흔적을 지우는 행위는 막혀 있지 않습니다. 서버 규칙은 "로그인된 누구나" 까지만 막고, "본인 doc만" 은 강제하지 않습니다.

---

### 2-6. leaves (연차)

- **저장 위치**: Firestore `leaves/{doc}` 컬렉션

| 작업 | rules (위치) | client (위치) | 불일치 |
|------|--------------|---------------|--------|
| CREATE | 인증된 모든 사용자 (`firestore.rules:39`) | 본인 연차 신청 (`js/hr.js:219` `submitLeaveRequest`) | 🟡 |
| EDIT (승인/반려/취소) | 인증된 모든 사용자 (`firestore.rules:40`) | 승인 취소 grade≥3 (`js/hr.js:906-910`). 일반 update 는 인증만 (`js/hr.js:212`) | 🟡 |
| DELETE | **차단됨** (`firestore.rules:41` `allow delete: if false`) | `js/hr.js:607` 에서 `db.collection('leaves').doc(...).delete()` 호출 + `js/hr.js:979-982` `deleteLeave` (grade≥3) | 🔴 **클라이언트가 서버에 막힘** |

**평문 설명**: 화면에 "관리자 이상 연차 삭제 가능" 버튼이 있지만, 서버 규칙은 누구의 연차도 삭제 못 하게 막혀 있어서 **버튼을 눌러도 실패** 합니다. 이 항목은 코드/규칙이 충돌하므로 정책 결정이 필요합니다.

> **확인 필요**: 연차 기록 삭제를 (a) 절대 막을 것인지(현 규칙) 또는 (b) 관리자에게만 허용할 것인지.

---

### 2-7. leaveQuotas (연차 일수 한도)

| 작업 | rules (위치) | client (위치) | 불일치 |
|------|--------------|---------------|--------|
| CREATE/UPDATE/DELETE | grade≥3 만 가능 (`firestore.rules:47-48`) | grade≥3 (`js/members.js:248-250` `suspendMember` 인접한 _saveQuota 패턴, `js/hr.js:237`) | ✅ 일치 (서버 단단함) |
| READ | 인증된 모든 사용자 (`firestore.rules:46`) | 인증 사용자 누구나 | ✅ |

**평문 설명**: 다른 직원의 연차 한도를 마음대로 늘리는 건 서버에서 막혀 있습니다. (정상)

---

### 2-8. personalSchedules (개인일정)

- **저장 위치**: Firestore `personalSchedules/{doc}` 컬렉션

| 작업 | rules (위치) | client (위치) | 불일치 |
|------|--------------|---------------|--------|
| CREATE | 인증된 모든 사용자 (`firestore.rules:88`) | 인증 사용자 누구나 (`js/work.js:1646-1674` `savePersonalSchedule`) | 🟡 |
| EDIT (update) | 인증된 모든 사용자 (`firestore.rules:89`) | 인증 사용자 누구나 — `togglePsEdit` (`js/work.js:1411`) 에 권한 게이트 없음. **본인 일정이 아니어도 수정 가능** | 🔴 의도 위배 (소유주 정책: "작성자만") |
| DELETE | 인증된 모든 사용자 (`firestore.rules:90`) | 작성자 OR grade≥3 (`js/work.js:1403-1409` `canDeletePs`) | 🟡 (서버 — 누구나) |
| READ | 인증된 모든 사용자 (`firestore.rules:87`) | 본인+멘션+같은부서 또는 grade≥4 (`js/work.js:1191-1203` `getVisibleSchedules`) | 🟡 서버는 모두 읽기 허용 (다른 사람 일정 직접 ID로 읽으면 볼 수 있음) |

**평문 설명**: 개인일정은 화면에서는 본인+멘션 받은 사람만 보이지만, 서버는 ID만 알면 누구나 읽을 수 있게 열려 있습니다. 또한 다른 사람의 개인일정 수정도 서버가 차단하지 않습니다.

---

### 2-9. comments (댓글)

- **저장 위치**: Firestore `comments/{doc}` 컬렉션

| 작업 | rules (위치) | client (위치) | 불일치 |
|------|--------------|---------------|--------|
| CREATE | 인증된 모든 사용자 (`firestore.rules:80`) | 인증 사용자 누구나 (`js/comments.js:220` `submitComment`) | ✅ |
| EDIT (update) | 인증된 모든 사용자 (`firestore.rules:81`) | 작성자 OR grade≥3 (`js/comments.js:293-295` `saveCommentEdit`) | 🟡 (서버 — 누구나) |
| DELETE | **작성자 본인만** (`firestore.rules:82` `resource.data.uid == request.auth.uid`) | 작성자 OR grade≥3 (`js/comments.js:313-316` `deleteComment`) | 🔴 **관리자가 댓글 삭제 버튼을 눌러도 서버에서 실패** |

**평문 설명**: 화면에 "관리자는 모든 댓글 삭제 가능" 으로 나와있지만, 서버 규칙은 댓글 작성자 본인만 삭제할 수 있게 되어 있습니다. 관리자가 부적절 댓글을 지우려고 해도 권한 오류가 납니다.

---

### 2-10. notifications (알림)

- **저장 위치**: Firestore `notifications/{doc}` 컬렉션 (`js/core.js:1453`)

| 작업 | rules (위치) | client (위치) | 불일치 |
|------|--------------|---------------|--------|
| CREATE | 인증된 모든 사용자 (`firestore.rules:13-15`) | 인증 사용자 누구나 (`js/core.js:1453` `addNotification`, 자신/타인 uid 모두 설정 가능) | 🟡 |
| EDIT | 인증된 모든 사용자 (`firestore.rules:13-15`) | 본인 알림 dismiss 등 (`js/core.js:1533`) | 🟡 |
| DELETE | 인증된 모든 사용자 (`firestore.rules:13-15`) | 본인 알림 (`js/core.js:1549`) | 🟡 |

**평문 설명**: 누구든지 다른 직원에게 가짜 알림을 보낼 수 있는 구조입니다. 알림 doc 의 `uid` 필드만 바꾸면 됩니다.

---

### 2-11. revenueLog (매출 이력 — 상품 내장 배열)

- **저장 위치**: `product.revenueLog[]` 배열 (상품 doc 내장) — `sharedData/products_*` 청크에 포함
- 별도 컬렉션 없음 — 권한은 상품과 동일

| 작업 | rules | client | 불일치 |
|------|-------|--------|--------|
| WRITE (카페24/사방넷 업로드) | 인증된 모든 사용자 (`firestore.rules:8-10`) | 인증 사용자 누구나 (`js/gonghom.js:663` `confirmGonghomUpload`, `js/sabangnet.js:576` — 등급 게이트 없음) | 🟡 |

**평문 설명**: 누구든지 카페24/사방넷 엑셀을 업로드해 매출 데이터를 변경할 수 있습니다. 권한 분리 없음.

---

### 2-12. inventory / stock (재고 — 상품 내장)

- **저장 위치**: `product.stock` / `product.stockLog[]` 배열 (상품 doc 내장)

| 작업 | rules | client | 불일치 |
|------|-------|--------|--------|
| 입고/출고 | 인증된 모든 사용자 (`firestore.rules:8-10`) | 인증 사용자 누구나 (`js/stock.js:217` `saveSrmStock`, `js/stock.js:437` `submitOutgoing`) | 🟡 |

**평문 설명**: 누구나 재고를 늘리고 줄일 수 있습니다.

---

### 2-13. posts (게시판)

- **저장 위치**: Firestore `posts/{doc}` 컬렉션

| 작업 | rules (위치) | client (위치) | 불일치 |
|------|--------------|---------------|--------|
| CREATE | 인증된 모든 사용자 (`firestore.rules:69`) | 인증 사용자 누구나 (`js/board.js:490` `submitBoardPost`) | ✅ |
| EDIT | 인증된 모든 사용자 (`firestore.rules:70`) | 인증 사용자 누구나 (`js/board.js:252` `canEdit = !!auth.currentUser`) | 🟡 (서버 — 누구나 / 클라 — 누구나. 정책상 작성자만 의도?) |
| DELETE | 작성자 OR grade≥3 (`firestore.rules:71-74`) | 작성자 OR grade≥3 (`js/board.js:529`) | ✅ 일치 |

**평문 설명**: 게시글 **수정** 은 누구나 가능합니다 (서버+클라 동일). 다른 직원의 글을 마음대로 고칠 수 있는 구조. — *의도된 정책인지 확인 필요*.

---

### 2-14. users (회원)

- **저장 위치**: Firestore `users/{uid}` 컬렉션

| 작업 | rules (위치) | client (위치) | 불일치 |
|------|--------------|---------------|--------|
| CREATE | 인증된 모든 사용자 (`firestore.rules:30`) | 회원가입 — 자기 자신 doc (`js/auth.js:312` 회원가입), 관리자 추가 (`js/members.js:461` `saveMemberAdd` — grade 게이트 **없음**) | 🟡 |
| EDIT (update) | 본인 OR grade≥3 (`firestore.rules:31-32`) | 시스템관리자(grade≥4)만 등급 변경 (`js/members.js:339-341`). 일반 정보는 본인+관리자 (`js/members.js:300-301`) | ✅ (서버 + 클라 일치) **단**, 등급 필드도 update 권한자에 포함됨 → grade≥3 관리자가 grade 필드를 직접 set 가능 |
| DELETE | **차단됨** (`firestore.rules:33` `allow delete: if false`) | `js/members.js:269` 에서 `db.collection('users').doc(uid).delete()` 호출 (grade≥3) | 🔴 **회원 삭제 버튼 눌러도 서버에서 실패** |
| 권한 상승 (자기 grade 올리기) | rules 가 `request.auth.uid == uid` 만 체크 (`firestore.rules:31`) → **본인이 자기 doc 의 `grade` 필드를 직접 4로 set 가능** | 클라에서는 grade 변경 UI 가 grade≥4 에게만 노출 (`js/members.js:300-301`) | 🔴 **CRITICAL 보안 구멍** — 개발자 도구나 API 직접 호출로 본인 grade 를 4로 올릴 수 있음 |

**평문 설명 1 (CRITICAL)**: 로그인한 사용자가 브라우저 콘솔에서 다음과 같이 자기 자신을 시스템 관리자로 만들 수 있습니다:
```
firebase.firestore().collection('users').doc(firebase.auth().currentUser.uid)
  .update({ grade: 4 })
```
규칙(line 31)이 "본인 doc 은 본인이 수정 가능" 까지만 검증하고, 어떤 필드를 어떻게 바꾸는지는 검사하지 않습니다.

**평문 설명 2**: 회원관리 화면의 "삭제" 버튼은 서버 규칙이 막고 있어 작동하지 않습니다.

---

### 2-15. activityLogs / editLocks / watches / backups / salaries (참고)

| 컬렉션 | rules 요약 | 의도된 정책 부합? |
|--------|-----------|------------------|
| `activityLogs` | 누구나 read/create, update/delete 차단 (`firestore.rules:60-64`) | ✅ |
| `editLocks` | 인증된 모든 사용자 (`firestore.rules:18-20`) | ✅ 협업 락은 공유 필요 |
| `watches` | 인증된 모든 사용자 (`firestore.rules:23-25`) | ✅ |
| `backups` | read 인증, write grade≥4 (`firestore.rules:94-97`) | ✅ |
| `salaries` | read 본인 OR grade≥3, write grade≥3 (`firestore.rules:103-111`) | ✅ 민감 정보 잘 보호됨 |

---

### 2-16. Storage (Firebase Storage)

- **`storage.rules:5-17`**: `board/{postId}/{fileName}` + `plan/{planNo}/{fileName}` 모두 인증된 모든 사용자 read/write/delete 허용
- **🟡 모든 인증 사용자가 다른 사람의 첨부파일/이미지를 삭제할 수 있음**

---

## Part 3: 의도된 정책과의 차이

소유주 의도 정책:
- **EDIT**: 모든 인증 사용자 (공동 편집)
- **DELETE**: 작성자 OR 관리자(grade≥3)
- **personalSchedules**: 작성자만 (공유 아님)

### 3-1. 의도된 정책과 일치하지 않는 항목 (수정 필요)

| 데이터 | 항목 | 현재 상태 | 의도 | 심각도 |
|--------|------|-----------|------|--------|
| **users** | 본인이 자기 grade 필드 수정 가능 | 가능 (서버 규칙 빈틈) | **불가능해야 함** | 🔴🔴 CRITICAL |
| **users** | 회원 삭제 | 서버에서 차단되어 항상 실패 | 관리자(grade≥3) 가능해야 함 | 🔴 HIGH |
| **comments** | 관리자가 댓글 삭제 | 서버에서 차단되어 실패 | grade≥3 가능해야 함 | 🔴 HIGH |
| **leaves** | 관리자가 연차 삭제 | 서버에서 차단되어 실패 | grade≥3 가능해야 함 (정책 확인 필요) | 🔴 HIGH |
| **personalSchedules** | 다른 사람이 내 일정 수정 | 가능 (서버+클라 모두 빈틈) | **작성자만** | 🔴 HIGH |
| **personalSchedules** | 다른 사람이 내 일정 ID로 직접 읽기 | 가능 (서버 누구나 read) | 본인+멘션+관리자 | 🟡 MEDIUM |
| **attendance** | 다른 사람 출퇴근 기록 수정 | 가능 (서버 누구나 update) | 본인만 (정책 확인 필요) | 🔴 HIGH |
| **notifications** | 가짜 알림 발송 | 가능 (서버 누구나 create) | 시스템/대상자 본인만 | 🟡 MEDIUM |
| **products / planItems / events / workItems / posts** 등 sharedData·공유 컬렉션 | DELETE 권한 클라에서만 강제 | 서버 검증 없음 (모두 누구나 write) | 권한 위배 시도 시 서버도 거부해야 안전 | 🟡 MEDIUM (현재 정책상 협업 공유 데이터는 단일 문서 구조라 per-row 강제 불가. 구조 전환 결정 필요) |
| **Storage** | 다른 사람 첨부/이미지 삭제 | 가능 (`storage.rules:7,14`) | 업로더 본인 OR 관리자 | 🟡 MEDIUM |
| **posts** | 다른 사람이 내 글 수정 | 가능 (서버+클라 모두) | 작성자 OR 관리자 (정책 확인 필요) | 🟡 MEDIUM |

### 3-2. 의도된 정책과 일치하는 항목 (유지)

| 데이터 | 비고 |
|--------|------|
| `leaveQuotas` | grade≥3 write — 정상 |
| `salaries` | 본인 read + 관리자 read/write — 정상 |
| `backups` | grade≥4 write — 정상 |
| `activityLogs` | update/delete 차단 — 감사 추적 보호 |
| `posts` DELETE | 작성자 OR 관리자 일치 |

---

## 결론

### 즉시 조치 필요 (보안)

1. **`users` 컬렉션 — grade 자기 상승 빈틈 (CRITICAL)**
   서버 규칙(line 31)이 본인 doc update 를 허용하지만 어떤 필드인지 검증 안 함. 본인이 자기 등급을 4로 올릴 수 있음. → 규칙에 `request.resource.data.grade == resource.data.grade` 또는 grade 필드 변경은 grade≥4 만 허용하도록 강화 필요.

2. **`users` DELETE 차단 vs 클라 호출 (HIGH)**
   회원 삭제 버튼 작동 안 함. 정책 정해야 함 (a) 실제로 삭제 차단 유지 → 클라 버튼 제거 또는 status:'deleted' 마킹 패턴 / (b) grade≥3 에게 delete 허용.

3. **`comments` / `leaves` DELETE 불일치 (HIGH)**
   관리자 권한이 서버에서 거부됨. 규칙에 grade≥3 분기 추가하거나 클라 UI 에서 관리자 삭제 버튼 제거.

4. **`personalSchedules` 가시성·수정 보호 (HIGH)**
   서버에 작성자 검증 추가 필요: `update/delete: if resource.data.createdBy == request.auth.uid || grade>=3`. read 도 본인+멘션+관리자 검증 추가.

### 정책 확정 필요 (소유주 결정)

- `attendance` 본인 외 수정 차단 여부
- `leaves` 삭제 허용 여부 (현 규칙은 차단)
- `posts` EDIT 을 작성자 한정으로 강화할지
- grade 5(대표이사) 가 grade 4 와 동일 권한인지

### 구조적 한계

상품/기획/행사/업무 등 **`sharedData/*` 단일 문서 패턴** 은 Firestore 규칙으로 per-row(상품 한 건, 기획 한 건 단위) 권한 강제가 불가능합니다. 보안을 강화하려면:
- (a) 클라이언트 검증을 신뢰하는 현 모델 유지 (현재 상태)
- (b) per-document 컬렉션으로 마이그레이션 (예: `products/{code}`, `planItems/{no}`) → 행 단위 규칙 가능

이 결정은 데이터 규모(상품 약 800건, 청크 6~7개)와 비용 영향(Firestore 읽기 횟수 증가) 검토 후 별도 논의 필요.

---

## 부록: 분석 방법

- **분석자**: code-reviewer 에이전트
- **분석 일시**: 2026-05-21
- **방식**: 진단만 수행, 코드/규칙 수정 없음
- **기준**: `firestore.rules` (서버 규칙) + `js/*.js` (클라이언트 함수) 의 실제 인용
- **인용 형식**: `파일:라인` — 모든 주장에 출처 명시
- **참조 문서**: `CLAUDE.md` (보조 자료, 1차 출처 아님)
- **확인 필요 항목**: 본문 내 "확인 필요(소유주)" 로 명시
