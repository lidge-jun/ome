# Phase 03 — Dispatch Resume Bugfix

## Problem

In `src/dispatch/index.ts`, stale-session retry returns the **wrong jobId**:

```typescript
const { jobId } = spawnAgent(task, { ...opts, sessionId });  // const — first spawn
// ...
if (isStaleSession(...)) {
    const retry = spawnAgent(task, { ...opts, sessionId: undefined });
    sr = await retry.result;
    sr.jobId = retry.jobId;      // sr updated ✓
}
return { ...sr, jobId };         // jobId is still the FIRST spawn's const ✗
```

`{ ...sr, jobId }` spreads `sr` (which has the updated `sr.jobId`) but then **overrides** with the destructured `jobId` const from the first spawn. Caller gets the failed job's ID.

## Plan

### MODIFY `src/dispatch/index.ts`
- Change `const { jobId }` → `let jobId`
- After retry: `jobId = retry.jobId;`
- Or simpler: change return to `{ ...sr }` since `sr.jobId` is already correct

### NEW `tests/dispatch/resume-retry.test.ts`
- Test: stale session detected → retry → returned jobId matches retry's jobId
- Test: non-stale failure → original jobId preserved

## Verification
- `npm test` — new dispatch resume tests pass
- `npm run typecheck` passes
