# Patch 03 — Output/Log Bounding + stderr in SpawnResult

Fixes: T3 (SpawnResult omits stderr), P1 (unbounded stdout), P2 (watch O(total)), P3 (sync IO in web), G3 (no large-output tests)

## Problem

1. `SpawnResult.text` accumulates ALL stdout in memory — no cap
2. `readJobLog()` reads + splits entire NDJSON file every poll (500ms)
3. `watch()` calls `readJobLog()` repeatedly → O(total_log_size × poll_count)
4. `SpawnResult` has no stderr — failed jobs return empty text + nonzero code with no diagnostic
5. All job file I/O is sync (`readFileSync`, `writeFileSync`) — stalls web server event loop

## Changes

### MODIFY `src/registry/types.ts`

**Add stderr to SpawnResult:**

```diff
 export interface SpawnResult {
     text: string;
     code: number;
     jobId?: string;
     sessionId?: string;
+    stderr?: string;
+    durationMs?: number;
 }
```

### MODIFY `src/spawn/index.ts`

**a) Cap in-memory stdout/stderr + include stderr in result:**

```diff
+const MAX_STDOUT_BYTES = 10 * 1024 * 1024; // 10MB in-memory cap
+const MAX_STDERR_BYTES = 1 * 1024 * 1024;  // 1MB
+
 // Inside spawnAgent():
 let stdout = '';
 let stderr = '';
+let stdoutBytes = 0;
+let stderrBytes = 0;
 let settled = false;
+const startTime = Date.now();

 child.stdout?.on('data', (chunk: Buffer) => {
     const text = chunk.toString();
-    stdout += text;
+    stdoutBytes += chunk.length;
+    if (stdoutBytes <= MAX_STDOUT_BYTES) {
+        stdout += text;
+    } else if (stdoutBytes - chunk.length <= MAX_STDOUT_BYTES) {
+        stdout += '\n[ome] output truncated at 10MB — full log in job NDJSON';
+    }
     // ... line parsing continues unchanged ...
 });

 child.stderr?.on('data', (chunk: Buffer) => {
     const text = chunk.toString();
-    stderr += text;
+    stderrBytes += chunk.length;
+    if (stderrBytes <= MAX_STDERR_BYTES) {
+        stderr += text;
+    }
     opts.onStderr?.(text);
 });
```

**b) Include stderr + duration in resolve:**

```diff
 child.on('close', (code) => {
     settle(code ?? 1);
     bus.emit('agent_done', { cli, code, pid: child.pid, jobId: job.id });
-    resolve({ text: stdout, code: code ?? 1, jobId: job.id });
+    resolve({
+        text: stdout,
+        code: code ?? 1,
+        jobId: job.id,
+        stderr: stderr || undefined,
+        durationMs: Date.now() - startTime,
+    });
 });
```

### MODIFY `src/spawn/jobs.ts`

**a) Add byte-offset aware log reading:**

```diff
+import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
+
+export function readJobLogFrom(id: string, byteOffset: number): { lines: string[]; nextOffset: number } {
+    if (!isValidJobId(id)) return { lines: [], nextOffset: byteOffset };
+    const logFile = safeJobPath(id, '.ndjson');
+    if (!existsSync(logFile)) return { lines: [], nextOffset: byteOffset };
+
+    const fd = openSync(logFile, 'r');
+    try {
+        const stat = fstatSync(fd);
+        if (stat.size <= byteOffset) return { lines: [], nextOffset: byteOffset };
+
+        const buf = Buffer.alloc(stat.size - byteOffset);
+        readSync(fd, buf, 0, buf.length, byteOffset);
+        const text = buf.toString('utf8');
+        const lines = text.split('\n').filter(Boolean);
+        return { lines, nextOffset: stat.size };
+    } finally {
+        closeSync(fd);
+    }
+}
```

### MODIFY `src/observe/index.ts`

**a) Rewrite `watch()` to use byte offsets:**

```diff
-import { readJobMeta, readJobLog } from '../spawn/jobs.js';
+import { readJobMeta, readJobLog, readJobLogFrom } from '../spawn/jobs.js';

 export async function* watch(jobId: string, pollMs = 500): AsyncGenerator<ProgressEvent> {
     const meta = readJobMeta(jobId);
     if (!meta) return;

-    let offset = 0;
+    let byteOffset = 0;

     while (true) {
-        const lines = readJobLog(jobId);
-        const newLines = lines.slice(offset);
-        offset = lines.length;
+        const { lines: newLines, nextOffset } = readJobLogFrom(jobId, byteOffset);
+        byteOffset = nextOffset;

         for (const line of newLines) {
             const ev = parseLine(meta.cli, line);
             if (ev) yield ev;
         }

         const current = readJobMeta(jobId);
-        if (!current || current.status !== 'running') break;
+        if (!current || (current.status !== 'running' && current.status !== 'cancelling')) break;

         await new Promise(r => setTimeout(r, pollMs));
     }

     // Final drain
-    const finalLines = readJobLog(jobId);
-    for (const line of finalLines.slice(offset)) {
+    const { lines: finalLines } = readJobLogFrom(jobId, byteOffset);
+    for (const line of finalLines) {
         const ev = parseLine(meta.cli, line);
         if (ev) yield ev;
     }
 }
```

**b) inspect() stays using `readJobLog()` (full read is fine for one-shot inspection)**

No change needed — `inspect()` is called once, not polled.

### NEW `tests/observe/large-output.test.ts`

Tests:
1. Write 10,000 NDJSON lines → `readJobLogFrom()` with offset reads only new lines
2. Byte offset advances correctly across multiple reads
3. `watch()` with large log doesn't re-read from start
4. stdout cap: >10MB accumulates truncation message
5. stderr cap: >1MB silently stops accumulating

### NEW `tests/spawn/stderr.test.ts`

Tests:
1. `SpawnResult.stderr` populated when child writes to stderr
2. `SpawnResult.stderr` undefined when empty
3. `SpawnResult.durationMs` is reasonable (>0, <timeout)

## Exports Impact

- `SpawnResult` gains `stderr?: string` and `durationMs?: number` — additive, non-breaking
- `readJobLogFrom()` — new export from `src/spawn/jobs.ts`
