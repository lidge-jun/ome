import { readJobMeta, readJobLog } from '../spawn/jobs.js';
import { parseLine } from './parser.js';
import type { LiveRunState, ParsedToolCall } from './types.js';
import type { ProgressEvent } from '../registry/types.js';

export function inspect(jobId: string): LiveRunState | null {
    const meta = readJobMeta(jobId);
    if (!meta) return null;

    const lines = readJobLog(jobId);
    const events: ProgressEvent[] = [];
    for (const line of lines) {
        const ev = parseLine(meta.cli, line);
        if (ev) events.push(ev);
    }

    const toolCalls = extractToolCalls(events);
    const thinkingText = events
        .filter(e => e.type === 'thinking')
        .map(e => e.message)
        .join('\n');
    const outputText = events
        .filter(e => e.type === 'assistant')
        .map(e => e.message)
        .join('');

    return {
        jobId,
        cli: meta.cli,
        status: meta.status,
        currentPhase: meta.phase,
        toolCalls,
        thinkingText,
        outputText,
        eventCount: events.length,
        lastEvent: events.at(-1) ?? null,
        startedAt: meta.createdAt,
        updatedAt: meta.updatedAt,
    };
}

export async function* watch(jobId: string, pollMs = 500): AsyncGenerator<ProgressEvent> {
    const meta = readJobMeta(jobId);
    if (!meta) return;

    let offset = 0;

    while (true) {
        const lines = readJobLog(jobId);
        const newLines = lines.slice(offset);
        offset = lines.length;

        for (const line of newLines) {
            const ev = parseLine(meta.cli, line);
            if (ev) yield ev;
        }

        const current = readJobMeta(jobId);
        if (!current || current.status !== 'running') break;

        await new Promise(r => setTimeout(r, pollMs));
    }

    // Final drain — catch lines written between last poll and status change
    const finalLines = readJobLog(jobId);
    for (const line of finalLines.slice(offset)) {
        const ev = parseLine(meta.cli, line);
        if (ev) yield ev;
    }
}

function extractToolCalls(events: ProgressEvent[]): ParsedToolCall[] {
    const calls: ParsedToolCall[] = [];
    const pending = new Map<string, ParsedToolCall[]>();

    for (const ev of events) {
        if (ev.type === 'tool_use' && ev.toolName) {
            const call: ParsedToolCall = {
                name: ev.toolName,
                input: ev.message,
                output: null,
                status: 'running',
                startedAt: ev.ts,
                completedAt: null,
            };
            const stack = pending.get(ev.toolName) ?? [];
            stack.push(call);
            pending.set(ev.toolName, stack);
            calls.push(call);
        } else if (ev.type === 'tool_result' && ev.toolName) {
            const stack = pending.get(ev.toolName);
            if (stack && stack.length > 0) {
                const call = stack.shift()!;
                call.output = ev.message;
                call.status = 'done';
                call.completedAt = ev.ts;
                if (stack.length === 0) pending.delete(ev.toolName);
            }
        }
    }

    return calls;
}

export type { LiveRunState, ParsedToolCall } from './types.js';
