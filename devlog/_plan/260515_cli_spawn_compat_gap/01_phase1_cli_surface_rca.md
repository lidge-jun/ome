# Phase 01 — CLI Surface RCA

## Problem

`ome spawn` originally built commands using a broad assumption:

```text
one OME spawn abstraction
  → one mostly shared set of flags
  → prompt always sent through stdin
  → system prompt usually sent through --system-prompt
```

That assumption breaks for real agent CLIs. These tools are similar at the product level, but their CLI surfaces differ sharply.

## Why cli-jaw Did Not Crash

cli-jaw survived because it does not treat all CLIs as interchangeable shells. It handles each CLI as a different engine with its own prompt, session, approval, and output strategy.

| Area | OME failed mode | cli-jaw-safe pattern |
|------|-----------------|----------------------|
| Codex invocation | Used Codex as if it accepted generic top-level flags. | Uses Codex-specific `exec` style. |
| Codex approval/sandbox | Used invalid `--quiet` / `--full-auto` style flags. | Uses Codex's actual automation/sandbox flags where needed. |
| Gemini system prompt | Tried CLI flag delivery. | Uses Gemini-specific system-prompt delivery strategy. |
| Prompt transport | Wrote prompt to stdin for every CLI. | Uses provider-specific prompt transport. |
| Session resume | Assumed resume can be bolted onto one builder. | Keeps provider-specific resume syntax. |
| Output parsing | Assumed JSON-ish session IDs may appear uniformly. | Parses based on the provider output contract. |

## Root Cause

OME's abstraction boundary was too narrow. It modeled a spawn as:

```typescript
args: string[]
```

That is not enough. A reliable spawn needs a provider contract:

```typescript
interface ProviderSpawnContract {
    args: string[];
    stdinPrompt: boolean;
    env?: Record<string, string>;
    expectedOutput?: 'stream-json' | 'json' | 'plain' | 'unknown';
    sessionIdSource?: 'stdout-json' | 'stderr' | 'none' | 'unknown';
}
```

The current local worktree has started this by changing `buildArgs()` to return:

```typescript
export interface BuildResult {
    args: string[];
    stdinPrompt: boolean;
}
```

That fixes the first layer, but not the full contract.

## Why "Run It Later" Is Not Enough

The user question was whether these are problems that later execution would reveal anyway. Yes, but that is too late for an orchestrator.

| If deferred to runtime | Failure mode |
|------------------------|--------------|
| Invalid flag | Employee job starts, fails immediately, and appears as a broken dispatch. |
| Wrong prompt transport | CLI may idle, ignore prompt, or treat prompt as input text at the wrong time. |
| Dropped system prompt | Employee runs with the wrong role/instructions while still exiting 0. |
| Missing session ID | Dispatch appears successful but cannot resume later. |
| Wrong resume syntax | First run works; second task fails or starts a new hidden context. |
| Parser mismatch | Dashboard/watch output becomes misleading even when the CLI succeeds. |

For OME, a broken employee dispatch is a product failure, not just a CLI failure. Compatibility needs to be encoded and tested before the dispatch path claims success.

## Current Local Patch Direction

The local worktree already moved in the right direction:

| File | Direction |
|------|-----------|
| `src/spawn/args.ts` | Adds `BuildResult`, Codex `exec`, Copilot arg prompt, OpenCode `run`, and stdin routing. |
| `src/spawn/index.ts` | Writes to stdin only when the provider contract says to. |
| `src/cli/index.ts` | Aligns help text with current default employee names. |

Remaining work should avoid widening `buildArgs()` casually. Instead, make the provider boundary explicit enough to test.

