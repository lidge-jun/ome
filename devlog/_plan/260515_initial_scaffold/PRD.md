# OME — Orchestrated Multi-agent Engine: Implementation PRD

> **Version**: 1.0 — Post-Audit Final  
> **Date**: 2026-05-15  
> **Status**: Implementation-ready (6 audit rounds passed, all FAIL/WARN resolved)  
> **Baseline**: P1 scaffold complete. P2–P7 pending.

---

## 1. Executive Summary

OME is a standalone CLI + library that spawns and orchestrates AI agent CLIs (Claude Code, Codex, Gemini CLI, etc.) as "employees." It supports both direct invocation (`ome spawn --cli claude --model opus "prompt"`) and registered employee dispatch (`ome dispatch --agent "Frontend" --task "..."`) through a unified process lifecycle.

This PRD consolidates 7 phase-level plan documents — hardened through 6 rounds of adversarial audit (R1–R6, 29 FAIL / 20 WARN found and resolved) — into a single implementation-ready specification with exact file paths, complete TypeScript diffs, and verified contract chains.

### What's Already Built (P1)

| Module | Files | Purpose |
|--------|-------|---------|
| `spawn/` | `index.ts`, `args.ts` | Basic `spawnAgent()`, `killAgent()`, `waitForProcessEnd()` |
| `registry/` | `db.ts`, `index.ts`, `types.ts` | SQLite-backed employee CRUD |
| `queue/` | `index.ts` | In-memory message queue with hold/release |
| `dispatch/` | `index.ts` | `dispatch(name, task)` → finds employee → calls `spawnAgent()` |
| `cli/` | `index.ts` | `ome spawn`, `ome dispatch`, `ome registry`, `ome status` |

### What This PRD Covers (P2–P7)

| Phase | Scope | New Files | Modified Files |
|-------|-------|-----------|----------------|
| P2 | Job tracking + cross-platform kill | 2 | 4 |
| P3 | NDJSON observe (watch/inspect) | 3 | 0 |
| P4 | Web dashboard + quota | 3 | 2 |
| P5 | Default employee seeding | 1 | 1 |
| P6 | CLI subcommand expansion | 0 | 1 |
| P7 | Tests + package.json fixes | 7 | 1 |

**Total**: 16 new files, 9 modified files, ~2,340 lines of diff-level specification.

---

## 2. Architecture

```
ome/
├── src/
│   ├── spawn/
│   │   ├── index.ts          # spawnAgent, killAgent, killJob, killJobByPid
│   │   ├── args.ts           # CLI-specific argument builders (P1)
│   │   ├── jobs.ts           # Job persistence: meta.json + ndjson log  ← P2
│   │   └── process-kill.ts   # Cross-platform process tree termination  ← P2
│   ├── registry/
│   │   ├── db.ts             # SQLite schema + employee + quota CRUD
│   │   ├── index.ts          # Re-exports
│   │   └── types.ts          # All shared types (Employee, Job, Event, Quota)
│   ├── queue/
│   │   └── index.ts          # enqueue, dequeue, hold/release (P1)
│   ├── dispatch/
│   │   └── index.ts          # dispatch(name, task) → SpawnResult
│   ├── observe/              ← P3
│   │   ├── index.ts          # watch(jobId), inspect(jobId)
│   │   ├── parser.ts         # NDJSON line parser (claude/codex/gemini/generic)
│   │   └── types.ts          # LiveRunState, ParsedToolCall
│   ├── web/                  ← P4
│   │   ├── index.ts          # createServer(port, host)
│   │   ├── routes.ts         # REST API handlers
│   │   └── dashboard.ts      # Inline HTML/JS dashboard (XSS-safe)
│   ├── seed/                 ← P5
│   │   └── index.ts          # seedDefaults() — claude/codex/gemini presets
│   ├── cli/
│   │   └── index.ts          # All subcommands (spawn/dispatch/registry/queue/
│   │                         #   jobs/kill/result/watch/inspect/web/init/status)
│   └── index.ts              # Public library re-exports
├── tests/                    ← P7
│   ├── spawn/jobs.test.ts
│   ├── observe/parser.test.ts
│   ├── observe/inspect.test.ts
│   ├── seed/seed.test.ts
│   ├── web/routes.test.ts
│   ├── dispatch/dispatch.test.ts
│   └── cli/smoke.test.ts
├── _reference/               # Read-only reference code (gitignored from npm)
│   ├── codex-plugin-cc/
│   └── ANALYSIS.md
├── devlog/
├── package.json
└── tsconfig.json
```

### Dependency Graph (no cycles)

```
cli/index.ts
  ├── spawn/index.ts → spawn/jobs.ts, spawn/process-kill.ts, spawn/args.ts
  ├── dispatch/index.ts → registry/db.ts, spawn/index.ts
  ├── observe/index.ts → spawn/jobs.ts, observe/parser.ts, observe/types.ts
  ├── web/index.ts → web/routes.ts, web/dashboard.ts
  ├── seed/index.ts → registry/db.ts
  ├── queue/index.ts → registry/db.ts, spawn/index.ts (bus)
  └── registry/ → types.ts, db.ts
```

### Data Storage

```
~/.ome/                                # OME_HOME (override via env)
├── ome.db                             # SQLite: employees, queued_messages,
│                                      #   employee_sessions, quota_config
└── jobs/                              # File-based job tracking
    ├── job-m1abc-x9f3.meta.json       # Job metadata (atomic write via rename)
    ├── job-m1abc-x9f3.ndjson          # Streaming NDJSON event log
    └── ...                            # Max 50 non-running jobs (LRU prune)
```

---

## 3. Reference: codex-plugin-cc

Source: `_reference/codex-plugin-cc/` (cloned from `openai/codex-plugin-cc`, `.git` removed)

### Patterns Adopted

| Pattern | cc-plugin Source | OME Module |
|---------|-----------------|------------|
| Job persistence (meta + ndjson) | `lib/state.mjs`, `lib/tracked-jobs.mjs` | `spawn/jobs.ts` |
| Progress event normalization | `lib/tracked-jobs.mjs:normalizeProgressEvent` | `observe/parser.ts` |
| Cross-platform process tree kill | `lib/process.mjs:terminateProcessTree` | `spawn/process-kill.ts` |
| Max 50 job pruning | `lib/state.mjs` | `spawn/jobs.ts:pruneJobs` |

### Patterns NOT Adopted

| Pattern | Reason |
|---------|--------|
| Broker process (Unix socket) | OME uses direct spawn — simpler architecture |
| JSON-RPC 2.0 protocol | NDJSON + exit code is sufficient |
| Plugin manifest (`plugin.json`) | OME is standalone, not a plugin |

---

## 4. CLI Interface (Complete)

```bash
# ── Direct spawn (no employee registration needed) ──
ome spawn --cli claude --model opus "Fix the login bug"
ome spawn --cli codex --model o3-pro "Refactor auth module"
ome spawn --cli gemini "Analyze this data"

# ── Employee management ──
ome registry add --name "Frontend" --cli claude --model sonnet --role "UI/UX"
ome registry list
ome registry remove "Frontend"

# ── Employee dispatch (uses registered employee's CLI/model) ──
ome dispatch --agent "Frontend" --task "Fix the CSS grid layout"

# ── Queue management ──
ome queue list
ome queue hold <id>
ome queue release <id>
ome queue clear

# ── Job management ──
ome jobs                        # List tracked jobs (max 30)
ome kill <job-id>               # Kill running job by stored PID
ome result <job-id>             # Full output of completed job

# ── Process observation ──
ome watch <job-id>              # Live NDJSON event stream (file-tailing)
ome inspect <job-id>            # Current state snapshot

# ── Web dashboard ──
ome web                         # http://127.0.0.1:7700
ome web --port 3500 --host 0.0.0.0

# ── Initialization ──
ome init                        # Seed default employees (Claude/Codex/Gemini)

# ── Status ──
ome status                      # Active jobs, queue depth, employees
```

---

## 5. Library Interface

```typescript
import { spawnAgent, dispatch, initDb } from 'ome';
import { inspect, watch } from 'ome/observe';

initDb('~/.ome/ome.db');

// Direct spawn — returns {jobId, result: Promise<SpawnResult>}
const { jobId, result } = spawnAgent('Fix the bug', {
    cli: 'claude', model: 'sonnet', cwd: '/path/to/project',
});
console.log(jobId);          // job-abc123 (available immediately)
const sr = await result;     // wait for completion

// Employee dispatch — returns Promise<SpawnResult> with jobId
const output = await dispatch('Frontend', 'Fix CSS grid', {
    cwd: '/path/to/project',
});
console.log(output.jobId);   // also available on SpawnResult

// Observe running job
const state = inspect(jobId);
for await (const ev of watch(jobId)) { console.log(ev); }
```

### Package Exports

```json
{
    "main": "dist/src/index.js",
    "types": "dist/src/index.d.ts",
    "bin": { "ome": "dist/src/cli/index.js" },
    "exports": {
        ".": { "import": "./dist/src/index.js", "types": "./dist/src/index.d.ts" },
        "./observe": { "import": "./dist/src/observe/index.js", "types": "./dist/src/observe/index.d.ts" }
    }
}
```

> **Build note**: tsconfig uses `rootDir: "."` / `outDir: "dist"`, so `src/` compiles to `dist/src/` and `tests/` to `dist/tests/`. All package entry points use the `dist/src/` prefix.

---

## 6. Type System

### Core Types (in `src/registry/types.ts`)

```typescript
export type AgentCli = 'claude' | 'codex' | 'gemini' | 'copilot' | 'opencode' | string;

export interface Employee {
    id: string;
    name: string;
    cli: AgentCli;
    model: string | null;
    role: string | null;
    createdAt: string;
}

export interface EmployeeInput {
    name: string;
    cli: AgentCli;
    model?: string | null;
    role?: string | null;
}

export interface SpawnOptions {
    cli?: AgentCli;
    model?: string;
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
}

export interface SpawnResult {
    text: string;
    code: number;
    jobId?: string;       // ← P2: added
    sessionId?: string;
}

export interface DispatchOptions {
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
}
```

### Job Types (appended to `src/registry/types.ts` in P2)

```typescript
export type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
    id: string;
    cli: string;
    prompt: string;
    model: string | null;
    status: JobStatus;
    phase: string;
    pid: number | null;
    sessionId: string | null;   // placeholder — CLI session marker spec TBD
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

export interface QuotaConfig {
    dailyLimit: number;
    hourlyLimit: number;
    updatedAt: string;
}
```

### Observe Types (in `src/observe/types.ts`)

```typescript
export interface ParsedToolCall {
    name: string;
    input: string;
    output: string | null;
    status: 'running' | 'done' | 'error';
    startedAt: string;
    completedAt: string | null;
}

export interface LiveRunState {
    jobId: string;
    cli: string;
    status: JobStatus;
    currentPhase: string;
    toolCalls: ParsedToolCall[];
    thinkingText: string;
    outputText: string;
    eventCount: number;
    lastEvent: ProgressEvent | null;
    startedAt: string;
    updatedAt: string;
}
```

---

## 7. Phase 2: Enhanced Spawn + Job Tracking

### 7.1 Purpose

Every `spawnAgent()` call creates a persistent job with a unique ID. The caller receives `{ jobId, result: Promise<SpawnResult> }` — `jobId` is available immediately (before the process finishes) for observation, while `result` is awaited for the final output. Cross-platform process tree termination replaces the naive `child.kill()`.

### 7.2 File Map

| Action | Path | Description |
|--------|------|-------------|
| **NEW** | `src/spawn/jobs.ts` | Job CRUD — create, read, update, complete, cancel, list, prune |
| **NEW** | `src/spawn/process-kill.ts` | Cross-platform process tree kill (Unix group + Windows taskkill) |
| **MODIFY** | `src/spawn/index.ts` | Integrate job lifecycle, line buffer, settled guard, kill variants |
| **MODIFY** | `src/registry/types.ts` | Add `Job`, `ProgressEvent`, `JobStatus`, update `SpawnResult` |
| **MODIFY** | `src/dispatch/index.ts` | Adapt to new `spawnAgent()` return type |
| **MODIFY** | `src/index.ts` | Re-export job-related symbols |

### 7.3 `src/spawn/jobs.ts` (NEW — ~120 lines)

File-based job persistence. Each job gets a `{id}.meta.json` (atomic write via tmp+rename) and a `{id}.ndjson` log file under `$OME_HOME/jobs/`.

**Key behaviors:**
- `createJob(cli, prompt, model?)` → generates `job-{base36timestamp}-{uuid6}` ID
- `writeJobMeta()` uses atomic rename (`writeFileSync` to `.tmp`, `renameSync` to target)
- `pruneJobs()` removes oldest non-running jobs when count exceeds 50
- `isValidJobId()` regex guard (`/^job-[a-z0-9]+-[a-z0-9]+$/`) prevents path traversal
- `safeJobPath()` uses `basename()` + validation before constructing file paths

**Exports:** `createJob`, `updateJob`, `completeJob`, `cancelJob`, `appendJobLog`, `readJobMeta`, `readJobLog`, `listJobs`, `isValidJobId`

### 7.4 `src/spawn/process-kill.ts` (NEW — ~50 lines)

Cross-platform process tree termination, adapted from codex-plugin-cc `lib/process.mjs`.

```
terminateProcessTree(pid)
├── Windows: taskkill /PID /T /F → fallback: process.kill(pid, SIGTERM)
└── Unix: process.kill(-pid, SIGTERM) (group) → fallback: process.kill(pid, SIGTERM)

Returns: { attempted: boolean; delivered: boolean; method: string | null }
```

- ESRCH errors return `{ delivered: false }` instead of throwing
- `scheduleForceKill(pid, 2000)` sends SIGKILL after delay (`.unref()` to not block exit)

### 7.5 `src/spawn/index.ts` (MODIFY)

**Critical API change:**
```typescript
// BEFORE (P1)
spawnAgent(prompt, opts): Promise<SpawnResult>

// AFTER (P2)
spawnAgent(prompt, opts): { jobId: string; result: Promise<SpawnResult> }
```

**State management change:**
```typescript
// KEEP existing
let activeProcess: ChildProcess | null = null;

// ADD new
const activeJobs = new Map<string, ChildProcess>();
const lineBuffers = new Map<string, string>();
const cancelledJobs = new Set<string>();

// REPLACE body
isAgentBusy(): boolean → return activeJobs.size > 0;

// REMOVE
getActiveProcess() — replaced by getActiveJobs()
```

**New functions:**
- `killJob(jobId, reason)` — in-process kill (uses `activeJobs` Map)
- `killJobByPid(jobId, reason)` — cross-process kill (reads `meta.json` for PID)
  - Checks `terminateProcessTree()` delivery result
  - If `delivered === false`: re-reads meta; if still running, marks as failed (stale state)

**Concurrency safeguards:**
- `let settled = false` guard prevents close/error double-fire
- `cancelledJobs.add(jobId)` BEFORE `terminateProcessTree()` prevents `settle()` from overwriting terminal status
- Line buffer per job for stdout chunk boundary handling

### 7.6 `src/dispatch/index.ts` (MODIFY)

Adapts to the new `spawnAgent()` return type:

```typescript
// BEFORE
return spawnAgent(task, { ... });

// AFTER
const { jobId, result } = spawnAgent(task, { ... });
const sr = await result;
return { ...sr, jobId };
```

The `dispatch()` function signature remains `Promise<SpawnResult>` — it internally destructures the new return and re-attaches `jobId` to the resolved `SpawnResult`.

### 7.7 `src/index.ts` (MODIFY)

Appends re-exports:
```typescript
export { createJob, readJobMeta, readJobLog, listJobs, isValidJobId } from './spawn/jobs.js';
export { killJob, killJobByPid } from './spawn/index.js';
export type { Job, ProgressEvent, JobStatus } from './registry/types.js';
```

---

## 8. Phase 3: Observe — NDJSON Parser + watch/inspect

### 8.1 Purpose

Provides real-time and snapshot observation of running jobs. The observe module is **cross-process safe** — it reads only from job files (`meta.json` + `.ndjson`), with no dependency on the `bus` EventEmitter. This means `ome watch <job-id>` works from a separate terminal process.

### 8.2 File Map

| Action | Path | Description |
|--------|------|-------------|
| **NEW** | `src/observe/types.ts` | `LiveRunState`, `ParsedToolCall` types |
| **NEW** | `src/observe/parser.ts` | Per-CLI NDJSON → `ProgressEvent` parser |
| **NEW** | `src/observe/index.ts` | `watch()`, `inspect()`, `extractToolCalls()` |

### 8.3 Parser (`src/observe/parser.ts`)

`parseLine(cli, rawLine)` dispatches to CLI-specific parsers:

| CLI | Event Source | Tool Detection |
|-----|-------------|----------------|
| **claude** | `type` field → `assistant`, `tool_use`, `tool_result`, `result` | `obj.tool.name` or `obj.name` |
| **codex** | `type` field → `message`, `tool`, etc. | `obj.tool` string |
| **gemini** | `type` or `event` field | `obj.functionCall.name` |
| **generic** | Fallback for unknown CLIs | None |

All events normalized to the `ProgressEvent` interface with `mapEventType()` mapping (e.g., `message` → `assistant`, `function_call` → `tool_use`).

### 8.4 `inspect(jobId)` — Snapshot

Reads `meta.json` + all `.ndjson` lines → parses → builds `LiveRunState` with:
- Current status, phase, event count
- Accumulated `thinkingText` and `outputText`
- Tool call tracking via `extractToolCalls()` (FIFO per-tool-name matching)

### 8.5 `watch(jobId)` — Live Stream

File-tailing async generator (polling-based, not bus-based):

```
watch(jobId, pollMs=500)
  1. Read initial meta for CLI type
  2. Loop:
     a. Read ndjson lines from offset
     b. Parse and yield new events
     c. Check meta.status — break if not 'running'
     d. Sleep pollMs
  3. Final drain: re-read ndjson to catch lines between last poll and status change
```

### 8.6 `extractToolCalls(events)` — Tool Tracking

Maintains a per-tool-name FIFO stack to match `tool_use` → `tool_result` pairs, supporting parallel calls of the same tool.

---

## 9. Phase 4: Web Dashboard + Quota

### 9.1 Purpose

`ome web` serves a single-page management dashboard over Node's built-in `http` module — zero external frontend dependencies. Dashboard includes employee CRUD, quota configuration, and job monitoring.

### 9.2 File Map

| Action | Path | Description |
|--------|------|-------------|
| **NEW** | `src/web/index.ts` | `createServer(port, host)` — HTTP server factory |
| **NEW** | `src/web/routes.ts` | REST API route handlers |
| **NEW** | `src/web/dashboard.ts` | Inline HTML/CSS/JS (dark theme, XSS-safe) |
| **MODIFY** | `src/registry/types.ts` | Add `QuotaConfig` interface |
| **MODIFY** | `src/registry/db.ts` | Add `quota_config` table + `getQuota()`/`setQuota()` |

### 9.3 REST API

| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/employees` | List all employees |
| POST | `/api/employees` | Add employee (JSON body) |
| DELETE | `/api/employees/:name` | Remove employee |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/:id` | Inspect job (via observe module) |
| GET | `/api/quota` | Get quota config |
| PUT | `/api/quota` | Update quota config |
| GET | `/api/status` | System status (busy, active jobs, queue, employees) |

### 9.4 Security Hardening

| Threat | Mitigation |
|--------|-----------|
| XSS | All dynamic values via `textContent`, never `innerHTML`. `esc()` helper for stat badges. |
| Path traversal | `isValidJobId()` guard on job endpoints |
| Request smuggling | `Content-Type: application/json` required for POST/PUT (415 otherwise) |
| Body bombs | 1MB `MAX_BODY` cap with `req.destroy()` on exceed |
| Slow-loris | `server.requestTimeout = 30_000`, `server.headersTimeout = 10_000` |
| Default bind | `127.0.0.1` (localhost only). `--host 0.0.0.0` is opt-in via CLI. |
| EADDRINUSE | Server error handler in CLI layer (P6), not library. Library never calls `process.exit()`. |

### 9.5 Dashboard UI

Dark-themed single-page app with:
- **Stats bar**: employee count, active jobs, queue depth
- **Employees table**: name, CLI, model, role + add form + delete button
- **Quota form**: daily/hourly limit inputs
- **Jobs table**: ID (truncated), CLI, status badge (color-coded), phase, created time, inspect button
- **Job detail panel**: JSON state dump on inspect
- **Auto-refresh**: `setInterval(loadAll, 5000)`

---

## 10. Phase 5: Seed — Default Employee Presets

### 10.1 Purpose

`ome init` registers default employees if they don't already exist. Idempotent — safe to run multiple times.

### 10.2 File Map

| Action | Path | Description |
|--------|------|-------------|
| **NEW** | `src/seed/index.ts` | `seedDefaults()` + `defaultEmployees` export |
| **MODIFY** | `src/registry/db.ts` | `addEmployeeIfNotExists()` — idempotent insert |

### 10.3 Default Employees

| Name | CLI | Model | Role |
|------|-----|-------|------|
| Claude | claude | sonnet | General-purpose assistant |
| Codex | codex | o3-pro | Code generation and review |
| Gemini | gemini | *(null — use default)* | Research and analysis |

### 10.4 Idempotent Insert

`addEmployeeIfNotExists()` uses `INSERT OR IGNORE` for race safety:
1. Check `findEmployee(name)` first (fast path)
2. If not found, `INSERT OR IGNORE` with new UUID
3. If `result.changes === 0`, concurrent insert won — re-find and return
4. Only unique constraint errors are absorbed; other DB errors rethrow

**Future**: `OME_DEFAULT_MODEL_*` env or config file override for default model names.

---

## 11. Phase 6: CLI Subcommand Expansion

### 11.1 Purpose

Extends the CLI from 4 commands (spawn, dispatch, registry, status) to 12 commands covering the full feature surface.

### 11.2 File Map

| Action | Path | Description |
|--------|------|-------------|
| **MODIFY** | `src/cli/index.ts` | Add 8 new handlers + update existing 2 |

### 11.3 New Subcommands

| Command | Handler | Key Behavior |
|---------|---------|-------------|
| `queue` | `handleQueue(args)` | Sub-dispatch: list, hold, release, clear |
| `jobs` | `handleJobs()` | List up to 30 recent jobs |
| `kill` | `handleKill(args)` | Uses `killJobByPid()` (cross-process kill via meta.pid) |
| `result` | `handleResult(args)` | Display job metadata + full NDJSON output |
| `watch` | `handleWatch(args)` | Verify job exists → enter `watchJob()` async generator loop |
| `inspect` | `handleInspect(args)` | Display `LiveRunState` summary + tool calls |
| `web` | `handleWeb(args)` | Create server + attach EADDRINUSE handler + SIGINT/SIGTERM shutdown |
| `init` | `handleInit()` | Run `seedDefaults()` and report added/skipped |

### 11.4 Modified Handlers

**`handleSpawn`**: Destructures new `{ jobId, result }` return. Outputs `[ome] jobId=...` to stderr immediately.

**`handleDispatch`**: Outputs `result.jobId` to stderr (dispatch already returns `Promise<SpawnResult>` with jobId).

**`handleStatus`**: Now includes active jobs count, total jobs count, and per-employee listing.

### 11.5 DB Cleanup Strategy

```typescript
// In main() finally block:
if (command !== 'web') closeDb();
// 'web' command: closeDb() handled in shutdown handler
```

---

## 12. Phase 7: Tests

### 12.1 Purpose

Unit tests, integration tests, and CLI smoke tests using Node.js built-in `node:test` + `node:assert/strict`. No external test framework.

### 12.2 File Map

| Test File | Target | Tests |
|-----------|--------|-------|
| `tests/spawn/jobs.test.ts` | `spawn/jobs.ts` | Job CRUD, status transitions, path traversal rejection, sort order |
| `tests/observe/parser.test.ts` | `observe/parser.ts` | Claude/Codex/Gemini/generic event parsing, null cases |
| `tests/observe/inspect.test.ts` | `observe/index.ts` | Inspect existing/non-existent jobs, event count, tool extraction |
| `tests/seed/seed.test.ts` | `seed/index.ts` | 3 defaults seeded, idempotent on second call |
| `tests/web/routes.test.ts` | `web/routes.ts` | GET status/employees, POST employee (valid + invalid JSON + missing content-type + oversized body), path traversal |
| `tests/dispatch/dispatch.test.ts` | `dispatch/index.ts` | Unknown employee rejection, SpawnResult includes jobId |
| `tests/cli/smoke.test.ts` | `cli/index.ts` | --help, status, registry list, init idempotent, unknown command exit 1 |

### 12.3 Test Isolation

All tests that touch the filesystem use:
```typescript
beforeEach(() => { tmpHome = mkdtempSync(...); process.env['OME_HOME'] = tmpHome; });
afterEach(() => { delete process.env['OME_HOME']; rmSync(tmpHome, ...); });
```

DB-dependent tests additionally call `initDb(join(tmpDir, 'test.db'))` and `closeDb()` in lifecycle hooks.

### 12.4 Platform Considerations

- **dispatch.test**: Uses `echo` as CLI fixture. Skipped on Windows (`echo` is a `cmd` builtin, not a standalone executable)
- **smoke.test**: CLI path is `../../src/cli/index.js` relative to compiled test location (`dist/tests/cli/`)
- **Node compat**: Uses `fileURLToPath(import.meta.url)` + `dirname()` instead of `import.meta.dirname` (Node 20.0 compat)

### 12.5 `package.json` Changes

```json
{
    "main": "dist/src/index.js",
    "types": "dist/src/index.d.ts",
    "bin": { "ome": "dist/src/cli/index.js" },
    "scripts": {
        "pretest": "npm run build",
        "build": "tsc",
        "test": "node --test dist/tests/**/*.test.js"
    },
    "exports": {
        ".": { "import": "./dist/src/index.js", "types": "./dist/src/index.d.ts" },
        "./observe": { "import": "./dist/src/observe/index.js", "types": "./dist/src/observe/index.d.ts" }
    }
}
```

---

## 13. Contract Chain Verification

The full API contract chain was verified across 6 audit rounds:

```
spawnAgent(prompt, opts)
  └── returns { jobId: string; result: Promise<SpawnResult> }
        │
        ├── dispatch/index.ts
        │     const { jobId, result } = spawnAgent(...)
        │     const sr = await result
        │     return { ...sr, jobId }    ← Promise<SpawnResult>
        │
        ├── cli/handleSpawn
        │     const { jobId, result } = spawnAgent(...)
        │     stderr: [ome] jobId=...
        │     const sr = await result
        │
        └── cli/handleDispatch
              const result = await dispatch(...)   ← gets SpawnResult with jobId
              stderr: [ome] jobId=result.jobId

killJobByPid(jobId, reason)
  └── cli/handleKill → calls killJobByPid (cross-process, reads meta.pid)
        NOT killJob (in-process only, requires activeJobs Map)

killJob(jobId, reason)
  └── spawn/index.ts internal timeout handler only
```

---

## 14. Audit History

| Round | FAIL | WARN | Key Findings |
|-------|------|------|-------------|
| R1 | 5 | 2 | killAgent API split, stdout line buffer, process-tree kill, path traversal, XSS |
| R2 | 11 | 9 | settled guard, cancelledJobs set, observe dedupe, EADDRINUSE, Content-Type validation, localhost bind |
| R3 | 5 | 1 | watch→file-tailing, bus import removal from observe, process.exit removal from library |
| R4 | 7 | 5 | **dispatch contract break** (spawnAgent return type), activeProcess declaration missing, handleKill function mismatch, CLI path error |
| R5 | 1 | 3 | **package.json entrypoint mismatch** (dist/src/), killJobByPid stale PID race, echo Windows compat |
| R6 | 0 | 0 | Markdown fence cleanup (cosmetic) |
| **Total** | **29** | **20** | All resolved |

---

## 15. Implementation Order

```
P2 (spawn/jobs + process-kill + spawn/index modify + dispatch modify + types)
 ↓
P3 (observe — depends on P2 job files)
 ↓
P4 (web — depends on P3 inspect + P2 jobs)
 ↓
P5 (seed — depends on P1 registry only, parallel-safe with P3/P4)
 ↓
P6 (CLI — depends on P2-P5 all)
 ↓
P7 (tests + package.json — depends on all)
```

**Parallel opportunity**: P5 (seed) can be implemented alongside P3 or P4 since it only depends on P1 registry.

### Verification Gates

After each phase, run:
```bash
npx tsc --noEmit          # Type check
npm test                  # After P7 is in place
```

---

## 16. Future Work (Out of Scope)

| Feature | Notes |
|---------|-------|
| `sessionId` capture | Job type has the field; actual CLI session marker spec is TBD |
| Configurable seed models | `OME_DEFAULT_MODEL_*` env or config file |
| Quota enforcement | `quota_config` table exists; enforcement logic not yet wired |
| WebSocket live streaming | Current `watch` uses file-tailing; WS would enable dashboard live view |
| `ome resume <job-id>` | Session resume via `employee_sessions` table |

---

## Appendix A: Diff-Level Specifications

The complete diff-level code for each phase is maintained in the phase-specific plan files:

| Phase | File | Lines |
|-------|------|-------|
| P2 | `02_phase2_spawn_jobs.md` | 563 |
| P3 | `03_phase3_observe.md` | 276 |
| P4 | `04_phase4_web.md` | 377 |
| P5 | `05_phase5_seed.md` | 88 |
| P6 | `06_phase6_cli.md` | 346 |
| P7 | `07_phase7_tests.md` | 533 |

Each file contains:
- Audit fix history (all rounds)
- File action table (NEW/MODIFY)
- Complete TypeScript code blocks with before/after diffs for MODIFY actions
- Inline warnings (⚠️) for critical implementation notes
