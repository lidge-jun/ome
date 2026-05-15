# OME ↔ cli-jaw Integration Reference

> How OME replaces cli-jaw's direct process spawning with persistent, observable job management.

---

## Overview

cli-jaw currently spawns AI CLI processes directly via `child_process.spawn()`. OME wraps this with:

1. **Job persistence** — every spawn creates a trackable job with ID, metadata, and NDJSON log
2. **Cross-process observation** — `ome watch` and `ome inspect` work from any terminal
3. **Employee registry** — named agents with preset CLI/model configurations
4. **Web dashboard** — visual management UI at `http://127.0.0.1:7700`
5. **Process tree kill** — reliable cross-platform termination (vs naive `child.kill()`)

---

## Migration Path

### Before (cli-jaw direct spawn)

```typescript
// cli-jaw/src/dispatch/index.ts (current)
import { spawn } from 'node:child_process';

export async function dispatchToEmployee(name: string, task: string): Promise<string> {
    const employee = findEmployee(name);  // from settings.json
    const child = spawn(employee.cli, ['-p', task, '--print'], {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });

    return new Promise((resolve, reject) => {
        child.on('close', (code) => resolve(stdout));
        child.on('error', reject);
    });
}
```

### After (cli-jaw with OME)

```typescript
// cli-jaw/src/dispatch/index.ts (with OME)
import { dispatch, initDb } from 'ome';
import { join } from 'node:path';

const JAW_HOME = process.env['JAW_HOME'] ?? join(homedir(), '.cli-jaw');

// Initialize once at startup
initDb(join(JAW_HOME, 'ome.db'));

export async function dispatchToEmployee(name: string, task: string): Promise<string> {
    const result = await dispatch(name, task, {
        cwd: projectRoot,
        timeout: 600_000,  // 10 min
    });

    // result.jobId — available for tracking
    // result.text — stdout output
    // result.code — exit code
    console.error(`[jaw] dispatch jobId=${result.jobId}`);

    return result.text;
}
```

---

## Employee Registry Mapping

### cli-jaw employees.json → OME registry

cli-jaw stores employees in `settings.json`:

```json
{
    "employees": [
        { "name": "Frontend", "cli": "claude", "model": "sonnet", "role": "UI/UX" },
        { "name": "Backend", "cli": "codex", "model": "o3-pro", "role": "API" },
        { "name": "Data", "cli": "gemini", "role": "Analysis" }
    ]
}
```

OME stores the same data in SQLite:

```bash
# One-time migration
ome registry add --name "Frontend" --cli claude --model sonnet --role "UI/UX"
ome registry add --name "Backend" --cli codex --model o3-pro --role "API"
ome registry add --name "Data" --cli gemini --role "Analysis"

# Or use ome init for defaults, then customize
ome init
ome registry add --name "Frontend" --cli claude --model sonnet --role "UI/UX"
```

### Programmatic sync

```typescript
import { addEmployeeIfNotExists } from 'ome';
import { readFileSync } from 'node:fs';

const settings = JSON.parse(readFileSync(join(JAW_HOME, 'settings.json'), 'utf8'));
for (const emp of settings.employees ?? []) {
    addEmployeeIfNotExists({
        name: emp.name,
        cli: emp.cli,
        model: emp.model ?? null,
        role: emp.role ?? null,
    });
}
```

---

## Job Tracking Integration

### Boss agent — tracking dispatched work

```typescript
import { dispatch } from 'ome';
import { inspect, watch } from 'ome/observe';

// Dispatch returns immediately with jobId
const result = await dispatch('Frontend', 'Fix the CSS bug');

// Boss can now track the job
const state = inspect(result.jobId!);
console.log(`Status: ${state?.status}, Events: ${state?.eventCount}`);

// Or stream live events
for await (const event of watch(result.jobId!)) {
    if (event.type === 'error') {
        console.error(`Employee error: ${event.message}`);
        break;
    }
}
```

### cli-jaw dispatch command mapping

| cli-jaw command | OME equivalent | Notes |
|----------------|----------------|-------|
| `cli-jaw dispatch --agent "Name" --task "..."` | `ome dispatch --agent "Name" --task "..."` | Same interface |
| *pendingReplay recovery* | `ome result <job-id>` | Retrieve lost output by job ID |
| *no equivalent* | `ome watch <job-id>` | Live observation from any process |
| *no equivalent* | `ome kill <job-id>` | Cross-process kill via stored PID |
| *no equivalent* | `ome jobs` | List all tracked jobs |

### Solving cli-jaw's pendingReplay problem

cli-jaw's `pendingReplay` issue occurs when a Bash timeout (2 min) kills the client connection while the employee is still working. The employee's result is lost.

With OME:
1. The job's output is persisted to `~/.ome/jobs/{id}.ndjson` in real-time
2. Even if the client disconnects, the result is recoverable via `ome result <job-id>`
3. The job ID is printed immediately to stderr, so the boss agent can track it

```typescript
// Boss agent dispatches with timeout
const { jobId, result } = spawnAgent(task, { cli: 'claude', timeout: 600_000 });
console.error(`[jaw] jobId=${jobId}`);  // logged immediately

// Even if this process crashes, the job is recoverable
try {
    const sr = await result;
} catch {
    // Recover later
    const meta = readJobMeta(jobId);
    const logs = readJobLog(jobId);
}
```

---

## PABCD Orchestration Integration

OME enhances cli-jaw's PABCD orchestration with observable jobs:

### B Phase — Boss writes code, employees verify

```typescript
// Boss writes code directly (B phase rule)
writeFileSync('src/feature.ts', code);

// Dispatch read-only verification to employee
const verify = await dispatch('Backend', 
    `Project root: ${projectRoot}\nVerify src/feature.ts compiles and imports resolve.`
);

// Track verification job
const state = inspect(verify.jobId!);
console.log(`Verification: ${state?.status}`);
```

### A Phase — Plan audit

```typescript
const audit = await dispatch('Backend',
    `Project root: ${projectRoot}\nAudit: verify all file paths and imports exist.`
);

// Parse structured DONE/FAIL from output
const verdict = audit.text.includes('PASS') ? 'PASS' : 'FAIL';
```

---

## Web Dashboard in cli-jaw

The OME web dashboard can be started alongside cli-jaw's server:

```typescript
import { createServer } from 'ome/web';

// Start OME dashboard on a separate port
const omeServer = createServer(7700, '127.0.0.1');

// Graceful shutdown
process.on('SIGTERM', () => {
    omeServer.close();
});
```

Or via CLI:
```bash
ome web --port 7700 &
```

### REST API endpoints for cli-jaw

| Endpoint | Method | Use Case |
|----------|--------|----------|
| `GET /api/status` | GET | Health check, busy state |
| `GET /api/employees` | GET | List available employees |
| `POST /api/employees` | POST | Add employee (JSON body) |
| `DELETE /api/employees/:name` | DELETE | Remove employee |
| `GET /api/jobs` | GET | List all tracked jobs |
| `GET /api/jobs/:id` | GET | Inspect job state |
| `GET /api/quota` | GET | Get quota config |
| `PUT /api/quota` | PUT | Update quota limits |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OME_HOME` | `~/.ome` | Data directory (SQLite DB + job files) |

### Future

| Variable | Description |
|----------|-------------|
| `OME_DEFAULT_MODEL_CLAUDE` | Override default model for Claude employees |
| `OME_DEFAULT_MODEL_CODEX` | Override default model for Codex employees |
| `OME_DEFAULT_MODEL_GEMINI` | Override default model for Gemini employees |

---

## Dependency Graph (cli-jaw → OME)

```
cli-jaw
├── settings.json (employees config) ──sync──→ OME registry (SQLite)
├── dispatch handler ──calls──→ ome.dispatch(name, task)
├── boss agent ──tracks──→ ome.inspect(jobId) / ome.watch(jobId)
├── heartbeat ──monitors──→ GET /api/status
└── web UI ──links──→ OME dashboard (port 7700)
```

---

## Limitations

1. **No quota enforcement yet** — `quota_config` table exists but limits aren't checked before spawn
2. **No session resume** — `employee_sessions` table exists but `ome resume` is not implemented
3. **File-based observation** — `watch()` uses polling (500ms default), not WebSocket push
4. **Single-machine only** — OME spawns local CLI processes, no remote agent support
