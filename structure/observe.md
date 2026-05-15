# Observe Module

실시간 프로세스 추적. NDJSON 로그를 파싱하여 통일된 이벤트 스트림 제공.

## 파일 구성

| File | Lines | 역할 |
|------|-------|------|
| `observe/index.ts` | 103 | watch() async generator, inspect() snapshot |
| `observe/parser.ts` | 96 | CLI별 NDJSON 파서 (claude/codex/gemini) |
| `observe/types.ts` | 24 | LiveRunState, ParsedToolCall |

## watch(jobId, pollMs?)

Byte-offset 기반 incremental polling. 전체 파일을 매번 읽지 않음.

```
watch(jobId, 500)
  → readJobLogFrom(jobId, byteOffset=0)
  → parse new lines → yield ProgressEvent
  → poll until status ≠ running/cancelling
  → final drain (catch lines between last poll and status change)
```

`cancelling` 상태에서도 계속 watch — kill 시그널 후에도 로그가 발생할 수 있음.

## inspect(jobId)

One-shot 스냅샷. 전체 로그를 읽어 LiveRunState 반환.

```typescript
interface LiveRunState {
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

## Parser — CLI별 NDJSON 포맷

| CLI | assistant | tool_use | thinking |
|-----|-----------|----------|----------|
| claude | `type: "assistant"` + `message` | `type: "tool_use"` + `name` | `type: "thinking"` |
| codex | `type: "message"` | `type: "function_call"` | — |
| gemini | `type: "text"` | `type: "functionCall"` | — |

Unknown CLI → generic parser (best-effort JSON field mapping).
