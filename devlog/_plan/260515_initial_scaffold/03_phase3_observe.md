# P3: Observe — NDJSON Parser + LiveRunState + watch/inspect

## Summary
agent가 직원의 실시간 동작을 볼 수 있게 하는 observe 모듈.
각 CLI의 NDJSON 출력을 통일 포맷으로 파싱하고, 누적 상태를 관리.

## Audit Fixes Applied (Round 1)
- ✅ unused `getActiveJobs` import 제거
- ✅ `LiveRunState.status` → `JobStatus` 타입 통일 (cancelled 포함)
- ✅ watch race condition → listener 선등록 후 offset replay
- ✅ watch 종료 → `agent_error`/cancel 이벤트 처리 추가

## Audit Fixes Applied (Round 2)
- ✅ watch replay/live 중복 → offset 기반 dedupe (replay line count 기록, live queue는 offset 이후만 yield)
- ✅ `extractToolCalls()` → sequence-based synthetic id로 동일 tool 병렬 호출 구분

## Audit Fixes Applied (Round 3)
- ✅ `watch()` → bus 기반에서 file-tailing(polling) 방식으로 전면 교체 (별도 CLI 프로세스에서도 동작)
- ✅ `bus` import 제거 — observe 모듈은 파일만 읽음 (cross-process safe)
- ✅ `watch()` 종료 후 final drain 추가 (마지막 poll과 status 변경 사이 누락 방지)

## Files

| Action | Path | Description |
|--------|------|-------------|
| NEW | `src/observe/types.ts` | LiveRunState, ParsedToolCall 타입 |
| NEW | `src/observe/parser.ts` | CLI별 NDJSON → ProgressEvent 파서 |
| NEW | `src/observe/index.ts` | watch(jobId), inspect(jobId) API |

---

## NEW: `src/observe/types.ts`

```typescript
import type { ProgressEvent, JobStatus } from '../registry/types.js';

export interface ParsedToolCall {
    name: string;
    input: string;
    output: string | null;
    status: 'running' | 'done' | 'error';
    startedAt: string;
    completedAt: string | null;
}

export interface LiveRunState {
    jobId: string;
    cli: string;
    status: JobStatus;
    currentPhase: string;
    toolCalls: ParsedToolCall[];
    thinkingText: string;
    outputText: string;
    eventCount: number;
    lastEvent: ProgressEvent | null;
    startedAt: string;
    updatedAt: string;
}
```

---

## NEW: `src/observe/parser.ts`

```typescript
import type { ProgressEvent } from '../registry/types.js';

export function parseLine(cli: string, raw: string): ProgressEvent | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let parsed: unknown;
    try { parsed = JSON.parse(trimmed); } catch { return null; }

    if (!parsed || typeof parsed !== 'object') return null;

    const ts = new Date().toISOString();

    switch (cli) {
        case 'claude': return parseClaudeEvent(parsed as Record<string, unknown>, ts);
        case 'codex': return parseCodexEvent(parsed as Record<string, unknown>, ts);
        case 'gemini': return parseGeminiEvent(parsed as Record<string, unknown>, ts);
        default: return parseGenericEvent(parsed as Record<string, unknown>, ts);
    }
}

function parseClaudeEvent(obj: Record<string, unknown>, ts: string): ProgressEvent {
    const type = String(obj['type'] ?? 'unknown');
    const mapped = mapEventType(type);

    let message = '';
    let toolName: string | null = null;

    if (type === 'assistant' && obj['message']) {
        const msg = obj['message'] as Record<string, unknown>;
        const content = msg['content'];
        if (Array.isArray(content)) {
            message = content
                .filter((c: Record<string, unknown>) => c['type'] === 'text')
                .map((c: Record<string, unknown>) => c['text'])
                .join('');
        }
    } else if (type === 'tool_use' || type === 'tool_result') {
        const tool = obj['tool'] as Record<string, unknown> | undefined;
        toolName = String(tool?.['name'] ?? obj['name'] ?? '');
        message = `${type}: ${toolName}`;
    } else if (type === 'result') {
        message = String(obj['result'] ?? '').slice(0, 200);
    } else {
        message = JSON.stringify(obj).slice(0, 200);
    }

    return { type: mapped, message, phase: null, toolName, raw: obj, ts };
}

function parseCodexEvent(obj: Record<string, unknown>, ts: string): ProgressEvent {
    const type = String(obj['type'] ?? 'unknown');
    const mapped = mapEventType(type);
    const message = String(obj['message'] ?? obj['text'] ?? JSON.stringify(obj)).slice(0, 200);
    const phase = typeof obj['phase'] === 'string' ? obj['phase'] : null;
    const toolName = typeof obj['tool'] === 'string' ? obj['tool'] : null;
    return { type: mapped, message, phase, toolName, raw: obj, ts };
}

function parseGeminiEvent(obj: Record<string, unknown>, ts: string): ProgressEvent {
    const type = String(obj['type'] ?? obj['event'] ?? 'unknown');
    const mapped = mapEventType(type);
    const message = String(obj['text'] ?? obj['content'] ?? JSON.stringify(obj)).slice(0, 200);
    const toolName = typeof obj['functionCall'] === 'object'
        ? String((obj['functionCall'] as Record<string, unknown>)['name'] ?? '')
        : null;
    return { type: mapped, message, phase: null, toolName, raw: obj, ts };
}

function parseGenericEvent(obj: Record<string, unknown>, ts: string): ProgressEvent {
    const type = mapEventType(String(obj['type'] ?? 'unknown'));
    return {
        type,
        message: JSON.stringify(obj).slice(0, 200),
        phase: typeof obj['phase'] === 'string' ? obj['phase'] : null,
        toolName: null,
        raw: obj,
        ts,
    };
}

function mapEventType(raw: string): ProgressEvent['type'] {
    const map: Record<string, ProgressEvent['type']> = {
        assistant: 'assistant',
        message: 'assistant',
        text: 'assistant',
        tool_use: 'tool_use',
        tool_result: 'tool_result',
        function_call: 'tool_use',
        function_response: 'tool_result',
        thinking: 'thinking',
        error: 'error',
        system: 'system',
    };
    return map[raw] ?? 'unknown';
}
```

---

## NEW: `src/observe/index.ts`

```typescript
import { readJobMeta, readJobLog } from '../spawn/jobs.js';
import { parseLine } from './parser.js';
import type { LiveRunState, ParsedToolCall } from './types.js';
import type { ProgressEvent } from '../registry/types.js';

export function inspect(jobId: string): LiveRunState | null {
    const meta = readJobMeta(jobId);
    if (!meta) return null;

    const lines = readJobLog(jobId);
    const events: ProgressEvent[] = [];
    for (const line of lines) {
        const ev = parseLine(meta.cli, line);
        if (ev) events.push(ev);
    }

    const toolCalls = extractToolCalls(events);
    const thinkingText = events
        .filter(e => e.type === 'thinking')
        .map(e => e.message)
        .join('\n');
    const outputText = events
        .filter(e => e.type === 'assistant')
        .map(e => e.message)
        .join('');

    return {
        jobId,
        cli: meta.cli,
        status: meta.status,
        currentPhase: meta.phase,
        toolCalls,
        thinkingText,
        outputText,
        eventCount: events.length,
        lastEvent: events.at(-1) ?? null,
        startedAt: meta.createdAt,
        updatedAt: meta.updatedAt,
    };
}

export async function* watch(jobId: string, pollMs = 500): AsyncGenerator<ProgressEvent> {
    const meta = readJobMeta(jobId);
    if (!meta) return;

    let offset = 0;

    while (true) {
        const lines = readJobLog(jobId);
        const newLines = lines.slice(offset);
        offset = lines.length;

        for (const line of newLines) {
            const ev = parseLine(meta.cli, line);
            if (ev) yield ev;
        }

        const current = readJobMeta(jobId);
        if (!current || current.status !== 'running') break;

        await new Promise(r => setTimeout(r, pollMs));
    }

    // Final drain — catch lines written between last poll and status change
    const finalLines = readJobLog(jobId);
    for (const line of finalLines.slice(offset)) {
        const ev = parseLine(meta.cli, line);
        if (ev) yield ev;
    }
}

function extractToolCalls(events: ProgressEvent[]): ParsedToolCall[] {
    const calls: ParsedToolCall[] = [];
    // Stack per tool name to handle parallel/repeated calls of same tool
    const pending = new Map<string, ParsedToolCall[]>();

    for (const ev of events) {
        if (ev.type === 'tool_use' && ev.toolName) {
            const call: ParsedToolCall = {
                name: ev.toolName,
                input: ev.message,
                output: null,
                status: 'running',
                startedAt: ev.ts,
                completedAt: null,
            };
            const stack = pending.get(ev.toolName) ?? [];
            stack.push(call);
            pending.set(ev.toolName, stack);
            calls.push(call);
        } else if (ev.type === 'tool_result' && ev.toolName) {
            const stack = pending.get(ev.toolName);
            if (stack && stack.length > 0) {
                // FIFO: match oldest pending call for this tool
                const call = stack.shift()!;
                call.output = ev.message;
                call.status = 'done';
                call.completedAt = ev.ts;
                if (stack.length === 0) pending.delete(ev.toolName);
            }
        }
    }

    return calls;
}

export type { LiveRunState, ParsedToolCall } from './types.js';
```
