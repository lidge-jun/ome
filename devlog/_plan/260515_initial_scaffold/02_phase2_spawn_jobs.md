# P2: Enhanced Spawn + Job Tracking

## Summary
spawnAgent에 job persistence 추가. 모든 spawn이 jobId를 생성하고 meta + NDJSON log를 기록.
cross-platform process kill 개선.

> **Note**: `sessionId` 캡처는 CLI별 session marker 규격이 미확정이므로 Job 타입에 필드만 유지하고
> 실제 파싱/저장은 future phase로 연기. 현재는 항상 `null`.

## Audit Fixes Applied (Round 1)
- ✅ `killAgent` API 분리 → 기존 `killAgent(reason)` 유지 + 별도 `killJob(jobId, reason)` 추가
- ✅ stdout chunk boundary 처리 → child별 line buffer 유지
- ✅ process-tree kill → `terminateProcessTree()` helper 분리
- ✅ jobs 테이블 diff 누락 → file-based only로 scope 확정 (SQLite는 index만)
- ✅ jobId validation → `JOB_ID_RE` regex guard 추가

## Audit Fixes Applied (Round 2)
- ✅ `cpSpawn` unused import 제거 in process-kill.ts
- ✅ sessionId → scope를 "placeholder, P-future"로 명시 (현재 CLI별 session marker 규격 미확정)
- ✅ `isAgentBusy()` → `activeJobs.size > 0` 기반으로 변경
- ✅ `killJob()` → user cancel은 `cancelJob()`, timeout은 `completeJob(id, 1)` 분리
- ✅ `writeJobMeta()` → atomic rename (write to tmp, rename)
- ✅ `pruneJobs()` → running job 제외
- ✅ spawn settled guard → `let settled = false` 추가 (close/error 이중 호출 방지)

## Audit Fixes Applied (Round 3)
- ✅ `isAgentBusy()` → REPLACE 기존 함수 body, 새로 추가하지 않음
- ✅ process-tree kill `ESRCH` → 단일 process fallback 추가
- ✅ `settle()` → `if (activeProcess === child) activeProcess = null` 추가
- ✅ killJob+settle race → `cancelledJobs` Set으로 terminal status 보호
- ✅ `spawnAgent` 반환 변경 → `{ jobId, result: Promise<SpawnResult> }` (jobId 즉시 노출)
- ✅ `killJobByPid()` 추가 → 별도 CLI 프로세스에서 meta.pid 기반 kill 지원

## Audit Fixes Applied (Round 4)
- ✅ `let activeProcess` 선언 유지 명시 — REPLACE block은 기존 `isAgentBusy()`/`getActiveProcess()` body만 교체, `let activeProcess: ChildProcess | null = null` 선언은 반드시 유지
- ✅ `src/dispatch/index.ts` MODIFY 추가 — spawnAgent 반환형 `{jobId, result}` 대응. dispatch가 `const { jobId, result } = spawnAgent(...)` 후 `const sr = await result; return { ...sr, jobId }` 반환
- ✅ jobId 이중 존재 명시 — wrapper `{jobId}` = start-time 즉시 접근용, `SpawnResult.jobId` = completed result 편의용. 의도적 중복
- ✅ `src/index.ts` re-export — `listAllJobs` alias 제거 → `listJobs`로 통일

## Audit Fixes Applied (Round 5)
- ✅ `killJobByPid()` → `terminateProcessTree()` 결과 확인: `delivered === false`면 meta 재읽기 후 이미 종료됐으면 상태 변경 skip

## Files

| Action | Path | Description |
|--------|------|-------------|
| NEW | `src/spawn/jobs.ts` | Job persistence — create, read, update, list, prune |
| NEW | `src/spawn/process-kill.ts` | Cross-platform process tree termination |
| MODIFY | `src/spawn/index.ts` | spawnAgent에 job lifecycle 연동, line buffer |
| MODIFY | `src/registry/types.ts` | Job, ProgressEvent 타입 추가 |
| MODIFY | `src/dispatch/index.ts` | spawnAgent 반환형 변경 대응 |

---

## NEW: `src/spawn/jobs.ts`

```typescript
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync, readdirSync, unlinkSync, renameSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Job, JobStatus } from '../registry/types.js';

const MAX_JOBS = 50;
const JOB_ID_RE = /^job-[a-z0-9]+-[a-z0-9]+$/;

function jobsDir(): string {
    const dir = join(process.env['OME_HOME'] ?? join(homedir(), '.ome'), 'jobs');
    mkdirSync(dir, { recursive: true });
    return dir;
}

export function isValidJobId(id: string): boolean {
    return JOB_ID_RE.test(id) && !id.includes('..');
}

function safeJobPath(id: string, ext: string): string {
    if (!isValidJobId(id)) throw new Error(`Invalid job ID: ${id}`);
    return join(jobsDir(), `${basename(id)}${ext}`);
}

export function createJob(cli: string, prompt: string, model?: string): Job {
    const id = `job-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    const job: Job = {
        id,
        cli,
        prompt: prompt.slice(0, 200),
        model: model ?? null,
        status: 'running',
        phase: 'starting',
        pid: null,
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
    };
    writeJobMeta(id, job);
    writeFileSync(safeJobPath(id, '.ndjson'), '', 'utf8');
    pruneJobs();
    return job;
}

export function updateJob(id: string, patch: Partial<Job>): void {
    const meta = readJobMeta(id);
    if (!meta) return;
    const updated = { ...meta, ...patch, updatedAt: new Date().toISOString() };
    writeJobMeta(id, updated);
}

export function completeJob(id: string, code: number): void {
    updateJob(id, {
        status: code === 0 ? 'completed' : 'failed',
        phase: code === 0 ? 'done' : 'failed',
        pid: null,
        completedAt: new Date().toISOString(),
    });
}

export function cancelJob(id: string): void {
    updateJob(id, {
        status: 'cancelled',
        phase: 'cancelled',
        pid: null,
        completedAt: new Date().toISOString(),
    });
}

export function appendJobLog(id: string, line: string): void {
    if (!isValidJobId(id)) return;
    const logFile = safeJobPath(id, '.ndjson');
    if (!existsSync(logFile)) return;
    appendFileSync(logFile, `${line}\n`, 'utf8');
}

export function readJobMeta(id: string): Job | null {
    if (!isValidJobId(id)) return null;
    const metaFile = safeJobPath(id, '.meta.json');
    if (!existsSync(metaFile)) return null;
    try { return JSON.parse(readFileSync(metaFile, 'utf8')); } catch { return null; }
}

export function readJobLog(id: string): string[] {
    if (!isValidJobId(id)) return [];
    const logFile = safeJobPath(id, '.ndjson');
    if (!existsSync(logFile)) return [];
    return readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
}

export function listJobs(): Job[] {
    const dir = jobsDir();
    const files = readdirSync(dir).filter(f => f.endsWith('.meta.json'));
    const jobs: Job[] = [];
    for (const f of files) {
        try { jobs.push(JSON.parse(readFileSync(join(dir, f), 'utf8'))); } catch { /* skip corrupt */ }
    }
    return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function pruneJobs(): void {
    const jobs = listJobs();
    const prunable = jobs.filter(j => j.status !== 'running');
    if (prunable.length <= MAX_JOBS) return;
    const toRemove = prunable.slice(MAX_JOBS);
    for (const job of toRemove) {
        if (!isValidJobId(job.id)) continue;
        try { unlinkSync(safeJobPath(job.id, '.meta.json')); } catch { /* noop */ }
        try { unlinkSync(safeJobPath(job.id, '.ndjson')); } catch { /* noop */ }
    }
}

function writeJobMeta(id: string, job: Job): void {
    const target = safeJobPath(id, '.meta.json');
    const tmp = target + '.tmp';
    writeFileSync(tmp, JSON.stringify(job, null, 2) + '\n', 'utf8');
    renameSync(tmp, target);
}

export type { JobStatus };
```

---

## NEW: `src/spawn/process-kill.ts`

Cross-platform process tree termination. Reference: codex-plugin-cc `lib/process.mjs`.

```typescript
import { spawnSync } from 'node:child_process';

interface KillResult {
    attempted: boolean;
    delivered: boolean;
    method: string | null;
}

export function terminateProcessTree(pid: number | undefined | null): KillResult {
    if (!pid || !Number.isFinite(pid)) {
        return { attempted: false, delivered: false, method: null };
    }

    if (process.platform === 'win32') {
        const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
            encoding: 'utf8',
            timeout: 5000,
        });
        if (!result.error && result.status === 0) {
            return { attempted: true, delivered: true, method: 'taskkill' };
        }
        // Fallback: direct kill
        try {
            process.kill(pid, 'SIGTERM');
            return { attempted: true, delivered: true, method: 'kill' };
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
                return { attempted: true, delivered: false, method: 'kill' };
            }
            return { attempted: true, delivered: false, method: 'taskkill' };
        }
    }

    // Unix: try process group first, then single process
    try {
        process.kill(-pid, 'SIGTERM');
        return { attempted: true, delivered: true, method: 'process-group' };
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
            return { attempted: true, delivered: false, method: 'process-group' };
        }
        // EPERM on group kill — try single process
        try {
            process.kill(pid, 'SIGTERM');
            return { attempted: true, delivered: true, method: 'process' };
        } catch (innerErr: unknown) {
            if ((innerErr as NodeJS.ErrnoException).code === 'ESRCH') {
                return { attempted: true, delivered: false, method: 'process' };
            }
            return { attempted: true, delivered: false, method: 'process' };
        }
    }
}

export function scheduleForceKill(pid: number | undefined | null, delayMs = 2000): void {
    if (!pid) return;
    setTimeout(() => {
        try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
    }, delayMs).unref();
}
```

---

## MODIFY: `src/registry/types.ts`

### Append after DispatchOptions (existing line 42)
```typescript
// --- Job tracking types ---

export type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
    id: string;
    cli: string;
    prompt: string;
    model: string | null;
    status: JobStatus;
    phase: string;
    pid: number | null;
    sessionId: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}

export interface ProgressEvent {
    type: 'assistant' | 'tool_use' | 'tool_result' | 'thinking' | 'error' | 'system' | 'unknown';
    message: string;
    phase: string | null;
    toolName: string | null;
    raw: unknown;
    ts: string;
}
```

### SpawnResult change

#### Before
```typescript
export interface SpawnResult {
    text: string;
    code: number;
    sessionId?: string;
}
```

#### After
```typescript
export interface SpawnResult {
    text: string;
    code: number;
    jobId?: string;
    sessionId?: string;
}
```

---

## MODIFY: `src/spawn/index.ts`

### New imports (top of file, after existing imports)
```typescript
import { createJob, updateJob, completeJob, cancelJob, appendJobLog, readJobMeta } from './jobs.js';
import { terminateProcessTree, scheduleForceKill } from './process-kill.js';
```

### New state (REPLACE existing `isAgentBusy`/`getActiveProcess` functions, KEEP `let activeProcess` declaration)
```typescript
let activeProcess: ChildProcess | null = null;  // ← KEEP — still used by killAgent() and settle()

const activeJobs = new Map<string, ChildProcess>();
const lineBuffers = new Map<string, string>();
const cancelledJobs = new Set<string>();

export function isAgentBusy(): boolean {
    return activeJobs.size > 0;
}

export function getActiveJobs(): Map<string, ChildProcess> {
    return activeJobs;
}
```
> ⚠️ `isAgentBusy()` REPLACES the existing body (was `return activeProcess !== null`). `getActiveProcess()` is removed. `let activeProcess` declaration MUST remain — it is still set/read by `spawnAgent()`, `killAgent()`, and `settle()`.

### spawnAgent — Before (line 18-76)
(existing code, unchanged reference)

### spawnAgent — After
```typescript
export function spawnAgent(prompt: string, opts: SpawnOptions = {}): { jobId: string; result: Promise<SpawnResult> } {
    const cli = opts.cli ?? 'claude';
    const cliPath = resolveCliPath(cli);
    const args = buildArgs(cli, prompt, opts);
    const env = { ...process.env, ...opts.env };

    const job = createJob(cli, prompt, opts.model);
    lineBuffers.set(job.id, '');

    const result = new Promise<SpawnResult>((resolve, reject) => {
        try {
            const child = spawn(cliPath, args, {
                cwd: opts.cwd ?? process.cwd(),
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            activeProcess = child;
            activeJobs.set(job.id, child);
            updateJob(job.id, { pid: child.pid ?? null });
            bus.emit('agent_start', { cli, pid: child.pid, jobId: job.id });

            let stdout = '';
            let stderr = '';
            let settled = false;

            child.stdout?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                stdout += text;

                let buf = (lineBuffers.get(job.id) ?? '') + text;
                let nlIdx = buf.indexOf('\n');
                while (nlIdx !== -1) {
                    const line = buf.slice(0, nlIdx).trim();
                    buf = buf.slice(nlIdx + 1);
                    if (line) {
                        appendJobLog(job.id, line);
                        bus.emit('job_log', { jobId: job.id, line });
                    }
                    nlIdx = buf.indexOf('\n');
                }
                lineBuffers.set(job.id, buf);

                opts.onStdout?.(text);
            });

            child.stderr?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                stderr += text;
                opts.onStderr?.(text);
            });

            const timer = opts.timeout
                ? setTimeout(() => {
                    killJob(job.id, 'timeout');
                }, opts.timeout)
                : null;

            const settle = (code: number) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                const remaining = (lineBuffers.get(job.id) ?? '').trim();
                if (remaining) {
                    appendJobLog(job.id, remaining);
                    bus.emit('job_log', { jobId: job.id, line: remaining });
                }
                lineBuffers.delete(job.id);
                activeJobs.delete(job.id);
                if (activeProcess === child) activeProcess = null;
                if (cancelledJobs.has(job.id)) {
                    cancelledJobs.delete(job.id);
                } else {
                    completeJob(job.id, code);
                }
            };

            child.on('close', (code) => {
                settle(code ?? 1);
                bus.emit('agent_done', { cli, code, pid: child.pid, jobId: job.id });
                resolve({ text: stdout, code: code ?? 1, jobId: job.id });
            });

            child.on('error', (err) => {
                settle(1);
                bus.emit('agent_error', { cli, error: err.message, jobId: job.id });
                reject(err);
            });

            child.stdin?.write(prompt);
            child.stdin?.end();
        } catch (err) {
            lineBuffers.delete(job.id);
            completeJob(job.id, 1);
            reject(err);
        }
    });

    return { jobId: job.id, result };
}
```

### killAgent — unchanged signature (backward-compatible)
```typescript
export function killAgent(reason = 'user'): boolean {
    if (!activeProcess) return false;
    bus.emit('agent_kill', { reason, pid: activeProcess.pid });
    const pid = activeProcess.pid;
    terminateProcessTree(pid);
    scheduleForceKill(pid);
    activeProcess = null;
    return true;
}
```

### killJob — NEW function (in-process job-targeted kill)
```typescript
export function killJob(jobId: string, reason = 'user'): boolean {
    const proc = activeJobs.get(jobId);
    if (!proc) return false;
    bus.emit('agent_kill', { reason, pid: proc.pid, jobId });
    cancelledJobs.add(jobId);
    if (reason === 'user') {
        cancelJob(jobId);
    } else {
        completeJob(jobId, 1);
    }
    terminateProcessTree(proc.pid);
    scheduleForceKill(proc.pid);
    activeJobs.delete(jobId);
    lineBuffers.delete(jobId);
    return true;
}
```
> ⚠️ `cancelledJobs.add()` BEFORE `terminateProcessTree()` — prevents `settle()` from overwriting the terminal status set here.

### killJobByPid — NEW function (cross-process kill via meta.pid)
```typescript
export function killJobByPid(jobId: string, reason = 'user'): boolean {
    const meta = readJobMeta(jobId);
    if (!meta || !meta.pid) return false;
    if (meta.status !== 'running') return false;

    const kill = terminateProcessTree(meta.pid);
    if (!kill.delivered) {
        // Process may have already exited — re-read meta to check
        const fresh = readJobMeta(jobId);
        if (!fresh || fresh.status !== 'running') return false;
        // Still marked running but process gone — mark as failed (stale state)
        completeJob(jobId, 1);
        return true;
    }

    scheduleForceKill(meta.pid);
    if (reason === 'user') {
        cancelJob(jobId);
    } else {
        completeJob(jobId, 1);
    }
    return true;
}
```
> Used by `ome kill <job-id>` from a separate CLI process that doesn't share the in-memory `activeJobs` Map.
> Checks `terminateProcessTree()` delivery result to avoid marking already-exited jobs as cancelled.

---

## MODIFY: `src/dispatch/index.ts` — adapt to new spawnAgent return type

### Before
```typescript
export async function dispatch(
    employeeName: string,
    task: string,
    opts: DispatchOptions = {},
): Promise<SpawnResult> {
    const emp = findEmployee(employeeName);
    if (!emp) {
        throw new Error(`Employee "${employeeName}" not found. Use \`ome registry list\` to see available employees.`);
    }

    return spawnAgent(task, {
        cli: emp.cli,
        model: emp.model ?? undefined,
        cwd: opts.cwd,
        timeout: opts.timeout ?? 600_000,
        env: opts.env,
    });
}
```

### After
```typescript
export async function dispatch(
    employeeName: string,
    task: string,
    opts: DispatchOptions = {},
): Promise<SpawnResult> {
    const emp = findEmployee(employeeName);
    if (!emp) {
        throw new Error(`Employee "${employeeName}" not found. Use \`ome registry list\` to see available employees.`);
    }

    const { jobId, result } = spawnAgent(task, {
        cli: emp.cli,
        model: emp.model ?? undefined,
        cwd: opts.cwd,
        timeout: opts.timeout ?? 600_000,
        env: opts.env,
    });

    const sr = await result;
    return { ...sr, jobId };
}
```

---

## MODIFY: `src/index.ts` — re-export jobs

### Append
```typescript
export { createJob, readJobMeta, readJobLog, listJobs, isValidJobId } from './spawn/jobs.js';
export { killJob, killJobByPid } from './spawn/index.js';
export type { Job, ProgressEvent, JobStatus } from './registry/types.js';
```
