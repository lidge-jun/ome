import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createJob, appendJobLog, completeJob, cancelJob, closeJobStream } from '../../src/spawn/jobs.js';
import { summarize } from '../../src/observe/summary.js';

describe('summarize', () => {
    let jobId: string;

    beforeEach(() => {
        const job = createJob('grok', 'test prompt', 'grok-build');
        jobId = job.id;
    });

    it('returns null for non-existent job', () => {
        assert.equal(summarize('job-nonexistent-000000'), null);
    });

    it('returns null for running job', () => {
        assert.equal(summarize(jobId), null);
        closeJobStream(jobId);
    });

    it('returns summary for completed job', () => {
        appendJobLog(jobId, '{"type":"thought","data":"thinking..."}');
        appendJobLog(jobId, '{"type":"text","data":"answer here"}');
        appendJobLog(jobId, '{"type":"tool_use","name":"Read","arguments":"{}"}');
        appendJobLog(jobId, '{"type":"tool_result","name":"Read","output":"data","status":"completed"}');
        appendJobLog(jobId, '{"type":"text","data":" more text"}');
        appendJobLog(jobId, '{"type":"end","sessionId":"grok-abc"}');
        completeJob(jobId, 0);
        closeJobStream(jobId);

        const s = summarize(jobId);
        assert.ok(s);
        assert.equal(s.cli, 'grok');
        assert.equal(s.model, 'grok-build');
        assert.equal(s.exitCode, 0);
        assert.deepEqual(s.toolsUsed, ['Read']);
        assert.equal(s.thinkingBlocks, 1);
        assert.ok(s.outputLength > 0);
        assert.equal(s.errorSummary, null);
        assert.ok(s.durationMs >= 0);
        assert.ok(s.eventCount >= 6);
    });

    it('captures error summary from first error event', () => {
        appendJobLog(jobId, '{"type":"error","message":"Rate limit exceeded"}');
        appendJobLog(jobId, '{"type":"error","message":"Second error"}');
        completeJob(jobId, 1);
        closeJobStream(jobId);

        const s = summarize(jobId);
        assert.ok(s);
        assert.equal(s.exitCode, 1);
        assert.ok(s.errorSummary?.includes('Rate limit'));
    });

    it('returns exitCode -1 for cancelled job', () => {
        cancelJob(jobId);
        closeJobStream(jobId);

        const s = summarize(jobId);
        assert.ok(s);
        assert.equal(s.exitCode, -1);
    });
});
