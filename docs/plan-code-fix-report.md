# Plan Product Code Fix Report

**Date**: 2026-05-22
**Status**: Implementation complete. Deployment pending owner action.
**Investigation reference**: docs/code-gen-and-plan-required-investigation.md

## Summary
- **Part 1**: Serial slice fixed in 2 `js/plan.js` functions. Both now use the length-aware predicate `c.length === prefix.length + 2 && c.startsWith(prefix)` and `c.slice(-2)` extraction — semantically identical to the canonical implementation in `js/product-code.js:269` and `js/modals.js:1537`.
- **Part 2**: 9-line productCode-required block removed from `savePlanDetailEdit()` and replaced with a 2-line policy comment. The transition guard at `confirmPlanToProduct()` (lines 1436-1439) is preserved — correct because plan→product conversion requires productCode as the matching key.
- **Files changed**: 1 (`js/plan.js`). `git diff --stat HEAD -- js/` confirms no other JS file touched.

## Part 1: Serial Slice Fix

### 1-1. updatePlProductCode (register panel) — js/plan.js

**Before** (per investigation, the prior pattern):
```js
.filter(c => c.slice(0, 12) === prefix)   // BUG: prefix is 11 chars → always false
.map(c => c.slice(12))                    // extracts empty/wrong substring
```

**After** (lines 556-567 of current file):
```js
const prefix = cls + gen + typ + des + year + seasonNum
// 길이 인식 매칭 — prefix는 11자, 전체 품번은 13자(prefix + 2자 일련번호)
// (이전 c.slice(0,12) === prefix 비교는 11자/12자 불일치로 항상 false → ...00 무한 루프 버그)
const usedNums = new Set(
  [...State.allProducts, ...State.planItems]
    .map(p => p.productCode)
    .filter(c => c && c.length === prefix.length + 2 && c.startsWith(prefix))
    .map(c => c.slice(-2))
)
_reservedCodes.forEach(c => {
  if (c.length === prefix.length + 2 && c.startsWith(prefix)) usedNums.add(c.slice(-2))
})
```

Verified intact in surrounding code: `prefix` still computed as 11-char concat (cls+gen+typ+des+year+seasonNum), 0~99 iteration loop unchanged (lines 569-573), apply-button enable/disable logic unchanged (lines 575-585).

### 1-2. updatePdProductCode (edit panel) — js/plan.js

**After** (lines 1062-1076):
```js
const prefix = cls + gen + typ + des + year + season
// 현재 편집 중인 아이템의 기존 품번은 제외 (재생성 허용)
const currentItem = State.planItems.find(p => p.no === _editingPlanNo)
const currentOwnCode = currentItem?.productCode || ''
// 길이 인식 매칭 — prefix는 11자, 전체 품번은 13자
// (이전 c.slice(0,12) === prefix 비교는 11자/12자 불일치로 항상 false → ...00 무한 루프 버그)
const usedNums = new Set(
  [...State.allProducts, ...State.planItems]
    .map(p => p.productCode)
    .filter(c => c && c !== currentOwnCode && c.length === prefix.length + 2 && c.startsWith(prefix))
    .map(c => c.slice(-2))
)
_reservedCodes.forEach(c => {
  if (c !== currentOwnCode && c.length === prefix.length + 2 && c.startsWith(prefix)) usedNums.add(c.slice(-2))
})
```

**currentOwnCode exclusion: PRESERVED** in BOTH the planItems filter (line 1071) AND the `_reservedCodes` loop (line 1075). Empty-`des` early return remains at lines 1056-1060.

### 1-3. Pattern parity with canonical implementations

All four sites now use semantically equivalent matching logic:

| File | Function | Match predicate line | Extract |
|------|----------|----------------------|---------|
| `js/product-code.js` | `updateProductCode` | :269 | :270 (`c.slice(-2)`) |
| `js/modals.js` | `updateDetailProductCode` | :1537 | :1537 (`c.slice(-2)`) |
| `js/plan.js` (FIXED) | `updatePlProductCode` | :562 (+ :566 for reserved) | :563, :566 |
| `js/plan.js` (FIXED) | `updatePdProductCode` | :1071 (+ :1075 for reserved) | :1072, :1075 |

### 1-4. Verification (traceable scenarios)

| Scenario | Expected | Mechanism (lines in updatePlProductCode) |
|---|---|---|
| Fresh combination | preview `...00` | `usedNums` empty → loop picks `'00'` (570-572) |
| Existing `...00` in allProducts/planItems | preview `...01` | `usedNums` contains `'00'`, loop skips to `'01'` (562-563, 570-572) |
| Pending plan code `...02` in `_reservedCodes` | preview `...03` | reserved scan adds `'02'` (565-567), loop skips to `'03'` |
| Self-edit own `...05` (updatePdProductCode) | preview `...05` (no bump) | `currentOwnCode` excluded in both filters (1071, 1075) |
| Combination saturated 00-99 | preview `'사용 가능한 번호 없음'`, apply disabled, seq `'만료'` | `nextNum === null` branch (577-580) |

## Part 2: 품번 Required Removal

### 2-1. Block removed from savePlanDetailEdit (js/plan.js)

**Removed** (per investigation, was at pre-fix lines 1339-1347):
```js
const productCodeInput = document.getElementById('pdProductCodeInput')
if (!productCodeInput.value.trim()) {
  showToast('품번은 필수입니다.', 'error')
  return
}
```
(approximate — 9 lines around DOM lookup + error toast + return)

**Replaced with** (lines 1345-1346 of current file):
```js
// 정책: 신규기획은 샘플번호만 필수, 품번은 선택 입력.
//       품번 강제 검증은 plan→product 이전 시점(confirmPlanToProduct)에서 수행.
```

Function body otherwise unchanged: item-find at line 1341, modal lookup at 1343, pending image upload at 1349-1354, save logic at 1356 onward.

### 2-2. Preserved guard at confirmPlanToProduct

**Lines 1436-1439** (unchanged):
```js
if (!item.productCode || !item.productCode.trim()) {
  showToast('품번이 없습니다. 먼저 품번을 생성/입력 후 저장해주세요.', 'warning')
  return
}
```

**Reason preserved**: `confirmPlanToProduct()` performs the plan→product transition. Once converted, `productCode` becomes the matching key in `State.allProducts` (used for stock/sales/revenueLog lookups). Requiring it at the transition is correct.

### 2-3. Other plan save paths (no regression)

- **`submitPlanRegister`** at `js/plan.js:326-327`:
  ```js
  const sampleNo = document.getElementById('plSampleNo').value.trim()
  if (!sampleNo) { showToast('샘플번호는 필수입니다.', 'error'); return }
  ```
  Only `sampleNo` required, `productCode` optional. Unchanged.

- **Excel upload** `_parsePlanUpload` at `js/excel.js:1940-1943`:
  ```js
  if (!sampleNo) {
    failed.push({ row: userRowNo, productCode: '', name: '', reason: '샘플번호가 비어있습니다 (필수)' })
    return
  }
  ```
  Only `sampleNo` required. Unchanged.

## Regression Check

| Area | Touched? | Note |
|---|---|---|
| Sales formulas | NO | `js/gonghom.js`, `js/sabangnet.js` not in `git diff --name-only` |
| Excel plan upload | NO | `js/excel.js:1940` still sampleNo-only |
| `_reservedCodes` Set semantics | NO | only the matching predicate changed; add/delete behavior intact |
| `submitPlanRegister` validation | NO | sampleNo-only enforcement preserved |
| `applyPlGeneratedCode` / `applyPdGeneratedCode` | NO | final-duplicate check + reservation flow unchanged |
| Header-button toggles, edit-lock, watchers | NO | `_pdUpdateHeaderBtns`, `releaseEditLock`, `notifyWatchers` calls unchanged |
| Other JS files | NO | `git diff --name-only HEAD -- js/` shows only `js/plan.js` |

`git diff --stat HEAD`:
```
.claude/settings.local.json |  6 +++++-
js/plan.js                  | 29 ++++++++++++++---------------
```
(settings.local.json is local IDE config, out of scope.)

## Edge Cases

- **Saturation 00-99**: `nextNum` stays `null` → register panel shows seq `'만료'` + preview `'사용 가능한 번호 없음'` + apply disabled (lines 577-580). Edit panel shows preview `'사용 가능한 번호 없음'` + apply disabled (lines 1084-1086). No crash.
- **Empty combination** (cls or des missing): register panel early `return` at line 554 (`if (!cls || !des) return`). Edit panel handles empty `des` at lines 1056-1060 (sets preview text + disables apply, then returns) — does not crash.
- **Self-edit own code** (updatePdProductCode): `currentOwnCode` excluded from both `State` filter (line 1071) and `_reservedCodes` loop (line 1075). Regenerating over the current item's own code does NOT mark it as "used" → serial does not shift.

## Decision Log

| Decision | Choice | Reason |
|---|---|---|
| Match pattern | length-aware (`c.length === prefix.length + 2 && c.startsWith(prefix)`) + `c.slice(-2)` | Mirrors canonical `product-code.js:269` / `modals.js:1537`; eliminates the 11/12-char-mismatch always-false bug |
| Required-field block | Delete from `savePlanDetailEdit` | Violates "샘플번호 only" policy; `confirmPlanToProduct` still enforces at transition |
| 품번 transition guard | Preserve at `confirmPlanToProduct:1436-1439` | Plan→Product conversion needs productCode as matching key |
| currentOwnCode exclusion (edit panel) | Preserve in both filters | Allows user to re-generate over own existing code without bumping serial |

## Cautions / Future Work

- **Cross-tab race condition**: `_reservedCodes` is per-tab/in-memory. Two browser tabs generating codes for the same combination could both reserve the same number before either saves. Not addressed in this fix (separate issue per investigation).
- **99-saturation behavior**: graceful — preview shows error text, apply disabled. No automatic prefix increment (intentional by design; alerts the user to manually adjust).
- **Pre-existing data**: any plan items whose `productCode` was assigned during the buggy `slice(0,12)` era may have inconsistent serials (likely a cluster of `...00` codes from the same combination). Not a defect of the fix, but a data artifact to watch for. Manual cleanup may be needed if duplicate `...00` exists across combinations.

## Local Testing Checklist (Korean)

1. 신규기획 등록 모달 → 분류/타입 선택 → 품번 생성 → 미리보기 `...00` 표시 (해당 조합 첫 코드)
2. 위 코드 저장 후 같은 조합 다시 → 미리보기 `...01` 표시 (무한 ...00 루프 해소 확인)
3. 신규기획 수정 모달 → 같은 조합의 기존 품번을 재생성 → 자기 자신 코드 유지 (시리얼 안 밀림)
4. 신규기획 수정 모달 → 품번 비운 채 저장 → 토스트 차단 없이 정상 저장됨
5. 신규기획 → 상품 이전(확정) 시도 → 품번 없으면 여전히 차단 (`confirmPlanToProduct` 가드 유지)
6. 상품조회 신규등록 → 같은 조합 → 미리보기 → Plan과 동일한 다음 시리얼 (canonical pattern parity)
7. 상품조회 상세 수정 → 같은 조합 → 미리보기 → Plan과 동일한 다음 시리얼

## Deployment Notes

- User runs: `firebase deploy --only hosting` (JS-only change)
- No Firestore/Storage rule changes
- No data migration required
- No schema changes — pre-existing plan items remain readable
