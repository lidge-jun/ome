import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { preflightCli, resolveCliPath } from '../../src/spawn/preflight.js';

describe('spawn preflight', () => {
    it('resolves known CLI names to executable names', () => {
        assert.equal(resolveCliPath('claude'), 'claude');
        assert.equal(resolveCliPath('codex'), 'codex');
        assert.equal(resolveCliPath('python3'), 'python3');
    });

    it('detects an available executable without requiring an AI CLI subscription', () => {
        const result = preflightCli('node');

        assert.equal(result.cli, 'node');
        assert.equal(result.command, 'node');
        assert.equal(result.available, true);
        assert.equal(result.status, 0);
        assert.ok(result.version?.startsWith('v'));
    });

    it('reports missing executables as unavailable', () => {
        const result = preflightCli('ome-definitely-missing-cli-for-test');

        assert.equal(result.available, false);
        assert.equal(result.status, null);
        assert.match(result.error ?? '', /not found|ENOENT/i);
    });
});

