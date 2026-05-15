import type { ProgressEvent } from '../registry/types.js';

export interface CodexAppEventResult {
    event: ProgressEvent;
    sessionId?: string;
    flushThinking?: boolean;
}

type Rec = Record<string, unknown>;

export function mapCodexAppNotification(
    method: string,
    params: Rec,
): CodexAppEventResult | null {
    const ts = new Date().toISOString();

    switch (method) {
        case 'turn/started': {
            const threadId = str(params, 'threadId') || str(params, 'thread_id');
            return {
                event: { type: 'system', message: 'turn started', phase: null, toolName: null, raw: params, ts },
                sessionId: threadId || undefined,
            };
        }

        case 'item/started': {
            const item = rec(params['item']) ?? params;
            const itemType = str(item, 'type');
            const toolName = resolveToolName(itemType, item);
            const detail = resolveToolDetail(item);
            return {
                event: { type: 'tool_use', message: `${toolName}: ${detail}`.slice(0, 200), phase: null, toolName, raw: params, ts },
            };
        }

        case 'item/agentMessage/delta': {
            const delta = str(params, 'delta') || str(params, 'text');
            if (!delta) return null;
            return {
                event: { type: 'assistant', message: delta.slice(0, 200), phase: null, toolName: null, raw: params, ts },
            };
        }

        case 'item/completed': {
            const item = rec(params['item']) ?? params;
            const itemType = str(item, 'type');
            if (itemType === 'agentMessage' || itemType === 'userMessage' || itemType === 'hookPrompt') return null;
            if (itemType === 'reasoning') return { event: { type: 'thinking', message: 'reasoning completed', phase: null, toolName: null, raw: params, ts }, flushThinking: true };
            const toolName = resolveToolName(itemType, item);
            const status = str(item, 'status') || 'completed';
            return {
                event: { type: 'tool_result', message: `${toolName} [${status}]`.slice(0, 200), phase: null, toolName, raw: params, ts },
            };
        }

        case 'item/reasoning/summaryTextDelta': {
            const delta = str(params, 'delta') || str(params, 'text');
            if (!delta) return null;
            return {
                event: { type: 'thinking', message: delta.slice(0, 200), phase: null, toolName: null, raw: params, ts },
            };
        }

        case 'thread/tokenUsage/updated': {
            return {
                event: { type: 'system', message: `tokens: ${JSON.stringify(params)}`.slice(0, 200), phase: null, toolName: null, raw: params, ts },
            };
        }

        case 'turn/completed': {
            const turn = rec(params['turn']);
            const status = turn ? str(turn, 'status') : 'completed';
            return {
                event: { type: 'system', message: `turn ${status || 'completed'}`, phase: null, toolName: null, raw: params, ts },
                flushThinking: true,
            };
        }

        case 'error': {
            const error = rec(params['error']);
            const message = error ? str(error, 'message') : str(params, 'message') || 'unknown error';
            return {
                event: { type: 'error', message: message.slice(0, 200), phase: null, toolName: null, raw: params, ts },
            };
        }

        default:
            return null;
    }
}

function resolveToolName(itemType: string, item: Rec): string {
    switch (itemType) {
        case 'commandExecution': return String(item['command'] ?? item['cmd'] ?? 'command');
        case 'fileChange': return String(item['path'] ?? item['file'] ?? 'file');
        case 'webSearch': return String(item['query'] ?? 'search');
        case 'mcpToolCall': return String(item['toolName'] ?? item['name'] ?? 'mcp');
        case 'collabAgentToolCall': return String(item['agentName'] ?? item['name'] ?? 'agent');
        default: return String(item['name'] ?? item['title'] ?? itemType);
    }
}

function resolveToolDetail(item: Rec): string {
    for (const key of ['arguments', 'args', 'input', 'command', 'query', 'path']) {
        const val = item[key];
        if (typeof val === 'string' && val) return val;
        if (val && typeof val === 'object') return JSON.stringify(val);
    }
    return '';
}

function str(obj: Rec, key: string): string {
    const val = obj[key];
    return typeof val === 'string' ? val : '';
}

function rec(value: unknown): Rec | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Rec : null;
}
