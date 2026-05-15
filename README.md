# OME — Orchestrated Multi-agent Engine

> Spawn and orchestrate AI agent CLIs (Claude Code, Codex, Gemini CLI, etc.) as "employees" from a single unified interface.

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue)](tsconfig.json)

---

## What is OME?

OME is a standalone CLI + library that treats AI coding agents as **employees** you can hire, fire, and orchestrate. Instead of manually switching between Claude Code, Codex, and Gemini CLI terminals, OME provides:

- **Direct spawn** — run any AI CLI with a single command
- **Employee registry** — register named employees with preset CLI/model configs
- **Job tracking** — every spawn creates a persistent job with ID, metadata, and NDJSON log
- **Live observation** — watch running jobs in real-time or inspect snapshots
- **Web dashboard** — dark-themed management UI for employees, jobs, and quota
- **Cross-platform kill** — process tree termination (Unix group signals + Windows taskkill)

### Architecture

```
ome spawn / ome dispatch
  │
  ├── spawn/index.ts ──→ spawn CLI process
  │     ├── jobs.ts ──→ ~/.ome/jobs/{id}.meta.json + .ndjson
  │     └── process-kill.ts ──→ cross-platform SIGTERM/SIGKILL
  │
  ├── registry/db.ts ──→ SQLite (employees, sessions, quota)
  │
  ├── observe/
  │     ├── parser.ts ──→ NDJSON → ProgressEvent (claude/codex/gemini)
  │     └── index.ts ──→ watch() polling + inspect() snapshot
  │
  └── web/
        ├── routes.ts ──→ REST API
        └── dashboard.ts ──→ inline HTML/JS (XSS-safe)
```

---

## Installation

```bash
# Clone and install
git clone https://github.com/lidge-jun/ome.git
cd ome
npm install
npm run build

# Link globally (optional)
npm link

# Seed default employees
ome init
```

### Requirements

- **Node.js ≥ 20**
- At least one AI CLI installed: `claude`, `codex`, or `gemini`
- SQLite support via `better-sqlite3` (auto-compiled on install)

---

## Quick Start

```bash
# 1. Initialize — registers Claude, Codex, Gemini as default employees
ome init

# 2. Spawn a one-off agent
ome spawn --cli claude --model opus "Fix the login bug in auth.ts"

# 3. Dispatch to a registered employee
ome dispatch --agent "Claude" --task "Review the PR and suggest improvements"

# 4. Check status
ome status

# 5. List recent jobs
ome jobs

# 6. Watch a running job live
ome watch job-m1abc-x9f3

# 7. Start the web dashboard
ome web
```

---

## CLI Reference

### Spawn — Direct Agent Invocation

```bash
ome spawn --cli <cli-name> [--model <model>] "<prompt>"
```

Spawns a CLI process directly. No employee registration needed.

| Flag | Default | Description |
|------|---------|-------------|
| `--cli` | `claude` | CLI binary name (`claude`, `codex`, `gemini`, `copilot`, or any executable) |
| `--model` | *(CLI default)* | Model override passed to the CLI |

**Output**: stdout from the spawned CLI. Job ID printed to stderr as `[ome] jobId=...`.

```bash
# Examples
ome spawn --cli claude --model opus "Refactor the database module"
ome spawn --cli codex --model o3-pro "Add unit tests for auth"
ome spawn --cli gemini "Analyze quarterly sales data"
ome spawn --cli python3 "print('hello')"  # any CLI works
```

### Dispatch — Employee-Based Invocation

```bash
ome dispatch --agent "<name>" --task "<task description>"
```

Finds the named employee in the registry, uses their configured CLI and model, and spawns the task.

```bash
ome dispatch --agent "Frontend" --task "Fix the CSS grid layout on mobile"
ome dispatch --agent "Codex" --task "Generate OpenAPI spec from routes.ts"
```

### Registry — Employee Management

```bash
ome registry add --name "<name>" --cli <cli> [--model <model>] [--role "<role>"]
ome registry remove "<name>"
ome registry list
```

```bash
# Add a custom employee
ome registry add --name "Backend" --cli codex --model o3-pro --role "API and database"
ome registry add --name "Researcher" --cli gemini --role "Deep research and analysis"

# List all employees
ome registry list

# Remove an employee
ome registry remove "Backend"
```

### Jobs — Job Tracking

```bash
ome jobs                # List recent jobs (max 30)
ome result <job-id>     # Full output of a completed job
ome kill <job-id>       # Kill a running job (cross-process, via PID)
```

Jobs are persisted as files under `~/.ome/jobs/`:
- `{id}.meta.json` — status, CLI, prompt, PID, timestamps
- `{id}.ndjson` — streaming event log

Old jobs are automatically pruned (max 50 non-running jobs, LRU).

```bash
# View job details
ome result job-m1abc-x9f3

# Kill a stuck job from another terminal
ome kill job-m1abc-x9f3
```

### Observe — Live Monitoring

```bash
ome watch <job-id>      # Live event stream (file-tailing, polling)
ome inspect <job-id>    # Current state snapshot
```

The observe module is **cross-process safe** — it reads job files, not in-memory state. You can `ome watch` from a completely separate terminal.

```bash
# Watch a job's progress in real-time
ome watch job-m1abc-x9f3
# Output:
# 10:23:45 [assistant] Analyzing the codebase...
# 10:23:47 [tool_use:Read] Reading src/auth.ts
# 10:23:48 [tool_result:Read] File content received
# 10:23:50 [assistant] Found the issue in line 42...

# Inspect a job snapshot
ome inspect job-m1abc-x9f3
# Output:
# Job: job-m1abc-x9f3
# CLI: claude  Status: running  Phase: starting
# Events: 12  Tools: 3
#
# Tool calls:
#   ok Read (done)
#   ok Edit (done)
#   ... Bash (running)
```

### Queue — Message Queue Management

```bash
ome queue list           # Show queued messages
ome queue hold <id>      # Hold a queue item
ome queue release <id>   # Release a held item
ome queue clear          # Clear all queued messages
```

### Web Dashboard

```bash
ome web                          # http://127.0.0.1:7700
ome web --port 3500              # Custom port
ome web --host 0.0.0.0           # Bind to all interfaces (careful!)
```

Dark-themed single-page dashboard with:
- **Stats bar** — employee count, active jobs, queue depth
- **Employees table** — CRUD with add form and delete buttons
- **Quota configuration** — daily and hourly limits
- **Jobs table** — status badges (color-coded), inspect button
- **Auto-refresh** — polls every 5 seconds

#### Security

| Threat | Mitigation |
|--------|-----------|
| XSS | `textContent` only, never `innerHTML` for dynamic values |
| Path traversal | `isValidJobId()` regex guard on all job endpoints |
| Request smuggling | `Content-Type: application/json` required for POST/PUT |
| Body bombs | 1MB cap with `req.destroy()` on exceed |
| Slow-loris | `requestTimeout=30s`, `headersTimeout=10s` |
| Default bind | `127.0.0.1` only. `--host 0.0.0.0` is opt-in |

### Init — Seed Defaults

```bash
ome init
```

Registers 3 default employees if they don't already exist (idempotent):

| Name | CLI | Model | Role |
|------|-----|-------|------|
| Claude | claude | sonnet | General-purpose assistant |
| Codex | codex | o3-pro | Code generation and review |
| Gemini | gemini | *(default)* | Research and analysis |

### Status

```bash
ome status
```

Shows: agent busy state, active/total jobs, queue depth, employee list.

---

## Library API

OME can be used as a library in your own Node.js projects:

```typescript
import { spawnAgent, dispatch, initDb, seedDefaults } from 'ome';
import { inspect, watch } from 'ome/observe';

// Initialize
initDb('~/.ome/ome.db');
seedDefaults();

// Direct spawn — jobId available immediately
const { jobId, result } = spawnAgent('Fix the bug', {
    cli: 'claude',
    model: 'sonnet',
    cwd: '/path/to/project',
});
console.log(`Job started: ${jobId}`);
const output = await result;
console.log(`Exit code: ${output.code}`);

// Employee dispatch
const dispatchResult = await dispatch('Frontend', 'Fix CSS grid', {
    cwd: '/path/to/project',
});
console.log(`Job: ${dispatchResult.jobId}`);

// Observe
const state = inspect(jobId);
console.log(`Status: ${state?.status}, Events: ${state?.eventCount}`);

for await (const event of watch(jobId)) {
    console.log(`[${event.type}] ${event.message}`);
}
```

### Package Exports

```json
{
    "import": "./dist/src/index.js",        // main entry
    "import": "./dist/src/observe/index.js"  // ome/observe subpath
}
```

### Key Types

```typescript
// Spawn return (jobId available before completion)
spawnAgent(prompt, opts): { jobId: string; result: Promise<SpawnResult> }

// SpawnResult
interface SpawnResult {
    text: string;       // stdout output
    code: number;       // exit code
    jobId?: string;     // job tracking ID
    sessionId?: string; // future: CLI session marker
}

// Job metadata
interface Job {
    id: string;
    cli: string;
    prompt: string;
    model: string | null;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    phase: string;
    pid: number | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}

// Parsed progress event (from NDJSON log)
interface ProgressEvent {
    type: 'assistant' | 'tool_use' | 'tool_result' | 'thinking' | 'error' | 'system' | 'unknown';
    message: string;
    toolName: string | null;
    phase: string | null;
    ts: string;
}

// Live observation state
interface LiveRunState {
    jobId: string;
    cli: string;
    status: JobStatus;
    toolCalls: ParsedToolCall[];
    thinkingText: string;
    outputText: string;
    eventCount: number;
    lastEvent: ProgressEvent | null;
}
```

---

## Data Storage

All OME data lives under `~/.ome/` (override with `OME_HOME` env var):

```
~/.ome/
├── ome.db              # SQLite: employees, queued_messages,
│                       #   employee_sessions, quota_config
└── jobs/               # File-based job tracking
    ├── job-m1abc-x9f3.meta.json   # Job metadata
    ├── job-m1abc-x9f3.ndjson      # Streaming event log
    └── ...             # Max 50 non-running (LRU prune)
```

---

## NDJSON Parser — Multi-CLI Support

OME normalizes NDJSON output from different AI CLIs into a unified `ProgressEvent` format:

| CLI | Event Source | Tool Detection | Phase Detection |
|-----|-------------|----------------|-----------------|
| **Claude** | `type` field (`assistant`, `tool_use`, `tool_result`, `result`) | `obj.tool.name` or `obj.name` | — |
| **Codex** | `type` field (`message`, `tool`, etc.) | `obj.tool` string | `obj.phase` string |
| **Gemini** | `type` or `event` field | `obj.functionCall.name` | — |
| **Generic** | Fallback for any unknown CLI | — | `obj.phase` if present |

---

## Integration with cli-jaw

OME is designed to serve as the **process orchestration engine** for [cli-jaw](https://github.com/lidge-jun/cli-jaw), replacing the current direct `spawn` calls with persistent, observable job management.

See [CLI-JAW-REFERENCE.md](CLI-JAW-REFERENCE.md) for the full integration guide.

### Quick Integration

```typescript
// cli-jaw dispatch handler — before (direct spawn)
const result = await spawnCliProcess('claude', task);

// cli-jaw dispatch handler — after (OME)
import { dispatch, initDb } from 'ome';
initDb(join(JAW_HOME, 'ome.db'));
const result = await dispatch(employeeName, task, { cwd: projectRoot });
// result.jobId is now available for tracking
```

---

## Development

```bash
# Build
npm run build

# Type check
npm run typecheck

# Run tests (builds first via pretest)
npm test

# Watch mode
npm run dev

# Clean
npm run clean
```

### Project Structure

```
ome/
├── src/
│   ├── spawn/           # Process spawning + job tracking
│   │   ├── index.ts     # spawnAgent, killAgent, killJob, killJobByPid
│   │   ├── args.ts      # CLI-specific argument builders
│   │   ├── jobs.ts      # File-based job persistence
│   │   └── process-kill.ts  # Cross-platform process tree kill
│   ├── registry/        # Employee + quota management
│   │   ├── db.ts        # SQLite CRUD
│   │   ├── types.ts     # All shared TypeScript interfaces
│   │   └── index.ts     # Re-exports
│   ├── queue/           # In-memory message queue with hold/release
│   ├── dispatch/        # Employee dispatch (name → spawn)
│   ├── observe/         # NDJSON parser + watch/inspect
│   ├── web/             # HTTP dashboard + REST API
│   ├── seed/            # Default employee presets
│   ├── cli/             # CLI entry point (12 subcommands)
│   └── index.ts         # Public library exports
├── tests/               # node:test + node:assert/strict
│   ├── spawn/           # Job CRUD, path traversal
│   ├── observe/         # Parser, inspect
│   ├── seed/            # Idempotent seeding
│   ├── web/             # REST API endpoints
│   ├── dispatch/        # Contract chain
│   └── cli/             # Smoke tests
├── _reference/          # Read-only reference code
│   ├── codex-plugin-cc/ # openai/codex-plugin-cc (patterns adopted)
│   └── ANALYSIS.md      # Pattern adoption decisions
├── devlog/              # Development plan documents
├── package.json
└── tsconfig.json
```

### Test Suite

31 tests across 7 suites:

| Suite | Tests | Coverage |
|-------|-------|----------|
| `spawn/jobs` | 6 | Job CRUD, status transitions, path traversal, sort |
| `observe/parser` | 7 | Claude/Codex/Gemini/generic parsing, null cases |
| `observe/inspect` | 2 | Inspect existing/non-existent jobs |
| `seed` | 2 | Seed defaults, idempotent |
| `web/routes` | 7 | GET/POST endpoints, validation, XSS, body limits |
| `dispatch` | 2 | Unknown employee rejection, jobId in result |
| `cli/smoke` | 5 | --help, status, registry, init, unknown command |

All tests use temporary `OME_HOME` directories for isolation.

---

## Reference: codex-plugin-cc

OME adopted several patterns from [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc):

| Pattern | Source | OME Module |
|---------|--------|------------|
| Job persistence (meta + ndjson) | `lib/state.mjs`, `lib/tracked-jobs.mjs` | `spawn/jobs.ts` |
| Progress event normalization | `lib/tracked-jobs.mjs` | `observe/parser.ts` |
| Cross-platform process tree kill | `lib/process.mjs` | `spawn/process-kill.ts` |
| Max 50 job pruning | `lib/state.mjs` | `spawn/jobs.ts` |

**Not adopted**: broker process, JSON-RPC 2.0, plugin manifest — OME uses direct spawn for simplicity.

---

## Future Work

| Feature | Status |
|---------|--------|
| `sessionId` capture | Field exists; CLI session marker spec TBD |
| Configurable seed models | `OME_DEFAULT_MODEL_*` env planned |
| Quota enforcement | `quota_config` table exists; enforcement logic not yet wired |
| WebSocket live streaming | Current `watch` uses file-tailing; WS enables dashboard live view |
| `ome resume <job-id>` | Session resume via `employee_sessions` table |

---

## License

MIT
