# P8 — Verification Matrix

Final gate before merge. All checks must pass.

## Static Analysis

| Check | Command | Expected |
|-------|---------|----------|
| TypeScript | `npx tsc --noEmit` | 0 errors |
| Build | `npm run build` | clean dist/ |
| Lint (if present) | `npm run lint` | 0 errors |

## Unit Tests

| Check | Command | Expected |
|-------|---------|----------|
| Full suite | `npm test` | All pass, 0 failures |
| Args contract | grok new/resume/systemPrompt rejection, codex-app guard | 5 new cases pass |
| Parser contract | grok thought/text/tool_use/tool_result/error/end | 7 new cases pass |
| Event mapper | codex-app all notification types + edge cases | 9 new cases pass |
| Session ID | grok end-only extraction | 1 new case passes |

## CLI Surface

| Check | Command | Expected |
|-------|---------|----------|
| Doctor | `node dist/cli/index.js doctor` | Lists 7 CLIs (claude, codex, codex-app, gemini, copilot, grok, opencode) |
| Dry-run grok | `node dist/cli/index.js spawn --cli grok --dry-run "test"` | Prints grok args |
| Dry-run codex-app | `node dist/cli/index.js spawn --cli codex-app --dry-run "test"` | Prints codex-app notice |

## Live Smoke (requires installed CLIs)

| CLI | Installed | Test |
|-----|-----------|------|
| grok | Check `which grok` | `ome spawn --cli grok "echo test"` → job completes |
| codex-app | Check `which codex` | `ome spawn --cli codex-app "echo test"` → JSON-RPC lifecycle completes |

### Grok Smoke Checklist
- [ ] `grok --version` succeeds
- [ ] `grok models` shows `grok-build`
- [ ] `ome spawn --cli grok "say hello"` → job creates, NDJSON streams, job completes
- [ ] `ome inspect <jobId>` → shows parsed events (thinking, assistant, tool_use)
- [ ] `ome result <jobId>` → shows final text output
- [ ] Session ID captured from `end` event

### Codex App Smoke Checklist
- [ ] `codex --version` succeeds
- [ ] `codex app-server --listen stdio://` starts (manual check)
- [ ] `ome spawn --cli codex-app "say hello"` → JSON-RPC client lifecycle completes
- [ ] `ome inspect <jobId>` → shows parsed notifications (tool_use, assistant, system)
- [ ] `ome result <jobId>` → shows final text output
- [ ] Session ID (threadId) captured from `turn/started`

## Dashboard Verification

- [ ] Dashboard `<select>` shows 7 CLI options
- [ ] Model dropdown updates for codex-app (gpt-5.5, gpt-5.4, gpt-5.4-mini)
- [ ] Model dropdown updates for grok (grok-build)
- [ ] Quota section shows both new providers

## Regression Checks

- [ ] Existing 5 providers still work (claude, codex, gemini, copilot, opencode)
- [ ] `ome spawn --cli claude "test"` unchanged
- [ ] `ome spawn --cli codex "test"` unchanged (codex CLI vs codex-app distinction works)
- [ ] Generic fallback still works (`ome spawn --cli python3 "test"`)

## Version Bump

After all checks pass: `0.5.3 → 0.6.0` (minor: new provider support is a feature addition).

Update `package.json`:
```diff
- "version": "0.5.3",
+ "version": "0.6.0",
```

Update keywords:
```diff
- "keywords": ["ai", "agent", "orchestration", "multi-agent", "claude", "codex", "gemini", "cli"],
+ "keywords": ["ai", "agent", "orchestration", "multi-agent", "claude", "codex", "codex-app", "gemini", "grok", "cli"],
```
