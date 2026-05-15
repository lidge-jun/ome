# Phase 06 — State Coherence

## Problem

`isAgentBusy()` and `getActiveJobs()` use a process-local `Map<string, ChildProcess>`. Different OME processes disagree about active state:

- Process A spawns → A's map says busy
- Process B checks status → B's map says idle
- Job files on disk say running

The web dashboard and `ome status` show misleading results when run from a different process than the one that spawned.

## Plan

### MODIFY `src/spawn/index.ts`
- On spawn: write PID to job meta file (already partially done)
- `isAgentBusy()`: check BOTH process-local map AND persisted running jobs
- Add `isProcessAlive(pid)` helper — `process.kill(pid, 0)` with try/catch

### MODIFY `src/spawn/jobs.ts`
- Add `listRunningJobs()`: return jobs with status `running` from disk
- Add `reconcileStaleJobs()`: on startup, check running jobs' PIDs — mark dead ones as `failed`/`abandoned`

### MODIFY `src/cli/index.ts` (status command)
- Show: process-local active count, persisted running count, stale/orphaned count

### MODIFY `src/web/routes.ts`
- Status endpoint: merge process-local + persisted state
- Dashboard: show stale job indicator

## Verification
- Start OME in terminal A, spawn a job
- Run `ome status` in terminal B → shows the running job
- Kill terminal A → run `ome status` in B → shows orphaned/stale job
- Restart OME → stale jobs reconciled on startup
