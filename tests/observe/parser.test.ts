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

    it('parses real Codex agent_message events', () => {
        const line = JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'OME_SMOKE_OK' } });
        const ev = parseLine('codex', line);
        assert.equal(ev?.type, 'assistant');
        assert.equal(ev?.message, 'OME_SMOKE_OK');
    });

    it('parses real Codex command execution events as tools', () => {
        const line = JSON.stringify({ type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'npm test' } });
        const ev = parseLine('codex', line);
        assert.equal(ev?.type, 'tool_use');
        assert.equal(ev?.toolName, 'npm test');
    });

    it('parses gemini functionCall', () => {
        const line = JSON.stringify({ type: 'tool', functionCall: { name: 'search' } });
        const ev = parseLine('gemini', line);
        assert.equal(ev?.toolName, 'search');
    });

    it('parses real Gemini tool_name events', () => {
        const line = JSON.stringify({ type: 'tool_use', tool_name: 'read_file', content: 'reading' });
        const ev = parseLine('gemini', line);
        assert.equal(ev?.type, 'tool_use');
        assert.equal(ev?.toolName, 'read_file');
    });

    it('parses OpenCode text and reasoning events', () => {
        const textLine = JSON.stringify({ type: 'text', sessionID: 'ses_1', part: { type: 'text', text: 'OME_SMOKE_OK' } });
        const reasoningLine = JSON.stringify({ type: 'reasoning', sessionID: 'ses_1', part: { type: 'reasoning', text: 'thinking' } });

        const textEv = parseLine('opencode', textLine);
        const reasoningEv = parseLine('opencode', reasoningLine);

        assert.equal(textEv?.type, 'assistant');
        assert.equal(textEv?.message, 'OME_SMOKE_OK');
        assert.equal(reasoningEv?.type, 'thinking');
        assert.equal(reasoningEv?.message, 'thinking');
    });

    it('parses OpenCode tool events with stable tool names', () => {
        const useLine = JSON.stringify({
            type: 'tool_use',
            sessionID: 'ses_1',
            part: { type: 'tool', callID: 'call_1', tool: 'read', input: { filePath: 'README.md' } },
        });
        const resultLine = JSON.stringify({
            type: 'tool_result',
            sessionID: 'ses_1',
            part: { type: 'tool', callID: 'call_1', tool: 'read', output: 'contents' },
        });

        const useEv = parseLine('opencode', useLine);
        const resultEv = parseLine('opencode', resultLine);

        assert.equal(useEv?.type, 'tool_use');
        assert.equal(useEv?.toolName, 'read');
        assert.equal(resultEv?.type, 'tool_result');
        assert.equal(resultEv?.toolName, 'read');
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

    it('parses Grok thought events as thinking', () => {
        const ev = parseLine('grok', '{"type":"thought","data":"Let me analyze..."}');
        assert.equal(ev?.type, 'thinking');
        assert.ok(ev?.message.includes('Let me analyze'));
    });

    it('parses Grok text events as assistant', () => {
        const ev = parseLine('grok', '{"type":"text","data":"The answer is 42"}');
        assert.equal(ev?.type, 'assistant');
        assert.ok(ev?.message.includes('42'));
    });

    it('parses Grok tool_use events', () => {
        const ev = parseLine('grok', '{"type":"tool_use","name":"Read","arguments":"{\\"path\\":\\"/foo\\"}"}');
        assert.equal(ev?.type, 'tool_use');
        assert.equal(ev?.toolName, 'Read');
    });

    it('parses Grok tool_call as tool_use (alias)', () => {
        const ev = parseLine('grok', '{"type":"tool_call","name":"Bash","arguments":"ls"}');
        assert.equal(ev?.type, 'tool_use');
        assert.equal(ev?.toolName, 'Bash');
    });

    it('parses Grok tool_result events', () => {
        const ev = parseLine('grok', '{"type":"tool_result","name":"Read","output":"file contents","status":"completed"}');
        assert.equal(ev?.type, 'tool_result');
        assert.equal(ev?.toolName, 'Read');
    });

    it('parses Grok error events', () => {
        const ev = parseLine('grok', '{"type":"error","message":"Rate limit"}');
        assert.equal(ev?.type, 'error');
        assert.ok(ev?.message.includes('Rate limit'));
    });

    it('parses Grok end events as system', () => {
        const ev = parseLine('grok', '{"type":"end","sessionId":"grok-abc"}');
        assert.equal(ev?.type, 'system');
    });
});
