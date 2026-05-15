#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { initDb, closeDb, addEmployee, removeEmployee, listEmployees } from '../registry/index.js';
import { spawnAgent, isAgentBusy, killJobByPid } from '../spawn/index.js';
import { buildArgs, type BuildResult } from '../spawn/args.js';
import { preflightCli } from '../spawn/preflight.js';
import { messageQueue, listQueue, clearQueue, setQueueHold, clearQueueHold } from '../queue/index.js';
import { dispatch } from '../dispatch/index.js';
import { inspect as inspectJob, watch as watchJob } from '../observe/index.js';
import { createServer } from '../web/index.js';
import { seedDefaults } from '../seed/index.js';
import { listJobs, readJobMeta, readJobLog } from '../spawn/jobs.js';

const OME_HOME = process.env['OME_HOME'] ?? join(homedir(), '.ome');
const DB_PATH = join(OME_HOME, 'ome.db');

function ensureDb(): void {
    mkdirSync(OME_HOME, { recursive: true });
    initDb(DB_PATH);
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help' || command === '-h') {
        printHelp();
        return;
    }

    ensureDb();

    try {
        switch (command) {
            case 'spawn': await handleSpawn(args.slice(1)); break;
            case 'dispatch': await handleDispatch(args.slice(1)); break;
            case 'registry': handleRegistry(args.slice(1)); break;
            case 'queue': handleQueue(args.slice(1)); break;
            case 'jobs': handleJobs(); break;
            case 'kill': handleKill(args.slice(1)); break;
            case 'result': handleResult(args.slice(1)); break;
            case 'watch': await handleWatch(args.slice(1)); break;
            case 'inspect': handleInspect(args.slice(1)); break;
            case 'web': handleWeb(args.slice(1)); break;
            case 'doctor': handleDoctor(); break;
            case 'init': handleInit(); break;
            case 'status': handleStatus(); break;
            default:
                console.error(`Unknown command: ${command}`);
                printHelp();
                process.exitCode = 1;
        }
    } finally {
        if (command !== 'web') closeDb();
    }
}

async function handleSpawn(args: string[]): Promise<void> {
    const { values, positionals } = parseArgs({
        args,
        options: {
            cli: { type: 'string', default: 'claude' },
            model: { type: 'string' },
            'dry-run': { type: 'boolean', default: false },
        },
        allowPositionals: true,
    });
    const prompt = positionals.join(' ');
    if (!prompt) { console.error('Usage: ome spawn [--dry-run] [--cli claude] [--model sonnet] "prompt"'); process.exitCode = 1; return; }
    const cli = values.cli ?? 'claude';
    const model = values.model;
    if (values['dry-run']) {
        const contract = buildArgs(cli, prompt, { cli, model });
        printSpawnDryRun(cli, prompt, model, contract);
        return;
    }
    const { jobId, result } = spawnAgent(prompt, { cli, model });
    process.stderr.write(`[ome] jobId=${jobId}\n`);
    const sr = await result;
    process.stdout.write(sr.text);
    process.exitCode = sr.code;
}

function printSpawnDryRun(cli: string, prompt: string, model: string | undefined, contract: BuildResult): void {
    const body = {
        cli,
        command: cli,
        args: contract.args,
        model: model ?? null,
        prompt,
        promptTransport: contract.stdinPrompt ? 'stdin' : 'argv',
        stdinPrompt: contract.stdinPrompt,
    };
    console.log(JSON.stringify(body, null, 2));
}

async function handleDispatch(args: string[]): Promise<void> {
    const { values } = parseArgs({
        args,
        options: {
            agent: { type: 'string' },
            task: { type: 'string' },
        },
    });
    if (!values.agent || !values.task) {
        console.error('Usage: ome dispatch --agent "Name" --task "task description"');
        process.exitCode = 1;
        return;
    }
    const result = await dispatch(values.agent, values.task);
    if (result.jobId) process.stderr.write(`[ome] jobId=${result.jobId}\n`);
    process.stdout.write(result.text);
    process.exitCode = result.code;
}

function handleRegistry(args: string[]): void {
    const sub = args[0];
    switch (sub) {
        case 'add': {
            const { values } = parseArgs({
                args: args.slice(1),
                options: {
                    name: { type: 'string' },
                    cli: { type: 'string', default: 'claude' },
                    model: { type: 'string' },
                    role: { type: 'string' },
                },
            });
            if (!values.name) { console.error('Usage: ome registry add --name "Name" --cli claude'); process.exitCode = 1; return; }
            const emp = addEmployee({ name: values.name, cli: values.cli ?? 'claude', model: values.model, role: values.role });
            console.log(`Added: ${emp.name} (${emp.cli})`);
            break;
        }
        case 'remove': {
            const name = args[1];
            if (!name) { console.error('Usage: ome registry remove "Name"'); process.exitCode = 1; return; }
            const ok = removeEmployee(name);
            console.log(ok ? `Removed: ${name}` : `Not found: ${name}`);
            break;
        }
        case 'list': {
            const emps = listEmployees();
            if (!emps.length) { console.log('No employees registered.'); return; }
            console.log('Employees:');
            for (const e of emps) {
                console.log(`  ${e.name} — cli: ${e.cli}, model: ${e.model ?? 'default'}, role: ${e.role ?? '-'}`);
            }
            break;
        }
        default:
            console.error('Usage: ome registry [add|remove|list]');
            process.exitCode = 1;
    }
}

function handleQueue(args: string[]): void {
    const sub = args[0];
    switch (sub) {
        case 'list': {
            const items = listQueue();
            if (!items.length) { console.log('Queue empty.'); return; }
            for (const item of items) {
                console.log(`  ${item.id}  ${item.prompt.slice(0, 60)}  [${item.source}]`);
            }
            break;
        }
        case 'hold': {
            const id = args[1];
            if (!id) { console.error('Usage: ome queue hold <id>'); process.exitCode = 1; return; }
            setQueueHold(id);
            console.log(`Queue held: ${id}`);
            break;
        }
        case 'release': {
            const id = args[1];
            if (!id) { console.error('Usage: ome queue release [id]'); process.exitCode = 1; return; }
            clearQueueHold(id);
            console.log('Queue hold released.');
            break;
        }
        case 'clear': {
            const count = clearQueue();
            console.log(`Cleared ${count} items.`);
            break;
        }
        default:
            console.error('Usage: ome queue [list|hold|release|clear]');
            process.exitCode = 1;
    }
}

async function handleWatch(args: string[]): Promise<void> {
    const jobId = args[0];
    if (!jobId) { console.error('Usage: ome watch <job-id>'); process.exitCode = 1; return; }

    const state = inspectJob(jobId);
    if (!state) { console.error(`Job not found: ${jobId}`); process.exitCode = 1; return; }

    console.log(`Watching ${jobId} (${state.cli}, ${state.status})...\n`);
    for await (const event of watchJob(jobId)) {
        const prefix = event.toolName ? `[${event.type}:${event.toolName}]` : `[${event.type}]`;
        console.log(`${event.ts.slice(11, 19)} ${prefix} ${event.message}`);
    }
    console.log('\nJob finished.');
}

function handleInspect(args: string[]): void {
    const jobId = args[0];
    if (!jobId) { console.error('Usage: ome inspect <job-id>'); process.exitCode = 1; return; }
    const state = inspectJob(jobId);
    if (!state) { console.error(`Job not found: ${jobId}`); process.exitCode = 1; return; }
    console.log(`Job: ${state.jobId}`);
    console.log(`CLI: ${state.cli}  Status: ${state.status}  Phase: ${state.currentPhase}`);
    console.log(`Events: ${state.eventCount}  Tools: ${state.toolCalls.length}`);
    if (state.toolCalls.length) {
        console.log('\nTool calls:');
        for (const tc of state.toolCalls) {
            console.log(`  ${tc.status === 'running' ? '...' : 'ok'} ${tc.name} (${tc.status})`);
        }
    }
    if (state.outputText) {
        console.log(`\nOutput preview:\n${state.outputText.slice(0, 500)}`);
    }
}

function handleJobs(): void {
    const jobs = listJobs();
    if (!jobs.length) { console.log('No jobs.'); return; }
    for (const j of jobs.slice(0, 30)) {
        const age = j.completedAt ? `done ${j.completedAt.slice(11, 19)}` : 'running';
        console.log(`  ${j.id}  ${j.cli.padEnd(6)}  ${j.status.padEnd(10)}  ${age}  ${j.prompt.slice(0, 40)}`);
    }
}

function handleKill(args: string[]): void {
    const jobId = args[0];
    if (!jobId) { console.error('Usage: ome kill <job-id>'); process.exitCode = 1; return; }
    const ok = killJobByPid(jobId, 'user');
    if (ok) {
        console.log(`Killed: ${jobId}`);
    } else {
        console.error(`Job not found or already finished: ${jobId}`);
        process.exitCode = 1;
    }
}

function handleResult(args: string[]): void {
    const jobId = args[0];
    if (!jobId) { console.error('Usage: ome result <job-id>'); process.exitCode = 1; return; }
    const meta = readJobMeta(jobId);
    if (!meta) { console.error(`Job not found: ${jobId}`); process.exitCode = 1; return; }

    console.log(`Job: ${meta.id}`);
    console.log(`CLI: ${meta.cli}  Status: ${meta.status}  Phase: ${meta.phase}`);
    if (meta.completedAt) console.log(`Completed: ${meta.completedAt}`);

    const logs = readJobLog(jobId);
    if (logs.length) {
        console.log(`\n--- Output (${logs.length} lines) ---`);
        for (const line of logs) {
            console.log(line);
        }
    } else {
        console.log('\nNo output recorded.');
    }
}

function handleWeb(args: string[]): void {
    const { values } = parseArgs({
        args,
        options: {
            port: { type: 'string', default: '7700' },
            host: { type: 'string', default: '127.0.0.1' },
            'auth-token': { type: 'string' },
        },
    });
    const port = parseInt(values.port!, 10);
    const server = createServer({
        port,
        host: values.host!,
        authToken: values['auth-token'],
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use. Try: ome web --port ${port + 1}`);
            closeDb();
            process.exit(1);
        }
        throw err;
    });

    const shutdown = () => {
        console.log('\nShutting down...');
        server.close(() => {
            closeDb();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 3000).unref();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    console.log('Press Ctrl+C to stop.');
}

function handleInit(): void {
    const { added, skipped } = seedDefaults();
    if (added.length) console.log(`Added: ${added.join(', ')}`);
    if (skipped.length) console.log(`Skipped (already exist): ${skipped.join(', ')}`);
    if (!added.length && !skipped.length) console.log('No defaults to seed.');
}

function handleStatus(): void {
    const emps = listEmployees();
    const jobs = listJobs();
    const running = jobs.filter(j => j.status === 'running');
    console.log(`Agent busy: ${isAgentBusy()}`);
    console.log(`Active jobs: ${running.length}`);
    console.log(`Total jobs: ${jobs.length}`);
    console.log(`Queue depth: ${messageQueue.length}`);
    console.log(`Employees: ${emps.length}`);
    if (emps.length) {
        for (const e of emps) {
            console.log(`  ${e.name} — ${e.cli} (${e.model ?? 'default'})`);
        }
    }
}

function handleDoctor(): void {
    const clis = ['claude', 'codex', 'gemini', 'copilot', 'opencode'];
    console.log('CLI Preflight:');
    for (const cli of clis) {
        const result = preflightCli(cli);
        const state = result.available ? 'ok' : 'missing';
        const detail = result.version ?? result.error;
        console.log(`  ${cli.padEnd(8)} ${state}${detail ? ` — ${detail}` : ''}`);
    }
}

function printHelp(): void {
    console.log(`OME — Orchestrated Multi-agent Engine

Commands:
  spawn     Spawn a single agent CLI
  dispatch  Dispatch task to a registered employee
  registry  Manage employee registry (add/remove/list)
  queue     Manage message queue (list/hold/release/clear)
  jobs      List tracked jobs
  kill      Kill a running job
  result    Show full output of a completed job
  watch     Watch a running job's live events
  inspect   Inspect a job's current state
  web       Start the management web UI (--host, --port)
  doctor    Check installed agent CLI binaries
  init      Seed default employees (Frontend/Backend/Data/Docs)
  status    Show current status

Examples:
  ome spawn --cli claude --model opus "Fix the login bug"
  ome spawn --dry-run --cli codex "Inspect spawn contract"
  ome dispatch --agent "Frontend" --task "Fix CSS grid"
  ome doctor
  ome jobs
  ome watch job-abc123
  ome kill job-abc123
  ome result job-abc123
  ome web --port 3500 --host 0.0.0.0 --auth-token mytoken
  ome init`);
}

main().catch(err => {
    console.error(err.message);
    process.exitCode = 1;
});
