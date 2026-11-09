import {test as base, expect, type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Couverture E2E Istanbul : le build doit être instrumenté avec
 * `VITE_E2E_COVERAGE=1`. Sans `FLUIDITE_COVERAGE_DIR`, ce fixture est inerte.
 *
 * Chaque navigation complète perd `window.__coverage__` : un `beforeunload`
 * archive la couverture du document sortant dans `sessionStorage` pour ne pas
 * perdre les pages précédentes d'un même scénario.
 */
const COVERAGE_DIR = process.env.FLUIDITE_COVERAGE_DIR;
const STORAGE_KEY = '__fluidite_cov_pages__';

type CoverageMap = Record<string, unknown>;

async function collectCoverage(page: Page): Promise<CoverageMap[]> {
    return page.evaluate((key) => {
        const snapshots: CoverageMap[] = [];
        try {
            const stored = JSON.parse(sessionStorage.getItem(key) ?? '[]');
            if (Array.isArray(stored)) snapshots.push(...stored);
        } catch {
            // Stockage optionnel : la couverture courante reste collectée.
        }
        const current = (window as {__coverage__?: CoverageMap}).__coverage__;
        if (current) snapshots.push(current);
        return snapshots;
    }, STORAGE_KEY);
}

export const test = base.extend({
    page: async ({page}, runTest, testInfo) => {
        if (COVERAGE_DIR) {
            await page.addInitScript((key) => {
                window.addEventListener('beforeunload', () => {
                    try {
                        const coverage = (window as {__coverage__?: CoverageMap}).__coverage__;
                        if (!coverage) return;
                        const stored = JSON.parse(sessionStorage.getItem(key) ?? '[]');
                        const snapshots = Array.isArray(stored) ? stored : [];
                        snapshots.push(coverage);
                        sessionStorage.setItem(key, JSON.stringify(snapshots));
                    } catch {
                        // Best effort : une page non couverte ne doit pas casser le test.
                    }
                });
            }, STORAGE_KEY);
        }

        await runTest(page);

        if (!COVERAGE_DIR) return;
        try {
            const snapshots = await collectCoverage(page);
            if (snapshots.length === 0) return;
            fs.mkdirSync(COVERAGE_DIR, {recursive: true});
            const safeTitle = testInfo.title.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80) || 'test';
            snapshots.forEach((snapshot, index) => {
                const file = path.join(COVERAGE_DIR, `${safeTitle}-${testInfo.workerIndex}-${index}.json`);
                fs.writeFileSync(file, JSON.stringify(snapshot));
            });
        } catch (error) {
            console.warn('[e2e-coverage] collecte impossible', error);
        }
    },
});

export {expect};
export type {Page};
