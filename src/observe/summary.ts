import { readJobMeta, readJobLog } from '../spawn/jobs.js';
import { parseLine } from './parser.js';

export interface JobSummary {
    jobId: string;
    cli: string;
    model: string | null;
    durationMs: number;
    sessionId: string | null;
    exitCode: number;
    toolsUsed: string[];
    thinkingBlocks: number;
    outputLength: number;
    errorSummary: string | null;
    eventCount: number;
}

export function summarize(jobId: string): JobSummary | null {
    const meta = readJobMeta(jobId);
    if (!meta) return null;
    if (meta.status === 'running' || meta.status === 'cancelling') return null;

    const lines = readJobLog(jobId);
    const toolNames = new Set<string>();
    let thinkingBlocks = 0;
    let outputLength = 0;
    let errorSummary: string | null = null;
    let eventCount = 0;
    let inThinking = false;

    for (const line of lines) {
        const ev = parseLine(meta.cli, line);
        if (!ev) continue;
        eventCount++;

        if (ev.type === 'tool_use' && ev.toolName) toolNames.add(ev.toolName);
        if (ev.type === 'thinking') {
            if (!inThinking) { thinkingBlocks++; inThinking = true; }
        } else {
            inThinking = false;
        }
        if (ev.type === 'assistant') outputLength += ev.message.length;
        if (ev.type === 'error' && !errorSummary) errorSummary = ev.message;
    }

    const startTime = new Date(meta.createdAt).getTime();
    const endTime = meta.completedAt ? new Date(meta.completedAt).getTime() : startTime;
    const exitCode = meta.status === 'completed' ? 0 : meta.status === 'cancelled' ? -1 : 1;

    return {
        jobId,
        cli: meta.cli,
        model: meta.model,
        durationMs: endTime - startTime,
        sessionId: meta.sessionId,
        exitCode,
        toolsUsed: [...toolNames],
        thinkingBlocks,
        outputLength,
        errorSummary,
        eventCount,
    };
}
