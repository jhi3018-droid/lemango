# Two Bugs Investigation Report

**Date**: 2026-05-21
**Status**: Investigation only — no code changes, no deployment
**Scope**: (1) Product code generator — categories missing in edit mode. (2) Daily backup exceeds Firestore 1 MiB document limit.

---

## Summary

- **Issue 1**: Two edit-mode 품번 generator panels (plan-edit + product-detail) build their 분류 `<select>` from a **hard-coded 6-entry literal** instead of reading `_classCodes`. The user-reported case is plan-edit (`js/plan.js:1594`); a second, **previously unreported** sibling bug exists in the product detail modal (`js/modals.js:405`). All other modal dropdowns are wired correctly. **Ready to implement** — 2 file:line sites, one-line change each.
- **Issue 2**: Daily/weekly/monthly backups write all collections into a **single Firestore document** at `backups/{type}/items/{dateStr}`. `State.allProducts` alone now serializes to **976,432 bytes** (~93% of the 1 MiB limit). The 2026-04-13 CSV import (45 → 798 products) pushed total payload over the ceiling. **Backups are silently failing**; live production data is safe but the safety net is shrinking. **Owner decision required** on architecture before fix can be implemented.

---

## PART 1: 품번 Generator Edit Mode Bug

### 1-1. Generator Functions

There are **four separate** generator panels in the project, each with its own handler set:

| Modal | Toggle | Update | Apply | File:line |
|---|---|---|---|---|
| 신규등록 (registerModal) | `togglePcodePanel()` | `updateProductCode()` | `applyGeneratedCode()` | `js/product-code.js:244 / :255 / :298` |
| 신규기획 등록 (planRegisterModal) | `togglePlPcodePanel()` | `updatePlProductCode()` | `applyPlGeneratedCode()` | `js/plan.js:430 / :547 / :587` |
| **신규기획 수정 (planDetailModal)** | `togglePdCodeGenPanel()` | `updatePdProductCode()` | `applyPdGeneratedCode()` | `js/plan.js:1003 / :1042 / :1089` |
| **상품 상세 수정 (detailModal)** | `toggleDetailCodeGenPanel()` | `updateDetailProductCode()` | `applyDetailGeneratedCode()` | `js/modals.js:1476 / :1517 / :1559` |

Plan-register and plan-edit are **different functions in different DOM scopes**. The button the user clicks in 수정 mode is `togglePdCodeGenPanel()` (rendered at `js/plan.js:1607`).

The user only reported plan-edit, but **product-detail edit has the identical bug** (both share the same hard-coded literal pattern).

### 1-2. Category Data Source Comparison

| Mode | Element | Source | Live / cached | file:line |
|---|---|---|---|---|
| 신규등록 (register) | `<select id="pcClass">` static in HTML | `_classCodes` via `populateAllSelects()` | **Live** — refreshed after every Settings CRUD | `index.html:1086` → populated at `js/core.js:1115-1118`; refresh calls at `js/settings.js:1149, 1179, 1191` |
| 신규기획 등록 (plan register) | `<select id="plPcClass">` static in HTML | `_classCodes` via `populateAllSelects()` | **Live** — same path as 신규등록 | `index.html:1609` → `js/core.js:1118` |
| **신규기획 수정 (plan edit)** | `<select id="pdCgCls">` built inside HTML string by `mkSel(...)` | **Hard-coded** `CLS_OPT` literal | **Cached** — never reads `_classCodes` | `js/plan.js:1594` (literal); consumed at `js/plan.js:1611` |
| **상품 상세 수정 (detail)** | `<select id="dCgCls">` built inside HTML string by `dcgMkSel(...)` | **Hard-coded** `DCG_CLS_OPT` literal | **Cached** — never reads `_classCodes` | `js/modals.js:405` (literal); consumed at `js/modals.js:440` |

**The bug** (`js/plan.js:1594`):
```js
const CLS_OPT = [['LS','르망고 수영복'],['LW','르망고 의류'],['LG','르망고 굿즈'],['NS','느와 수영복'],['NW','느와 의류'],['NG','느와 굿즈']]
```

**The working pattern** (`js/core.js:1115-1118`):
```js
if (typeof _classCodes !== 'undefined' && Array.isArray(_classCodes)) {
  const _classItems = _classCodes.map(([code, name]) => [code, code + ' - ' + name])
  populateSelect('pcClass',   _classItems)
  populateSelect('plPcClass', _classItems)
}
```

The register `<select>` exists in static HTML at `index.html:1086`, so `populateAllSelects()` can populate it on Settings change. The edit-mode `<select id="pdCgCls">` only exists *inside an HTML string returned by `buildPlanDetailContent`*, so `populateAllSelects()` never sees it; and the builder hard-codes the array literal instead of consulting `_classCodes`.

Same shape in detail modal (`js/modals.js:405`):
```js
const DCG_CLS_OPT  = [['LS','르망고 수영복'], … ]
```

Note: `DCG_TYP_OPT` / `DCG_GEN_OPT` / `DCG_YEAR_OPT` (lines 406–408) are also hard-coded but those values are **intentionally fixed by the 품번 schema** (not user-configurable via Settings). Only `CLS_OPT` / `DCG_CLS_OPT` is the bug.

### 1-3. Root Cause

The plan-edit and detail-modal 품번 panels build their 분류 `<select>` from a **hard-coded 6-entry literal** (`CLS_OPT` at `js/plan.js:1594`; `DCG_CLS_OPT` at `js/modals.js:405`) instead of mapping `_classCodes`. The register panels read live via `populateAllSelects()`. New 분류 entries added through Settings live only in `_classCodes` and never make it to the edit panels.

### 1-4. Proposed Fix (NOT IMPLEMENTED)

Two one-line changes. Replace each hard-coded literal with a live read from `_classCodes`, keeping the existing literal as a defensive fallback.

1. `js/plan.js:1594`:
   ```js
   const CLS_OPT = (typeof _classCodes !== 'undefined' && Array.isArray(_classCodes) && _classCodes.length)
     ? _classCodes.map(([c, n]) => [c, n])
     : [['LS','르망고 수영복'],['LW','르망고 의류'],['LG','르망고 굿즈'],['NS','느와 수영복'],['NW','느와 의류'],['NG','느와 굿즈']]
   ```

2. `js/modals.js:405`: same shape for `DCG_CLS_OPT`.

Both builders (`buildPlanDetailContent`, `buildDetailContent`) already rebuild their full HTML each modal open and already read `_settings.types` / `_settings.brands` live at the same scope. No additional refresh hook is needed: open → see latest list. (If the modal is already open while Settings is edited, user must close+reopen — matches existing behavior for 브랜드/타입.)

### 1-5. Broader Dropdown Survey

Definition: "Edit OK" = the dropdown shows entries added via Settings after closing and re-opening the modal.

| Dropdown | Register OK | Edit OK | Source (edit modal) | Notes |
|---|---|---|---|---|
| **분류 (품번 생성, plan)** | YES | **NO** | Hard-coded `CLS_OPT` `js/plan.js:1594` | **Bug — user reported** |
| **분류 (품번 생성, product detail)** | YES | **NO** | Hard-coded `DCG_CLS_OPT` `js/modals.js:405` | **Bug — same pattern, not previously reported** |
| 디자인번호 | YES | YES | Live `_designCodes` — `js/product-code.js:208`, `js/plan.js:1019`, `js/modals.js:1489` | OK |
| 백스타일 | YES | YES | Same source as 디자인번호 | OK |
| 성별 / 타입 / 연도 (in generator) | n/a | n/a | Hard-coded `GEN_OPT` / `TYP_OPT` / `YEAR_OPT` | **Intentional** — 품번 schema constants |
| Color master picker | YES | YES | `_cpRender` reads `_colorMasters` live on each open `js/color-master.js:400` | OK |
| 상품 타입 (모달 select) | YES | YES | `_settings.types` read live `js/modals.js:524`, `js/plan.js:1574` | OK |
| 브랜드 | YES | YES | `_settings.brands` read live `js/modals.js:531`, `js/plan.js:1573` | OK |
| 가슴선 / 비침 / 안감 / 캡고리 / 다리파임 / 원단타입 / 가이드 | YES | YES | `_settings.*` via `mkOptsCur` `js/plan.js:1581-1586` | OK |
| 판매 채널 | YES | YES | `_channels` / `_platforms` via `populateAllSelects` + `saveChannels` | OK |
| 업무 카테고리 | YES | YES | `_workCategories` via `populateAllSelects` `js/core.js:1123-1124` | OK |
| 부서 (signup/회원수정/프로필) | YES | YES | `_depts` via `populateAllSelects` `js/core.js:1126-1129` | OK |
| 직급 (POSITIONS) | YES | YES | Constant via `populateAllSelects` | OK by design |
| 기획 일정 단계 | YES | YES | `getPlanPhases()` live read | OK |

**Total affected**: **2 sites** — both in modal HTML-string builders, both use the same hard-coded-literal pattern.

---

## PART 2: Backup 1MB Limit

### 2-1. Backup Code Location

| Function | File:line |
|---|---|
| Main scheduler | `runAutoBackup()` `js/backup.js:116` |
| Single backup write | `_saveBackup(type, dateStr)` `js/backup.js:51` |
| Payload builder | `_collectBackupData()` `js/backup.js:20` |
| Manual entry | `window.manualBackup` `js/backup.js:299` |

**Write path**: `backups/{type}/items/{dateStr}` — **single `.set()` to one document**. `type` ∈ `{daily, weekly, monthly}`. All three tiers share the same write path and the same payload.

Actual write call (`js/backup.js:58-65`):
```js
try {
  await db.collection('backups').doc(type).collection('items').doc(docId).set(data)
  console.log(`[Backup] ${type}/${docId} 저장 완료`)
  return true
} catch (e) {
  console.error('[Backup] 저장 실패:', e.message)
  return false
}
```

### 2-2. Payload Analysis

The payload built by `_collectBackupData()` (`js/backup.js:20-48`) merges localStorage + State + Firestore collections into one object:

| Key | Source | Estimated size | Notes |
|---|---|---|---|
| `allProducts` | `State.allProducts` deep-cloned via `JSON.parse(JSON.stringify(...))` | **~976 KB** | Measured: 798 items × avg 1,247 bytes = **976,432 bytes**. Disk: `products_lemango.json` 1.2MB + `products_noir.json` 292KB |
| `firestore.activityLogs` | Entire `activityLogs` collection | ~50–500 KB | 100+ `logActivity()` call sites since 2026-04-06. **No retention policy** — grows monotonically. |
| `firestore.posts` | Entire `posts` collection | ~10–100 KB | Attachments live in Storage, so docs stay small |
| `firestore.comments` | Entire `comments` collection | ~5–50 KB | Text only |
| `firestore.personalSchedules` | Entire `personalSchedules` collection | ~5–30 KB | Small per-item |
| `planItems` | `State.planItems` deep-cloned | ~5–50 KB | — |
| `localStorage` | 11 keys (events, work items, settings, channels, design/class codes, watches, etc.) | ~5–30 KB | Pre-stringified values |
| `createdAt`, `type`, `dateStr` | Metadata | < 100 bytes | — |

**Single biggest contributor**: `allProducts` at ~976 KB (93% of the 1 MiB limit). Add `activityLogs` + everything else (~140 KB) and total = ~1.06 MB → matches the reported overage (1,123,317 bytes).

Direct measurement:
- `JSON.stringify([...lem, ...noir]).length` → **976,432 bytes** for products alone.
- Largest single product: 1,592 bytes; average: 1,247 bytes; 633 르망고 + 165 느와 = 798 items.

**Architectural irony**: live products are already chunked at 150 items/doc in `sharedData/products_0…N` (`js/core.js:4, 89-107`). The backup payload **re-flattens everything into one doc**, undoing the chunking precisely where the 1MB limit applies.

### 2-3. Risk Assessment

- **Backups failing silently**: `_saveBackup()` catches the write error and only `console.error`s (`js/backup.js:58-65`). No toast, no notification, no admin alert.
- **`runAutoBackup()` ignores the return value** (`js/backup.js:124-141`). It proceeds through daily → weekly → monthly → `_cleanOldBackups()` regardless, then unconditionally writes `localStorage['lemango_last_backup_date_v1'] = dateStr`. The same-day guard is date-based, so tomorrow's run still retries — **one small mercy**.
- **Weekly and monthly are equally broken**. Sunday 2026-05-24 (weekly) and 2026-06-01 (monthly) will silently fail with the same payload and write path.
- **Retention erodes the safety net**: `_cleanOldBackups()` (`js/backup.js:69-113`) deletes docs older than 7 days (daily) / 90 days (weekly/monthly). Pre-CSV-import backups will not be actively destroyed by *current* failures, but they will age out. Daily backups older than 7 days are deleted while no new ones are created → **within roughly 7 days, the daily retention window erodes to zero recoverable backup**.
- **Live data is safe**: production writes (`saveProducts()` / `_forceUploadProducts()`) hit the separate chunked path `sharedData/products_0…N` and are unaffected.
- **Restore caveat**: `restoreBackup()` (`js/backup.js:165-212`) works correctly. The risk is human — restoring an old (pre-CSV-import) backup would wipe today's 798 products and revert to whatever count existed in that snapshot. The existing two-step `korConfirm` (`js/backup.js:281-296`) mitigates accidental triggering.

**Bottom line**: backups have been silently failing since the product count crossed ~750 items (some point between 2026-04-13 import and now). **Within ~7 days of continuous failure, the office has no recoverable backup at all.**

### 2-4. Solution Options

| Option | Effort | Restore Complexity | Scalability | Transition Risk |
|---|---|---|---|---|
| **A. Split into sibling docs** (`backups/daily/{date}/{collection}`) | Low | Low | Each sub-doc still bound by 1MB → products alone hits ceiling at ~840 items | Low |
| **B. Compress payload (LZ-string)** | Low–Medium | Low (decompress on read) | ~5–10x headroom → defers ceiling to ~4,000–8,000 products | Adds ~14 KB lib; still bounded by 1MB doc cap |
| **C. Firebase Storage object** (`backups/{type}/{date}.json[.gz]`) | Medium | Medium (download via Storage, parse JSON) | Effectively unlimited (5 TB object cap) | Need new `storage.rules` block + admin-only gate; restore flow rewrite |
| **D. Selective backup** (drop revenueLog/sales/images) | Low | High (incomplete restore; merge logic) | Trades scope for size; defeats purpose | **High — data loss masquerading as backup** |
| **E. Chunked products sub-collection** (`backups/daily/{date}/products_0..N` + siblings for other collections) | Medium | Medium (read all chunks + concat) | Scales arbitrarily; mirrors existing `sharedData/products_*` pattern | Medium — must iterate-delete chunks on cleanup |

**Notes per option**:
- **A** just moves the limit to whichever single collection is largest. Will repeat this exact failure once products exceed ~840 items. Buys 5–10% headroom only.
- **B** is genuinely good for this workload: product JSON with repetitive field names compresses well (typical 5–10x). LZ-string is ~14 KB minified, no dependencies, pure JS. Restore must decompress. Still bounded by Firestore 1MB after compression — but that's >5x current size.
- **C** is architecturally cleanest: backups become files. Storage is already wired (board attachments, plan temp images). Drawback is restore-path complexity and one-time rules update.
- **D** is not a backup. Reject for data protection.
- **E** mirrors the existing chunked-products pattern in `sharedData`. Lowest cognitive load for future maintainers since the pattern already exists.

**Recommendation**: **Option C (Firebase Storage)** because (1) Storage is already configured and battle-tested in this app, (2) gives effectively unlimited headroom so this never recurs, (3) optional gzip can keep backup objects tiny (likely <200 KB), and (4) backup data is a perfect fit for object storage — write-once, read-rarely, large blob.

**Strong runner-up**: **Option B (LZ-string)** if the owner prefers to keep all data in Firestore — minimal code change, no rules update, no new conceptual surface, defers the ceiling to ~5x current size.

### 2-5. Owner Decision Needed

1. **Storage (C) vs Firestore + compression (B)** — primary architectural choice.
2. **Failure visibility** — should backup failures trigger a toast / notification / dashboard alert? Currently silent `console.error` only. Recommend: at minimum a toast on `manualBackup` and a one-time daily admin notification on `runAutoBackup` failure.
3. **Immediate manual backup once fixed** — admin should run `manualBackup()` once to capture today's state. Also seed weekly + monthly retention buckets?
4. **Pre-failure backups in restore UI** — any backup older than the recent failures predates the CSV import (smaller product count). Hide or flag as "outdated" to prevent accidental rollback?
5. **`activityLogs` retention policy** — collection grows forever (100+ call sites, no TTL). Eventually dominates payload regardless of backup architecture. Recommend deciding on a retention window (e.g., 90 days) and a separate cleanup job — independent of the backup fix.

---

## 🎯 Combined Summary

| Issue | Status | Next Step |
|---|---|---|
| **#1 품번 generator (분류 missing in edit)** | Root cause confirmed at 2 sites (`js/plan.js:1594`, `js/modals.js:405`) | **Ready to implement** — 2 one-line changes |
| **#2 Backup 1MB limit** | Architectural — single-doc pattern overrun by 798-product payload (976 KB / ~1.06 MB total) | **Owner decision required** between Option C (Storage) and Option B (LZ-string compression) |

**Time-sensitive**: backup safety net erodes over ~7 days. Recommend deciding on Option B/C within the week and seeding a fresh backup immediately after the fix.
