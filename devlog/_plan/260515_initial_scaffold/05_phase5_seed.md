# P5: Seed — `ome init` Default Employee Presets

## Summary
`ome init`으로 기본 직원(claude, codex, gemini) 자동 등록.
이미 존재하면 skip.

## Audit Fixes Applied (Round 1)
- ✅ `src/seed/` 디렉토리 생성 명시
- ✅ concurrent race → `INSERT OR IGNORE` 기반 idempotent insert

## Audit Fixes Applied (Round 2)
- ✅ `addEmployeeIfNotExists()` catch → unique constraint만 recover, 그 외 DB 오류 rethrow
- ✅ null assertion 제거 → explicit null check

## Audit Fixes Applied (Round 4)
- ✅ seed 기본 모델명(sonnet, o3-pro) — defaults로 허용. `defaultEmployees` export 제공으로 소비자가 override 가능. Future: `OME_DEFAULT_MODEL_*` env 또는 config file override 고려

## Files

| Action | Path | Description |
|--------|------|-------------|
| NEW | `src/seed/` | Directory creation required |
| NEW | `src/seed/index.ts` | seedDefaults() — 기본 직원 프리셋 |
| MODIFY | `src/registry/db.ts` | addEmployeeIfNotExists() 추가 |

---

## MODIFY: `src/registry/db.ts` — idempotent insert

### New export (end of file)
```typescript
export function addEmployeeIfNotExists(input: EmployeeInput): { added: boolean; employee: Employee } {
    const d = getDb();
    const existing = findEmployee(input.name);
    if (existing) return { added: false, employee: existing };

    const id = randomUUID();
    const result = d.prepare(
        'INSERT OR IGNORE INTO employees (id, name, cli, model, role) VALUES (?, ?, ?, ?, ?)'
    ).run(id, input.name, input.cli, input.model ?? null, input.role ?? null);

    if (result.changes === 0) {
        // INSERT OR IGNORE skipped — concurrent insert won the race
        const winner = findEmployee(input.name);
        if (!winner) throw new Error(`Employee "${input.name}" vanished after INSERT OR IGNORE`);
        return { added: false, employee: winner };
    }

    const emp = getEmployeeById(id);
    if (!emp) throw new Error(`Employee "${input.name}" not found after successful INSERT`);
    return { added: true, employee: emp };
}
```

Note: `getEmployeeById` is currently private — make it available in same file scope (no export needed).

---

## NEW: `src/seed/index.ts`

```typescript
import { addEmployeeIfNotExists } from '../registry/db.js';
import type { EmployeeInput } from '../registry/types.js';

const DEFAULTS: EmployeeInput[] = [
    { name: 'Claude', cli: 'claude', model: 'sonnet', role: 'General-purpose assistant' },
    { name: 'Codex', cli: 'codex', model: 'o3-pro', role: 'Code generation and review' },
    { name: 'Gemini', cli: 'gemini', model: null, role: 'Research and analysis' },
];

export function seedDefaults(): { added: string[]; skipped: string[] } {
    const added: string[] = [];
    const skipped: string[] = [];

    for (const preset of DEFAULTS) {
        const { added: wasAdded } = addEmployeeIfNotExists(preset);
        if (wasAdded) {
            added.push(preset.name);
        } else {
            skipped.push(preset.name);
        }
    }

    return { added, skipped };
}

export { DEFAULTS as defaultEmployees };
```
