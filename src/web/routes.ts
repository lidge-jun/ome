import type { IncomingMessage, ServerResponse } from 'node:http';
import { listEmployees, addEmployee, removeEmployee, updateEmployee, getQuota, setQuota } from '../registry/db.js';
import { listJobs, isValidJobId } from '../spawn/jobs.js';
import { isAgentBusy, getActiveJobs } from '../spawn/index.js';
import { inspect } from '../observe/index.js';
import { messageQueue } from '../queue/index.js';
import { fetchLiveQuota } from './quota-proxy.js';

const MAX_BODY = 1024 * 1024;
const MUTATION_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

export function handleApiRequest(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const method = req.method ?? 'GET';
    const path = url.pathname;

    if (MUTATION_METHODS.has(method)) {
        const origin = req.headers['origin'];
        const host = req.headers['host'];
        if (origin && host && !origin.includes(host)) {
            error(res, 403, 'origin mismatch');
            return;
        }
    }

    try {
        // Employees
        if (path === '/api/employees' && method === 'GET') {
            json(res, listEmployees());
            return;
        }
        if (path === '/api/employees' && method === 'POST') {
            if (!isJsonContent(req)) { error(res, 415, 'Content-Type must be application/json'); return; }
            readBody(req).then(body => {
                let parsed: Record<string, unknown>;
                try { parsed = JSON.parse(body); } catch { error(res, 400, 'invalid JSON'); return; }
                const name = parsed['name'];
                if (typeof name !== 'string' || !name.trim()) { error(res, 400, 'name required'); return; }
                const emp = addEmployee({
                    name: name.trim(),
                    cli: String(parsed['cli'] ?? 'claude'),
                    model: parsed['model'] ? String(parsed['model']) : undefined,
                    role: parsed['role'] ? String(parsed['role']) : undefined,
                });
                json(res, emp, 201);
            }).catch(() => error(res, 400, 'body read failed'));
            return;
        }
        if (path.startsWith('/api/employees/') && method === 'PUT') {
            if (!isJsonContent(req)) { error(res, 415, 'Content-Type must be application/json'); return; }
            const name = decodeURIComponent(path.slice('/api/employees/'.length));
            readBody(req).then(body => {
                let parsed: Record<string, unknown>;
                try { parsed = JSON.parse(body); } catch { error(res, 400, 'invalid JSON'); return; }
                const emp = updateEmployee(name, {
                    cli: parsed['cli'] ? String(parsed['cli']) : undefined,
                    model: parsed['model'] ? String(parsed['model']) : undefined,
                    role: parsed['role'] ? String(parsed['role']) : undefined,
                });
                if (!emp) { error(res, 404, 'employee not found'); return; }
                json(res, emp);
            }).catch(() => error(res, 400, 'body read failed'));
            return;
        }
        if (path.startsWith('/api/employees/') && method === 'DELETE') {
            const name = decodeURIComponent(path.slice('/api/employees/'.length));
            const ok = removeEmployee(name);
            json(res, { removed: ok });
            return;
        }

        // Jobs
        if (path === '/api/jobs' && method === 'GET') {
            json(res, listJobs());
            return;
        }
        if (path.startsWith('/api/jobs/') && method === 'GET') {
            const jobId = decodeURIComponent(path.slice('/api/jobs/'.length));
            if (!isValidJobId(jobId)) { error(res, 400, 'invalid job ID'); return; }
            const state = inspect(jobId);
            if (!state) { error(res, 404, 'job not found'); return; }
            json(res, state);
            return;
        }

        // Live Quota (proxy to cli-jaw)
        if (path === '/api/quota/live' && method === 'GET') {
            fetchLiveQuota().then(data => json(res, data)).catch(() => error(res, 502, 'quota proxy failed'));
            return;
        }

        // Quota
        if (path === '/api/quota' && method === 'GET') {
            json(res, getQuota());
            return;
        }
        if (path === '/api/quota' && method === 'PUT') {
            if (!isJsonContent(req)) { error(res, 415, 'Content-Type must be application/json'); return; }
            readBody(req).then(body => {
                let config: Record<string, unknown>;
                try { config = JSON.parse(body); } catch { error(res, 400, 'invalid JSON'); return; }
                setQuota({
                    dailyLimit: typeof config['dailyLimit'] === 'number' ? config['dailyLimit'] : 0,
                    hourlyLimit: typeof config['hourlyLimit'] === 'number' ? config['hourlyLimit'] : 0,
                });
                json(res, { ok: true });
            }).catch(() => error(res, 400, 'body read failed'));
            return;
        }

        // Status
        if (path === '/api/status' && method === 'GET') {
            json(res, {
                busy: isAgentBusy(),
                activeJobs: getActiveJobs().size,
                queueDepth: messageQueue.length,
                employees: listEmployees().length,
            });
            return;
        }

        error(res, 404, 'not found');
    } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('UNIQUE constraint')) {
            error(res, 409, 'already exists');
        } else {
            console.error('[ome-web]', err);
            error(res, 500, 'internal error');
        }
    }
}

function json(res: ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function error(res: ServerResponse, status: number, msg: string): void {
    json(res, { error: msg }, status);
}

function isJsonContent(req: IncomingMessage): boolean {
    const ct = req.headers['content-type'] ?? '';
    return ct.includes('application/json');
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY) { req.destroy(); reject(new Error('body too large')); return; }
            body += chunk;
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}
