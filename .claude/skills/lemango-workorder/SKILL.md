---
name: lemango-workorder
description: Execution discipline for LEMANGO POS work orders from Claude.ai. Use this skill EVERY TIME a work order (작업 지시서 / WORK ORDER) arrives — it defines the mandatory execution sequence, quality gates, STOP conditions, and report format that keep results at the project's established quality bar regardless of model tier.
---

# LEMANGO Work-Order Execution Skill

You are Claude Code in a 3-way workflow: jjo (owner, non-technical, Korean) ↔ Claude.ai (architect/translator, writes these work orders) ↔ you (implementer). jjo does NOT re-review work orders — Claude.ai is trusted. Your reports go back through Claude.ai. Follow this sequence for EVERY work order.

## 0. Read the whole order + CLAUDE.md rules FIRST
- Read the full work order before any code. Identify: scope boundary ("X ONLY"), the critical properties list, STOP conditions, deploy surface, authoritative design doc (if named — the design doc WINS where the order is silent).
- Re-read CLAUDE.md's Living Rules + Quality Bar sections. Every house invariant (anchor principle, exactly-once, atomicity, KST, integer KRW, rules craft, legacy compat) applies by default even if the order doesn't repeat it.

## 1. Investigate before building (diagnose-first)
- Locate every integration point in the REAL code (quote file:line in the report). For bugfixes: reproduce → read logs/actual Firestore docs → state root cause with evidence BEFORE fixing.
- If the order's assumptions don't match the code (schema drift, a conflicting mechanism, a missing field), STOP and report — do not silently adapt. (Precedent: the split-line vs void-keying conflict was caught pre-code and resolved by owner decision. That is the standard.)

## 2. STOP-and-report triggers (never improvise past these)
- Deviation needed from an approved design doc's schema/mechanism
- Unexpected rules / index / data-model change mid-task
- A guarantee you cannot meet (atomicity, exactly-once, byte-unchanged, race-safety)
- An owner-policy question (anything a store owner should decide) — report options + your recommendation in Korean-friendly terms; Claude.ai relays to jjo

## 3. Build to the house patterns (never reinvent)
- New behavior FOLDS INTO existing primitives (per-line unitDiscount; storeInbound movement ledger; established lookup/draft/guard/preflight utilities). Ask "which primitive absorbs this?" before creating anything new.
- Money/stock writes: FieldValue.increment inside ONE atomic batch (or runTransaction for cumulative caps); deterministic doc ids for exactly-once; pending-number persisted in draft; permission-denied → disambiguation read.
- KST arithmetic utils only; integer KRW with floor + remainder-to-highest; signed/dual-delta generic reversal; Map.get defaults + affectedKeys().hasOnly() in rules; legacy fallbacks byte-identical.
- No inline display:none; reuse design tokens; explicit-close-only for work-surface windows; cursor discipline for scan flows.

## 4. Verify with EVIDENCE (claims don't count)
Build the verification table from the order's checklist and add, where applicable:
- before/after stock/money values; tight-loop uniqueness tests; double-click + retry drills (prove batch-wide denial / token no-op); rules-simulator matrix (admin / own-store / office '' / forged uid / update / delete); grep proofs (e.g., zero stock writes in a read-only feature); byte-unchanged diffs for protected paths (3c/3e money mechanics, Cafe24/사방넷 formulas); regression sweep of adjacent features.
- Run node -c on changed JS; JSON-validate rules/indexes files.

## 5. Reviewer gate
- Invoke code-reviewer with the order's critical-properties list. 🔴/🟡 findings → fix → re-review. Report the verdict AND what the reviewer explicitly verified. A reviewer catch is a feature, not an embarrassment — report it plainly (what, why it mattered, the fix).

## 6. Report (through Claude.ai, for a Korean owner)
- English, wrapped in markers:
  `========================================`
  `📋 작업 결과 / REPORT START`  … `✅ 작업 결과 끝 / REPORT END`
- Sections: Summary (files, reviewer verdict, key guarantees confirmed) → mechanism details with file:line → verification TABLE → decision log (every judgment call, incl. deliberate deviations WITH reasons) → follow-up flags (pre-existing issues noticed) → exact deploy command (hosting vs rules vs indexes; index build-time note; hard-refresh note) → 🧪 한글 테스트 체크리스트 (numbered, owner-runnable).
- **PASTE IN CHUNKS** ([1/N]…): the owner's client truncates long pastes. Tables render well as screenshots.
- Git: commit with selective staging (exclude .claude/.firebase harness files); if on a worktree branch, state branch+commit and remind that main-merge precedes deploy. NEVER leave shipped work uncommitted.
- Update CLAUDE.md (claude-md-history skill): rules verbatim, history as a 1-line changelog entry. Keep it compact.

## 7. Never do
- Deploy (owner deploys manually — always give the exact command instead)
- Touch the sales formulas (Cafe24 P+Q-U(MAX)-Y / 사방넷 H+I)
- Chunk an offsetting atomic session; use Intl/local time; float money math; read-modify-write stock; delete audit records; fake a reconciliation or hide a limitation
