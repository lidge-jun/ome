import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handleApiRequest } from './routes.js';
import { getDashboardHtml } from './dashboard.js';

const DEFAULT_PORT = 7700;

export function createServer(port = DEFAULT_PORT, host = '127.0.0.1'): ReturnType<typeof createHttpServer> {
    const server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '/', `http://${host}:${port}`);

        if (url.pathname.startsWith('/api/')) {
            handleApiRequest(req, res, url);
            return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getDashboardHtml());
    });

    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;

    server.listen(port, host, () => {
        console.log(`OME dashboard: http://${host}:${port}`);
    });

    return server;
}
