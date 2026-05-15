import { addEmployeeIfNotExists } from '../registry/db.js';
import type { EmployeeInput } from '../registry/types.js';

const DEFAULTS: EmployeeInput[] = [
    { name: 'Frontend', cli: 'claude', model: 'opus', role: 'UI/UX, CSS, components' },
    { name: 'Backend', cli: 'codex', model: 'gpt-5.5', role: 'API, DB, server logic' },
    { name: 'Data', cli: 'gemini', model: 'gemini-3.1-pro', role: 'Data pipeline, analysis, ML' },
    { name: 'Docs', cli: 'codex', model: null, role: 'Documentation, README, API docs' },
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
