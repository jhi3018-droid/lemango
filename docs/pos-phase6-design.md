# POS Phase 6 — DEEP DESIGN: Stock Adjustment · Outbound · Defective Stock · Unified Stock Ledger

> **DESIGN DOCUMENT — NO CODE.** Owner reviews (via Claude.ai Korean summary) → answers the open questions (§8) → implementation follows in the sub-steps (6a–6e).
> Relay note: this doc is long — **paste to Claude.ai in chunks by `##` section**.

```
========================================
📋 작업 결과 / REPORT START
========================================
```

## 0. Executive Summary (read this first)

Four features, one system. The **unified ledger view (feature 4) is the architectural driver** — its query needs decide where the other three store their records. Three decisions dominate:

1. **Record architecture — RECOMMENDATION: broaden the existing `storeInbound` collection into a per-line "stock-movement ledger"** (add `moveType` + signed `stockDelta`/`defectDelta`), rather than create new per-feature collections. Inbound, outbound, and adjustment are all naturally *per-line* and share one shape; `storeInbound`'s create/cancel rules have **no field whitelist**, so broadening it needs **zero rules changes** — only **one new composite index** `(storeId, productCode, dateKey)`. This maximizes reuse (the 2d 입고내역 view + cancel + Excel generalize for free) and matches the owner's "reuse the inbound scan" instinct. (Alternative: a freshly-named `storeMoves` collection — cleaner semantics, cheap since test data is reset before go-live — offered as **Open Question Q1**.)

2. **Baseline / reconciliation — the hardest problem, answered honestly.** Stock movements **cannot** reconstruct current stock, because the 1e SET upload overwrote `storeStock.sizes` directly and **left no movement record** (confirmed: `store.js:496-504`, only `logActivity('upload',…)`). So the unified view treats `storeStock.sizes` as the authoritative *current* balance and reconciles it against **a one-time admin "기준 재고 스냅샷" (baseline) movement per (product,size)** plus all movements after it: `storeStock.sizes[sz] == baseline + Σ stockDelta(after baseline)` becomes an exact invariant. Before a baseline exists, the view is transparent: "기록 시작 이후 변동분만 · 실재고 대비 비교 불가(기준 미설정)". Going forward, the 1e upload should also emit ledger records so seeds stop being invisible.

3. **Per-product sales query is structurally impossible cheaply** (sale lines are embedded arrays in the transaction doc — `store.js:1838, 2375`). The unified view therefore reads sales via a **period-scoped ranged scan** of `storeSales (storeId, dateKey)` + client-side `lines[]` filter for the product (MVP, no change to the deployed sale path), with an **optional exact upgrade (6e)** that mirrors each sale/void line into the movement ledger inside the existing atomic batch. **Open Question Q5.**

**Sub-split & order:** **6a 재고수정(anchor — establishes the ledger schema)** → **6b 반출(scan-direction, trivial once the ledger exists)** → **6c 불량재고(second stock bucket)** → **6d 입출고 현황(consumes everything + baseline/reconciliation)** → **6e (optional) 판매 미러(exact all-time reconciliation)**. Justification in §8.

All four features keep the non-negotiables: **atomic batch/transaction, mandatory reason + audit record (WHO/WHEN/WHAT/REASON, §1.2), per-store isolation, KST utility, integer math, double-confirm guard, draft persistence, no inline `display:none`.**

---

## 1. Record Architecture — THE Decision (designed against feature 4 first)

### 1.1 The structural facts (from real code)
- **`storeInbound`** = one immutable doc **per line** `{storeId, productCode, size, qty, location, inboundNo, inboundType, memo, workerUid/Name, confirmedAt, dateKey, batchId (+ cancel fields)}` (`store.js:1161-1171`). Queryable by `storeId` + `productCode` + `dateKey`. Append-only; cancel = field-restricted update (`store.js:1565-1579`, rules `firestore.rules:92-102`).
- **`storeSales`** = one doc **per transaction** with **embedded `lines[]`** (`buildSaleDoc` `store.js:1825-1847`). **NOT queryable by productCode** — you can only fetch by `storeId`+`dateKey` (or `customerPhone`) and scan `lines[]` client-side.
- **`storeStock`** = current balance per `{storeId}_{productCode}`: `{sizes:{7 sizes}, sizeLocations:{}, updatedAt}` (`core.js:1385-1403`). The **1e SET upload writes `sizes` absolutely with no ledger record** (`store.js:496-504`).
- **Rules have no field whitelist** on `storeStock` write (`firestore.rules:50-57`) or `storeInbound` create (`firestore.rules:87-91`) → new fields are rule-safe.
- **Indexes**: `storeInbound (storeId,dateKey)`, `storeSales (storeId,dateKey)`. No productCode index anywhere.

### 1.2 The decision: broaden `storeInbound` → a per-line **movement ledger**
Add three fields to every line doc; keep all existing fields for backward-compat:

| field | meaning |
|---|---|
| `moveType` | `'inbound' \| 'outbound' \| 'adjust' \| 'defect-convert' \| 'defect-restore' \| 'defect-scrap' \| 'baseline'` (and `'sale' \| 'void'` only if 6e mirror is built) |
| `stockDelta` | **signed** integer change applied to `storeStock.sizes[size]` (inbound `+qty`, outbound/scrap-from-sellable `−qty`, adjust `±`, defect-convert `−`, baseline `= current`) |
| `defectDelta` | **signed** integer change applied to `storeStock.defectSizes[size]` (defect ops; `0` for normal moves) |

**Reused/renamed fields:** `inboundNo` → carries any move number (`IN-`/`OUT-`/`ADJ-`/`BSL-…`); keep the name to avoid churn, OR alias to `moveNo` (cosmetic). `inboundType` stays (inbound sub-classification); `moveType` is the primary discriminator. `memo` stays; add mandatory `reason`. Cancel fields unchanged.

**Legacy backfill on read** (existing inbound docs written before 6a): `moveType ??= 'inbound'`, `stockDelta ??= +qty`, `defectDelta ??= 0`. A single helper `_mvNormalize(doc)` applied everywhere the ledger is read (2d view, unified view, reconciliation). This is the one place drift can hide → §7-C3.

**Why this over new collections:** (a) zero rules changes (create rule is field-agnostic; cancel rule's `affectedKeys().hasOnly([5 cancel fields])` already works for any move type); (b) the 2d 입고내역 view + cancel + Excel already query `storeInbound` → they generalize into a "재고 이동 내역" view instead of being rebuilt; (c) one collection = one per-product query for the unified view; (d) matches the owner's reuse instinct. **Cost:** the collection name `storeInbound` is now semantically broader than "inbound" (documented; or rename per Q1).

### 1.3 New composite index (the only new infra for 1–3)
`storeInbound: (storeId ASC, productCode ASC, dateKey ASC)` — serves the unified view's per-product query `where(storeId==).where(productCode==).where(dateKey range)`. The existing `(storeId, dateKey)` index still serves the whole-store 2d history. **One index add; no rule change.**

### 1.4 Alternative considered (rejected as primary)
A brand-new `storeMoves` collection with inbound migrated into it: cleaner name, but requires repointing the deployed 2c/2d/cancel to a new collection and a new rule block + indexes — more churn for the same query shape. Kept as **Q1** (viable because test data is reset before go-live).

---

## 2. Feature 1 — 재고수정 / 실사 조정 (Stock Adjustment) — the anchor

### 2.1 Entry & flow (mirrors inbound scan, but 품번-조회-based)
- Hub button on 매장별 재고현황 (like 입고 스캔): **[🧮 재고수정]** — own-store staff + admin only (gated by `resolveActiveStore()`); office/미배정 → disabled with reason.
- A near-fullscreen window reusing the inbound-scan window machinery (`renderInboundScreen`/staging/draft patterns, `store.js:746-960`), but the entry path is **품번 조회 → 사이즈 선택 → ±수량**, not barcode.
- **🔑 Deliberate difference from inbound:** the lookup shows **ALL 7 SIZES** (`SIZES`), **not** the barcoded-size subset. 실사 must be able to correct *any* stock — including sizes that were never barcoded or never stocked. (Inbound restricts to `_inbBarcodedSizes` `store.js:1630`; adjustment must not.) Flag prominently to whoever builds 6a.

### 2.2 Multi-line staging session
- A staging list identical in spirit to `_inbList`: `[{code, size, delta(signed, ≠0), location, reasonPerLine?}]`.
- **Offsetting entries are valid**: A상품 L:−1 + M:+1 (net 0, mis-size swap) and A↔B swaps (A −1, B +1) are legitimate sessions. **No net-zero block.**
- `+delta` and `−delta` both allowed per line; delta must be a non-zero integer.
- Draft persistence: `lemango_adjust_draft_{store}` (mirrors `_inbDraftKey`, `store.js:711-743`), shape `{v:1, items:[…], reason, memo}`.

### 2.3 Location shown + editable (with the +to-no-location warning)
- Each line pre-fills `getStoreStockLocation(store, code, size)` (`core.js:1486`), editable inline (like inbound location).
- Products/sizes **without** a location are still adjustable (unlike inbound, which blocks empty location — Rule 3 `store.js:944`). Adjustment must **not** hard-block empty location.
- **⚠️ Warning rule (owner said 경고창):** when a line **adds** stock (`+delta`) to a size that currently has **no location**, show a confirm dialog: "이 사이즈에 로케이션이 없습니다. 위치 없이 재고를 추가할까요? (또는 로케이션을 입력하세요)" → **proceed allowed after confirm** (실사 must be recordable), with an inline option to set the location in the same line. Do **not** warn on `−delta` (removing stock needs no location). **Recommendation: warn-and-proceed, not block** (Open Question Q4).

### 2.4 Reason + memo + ADJ number (audit — §1.2 non-negotiable)
- **`reason` mandatory** (non-empty, trimmed) — session-level (one reason per confirm) with optional per-line override. **`memo` optional** free text. **Recommendation: two fields** (reason required + memo optional). Whether `reason` is a free-text field or a dropdown of adjust reasons (실사조정/파손/오등록/기타 — a settings list analogous to `_inboundTypes`) is **Open Question Q2**; recommend free-text for 6a, add a dropdown later.
- **`adjustNo = 'ADJ-' + kstStamp()`** (`core.js:1118`), one per confirm session; `batchId = dateKey + '_' + uid + '_' + Date.now()` groups the lines (mirrors `store.js:1210`). ⚠️ `ADJ-`/`IN-` numbers are **display keys at second granularity** — same-second multi-terminal confirms can duplicate the *display* number (not the doc id — movement docs are auto-id). Acceptable (in-flight guard makes it rare); note in §7-C14.

### 2.5 Atomic confirm
- Per-code storeStock merge-set (mirror `_inbAddCodeToBatch` `store.js:1146-1172`) but with **signed** `sizes[sz] = increment(±delta)`; `sizeLocations[sz]` overwrite **only for lines whose location was set/edited** (don't wipe existing).
- One `storeInbound` movement doc **per line**: `{…, moveType:'adjust', qty:abs(delta), stockDelta:±delta, defectDelta:0, adjustNo(→inboundNo), reason, memo, location, worker, dateKey, batchId}`.
- **Guards:** double-confirm `_adjInFlight` (sync-set before first await, finally-release — `store.js:1198/1272`); confirm-time re-validation (each line code/size present, delta non-zero integer); per-store isolation; `logActivity('adjust','재고수정', …adjustNo/reason)`.
- **Chunking caveat (CRITICAL for offsets):** a chunked batch splits by code boundary (`store.js:1218-1232`). An offsetting session spans **multiple codes** (A −1 / B +1), so a chunk split could apply A but not B → a transient net-nonzero partial state. **Rule for adjustment: never chunk an offsetting session — commit the whole session as ONE atomic batch** (a 실사 session is small, well under the 450-op limit). Only chunk pure single-direction megasessions where partial-apply is safe. §7-C4.

---

## 3. Feature 2 — 반출 (Outbound to logistics/HQ)

### 3.1 Design: reuse the INBOUND SCAN screen with a direction (endorse owner's idea)
- Add a **방향/유형 toggle** to the inbound scan window: **정상입고 (in)** vs **정상반출 (out)**. Same barcode scan UX (cursor state machine, `INB_DEBOUNCE_MS`, 4 blocking rules, staging list, localStorage draft). The only differences at confirm:
  - **입고**: `stockDelta = +qty`, `moveType='inbound'`, `inboundNo='IN-…'`, `inboundType` from the dropdown.
  - **반출**: `stockDelta = −qty`, `moveType='outbound'`, `outboundNo='OUT-…'`; no `inboundType` (or a parallel `outboundType` later).
- Draft keyed by direction: `lemango_inbound_draft_{store}` vs `lemango_outbound_draft_{store}` (separate staging).

### 3.2 Location, negative stock, records
- **Location = reference** (where to *find* the stock to pull). Show it (from `sizeLocations`), but **do NOT write/clear it on outbound** (recommend: no location change — mirrors inbound-cancel's "sizeLocations 안 건드림" `store.js:1573`).
- **Insufficient stock**: **warn-only, proceed allowed** (consistency with the sale policy — negative stock = warning not block). BUT a negative from outbound is more suspicious than from a sale (you're deliberately removing) → the warn dialog should show the resulting negative in red and require an explicit confirm. **Recommendation: warn+confirm, allow** (Open Question Q3). (Offline confirm still blocked, same as sale/inbound.)
- **Records: same `storeInbound` ledger**, `moveType:'outbound'`, `stockDelta:−qty`. This is exactly the owner's "반출 as a direction in the inbound records" idea, realized via `moveType` + signed delta rather than a fragile "negative qty" hack.

### 3.3 History & cancellation integration
- The 2d history view (now "재고 이동 내역") shows outbound rows with a **negative signed qty** and a 반출 badge. Filter by `moveType`.
- **Outbound IS cancellable** via the existing field-restricted cancel pattern (`confirmInbCancel` `store.js:1545-1597`): cancel of an outbound restores `stockDelta` sign-reversed → `increment(+qty)`. The generalized cancel reverses `stockDelta` (and `defectDelta`) rather than assuming `−qty`. Same rule (`firestore.rules:92-102`), same reason-mandatory. §7-C8 covers the "stock since changed" phantom-restore risk (identical to inbound-cancel, already accepted).

---

## 4. Feature 3 — 불량재고 (Defective Stock)

### 4.1 Model — RECOMMENDATION: Option A (parallel map on the same storeStock doc)
Add `defectSizes:{size:qty}` to the storeStock doc, parallel to `sizes`:
```
storeStock/{storeId}_{code} = { storeId, productCode,
  sizes:{XS..F},          // SELLABLE stock (unchanged; sales/inbound/outbound/adjust act here)
  defectSizes:{XS..F},    // DEFECTIVE stock (new; never sellable)
  sizeLocations:{}, updatedAt }
```
- **Rule-safe:** `storeStock` write rule has no field whitelist (`firestore.rules:50-57`) → `defectSizes` needs **no rule change**.
- **Atomic transfers = one merge-set with two increments** (same doc, so naturally atomic):
  - **정상→불량 전환** (`moveType:'defect-convert'`): `sizes:{M:increment(-1)}, defectSizes:{M:increment(+1)}` → `stockDelta:−1, defectDelta:+1`.
  - **불량→정상 복귀** (`defect-restore`): `sizes:+1, defectSizes:−1` → `stockDelta:+1, defectDelta:−1`.
  - **불량 폐기** (`defect-scrap`): `defectSizes:increment(-1)` → `stockDelta:0, defectDelta:−1`.
  - **불량 반출** (defective sent to HQ): `defectSizes:increment(-1)` → `stockDelta:0, defectDelta:−1`, `moveType:'outbound'` with a defect flag (or `defect-scrap` with a reason 'HQ반출'). Supported.
- **Rejected Option B (separate collection):** transfers between sellable and defect would span two docs → need a transaction for atomicity, and the unified view would query two stock sources. Option A keeps transfers single-doc-atomic and reconciliation two-bucket-but-colocated.

### 4.2 Sale isolation (verify: no change needed)
Confirmed: sale confirm (`store.js:2373-2382`) and void only `increment` on `sizes` — **never `defectSizes`**. So **selling can never touch defective stock; no change to the deployed sale/void path.** A size fully defective (`sizes:0, defectSizes:2`) shows sellable 0 → sale is naturally blocked/warned. ✅

### 4.3 Operations home & display
- **UX home = the adjustment flow** (feature 1). 정상↔불량 전환 / 폐기 are **adjustment move types** selected per line (a small "유형" selector on each adjustment line: 조정 / 정상→불량 / 불량→정상 / 불량폐기). This reuses the whole adjustment session/confirm/audit machinery — no separate screen. Reason mandatory (파손/오염/불량판정 등).
- **1f display:** show defect counts without cluttering the sellable grid. **Recommendation:** a subtle 불량 badge on rows with `defectSizes>0` + full per-size defect breakdown in the shared product-detail modal (`openStoreProductDetail` `store.js:604-651` — add a "불량" column next to 재고/로케이션). Whether 1f gets a dedicated 불량 column is **Open Question Q7**.
- **Audit:** every defect transfer emits a movement doc (reason + WHO/WHEN) like all corrections.

### 4.4 Reconciliation with two buckets
Reconciliation runs **per bucket**: `expected sellable = baseline.sellable + Σ stockDelta`; `expected defect = baseline.defect + Σ defectDelta`. A defect-convert writes both deltas in one movement doc → both buckets stay reconcilable. §7-C10.

---

## 5. Feature 4 — 입출고 현황 (Unified Stock Ledger View) — the capstone

### 5.1 What it shows
Per **store + product** (+ optional size) + **period**: every movement in time order — 입고(+), 판매(−), 판매취소(+), 반출(−), 재고수정(±), 불량전환(sellable±/defect±) — each row: 일시(KST), 유형, ±수량(sellable), ±불량, 번호(IN/OUT/ADJ/SL/…), 작업자, 사유/메모, 취소여부. Viewing = **all employees** (조회 개방). Excel export (one row per movement).

### 5.2 Query strategy (be honest about the hard part)
Two heterogeneous sources — **there is no single cheap query**:

**(A) Non-sale movements** — one indexed query on the broadened `storeInbound`:
`where(storeId==store).where(productCode==code).where(dateKey>=start).where(dateKey<=end)` → uses the **new `(storeId, productCode, dateKey)` index** (§1.3). Cheap: reads only that product's movements. Returns inbound/outbound/adjust/defect.

**(B) Sales movements** — **structurally cannot be queried per-product** (embedded `lines[]`). Options, in order of recommendation:
- **(B-MVP) Ranged scan + client filter:** `where(storeId==store).where(dateKey range)` on `storeSales` (existing index) → fetch all sale/void docs in the period → keep only lines matching `productCode`. **Read cost = total sales in the period, not the product's sales** — acceptable for a period-scoped per-product view, honestly stated to the owner. No change to the deployed sale path.
- **(B-EXACT, 6e) Movement mirror:** retrofit 3c/3e so each sale/void line also writes a `storeInbound` movement doc (`moveType:'sale'/'void'`, `stockDelta:−qty/+qty`) **inside the existing atomic batch**, with a **deterministic id** `mv_{saleNo}_{code}_{size}` so retries stay exactly-once (a retry re-sets the same id → denied → whole batch denied, consistent with 3c). Then source (B) collapses into source (A) — one cheap per-product query, exact all-time reconciliation. Cost: touches the money-critical (but well-tested) sale path; isolated as sub-step 6e with its own review. **Open Question Q5.**

Merge (A)+(B) client-side, sort by `at` (soldAt/voidedAt/confirmedAt), apply the legacy backfill `_mvNormalize`.

### 5.3 🔴 Baseline & reconciliation (the hardest conceptual problem)
**The problem:** `storeStock.sizes` is the authoritative current balance, but it was **seeded by the 1e SET upload with no movement record** (`store.js:496-504`) and may predate all records. So `Σ movements ≠ current stock` by an unknown opening balance. Movements alone **cannot** reconstruct absolute stock.

**The design (honest, exact-where-possible):**
1. **Baseline snapshot operation** (admin, one-time per store, repeatable per product if needed): writes a `moveType:'baseline'` movement per `(product,size)` with `stockDelta = current storeStock.sizes[sz]`, `defectDelta = current defectSizes[sz]`, dated now, `reason:'기준 스냅샷'`. After this, the invariant holds **exactly**: `storeStock.sizes[sz] == Σ stockDelta(baseline + all moves after it)`.
2. **Reconciliation check in the view:** compute `expected = Σ stockDelta(movements in view, including the baseline if the period covers it)` and compare to `actual = getStoreStock(store,code)[sz]` (+ defect bucket). **Match → green "장부=실재고 ✓". Mismatch → red flag** (a write bypassed the ledger, a legacy-backfill error, or the period excludes the baseline).
3. **Before a baseline exists (or a product never baselined):** show honestly — "**기록 시작 이후 변동분만 표시 · 실재고 {X} · 기준 미설정(비교 불가)**". Never fake a reconciliation.
4. **Close the seed gap going forward:** make the 1e stock-upload (`confirmStoreStockUpload` `store.js:456-522`) **also emit ledger movements** — SET → a `baseline`/`reset` movement (stockDelta = the absolute set value, or the delta from prior), ADD → an `adjust`/`inbound` movement. Then seeds stop being invisible. (Small addition to 6d or a 6a-adjacent patch.)

**Recommendation:** run the baseline snapshot **once, right after 6d deploys** (admin action); everything after is exactly reconcilable. This is **Open Question Q6**.

### 5.4 Running balance & discrepancy flag
Sort movements ascending; running balance starts at 0 (or at the baseline value if the period begins at the baseline). Each row shows the post-move running balance for sellable (and defect). The final running balance is compared to `storeStock` (§5.3-2). A per-row negative running balance is highlighted (like 1f's `ssv-neg`).

### 5.5 Excel
One row per movement: 일시 | 유형 | 품번 | 사이즈 | ±수량(sellable) | ±불량 | 잔량(running) | 번호 | 작업자 | 사유 | 메모 | 상태(정상/취소). Reuse the `downloadInbHistory` conventions (`store.js:1486-1503`) + the KST `kstFormat` display.

### 5.6 Read cost summary (honest)
- Per-product view: **1 indexed movement query** (cheap) + **1 ranged sales scan** (cost ∝ store's total sales in the period, B-MVP) → pick sensible default periods (e.g., 1 month) and cap. With 6e, the sales scan disappears.
- Whole-store daily view (all products): not designed as a single cheap query — the movement side is fine `(storeId, dateKey)`, but sales scan is the same cost. Recommend the primary view be **per-product**; a whole-store daily is a secondary, period-tight view.

---

## 6. Rules + Index Plan (deploy sequencing)

| Sub-step | New rules? | New indexes? | Deploy command |
|---|---|---|---|
| **6a** 재고수정 + ledger broadening | **None** (storeInbound create/cancel rules are field-agnostic; `defectSizes`/`stockDelta` are new fields with no whitelist) | **`storeInbound (storeId, productCode, dateKey)`** | `firebase deploy --only firestore:indexes,hosting` |
| **6b** 반출 | None | None (reuses 6a) | `--only hosting` |
| **6c** 불량재고 | None (`defectSizes` field on storeStock — no whitelist) | None | `--only hosting` |
| **6d** 입출고 현황 + baseline | None | None new (per-product uses 6a index; sales uses existing `(storeId,dateKey)`) | `--only hosting` |
| **6e** (opt) 판매 미러 | None (movement docs = storeInbound create rule) | Possibly none | `--only hosting` |

- **If Q1 = new `storeMoves` collection instead of broadening storeInbound:** 6a additionally needs a **new rules block** (copy `storeInbound`'s create + field-restricted cancel-update + `delete:if false`) and **its own indexes** → `firebase deploy --only firestore:rules,firestore:indexes,hosting`. This is the main cost of Q1.
- **OR-union safety:** no `sharedData` docId additions needed unless a new settings list (adjust-reason dropdown, Q2) is added — then follow the `stores`/`inboundTypes` pattern (exclude the docId in the general `sharedData/{docId}` write rule `firestore.rules:31` + add a dedicated admin-write block `firestore.rules:35-44`).
- **Reason cannot be rules-enforced on storeStock** (reason lives on the movement doc, not the storeStock write) → reason/audit is client-enforced + the movement record; same trust model as `sharedData` client-validation (§2.3). §7-C13.

---

## 7. CRITICAL ANALYSIS (15 items — severity · mitigation)

- **C1 — Per-product sales query impossible [HIGH].** Embedded `lines[]` (`store.js:1838`). Mitigation: B-MVP ranged scan (period-scoped, honest cost) or 6e mirror for exact/cheap. Do not hand-wave — the unified view's sales completeness is period-bounded until 6e.
- **C2 — Baseline drift [HIGH].** 1e SET left no record (`store.js:496-504`); movements can't reproduce absolute stock. Mitigation: baseline snapshot (§5.3) + make future uploads emit movements. Until a baseline exists, reconciliation is honestly "비교 불가".
- **C3 — Legacy `storeInbound` docs lack `moveType`/`stockDelta` [HIGH].** A wrong backfill silently miscounts reconciliation. Mitigation: one audited `_mvNormalize` (moveType→'inbound', stockDelta→+qty, defectDelta→0) used everywhere; unit-verify against a known legacy doc.
- **C4 — Offsetting-session partial apply [HIGH].** Chunking by code boundary (`store.js:1218-1232`) could apply A−1 but not B+1 → transient net-nonzero + wrong stock if the second chunk fails. Mitigation: adjustment offsetting sessions commit as **one atomic batch, never chunked** (small sessions); only chunk pure single-direction megasessions.
- **C5 — Adjustment must allow non-barcoded sizes [MED].** Unlike inbound (`_inbBarcodedSizes` `store.js:1630`). Risk: adjusting a never-stocked size. Accept (실사 fixes any stock); lookup shows all 7 SIZES.
- **C6 — +delta to no-location size [MED].** Owner wants 경고창. Mitigation: warn+confirm+proceed (not block), with inline location set. Blocking would make 실사 un-recordable. (Q4)
- **C7 — Outbound insufficient stock [MED].** Negative from a deliberate removal is more suspicious than from a sale. Mitigation: warn+explicit-confirm (red negative preview), allow (consistency) — or block (Q3). Offline confirm blocked as usual.
- **C8 — Outbound-cancel phantom restore [MED].** If stock changed since the outbound, cancel's `+qty` can overshoot (identical to inbound-cancel `store.js:1531-1536` negative-preview). Mitigation: same result-preview + it's warn-only; append-only record preserved.
- **C9 — Defect/sale isolation [LOW, verify].** Sale only touches `sizes` (`store.js:2373-2382`) → defect safe, no code change. Verify no future code reads `defectSizes` into sellable math.
- **C10 — Two-bucket reconciliation & convert races [MED].** defect-convert writes both `sizes−`/`defectSizes+` in one merge-set (atomic per doc). Concurrent converts on the same size: both `increment` merge safely (commutative), but the reconciliation snapshot is point-in-time. Mitigation: per-bucket expected/actual; refresh reconciles.
- **C11 — Unified-view read cost [MED].** Ranged sales scan cost ∝ store volume, not product. Mitigation: default period cap (e.g., 1 month), per-product primary view; 6e removes the scan.
- **C12 — Reconciliation transient mismatch [LOW].** A sale landing between reading movements and reading storeStock shows a transient red flag. Mitigation: read storeStock last / note "실시간 변동 중일 수 있음 — 새로고침"; not a data error.
- **C13 — Reason enforcement is client-only for storeStock [MED].** Rules can't check that a stock decrement has a reason (reason is on the movement doc). A console-level own-store write could bypass the ledger. Mitigation: accept (same trust model as §2.3 sharedData); client transaction always writes movement+reason; `logActivity` audit. Optionally 6e-style: never write storeStock without a movement in the same batch (client discipline, not rule-enforceable).
- **C14 — Move-number (ADJ/OUT/IN) same-second collision [LOW].** These are display/business keys at second granularity (`kstStamp`), not doc ids (docs are auto-id). Multi-terminal same-second could duplicate the *display* number. Non-fatal (records are distinct by auto-id + batchId). Mitigation: optional ms/counter suffix (reuse the generateSaleNo lesson) if it ever matters.
- **C15 — Draft/session isolation [LOW].** Adjust/inbound/outbound each need separate per-store draft keys (`lemango_adjust_draft_{store}`, `_inbound_`, `_outbound_`) so switching mode/store doesn't cross-contaminate staging (mirror `_inbDraftKey` `store.js:711`).

---

## 8. Sub-split + Recommended Order + Open Questions

### 8.1 Sub-split (each independently buildable + verifiable)
- **6a — 재고수정(Adjustment) + ledger broadening [ANCHOR].** Broaden `storeInbound` (moveType/stockDelta/defectDelta + `_mvNormalize` backfill); new index `(storeId,productCode,dateKey)`; adjustment window (품번-조회, all sizes, ±, offsets, location edit+warning, ADJ number, reason+memo, atomic single-batch confirm, double-confirm guard, draft). Generalize the 2d 입고내역 view to show `moveType`/signed qty. **Verify:** ±/offset/net-zero sessions, atomic-all-or-nothing, reason mandatory, per-store, legacy inbound rows still render.
- **6b — 반출(Outbound).** Direction toggle on the inbound scan window; `moveType:'outbound'`, `stockDelta:−qty`; OUT number; insufficient-stock warn; cancellable (generalized reversal). **Verify:** deduction, negative warn, history shows negative, cancel restores.
- **6c — 불량재고(Defect).** `defectSizes` on storeStock; defect move types in the adjustment flow (전환/복귀/폐기/반출); 1f/detail-modal display; per-bucket audit. **Verify:** atomic two-increment transfer, sale isolation, defect display, reconciliation both buckets.
- **6d — 입출고 현황(Unified view) + baseline.** Per-product query (movements) + ranged sales scan (B-MVP) + merge/sort; baseline snapshot op; reconciliation (expected vs actual, discrepancy flag) + honest "기준 미설정"; running balance; Excel; make 1e upload emit movements. **Verify:** running balance, baseline invariant exact after snapshot, discrepancy flags a deliberately-injected out-of-ledger write.
- **6e — (OPTIONAL) 판매 미러(exact).** Retrofit 3c/3e to mirror sale/void lines into the ledger (deterministic id, same atomic batch). Collapses the sales scan into the per-product query; exact all-time reconciliation. **Verify:** exactly-once preserved (retry no double), mirror matches sale, unified view no longer needs the scan.

### 8.2 Recommended order & justification
**6a → 6b → 6c → 6d → (6e).** 6a is the anchor because it **defines the movement-ledger schema** that outbound, defect, and the unified view all conform to — building it first prevents schema rework. 6b is trivial once the ledger + scan exist (just a sign + direction). 6c adds the second stock bucket (defectSizes + defectDelta) that the ledger schema already reserved. 6d consumes everything and needs 6a's index + 6b/6c's move types to be meaningful. 6e is an isolated, optional exactness upgrade to the money-critical sale path — deliberately last and behind its own review. (Matches the owner's stated instinct: adjustment → outbound → defect → unified.)

### 8.3 Open Questions for the owner (each with my recommendation)
- **Q1 — 이동 원장 컬렉션:** 기존 `storeInbound`를 확장(내 추천 — 마이그레이션 0, 규칙 변경 0, 2d 뷰 재사용) vs 새 `storeMoves` 컬렉션(이름 명확하나 규칙블록+인덱스 신설, 입고 경로 재배선). 테스트 데이터 리셋 예정이라 둘 다 가능. **추천: 확장.**
- **Q2 — 조정 사유 입력:** 자유 텍스트 필수(내 추천, 6a) vs 드롭다운(설정에 '조정사유' 목록, inboundType처럼 — 6a 이후 옵션). **추천: 자유 텍스트 필수 + 메모 선택, 드롭다운은 후속.**
- **Q3 — 반출 재고부족:** 경고+확인 후 진행(내 추천, 판매와 일관) vs 차단. **추천: 경고+명시적 확인 후 허용(음수 빨강 미리보기).**
- **Q4 — +조정 시 로케이션 없음:** 경고+진행(내 추천, 실사 기록 가능해야 함, 인라인 위치 설정 제공) vs 차단. **추천: 경고+진행.**
- **Q5 — 통합뷰의 판매:** 기간 스캔 MVP(내 추천 먼저 — 판매 코드 무변경, 기간 한정) vs 판매 미러(6e, 전기간 정확·저비용, 3c/3e 개조). **추천: MVP로 시작, 필요 시 6e.**
- **Q6 — 기준 재고 스냅샷:** 6d 배포 직후 관리자 1회 실행(내 추천). 그 전/미설정 상품은 "기준 미설정(비교 불가)"로 정직 표시. **추천: 6d 직후 1회.**
- **Q7 — 1f 불량 표시:** 상세 모달 + 합계 배지(내 추천) vs 1f에 전용 불량 컬럼. **추천: 배지 + 상세 모달, 컬럼은 선택.**
- **Q8 — 반출/조정 취소 권한:** 입고취소와 동일(관리자 OR 본인 매장, 사유 필수). **추천: 동일 규칙 재사용(코드/규칙 그대로).**

```
========================================
✅ 작업 결과 끝 / REPORT END
========================================
```
