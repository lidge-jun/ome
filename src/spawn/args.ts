import type { AgentCli, SpawnOptions } from '../registry/types.js';

export function buildArgs(cli: AgentCli, _prompt: string, opts: SpawnOptions = {}): string[] {
    switch (cli) {
        case 'claude':
            return buildClaudeArgs(opts);
        case 'codex':
            return buildCodexArgs(opts);
        case 'gemini':
            return buildGeminiArgs(opts);
        default:
            return buildGenericArgs(opts);
    }
}

function buildClaudeArgs(opts: SpawnOptions): string[] {
    const args = ['--print', '--output-format', 'stream-json'];
    if (opts.model) args.push('--model', opts.model);
    if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
    return args;
}

function buildCodexArgs(opts: SpawnOptions): string[] {
    const args = ['--quiet', '--full-auto'];
    if (opts.model) args.push('--model', opts.model);
    if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
    return args;
}

function buildGeminiArgs(opts: SpawnOptions): string[] {
    const args: string[] = [];
    if (opts.model) args.push('--model', opts.model);
    if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
    return args;
}

function buildGenericArgs(opts: SpawnOptions): string[] {
    const args: string[] = [];
    if (opts.model) args.push('--model', opts.model);
    if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
    return args;
}
