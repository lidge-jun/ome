# Phase 01 — Source/Docs/Tests Consistency

## Problem

Three sources disagree about default employees:

| Location | Count | Names |
|----------|------:|-------|
| `src/seed/index.ts` | 4 | Frontend, Backend, Data, Docs |
| `README.md` | 3 | Claude, Codex, Gemini |
| `tests/seed/seed.test.ts` | 3 | `assert.equal(added.length, 3)` |

The seed test likely fails against current source.

## Plan

### MODIFY `README.md`
- Update "ome init — Seed Defaults" table to show 4 employees: Frontend, Backend, Data, Docs
- Update CLI/model/role values to match `src/seed/index.ts` exactly

### MODIFY `tests/seed/seed.test.ts`
- Line 24: `assert.equal(added.length, 3)` → `assert.equal(added.length, 4)`
- Line 26: `assert.equal(listEmployees().length, 3)` → `assert.equal(listEmployees().length, 4)`
- Line 33: `assert.equal(skipped.length, 3)` → `assert.equal(skipped.length, 4)`
- Line 34: `assert.equal(listEmployees().length, 3)` → `assert.equal(listEmployees().length, 4)`

### MODIFY `docs/index.html` (if it references defaults)
- Align with source

## Verification
- `npm test` — seed suite passes
- README table matches `defaultEmployees` array in source
