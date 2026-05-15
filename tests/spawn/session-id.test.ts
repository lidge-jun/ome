import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractSessionId } from '../../src/spawn/index.js';

describe('extractSessionId', () => {
    it('extracts common session id fields', () => {
        assert.equal(extractSessionId('claude', { session_id: 'claude-session' }), 'claude-session');
        assert.equal(extractSessionId('gemini', { sessionId: 'gemini-session' }), 'gemini-session');
        assert.equal(extractSessionId('generic', { conversation_id: 'conversation-session' }), 'conversation-session');
    });

    it('extracts Codex thread id from thread.started events', () => {
        assert.equal(extractSessionId('codex', { type: 'thread.started', thread_id: 'codex-thread' }), 'codex-thread');
    });

    it('extracts OpenCode sessionID events', () => {
        assert.equal(extractSessionId('opencode', { type: 'text', sessionID: 'opencode-session' }), 'opencode-session');
    });
});

