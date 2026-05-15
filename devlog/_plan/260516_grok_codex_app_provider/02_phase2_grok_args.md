# P2 — Grok Spawn Args

Add `grok` new/resume arg builders to `src/spawn/args.ts`.

## Reference (cli-jaw)

```
grok fresh: -p <prompt> [-m <model>] --output-format streaming-json --no-alt-screen [--always-approve --permission-mode bypassPermissions]
grok resume: -p <prompt> --resume <sessionId> [-m <model>] --output-format streaming-json --no-alt-screen [--always-approve ...]
```

Key constraints:
- Grok does NOT support `--effort` / `--reasoning-effort` (server rejects)
- Grok does NOT support `--system-prompt` or equivalent
- Default model: `grok-build`
- Prompt transport: argv (`-p`), NOT stdin
- Output: NDJSON (`streaming-json`)

## Diffs

### 2.1 Add system-prompt rejection for grok

**File:** `src/spawn/args.ts:54-61`

```diff
  function assertSystemPromptSupported(cli: AgentCli, opts: SpawnOptions): void {
      if (!opts.systemPrompt) return;
      if (cli === 'claude') return;
      throw new Error(
-         `systemPrompt is not supported for CLI "${cli}" yet. ` +
+         `systemPrompt is not supported for CLI "${cli}". ` +
          'Refusing to silently drop employee instructions.',
      );
  }
```

(Already rejects — no change needed. This is a confirmation that grok hits the default throw.)

### 2.2 Add grok to buildNewResult switch

**File:** `src/spawn/args.ts:19-34`

```diff
  function buildNewResult(cli: AgentCli, prompt: string, opts: SpawnOptions): BuildResult {
      switch (cli) {
          case 'claude':
              return { args: buildClaudeNew(opts), stdinPrompt: true };
          case 'codex':
              return { args: buildCodexNew(opts), stdinPrompt: true };
          case 'gemini':
              return { args: buildGeminiNew(prompt, opts), stdinPrompt: false };
          case 'copilot':
              return buildCopilotNew(prompt, opts);
          case 'opencode':
              return { args: buildOpencodeNew(prompt, opts), stdinPrompt: false };
+         case 'grok':
+             return { args: buildGrokNew(prompt, opts), stdinPrompt: false };
          default:
              return buildGenericNew(cli, opts);
      }
  }
```

### 2.3 Add grok to buildResumeResult switch

**File:** `src/spawn/args.ts:36-52`

```diff
  function buildResumeResult(cli: AgentCli, prompt: string, opts: SpawnOptions): BuildResult {
      const sid = opts.sessionId!;
      switch (cli) {
          case 'claude':
              return { args: buildClaudeResume(sid, opts), stdinPrompt: true };
          case 'codex':
              return { args: buildCodexResume(sid, prompt, opts), stdinPrompt: false };
          case 'gemini':
              return { args: buildGeminiResume(sid, prompt, opts), stdinPrompt: false };
          case 'opencode':
              return { args: buildOpencodeResume(sid, prompt, opts), stdinPrompt: false };
          case 'copilot':
              return buildCopilotResume(sid, prompt, opts);
+         case 'grok':
+             return { args: buildGrokResume(sid, prompt, opts), stdinPrompt: false };
          default:
              return buildGenericResume(cli);
      }
  }
```

### 2.4 Add builder functions (append after buildOpencodeResume)

**File:** `src/spawn/args.ts` — insert after line 179

```typescript
function buildGrokNew(prompt: string, opts: SpawnOptions): string[] {
    const args = [
        '-p', prompt,
        '--output-format', 'streaming-json',
        '--no-alt-screen',
        '--always-approve',
        '--permission-mode', 'bypassPermissions',
    ];
    if (opts.model) args.push('-m', opts.model);
    return args;
}

function buildGrokResume(sid: string, prompt: string, opts: SpawnOptions): string[] {
    const args = [
        '-p', prompt,
        '--resume', sid,
        '--output-format', 'streaming-json',
        '--no-alt-screen',
        '--always-approve',
        '--permission-mode', 'bypassPermissions',
    ];
    if (opts.model) args.push('-m', opts.model);
    return args;
}
```

### 2.5 Note: codex-app args

Codex App does NOT use `buildArgs()` at all — it spawns via the JSON-RPC client module (P4).
The switch cases in `buildNewResult`/`buildResumeResult` will have a `'codex-app'` case that
throws an error directing callers to use the CodexAppClient:

```typescript
case 'codex-app':
    throw new Error(
        'codex-app uses JSON-RPC app-server mode. ' +
        'Use CodexAppClient instead of buildArgs().',
    );
```

This goes in BOTH `buildNewResult` and `buildResumeResult` (before `default:`).

## Verification Gate

- `npx tsc --noEmit` passes
- `buildArgs('grok', 'hello')` returns correct NDJSON-mode args
- `buildArgs('grok', 'hello', { systemPrompt: 'sys' })` throws
- `buildArgs('codex-app', 'hello')` throws with "use CodexAppClient" message
