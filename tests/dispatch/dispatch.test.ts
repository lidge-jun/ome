import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb, addEmployee } from '../../src/registry/db.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('dispatch', () => {
    let tmpDir: string;
    const origHome = process.env['OME_HOME'];

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'ome-test-dispatch-'));
        process.env['OME_HOME'] = tmpDir;
        initDb(join(tmpDir, 'test.db'));
    });

    afterEach(() => {
        closeDb();
        if (origHome) process.env['OME_HOME'] = origHome;
        else delete process.env['OME_HOME'];
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
    });

    it('throws on unknown employee', async () => {
        const { dispatch } = await import('../../src/dispatch/index.js');
        await assert.rejects(
            () => dispatch('NonExistent', 'do something'),
            { message: /not found/i },
        );
    });

    it('dispatch returns SpawnResult with jobId field', { skip: process.platform === 'win32' ? 'echo is a cmd builtin on Windows' : false }, async () => {
        const { dispatch } = await import('../../src/dispatch/index.js');
        addEmployee({ name: 'Echo', cli: 'echo', role: 'test' });
        const result = await dispatch('Echo', 'hello world');
        assert.equal(typeof result.text, 'string');
        assert.equal(typeof result.code, 'number');
        assert.ok(result.jobId, 'SpawnResult must include jobId after P2');
    });
});
