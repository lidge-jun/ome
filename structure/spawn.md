# Spawn Module

프로세스 생성, 추적, kill, job 영속화를 담당. OME의 핵심 런타임.

## 파일 구성

| File | Lines | 역할 |
|------|-------|------|
| `spawn/index.ts` | 203 | spawnAgent(), killJob(), killAllJobs(), bus |
| `spawn/jobs.ts` | 141 | Job meta.json + ndjson 영속화 |
| `spawn/process-kill.ts` | 60 | 크로스플랫폼 프로세스 트리 kill |
| `spawn/args.ts` | 38 | CLI별 인자 빌더 |

## spawnAgent()

```
spawnAgent(prompt, opts?) → { jobId, result: Promise<SpawnResult> }
```

1. `createJob()` → meta.json + empty .ndjson
2. `spawn(cliPath, args, { detached: true, stdio: pipe })`
3. stdout → line buffer → `appendJobLog()` → bus emit
4. stderr → in-memory cap (1MB)
5. timeout → `killJob()` with "timeout" reason
6. close → `settle()` → completeJob/cancelJob

### stdout/stderr Cap

- stdout: 10MB in-memory. 초과 시 `[ome] output truncated at 10MB` 메시지 추가. 전체 로그는 .ndjson 파일에 기록.
- stderr: 1MB in-memory. 초과 시 조용히 무시.

## Kill 체계

```
killJob(jobId, reason)
  → cancelledJobs.add(jobId)
  → updateJob({ status: 'cancelling' })
  → terminateProcessTree(pid)      # SIGTERM to process group
  → scheduleForceKill(pid, 2000)   # SIGKILL fallback
  → close event (deferred) → settle() → cancelJob()

killAllJobs(reason)
  → iterates activeJobs → killJob each

killJobByPid(jobId, reason)
  → reads meta from disk (for detached/CLI kill scenarios)
```

### Process Tree Kill (Unix)

```
detached: true → child becomes process group leader
process.kill(-pid, 'SIGTERM') → kills entire group
fallback: process.kill(pid, 'SIGTERM') → single process
scheduleForceKill → process.kill(-pid, 'SIGKILL') + process.kill(pid, 'SIGKILL')
```

Windows: `taskkill /PID /T /F` 사용.

## Job 영속화

저장 위치: `$OME_HOME/jobs/` (기본 `~/.ome/jobs/`)

| 파일 | 포맷 | 용도 |
|------|------|------|
| `job-xxx.meta.json` | JSON | Job 메타데이터 (status, pid, cli, prompt...) |
| `job-xxx.ndjson` | NDJSON | stdout 라인 로그 |

- atomic write: meta.json은 tmp → rename
- pruning: 완료된 job 50개 초과 시 오래된 것부터 삭제
- `readJobLogFrom(id, byteOffset)` → byte offset 기반 incremental read (watch 최적화용)

## EventEmitter (bus)

```typescript
bus.emit('agent_start', { cli, pid, jobId })
bus.emit('job_log', { jobId, line })
bus.emit('agent_done', { cli, code, pid, jobId })
bus.emit('agent_error', { cli, error, jobId })
bus.emit('agent_kill', { reason, pid, jobId })
```
