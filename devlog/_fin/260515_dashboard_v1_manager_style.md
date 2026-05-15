# OME Dashboard v1 — Manager-Style Rewrite

- date: 2026-05-15
- status: complete
- scope: Frontend dashboard rewrite from dark minimal → cli-jaw Manager layout

---

## What Was Done

### 1. Layout Rewrite (dashboard.ts)
- Dark single-column → light sidebar + main layout (matches cli-jaw Manager)
- Sidebar: status badge, stats (employees/jobs/queue), CLI list, quota bars, refresh toggle
- Main: employee card grid, jobs table, quota form

### 2. Employee Card UX (dashboard.ts)
- Cards with CLI/Model `<select>` dropdowns (editable inline)
- Model options change dynamically when CLI selection changes
- Save button appears on dirty state, `×` delete with confirm
- `+ 추가` toggle form with Name/CLI/Model/Role fields

### 3. Backend: Employee Update (db.ts, routes.ts)
- Added `updateEmployee(name, updates)` in db.ts
- Added `PUT /api/employees/:name` route
- Full CRUD: POST (add), GET (list), PUT (update), DELETE (remove)

### 4. Seed Migration
- Updated seed to cli-jaw employee set: Frontend (claude/sonnet), Backend (codex/o3-pro), Data (gemini/gemini-2.5-flash), Docs (codex/o3-pro)

### 5. Styles (dashboard-styles.ts)
- Light theme, card layout, sidebar responsive
- `.save-row` / `.save-btn` for inline edit save

## Files Changed

| File | Action |
|------|--------|
| `src/web/dashboard.ts` | REWRITE — sidebar+cards layout, 365 lines |
| `src/web/dashboard-styles.ts` | MODIFY — added save-row styles |
| `src/registry/db.ts` | MODIFY — added `updateEmployee()` |
| `src/web/routes.ts` | MODIFY — added PUT endpoint |
| `src/seed/index.ts` | MODIFY — cli-jaw employee set |

## Known Gaps (→ v2)
1. Quota is global (daily/hourly job count), not per-CLI real usage
2. No auth detection per CLI
3. Sidebar quota bars count jobs, not actual API usage from providers
4. Employee management works but needs validation polish
