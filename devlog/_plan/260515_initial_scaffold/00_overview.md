# OME — Orchestrated Multi-agent Engine

- status: building (P1 done, P2+ planned)
- created: 2026-05-15

## What Is OME

다른 AI CLI(Claude Code, Codex, Gemini CLI 등)를 "직원"처럼 호출·관리하는 독립 CLI + 라이브러리.
직접 호출(`ome spawn`)과 등록 직원 호출(`ome dispatch`) 모두 지원.
소비자(cli-jaw 등)가 skill/import로 연결해 multi-agent orchestration 가능.

## Reference

- `_reference/codex-plugin-cc/` — OpenAI codex-plugin-cc (Claude Code용 Codex 플러그인)
- `_reference/ANALYSIS.md` — 분석 결과 + OME 적용 패턴

## Architecture

```
ome/
├── src/
│   ├── spawn/           # Core agent spawning
│   │   ├── index.ts     # spawnAgent, killAgent, waitForProcessEnd
│   │   ├── args.ts      # CLI-specific argument builders
│   │   └── jobs.ts      # Job persistence (meta.json + ndjson log)  ← P2 NEW
│   ├── registry/        # Employee management
│   │   ├── index.ts     # CRUD re-exports
│   │   ├── db.ts        # SQLite schema + prepared statements
│   │   └── types.ts     # Employee, Job, Event types
│   ├── queue/           # Message queue with hold/steer
│   │   └── index.ts     # enqueue, dequeue, hold/release
│   ├── dispatch/        # Employee dispatch
│   │   └── index.ts     # dispatch(name, task) → result
│   ├── observe/         # Real-time process tracking  ← P3 NEW
│   │   ├── index.ts     # watch(jobId), inspect(jobId)
│   │   ├── parser.ts    # NDJSON line parser (per-CLI format)
│   │   └── types.ts     # ParsedEvent, LiveRunState types
│   ├── web/             # Management web UI  ← P4 NEW
│   │   ├── index.ts     # createServer(port)
│   │   └── routes.ts    # REST API: employees, quota, jobs
│   ├── seed/            # Default employee presets  ← P5 NEW
│   │   └── index.ts     # seedDefaults(registry)
│   └── cli/
│       └── index.ts     # ome spawn/dispatch/registry/watch/web/init
├── _reference/          # 참조 코드 (gitignored from npm)
│   ├── codex-plugin-cc/ # OpenAI codex-plugin-cc clone
│   └── ANALYSIS.md      # 분석 결과
├── devlog/
├── tests/
├── package.json
└── tsconfig.json
```

## CLI Interface

```bash
# Direct spawn (직원 없이 직접 호출)
ome spawn --cli claude --model opus "Fix the login bug"
ome spawn --cli codex --model o3-pro "Refactor auth module"
ome spawn --cli gemini "Analyze this data"

# Employee management
ome registry add --name "Frontend" --cli claude --model sonnet --role "UI/UX"
ome registry list
ome registry remove "Frontend"

# Employee dispatch (등록된 직원의 CLI/model 사용)
ome dispatch --agent "Frontend" --task "Fix the CSS grid layout"

# Queue management
ome queue list
ome queue hold <id>
ome queue release <id>
ome queue clear

# Process observation
ome watch <job-id>          # 실시간 NDJSON 이벤트 스트림 follow
ome inspect <job-id>        # 현재 상태 스냅샷

# Job management
ome jobs                    # list tracked jobs
ome kill <job-id>           # kill running job (by stored PID)
ome result <job-id>         # full output of completed job

# Web UI
ome web                     # http://127.0.0.1:7700
ome web --port 3500 --host 0.0.0.0

# Initialization
ome init                    # seed default employees

# Status
ome status                  # active jobs, queue depth, employees
```

## Library Interface

```typescript
import { spawnAgent, dispatch, initDb } from 'ome';
import { inspect, watch } from 'ome/observe'; // requires package.json "exports" subpath

initDb('~/.ome/ome.db');

// Direct spawn — returns {jobId, result: Promise<SpawnResult>}
const { jobId, result } = spawnAgent('Fix the bug', {
    cli: 'claude', model: 'sonnet', cwd: '/path/to/project',
});
console.log(jobId); // job-abc123 (available immediately)
const sr = await result; // wait for completion

// Employee dispatch (internally calls spawnAgent with employee's CLI/model)
const output = await dispatch('Frontend', 'Fix CSS grid', {
    cwd: '/path/to/project',
});
console.log(output.jobId); // also available on SpawnResult

// Observe running job
const state = inspect(jobId);
for await (const ev of watch(jobId)) { console.log(ev); }
```

## Phase Plan (Revised)

| Phase | Scope | Status | Deps |
|-------|-------|--------|------|
| P1 | Scaffold + types + SQLite + registry + basic spawn + dispatch + queue + CLI | ✅ done | — |
| P2 | Enhanced spawn: job tracking, NDJSON callbacks, sessionId, cross-platform kill | planned | P1 |
| P3 | Observe: NDJSON parser (claude/codex/gemini) + LiveRunState + watch/inspect API | planned | P2 |
| P4 | Web UI: employee dashboard + quota + live process monitor | planned | P1, P3 |
| P5 | Seed: `ome init` default employees (claude/codex/gemini presets) | planned | P1 |
| P6 | CLI updates: watch, inspect, web, init, queue subcommands | planned | P2-P5 |
| P7 | Tests: unit + integration + CLI smoke tests | planned | all |

## cli-jaw Source References

| OME module | cli-jaw source | cc-plugin reference |
|-----------|---------------|---------------------|
| `spawn/jobs.ts` | `src/agent/spawn.ts` (job section) | `lib/state.mjs` + `lib/tracked-jobs.mjs` |
| `observe/parser.ts` | `src/agent/events.ts` | `lib/tracked-jobs.mjs:normalizeProgressEvent` |
| `observe/types.ts` | `src/agent/live-run-state.ts` | — |
| `spawn/index.ts` kill | `src/agent/spawn.ts` kill | `lib/process.mjs:terminateProcessTree` |
| `web/routes.ts` | `src/routes/employees.ts` | — |
| `seed/index.ts` | `src/core/employees.ts` (staticEmployees) | — |

## File Map

```
devlog/_plan/260515_initial_scaffold/
├── 00_overview.md           ← this file (index)
│   (P1 scaffold — completed inline, no separate doc)
├── 02_phase2_spawn_jobs.md  ← P2: enhanced spawn + job tracking
├── 03_phase3_observe.md     ← P3: NDJSON parser + observe API
├── 04_phase4_web.md         ← P4: web UI
├── 05_phase5_seed.md        ← P5: default employee seeding
├── 06_phase6_cli.md         ← P6: CLI subcommand updates
└── 07_phase7_tests.md       ← P7: tests
```
