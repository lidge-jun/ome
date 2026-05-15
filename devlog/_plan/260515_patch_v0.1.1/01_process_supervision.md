# Patch 01 — Process Supervision

Fixes: R1 (Unix process-tree kill broken), R2 (timeout marks stopped before dead), R3 (killAgent unsafe)

## Problem

1. `spawn()` does not set `detached: true` → `process.kill(-pid)` group kill silently fails on Unix
2. `killJob()` immediately deletes from `activeJobs` + marks cancelled/failed **before** child exits → zombie processes
3. `killAgent()` kills last-spawned process only, ignores jobId → data corruption in multi-job
4. `scheduleForceKill()` only sends SIGKILL to parent PID, not process group

## Changes

### MODIFY `src/registry/types.ts`

Add `'cancelling'` to JobStatus:

```diff
-export type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled';
+export type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling';
```

### MODIFY `src/spawn/index.ts`

**a) Add `detached: true` to spawn options (Unix only):**

```diff
 const child = spawn(cliPath, args, {
     cwd: opts.cwd ?? process.cwd(),
     env,
     stdio: ['pipe', 'pipe', 'pipe'],
+    detached: process.platform !== 'win32',
 });
```

**b) Remove `killAgent()` entirely (lines 125-133):**

Replace with `killAllJobs()` that iterates activeJobs:

```typescript
export function killAllJobs(reason = 'user'): number {
    let killed = 0;
    for (const jobId of [...activeJobs.keys()]) {
        if (killJob(jobId, reason)) killed++;
    }
    return killed;
}
```

**c) Rewrite `killJob()` — mark cancelling, defer cleanup to `close` event:**

Current flow (broken):
```
killJob() → cancelJob() → delete activeJobs → scheduleForceKill
           ^-- marks final status BEFORE process exits
```

New flow:
```
killJob() → updateJob({ status: 'cancelling' }) → terminateProcessTree → scheduleForceKill
  close event → cancelledJobs check → cancelJob/completeJob → delete activeJobs
```

```diff
 export function killJob(jobId: string, reason = 'user'): boolean {
     const proc = activeJobs.get(jobId);
     if (!proc) return false;
     bus.emit('agent_kill', { reason, pid: proc.pid, jobId });
     cancelledJobs.add(jobId);
-    if (reason === 'user') {
-        cancelJob(jobId);
-    } else {
-        completeJob(jobId, 1);
-    }
+    updateJob(jobId, { status: 'cancelling', phase: 'cancelling' });
     terminateProcessTree(proc.pid);
     scheduleForceKill(proc.pid);
-    activeJobs.delete(jobId);
-    lineBuffers.delete(jobId);
+    // cleanup deferred to close event in settle()
     return true;
 }
```

**d) Update `settle()` to handle cancelling → cancelled transition:**

```diff
 const settle = (code: number) => {
     if (settled) return;
     settled = true;
     if (timer) clearTimeout(timer);
     // ... flush lineBuffers ...
     activeJobs.delete(job.id);
     if (activeProcess === child) activeProcess = null;
     if (cancelledJobs.has(job.id)) {
         cancelledJobs.delete(job.id);
+        cancelJob(job.id);
     } else {
         completeJob(job.id, code);
     }
 };
```

**e) Remove `activeProcess` singleton tracking (lines 10, 41, 93, 131):**

`activeProcess` is a single-reference → misleading in multi-job. Remove the variable entirely; `killAllJobs()` replaces `killAgent()`.

### MODIFY `src/spawn/process-kill.ts`

**a) Force-kill targets the process group too:**

```diff
 export function scheduleForceKill(pid: number | undefined | null, delayMs = 2000): void {
     if (!pid) return;
     setTimeout(() => {
-        try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
+        try { process.kill(-pid, 'SIGKILL'); } catch { /* ignore */ }
+        try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
     }, delayMs).unref();
 }
```

### MODIFY `src/registry/db.ts`

**Add busy_timeout pragma:**

```diff
 db = new Database(dbPath);
 db.pragma('journal_mode = WAL');
+db.pragma('busy_timeout = 5000');
```

### MODIFY `src/cli/index.ts`

**Replace `killAgent` import with `killAllJobs`:**

```diff
-import { spawnAgent, isAgentBusy, killJobByPid } from '../spawn/index.js';
+import { spawnAgent, isAgentBusy, killJobByPid, killAllJobs } from '../spawn/index.js';
```

### NEW `tests/spawn/process-tree.test.ts`

Test that:
1. Spawned child with grandchild — both killed on `killJob()`
2. `cancelling` status visible before process exits
3. `cancelled` status only set after close event
4. `killAllJobs()` kills all active jobs

Fixture: tiny script that spawns `sleep 60` as grandchild, parent prints grandchild PID.

## Exports Impact

- `killAgent()` → **removed** (breaking, but v0.1.x is pre-1.0)
- `killAllJobs()` → **new export** added to `src/index.ts`
- `JobStatus` union gains `'cancelling'`
