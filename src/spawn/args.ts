import { homedir } from 'node:os';
import type { AgentCli, SpawnOptions } from '../registry/types.js';

const DEFAULT_OPENCODE_MODEL = 'opencode-go/kimi-k2.6';

export interface BuildResult {
    args: string[];
    stdinPrompt: boolean;
}

export function buildArgs(cli: AgentCli, prompt: string, opts: SpawnOptions = {}): BuildResult {
    assertSystemPromptSupported(cli, opts);
    if (opts.sessionId) {
        return buildResumeResult(cli, prompt, opts);
    }
    return buildNewResult(cli, prompt, opts);
}

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
        case 'grok':
            return { args: buildGrokNew(prompt, opts), stdinPrompt: false };
        case 'opencode':
            return { args: buildOpencodeNew(prompt, opts), stdinPrompt: false };
        case 'codex-app':
            throw new Error(
                'codex-app uses JSON-RPC app-server mode. ' +
                'Use CodexAppClient instead of buildArgs().',
            );
        default:
            return buildGenericNew(cli, opts);
    }
}

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
        case 'grok':
            return { args: buildGrokResume(sid, prompt, opts), stdinPrompt: false };
        case 'copilot':
            return buildCopilotResume(sid, prompt, opts);
        case 'codex-app':
            throw new Error(
                'codex-app uses JSON-RPC app-server mode. ' +
                'Use CodexAppClient instead of buildArgs().',
            );
        default:
            return buildGenericResume(cli);
    }
}

function assertSystemPromptSupported(cli: AgentCli, opts: SpawnOptions): void {
    if (!opts.systemPrompt) return;
    if (cli === 'claude') return;
    throw new Error(
        `systemPrompt is not supported for CLI "${cli}" yet. ` +
        'Refusing to silently drop employee instructions.',
    );
}

function buildClaudeNew(opts: SpawnOptions): string[] {
    const args = [
        '--print',
        '--verbose',
        '--output-format',
        'stream-json',
        '--include-partial-messages',
        '--dangerously-skip-permissions',
        '--max-turns',
        '50',
    ];
    if (opts.model) args.push('--model', opts.model);
    if (opts.systemPrompt) args.push('--append-system-prompt', opts.systemPrompt);
    return args;
}

function buildClaudeResume(sid: string, opts: SpawnOptions): string[] {
    const args = [
        '--print',
        '--verbose',
        '--output-format',
        'stream-json',
        '--include-partial-messages',
        '--dangerously-skip-permissions',
        '--resume',
        sid,
        '--max-turns',
        '50',
    ];
    if (opts.model) args.push('--model', opts.model);
    if (opts.systemPrompt) args.push('--append-system-prompt', opts.systemPrompt);
    return args;
}

function buildCodexNew(opts: SpawnOptions): string[] {
    const args = [
        'exec',
        '--json',
        '--dangerously-bypass-approvals-and-sandbox',
        '--skip-git-repo-check',
    ];
    if (opts.model) args.push('-m', opts.model);
    return args;
}

function buildCodexResume(sid: string, prompt: string, opts: SpawnOptions): string[] {
    const args = [
        'exec',
        'resume',
        '--json',
        '--dangerously-bypass-approvals-and-sandbox',
        '--skip-git-repo-check',
    ];
    if (opts.model) args.push('-m', opts.model);
    args.push(sid, prompt);
    return args;
}

function buildGeminiNew(prompt: string, opts: SpawnOptions): string[] {
    const args = [
        '--prompt',
        prompt,
        '--output-format',
        'stream-json',
        '--skip-trust',
        '--approval-mode',
        'yolo',
        '--include-directories',
        homedir(),
    ];
    if (opts.model) args.push('--model', opts.model);
    return args;
}

function buildGeminiResume(sid: string, prompt: string, opts: SpawnOptions): string[] {
    const args = [
        '--resume',
        sid,
        '--prompt',
        prompt,
        '--output-format',
        'stream-json',
        '--skip-trust',
        '--approval-mode',
        'yolo',
        '--include-directories',
        homedir(),
    ];
    if (opts.model) args.push('--model', opts.model);
    return args;
}

function buildCopilotNew(prompt: string, opts: SpawnOptions): BuildResult {
    const args = ['-p', prompt, '--output-format', 'json', '--yolo'];
    if (opts.model) args.push('--model', opts.model);
    return { args, stdinPrompt: false };
}

function buildCopilotResume(sid: string, prompt: string, opts: SpawnOptions): BuildResult {
    const args = ['--resume', sid, '-p', prompt, '--output-format', 'json', '--yolo'];
    if (opts.model) args.push('--model', opts.model);
    return { args, stdinPrompt: false };
}

function buildOpencodeNew(prompt: string, opts: SpawnOptions): string[] {
    const args = ['run', '--thinking', '--format', 'json'];
    args.push('-m', opts.model ?? DEFAULT_OPENCODE_MODEL);
    args.push(prompt);
    return args;
}

function buildOpencodeResume(sid: string, prompt: string, opts: SpawnOptions): string[] {
    const args = ['run', '-s', sid, '--thinking', '--format', 'json'];
    args.push('-m', opts.model ?? DEFAULT_OPENCODE_MODEL);
    args.push(prompt);
    return args;
}

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

function buildGenericNew(cli: AgentCli, opts: SpawnOptions): BuildResult {
    if (opts.model) {
        throw new Error(
            `Model override is not supported for generic CLI "${cli}". ` +
            'Refusing to append provider-specific flags to an arbitrary executable.',
        );
    }
    return { args: [], stdinPrompt: true };
}

function buildGenericResume(cli: AgentCli): BuildResult {
    throw new Error(
        `Session resume is not supported for generic CLI "${cli}". ` +
        'Register a supported provider or start a fresh generic spawn.',
    );
}
