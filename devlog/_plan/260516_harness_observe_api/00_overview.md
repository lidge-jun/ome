# Harness-Level Observe API

> Future work — plan only, not scheduled

## What

OME already has low-level real-time tracking primitives:
- `watch(jobId)` — AsyncGenerator streaming ProgressEvents
- `inspect(jobId)` — snapshot of toolCalls/thinking/output
- `bus.emit('job_log')` — per-line EventEmitter
- NDJSON log files per job

What's missing is a **harness-friendly observe layer** that a boss agent (cli-jaw)
can consume without reimplementing progress aggregation logic.

## Target Features

### F1: Progress Summary
A single call that returns structured progress for a running job:
```typescript
interface JobProgress {
    jobId: string;
    cli: string;
    status: JobStatus;
    elapsed: number;
    tools: { total: number; completed: number; running: number; failed: number };
    lastActivity: { type: string; message: string; at: string };
    outputChars: number;
    thinkingChars: number;
}
```
Built on top of `inspect()` — adds elapsed time, tool counts, last-activity timestamp.

### F2: Multiplexed Watch
Subscribe to events from multiple jobs simultaneously:
```typescript
async function* watchAll(jobIds: string[]): AsyncGenerator<{ jobId: string; event: ProgressEvent }>
```
Use case: harness dispatches 3 employees in parallel, needs a single event stream.

### F3: Stall Detection
Detect when a job hasn't produced output for a configurable duration:
```typescript
interface StallConfig { warningMs: number; timeoutMs: number; }
bus.emit('job_stall', { jobId, silentMs, threshold })
```
Harness can use this to auto-kill or alert on hung agents.

### F4: Structured Job Summary
After job completion, a richer summary than `SpawnResult.text`:
```typescript
interface JobSummary {
    jobId: string;
    cli: string;
    durationMs: number;
    sessionId?: string;
    toolsUsed: string[];
    thinkingBlocks: number;
    outputLength: number;
    exitCode: number;
    errorSummary?: string;
}
```

## File Map (estimated)

| Feature | File | Action | Lines |
|---------|------|--------|-------|
| F1 | `src/observe/progress.ts` | NEW | ~60 |
| F2 | `src/observe/watch-all.ts` | NEW | ~50 |
| F3 | `src/observe/stall.ts` | NEW | ~40 |
| F4 | `src/observe/summary.ts` | NEW | ~50 |
| all | `src/observe/index.ts` | MODIFY | re-export |
| all | `tests/observe/progress.test.ts` | NEW | ~40 |
| all | `tests/observe/stall.test.ts` | NEW | ~30 |

## Dependencies

- All features build on existing `inspect()`, `watch()`, `bus`, `readJobMeta/Log`
- No changes to spawn layer needed
- Harness (cli-jaw) would import from `ome/observe`

## Priority

Not blocking any current work. Implement when cli-jaw starts consuming OME as a
dependency instead of its own spawn code.

## Status

| Feature | Status |
|---------|--------|
| F1 Progress Summary | done — `src/observe/progress.ts` |
| F2 Multiplexed Watch | done — `src/observe/watch-all.ts` |
| F3 Stall Detection | done — `src/observe/stall.ts` |
| F4 Structured Summary | done — `src/observe/summary.ts` |
| Skill Patch Plan | done — `01_phase1_skill_patch.md` |
| cli-jaw Migration | future — blocked on OME npm publish |
