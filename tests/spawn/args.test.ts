import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { buildArgs } from '../../src/spawn/args.js';

describe('spawn args', () => {
    it('builds Claude stream-json args and keeps stdin prompt transport', () => {
        const result = buildArgs('claude', 'hello', {
            model: 'opus',
            systemPrompt: 'You are Frontend.',
        });

        assert.deepEqual(result.args, [
            '--print',
            '--verbose',
            '--output-format',
            'stream-json',
            '--include-partial-messages',
            '--model',
            'opus',
            '--append-system-prompt',
            'You are Frontend.',
        ]);
        assert.equal(result.stdinPrompt, true);
    });

    it('builds Codex exec args without known-invalid flags', () => {
        const result = buildArgs('codex', 'hello', { model: 'gpt-5.5' });

        assert.deepEqual(result.args, [
            'exec',
            '--json',
            '--dangerously-bypass-approvals-and-sandbox',
            '--skip-git-repo-check',
            '-m',
            'gpt-5.5',
        ]);
        assert.equal(result.stdinPrompt, true);
        assertKnownInvalidFlagsAbsent(result.args);
    });

    it('builds Codex resume args with prompt in argv', () => {
        const result = buildArgs('codex', 'resume prompt', {
            sessionId: 'sid-123',
            model: 'gpt-5.5',
        });

        assert.deepEqual(result.args, [
            'exec',
            'resume',
            '--json',
            '--dangerously-bypass-approvals-and-sandbox',
            '--skip-git-repo-check',
            '-m',
            'gpt-5.5',
            'sid-123',
            'resume prompt',
        ]);
        assert.equal(result.stdinPrompt, false);
        assertKnownInvalidFlagsAbsent(result.args);
    });

    it('builds Gemini args without unsupported system-prompt flag', () => {
        const result = buildArgs('gemini', 'hello', { model: 'gemini-3.1-pro' });

        assert.deepEqual(result.args, [
            '--prompt',
            'hello',
            '--output-format',
            'stream-json',
            '--skip-trust',
            '--approval-mode',
            'yolo',
            '--include-directories',
            homedir(),
            '--model',
            'gemini-3.1-pro',
        ]);
        assert.equal(result.stdinPrompt, false);
        assert.equal(result.args.includes('--system-prompt'), false);
    });

    it('rejects unsupported system prompts instead of silently dropping them', () => {
        assert.throws(
            () => buildArgs('gemini', 'hello', { systemPrompt: 'You are Data.' }),
            /systemPrompt is not supported for CLI "gemini"/,
        );
        assert.throws(
            () => buildArgs('codex', 'hello', { systemPrompt: 'You are Backend.' }),
            /systemPrompt is not supported for CLI "codex"/,
        );
    });

    it('builds Copilot args with prompt in argv', () => {
        const result = buildArgs('copilot', 'hello', { model: 'gpt-5' });

        assert.deepEqual(result.args, ['-p', 'hello', '--output-format', 'json', '--yolo', '--model', 'gpt-5']);
        assert.equal(result.stdinPrompt, false);
    });

    it('builds Gemini resume args with prompt in argv', () => {
        const result = buildArgs('gemini', 'continue', {
            sessionId: 'sid-456',
            model: 'gemini-3.1-pro',
        });

        assert.deepEqual(result.args, [
            '--resume',
            'sid-456',
            '--prompt',
            'continue',
            '--output-format',
            'stream-json',
            '--skip-trust',
            '--approval-mode',
            'yolo',
            '--include-directories',
            homedir(),
            '--model',
            'gemini-3.1-pro',
        ]);
        assert.equal(result.stdinPrompt, false);
    });

    it('builds OpenCode run args for new and resume sessions', () => {
        const fresh = buildArgs('opencode', 'hello', { model: 'sonnet' });
        const resumed = buildArgs('opencode', 'continue', { sessionId: 'sid-456', model: 'sonnet' });
        const defaultModel = buildArgs('opencode', 'hello');

        assert.deepEqual(fresh.args, ['run', '--thinking', '--format', 'json', '-m', 'sonnet', 'hello']);
        assert.equal(fresh.stdinPrompt, false);
        assert.deepEqual(resumed.args, ['run', '-s', 'sid-456', '--thinking', '--format', 'json', '-m', 'sonnet', 'continue']);
        assert.equal(resumed.stdinPrompt, false);
        assert.deepEqual(defaultModel.args, ['run', '--thinking', '--format', 'json', '-m', 'opencode-go/kimi-k2.6', 'hello']);
    });

    it('keeps generic executables raw', () => {
        const result = buildArgs('python3', 'print("hello")');

        assert.deepEqual(result.args, []);
        assert.equal(result.stdinPrompt, true);
    });

    it('rejects model overrides for generic executables', () => {
        assert.throws(
            () => buildArgs('python3', 'print("hello")', { model: 'unused-model' }),
            /Model override is not supported for generic CLI "python3"/,
        );
    });

    it('rejects generic session resume instead of silently starting fresh', () => {
        assert.throws(
            () => buildArgs('python3', 'print("hello")', { sessionId: 'sid-789' }),
            /Session resume is not supported for generic CLI "python3"/,
        );
    });
});

function assertKnownInvalidFlagsAbsent(args: string[]): void {
    assert.equal(args.includes('--quiet'), false);
    assert.equal(args.includes('--full-auto'), false);
    assert.equal(args.includes('--system-prompt'), false);
}
