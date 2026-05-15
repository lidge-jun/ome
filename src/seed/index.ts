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
