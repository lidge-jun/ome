# P4 — Codex App Client Module

Create `src/spawn/codex-app-client.ts` — a JSON-RPC 2.0 stdio client for `codex app-server`.

## Why a Separate Module

Unlike all other providers that output NDJSON lines, Codex App uses **JSON-RPC 2.0** over stdio:
- Boss sends JSON-RPC requests via stdin
- Worker sends JSON-RPC responses and notifications via stdout
- Communication is newline-delimited JSON, but the protocol is request/response, not fire-and-forget

This cannot be handled by the existing `spawnAgent()` flow which assumes:
1. Write prompt to stdin once → close stdin → read NDJSON from stdout → done
2. Events are independent lines, not request/response pairs

## Reference (cli-jaw)

```
cli-jaw file: src/agent/codex-app-client.ts (259 lines)
Spawn: codex app-server --listen stdio://
Protocol: JSON-RPC 2.0 (request-id matching)
Lifecycle: spawn → initialize → startThread → startTurn → closeGracefully
```

## New File: `src/spawn/codex-app-client.ts` (~200 lines)

```typescript
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { resolveCliPath } from './preflight.js';

export interface CodexAppOptions {
    model?: string;
    effort?: string;
    cwd?: string;
    env?: Record<string, string>;
}

export interface CodexAppNotification {
    method: string;
    params: Record<string, unknown>;
}

export class CodexAppClient extends EventEmitter {
    private proc: ChildProcess | null = null;
    private rl: Interface | null = null;
    private nextId = 1;
    private pending = new Map<number, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    }>();
    private opts: CodexAppOptions;
    private stderrBuf = '';

    constructor(opts: CodexAppOptions = {}) {
        super();
        this.opts = opts;
    }

    spawn(): void {
        const binary = resolveCliPath('codex-app');
        this.proc = spawn(binary, ['app-server', '--listen', 'stdio://'], {
            cwd: this.opts.cwd ?? process.cwd(),
            env: { ...process.env, ...this.opts.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.rl = createInterface({ input: this.proc.stdout! });
        this.rl.on('line', (line) => this.handleLine(line));

        this.proc.stderr?.on('data', (chunk: Buffer) => {
            this.stderrBuf += chunk.toString();
            this.emit('stderr', chunk.toString());
        });

        this.proc.on('error', (err) => this.emit('error', err));
        this.proc.on('close', (code) => this.emit('close', code));
    }

    async initialize(): Promise<unknown> {
        return this.request('initialize', {});
    }

    async startThread(instructions?: string): Promise<unknown> {
        const params: Record<string, unknown> = {
            model: this.opts.model ?? 'gpt-5.4',
            approvalPolicy: 'never',
        };
        if (this.opts.effort) params.reasoningEffort = this.opts.effort;
        if (instructions) params.instructions = instructions;
        return this.request('thread/start', params);
    }

    async resumeThread(threadId: string): Promise<unknown> {
        return this.request('thread/resume', {
            threadId,
            excludeTurns: true,
        });
    }

    async startTurn(prompt: string): Promise<unknown> {
        return this.request('turn/start', {
            input: [{ role: 'user', content: prompt }],
        });
    }

    async interruptTurn(): Promise<void> {
        await this.request('turn/interrupt', {});
    }

    async closeGracefully(): Promise<void> {
        try {
            await this.request('thread/unsubscribe', {});
        } catch { /* ignore if already closed */ }
        this.proc?.stdin?.end();
    }

    kill(): void {
        if (this.proc?.pid) {
            this.proc.kill('SIGTERM');
            setTimeout(() => {
                try { this.proc?.kill('SIGKILL'); } catch { /* already dead */ }
            }, 3000);
        }
    }

    get pid(): number | undefined {
        return this.proc?.pid;
    }

    get stderr(): string {
        return this.stderrBuf;
    }

    private request(method: string, params: Record<string, unknown>): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const id = this.nextId++;
            this.pending.set(id, { resolve, reject });
            const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
            try {
                this.proc!.stdin!.write(msg + '\n');
            } catch (err) {
                this.pending.delete(id);
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        });
    }

    private handleLine(raw: string): void {
        const trimmed = raw.trim();
        if (!trimmed) return;

        let msg: Record<string, unknown>;
        try { msg = JSON.parse(trimmed); } catch { return; }

        // JSON-RPC response (has id)
        if ('id' in msg && typeof msg['id'] === 'number') {
            const entry = this.pending.get(msg['id']);
            if (entry) {
                this.pending.delete(msg['id']);
                if (msg['error']) {
                    entry.reject(new Error(JSON.stringify(msg['error'])));
                } else {
                    entry.resolve(msg['result']);
                }
            }
            return;
        }

        // JSON-RPC notification (no id, has method)
        if ('method' in msg && typeof msg['method'] === 'string') {
            this.emit('notification', {
                method: msg['method'],
                params: (msg['params'] ?? {}) as Record<string, unknown>,
            });
            return;
        }

        // Lite notification (no "jsonrpc" field, just method+params)
        if (!('jsonrpc' in msg) && 'method' in msg) {
            this.emit('notification', {
                method: String(msg['method']),
                params: (msg['params'] ?? {}) as Record<string, unknown>,
            });
        }
    }
}
```

## Protocol Notes

1. **Request/Response matching**: Each request has a numeric `id`. The response with matching `id`
   resolves the pending Promise. Notifications have no `id`.

2. **Lite responses**: Codex app-server sometimes omits the `"jsonrpc"` field in notifications.
   The handler accepts both standard and lite formats.

3. **Lifecycle**: `spawn() → initialize() → startThread() → startTurn()` → listen for notifications
   → `closeGracefully()`. The client must call `closeGracefully()` before process exit to avoid
   zombie processes.

4. **Error propagation**: JSON-RPC errors are rejected with the error object stringified.
   Process-level errors are emitted as `'error'` events on the EventEmitter.

## Verification Gate

- Class instantiation and method signatures pass `tsc`
- `spawn()` creates a child process with correct args
- `request()` sends JSON-RPC 2.0 messages and resolves on response
- `handleLine()` routes responses to pending promises and notifications to EventEmitter
