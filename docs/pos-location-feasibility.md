# Multi-Location Feasibility Report (POS Location Architecture)

**Status:** INVESTIGATION ONLY — no code changed, nothing deployed. Decides the location model before Phase 2.
**Date:** 2026-07-01

## Current state (deployed, 1d)
`storeStock/{storeId}_{productCode}` = `{ storeId, productCode, sizes:{XS..2XL,F: int}, location:'', updatedAt }` (core.js:1306-1311). The `location` field is a **single whole-doc string, read in `loadStoreStock` (core.js:1337) but written by NObody** — no code path sets it. Stock is per-size integer, mutated atomically by `writeStoreStock(storeId, code, size, delta)` via `FieldValue.increment` (core.js:1299-1317). So today **neither** location model exists; `location` is a vestigial placeholder.

---

## 1. Fixed Location Model

### Data structure
Add a per-size location map parallel to `sizes` (drop the unused whole-doc `location`):
```js
storeStock/{storeId}_{code} = {
  storeId, productCode,
  sizes:         { M: 5, L: 3, ... },        // stock per size — UNCHANGED from 1d
  sizeLocations: { M: 'AA-AA-01-03', ... },  // NEW: one location label per size
  updatedAt
}
```
Location is a **label**, not a quantity. Stock representation is untouched.

### Impact on 1d-1f
- **1d:** add `sizeLocations` to the doc; add a tiny helper `setStoreStockLocation(storeId, code, size, loc)` = plain `set({sizeLocations:{[size]:loc}}, {merge:true})` (overwrite semantics — a label, not `increment`). **`writeStoreStock` stock path is completely unchanged** → zero risk to the deployed atomic core. `loadStoreStock` returns `sizeLocations` alongside `sizes`.
- **1e:** optionally add a `로케이션` column (품번|사이즈|바코드|수량|로케이션). Stock SET/ADD unchanged; location is a per-size overwrite. Owner already deferred the column — location can instead come from the Phase 2 incoming-scan. Low effort either way.
- **1f:** modal shows the per-size location (the extension-point comment already left at the modal). Optional table column. Low.
- **Rules:** **no change** — same doc, same write-gating.

### Deduction stays trivial? — YES, confirmed
A sale just decrements `sizes[size]` exactly as today. The location is **informational** (tells staff which shelf to pick from); it plays **no part in the deduction math**. Void/adjust likewise untouched. This is the key virtue: fixed-location never touches the concurrency-critical stock path.

### Complexity: **LOW** (purely additive to 1d)

---

## 2. Multi Location Model

### Data structure (options + best)
Stock is no longer one integer per size — it's split across locations, so the stock representation itself must change.

| Option | Shape | Atomic increment? | Read cost | Verdict |
|---|---|---|---|---|
| A. Array per size | `sizes:{M:[{loc,qty},...]}` | **❌ NO** — Firestore can't `increment` an array element; you'd `arrayRemove`/`arrayUnion` whole objects = read-modify-write = **lost-update-unsafe** (the exact failure 1d was built to avoid) | 1 doc | **Rejected** |
| B. Nested map per size | `locStock:{M:{'AA-01':3,'BB-02':2}}` | **✅ YES** — `set({locStock:{M:{'AA-01':increment(-1)}}},{merge})` is atomic per (size,location) | 1 doc (same as 1d) | **Best** |
| C. Per-location sub-docs | `storeStockLoc/{storeId}_{code}_{size}_{loc}` | ✅ YES | **✗ explodes** — 798 × sizes × locations = thousands of docs/store; the 1f "load all" query gets expensive | Rejected (read cost) |

**Best = Option B (nested map).** It's the only one that keeps BOTH the atomic-increment guarantee AND the 1-doc-per-product read cost.

### Atomic increment per location — feasible? YES, but with caveats
`increment` works on `locStock.M['AA-01']`. Caveats that don't exist in the fixed model:
- **Location strings become map KEYS.** Firestore map keys forbid `. / [ ] * ~` backtick and `__` prefixes. A hyphen convention ("AA-AA-01-03") is safe, but **free-form user input must be sanitized/validated** or a write throws.
- **Totals are computed, not stored.** Per-size total = sum of that size's location values. Storing a denormalized total risks drift; computing it means every read sums the map.
- **Zero-qty keys linger.** `increment` to 0 leaves the key (`{'AA-01':0}`); needs periodic cleanup or tolerate zeros in the UI.

### Sale deduction resolution — THE CRUX
Stock for M = `{AA-01:3, BB-02:2}`. A sale of 1×M must pick a location to decrement. **The barcode scan identifies product+size only — NOT location** (`findByBarcode` returns `{productCode, size}`; there is no per-location barcode in the owner's model). So the system *cannot* know the physical location from the scan. Options:

| Approach | How | Problem |
|---|---|---|
| **Manual pick** | cashier sees the split, taps the location | Adds a step to **every multi-location sale** → POS friction |
| **Auto (FIFO / most-stock / first-key)** | system picks | The cashier grabbed a garment from a *specific* rack; if the system deducts a *different* location, the per-location counts **drift from physical reality** → the location data becomes fiction, defeating the point |
| **Total-only, defer location** | deduct from a computed total, don't track which location | You've **abandoned per-location accuracy at the sale** — you're no longer really multi-location for outflow |

**This is the honest crux the owner intuited:** multi-location is only *accurate* if the sale knows the physical source location, but a barcode scan can't supply it. You either pay cashier friction on every split sale or accept unreliable location counts. There is no free lunch — the data structure being "ready" does **not** solve this; it's a workflow/physical-reality problem, not a schema problem.

### Impact on all phases (multi)
- **Incoming scan (P2):** each scan-batch targets a location → `increment(locStock[size][loc], +qty)`. Fits the mockup's single location field per scan.
- **Sale (P3):** must resolve location (above) AND **record the deducted location on the `storeSales` doc** (so a later void knows where to return it).
- **Void/refund (P4):** return to the **original sale's** location → depends on P3 having recorded it.
- **Forced adjust:** must target a specific location.
- **1f view:** modal shows per-location breakdown (M: AA-01×3, BB-02×2); table total sums across locations.

### Read cost / complexity
Option B keeps read cost at 1 doc/product (same as 1d). Complexity is **HIGH** anyway: it changes the deployed stock representation, forces location into `storeSales`, adds key-sanitization + computed-totals + zero-cleanup, and leaves the sale-deduction UX unsolved.

### Complexity: **HIGH**

---

## 3. Fixed → Multi Extensibility — THE KEY QUESTION

### Can fixed cleanly upgrade to multi later? — **The DATA migrates cleanly; the CODE does not (either way).**

Fixed `{sizes:{M:5}, sizeLocations:{M:'AA-01'}}` is informationally **equivalent** to multi `{locStock:{M:{'AA-01':5}}}` — fixed is literally "multi with exactly one location per size." A one-time migration script is mechanical and lossless:
```
locStock[size] = { [ sizeLocations[size] || 'DEFAULT' ]: sizes[size] }
```
**So the data is a clean subset.** ✅

BUT the storage *structures differ* (`sizes` integer vs `locStock` nested map), so **every write/read path changes** regardless: sale, incoming, void, adjust, index, totals, 1f. That code change is the real cost, and it is incurred at the moment you adopt `locStock` — whether that's now (Path B) or later (migrating from Path A).

### The one design that avoids a future data migration: adopt `locStock` NOW, run it in "fixed mode"
```js
locStock: { M: { 'AA-AA-01-03': 5 } }   // single key per size = "fixed"; >1 key = "multi"
```
- Fixed behavior = enforce one location key per size + auto-deduct that sole key (no sale prompt).
- "Multi" later = a **behavior flag** (allow >1 key) + a sale location-picker. **No data migration.**

This is the *maximally* extensible model — but it means **changing the deployed 1d `sizes` model to `locStock` now**, and it still does **not** solve the multi sale-deduction crux (§2). You'd pay HIGH complexity now (nested maps, key sanitization, computed totals, reworking deployed 1d-1f) to make future-multi a "flag" — for a feature whose core problem remains unsolved and whose real-world need is uncertain.

### Verdict
- **Fixed and multi are NOT fundamentally incompatible** — fixed is a strict subset, and the data migrates cleanly.
- **But there is no model where you get simple-fixed-now AND zero-cost-multi-later without paying the multi complexity at some point.** Either pay it now (Path B, `locStock`) or later (migrate from Path A). The migration itself is mechanical; the code rework is the same size whenever you do it.
- Crucially, **the hardest part of multi (which-location-on-sale) is not a data-model problem and is not solved by any structure** — so "keeping the door open" structurally buys less than it appears.

---

## 4. Impact on Built Phases (1d/1e/1f)

| Phase | Fixed change | Multi change (Option B) |
|---|---|---|
| **1d** storeStock | Add `sizeLocations` map + `setStoreStockLocation` helper (label overwrite). **`writeStoreStock` stock path unchanged.** | Replace `sizes:{int}` → `locStock:{size:{loc:int}}`; rewrite `writeStoreStock` to `increment(locStock[size][loc])`; `getStoreStock`/index compute per-size totals; reshape `loadStoreStock`. **Touches the deployed atomic core.** |
| **1e** upload | Optional 로케이션 column; stock SET/ADD unchanged | 로케이션 column **required**; grouping becomes code→size→**location**; SET per location |
| **1f** view/modal | Show per-size location (extension point already present) | Show per-location breakdown; total = sum across locations |
| **Rules** | **No change** | No change for Option B (same doc); Option C would need a new match block |

**Reusability:** Fixed reuses ~100% of 1d-1f (additive). Multi keeps the rules and the 1-doc model but **reworks the stock representation and every consumer** — roughly 1d's helpers + 1e's commit + 1f's render all change.

---

## 5. Impact on Future Phases

| Phase | Fixed | Multi (Option B) |
|---|---|---|
| **P2 incoming scan** | scan → qty → one location → `writeStoreStock(+qty)` + `setStoreStockLocation`. Mockup's single field fits perfectly. | scan → qty → location → `increment(locStock[size][loc], +qty)`. Same UI, data lands per-location. |
| **P3 sale** | decrement `sizes[size]`; location shown for picking, **no logic**. | resolve WHICH location (crux: prompt or guess) + **record location on storeSales**. |
| **P4 void/refund** | increment `sizes[size]` back; location untouched. | return to the **original** location → requires P3 to have recorded it. |
| **Forced adjust** | adjust `sizes[size]`. | adjust a specific location. |

Note the cascade: **multi forces `location` into the `storeSales` ledger** (so voids return correctly), touching Phase 3/4 schema. Fixed does not.

---

## 6. Recommendation

### Per-model summary
- **Fixed:** LOW complexity, purely additive to 1d, zero risk to the atomic stock path, deduction stays trivial, answers the real question ("where do I find size M"). ~100% reuse of 1d-1f.
- **Multi (Option B nested map):** HIGH complexity, reworks the deployed stock representation, forces location into storeSales, adds key-sanitization/computed-totals/zero-cleanup, and — decisively — **leaves the which-location-on-sale problem unsolved** (barcode can't supply location).

### Extensibility verdict
Fixed → multi is a **clean data migration but a full code rework either way**. The only zero-migration path (adopt `locStock` now, "fixed mode") pays multi's complexity upfront for a feature whose core problem isn't a schema problem. There is no cheap-now-and-cheap-later option.

### CC's recommendation: **Start with FIXED (`sizeLocations`). Do NOT pre-build the multi structure.**
Reasoning:
1. **Fixed covers the real need.** For 2 swimwear shops, the overwhelming case is "size M of this product lives at AA-01." That's a label. Staff want to *find* stock, not split it.
2. **The multi crux is unsolved regardless of structure.** A barcode scan can't tell the POS which physical location an item came from. So multi either adds friction to every split sale or produces drifting, untrustworthy per-location counts. Building the structure doesn't fix that — it just defers the unsolved problem.
3. **Path B pays HIGH cost now for uncertain future value.** You'd rework the deployed, verified 1d atomic core (the riskiest code in the whole POS) to enable a "flag" for a feature you may never ship and whose hard part remains hard.
4. **The migration, if ever needed, is mechanical + done with a real requirement.** If a concrete pain emerges (a genuine floor+stockroom split where staff lose items), migrate then — WITH a proven need and a decided sale-UX, not speculatively.

### If fixed-now: the exact model to use
```js
storeStock/{storeId}_{code} = {
  storeId, productCode,
  sizes:         { M: 5, ... },              // unchanged (atomic increment stays here)
  sizeLocations: { M: 'AA-AA-01-03', ... },  // per-size label; overwrite via setStoreStockLocation
  updatedAt
}
```
- **Drop the vestigial whole-doc `location`** (core.js:1337) in favor of per-size `sizeLocations` — per-size is the owner's confirmed granularity and the natural precursor to per-size-per-location if multi ever comes.
- Location is set/overwritten (not incremented) — a `setStoreStockLocation(storeId, code, size, loc)` helper, called from the Phase 2 incoming-scan.
- **This is the only future-proofing worth doing now:** per-size granularity. Invest nothing further into multi.

### Is multi worth the complexity? — **Probably not, for this business.**
Honest assessment: multi-location's benefit (per-location stock) is undercut at the sale point by the scan-can't-know-location problem, so you'd pay HIGH complexity for counts that are either friction-laden to maintain or unreliable. Fixed answers "where is it" — the actual question staff ask — at LOW cost and zero risk to the atomic core. Recommend **fixed now**, and treat multi as a *later, need-driven* decision rather than a *now, structure-driven* one. Revisit only if a real, specific split-storage pain appears.

---

*End of investigation. No code changed, nothing deployed. Awaiting the owner's location-model decision before Phase 2 (incoming scan).*
