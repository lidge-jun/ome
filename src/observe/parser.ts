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
