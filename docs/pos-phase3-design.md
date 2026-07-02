# POS Phase 3 — Design: Sale Registration + Same-Day Void + Sales Ledger

**Status:** DESIGN ONLY — no code changed, nothing deployed. For owner + Claude.ai review.
**Date:** 2026-07-02
**Builds on:** 1d (atomic storeStock core), 2c (atomic cross-collection confirm batch), inbound-cancel (runTransaction check-and-set), inbound history (range query + composite index), inbound logistics hardening (types, normalization).
**Foundation invariants (never violated):** stock changes ONLY via `FieldValue.increment` inside ONE atomic batch/transaction; never read-modify-write; never absolute. The sale is 2c's mirror image — **minus instead of plus**.

---

## 0. Executive Summary — the key recommendation

- **Ledger model: APPEND-ONLY, transaction-level document, void = new reversing record.** Keep the deployed `storeSales` rule (`update/delete: if false`) — the ledger stays a true immutable money ledger. A sale is one doc (receipt with a `lines[]` array); a void is a separate `type:'void'` doc with a **deterministic id** `void_{saleDocId}` that makes double-void structurally impossible and needs **no rule change to the update/delete lockdown** (only a small *create-time* refinement to enforce void reason + `voidedBy == auth.uid`).
- **Why not the inbound-cancel update-with-flag approach:** inbound is not money; sales settlement/refund is audited cash. The deployed rule + its own comment ("취소/환불은 새 레코드로 기록") already mandate append-only. Void-as-record is the audit gold standard and avoids opening the ledger to updates.
- **Sale screen: direct in the 판매 sub-tab** (not a modal) — it is the store's primary activity. Reuses inbound's cursor/IME/debounce/banner/draft assets; the key flow delta is **scan = immediately add/merge a sale line** (no location step, no one-at-a-time in-progress entry).
- **Stock deduction: `increment(-qty)` per (code,size), atomic with the ledger write**, target store = `resolveActiveStore()`. Negative stock allowed (warn-only). Per-store separation proven at 3 layers (§4).
- **Money math: integer KRW only, no floats.**
- **Deploys needed:** `firestore.rules` (storeSales create refinement) + `firestore.indexes.json` (storeSales composite index) + hosting.
- **Sub-split:** 3a ledger+rules+index → 3b sale screen+draft → 3c atomic confirm → 3d sales history → 3e void. Start with **3a**.

---

## 1. Sale screen flow + cursor state machine (deltas vs inbound)

### 1.1 Placement
- Lives **directly in the 판매 sub-tab** (`STORE_SUBS[0]`, `store.js:12`, currently a "준비중" placeholder), not a window launched from 재고현황.
- Rationale: 판매 is the store's own tab and primary activity; a near-fullscreen in-tab panel fits better than a modal. (Inbound became a window only because it launched from the 재고현황 hub.)
- Permission gate = operation: own-store staff + admin. `resolveActiveStore()` (`core.js:863`) null (office/미배정) → block panel with "배정된 매장이 없습니다 — 판매 불가" (mirror inbound gate).

### 1.2 Reuse map (shared vs parallel)
| Asset | Inbound (2b) | Sale (3b) | Decision |
|---|---|---|---|
| Cursor discipline (resting focus 바코드, refocus everywhere) | `_inbFocusBarcode` | same pattern | **Parallel** (`_saleFocusBarcode`) — separate DOM ids |
| IME guard (compositionstart/end + isComposing) | onInbBarcodeKey | same | **Parallel**, same logic |
| Scanner debounce (60ms CR+LF) | INB_DEBOUNCE_MS | same | **Parallel** |
| In-panel error banner | `_inbShowBanner` | `_saleShowBanner` | **Parallel** (banner lives in sale panel) |
| Toast-above-modal | `showToast` reparent | reused as-is | **Shared** (already global) |
| Draft persistence per store | `lemango_inbound_draft_{store}` | `lemango_sale_draft_{store}` | **Parallel** (separate key) |
| Barcode resolution | `findByBarcode` | same | **Shared** |
| 품번조회 lookup | `openInbLookup` → `_inbBeginEntry` | `openSaleLookup` → `_saleAddLine` | **Parallel pipeline** (see §1.4) |
| Double-confirm guard | `_inbInFlight` | `_saleInFlight` | **Parallel**, same pattern |
| KST helpers | `_inbDateKeyKST` | reused | **Shared** (promote to core if cleaner) |

**Recommendation:** *parallel, not shared,* for the scan/line logic. Inbound's `_inbBeginEntry` has a location step + one-at-a-time in-progress entry + Rule 2/3/4 semantics that sales does NOT have. Forcing a shared function would destabilize the audited inbound path. Share only pure helpers (`findByBarcode`, `showToast`, `normalizeLocation` [n/a for sale], KST date). Promote `_inbDateKeyKST`/`_inbInboundNo`-style generators to generic `core.js` helpers (`posDateKeyKST`, `posSeqNo(prefix)`) so both use one implementation without coupling.

### 1.3 Cursor state machine (deltas)
Resting focus = `#saleBarcode`. States are simpler than inbound (no IN_PROGRESS entry):
| Event | Action | End focus |
|---|---|---|
| Barcode Enter (value) | resolve → **add/increment sale line immediately** | 바코드 |
| Barcode Enter (empty) | no-op | 바코드 |
| Same (code,size) re-scan | line qty +1 (merge) | 바코드 |
| Unregistered barcode (Rule 1) | banner "등록되지 않은 바코드", clear | 바코드 |
| 조회 button | open 품번조회 → pick → add line | 바코드 |
| Inline qty / 할인단가 edit | update line + totals + draft | (field) |
| Per-line delete | remove line + totals | 바코드 |
| 판매 확정 | atomic batch → clear + refresh | 바코드 |

**KEY DELTA vs inbound:** a scan **adds/increments a list line immediately** — there is NO location step and NO in-progress single-entry buffer. Same (code,size) merges into one line (qty++). This means **no Rule 4 duplicate popup** (merge is silent — analyzed & confirmed: for a register, a re-scan is the normal "another one" gesture; a popup would slow the cashier). Only **Rule 1 (unregistered barcode) blocks**. Rule 2/3 (from inbound) do not exist here.

### 1.4 품번조회 (lookup) — parallel pipeline
- `openSaleLookup(seed)` mirrors `openInbLookup` (search 품번/상품명, barcode-registered sizes only — same policy, `_inbBarcodedSizes` logic reused/paralleled), but on size pick it calls `_saleAddLine(code, size)` instead of `_inbBeginEntry`.
- `_saleAddLine(code, size)` = the sale's convergence point: barcode scan AND lookup both call it → one place adds/merges a line. (This mirrors inbound's "one converged entry-point" lesson without sharing inbound's function.)

### 1.5 Scanned-product card
Image + 품번 + size badge + **판매가** (product.salePrice) + **할인가** (Phase 3: store discount = 0; Phase 5 fills) + **현재 재고** of that size (`getStoreStock(store, code)[size]`), **red if ≤0** (the oversell warning point). Mirror inbound's big card.

---

## 2. storeSales ledger data model — THE KEY DECISION

### 2.1 Decision A — Append-only vs rule-opened-update → **APPEND-ONLY (void = new record)**
| | Append-only void record (RECOMMENDED) | Rule-opened update-with-flag (inbound-cancel style) |
|---|---|---|
| Rule impact | Keep `update/delete: if false`; only refine *create* (void reason + voidedBy) | Must open `update` on storeSales (ledger no longer immutable) |
| Audit | Gold standard — original never mutated, void is its own dated/signed record | Original doc mutated (flag added) |
| Deployed rule intent | Matches it exactly (comment: "취소/환불은 새 레코드로 기록") | Contradicts it |
| Read cost | history fetches sale+void docs in range, joins client-side (Set of voided ids) | history reads sales, flag inline (no join) |
| Double-action defense | deterministic `void_{saleDocId}` + transaction existence check | transaction + `cancelled!=true` |
| Refund (Phase 4) | natural — refund is another reversing record | awkward — more flags |
**Verdict: append-only.** The join is cheap (one range query returns both types; build a `Set(voidedSaleIds)` in one pass). Money ledgers should never be updated in place. The tiny extra read-side join is worth the immutability + zero-update-surface.

### 2.2 Decision B — Doc granularity → **TRANSACTION-LEVEL doc (one per checkout, `lines[]` array)**
| | Transaction-doc (RECOMMENDED) | Line-docs (storeInbound style) |
|---|---|---|
| Model fit | Natural receipt; 1 doc = 1 sale | N docs per sale |
| 매출 조회 aggregation | 1 read per sale to sum totals | N reads per sale |
| Whole-transaction void | 1 void doc reverses all lines | N void docs |
| saleNo grouping | inherent (the doc) | needs batchId join |
| Partial refund (Phase 4) | refund record refs saleId + line index | per-line refund doc |
| 500-op batch limit | 1 ledger doc + distinctCodes stock docs (checkout ≪ 500) | N ledger + stock docs |
**Verdict: transaction-doc.** A checkout is a receipt. Daily revenue = sum of sale-doc `totals` (few reads). Partial refund (Phase 4) references `{saleId, lineIdx}` in a refund record — the transaction-doc doesn't block it.

### 2.3 Field spec (`storeSales/{autoId}`) — ⚠️ AS-IMPLEMENTED in 3a (builder is source of truth; names updated from the original sketch to match `js/store.js` `buildSaleDoc`)
```
{
  type: 'sale',                         // 'sale' | 'void'  (void = §7)
  saleNo: 'SL-YYYYMMDD-HHMMSS',          // human/business key (KST), display
  storeId: 'st1',                       // ⚠️ every doc — rules + per-store + query
  lines: [                              // the receipt
    { productCode, size, qty,           // ← productCode (not `code`) — matches store.js productCode convention
      unitPrice,                        // 단가 (snapshot of product.salePrice at scan — integer KRW)
      unitDiscount,                     // 할인단가 (per-line, integer; 0 in Phase 3 manual)
      lineNormal,                       // 정상가 = unitPrice*qty
      lineDiscount,                     // 할인가 = unitDiscount*qty
      lineTotal,                        // 판매가 = lineNormal - lineDiscount
      discountSource                    // 'manual' (Phase 3) | 'store-discount' (Phase 5)
    }, ...
  ],
  totals: { total, discountTotal, qtyTotal },   // 합계 / 할인합계 / 수량합계 (integer)
  payMethod: '카드',                    // 카드(default)|현금|계좌이체|기타 (Korean labels, as stored)
  customerPhone: '01012345678'|'',      // normalized digits only (적립금 대사용); masked in general lists
  workerUid, workerName,                // WHO
  soldAt,                               // ISO (UTC)
  dateKey,                              // 'YYYY-MM-DD' KST  → range query + index
}
// void records (storeSales/void_{saleDocId}, type:'void') — see §7:
//   originalSaleId, originalSaleNo, storeId, lines[], totals{}, voidReason, voidedBy, voidedByName, voidedAt, dateKey, customerPhone
```
- **Field-name note (reviewer-flagged):** 3a's builder uses `productCode / unitDiscount / lineTotal / totals.{total,discountTotal,qtyTotal} / voidReason`. **3b/3d/Excel MUST use these exact names** (the builder is authoritative). This spec block is now aligned to the code.
- Stored `totals` are denormalized for fast aggregation; also recomputable from `lines` (validation on read/import).
- **All amounts integer KRW.** Line math is integer×integer → integer; no division, no float. `Math.round` never needed (no percentages stored; Phase 5 discount will store the resolved integer `discountUnit`, not a rate — so no float enters the ledger).

### 2.4 saleNo
`SL-` + `YYYYMMDD-HHMMSS` (KST, via the shared `posDateKeyKST`+time generator). Business/display key; the Firestore doc id stays an auto-id (unique). Second-granularity collisions are display-only and harmless; the doc id is the true key.

---

## 3. Atomic sale confirm batch

### 3.1 Op math & shape (mirror 2c `_inbAddCodeToBatch`)
- Group sale lines by `code` → per code, ONE `storeStock` `batch.set({merge:true})` with `sizes:{[size]: increment(-qtySum)}`. **No `sizeLocations` write** (sales don't set locations).
- PLUS ONE `storeSales` doc (the whole receipt).
- **Op count = distinctCodes + 1** (one ledger doc). A checkout has few codes → far under 500. (Unlike inbound which wrote 1 storeInbound per line, sales write 1 ledger doc total — even cheaper.)
- Single `db.batch()` → `await commit()` → all-or-nothing. No chunking needed at realistic checkout sizes (a >449-code single checkout is implausible; if ever, same code-boundary chunk fallback as 2c, but the ledger doc must go in the first chunk — document if implemented; realistically omit).

### 3.2 Double-confirm guard
`_saleInFlight` flag set as the FIRST line inside `try` (synchronous, before the first `await`), released in `finally`; 판매확정 button disabled + "처리 중…". Identical to 2c's verified guard. increment is non-idempotent → this guard is the sole defense against a doubled sale.

### 3.3 Failure
- Success: clear sale list + draft (this store) → rebuild `buildStoreStockIndex(store)` → refresh 1f (`renderStoreStockView`) → toast "판매 완료: N건 · ₩X" → `logActivity('sale','매장판매',…)` → focus 바코드.
- Failure: list + draft **preserved**, error banner, retry. Single batch = all-or-nothing (no partial).

### 3.4 Negative-stock warning UX
- The scanned-product card shows current stock red when ≤0.
- The confirm summary lists any line whose (current stock − sale qty) < 0 in red ("판매 후 재고: 3 → −1"), but **does NOT block** — physical reality wins at the register. Owner-confirmed warn-only.

---

## 4. Per-store separation proof (owner priority — explicit)

A 부산점(st1) sale can **never** touch 성남점(st2) stock. Three independent layers, all must pass:

1. **UI store resolution.** Target store = `resolveActiveStore()` (`core.js:863`). Staff → `_currentUserStoreId` (their fixed store). Admin → switcher selection. There is no code path where a sale computes a store other than `resolveActiveStore()`. The sale panel shows the store context; a 부산점 cashier's session resolves st1 for every scan and the confirm.

2. **Doc-id composition.** Stock writes use `storeStockDocId(storeId, code)` (`core.js:1374`) = `` `${storeId}_${code}` ``. st1 writes `st1_LSWON…`; st2 writes `st2_LSWON…` — **different documents**. There is no shared doc; an increment on `st1_X` is physically incapable of altering `st2_X`. (Product codes contain no `_`, verified in 1d — the composite id is unambiguous.)

3. **Firestore rule enforcement.** `storeStock` write rule (deployed): `isAdmin() || (storeId == userDoc.storeId && storeId != '')`. A st1 staff creating a write with `storeId:'st2'` → denied. The `storeSales` create rule (same gate) denies a st1 staff writing a st2 ledger doc. So even a tampered client cannot cross stores (non-admin).

**Verification section for implementation (3c):** rules-simulator matrix — st1-staff writes st1 ✅ / st1-staff writes st2 ❌ / admin writes either ✅ / office('') ❌. Plus a live test: log in as 부산점 staff, sell, confirm 성남점 `storeStock`/`storeSales` docs are untouched (console/Firestore).

---

## 5. Stock-reflection map (every reader + refresh)

`storeStock` has **no realtime onSnapshot listener** today — it is an on-demand in-memory index (`_storeStockIndex`, built by `buildStoreStockIndex`). Enumerated readers:

| Reader | How it reads | Refresh after a sale |
|---|---|---|
| 1f 매장별 재고현황 (`renderStoreStockView`, store.js) | `buildStoreStockIndex(store)` | **Same session:** confirm calls rebuild + `renderStoreStockView()`. ✅ immediate |
| Sale scan card 현재재고 | `getStoreStock(store,code)[size]` | rebuild after each confirm → next scan fresh. Within a sale, shows committed stock (staged not yet deducted) |
| Inbound window 기존재고 | `getStoreStock` (shared `_storeStockIndex`) | shares the index; rebuilt on any confirm |
| Sale confirm summary preview | `getStoreStock` | read at confirm time |

**Cross-session honesty (owner's "reflect everywhere" priority):**
- **Same session/device:** deducted stock reflects immediately (rebuild + re-render after confirm).
- **Cross-session (two cashiers, or manager's 재고현황 on another device):** because storeStock has no onSnapshot, another device's sale does NOT auto-update my view until I refresh (there is a ↻ 새로고침 in 1f) or my next index rebuild.
- **Options (pick in 3a/3c):**
  - (A) **On-demand + refresh button (Phase 3 default, lowest cost):** rebuild on confirm, on tab focus (`visibilitychange`), and manual refresh. Acceptable because negative stock is allowed (a brief stale read at worst causes a warned oversell, not data loss).
  - (B) **storeStock onSnapshot per active store (real-time):** attach `where('storeId','==',store)` listener while the store tab is active; update index + re-render live. Cost: continuous listener + read charges per change; more code. Recommend deferring to a later phase unless the owner wants live multi-cashier mirroring now.
- **Recommendation:** ship 3c with (A); note (B) as a fast-follow if the owner reports staleness pain. The *deduction itself* is always correct (atomic increment); only the *display* can lag cross-device.

---

## 6. Discount model (manual now, Phase 5 plug-in)

- Per-line fields (AS-IMPLEMENTED): `unitPrice` (단가, snapshot), `unitDiscount` (할인단가, editable, default 0), `discountSource` ('manual' now).
- Derived (integer KRW): `lineNormal = unitPrice*qty` (정상가); `lineDiscount = unitDiscount*qty` (할인가); `lineTotal = lineNormal - lineDiscount` (판매가).
- Totals: `total = Σ lineTotal` (합계); `discountTotal = Σ lineDiscount` (할인합계); `qtyTotal = Σ qty` (수량합계).
- Validation: `0 ≤ unitDiscount ≤ unitPrice` (no negative-price line); qty ≥ 1 integer. (3a's `_buildSaleLine` enforces all of this and always recomputes derived values — never trusts caller totals.)
- **Phase 5 plug-in:** the 매장 할인 상품 관리 will, at scan time, set `unitDiscount` (resolved integer, from a rate or fixed amount) and `discountSource='store-discount'`, without reshaping the line. If Phase 5 stores a *rate*, the resolution to an integer `unitDiscount` happens at scan (round to KRW there) so the ledger only ever holds integers.

---

## 7. Void design (append-only reversing record)

### 7.1 Mechanism (whole-transaction void, Phase 3) — **batch suffices (refined from 3a review)**
The void doc uses `buildVoidDoc(original, saleDocId, {voidReason, voidedBy, voidedByName})` (3a) and the deterministic id `voidDocId(saleDocId)` = `void_{saleDocId}`. 3e wires the write:
```
voidRef  = storeSales.doc(voidDocId(saleDocId))        // deterministic id
batch = db.batch()
for each original line: batch.set(storeStock/storeStockDocId(storeId,code),
     { storeId, productCode, sizes:{[size]: increment(+qty)}, updatedAt }, {merge})   // reverse (+qty)
batch.set(voidRef, buildVoidDoc(original, saleDocId, {voidReason, voidedBy:auth.uid, ...}))
await batch.commit()
```
- **Double-void is structurally impossible WITHOUT a transaction** (3a-review-confirmed): the void id is deterministic, so a 2nd void is a `set()` on an existing doc → Firestore evaluates it as **update** → `update: if false` → **denied → the whole atomic batch fails → no 2nd stock reversal.** Firestore serializes single-doc writes, so concurrent 2nd voids also lose. A `runTransaction` (read voidRef+saleRef, verify `!exists` + original `type=='sale'`, then write) is the OPTIONAL stronger form — it adds a clearer `ALREADY_VOIDED` error and **server-side verification that the original is a real sale** (§9 note: batch alone does NOT verify the original exists/type). **Recommendation for 3e:** use the transaction if you want the original-sale verification; use the batch if you accept client-side pre-check. Either way double-void is closed.
- **Totals are stored as the original's positive snapshot** (`buildVoidDoc` copies `original.totals` as-is) — NOT negated. Revenue exclusion is done by the §7.3 `Set(voidedSaleIds)` join (a voided sale contributes 0), so no negation is needed or wanted. (Corrects the earlier §7.1 "negated" sketch.)
- Original sale doc is **never touched** — immutable ledger preserved.

### 7.2 Rule shape (create refinement — deploy needed)
Keep `update/delete: if false`. Refine `create` so a void record is well-formed and signed:
```
allow create: if isApproved() && (isAdmin() || (storeId==own && storeId!='')) && (
  request.resource.data.type == 'sale' ||
  ( request.resource.data.type == 'void'
    && request.resource.data.reason is string && request.resource.data.reason.size() > 0   // 사유 필수(서버)
    && request.resource.data.voidedBy == request.auth.uid )                                  // 위조 방지
);
```
(Optionally also require `type in ['sale','void']` and `workerUid==auth.uid` for sale — analyze in 3a.) Reason is enforced **client + server**. Note: this is a create-time refinement only; the immutable lockdown stays.

### 7.3 Double-void, exclusion, display
- Double-void: deterministic id + transaction (above).
- Voided sales **excluded from revenue totals**: history builds `Set(voidedSaleIds)` from void docs in range; a sale in that set contributes 0 to revenue and shows struck-through with the void reason/who/when (tooltip).
- Permission: own-store staff + admin; reason MANDATORY. `logActivity('sale-void','판매취소', saleNo/reason/…)`.

### 7.4 Line-level void now?
**Recommendation: whole-transaction void in Phase 3; partial/line refund in Phase 4.** Transaction-doc granularity makes whole-transaction void trivial (one void doc). Partial void would need to encode which lines/qty were reversed and track remaining-voidable per line — that is refund territory (amounts, days later, possibly card reversal) and belongs in Phase 4's refund record model (`{saleId, lineIdx, qty, amount, reason}`). Including it now would bloat Phase 3 and complicate the "voided?" join.

---

## 8. Sales history / 매출 조회 (viewing — all employees) + index

- Mirror the inbound history window: 기간(start~end) + store selector (all active, default `resolveActiveStore()` or first) + filters (type/status/**payMethod**) + Excel + summary.
- **Query:** `storeSales.where('storeId','==',s).where('dateKey','>=',a).where('dateKey','<=',b)` — equality + range, **no orderBy** (client-sort soldAt DESC). Filters (status void/active, payMethod) are **client-side memory filters** (do NOT put in `where` — keeps index exact). Same discipline as inbound history.
- **Index (deploy needed):** add to `firestore.indexes.json`:
  ```
  { "collectionGroup":"storeSales","queryScope":"COLLECTION",
    "fields":[{"fieldPath":"storeId","order":"ASCENDING"},{"fieldPath":"dateKey","order":"ASCENDING"}] }
  ```
  (Mirror the storeInbound index added in 2c.)
- **Void join:** the range query returns both `type:'sale'` and `type:'void'` docs; build `voidedIds = Set(void.originalSaleId)`; mark sales voided; revenue total = Σ non-voided `totals.sumSale`, discount total = Σ non-voided `totals.sumDiscount`.
- **Summary:** "판매 N건 · 총수량 M · 매출 ₩X · 할인 ₩Y (취소 제외)".
- **Phase 6 forward-compat:** daily per-store revenue = group sale docs by `dateKey` and sum `totals` (minus voided). The transaction-doc + denormalized `totals` + `dateKey` shape is aggregation-friendly. Note: a future Phase 6 may precompute daily rollups (`storeDailyRevenue/{store}_{date}`) — the ledger shape supports it without change.

---

## 9. CRITICAL ANALYSIS — foreseeable problems

| # | Problem | Severity | Mitigation (designed) |
|---|---|---|---|
| 1 | **Double-confirm** (doubled sale, doubled deduction) | 🔴 | `_saleInFlight` guard (2c pattern), set before first await, released in finally; button busy |
| 2 | **Void race** (two voids → double stock return) | 🔴 | Deterministic `void_{saleDocId}` + transaction existence check → exactly one |
| 3 | **Price staleness in draft** (product price changed between staging and a multi-day-old draft confirm) | 🟡 | Line captures `unitPrice` **snapshot at scan** (what the customer was quoted — correct). On confirm, if any line's snapshot ≠ current `product.salePrice`, show a non-blocking warning ("단가 변경됨: N건 — 확인"); cashier decides. Draft older than today → prompt to review. Never silently re-price |
| 4 | **Two cashiers, same store** | 🟡 | Deductions are atomic increments → totals always correct regardless of order. Separate per-device drafts (no shared draft). Display staleness per §5 (warned oversell at worst, allowed) |
| 5 | **Negative stock oversell** | 🟢 (by policy) | Allowed + warned (card red, confirm summary red). 1f flags red. Not blocked |
| 6 | **Offline mid-sale** | 🔴 | Firestore offline persistence may **queue** a batch and commit later — a sale could "succeed" from cache while offline and sync later, or the awaited commit may resolve from cache. **Design decision:** for the money path, do NOT rely on offline queue silently. On confirm, detect offline (`navigator.onLine` false or commit source) → block with "오프라인 — 판매 확정 불가, 연결 후 재시도" and preserve the draft. Analyze in 3c: prefer failing loudly offline over a phantom-queued sale. (Inbound had the same latent risk; sales makes it money-critical → address explicitly here) |
| 7 | **Discount validation** | 🟡 | `0 ≤ discountUnit ≤ unitPrice`, integer; reject on inline edit (restore prev + toast); re-validate at confirm |
| 8 | **Rounding / floats** | 🟢 | All KRW integers; line math is int×int and int−int → int; no division/percentage in the ledger (Phase 5 resolves any rate to an integer `discountUnit` at scan). Confirm: never store or compute floats |
| 9 | **Legacy-data joins** | 🟢 | New collection — no legacy sales. Void join is within Phase 3 data. `payMethod`/`type` present from day one (the inboundType lesson: no typeless legacy) |
| 10 | **saleNo collision** (same second) | 🟢 | Display-only; doc id is the unique key; void keyed on doc id not saleNo |
| 11 | **qty edited to 0/neg, or huge** | 🟡 | Strict integer parse (reuse inbound `_inbParseQty` logic), qty ≥ 1; clamp/restore on invalid |
| 12 | **Deleted/soft-deleted product scanned** | 🟡 | `findByBarcode` excludes soft-deleted (Phase 0). If a product is soft-deleted after being in a draft, confirm should warn (product info missing) — analyze in 3c |

---

## 10. Phase 3 sub-split + open questions

### 10.1 Recommended sub-split (each independently verifiable; mirrors the Phase 2 cadence that worked)
- **3a — Ledger model + rules + index (foundation).** `storeSales` field spec finalized; `firestore.rules` create refinement (void reason + voidedBy; type gate); `firestore.indexes.json` storeSales composite index. Shared `core.js` helpers (`posDateKeyKST`, `posSeqNo`). Deploy rules+index. *No UI.* **← recommended start.**
- **3b — Sale screen + draft (no stock write).** 판매 sub-tab panel: scan → add/merge line, scan card, 품번조회, inline qty/할인단가 edit, per-line delete, live totals footer, payment selector, per-store draft. 판매확정 = stub (no write yet). Mirror 2b.
- **3c — Atomic sale confirm (THE real write).** Stock `increment(-qty)` + ledger doc in one batch; `_saleInFlight` guard; negative-stock warning UX; offline block (§9 #6); success/failure paths; refresh 1f. Mirror 2c with per-store proof tests (§4).
- **3d — Sales history / 매출 조회.** Range+store+filters view, void-join totals, Excel, uses the 3a index. Mirror 2d + inbound-history-upgrade.
- **3e — Sale void.** Transaction (deterministic void id), reason mandatory, stock reverse, double-void defense, struck-through display, revenue exclusion. Mirror inbound-cancel (append-only variant).

Rationale for order: data+rules first (nothing to redo later), then the operable screen, then the money write with its guards, then viewing, then void. Void last because it depends on both the ledger (3a) and history (3d) surfaces.

### 10.2 Open questions for the owner (Claude.ai가 한국어로 전달 — 각 항목에 추천 있음)

1. **결제수단(카드/현금/계좌이체/기타)을 판매 화면에 넣을까요?**
   - 추천: **넣기.** 일일 정산(카드/현금 구분)에 필요하고, 나중에 추가하면 이전 판매 기록에 결제수단이 없어 통계가 깨집니다(입고유형 때 배운 교훈). 기본값 카드, 한 번 탭. 원치 않으시면 화면에서 빼면 됩니다.
2. **판매 화면은 '판매' 탭 안에 바로 둘까요, 팝업 창으로 할까요?**
   - 추천: **판매 탭 안에 바로.** 판매는 매장의 주 업무라 탭 자체가 화면인 게 자연스럽습니다.
3. **매출 원장 구조: 영수증 1건 = 문서 1개(거래 단위)로 저장 확정할까요?**
   - 추천: **예(거래 단위).** 영수증 그대로라 매출 집계·조회·엑셀이 간단하고 취소도 문서 1개로 처리됩니다.
4. **판매 취소는 "원본 수정" 대신 "취소 기록 추가(역기록)" 방식으로 확정할까요?**
   - 추천: **예(역기록).** 돈이 걸린 장부라 원본을 절대 안 고치고 취소 기록만 추가합니다(감사 안전). 규칙도 지금 그대로(수정/삭제 금지) 유지되고, 취소 시 **사유 필수**만 규칙에 추가합니다.
5. **재고가 음수여도 판매를 진행(경고만)하는 것 확정하시죠?**
   - 확정 필요: 예 → 매장 현실 우선(빨간 경고 표시). (소유주가 이미 "허용" 하셨으나 재확인)
6. **부분 취소/환불(일부 품목·일부 수량, 며칠 뒤 환불)은 Phase 4로 미루고, Phase 3는 "판매 전체 취소"만 할까요?**
   - 추천: **예(Phase 3 = 전체 취소, Phase 4 = 부분 환불).** 거래 단위 문서라 전체 취소는 간단, 부분 환불은 별도 설계가 필요합니다.
7. **다른 계산원의 판매를 내 화면에 '즉시' 반영해야 하나요, '새로고침 시' 반영이면 될까요?**
   - 추천: **Phase 3는 새로고침(+확정 후 자동 갱신).** 재고 차감 자체는 항상 정확합니다(원자적). 다른 기기 판매를 실시간으로 화면에 비추려면 실시간 연결(비용↑)이 필요하니, 필요하면 후속 단계에서 추가합니다.
8. **오프라인일 때 판매 확정을 '막을까요'?**
   - 추천: **막기.** 오프라인에서 확정하면 나중에 몰래 반영되는 위험이 있어, 연결된 상태에서만 확정하도록 하고 임시저장은 보존합니다.

---

## Appendix — invariants inherited (must not break)
- Stock: `FieldValue.increment` only, atomic, never absolute/RMW (1d/2c).
- Guards: in-flight flag set before first await, released in finally (2c).
- Transactions: reads-before-writes; deterministic id for check-and-set (inbound-cancel).
- Queries: equality + range only, no orderBy, client-side type/status filter (inbound history).
- Money: integer KRW, no floats.
- Per-store: `resolveActiveStore()` + `storeStockDocId` composition + rule gate.
- 매출 공식(Cafe24 P+Q−U(MAX)−Y / 사방넷 H+I) — the online-sales upload path — is **separate** from POS storeSales and is untouched by Phase 3.
