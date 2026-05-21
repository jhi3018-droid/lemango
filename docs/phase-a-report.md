# Phase A 보안 수정 검증 보고서

**작성일**: 2026-05-21
**범위**: 활성화 전 보안 수정 4건 (권한 상승 차단 / 삭제 규칙 동기화 / 개인일정 작성자 제한 / 승인 상태 게이트)
**상태**: 코드 수정 완료. 배포는 소유주 수동 진행 예정.

---

## 종합 결론

4건 모두 코드 레벨에서 정상 적용되었습니다. 핵심 권한 우회 경로(자기 등급 상승, 댓글/연차/회원 무단 삭제, 타인 개인일정 조작, 미승인 사용자 데이터 접근) 4개가 서버 측 `firestore.rules`와 클라이언트 측 `js/work.js`에서 모두 차단됨을 확인했습니다. **Fix 1·3·4는 🟢, Fix 2는 🟡** (residual risk: 회원가입 시 grade 필드 클라이언트 위조 가능성)으로 평가합니다. 배포 후 즉시 시나리오 테스트 5종 권장 (보고서 말미 참조). 단, **회원가입 create 단계에서 클라이언트가 임의 grade 값을 보낼 수 있다**는 문제는 Phase A 범위 밖이지만 권한 상승 경로로 남아있으므로 후속 Phase에서 처리 필요 — 자세한 내용은 "UNSURE" 섹션 참조.

---

## Fix 1: 자기 등급 상승 차단 🟢

### 문제 (수정 전)
- `firestore.rules` 구버전: 사용자 자기 자신 doc 업데이트 시 grade/status 필드 변경에 대한 검증이 없었음
- 일반 사용자가 브라우저 콘솔에서 `db.collection('users').doc(myUid).update({grade: 4})` 호출로 즉시 시스템 관리자로 승격 가능했음

### 수정 (수정 후)
**`firestore.rules:57-62`**
```
allow update: if isAuth() && (
  (request.auth.uid == uid
    && request.resource.data.grade == resource.data.grade
    && request.resource.data.status == resource.data.status)
  || isAdmin()
);
```
- 본인 doc 수정 시 grade/status가 변경되면 거부
- 관리자(`isAdmin()` = grade>=3 + approved)는 모든 필드 변경 가능 (등급/상태 승인 변경 포함)

### 검증
- 헬퍼 함수 `isApproved()` (line 14-18)과 `isAdmin()` (line 21-23) 정상 정의 확인
- `isAdmin()`은 grade >= 3이므로 정책상 grade 3·4·5 (관리자/시스템관리자/대표이사) 모두 통과
- 본인 doc 수정 시 grade/status 비교는 `request.resource.data.grade == resource.data.grade`로 정확히 처리됨
- 정상 이름·전화번호·부서 변경은 영향받지 않음 (grade/status 외 필드는 자유)

### 남은 위험 / 미확인 사항
- 없음. 자기 등급 상승 경로는 완전히 차단됨.

---

## Fix 2: 삭제 규칙 동기화 🟡

세 개 컬렉션의 삭제 규칙이 클라이언트 정책과 어긋나 있어 동기화함.

### 2-1 `comments` 삭제 — 작성자 또는 관리자

**문제 (수정 전)**
- 구버전 rule: `resource.data.uid == request.auth.uid`만 허용 → 관리자도 타인 댓글 삭제 불가
- 클라이언트(`js/comments.js:197`)는 `(currentUid === c.uid) || (currentGrade >= 3)` 사용 → 클라이언트 UI는 관리자에게 삭제 버튼을 보여주지만 서버가 거부하여 동작 불일치

**수정 (수정 후)**
**`firestore.rules:118-120`**
```
allow delete: if isApproved() && (
  resource.data.uid == request.auth.uid || isAdmin()
);
```

**검증**
- 클라이언트(`js/comments.js:197`)와 서버 규칙이 정확히 일치
- 작성자 본인 OR grade>=3 모두 통과

### 2-2 `leaves` 삭제 — 본인 또는 관리자

**문제 (수정 전)**
- 구버전 rule: `if false` → 누구도 삭제 불가 (운영상 문제)

**수정 (수정 후)**
**`firestore.rules:74-76`**
```
allow delete: if isApproved() && (
  resource.data.uid == request.auth.uid || isAdmin()
);
```

**검증**
- `js/hr.js:208,217`에서 leaves 저장 시 `uid: uid` 필드를 명시적으로 추가하므로 `resource.data.uid` 비교 정상 동작
- 본인 연차 취소 + 관리자 정정 양쪽 시나리오 지원

### 2-3 `users` 삭제 — 관리자 전용

**문제 (수정 전)**
- 구버전 rule: `if false` → 회원 삭제 자체가 불가능했음

**수정 (수정 후)**
**`firestore.rules:65`**
```
allow delete: if isAdmin();
```

**검증**
- 관리자(grade>=3)만 회원 삭제 가능
- 일반 사용자가 자기 doc 삭제(탈퇴)는 막혀있음 — 의도된 동작 (탈퇴는 별도 프로세스로 처리)

### 등급
**🟡** — 세 컬렉션 모두 클라이언트 정책에 맞춰 정상 동기화되었으나 다음 caveat 있음:
- `users` 삭제가 관리자 전용으로 닫혀 있어 **사용자 본인이 직접 탈퇴할 수 없음**. 이는 의도일 수도 있고 누락된 기능일 수도 있음 — 소유주 확인 필요 (현재 시스템에 셀프 탈퇴 UI가 없으면 문제 아님).

---

## Fix 3: personalSchedules 작성자 전용 🟢

개인일정은 작성자 본인 외에는 관리자도 수정/삭제 불가 (정책 결정).

### 서버: `firestore.rules:124-130`
```
match /personalSchedules/{doc} {
  allow read: if isApproved();
  allow create: if isApproved();
  allow update: if isApproved() && resource.data.createdBy == request.auth.uid;
  allow delete: if isApproved() && resource.data.createdBy == request.auth.uid;
}
```

**검증**
- `createdBy` 필드는 `js/core.js`의 `stampCreated`에서 `obj.createdBy = user.uid`로 설정되므로 일관성 확인됨
- **관리자 우회 없음** — `isAdmin()` 조건이 명시적으로 포함되지 않아 정책대로 grade>=3도 차단됨

### 클라이언트: `js/work.js`

**`openPersonalDetailModal` (line 1372-1394)**
- line 1379: `isAuthor = !!uid && ps.createdBy === uid` — UID 비교로 작성자 판정
- line 1387-1388: 수정·삭제 버튼을 `isAuthor`일 때만 렌더 (관리자 우회 없음)

**`canDeletePs(ps)` (line 1404-1409)**
```js
function canDeletePs(ps) {
  const uid = firebase.auth().currentUser?.uid
  if (!uid || !ps) return false
  return ps.createdBy === uid
}
```
- 이전에 있었을 `grade >= 3` 우회 분기가 완전히 제거됨

**`canEditPs(ps)` (line 1411-1416)**
- 새로 추가된 함수, `canDeletePs`와 동일한 author-only 로직

**`togglePsEdit()` (line 1418-1441)**
- line 1422: `if (!canEditPs(ps)) { showToast(...); return }` — 수정 모드 진입 자체를 차단

**`deletePersonalSchedule(id)` (line 1712-1728)**
- line 1716: `if (!canDeletePs(ps)) { showToast(...); return }` — UI 우회 호출 차단 (defense-in-depth)

**`savePersonalSchedule()` `_editingPsId` 분기 (line 1674-1683)**
- line 1679: `if (!canEditPs(existing)) { showToast(...); return }` — 저장 직전 한 번 더 검증

### 검증 요약
서버·클라이언트 양쪽 모두 author-only 정책이 일관되게 적용됨. UI 버튼 숨김 + 진입 가드(2곳) + 서버 규칙 = 3중 방어. 콘솔에서 직접 Firestore 호출 시도해도 서버가 거부.

### 남은 위험
- 없음. 다만 향후 "관리자에게 위임 요청" 기능을 추가한다면 별도 처리 필요.

---

## Fix 4: 승인 상태 게이트 (isApproved) 🟢

미승인 사용자가 데이터에 접근하는 경로 차단.

### 변경 요약
- 구 `isAuth()` (auth!=null만 체크)를 그대로 유지하되, 신규 `isApproved()` 헬퍼를 추가 (line 14-18)
- 거의 모든 컬렉션의 read/write 게이트를 `isApproved()`로 교체
- `users/{uid}` self-read는 예외 — pending 사용자도 자기 doc 조회 필요 (`checkApproval()`에서 status 확인)

### 핵심 변경점

**`users/{uid}` (line 46-66)**
- read: `if isAuth() && (request.auth.uid == uid || isApproved())` — 본인은 항상, 다른 사람은 승인된 사용자만
- create: `if isAuth() && request.auth.uid == uid` — 회원가입 시 자기 doc 최초 생성 허용
- update: Fix 1과 동일 (grade/status 보호)
- delete: `if isAdmin()` (Fix 2와 동일)

**다른 컬렉션 일괄 적용**
- `sharedData`, `notifications`, `editLocks`, `watches`, `leaves`, `leaveQuotas`, `attendance`, `activityLogs`, `posts`, `comments`, `personalSchedules`, `backups`, `salaries` — 전부 `isApproved()` 게이트

### 검증

**`js/auth.js:154` `lastLogin` 업데이트 호환성 확인**
```js
const isFreshLogin = _loginInProgress
try { if (isFreshLogin) await docRef.update({ lastLogin: new Date() }) } catch (e) { ... }
```
- 이 update는 `data.status === 'approved'` 검증을 통과한 직후에만 실행됨 (line 140-150)
- 본인 doc 업데이트이고 `grade`/`status` 변경 없으므로 Fix 1의 invariance 조건 통과
- 따라서 정상 동작 보장됨

**첫 사용자 자동 셋업 호환성 확인 (`js/auth.js:119-131`)**
```js
if (isFirstUser) {
  const userData = { ..., grade: 4, status: 'approved', ... }
  await docRef.set(userData)
}
```
- `users` 컬렉션이 비어있을 때만 진입
- create 규칙(line 52): `if isAuth() && request.auth.uid == uid` — uid만 검증, 필드 값 검증 없음 → 통과
- 정상 동작 (시스템 초기화 시 1회만 호출됨)

### 등급
**🟢** — 미승인 사용자의 데이터 접근 경로 완전 차단. pending 사용자가 로그인 화면에서 막히고, 직접 콘솔 호출도 거부됨.

### 남은 위험
- 본 fix 자체에는 없음. 단, 회원가입 create 단계의 필드 검증 부재(UNSURE 참조)는 별개 이슈.

---

## ⚠️ 소유주 확인 필요 사항 (UNSURE)

### U1. 회원가입 시 grade 필드 클라이언트 위조 가능 (Phase A 범위 밖)

**현 상태**: `users/{uid}` create 규칙(`firestore.rules:52`)이 `if isAuth() && request.auth.uid == uid`만 검증하고 **필드 값을 검증하지 않음**.

**시나리오**:
1. 악의적 사용자가 정상 회원가입 폼 대신 브라우저 콘솔에서 직접 호출
   ```js
   await firebase.auth().createUserWithEmailAndPassword('attacker@x.com', 'pw12345!')
   await firebase.firestore().collection('users').doc(currentUid).set({
     uid: currentUid, email: 'attacker@x.com', name: '공격자',
     dept: '경영지원', position: '대표이사',
     grade: 4, status: 'approved',  // ← 임의 값
     createdAt: new Date(), lastLogin: null
   })
   ```
2. 가입 즉시 시스템 관리자로 로그인 가능 (`checkApproval()`은 status==='approved'만 보고 통과시킴)

**우회되는 정상 흐름**: 정상 회원가입(`js/auth.js:312-323`)은 `grade: 1, status: 'pending'`을 강제하지만, **이는 클라이언트 코드일 뿐 서버에서 강제되지 않음**.

**Phase A 영향**: Fix 1(자기 등급 상승 차단)이 update 시점은 완벽히 막지만, **create 시점의 진입 자체는 차단하지 못함**. 즉 "정상 가입 후 등급 상승"은 막혔으나 "처음부터 grade=4로 가입"은 가능.

**제안 (후속 Phase)**: create 규칙에 필드 강제 조건 추가:
```
allow create: if isAuth() && request.auth.uid == uid
  && request.resource.data.grade == 1
  && request.resource.data.status == 'pending';
```
다만 첫 사용자 자동 셋업(`js/auth.js:119-131`, grade:4·status:'approved')과 충돌하므로, 첫 사용자 검출 로직을 서버 규칙에 옮기거나(예: `users` 컬렉션 비어있을 때만 예외 허용), 또는 첫 사용자 셋업을 별도 어드민 콘솔로 분리하는 작업이 필요. Phase A 범위를 넘어가므로 본 보고서에서는 차단하지 않고 명시만 함.

### U2. `users` 셀프 탈퇴 차단 — 의도 확인 필요

Fix 2-3에서 `users` delete 규칙이 `isAdmin()`으로 닫혀 사용자가 자기 계정을 삭제할 수 없게 됨. 현재 시스템에 셀프 탈퇴 UI가 없다면 문제 없으나, 향후 추가 시 별도 규칙 필요 (`allow delete: if isAuth() && request.auth.uid == uid` 추가).

### U3. 직접 Firestore 호출 경로 미감사

본 검증은 코드를 읽어 확인한 결과입니다. 실제 배포 후 다음 시나리오를 콘솔에서 테스트하여 서버 규칙이 거부함을 확인할 것을 권장합니다 (배포 안내 참조).

---

## 배포 안내

본 수정은 `firestore.rules` 파일과 `js/work.js` 클라이언트 코드를 변경했습니다.

**배포 명령** (소유주 수동):
```
firebase deploy --only firestore:rules,hosting
```

**배포 후 즉시 권장 테스트 시나리오**:

1. **자기 등급 상승 차단 확인** (Fix 1)
   - 일반 사용자(grade 1) 로그인 → 콘솔에서:
     ```js
     await firebase.firestore().collection('users').doc(currentUid).update({grade: 4})
     ```
   - 예상: **거부 (permission-denied)**
   - 추가: 같은 사용자가 이름·전화번호 변경은 정상 동작 확인

2. **관리자 댓글 삭제 확인** (Fix 2-1)
   - 관리자(grade 3+) 로그인 → 타인 게시글의 댓글 삭제 시도
   - 예상: 정상 삭제됨

3. **본인 연차 취소 확인** (Fix 2-2)
   - 일반 사용자 → 본인이 신청한 연차 doc 삭제
   - 예상: 정상 삭제됨
   - 추가: 다른 사람 연차 doc 삭제 시도 → 거부

4. **개인일정 작성자 전용 확인** (Fix 3)
   - 관리자(grade 4) 로그인 → 다른 사용자가 작성한 personalSchedules doc 수정/삭제 시도
   - 예상: **UI 버튼 자체가 표시 안 됨**, 콘솔 직접 호출도 거부
   - 추가: 본인 작성 개인일정 수정/삭제는 정상 동작

5. **미승인 사용자 차단 확인** (Fix 4)
   - 신규 가입 직후 (status: 'pending') 사용자가 로그인 시도
   - 예상: 로그인 화면에 "관리자 승인 대기중입니다" 메시지 표시, 앱 진입 불가
   - 콘솔에서 직접 `db.collection('sharedData').get()` 호출 → 거부

**중요**: 5번 테스트 후 admin 계정으로 해당 사용자를 status: 'approved'로 변경하여 정상 로그인 가능함을 확인하세요.

---

## Phase A-2: 회원가입 권한 상승 차단 (U1 후속 조치)

**적용일**: 2026-05-21
**범위**: `firestore.rules` 단일 파일, `users/{uid}` CREATE 규칙

### 등급
🟢

### 문제 (Phase A에서 UNSURE로 남겨둔 U1)
- Phase A의 Fix 1은 UPDATE 시 등급 변경만 차단했고, 회원가입(CREATE) 시 필드 값 검증이 없었음
- 결과: 신규 사용자가 Firebase 콘솔/SDK로 직접 호출하여 자기 doc를 `grade:4, status:'approved'`로 생성 가능
- (수정 전 firestore.rules: `allow create: if isAuth() && request.auth.uid == uid;`)
- 즉, "정상 가입 후 등급 상승"은 Fix 1으로 막혔으나 "처음부터 grade=4로 가입"은 여전히 가능한 상태였음

### 수정 (수정 후)
- 파일: `firestore.rules` (users/{uid} create 블록, 51-60행)
- 핵심 규칙:
  ```
  // 회원가입 시 본인 doc 최초 생성 — 안전한 기본값 강제
  //  - grade는 반드시 1 (담당자, 최저 등급) — 자기 자신을 관리자로 만들 수 없음
  //  - status는 반드시 'pending' — 자기 자신을 승인 처리할 수 없음
  //  ※ 첫 사용자 자동 셋업(auth.js의 grade=4/approved)은 이 규칙에 의해 차단됩니다.
  //    프로덕션에서는 이미 첫 사용자가 존재하므로 영향 없음.
  //    초기 부트스트랩이 필요한 경우 Firebase 콘솔에서 수동으로 첫 관리자 doc 시드 필요.
  allow create: if isAuth()
    && request.auth.uid == uid
    && request.resource.data.grade == 1
    && request.resource.data.status == 'pending';
  ```
- 의미: 회원가입 시 반드시 `grade=1, status='pending'` 으로만 doc 생성 가능. 다른 값으로는 거부됨.

### 검증
1. **firestore.rules 51-60행 재확인** — create 규칙이 `request.resource.data.grade == 1` AND `request.resource.data.status == 'pending'` 강제 + `request.auth.uid == uid` 자기 본인 검증 그대로 유지됨 ✅
2. **GRADE_DEFS 확인** (`js/auth.js:38-44`) — grade 1 = 담당자(최저 등급), 5 = 대표이사. 신규 가입 기본값으로 grade 1이 정책상 정확함 ✅
3. **정상 가입 흐름** (`js/auth.js:310-323`) — `handleSignup`이 Firestore에 set 할 때 `grade: 1, status: 'pending'`을 강제로 작성함. 새 create 규칙과 정확히 일치 → **정상 가입은 영향 없음** ✅
4. **악의적 콘솔 시도** (예: `set({grade:4, status:'approved'})`): Firestore 규칙이 `request.resource.data.grade == 1` 비교에서 실패 → **거부됨 (permission-denied)** ✅
5. **첫 사용자 자동 셋업** (`js/auth.js:119-131`) — 이 코드는 `grade:4, status:'approved'`로 doc.set 시도. 새 규칙에 의해 차단됨. 의도된 부작용 (아래 참조).

### 의도된 부작용
- `js/auth.js:119-131` 첫 사용자 자동 셋업 코드 경로는 `grade:4/approved`을 작성하므로 새 규칙에 의해 차단됨
- 현재 프로덕션에는 이미 사용자들이 존재하므로 이 경로는 동작하지 않음 (effectively dead code)
- 향후 완전 새 환경에 부트스트랩이 필요한 경우, 소유주가 Firebase 콘솔에서 첫 관리자 doc를 수동으로 시드해야 함
- 이는 "악의적 사용자가 첫 사용자인 척 grade=4로 가입"하는 우회 경로를 완전히 차단하는 효과도 함께 가짐 (보안상 오히려 바람직)

### 남은 위험 / 미확인 사항
- 회원가입 페이로드의 다른 필드(`uid`, `email`, `name`, `phone`, `dept`, `position`, `createdAt`, `lastLogin`)는 여전히 임의 값 작성 가능 — 표시용 필드라 권한과 직결되지는 않지만, 향후 필드 화이트리스트 강화 검토 가능
- 예: `position: '대표이사'`로 가입은 가능하나, 등급(grade)이 1이므로 권한상 무력함. UI 표시상의 misleading은 가능 → 후속 Phase에서 검토 가치 있음

### 배포
- `firebase deploy --only firestore:rules` 소유주 수동 진행 예정
- 배포 후 권장 테스트:
  1. 새 계정 정상 가입 → 통과 (pending 상태로 생성됨)
  2. 새 계정에서 Firebase 콘솔로 `grade:4`로 doc 생성 시도 → **거부됨**
  3. 기존 관리자가 새 가입자를 grade:3으로 승격 → 통과 (Phase A Fix 1 update 규칙 경로)

---
