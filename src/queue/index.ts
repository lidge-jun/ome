import { randomUUID } from 'node:crypto';
import { getDb } from '../registry/db.js';
import { bus } from '../spawn/index.js';
import type { QueueItem } from '../registry/types.js';

export const messageQueue: QueueItem[] = [];

let queueHoldId: string | null = null;
let queueHoldTimer: ReturnType<typeof setTimeout> | null = null;
const QUEUE_HOLD_TIMEOUT_MS = 10_000;

export function enqueue(prompt: string, source = 'cli'): string {
    const item: QueueItem = {
        id: randomUUID(),
        prompt,
        source,
        ts: Date.now(),
    };
    const d = getDb();
    d.prepare('INSERT OR REPLACE INTO queued_messages (id, payload) VALUES (?, ?)').run(item.id, JSON.stringify(item));
    messageQueue.push(item);
    bus.emit('queue_update', { pending: messageQueue.length });
    return item.id;
}

export function dequeue(id: string): { removed: boolean; pending: number } {
    const idx = messageQueue.findIndex(m => m.id === id);
    if (idx < 0) return { removed: false, pending: messageQueue.length };
    messageQueue.splice(idx, 1);
    try { getDb().prepare('DELETE FROM queued_messages WHERE id = ?').run(id); } catch { /* best-effort */ }
    bus.emit('queue_update', { pending: messageQueue.length });
    return { removed: true, pending: messageQueue.length };
}

export function listQueue(): QueueItem[] {
    return messageQueue.slice();
}

export function clearQueue(): number {
    const count = messageQueue.length;
    messageQueue.length = 0;
    try { getDb().prepare('DELETE FROM queued_messages').run(); } catch { /* best-effort */ }
    bus.emit('queue_update', { pending: 0 });
    return count;
}

export function setQueueHold(id: string): void {
    if (queueHoldId && queueHoldId !== id) clearQueueHold();
    queueHoldId = id;
    if (queueHoldTimer) clearTimeout(queueHoldTimer);
    const holdId = id;
    queueHoldTimer = setTimeout(() => {
        if (queueHoldId !== holdId) return;
        clearQueueHold();
    }, QUEUE_HOLD_TIMEOUT_MS);
}

export function clearQueueHold(id?: string, opts?: { resume?: boolean }): void {
    if (id && queueHoldId !== id) return;
    if (queueHoldTimer) clearTimeout(queueHoldTimer);
    queueHoldTimer = null;
    queueHoldId = null;
    if (opts?.resume ?? true) bus.emit('queue_resume');
}

export function getQueueHoldId(): string | null {
    return queueHoldId;
}

export function isQueueHeld(): boolean {
    return queueHoldId !== null;
}
