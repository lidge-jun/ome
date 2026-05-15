import type { AgentCli, SpawnOptions } from '../registry/types.js';

export function buildArgs(cli: AgentCli, prompt: string, opts: SpawnOptions = {}): string[] {
    if (opts.sessionId) {
        return buildResumeArgs(cli, prompt, opts);
    }
    return buildNewArgs(cli, opts);
}

function buildNewArgs(cli: AgentCli, opts: SpawnOptions): string[] {
    switch (cli) {
        case 'claude':
            return buildClaudeNew(opts);
        case 'codex':
            return buildCodexNew(opts);
        case 'gemini':
            return buildGeminiNew(opts);
        default:
            return buildGenericNew(opts);
    }
}

function buildResumeArgs(cli: AgentCli, prompt: string, opts: SpawnOptions): string[] {
    const sid = opts.sessionId!;
    switch (cli) {
        case 'claude':
            return buildClaudeResume(sid, opts);
        case 'codex':
            return buildCodexResume(sid, prompt, opts);
        case 'gemini':
            return buildGeminiResume(sid, opts);
        case 'opencode':
            return buildOpencodeResume(sid, opts);
        default:
            return buildGenericNew(opts);
    }
}

function buildClaudeNew(opts: SpawnOptions): string[] {
    const args = ['--print', '--output-format', 'stream-json'];
    if (opts.model) args.push('--model', opts.model);
    if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
    return args;
}

function buildClaudeResume(sid: string, opts: SpawnOptions): string[] {
    const args = ['--print', '--output-format', 'stream-json', '--resume', sid];
    if (opts.model) args.push('--model', opts.model);
    return args;
}

function buildCodexNew(opts: SpawnOptions): string[] {
    const args = ['--quiet', '--full-auto'];
    if (opts.model) args.push('--model', opts.model);
    if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
    return args;
}

function buildCodexResume(sid: string, prompt: string, opts: SpawnOptions): string[] {
    const args = ['exec', 'resume', sid, prompt, '--quiet', '--full-auto'];
    if (opts.model) args.push('--model', opts.model);
    return args;
}

function buildGeminiNew(opts: SpawnOptions): string[] {
    const args: string[] = [];
    if (opts.model) args.push('--model', opts.model);
    if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
    return args;
}

function buildGeminiResume(sid: string, opts: SpawnOptions): string[] {
    const args = ['--resume', sid];
    if (opts.model) args.push('--model', opts.model);
    return args;
}

function buildOpencodeResume(sid: string, opts: SpawnOptions): string[] {
    const args = ['-s', sid];
    if (opts.model) args.push('--model', opts.model);
    return args;
}

function buildGenericNew(opts: SpawnOptions): string[] {
    const args: string[] = [];
    if (opts.model) args.push('--model', opts.model);
    if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
    return args;
}
