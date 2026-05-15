import { readJobMeta, readJobLog } from '../spawn/jobs.js';
import { parseLine } from './parser.js';

export interface StallConfig {
    warningMs: number;
    timeoutMs: number;
}

export interface StallStatus {
    jobId: string;
    silentMs: number;
    state: 'active' | 'warning' | 'stalled';
    lastEventAt: string | null;
}

const DEFAULT_CONFIG: StallConfig = { warningMs: 30_000, timeoutMs: 120_000 };

export function checkStall(jobId: string, config: Partial<StallConfig> = {}): StallStatus | null {
    const meta = readJobMeta(jobId);
    if (!meta || meta.status !== 'running') return null;

    const { warningMs, timeoutMs } = { ...DEFAULT_CONFIG, ...config };
    const lines = readJobLog(jobId);

    let lastEventAt: string | null = null;
    for (const line of lines) {
        const ev = parseLine(meta.cli, line);
        if (ev) lastEventAt = ev.ts;
    }

    const reference = lastEventAt ? new Date(lastEventAt).getTime() : new Date(meta.createdAt).getTime();
    const silentMs = Date.now() - reference;

    let state: StallStatus['state'] = 'active';
    if (silentMs >= timeoutMs) state = 'stalled';
    else if (silentMs >= warningMs) state = 'warning';

    return { jobId, silentMs, state, lastEventAt };
}
