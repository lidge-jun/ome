# P7: Tests — Unit + Integration + CLI Smoke

## Summary
각 모듈별 unit test + CLI smoke test.
Node built-in `node:test` + `node:assert` 사용.

## Audit Fixes Applied (Round 1)
- ✅ 테스트 디렉토리 생성 명시 (`mkdir -p tests/{spawn,observe,seed,web,cli}`)
- ✅ jobs.test → temp OME_HOME 격리 (실제 jobs 오염 방지)
- ✅ seed.test → `afterEach(closeDb)` 추가 (singleton DB 정리)
- ✅ `import.meta.dirname` → `fileURLToPath(import.meta.url)` + `dirname()` (Node 20.0 호환)
- ✅ unused import 정리 (noUnusedLocals 통과)
- ✅ 누락된 inspect.test, routes.test 본문 추가

## Audit Fixes Applied (Round 2)
- ✅ routes.test — `createServer as createHttpServer` unused import 제거
- ✅ smoke.test — CLI path `../../dist/cli/index.js` → `../../cli/index.js` (compiled 위치 기준)
- ✅ package.json — `pretest: "npm run build"` 추가

## Audit Fixes Applied (Round 4)
- ✅ smoke.test CLI path 재수정 → `../../src/cli/index.js` (rootDir='.', outDir='dist' 기준: tests/cli/ → dist/tests/cli/, src/cli/ → dist/src/cli/)
- ✅ routes.test POST 테스트 추가 (employees POST, invalid JSON, missing content-type, oversized body)
- ✅ dispatch integration test 추가 (`tests/dispatch/dispatch.test.ts`)
- ✅ Files 테이블에 dispatch.test.ts 추가

## Audit Fixes Applied (Round 5)
- ✅ package.json main/types/bin 경로 → `dist/src/` prefix 추가 (tsconfig rootDir='.', outDir='dist' 대응)
- ✅ dispatch.test `echo` CLI → Windows 미지원 시 skip guard 추가 (`process.platform === 'win32'` skip)
- ✅ overview library interface 예시 → `{jobId, result}` 새 반환형으로 업데이트

## Audit Fixes Applied (Round 6)
- ✅ routes.test oversized body POST 테스트 실제 추가 (1MB+ body → 400)

## Files

| Action | Path | Description |
|--------|------|-------------|
| NEW | `tests/spawn/jobs.test.ts` | Job CRUD + prune (temp dir 격리) |
| NEW | `tests/observe/parser.test.ts` | CLI별 NDJSON 파싱 |
| NEW | `tests/observe/inspect.test.ts` | inspect() 결과 검증 |
| NEW | `tests/seed/seed.test.ts` | seedDefaults idempotent |
| NEW | `tests/web/routes.test.ts` | REST API 엔드포인트 (GET + POST) |
| NEW | `tests/dispatch/dispatch.test.ts` | dispatch() integration — spawnAgent return type 대응 |
| NEW | `tests/cli/smoke.test.ts` | CLI 서브커맨드 실행 확인 |

---

## Pre-requisite: directory creation + package.json
```bash
mkdir -p tests/{spawn,observe,seed,web,dispatch,cli}
```

### MODIFY `package.json` — fix entrypoints + add pretest + exports
```json
{
  "main": "dist/src/index.js",
  "types": "dist/src/index.d.ts",
  "bin": {
    "ome": "dist/src/cli/index.js"
  },
  "scripts": {
    "pretest": "npm run build",
    "build": "tsc",
    ...
  },
  "exports": {
    ".": { "import": "./dist/src/index.js", "types": "./dist/src/index.d.ts" },
    "./observe": { "import": "./dist/src/observe/index.js", "types": "./dist/src/observe/index.d.ts" }
  }
}
```
> ⚠️ tsconfig `rootDir: "."` / `outDir: "dist"` 기준으로 `src/` → `dist/src/`, `tests/` → `dist/tests/`. 기존 `dist/index.js`, `dist/cli/index.js` 경로는 존재하지 않으므로 반드시 `dist/src/` prefix 필요.

---

## tests/spawn/jobs.test.ts

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('jobs', () => {
    let tmpHome: string;
    const origHome = process.env['OME_HOME'];

    beforeEach(() => {
        tmpHome = mkdtempSync(join(tmpdir(), 'ome-test-jobs-'));
        process.env['OME_HOME'] = tmpHome;
    });

    afterEach(() => {
        if (origHome) process.env['OME_HOME'] = origHome;
        else delete process.env['OME_HOME'];
        try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* noop */ }
    });

    it('createJob returns job with running status', async () => {
        const { createJob } = await import('../../src/spawn/jobs.js');
        const job = createJob('claude', 'test prompt', 'sonnet');
        assert.ok(job.id.startsWith('job-'));
        assert.equal(job.status, 'running');
        assert.equal(job.cli, 'claude');
    });

    it('completeJob updates status to completed on code 0', async () => {
        const { createJob, completeJob, readJobMeta } = await import('../../src/spawn/jobs.js');
        const job = createJob('claude', 'test');
        completeJob(job.id, 0);
        const meta = readJobMeta(job.id);
        assert.equal(meta?.status, 'completed');
        assert.ok(meta?.completedAt);
    });

    it('completeJob marks failed on non-zero code', async () => {
        const { createJob, completeJob, readJobMeta } = await import('../../src/spawn/jobs.js');
        const job = createJob('codex', 'test');
        completeJob(job.id, 1);
        assert.equal(readJobMeta(job.id)?.status, 'failed');
    });

    it('appendJobLog and readJobLog work correctly', async () => {
        const { createJob, appendJobLog, readJobLog } = await import('../../src/spawn/jobs.js');
        const job = createJob('claude', 'test');
        appendJobLog(job.id, '{"type":"assistant"}');
        appendJobLog(job.id, '{"type":"tool_use"}');
        const lines = readJobLog(job.id);
        assert.equal(lines.length, 2);
    });

    it('isValidJobId rejects path traversal', async () => {
        const { isValidJobId, readJobMeta } = await import('../../src/spawn/jobs.js');
        assert.equal(isValidJobId('../../../etc/passwd'), false);
        assert.equal(isValidJobId('job-abc-123'), true);
        assert.equal(readJobMeta('../etc/passwd'), null);
    });

    it('listJobs returns sorted by updatedAt desc', async () => {
        const { createJob, listJobs } = await import('../../src/spawn/jobs.js');
        createJob('claude', 'a');
        createJob('codex', 'b');
        const jobs = listJobs();
        assert.ok(jobs.length >= 2);
        assert.ok(jobs[0].updatedAt >= jobs[1].updatedAt);
    });
});
```

---

## tests/observe/parser.test.ts

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../../src/observe/parser.js';

describe('parseLine', () => {
    it('parses claude assistant event', () => {
        const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } });
        const ev = parseLine('claude', line);
        assert.equal(ev?.type, 'assistant');
        assert.ok(ev?.message.includes('Hello'));
    });

    it('parses claude tool_use event', () => {
        const line = JSON.stringify({ type: 'tool_use', tool: { name: 'Read' } });
        const ev = parseLine('claude', line);
        assert.equal(ev?.type, 'tool_use');
        assert.equal(ev?.toolName, 'Read');
    });

    it('parses codex event with phase', () => {
        const line = JSON.stringify({ type: 'message', message: 'fixing bug', phase: 'coding' });
        const ev = parseLine('codex', line);
        assert.equal(ev?.type, 'assistant');
        assert.equal(ev?.phase, 'coding');
    });

    it('parses gemini functionCall', () => {
        const line = JSON.stringify({ type: 'tool', functionCall: { name: 'search' } });
        const ev = parseLine('gemini', line);
        assert.equal(ev?.toolName, 'search');
    });

    it('returns null for empty/whitespace', () => {
        assert.equal(parseLine('claude', ''), null);
        assert.equal(parseLine('claude', '   '), null);
    });

    it('returns null for non-JSON', () => {
        assert.equal(parseLine('claude', 'not json at all'), null);
    });

    it('handles unknown CLI with generic parser', () => {
        const line = JSON.stringify({ type: 'msg', text: 'hello' });
        const ev = parseLine('unknown-cli', line);
        assert.equal(ev?.type, 'unknown');
        assert.ok(ev?.message);
    });
});
```

---

## tests/observe/inspect.test.ts

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('inspect', () => {
    let tmpHome: string;
    const origHome = process.env['OME_HOME'];

    beforeEach(() => {
        tmpHome = mkdtempSync(join(tmpdir(), 'ome-test-inspect-'));
        process.env['OME_HOME'] = tmpHome;
    });

    afterEach(() => {
        if (origHome) process.env['OME_HOME'] = origHome;
        else delete process.env['OME_HOME'];
        try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* noop */ }
    });

    it('returns null for non-existent job', async () => {
        const { inspect } = await import('../../src/observe/index.js');
        assert.equal(inspect('job-nonexistent-abc'), null);
    });

    it('returns LiveRunState for existing job with events', async () => {
        const { createJob, appendJobLog } = await import('../../src/spawn/jobs.js');
        const { inspect } = await import('../../src/observe/index.js');

        const job = createJob('claude', 'test');
        appendJobLog(job.id, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } }));
        appendJobLog(job.id, JSON.stringify({ type: 'tool_use', tool: { name: 'Read' } }));

        const state = inspect(job.id);
        assert.ok(state);
        assert.equal(state.jobId, job.id);
        assert.equal(state.cli, 'claude');
        assert.equal(state.eventCount, 2);
        assert.equal(state.toolCalls.length, 1);
        assert.equal(state.toolCalls[0].name, 'Read');
    });
});
```

---

## tests/seed/seed.test.ts

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb, listEmployees } from '../../src/registry/db.js';
import { seedDefaults } from '../../src/seed/index.js';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('seedDefaults', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'ome-test-seed-'));
        initDb(join(tmpDir, 'test.db'));
    });

    afterEach(() => {
        closeDb();
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
    });

    it('seeds 3 default employees', () => {
        const { added, skipped } = seedDefaults();
        assert.equal(added.length, 3);
        assert.equal(skipped.length, 0);
        assert.equal(listEmployees().length, 3);
    });

    it('is idempotent — second call skips all', () => {
        seedDefaults();
        const { added, skipped } = seedDefaults();
        assert.equal(added.length, 0);
        assert.equal(skipped.length, 3);
        assert.equal(listEmployees().length, 3);
    });
});
```

---

## tests/web/routes.test.ts

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb } from '../../src/registry/db.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('web routes', () => {
    let tmpDir: string;
    const origHome = process.env['OME_HOME'];

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'ome-test-web-'));
        process.env['OME_HOME'] = tmpDir;
        initDb(join(tmpDir, 'test.db'));
    });

    afterEach(() => {
        closeDb();
        if (origHome) process.env['OME_HOME'] = origHome;
        else delete process.env['OME_HOME'];
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
    });

    it('GET /api/status returns JSON', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const result = await mockRequest(handleApiRequest, 'GET', '/api/status');
        assert.equal(result.status, 200);
        const body = JSON.parse(result.body);
        assert.equal(typeof body.busy, 'boolean');
        assert.equal(typeof body.employees, 'number');
    });

    it('GET /api/employees returns array', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const result = await mockRequest(handleApiRequest, 'GET', '/api/employees');
        assert.equal(result.status, 200);
        assert.ok(Array.isArray(JSON.parse(result.body)));
    });

    it('GET /api/jobs/:id rejects invalid jobId', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const result = await mockRequest(handleApiRequest, 'GET', '/api/jobs/../../../etc/passwd');
        assert.equal(result.status, 400);
    });

    it('POST /api/employees rejects missing content-type', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const result = await mockRequest(handleApiRequest, 'POST', '/api/employees', { body: '{"name":"Test"}' });
        assert.equal(result.status, 415);
    });

    it('POST /api/employees rejects invalid JSON', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const result = await mockRequest(handleApiRequest, 'POST', '/api/employees', {
            body: 'not json',
            headers: { 'content-type': 'application/json' },
        });
        assert.equal(result.status, 400);
    });

    it('POST /api/employees rejects oversized body', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const bigBody = 'x'.repeat(1024 * 1024 + 1);
        const result = await mockRequest(handleApiRequest, 'POST', '/api/employees', {
            body: bigBody,
            headers: { 'content-type': 'application/json' },
        });
        assert.equal(result.status, 400);
    });

    it('POST /api/employees creates employee with valid input', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const result = await mockRequest(handleApiRequest, 'POST', '/api/employees', {
            body: JSON.stringify({ name: 'TestBot', cli: 'claude' }),
            headers: { 'content-type': 'application/json' },
        });
        assert.equal(result.status, 201);
        const body = JSON.parse(result.body);
        assert.equal(body.name, 'TestBot');
    });
});

type Handler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, url: URL) => void;
interface MockOpts { body?: string; headers?: Record<string, string> }

function mockRequest(handler: Handler, method: string, path: string, opts?: MockOpts): Promise<{ status: number; body: string }> {
    return new Promise((resolve) => {
        const url = new URL(path, 'http://localhost');
        const chunks: Buffer[] = [];
        const res = {
            statusCode: 200,
            writeHead(status: number, _headers?: Record<string, string>) { this.statusCode = status; return this; },
            end(data?: string) { if (data) chunks.push(Buffer.from(data)); resolve({ status: this.statusCode, body: Buffer.concat(chunks).toString() }); return this; },
        } as unknown as import('node:http').ServerResponse;
        const req = {
            method,
            url: path,
            headers: opts?.headers ?? {},
            on(event: string, cb: Function) {
                if (event === 'data' && opts?.body) cb(Buffer.from(opts.body));
                if (event === 'end') setTimeout(() => cb(), 0);
                return this;
            },
            destroy() {},
        } as unknown as import('node:http').IncomingMessage;
        handler(req, res, url);
    });
}
```

---

## tests/dispatch/dispatch.test.ts

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb, addEmployee } from '../../src/registry/db.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('dispatch', () => {
    let tmpDir: string;
    const origHome = process.env['OME_HOME'];

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'ome-test-dispatch-'));
        process.env['OME_HOME'] = tmpDir;
        initDb(join(tmpDir, 'test.db'));
    });

    afterEach(() => {
        closeDb();
        if (origHome) process.env['OME_HOME'] = origHome;
        else delete process.env['OME_HOME'];
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
    });

    it('throws on unknown employee', async () => {
        const { dispatch } = await import('../../src/dispatch/index.js');
        await assert.rejects(
            () => dispatch('NonExistent', 'do something'),
            { message: /not found/i },
        );
    });

    it('dispatch returns SpawnResult with jobId field', { skip: process.platform === 'win32' ? 'echo is a cmd builtin on Windows' : false }, async () => {
        const { dispatch } = await import('../../src/dispatch/index.js');
        addEmployee({ name: 'Echo', cli: 'echo', role: 'test' });
        const result = await dispatch('Echo', 'hello world');
        assert.equal(typeof result.text, 'string');
        assert.equal(typeof result.code, 'number');
        assert.ok(result.jobId, 'SpawnResult must include jobId after P2');
    });
});
```
> ⚠️ Uses `echo` as CLI — `resolveCliPath('echo')` falls through to `echo`, which is a real binary on Unix. Windows skip: `echo` is a `cmd` builtin, not a standalone executable, so `spawn('echo')` would throw `ENOENT`.

---

## tests/cli/smoke.test.ts

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '../../src/cli/index.js');

describe('CLI smoke', () => {
    let tmpHome: string;

    beforeEach(() => {
        tmpHome = mkdtempSync(join(tmpdir(), 'ome-test-cli-'));
    });

    afterEach(() => {
        try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* noop */ }
    });

    function run(args: string[]): string {
        return execFileSync('node', [CLI, ...args], {
            encoding: 'utf8',
            env: { ...process.env, OME_HOME: tmpHome },
            timeout: 5000,
        });
    }

    it('--help shows usage', () => {
        const out = run(['--help']);
        assert.ok(out.includes('OME'));
        assert.ok(out.includes('spawn'));
        assert.ok(out.includes('web'));
    });

    it('status runs without error', () => {
        const out = run(['status']);
        assert.ok(out.includes('Employees'));
    });

    it('registry list runs on empty db', () => {
        const out = run(['registry', 'list']);
        assert.ok(out.includes('No employees'));
    });

    it('init seeds defaults and is idempotent', () => {
        const out1 = run(['init']);
        assert.ok(out1.includes('Added'));
        const out2 = run(['init']);
        assert.ok(out2.includes('Skipped'));
    });

    it('unknown command exits with code 1', () => {
        try {
            run(['nonexistent']);
            assert.fail('should have thrown');
        } catch (err: unknown) {
            const execErr = err as { status: number };
            assert.equal(execErr.status, 1);
        }
    });
});
```
