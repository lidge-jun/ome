import type { LiveQuota } from '../registry/types.js';

const JAW_PORT = process.env['JAW_PORT'] ?? '3457';
const QUOTA_URL = `http://127.0.0.1:${JAW_PORT}/api/quota`;
const CACHE_TTL = 30_000;

let cache: { data: LiveQuota; ts: number } | null = null;

const UNAVAILABLE: LiveQuota = {
    claude: { authenticated: false },
    codex: { authenticated: false },
    gemini: { authenticated: false },
    opencode: { authenticated: false },
    copilot: { authenticated: false },
    fetchedAt: '',
    source: 'unavailable',
};

export async function fetchLiveQuota(): Promise<LiveQuota> {
    if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;
    try {
        const resp = await fetch(QUOTA_URL, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) throw new Error(`quota fetch ${resp.status}`);
        const raw = await resp.json() as Record<string, unknown>;
        const data: LiveQuota = {
            claude: (raw.claude ?? { authenticated: false }) as LiveQuota['claude'],
            codex: (raw.codex ?? { authenticated: false }) as LiveQuota['codex'],
            gemini: (raw.gemini ?? { authenticated: false }) as LiveQuota['gemini'],
            opencode: (raw.opencode ?? { authenticated: false }) as LiveQuota['opencode'],
            copilot: (raw.copilot ?? { authenticated: false }) as LiveQuota['copilot'],
            fetchedAt: new Date().toISOString(),
            source: 'cli-jaw',
        };
        cache = { data, ts: Date.now() };
        return data;
    } catch {
        return { ...UNAVAILABLE, fetchedAt: new Date().toISOString() };
    }
}
