import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { resolveCliPath } from './preflight.js';

export interface CodexAppClientOptions {
    model?: string;
    effort?: string;
    cwd?: string;
    env?: Record<string, string>;
}

export class CodexAppClient extends EventEmitter {
    proc: ChildProcess | null = null;
    threadId: string | null = null;

    private opts: CodexAppClientOptions;
    private nextId = 1;
    private pending = new Map<number, {
        resolve: (result: unknown) => void;
        reject: (err: Error) => void;
    }>();
    private rl: ReadlineInterface | null = null;
    private stderrBuf = '';
    private cleaned = false;

    constructor(opts: CodexAppClientOptions = {}) {
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
        this.rl.on('error', () => {});

        this.proc.stderr?.on('data', (chunk: Buffer) => {
            this.stderrBuf += chunk.toString();
            this.emit('stderr', chunk.toString());
        });

        this.proc.on('error', (err) => this.emit('error', err));
        this.proc.on('exit', (code, signal) => {
            this.rejectAllPending('Process exited');
            this.emit('exit', code, signal);
        });
    }

    async initialize(): Promise<unknown> {
        const result = await this.request('initialize', {
            clientInfo: {
                name: 'ome_codex_app_client',
                title: null,
                version: '1.0.0',
            },
            capabilities: {
                experimentalApi: true,
                optOutNotificationMethods: [
                    'remoteControl/status/changed',
                    'mcpServer/startupStatus/updated',
                ],
            },
        });
        this.notify('initialized', {});
        return result;
    }

    async startThread(instructions?: string): Promise<string> {
        const cwd = this.opts.cwd ?? process.cwd();
        const result = await this.request('thread/start', {
            model: this.opts.model ?? 'gpt-5.4',
            approvalPolicy: 'never',
            sandbox: 'danger-full-access',
            cwd,
            ...(instructions ? { baseInstructions: instructions } : {}),
        }) as { thread: { id: string } };
        this.threadId = result.thread.id;
        return this.threadId;
    }

    async resumeThread(threadId: string): Promise<string> {
        const cwd = this.opts.cwd ?? process.cwd();
        const result = await this.request('thread/resume', {
            threadId,
            model: this.opts.model ?? 'gpt-5.4',
            approvalPolicy: 'never',
            sandbox: 'danger-full-access',
            cwd,
            excludeTurns: true,
        }) as { thread: { id: string } };
        this.threadId = result.thread.id;
        return this.threadId;
    }

    async startTurn(prompt: string): Promise<void> {
        if (!this.threadId) throw new Error('No active thread');
        await this.request('turn/start', {
            threadId: this.threadId,
            input: [{
                type: 'text' as const,
                text: prompt,
                text_elements: [],
            }],
            ...(this.opts.effort ? { effort: this.opts.effort } : {}),
        });
    }

    async closeGracefully(): Promise<void> {
        try {
            if (this.threadId) {
                await this.request('thread/unsubscribe', { threadId: this.threadId }).catch(() => {});
            }
        } catch { /* best effort */ }
        this.proc?.stdin?.end();
        await new Promise<void>((resolve) => {
            const timer = setTimeout(() => { this.kill(); resolve(); }, 3000);
            if (this.proc) {
                this.proc.once('exit', () => { clearTimeout(timer); resolve(); });
            } else {
                clearTimeout(timer); resolve();
            }
        });
    }

    kill(): void {
        if (this.proc && !this.proc.killed) {
            this.proc.kill('SIGTERM');
            setTimeout(() => {
                if (this.proc && !this.proc.killed) this.proc.kill('SIGKILL');
            }, 2000);
        }
    }

    cleanup(): void {
        if (this.cleaned) return;
        this.cleaned = true;
        this.rejectAllPending('Client cleanup');
        this.rl?.close();
        this.rl = null;
        this.removeAllListeners();
    }

    get pid(): number | undefined {
        return this.proc?.pid;
    }

    get stderr(): string {
        return this.stderrBuf;
    }

    private rejectAllPending(reason: string): void {
        if (this.pending.size === 0) return;
        const err = new Error(reason);
        for (const handler of this.pending.values()) handler.reject(err);
        this.pending.clear();
    }

    private request(method: string, params: Record<string, unknown>): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const id = this.nextId++;
            this.pending.set(id, { resolve, reject });
            if (!this.trySend({ jsonrpc: '2.0', id, method, params })) {
                this.pending.delete(id);
                reject(new Error('stdin not writable'));
            }
        });
    }

    private notify(method: string, params: Record<string, unknown>): void {
        this.trySend({ jsonrpc: '2.0', method, params });
    }

    private trySend(msg: Record<string, unknown>): boolean {
        const stdin = this.proc?.stdin;
        if (!stdin || stdin.destroyed || stdin.writableEnded || !stdin.writable) return false;
        try {
            stdin.write(JSON.stringify(msg) + '\n');
            return true;
        } catch {
            return false;
        }
    }

    private handleLine(line: string): void {
        if (!line.trim()) return;
        try {
            const msg = JSON.parse(line) as Record<string, unknown>;

            // JSON-RPC response (has id matching a pending request)
            if (msg['id'] != null && this.pending.has(msg['id'] as number)) {
                const handler = this.pending.get(msg['id'] as number)!;
                this.pending.delete(msg['id'] as number);
                if (msg['error']) {
                    const err = msg['error'] as Record<string, unknown>;
                    handler.reject(new Error(
                        `JSON-RPC error ${err['code']}: ${err['message']}`,
                    ));
                } else {
                    handler.resolve(msg['result']);
                }
                return;
            }

            // Server request (has both id and method — needs a response)
            if (msg['id'] != null && msg['method']) {
                this.handleServerRequest(
                    msg['id'] as number | string,
                    String(msg['method']),
                    (msg['params'] ?? {}) as Record<string, unknown>,
                );
                return;
            }

            // Notification (has method, no id)
            if (msg['method']) {
                this.emit('notification', String(msg['method']),
                    (msg['params'] ?? {}) as Record<string, unknown>);
                return;
            }
        } catch {
            this.emit('parse_error', line);
        }
    }

    private handleServerRequest(id: number | string, method: string, _params: Record<string, unknown>): void {
        this.emit('server_request', method, _params, id);

        const declineResponses: Record<string, unknown> = {
            'item/commandExecution/requestApproval': { decision: 'decline' },
            'item/fileChange/requestApproval': { decision: 'decline' },
            'item/permissions/requestApproval': { decision: 'decline' },
            'mcpServer/elicitation/request': { action: 'decline', content: null },
            'item/tool/requestUserInput': { answers: {} },
            'execCommandApproval': { decision: 'denied' },
            'applyPatchApproval': { decision: 'denied' },
        };

        const result = declineResponses[method] ?? {};
        this.trySend({ jsonrpc: '2.0', id, result });
    }
}
