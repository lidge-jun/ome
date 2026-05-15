import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createJob, appendJobLog, completeJob, closeJobStream } from '../../src/spawn/jobs.js';
import { progress } from '../../src/observe/progress.js';

describe('progress', () => {
    let jobId: string;

    beforeEach(() => {
        const job = createJob('claude', 'test prompt');
        jobId = job.id;
    });

    it('returns null for non-existent job', () => {
        assert.equal(progress('job-nonexistent-000000'), null);
    });

    it('returns progress for running job with events', () => {
        appendJobLog(jobId, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello world' }] } }));
        appendJobLog(jobId, JSON.stringify({ type: 'tool_use', tool: { name: 'Read' } }));
        appendJobLog(jobId, JSON.stringify({ type: 'tool_result', tool: { name: 'Read' } }));

        const p = progress(jobId);
        assert.ok(p);
        assert.equal(p.cli, 'claude');
        assert.equal(p.status, 'running');
        assert.equal(p.tools.total, 1);
        assert.equal(p.tools.completed, 1);
        assert.equal(p.tools.running, 0);
        assert.ok(p.outputChars > 0);
        assert.ok(p.elapsedMs >= 0);
        assert.ok(p.lastActivity);
        assert.equal(p.eventCount, 3);
        closeJobStream(jobId);
    });

    it('tracks multiple running tools', () => {
        appendJobLog(jobId, JSON.stringify({ type: 'tool_use', tool: { name: 'Read' } }));
        appendJobLog(jobId, JSON.stringify({ type: 'tool_use', tool: { name: 'Bash' } }));

        const p = progress(jobId);
        assert.ok(p);
        assert.equal(p.tools.total, 2);
        assert.equal(p.tools.running, 2);
        assert.equal(p.tools.completed, 0);
        closeJobStream(jobId);
    });

    it('calculates elapsed for completed job', () => {
        completeJob(jobId, 0);
        closeJobStream(jobId);

        const p = progress(jobId);
        assert.ok(p);
        assert.equal(p.status, 'completed');
        assert.ok(p.elapsedMs >= 0);
    });
});
