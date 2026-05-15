export type AgentCli = 'claude' | 'codex' | 'gemini' | 'copilot' | 'opencode' | string;

export interface Employee {
    id: string;
    name: string;
    cli: AgentCli;
    model: string | null;
    role: string | null;
    createdAt: string;
}

export interface EmployeeInput {
    name: string;
    cli: AgentCli;
    model?: string | null;
    role?: string | null;
}

export interface QueueItem {
    id: string;
    prompt: string;
    source: string;
    target?: string;
    ts: number;
}

export interface SpawnOptions {
    cli?: AgentCli;
    model?: string;
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
}

export interface SpawnResult {
    text: string;
    code: number;
    jobId?: string;
    sessionId?: string;
    stderr?: string;
    durationMs?: number;
}

export interface DispatchOptions {
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
}

// --- Job tracking types ---

export type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling';

export interface Job {
    id: string;
    cli: string;
    prompt: string;
    model: string | null;
    status: JobStatus;
    phase: string;
    pid: number | null;
    sessionId: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}

export interface ProgressEvent {
    type: 'assistant' | 'tool_use' | 'tool_result' | 'thinking' | 'error' | 'system' | 'unknown';
    message: string;
    phase: string | null;
    toolName: string | null;
    raw: unknown;
    ts: string;
}

export interface QuotaConfig {
    dailyLimit: number;
    hourlyLimit: number;
    updatedAt: string;
}
