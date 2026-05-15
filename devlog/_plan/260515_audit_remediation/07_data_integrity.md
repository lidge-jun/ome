# Phase 07 — Data Integrity

## Problems

### 7a. removeEmployee leaves orphan sessions
`removeEmployee(name)` deletes from `employees` table but doesn't touch `employee_sessions`. Orphan session records accumulate.

### 7b. setQuota partial update overwrites
`setQuota()` defaults missing fields to 0 via `?? 0`. Updating only `dailyLimit` without sending `hourlyLimit` resets hourlyLimit to 0.

## Plan

### MODIFY `src/registry/db.ts`

**7a — Cascade delete** (actual signature: `removeEmployee(name: string): boolean`):
```typescript
export function removeEmployee(name: string): boolean {
    const d = getDb();
    const emp = findEmployee(name);
    if (!emp) return false;
    d.prepare('DELETE FROM employee_sessions WHERE employee_id = ?').run(emp.id);
    const result = d.prepare('DELETE FROM employees WHERE name = ?').run(name);
    return result.changes > 0;
}
```

Note: `employees.id` is UUID string (TEXT PRIMARY KEY), not number.
Callers (`routes.ts:67`, `cli/index.ts:117`) pass `name: string` — signature preserved.

**7b — Merge update** (actual signature: `setQuota(config: Partial<QuotaConfig>): void`):
```typescript
export function setQuota(config: Partial<QuotaConfig>): void {
    const d = getDb();
    const existing = getQuota();
    const merged = {
        dailyLimit: config.dailyLimit ?? existing.dailyLimit,
        hourlyLimit: config.hourlyLimit ?? existing.hourlyLimit,
    };
    d.prepare(
        "INSERT INTO quota_config (key, daily_limit, hourly_limit) VALUES ('default', ?, ?) ON CONFLICT(key) DO UPDATE SET daily_limit = ?, hourly_limit = ?, updated_at = datetime('now')"
    ).run(merged.dailyLimit, merged.hourlyLimit, merged.dailyLimit, merged.hourlyLimit);
}
```

Note: QuotaConfig has `dailyLimit` and `hourlyLimit` only (no `windowHours`).
`getQuota()` takes no parameters — single-row table with key='default'.
Caller (`routes.ts:102`) passes config object only — signature preserved.

### NEW `tests/registry/db.test.ts`
- Test: add employee → add session → delete employee → query sessions → empty
- Test: setQuota({ dailyLimit: 100 }) → setQuota({ hourlyLimit: 50 }) → dailyLimit still 100

## Verification
- `npm test` passes
- `npm run typecheck` passes
- Callers in routes.ts and cli/index.ts compile without changes
