# P1 — Type & Registry Foundation

Every file that hardcodes the 5-provider list must be updated to include `grok` and `codex-app`.

## 1.1 AgentCli Type Union

**File:** `src/registry/types.ts:1`

```diff
- export type AgentCli = 'claude' | 'codex' | 'gemini' | 'copilot' | 'opencode' | string;
+ export type AgentCli = 'claude' | 'codex' | 'codex-app' | 'gemini' | 'copilot' | 'grok' | 'opencode' | string;
```

## 1.2 LiveQuota Interface

**File:** `src/registry/types.ts:112-120`

```diff
  export interface LiveQuota {
      claude: QuotaEntry;
      codex: QuotaEntry;
+     'codex-app': QuotaEntry;
      gemini: QuotaEntry;
+     grok: QuotaEntry;
      opencode: QuotaEntry;
      copilot: QuotaEntry;
      fetchedAt: string;
      source: 'cli-jaw' | 'unavailable';
  }
```

## 1.3 CLI Path Resolution

**File:** `src/spawn/preflight.ts:16-23`

```diff
  const known: Record<string, string> = {
      claude: 'claude',
      codex: 'codex',
+     'codex-app': 'codex',     // same binary, different subcommand
      gemini: 'gemini',
      copilot: 'copilot',
+     grok: 'grok',
      opencode: 'opencode',
  };
```

## 1.4 Doctor CLI List

**File:** `src/cli/index.ts:335`

```diff
- const clis = ['claude', 'codex', 'gemini', 'copilot', 'opencode'];
+ const clis = ['claude', 'codex', 'codex-app', 'gemini', 'copilot', 'grok', 'opencode'];
```

Note: `codex-app` resolves to the same `codex` binary. Doctor will show it as available if codex is installed.

## 1.5 Dashboard: CLI_LIST, MODEL_MAP, Select, Order

**File:** `src/web/dashboard.ts`

### Line 60 — `<select>` options:
```diff
- <select id="add-cli"><option>claude</option><option>codex</option><option>gemini</option><option>copilot</option><option>opencode</option></select>
+ <select id="add-cli"><option>claude</option><option>codex</option><option>codex-app</option><option>gemini</option><option>copilot</option><option>grok</option><option>opencode</option></select>
```

### Line 112 — CLI_LIST:
```diff
- const CLI_LIST=['claude','codex','gemini','copilot','opencode'];
+ const CLI_LIST=['claude','codex','codex-app','gemini','copilot','grok','opencode'];
```

### Line 113 — MODEL_MAP:
```diff
- const MODEL_MAP={claude:['opus','sonnet','haiku'],codex:['gpt-5.5','o3','o4-mini'],gemini:['gemini-3.1-pro','gemini-2.5-flash'],copilot:['gpt-4o'],opencode:['']};
+ const MODEL_MAP={claude:['opus','sonnet','haiku'],codex:['gpt-5.5','o3','o4-mini'],'codex-app':['gpt-5.5','gpt-5.4','gpt-5.4-mini'],gemini:['gemini-3.1-pro','gemini-2.5-flash'],copilot:['gpt-4o'],grok:['grok-build'],opencode:['']};
```

### Line 173 — display order:
```diff
- const order=['claude','codex','gemini','opencode','copilot'];
+ const order=['claude','codex','codex-app','gemini','opencode','copilot','grok'];
```

## 1.6 Quota Proxy

**File:** `src/web/quota-proxy.ts`

### Lines 9-17 — UNAVAILABLE constant:
```diff
  const UNAVAILABLE: LiveQuota = {
      claude: { authenticated: false },
      codex: { authenticated: false },
+     'codex-app': { authenticated: false },
      gemini: { authenticated: false },
+     grok: { authenticated: false },
      opencode: { authenticated: false },
      copilot: { authenticated: false },
      fetchedAt: '',
      source: 'unavailable',
  };
```

### Lines 25-33 — fetchLiveQuota data construction:
```diff
  const data: LiveQuota = {
      claude: (raw.claude ?? { authenticated: false }) as LiveQuota['claude'],
      codex: (raw.codex ?? { authenticated: false }) as LiveQuota['codex'],
+     'codex-app': (raw['codex-app'] ?? { authenticated: false }) as LiveQuota['codex-app'],
      gemini: (raw.gemini ?? { authenticated: false }) as LiveQuota['gemini'],
+     grok: (raw.grok ?? { authenticated: false }) as LiveQuota['grok'],
      opencode: (raw.opencode ?? { authenticated: false }) as LiveQuota['opencode'],
      copilot: (raw.copilot ?? { authenticated: false }) as LiveQuota['copilot'],
      fetchedAt: new Date().toISOString(),
      source: 'cli-jaw',
  };
```

## Verification Gate

- `npx tsc --noEmit` passes
- `ome doctor` lists 7 CLIs
- Dashboard renders 7 CLI options in the select dropdown
