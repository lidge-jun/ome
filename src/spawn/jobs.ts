import { mkdirSync, writeFileSync, writeSync, readFileSync, existsSync, readdirSync, unlinkSync, renameSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Job, JobStatus } from '../registry/types.js';

const MAX_JOBS = 50;
const JOB_ID_RE = /^job-[a-z0-9]+-[a-z0-9]+$/;

const jobFds = new Map<string, number>();

function jobsDir(): string {
    const dir = join(process.env['OME_HOME'] ?? join(homedir(), '.ome'), 'jobs');
    mkdirSync(dir, { recursive: true });
    return dir;
}

export function isValidJobId(id: string): boolean {
    return JOB_ID_RE.test(id) && !id.includes('..');
}

function safeJobPath(id: string, ext: string): string {
    if (!isValidJobId(id)) throw new Error(`Invalid job ID: ${id}`);
    return join(jobsDir(), `${basename(id)}${ext}`);
}

export function createJob(cli: string, prompt: string, model?: string): Job {
    const id = `job-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    const job: Job = {
        id,
        cli,
        prompt: prompt.slice(0, 200),
        model: model ?? null,
        status: 'running',
        phase: 'starting',
        pid: null,
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
    };
    writeJobMeta(id, job);
    const logPath = safeJobPath(id, '.ndjson');
    writeFileSync(logPath, '', 'utf8');
    jobFds.set(id, openSync(logPath, 'a'));
    pruneJobs();
    return job;
}

export function updateJob(id: string, patch: Partial<Job>): void {
    const meta = readJobMeta(id);
    if (!meta) return;
    const updated = { ...meta, ...patch, updatedAt: new Date().toISOString() };
    writeJobMeta(id, updated);
}

export function completeJob(id: string, code: number): void {
    updateJob(id, {
        status: code === 0 ? 'completed' : 'failed',
        phase: code === 0 ? 'done' : 'failed',
        pid: null,
        completedAt: new Date().toISOString(),
    });
}

export function cancelJob(id: string): void {
    updateJob(id, {
        status: 'cancelled',
        phase: 'cancelled',
        pid: null,
        completedAt: new Date().toISOString(),
    });
}

export function appendJobLog(id: string, line: string): void {
    if (!isValidJobId(id)) return;
    const fd = jobFds.get(id);
    if (fd != null) {
        const buf = Buffer.from(`${line}\n`, 'utf8');
        writeSync(fd, buf);
        return;
    }
    const logFile = safeJobPath(id, '.ndjson');
    if (!existsSync(logFile)) return;
    const newFd = openSync(logFile, 'a');
    jobFds.set(id, newFd);
    writeSync(newFd, Buffer.from(`${line}\n`, 'utf8'));
}

export function closeJobStream(id: string): void {
    const fd = jobFds.get(id);
    if (fd != null) {
        try { closeSync(fd); } catch { /* already closed */ }
        jobFds.delete(id);
    }
}

export function readJobMeta(id: string): Job | null {
    if (!isValidJobId(id)) return null;
    const metaFile = safeJobPath(id, '.meta.json');
    if (!existsSync(metaFile)) return null;
    try { return JSON.parse(readFileSync(metaFile, 'utf8')); } catch { return null; }
}

export function readJobLog(id: string): string[] {
    if (!isValidJobId(id)) return [];
    const logFile = safeJobPath(id, '.ndjson');
    if (!existsSync(logFile)) return [];
    return readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
}

export function readJobLogFrom(id: string, byteOffset: number): { lines: string[]; nextOffset: number } {
    if (!isValidJobId(id)) return { lines: [], nextOffset: byteOffset };
    const logFile = safeJobPath(id, '.ndjson');
    if (!existsSync(logFile)) return { lines: [], nextOffset: byteOffset };

    const fd = openSync(logFile, 'r');
    try {
        const stat = fstatSync(fd);
        if (stat.size <= byteOffset) return { lines: [], nextOffset: byteOffset };

        const buf = Buffer.alloc(stat.size - byteOffset);
        readSync(fd, buf, 0, buf.length, byteOffset);
        const text = buf.toString('utf8');
        const lines = text.split('\n').filter(Boolean);
        return { lines, nextOffset: stat.size };
    } finally {
        closeSync(fd);
    }
}

export function listJobs(): Job[] {
    const dir = jobsDir();
    const files = readdirSync(dir).filter(f => f.endsWith('.meta.json'));
    const jobs: Job[] = [];
    for (const f of files) {
        try { jobs.push(JSON.parse(readFileSync(join(dir, f), 'utf8'))); } catch { /* skip corrupt */ }
    }
    return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listRunningJobs(): Job[] {
    return listJobs().filter(j => j.status === 'running');
}

export function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

export function reconcileStaleJobs(): number {
    const running = listRunningJobs();
    let reconciled = 0;
    for (const job of running) {
        if (!job.pid || !isProcessAlive(job.pid)) {
            updateJob(job.id, {
                status: 'failed',
                phase: 'abandoned',
                pid: null,
                completedAt: new Date().toISOString(),
            });
            reconciled++;
        }
    }
    return reconciled;
}

function pruneJobs(): void {
    const jobs = listJobs();
    const prunable = jobs.filter(j => j.status !== 'running');
    if (prunable.length <= MAX_JOBS) return;
    const toRemove = prunable.slice(MAX_JOBS);
    for (const job of toRemove) {
        if (!isValidJobId(job.id)) continue;
        try { unlinkSync(safeJobPath(job.id, '.meta.json')); } catch { /* noop */ }
        try { unlinkSync(safeJobPath(job.id, '.ndjson')); } catch { /* noop */ }
    }
}

function writeJobMeta(id: string, job: Job): void {
    const target = safeJobPath(id, '.meta.json');
    const tmp = target + '.tmp';
    writeFileSync(tmp, JSON.stringify(job, null, 2) + '\n', 'utf8');
    renameSync(tmp, target);
}

export type { JobStatus };
