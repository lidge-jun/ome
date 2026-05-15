# Phase 3 — Employee Management Polish

## Goal
Improve add/remove/edit UX. Fix minor issues.

## Changes

### 1. Add Employee Validation
- Name: required, trim, max 30 chars, no duplicates (show error inline, not alert)
- CLI: already a `<select>` ✅
- Model: optional, but pre-fill default for selected CLI

### 2. Toast/Feedback
- After add: flash green "Added {name}" toast, auto-dismiss 3s
- After delete: flash red "Removed {name}" toast
- After save: flash blue "Updated {name}" toast
- On error: flash red toast with error message

### 3. Empty State
- When no employees: show "No employees yet. Click + 추가 to register your first agent."

### 4. Card Status Integration
- If `/api/quota/live` shows `authenticated: false` for an employee's CLI → show yellow warning on card
- If quota windows exist → show mini usage indicator on card header

### 5. Drag-to-Reorder (DEFER)
- Not critical for v2. Keep add-order or alphabetical.

## Files Changed

| File | Action |
|------|--------|
| `src/web/dashboard.ts` | MODIFY — toast system, validation, empty state |
| `src/web/dashboard-styles.ts` | MODIFY — toast styles |

## Verification
- Add employee with empty name → inline error (not alert)
- Add duplicate name → 409 error shown as toast
- Delete employee → confirm + toast
- Save edit → toast + card updated
