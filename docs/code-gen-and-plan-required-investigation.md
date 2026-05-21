# Product Code Generator + Plan Required-Field Investigation

**Date**: 2026-05-22
**Status**: Investigation only. No code changes. Two issues analyzed.
**Reporter**: debugger agent (literal-source-quotation rule applied)

## Summary

- **Issue 1 (product code 13-digit serial logic)**: **DIVERGENT** across the 4 sites. The two `plan.js` sites (`updatePlProductCode`, `updatePdProductCode`) use a hard-coded `c.slice(0, 12) === prefix` comparison, while the actual prefix is **11 characters** (cls=2 + gen=1 + typ=2 + des=4 + year=1 + season=1). Result: the filter **always returns an empty set**, so the "next serial" search always returns `00`. The user gets stuck on serial `00` whenever a previous `00` already exists for the same prefix — the apply-time dupe check (`applyPlGeneratedCode`/`applyPdGeneratedCode`) catches the clash and toasts an error, but the picker re-runs and produces the same `00` again, creating an infinite-loop UX with no way to obtain a higher serial from the Plan tabs. The two `product-code.js` / `modals.js` sites use the correct length-aware `c.length === prefix.length + 2 && c.startsWith(prefix)` check.
- **Issue 2 (plan productCode required)**: Root cause is `js/plan.js:1340-1347` (`savePlanDetailEdit`). It forces `pdProductCodeInput` to be non-empty before saving. One-line fix: remove that block. `submitPlanRegister` (line 326-327) already correctly only requires `sampleNo`; Excel upload path (`js/excel.js:1940`) also only requires `sampleNo`.

## PART 1: Product Code 13-Digit Generation

### 1-1. Generation Handlers by Site

| Site | Update / Apply | File:line |
|---|---|---|
| 상품조회 신규등록 | `updateProductCode` / `applyGeneratedCode` | `js/product-code.js:255` / `js/product-code.js:298` |
| 상품조회 수정 | `updateDetailProductCode` / `applyDetailGeneratedCode` | `js/modals.js:1519` / `js/modals.js:1561` |
| 신규기획 신규등록 | `updatePlProductCode` / `applyPlGeneratedCode` | `js/plan.js:547` / `js/plan.js:584` |
| 신규기획 수정 | `updatePdProductCode` / `applyPdGeneratedCode` | `js/plan.js:1042` / `js/plan.js:1089` |

Shared logic? **No.** Each site has its own independent body — there is no shared helper. This is the root condition that allowed two implementations to drift from the other two.

### 1-2. 13-digit Structure

Decomposition (verified from `index.html` `pcClass`/`pcGender`/`pcType` option values and the design code list in `js/product-code.js:4-50`):

| Segment | Length | Source | Example |
|---|---|---|---|
| 분류 (class) | 2 | `_classCodes` / `pcClass` | `LS` |
| 성별 (gender) | 1 | `pcGender` | `W` |
| 타입 (type) | 2 | `pcType` (TYP_OPT) | `ON` |
| 디자인 (design) | 4 | `_designCodes` | `1626` |
| 연도 (year) | 1 | `pcYear` | `6` (=2026) |
| 시즌 (season) | 1 | `pcSeasonNum` | `7` |
| **prefix subtotal** | **11** | | `LSWON162667` |
| 일련번호 (serial) | 2 | auto 00~99 | `07` |
| **total** | **13** | | `LSWON16266707` |

Real sample from `data/products_lemango.json:5`: `"productCode": "LSWON16266707"` — 13 chars exactly, matching the breakdown above.

### 1-3. Serial Logic (per site)

#### Site A: 상품조회 신규등록 — `js/product-code.js:264-283` (CORRECT)

```js
const prefix = cls + gen + typ + des + year + seasonNum

const used = new Set()
;[...State.allProducts, ...State.planItems].forEach(p => {
  const c = p.productCode || ''
  if (c.length === prefix.length + 2 && c.startsWith(prefix)) {
    used.add(c.slice(-2))
  }
})
_reservedCodes.forEach(c => {
  if (c.length === prefix.length + 2 && c.startsWith(prefix)) {
    used.add(c.slice(-2))
  }
})

let nextNum = null
for (let i = 0; i <= 99; i++) {
  const candidate = String(i).padStart(2, '0')
  if (!used.has(candidate)) { nextNum = candidate; break }
}
```

- Match: length-aware `startsWith(prefix)` — adapts to any prefix length.
- Serial extraction: `c.slice(-2)` — always the last 2 chars.
- Overflow: when all 00~99 are taken, `nextNum` stays `null`. Lines 287-295 render `'만료'` / `'사용 가능한 번호 없음'` and disable the apply button.
- Self-exclude: N/A (new product, no current code).

#### Site B: 상품조회 수정 — `js/modals.js:1528-1548` (CORRECT)

```js
const prefix = cls + gen + typ + des + year + season  // 12자리   ← comment says 12 but actually 11

const currentOwnCode = _detailCode || ''

const used = new Set()
;[...State.allProducts, ...State.planItems].forEach(p => {
  const c = p.productCode || ''
  if (c === currentOwnCode) return  // 자기 자신 제외
  if (c.length === prefix.length + 2 && c.startsWith(prefix)) used.add(c.slice(-2))
})
_reservedCodes.forEach(c => {
  if (c === currentOwnCode) return
  if (c.length === prefix.length + 2 && c.startsWith(prefix)) used.add(c.slice(-2))
})
```

- Match: length-aware `startsWith(prefix)` — correct.
- Self-exclude: yes (`c === currentOwnCode` early-return).
- Misleading inline comment (`// 12자리`) — prefix is actually 11. Cosmetic only.

#### Site C: 신규기획 신규등록 — `js/plan.js:556-569` (**BUGGY**)

```js
const prefix = cls + gen + typ + des + year + seasonNum
const usedNums = new Set(
  [...State.allProducts, ...State.planItems]
    .map(p => p.productCode)
    .filter(c => c && c.slice(0, 12) === prefix)
    .map(c => c.slice(12))
)
_reservedCodes.forEach(c => { if (c.slice(0,12) === prefix) usedNums.add(c.slice(12)) })

let nextNum = null
for (let i = 0; i <= 99; i++) {
  const n = String(i).padStart(2,'0')
  if (!usedNums.has(n)) { nextNum = n; break }
}
```

- **Bug**: `c.slice(0, 12)` returns 12 chars; `prefix` is 11 chars; `===` fails for every existing code.
- Concrete trace: existing code `LSWON16266707` → `c.slice(0,12)` = `"LSWON1626670"` (12 chars). User prefix = `"LSWON162667"` (11 chars). `"LSWON1626670" === "LSWON162667"` → **false**.
- Effect: `usedNums` always empty → loop returns `00` for every prefix where collisions already exist.
- Self-exclude: N/A (no current code for new register).
- Overflow path is dead code — `usedNums` never fills.

#### Site D: 신규기획 수정 — `js/plan.js:1058-1076` (**BUGGY**)

```js
const prefix = cls + gen + typ + des + year + season
const currentItem = State.planItems.find(p => p.no === _editingPlanNo)
const currentOwnCode = currentItem?.productCode || ''
const usedNums = new Set(
  [...State.allProducts, ...State.planItems]
    .map(p => p.productCode)
    .filter(c => c && c !== currentOwnCode && c.slice(0, 12) === prefix)
    .map(c => c.slice(12))
)
_reservedCodes.forEach(c => {
  if (c !== currentOwnCode && c.slice(0, 12) === prefix) usedNums.add(c.slice(12))
})
```

- Same hard-coded `12` bug as Site C.
- Self-exclude: present (`c !== currentOwnCode`) — correct in intent but never reached because the slice(0,12) filter already rejects every candidate.

### 1-4. Duplicate Prevention Sources (per site)

| Site | allProducts checked | planItems checked | _reservedCodes checked | Self-exclude |
|---|---|---|---|---|
| 상품조회 신규등록 (update) | ✓ `js/product-code.js:267` | ✓ `js/product-code.js:267` | ✓ `js/product-code.js:273` | n/a |
| 상품조회 신규등록 (apply) | ✓ `js/product-code.js:302` | ✓ `js/product-code.js:303` | ✓ `js/product-code.js:304` | n/a |
| 상품조회 수정 (update) | ✓ `js/modals.js:1534` | ✓ `js/modals.js:1534` | ✓ `js/modals.js:1539` | ✓ `js/modals.js:1536, 1540` |
| 상품조회 수정 (apply) | ✓ `js/modals.js:1568` | ✓ `js/modals.js:1569` | ✓ `js/modals.js:1570` | ✓ `js/modals.js:1567, 1581` |
| 신규기획 신규등록 (update) | ✓ `js/plan.js:558` (but filter broken) | ✓ `js/plan.js:558` (but filter broken) | ✓ `js/plan.js:563` (but filter broken) | n/a |
| 신규기획 신규등록 (apply) | ✓ `js/plan.js:588` | ✓ `js/plan.js:589` | ✓ `js/plan.js:590` | n/a |
| 신규기획 수정 (update) | ✓ `js/plan.js:1063` (but filter broken) | ✓ `js/plan.js:1063` (but filter broken) | ✓ `js/plan.js:1068` (but filter broken) | ✓ `js/plan.js:1065, 1069` (but filter broken) |
| 신규기획 수정 (apply) | ✓ `js/plan.js:1097` | ✓ `js/plan.js:1098` | ✓ `js/plan.js:1099` | ✓ `js/plan.js:1099` (`code !== currentOwnCode`) |

All four sites reference all three sources at both the preview-update and apply phases — but the **plan.js preview-update logic is masked by the broken `slice(0,12)` filter**. The apply-time dupe check on the plan side uses **direct equality** (`p.productCode === code`) which is correct and catches the actual clash — but only after the user clicks Apply.

### 1-5. Race Condition & Overflow Analysis

**Race condition (two tabs / two users):**
- `_reservedCodes` is an in-memory `Set` in each browser tab. Tab A and Tab B do **not** share it.
- Firestore is not consulted at code-generation time (no transactional check, no atomic counter).
- If both tabs generate for the same prefix simultaneously, both can independently produce the same serial. Whichever saves first lands the code; the second save would silently overwrite if `State.allProducts.push` doesn't dedupe — the apply-time check happens earlier and would have already passed for both.
- **Conclusion**: race window exists in **all four sites**. No site provides cross-tab/cross-user dupe protection. This is a known structural limitation, not a regression.

**Overflow (>99 codes for a single prefix):**
- Sites A, B: `nextNum = null` → preview shows `'사용 가능한 번호 없음'`, apply button disabled (`js/product-code.js:287-295`, `js/modals.js:1552-1554`).
- Sites C, D: same `nextNum = null` branch (`js/plan.js:573-575`, `js/plan.js:1078-1080`), preview shows `'사용 가능한 번호 없음'`. But because `usedNums` is always empty, **overflow never triggers in practice** — sites C/D will happily hand out serial `00` even if 100 codes exist with that prefix.
- No wrap-to-00, no exception thrown, no fallback site.

### 1-6. Test Scenarios

Scenarios are traced through the code logically (no runtime execution). Prefix = `LSWON162667` (11 chars) for all scenarios.

| Scenario | Site A (상품 신규) | Site B (상품 수정) | Site C (기획 신규) | Site D (기획 수정) |
|---|---|---|---|---|
| **#1**: ...05, ...07 exist in `State.allProducts` | next = `00` (first unused — correct) | next = `00` (first unused — correct) | next = `00` (broken filter, `usedNums` empty) | next = `00` (broken filter, `usedNums` empty) |
| **#2**: ...05, ...07 in products + ...06 pending in planItems | next = `00` (still first unused — `00`, `01`...`04` free) | next = `00` (same) | next = `00` (broken filter, empty Set) | next = `00` (broken filter) |
| **#3**: Fresh combination (no existing codes) | next = `00` (correct) | next = `00` | next = `00` (coincidentally correct — empty Set yields `00`) | next = `00` |
| **#4**: All 00~99 taken | preview `'사용 가능한 번호 없음'`, apply disabled | same | preview = `prefix + '00'` (broken — masks overflow). User clicks Apply → apply-time dupe check at line 588-590 fires `'이미 사용 중입니다.'` toast and re-runs `updatePlProductCode` → infinite loop on `00`. | same as Site C, plus `currentOwnCode` exclusion that doesn't help |

The user-visible bug from Sites C/D is most apparent in **Scenario #1 with an existing `00` code** (or any non-`00` lowest available value). With existing codes ...05/...07 the correct next is `00`. With existing `...00` the correct next should be `01` — but Sites C/D would still return `00`, hit the apply-time dupe check, toast an error, and loop. **The user cannot generate any non-`00` serial from the Plan tabs.**

Reproduce conceptually:
1. Open 신규기획 신규등록 panel.
2. Pick a prefix where serial `00` already exists in `State.allProducts` or `State.planItems`.
3. Click 자동생성 — preview shows `<prefix>00`.
4. Click 적용 — toast: "품번 \"...00\"은 이미 사용 중입니다."
5. Preview re-runs — still shows `<prefix>00`. Stuck.

### 1-7. Issues Found

1. **CRITICAL — Sites C, D use broken hard-coded slice length** (`c.slice(0, 12)`). The expected prefix length is `2+1+2+4+1+1 = 11`, not 12. Files/lines:
   - `js/plan.js:560` (`updatePlProductCode`)
   - `js/plan.js:563` (`_reservedCodes` filter, same function)
   - `js/plan.js:1065` (`updatePdProductCode`)
   - `js/plan.js:1069` (`_reservedCodes` filter, same function)
2. **Apply-time dupe check at Sites C, D is correct** and prevents actual write-time collisions, but creates an infinite-loop UX because the preview function cannot advance the serial.
3. **No shared serial-allocation helper** — four independent implementations is the structural root cause. A single shared `_allocateNextSerial(prefix, excludeCode)` function would have prevented the divergence.
4. **Inline comment in `js/modals.js:1528` says `// 12자리`** but the prefix is 11 chars. Cosmetic but misleading — could have contributed to the plan.js author copying a "12" assumption.
5. **No cross-tab/cross-user race protection** in any site — out-of-scope for this bug, but worth documenting.

### 1-8. Proposed Fixes (do NOT implement)

**Minimal fix for Sites C and D** — replace the hard-coded `slice(0, 12)` with length-aware `startsWith`, matching Sites A and B:

`js/plan.js:560`:
```js
// BEFORE
.filter(c => c && c.slice(0, 12) === prefix)
.map(c => c.slice(12))
// AFTER
.filter(c => c && c.length === prefix.length + 2 && c.startsWith(prefix))
.map(c => c.slice(-2))
```

`js/plan.js:563`:
```js
// BEFORE
_reservedCodes.forEach(c => { if (c.slice(0,12) === prefix) usedNums.add(c.slice(12)) })
// AFTER
_reservedCodes.forEach(c => {
  if (c.length === prefix.length + 2 && c.startsWith(prefix)) usedNums.add(c.slice(-2))
})
```

`js/plan.js:1065`:
```js
// BEFORE
.filter(c => c && c !== currentOwnCode && c.slice(0, 12) === prefix)
.map(c => c.slice(12))
// AFTER
.filter(c => c && c !== currentOwnCode && c.length === prefix.length + 2 && c.startsWith(prefix))
.map(c => c.slice(-2))
```

`js/plan.js:1068-1070`:
```js
// BEFORE
_reservedCodes.forEach(c => {
  if (c !== currentOwnCode && c.slice(0, 12) === prefix) usedNums.add(c.slice(12))
})
// AFTER
_reservedCodes.forEach(c => {
  if (c !== currentOwnCode && c.length === prefix.length + 2 && c.startsWith(prefix)) usedNums.add(c.slice(-2))
})
```

**Side-effect range**: Only the preview/serial-allocation UI inside `updatePlProductCode` and `updatePdProductCode`. Apply functions (`applyPlGeneratedCode`, `applyPdGeneratedCode`) are unchanged. No data migration needed. No risk to existing saved codes.

**Optional structural improvement**: extract a single shared helper, e.g., in `js/product-code.js`:
```js
function allocateNextSerial(prefix, excludeCode) {
  const used = new Set()
  ;[...State.allProducts, ...State.planItems].forEach(p => {
    const c = p.productCode || ''
    if (c === excludeCode) return
    if (c.length === prefix.length + 2 && c.startsWith(prefix)) used.add(c.slice(-2))
  })
  _reservedCodes.forEach(c => {
    if (c === excludeCode) return
    if (c.length === prefix.length + 2 && c.startsWith(prefix)) used.add(c.slice(-2))
  })
  for (let i = 0; i <= 99; i++) {
    const n = String(i).padStart(2, '0')
    if (!used.has(n)) return n
  }
  return null
}
```
Replace the four call-sites with `const nextNum = allocateNextSerial(prefix, currentOwnCode)`. Out of scope for the minimal fix but prevents future drift.

## PART 2: Plan 품번 Required Bug

### 2-1. Plan Save Validators

#### `submitPlanRegister()` — `js/plan.js:324-426`

Validators (only one):
```js
const sampleNo = document.getElementById('plSampleNo').value.trim()
if (!sampleNo) { showToast('샘플번호는 필수입니다.', 'error'); return }
```
(`js/plan.js:326-327`)

Then:
```js
productCode: document.getElementById('plProductCode').value.trim() || '',
```
(`js/plan.js:366` — `||''` fallback explicitly allows empty productCode).

```js
if (item.productCode) _reservedCodes.delete(item.productCode)
```
(`js/plan.js:416` — conditional, harmless if empty.)

**No productCode requirement.** `submitPlanRegister` correctly follows the policy.

#### `savePlanDetailEdit()` — `js/plan.js:1334-1431`

Validators:
```js
// 품번 빈 값 체크 → 생성 패널 열기
const pcInput = document.getElementById('pdProductCodeInput')
if (pcInput && !pcInput.value.trim()) {
  showToast('품번이 비어있습니다. 품번을 입력하거나 생성해주세요.', 'warning')
  const panel = document.getElementById('pdCodeGenPanel')
  if (panel && panel.style.display === 'none') togglePdCodeGenPanel()
  pcInput.focus()
  return
}
```
(`js/plan.js:1339-1347`)

This is the **only validator** in the function, and it blocks save when productCode is empty. **Bug.**

### 2-2. The Wrong Requirement

- **Exact lines**: `js/plan.js:1340-1347`.
- **Function**: `savePlanDetailEdit()`.
- **Error message**: `'품번이 비어있습니다. 품번을 입력하거나 생성해주세요.'`
- **Side-effect**: also force-opens the code-gen panel via `togglePdCodeGenPanel()` and focuses the input. This means the user is actively pushed toward generating a code even when they only wanted to edit other fields like nameKr or memo.

### 2-3. Comparison with Policy

Three pieces of evidence the policy is "sampleNo required, productCode optional" for plans:

1. **`submitPlanRegister` (`js/plan.js:326-327`)**: only requires sampleNo. No productCode check.
2. **Excel upload parser (`js/excel.js:1940-1943`)**: only fails on missing sampleNo.
   ```js
   if (!sampleNo) {
     failed.push({ row: userRowNo, productCode: '', name: '', reason: '샘플번호가 비어있습니다 (필수)' })
     return
   }
   ```
3. **CLAUDE.md** (entry 2026-05-08, "Plan Excel upload"): "샘플번호 필수 검증 (현재 등록과 일치)" — meaning the upload follows the same rule as `submitPlanRegister`. The phrase "현재 등록과 일치" explicitly anchors the upload contract to the UI registration contract, which does not require productCode.

`savePlanDetailEdit` is the **only** path that requires productCode and is therefore inconsistent with all three other code paths and the documented policy.

### 2-4. Proposed Fix (do NOT implement)

**Minimal change**: delete or comment out `js/plan.js:1339-1347`.

```js
// BEFORE (js/plan.js:1339-1347)
  // 품번 빈 값 체크 → 생성 패널 열기
  const pcInput = document.getElementById('pdProductCodeInput')
  if (pcInput && !pcInput.value.trim()) {
    showToast('품번이 비어있습니다. 품번을 입력하거나 생성해주세요.', 'warning')
    const panel = document.getElementById('pdCodeGenPanel')
    if (panel && panel.style.display === 'none') togglePdCodeGenPanel()
    pcInput.focus()
    return
  }

// AFTER (block removed entirely)
```

**Side-effect range**:
- Users can save plan edits with an empty productCode (intended behavior — matches `submitPlanRegister` and Excel upload).
- `confirmPlanToProduct` (`js/plan.js:1437-1440`) still requires productCode at confirm-to-product time:
  ```js
  if (!item.productCode || !item.productCode.trim()) {
    showToast('품번이 없습니다. 먼저 품번을 생성/입력 후 저장해주세요.', 'warning')
    return
  }
  ```
  This is **correct and should stay** — productCode is required to become a product (it's the matching key) but not to remain a plan.
- No effect on Product detail modal (`saveDetailEdit` in `modals.js`) — that path requires productCode by design.
- No data migration needed.

## Recommended Implementation Order

1. **Part 2 fix first** (one-block removal, lowest risk, immediate user pain relief). One file, ~9 lines deleted.
2. **Part 1 fix second** — apply the four `slice(0, 12)` → length-aware corrections in `js/plan.js`. Optionally extract a shared `allocateNextSerial` helper to prevent future drift.
3. **Verification** for Part 1: open both plan code-gen panels, pick a prefix with existing ...00 in `State.planItems`, confirm preview shows ...01 (or first available), not ...00. Also confirm overflow scenario (test by temporarily seeding 100 plan items with the same prefix) yields `'사용 가능한 번호 없음'`.
4. **Verification** for Part 2: open 신규기획 상세 모달 with an existing item that has no productCode, edit any other field, save — should succeed silently. Open 신규기획 상세 모달 with a productCode, edit and save — unchanged. Try `상품확정` with empty productCode — should still block at `confirmPlanToProduct`.

## Honest Gaps

- I did not exhaustively scan for other call-sites that might depend on `c.slice(0, 12)` semantics. A quick grep would confirm whether the bad pattern appears elsewhere; recommend doing so before commit.
- I did not execute the code; the "always returns 00" claim is by static analysis. Worth verifying in a browser session by opening the panel against a seeded `State.planItems` containing a `...00` for the chosen prefix and watching the preview.
- The race-condition discussion is intentionally brief — fixing it is a larger architectural change (Firestore transaction or counter document) outside the scope of these two bugs.
- I did not check whether any test fixtures, seed scripts, or documentation reference "12자리" prefix; those would need a wider grep to fully eliminate stale assumptions.
