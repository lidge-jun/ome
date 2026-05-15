# Phase 02 — Compatibility Gap Matrix

## Severity Legend

| Severity | Meaning |
|----------|---------|
| BLOCKER | Causes immediate spawn/dispatch failure or silently drops core employee behavior. |
| HIGH | Breaks resume, system prompt, or observability in common paths. |
| MEDIUM | Causes confusing UX, missing diagnostics, or provider-specific edge failures. |
| LOW | Cleanup or documentation gap. |

## A. Args and Flags

| ID | Gap | Severity | Current local status |
|----|-----|----------|----------------------|
| A1 | Codex used invalid `--quiet` / `--full-auto` flags. | BLOCKER | fixed locally by using `exec`. |
| A2 | Codex new-run path lacked the required `exec` subcommand. | BLOCKER | fixed locally. |
| A3 | Codex model flag used generic `--model`; current local code uses `-m`. | HIGH | fixed locally; needs test. |
| A4 | Gemini received `--system-prompt`, which is not a safe shared contract. | BLOCKER | fixed locally by rejecting system prompts and using `--prompt`. |
| A5 | Copilot likely requires prompt as an argument, not stdin. | BLOCKER | fixed locally with `-p prompt`; needs test. |
| A6 | OpenCode new-run path needs `run`. | BLOCKER | fixed locally. |
| A7 | OpenCode resume path needs `run -s <sid>`. | HIGH | fixed locally; needs test. |
| A8 | Generic executables still receive `--model` when `opts.model` exists. | MEDIUM | fixed locally by rejecting generic model overrides. |
| A9 | Claude flags are assumed valid but should be pinned by tests against expected contract. | MEDIUM | fixed locally by arg matrix tests; aligned to cli-jaw `--append-system-prompt` + partial stream. |

## B. Prompt and System Prompt Transport

| ID | Gap | Severity | Current local status |
|----|-----|----------|----------------------|
| B1 | OME had one prompt transport path: stdin. | BLOCKER | partially fixed with `stdinPrompt`. |
| B2 | Codex employee `systemPrompt` is dropped after removing unsupported flag delivery. | HIGH | fixed locally by explicit rejection. |
| B3 | Gemini employee `systemPrompt` is dropped after removing unsupported flag delivery. | HIGH | fixed locally by explicit rejection. |
| B4 | Generic CLI `systemPrompt` behavior is undefined. | MEDIUM | fixed locally by explicit rejection. |
| B5 | There is no explicit "unsupported systemPrompt for this CLI" diagnostic. | HIGH | fixed locally. |
| B6 | Provider prompt composition is not centralized, so future CLIs can regress. | MEDIUM | covered by arg matrix tests for supported CLIs. |

## C. Session and Resume

| ID | Gap | Severity | Current local status |
|----|-----|----------|----------------------|
| C1 | Resume syntax differs by CLI but is only lightly encoded. | HIGH | partially fixed in `buildResumeResult()`. |
| C2 | Codex resume passes prompt as an arg and disables stdin. | HIGH | fixed locally with `exec resume --json ...`, bypass approvals, and skip git repo check; unit-tested. |
| C3 | Gemini resume uses `--resume <sid>` with headless prompt. | HIGH | fixed locally with `--prompt`, `stream-json`, `--skip-trust`, `--approval-mode yolo`, and home include-directory; unit-tested. |
| C4 | Copilot resume uses `--resume <sid> -p <prompt>`. | MEDIUM | fixed locally; unit-tested. |
| C5 | Generic CLI resume falls back to new-run behavior. | MEDIUM | fixed locally by explicit rejection. |
| C6 | Stale session detection is text-pattern based and provider-agnostic. | MEDIUM | existing behavior; needs provider-specific additions as failures appear. |

## D. Output, Parser, and Session ID Capture

| ID | Gap | Severity | Current local status |
|----|-----|----------|----------------------|
| D1 | Session ID capture only checks JSON lines for `session_id`, `sessionId`, `conversation_id`. | HIGH | unresolved. |
| D2 | Codex local args do not request explicit JSON output. | HIGH | fixed locally with `--json`. |
| D3 | Gemini output format is not pinned. | MEDIUM | fixed locally with `--output-format stream-json`. |
| D4 | Copilot output is set to JSON but parser contract is not tested. | MEDIUM | partially configured; unverified. |
| D5 | OpenCode output format is not pinned. | MEDIUM | fixed locally with `--thinking --format json` and cli-jaw-aligned default `opencode-go/kimi-k2.6`. |
| D6 | `watch` / `inspect` may parse provider output incorrectly while the CLI itself succeeds. | MEDIUM | reduced by pinned JSON modes; provider-specific parser enrichment remains future work. |

## E. Defaults and Registry

| ID | Gap | Severity | Current local status |
|----|-----|----------|----------------------|
| E1 | Seeded employees use model names that may not be valid for the installed CLI version. | MEDIUM | partially addressed by `ome doctor`; provider/model validation remains future work. |
| E2 | README examples still mention older employee names in some places, such as `Claude` / `Codex`. | LOW | fixed locally. |
| E3 | Employee prompt storage exists, but provider support is not guaranteed. | HIGH | fixed locally by failing unsupported providers clearly. |
| E4 | OME has no `doctor` command to validate installed CLIs, versions, and supported flags. | HIGH | fixed locally with `ome doctor` binary/version preflight. |

## F. Test and Preflight Coverage

| ID | Gap | Severity | Current local status |
|----|-----|----------|----------------------|
| F1 | No unit tests lock the CLI arg matrix. | BLOCKER | fixed locally. |
| F2 | No regression test asserts known-invalid flags are absent. | BLOCKER | fixed locally. |
| F3 | No live smoke test harness for installed CLIs. | HIGH | deferred; normal tests stay offline/auth-free. |
| F4 | No dry-run output for users to inspect exact spawn command safely. | MEDIUM | fixed locally with `ome spawn --dry-run`. |
| F5 | Dispatch does not preflight employee CLI support before starting a job. | HIGH | partially addressed by `ome doctor`; automatic dispatch preflight remains a future hardening item. |

## Priority Cut

| Priority | Include |
|----------|---------|
| P0 | A1-A7, B1, F1-F2 |
| P1 | B2-B5, C1-C4, D1-D4, F3, F5 |
| P2 | A8-A9, C5-C6, D5-D6, E1-E4, F4 |
