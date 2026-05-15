import { readJobMeta, readJobLog } from '../spawn/jobs.js';
import { parseLine } from './parser.js';
import type { JobStatus, ProgressEvent } from '../registry/types.js';

export interface JobProgress {
    jobId: string;
    cli: string;
    status: JobStatus;
    elapsedMs: number;
    tools: { total: number; completed: number; running: number; failed: number };
    lastActivity: { type: ProgressEvent['type']; message: string; at: string } | null;
    outputChars: number;
    thinkingChars: number;
    eventCount: number;
}

export function progress(jobId: string): JobProgress | null {
    const meta = readJobMeta(jobId);
    if (!meta) return null;

    const lines = readJobLog(jobId);
    let outputChars = 0;
    let thinkingChars = 0;
    let lastActivity: JobProgress['lastActivity'] = null;
    const toolStatus = { total: 0, completed: 0, running: 0, failed: 0 };
    let eventCount = 0;

    for (const line of lines) {
        const ev = parseLine(meta.cli, line);
        if (!ev) continue;
        eventCount++;

        lastActivity = { type: ev.type, message: ev.message, at: ev.ts };

        if (ev.type === 'assistant') outputChars += ev.message.length;
        if (ev.type === 'thinking') thinkingChars += ev.message.length;
        if (ev.type === 'tool_use') { toolStatus.total++; toolStatus.running++; }
        if (ev.type === 'tool_result') {
            toolStatus.running = Math.max(0, toolStatus.running - 1);
            toolStatus.completed++;
        }
    }

    const startTime = new Date(meta.createdAt).getTime();
    const endTime = meta.completedAt ? new Date(meta.completedAt).getTime() : Date.now();

    return {
        jobId,
        cli: meta.cli,
        status: meta.status,
        elapsedMs: endTime - startTime,
        tools: toolStatus,
        lastActivity,
        outputChars,
        thinkingChars,
        eventCount,
    };
}
