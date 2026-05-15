# Grok + Codex App Provider Integration

> OME v0.5.3 → v0.6.0 | 2 new providers | 8 phases

## What (non-developer summary)

OME currently speaks to 5 AI CLIs (Claude, Codex, Gemini, Copilot, OpenCode).
cli-jaw already added support for two more — **Grok** (xAI's coding agent) and
**Codex App** (OpenAI's app-server mode for Codex). This plan ports both into OME
so they can be spawned, observed, and dispatched just like the existing five.

**Grok** is a standard NDJSON CLI (like Gemini/Copilot) — `grok -p "prompt" --output-format streaming-json`.
**Codex App** is fundamentally different — it runs `codex app-server --listen stdio://` and communicates
via JSON-RPC 2.0 over stdin/stdout, not raw NDJSON lines. This requires a new client module.

## Reference

- cli-jaw commit `ea9e2e3` — `[agent] feat: add codex app and grok runtime engines`
- cli-jaw files: `src/agent/args.ts`, `src/agent/events.ts`, `src/agent/codex-app-client.ts`,
  `src/agent/codex-app-events.ts`, `src/agent/spawn.ts`, `src/cli/registry.ts`, `src/cli/readiness.ts`

## File Map

| Phase | File | Action | Lines |
|-------|------|--------|-------|
| P1 | `src/registry/types.ts` | MODIFY | +2 type union, +2 LiveQuota fields |
| P1 | `src/spawn/preflight.ts` | MODIFY | +2 path entries |
| P1 | `src/cli/index.ts` | MODIFY | +2 doctor array entries |
| P1 | `src/web/dashboard.ts` | MODIFY | +2 CLI_LIST, MODEL_MAP, select, order |
| P1 | `src/web/quota-proxy.ts` | MODIFY | +2 UNAVAILABLE entries, +2 fetch entries |
| P2 | `src/spawn/args.ts` | MODIFY | +~45 lines (grok new/resume builders + switch cases) |
| P3 | `src/observe/parser.ts` | MODIFY | +~35 lines (grok event parser + switch case) |
| P4 | `src/spawn/codex-app-client.ts` | NEW | ~200 lines (JSON-RPC 2.0 stdio client) |
| P5 | `src/spawn/codex-app-events.ts` | NEW | ~120 lines (notification → ProgressEvent mapper) |
| P6 | `src/spawn/index.ts` | MODIFY | +~80 lines (codex-app branch + grok session ID) |
| P7 | `tests/spawn/args.test.ts` | MODIFY | +~40 lines (grok/codex-app contract tests) |
| P7 | `tests/observe/parser.test.ts` | MODIFY | +~30 lines (grok event parser tests) |
| P7 | `tests/spawn/codex-app-client.test.ts` | NEW | ~80 lines |
| P7 | `tests/spawn/codex-app-events.test.ts` | NEW | ~60 lines |
| P8 | verification only | — | — |

## Phase Sequence

```
P1 Type & Registry ──→ P2 Grok Args ──→ P3 Grok Parser ──→ P4 Codex App Client
     │                                                            │
     └──────────────────────────────────────────────────── P5 Codex App Events
                                                                  │
                                                          P6 Spawn Integration
                                                                  │
                                                          P7 Tests
                                                                  │
                                                          P8 Verification
```

P1 → P2 → P3 are sequential (each builds on the prior).
P4 and P5 can run in parallel after P1.
P6 depends on P2+P3+P4+P5. P7 depends on P6. P8 is final gate.

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| P1 | Type & Registry Foundation | pending |
| P2 | Grok Spawn Args | pending |
| P3 | Grok Event Parser | pending |
| P4 | Codex App Client Module | pending |
| P5 | Codex App Event Mapper | pending |
| P6 | Spawn Integration | pending |
| P7 | Contract Tests | pending |
| P8 | Verification Matrix | pending |
