import type { ProgressEvent } from '../registry/types.js';

export function parseLine(cli: string, raw: string): ProgressEvent | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let parsed: unknown;
    try { parsed = JSON.parse(trimmed); } catch { return null; }

    if (!parsed || typeof parsed !== 'object') return null;

    const ts = new Date().toISOString();

    switch (cli) {
        case 'claude': return parseClaudeEvent(parsed as Record<string, unknown>, ts);
        case 'codex': return parseCodexEvent(parsed as Record<string, unknown>, ts);
        case 'gemini': return parseGeminiEvent(parsed as Record<string, unknown>, ts);
        case 'opencode': return parseOpenCodeEvent(parsed as Record<string, unknown>, ts);
        case 'grok': return parseGrokEvent(parsed as Record<string, unknown>, ts);
        default: return parseGenericEvent(parsed as Record<string, unknown>, ts);
    }
}

function parseClaudeEvent(obj: Record<string, unknown>, ts: string): ProgressEvent {
    const type = String(obj['type'] ?? 'unknown');
    const mapped = mapEventType(type);

    let message = '';
    let toolName: string | null = null;

    if (type === 'assistant' && obj['message']) {
        const msg = obj['message'] as Record<string, unknown>;
        const content = msg['content'];
        if (Array.isArray(content)) {
            message = content
                .filter((c: Record<string, unknown>) => c['type'] === 'text')
                .map((c: Record<string, unknown>) => c['text'])
                .join('');
        }
    } else if (type === 'tool_use' || type === 'tool_result') {
        const tool = obj['tool'] as Record<string, unknown> | undefined;
        toolName = String(tool?.['name'] ?? obj['name'] ?? '');
        message = `${type}: ${toolName}`;
    } else if (type === 'result') {
        message = String(obj['result'] ?? '').slice(0, 200);
    } else {
        message = JSON.stringify(obj).slice(0, 200);
    }

    return { type: mapped, message, phase: null, toolName, raw: obj, ts };
}

function parseCodexEvent(obj: Record<string, unknown>, ts: string): ProgressEvent {
    const type = String(obj['type'] ?? 'unknown');
    const item = asRecord(obj['item']);
    if (item) {
        const itemType = String(item['type'] ?? 'unknown');
        if (itemType === 'agent_message') {
            return { type: 'assistant', message: String(item['text'] ?? '').slice(0, 200), phase: null, toolName: null, raw: obj, ts };
        }
        if (itemType === 'reasoning') {
            return { type: 'thinking', message: String(item['text'] ?? JSON.stringify(item)).slice(0, 200), phase: null, toolName: null, raw: obj, ts };
        }
        if (itemType === 'command_execution') {
            const command = String(item['command'] ?? item['cmd'] ?? 'command_execution');
            const mappedType = type === 'item.completed' ? 'tool_result' : 'tool_use';
            return { type: mappedType, message: command.slice(0, 200), phase: null, toolName: command, raw: obj, ts };
        }
        if (itemType === 'web_search') {
            const action = String(item['action'] ?? 'web_search');
            const mappedType = type === 'item.completed' ? 'tool_result' : 'tool_use';
            return { type: mappedType, message: JSON.stringify(item).slice(0, 200), phase: null, toolName: action, raw: obj, ts };
        }
    }

    const mapped = type === 'thread.started' || type === 'turn.started' || type === 'turn.completed'
        ? 'system'
        : mapEventType(type);
    const message = String(obj['message'] ?? obj['text'] ?? JSON.stringify(obj)).slice(0, 200);
    const phase = typeof obj['phase'] === 'string' ? obj['phase'] : null;
    const toolName = typeof obj['tool'] === 'string' ? obj['tool'] : null;
    return { type: mapped, message, phase, toolName, raw: obj, ts };
}

function parseGeminiEvent(obj: Record<string, unknown>, ts: string): ProgressEvent {
    const type = String(obj['type'] ?? obj['event'] ?? 'unknown');
    const mapped = mapEventType(type);
    const message = String(obj['text'] ?? obj['content'] ?? JSON.stringify(obj)).slice(0, 200);
    const toolName = typeof obj['tool_name'] === 'string'
        ? obj['tool_name']
        : typeof obj['functionCall'] === 'object'
        ? String((obj['functionCall'] as Record<string, unknown>)['name'] ?? '')
        : null;
    return { type: mapped, message, phase: null, toolName, raw: obj, ts };
}

function parseOpenCodeEvent(obj: Record<string, unknown>, ts: string): ProgressEvent {
    const type = String(obj['type'] ?? 'unknown');
    const part = asRecord(obj['part']);
    if ((type === 'tool_use' || type === 'tool_result') && part) {
        const toolName = String(part['tool'] ?? part['name'] ?? obj['tool'] ?? type);
        return {
            type,
            message: JSON.stringify(part).slice(0, 200),
            phase: null,
            toolName,
            raw: obj,
            ts,
        };
    }
    if (type === 'text' && part) {
        return { type: 'assistant', message: String(part['text'] ?? '').slice(0, 200), phase: null, toolName: null, raw: obj, ts };
    }
    if (type === 'reasoning' && part) {
        return { type: 'thinking', message: String(part['text'] ?? '').slice(0, 200), phase: null, toolName: null, raw: obj, ts };
    }
    if (type === 'error') {
        return { type: 'error', message: JSON.stringify(obj['error'] ?? obj).slice(0, 200), phase: null, toolName: null, raw: obj, ts };
    }
    return parseGenericEvent(obj, ts);
}

function parseGrokEvent(obj: Record<string, unknown>, ts: string): ProgressEvent {
    const type = String(obj['type'] ?? 'unknown');

    if (type === 'thought') {
        const text = String(obj['data'] ?? obj['text'] ?? '');
        return { type: 'thinking', message: text.slice(0, 200), phase: null, toolName: null, raw: obj, ts };
    }
    if (type === 'text') {
        const text = String(obj['data'] ?? obj['text'] ?? '');
        return { type: 'assistant', message: text.slice(0, 200), phase: null, toolName: null, raw: obj, ts };
    }
    if (type === 'tool_use' || type === 'tool_call' || type === 'tool_start') {
        const status = grokStatus(obj);
        const done = ['completed', 'complete', 'done', 'success', 'succeeded', 'failed', 'error'].includes(status);
        const toolName = grokToolName(obj);
        const detail = grokToolDetail(obj);
        return {
            type: done ? 'tool_result' : 'tool_use',
            message: `${toolName}${status ? ` [${status}]` : ''}: ${detail}`.slice(0, 200),
            phase: grokToolPhase(obj),
            toolName,
            raw: obj,
            ts,
        };
    }
    if (type === 'tool_result' || type === 'tool_output' || type === 'tool_end') {
        const toolName = grokToolName(obj);
        const status = grokStatus(obj) || 'completed';
        const output = grokToolDetail(obj);
        return { type: 'tool_result', message: `${toolName} [${status}]: ${output}`.slice(0, 200), phase: grokToolPhase(obj), toolName, raw: obj, ts };
    }
    if (type === 'error') {
        return { type: 'error', message: String(obj['message'] ?? obj['error'] ?? obj['data'] ?? obj['text'] ?? JSON.stringify(obj)).slice(0, 200), phase: null, toolName: null, raw: obj, ts };
    }
    if (type === 'end') {
        return { type: 'system', message: 'session ended', phase: null, toolName: null, raw: obj, ts };
    }
    return parseGenericEvent(obj, ts);
}

function grokToolPhase(obj: Record<string, unknown>): string | null {
    const part = asRecord(obj['part']);
    return strAny(obj, ['id', 'toolCallId', 'tool_call_id', 'toolUseId', 'tool_id', 'toolId', 'call_id', 'callID', 'callId'])
        || (part ? strAny(part, ['callID', 'id', 'toolCallId', 'tool_call_id']) : null);
}

function grokToolName(obj: Record<string, unknown>): string {
    const part = asRecord(obj['part']);
    const state = asRecord(obj['state']);
    const partState = part ? asRecord(part['state']) : null;
    return strAny(obj, ['name', 'toolName', 'tool_name', 'tool', 'command', 'title'])
        || (part ? strAny(part, ['tool', 'name']) : null)
        || (state ? strAny(state, ['title']) : null)
        || (partState ? strAny(partState, ['title']) : null)
        || 'tool';
}

function grokToolDetail(obj: Record<string, unknown>): string {
    const part = asRecord(obj['part']);
    const state = asRecord(obj['state']);
    const partState = part ? asRecord(part['state']) : null;
    const value = firstValue(
        obj,
        ['arguments', 'args', 'input', 'parameters', 'rawInput', 'output', 'result', 'data', 'error', 'message'],
    ) ?? (part ? firstValue(part, ['input', 'output']) : undefined)
        ?? (state ? firstValue(state, ['input', 'output']) : undefined)
        ?? (partState ? firstValue(partState, ['input', 'output']) : undefined);
    return stringifyValue(value);
}

function grokStatus(obj: Record<string, unknown>): string {
    const state = asRecord(obj['state']);
    const part = asRecord(obj['part']);
    const partState = part ? asRecord(part['state']) : null;
    return (strAny(obj, ['status']) || (state ? strAny(state, ['status']) : null) || (partState ? strAny(partState, ['status']) : null) || '').toLowerCase();
}

function strAny(obj: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === 'string' && value.trim()) return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    }
    return null;
}

function firstValue(obj: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return undefined;
}

function stringifyValue(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function parseGenericEvent(obj: Record<string, unknown>, ts: string): ProgressEvent {
    const type = mapEventType(String(obj['type'] ?? 'unknown'));
    return {
        type,
        message: JSON.stringify(obj).slice(0, 200),
        phase: typeof obj['phase'] === 'string' ? obj['phase'] : null,
        toolName: null,
        raw: obj,
        ts,
    };
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function mapEventType(raw: string): ProgressEvent['type'] {
    const map: Record<string, ProgressEvent['type']> = {
        assistant: 'assistant',
        message: 'assistant',
        text: 'assistant',
        tool_use: 'tool_use',
        tool_result: 'tool_result',
        function_call: 'tool_use',
        function_response: 'tool_result',
        thinking: 'thinking',
        error: 'error',
        system: 'system',
    };
    return map[raw] ?? 'unknown';
}
