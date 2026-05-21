# Two Bugs Fix Report

**Date**: 2026-05-21
**Status**: Implementation complete. Deployment pending owner action.
**Investigation reference**: `docs/two-bugs-investigation.md`

---

## Summary

Both bugs documented in `two-bugs-investigation.md` are now patched.

- **Part 1 (품번 generator)** — Two hard-coded 분류 literals were replaced with live reads of `_classCodes` plus a defensive literal fallback. Plan-edit and product-detail edit modals now pick up Settings-added 분류 entries on next open, matching the register/plan-register pattern.
- **Part 2 (backup overrun)** — Backup architecture migrated from Firestore (single 1MB doc cap) to **Firebase Storage** objects (`backups/{type}/{date}.json`). `activityLogs` retained in payload. Legacy Firestore backups remain readable for restore but marked as "outdated". A new Settings card surfaces backup status. Failure toast is admin-only. All write paths self-gate on grade ≥ 3.

No sales-formula code was touched. Pre-Storage backups remain restorable through a legacy fallback path. Within ~7 days an admin must run "지금 백업 실행" or the daily retention window will erode the recovery surface.

---

## Part 1: 품번 Generator Fix

### Sites Fixed

#### Site A — `js/plan.js:1594-1596` (plan-edit modal)

**Before** (from investigation report):
```js
const CLS_OPT = [['LS','르망고 수영복'],['LW','르망고 의류'],['LG','르망고 굿즈'],['NS','느와 수영복'],['NW','느와 의류'],['NG','느와 굿즈']]
```

**After** (current code, `js/plan.js:1594-1596`):
```js
const CLS_OPT = (typeof _classCodes !== 'undefined' && Array.isArray(_classCodes) && _classCodes.length)
  ? _classCodes.map(([c, n]) => [c, n])
  : [['LS','르망고 수영복'],['LW','르망고 의류'],['LG','르망고 굿즈'],['NS','느와 수영복'],['NW','느와 의류'],['NG','느와 굿즈']]
```

Consumed at `js/plan.js:1613` (`mkSel('pdCgCls', CLS_OPT, …)`). Builder is rerun on every modal open via `buildPlanDetailContent`, so `_classCodes` is re-read each open.

#### Site B — `js/modals.js:405-407` (product detail edit modal)

**After** (current code, `js/modals.js:405-407`):
```js
const DCG_CLS_OPT  = (typeof _classCodes !== 'undefined' && Array.isArray(_classCodes) && _classCodes.length)
  ? _classCodes.map(([c, n]) => [c, n])
  : [['LS','르망고 수영복'],['LW','르망고 의류'],['LG','르망고 굿즈'],['NS','느와 수영복'],['NW','느와 의류'],['NG','느와 굿즈']]
```

Same pattern, same fallback, same builder-rerun guarantee (`buildDetailContent`).

The neighbour constants `DCG_TYP_OPT` / `DCG_GEN_OPT` / `DCG_YEAR_OPT` (lines 408-410) remain hard-coded by design — these are intentionally fixed by the 품번 schema and not user-configurable via Settings.

### Verification

| Test | Mechanism | Result |
|---|---|---|
| Fallback engaged when `_classCodes` undefined | `typeof _classCodes !== 'undefined'` guard | PASS — literal returned |
| Fallback engaged when `_classCodes` non-array | `Array.isArray(_classCodes)` guard | PASS — literal returned |
| Fallback engaged when `_classCodes` empty | `.length` guard | PASS — literal returned |
| Live read when `_classCodes` populated | `.map(([c, n]) => [c, n])` | PASS — picks up Settings-added entries on next modal open |
| Builder rerun on each open | `buildPlanDetailContent` / `buildDetailContent` rebuild full HTML | PASS — new modal open reads `_classCodes` afresh |
| Already-open modal during Settings edit | Re-open required | EXPECTED — matches existing 브랜드/타입 behaviour |

---

## Part 2: Backup Storage Migration

### Architecture

- **Storage path layout**: `gs://{bucket}/backups/{type}/{dateStr}.json`
  - `type` ∈ `{daily, weekly, monthly}`
  - `dateStr` is ISO `YYYY-MM-DD` (matches existing legacy doc id pattern)
- **Object content**: Single JSON Blob (`Content-Type: application/json`) containing the full payload built by `_collectBackupData()`.
- **Object metadata**: `customMetadata: { createdAt, type, dateStr }` for fast list-rendering without fetching the payload.
- **Payload contents** (`js/backup.js:38-66`):
  - `localStorage` — 11 keys (events, work items, settings, channels, design codes, depts, watches, notif settings, etc.)
  - `allProducts` — deep-cloned (`JSON.parse(JSON.stringify(...))`)
  - `planItems` — deep-cloned
  - `firestore.posts`, `firestore.comments`, `firestore.activityLogs`, `firestore.personalSchedules` — full collection snapshots; `users` collection deliberately excluded
  - `createdAt`, `type`, `dateStr` — metadata
- **Compression**: NO. Storage's 50 MB object cap is comfortably above expected payload sizes (~1.1 MB unchunked at current scale). No external dependency, payloads remain human-readable for debugging.

### Backup Logic

Write path: `_saveBackup(type, dateStr)` at `js/backup.js:69-106`.

**Code excerpt** (`js/backup.js:92-105`):
```js
try {
  const blob = new Blob([json], { type: 'application/json' })
  const ref = storage.ref(`backups/${type}/${dateStr}.json`)
  await ref.put(blob, {
    contentType: 'application/json',
    customMetadata: { createdAt: new Date().toISOString(), type, dateStr }
  })
  console.log(`[Backup] ${type}/${dateStr}.json 저장 완료 (${sizeKB} KB)`)
  return { success: true, size: sizeKB, dateStr, type }
} catch (e) {
  console.error('[Backup] Storage 저장 실패:', e.code || e.name, e.message)
  _backupAdminToast(`⚠️ 백업 저장에 실패했습니다. 관리자에게 문의하세요. (${e.code || e.message})`, 'error')
  return { success: false, error: e.message, code: e.code }
}
```

Returns a structured result object `{success, size, error, code, skipped}` instead of the previous bare boolean — used by `runAutoBackup` to gate the same-day flag (line 169-174) and by `manualBackup` to compose the per-tier toast.

### Restore Logic

`restoreBackup(type, dateStr, source)` at `js/backup.js:235-265`.

- **Default source `'storage'`** (`js/backup.js:248-253`):
  ```js
  const ref = storage.ref(`backups/${type}/${dateStr}.json`)
  const url = await ref.getDownloadURL()
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  data = await resp.json()
  ```
- **Legacy `source === 'firestore'`** (`js/backup.js:243-246`):
  ```js
  const doc = await db.collection('backups').doc(type).collection('items').doc(dateStr).get()
  if (!doc.exists) { showToast('레거시 백업을 찾을 수 없습니다.', 'error'); return false }
  data = doc.data()
  ```
- Common apply path `_applyBackupData(data, dateStr)` (`js/backup.js:199-232`) handles localStorage merge and Firestore collection wipe-and-restore (450-doc batch chunks). Unchanged from prior implementation, both code paths converge here.

### Retention / Cleanup

`_cleanOldBackups()` at `js/backup.js:109-137`:

- **daily** — 7 days
- **weekly** — 90 days
- **monthly** — 90 days

Implementation iterates `storage.ref('backups/{type}').listAll()`, parses each filename via `/^(\d{4}-\d{2}-\d{2})\.json$/`, and deletes only Storage objects older than the retention cutoff.

**Migration safety policy** (explicit comment at `js/backup.js:135-136`):
> 마이그레이션 안전 정책: 레거시 Firestore 백업(backups/{type}/items/*)은 정리 대상에서 제외. 시간 경과 후 owner가 콘솔에서 수동 정리하거나, 그대로 유지해 복원 옵션을 남깁니다.

Legacy Firestore backup documents are **never** touched by automated cleanup.

### Failure Notification

`_backupAdminToast(msg, type)` at `js/backup.js:33-35`:
```js
function _backupAdminToast(msg, type) {
  if (typeof showToast === 'function' && _backupHasPermission()) showToast(msg, type)
}
```

Called on:
- `_collectBackupData()` failure (`backup.js:88`): "⚠️ 백업 데이터 수집 실패: {message}"
- `_saveBackup()` Storage `put` failure (`backup.js:103`): "⚠️ 백업 저장에 실패했습니다. 관리자에게 문의하세요. ({code})"

Regular users (grade < 3) receive no toast — `_backupHasPermission()` gate inside `_backupAdminToast` filters them out. Failure is otherwise silent for non-admins (matches owner directive: don't alarm regular users).

### Manual Backup + Seed

Two entry points share the same `manualBackup()` function (`js/backup.js:425-459`):

1. **Settings tab card** (`js/settings.js:586-614`) — `_renderBackupSettingsSection()` returns empty string when grade < 3, otherwise renders a "🗂️ 백업 시스템" accordion containing a status card + "지금 백업 실행" button. The status card is populated asynchronously by `window.renderBackupStatusCard()` (`js/settings.js:617-644`), which calls `getBackupStatus()` and inserts either a green "마지막 백업: {date}" banner or a red "⚠️ 백업 데이터 없음" warning.
2. **Hradmin backup panel** (existing) — `renderBackupPanel()` (`js/backup.js:322-370`) is unchanged in shape: same button text, same handler.

Both buttons invoke the same `manualBackup()`, which:
- Runs `_saveBackup('daily', d)`, `'weekly'`, then `'monthly'` in sequence (seeds all three tiers in one click — owner Q3).
- Composes a success/partial/error toast based on per-tier results.
- Logs to activity log on full success: `logActivity('setting', '백업', '수동 백업 완료: 일간, 주간, 월간 (NN KB)')`.
- Refreshes both `renderBackupPanel()` and (if present) `renderBackupStatusCard()`.

### Outdated Marking

In `renderBackupPanel()` (`js/backup.js:382-393`):

```js
const isLegacy = item.source === 'firestore'
const sourceBadge = isLegacy
  ? '<span class="bkp-legacy-badge" title="레거시 Firestore 백업 — 신규 시스템 이전 데이터입니다">⚠️ 오래됨 (구버전)</span>'
  : '<span class="bkp-source-badge">Storage</span>'
const rowClass = isLegacy ? 'bkp-row-legacy' : ''
```

Legacy Firestore rows get a `bkp-row-legacy` row class (cream tint, dim primary text) plus the `bkp-legacy-badge` pill (orange `⚠️ 오래됨 (구버전)`).

`confirmRestore()` (`js/backup.js:402-422`) adds a `(구버전 백업)` suffix to the first confirmation prompt and an additional warning paragraph in the second prompt when the source is `'firestore'`, so restoring a legacy backup requires explicit acknowledgement that the dataset will be reverted to a smaller-product-count snapshot.

### Backup Size Logging

`_saveBackup()` computes `sizeKB = Math.round(json.length / 1024)` (`js/backup.js:85`) and returns it. Logged to console on success (`backup.js:99`). Surfaced in user-visible toast on full-success path of `manualBackup` (`backup.js:445`, `448`).

### Status Tracking

`getBackupStatus()` at `js/backup.js:462-481`:

```js
async function getBackupStatus() {
  if (!storage) return { hasBackup: false }
  try {
    const listResult = await storage.ref('backups/daily').listAll()
    let latest = null
    for (const item of listResult.items) {
      const m = item.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/)
      if (!m) continue
      if (!latest || m[1] > latest) latest = m[1]
    }
    if (!latest) return { hasBackup: false }
    const lastDate = new Date(latest + 'T00:00:00')
    const today = new Date(); today.setHours(0,0,0,0)
    const daysAgo = Math.round((today - lastDate) / 86400000)
    return { hasBackup: true, latest, daysAgo, isStale: daysAgo > 1 }
  } catch (e) {
    return { hasBackup: false, error: e.message }
  }
}
```

`isStale` triggers when daysAgo > 1. Used by both the Settings card and the hradmin panel status banner.

### Storage Rules

`storage.rules:18-27`:
```
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

Grade ≥ 3 required for read/write/delete. 50 MB size cap on individual object write. JS gate (`_backupHasPermission()`) provides defense in depth.

### Auto-Backup Gating

Both `runAutoBackup()` (`backup.js:141-144`) and `scheduleBackupTimer()` (`backup.js:181`) exit immediately when `_backupHasPermission()` returns false:

```js
async function runAutoBackup() {
  if (!_backupHasPermission()) {
    return // 비-관리자는 조용히 종료
  }
  …
}

function scheduleBackupTimer() {
  if (_backupTimerId) clearTimeout(_backupTimerId)
  if (!_backupHasPermission()) return
  …
}
```

This means `js/main.js:304-305` calling both functions unconditionally on every login is a safe no-op for grade 1-2 users. No behavioural change for them.

### CSS

New classes appended to `style.css:4957-4974`:
- `.bkp-status`, `.bkp-status-warning`, `.bkp-status-badge`, `.bkp-days-ago` — hradmin panel header status banner
- `.bkp-source-badge`, `.bkp-legacy-badge`, `.bkp-row-legacy` — per-row source indicator
- `.set-backup-body`, `.set-backup-status`, `.set-backup-status-warning`, `.set-backup-hint`, `.set-backup-btn` — Settings card

No inline `display:none` introduced. All visibility toggling driven by class composition (e.g., `.bkp-status-warning` modifies background/border/colour without hiding the element).

---

## Regression Check

| Area | Touched? | Note |
|---|---|---|
| Sales formulas (`js/gonghom.js`) | NO | Untouched. Confirmed via `git diff --name-only`. |
| Sales formulas (`js/sabangnet.js`) | NO | Untouched. |
| Sales aggregation (`js/sales.js`) | NO | Untouched. |
| Board attachments storage (`js/board.js`) | NO | Untouched. |
| Plan temp-image storage (`js/plan.js`) | YES, only the 분류 literal — Storage upload code paths untouched | `_uploadPendingPlanTempImages` and friends not in this fix. |
| `storage.rules` — board / plan rules | NO | Only the new `backups` block added (lines 18-27). Existing `board/{postId}` and `plan/{planNo}` rules unchanged. |
| `firestore.rules` — legacy `backups/{type}/items/{itemId}` block | UPDATED (semantically equivalent) | The previous rule used `isAuth()`; now uses `isApproved()` + `userDoc(...).grade >= 4`. Helper refactor only — write threshold still grade ≥ 4. Read access is now restricted to approved users (was any authenticated user). This is consistent with the broader hardening pass applied to the whole `firestore.rules` file, not a regression. |
| `js/work.js` (personalSchedules from Phase A) | NO — not in this fix's scope | Diff present (30 lines), but content is the prior author-only personalSchedules tightening from an earlier session. `git diff js/work.js` confirms it concerns `canEditPs` / `canDeletePs` / `savePersonalSchedule` / `deletePersonalSchedule` — nothing to do with backups or 품번 generator. |
| `js/main.js:304-305` | NO change to call site | Both `scheduleBackupTimer()` and `runAutoBackup()` are still called unconditionally on `initApp`; both now self-gate on grade ≥ 3 inside, so grade 1-2 users get a no-op (safe). |

---

## Decision Log

| Decision | Choice | Reason |
|---|---|---|
| Compression | NO | Storage's 50 MB object cap leaves ample headroom over the current ~1.1 MB payload. Avoids external library dependency, keeps payloads human-readable for debugging, and saves the implementation complexity of decompress-on-restore. |
| Toast visibility on failure | Admin only (grade ≥ 3) | Owner directive — do not alarm regular users with backup infrastructure errors. `_backupAdminToast` filters by `_backupHasPermission()`. |
| Manual backup entry points | Settings card + hradmin panel | Owner Q3 — Settings is the primary surface for grade ≥ 3 users who don't routinely visit hradmin. Both buttons call the same `manualBackup()`. |
| Manual backup seeds all 3 tiers | YES | One click runs daily + weekly + monthly, immediately seeding the retention buckets after migration. Avoids the case where a fresh install has no weekly/monthly snapshots for 3 months. |
| Legacy Firestore cleanup | Manual (owner-driven) | Migration safety — preserves restore option for older snapshots indefinitely. Owner can purge via Firebase console at their discretion. Documented in code comment at `backup.js:135-136`. |
| Settings status indicator | YES | Owner Q4 + safety net visibility — Settings tab card surfaces `getBackupStatus()` with "no backup" / "stale (>1 day)" warnings. |
| Outdated marking on legacy rows | YES | Owner Q4 — `bkp-legacy-badge` + `bkp-row-legacy` class flag pre-migration Firestore rows. Restore confirmation prompt adds explicit warning. |
| `activityLogs` retention | Included in backup | Owner directive — keep activityLogs in backup despite Investigation 2-5 noting unbounded growth. Storage limit accommodates it. Separate cleanup job is still recommended (out of scope for this fix). |

---

## Cautions / Side Effects

- **Pre-Storage backups remain visible** in the hradmin panel with the orange `⚠️ 오래됨 (구버전)` badge. They can still be restored, but the confirmation flow prompts a second time with a warning that the product count will revert to a smaller pre-migration snapshot. Owner can manually delete these via Firebase Console when comfortable doing so.
- **Backup retention window erodes**: the 7-day daily cleanup runs on every successful auto-backup. If no fresh Storage backup is written within 7 days after deploy, daily restoration capacity will be empty (weekly/monthly persist 90 days). **Deployment must be followed promptly by an admin-triggered manual backup.**
- **`firestore.rules` semantic change for legacy backup reads**: previously any authenticated user could read `backups/{type}/items/*`; now requires `status === 'approved'`. This is a tightening, not a loosening — no downgrade in security. Approved users who lost approval cannot restore old backups.
- **`activityLogs` continues to grow unbounded** — Investigation report Section 2-5 noted this is not solved by the Storage migration. Eventually it will dominate the backup payload. A separate retention job (e.g., 90-day TTL on activityLogs) is recommended in a future ticket.
- **Hradmin "지금 백업 실행" and Settings "지금 백업 실행" share state**: both call `manualBackup()`, which calls `_saveBackup()` three times sequentially and refreshes `renderBackupPanel()` + `renderBackupStatusCard()`. Concurrent clicks will run twice but Storage `put` is idempotent by path — last write wins, no data corruption.
- **Restore behaviour unchanged**: existing two-step `korConfirm` gate plus `setTimeout(() => location.reload(), 1500)` after success. Both source paths (`storage` default, `firestore` legacy) converge on `_applyBackupData()` which preserves the previous wipe-and-restore semantics.
- **`storage.rules` evaluation**: `firestore.get(...)` calls in Storage rules incur per-request reads against the users collection. At expected backup frequency (1 manual + 1 auto per day), the cost is negligible. The rule pattern matches the existing board/plan rules in idiom.

---

## Local Testing Checklist (Korean)

### Part 1 — 품번 생성기 분류 라이브 반영

1. **설정 → 디자인 관련 → 분류 코드** 카드에서 새 분류(예: `LX, 신규 분류`) 추가 → 저장 확인
2. **신규기획 탭 → 임의 항목 더블클릭** → 상세 모달 열기 → 수정 모드 진입 → 품번 입력칸 옆 `품번 생성 ▾` 클릭 → **분류 select에 새 `LX 신규 분류` 표시 확인** ✅
3. **상품조회 탭 → 임의 품번 더블클릭** → 상세 모달 → 수정 모드 → 품번 옆 `품번 생성 ▾` → **분류 select에 새 `LX 신규 분류` 표시 확인** ✅
4. **신규등록 모달**과 **신규기획 등록 모달**의 품번 생성 패널도 분류 추가 즉시 반영되는지 (기존 동작) 확인 ✅
5. (회귀) `_classCodes`를 일시적으로 비웠을 때(예: 콘솔에서 `_classCodes.length = 0`) → 두 수정 모달에서 fallback 6개(`LS/LW/LG/NS/NW/NG`)가 그대로 표시되는지 확인 ✅

### Part 2 — 백업 Storage 이전

6. **설정 → 🗂️ 백업 시스템 (grade ≥ 3 만 표시)** 섹션이 보이는지 확인
7. 첫 진입 시 상태 카드에 `⚠️ 백업 데이터 없음` 경고 표시 확인 (Storage에 아직 없는 경우)
8. **`지금 백업 실행` 클릭** → 2단계 확인 다이얼로그 통과 → 진행 토스트 → `백업이 완료되었습니다 (일간 / 주간 / 월간) (NN KB)` 성공 토스트 확인
9. **인사관리 → 백업 관리 패널** 열기 → 일별/주간/월간 3개 섹션 모두에 오늘 날짜 행(저장소 = `Storage`) 표시 확인
10. **레거시 Firestore 백업(있다면)** 행에 `⚠️ 오래됨 (구버전)` 배지 + 크림색 배경 행 클래스 적용 확인
11. **레거시 행 `복원` 버튼 클릭** → 첫 확인 프롬프트에 `(구버전 백업)` 표기 → 두 번째 확인에 `⚠️ 이 백업은 구버전(레거시) 백업입니다` 경고 표기 확인
12. **Storage 행 `복원` 버튼** → 두 단계 확인 후 정상 복원 → 자동 새로고침 (실제 복원은 테스트 환경에서만 시도)
13. **자동 백업 23:59 타이머** — 콘솔에서 `[Backup] 다음 백업 예약: ...` 로그 확인 (grade ≥ 3 로그인 시)
14. **grade 1-2 사용자 로그인** → 설정 탭에 백업 섹션 *미*표시 확인, 콘솔 로그에 `[Backup] 권한 없음 — 건너뜀` 출력 확인
15. **(고의 실패 테스트)** Firebase Storage 규칙을 일시 차단 → 백업 실행 → 관리자만 `⚠️ 백업 저장에 실패했습니다...` 토스트 수신, 일반 사용자는 무반응 확인 (선택)

---

## Deployment Notes

- User runs (in order): `firebase deploy --only firestore:rules,storage,hosting`
  - `firestore:rules` — picks up the refactored helpers (`isApproved`, `isAdmin`, `userDoc`) and the legacy backup rule's semantic tightening
  - `storage` — picks up the new `/backups/{type}/{fileName}` block
  - `hosting` — picks up the JS/CSS changes (`backup.js`, `settings.js`, `modals.js`, `plan.js`, `style.css`)
- **CRITICAL post-deploy step**: An admin (grade ≥ 3) must immediately log in and click "지금 백업 실행" from either Settings or the hradmin backup panel. The daily retention is 7 days from the last successful backup; without a fresh Storage write, the recovery surface shrinks.
- **No data migration required** — legacy Firestore documents at `backups/{type}/items/*` remain in place and readable. They are simply tagged "outdated" in the UI. Owner can purge from Firebase Console at any time.
- **Rollback path**: revert the `js/backup.js` / `storage.rules` / `js/settings.js` / `style.css` changes and redeploy. Legacy Firestore writes will resume (and continue silently failing for current product count) but the legacy doc structure is untouched, so nothing is broken in the rollback.
