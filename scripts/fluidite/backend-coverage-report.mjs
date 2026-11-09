/**
 * Rapport de couverture E2E backend (coverage.py JSON).
 *
 * Les données peuvent provenir de plusieurs processus combinés (API HTTP,
 * worker Beer Call, worker sprites). Le périmètre « web » exclut les fichiers
 * de workers eux-mêmes et `services/animation_pruning.py` (script one-shot),
 * mais inclut les services métier exécutés par ces workers.
 *
 * Usage : node scripts/fluidite/backend-coverage-report.mjs <coverage.json> [out.json]
 */
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
    console.error('usage: node scripts/fluidite/backend-coverage-report.mjs <coverage.json> [out.json]');
    process.exit(1);
}
const output = process.argv[3];

const EXCLUDED_PREFIXES = ['workers/'];
const EXCLUDED_FILES = new Set(['services/animation_pruning.py']);

const coverage = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
const files = {};
for (const [absolute, data] of Object.entries(coverage.files)) {
    const relative = absolute.replace(/^\/app\//, '').replaceAll('\\', '/');
    if (EXCLUDED_PREFIXES.some((prefix) => relative.startsWith(prefix))) continue;
    if (EXCLUDED_FILES.has(relative)) continue;
    files[relative] = data.summary;
}

const modules = {};
for (const [file, summary] of Object.entries(files)) {
    const parts = file.split('/');
    const module = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') : '(root)';
    const entry = modules[module] ?? { covered: 0, total: 0 };
    entry.covered += summary.covered_lines;
    entry.total += summary.num_statements;
    modules[module] = entry;
}

const totals = Object.values(modules).reduce((acc, entry) => ({
    covered: acc.covered + entry.covered,
    total: acc.total + entry.total,
}), {covered: 0, total: 0});
const percent = totals.total ? 100 * totals.covered / totals.total : 0;

const report = {
    scope: 'E2E backend mesuré via API HTTP + workers de traitement (fichiers workers/* et animation_pruning exclus)',
    percent: Number(percent.toFixed(2)),
    covered: totals.covered,
    total: totals.total,
    modules: Object.fromEntries(Object.entries(modules).sort().map(([name, entry]) => [name, {
        percent: entry.total ? Number((100 * entry.covered / entry.total).toFixed(2)) : 100,
        covered: entry.covered,
        total: entry.total,
    }])),
    files: Object.fromEntries(Object.entries(files).sort().map(([name, summary]) => [name, {
        percent: Number(summary.percent_covered.toFixed(2)),
        covered: summary.covered_lines,
        total: summary.num_statements,
    }])),
};

for (const [name, entry] of Object.entries(report.modules)) {
    console.log(`${name.padEnd(22)} ${String(entry.percent).padStart(6)} %  ${entry.covered}/${entry.total}`);
}
console.log(`${'TOTAL'.padEnd(22)} ${String(report.percent).padStart(6)} %  ${report.covered}/${report.total}`);

if (output) {
    fs.writeFileSync(path.resolve(output), JSON.stringify(report, null, 2));
}
