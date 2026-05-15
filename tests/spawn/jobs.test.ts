import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('jobs', () => {
    let tmpHome: string;
    const origHome = process.env['OME_HOME'];

    beforeEach(() => {
        tmpHome = mkdtempSync(join(tmpdir(), 'ome-test-jobs-'));
        process.env['OME_HOME'] = tmpHome;
    });

    afterEach(() => {
        if (origHome) process.env['OME_HOME'] = origHome;
        else delete process.env['OME_HOME'];
        try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* noop */ }
    });

    it('createJob returns job with running status', async () => {
        const { createJob } = await import('../../src/spawn/jobs.js');
        const job = createJob('claude', 'test prompt', 'sonnet');
        assert.ok(job.id.startsWith('job-'));
        assert.equal(job.status, 'running');
        assert.equal(job.cli, 'claude');
    });

    it('completeJob updates status to completed on code 0', async () => {
        const { createJob, completeJob, readJobMeta } = await import('../../src/spawn/jobs.js');
        const job = createJob('claude', 'test');
        completeJob(job.id, 0);
        const meta = readJobMeta(job.id);
        assert.equal(meta?.status, 'completed');
        assert.ok(meta?.completedAt);
    });

    it('completeJob marks failed on non-zero code', async () => {
        const { createJob, completeJob, readJobMeta } = await import('../../src/spawn/jobs.js');
        const job = createJob('codex', 'test');
        completeJob(job.id, 1);
        assert.equal(readJobMeta(job.id)?.status, 'failed');
    });

    it('appendJobLog and readJobLog work correctly', async () => {
        const { createJob, appendJobLog, readJobLog } = await import('../../src/spawn/jobs.js');
        const job = createJob('claude', 'test');
        appendJobLog(job.id, '{"type":"assistant"}');
        appendJobLog(job.id, '{"type":"tool_use"}');
        const lines = readJobLog(job.id);
        assert.equal(lines.length, 2);
    });

    it('isValidJobId rejects path traversal', async () => {
        const { isValidJobId, readJobMeta } = await import('../../src/spawn/jobs.js');
        assert.equal(isValidJobId('../../../etc/passwd'), false);
        assert.equal(isValidJobId('job-abc-123'), true);
        assert.equal(readJobMeta('../etc/passwd'), null);
    });

    it('listJobs returns sorted by updatedAt desc', async () => {
        const { createJob, listJobs } = await import('../../src/spawn/jobs.js');
        createJob('claude', 'a');
        createJob('codex', 'b');
        const jobs = listJobs();
        assert.ok(jobs.length >= 2);
        assert.ok(jobs[0].updatedAt >= jobs[1].updatedAt);
    });
});
