import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { SpawnOptions, SpawnResult } from '../registry/types.js';
import { buildArgs } from './args.js';
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
                                const sid = j.session_id ?? j.sessionId ?? j.conversation_id;
                                if (typeof sid === 'string' && sid) detectedSessionId = sid;
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
