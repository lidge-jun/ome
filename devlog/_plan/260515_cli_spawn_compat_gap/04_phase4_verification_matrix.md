# Phase 04 — Verification Matrix

## Static Gates

| Command | Required result |
|---------|-----------------|
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0 |

Run both after adding tests or changing spawn behavior.

## Unit Test Matrix

### `tests/spawn/args.test.ts`

| Assertion | Purpose |
|-----------|---------|
| Codex new args equal expected prefix `exec`. | Prevents top-level Codex invocation regression. |
| Codex args exclude `--quiet` and `--full-auto`. | Locks the crash fix. |
| Codex args exclude `--system-prompt`. | Prevents unsupported prompt flag regression. |
| Gemini args exclude `--system-prompt`. | Locks the Gemini crash fix. |
| Copilot returns `stdinPrompt: false`. | Prevents prompt being sent through the wrong channel. |
| OpenCode new args start with `run`. | Locks OpenCode invocation. |
| Resume cases return expected `stdinPrompt`. | Prevents second-turn dispatch regressions. |
| Generic CLI behavior is explicitly documented by test. | Avoids accidental hidden policy. |

## Dispatch Regression Matrix

Use existing dispatch tests as the base, then add cases for:

| Case | Expected |
|------|----------|
| Employee with Codex CLI spawns through `exec`. | `spawnAgent()` receives Codex contract. |
| Employee with prompt on unsupported system-prompt provider. | Either clear error or verified delivery policy. |
| Stale Codex session retry. | Retry gets new job ID and compatible args. |
| Session ID absent after successful run. | Dispatch succeeds but does not store invalid session. |

## Optional Live CLI Smoke

These should be opt-in because developer machines differ.

```bash
OME_RUN_CLI_SMOKE=1 npm test -- tests/spawn/cli-smoke.test.js
```

Suggested manual commands after build/link:

```bash
ome spawn --cli claude "Return the exact text OME_SMOKE_OK"
ome spawn --cli codex "Return the exact text OME_SMOKE_OK"
ome spawn --cli gemini "Return the exact text OME_SMOKE_OK"
ome spawn --cli copilot "Return the exact text OME_SMOKE_OK"
ome spawn --cli opencode "Return the exact text OME_SMOKE_OK"
```

Expected for installed and authenticated CLIs:

- Exit code 0.
- Output contains `OME_SMOKE_OK`.
- OME job metadata is completed, not failed.
- stderr is either empty or non-fatal.
- No known-invalid flags appear in the launched command contract.

Expected for missing CLIs:

- Preflight reports missing executable before dispatch.
- No employee job is marked as successfully started.

## Dry-Run Verification

If `ome spawn --dry-run` is implemented, verify:

```bash
ome spawn --dry-run --cli codex "test"
ome spawn --dry-run --cli gemini "test"
ome spawn --dry-run --cli copilot "test"
ome spawn --dry-run --cli opencode "test"
```

Each output should show:

- CLI binary.
- Args array.
- Prompt transport: `stdin` or `argv`.
- Whether system prompt is supported, rejected, or transformed.
- Any provider warnings.

## Completion Checklist

- [x] Arg matrix tests added.
- [x] Known-invalid flags covered by negative assertions.
- [x] System prompt policy selected and implemented.
- [x] Dispatch tests cover at least one non-Claude employee.
- [x] Optional live smoke harness documented as deferred.
- [x] `npm run typecheck` passes.
- [x] `npm test` passes.
- [x] README examples align with default employee names.
