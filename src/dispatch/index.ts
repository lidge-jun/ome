import { findEmployee } from '../registry/db.js';
import { getEmployeeSession, upsertEmployeeSession, clearEmployeeSession } from '../registry/db.js';
import { spawnAgent } from '../spawn/index.js';
import type { SpawnResult, DispatchOptions } from '../registry/types.js';

const STALE_PATTERNS = [
    /no conversation found/i,
    /conversation.*not found/i,
    /resume.*not found/i,
    /no rollout found/i,
    /thread\/resume failed/i,
    /session.*not found/i,
    /session.*expired/i,
];

function isStaleSession(output: string): boolean {
    return STALE_PATTERNS.some(p => p.test(output));
}

export async function dispatch(
    employeeName: string,
    task: string,
    opts: DispatchOptions = {},
): Promise<SpawnResult> {
    const emp = findEmployee(employeeName);
    if (!emp) {
        throw new Error(`Employee "${employeeName}" not found. Use \`ome registry list\` to see available employees.`);
    }

    const session = getEmployeeSession(emp.id);
    const canResume = !!(
        session?.sessionId
        && session.cli === emp.cli
        && session.model === (emp.model ?? '')
    );

    const spawnOpts = {
        cli: emp.cli,
        model: emp.model ?? undefined,
        systemPrompt: emp.prompt ?? undefined,
        sessionId: canResume ? session!.sessionId : undefined,
        cwd: opts.cwd,
        timeout: opts.timeout ?? 600_000,
        env: opts.env,
    };

    let { jobId, result } = spawnAgent(task, spawnOpts);
    let sr = await result;

    if (canResume && sr.code !== 0 && isStaleSession(sr.text + (sr.stderr ?? ''))) {
        clearEmployeeSession(emp.id);
        const retry = spawnAgent(task, { ...spawnOpts, sessionId: undefined });
        sr = await retry.result;
        jobId = retry.jobId;
    }

    if (sr.code === 0 && sr.sessionId) {
        upsertEmployeeSession(emp.id, sr.sessionId, emp.cli, emp.model ?? '');
    } else if (sr.code !== 0) {
        clearEmployeeSession(emp.id);
    }

    return { ...sr, jobId };
}
