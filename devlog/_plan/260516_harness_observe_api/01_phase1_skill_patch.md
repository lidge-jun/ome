# Skill Patch Plan — cli-jaw OME Integration

> How cli-jaw should consume OME's observe API

## Current State

cli-jaw has its own spawn code in `src/agent/`:
- `args.ts` — provider arg builders (duplicates OME's `spawn/args.ts`)
- `events.ts` — NDJSON event parsing (duplicates OME's `observe/parser.ts`)
- `spawn.ts` — process spawn + event routing (duplicates OME's `spawn/index.ts`)
- `codex-app-client.ts` — JSON-RPC client (duplicates OME's `spawn/codex-app-client.ts`)
- `codex-app-events.ts` — notification mapper (duplicates OME's `spawn/codex-app-events.ts`)

OME now provides all of this as a clean API:
```typescript
import { spawnAgent, progress, watchAll, checkStall, summarize } from 'ome';
```

## Integration Strategy

### Option A: OME as npm dependency
cli-jaw adds `ome` to `package.json` and imports directly.
- Pro: cleanest, single source of truth
- Con: OME needs to be published to npm first

### Option B: OME as local path dependency
`"ome": "file:../ome"` in package.json.
- Pro: works immediately, no publish needed
- Con: path coupling, CI needs both repos

### Option C: OME as git submodule
Clone OME into cli-jaw and import from submodule path.
- Pro: version-locked, works in CI
- Con: submodule complexity

**Recommendation: Option A** (publish to npm) as the target, with **Option B** for dev/testing.

## Skill File Changes

### 1. `skills/dev/SKILL.md`
Add OME as a known dependency for agent spawn code:
```diff
+ ## Agent Spawn Layer
+ Agent spawn, event parsing, and job tracking use the `ome` package.
+ Do not duplicate spawn logic in cli-jaw — import from ome instead.
+ Key imports: spawnAgent, progress, watchAll, checkStall, summarize
```

### 2. `CLAUDE.md` (cli-jaw instance)
Update the architecture section to reflect OME as spawn primitive:
```diff
  ## How jaw Works (Architecture)
      User message → jaw server → You (Boss agent)
                                    ├── Direct response
-                                   └── Dispatch employees via `cli-jaw dispatch`
+                                   └── Dispatch employees via ome spawn layer
+                                        ├── ome.spawnAgent() — 7 providers
+                                        ├── ome.progress() — live tracking
+                                        ├── ome.watchAll() — multiplexed events
+                                        └── ome.summarize() — post-completion
```

### 3. Agent spawn skill (new or patch)
If cli-jaw has an agent-spawn skill, update it to reference OME:
- Provider support: 7 CLIs (claude, codex, codex-app, gemini, copilot, grok, opencode)
- Spawn contract is in OME, not cli-jaw
- Harness-level features (PABCD, channels, memory) stay in cli-jaw

## Migration Path (when ready)

1. Publish OME to npm (`npm publish`)
2. Add `"ome": "^0.6.0"` to cli-jaw package.json
3. Replace cli-jaw's `src/agent/args.ts` imports → `import { buildArgs } from 'ome'`
4. Replace cli-jaw's `src/agent/events.ts` parsing → `import { parseLine } from 'ome/observe/parser'`
5. Replace cli-jaw's spawn flow → `import { spawnAgent } from 'ome'`
6. Add harness-level tracking: `import { progress, watchAll, checkStall, summarize } from 'ome'`
7. Remove duplicated files from cli-jaw's src/agent/
8. Update tests to use OME's test fixtures

## Not Now

This plan documents the integration path. Actual migration happens when:
- OME is stable enough to publish (v1.0.0)
- cli-jaw is ready for the dependency change
- User approves the migration scope
