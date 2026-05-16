import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { SpawnOptions, SpawnResult } from '../registry/types.js';
import { buildArgs } from './args.js';
import { CodexAppClient } from './codex-app-client.js';
import { mapCodexAppNotification } from './codex-app-events.js';
import { createJob, updateJob, completeJob, cancelJob, appendJobLog, closeJobStream, readJobMeta, listRunningJobs, isProcessAlive } from './jobs.js';
import { terminateProcessTree, scheduleForceKill } from './process-kill.js';
import { resolveCliPath } from './preflight.js';

export const bus = new EventEmitter();

const MAX_STDOUT_BYTES = 10 * 1024 * 1024;
const MAX_STDERR_BYTES = 1 * 1024 * 1024;

const activeJobs = new Map<string, ChildProcess>();
const lineBuffers = new Map<string, string>();
const cancelledJobs = new Set<string>();

function isBrokenPipeError(err: unknown): boolean {
    const code = (err as { code?: unknown })?.code;
    return code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED';
}

export function isAgentBusy(): boolean {
    if (activeJobs.size > 0) return true;
    const persisted = listRunningJobs();
    return persisted.some(j => j.pid != null && isProcessAlive(j.pid));
}

export function getActiveJobs(): ReadonlyMap<string, ChildProcess> {
    return activeJobs;
}

export function spawnAgent(prompt: string, opts: SpawnOptions = {}): { jobId: string; result: Promise<SpawnResult> } {
    const cli = opts.cli ?? 'claude';

    if (cli === 'codex-app') {
        return spawnCodexApp(prompt, opts);
    }

    const cliPath = resolveCliPath(cli);
    const { args, stdinPrompt } = buildArgs(cli, prompt, opts);
    const env = { ...process.env, ...opts.env };

    const job = createJob(cli, prompt, opts.model);
    lineBuffers.set(job.id, '');
    let detectedSessionId: string | undefined;

    const result = new Promise<SpawnResult>((resolve, reject) => {
        try {
            const child = spawn(cliPath, args, {
                cwd: opts.cwd ?? process.cwd(),
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: process.platform !== 'win32',
            });

            activeJobs.set(job.id, child);
            updateJob(job.id, { pid: child.pid ?? null });
            bus.emit('agent_start', { cli, pid: child.pid, jobId: job.id });

            let stdout = '';
            let stderr = '';
            let stdoutBytes = 0;
            let stderrBytes = 0;
            let settled = false;
            const startTime = Date.now();

            child.stdout?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                stdoutBytes += chunk.length;
                if (stdoutBytes <= MAX_STDOUT_BYTES) {
                    stdout += text;
                } else if (stdoutBytes - chunk.length <= MAX_STDOUT_BYTES) {
                    stdout += '\n[ome] output truncated at 10MB — full log in job NDJSON';
                }

                let buf = (lineBuffers.get(job.id) ?? '') + text;
                let nlIdx = buf.indexOf('\n');
                while (nlIdx !== -1) {
                    const line = buf.slice(0, nlIdx).trim();
                    buf = buf.slice(nlIdx + 1);
                    if (line) {
                        if (!detectedSessionId) {
                            try {
                                const j = JSON.parse(line);
                                detectedSessionId = extractSessionId(cli, j);
                            } catch { /* not JSON */ }
                        }
                        appendJobLog(job.id, line);
                        bus.emit('job_log', { jobId: job.id, line });
                    }
                    nlIdx = buf.indexOf('\n');
                }
                lineBuffers.set(job.id, buf);

                opts.onStdout?.(text);
            });

            child.stderr?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                stderrBytes += chunk.length;
                if (stderrBytes <= MAX_STDERR_BYTES) {
                    stderr += text;
                }
                opts.onStderr?.(text);
            });

            const timer = opts.timeout
                ? setTimeout(() => {
                    killJob(job.id, 'timeout');
                }, opts.timeout)
                : null;

            const settle = (code: number) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                const remaining = (lineBuffers.get(job.id) ?? '').trim();
                if (remaining) {
                    appendJobLog(job.id, remaining);
                    bus.emit('job_log', { jobId: job.id, line: remaining });
                }
                lineBuffers.delete(job.id);
                activeJobs.delete(job.id);
                closeJobStream(job.id);
                if (cancelledJobs.has(job.id)) {
                    cancelledJobs.delete(job.id);
                    cancelJob(job.id);
                } else {
                    completeJob(job.id, code);
                }
            };

            child.on('close', (code) => {
                settle(code ?? 1);
                bus.emit('agent_done', { cli, code, pid: child.pid, jobId: job.id });
                resolve({
                    text: stdout,
                    code: code ?? 1,
                    jobId: job.id,
                    sessionId: detectedSessionId,
                    stderr: stderr || undefined,
                    durationMs: Date.now() - startTime,
                });
            });

            child.on('error', (err) => {
                settle(1);
                bus.emit('agent_error', { cli, error: err.message, jobId: job.id });
                reject(err);
            });

            child.stdin?.on('error', (err) => {
                if (!isBrokenPipeError(err)) {
                    appendJobLog(job.id, `[stdin:error] ${err.message}\n`);
                }
            });

            if (stdinPrompt && child.stdin) {
                try {
                    child.stdin.write(prompt);
                } catch (err) {
                    if (!isBrokenPipeError(err)) throw err;
                }
            }
            try {
                child.stdin?.end();
            } catch (err) {
                if (!isBrokenPipeError(err)) throw err;
            }
        } catch (err) {
            lineBuffers.delete(job.id);
            completeJob(job.id, 1);
            reject(err);
        }
    });

    return { jobId: job.id, result };
}

export function extractSessionId(cli: string, event: unknown): string | undefined {
    if (!isRecord(event)) return undefined;

    if (cli === 'grok') {
        return String(event['type'] ?? '') === 'end'
            ? firstString(event, ['sessionId', 'session_id'])
            : undefined;
    }

    const common = firstString(event, ['session_id', 'sessionId', 'conversation_id', 'conversationId']);
    if (common) return common;

    if (cli === 'codex') {
        return firstString(event, ['thread_id', 'threadId']);
    }
    if (cli === 'opencode') {
        return firstString(event, ['sessionID', 'sessionId']);
    }
    return undefined;
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === 'string' && value) return value;
    }
    return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

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
        let settled = false;
        const seenCodexAppEvents = new Set<string>();
        const startTime = Date.now();

        const settle = (code: number) => {
            if (settled) return;
            settled = true;
            closeJobStream(job.id);
            activeJobs.delete(job.id);
            completeJob(job.id, code);
            bus.emit('agent_done', { cli: 'codex-app', code, pid: client.pid, jobId: job.id });
            resolve({
                text: fullText,
                code,
                jobId: job.id,
                sessionId: detectedSessionId,
                stderr: client.stderr || undefined,
                durationMs: Date.now() - startTime,
            });
        };

        client.on('notification', (method: string, params: Record<string, unknown>) => {
            const mapped = mapCodexAppNotification(method, params);
            if (!mapped) return;
            if (mapped.event.dedupeKey) {
                if (seenCodexAppEvents.has(mapped.event.dedupeKey)) return;
                seenCodexAppEvents.add(mapped.event.dedupeKey);
            }

            if (mapped.sessionId && !detectedSessionId) {
                detectedSessionId = mapped.sessionId;
            }

            const line = JSON.stringify(mapped.event);
            appendJobLog(job.id, line);
            bus.emit('job_log', { jobId: job.id, line });

            if (mapped.event.type === 'assistant') {
                fullText += mapped.event.fullMessage ?? mapped.event.message;
            }

            opts.onStdout?.(line + '\n');

            if (mapped.flushThinking && method === 'turn/completed') {
                client.closeGracefully().catch(() => {});
            }
        });

        client.on('stderr', (text: string) => opts.onStderr?.(text));

        client.on('error', (err: Error) => {
            if (!settled) {
                settle(1);
                bus.emit('agent_error', { cli: 'codex-app', error: err.message, jobId: job.id });
                reject(err);
            }
        });

        client.on('exit', (code: number | null) => {
            settle(code ?? 1);
        });

        try {
            client.spawn();
            if (client.proc) {
                activeJobs.set(job.id, client.proc);
            }
            updateJob(job.id, { pid: client.pid ?? null });
            bus.emit('agent_start', { cli: 'codex-app', pid: client.pid, jobId: job.id });

            (async () => {
                try {
                    await client.initialize();
                    if (opts.sessionId) {
                        await client.resumeThread(opts.sessionId);
                    } else {
                        await client.startThread(opts.systemPrompt);
                    }
                    await client.startTurn(prompt);
                } catch (err) {
                    if (!settled) {
                        client.kill();
                        reject(err instanceof Error ? err : new Error(String(err)));
                    }
                }
            })();

            if (opts.timeout) {
                setTimeout(() => {
                    if (!settled) client.kill();
                }, opts.timeout);
            }
        } catch (err) {
            settle(1);
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });

    return { jobId: job.id, result };
}

export function killAllJobs(reason = 'user'): number {
    let killed = 0;
    for (const jobId of [...activeJobs.keys()]) {
        if (killJob(jobId, reason)) killed++;
    }
    return killed;
}

export function killJob(jobId: string, reason = 'user'): boolean {
    const proc = activeJobs.get(jobId);
    if (!proc) return false;
    bus.emit('agent_kill', { reason, pid: proc.pid, jobId });
    cancelledJobs.add(jobId);
    updateJob(jobId, { status: 'cancelling', phase: 'cancelling' });
    terminateProcessTree(proc.pid);
    scheduleForceKill(proc.pid);
    return true;
}

export function killJobByPid(jobId: string, reason = 'user'): boolean {
    const meta = readJobMeta(jobId);
    if (!meta || !meta.pid) return false;
    if (meta.status !== 'running' && meta.status !== 'cancelling') return false;

    const kill = terminateProcessTree(meta.pid);
    if (!kill.delivered) {
        const fresh = readJobMeta(jobId);
        if (!fresh || (fresh.status !== 'running' && fresh.status !== 'cancelling')) return false;
        completeJob(jobId, 1);
        return true;
    }

    scheduleForceKill(meta.pid);
    if (reason === 'user') {
        cancelJob(jobId);
    } else {
        completeJob(jobId, 1);
    }
    return true;
}

export function waitForProcessEnd(timeoutMs = 3000): Promise<void> {
    if (activeJobs.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
        const check = setInterval(() => {
            if (activeJobs.size === 0) { clearInterval(check); resolve(); }
        }, 50);
        setTimeout(() => { clearInterval(check); resolve(); }, timeoutMs);
    });
}
