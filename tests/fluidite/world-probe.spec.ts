/**
 * 8h-4b-1 — Parcours de mesure des mondes (build VITE_WORLD_PROBE=1).
 *
 * Vérifie sur la recette réelle :
 * - la version affichée avant le lancement (hash front + date de build) ;
 * - l'état du préchargement au repos et la référence de l'apéro ;
 * - 10 cycles Bar → Piscine → Dodo, soit 30 transitions mesurées ;
 * - dernier / médiane / p95, libellés et __webglStats ;
 * - un JSON copiable et une exécution sans erreur du probe.
 *
 * La référence de test est éclatée : Fluidite40/bc_21 porte Bar 10 + Piscine 10
 * mais Dodo 0 ; Fluidite50 porte Dodo 50 mais Bar/Piscine 0. Les deux cas sont
 * donc vérifiés séparément, sans modifier les données.
 */

import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loginAs } from './contextTracker';

test.use({ serviceWorkers: 'block' });

const screenshotDir = path.resolve(process.cwd(), '../.openchamber/screenshots');

test('le parcours mesure 10 cycles complets et affiche la version', async ({ page, request }) => {
    test.setTimeout(600_000);

    const probeErrors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error' && message.text().includes('[world-probe]')) {
            probeErrors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        if (error.message.includes('[world-probe]')) probeErrors.push(error.message);
    });

    const session = await loginAs(page, request, 'FluiditeDemo');

    const squadsResponse = await request.get('/api/squads/', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(squadsResponse.ok()).toBeTruthy();
    const squads = await squadsResponse.json() as Array<{ id: number; name: string; invite_code: string }>;
    const squad40 = squads.find((squad) => squad.invite_code === 'FLUID40');
    expect(squad40).toBeDefined();

    await page.goto(`/squad/${squad40!.id}`);
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });

    // Le parcours de référence part d'un préchargement terminé.
    await page.waitForFunction(
        () => (window as unknown as { __beercallWorldPreload?: { done?: boolean } })
            .__beercallWorldPreload?.done === true,
        null,
        { timeout: 120_000 },
    );

    const worldsButton = page.locator('button').filter({ hasText: /Mondes|Rejoindre/i }).first();
    if (await worldsButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await worldsButton.click();
    } else {
        await page.locator('h3').first().click();
    }

    await expect(page.getByText('La Table des Braves').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('world-probe-toggle')).toBeVisible();
    await page.getByTestId('world-probe-toggle').click();

    await expect(page.getByTestId('world-probe-panel')).toBeVisible();
    await expect(page.getByTestId('world-probe-version')).toContainText(/Version front :\s*\S+/);
    await expect(page.getByTestId('world-probe-build')).toContainText(/Build :\s*\S+/);
    await expect(page.getByTestId('world-probe-preload')).toContainText('Préchargement terminé : oui');
    await expect(page.getByTestId('world-probe-reference')).toContainText('bar : 10 pseudo(s) · 10 photo(s) · 0 bulle(s)');
    await expect(page.getByTestId('world-probe-reference')).toContainText('piscine : 0 pseudo(s) · 0 photo(s) · 10 bulle(s)');
    await expect(page.getByTestId('world-probe-reference-warning')).toContainText('dodo');
    await expect(page.getByTestId('world-probe-start')).toBeEnabled();

    await page.getByTestId('world-probe-start').click();
    await expect(page.getByTestId('world-probe-status')).toContainText('Terminé', { timeout: 480_000 });
    await expect(page.getByTestId('world-probe-status')).toContainText('30 mesures');

    await expect(page.getByTestId('world-probe-last')).not.toHaveText('—');
    await expect(page.getByTestId('world-probe-median')).not.toHaveText('—');
    await expect(page.getByTestId('world-probe-p95')).not.toHaveText('—');
    await expect(page.getByTestId('world-probe-labels')).toContainText('Libellés par monde');
    await expect(page.getByTestId('world-probe-labels')).toContainText('Bar : 20/20');
    await expect(page.getByTestId('world-probe-labels')).toContainText('Piscine : 10/10');
    await expect(page.getByTestId('world-probe-labels')).toContainText('Dodo : 0/0');
    await expect(page.getByTestId('world-probe-webgl')).toContainText('"maxActive"');
    await expect(page.getByTestId('world-probe-world-bar')).toContainText('20/20');
    await expect(page.getByTestId('world-probe-world-piscine')).toContainText('10/10');
    await expect(page.getByTestId('world-probe-world-dodo')).toContainText('0/0');

    const json = await page.getByTestId('world-probe-json').inputValue();
    const report = JSON.parse(json) as {
        samples: Array<{
            to: string;
            ms: number;
            labels: { names: number; photos: number; excuses: number };
            expected: { names: number; photos: number; excuses: number };
        }>;
        byWorld: Record<string, { count: number }>;
        webgl: { maxActive: number; unexpectedLoss: number };
        version: { commit: string; buildTime: string };
    };
    expect(report.samples).toHaveLength(30);
    expect(report.byWorld.bar.count).toBe(10);
    expect(report.byWorld.piscine.count).toBe(10);
    expect(report.byWorld.dodo.count).toBe(10);
    for (const sample of report.samples) {
        expect(sample.ms).toBeGreaterThan(0);
        expect(sample.labels).toEqual(sample.expected);
    }
    expect(report.version.commit).not.toBe('inconnu');
    expect(report.version.buildTime).not.toBe('inconnu');
    expect(typeof report.webgl.maxActive).toBe('number');
    expect(typeof report.webgl.unexpectedLoss).toBe('number');
    expect(probeErrors).toEqual([]);

    writeFileSync(path.join(screenshotDir, '8h4b1-world-probe.json'), json);
    await page.screenshot({
        path: path.join(screenshotDir, '8h4b1-world-probe.png'),
        fullPage: true,
    });
});

test('le Dodo à 50 pseudos est mesuré sur Fluidite50', async ({ page, request }) => {
    test.setTimeout(600_000);

    const session = await loginAs(page, request, 'FluiditeDemo');
    const squadsResponse = await request.get('/api/squads/', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(squadsResponse.ok()).toBeTruthy();
    const squads = await squadsResponse.json() as Array<{ id: number; name: string; invite_code: string }>;
    const squad50 = squads.find((squad) => squad.invite_code === 'FLUID50');
    expect(squad50).toBeDefined();

    await page.goto(`/squad/${squad50!.id}`);
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(
        () => (window as unknown as { __beercallWorldPreload?: { done?: boolean } })
            .__beercallWorldPreload?.done === true,
        null,
        { timeout: 120_000 },
    );

    const worldsButton = page.locator('button').filter({ hasText: /Mondes/i }).first();
    await expect(worldsButton).toBeVisible({ timeout: 15_000 });
    await worldsButton.click();
    await expect(page.getByText('La Table des Braves').first()).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('world-probe-toggle').click();
    await expect(page.getByTestId('world-probe-reference')).toContainText('dodo : 50 pseudo(s) · 0 photo(s) · 0 bulle(s)');
    await expect(page.getByTestId('world-probe-reference-warning')).toContainText('bar');
    await expect(page.getByTestId('world-probe-reference-warning')).toContainText('piscine');

    await page.getByTestId('world-probe-start').click();
    await expect(page.getByTestId('world-probe-status')).toContainText('Terminé', { timeout: 480_000 });
    await expect(page.getByTestId('world-probe-status')).toContainText('30 mesures');
    await expect(page.getByTestId('world-probe-labels')).toContainText('Dodo : 50/50');
    await expect(page.getByTestId('world-probe-world-dodo')).toContainText('50/50');

    const json = await page.getByTestId('world-probe-json').inputValue();
    const report = JSON.parse(json) as {
        samples: Array<{
            to: string;
            labels: { names: number; photos: number; excuses: number };
            expected: { names: number; photos: number; excuses: number };
        }>;
        byWorld: Record<string, { count: number }>;
        webgl: { maxActive: number; unexpectedLoss: number };
        version: { commit: string; buildTime: string };
    };
    expect(report.samples).toHaveLength(30);
    expect(report.byWorld.dodo.count).toBe(10);
    for (const sample of report.samples) {
        expect(sample.labels).toEqual(sample.expected);
    }
    const dodoSamples = report.samples.filter((sample) => sample.to === 'dodo');
    expect(dodoSamples).toHaveLength(10);
    for (const sample of dodoSamples) {
        expect(sample.labels.names).toBe(50);
        expect(sample.labels.photos).toBe(0);
        expect(sample.labels.excuses).toBe(0);
    }
    expect(report.version.commit).not.toBe('inconnu');
    expect(typeof report.webgl.maxActive).toBe('number');
    expect(typeof report.webgl.unexpectedLoss).toBe('number');

    writeFileSync(path.join(screenshotDir, '8h4b1-world-probe-dodo50.json'), json);
    await page.screenshot({
        path: path.join(screenshotDir, '8h4b1-world-probe-dodo50.png'),
        fullPage: true,
    });
});
