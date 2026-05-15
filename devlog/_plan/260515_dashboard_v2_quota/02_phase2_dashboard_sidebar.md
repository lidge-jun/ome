# Phase 2 — Dashboard Sidebar: Per-CLI Quota Display

## Goal
Replace global quota bars with per-CLI quota cards in sidebar, matching cli-jaw Manager's layout.

## Sidebar Layout (MODIFY `dashboard.ts`)

Replace the current `renderSidebarQuota()` + `renderSidebarCli()` with a unified `renderCliQuota()`:

```
CLI 상태
├─ claude ●
│  max · default_claude_max_20x
│  5h ████░░░░░░ 17%  20:00
│  7d ██████░░░░ 36%  5/16
├─ codex ●
│  email · pro
│  5h █░░░░░░░░░  5%  20:00
│  7d ████████░░ 57%  5/19
├─ gemini ○
│  인증 필요
├─ opencode ●
│  (authenticated)
└─ copilot ●
   jondo1323 · free limited
```

## Key Changes

### JS: Replace `renderSidebarCli()` + `renderSidebarQuota()`

```javascript
// loadAll() changes:
// - Remove: fetch('/api/quota') for global quota
// - Add: fetch('/api/quota/live') for per-CLI quota
// - Remove: renderSidebarCli(emps), renderSidebarQuota(quota, jobs)
// - Add: renderCliQuota(liveQuota)

function renderCliQuota(liveQuota) {
    const el = document.getElementById('sb-cli-quota');
    el.replaceChildren();

    if (liveQuota.source === 'unavailable') {
        const warn = createElement('div', 'cli-unavailable', 'cli-jaw not connected');
        el.appendChild(warn);
        return;
    }

    const cliOrder = ['claude', 'codex', 'gemini', 'opencode', 'copilot'];
    for (const cli of cliOrder) {
        const entry = liveQuota[cli];
        if (!entry) continue;
        el.appendChild(makeCliQuotaCard(cli, entry));
    }
}

function makeCliQuotaCard(cli, entry) {
    // Card container
    // - Dot: green (authenticated+windows), yellow (authenticated, no windows), red (not authenticated)
    // - Icon + CLI name
    // - Account line (email · plan) if available
    // - Quota bars per window (label, percent bar, percent text, reset time)
    // - Auth warning if !authenticated
}
```

### CSS: New styles (MODIFY `dashboard-styles.ts`)

```css
.cli-quota-card { padding: 10px; border: 1px solid #e8e8e8; border-radius: 8px; margin-bottom: 8px; }
.cli-quota-header { display: flex; align-items: center; gap: 6px; }
.cli-account { font-size: .75rem; color: #888; margin: 2px 0 4px 20px; }
.quota-window { display: flex; align-items: center; gap: 6px; margin: 2px 0; font-size: .75rem; }
.quota-window .win-label { width: 24px; text-align: right; color: #666; }
.quota-window .win-bar { flex: 1; height: 6px; background: #eee; border-radius: 3px; overflow: hidden; }
.quota-window .win-fill { height: 100%; border-radius: 3px; transition: width .3s; }
.quota-window .win-pct { width: 32px; text-align: right; }
.quota-window .win-reset { color: #aaa; font-size: .7rem; }
.win-fill.ok { background: #4a9eff; }
.win-fill.warn { background: #f5a623; }
.win-fill.over { background: #e74c3c; }
.cli-auth-warn { font-size: .75rem; color: #e67e22; margin-left: 20px; }
.cli-unavailable { text-align: center; color: #999; font-size: .8rem; padding: 12px; }
```

### HTML: Sidebar section change

```html
<!-- Replace both "CLI 상태" and "Quota" sections with single unified section -->
<div class="sidebar-section">
    <h3>CLI 상태</h3>
    <div id="sb-cli-quota"></div>
</div>
<!-- Remove: <div class="sidebar-section"><h3>Quota</h3>... -->
```

## Remove Global Quota from Sidebar

- Delete `renderSidebarQuota()` function
- Keep `GET /api/quota` + `PUT /api/quota` routes (for OME-internal rate limiting if needed later)
- Remove quota form from main section (or keep as advanced config)

## Verification
- Visual: sidebar shows per-CLI bars identical to screenshot
- Fallback: "cli-jaw not connected" when cli-jaw is down
- Auto-refresh: bars update every 5s (or on manual refresh)
