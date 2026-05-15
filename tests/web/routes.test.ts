import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb } from '../../src/registry/db.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('web routes', () => {
    let tmpDir: string;
    const origHome = process.env['OME_HOME'];

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'ome-test-web-'));
        process.env['OME_HOME'] = tmpDir;
        initDb(join(tmpDir, 'test.db'));
    });

    afterEach(() => {
        closeDb();
        if (origHome) process.env['OME_HOME'] = origHome;
        else delete process.env['OME_HOME'];
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
    });

    it('GET /api/status returns JSON', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const result = await mockRequest(handleApiRequest, 'GET', '/api/status');
        assert.equal(result.status, 200);
        const body = JSON.parse(result.body);
        assert.equal(typeof body.busy, 'boolean');
        assert.equal(typeof body.employees, 'number');
    });

    it('GET /api/employees returns array', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const result = await mockRequest(handleApiRequest, 'GET', '/api/employees');
        assert.equal(result.status, 200);
        assert.ok(Array.isArray(JSON.parse(result.body)));
    });

    it('GET /api/jobs/:id rejects invalid jobId', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const result = await mockRequest(handleApiRequest, 'GET', '/api/jobs/not-a-valid-id');
        assert.equal(result.status, 400);
    });

    it('POST /api/employees rejects missing content-type', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const result = await mockRequest(handleApiRequest, 'POST', '/api/employees', { body: '{"name":"Test"}' });
        assert.equal(result.status, 415);
    });

    it('POST /api/employees rejects invalid JSON', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const result = await mockRequest(handleApiRequest, 'POST', '/api/employees', {
            body: 'not json',
            headers: { 'content-type': 'application/json' },
        });
        assert.equal(result.status, 400);
    });

    it('POST /api/employees rejects oversized body', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const bigBody = 'x'.repeat(1024 * 1024 + 1);
        const result = await mockRequest(handleApiRequest, 'POST', '/api/employees', {
            body: bigBody,
            headers: { 'content-type': 'application/json' },
        });
        assert.equal(result.status, 400);
    });

    it('POST /api/employees creates employee with valid input', async () => {
        const { handleApiRequest } = await import('../../src/web/routes.js');
        const result = await mockRequest(handleApiRequest, 'POST', '/api/employees', {
            body: JSON.stringify({ name: 'TestBot', cli: 'claude' }),
            headers: { 'content-type': 'application/json' },
        });
        assert.equal(result.status, 201);
        const body = JSON.parse(result.body);
        assert.equal(body.name, 'TestBot');
    });
});

type Handler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, url: URL) => void;
interface MockOpts { body?: string; headers?: Record<string, string> }

function mockRequest(handler: Handler, method: string, path: string, opts?: MockOpts): Promise<{ status: number; body: string }> {
    return new Promise((resolve) => {
        const url = new URL(path, 'http://localhost');
        const chunks: Buffer[] = [];
        const mock = {
            statusCode: 200,
            writeHead(status: number, _headers?: Record<string, string>) { mock.statusCode = status; return mock; },
            end(data?: string) { if (data) chunks.push(Buffer.from(data)); resolve({ status: mock.statusCode, body: Buffer.concat(chunks).toString() }); return mock; },
        };
        const res = mock as unknown as import('node:http').ServerResponse;
        const req = {
            method,
            url: path,
            headers: opts?.headers ?? {},
            on(event: string, cb: (...args: unknown[]) => void) {
                if (event === 'data' && opts?.body) cb(Buffer.from(opts.body));
                if (event === 'end') setTimeout(() => cb(), 0);
                return this;
            },
            destroy() {},
        } as unknown as import('node:http').IncomingMessage;
        handler(req, res, url);
    });
}
