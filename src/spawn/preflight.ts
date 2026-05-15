import { spawnSync } from 'node:child_process';
import type { AgentCli } from '../registry/types.js';

const VERSION_TIMEOUT_MS = 3000;

export interface CliPreflightResult {
    cli: string;
    command: string;
    available: boolean;
    status: number | null;
    version?: string;
    error?: string;
}

export function resolveCliPath(cli: AgentCli): string {
    const known: Record<string, string> = {
        claude: 'claude',
        codex: 'codex',
        'codex-app': 'codex',
        gemini: 'gemini',
        copilot: 'copilot',
        grok: 'grok',
        opencode: 'opencode',
    };
    return known[cli] ?? cli;
}

export function preflightCli(cli: AgentCli): CliPreflightResult {
    const command = resolveCliPath(cli);
    try {
        const result = spawnSync(command, ['--version'], {
            encoding: 'utf8',
            timeout: VERSION_TIMEOUT_MS,
        });

        if (result.error) {
            return {
                cli,
                command,
                available: false,
                status: null,
                error: formatSpawnError(result.error),
            };
        }

        const version = firstOutputLine(result.stdout || result.stderr);
        return {
            cli,
            command,
            available: true,
            status: result.status,
            version,
            error: result.status === 0 ? undefined : `--version exited with code ${result.status}`,
        };
    } catch (err) {
        return {
            cli,
            command,
            available: false,
            status: null,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

function firstOutputLine(output: string): string | undefined {
    const line = output.split(/\r?\n/).map(value => value.trim()).find(Boolean);
    return line || undefined;
}

function formatSpawnError(error: Error): string {
    const code = getErrorCode(error);
    if (code === 'ENOENT') return 'executable not found';
    if (code === 'ETIMEDOUT') return `--version timed out after ${VERSION_TIMEOUT_MS}ms`;
    return error.message;
}

function getErrorCode(error: Error): string | undefined {
    const maybeCode = (error as { code?: unknown }).code;
    return typeof maybeCode === 'string' ? maybeCode : undefined;
}
