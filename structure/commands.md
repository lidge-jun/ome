# CLI Commands — cli/index.ts

12개 서브커맨드. Entry point: `bin` field → `dist/src/cli/index.js`.

## 커맨드 목록

| Command | 용도 | 주요 옵션 |
|---------|------|-----------|
| `spawn` | 단일 에이전트 CLI 실행 | `--cli`, `--model` |
| `dispatch` | 등록된 직원에게 작업 위임 | `--agent`, `--task` |
| `registry add` | 직원 추가 | `--name`, `--cli`, `--model`, `--role` |
| `registry remove` | 직원 삭제 | positional name |
| `registry list` | 직원 목록 | — |
| `queue list` | 큐 목록 | — |
| `queue hold` | 큐 아이템 보류 | positional id |
| `queue release` | 보류 해제 | positional id |
| `queue clear` | 큐 전체 삭제 | — |
| `jobs` | 추적된 job 목록 (최대 30개) | — |
| `kill` | 실행 중인 job 강제 종료 | positional job-id |
| `result` | 완료된 job의 전체 출력 | positional job-id |
| `watch` | job의 실시간 이벤트 스트림 | positional job-id |
| `inspect` | job의 현재 상태 스냅샷 | positional job-id |
| `web` | 관리 대시보드 서버 시작 | `--port`, `--host`, `--auth-token` |
| `init` | 기본 직원 seed (claude/codex/gemini) | — |
| `status` | 현재 상태 요약 | — |

## 초기화 흐름

```
main()
  → ensureDb() → mkdirSync(OME_HOME) + initDb(DB_PATH)
  → switch(command) → handler
  → finally: closeDb() (web 제외)
```

`OME_HOME` 환경변수로 DB/job 저장 위치 변경 가능 (기본 `~/.ome`).
