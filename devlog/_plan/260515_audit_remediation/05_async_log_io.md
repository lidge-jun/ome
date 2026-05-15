# Phase 05 — Async Log I/O

## Problem

`appendJobLog()` uses `appendFileSync()` — blocks the event loop on every line of agent output. Under heavy output (code generation, streaming), this stalls the web dashboard and API.

`readJobLog()` and `readJobLogFrom()` load entire files/remainders into memory — large logs cause memory spikes during inspect/watch.

## Plan

### MODIFY `src/spawn/jobs.ts`

**Write path**:
- Replace `appendFileSync` with a write stream per job
- Create `WriteStream` on job creation, close on job completion
- Buffer writes internally (Node streams already batch)

```typescript
// Before
appendFileSync(logFile, `${line}\n`, 'utf8');

// After
const stream = getJobStream(id);
stream.write(`${line}\n`);
```

**Read path**:
- `readJobLog()`: use `createReadStream` + readline for line-by-line parsing, return array
- `readJobLogFrom()`: use `createReadStream({ start: byteOffset })` instead of `Buffer.alloc(remainder)`
- Add max line count parameter (default 1000) to prevent unbounded memory

### MODIFY callers
- `appendJobLog` signature stays the same (fire-and-forget write)
- `readJobLog` / `readJobLogFrom` become async — update callers in web routes

## Verification
- `npm test` passes
- `npm run typecheck` passes
- Stress test: spawn agent with 10k+ line output → dashboard remains responsive
