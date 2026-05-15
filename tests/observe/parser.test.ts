import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../../src/observe/parser.js';

describe('parseLine', () => {
    it('parses claude assistant event', () => {
        const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } });
        const ev = parseLine('claude', line);
        assert.equal(ev?.type, 'assistant');
        assert.ok(ev?.message.includes('Hello'));
    });

    it('parses claude tool_use event', () => {
        const line = JSON.stringify({ type: 'tool_use', tool: { name: 'Read' } });
        const ev = parseLine('claude', line);
        assert.equal(ev?.type, 'tool_use');
        assert.equal(ev?.toolName, 'Read');
    });

    it('parses codex event with phase', () => {
        const line = JSON.stringify({ type: 'message', message: 'fixing bug', phase: 'coding' });
        const ev = parseLine('codex', line);
        assert.equal(ev?.type, 'assistant');
        assert.equal(ev?.phase, 'coding');
    });

    it('parses gemini functionCall', () => {
        const line = JSON.stringify({ type: 'tool', functionCall: { name: 'search' } });
        const ev = parseLine('gemini', line);
        assert.equal(ev?.toolName, 'search');
    });

    it('returns null for empty/whitespace', () => {
        assert.equal(parseLine('claude', ''), null);
        assert.equal(parseLine('claude', '   '), null);
    });

    it('returns null for non-JSON', () => {
        assert.equal(parseLine('claude', 'not json at all'), null);
    });

    it('handles unknown CLI with generic parser', () => {
        const line = JSON.stringify({ type: 'msg', text: 'hello' });
        const ev = parseLine('unknown-cli', line);
        assert.equal(ev?.type, 'unknown');
        assert.ok(ev?.message);
    });
});
