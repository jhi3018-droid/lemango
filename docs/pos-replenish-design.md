========================================
📋 작업 결과 / REPORT START — Replenishment Order Workflow DEEP DESIGN
========================================

# POS Replenishment Order Workflow — Deep Design

> **DESIGN ONLY — no code.** Store generates a replenishment **order** (suggested from what sold), logistics reviews a **cross-store list and checks off shipments** (per line, partial allowed), and the loop closes when the store runs the **EXISTING inbound scan** on arrival. Owner reviews (Korean summary) → answers open questions (§8) → implementation in sub-steps (§8.1).

---

## 0. Executive Summary (read this first)

- **Data model:** ONE NEW collection **`replenishOrders`**, **order-level doc with embedded `lines[]`** (doc id = RO number, deterministic → exactly-once). It is a **mutable workflow doc**, NOT an append-only audit ledger — a different animal from `storeSales`/`storeInbound`. Mutations are **field-restricted per role** (rules) + a **ship-check transaction** for the `shippedQty ≤ requestQty` math (rules cannot iterate arrays — mirrors the 3e cumulative-cap trust model).
- **🔴 Orders never move stock.** `storeStock` rises **only** through the existing verified inbound scan (2b/2c, `openInboundScanModal` `store.js:64`), which stays **byte-unchanged**. The warehouse is outside this system's stock. This decouples the workflow from the money/stock-critical ledger.
- **Logistics role — recommended: office staff (`storeId == ''`) + admin.** They are currently view-only everywhere; this gives them their operational home, and it is cleanly rules-gatable. (Open question Q1 offers an explicit `role` flag as the cleaner long-term alternative.)
- **Closure — recommended: manual `[입고 확인]` (v1).** Store receives goods → runs the existing inbound scan → presses `[입고 확인]` to close the order. Auto-matching inbound scans to order lines is fuzzy (partial receipts, unrelated inbounds) → deferred to v2. The inbound scan is unchanged either way.
- **Suggestion — sales-driven, 🔴 void-aware:** `sold = Σ sale.qty − Σ void.qty` per (code,size) over a period, via the established ranged-sales scan + embedded-line client aggregation (the 6d pattern, `store.js:4958`). Default period = **last 7 days** (Q3).
- **Sub-split:** **R1** store order creation (collection + rules + indexes + suggestion + order screen) → **R2** logistics cross-store view + per-line ship-check → **R3** closure + lifecycle polish. Each independently verifiable.

---

## 1. Data Model + Status Vocabulary + Mutability Matrix

### 1.1 Collection choice — `replenishOrders`, order-level doc with embedded lines
**Recommendation: one doc per order, `lines[]` embedded.** (Open question Q5.)

Rationale, weighed against the two query surfaces:
- **Logistics cross-store view** filters by status + date (± store). Order-level docs are the natural unit ("show me all open orders") and are **few** (orders/day per store ≪ sales/day) → a cross-store scan is cheap (contrast: sales are embedded-line and voluminous). A composite index on `(status, dateKey)` serves it.
- **Partial-shipment updates** modify a single line's `shippedQty`/`lineStatus`. With embedded lines this is one doc write (rewriting `lines[]`) guarded by a transaction. With line-level docs it would be a per-line write but the **order-level derived status** (요청됨/일부발송/발송완료) becomes a cross-doc aggregation on every render — more reads, more complexity, for no real gain at this volume.
- Orders are **workflow docs (mutable status)**, unlike `storeSales`/`storeInbound` which are append-only ledgers. So the "append-only, cancel=new-record" discipline does NOT apply here; we use **field-restricted updates** (the `storeInbound` cancel pattern, `firestore.rules:98-108`) instead.

**Trade-off (honest):** embedding lines means a ship-check rewrites the whole `lines[]` array, and **Firestore rules cannot validate array-element math** (`shippedQty ≤ requestQty`). That constraint is enforced by a **client transaction** (authoritative read-validate-write), exactly as the 3e void cumulative cap is transaction-authoritative rather than rules-authoritative. Rules gate **WHO** (logistics role) and **WHICH top-level keys** change; the transaction gates the **numbers**. (C2, C9.)

### 1.2 Doc shape
```
replenishOrders/{roNo}   // doc id = RO number = deterministic (exactly-once, 3c pattern)
{
  roNo,                  // 'RO-YYYYMMDD-HHMMSS-<8char>' (KST, kstStamp + generateSaleNo-strength suffix)
  storeId, storeName,    // requesting store (snapshot name)
  status,                // order-level: 'requested'|'partial'|'shipped'|'closed'|'cancelled'  (§1.3)
  lines: [{
    productCode, size,
    requestQty,          // fixed at submit (immutable after create; edits are pre-submit draft only)
    shippedQty,          // 0..requestQty, set by logistics (transaction-capped)
    lineStatus,          // 'pending'|'partial'|'shipped'|'rejected'
    shipMemo,            // logistics per-line note (optional)
    rejectReason,        // when lineStatus='rejected' (창고 품절 등)
    nameKr               // snapshot product name (display; avoids re-lookup in logistics view)
  }],
  memo,                  // store request memo
  createdBy, createdByName, createdAt(ISO/UTC), dateKey(KST YYYY-MM-DD),  // 매출 귀속일과 동일 방식
  shippedBy, shippedByName, shippedAt,     // last ship action (audit)
  closedBy,  closedByName,  closedAt,      // store receipt confirm
  cancelledBy, cancelledByName, cancelledAt, cancelReason,
  updatedAt(ISO/UTC)
}
```
- **KST everywhere:** `dateKey = kstDateKey()`, timestamps = `toISOString()` (UTC instant, displayed via `kstFormat`) — reuse the single-source KST util (`store.js`, CLAUDE.md 2.4). `roNo` uses `kstStamp` + an 8-char suffix at `generateSaleNo` strength (ms + session-counter + random) so same-second multi-terminal submits never collide (the doc id is the RO number → collision = lost order, the 3c lesson).

### 1.3 Status vocabulary (order-level DERIVED from line-level)
**Line-level `lineStatus`** (authoritative per line):
| lineStatus | meaning | condition |
|---|---|---|
| `pending` | 미발송 | shippedQty == 0, not rejected |
| `partial` | 일부발송 | 0 < shippedQty < requestQty |
| `shipped` | 발송완료 | shippedQty == requestQty |
| `rejected` | 거부(창고 품절 등) | logistics rejected; shippedQty frozen |

**Order-level `status`** (derived + lifecycle):
| status | derivation |
|---|---|
| `requested` | 요청됨 — every line pending (nothing shipped yet) |
| `partial` | 일부발송 — some lines shipped/partial, not all complete |
| `shipped` | 발송완료 — every line is `shipped` OR `rejected` (nothing left to ship) |
| `closed` | 마감 — store confirmed receipt (`[입고 확인]`), terminal |
| `cancelled` | 취소 — store cancelled (terminal) |

Store `status` is **recomputed and written by the ship-check transaction** whenever lines change (so the field is queryable/indexable), and by close/cancel actions. A `rejected` line does NOT block `shipped` (C14).

### 1.4 Mutability matrix (WHO can change WHAT, WHEN)
| Action | Who | When (precondition) | Fields changed |
|---|---|---|---|
| **Create** | store staff own-store, OR admin | — (status forced `requested`, `createdBy==uid`) | whole doc |
| **Edit requestQty / lines** | — (nobody, post-submit) | requestQty fixed at create; edits happen in the **pre-submit localStorage draft** only | — |
| **Ship (set shippedQty/lineStatus/shipMemo/rejectReason)** | **logistics (office `storeId==''`) OR admin** | status ∈ {requested, partial} | `lines`, `status`, `shippedBy/Name/At`, `updatedAt` (via transaction, `shippedQty≤requestQty`) |
| **Close (마감)** | store own-store, OR admin | status ∈ {shipped, partial} | `status='closed'`, `closedBy/Name/At`, `updatedAt` |
| **Cancel** | store own-store, OR admin | status ∈ {requested, partial} | `status='cancelled'`, `cancelledBy/Name/At`, `cancelReason`, `lines` (mark unshipped as cancelled), `updatedAt` |
| **Delete** | — | never (`allow delete: if false`) — workflow audit retained | — |

Design intent: **requestQty is immutable once submitted** (C11) so logistics never sees a moving target; post-submit the store's only levers are **cancel** (whole while `requested`, or cancel-remaining after `partial`) and **close**.

---

## 2. Suggestion Logic (매장 — what to order) + Read Cost

### 2.1 Sales-driven, 🔴 void-aware
Aggregate what actually sold, net of cancellations, per (code,size) over the period:
```
soldNet(code,size) = Σ (sale line qty)  −  Σ (void line qty)     [over the period]
```
This reuses the **exact ranged-sales-scan + embedded-line pattern the 6d ledger already uses** (`store.js:4958`): query `storeSales.where('storeId','==',store).where('dateKey','>=',start).where('dateKey','<=',end)` (served by the existing composite index `storeSales(storeId,dateKey)`, `firestore.indexes.json:37`), then iterate each doc's `lines[]`: a `type:'sale'` line contributes `+qty`, a `type:'void'` line contributes `−qty` (mirrors `store.js:4983-4988`, where sale→`-q`, void→`+q` for stock movement — here we want **sold count** so sale→`+q`, void→`−q`). **Without the void subtraction, cancelled sales would inflate suggestions** (C4).

### 2.2 Suggestion list columns
품번 · 상품명 · 사이즈 · **기간 순판매(soldNet)** · **현재 재고** (`getStoreStock`, red if ≤ 0) · **이미 요청됨** (pending qty from this store's open orders — §2.3) · **제안 수량** (default = soldNet, editable). Staff can **edit qty, remove lines, ADD lines manually** (품번 조회 = the established `inbLookupModal`/`_ssvFindProduct` lookup), enter a memo, and submit.

### 2.3 Duplicate-order prevention (pending qty)
Query this store's **open** orders (`replenishOrders where storeId==store, status in ['requested','partial']`), sum each line's **unshipped remainder** (`requestQty − shippedQty`) per (code,size) → show as "이미 요청됨 N" and subtract from the default suggested qty. Prevents re-ordering what's already in flight (C11 companion). Requires an index `(storeId, status)` or reuses `(storeId, dateKey)` + client status filter.

### 2.4 Read cost
- Suggestion scan cost ∝ **the store's sales-doc count over the period** (embedded lines, client aggregation) — same profile as 6d; **cap/​warn beyond ~120 days** (6d already warns >120d).
- Open-orders query is small (orders are few). `getStoreStock` uses the cached store-stock index.

### 2.5 Min-stock threshold (v2, designed-for)
Owner's v1 is sales-driven. Design the model so a **최소 재고선** trigger can be added later without rework: a per-(product,size) `minStock` map (a new `sharedData/minStock` config, or a field on the product), and the suggestion engine adds a second candidate source ("현재재고 < minStock → 보충량 = minStock − 현재재고"), merged with the sales-driven list (max of the two). No schema change to `replenishOrders`. **v1 = sales-driven only** (Q6).

### 2.6 Draft persistence
In-progress order persists to `localStorage` `lemango_replenish_draft_{store}` (the established `_saleSaveDraft`/`_saleLoadDraft` pattern, `store.js:~2480`), including `pendingRONo` so a crash/reload before commit re-uses the same RO number (exactly-once, 3c `_salePendingSaleNo` mirror).

---

## 3. Logistics Role + Both UIs

### 3.1 🔴 WHO is logistics — recommend office staff (`storeId==''`) + admin
The system has three actor shapes in `userDoc`: **admin** (`grade≥3`), **store staff** (`storeId != ''`), **office/미배정 staff** (`storeId == ''`). Available `userDoc` fields: `grade, storeId, status, dept` (dept is **free-text**, not an enum → fragile for rules-gating).

**Recommendation:** logistics operations = **office staff (`storeId == ''`) + admin**. Reasons: (1) office staff are currently view-only everywhere and have no operational home — this becomes theirs; (2) it is **cleanly rules-gatable** with existing fields (`userDoc.storeId == '' || isAdmin()`); (3) it composes with the existing store-stock guard (office still can't write `storeStock` because those rules require `storeId != ''`, `firestore.rules:60`).

**Caveats (C3):** `storeId == ''` also matches a **newly-approved unassigned** staffer → they'd implicitly be logistics. Acceptable for v1 (small org), but the cleaner long-term is an **explicit `role` / `isLogistics` flag on `userDoc`** set in member management (Open question Q1). The **ship-status update MUST be rules-gated to logistics + admin**; store staff (their `storeId` ≠ '') fail the office check → **cannot mark their own orders shipped** (the core separation-of-duties requirement).

### 3.2 Logistics view — recommend a new top-level `물류` tab
Placement options: (a) new top-level **물류** tab; (b) inside 재고 관리; (c) inside the 🏬 매장 tab. **Recommend (a) a new `물류` tab** (`tab-logistics`) — it is a **distinct role's workspace** (office/admin), cross-store, and doesn't belong under a single store's 매장 view. Register it in `TAB_PERMISSIONS` (`core.js:912`) — **🔴 mandatory** (an unregistered tab returns `true` = fully open, `canAccessTab` `core.js:922`). Gate: visible to all (view), **actions gated to office/admin inside**; or set the tab min-grade and additionally show it for office. (Open question Q4.)

**Logistics view contents:** cross-store order list with **filters (매장 / 상태 / 기간)**; per order, expandable member lines; **per-line 발송 체크 with `shippedQty` input (≤ requestQty, transaction-enforced)**; **bulk `전체 발송` per order**; **line reject (창고 품절) + reason**; **ship memo**; **Excel export**. Cross-store query uses a new composite index `(status, dateKey)` (± a store filter).

### 3.3 Store order screen — at the 보충대상조회 hub button (its intended home)
The **보충대상조회** hub button is currently a placeholder (`openReplenishModal` `store.js:1960`, empty modal; button rendered `store.js:75` in the 재고현황 toolbar). This becomes the **store's order screen**: two panes — (1) **제안 목록** (§2, sales-driven, editable, add/remove, submit) and (2) **내 오더 상태** (this store's orders + their line-level ship progress + `[입고 확인]` when shipped). Read-open to all store staff; **submit gated to own-store staff** (the work-vs-view policy).

---

## 4. Order Closure (Receipt) — recommend manual v1

| Option | Description | Verdict |
|---|---|---|
| **(a) Manual `[입고 확인]`** | Store receives goods → runs the **existing inbound scan** (unchanged) to raise real stock → presses `[입고 확인]` on the order → `status='closed'`. | **✅ RECOMMEND v1** — simple, correct, fully decoupled from stock. |
| (b) Auto-match inbound scans → open order lines | Match `storeInbound` movements to order lines and auto-close. | ❌ **Fuzzy** — partial receipts, over/under, unrelated inbounds, timing. Real matching ambiguity. **Defer to v2.** |
| (c) No closure | Orders stay `shipped` and age out. | Acceptable fallback, but leaves stale "open" state. |

**The inbound scan itself is UNCHANGED in every option** — it remains the **sole stock-raising path** (2b/2c). Closure is a pure workflow-status flip with **zero stock effect**.

**Optional nicety — `[입고 스캔 열기]` shortcut** from a shipped order: opens the existing scan window (`openInboundScanModal`, `store.js:64`). **No pre-fill (v1).** Pre-fill analysis: pre-loading the staging list from order lines would **bypass the 2b barcode-verification discipline** (the 4 blocking rules, physical-scan-first) → risks recording goods that didn't actually arrive/scan. The house style is **barcode-scan-first**; recommend the shortcut merely **opens the window** and the operator scans as usual.

---

## 5. Lifecycle Edges

- **Store cancel:** while `requested` (no shipment) → cancel whole order (`status='cancelled'`, reason optional). After `partial` → **cancel-remaining only**: mark unshipped lines cancelled, order → `closed` (the shipped portion stands; store still receives+scans it). Rules precondition `resource.data.status in ['requested','partial']`.
- **Logistics reject line (창고 품절):** `lineStatus='rejected'` + `rejectReason`; `shippedQty` frozen at its current value; does **not** block order `shipped` (C14).
- **Duplicate-order prevention:** pending qty from open orders shown in suggestions (§2.3) and subtracted from defaults.
- **Concurrency:**
  - Two logistics shipping the **same order** → **ship-check transaction** (read order, validate every `shippedQty ≤ requestQty` and cumulative, write `lines`+`status`) → a concurrent write causes a read-conflict re-run (mirrors 3e). `shippedQty` can never exceed `requestQty` (C2, C8).
  - Two store staff creating orders → distinct RO numbers (deterministic, per-session suffix) → no collision. Same-order **submit retry** → deterministic doc id → `create` on an existing doc is rejected → **exactly-once** (3c pattern; `firestore.rules:83` `storeSales` update-false is the analog — here we mirror with create-once).
- **KST + audit:** `logActivity` on every state change — new actions **`replenish-order`** (submit) / **`replenish-ship`** / **`replenish-close`** / **`replenish-cancel`** (extends the existing `inbound/adjust/outbound/baseline` family, CLAUDE.md 2.6).

---

## 6. Rules + Index Plan

### 6.1 Rules block (`replenishOrders`) — OR-union-safe, field-restricted per role
`replenishOrders` gets its **own `match` block** (no general rule covers it → OR-union safe). Sketch (final wording at implementation):
```
match /replenishOrders/{roNo} {
  allow read: if isApproved();     // 조회 개방(매장은 자기것, 물류는 전 매장) — 클라 필터; 민감정보 아님

  // create — 본인 매장 스태프 또는 관리자, status 강제 'requested', createdBy 위조 방지, 결정적 id
  allow create: if isApproved()
    && (isAdmin() || (request.resource.data.storeId != ''
         && request.resource.data.storeId == userDoc(request.auth.uid).storeId))
    && request.resource.data.status == 'requested'
    && request.resource.data.createdBy == request.auth.uid;

  // update — 역할별 field-restricted OR-union (storeInbound cancel 패턴 firestore.rules:98-108 미러)
  allow update: if isApproved() && (
    // (A) 물류 발송: office(storeId=='') 또는 admin, 발송 관련 키만
    ((isAdmin() || userDoc(request.auth.uid).storeId == '')
      && request.resource.data.diff(resource.data).affectedKeys()
           .hasOnly(['lines','status','shippedBy','shippedByName','shippedAt','updatedAt'])
      && resource.data.get('status','') in ['requested','partial'])
    ||
    // (B) 매장 마감: 본인 매장 또는 admin, 마감 키만, shipped/partial 에서만
    ((isAdmin() || resource.data.storeId == userDoc(request.auth.uid).storeId)
      && request.resource.data.status == 'closed'
      && request.resource.data.diff(resource.data).affectedKeys()
           .hasOnly(['status','closedBy','closedByName','closedAt','updatedAt'])
      && resource.data.get('status','') in ['shipped','partial'])
    ||
    // (C) 매장 취소: 본인 매장 또는 admin, 취소 키만, requested/partial 에서만, 사유·취소자 강제
    ((isAdmin() || resource.data.storeId == userDoc(request.auth.uid).storeId)
      && request.resource.data.status == 'cancelled'
      && request.resource.data.cancelledBy == request.auth.uid
      && request.resource.data.cancelReason is string
      && request.resource.data.diff(resource.data).affectedKeys()
           .hasOnly(['status','cancelledBy','cancelledByName','cancelledAt','cancelReason','lines','updatedAt'])
      && resource.data.get('status','') in ['requested','partial'])
  );

  allow delete: if false;   // 워크플로우 감사 보존
}
```
**🔴 Honest limitation (C9):** branch (A) allows `lines` to be rewritten but **rules cannot verify `shippedQty ≤ requestQty` per element** (no array iteration in rules). The **ship-check transaction** is authoritative for that math — the same trust model as 3e's cumulative cap and the adjust/inbound reason-required fields (client-enforced, CLAUDE.md trust-model C13). Rules enforce **WHO** (logistics) and **WHICH top-level keys** move; the transaction enforces the **numbers** and recomputes `status`.

Use `resource.data.get('status', '')` (not dot-access) for the precondition — **missing-field dot-access errors→denies** in rules (the `.get(k,default)` lesson, `firestore.rules:102`).

### 6.2 Composite indexes (add to `firestore.indexes.json`)
| Index | Serves |
|---|---|
| `replenishOrders (status ASC, dateKey ASC)` | logistics cross-store list by status + period |
| `replenishOrders (storeId ASC, dateKey ASC)` | store's own orders by period; logistics store-filter |
| `replenishOrders (storeId ASC, status ASC)` | store open-orders (pending-qty) for duplicate prevention |

(The logistics "all stores + store filter + status + date" can be served by `(storeId, status, dateKey)` if a combined filter is wanted; start with the three above and add if a query demands it.)

### 6.3 Deploy plan
- **R1** (collection + rules + indexes + store screen): `firebase deploy --only firestore:rules,firestore:indexes,hosting`. Indexes first (build lag), then rules+hosting.
- **R2 / R3**: mostly `--only hosting` if the R1 rules already cover ship/close/cancel (design all three update branches in R1). If a branch is added later → `--only firestore:rules,hosting`.

---

## 7. Critical Analysis (severity · mitigation)

- **C1 — Double-submit [MED].** A duplicate submit must not create two orders. Mitigation: **deterministic doc id = roNo** + `pendingRONo` in the draft (3c `_salePendingSaleNo` pattern); a re-submit `create`s the same id → rejected as already-exists → treated as success. Exactly-once.
- **C2 — Over-ship (shippedQty > requestQty) [HIGH].** Rules can't do array math. Mitigation: **ship-check transaction** reads the order, validates each line's `shippedQty ≤ requestQty` (and cumulative if incremental), writes `lines`+`status` atomically; concurrent writes re-run (3e mirror). Honest: not rules-enforceable, transaction-authoritative.
- **C3 — Role gap (office == unassigned) [MED].** `storeId==''` also matches newly-approved unassigned staff. Mitigation: acceptable v1 (small org); offer explicit `role`/`isLogistics` flag (Q1). Store-stock writes remain blocked for office (`storeStock` rule `storeId != ''` guard).
- **C4 — Suggestion accuracy: voids counted [HIGH].** 🔴 `sold = sales − voids` per (code,size) via the 6d embedded-line scan (`store.js:4958,4983-4988`). Omitting void subtraction over-suggests cancelled items. Explicitly subtract void lines.
- **C5 — Stale suggestions [LOW].** Sales scan is point-in-time. Mitigation: re-scan on screen open; pending-qty from open orders prevents double-order; the draft holds the operator's edits.
- **C6 — Cross-store isolation [MED].** Store sees/creates only own orders (`storeId` filter + create rule); logistics/admin see all. Rules enforce create-gate; read is open (orders aren't sensitive) but the UI filters to own store for staff.
- **C7 — Read costs [MED].** Suggestion scan ∝ store's period sales-doc count (cap ~120d, 6d precedent). Logistics cross-store scan ∝ **order** count (few) — cheap. Pending-qty query small. No per-scan Firestore reads for stock (cached index).
- **C8 — Ship concurrency [MED].** Two logistics on one order → transaction read-conflict re-run; last consistent write wins; caps re-validated. Mirrors 3e.
- **C9 — Rules can't validate line array [MED, HONEST].** Ship/cancel rewrite `lines`; rules gate keys+role only. Transaction is authoritative for line math + status recompute. Documented trust boundary.
- **C10 — Closure fuzziness [MED].** Auto-matching inbound→order is ambiguous (partial/over/unrelated). Mitigation: **manual `[입고 확인]` v1**; auto-match deferred. Inbound scan unchanged.
- **C11 — requestQty mutation after submit [MED].** Fixed at create (draft is pre-submit). Logistics never sees a moving target; post-submit levers = cancel/close only.
- **C12 — KST attribution [LOW].** `roNo`/`dateKey`/timestamps via the single-source KST util (`kstStamp`/`kstDateKey`) — no Intl/local drift (money-critical util reuse).
- **C13 — Stock decoupling [HIGH, core principle].** `replenishOrders` **never** touches `storeStock`. The inbound scan (2b/2c) stays the **sole** stock-raising path, byte-unchanged. This is what makes the order system safely iterable.
- **C14 — Rejected/partial completeness [LOW].** Order `shipped` = every line `shipped` OR `rejected` (a rejected line must not strand the order as forever-open).
- **C15 — Snapshot names [LOW].** `storeName`/`nameKr` snapshotted on the order so the logistics view renders without re-lookup and survives later renames (the `inboundType` snapshot pattern).

---

## 8. Sub-Split + Open Questions

### 8.1 Sub-split (each independently buildable/verifiable)
- **R1 — Store order creation.** `replenishOrders` collection + **full rules block (all three update branches)** + indexes; **suggestion engine** (sales−voids ranged scan, void-aware, pending-qty dedup); **store order screen** at the 보충대상조회 button (제안 목록 + 내 오더 상태); draft + **exactly-once** deterministic-RO submit; `logActivity('replenish-order')`. Deploy `--only firestore:rules,firestore:indexes,hosting`. **Verify:** submit creates one order (dup-submit no-op), suggestions reflect sold−voided, own-store gate.
- **R2 — Logistics view + ship.** New `물류` tab (`TAB_PERMISSIONS` registered) + logistics-role gate (office/admin); cross-store list (매장/상태/기간 filters); **per-line ship-check transaction** (`shippedQty ≤ requestQty`, status recompute); bulk `전체 발송`; line reject + reason; ship memo; Excel; `logActivity('replenish-ship')`. Deploy `--only hosting` (rules from R1). **Verify:** store staff cannot ship; over-ship blocked; concurrent ship safe; cross-store isolation.
- **R3 — Closure + polish.** Store `[입고 확인]` manual close (`replenish-close`); cancel (whole/remaining, `replenish-cancel`); `[입고 스캔 열기]` shortcut (opens existing scan, no pre-fill); duplicate-order flags; incomplete/aging indicators. Deploy `--only hosting`. **Verify:** close flips status only (no stock change); cancel edges; inbound scan unchanged.

### 8.2 Open Questions (오너 확인 필요 — 추천 포함)
- **Q1 — 물류 역할 주체?** (a) **사무직(storeId 미배정)+관리자 [추천 v1]** — 즉시 구현, 규칙 게이트 가능, 사무직에게 업무 부여 / (b) `userDoc`에 `role:'logistics'` 플래그 신설(회원관리 UI+스키마 변경, 가장 명확·장기적) / (c) 관리자 전용 v1.
- **Q2 — 오더 마감 방식?** (a) **수동 `[입고 확인]` [추천 v1]** / (b) 입고 스캔 자동매칭(v2, 퍼지) / (c) 마감 없음(발송완료 유지).
- **Q3 — 제안 기간 기본값?** **최근 7일 [추천]** / 마지막 오더 이후 / 14일 / 30일. (더 길수록 읽기비용↑, >120일 경고.)
- **Q4 — 물류 뷰 위치?** **신규 `물류` 탭 [추천]**(별도 역할 워크스페이스) / 재고 관리 내부 / 매장 탭 내부.
- **Q5 — 오더 doc 구조?** **order-level(라인 embedded) [추천]**(뷰 쿼리 저렴·부분발송 1-doc) / line-level docs(세밀하나 상태집계 복잡).
- **Q6 — 최소 재고선(min-stock) v2 도입?** v1=판매기반만, 모델은 무-리워크 확장 대비. 도입 시점/방식 확인.
- **Q7 — requestQty 제출 후 편집?** **불가(취소·재요청만) [추천]**(물류가 고정 대상 확인) / `requested` 상태서 편집 허용(동시성 복잡).

### 8.3 Integration points (real code, verified)
| Point | Location |
|---|---|
| 보충대상조회 placeholder (store order screen home) | `openReplenishModal` `store.js:1960`; button `store.js:75` |
| Ranged sales scan + void-aware embedded-line agg (suggestion) | `store.js:4958`, `4983-4988` (6d); index `storeSales(storeId,dateKey)` `firestore.indexes.json:37` |
| Void detection (alt) | `where('originalSaleId','in',30-chunk)` `store.js:3726` |
| Product lookup (manual add-line) | `inbLookupModal` / `_ssvFindProduct` (established) |
| Inbound scan (sole stock-raising path, UNCHANGED) | `openInboundScanModal` `store.js:64` |
| Draft + exactly-once pattern | `_saleSaveDraft`/`_saleLoadDraft` `store.js:~2480`; `_salePendingSaleNo`/`generateSaleNo` `store.js:3142` |
| Field-restricted update rule pattern | `storeInbound` cancel `firestore.rules:98-108` |
| Rules helpers / userDoc fields | `isApproved`/`isAdmin` `firestore.rules:14,21`; `userDoc.{grade,storeId,status,dept}` |
| Tab registration (mandatory) | `TAB_PERMISSIONS` `core.js:912`; `canAccessTab` `core.js:922` |
| KST util / logActivity | `kstStamp`/`kstDateKey` (store.js); `logActivity(action,target,detail)` (activity-log.js) |

========================================
✅ 작업 결과 끝 / REPORT END
========================================
