import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { SpawnOptions, SpawnResult, AgentCli } from '../registry/types.js';
import { buildArgs } from './args.js';
import { createJob, updateJob, completeJob, cancelJob, appendJobLog, readJobMeta } from './jobs.js';
import { terminateProcessTree, scheduleForceKill } from './process-kill.js';

export const bus = new EventEmitter();

let activeProcess: ChildProcess | null = null;

const activeJobs = new Map<string, ChildProcess>();
const lineBuffers = new Map<string, string>();
const cancelledJobs = new Set<string>();

export function isAgentBusy(): boolean {
    return activeJobs.size > 0;
}

export function getActiveJobs(): Map<string, ChildProcess> {
    return activeJobs;
}

export function spawnAgent(prompt: string, opts: SpawnOptions = {}): { jobId: string; result: Promise<SpawnResult> } {
    const cli = opts.cli ?? 'claude';
    const cliPath = resolveCliPath(cli);
    const args = buildArgs(cli, prompt, opts);
    const env = { ...process.env, ...opts.env };

    const job = createJob(cli, prompt, opts.model);
    lineBuffers.set(job.id, '');

    const result = new Promise<SpawnResult>((resolve, reject) => {
        try {
            const child = spawn(cliPath, args, {
                cwd: opts.cwd ?? process.cwd(),
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            activeProcess = child;
            activeJobs.set(job.id, child);
            updateJob(job.id, { pid: child.pid ?? null });
            bus.emit('agent_start', { cli, pid: child.pid, jobId: job.id });

            let stdout = '';
            let stderr = '';
            let settled = false;

            child.stdout?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                stdout += text;

                let buf = (lineBuffers.get(job.id) ?? '') + text;
                let nlIdx = buf.indexOf('\n');
                while (nlIdx !== -1) {
                    const line = buf.slice(0, nlIdx).trim();
                    buf = buf.slice(nlIdx + 1);
                    if (line) {
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
                stderr += text;
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
                if (activeProcess === child) activeProcess = null;
                if (cancelledJobs.has(job.id)) {
                    cancelledJobs.delete(job.id);
                } else {
                    completeJob(job.id, code);
                }
            };

            child.on('close', (code) => {
                settle(code ?? 1);
                bus.emit('agent_done', { cli, code, pid: child.pid, jobId: job.id });
                resolve({ text: stdout, code: code ?? 1, jobId: job.id });
            });

            child.on('error', (err) => {
                settle(1);
                bus.emit('agent_error', { cli, error: err.message, jobId: job.id });
                reject(err);
            });

            child.stdin?.write(prompt);
            child.stdin?.end();
        } catch (err) {
            lineBuffers.delete(job.id);
            completeJob(job.id, 1);
            reject(err);
        }
    });

    return { jobId: job.id, result };
}

export function killAgent(reason = 'user'): boolean {
    if (!activeProcess) return false;
    bus.emit('agent_kill', { reason, pid: activeProcess.pid });
    const pid = activeProcess.pid;
    terminateProcessTree(pid);
    scheduleForceKill(pid);
    activeProcess = null;
    return true;
}

export function killJob(jobId: string, reason = 'user'): boolean {
    const proc = activeJobs.get(jobId);
    if (!proc) return false;
    bus.emit('agent_kill', { reason, pid: proc.pid, jobId });
    cancelledJobs.add(jobId);
    if (reason === 'user') {
        cancelJob(jobId);
    } else {
        completeJob(jobId, 1);
    }
    terminateProcessTree(proc.pid);
    scheduleForceKill(proc.pid);
    activeJobs.delete(jobId);
    lineBuffers.delete(jobId);
    return true;
}

export function killJobByPid(jobId: string, reason = 'user'): boolean {
    const meta = readJobMeta(jobId);
    if (!meta || !meta.pid) return false;
    if (meta.status !== 'running') return false;

    const kill = terminateProcessTree(meta.pid);
    if (!kill.delivered) {
        const fresh = readJobMeta(jobId);
        if (!fresh || fresh.status !== 'running') return false;
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
    if (!activeProcess) return Promise.resolve();
    return new Promise((resolve) => {
        const check = setInterval(() => {
            if (!activeProcess) { clearInterval(check); resolve(); }
        }, 50);
        setTimeout(() => { clearInterval(check); resolve(); }, timeoutMs);
    });
}

function resolveCliPath(cli: AgentCli): string {
    const known: Record<string, string> = {
        claude: 'claude',
        codex: 'codex',
        gemini: 'gemini',
        copilot: 'copilot',
        opencode: 'opencode',
    };
    return known[cli] ?? cli;
}
