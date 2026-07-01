# POS Phase 2 Design Document — Incoming Scan + Fixed Location + Inbound History

**Status:** DESIGN ONLY — no code changed, nothing deployed. For owner + Claude.ai review.
**Date:** 2026-07-01
**Scope:** Phase 2 = the 입고 스캔 (incoming-scan) flow with fixed per-size location + a new inbound-history collection + date-based history view. Builds on the deployed 1d-1f. The 1d atomic stock core (`FieldValue.increment` on `sizes`) stays UNTOUCHED — location is a separate label field.

---

## 0. Two non-negotiables (restated)
1. **The 1d atomic stock core is untouched.** `sizes.{size}` is only ever mutated by `FieldValue.increment` (core.js:1309). `sizeLocations` is a **separate key** in the same doc, written by overwrite (`set …merge`), and the stock math **never reads it**. Location and stock never mix.
2. **Cursor stays in 바코드.** A scanning operator never touches the mouse. Every action (scan, commit, popup close, list edit) ends by refocusing the barcode field. This is the make-or-break UX; §3 designs the focus state machine concretely.

---

## 1. Fixed Location Data Model

### 1.1 Doc shape (additive to 1d)
```js
storeStock/{storeId}_{productCode} = {
  storeId, productCode,
  sizes:         { M: 5, L: 3, ... },        // UNCHANGED — atomic increment (1d core)
  sizeLocations: { M: 'AA-AA-01-03', ... },  // NEW: per-size location LABEL (overwrite, not increment)
  updatedAt
}
```
- Per-size location (owner-confirmed granularity). Free-form string.
- **Drop the vestigial whole-doc `location`** — it's read at core.js:1337 but written by nobody, so there is **no migration**: existing 1e-seeded docs simply have no `sizeLocations`; new code defaults it to `{}`. The old `location:''` on any doc is harmless and ignored.

### 1.2 New helper (core.js, next to `writeStoreStock`)
```js
// 위치 라벨 덮어쓰기 (increment 아님). storeId 필수(규칙 의존). 빈 위치는 쓰지 않음.
async function setStoreStockLocation(storeId, code, size, location) {
  if (!db || !storeId || !code || !SIZES.includes(size)) return false
  const loc = String(location || '').trim()
  if (!loc) return false                      // 빈 위치는 무시(위치 지우기는 Phase 2 범위 밖)
  try {
    await db.collection('storeStock').doc(storeStockDocId(storeId, code)).set({
      storeId, productCode: code,
      sizeLocations: { [size]: loc },
      updatedAt: new Date().toISOString()
    }, { merge: true })
    return true
  } catch (e) { console.error('setStoreStockLocation 실패:', e.message); return false }
}
```
- Overwrite semantics (a label, not a quantity). `storeId` included → passes the existing storeStock rule.
- **On confirm, stock + location are written together in ONE merge-set per doc** (§6) so `sizes` (increment) and `sizeLocations` (overwrite) coexist in the same write without a second round-trip — still never mixing the two in the math.

### 1.3 Read path
- `loadStoreStock` (core.js:1321-1342): add `sizeLocations: d.sizeLocations || {}` to the returned rows (next to `sizes`).
- `buildStoreStockIndex` (core.js:1345-1352): index locations too — either a parallel `_storeStockLocIndex[storeId][code] = sizeLocationsObj` or extend the value shape. **Recommend a parallel index** so `getStoreStock` (which returns a sizes copy, core.js:1356-1359) stays byte-identical and 1f keeps working unchanged. Add `getStoreStockLocation(storeId, code, size)` reading the parallel index (returns '' if none).

### 1.4 Firestore rules impact — NONE
`sizeLocations` lives in the **same `storeStock` doc**, and every write includes `storeId`, so the existing rule (`allow write if isAdmin() || (storeId != '' && storeId == userDoc.storeId)`) already covers it. **No rules change for §1.** (Rules DO change if we add `storeInbound` — see §2.4.)

---

## 2. Inbound History Data Model

### 2.1 Collection: `storeInbound` — one doc per confirmed staged LINE
Granular (one doc per 품번+사이즈 line) so "what came in on day X" is a clean query and each line has its own worker/time/location.
```js
storeInbound/{autoId} = {
  storeId, productCode, size, qty, location,
  workerUid, workerName,          // stampCreated-style (formatUserName)
  confirmedAt: '2026-07-01T…',    // ISO instant
  dateKey:     '2026-07-01',      // STORE-LOCAL YYYY-MM-DD (for day queries) — see §9 P4
  batchId:     'ib_<local-ts>_<rand>'  // groups one 최종 확정 (future: batch undo/trace)
}
```
- **Doc ID:** Firestore auto-id.
- **`dateKey`:** derived from the **local** date at confirm time (not UTC) so a 23:50 inbound lands on the right day.
- **`batchId`:** stamps all lines from one 최종 확정 together (not used in Phase 2 UI, but cheap forward-compat for a future "undo this batch").

### 2.2 Query pattern
`storeInbound.where('storeId','==', s).where('dateKey','==','2026-07-01')` → that store's inbound for the day. **Needs a composite index** (`storeId ASC, dateKey ASC`) — must be added to `firestore.indexes.json` / created on first query (Firestore will emit the index-creation link).

### 2.3 Read cost
A day's inbound = the lines confirmed that day (tens to low hundreds). Trivial. On-demand load per date pick.

### 2.4 Rules for `storeInbound` (append-only audit)
```
match /storeInbound/{docId} {
  allow read: if isApproved();                 // 조회 개방(열람 정책) — 아래 open question 참고
  allow create: if isApproved() && (
    isAdmin() ||
    (request.resource.data.storeId != '' &&
     request.resource.data.storeId == userDoc(request.auth.uid).storeId)
  );
  allow update, delete: if false;              // 불변 이력 (activityLogs/storeSales 선례)
}
```
- **create** gated exactly like `storeStock` write (own-store staff or admin) — an inbound record is written by whoever performed the inbound.
- **immutable** (update/delete blocked) — matches the audit-log convention. A correction is a *new* reverse record later, not a mutation.
- **read = all approved** (viewing-open). ⚠️ Open question below (own-store vs all).

---

## 3. Incoming-Scan Flow (+ cursor management)

### 3.1 Layout (owner mockup)
```
┌─ 입고 스캔 ─ 대상 매장: 부산점 ──────────────────────────┐
│ (1) 바코드 [__________]  [조회]   (2) 수량 [ 1 ]   [이미지] │
│     기존 재고: M 5개   기존 위치: AA-AA-01-03              │
│ (3) 로케이션 [AA-AA-01-03______]  (Enter=등록)            │
├─ 입고 리스트 ────────────────────────────────────────────┤
│ 품번 | 사이즈 | 수량 | 로케이션 | 수정/삭제                │
│ …staged rows (inline-editable qty + location, delete)…    │
│                                   [전체 삭제]  [최종 확정] │
└──────────────────────────────────────────────────────────┘
```

### 3.2 State
- `_inbStore` — target store (resolveActiveStore()).
- `_inbEntry` — the single in-progress item: `null` or `{ code, size, qty, product, location }`.
- `_inbList` — array of staged rows `{ code, size, qty, location }` (in-memory; §5 persistence).

### 3.3 Focus state machine (THE critical UX)
Resting focus = `#inbBarcode`. A USB scanner is a keyboard wedge: it types the barcode then sends **Enter** (CR suffix). So "a scan" = digits + Enter into the focused field.

**On `#inbBarcode` Enter:**
- **Field has a value** → it's a SCAN → run `handleInbScan(value)`, then **clear the field, keep focus in 바코드** (ready for the next scan / qty rescan). Never move focus away on a scan.
- **Field is empty AND `_inbEntry` exists** → it's a COMMIT → run `commitInbEntry()` (mouse-free commit when the location is already pre-filled/correct).
- **Field empty AND no entry** → no-op.

**On `#inbLocation` Enter:** → `commitInbEntry()` (the "type location then register" path from the mockup's "로케이션 → Enter"). After commit, focus returns to 바코드.

This dual commit (empty-barcode-Enter OR location-Enter) keeps the whole flow mouse-free: scan → (rescans for qty) → if location pre-filled just Enter on empty barcode; if location needs typing, Tab to location, type, Enter. **Every path ends with focus back in 바코드.**

`makeDraggableResizable`/modal focus theft: the duplicate popup (§4.4) and any toast must **not** hold focus; on close they call `focusInbBarcode()`.

### 3.4 `handleInbScan(rawBarcode)`
1. `findByBarcode(barcode)` (core.js:824) → `hit = {productCode, size}`. **Null → BLOCK (rule 1, §4.1).**
2. If `_inbEntry` exists:
   - Same `(code,size)` as entry → `_inbEntry.qty++`; re-render entry; **focus 바코드**. (qty-by-rescan.)
   - Different `(code,size)` → **BLOCK (rule 2, §4.2)** — finish current item first.
3. If `_inbEntry` is null:
   - `(code,size)` already in `_inbList` → **DUPLICATE popup (rule 4, §4.4)** — do NOT load the entry.
   - Otherwise → build `_inbEntry = { code, size, qty:1, product, location: existingLoc }` where `existingLoc = getStoreStockLocation(store, code, size)` (pre-fill). Render: 품번/사이즈/이미지/기존 재고(scanned size only, `getStoreStock(store,code)[size]`)/기존 위치. **Focus stays 바코드.**

### 3.5 `조회` button
Manual lookup for a hand-typed barcode: same as a scan of the field's current value (`handleInbScan(#inbBarcode.value)`). For operators who type instead of scan.

### 3.6 Quantity
- Scan-count: repeated same-barcode scans → `_inbEntry.qty++` (§3.4 step 2).
- Typed: `#inbQty` is editable; the operator can overwrite (scan once → qty 1 → type 3). On commit, `qty = Number(#inbQty.value)` (validate ≥ 1 integer).

---

## 4. Strict Blocking Rules (each precise)

| # | Rule | Fires when | Operator sees | Form recovery |
|---|---|---|---|---|
| **1** | Unregistered barcode | `findByBarcode` → null | 🚫 토스트 "미등록 바코드입니다: {bc}" (+ optional copy) | Barcode field cleared, `_inbEntry` unchanged, **focus 바코드** |
| **2** | Different product mid-entry | scan resolves to a `(code,size)` ≠ current `_inbEntry` | 🚫 토스트 "현재 입력 중인 상품을 먼저 등록하세요" | Entry unchanged, scanned barcode discarded, **focus 바코드** |
| **3** | Empty location on commit | `commitInbEntry()` with blank location | 🚫 토스트 "로케이션을 입력하세요", focus → `#inbLocation` | Entry stays, operator types location |
| **4** | Duplicate already in list | scan (form empty) resolves to a `(code,size)` present in `_inbList` | 🔔 팝업 "이미 입고 리스트에 있는 상품입니다 (현재 {qty}개)" + **[추가]** / **[취소]** | see §4.4 |

### 4.1 Rule 1 — unregistered barcode
Block registration entirely. Message includes the raw barcode so the operator can register it later (barcodes are uploaded via the existing Phase-0 barcode flow). Optionally a "복사" affordance.

### 4.2 Rule 2 — different product mid-entry
"Different" = a different `(code,size)` than the current entry — **this includes a different SIZE of the same product** (each barcode = its own line). The operator must commit or clear the current entry before scanning a new item. Prevents accidental mixing.

### 4.3 Rule 3 — empty location
`commitInbEntry` validates `location.trim() !== ''`. Blank → block + move focus to the location field. Location is required for every inbound line (fixed-location is the whole point).

### 4.4 Rule 4 — duplicate at scan (eliminates location conflict)
Because the duplicate is caught **at scan time, before any location entry**, the existing list row's location is authoritative and cannot be contradicted:
- **[추가]** → `_inbList` row `(code,size)`.qty += 1 (the one scan). No new row, no location prompt (location stays the row's). Popup closes → **focus 바코드**.
- **[취소]** → discard the scan, `_inbEntry` stays null, popup closes → **focus 바코드**.
- **Confirmed:** a location conflict is impossible — the duplicate never reaches location entry, so the row keeps its single location and only qty rises. ✅
- **Bulk add to an existing row:** [추가] adds 1 per scan; for +N the operator uses the staging row's **inline qty edit** (§5). (Open question: whether [추가] should add the scanned count vs always +1 — recommend +1, inline-edit for bulk.)

---

## 5. Staging List (입고 리스트)

### 5.1 Structure
Rows `{ code, size, qty, location }`, keyed uniquely by `(code,size)` (dedup guaranteed by rule 4). Columns 품번 | 사이즈 | 수량 | 로케이션 | 수정/삭제.

### 5.2 Inline edit + delete
- **qty**: inline `<input type="number" min="1">` → updates the row (validate ≥ 1). The escape hatch for bulk quantities.
- **location**: inline text input → updates the row's location. (This is the one place a staged location can be changed post-scan — still no conflict, it's the single row's own label.)
- **delete**: removes the row.
- Edits are purely in-memory until 최종 확정 — nothing is written to stock yet.

### 5.3 Temporary until confirm
`_inbList` holds items not yet applied. Stock/location/history are written ONLY on 최종 확정 (§6). This lets the operator scan a whole delivery, review, fix, then commit once.

### 5.4 ⚠️ Persistence (critical — see §9 P6)
`_inbList` is in-memory → a tab switch, page refresh, or the 5-min auto-refresh could wipe a long scanning session. **Recommend: persist `_inbList` to `localStorage` per store** (`lemango_inbound_draft_{storeId}`) on every change, restore on panel open, clear on confirm. Plus a guard on tab-switch/unload if the list is non-empty (mirror `safeCloseModal`).

---

## 6. Final Confirm (최종 확정)

### 6.1 Write plan — ONE atomic batch (stock + location + history together)
Firestore batches span collections, so a single `db.batch()` does all of it atomically:
1. **Group staged rows by `productCode`** (mirror 1e's group-by-code to avoid two writes to the same doc in one batch). For each code, build one `storeStock` merge-set:
   ```js
   batch.set(storeStockRef(code), {
     storeId, productCode: code,
     sizes:         { [size]: increment(qty), ... },   // per staged size of this product
     sizeLocations: { [size]: location, ... },          // per staged size
     updatedAt
   }, { merge: true })
   ```
2. **For each staged line**, one `storeInbound` create (auto-id) with `{storeId, code, size, qty, location, workerUid, workerName, confirmedAt, dateKey, batchId}`.

Total ops = (distinct product codes) + (staged lines). For a typical delivery (tens of lines) this is **well under the 500-op batch limit → one atomic all-or-nothing commit.** No partial-failure window.

### 6.2 Atomicity notes
- `sizes` uses `increment` (concurrency-safe: two staff confirming inbound for the same item both apply). `sizeLocations` overwrite = last-write-wins (§9 P3 — acceptable for fixed location).
- Because it's ONE batch, either the whole confirm lands or none of it does — stock and history never desync.
- **If a delivery exceeds 500 ops** (huge, rare): chunk by code, and on a mid-chunk failure report "N of M 반영됨" and keep the *unconfirmed* rows in the list for retry. Recommend the single-batch path for normal use; document the chunk fallback.

### 6.3 After confirm
`await batch.commit()` → on success: clear `_inbList` + its localStorage draft, `await buildStoreStockIndex(store)` (refresh 1f), toast "입고 확정: N품번 M개", `logActivity('create','매장입고', …)`, focus 바코드. On failure: keep the list, toast error, allow retry (mirror 1e/barcode await-and-branch).
- **Note:** inbound is an operation but **not** in the mandatory-reason category (that's void/refund/forced-adjust per the permission policy). The `storeInbound` record itself is the audit; no reason prompt.

---

## 7. Inbound History View (입고 내역 일자별 조회)

- **Placement:** a toggle **inside the 입고 스캔 panel** — `[📥 입고 스캔 | 📅 입고 내역]` — same domain, keeps the 6-subtab bar unchanged (§8).
- **UI:** date picker (default today) + store context (staff fixed / admin switcher). Query `storeInbound.where(storeId).where(dateKey)` → table **시각 | 품번 | 사이즈 | 수량 | 로케이션 | 작업자** (join 상품명 from `State.allProducts` optional). On-demand load; refresh + date change re-query.
- **Sort:** `confirmedAt` desc (latest first) — client-side sort to avoid a second index.

---

## 8. Store Tab Integration

- **입고 스캔 sub-panel** (STORE_SUBS key `inbound`, currently a 준비중 placeholder in store.js) → the real scan screen + history toggle. Mirror how the `stock` panel (1f) replaced its placeholder in `_storeSubPanelHtml`.
- **Rendering:** `renderStoreInboundScan()` into the inbound panel; called on tab render (if inbound is the active sub) and on `switchStoreTab('inbound')` (mirror the 1f `renderStoreStockView` wiring).
- **New modal:** the duplicate popup — reuse `korConfirm` (utils.js:504, "확인/취소" → relabel **추가/취소**) so no new dialog is needed. Cleaner than a bespoke modal and already focus-safe.
- **Permission gating:**
  - **입고 스캔 (operation)** → own-store staff + admin. Office staff (no store) / no `resolveActiveStore()` → show "배정된 매장이 없어 입고할 수 없습니다" (no scan form). The store rules also block their writes server-side.
  - **입고 내역 (viewing)** → per policy likely all-employees, but it lives inside the operation-gated panel → practically reachable by own-store staff + admin. If the owner wants history open to *everyone* (incl. office staff for any store), it needs a different surface — **open question §10**.

---

## 9. CRITICAL ANALYSIS

### 9.1 Foreseeable problems
| # | Problem | Severity | Why | Mitigation |
|---|---|---|---|---|
| P1 | **Cursor focus lost** (click elsewhere, popup/toast steals focus) → scans type into wrong field | 🔴 | Scanner types into whatever is focused | Explicit `focusInbBarcode()` after every scan/commit/popup-close/list-edit; duplicate popup returns focus on close; toasts must not grab focus |
| P2 | **Enter-key ambiguity** (barcode Enter = scan vs commit) | 🔴 | One key, two meanings | Content-based: non-empty barcode = scan, empty barcode = commit; plus location-Enter = commit. Document + test both paths |
| P3 | **Location overwrite race** — two staff inbound same (code,size) to different shelves at once | 🟡 | `sizeLocations` is last-write-wins (fixed = one location) | Accept last-write-wins (latest is authoritative); both actions recorded in `storeInbound`. Rare at one store |
| P4 | **dateKey timezone** — UTC midnight ≠ local | 🟡 | `toISOString()` is UTC | Derive `dateKey` from **local** Y-M-D at confirm time |
| P5 | **Scanner double-fire** (some scanners emit CR twice or the code twice) → qty +2 | 🟡 | Hardware quirk | Debounce identical `(barcode)` scans within ~60–80ms; the deliberate qty model tolerates it but debounce prevents surprise |
| P6 | **Staging list lost** on refresh / tab-switch / 5-min auto-refresh → re-scan everything | 🔴 | `_inbList` in-memory | Persist draft to `localStorage` per store; restore on open; unsaved-guard on tab-switch/unload |
| P7 | **Partial confirm** (delivery > 500 ops) | 🟡 | Batch limit | Single atomic batch for normal size; chunk + "N of M" recovery only when huge |
| P8 | **1d core contamination** — location accidentally mixed into the stock increment | 🔴 | Same doc holds both | `sizes` (increment) and `sizeLocations` (overwrite) are **separate keys**; stock math never reads `sizeLocations`. Reviewer must verify this invariant in 2a/2c |
| P9 | **Existing 1e docs lack `sizeLocations`** | 🟢 | Pre-Phase-2 seeds | `loadStoreStock` defaults `sizeLocations: d.sizeLocations || {}`; getStoreStockLocation returns '' |
| P10 | **Composite index missing** for history query | 🟡 | Firestore requires it | Add `storeInbound (storeId, dateKey)` to `firestore.indexes.json`; deploy indexes (or click the console link on first query) |
| P11 | **Concurrent inbound stock** by 2 staff same item | 🟢 | — | `increment` is atomic → both apply correctly (this is why 1d used increment) |
| P12 | **Unregistered-but-real barcode** blocks a real inbound | 🟡 | Barcode not uploaded yet | Rule 1 block is correct; surface the raw barcode + point to the barcode-upload flow so they can register then re-scan |

### 9.2 Error minimization
- **Refocus discipline** is the top guard: a single `focusInbBarcode()` helper called at the end of *every* handler.
- **One atomic batch** eliminates stock/history desync and partial-write bugs for normal deliveries.
- **Dedup by (code,size) at scan** eliminates duplicate rows and location conflicts by construction.
- **Draft persistence** eliminates the catastrophic "lost a 200-item scan session."
- **Separate keys** (`sizes`/`sizeLocations`) structurally prevent 1d-core contamination.
- **Validate at the boundary:** qty ≥ 1 integer, location non-empty, barcode resolves — all before anything enters the list or the batch.

### 9.3 Riskiest implementation spots (extra verification)
1. The focus state machine + Enter-key routing (P1/P2) — needs real-scanner testing.
2. The single-batch confirm mixing `increment` (stock) and plain set (inbound) across two collections (P8) — verify the batch applies both and the stock key is never a plain number.
3. `dateKey` local-date derivation (P4).
4. Draft persistence + restore + the auto-refresh interaction (P6) — the 5-min `setInterval` in `initApp` skips when an input is focused (main.js guard), which *helps* during active scanning, but a paused session with focus elsewhere is still at risk → draft persistence is the real fix.

### 9.4 What the owner / Claude.ai might have missed
- **Staging-list fragility (P6).** The in-memory list + the existing 5-min auto-refresh + tab-switching is a real data-loss risk for a long scan session. Draft persistence wasn't in the spec; strongly recommend it.
- **Enter-key ambiguity (P2).** "Cursor stays in barcode" + "Enter registers" needs a concrete rule for what barcode-Enter means when the field is empty vs full. Designed here (content-based) but the owner should confirm the exact keying.
- **dateKey timezone (P4).** A late-night inbound must not land on the wrong day in the history view.
- **Duplicate [추가] amount (§4.4).** +1 per scan vs the scanned count — needs an owner call; recommend +1 with inline-edit for bulk.
- **History permission vs placement conflict (§8).** "Viewing open to all" but the history lives inside an operation-gated panel — reconcile.
- **`getStoreStockLocation` / parallel loc index.** Keeping `getStoreStock` byte-identical (so 1f is untouched) argues for a *parallel* location index rather than reshaping the stock index — a small but important design choice.

---

## 10. Phase 2 Sub-Split + Recommended Start + Open Questions

### 10.1 Sub-split (each independently buildable + verifiable)
| Sub-step | Scope | Verification | Depends on |
|---|---|---|---|
| **2a** | Fixed-location data layer: `sizeLocations` in the doc, `setStoreStockLocation` helper, `loadStoreStock`/index include locations, `getStoreStockLocation`, drop vestigial `location`. **No UI.** Rules unchanged (confirm). | Console: `setStoreStockLocation('st1','<code>','M','AA-01')` → doc gains `sizeLocations.M`; `sizes` untouched; `getStoreStockLocation` returns it; 1f still renders. | 1d |
| **2b** | Incoming-scan screen: entry form + scan resolve + cursor/focus state machine + 4 blocking rules + staging list (inline edit/delete) + draft persistence. **In-memory only — no stock writes.** | Scan flow works mouse-free; rules 1-4 fire correctly; list accumulates; qty rescans; draft survives refresh. Nothing written to Firestore yet. | 2a |
| **2c** | Final confirm: one atomic batch (grouped `storeStock` increment + `sizeLocations` + per-line `storeInbound`), `storeInbound` rules + composite index, post-confirm refresh/log/clear. | 최종 확정 → stock increments (verify via 1f), locations set, `storeInbound` docs created; all-or-nothing; rules tested (own-store/admin/office). | 2b, 2a |
| **2d** | Inbound history view: date picker + `storeInbound` query + table + store context, toggle inside the 입고 스캔 panel. | Pick a date → that day's inbound rows shown; admin store-switch works. | 2c |

### 10.2 Recommended start: **2a (data layer)**
Console-testable, zero UI risk, unblocks everything, and it's where the **1d-core-untouched invariant** is established and verified in isolation before any UI depends on it. Rules are unchanged in 2a (the storeStock rule already covers `sizeLocations`), so 2a is a hosting-only deploy; the rules + index land with 2c.

### 10.3 Open questions for the owner
1. **Inbound history permission + placement.** History inside the 입고 스캔 panel (own-store staff + admin) — OR a separately-surfaced view open to all employees? *(Recommend: inside the panel for Phase 2; broaden later if needed.)*
2. **Duplicate [추가] increment.** +1 per scan (bulk via inline edit) — OR add the scanned count? *(Recommend +1.)*
3. **Commit keying.** Confirm the operator's exact keys: location-Enter registers, and empty-barcode-Enter also registers (mouse-free when location is pre-filled). *(Recommend supporting both.)*
4. **Staging draft persistence.** Persist the in-progress list to localStorage so a refresh/tab-switch doesn't lose a scan session? *(Strongly recommend yes.)*
5. **Partial confirm.** Single atomic batch (recommend) — OK that a >500-op mega-delivery chunks with "N of M" recovery? *(Recommend, rare.)*
6. **dateKey.** Store-local date for the history day-bucket. *(Recommend.)*
7. **"Different product mid-entry" includes a different SIZE of the same product** (each barcode = its own line) → blocked mid-entry. Confirm this matches the owner's intent.

---

*End of design document. No code changed, nothing deployed. Awaiting owner + Claude.ai review before an implementation work order for sub-step 2a.*
