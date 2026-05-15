# Phase 1 — Quota Proxy to cli-jaw

## Goal
Add a server-side proxy that fetches per-CLI quota from cli-jaw and exposes it as `/api/quota/live`.

## Types (MODIFY `src/registry/types.ts`)

```typescript
// Append — reuse cli-jaw's QuotaEntry shape
export interface QuotaWindow {
    label: string;       // "5h", "7d", "F", "P", "30d"
    percent: number;     // 0-100 (used %)
    resetsAt?: string | number | null;
    modelId?: string;
}

export interface QuotaEntry {
    account?: { email?: string; type?: string; plan?: string; tier?: string };
    windows?: QuotaWindow[];
    authenticated?: boolean;
    error?: boolean;
    reason?: string;
}

export interface LiveQuota {
    claude: QuotaEntry;
    codex: QuotaEntry;
    gemini: QuotaEntry;
    opencode: QuotaEntry;
    copilot: QuotaEntry;
    fetchedAt: string;
    source: 'cli-jaw' | 'unavailable';
}
```

## New File: `src/web/quota-proxy.ts`

```typescript
const JAW_PORT = process.env['JAW_PORT'] ?? '3457';
const QUOTA_URL = `http://127.0.0.1:${JAW_PORT}/api/quota`;
const CACHE_TTL = 30_000; // 30s cache

let cache: { data: LiveQuota; ts: number } | null = null;

export async function fetchLiveQuota(): Promise<LiveQuota> {
    if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;
    try {
        const resp = await fetch(QUOTA_URL, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) throw new Error(`quota fetch ${resp.status}`);
        const raw = await resp.json();
        const data: LiveQuota = { ...raw, fetchedAt: new Date().toISOString(), source: 'cli-jaw' };
        cache = { data, ts: Date.now() };
        return data;
    } catch {
        return {
            claude: { authenticated: false },
            codex: { authenticated: false },
            gemini: { authenticated: false },
            opencode: { authenticated: false },
            copilot: { authenticated: false },
            fetchedAt: new Date().toISOString(),
            source: 'unavailable',
        };
    }
}
```

## Route (MODIFY `src/web/routes.ts`)

```typescript
// Add after existing /api/quota routes:
if (path === '/api/quota/live' && method === 'GET') {
    fetchLiveQuota().then(data => json(res, data)).catch(() => error(res, 502, 'quota proxy failed'));
    return;
}
```

## Verification
- `tsc --noEmit` passes
- `curl http://127.0.0.1:7700/api/quota/live` returns per-CLI data when cli-jaw is running
- Returns `source: "unavailable"` when cli-jaw is down
