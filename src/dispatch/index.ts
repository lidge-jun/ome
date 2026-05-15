import { findEmployee } from '../registry/db.js';
import { spawnAgent } from '../spawn/index.js';
import type { SpawnResult, DispatchOptions } from '../registry/types.js';

export async function dispatch(
    employeeName: string,
    task: string,
    opts: DispatchOptions = {},
): Promise<SpawnResult> {
    const emp = findEmployee(employeeName);
    if (!emp) {
        throw new Error(`Employee "${employeeName}" not found. Use \`ome registry list\` to see available employees.`);
    }

    const { jobId, result } = spawnAgent(task, {
        cli: emp.cli,
        model: emp.model ?? undefined,
        systemPrompt: emp.prompt ?? undefined,
        cwd: opts.cwd,
        timeout: opts.timeout ?? 600_000,
        env: opts.env,
    });

    const sr = await result;
    return { ...sr, jobId };
}
