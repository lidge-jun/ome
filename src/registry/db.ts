import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Employee, EmployeeInput, EmployeeSession, QuotaConfig } from './types.js';

let db: Database.Database | null = null;

export function initDb(dbPath: string): Database.Database {
    if (db) return db;
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.exec(`
        CREATE TABLE IF NOT EXISTS employees (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            cli TEXT NOT NULL,
            model TEXT,
            role TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS queued_messages (
            id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS employee_sessions (
            employee_id TEXT NOT NULL,
            session_id TEXT,
            cli TEXT,
            model TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (employee_id)
        );
        CREATE TABLE IF NOT EXISTS quota_config (
            key TEXT PRIMARY KEY DEFAULT 'default',
            daily_limit INTEGER NOT NULL DEFAULT 0,
            hourly_limit INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    `);
    try {
        db.exec(`ALTER TABLE employees ADD COLUMN prompt TEXT`);
    } catch { /* column already exists */ }
    return db;
}

export function getDb(): Database.Database {
    if (!db) throw new Error('OME database not initialized. Call initDb() first.');
    return db;
}

export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
    }
}

export function addEmployee(input: EmployeeInput): Employee {
    const d = getDb();
    const id = randomUUID();
    d.prepare(
        'INSERT INTO employees (id, name, cli, model, role, prompt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, input.name, input.cli, input.model ?? null, input.role ?? null, input.prompt ?? null);
    return getEmployeeById(id)!;
}

export function removeEmployee(name: string): boolean {
    const d = getDb();
    const emp = findEmployee(name);
    if (emp) {
        d.prepare('DELETE FROM employee_sessions WHERE employee_id = ?').run(emp.id);
    }
    const result = d.prepare('DELETE FROM employees WHERE name = ?').run(name);
    return result.changes > 0;
}

export function listEmployees(): Employee[] {
    const d = getDb();
    return d.prepare('SELECT id, name, cli, model, role, prompt, created_at as createdAt FROM employees ORDER BY created_at').all() as Employee[];
}

export function findEmployee(name: string): Employee | null {
    const d = getDb();
    const exact = d.prepare('SELECT id, name, cli, model, role, prompt, created_at as createdAt FROM employees WHERE name = ?').get(name) as Employee | undefined;
    if (exact) return exact;
    const lower = d.prepare('SELECT id, name, cli, model, role, prompt, created_at as createdAt FROM employees WHERE LOWER(name) = LOWER(?)').get(name) as Employee | undefined;
    return lower ?? null;
}

function getEmployeeById(id: string): Employee | null {
    const d = getDb();
    return (d.prepare('SELECT id, name, cli, model, role, prompt, created_at as createdAt FROM employees WHERE id = ?').get(id) as Employee | undefined) ?? null;
}

export function getQuota(): QuotaConfig {
    const d = getDb();
    const row = d.prepare(
        "SELECT daily_limit as dailyLimit, hourly_limit as hourlyLimit, updated_at as updatedAt FROM quota_config WHERE key = 'default'"
    ).get() as { dailyLimit: number; hourlyLimit: number; updatedAt: string } | undefined;
    return row ?? { dailyLimit: 0, hourlyLimit: 0, updatedAt: '' };
}

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

export function updateEmployee(name: string, updates: Partial<EmployeeInput>): Employee | null {
    const existing = findEmployee(name);
    if (!existing) return null;
    const d = getDb();
    d.prepare(
        'UPDATE employees SET cli = ?, model = ?, role = ?, prompt = ? WHERE name = ?'
    ).run(updates.cli ?? existing.cli, updates.model ?? existing.model, updates.role ?? existing.role, updates.prompt !== undefined ? updates.prompt : existing.prompt, name);
    return findEmployee(name);
}

export function addEmployeeIfNotExists(input: EmployeeInput): { added: boolean; employee: Employee } {
    const existing = findEmployee(input.name);
    if (existing) return { added: false, employee: existing };

    const d = getDb();
    const id = randomUUID();
    const result = d.prepare(
        'INSERT OR IGNORE INTO employees (id, name, cli, model, role, prompt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, input.name, input.cli, input.model ?? null, input.role ?? null, input.prompt ?? null);

    if (result.changes === 0) {
        const winner = findEmployee(input.name);
        if (!winner) throw new Error(`Employee "${input.name}" vanished after INSERT OR IGNORE`);
        return { added: false, employee: winner };
    }

    const emp = getEmployeeById(id);
    if (!emp) throw new Error(`Employee "${input.name}" not found after successful INSERT`);
    return { added: true, employee: emp };
}

// --- Employee session management ---

export function getEmployeeSession(employeeId: string): EmployeeSession | null {
    const d = getDb();
    const row = d.prepare(
        'SELECT employee_id as employeeId, session_id as sessionId, cli, model, created_at as createdAt FROM employee_sessions WHERE employee_id = ?'
    ).get(employeeId) as EmployeeSession | undefined;
    return row ?? null;
}

export function upsertEmployeeSession(employeeId: string, sessionId: string, cli: string, model: string): void {
    const d = getDb();
    d.prepare(
        `INSERT INTO employee_sessions (employee_id, session_id, cli, model) VALUES (?, ?, ?, ?)
         ON CONFLICT(employee_id) DO UPDATE SET session_id = ?, cli = ?, model = ?, created_at = datetime('now')`
    ).run(employeeId, sessionId, cli, model, sessionId, cli, model);
}

export function clearEmployeeSession(employeeId: string): void {
    const d = getDb();
    d.prepare('DELETE FROM employee_sessions WHERE employee_id = ?').run(employeeId);
}
