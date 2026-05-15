import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '../../src/cli/index.js');

describe('CLI smoke', () => {
    let tmpHome: string;

    beforeEach(() => {
        tmpHome = mkdtempSync(join(tmpdir(), 'ome-test-cli-'));
    });

    afterEach(() => {
        try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* noop */ }
    });

    function run(args: string[]): string {
        return execFileSync('node', [CLI, ...args], {
            encoding: 'utf8',
            env: { ...process.env, OME_HOME: tmpHome },
            timeout: 5000,
        });
    }

    it('--help shows usage', () => {
        const out = run(['--help']);
        assert.ok(out.includes('OME'));
        assert.ok(out.includes('spawn'));
        assert.ok(out.includes('web'));
    });

    it('status runs without error', () => {
        const out = run(['status']);
        assert.ok(out.includes('Employees'));
    });

    it('registry list runs on empty db', () => {
        const out = run(['registry', 'list']);
        assert.ok(out.includes('No employees'));
    });

    it('init seeds defaults and is idempotent', () => {
        const out1 = run(['init']);
        assert.ok(out1.includes('Added'));
        const out2 = run(['init']);
        assert.ok(out2.includes('Skipped'));
    });

    it('spawn --dry-run prints provider contract without spawning', () => {
        const out = run(['spawn', '--dry-run', '--cli', 'codex', '--model', 'gpt-5.5', 'hello']);
        const body = JSON.parse(out) as {
            cli: string;
            args: string[];
            promptTransport: string;
            stdinPrompt: boolean;
        };

        assert.equal(body.cli, 'codex');
        assert.deepEqual(body.args, [
            'exec',
            '--json',
            '--dangerously-bypass-approvals-and-sandbox',
            '--skip-git-repo-check',
            '-m',
            'gpt-5.5',
        ]);
        assert.equal(body.promptTransport, 'stdin');
        assert.equal(body.stdinPrompt, true);
    });

    it('doctor reports CLI preflight table', () => {
        const out = run(['doctor']);
        assert.ok(out.includes('CLI Preflight'));
        assert.ok(out.includes('claude'));
        assert.ok(out.includes('codex'));
    });

    it('unknown command exits with code 1', () => {
        try {
            run(['nonexistent']);
            assert.fail('should have thrown');
        } catch (err: unknown) {
            const execErr = err as { status: number };
            assert.equal(execErr.status, 1);
        }
    });
});
