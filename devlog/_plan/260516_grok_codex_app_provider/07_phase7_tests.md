# P7 — Contract Tests

Add comprehensive tests for both new providers. All tests use `node:test` + `assert/strict`.

## 7.1 Grok Args Tests

**File:** `tests/spawn/args.test.ts` — append to existing describe block

```typescript
it('builds Grok args with streaming-json and auto-approve', () => {
    const result = buildArgs('grok', 'hello', { model: 'grok-build' });

    assert.deepEqual(result.args, [
        '-p', 'hello',
        '--output-format', 'streaming-json',
        '--no-alt-screen',
        '--always-approve',
        '--permission-mode', 'bypassPermissions',
        '-m', 'grok-build',
    ]);
    assert.equal(result.stdinPrompt, false);
});

it('builds Grok resume args with session ID', () => {
    const result = buildArgs('grok', 'continue', {
        sessionId: 'grok-sid-123',
        model: 'grok-build',
    });

    assert.deepEqual(result.args, [
        '-p', 'continue',
        '--resume', 'grok-sid-123',
        '--output-format', 'streaming-json',
        '--no-alt-screen',
        '--always-approve',
        '--permission-mode', 'bypassPermissions',
        '-m', 'grok-build',
    ]);
    assert.equal(result.stdinPrompt, false);
});

it('rejects Grok system prompts', () => {
    assert.throws(
        () => buildArgs('grok', 'hello', { systemPrompt: 'You are Data.' }),
        /systemPrompt is not supported for CLI "grok"/,
    );
});

it('builds Grok args without model when omitted', () => {
    const result = buildArgs('grok', 'hello');
    assert.equal(result.args.includes('-m'), false);
    assert.equal(result.stdinPrompt, false);
});
```

## 7.2 Codex App Args Guard Test

```typescript
it('rejects codex-app through buildArgs (must use CodexAppClient)', () => {
    assert.throws(
        () => buildArgs('codex-app', 'hello'),
        /codex-app uses JSON-RPC app-server mode/,
    );
});
```

## 7.3 Grok Parser Tests

**File:** `tests/observe/parser.test.ts` — append grok section

```typescript
import { parseLine } from '../../src/observe/parser.js';

describe('grok parser', () => {
    it('parses thought events as thinking', () => {
        const e = parseLine('grok', '{"type":"thought","data":"Let me analyze..."}');
        assert.equal(e?.type, 'thinking');
        assert.ok(e?.message.includes('Let me analyze'));
    });

    it('parses text events as assistant', () => {
        const e = parseLine('grok', '{"type":"text","data":"The answer is 42"}');
        assert.equal(e?.type, 'assistant');
        assert.ok(e?.message.includes('42'));
    });

    it('parses tool_use events', () => {
        const e = parseLine('grok', '{"type":"tool_use","name":"Read","arguments":"{\\"path\\":\\"/foo\\"}"}');
        assert.equal(e?.type, 'tool_use');
        assert.equal(e?.toolName, 'Read');
    });

    it('parses tool_call as tool_use (alias)', () => {
        const e = parseLine('grok', '{"type":"tool_call","name":"Bash","arguments":"ls"}');
        assert.equal(e?.type, 'tool_use');
        assert.equal(e?.toolName, 'Bash');
    });

    it('parses tool_result events', () => {
        const e = parseLine('grok', '{"type":"tool_result","name":"Read","output":"file contents","status":"completed"}');
        assert.equal(e?.type, 'tool_result');
        assert.equal(e?.toolName, 'Read');
    });

    it('parses error events', () => {
        const e = parseLine('grok', '{"type":"error","message":"Rate limit"}');
        assert.equal(e?.type, 'error');
        assert.ok(e?.message.includes('Rate limit'));
    });

    it('parses end events as system', () => {
        const e = parseLine('grok', '{"type":"end","sessionId":"grok-abc"}');
        assert.equal(e?.type, 'system');
    });
});
```

## 7.4 Codex App Event Mapper Tests

**File:** `tests/spawn/codex-app-events.test.ts` (NEW)

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapCodexAppNotification } from '../../src/spawn/codex-app-events.js';

describe('codex-app event mapper', () => {
    it('maps turn/started and extracts sessionId', () => {
        const r = mapCodexAppNotification('turn/started', { threadId: 'thread-abc' });
        assert.ok(r);
        assert.equal(r.event.type, 'system');
        assert.equal(r.sessionId, 'thread-abc');
    });

    it('maps item/started as tool_use', () => {
        const r = mapCodexAppNotification('item/started', {
            item: { type: 'commandExecution', command: 'ls -la' },
        });
        assert.ok(r);
        assert.equal(r.event.type, 'tool_use');
        assert.equal(r.event.toolName, 'ls -la');
    });

    it('maps item/agentMessage/delta as assistant', () => {
        const r = mapCodexAppNotification('item/agentMessage/delta', { delta: 'Hello world' });
        assert.ok(r);
        assert.equal(r.event.type, 'assistant');
        assert.ok(r.event.message.includes('Hello world'));
    });

    it('maps item/completed as tool_result', () => {
        const r = mapCodexAppNotification('item/completed', {
            item: { type: 'fileChange', path: 'src/foo.ts', status: 'completed' },
        });
        assert.ok(r);
        assert.equal(r.event.type, 'tool_result');
    });

    it('maps reasoning delta as thinking', () => {
        const r = mapCodexAppNotification('item/reasoning/summaryTextDelta', { delta: 'considering...' });
        assert.ok(r);
        assert.equal(r.event.type, 'thinking');
    });

    it('maps turn/completed with flushThinking', () => {
        const r = mapCodexAppNotification('turn/completed', { status: 'completed' });
        assert.ok(r);
        assert.equal(r.event.type, 'system');
        assert.equal(r.flushThinking, true);
    });

    it('maps error notifications', () => {
        const r = mapCodexAppNotification('error', { message: 'something broke' });
        assert.ok(r);
        assert.equal(r.event.type, 'error');
    });

    it('returns null for unknown methods', () => {
        const r = mapCodexAppNotification('unknown/method', {});
        assert.equal(r, null);
    });

    it('returns null for empty delta', () => {
        const r = mapCodexAppNotification('item/agentMessage/delta', { delta: '' });
        assert.equal(r, null);
    });
});
```

## 7.5 Session ID Extraction Tests

**File:** `tests/spawn/session-id.test.ts` — append

```typescript
it('extracts Grok session ID from end event only', () => {
    assert.equal(extractSessionId('grok', { type: 'end', sessionId: 'grok-abc' }), 'grok-abc');
    assert.equal(extractSessionId('grok', { type: 'text', sessionId: 'grok-abc' }), undefined);
});
```

## 7.6 Smoke Test Update

**File:** `tests/cli/smoke.test.ts` — add grok and codex-app to dry-run checks if applicable.

## Test Count Estimate

| File | New Tests | Running Total |
|------|-----------|---------------|
| args.test.ts | +5 | 14 → 19 |
| parser.test.ts | +7 | existing + 7 |
| codex-app-events.test.ts | +9 | 9 (new file) |
| session-id.test.ts | +1 | existing + 1 |

## Verification Gate

- `npm test` — all pass, 0 failures
- No test imports are circular
- Tests cover: new args, resume args, system prompt rejection, parser shapes, event mapping, session ID
