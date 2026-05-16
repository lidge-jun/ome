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

    it('maps item/started as tool_use for commandExecution', () => {
        const r = mapCodexAppNotification('item/started', {
            item: { type: 'commandExecution', command: 'ls -la', id: 'item-1' },
        });
        assert.ok(r);
        assert.equal(r.event.type, 'tool_use');
        assert.equal(r.event.toolName, 'ls -la');
    });

    it('adds stable dedupe keys for repeated item notifications', () => {
        const first = mapCodexAppNotification('item/started', {
            item: { type: 'commandExecution', command: 'pwd', id: 'item-dup' },
        });
        const second = mapCodexAppNotification('item/started', {
            item: { type: 'commandExecution', command: 'pwd', id: 'item-dup' },
        });

        assert.ok(first);
        assert.ok(second);
        assert.equal(first.event.dedupeKey, 'codex-app:item/started:item-dup');
        assert.equal(second.event.dedupeKey, first.event.dedupeKey);
        assert.equal(first.event.phase, 'item-dup');
    });

    it('maps item/started as tool_use for fileChange', () => {
        const r = mapCodexAppNotification('item/started', {
            item: { type: 'fileChange', path: 'src/foo.ts', id: 'item-2' },
        });
        assert.ok(r);
        assert.equal(r.event.type, 'tool_use');
        assert.equal(r.event.toolName, 'src/foo.ts');
    });

    it('maps item/agentMessage/delta as assistant', () => {
        const r = mapCodexAppNotification('item/agentMessage/delta', { delta: 'Hello world' });
        assert.ok(r);
        assert.equal(r.event.type, 'assistant');
        assert.ok(r.event.message.includes('Hello world'));
    });

    it('preserves full assistant delta separately from the preview', () => {
        const delta = 'x'.repeat(260);
        const r = mapCodexAppNotification('item/agentMessage/delta', { delta });

        assert.ok(r);
        assert.equal(r.event.type, 'assistant');
        assert.equal(r.event.message.length, 200);
        assert.equal(r.event.fullMessage, delta);
    });

    it('returns null for empty delta', () => {
        const r = mapCodexAppNotification('item/agentMessage/delta', { delta: '' });
        assert.equal(r, null);
    });

    it('maps item/completed as tool_result', () => {
        const r = mapCodexAppNotification('item/completed', {
            item: { type: 'commandExecution', id: 'item-1', status: 'completed' },
        });
        assert.ok(r);
        assert.equal(r.event.type, 'tool_result');
    });

    it('skips item/completed for agentMessage', () => {
        const r = mapCodexAppNotification('item/completed', {
            item: { type: 'agentMessage', id: 'item-3' },
        });
        assert.equal(r, null);
    });

    it('maps item/completed reasoning with flushThinking', () => {
        const r = mapCodexAppNotification('item/completed', {
            item: { type: 'reasoning', id: 'item-4' },
        });
        assert.ok(r);
        assert.equal(r.event.type, 'thinking');
        assert.equal(r.flushThinking, true);
    });

    it('maps reasoning delta as thinking', () => {
        const r = mapCodexAppNotification('item/reasoning/summaryTextDelta', { delta: 'considering...' });
        assert.ok(r);
        assert.equal(r.event.type, 'thinking');
    });

    it('maps turn/completed with flushThinking', () => {
        const r = mapCodexAppNotification('turn/completed', { turn: { status: 'completed' } });
        assert.ok(r);
        assert.equal(r.event.type, 'system');
        assert.equal(r.flushThinking, true);
    });

    it('maps error notifications', () => {
        const r = mapCodexAppNotification('error', { error: { message: 'something broke' } });
        assert.ok(r);
        assert.equal(r.event.type, 'error');
        assert.ok(r.event.message.includes('something broke'));
    });

    it('returns null for unknown methods', () => {
        const r = mapCodexAppNotification('unknown/method', {});
        assert.equal(r, null);
    });
});
