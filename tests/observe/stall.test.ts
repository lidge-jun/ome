import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createJob, appendJobLog, completeJob, closeJobStream } from '../../src/spawn/jobs.js';
import { checkStall } from '../../src/observe/stall.js';

describe('checkStall', () => {
    let jobId: string;

    beforeEach(() => {
        const job = createJob('claude', 'test prompt');
        jobId = job.id;
    });

    it('returns null for non-existent job', () => {
        assert.equal(checkStall('job-nonexistent-000000'), null);
    });

    it('returns null for completed job', () => {
        completeJob(jobId, 0);
        closeJobStream(jobId);
        assert.equal(checkStall(jobId), null);
    });

    it('returns active for job with recent events', () => {
        appendJobLog(jobId, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'working' }] } }));
        const s = checkStall(jobId, { warningMs: 60_000, timeoutMs: 120_000 });
        assert.ok(s);
        assert.equal(s.state, 'active');
        assert.ok(s.silentMs < 5000);
        assert.ok(s.lastEventAt);
        closeJobStream(jobId);
    });

    it('detects stall with very short threshold', () => {
        const s = checkStall(jobId, { warningMs: 0, timeoutMs: 0 });
        assert.ok(s);
        assert.equal(s.state, 'stalled');
        closeJobStream(jobId);
    });

    it('detects warning state', () => {
        const s = checkStall(jobId, { warningMs: 0, timeoutMs: 999_999 });
        assert.ok(s);
        assert.equal(s.state, 'warning');
        closeJobStream(jobId);
    });
});
