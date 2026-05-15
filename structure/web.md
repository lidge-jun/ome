# Web Module

Management dashboard + REST API.

## 파일 구성

| File | Lines | 역할 |
|------|-------|------|
| `web/index.ts` | 55 | createServer(opts), auth middleware |
| `web/routes.ts` | 136 | REST API endpoints |
| `web/dashboard.ts` | 116 | HTML dashboard template |

## 인증

```
createServer({ port, host, authToken })
  → isLoopback(host)? → auth 불필요
  → non-loopback? → authToken ?? randomBytes(24).hex()
  → 시작 시 토큰 콘솔 출력

checkAuth(req, token)
  → Authorization: Bearer <token>
  → ?token=<token> query param
```

non-loopback에서 `--auth-token` 미지정 시 자동 생성.

## REST API

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| GET | /api/status | ✓ | busy, activeJobs, queueDepth, employees |
| GET | /api/employees | ✓ | 직원 목록 |
| POST | /api/employees | ✓ | 직원 추가 (name, cli, model, role) |
| DELETE | /api/employees/:name | ✓ | 직원 삭제 |
| GET | /api/jobs | ✓ | Job 목록 |
| GET | /api/jobs/:id | ✓ | Job inspect (LiveRunState) |
| GET | /api/quota | ✓ | Quota 설정 조회 |
| PUT | /api/quota | ✓ | Quota 설정 변경 |

### 보안

- **Origin check**: mutation method (POST/PUT/DELETE/PATCH)에서 Origin ≠ Host 시 403
- **Error sanitization**: UNIQUE constraint → 409 "already exists", 기타 → 500 "internal error" (raw message는 서버 로그만)
- **Body limit**: 1MB max

## Dashboard

`getDashboardHtml()` — single-page HTML dashboard.

- 5초 간격 자동 새로고침
- Employee CRUD, Quota 설정, Job 목록 + inspect
- **DOM-safe**: `innerHTML` 미사용, `replaceChildren()` + `createElement` + `textContent` only
