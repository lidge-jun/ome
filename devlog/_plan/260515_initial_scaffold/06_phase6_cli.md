# P6: CLI Subcommand Updates

## Summary
기존 CLI에 watch, inspect, web, init, queue 서브커맨드 추가.
`ome spawn --cli claude --model opus "prompt"` 직접 호출이 핵심.

## Audit Fixes Applied (Round 1)
- ✅ handleWatch → job 존재 확인 후 watch 시작
- ✅ queue release → id 누락 시 exit 1
- ✅ handleWeb → SIGINT/SIGTERM handler에서 server close + DB close
- ✅ `web` 커맨드 시 `closeDb()` skip → shutdown handler로 이동

## Audit Fixes Applied (Round 2)
- ✅ `ome kill <job-id>` 서브커맨드 추가
- ✅ `ome result <job-id>` 서브커맨드 추가 (full output)
- ✅ `ome jobs` 서브커맨드 추가 (job 목록)
- ✅ spawn/dispatch 출력에 jobId 포함 (stderr prefix)
- ✅ `--host` 옵션 for web

## Audit Fixes Applied (Round 3)
- ✅ `handleKill` → `killJobByPid()` 사용 (별도 CLI 프로세스에서 meta.pid 기반 kill)
- ✅ `handleSpawn`/`handleDispatch` → jobId 즉시 출력 (spawnAgent 새 반환형 `{jobId, result}` 활용)
- ✅ `handleWeb` → EADDRINUSE 핸들러 추가 (P4 createServer에서 이동)

## Audit Fixes Applied (Round 4)
- ✅ `handleKill` snippet 수정 → `killJob()` → `killJobByPid()` (함수명 불일치 fix)
- ✅ `handleWeb` snippet 수정 → `server.on('error')` EADDRINUSE 핸들러 실제 코드 추가
- ✅ `handleSpawn` 수정 → spawnAgent 새 반환형 `{jobId, result}` destructure + `await result`

## Audit Fixes Applied (Round 6)
- ✅ stray code fences 제거 (handleKill 후, handleWeb 후) — Markdown 렌더링 정상화

## Files

| Action | Path | Description |
|--------|------|-------------|
| MODIFY | `src/cli/index.ts` | watch, inspect, web, init, queue 핸들러 추가 |

---

## MODIFY: `src/cli/index.ts`

### New imports (top of file, after existing imports)
```typescript
import { inspect as inspectJob, watch as watchJob } from '../observe/index.js';
import { createServer } from '../web/index.js';
import { seedDefaults } from '../seed/index.js';
import { listQueue, clearQueue, setQueueHold, clearQueueHold } from '../queue/index.js';
import { listJobs, readJobMeta, readJobLog } from '../spawn/jobs.js';
import { killJobByPid } from '../spawn/index.js';
```

### main() switch — Before (line 32-44)
```typescript
    try {
        switch (command) {
            case 'spawn': await handleSpawn(args.slice(1)); break;
            case 'dispatch': await handleDispatch(args.slice(1)); break;
            case 'registry': handleRegistry(args.slice(1)); break;
            case 'status': handleStatus(); break;
            default:
                console.error(`Unknown command: ${command}`);
                printHelp();
                process.exitCode = 1;
        }
    } finally {
        closeDb();
    }
```

### main() switch — After
```typescript
    try {
        switch (command) {
            case 'spawn': await handleSpawn(args.slice(1)); break;
            case 'dispatch': await handleDispatch(args.slice(1)); break;
            case 'registry': handleRegistry(args.slice(1)); break;
            case 'queue': handleQueue(args.slice(1)); break;
            case 'jobs': handleJobs(); break;
            case 'kill': handleKill(args.slice(1)); break;
            case 'result': handleResult(args.slice(1)); break;
            case 'watch': await handleWatch(args.slice(1)); break;
            case 'inspect': handleInspect(args.slice(1)); break;
            case 'web': handleWeb(args.slice(1)); break;
            case 'init': handleInit(); break;
            case 'status': handleStatus(); break;
            default:
                console.error(`Unknown command: ${command}`);
                printHelp();
                process.exitCode = 1;
        }
    } finally {
        if (command !== 'web') closeDb();
    }
```

### handleQueue — NEW
```typescript
function handleQueue(args: string[]): void {
    const sub = args[0];
    switch (sub) {
        case 'list': {
            const items = listQueue();
            if (!items.length) { console.log('Queue empty.'); return; }
            for (const item of items) {
                console.log(`  ${item.id}  ${item.prompt.slice(0, 60)}  [${item.source}]`);
            }
            break;
        }
        case 'hold': {
            const id = args[1];
            if (!id) { console.error('Usage: ome queue hold <id>'); process.exitCode = 1; return; }
            setQueueHold(id);
            console.log(`Queue held: ${id}`);
            break;
        }
        case 'release': {
            const id = args[1];
            if (!id) { console.error('Usage: ome queue release [id]'); process.exitCode = 1; return; }
            clearQueueHold(id);
            console.log('Queue hold released.');
            break;
        }
        case 'clear': {
            const count = clearQueue();
            console.log(`Cleared ${count} items.`);
            break;
        }
        default:
            console.error('Usage: ome queue [list|hold|release|clear]');
            process.exitCode = 1;
    }
}
```

### handleWatch — NEW (with existence check)
```typescript
async function handleWatch(args: string[]): Promise<void> {
    const jobId = args[0];
    if (!jobId) { console.error('Usage: ome watch <job-id>'); process.exitCode = 1; return; }

    // Verify job exists before entering watch loop
    const state = inspectJob(jobId);
    if (!state) { console.error(`Job not found: ${jobId}`); process.exitCode = 1; return; }

    console.log(`Watching ${jobId} (${state.cli}, ${state.status})...\n`);
    for await (const event of watchJob(jobId)) {
        const prefix = event.toolName ? `[${event.type}:${event.toolName}]` : `[${event.type}]`;
        console.log(`${event.ts.slice(11, 19)} ${prefix} ${event.message}`);
    }
    console.log('\nJob finished.');
}
```

### handleInspect — NEW
```typescript
function handleInspect(args: string[]): void {
    const jobId = args[0];
    if (!jobId) { console.error('Usage: ome inspect <job-id>'); process.exitCode = 1; return; }
    const state = inspectJob(jobId);
    if (!state) { console.error(`Job not found: ${jobId}`); process.exitCode = 1; return; }
    console.log(`Job: ${state.jobId}`);
    console.log(`CLI: ${state.cli}  Status: ${state.status}  Phase: ${state.currentPhase}`);
    console.log(`Events: ${state.eventCount}  Tools: ${state.toolCalls.length}`);
    if (state.toolCalls.length) {
        console.log('\nTool calls:');
        for (const tc of state.toolCalls) {
            console.log(`  ${tc.status === 'running' ? '...' : 'ok'} ${tc.name} (${tc.status})`);
        }
    }
    if (state.outputText) {
        console.log(`\nOutput preview:\n${state.outputText.slice(0, 500)}`);
    }
}
```

### handleSpawn — MODIFY (adapt to new return type + jobId output)

Replace the tail of existing `handleSpawn`:
```typescript
    const { jobId, result } = spawnAgent(prompt, { cli: values.cli, model: values.model });
    process.stderr.write(`[ome] jobId=${jobId}\n`);
    const sr = await result;
    process.stdout.write(sr.text);
    process.exitCode = sr.code;
```
> ⚠️ `spawnAgent()` now returns `{ jobId, result: Promise<SpawnResult> }` — destructure and await separately.

### handleDispatch — MODIFY (add jobId output)

In existing `handleDispatch`, after `const result = await dispatch(...)` — dispatch already returns `Promise<SpawnResult>` (it awaits internally):
```typescript
    if (result.jobId) process.stderr.write(`[ome] jobId=${result.jobId}\n`);
    process.stdout.write(result.text);
    process.exitCode = result.code;
```

### handleJobs — NEW
```typescript
function handleJobs(): void {
    const jobs = listJobs();
    if (!jobs.length) { console.log('No jobs.'); return; }
    for (const j of jobs.slice(0, 30)) {
        const age = j.completedAt ? `done ${j.completedAt.slice(11, 19)}` : 'running';
        console.log(`  ${j.id}  ${j.cli.padEnd(6)}  ${j.status.padEnd(10)}  ${age}  ${j.prompt.slice(0, 40)}`);
    }
}
```

### handleKill — NEW
```typescript
function handleKill(args: string[]): void {
    const jobId = args[0];
    if (!jobId) { console.error('Usage: ome kill <job-id>'); process.exitCode = 1; return; }
    const ok = killJobByPid(jobId, 'user');
    if (ok) {
        console.log(`Killed: ${jobId}`);
    } else {
        console.error(`Job not found or already finished: ${jobId}`);
        process.exitCode = 1;
    }
}
```
> ⚠️ Uses `killJobByPid()` not `killJob()` — CLI is a separate process that doesn't share in-memory `activeJobs` Map. `killJobByPid` reads meta.json for PID and sends OS signal.

### handleResult — NEW
```typescript
function handleResult(args: string[]): void {
    const jobId = args[0];
    if (!jobId) { console.error('Usage: ome result <job-id>'); process.exitCode = 1; return; }
    const meta = readJobMeta(jobId);
    if (!meta) { console.error(`Job not found: ${jobId}`); process.exitCode = 1; return; }

    console.log(`Job: ${meta.id}`);
    console.log(`CLI: ${meta.cli}  Status: ${meta.status}  Phase: ${meta.phase}`);
    if (meta.completedAt) console.log(`Completed: ${meta.completedAt}`);

    const logs = readJobLog(jobId);
    if (logs.length) {
        console.log(`\n--- Output (${logs.length} lines) ---`);
        for (const line of logs) {
            console.log(line);
        }
    } else {
        console.log('\nNo output recorded.');
    }
}
```

### handleWeb — NEW (with EADDRINUSE handler + graceful shutdown)
```typescript
function handleWeb(args: string[]): void {
    const { values } = parseArgs({
        args,
        options: {
            port: { type: 'string', default: '7700' },
            host: { type: 'string', default: '127.0.0.1' },
        },
    });
    const port = parseInt(values.port!, 10);
    const server = createServer(port, values.host!);

    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use. Try: ome web --port ${port + 1}`);
            closeDb();
            process.exit(1);
        }
        throw err;
    });

    const shutdown = () => {
        console.log('\nShutting down...');
        server.close(() => {
            closeDb();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 3000).unref();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    console.log('Press Ctrl+C to stop.');
}
```
> ⚠️ EADDRINUSE handler is here (CLI layer), not in P4 createServer (library layer). Library must not call process.exit().

### handleInit — NEW
```typescript
function handleInit(): void {
    const { added, skipped } = seedDefaults();
    if (added.length) console.log(`Added: ${added.join(', ')}`);
    if (skipped.length) console.log(`Skipped (already exist): ${skipped.join(', ')}`);
    if (!added.length && !skipped.length) console.log('No defaults to seed.');
}
```

### handleStatus — Updated
```typescript
function handleStatus(): void {
    const emps = listEmployees();
    const jobs = listJobs();
    const running = jobs.filter(j => j.status === 'running');
    console.log(`Agent busy: ${isAgentBusy()}`);
    console.log(`Active jobs: ${running.length}`);
    console.log(`Total jobs: ${jobs.length}`);
    console.log(`Queue depth: ${messageQueue.length}`);
    console.log(`Employees: ${emps.length}`);
    if (emps.length) {
        for (const e of emps) {
            console.log(`  ${e.name} — ${e.cli} (${e.model ?? 'default'})`);
        }
    }
}
```

### printHelp — Updated
```typescript
function printHelp(): void {
    console.log(`OME — Orchestrated Multi-agent Engine

Commands:
  spawn     Spawn a single agent CLI
  dispatch  Dispatch task to a registered employee
  registry  Manage employee registry (add/remove/list)
  queue     Manage message queue (list/hold/release/clear)
  jobs      List tracked jobs
  kill      Kill a running job
  result    Show full output of a completed job
  watch     Watch a running job's live events
  inspect   Inspect a job's current state
  web       Start the management web UI (--host, --port)
  init      Seed default employees (claude/codex/gemini)
  status    Show current status

Examples:
  ome spawn --cli claude --model opus "Fix the login bug"
  ome dispatch --agent "Frontend" --task "Fix CSS grid"
  ome jobs
  ome watch job-abc123
  ome kill job-abc123
  ome result job-abc123
  ome web --port 3500 --host 0.0.0.0
  ome init`);
}
```
