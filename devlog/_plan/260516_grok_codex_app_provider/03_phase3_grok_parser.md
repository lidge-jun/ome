# P3 — Grok Event Parser

Add `parseGrokEvent()` to `src/observe/parser.ts` to handle Grok's NDJSON event stream.

## Grok Event Shapes (from cli-jaw)

Grok outputs newline-delimited JSON with these event types:

### `thought` — reasoning/thinking block
```json
{"type": "thought", "data": "Let me analyze this..."}
```

### `text` — assistant output chunk
```json
{"type": "text", "data": "Here is the answer...", "text": "alternate field"}
```

### `tool_use` / `tool_call` / `tool_start` — tool invocation
```json
{"type": "tool_use", "name": "Read", "arguments": "{\"path\":\"/foo\"}",
 "id": "tool-123", "toolCallId": "tool-123"}
```

### `tool_result` / `tool_output` / `tool_end` — tool completion
```json
{"type": "tool_result", "id": "tool-123", "output": "file contents...",
 "status": "completed"}
```

### `error` — error event
```json
{"type": "error", "message": "Rate limit exceeded", "error": "..."}
```

### `end` — session complete
```json
{"type": "end", "sessionId": "grok-session-abc"}
```

## Diff

### 3.1 Add grok case to `parseLine()` switch

**File:** `src/observe/parser.ts:14-20`

```diff
  switch (cli) {
      case 'claude': return parseClaudeEvent(parsed as Record<string, unknown>, ts);
      case 'codex': return parseCodexEvent(parsed as Record<string, unknown>, ts);
      case 'gemini': return parseGeminiEvent(parsed as Record<string, unknown>, ts);
      case 'opencode': return parseOpenCodeEvent(parsed as Record<string, unknown>, ts);
+     case 'grok': return parseGrokEvent(parsed as Record<string, unknown>, ts);
      default: return parseGenericEvent(parsed as Record<string, unknown>, ts);
  }
```

### 3.2 Add `parseGrokEvent()` function

Insert before `parseGenericEvent()` (line 122):

```typescript
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
        const toolName = String(obj['name'] ?? obj['toolName'] ?? 'tool');
        const detail = String(obj['arguments'] ?? obj['args'] ?? obj['input'] ?? '');
        return { type: 'tool_use', message: `${toolName}: ${detail}`.slice(0, 200), phase: null, toolName, raw: obj, ts };
    }

    if (type === 'tool_result' || type === 'tool_output' || type === 'tool_end') {
        const toolName = String(obj['name'] ?? obj['toolName'] ?? 'tool');
        const status = String(obj['status'] ?? 'completed');
        const output = String(obj['output'] ?? obj['result'] ?? obj['data'] ?? '');
        return {
            type: 'tool_result',
            message: `${toolName} [${status}]: ${output}`.slice(0, 200),
            phase: null,
            toolName,
            raw: obj,
            ts,
        };
    }

    if (type === 'error') {
        return { type: 'error', message: String(obj['message'] ?? obj['error'] ?? JSON.stringify(obj)).slice(0, 200), phase: null, toolName: null, raw: obj, ts };
    }

    if (type === 'end') {
        return { type: 'system', message: 'session ended', phase: null, toolName: null, raw: obj, ts };
    }

    return parseGenericEvent(obj, ts);
}
```

## Key Design Decisions

1. **Grok uses multiple type aliases** for the same concept (`tool_use`/`tool_call`/`tool_start`).
   OME normalizes all three to `tool_use`, matching cli-jaw's dedup behavior.

2. **Data fields vary**: `data` vs `text` for text content, `arguments` vs `args` vs `input`
   for tool args. Parser tries each in priority order (matching cli-jaw field probing).

3. **Session ID extraction** is handled separately in `spawn/index.ts` (P6), not in the parser.

## Verification Gate

- `parseLine('grok', '{"type":"thought","data":"thinking..."}')` → `{ type: 'thinking', ... }`
- `parseLine('grok', '{"type":"text","data":"answer"}')` → `{ type: 'assistant', ... }`
- `parseLine('grok', '{"type":"tool_use","name":"Read","arguments":"..."}')` → `{ type: 'tool_use', toolName: 'Read', ... }`
- `parseLine('grok', '{"type":"end","sessionId":"abc"}')` → `{ type: 'system', ... }`
