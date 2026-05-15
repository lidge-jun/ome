<p align="center">
  <strong>OME</strong><br>
  <em>Orchestrated Multi-agent Engine</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ome"><img src="https://img.shields.io/npm/v/ome?color=cb3837&label=npm" alt="npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen" alt="Node.js"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="tsconfig.json"><img src="https://img.shields.io/badge/typescript-strict-3178c6" alt="TypeScript"></a>
</p>

<p align="center">
  One command to spawn any AI coding agent.<br>
  Claude Code, Codex, Codex App, Gemini CLI, Copilot, Grok, OpenCode — all through a single interface.
</p>

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="OME Web Dashboard" width="720">
</p>

---

## Why OME?

Every AI coding CLI has its own flags, output format, and session model.
OME normalizes all of that into one spawn contract — so your harness doesn't have to.

```bash
# Same interface, any provider
ome spawn --cli claude  "Fix the auth bug"
ome spawn --cli codex   "Add unit tests"
ome spawn --cli grok    "Analyze performance"
ome spawn --cli gemini  "Research the API"
```

You get back a structured result with job tracking, session resume, and real-time event streaming — regardless of which CLI runs underneath.

---

## Supported Providers

| CLI | Protocol | Resume | System Prompt | Thinking |
|-----|----------|--------|---------------|----------|
| Claude Code | NDJSON | `--resume` | Yes | Yes |
| Codex CLI | NDJSON | `exec resume` | No | Yes |
| Codex App | JSON-RPC 2.0 | `thread/resume` | Yes | Yes |
| Gemini CLI | NDJSON | `--resume` | No | — |
| Copilot CLI | NDJSON | `--resume` | No | — |
| Grok | NDJSON | `--resume` | No | Yes |
| OpenCode | NDJSON | `-s` | No | Yes |
| *(any executable)* | stdin/stdout | No | — | — |

`ome doctor` shows which CLIs are installed and ready.

---

## Install

```bash
# npm (recommended)
npm install -g ome

# from source
git clone https://github.com/lidge-jun/ome.git
cd ome && npm install && npm run build && npm link
```

**Requirements:** Node.js >= 20 and at least one AI CLI installed.

---

## Quick Start

```bash
# 1. Set up default employees
ome init

# 2. Check available CLIs
ome doctor
#   claude    ok — 2.1.141
#   codex     ok — 0.130.0
#   grok      ok — 0.1.210
#   ...

# 3. Spawn an agent directly
ome spawn --cli claude --model opus "Fix the login bug in auth.ts"

# 4. Or dispatch to a named employee
ome dispatch --agent "Backend" --task "Generate OpenAPI spec"

# 5. Monitor running jobs
ome watch <job-id>

# 6. Start the web dashboard
ome web    # → http://127.0.0.1:7700
```

---

## CLI Commands

| Command | What it does |
|---------|-------------|
| `ome spawn --cli <name> "<prompt>"` | Spawn any CLI agent directly |
| `ome spawn --dry-run --cli <name> "<prompt>"` | Preview spawn args without running |
| `ome dispatch --agent "<name>" --task "<task>"` | Dispatch to a registered employee (auto-resume) |
| `ome doctor` | Check which CLIs are installed |
| `ome init` | Seed default employees (Frontend, Backend, Data, Docs) |
| `ome registry list` | List registered employees |
| `ome registry add --name "<name>" --cli <cli>` | Register a new employee |
| `ome registry remove "<name>"` | Remove an employee |
| `ome jobs` | List recent jobs |
| `ome inspect <job-id>` | Snapshot of a job's current state |
| `ome watch <job-id>` | Live event stream from a running job |
| `ome result <job-id>` | Full output of a completed job |
| `ome kill <job-id>` | Kill a running job |
| `ome web` | Start the web dashboard (default: `http://127.0.0.1:7700`) |
| `ome status` | Agent busy state, job count, queue depth |

---

## Library Usage

Use OME as a Node.js library to build your own harness:

```typescript
import { spawnAgent, dispatch, initDb, seedDefaults } from 'ome';
import { progress, watchAll, checkStall, summarize } from 'ome';

// Initialize
initDb();
seedDefaults();

// Spawn — same API for any provider
const { jobId, result } = spawnAgent('Fix the bug', {
    cli: 'claude',
    model: 'sonnet',
    cwd: '/path/to/project',
});
const output = await result;  // { text, code, sessionId, durationMs }

// Track progress while running
const p = progress(jobId);
// → { tools: { total: 3, completed: 2, running: 1 }, elapsedMs: 4200, ... }

// Watch multiple jobs at once
for await (const { jobId: jid, event } of watchAll([job1, job2, job3])) {
    console.log(`[${jid}] ${event.type}: ${event.message}`);
}

// Detect stalled agents
const stall = checkStall(jobId, { warningMs: 30_000, timeoutMs: 120_000 });
if (stall?.state === 'stalled') killJob(jobId);

// Get a structured summary after completion
const s = summarize(jobId);
// → { toolsUsed: ['Read', 'Edit'], thinkingBlocks: 2, outputLength: 1847, exitCode: 0 }
```

### Key Types

```typescript
type AgentCli = 'claude' | 'codex' | 'codex-app' | 'gemini'
              | 'copilot' | 'grok' | 'opencode' | string;

interface SpawnResult {
    text: string;         // agent output
    code: number;         // exit code
    jobId?: string;       // for tracking
    sessionId?: string;   // for resume
    durationMs?: number;
}
```

---

## Web Dashboard

```bash
ome web                    # http://127.0.0.1:7700
ome web --port 3500        # custom port
```

- **Employee management** — add, remove, edit system prompts
- **Per-CLI quota cards** — live usage bars with plan info (emails are masked)
- **Job monitoring** — status badges, inspect, auto-refresh every 5s
- **Provider icons** — inline SVGs for each CLI

---

## How It Works

### Session Resume

OME tracks sessions per employee in SQLite. On dispatch:

1. Look up the employee's last session (same CLI + model)
2. Spawn with `--resume <sessionId>` (or JSON-RPC `thread/resume` for Codex App)
3. If stale → clear session → retry fresh
4. Persist the new session ID for next time

### Event Parsing

Every CLI outputs differently. OME normalizes all of them into `ProgressEvent`:

```typescript
{ type: 'assistant' | 'tool_use' | 'tool_result' | 'thinking' | 'error' | 'system',
  message: string, toolName: string | null, raw: unknown, ts: string }
```

Events are streamed in real-time via `watch()` and persisted as NDJSON logs per job.

### Job Persistence

```
~/.ome/
├── ome.db              # SQLite: employees, sessions, quota
└── jobs/
    ├── {id}.meta.json  # status, CLI, PID, timestamps
    └── {id}.ndjson     # streaming event log
```

### Security

| Concern | How it's handled |
|---------|-----------------|
| XSS | `textContent` only, no `innerHTML` for dynamic values |
| Path traversal | Regex-guarded job IDs on all endpoints |
| Email privacy | Account emails masked in dashboard (`ab***@domain.com`) |
| Network | Binds to `127.0.0.1` by default; `0.0.0.0` is opt-in |
| Body limits | 1MB cap, 30s request timeout |

---

## Development

```bash
npm run build         # compile TypeScript
npm run typecheck     # tsc --noEmit
npm test              # build + run all 95 tests
npm run dev           # watch mode
```

<details>
<summary>Project structure</summary>

```
ome/
├── src/
│   ├── cli/          # CLI entry (14 subcommands)
│   ├── dispatch/     # Employee dispatch + session resume
│   ├── observe/      # Event parser, watch, inspect, progress, stall, summary
│   ├── queue/        # Message queue
│   ├── registry/     # SQLite (employees, sessions, quota)
│   ├── seed/         # Default employee presets
│   ├── spawn/        # Process spawning, per-CLI arg builders, job tracking
│   ├── web/          # HTTP dashboard + REST API
│   └── index.ts      # Public library exports
├── tests/            # 95 tests across 14 suites
└── devlog/           # Jawdev development plans
```

</details>

<details>
<summary>Test suite (95 tests, 14 suites)</summary>

| Suite | Tests | Covers |
|-------|------:|--------|
| cli/smoke | 7 | help, status, registry, init, doctor, dry-run |
| dispatch | 3 | Employee lookup, jobId contract |
| observe/inspect | 2 | Existing and missing jobs |
| observe/parser | 19 | All 7 providers + edge cases |
| observe/progress | 4 | Tool counts, elapsed time |
| observe/stall | 5 | Active, warning, stalled states |
| observe/summary | 5 | Completion summary, errors, cancellation |
| seed | 2 | Seed + idempotency |
| spawn/args | 16 | All providers: new, resume, rejection guards |
| spawn/codex-app-events | 12 | JSON-RPC notification mapping |
| spawn/jobs | 6 | CRUD, status transitions, path traversal |
| spawn/preflight | 3 | Path resolution, availability |
| spawn/session-id | 4 | Per-provider session extraction |
| web/routes | 7 | REST endpoints, validation, body limits |

</details>

---

## License

MIT
