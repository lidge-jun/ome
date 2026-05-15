import { readJobMeta, readJobLogFrom } from '../spawn/jobs.js';
import { parseLine } from './parser.js';
import type { ProgressEvent } from '../registry/types.js';

export interface TaggedEvent {
    jobId: string;
    event: ProgressEvent;
}

export async function* watchAll(jobIds: string[], pollMs = 500): AsyncGenerator<TaggedEvent> {
    const offsets = new Map<string, number>();
    const active = new Set<string>();

    for (const id of jobIds) {
        const meta = readJobMeta(id);
        if (meta) {
            offsets.set(id, 0);
            if (meta.status === 'running' || meta.status === 'cancelling') active.add(id);
        }
    }

    while (active.size > 0) {
        for (const id of [...offsets.keys()]) {
            const meta = readJobMeta(id);
            if (!meta) { offsets.delete(id); active.delete(id); continue; }

            const { lines, nextOffset } = readJobLogFrom(id, offsets.get(id)!);
            offsets.set(id, nextOffset);

            for (const line of lines) {
                const ev = parseLine(meta.cli, line);
                if (ev) yield { jobId: id, event: ev };
            }

            if (meta.status !== 'running' && meta.status !== 'cancelling') {
                active.delete(id);
            }
        }

        if (active.size > 0) {
            await new Promise(r => setTimeout(r, pollMs));
        }
    }

    for (const [id, offset] of offsets) {
        const meta = readJobMeta(id);
        if (!meta) continue;
        const { lines } = readJobLogFrom(id, offset);
        for (const line of lines) {
            const ev = parseLine(meta.cli, line);
            if (ev) yield { jobId: id, event: ev };
        }
    }
}
