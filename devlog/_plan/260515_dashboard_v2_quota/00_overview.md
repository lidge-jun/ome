# Dashboard v2 — Per-CLI Quota + Employee Management Polish

- date: 2026-05-15
- status: plan
- phases: 3

---

## Goal

Upgrade OME dashboard from global daily/hourly quota to **per-CLI real-time quota** (matching cli-jaw Manager sidebar). Also polish employee add/remove/edit UX.

## Architecture Decision

**Proxy to cli-jaw** (not code duplication):
- OME fetches `GET http://localhost:{JAW_PORT}/api/quota` → gets per-CLI quota data
- cli-jaw already handles all auth readers (Keychain, .credentials.json, .codex/auth.json, gemini oauth, copilot token chain) and API calls (Anthropic, OpenAI, Google, GitHub)
- Zero duplication of 500+ lines of credential/API code
- Graceful fallback: if cli-jaw is unreachable, show "cli-jaw not connected" instead of quota bars

## Phases

| Phase | Scope | Files |
|-------|-------|-------|
| 01 | Quota proxy + types | `types.ts`, `quota-proxy.ts` (NEW), `routes.ts` |
| 02 | Dashboard sidebar rewrite | `dashboard.ts`, `dashboard-styles.ts` |
| 03 | Employee management polish | `dashboard.ts`, `routes.ts` |

## Data Flow (After)

```
cli-jaw server (port 3457)
  └── GET /api/quota → { claude: QuotaEntry, codex: ..., gemini: ..., opencode: ..., copilot: ... }

OME dashboard (port 7700)
  └── GET /api/quota/live → proxy to cli-jaw → per-CLI bars in sidebar
  └── GET /api/quota → (keep existing global config for OME-internal rate limiting)
```

## Gap Analysis (from user feedback)

| Issue | Current | Target |
|-------|---------|--------|
| Quota model | Global daily/hourly | Per-CLI windows (5h, 7d, 30d, F/P) |
| Auth status | Not tracked | Per-CLI dot (green/yellow/red) |
| Quota source | Job count | Real API usage via cli-jaw proxy |
| Employee add | Works | Add validation, toast feedback |
| Employee remove | Works (confirm dialog) | ✅ OK |
| Employee edit | Inline dropdowns + save | ✅ OK |
