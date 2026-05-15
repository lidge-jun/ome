import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('inspect', () => {
    let tmpHome: string;
    const origHome = process.env['OME_HOME'];

    beforeEach(() => {
        tmpHome = mkdtempSync(join(tmpdir(), 'ome-test-inspect-'));
        process.env['OME_HOME'] = tmpHome;
    });

    afterEach(() => {
        if (origHome) process.env['OME_HOME'] = origHome;
        else delete process.env['OME_HOME'];
        try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* noop */ }
    });

    it('returns null for non-existent job', async () => {
        const { inspect } = await import('../../src/observe/index.js');
        assert.equal(inspect('job-nonexistent-abc'), null);
    });

    it('returns LiveRunState for existing job with events', async () => {
        const { createJob, appendJobLog } = await import('../../src/spawn/jobs.js');
        const { inspect } = await import('../../src/observe/index.js');

        const job = createJob('claude', 'test');
        appendJobLog(job.id, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } }));
        appendJobLog(job.id, JSON.stringify({ type: 'tool_use', tool: { name: 'Read' } }));

        const state = inspect(job.id);
        assert.ok(state);
        assert.equal(state.jobId, job.id);
        assert.equal(state.cli, 'claude');
        assert.equal(state.eventCount, 2);
        assert.equal(state.toolCalls.length, 1);
        assert.equal(state.toolCalls[0].name, 'Read');
    });
});
