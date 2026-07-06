# POS Phase 5 — Store Discount System DEEP DESIGN (Condition × Benefit)

> **DESIGN DOCUMENT — NO CODE.** Owner reviews (Claude.ai Korean summary) → answers §8 open questions → 5-1 implements first.
> Relay note: long doc — **paste to Claude.ai in chunks by `##` section**.

```
========================================
📋 작업 결과 / REPORT START
========================================
```

## 0. Executive Summary (read this first)

**One framework, four sub-phases.** A discount = **CONDITION (when it fires) × BENEFIT (what it does)** × period × priority × scope. Model this generally now so 5-1 (product %/특정가) never needs re-architecting for 5-2~5-4.

Three decisions dominate:

1. **Rule storage — RECOMMENDATION: a `sharedData/storeDiscounts` config array** (exactly like `_inboundTypes`/`_stores` — `core.js:1290-1315`), admin-write via the OR-union rule pattern (`firestore.rules:29-44`), localStorage-mirrored, realtime-synced, managed by Settings cards (`settings.js:1387+`). **No new collection, no per-rule Firestore doc.** Rules are few (tens), read entirely into memory, evaluated per scan. Same trust model as all other sharedData config (client-validated).

2. **The anchor — everything resolves to per-line `unitDiscount`.** The sale line already reserves `discountSource:'manual'` (`store.js:2125`). The engine fills `unitDiscount` + tags `discountSource:'store-discount'` + records the winning rule on the line. **Even cart-level and bundle benefits are DISTRIBUTED down into per-line `unitDiscount`** (integer-KRW, remainder-distributed) so the existing `buildSaleDoc` totals (`store.js:2126-2130`), `buildPartialVoidDoc` (`store.js:2186-2225`), and the 3c/3e money math work **UNCHANGED**. 판매가 = 정상가 − 할인가 stays the invariant. This is the single most important design choice — it means **5-1 touches ZERO money-critical 3c/3e mechanics**.

3. **Conflict = most-favorable, no stacking (v1).** Per item, compute every applicable rule's saving and pick the MAX; record which rule won. Line-level rules resolve per line; cart-level/bundle rules "consume" their items (a consumed item gets no line-level discount). Deterministic + explainable.

**The hard problem, flagged honestly:** **bundle 고정가 refund**. When a bundle price is distributed across lines and the customer returns ONE bundle item, the remaining items were priced assuming the bundle. **v1 policy = whole-bundle-void-only (block partial void of bundle items)** — real stores commonly restrict promo refunds. Alternatives (revert-to-full-price recompute; keep-distributed-price) presented in §5. **5-1/5-2/5-3 ship WITHOUT resolving this** — only 5-4 (bundle) carries it.

**Sub-split:** **5-1 상품별 %/특정가 + 기간 자동** → **5-2 카테고리/브랜드 + 총액(정액)** → **5-3 N+1 / 두번째 반값(수량)** → **5-4 콤보/번들(+ refund policy)**. Each independently buildable; 5-1 requires none of the later pieces.

---

## 1. Rule Data Model + Settings Management

### 1.1 Where rules live — `sharedData/storeDiscounts` (config array)
Follow the `_inboundTypes` precedent exactly (`core.js:1290-1315` load/save/`_fsSync`, `settings.js:1387+` cards, `firestore.rules:40-44` admin-write). Add:
- `_storeDiscounts` global array, localStorage `lemango_store_discounts_v1`, synced to `sharedData/storeDiscounts`.
- Firestore rule: exclude `'storeDiscounts'` from the general `sharedData/{docId}` write (`firestore.rules:31`) + add a dedicated `match /sharedData/storeDiscounts { read: isApproved(); write: isAdmin() }` block. **This is the ONE rules change** (deploy `--only firestore:rules,hosting` for 5-1; §6).
- Helpers mirroring inboundTypes: `getActiveDiscounts()`, `saveStoreDiscounts()`, `generateDiscountId()` (stable `sd1`, `sd2`… never reused — soft-disable via `active:false`).

**Why config, not a collection:** rules are few and read wholesale at sale time (like `_platforms`/`_channels`). A collection would add per-rule reads on every scan with no benefit. (The 798-product `sharedData` 1MB concern does NOT apply — discount rules are tiny.)

### 1.2 The rule shape (expresses ALL conditions × benefits; enable a subset per sub-phase)
```
{
  id: 'sd3',                       // stable, immutable, never reused
  name: '여름 원피스 20%',          // display (editable; snapshot onto the sale line at confirm)
  active: true,                    // soft-enable
  priority: 10,                    // tiebreak only (see §3); lower = evaluated first
  scope: 'all' | 'st1',            // all stores OR one storeId  (Q2)
  period: { start: '2026-07-01', end: '2026-08-31' },   // KST dateKey, inclusive; '' = always-on
  condition: { type, params },     // see 1.3
  benefit:   { type, params }      // see 1.4
}
```

### 1.3 Condition types (model all; enable per sub-phase)
| type | params | level | sub |
|------|--------|-------|-----|
| `product` | `{ codes:[productCode…] }` | line | 5-1 |
| `category` | `{ categories:[type…] }` (product `type`, e.g. 'onepiece') | line | 5-2 |
| `brand` | `{ brands:[brand…] }` (product `brand`) | line | 5-2 |
| `cartTotal` | `{ min: 100000 }` (Σ line 판매가 ≥ min) | **cart** | 5-2 |
| `qty` | `{ target:'product'|'category', key, min:N }` (N of same) | line(qty-aware) | 5-3 |
| `combo` | `{ codes:[A,B,C] }` (all present in cart) | **cart** | 5-4 |
| `coupon` *(future)* | `{ code }` | cart | deferred (§6-coupons) — shape reserved, no rework later |

**`period` is a universal attribute of every rule** (not a condition type) — auto on/off by KST `kstDateKey()` between `start`/`end` inclusive (reuse the existing single-source KST util, `store.js:1120`). Empty period = always active.

### 1.4 Benefit types
| type | params | applies | sub |
|------|--------|---------|-----|
| `percent` | `{ rate: 20 }` → unitDiscount = floor(unitPrice × rate/100) | per-unit | 5-1 |
| `fixedPrice` | `{ price: 50000 }` (특정가) → unitDiscount = max(0, unitPrice − price) | per-unit | 5-1 |
| `amount` | `{ minus: 5000 }` (정액) → unitDiscount = min(unitPrice, minus) | per-unit | 5-2 |
| `nplusN` | `{ buy:2, free:1 }` → every (buy+free) units, `free` units get unitDiscount=unitPrice | per-line qty | 5-3 |
| `secondHalf` | `{ nth:2, rate:50 }` → every 2nd unit gets rate% off | per-line qty | 5-3 |
| `bundlePrice` | `{ codes:[A,B,C,D], price:50000 }` → the set sells for `price` | **cart set** | 5-4 |

### 1.5 Settings management (admin only)
A Settings card exactly like 입고유형/매장 cards: list rules (name · condition summary · benefit summary · period · active toggle · scope) + add/edit/delete. Add/edit form: name, scope dropdown, period pickers, condition-type dropdown → dynamic params inputs, benefit-type dropdown → dynamic params inputs, priority. Validation client-side (same trust model as inboundTypes). **5-1 exposes only `product`+`percent`/`fixedPrice`**; later sub-phases unlock more dropdown options — no schema change.

---

## 2. Auto-Apply Engine (the core)

### 2.1 Where it hooks
The engine is a pure function `applyDiscounts(saleList, store, nowKey) → saleList'` that runs on **every cart mutation**: `_saleBeginLine` (`store.js:2381`), `onSaleLineQty` (`store.js:2472`), `removeSaleLine` (`store.js:2493`), and on draft load (`renderSaleScreen` `store.js:2316`). It writes each line's `unitDiscount` + `discountSource:'store-discount'` + `discountRuleId`/`discountRuleName`, then `_saleRenderList`/`_saleUpdateTotals` (`store.js:2423/2457`) redraw as today. **The operator memorizes nothing.**

### 2.2 Two-pass evaluation (line-level then cart-level)
**Pass 1 — line-level** (product/category/brand/qty × percent/fixedPrice/amount/nplusN/secondHalf): for each line, collect applicable rules (condition matches the line's product + period active + scope matches store), compute each rule's per-line saving, **pick the max (most-favorable, §3)**, set that line's `unitDiscount` and rule tags. qty-aware benefits (nplusN/secondHalf) compute a per-line *effective* unitDiscount = (total line saving) / qty — but since money must be integer per unit, these are better modeled as a per-line `lineDiscount` override (see §2.4 rounding).

**Pass 2 — cart-level** (cartTotal/combo/bundlePrice): after all lines have their line-level discounts, evaluate cart-level rules against the cart. A matching cart rule produces a **total cart saving** which is then **distributed back into the participating lines' `unitDiscount`** (§4.2) so the sale doc stays a flat per-line list. Cart-level rules "**consume**" their items — a consumed line does NOT also carry a line-level discount (§3).

### 2.3 Live display (cart-level isn't final until checkout — honest handling)
The current sale list (`store.js:2440-2451`, 10 cols) shows per-line 단가/할인단가/판매가 + totals (`store.js:2466-2468`). Design:
- **Line-level discounts**: shown directly in the existing 할인단가/할인가 columns (already there), now auto-filled + a small rule-name chip under the 품번 (reuse the `sale-line-name`/`sale-line-stale` sub-line slot `store.js:2442`). The operator/customer sees *why* the price dropped.
- **Cart-level discounts (총액/번들)**: these can't attribute to one line until the cart is complete. **Recommendation: distribute into lines live** (re-run on every mutation) AND show a **cart-level summary line** under the totals: "적용 행사: 여름 총액할인 −5,000" listing the winning cart rules. Because distribution is recomputed on every change, the per-line numbers stay truthful; the summary explains the cart-level portion. (Alternative — a separate un-distributed "cart discount" total row — rejected because it would force 3c/3e to handle a cart-level field; §4.)
- A `discountSource:'store-discount'` line renders its 할인단가 **read-only** (auto), vs `'manual'` editable — so the operator sees which are automatic. Manual override: editing a store-discount line flips it to `'manual-override'` and the engine leaves it alone thereafter (Q3).

### 2.4 Rounding (integer KRW — non-negotiable)
- `percent`: `unitDiscount = Math.floor(unitPrice × rate / 100)` — per unit, floor (customer pays the rounding). Consistent with existing `Math.floor` everywhere (`store.js:2107`).
- Cart/bundle distribution: compute integer total saving, distribute across lines by `Math.floor(share)`, then hand the **remainder (a few won) to the highest-priced line** so Σ(distributed) == exact target. Deterministic. (§7-C3.)
- All per-unit; `lineDiscount = unitDiscount × qty` stays exact integer (unchanged math).

---

## 3. Conflict / Priority Policy (🔴)

**Owner's rule: pick the ONE most favorable to the customer, auto-applied.**

- **Most-favorable per item:** among all rules applicable to a line, compute each one's saving (₩) and pick the **maximum**. Ties broken by `priority` then rule `id` (deterministic).
- **No stacking (v1):** exactly one winning rule per line; exactly one winning cart-level rule. A line consumed by a cart/bundle rule gets **no** line-level discount (its value is the bundle). Between two cart-level rules that overlap, pick the one with the greater **total cart saving**; items consumed by the winner are unavailable to the loser.
- **Line vs cart interaction:** a line is either (a) line-discounted, or (b) consumed by a cart/bundle rule — never both. The engine first tentatively computes line-level, then lets cart-level rules "claim" items only if the cart rule's per-item value beats the item's line-level value (so the customer always gets the better of the two). Recorded winner is explainable.
- **Recorded on the line:** `discountRuleId` + `discountRuleName` (snapshot). Cart rules also recorded in a doc-level `appliedDiscounts` summary (§4.3). "왜 이 가격?" is always answerable.
- **Stacking ever?** Deferred (Q7). If later wanted, a rule gets a `stackable:true` flag and the engine sums stackable winners — the model already supports it without rework.

---

## 4. Sale-Path & Ledger Integration (the anchor — must not break 3c/3e)

### 4.1 Line-level (5-1/5-2 simple) — zero money-path change
The engine fills `unitDiscount` + `discountSource:'store-discount'` + `discountRuleId`/`Name` on each `_saleList` line. Then:
- `buildSaleDoc` (`store.js:2123`) recomputes totals from `unitPrice`/`unitDiscount`/`qty` **exactly as today** — 판매가 = 정상가 − 할인가, integer, unchanged.
- `_buildSaleLine` (`store.js:2105`) already clamps `unitDiscount ≤ unitPrice` (`store.js:2116`) and whitelists `discountSource` (`store.js:2125`) — **extend the whitelist to pass through `discountRuleId`/`discountRuleName`** (additive, optional; legacy lines lack them → treated as manual/none).
- Stock deduction (`store.js:2682-2687`) is by qty only — **discount-agnostic, untouched.**
- Partial void (`buildPartialVoidDoc` `store.js:2186-2225`) recomputes from the original line's `unitPrice`/`unitDiscount` per unit — **works unchanged** because the discount is already baked into per-unit `unitDiscount`.
- **Net: 5-1/5-2 add an engine that fills a field the pipeline already consumes. 3c/3e mechanics are byte-unchanged.** This is the whole point of the anchor.

### 4.2 Cart-level storage — DISTRIBUTE into lines (don't add a cart field)
A `cartTotal`/`combo`/`bundlePrice` benefit yields a total cart saving. **Store it by distributing into the participating lines' `unitDiscount`** (§2.4 rounding). Result: the sale doc remains a flat list of lines each with a real per-unit discounted price. **3c confirm, 3e void, partial-void all work with NO new field to interpret.** The alternative (a doc-level `cartDiscount` that 3c/3e must special-case) is **rejected** — it would fork the money-critical math. Distribution keeps one code path.
- **Bundle fixed price**: distribute `price` across the bundle lines as effective `unitDiscount` so Σ(lineTotal of bundle lines) == `price`. Each bundle line now has a real discounted per-unit price → void math is per-unit-correct *as long as the whole bundle is returned* (partial-void policy §5).

### 4.3 Recording WHICH rule applied (for "그 행사로 얼마 나갔나")
- Per line: `discountRuleId`, `discountRuleName` (snapshot name — survives later rename, like `inboundType` snapshot `core.js:1292`).
- Per doc: `appliedDiscounts: [{ ruleId, name, type, level:'line'|'cart', saving }]` — a summary array on the sale doc for analysis. **Additive, optional** (buildSaleDoc passes it through; legacy sales without it = no promo attribution). Enables a future "행사별 매출/할인" report without touching the sale write path again.
- **Rules recorded, not referenced:** the sale snapshots the rule name/params-effect, so deleting/editing a rule later never rewrites history (audit-safe).

### 4.4 What must NOT change
`generateSaleNo` deterministic id, the exactly-once `batch.set(...doc(saleNo))` create semantics (`store.js:2680`), the void cumulative-cap transaction (3e), stock `increment(-qty)`. The engine only touches `unitDiscount` + additive record fields **before** `buildSaleDoc`. **No change to §1.4 매출 공식 (Cafe24/사방넷) — those are upload-side, entirely separate.**

---

## 5. Refund / Void Implications per Benefit (🔴 — policy, ties to Phase 4)

| Benefit | Stored as | Partial void behavior | Policy |
|---------|-----------|----------------------|--------|
| `percent` / `fixedPrice` / `amount` | per-unit `unitDiscount` | `buildPartialVoidDoc` recomputes per-unit — **already correct** | ✅ ships in 5-1/5-2, no change |
| `nplusN` (buy N get 1) | free units = lines/units with `unitDiscount=unitPrice` (₩0) | voiding a paid unit vs the free unit both restore stock; money per-unit is correct (free=0). **Policy:** attribution recorded; refund of a paid unit does NOT auto-reclaim the free one in v1 (simplest, money-correct). | 5-3 — recommend "per-unit as priced" |
| `secondHalf` | alternating per-unit `unitDiscount` | per-unit values differ within a line → **model as split lines or a per-unit array** so partial void picks the right unit price. Simplest: split into two lines (full-price units + half-price units) at engine time → partial-void works unchanged. | 5-3 — split-line representation |
| `bundlePrice` | distributed per-unit across bundle lines | 🔴 **voiding one bundle item breaks the bundle** — the remaining items were priced assuming the set | **v1 = whole-bundle-void only (§5.1)** |

### 5.1 Bundle-void policy (present options — owner decides for 5-4)
- **(A) Whole-bundle-void only [RECOMMENDED v1]:** partial void of a bundle item is blocked; only voiding the entire bundle (all its lines together) is allowed. Matches how many real stores restrict promo refunds; simplest; money-safe. Requires tagging bundle lines with a `bundleId` so 3e can enforce "these void together."
- **(B) Revert-to-full-price on partial void:** returning one item recomputes the remaining items to full price and charges the difference. **Complex** — touches 3e math + implies an up-charge (a payment, not a refund) → really a Phase 4 exchange flow. Defer.
- **(C) Keep-distributed-price:** allow partial void at the distributed per-unit price; customer keeps the bundle discount on kept items. Simplest to allow but the store **loses margin** on the promo. Not recommended.
- **Decision needed only at 5-4.** 5-1/5-2/5-3 have no bundle → this never blocks earlier shipping. The `bundleId` line tag is the only forward-hook (additive).

### 5.2 Tie to Phase 4 (환불/부분환불)
Simple discounts already refund via 3e's append-only void. Bundle policy (A) needs 3e to enforce group-void (a small guard). True money-back refunds (cash returned) are Phase 4 — this design only decides *how much* is refundable per benefit; the *mechanism* is 3e/Phase 4.

---

## 6. Coupons / Payment-Method Discounts (deferred — no rework)
- **Out of scope** now. The framework already expresses them: a coupon = `condition:{type:'coupon', params:{code}}` (a cart-level condition validated at checkout); a card-discount = `condition:{type:'payMethod', params:{method:'카드'}}`. Adding them later = a new condition type + a Settings dropdown option + an engine branch — **no data-model or sale-path rework** (they resolve to the same per-line `unitDiscount` distribution). Reserved, not built.

---

## 7. Critical Analysis (severity · mitigation)

- **C1 — Cart-level live display [MED].** 총액/번들 discounts aren't final until the cart is complete. Mitigation: re-run the engine on every mutation + distribute into lines live + a cart summary row listing applied rules (§2.3). Numbers stay truthful because they recompute; the summary explains the cart portion.
- **C2 — Conflict determinism [MED].** "Most favorable" must be reproducible. Mitigation: compute saving in ₩, pick max, tiebreak by `priority` then `id`; record the winner on the line + `appliedDiscounts` (§3/§4.3). Same input → same output.
- **C3 — % rounding on integer KRW [MED].** `floor` per unit + remainder-to-highest-line on cart distribution (§2.4) so Σ == exact target and no fractional won. Deterministic; documented.
- **C4 — Bundle-void policy [HIGH, POLICY].** Partial void breaks a distributed bundle price. Mitigation: v1 whole-bundle-void-only (§5.1) + `bundleId` tag; alternatives flagged for owner; isolated to 5-4.
- **C5 — Rule change vs in-flight drafts [MED].** A draft snapshots `_saleList` (`store.js:2270`). If a rule changes/expires between draft-save and resume, the auto-discount is stale. Mitigation: **re-run the engine on draft load** (`renderSaleScreen`) and show a stale hint (reuse the existing `sale-line-stale` pattern `store.js:2438`); the confirm uses the freshly-evaluated values. Owner sees any change before confirming.
- **C6 — Period boundary (KST) [LOW].** Auto on/off must use the money-critical KST dateKey. Mitigation: reuse `kstDateKey()` single source (`store.js:1120`); `start ≤ today ≤ end` inclusive. No Intl/local drift.
- **C7 — Rule-eval performance per scan [LOW].** O(rules × lines). Rules are tens, lines are few → negligible. Rules read once from memory (config, not per-scan Firestore reads). No index.
- **C8 — Legacy sales without rule tags [LOW].** Pre-5-1 sales lack `discountRuleId`/`appliedDiscounts`. Mitigation: fields optional; analysis treats absent = manual/none. `discountSource` already defaults to `'manual'` (`store.js:2125`). Backward-compat by construction.
- **C9 — Manual vs auto precedence [MED].** If the operator hand-edits a discounted line, does the engine overwrite on the next scan? Mitigation: manual edit flips `discountSource` to `'manual-override'`; the engine skips manual-override lines (Q3). Operator intent wins.
- **C10 — Distribution vs partial-void correctness [MED].** Distributed cart discounts must survive partial void. Mitigation: because distribution writes real per-unit `unitDiscount`, `buildPartialVoidDoc` (`store.js:2196-2201`) recomputes per-unit correctly — for simple/total discounts. Only *bundle* partial-void is restricted (§5.1). Verified against the actual void builder.
- **C11 — 매출 공식 untouched [LOW, verify].** The Cafe24/사방넷 upload formulas (§1.4 CLAUDE.md) are upload-side and independent of POS store-discounts. No overlap. Confirm no shared code path (there is none — POS `storeSales` vs product `revenueLog`).

---

## 8. Sub-Split + Open Questions

### 8.1 Sub-split (each independently buildable; 5-1 needs none of the later)
- **5-1 — 상품별 %/특정가 + 기간 자동 [ANCHOR].** `_storeDiscounts` config + Settings card (product+percent/fixedPrice only) + rules block (`sharedData/storeDiscounts` admin-write) + the engine (line-level pass only) + most-favorable-per-line + `discountSource:'store-discount'` + `discountRuleId`/`Name` on the line + live display (auto-filled 할인단가 + rule chip) + re-run on mutation/draft-load. **3c/3e money math byte-unchanged.** Deploy `--only firestore:rules,hosting` (one rules block).
- **5-2 — 카테고리/브랜드 + 총액(정액).** category/brand conditions + `amount` benefit + first cart-level rule (`cartTotal`) with **line-distribution** (§4.2) + cart summary row. No new rules/index.
- **5-3 — N+1 / 두번째 반값 (수량).** `qty` condition + `nplusN`/`secondHalf` benefits; `secondHalf` uses split-line representation (§5) so void works. No new rules/index.
- **5-4 — 콤보/번들 (+ refund policy).** `combo` condition + `bundlePrice` benefit + `bundleId` line tag + **bundle-void policy (§5.1, owner-decided)** enforced in 3e. Possibly a small 3e guard (group-void).

### 8.2 Open Questions (each with recommendation)
- **Q1 — 규칙 저장:** `sharedData/storeDiscounts` 설정 배열(추천 — inboundTypes 패턴 재사용, 규칙 1블록 추가) vs 별도 컬렉션(스캔마다 read, 이점 없음). **추천: sharedData 설정.**
- **Q2 — 범위(scope):** 규칙마다 `all`(전 매장) 또는 특정 매장 선택(추천 — 유연) vs 전역 전용. **추천: rule 별 scope(all|storeId).**
- **Q3 — 수동 편집 우선:** 자동 적용이 기본, 운영자가 할인단가를 손대면 그 라인은 `manual-override`로 고정(엔진이 이후 안 건드림, 추천) vs 항상 자동 우선. **추천: 수동 편집 시 그 라인 자동 해제.**
- **Q4 — 카트레벨 표시:** 라인에 분배 + 하단 "적용 행사" 요약 줄(추천 — 3c/3e 무변경) vs 별도 카트할인 합계 필드(3c/3e 개조 필요). **추천: 라인 분배 + 요약.**
- **Q5 — 충돌:** 가장 유리한 1개 자동, 중복 적용 없음(추천, 소유주 방침) — 확정 요청. **추천: 최대 절감 1개, no-stack v1.**
- **Q6 — 번들 부분취소:** 전체 번들 취소만 허용(추천 v1, 프로모 환불 제한) vs 남은 항목 정가 환원(복잡, Phase 4 교환) vs 분배가 유지(마진 손실). **추천: 전체 번들 취소만(5-4).**
- **Q7 — 향후 스택:** v1 no-stack. 나중에 `stackable` 플래그로 합산 가능(모델은 이미 지원). **추천: v1 no-stack, 훅만 보존.**
- **Q8 — % 반올림:** 단위당 `floor`(고객이 우수리 부담) + 카트 분배 잔액은 최고가 라인에(추천, 정수 KRW 일관). **추천: floor + 잔액 최고가 라인.**

```
========================================
✅ 작업 결과 끝 / REPORT END
========================================
```
