# Patch 02 — Web API Auth & Error Sanitization

Fixes: S1 (no auth), S2 (job output exposed), S4 (innerHTML in dashboard), R5 (raw error leak)

## Problem

1. All `/api/*` routes accept mutations without auth
2. `ome web --host 0.0.0.0` advertised but exposes registry/quota/job data to network
3. Catch-all returns `err.message` → leaks SQLite errors, file paths
4. Dashboard uses `innerHTML` despite README claiming textContent-only

## Changes

### MODIFY `src/web/index.ts`

**a) Accept auth token, generate if not provided, print on startup:**

```diff
+import { randomBytes } from 'node:crypto';
+
 const DEFAULT_PORT = 7700;

-export function createServer(port = DEFAULT_PORT, host = '127.0.0.1'): ReturnType<typeof createHttpServer> {
+export interface ServerOptions {
+    port?: number;
+    host?: string;
+    authToken?: string;
+}
+
+export function createServer(opts: ServerOptions = {}): ReturnType<typeof createHttpServer> {
+    const port = opts.port ?? DEFAULT_PORT;
+    const host = opts.host ?? '127.0.0.1';
+    const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
+    const authToken = opts.authToken ?? (isLoopback ? null : randomBytes(24).toString('hex'));
+
     const server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
         const url = new URL(req.url ?? '/', `http://${host}:${port}`);

         if (url.pathname.startsWith('/api/')) {
+            if (authToken && !checkAuth(req, authToken)) {
+                res.writeHead(401, { 'Content-Type': 'application/json' });
+                res.end(JSON.stringify({ error: 'unauthorized' }));
+                return;
+            }
             handleApiRequest(req, res, url);
             return;
         }
         // ... dashboard html ...
     });

     server.listen(port, host, () => {
-        console.log(`OME dashboard: http://${host}:${port}`);
+        const base = `http://${host}:${port}`;
+        console.log(`OME dashboard: ${base}`);
+        if (authToken) console.log(`Auth token: ${authToken}`);
+        if (!isLoopback) console.log('⚠ Non-loopback bind: auth token required for API access');
     });

     return server;
 }
+
+function checkAuth(req: IncomingMessage, token: string): boolean {
+    const header = req.headers['authorization'] ?? '';
+    if (header === `Bearer ${token}`) return true;
+    const url = new URL(req.url ?? '/', 'http://localhost');
+    return url.searchParams.get('token') === token;
+}
```

**b) Block non-loopback without explicit --auth-token:**

The `authToken` logic above auto-generates for non-loopback. CLI passes `--auth-token` through.

### MODIFY `src/web/routes.ts`

**a) Sanitize error responses:**

```diff
     } catch (err) {
-        error(res, 500, err instanceof Error ? err.message : 'internal error');
+        const msg = err instanceof Error ? err.message : '';
+        if (msg.includes('UNIQUE constraint')) {
+            error(res, 409, 'already exists');
+        } else {
+            console.error('[ome-web]', err);
+            error(res, 500, 'internal error');
+        }
     }
```

**b) Add Host/Origin check for mutation routes:**

```diff
+const MUTATION_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
+
 export function handleApiRequest(req: IncomingMessage, res: ServerResponse, url: URL): void {
     const method = req.method ?? 'GET';
+    if (MUTATION_METHODS.has(method)) {
+        const origin = req.headers['origin'];
+        const host = req.headers['host'];
+        if (origin && host && !origin.includes(host)) {
+            error(res, 403, 'origin mismatch');
+            return;
+        }
+    }
     const path = url.pathname;
```

### MODIFY `src/web/dashboard.ts`

**Remove `innerHTML` usage — use DOM creation throughout:**

Line 68 `sd.innerHTML=''` → already safe (empty string).
Line 71 stat items use `innerHTML` with `esc()`:

```diff
-    sp.innerHTML='<span class="stat-val">'+esc(String(s.v))+'</span><br><span class="stat-label">'+esc(s.l)+'</span>';
+    const val=document.createElement('span');val.className='stat-val';val.textContent=String(s.v);
+    const br=document.createElement('br');
+    const lbl=document.createElement('span');lbl.className='stat-label';lbl.textContent=s.l;
+    sp.appendChild(val);sp.appendChild(br);sp.appendChild(lbl);
```

Line 74 `el.innerHTML=''` → replace with `el.replaceChildren()`.
Line 81 `jl.innerHTML=''` → replace with `jl.replaceChildren()`.

### MODIFY `src/cli/index.ts`

**Add `--auth-token` flag to `handleWeb()`:**

```diff
 function handleWeb(args: string[]): void {
     const { values } = parseArgs({
         args,
         options: {
             port: { type: 'string', default: '7700' },
             host: { type: 'string', default: '127.0.0.1' },
+            'auth-token': { type: 'string' },
         },
     });
     const port = parseInt(values.port!, 10);
-    const server = createServer(port, values.host!);
+    const server = createServer({
+        port,
+        host: values.host!,
+        authToken: values['auth-token'],
+    });
```

### NEW `tests/web/auth.test.ts`

Tests:
1. Loopback bind — no auth required for API
2. Non-loopback + auto-generated token — 401 without token, 200 with Bearer header
3. Token via `?token=` query param
4. Origin mismatch on POST → 403
5. Error sanitization — duplicate employee → 409 "already exists", not SQLite text
6. Error sanitization — unknown error → 500 "internal error"

### UPDATE `README.md`

- Add `--auth-token` to CLI reference
- Update security section: auth is now enforced, non-loopback auto-generates token
- Fix "textContent only" claim → now true after dashboard fix

## Exports Impact

- `createServer(port, host)` → `createServer(opts: ServerOptions)` — **breaking signature** (pre-1.0)
- New `ServerOptions` type exported from `src/web/index.ts`
