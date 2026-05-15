# Phase 03 — Fix Plan

## Goal

Make CLI compatibility a tested provider contract instead of a runtime surprise.

## Scope

This plan is focused on spawn/dispatch compatibility. It does not redesign the registry, queue, dashboard, or quota proxy.

## Already Applied Locally

### MODIFY `src/spawn/args.ts`

Observed local changes:

- `buildArgs()` now returns `BuildResult`.
- Claude keeps stdin prompt delivery and uses `--append-system-prompt`.
- Codex uses `exec --json` with cli-jaw-aligned auto/sandbox and git-check flags.
- Gemini uses headless `--prompt`, `stream-json`, trust/approval flags, and home include-directory.
- Copilot receives prompt via `-p`.
- OpenCode uses `run --thinking --format json`.
- Resume paths now declare whether stdin should receive the prompt.

### MODIFY `src/spawn/index.ts`

Observed local changes:

- `spawnAgent()` destructures `{ args, stdinPrompt }`.
- Prompt is written to stdin only when `stdinPrompt` is true.

### MODIFY `src/cli/index.ts`

Observed local changes:

- Help text now describes seeded defaults as `Frontend/Backend/Data/Docs`.

## Required Follow-Up Changes

### 1. Add arg matrix tests

#### NEW `tests/spawn/args.test.ts`

Test every supported CLI:

| Case | Expected |
|------|----------|
| `claude` new | includes `--print --verbose --output-format stream-json`; `stdinPrompt: true`. |
| `codex` new | starts with `exec`; excludes `--quiet`, `--full-auto`, `--system-prompt`; `stdinPrompt: true`. |
| `codex` resume | `exec resume <sid> <prompt>`; `stdinPrompt: false`. |
| `gemini` new | excludes `--system-prompt`; `stdinPrompt: true`. |
| `copilot` new | includes `-p <prompt> --output-format json --yolo`; `stdinPrompt: false`. |
| `opencode` new | starts with `run`; `stdinPrompt: true`. |
| `opencode` resume | `run -s <sid>`; `stdinPrompt: true`. |

### 2. Decide system prompt policy per CLI

#### MODIFY `src/spawn/args.ts`

Current local code prevents invalid flags but silently drops `systemPrompt` for non-Claude CLIs.

Pick one policy:

| Option | Behavior | Tradeoff |
|--------|----------|----------|
| A | Return a clear unsupported-system-prompt error for CLIs that cannot safely receive one. | Safest; avoids silent role loss. |
| B | Compose `systemPrompt + prompt` into the user prompt for unsupported CLIs. | Preserves behavior but weakens instruction boundary. |
| C | Extend provider contract with env/file delivery where known, such as Gemini env or Codex file context. | Best long-term; needs careful per-CLI verification. |

Recommended path: implement A immediately, then add C per provider after verified smoke tests.

### 3. Keep provider contract type narrow

#### MODIFY `src/spawn/args.ts`

Keep `BuildResult` limited to fields that the runtime actually consumes:

```typescript
export interface BuildResult {
    args: string[];
    stdinPrompt: boolean;
}
```

Generic executable model overrides should be rejected rather than represented as warnings that actual spawn would not surface.

### 4. Add optional live smoke harness

#### NEW `tests/spawn/cli-smoke.test.ts`

Gate with an env var:

```text
OME_RUN_CLI_SMOKE=1 npm test -- tests/spawn/cli-smoke.test.js
```

Smoke only installed CLIs. If a CLI binary is missing, skip that provider in the smoke test; do not fail normal CI for missing paid tools.

### 5. Add preflight diagnostics

#### NEW `src/spawn/preflight.ts`

Initial scope:

- Check whether the CLI binary is available.
- Run a safe help/version command only when explicitly requested.
- Return structured diagnostics, not thrown strings.

#### MODIFY `src/cli/index.ts`

Add one of these commands:

```text
ome doctor
ome spawn --dry-run --cli codex "prompt"
```

Recommended first patch: `ome spawn --dry-run`, because it directly exposes the command contract without requiring full provider health checks.

## Out of Scope

- Full cli-jaw parity.
- New orchestration phases.
- Web dashboard redesign.
- Replacing text-pattern stale-session detection.
- Hardcoding user-specific CLI paths.

## Risk Notes

- Do not silently compose system prompts into user prompts without documenting the behavior.
- Do not make live CLI smoke tests mandatory in `npm test`; many environments will not have every AI CLI installed.
- Do not remove existing exports while tightening spawn behavior.
- Do not normalize all CLIs back into a generic args builder after this patch; that is the original bug.
