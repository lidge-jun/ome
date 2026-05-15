# P6 — Spawn Integration

Wire Grok (standard path) and Codex App (JSON-RPC client path) into `src/spawn/index.ts`.

## Current Flow (standard)

```
spawnAgent(prompt, opts)
  → buildArgs(cli, prompt, opts)           // get argv + stdinPrompt flag
  → spawn(cliPath, args)                   // child_process.spawn
  → NDJSON line parser on stdout           // parseLine() per line
  → extractSessionId() per JSON line       // session detection
  → settle on close/error                  // resolve SpawnResult
```

## Grok Integration (standard path — minimal changes)

Grok fits the existing flow perfectly. Only `extractSessionId()` needs a new case:

### 6.1 Add grok session ID extraction

**File:** `src/spawn/index.ts:176-188`

```diff
  export function extractSessionId(cli: string, event: unknown): string | undefined {
      if (!isRecord(event)) return undefined;
      const common = firstString(event, ['session_id', 'sessionId', 'conversation_id', 'conversationId']);
      if (common) return common;

      if (cli === 'codex') {
          return firstString(event, ['thread_id', 'threadId']);
      }
      if (cli === 'opencode') {
          return firstString(event, ['sessionID', 'sessionId']);
      }
+     if (cli === 'grok') {
+         if (String(event['type'] ?? '') === 'end') {
+             return firstString(event, ['sessionId', 'session_id']);
+         }
+     }
      return undefined;
  }
```

Grok only emits sessionId in the `end` event. We must gate on `type === 'end'` to avoid
false-positive matches from other events that might have a `sessionId`-like field.

## Codex App Integration (new branch)

Codex App cannot use the standard `spawn()` → NDJSON flow. It needs the `CodexAppClient`:

### 6.2 Add codex-app branch to `spawnAgent()`

The codex-app branch replaces the standard spawn with the JSON-RPC client lifecycle:

**File:** `src/spawn/index.ts` — modify `spawnAgent()` function

```diff
  export function spawnAgent(prompt: string, opts: SpawnOptions = {}): { jobId: string; result: Promise<SpawnResult> } {
      const cli = opts.cli ?? 'claude';
+
+     if (cli === 'codex-app') {
+         return spawnCodexApp(prompt, opts);
+     }
+
      const cliPath = resolveCliPath(cli);
      // ... existing flow unchanged
  }
```

### 6.3 New `spawnCodexApp()` function

Insert after `spawnAgent()`:

```typescript
import { CodexAppClient } from './codex-app-client.js';
import { mapCodexAppNotification } from './codex-app-events.js';

function spawnCodexApp(prompt: string, opts: SpawnOptions): { jobId: string; result: Promise<SpawnResult> } {
    const job = createJob('codex-app', prompt, opts.model);
    let detectedSessionId: string | undefined;

    const result = new Promise<SpawnResult>((resolve, reject) => {
        const client = new CodexAppClient({
            model: opts.model,
            cwd: opts.cwd,
            env: opts.env,
        });
        let fullText = '';
        const startTime = Date.now();

        client.on('notification', ({ method, params }: { method: string; params: Record<string, unknown> }) => {
            const mapped = mapCodexAppNotification(method, params);
            if (!mapped) return;

            if (mapped.sessionId && !detectedSessionId) {
                detectedSessionId = mapped.sessionId;
            }

            const line = JSON.stringify(mapped.event);
            appendJobLog(job.id, line);
            bus.emit('job_log', { jobId: job.id, line });

            if (mapped.event.type === 'assistant') {
                fullText += mapped.event.message;
            }

            opts.onStdout?.(line + '\n');
        });

        client.on('stderr', (text: string) => {
            opts.onStderr?.(text);
        });

        client.on('error', (err: Error) => {
            closeJobStream(job.id);
            completeJob(job.id, 1);
            activeJobs.delete(job.id);
            bus.emit('agent_error', { cli: 'codex-app', error: err.message, jobId: job.id });
            reject(err);
        });

        client.on('close', (code: number) => {
            closeJobStream(job.id);
            completeJob(job.id, code ?? 0);
            activeJobs.delete(job.id);
            bus.emit('agent_done', { cli: 'codex-app', code, pid: client.pid, jobId: job.id });
            resolve({
                text: fullText,
                code: code ?? 0,
                jobId: job.id,
                sessionId: detectedSessionId,
                stderr: client.stderr || undefined,
                durationMs: Date.now() - startTime,
            });
        });

        try {
            client.spawn();
            if (client.pid) {
                updateJob(job.id, { pid: client.pid });
            }
            bus.emit('agent_start', { cli: 'codex-app', pid: client.pid, jobId: job.id });

            // Async lifecycle — run in background
            (async () => {
                try {
                    await client.initialize();
                    if (opts.sessionId) {
                        await client.resumeThread(opts.sessionId);
                    } else {
                        await client.startThread(opts.systemPrompt);
                    }
                    await client.startTurn(prompt);
                    // turn/completed notification triggers resolve via close handler
                } catch (err) {
                    client.kill();
                    reject(err instanceof Error ? err : new Error(String(err)));
                }
            })();

            // Timeout
            if (opts.timeout) {
                setTimeout(() => {
                    client.kill();
                }, opts.timeout);
            }
        } catch (err) {
            completeJob(job.id, 1);
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });

    return { jobId: job.id, result };
}
```

## Design Decisions

1. **activeJobs map**: We don't store the `CodexAppClient` in `activeJobs` (which expects `ChildProcess`).
   Instead, `killJob()` works via PID from the job meta. The `CodexAppClient` wraps its own kill logic.

2. **Job logging**: Notifications are JSON-stringified and logged as job NDJSON lines, keeping
   the same observe/inspect flow working for codex-app jobs.

3. **Session resume**: If `opts.sessionId` is set, calls `resumeThread()` instead of `startThread()`.
   This matches cli-jaw's resume logic.

4. **Text accumulation**: Only `assistant` events contribute to `fullText`. Tool events are logged
   but not concatenated into the output text.

5. **Graceful shutdown**: The `turn/completed` notification from codex-app triggers the client's
   `closeGracefully()` → stdin close → process exits → `close` event → resolve. If the server
   doesn't exit cleanly, the timeout kills it.

## Verification Gate

- `spawnAgent('hello', { cli: 'grok' })` → standard flow with grok args
- `spawnAgent('hello', { cli: 'codex-app' })` → JSON-RPC client flow
- `extractSessionId('grok', { type: 'end', sessionId: 'abc' })` → `'abc'`
- `extractSessionId('grok', { type: 'text', sessionId: 'abc' })` → `undefined` (gated on end)
- Job logging works for both new providers
- killJob works for codex-app (via PID)
