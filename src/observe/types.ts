import type { ProgressEvent, JobStatus } from '../registry/types.js';

export interface ParsedToolCall {
    name: string;
    input: string;
    output: string | null;
    status: 'running' | 'done' | 'error';
    startedAt: string;
    completedAt: string | null;
}

export interface LiveRunState {
    jobId: string;
    cli: string;
    status: JobStatus;
    currentPhase: string;
    toolCalls: ParsedToolCall[];
    thinkingText: string;
    outputText: string;
    eventCount: number;
    lastEvent: ProgressEvent | null;
    startedAt: string;
    updatedAt: string;
}
