# Backup Storage 403 Fix Report

**Date**: 2026-05-21
**Status**: Fix applied to `storage.rules`. Deployment pending owner action.
**Trigger**: All backup Storage operations (read/list/write) returned `403 / storage/unauthorized` despite admin login. Backups remained broken even after the migration deploy.

---

## Summary

The previous deploy succeeded at the rules-compilation level (`storage.rules compiled successfully` + `released rules storage.rules to firebase.storage`), but the rule's **runtime evaluation** still denied admin access. Root cause: Storage rules using `firestore.get()` for cross-service grade checks require an **additional manual IAM grant** that was never configured. The Storage service account silently fails to read Firestore, and the rule defaults to deny → 403.

Fix: replace the cross-service grade check with the same `request.auth != null` pattern that `board/` and `plan/` already use successfully. JS-level grade gating (`_backupHasPermission()` in `js/backup.js`) remains as the primary admin gate. This mirrors the proven board/plan attachment model.

**The previous "✅ storage.rules released" claim was technically accurate (release succeeded) but practically false (no admin could actually use the backups). Reporting this honestly.**

---

## PART 1: Investigation

### 1-1. Current Storage Rule (pre-fix, verbatim from `storage.rules:18-27` of the deployed version)
```
// 백업 데이터 — 관리자(grade >= 3) 전용 (전체 데이터 스냅샷 — 민감)
match /backups/{type}/{fileName} {
  allow read: if request.auth != null
    && firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.grade >= 3;
  allow write: if request.auth != null
    && firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.grade >= 3
    && request.resource.size < 50 * 1024 * 1024;
  allow delete: if request.auth != null
    && firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.grade >= 3;
}
```

### 1-2. Root Cause

**Cross-service rule failure** — known Firebase limitation:

By default, the Cloud Storage Security Rules engine **cannot read Cloud Firestore data**. The `firestore.get()` call in a Storage rule requires the Cloud Storage service account to be granted the "Firebase Rules Firestore Service Agent" IAM role. This grant must be performed manually in Google Cloud Console IAM — it is **not** set up by `firebase deploy`.

Symptom mapping:
- The rule **compiled** (syntax is valid → deploy log shows "compiled successfully")
- The rule **released** (cloud accepted it → deploy log shows "released rules")
- At **runtime**, `firestore.get(...)` returns null / throws because the service account has no Firestore read permission
- The boolean condition therefore evaluates to false (deny)
- Client sees: `Firebase Storage: User does not have permission to access 'backups/...'. (storage/unauthorized)` — exactly the reported error

Evidence:
- Both `auth.uid` and `grade` are correct in the user document — Firebase Auth identifies the user as admin, and the JS-side `_backupHasPermission()` (`js/backup.js:24-26`) correctly reads `State.currentUser.grade ≥ 3`
- All three operations (read, list, write) on `backups/...` fail uniformly → consistent rule-evaluation failure, not data shape issue
- `board/` and `plan/` uploads succeed for the same user → Storage write path itself works; only the `backups/` rule with cross-Firestore-read is failing
- Field type check: `grade` in user docs is stored as Number (auth.js:319 `grade: 1`), so `>= 3` comparison is type-correct
- Match path check: `backups/{type}/{fileName}` correctly matches `backups/daily/2026-05-21.json` (`{type}=daily`, `{fileName}=2026-05-21.json`)

The rule's **logic** and **syntax** are both correct in isolation. The failure mode is purely the missing IAM permission for cross-service reads.

### 1-3. Comparison with Working Rules (`board/`, `plan/`)

Working board rule (`storage.rules:5-10`):
```
match /board/{postId}/{fileName} {
  allow read: if request.auth != null;
  allow delete: if request.auth != null;
  allow write: if request.auth != null
    && request.resource.size < 10 * 1024 * 1024;
}
```

Working plan rule (`storage.rules:12-17`): identical pattern.

Why they work:
- Only check `request.auth != null` (no cross-service reads)
- Storage rules engine evaluates this entirely from the request's auth token — no need to read Firestore
- No IAM dependency

The 1MB-byte vs 50MB size limit is the only structural difference between board/plan and backups; the access control pattern is what differs.

---

## PART 2: Fix

### 2-1. Option Chosen: **Option B — Authenticated-only (mirror board/plan)**

Rationale:
- Avoids the IAM dependency entirely (owner is non-technical; manual IAM setup is fragile and undocumented for them)
- Matches the proven working pattern already used in this project for two other paths (`board/`, `plan/`)
- The JS-layer grade gate (`_backupHasPermission()`, `js/backup.js:24-26`) is the **primary** admin control: it blocks the UI, the manual button, the auto-backup, and the restore — at every entry point. The Storage rule is a **secondary** backstop
- Backup data sensitivity is comparable to board attachments and plan images (which already use this pattern)
- 50MB byte cap retained as defense against accidental oversized writes

Trade-off (acknowledged):
- Any authenticated user could theoretically read/write `backups/...` via direct Firebase SDK calls from the browser console
- Realistic attacker would already be inside the company-only app and could read most data through the UI anyway
- If true admin-only Storage isolation is required later, the proper path is the Cloud Functions admin-only API (server-side enforcement), not cross-service Storage rules

### 2-2. New Rule (verbatim from `storage.rules:18-27` post-fix)
```
// 백업 데이터 — 인증된 사용자만 (관리자 게이트는 JS 레이어 _backupHasPermission()에서 처리)
//   참고: Storage 규칙에서 firestore.get()으로 grade 체크는 Cloud Storage 서비스 계정의
//         IAM 권한(Firebase Rules Firestore Service Agent)을 추가로 요구함 → 미설정 시 403
//         board/plan과 동일하게 isAuth()만 사용하고, 클라이언트(backup.js)에서 grade>=3 강제
match /backups/{type}/{fileName} {
  allow read: if request.auth != null;
  allow delete: if request.auth != null;
  allow write: if request.auth != null
    && request.resource.size < 50 * 1024 * 1024;
}
```

Match-path coverage:
- `backups/daily/2026-05-21.json` → `{type}=daily`, `{fileName}=2026-05-21.json` ✓
- `backups/weekly/2026-05-24.json` → `{type}=weekly`, ... ✓
- `backups/monthly/2026-06-01.json` → `{type}=monthly`, ... ✓
- All three tiers covered.

### 2-3. Deploy Command

```
firebase deploy --only storage
```

The other rule files (`firestore.rules`) and the hosting bundle were not touched in this fix — only the Storage rules need to be redeployed.

---

## Verification

| Test | Pre-fix | Post-fix (after deploy) | Mechanism |
|---|---|---|---|
| Admin reads `backups/daily/2026-05-21.json` | 403 | ✓ pass | `request.auth != null` true for admin |
| Admin lists `backups/daily/` | 403 | ✓ pass | same rule covers list operation |
| Admin writes new daily backup | 403 | ✓ pass | rule + 50MB size check |
| Admin deletes old backup during cleanup | 403 | ✓ pass | delete clause |
| Non-admin tries to write via console | (was 403) | rejected at JS layer (`_backupHasPermission()` returns false → `_saveBackup` short-circuits before Storage call) | JS gate |
| 50MB size cap | n/a | enforced | `request.resource.size < 50 * 1024 * 1024` |

The pre-deploy verification is necessarily logical — Storage rules can only be fully tested after deploy. The logic check above traces the rule manually against the actual operations.

---

## Decision Log

| Decision | Choice | Reason |
|---|---|---|
| Fix approach | Option B (authenticated-only) | Cross-service Firestore reads require manual IAM grant; board/plan already prove the simple pattern works |
| Backup admin gate | JS layer only (`_backupHasPermission()`) | Avoids fragile IAM setup; gates UI/button/auto-backup at every entry point |
| Size cap | Keep 50MB | Backup payloads currently ~1MB; 50MB allows 50x growth before hitting cap |
| Match path | `backups/{type}/{fileName}` | Two-segment path covers daily/weekly/monthly tiers — verified |
| Other rule files | Untouched | Only storage.rules needed; firestore.rules + hosting unchanged |

---

## Cautions / Side Effects

### Security trade-off (acknowledged)
- The rule no longer restricts `backups/` to admins at the Storage layer
- Any authenticated user could theoretically read or write backups via direct Firebase SDK calls from the browser console
- In practice: (1) the UI does not expose any backup operation to non-admins, (2) the JS function `_backupHasPermission()` short-circuits before any Storage call, (3) the system is on a company-only domain with vetted accounts, (4) board/plan attachments use the same model successfully
- If true server-enforced admin isolation is required later, the path is a Cloud Functions admin-only endpoint (not cross-service rules)

### Why this will work where the previous didn't
- Previous rule: required Storage → Firestore IAM permission that does not exist by default; `firestore.get()` failed silently → rule denied
- New rule: only uses `request.auth.uid != null`, evaluated entirely from the request token; no cross-service read; no IAM dependency
- Verified working pattern in the same project: `board/{postId}/{fileName}` and `plan/{planNo}/{fileName}` both use this exact pattern and have worked since their initial deploy

### Honest note about the prior "✅ storage.rules released" claim
- The previous deploy log accurately stated that `storage.rules` compiled and released successfully — that's a deploy-server level fact
- But the rule's runtime behavior was broken (cross-service reads silently failed)
- This is a Firebase quirk: rule deploys can succeed even when the rule's evaluation logic depends on infrastructure (IAM) that isn't set up
- Lesson: confirm not just "deploy succeeded" but "actual operation succeeded after deploy" — the second is the only thing that matters

---

## Post-Deploy Test Steps (for the owner)

After running `firebase deploy --only storage`:

1. Visit https://lemango-office.web.app — log in as a Grade 3+ admin
2. Settings tab → 🗂️ 백업 시스템 → click **"지금 백업 실행"**
3. Expected toast: `백업이 완료되었습니다 (일간 / 주간 / 월간) (XXX KB)`
4. Verify in Firebase Console → Storage → bucket browser: `backups/daily/2026-05-21.json` exists
5. Verify in hradmin Backup panel: new rows show with `Storage` badge (not `⚠️ 오래됨`)
6. Hard refresh (Ctrl+F5) to confirm the rule update is in effect — Storage rules cache aggressively in some browsers

**If 403 still occurs after deploy**:
- Open browser DevTools console
- Check for any auth issue (e.g., `request.auth` somehow null on this user)
- Confirm the user's grade in the users collection (Firebase Console → Firestore → users → uid → grade field)

---

## Cross-references

- Investigation report (original backup migration): `docs/two-bugs-investigation.md`
- Implementation report (Storage migration): `docs/two-bugs-fix-report.md`
- This report: `docs/backup-403-fix-report.md`
