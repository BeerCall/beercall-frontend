import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// 1. Validation stricte du BaseURL : loopback uniquement (CHAL-01 / C03)
const rawBaseUrl = process.env.FLUIDITE_BASE_URL || 'http://127.0.0.1:5180';
let parsedUrl: URL;
try {
    parsedUrl = new URL(rawBaseUrl);
} catch {
    throw new Error(`[playwright.fluidite] FLUIDITE_BASE_URL invalide : "${rawBaseUrl}"`);
}

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
if (!ALLOWED_HOSTS.has(parsedUrl.hostname)) {
    throw new Error(
        `[playwright.fluidite] Hôte interdit : "${parsedUrl.hostname}". ` +
        `Seules les adresses de loopback locales sont autorisées pour la recette C03.`
    );
}

// 2. Répertoire des rapports et artefacts
const runDir = process.env.FLUIDITE_RUN_DIR
    ? path.resolve(process.env.FLUIDITE_RUN_DIR)
    : path.resolve(HERE, '../../.opencode/plan/beercall/runs/C03');

export default defineConfig({
    testDir: './tests/fluidite',
    testMatch: '**/*.spec.ts',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 90_000,
    expect: {
        timeout: 15_000,
    },
    outputDir: path.join(runDir, 'artifacts'),
    reporter: [
        ['list'],
        ['json', { outputFile: path.join(runDir, 'report.json') }],
        ['html', { outputFolder: path.join(runDir, 'html-report'), open: 'never' }],
    ],
    use: {
        baseURL: parsedUrl.origin,
        viewport: { width: 428, height: 727 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        geolocation: { latitude: 48.8566, longitude: 2.3522 },
        permissions: ['geolocation'],
        screenshot: 'only-on-failure',
        trace: 'off',
        video: 'off',
        launchOptions: {
            args: [
                '--disable-web-security',
                '--no-sandbox',
                '--disable-dev-shm-usage',
            ],
        },
    },
});
