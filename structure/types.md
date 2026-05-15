# Types — registry/types.ts

OME의 핵심 타입 정의. 모든 모듈이 이 파일에 의존.

## AgentCli

```typescript
type AgentCli = 'claude' | 'codex' | 'gemini' | 'copilot' | 'opencode' | string;
```

Known issue: `| string`이 리터럴 유니온을 무력화함 → exhaustive switch 불가. Backlog으로 tagged union 전환 예정.

## Employee

```typescript
interface Employee {
    id: string;          // UUID
    name: string;        // unique, case-insensitive lookup
    cli: AgentCli;
    model: string | null;
    role: string | null;
    createdAt: string;   // ISO 8601
}
```

SQLite `employees` 테이블과 1:1. `findEmployee()`는 exact match 후 LOWER fallback.

## SpawnResult

```typescript
interface SpawnResult {
    text: string;        // stdout (10MB cap)
    code: number;        // exit code
    jobId?: string;
    sessionId?: string;
    stderr?: string;     // stderr (1MB cap) — v0.1.1+
    durationMs?: number; // wall-clock duration — v0.1.1+
}
```

## Job & JobStatus

```typescript
type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling';

interface Job {
    id: string;          // job-<base36-ts>-<uuid6>
    cli: string;
    prompt: string;      // truncated to 200 chars
    model: string | null;
    status: JobStatus;
    phase: string;       // lifecycle phase
    pid: number | null;  // OS process ID while running
    sessionId: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}
```

`cancelling`은 kill 시그널 전송 후 close 이벤트 대기 상태. `cancelled`는 close 이벤트 후 최종 상태.

## ProgressEvent

```typescript
interface ProgressEvent {
    type: 'assistant' | 'tool_use' | 'tool_result' | 'thinking' | 'error' | 'system' | 'unknown';
    message: string;
    phase: string | null;
    toolName: string | null;
    raw: unknown;
    ts: string;          // ISO 8601
}
```

NDJSON 로그에서 파싱. CLI별 포맷을 통일된 이벤트로 변환 (observe/parser.ts).

## QuotaConfig

```typescript
interface QuotaConfig {
    dailyLimit: number;
    hourlyLimit: number;
    updatedAt: string;
}
```

DB에 저장·조회 가능하지만 dispatch/spawn에서 enforcement 미구현 (backlog).
