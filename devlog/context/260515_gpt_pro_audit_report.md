# OME Production-Readiness Audit — ChatGPT Pro

**Date**: 2026-05-15
**Auditor**: ChatGPT Pro (o1-pro via agbrowse web-ai)
**Repository**: https://github.com/lidge-jun/ome
**Overall Score**: 5.0/10
**Verdict**: not-ready

---

## Scorecard

| Area | Score | Summary |
|------|------:|---------|
| Architecture & Design | 6/10 | Good module boundaries, but state model split between persisted files/SQLite and process-local globals |
| Code Quality | 5/10 | Strict TypeScript and small modules, but correctness bugs and source/docs/test inconsistencies |
| Security | 5/10 | Some local-hardening choices, but web/API auth, input validation, and threat modeling insufficient |
| Testing | 3/10 | Test structure exists, but source inconsistent with tests and important paths untested |
| Documentation | 6/10 | README unusually complete, but important claims stale or overstated |
| Package & Distribution | 5/10 | Sensible skeleton, but export/bin/license/lockfile issues need fixing |
| Performance | 5/10 | Reasonable caps in places, but log reading/writing and stale-job cleanup not production-grade |
| Developer Experience | 6/10 | Nice CLI/dashboard concept, but UX undermined by misleading status and raw errors |

---

## Top 5 Action Items

### 1. Make source, docs, and tests consistent — then enforce CI
- Fix `ome init` default employee mismatch (seed defines 4: Frontend/Backend/Data/Docs, but README says 3: Claude/Codex/Gemini, tests expect 3)
- Fix stale integration docs (CLI-JAW reference says "No session resume" but it's implemented)
- Fix package-lock bin path drift
- Add missing LICENSE file
- Add `./web` to package exports if `ome/web` is supported
- Add CI workflow: typecheck → build → tests → npm pack --dry-run

### 2. Harden web/API security model
- Require robust auth for mutations, even on loopback
- Remove query-string token auth; use Authorization headers
- Fix origin validation (substring check is bypassable)
- Add strict validation: name length/charset, CLI allowlist, model/role/prompt length caps, finite non-negative quota values
- Add security headers and real CSP
- Document threat model: OME can spawn arbitrary local processes

### 3. Fix job/session correctness
- Stale-session retry returns wrong job ID (`sr.jobId` not updated after retry)
- Make session/system-prompt behavior consistent across providers
- Clear orphaned sessions on employee deletion
- Add integration tests for all resume paths

### 4. Clarify and persist runtime state
- Either implement durable queue processor or remove/label queue as experimental
- Reconcile stale running jobs on startup
- Separate process-local active state from persisted job state in status/dashboard

### 5. Improve resource management
- Replace synchronous per-line log writes with bounded async write queue
- Cap incomplete line buffers and handle binary/huge-line output
- Add log-size/age retention
- Avoid full-log memory reads for inspect/watch
- Add stress tests for long-running/noisy processes

---

## Detailed Findings

### Architecture & Design (6/10)

**Strengths**:
- Sensible domain organization: cli, dispatch, observe, queue, registry, seed, spawn, web
- SQLite for employees/sessions/quota + file-based job logs — good cross-process observation
- Spawn layer properly separated from CLI-specific arg building and process-tree termination
- Minimal dependency surface (only better-sqlite3 runtime)

**Issues**:
- State model incoherent: in-memory Map for active jobs vs SQLite for persisted state — different processes disagree
- Queue module is placeholder: enqueue writes SQLite + in-memory, but listQueue returns only in-memory; no dispatch/spawn consumes persisted queue
- Session resume correctness bug: dispatch retry doesn't update `sr.jobId` after retry
- Public API exports incomplete: web layer uses DB functions not exported from registry/index.ts
- `isAgentBusy()` and active job tracking are process-local but exposed as global truth in web status

### Code Quality (5/10)

**Strengths**:
- Strict TypeScript config (strict, noImplicitReturns, noUnusedLocals, noUnusedParameters)
- SQLite uses prepared statements (no string interpolation)
- Job ID regex validation + basename-based safe path helper
- Small, narrow-purpose modules

**Issues**:
- Source/docs/test mismatch: seed defines 4 employees but README/tests say 3
- Resume argument handling inconsistent across providers
- Codex resume: prompt in both CLI args AND stdin — potential duplicate delivery
- Parser lightweight: ignores non-JSON, maps small set of event shapes
- removeEmployee doesn't cascade sessions; setQuota partial updates erase previous values
- No common error type or structured error contract

### Security (5/10)

**Strengths**:
- `child_process.spawn` with argv arrays (no `shell: true`)
- Job ID regex validation, JSON content-type required, 1MB body cap, request/header timeouts
- Default bind to 127.0.0.1
- Dashboard uses textContent for most dynamic strings

**Issues**:
- API auth disabled by default on loopback; token accepted in query parameter
- CSRF origin check uses `!origin.includes(host)` — not robust
- Insufficient input validation on employee creation/update
- README's "textContent only" claim false — dashboard uses innerHTML for SVG icons
- Spawned processes inherit full parent environment (API keys, tokens)
- OME is effectively an arbitrary local process launcher exposed via web API

### Testing (3/10)

**Strengths**:
- Test directory covers CLI smoke, dispatch, observe/parser, inspect, seed, spawn/jobs, web/routes
- 31 tests across 7 suites per README
- Tests cover some basics: job CRUD, parser nulls, dispatch contract, invalid inputs

**Issues**:
- Seed test expects 3 defaults but source defines 4 — likely failing
- No tests for stale-session retry, session clearing, retry job ID
- No tests for process-tree killing, timeout cleanup, force-kill, crash recovery
- No web security tests: auth-token, origin matching, dashboard XSS
- No coverage reporting or thresholds
- No integration tests with realistic fake provider CLIs

### Documentation (6/10)

**Strengths**:
- README covers features, quick start, architecture, CLI reference, web dashboard, session resume, security, library API, package exports, data storage, tests, release
- GitHub Pages docs/index.html provides readable landing page
- CLI-JAW integration reference explains migration path

**Issues**:
- Already drifting from source (employee names, resume claims)
- CLI-JAW reference says "No session resume" — stale
- Library example `initDb('~/.ome/ome.db')` — no tilde expansion in implementation
- Security claims overstated (innerHTML used for SVGs despite "textContent only" claim)
- REST API docs incomplete for update/quota endpoints

### Package & Distribution (5/10)

**Strengths**:
- Essential fields present: ESM type, main/types, bin, exports, files, engines
- prepublishOnly chains: typecheck → build → test → lint → dry-run

**Issues**:
- package-lock.json bin path disagrees with package.json
- No actual LICENSE file in repo despite MIT declaration
- Package exports missing `./web` (but CLI-JAW reference imports from `ome/web`)
- better-sqlite3 native dep increases install complexity; prebuild-install deprecated

### Performance (5/10)

**Strengths**:
- stdout capped at 10MB, stderr at 1MB per spawn
- Completed jobs pruned to max 50
- Web server timeouts, 1MB body cap, 30s quota cache with 5s fetch timeout
- Process group kill with SIGKILL fallback

**Issues**:
- `appendFileSync` on every log line blocks event loop
- No cap on per-job line buffer (long stream without newlines)
- `readJobLog`/`readJobLogFrom` loads entire file/remainder into memory
- No startup reconciliation for orphaned running jobs
- Dashboard auto-refresh can create duplicate intervals

### Developer Experience (6/10)

**Strengths**:
- Simple CLI surface with clear subcommands
- Approachable quick start
- Job model developer-friendly: immediate job ID, persistent logs, result/watch/inspect
- Dashboard provides employee CRUD, prompt editing, job table, quota display

**Issues**:
- CLI options thinner than library API (missing --cwd, --timeout, --system-prompt, --env, --json)
- `ome status` misleading: busy state is process-local but job metadata persisted
- Queue CLI implies durable orchestration but implementation doesn't deliver
- Error messages not consistently actionable
- Docs/implementation disagreements visible immediately to users
