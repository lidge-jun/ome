# OME CLI Spawn Compatibility Gap — Overview

**Date**: 2026-05-15
**Status**: implemented and locally verified
**Source**: local `ome spawn` compatibility investigation against cli-jaw dispatch behavior
**Project root**: `/Users/jun/Developer/new/700_projects/ome`

## Summary

OME was failing because it treated multiple agent CLIs as if they had one shared command-line contract. cli-jaw did not fail because it already routes each CLI through a provider-specific invocation strategy.

The immediate crashes are not just "later execution will reveal it" problems. Later execution reveals them only after OME has accepted the job, started dispatch, and handed the user a broken employee run. The fix needs two layers:

1. Encode provider-specific spawn contracts in `src/spawn/args.ts`.
2. Add compatibility tests and preflight diagnostics so invalid flags are caught before a real employee dispatch.

## File Map

```text
devlog/_plan/260515_cli_spawn_compat_gap/
├── 00_overview.md                     ← this file
├── 01_phase1_cli_surface_rca.md       ← root cause and cli-jaw comparison
├── 02_phase2_gap_matrix.md            ← full compatibility gap list
├── 03_phase3_fix_plan.md              ← implementation plan and file touch points
└── 04_phase4_verification_matrix.md   ← unit, smoke, and manual verification plan
```

## Current Worktree Context

The compatibility work is implemented across these files:

| File | Observed local status | Notes |
|------|-----------------------|-------|
| `src/spawn/args.ts` | modified | Introduces `BuildResult`, CLI-specific args, stdin routing, system prompt guard, and generic model rejection. |
| `src/spawn/preflight.ts` | new | Adds CLI path resolution and safe `--version` preflight checks. |
| `src/spawn/index.ts` | modified | Uses `stdinPrompt` before writing prompt to child stdin. |
| `src/index.ts` | modified | Exports spawn contract and preflight helpers. |
| `src/cli/index.ts` | modified | Adds `spawn --dry-run`, `doctor`, and updated help text. |
| `tests/spawn/args.test.ts` | new | Locks provider arg matrix and known-invalid flag exclusions. |
| `tests/spawn/preflight.test.ts` | new | Covers preflight helper behavior without requiring AI CLI auth. |
| `tests/dispatch/dispatch.test.ts` | modified | Verifies unsupported employee prompts are rejected before spawn. |
| `tests/cli/smoke.test.ts` | modified | Covers `spawn --dry-run` and `doctor`. |
| `README.md` | modified | Documents dry-run, doctor, and default employee names. |

This plan documents the full compatibility surface and the implemented first-pass fix.

## High-Level Verdict

OME needs a provider adapter boundary. `buildArgs()` is the right first place, but the contract must include more than `args`:

| Contract field | Why it matters |
|----------------|----------------|
| `args` | Each CLI uses different subcommands and flag names. |
| `stdinPrompt` | Some CLIs read prompt from stdin; others require prompt as an arg. |
| `env` | Gemini-style system prompt delivery may need env, not flags. |
| `outputMode` | Session ID and progress parsing depend on CLI output format. |
| `resumeMode` | Resume syntax differs by CLI. |
| `preflight` | Missing binaries and invalid flags should fail before dispatch. |

## Phases

| # | Phase | Goal | Status |
|---|-------|------|--------|
| 01 | CLI surface RCA | Explain why cli-jaw survived and OME failed | documented |
| 02 | Gap matrix | Track every CLI compatibility gap | updated |
| 03 | Fix plan | Convert findings into scoped code/test changes | implemented |
| 04 | Verification matrix | Define repeatable proof before completion | verified |

## Acceptance Criteria

- `buildArgs()` has CLI-specific behavior for Claude, Codex, Gemini, Copilot, OpenCode, and generic executables.
- Employee `systemPrompt` is either supported per CLI or explicitly rejected with a clear diagnostic.
- Resume behavior is tested per supported CLI contract.
- Unit tests assert no known-invalid flags are emitted.
- `ome spawn --dry-run` prints the provider contract without spawning.
- `ome doctor` reports known CLI binary availability without requiring auth.
- `npm run typecheck` and `npm test` pass after implementation.

## Local Verification

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 48 pass / 0 fail |
