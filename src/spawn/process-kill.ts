import { spawnSync } from 'node:child_process';

interface KillResult {
    attempted: boolean;
    delivered: boolean;
    method: string | null;
}

export function terminateProcessTree(pid: number | undefined | null): KillResult {
    if (!pid || !Number.isFinite(pid)) {
        return { attempted: false, delivered: false, method: null };
    }

    if (process.platform === 'win32') {
        const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
            encoding: 'utf8',
            timeout: 5000,
        });
        if (!result.error && result.status === 0) {
            return { attempted: true, delivered: true, method: 'taskkill' };
        }
        try {
            process.kill(pid, 'SIGTERM');
            return { attempted: true, delivered: true, method: 'kill' };
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
                return { attempted: true, delivered: false, method: 'kill' };
            }
            return { attempted: true, delivered: false, method: 'taskkill' };
        }
    }

    // Unix: try process group first, then single process
    try {
        process.kill(-pid, 'SIGTERM');
        return { attempted: true, delivered: true, method: 'process-group' };
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
            return { attempted: true, delivered: false, method: 'process-group' };
        }
        // EPERM on group kill — try single process
        try {
            process.kill(pid, 'SIGTERM');
            return { attempted: true, delivered: true, method: 'process' };
        } catch (innerErr: unknown) {
            if ((innerErr as NodeJS.ErrnoException).code === 'ESRCH') {
                return { attempted: true, delivered: false, method: 'process' };
            }
            return { attempted: true, delivered: false, method: 'process' };
        }
    }
}

export function scheduleForceKill(pid: number | undefined | null, delayMs = 2000): void {
    if (!pid) return;
    setTimeout(() => {
        try { process.kill(-pid, 'SIGKILL'); } catch { /* ignore */ }
        try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
    }, delayMs).unref();
}
