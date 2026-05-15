# P5 — Codex App Event Mapper

Create `src/spawn/codex-app-events.ts` — maps JSON-RPC notifications from the Codex App server
to OME's `ProgressEvent` shape.

## Notification Types (from cli-jaw)

| Method | Maps To | Description |
|--------|---------|-------------|
| `turn/started` | `system` | Turn started, contains threadId |
| `item/started` | `tool_use` | Tool/item invocation begins |
| `item/agentMessage/delta` | `assistant` | Text output chunk |
| `item/completed` | `tool_result` | Tool/item finished |
| `item/reasoning/summaryTextDelta` | `thinking` | Reasoning text chunk |
| `thread/tokenUsage/updated` | `system` | Token count update |
| `turn/completed` | `system` | Turn finished (flush thinking) |
| `error` | `error` | Error notification |

## Item Types → Icons (from cli-jaw mapping)

| Item Type | Icon | Label |
|-----------|------|-------|
| `commandExecution` | `command` | Command name |
| `fileChange` | `file` | File path |
| `webSearch` | `search` | Search query |
| `mcpToolCall` | `mcp` | Tool name |
| `collabAgentToolCall` | `agent` | Agent name |
| `reasoning` | `thinking` | (buffered) |

## New File: `src/spawn/codex-app-events.ts` (~120 lines)

```typescript
import type { ProgressEvent } from '../registry/types.js';

export interface CodexAppEventResult {
    event: ProgressEvent;
    sessionId?: string;
    flushThinking?: boolean;
}

export function mapCodexAppNotification(
    method: string,
    params: Record<string, unknown>,
): CodexAppEventResult | null {
    const ts = new Date().toISOString();

    switch (method) {
        case 'turn/started': {
            const threadId = String(params['threadId'] ?? params['thread_id'] ?? '');
            return {
                event: { type: 'system', message: 'turn started', phase: null, toolName: null, raw: params, ts },
                sessionId: threadId || undefined,
            };
        }

        case 'item/started': {
            const item = asRecord(params['item']) ?? params;
            const itemType = String(item['type'] ?? 'unknown');
            const toolName = resolveToolName(itemType, item);
            const detail = resolveToolDetail(item);
            return {
                event: {
                    type: 'tool_use',
                    message: `${toolName}: ${detail}`.slice(0, 200),
                    phase: null,
                    toolName,
                    raw: params,
                    ts,
                },
            };
        }

        case 'item/agentMessage/delta': {
            const delta = String(params['delta'] ?? params['text'] ?? '');
            if (!delta) return null;
            return {
                event: { type: 'assistant', message: delta.slice(0, 200), phase: null, toolName: null, raw: params, ts },
            };
        }

        case 'item/completed': {
            const item = asRecord(params['item']) ?? params;
            const itemType = String(item['type'] ?? 'unknown');
            const toolName = resolveToolName(itemType, item);
            const status = String(item['status'] ?? 'completed');
            return {
                event: {
                    type: 'tool_result',
                    message: `${toolName} [${status}]`.slice(0, 200),
                    phase: null,
                    toolName,
                    raw: params,
                    ts,
                },
            };
        }

        case 'item/reasoning/summaryTextDelta': {
            const delta = String(params['delta'] ?? params['text'] ?? '');
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
            const status = String(params['status'] ?? 'completed');
            return {
                event: { type: 'system', message: `turn ${status}`, phase: null, toolName: null, raw: params, ts },
                flushThinking: true,
            };
        }

        case 'error': {
            const message = String(params['message'] ?? params['error'] ?? JSON.stringify(params));
            return {
                event: { type: 'error', message: message.slice(0, 200), phase: null, toolName: null, raw: params, ts },
            };
        }

        default:
            return null;
    }
}

function resolveToolName(itemType: string, item: Record<string, unknown>): string {
    switch (itemType) {
        case 'commandExecution': return String(item['command'] ?? item['cmd'] ?? 'command');
        case 'fileChange': return String(item['path'] ?? item['file'] ?? 'file');
        case 'webSearch': return String(item['query'] ?? 'search');
        case 'mcpToolCall': return String(item['toolName'] ?? item['name'] ?? 'mcp');
        case 'collabAgentToolCall': return String(item['agentName'] ?? item['name'] ?? 'agent');
        default: return String(item['name'] ?? item['title'] ?? itemType);
    }
}

function resolveToolDetail(item: Record<string, unknown>): string {
    const candidates = ['arguments', 'args', 'input', 'command', 'query', 'path'];
    for (const key of candidates) {
        const val = item[key];
        if (typeof val === 'string' && val) return val;
        if (val && typeof val === 'object') return JSON.stringify(val);
    }
    return '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}
```

## Design Notes

1. **Session ID extraction**: `turn/started` carries the `threadId` which serves as the session ID
   for resume. This is returned in the `CodexAppEventResult.sessionId` field.

2. **Thinking flush**: `turn/completed` sets `flushThinking: true` — the spawn integration (P6)
   should finalize any buffered thinking text at this point.

3. **Null returns**: Unknown methods or empty deltas return `null` (skip silently). This matches
   cli-jaw's behavior of ignoring unknown notification types.

## Verification Gate

- `mapCodexAppNotification('turn/started', { threadId: 'abc' })` → `{ event: { type: 'system' }, sessionId: 'abc' }`
- `mapCodexAppNotification('item/agentMessage/delta', { delta: 'hello' })` → `{ event: { type: 'assistant', message: 'hello' } }`
- `mapCodexAppNotification('item/started', { item: { type: 'commandExecution', command: 'ls' } })` → `{ event: { type: 'tool_use', toolName: 'ls' } }`
- `mapCodexAppNotification('unknown/method', {})` → `null`
