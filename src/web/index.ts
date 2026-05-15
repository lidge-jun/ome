import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { handleApiRequest } from './routes.js';
import { getDashboardHtml } from './dashboard.js';

const DEFAULT_PORT = 7700;

export interface ServerOptions {
    port?: number;
    host?: string;
    authToken?: string;
}

export function createServer(opts: ServerOptions = {}): ReturnType<typeof createHttpServer> {
    const port = opts.port ?? DEFAULT_PORT;
    const host = opts.host ?? '127.0.0.1';
    const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
    const authToken = opts.authToken ?? (isLoopback ? null : randomBytes(24).toString('hex'));

    const server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '/', `http://${host}:${port}`);

        if (url.pathname.startsWith('/api/')) {
            if (authToken && !checkAuth(req, authToken)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'unauthorized' }));
                return;
            }
            handleApiRequest(req, res, url);
            return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getDashboardHtml());
    });

    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;

    server.listen(port, host, () => {
        const base = `http://${host}:${port}`;
        console.log(`OME dashboard: ${base}`);
        if (authToken) console.log(`Auth token: ${authToken}`);
        if (!isLoopback) console.log('Warning: non-loopback bind — auth token required for API access');
    });

    return server;
}

function checkAuth(req: IncomingMessage, token: string): boolean {
    const header = req.headers['authorization'] ?? '';
    if (header === `Bearer ${token}`) return true;
    const url = new URL(req.url ?? '/', 'http://localhost');
    return url.searchParams.get('token') === token;
}
