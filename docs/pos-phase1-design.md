# POS Phase 1 Design Document — Store Structure Foundation

**Status:** DESIGN ONLY — no code written, no deployment. For owner + Claude.ai review.
**Date:** 2026-07-01
**Scope:** Phase 1 foundation only (stores config, user→store, store-stock model, seed upload, stock view, tab shell, rules). Phases 2–6 (incoming scan, POS sale, void/refund, discounts/replenishment/location, aggregate view) are noted where they constrain Phase 1 but NOT designed here.

---

## 0. Executive Summary + The One Decision That Matters Most

The single most consequential design decision in this whole document:

> **Store stock must live in its OWN per-document Firestore collection (`storeStock/{storeId}_{productCode}`), NOT inside the existing `sharedData/products_*` chunk model.**

**Why this is non-negotiable (evidence):** the existing product catalog is stored as JSON-stringified chunks in `sharedData/products_0..N` + `sharedData/products_meta`. On *any* product write, `saveProducts()` (core.js:91-112) rewrites all chunks in one batch, which bumps `products_meta.updatedAt`, which fires the whole-collection `onSnapshot` (core.js:365-372) on **every connected client**, each of which then re-downloads the **entire catalog** via `_fsLoadProducts()` (core.js:232-254, uses `{source:'server'}`, cache-bypassing).

At POS frequency (2 stores selling concurrently), if store stock lived in the product chunks, **every barcode scan would force every client to re-download all ~798 products**. That is O(clients × catalog) reads per sale — financially and performance-catastrophic on the Blaze plan.

A per-document `storeStock` collection lets each client subscribe with a narrow `.where('storeId','==',X)` listener (precedent: the scoped notifications listener at core.js:390) and receive **only the one changed doc** — and lets us use `FieldValue.increment(-qty)` for lost-update-safe atomic deduction (precedent already in the codebase: comments.js:248-250, 330-332).

Everything else in this document follows from that decision.

---

## 1. Store Definitions + Settings

### 1.1 Data model — `sharedData/stores` (single doc, mirrors `_depts`)

Store *config* is low-frequency (edited rarely) so it belongs in the existing single-doc sharedData pattern — NOT a per-document collection. Mirror `_depts` exactly (core.js:1136-1154, settings.js:397-436 + 1158-1203).

**But `_depts` is a flat `string[]` — that is WRONG for stores.** A store needs a **stable ID separate from its display name** because `storeStock` / `storeSales` reference the store, and the owner wants editable names. Renaming a `_depts` string orphans nothing only because depts are matched by string value; here, renaming must NOT break stock references. So stores must be objects with a stable `id`.

Proposed store object:
```js
{
  id:       'st1',        // STABLE, never changes, never reused. Referenced by storeStock/storeSales.
  name:     '매장1',       // editable display name
  active:   true,         // soft-disable flag (never hard-delete a store with data)
  order:    1,            // display order
  location: ''            // optional free-text address/note (future use, harmless now)
}
```

`_stores` in-memory + `lemango_stores_v1` localStorage + `saveStores()` → `_fsSync('stores', _stores)` + `_lastSharedSaveTime['stores']`. Add the realtime `case 'stores':` in `_onSharedDataChanged` (core.js:~554), the force-upload payload line (core.js:~209), and the 5-min reload block (core.js:~287). This is the exact 5-touchpoint template the settings-agent confirmed.

Default seed:
```js
const DEFAULT_STORES = [
  { id: 'st1', name: '매장1', active: true, order: 1, location: '' },
  { id: 'st2', name: '매장2', active: true, order: 2, location: '' }
]
```

### 1.2 Store ID strategy — stable, opaque, never reused

- IDs are **generated once on creation and immutable**. Display name is editable; ID is not.
- Do NOT derive the ID from array index (`store1`/`store2` by position) — deleting store 1 and re-adding would let a new store reuse `st1` and inherit the old store's orphaned stock/sales. **Reuse is the danger.**
- Generation scheme: a monotonic counter persisted in the config, e.g. next id = `st` + (max existing numeric suffix + 1), and **deleted IDs are never recycled** (because delete is soft — the object stays with `active:false`, so its ID is still "taken"). This gives human-readable stable IDs without reuse risk.
- ⚠️ `Date.now()`-based IDs are fine at *app runtime* (the ban on `Date.now()` is only inside Workflow scripts) — but the counter-suffix scheme is cleaner and collision-proof.

### 1.3 Settings UI

Mirror the dept card (settings.js:397-436 render, 1158-1203 CRUD), gated to `grade >= 4` like the dept card is. Each row: name (editable inline), active toggle, order. Functions: `addStoreSetting / editStoreSetting / saveStoreEdit / toggleStoreActive / removeStoreSetting` → each calls `saveStores()` + `populateAllSelects()` + `renderSettings()` + `logActivity('setting', '매장', ...)`.

### 1.4 ⚠️ DELETION GUARD (critical)

**Never hard-delete a store.** `removeStoreSetting(idx)` must:
1. Check whether the store has any stock or sales:
   - stock: does `storeStock` have any doc with this `storeId` and a non-zero size? (a `.where('storeId','==',id).limit(1)` probe, or check the in-memory store-stock index)
   - sales: does `storeSales` have any doc with this `storeId`? (a `.limit(1)` probe)
2. If either exists → **refuse hard delete**, offer soft-disable (`active:false`) instead, with a `korConfirm` explaining "재고/매출 기록이 있어 비활성화만 가능합니다."
3. If truly empty → allow removal from the array (still recommend soft-disable as the default even then, for audit history).

Soft-disabled stores: hidden from POS/staff selectors, but still shown (greyed) in admin views so historical stock/sales remain interpretable.

### 1.5 Critical Q answers

- **Can store IDs ever change?** No — immutable by design. This is the whole point of separating `id` from `name`.
- **If a store name changes, does anything break?** No — only display. All references use `id`. (Confirmed safe because, unlike `_depts`, we never store the store *name* on stock/sales docs, only the `id`.)
- **How many stores realistically?** 2 now. Model scales to N (array + per-store docs). UI (settings list, store switcher dropdown) scales trivially. The only N-sensitive cost is the stock-status read (§5) which is per-store, so N doesn't worsen a single store's view.

---

## 2. User → Store Assignment

### 2.1 Schema change

Add `storeId` to the users doc — a **new field, do NOT overload `dept`** (dept is organizational; store is physical/operational; a designer in the 디자인 dept has no store, a cashier does). Edit points (all confirmed by the auth agent):

| Concern | Location | Change |
|---|---|---|
| Signup schema | auth.js:312-323 | add `storeId: ''` (staff self-signup leaves it blank; admin assigns later) |
| First-user bootstrap | auth.js:120-127 | add `storeId: ''` |
| Initial admin | auth.js:367-377 | add `storeId: ''` |
| Cache var declare | core.js:828-834 | `let _currentUserStoreId = ''` |
| Set on login | auth.js:166-170 (`showApp`) | `_currentUserStoreId = userData.storeId || ''` |
| Reset on logout | auth.js:234-237 | `_currentUserStoreId = ''` |
| Member edit modal HTML | index.html:~1018-1021 | add `mpStore` select next to `mpDept` |
| Populate on open | members.js:548-553 | populate store list, set from `member.storeId`, gate to admin |
| Save write | members.js:600-631 | read `mpStore`, include in `updates`, mirror `_currentUserStoreId` on self-edit |

`storeId` is assigned by an **admin** in member management (not self-service) — a staff member shouldn't pick their own store. On signup it stays blank.

### 2.2 Visibility helper — `getVisibleStoreId()` / store switching

Mirror `getVisibleSchedules` (work.js:1191-1203). The store subsystem needs a "which store am I looking at?" resolver:

```
resolveActiveStore():
  grade = currentUser.grade
  if grade >= 3 (admin):  return _storeViewOverride || firstActiveStore   // admin can switch
  else (staff):           return _currentUserStoreId || null              // locked to own store
```

- `_storeViewOverride` — an in-memory var set only by the admin store-switcher dropdown. Staff never see the switcher.
- Admin switcher: a `<select>` visible only when `grade >= 3`, listing active stores, changing `_storeViewOverride` and re-rendering the store view.

### 2.3 Critical Q answers

- **User with NO storeId (new users, admins, office staff)?**
  - Admin (`grade>=3`): fine — uses the switcher, defaults to first active store.
  - Staff with no storeId: the store tab shows a "배정된 매장이 없습니다 — 관리자에게 문의" message, no data. They cannot write stock/sales (rules also block — §7).
- **What grade can switch stores?** `grade >= 3` (관리자), consistent with every other admin threshold (`canDeleteWork/Event/Product/PlanItem` all use `>= 3`; GRADE_DEFS auth.js:38-44).
- **Can staff be reassigned between stores?** Yes — admin edits `storeId` in member management. Takes effect on their next login (cache refresh). ⚠️ Note: a staff member already logged in keeps the old `_currentUserStoreId` until re-login. Acceptable for Phase 1; could force-refresh via the users onSnapshot later if needed.
- **Multi-store staff (works at both)?** Deferred. `storeId` is single-valued. If needed later, promote to `storeIds: []` + a per-session active-store picker. Not worth the complexity now (owner said staff = *fixed* store). Note it as a known limitation.

---

## 3. Store Stock Data Model (THE CORE)

### 3.1 Collection: `storeStock/{storeId}_{productCode}`

One document per (store, product). Product codes are alphanumeric (`LSWON16266707`) and store IDs are `st1`/`st2` — **no underscore collision risk** in the composite key because we split on the *first* underscore and product codes contain none. (If we ever allowed underscores in product codes, switch to `{storeId}__{productCode}` double-underscore; flagged for verification during implementation.)

Document shape:
```js
{
  storeId:     'st1',                 // REQUIRED on every write (rules + queries depend on it)
  productCode: 'LSWON16266707',
  sizes: { XS:0, S:0, M:0, L:0, XL:0, XXL:0, F:0 },   // per-size quantities
  location:    '',                    // shelf/rack location (Phase 5; harmless empty now)
  updatedAt:   '2026-07-01T...'       // ISO string, stamped on every write
}
```

- Sizes as a **map** (not top-level fields) so a single size can be atomically incremented: `set({ sizes:{ M: increment(-1) }, storeId, updatedAt }, {merge:true})`.
- `SIZES` = `['XS','S','M','L','XL','XXL','F']` (reuse the existing constant from core.js — same 7 sizes as main stock).

### 3.2 Atomic operations (the safe primitive)

**All steady-state stock changes use `set(..., {merge:true})` with `FieldValue.increment`** — NOT `update()`. Reason: `update()` throws if the doc doesn't exist; merged `set` with `increment` **creates the doc and the field (starting from 0) if missing**. This single choice solves the "missing doc" problem for free.

```js
db.collection('storeStock').doc(`${storeId}_${code}`).set({
  storeId, productCode: code,
  sizes: { [size]: firebase.firestore.FieldValue.increment(delta) },  // delta = -qty (sale) or +qty (receipt/adjust)
  updatedAt: new Date().toISOString()
}, { merge: true }).catch(...)
```

- Two cashiers, same store+product+size, each `increment(-1)` → server applies both atomically → correct final value. **Lost-update-safe by construction.** (This is exactly why we cannot use the read-modify-write `p.stock[sz] += qty` pattern that main stock uses at stock.js:237,347 — that pattern IS racy; it survives today only because main stock isn't edited concurrently at POS frequency.)
- A sale + a manual adjust simultaneously → both are increments → both apply. Safe.

### 3.3 ⚠️ SET vs INCREMENT reconciliation (the key design problem)

**The conflict:** Day-one Excel seeding wants to **SET absolute quantities** ("매장1 has 12 of size M"). But the only lost-update-safe primitive is **INCREMENT** (relative). A `set()` that writes an absolute `sizes` map **overwrites** any concurrent increment — if a sale's `increment(-1)` lands and then a seed `set({sizes:{M:12}})` lands, the sale is silently erased.

**Analysis of the options:**

| Option | Mechanism | Safe against concurrent increment? | Verdict |
|---|---|---|---|
| (a) Seed only if doc missing/zero | `set` guarded by existence check | Partially — but the check→write gap is itself racy | Weak |
| (b) Seed as a transaction (read then set) | `runTransaction` reads current, writes absolute | Yes, IF the racing sale is *also* a transaction — but sales are increments, not transactions, so a transaction seed can still lose a concurrent non-transaction increment | Complex, no codebase precedent (zero `runTransaction` usage), still imperfect |
| (c) Seed during closed hours with direct `set` | procedural temporal isolation | Yes — because there are no concurrent increments during closed hours | **Simple + correct** |
| (d) Seed as delta-increment | read current, `increment(seedQty − current)` | No — the read is racy | Rejected |

**Recommended reconciliation — temporal separation, made explicit in the UI:**

The clean mental model: **SET is a bootstrap operation; INCREMENT is steady-state. They are never concurrent.**

1. **Day-one seed = SET semantics, run during closed hours.** The initial Excel upload writes absolute quantities via batched `set()` (§4). This is correct because POS is not active during seeding. This is a *procedural* guarantee, backed by two *technical* guards:
   - **Existing-stock guard:** if the target store already has any non-zero stock, the upload **warns loudly** ("이 매장은 이미 재고가 있습니다 — 덮어쓰면 기존 수량이 사라집니다") and requires explicit confirmation. This prevents an accidental mid-operation SET clobbering live increments.
   - **Idempotent re-run:** because SET is absolute, re-uploading the same file yields the same result (no double-counting). Safe to retry.

2. **All ongoing changes = INCREMENT semantics.** Sales (Phase 3), incoming scans (Phase 2), and manual adjustments use `increment`. Never SET during live hours.

3. **Provide BOTH modes in the bulk-upload UI, explicitly labeled** (owner chose "both" seeding methods):
   - **"초기재고 설정 (덮어쓰기 / SET)"** — day-one, absolute, with the existing-stock guard.
   - **"재고 추가 (증가 / ADD)"** — ongoing bulk top-ups, uses `increment(+qty)`, safe to run anytime.

   Making the mode an explicit user choice removes the ambiguity that causes the conflict. The user can never accidentally SET during live hours because SET is a distinct, guarded, warned action.

**This is the safest pragmatic approach**: we don't introduce transactions (no codebase precedent, and they wouldn't even fully protect a SET against non-transaction increments), we don't pretend SET and INCREMENT can safely interleave, and we give the owner both semantics as deliberate, distinct actions.

### 3.4 Critical Q answers (all)

- **Product with no storeStock doc yet?** Treated as **0** everywhere. Reads: absent doc = all-zero. Writes: merged `set`+`increment` lazily creates it. No pre-creation needed.
- **Negative stock (oversell warn-only)?** `increment(-qty)` can drive a size below zero; Firestore allows it. Stored as a negative number. The stock-status view (§5) flags negatives in red. Warn-only means we display and warn, never block. (Deferred detail: the *sale* flow in Phase 3 shows the oversell warning; Phase 1 only needs the view to render negatives correctly.)
- **Concurrency — two cashiers same product+size?** Both `increment(-1)` → atomic → correct. Confirmed safe. Sale + manual adjust concurrently → both increments → safe.
- **Seed SET racing a sale INCREMENT?** The core conflict — resolved by §3.3: SET is closed-hours + existing-stock-guarded; live changes are increment-only. They don't interleave.
- **Product soft-deleted in main system?** Its `storeStock` docs are **orphaned but retained** (history + any residual stock matters). The stock view shows them flagged "삭제된 상품" (join against `State.allProducts` where `p.deleted`). Never auto-delete storeStock on product delete. (The barcode index at core.js:785 already skips `p.deleted` products — store stock should surface them instead, for reconciliation.)
- **Doc-ID composite queryable?** Yes — we also store `storeId` as a field, so `.where('storeId','==',X)` works independent of the ID string. The composite ID is just for O(1) direct `.doc()` access on scan/sale.

### 3.5 Read cost

798 products × 2 stores = **~1,596 docs maximum** (fewer in practice — only products actually stocked in a store get a doc). A single store's view reads ≤798 docs. Acceptable for on-demand load (§5). Mitigations if it grows: paginate, or lazy-create only on receipt so unstocked products have no doc.

---

## 4. Initial Stock Excel Upload (the "SET" seeding)

Mirror the **barcode upload flow** (stock.js:593-827) — it is the stronger template because it `await`s the write and branches on failure (stock.js:815-820), unlike the fire-and-forget incoming flows.

### 4.1 Format + target store

**Long format**, one row per (product, size):

| 품번 | 사이즈 | 수량 |
|---|---|---|
| LSWON16266707 | M | 12 |
| LSWON16266707 | L | 8 |

**Target store:** the **admin's currently-selected store** (the §2.2 switcher), shown prominently in the modal header ("대상 매장: 매장1"). Rationale: simpler + less error-prone than a `매장` column (a typo'd store name in a column could seed the wrong store). If multi-store seeding is ever needed, add an optional `매장` column later. For Phase 1, single-target-per-upload.

Quantities are plain numbers (no leading-zero risk like barcodes). Product code matching reuses the **case-insensitive `toUpperCase()`** match from the barcode flow (stock.js:666) — more forgiving than the exact-match incoming flow.

### 4.2 SET vs ADD decision (per §3.3)

The modal has a **mode toggle**:
- **SET (초기재고 덮어쓰기)** — default for day-one. Writes absolute `sizes`. Existing-stock guard active.
- **ADD (재고 증가)** — `increment(+qty)`. No overwrite risk.

The confirm button label reflects the mode ("덮어쓰기 확정" vs "추가 확정").

### 4.3 Validation + preview

Mirror `_bcValidateRows` (stock.js:682-724) row statuses:
- **format** — quantity not a non-negative integer.
- **unmatched** — productCode not found (case-insensitive) OR size not in `SIZES`.
- **duplicate-in-file** — same (product, size) appears twice → in SET mode this is an error (ambiguous absolute value); in ADD mode, sum them (like incoming grouping at stock.js:342-347). Decide per mode.
- **ok** — valid.

Preview modal mirrors `barcodeUploadModal` (index.html:2495-2531): summary counts, per-row status badges, disable confirm when valid count = 0. Register the dialog with `makeDraggableResizable(...)` in main.js:32-69.

### 4.4 Commit

Batched `set()` per doc, chunked at ≤500 writes/batch (Firestore batch limit), mirroring `saveProducts`'s chunk-and-commit (core.js:96-104). `await batch.commit()`, branch on failure, toast, `logActivity('upload','매장재고',...)`, close, re-render the stock view. Rebuild the in-memory store-stock index (§5) after commit.

### 4.5 Critical Q answers

- **Block seeding if store already has stock?** SET mode: **warn + require explicit confirm** (not hard-block — the owner may legitimately want to reset). ADD mode: no guard (adding is always safe).
- **Product with no barcode yet?** Seeds fine — store stock is independent of barcodes. Matching is on productCode, not barcode.
- **Leading-zero/text issues?** Quantities are numeric (low risk). ProductCode matching same as barcode (`raw:false` read + `toUpperCase`) to preserve text-formatted codes.
- **Re-upload safety?** SET mode is idempotent (absolute). ADD mode is NOT idempotent (re-running doubles) — the ADD confirm dialog must warn "이미 반영된 파일을 다시 올리면 중복 증가합니다."

---

## 5. Per-Store Stock Status View (매장별 재고현황)

### 5.1 Design

Read-only table, one row per product that has stock in the selected store:

| 품번 | 상품명 | XS | S | M | L | XL | XXL | F | 합계 | 위치 |

- **Store selector:** staff = fixed label (their store), admin = the §2.2 switcher.
- **Product info (상품명, 이미지)** joined **read-only** from `State.allProducts` by productCode — the store subsystem reuses product info but owns its stock. Products soft-deleted in main are flagged "삭제된 상품" but still shown.
- Reuse existing table rendering conventions (sticky header, column widths) but this is a **separate, simpler table** — no need for the full column-drag/filter machinery of the main tables in Phase 1.
- **Negative stock flagged red** (oversell cases).
- Filter/search: by 품번 and 브랜드 (reuse the search-narrow pattern), optional in Phase 1.

### 5.2 Read strategy + in-memory index

On store-view open (or store switch): `db.collection('storeStock').where('storeId','==',activeStore).get()` → build an in-memory map `_storeStockIndex[storeId] = { [productCode]: sizesObj }`. Mirror `buildBarcodeIndex` (core.js:781-807) as a precedent for an in-memory index rebuilt on load + on relevant writes.

Use the **cache-fallback read** pattern (`.get({source:'server'})` then `.catch()` → default `.get()`) that hr.js:1962-1963 and work.js:1181-1183 use for consistency-critical reads — store stock must be fresh.

### 5.3 Critical Q answers

- **Read cost at scale (≤798 docs/store)?** On-demand load per store view open. Acceptable. Paginate only if it becomes slow. Do NOT load both stores at once for staff.
- **Real-time updates?** **On-demand for Phase 1** (refresh button / reload on store switch). A narrow `.where('storeId','==',X).onSnapshot(...)` live listener is the Phase 3 upgrade (so the stock view updates as sales happen) — the per-doc collection makes this cheap, but it's not needed until POS sales exist. Note the foundation supports it.
- **Relation to existing 재고관리?** Completely separate tab, separate data (`storeStock` vs `p.stock`). The existing 재고관리 (Cafe24/사방넷 online stock) is untouched. An aggregate "both stocks side by side" view is Phase 6 (join-read-only).

---

## 6. Menu/Tab Integration + Navigation Shell

New `store` tab. Integration points (all confirmed by the router agent):

| File:line | Change |
|---|---|
| core.js:840-846 | add `store: 1` to `TAB_PERMISSIONS` (everyone approved sees it; empty-store handled gracefully — see below) |
| core.js:1324-1338 | add `store: '매장'` to `TAB_LABELS` |
| router.js:180-195 | add `case 'store': if (typeof renderStoreTab==='function') renderStoreTab(); break` |
| router.js:163 | add `'store'` to the no-products-needed whitelist IF the shell renders before products load (it joins product info, so probably keep it OUT — let it wait for products) |
| index.html:109-120 | add `<button class="tab-btn" data-tab="store">매장</button>` (generic `bindTabs` wires it automatically) |
| index.html (near 574-630) | add `<section class="tab-content" id="tab-store">` with inner sub-tab shell |
| main.js:325-330 | nav visibility handled automatically once `TAB_PERMISSIONS.store` exists |
| main.js:32-69 | register store modals (upload preview, etc.) with `makeDraggableResizable` |

### 6.1 Navigation shell (build for the future now)

Even though Phase 1 ships only 재고현황, build the inner sub-tab shell now (mirror `switchWorkTab` work.js:1036-1050 + the `.work-inner-tabs` HTML index.html:574-630) so Phases 2–6 slot in without restructuring:

```
[매장별 재고현황]  [입고(준비중)]  [판매(준비중)]  [보충대상(준비중)]     ← admin store switcher (grade>=3)
```

Phase 1: only 재고현황 active; the rest are disabled placeholders. `switchStoreTab(sub)` toggles panel `display` + lazy-renders. This mirrors the richer `switchHrAdminTab` (hr.js:2277-2308) if we want separate panel divs per sub-screen (recommended, since Phases 2–6 each get their own panel).

### 6.2 Permission gating — the empty-store question

`TAB_PERMISSIONS.store = 1` makes the tab visible to all approved users. Behavior by user:
- **Admin (grade>=3):** full access + store switcher.
- **Store staff (grade 1-2 with storeId):** locked to their store, no switcher.
- **Staff with no storeId (office staff):** tab visible but shows "배정된 매장이 없습니다" — no data, no writes (rules also block).

**Open question for owner:** should office staff (no storeId, not admin) see the store tab *at all*? Two options:
- (A) Show it with the empty-state message (simplest, `store: 1`).
- (B) Hide it from non-store non-admin users — requires a custom visibility rule beyond the grade matrix (a per-user "has storeId OR is admin" check in `updateTabVisibility`).

Recommend (A) for Phase 1 simplicity; (B) is a small follow-up if the owner finds it cluttering.

---

## 7. Firestore Rules + Deploy Sequencing

Add three new match blocks to `firestore.rules`. Reuse the existing `isApproved()` / `isAdmin()` helpers (firestore.rules:14-23).

### 7.1 `stores` config (in sharedData — already covered, but tighten)

Store config lives in `sharedData/stores`, which is currently `allow read, write: if isApproved()` (firestore.rules:26-28) — meaning any approved user could edit store config. Since store CRUD is admin-only in the UI (grade>=4), **optionally** add a specific rule to enforce it server-side:
```
// stores config edited only by admins; readable by all approved
// (sharedData/{docId} generic rule stays for everything else)
match /sharedData/stores {
  allow read: if isApproved();
  allow write: if isAdmin();
}
```
⚠️ Firestore evaluates the **most specific** match, so this `sharedData/stores` block overrides the generic `sharedData/{docId}`. Confirm rule precedence during implementation.

### 7.2 `storeStock` collection

```
match /storeStock/{docId} {
  allow read: if isApproved();
  // write if admin, OR the writer's own storeId matches the doc's storeId field
  allow write: if isApproved() && (
    isAdmin() ||
    request.resource.data.storeId == userDoc(request.auth.uid).storeId
  );
}
```
- **Requires `storeId` on every write** (§3.1) — the rule reads `request.resource.data.storeId`. Writers must always include it in the merge payload.
- Staff can only write to their own store; admins write any store.
- ⚠️ **Cost:** every write evaluates `isApproved()` + the `userDoc()` read (1 users-doc read per stock write). At POS frequency this is a real but bounded cost — one extra read per sale. Acceptable; note it.
- ⚠️ **Missing-storeId users:** if `userDoc(uid).storeId` is undefined (existing users, office staff), the `==` comparison fails → they can't write (only admins can). Correct behavior. But it means **existing users must be assigned a storeId before they can operate a POS** — sequence this (§7.4).

### 7.3 `storeSales` collection (Phase 3+, but define the rule shape now)

Append-only ledger (soft-void via new records, per the confirmed vision):
```
match /storeSales/{docId} {
  allow read: if isApproved();
  allow create: if isApproved() && (
    isAdmin() || request.resource.data.storeId == userDoc(request.auth.uid).storeId
  );
  allow update, delete: if false;   // immutable ledger; voids/refunds are NEW records
}
```
Template: the `activityLogs` append-only rule (firestore.rules:102-106). Not needed until Phase 3, but designing it now confirms the storeSales collection shape is compatible with Phase 1's storeId-on-every-doc convention.

### 7.4 Deploy sequencing (critical ordering)

1. **First:** ship the `storeId` user-schema change + assign storeIds to actual store staff (§2) — because the storeStock rule depends on `userDoc(uid).storeId`. If rules deploy before users have storeIds, staff writes fail.
2. **Then:** deploy rules (`firebase deploy --only firestore:rules`). ⚠️ Rules changes require this explicit deploy — a hosting-only deploy won't apply them.
3. **Then:** the seed upload (§4) can write storeStock (admin does the seeding, and admins bypass the storeId check, so seeding works even before staff storeIds are set).
4. Store config (`sharedData/stores`) rule can deploy anytime (admins do config).

**Sequencing summary:** user storeId (code, hosting deploy) → assign storeIds (data) → rules deploy → seed → staff operate.

---

## 8. CRITICAL ANALYSIS

### 8.1 Foreseeable Problems

| # | Problem | Severity | Why it happens | Mitigation |
|---|---|---|---|---|
| P1 | **Store stock in product chunks → full-catalog re-download per sale** | 🔴 | `sharedData/products_*` model reloads everything on any change (core.js:232-254, 365-372) | **Separate `storeStock` per-doc collection** (§0, §3). Non-negotiable. |
| P2 | **SET seed clobbers concurrent sale increment** | 🔴 | `set()` overwrites; increments are relative | Temporal separation: SET = closed-hours + existing-stock guard; live = increment-only (§3.3) |
| P3 | **Read-modify-write racing (if we copied main-stock `+= qty`)** | 🔴 | stock.js:237,347 pattern is lost-update-prone | Use `FieldValue.increment` exclusively for store stock (§3.2). Never copy the `+=` pattern. |
| P4 | **`update()` on missing storeStock doc throws** | 🟡 | Firestore `update` requires existing doc | Use `set(...,{merge:true})` + increment — creates doc lazily (§3.2) |
| P5 | **Store ID reuse after delete → new store inherits orphaned stock** | 🔴 | index-based or recycled IDs | Stable, never-reused IDs + soft-delete only (§1.2, §1.4) |
| P6 | **Hard-deleting a store with stock/sales orphans data** | 🔴 | naive array splice | Deletion guard: refuse hard-delete if data exists; soft-disable (§1.4) |
| P7 | **Existing users have no storeId → POS writes blocked by rules** | 🟡 | rule reads `userDoc.storeId`; undefined fails `==` | Sequence: assign storeIds before rules deploy; admins bypass for seeding (§7.4) |
| P8 | **Rule cost: 1 users-doc read per stock write** | 🟡 | `isApproved()`/`isAdmin()` do `get()` | Bounded (1 read/sale). Accept. Monitor; could cache via custom claims later. |
| P9 | **ADD-mode re-upload double-counts** | 🟡 | increment is not idempotent | Warn on ADD confirm; SET mode is idempotent for resets (§4.5) |
| P10 | **Negative stock from oversell displays confusingly** | 🟢 | warn-only allows negatives | Flag red in view; warn at sale time (Phase 3) (§3.4) |
| P11 | **Soft-deleted product still has store stock** | 🟢 | product delete doesn't touch storeStock | Retain + flag "삭제된 상품" in view (§3.4) |
| P12 | **Staff reassigned store keeps old storeId until re-login** | 🟢 | cache set only at login | Acceptable; document. Force-refresh via users listener later if needed (§2.3) |
| P13 | **Composite doc ID underscore ambiguity** | 🟢 | if product codes ever contain `_` | Product codes are underscore-free today; split on first `_`; use `__` if that changes (§3.1) |
| P14 | **`sharedData/stores` specific rule vs generic rule precedence** | 🟡 | Firestore picks most-specific match | Verify precedence in the rules simulator during implementation (§7.1) |
| P15 | **Store stock view read cost grows with catalog** | 🟢 | ≤798 docs/store | On-demand load; lazy-create so unstocked products have no doc (§3.5) |
| P16 | **`_storeViewOverride` (admin switch) is in-memory, lost on refresh** | 🟢 | not persisted | Default to first active store on load; acceptable. Persist to localStorage if annoying. |

### 8.2 Error Minimization

- **Atomic-by-construction stock writes** (increment + merge-set) eliminate the two hardest bug classes: lost updates and missing-doc crashes. This is the biggest error-minimization lever.
- **Explicit SET/ADD mode toggle** removes the ambiguity that would otherwise cause silent stock corruption. The user cannot accidentally SET during live hours because SET is a distinct, guarded action.
- **Stable IDs + soft-delete** prevent the entire class of orphaned/misattributed data bugs.
- **`storeId` required on every doc** makes both queries and rules trivially correct (no reliance on parsing the composite ID string).
- **Mirror the barcode-upload template** (awaits the write, branches on `false`) rather than the incoming template (fire-and-forget) — so seed failures are visible and retryable, not silently lost.
- **Defensive guards needed from day 1:** existing-stock warning on SET; store-has-data guard on delete; empty-storeId user handling; negative-stock display; soft-deleted-product display.
- **Riskiest implementation spots (extra verification):**
  1. The seed batch commit + mode toggle (SET vs ADD paths must not cross-contaminate).
  2. The rules `storeId ==` check with missing-storeId users (test all 3 cases: admin, own-store staff, no-store staff).
  3. Firestore rule precedence for `sharedData/stores` vs `sharedData/{docId}`.
  4. The composite doc-ID split (verify no product code has an underscore — a one-time grep during implementation).

### 8.3 What Owner / Claude.ai Might Have Missed

- **Rules read-cost per POS write (P8).** Not previously called out. One users-doc read per sale is fine at 2 stores but worth knowing before scaling to many stores/registers.
- **Existing users have no storeId (P7).** The rules depend on it; there's a sequencing requirement (assign storeIds *before* staff can operate) that wasn't in the vision.
- **ADD-mode non-idempotency (P9).** The "both seeding methods" decision (Excel SET + scan ADD) means the Excel upload itself needs a mode toggle, and ADD re-uploads double-count — a UX warning is required.
- **Store config edit permission (P14).** `sharedData/stores` would be writable by any approved user under the generic rule; needs a specific admin-only rule, with precedence verification.
- **`storeSales` immutability shape.** Designing the append-only rule now (even though it's Phase 3) validates that Phase 1's "storeId on every doc" convention is forward-compatible — worth confirming early rather than discovering a mismatch in Phase 3.
- **The join-read-only assumption for the aggregate view (Phase 6)** implies product info (name/image/price) is *always* fetched from `State.allProducts`, never duplicated onto storeStock. Phase 1 must NOT copy product fields onto storeStock docs (only `productCode`), or the aggregate view will show stale product data. Flagged now to prevent a Phase 1 shortcut that bites Phase 6.

---

## 9. Phase 1 Sub-Split

Each sub-step is independently buildable + verifiable. Suggested order respects dependencies (config → user → shell → model → seed → view).

| Sub-step | Scope | Verification checkpoint | Depends on |
|---|---|---|---|
| **1a** | `sharedData/stores` config: `_stores` var + DEFAULT_STORES + `saveStores()` + realtime `case 'stores'` + settings CRUD card (add/rename/toggle-active/guarded-delete) | In settings, add/rename/disable a store; reload page → persists; open a 2nd browser → syncs. Delete guarded (can't hard-delete; soft-disable works). | — |
| **1b** | User `storeId`: schema (signup/bootstrap/admin), login cache `_currentUserStoreId`, logout reset, member-edit store selector, `resolveActiveStore()` helper | Admin assigns a store to a user in member mgmt; that user logs in → `_currentUserStoreId` set (verify in console). Self-edit updates cache. | 1a (store list to populate selector) |
| **1c** | Store tab shell: nav button, `TAB_PERMISSIONS.store`, `TAB_LABELS.store`, router case, `<section id="tab-store">` + inner sub-tab bar + `switchStoreTab()` + admin store-switcher (empty panels/placeholders) | Tab appears per grade (admin sees switcher, staff locked, office-staff empty-state). Sub-tab switching toggles panels. No data yet. | 1a, 1b |
| **1d** | `storeStock` data model: JS helpers only — `storeStockDocId()`, `writeStoreStock(storeId,code,size,delta)` (merge-set + increment), `loadStoreStock(storeId)` (where-query), `buildStoreStockIndex()`. Firestore rules for `storeStock` + `sharedData/stores`. **No UI.** | Manually call `writeStoreStock` from console → doc created with correct increment; concurrent calls sum correctly; `loadStoreStock` returns the map. Rules: staff writes only own store (test 3 user types in rules simulator). | 1b (storeId in users for rules) |
| **1e** | Initial stock Excel upload: modal (SET/ADD toggle), `handleStoreStockUpload` (raw:false, toUpperCase match), `_validateStoreStockRows`, preview, existing-stock guard, batched commit, index rebuild | Upload a SET file → seeds absolute quantities; re-upload → idempotent. ADD file → increments. Existing-stock warning fires. Invalid rows flagged in preview. | 1c (tab to host it), 1d (write model + rules) |
| **1f** | Per-store stock status view: `loadStoreStock` + render table (product join read-only, sizes, total, negative-flag, soft-deleted-flag), store switcher wired, on-demand refresh, optional 품번/브랜드 filter | Seeded stock displays correctly per store; admin switches stores → view updates; negatives red; deleted products flagged. | 1d, 1e (data to show) |

**Rules deploy** happens as part of 1d (storeStock + stores rules), after 1b ships and storeIds are assigned to staff (§7.4). 1a's store-config admin-only rule also lands in 1d.

**What can be built + tested in isolation before stacking:** 1a is fully standalone. 1b is testable via console before any store UI. 1c is a pure shell (no data). 1d is testable via console + rules simulator with no UI. Only 1e/1f require the full stack. This ordering means the risky data-model + rules (1d) are verified in isolation before any user-facing upload/view depends on them.

---

## 10. Recommended Starting Sub-Step + Open Questions for Owner

### Recommended start: **1a (stores config)**

It's fully standalone, mirrors an existing well-understood pattern (`_depts`), introduces the stable-ID + soft-delete guard (the foundation everything references), and has a clean verification checkpoint. It ships zero risk to existing features and gives the owner something visible (store management in settings) immediately. 1b naturally follows (it needs the store list from 1a).

### Open questions for the owner (decisions needed before/within implementation)

1. **Store tab visibility for office staff (no storeId, not admin):** show the tab with an empty-state message (simplest, `store:1`), OR hide it entirely from them (needs a custom visibility check)? *(§6.2 — recommend show-with-empty-state for Phase 1.)*

2. **Seed upload target-store selection:** admin's currently-selected store (recommended, safer), OR a `매장` column in the Excel (allows multi-store in one file but risks typos)? *(§4.1 — recommend selected-store.)*

3. **`storeSales` timing:** confirm we should NOT build any sales writes in Phase 1 (only the collection shape is designed for forward-compatibility, actual sales are Phase 3). *(Assumed yes.)*

4. **Existing-stock SET guard strength:** on a SET upload to a store that already has stock — warn-and-allow (recommended, owner may want to reset), OR hard-block (must soft-clear first)? *(§4.5 — recommend warn-and-allow.)*

5. **Store config edit permission:** admin-only (grade>=4, mirrors dept card) — confirm, OR allow grade>=3? *(§1.3 — recommend grade>=4 to match the dept-management gate.)*

6. **Initial store IDs/names:** default `st1='매장1'`, `st2='매장2'` — does the owner want the real store names now, or edit them in settings after 1a ships? *(Cosmetic; either works.)*

---

*End of design document. No code has been written and nothing has been deployed. Awaiting owner + Claude.ai review before a focused implementation work order for sub-step 1a.*
