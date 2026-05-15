import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb, listEmployees } from '../../src/registry/db.js';
import { seedDefaults } from '../../src/seed/index.js';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('seedDefaults', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'ome-test-seed-'));
        initDb(join(tmpDir, 'test.db'));
    });

    afterEach(() => {
        closeDb();
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
    });

    it('seeds 4 default employees', () => {
        const { added, skipped } = seedDefaults();
        assert.equal(added.length, 4);
        assert.equal(skipped.length, 0);
        assert.equal(listEmployees().length, 4);
    });

    it('is idempotent — second call skips all', () => {
        seedDefaults();
        const { added, skipped } = seedDefaults();
        assert.equal(added.length, 0);
        assert.equal(skipped.length, 4);
        assert.equal(listEmployees().length, 4);
    });
});
