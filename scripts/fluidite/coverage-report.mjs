/**
 * Rapport de couverture E2E front.
 *
 * - fusionne les snapshots Istanbul écrits par `tests/fluidite/base.ts` ;
 * - ajoute les fichiers `src/**` jamais chargés avec 0 % (couverture réelle
 *   du dépôt, pas seulement des chunks chargés) ;
 * - écrit un rapport texte + `coverage-summary.json`.
 *
 * Usage :
 *   node scripts/fluidite/coverage-report.mjs <raw-dir> [source-root] [out-dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import coverageLib from 'istanbul-lib-coverage';
import instrumentLib from 'istanbul-lib-instrument';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';

const { createCoverageMap } = coverageLib;
const { createInstrumenter } = instrumentLib;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.resolve(process.argv[2] ?? path.join(HERE, '..', '..', 'coverage', 'front-raw'));
const sourceRoot = path.resolve(process.argv[3] ?? path.join(HERE, '..', '..', 'src'));
const outDir = path.resolve(process.argv[4] ?? path.join(rawDir, '..', 'front-report-all'));

if (!fs.existsSync(rawDir)) {
    console.error(`[coverage-e2e] Dossier de couverture introuvable : ${rawDir}`);
    process.exit(1);
}

const EXCLUDED_SOURCES = new Set([
    'map/snap/types.ts',
    'perf/WorldProbePanel.tsx',
    'perf/WorldPreparationBadge.tsx',
    'components/UI/PerformancePanel.tsx',
    'lib/thumbnailIdleEnvelope.ts',
    'lib/mobileDiagnostics.ts',
    'lib/worldResources.ts',
    'perf/worldProbeMetrics.ts',
    'worlds/slotMachineProbe.ts',
    'setupTests.ts',
]);
const EXCLUDED_PREFIXES = ['types/', 'avatar/render/'];

function relativeToSource(file) {
    return path.relative(sourceRoot, path.resolve(file)).replaceAll('\\', '/');
}

function isExcluded(file) {
    const relative = relativeToSource(file);
    return EXCLUDED_PREFIXES.some((prefix) => relative.startsWith(prefix)) || EXCLUDED_SOURCES.has(relative);
}

const coverageMap = createCoverageMap({});
for (const entry of fs.readdirSync(rawDir)) {
    if (!entry.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(rawDir, entry), 'utf8'));
    const filtered = {};
    for (const [file, fileCoverage] of Object.entries(data)) {
        if (!isExcluded(file)) filtered[file] = fileCoverage;
    }
    coverageMap.merge(filtered);
}

function collectSourceFiles(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
            files.push(...collectSourceFiles(full));
            continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
        if (entry.name.endsWith('.d.ts')) continue;
        if (isExcluded(full)) continue;
        files.push(full);
    }
    return files;
}

const instrumenter = createInstrumenter({
    esModules: true,
    produceSourceMap: false,
    coverageVariable: '__coverage__',
});
const known = new Set(coverageMap.files().map((file) => path.resolve(file).toLowerCase()));
let added = 0;
for (const file of collectSourceFiles(sourceRoot)) {
    if (known.has(path.resolve(file).toLowerCase())) continue;
    try {
        // `istanbul-lib-instrument` ne parse pas TypeScript/TSX : on transpile
        // d'abord. Ces fichiers n'ont aucun hit ; seuls les compteurs de
        // statements/branches du dénominateur nous intéressent.
        const source = fs.readFileSync(file, 'utf8');
        const transpiled = ts.transpileModule(source, {
            fileName: file,
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
                jsx: ts.JsxEmit.ReactJSX,
                esModuleInterop: true,
            },
        }).outputText;
        instrumenter.instrumentSync(transpiled, file.replaceAll('\\', '/'));
        const fileCoverage = instrumenter.lastFileCoverage();
        for (const key of Object.keys(fileCoverage.s)) fileCoverage.s[key] = 0;
        for (const key of Object.keys(fileCoverage.f)) fileCoverage.f[key] = 0;
        for (const key of Object.keys(fileCoverage.b)) fileCoverage.b[key] = fileCoverage.b[key].map(() => 0);
        coverageMap.addFileCoverage(fileCoverage);
        added += 1;
    } catch (error) {
        console.warn(`[coverage-e2e] fichier non instrumentable ignoré : ${file}`, error instanceof Error ? error.message : error);
    }
}

fs.mkdirSync(outDir, {recursive: true});
const context = libReport.createContext({dir: outDir, coverageMap});
reports.create('text').execute(context);
reports.create('json-summary', {file: 'coverage-summary.json'}).execute(context);

const total = coverageMap.getCoverageSummary();
console.log(`\n[coverage-e2e] fichiers ajoutés à 0 % : ${added}`);
console.log(`[coverage-e2e] TOTAL lignes ${total.lines.pct}% (${total.lines.covered}/${total.lines.total}) · branches ${total.branches.pct}% (${total.branches.covered}/${total.branches.total})`);
