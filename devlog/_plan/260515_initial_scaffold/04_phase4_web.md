# P4: Web UI — Employee Dashboard + Quota + Live Monitor

## Summary
`ome web`으로 간단한 관리 UI 제공. 직원 목록/추가/삭제 + 할당량 설정 + 실행중인 job 모니터.
Node built-in `http` 모듈만 사용 (외부 의존성 없음).

## Audit Fixes Applied (Round 1)
- ✅ unused `findEmployee` import 제거
- ✅ `QuotaConfig` import 추가 in db.ts
- ✅ body reader → Promise 기반 + 1MB size cap + JSON parse 에러 400
- ✅ XSS → `textContent` + escapeHTML helper
- ✅ jobId path traversal → `isValidJobId()` guard (P2에서 제공)
- ✅ `getQuota`/`setQuota` import path 수정

## Audit Fixes Applied (Round 2)
- ✅ `server.listen()` → `127.0.0.1` bind (localhost only, `--host` opt-in)
- ✅ EADDRINUSE → `server.on('error')` 핸들러 + 명확한 에러 메시지
- ✅ POST/PUT → Content-Type `application/json` 검증, 그 외 415

## Audit Fixes Applied (Round 3)
- ✅ `createServer` → `process.exit(1)` 제거 (라이브러리 소비자 안전). EADDRINUSE 핸들링은 CLI 측(P6 handleWeb)으로 이동

## Audit Fixes Applied (Round 4)
- ✅ `createServer` → `server.requestTimeout = 30_000`, `server.headersTimeout = 10_000` 추가 (slow-loris 방지, 특히 `--host 0.0.0.0` 사용 시)

## Audit Fixes Applied (Round 6)
- ✅ stray code fence 제거 (line 71) — Markdown 렌더링 정상화

## Files

| Action | Path | Description |
|--------|------|-------------|
| NEW | `src/web/index.ts` | HTTP server 생성 + static 파일 서빙 |
| NEW | `src/web/routes.ts` | REST API 라우트 핸들러 |
| NEW | `src/web/dashboard.ts` | Inline HTML/JS (XSS-safe) |
| MODIFY | `src/registry/types.ts` | QuotaConfig 타입 추가 |
| MODIFY | `src/registry/db.ts` | quota_config 테이블 + getQuota/setQuota |

---

## NEW: `src/web/index.ts`

```typescript
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handleApiRequest } from './routes.js';
import { getDashboardHtml } from './dashboard.js';

const DEFAULT_PORT = 7700;

export function createServer(port = DEFAULT_PORT, host = '127.0.0.1'): ReturnType<typeof createHttpServer> {
    const server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '/', `http://${host}:${port}`);

        if (url.pathname.startsWith('/api/')) {
            handleApiRequest(req, res, url);
            return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getDashboardHtml());
    });

    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;

    server.listen(port, host, () => {
        console.log(`OME dashboard: http://${host}:${port}`);
    });

    return server;
}
```
> ⚠️ No `server.on('error')` here — library code must not call `process.exit()`. The CLI handler (P6 `handleWeb`) attaches the EADDRINUSE handler with `process.exit(1)`.

---

## NEW: `src/web/routes.ts`

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import { listEmployees, addEmployee, removeEmployee, getQuota, setQuota } from '../registry/db.js';
import { listJobs, isValidJobId } from '../spawn/jobs.js';
import { isAgentBusy, getActiveJobs } from '../spawn/index.js';
import { inspect } from '../observe/index.js';
import { messageQueue } from '../queue/index.js';

const MAX_BODY = 1024 * 1024; // 1MB

export function handleApiRequest(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const method = req.method ?? 'GET';
    const path = url.pathname;

    try {
        // Employees
        if (path === '/api/employees' && method === 'GET') {
            json(res, listEmployees());
            return;
        }
        if (path === '/api/employees' && method === 'POST') {
            if (!isJsonContent(req)) { error(res, 415, 'Content-Type must be application/json'); return; }
            readBody(req).then(body => {
                let parsed: Record<string, unknown>;
                try { parsed = JSON.parse(body); } catch { error(res, 400, 'invalid JSON'); return; }
                const name = parsed['name'];
                if (typeof name !== 'string' || !name.trim()) { error(res, 400, 'name required'); return; }
                const emp = addEmployee({
                    name: name.trim(),
                    cli: String(parsed['cli'] ?? 'claude'),
                    model: parsed['model'] ? String(parsed['model']) : undefined,
                    role: parsed['role'] ? String(parsed['role']) : undefined,
                });
                json(res, emp, 201);
            }).catch(() => error(res, 400, 'body read failed'));
            return;
        }
        if (path.startsWith('/api/employees/') && method === 'DELETE') {
            const name = decodeURIComponent(path.slice('/api/employees/'.length));
            const ok = removeEmployee(name);
            json(res, { removed: ok });
            return;
        }

        // Jobs
        if (path === '/api/jobs' && method === 'GET') {
            json(res, listJobs());
            return;
        }
        if (path.startsWith('/api/jobs/') && method === 'GET') {
            const jobId = decodeURIComponent(path.slice('/api/jobs/'.length));
            if (!isValidJobId(jobId)) { error(res, 400, 'invalid job ID'); return; }
            const state = inspect(jobId);
            if (!state) { error(res, 404, 'job not found'); return; }
            json(res, state);
            return;
        }

        // Quota
        if (path === '/api/quota' && method === 'GET') {
            json(res, getQuota());
            return;
        }
        if (path === '/api/quota' && method === 'PUT') {
            if (!isJsonContent(req)) { error(res, 415, 'Content-Type must be application/json'); return; }
            readBody(req).then(body => {
                let config: Record<string, unknown>;
                try { config = JSON.parse(body); } catch { error(res, 400, 'invalid JSON'); return; }
                setQuota({
                    dailyLimit: typeof config['dailyLimit'] === 'number' ? config['dailyLimit'] : 0,
                    hourlyLimit: typeof config['hourlyLimit'] === 'number' ? config['hourlyLimit'] : 0,
                });
                json(res, { ok: true });
            }).catch(() => error(res, 400, 'body read failed'));
            return;
        }

        // Status
        if (path === '/api/status' && method === 'GET') {
            json(res, {
                busy: isAgentBusy(),
                activeJobs: getActiveJobs().size,
                queueDepth: messageQueue.length,
                employees: listEmployees().length,
            });
            return;
        }

        error(res, 404, 'not found');
    } catch (err) {
        error(res, 500, err instanceof Error ? err.message : 'internal error');
    }
}

function json(res: ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function error(res: ServerResponse, status: number, msg: string): void {
    json(res, { error: msg }, status);
}

function isJsonContent(req: IncomingMessage): boolean {
    const ct = req.headers['content-type'] ?? '';
    return ct.includes('application/json');
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY) { req.destroy(); reject(new Error('body too large')); return; }
            body += chunk;
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}
```

---

## NEW: `src/web/dashboard.ts`

XSS-safe: all dynamic values rendered via `textContent`, not `innerHTML`.

```typescript
export function getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OME Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0a0a;color:#e0e0e0;padding:24px}
h1{font-size:1.4rem;margin-bottom:16px;color:#fff}
h2{font-size:1.1rem;margin:24px 0 12px;color:#ccc;border-bottom:1px solid #222;padding-bottom:6px}
table{width:100%;border-collapse:collapse;margin-bottom:12px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #1a1a1a}
th{color:#888;font-size:.85rem;text-transform:uppercase}
td{font-size:.9rem}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:600}
.running{background:#1a3a1a;color:#4ade80}
.completed{background:#1a2a3a;color:#60a5fa}
.failed{background:#3a1a1a;color:#f87171}
.cancelled{background:#2a2a1a;color:#facc15}
button{background:#1a1a2e;color:#e0e0e0;border:1px solid #333;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:.85rem}
button:hover{background:#2a2a4e}
button.danger{border-color:#7f1d1d}
button.danger:hover{background:#7f1d1d}
input,select{background:#111;color:#e0e0e0;border:1px solid #333;padding:6px 10px;border-radius:4px;font-size:.85rem}
.form-row{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.stat{display:inline-block;margin-right:24px;padding:8px 16px;background:#111;border-radius:6px}
.stat-val{font-size:1.4rem;font-weight:700;color:#fff}
.stat-label{font-size:.75rem;color:#888}
#refresh{position:fixed;top:16px;right:16px;z-index:10}
#job-detail{display:none;margin-top:16px;padding:16px;background:#111;border-radius:8px}
#job-detail pre{white-space:pre-wrap;font-size:.85rem;max-height:400px;overflow:auto}
</style>
</head>
<body>
<button id="refresh" onclick="loadAll()">Refresh</button>
<h1>OME Dashboard</h1>
<div id="stats"></div>
<h2>Employees</h2>
<div class="form-row">
<input id="emp-name" placeholder="Name" style="width:120px">
<select id="emp-cli"><option>claude</option><option>codex</option><option>gemini</option><option>copilot</option></select>
<input id="emp-model" placeholder="Model" style="width:140px">
<input id="emp-role" placeholder="Role" style="width:140px">
<button onclick="addEmp()">Add</button>
</div>
<table><thead><tr><th>Name</th><th>CLI</th><th>Model</th><th>Role</th><th></th></tr></thead><tbody id="emp-list"></tbody></table>
<h2>Quota</h2>
<div class="form-row">
<label>Daily limit: <input id="q-daily" type="number" style="width:80px"></label>
<label>Hourly limit: <input id="q-hourly" type="number" style="width:80px"></label>
<button onclick="saveQuota()">Save</button>
</div>
<h2>Jobs</h2>
<table><thead><tr><th>ID</th><th>CLI</th><th>Status</th><th>Phase</th><th>Created</th><th></th></tr></thead><tbody id="job-list"></tbody></table>
<div id="job-detail"><h2>Job Detail</h2><pre id="job-detail-content"></pre></div>
<script>
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
async function loadAll(){
  const [status,emps,jobs,quota]=await Promise.all([
    fetch('/api/status').then(r=>r.json()),
    fetch('/api/employees').then(r=>r.json()),
    fetch('/api/jobs').then(r=>r.json()),
    fetch('/api/quota').then(r=>r.json()).catch(()=>({})),
  ]);
  const sd=document.getElementById('stats');
  sd.innerHTML='';
  [{v:status.employees,l:'Employees'},{v:status.activeJobs,l:'Active Jobs'},{v:status.queueDepth,l:'Queue'}].forEach(s=>{
    const sp=document.createElement('span');sp.className='stat';
    sp.innerHTML='<span class="stat-val">'+esc(String(s.v))+'</span><br><span class="stat-label">'+esc(s.l)+'</span>';
    sd.appendChild(sp);
  });
  const el=document.getElementById('emp-list');el.innerHTML='';
  emps.forEach(e=>{
    const tr=document.createElement('tr');
    [e.name,e.cli,e.model||'-',e.role||'-'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td)});
    const td=document.createElement('td');const btn=document.createElement('button');btn.className='danger';btn.textContent='Del';
    btn.onclick=()=>delEmp(e.name);td.appendChild(btn);tr.appendChild(td);el.appendChild(tr);
  });
  const jl=document.getElementById('job-list');jl.innerHTML='';
  jobs.slice(0,20).forEach(j=>{
    const tr=document.createElement('tr');
    const idTd=document.createElement('td');idTd.style.fontFamily='monospace';idTd.style.fontSize='.8rem';idTd.textContent=j.id.slice(0,16);tr.appendChild(idTd);
    const cliTd=document.createElement('td');cliTd.textContent=j.cli;tr.appendChild(cliTd);
    const stTd=document.createElement('td');const badge=document.createElement('span');badge.className='badge '+j.status;badge.textContent=j.status;stTd.appendChild(badge);tr.appendChild(stTd);
    const phTd=document.createElement('td');phTd.textContent=j.phase||'-';tr.appendChild(phTd);
    const dtTd=document.createElement('td');dtTd.textContent=new Date(j.createdAt).toLocaleTimeString();tr.appendChild(dtTd);
    const actTd=document.createElement('td');const ib=document.createElement('button');ib.textContent='Inspect';ib.onclick=()=>inspectJob(j.id);actTd.appendChild(ib);tr.appendChild(actTd);
    jl.appendChild(tr);
  });
  if(quota.dailyLimit)document.getElementById('q-daily').value=quota.dailyLimit;
  if(quota.hourlyLimit)document.getElementById('q-hourly').value=quota.hourlyLimit;
}
async function addEmp(){
  const n=document.getElementById('emp-name').value.trim();if(!n)return;
  await fetch('/api/employees',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,cli:document.getElementById('emp-cli').value,model:document.getElementById('emp-model').value||null,role:document.getElementById('emp-role').value||null})});
  document.getElementById('emp-name').value='';loadAll();
}
async function delEmp(name){await fetch('/api/employees/'+encodeURIComponent(name),{method:'DELETE'});loadAll()}
async function saveQuota(){
  await fetch('/api/quota',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({dailyLimit:parseInt(document.getElementById('q-daily').value)||0,hourlyLimit:parseInt(document.getElementById('q-hourly').value)||0})});
}
async function inspectJob(id){
  const data=await fetch('/api/jobs/'+encodeURIComponent(id)).then(r=>r.json());
  document.getElementById('job-detail').style.display='block';
  document.getElementById('job-detail-content').textContent=JSON.stringify(data,null,2);
}
loadAll();setInterval(loadAll,5000);
</script>
</body>
</html>`;
}
```

---

## MODIFY: `src/registry/types.ts` — QuotaConfig

### Append after ProgressEvent
```typescript
export interface QuotaConfig {
    dailyLimit: number;
    hourlyLimit: number;
    updatedAt: string;
}
```

---

## MODIFY: `src/registry/db.ts`

### In `initDb()`, append to schema exec:
```sql
CREATE TABLE IF NOT EXISTS quota_config (
    key TEXT PRIMARY KEY DEFAULT 'default',
    daily_limit INTEGER NOT NULL DEFAULT 0,
    hourly_limit INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### New imports (top of file)
```typescript
import type { Employee, EmployeeInput, QuotaConfig } from './types.js';
```

### New exports (end of file)
```typescript
export function getQuota(): QuotaConfig {
    const d = getDb();
    const row = d.prepare(
        "SELECT daily_limit as dailyLimit, hourly_limit as hourlyLimit, updated_at as updatedAt FROM quota_config WHERE key = 'default'"
    ).get() as { dailyLimit: number; hourlyLimit: number; updatedAt: string } | undefined;
    return row ?? { dailyLimit: 0, hourlyLimit: 0, updatedAt: '' };
}

export function setQuota(config: Partial<QuotaConfig>): void {
    const d = getDb();
    d.prepare(
        "INSERT INTO quota_config (key, daily_limit, hourly_limit) VALUES ('default', ?, ?) ON CONFLICT(key) DO UPDATE SET daily_limit = ?, hourly_limit = ?, updated_at = datetime('now')"
    ).run(config.dailyLimit ?? 0, config.hourlyLimit ?? 0, config.dailyLimit ?? 0, config.hourlyLimit ?? 0);
}
```

### registry/index.ts re-export update
```typescript
export { initDb, closeDb, addEmployee, removeEmployee, listEmployees, findEmployee, getQuota, setQuota } from './db.js';
```
