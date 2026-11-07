/**
 * 8h-4b-1 / 8h-4b-2 — Parcours de mesure des mondes (build VITE_WORLD_PROBE=1).
 *
 * Vérifie sur la recette réelle :
 * - la version affichée avant le lancement (hash front + date de build) ;
 * - l'état du préchargement au repos et la référence de l'apéro ;
 * - 10 cycles Bar → Piscine → Dodo, soit 30 transitions mesurées ;
 * - dernier / médiane / p95, libellés et __webglStats ;
 * - un JSON copiable et une exécution sans erreur du probe.
 *
 * 8h-4b-2 : un seul Canvas monde doit vivre pendant les 30 transitions.
 * `created`, `released` et `forcedLoss` restent strictement constants, les
 * mondes vides tombent à une image, et la carte survit à deux parcours
 * FLUID50 enchaînés puis à la fermeture de la modale.
 *
 * La référence de test est éclatée : Fluidite40/bc_21 porte Bar 10 + Piscine 10
 * mais Dodo 0 ; Fluidite50 porte Dodo 50 mais Bar/Piscine 0. Les deux cas sont
 * donc vérifiés séparément, sans modifier les données.
 */

import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loginAs } from './contextTracker';

test.use({ serviceWorkers: 'block' });

const screenshotDir = path.resolve(process.cwd(), '../.openchamber/screenshots');

interface WebglStats {
    created: number;
    released: number;
    forcedLoss: number;
    unexpectedLoss: number;
    active: number;
    maxActive: number;
    failures: string[];
}

async function readWebglStats(page: Page): Promise<WebglStats> {
    const stats = await page.evaluate(
        () => (window as unknown as { __webglStats?: () => WebglStats }).__webglStats?.(),
    );
    expect(stats).toBeDefined();
    return stats as WebglStats;
}

async function waitForWorldCanvas(page: Page): Promise<void> {
    await expect(page.getByTestId('world-viewport')).toBeVisible();
    await page.waitForFunction(
        () => (((window as unknown as { __webglStats?: () => { created: number } })
            .__webglStats?.().created) ?? 0) >= 2,
        null,
        { timeout: 30_000 },
    );
}

function expectNoContextChurn(before: WebglStats, after: WebglStats): void {
    expect(after.created).toBe(before.created);
    expect(after.released).toBe(before.released);
    expect(after.forcedLoss).toBe(before.forcedLoss);
    expect(after.unexpectedLoss).toBe(before.unexpectedLoss);
    expect(after.active).toBeLessThanOrEqual(2);
}

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

    // Le parcours de référence part d'un préchargement et d'une préparation terminés.
    await page.waitForFunction(
        () => (window as unknown as { __beercallWorldPreload?: { done?: boolean } })
            .__beercallWorldPreload?.done === true,
        null,
        { timeout: 120_000 },
    );
    await page.waitForFunction(
        () => (window as unknown as { __beercallPreparation?: { phase?: string } })
            .__beercallPreparation?.phase === 'done',
        null,
        { timeout: 180_000 },
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
    await expect(page.getByTestId('world-preparation')).toContainText('Préparation terminée : oui');

    await page.waitForFunction(
        () => ((window as unknown as { __beercallFirstOpens?: Array<{ status?: string }> })
            .__beercallFirstOpens?.at(-1)?.status) === 'complete',
        null,
        { timeout: 60_000 },
    );
    const firstOpen = await page.evaluate(
        () => (window as unknown as {
            __beercallFirstOpens?: Array<{
                status: string;
                world: string;
                preparationAtTouch: { done: boolean };
                phases: { data: number; canvas: number; avatars: number; frame: number; labels: number; total: number } | null;
            }>;
        }).__beercallFirstOpens?.at(-1),
    );
    expect(firstOpen?.world).toBe('bar');
    expect(firstOpen?.preparationAtTouch.done).toBe(true);
    expect(firstOpen?.phases?.total).toBeGreaterThan(0);
    expect(firstOpen?.phases?.total).toBeLessThan(1_000);

    await waitForWorldCanvas(page);
    const before = await readWebglStats(page);

    await page.getByTestId('world-probe-start').click();
    await expect(page.getByTestId('world-probe-run-count')).toContainText('#1');
    await expect(page.getByTestId('world-probe-status')).toContainText('Terminé', { timeout: 480_000 });
    await expect(page.getByTestId('world-probe-status')).toContainText('30 mesures');

    const after = await readWebglStats(page);
    expectNoContextChurn(before, after);

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
            frames: number;
            labels: { names: number; photos: number; excuses: number };
            expected: { names: number; photos: number; excuses: number };
        }>;
        warmup: Array<{ to: string; ms: number }>;
        byWorld: Record<string, { count: number }>;
        webgl: WebglStats;
        version: { commit: string; buildTime: string };
    };
    expect(report.warmup).toHaveLength(3);
    expect(report.samples).toHaveLength(30);
    expect(report.byWorld.bar.count).toBe(10);
    expect(report.byWorld.piscine.count).toBe(10);
    expect(report.byWorld.dodo.count).toBe(10);
    for (const sample of report.samples) {
        expect(sample.ms).toBeGreaterThanOrEqual(0);
        expect(sample.labels).toEqual(sample.expected);
    }
    const emptyDodo = report.samples.filter((sample) => sample.to === 'dodo');
    console.log('emptyDodo', emptyDodo.map((sample) => ({ ms: sample.ms, frames: sample.frames })));
    expect(emptyDodo).toHaveLength(10);
    for (const sample of emptyDodo) {
        expect(sample.frames).toBeLessThanOrEqual(3);
    }
    expect(report.webgl.created).toBe(after.created);
    expect(report.webgl.released).toBe(after.released);
    expect(report.webgl.forcedLoss).toBe(after.forcedLoss);
    expect(report.version.commit).not.toBe('inconnu');
    expect(report.version.buildTime).not.toBe('inconnu');
    expect(report.webgl.unexpectedLoss).toBe(0);
    expect(probeErrors).toEqual([]);

    writeFileSync(path.join(screenshotDir, '8h4b1-world-probe.json'), json);
    await page.screenshot({
        path: path.join(screenshotDir, '8h4b1-world-probe.png'),
        fullPage: true,
    });
});

test('une première ouverture immédiate est mesurée sans préparation', async ({ page, request }) => {
    test.setTimeout(300_000);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route('**/beer-calls/*/worlds', async (route) => {
        await gate;
        await route.continue();
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

    const worldsButton = page.locator('button').filter({ hasText: /Mondes/i }).first();
    await expect(worldsButton).toBeVisible({ timeout: 15_000 });
    await worldsButton.click();
    await expect(page.getByTestId('world-probe-toggle')).toBeVisible({ timeout: 20_000 });

    // L'utilisateur a touché avant les données : on laisse la requête en attente
    // deux secondes, puis on la libère pour mesurer la phase « données API ».
    await page.waitForTimeout(2_000);
    release();

    await page.waitForFunction(
        () => ((window as unknown as { __beercallFirstOpens?: Array<{ status?: string }> })
            .__beercallFirstOpens?.at(-1)?.status) === 'complete',
        null,
        { timeout: 60_000 },
    );
    const entry = await page.evaluate(
        () => (window as unknown as {
            __beercallFirstOpens?: Array<{
                status: string;
                preparationAtTouch: { done: boolean; phase: string };
                phases: { data: number; total: number } | null;
            }>;
        }).__beercallFirstOpens?.at(-1),
    );
    expect(entry?.preparationAtTouch.done).toBe(false);
    expect(entry?.preparationAtTouch.phase).not.toBe('done');
    expect(entry?.phases?.data).toBeGreaterThan(1_500);
    expect(entry?.phases?.total).toBeGreaterThan(1_500);

    writeFileSync(
        path.join(screenshotDir, '8h4b3-first-open-immediate.json'),
        JSON.stringify(entry, null, 2),
    );

    await page.screenshot({
        path: path.join(screenshotDir, '8h4b3-first-open-immediate.png'),
        fullPage: true,
    });
});

test('deux parcours FLUID50 gardent un seul contexte et la carte', async ({ page, request }) => {
    test.setTimeout(900_000);

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

    await waitForWorldCanvas(page);
    const before = await readWebglStats(page);

    await page.getByTestId('world-probe-start').click();
    await expect(page.getByTestId('world-probe-run-count')).toContainText('#1');
    await expect(page.getByTestId('world-probe-status')).toContainText('Terminé', { timeout: 480_000 });
    await expect(page.getByTestId('world-probe-status')).toContainText('30 mesures');

    await page.getByTestId('world-probe-start').click();
    await expect(page.getByTestId('world-probe-run-count')).toContainText('#2');
    await expect(page.getByTestId('world-probe-status')).toContainText('Terminé', { timeout: 480_000 });
    await expect(page.getByTestId('world-probe-status')).toContainText('30 mesures');
    await expect(page.getByTestId('world-probe-labels')).toContainText('Dodo : 50/50');
    await expect(page.getByTestId('world-probe-world-dodo')).toContainText('50/50');

    const after = await readWebglStats(page);
    expectNoContextChurn(before, after);

    const json = await page.getByTestId('world-probe-json').inputValue();
    const report = JSON.parse(json) as {
        samples: Array<{
            to: string;
            ms: number;
            frames: number;
            labels: { names: number; photos: number; excuses: number };
            expected: { names: number; photos: number; excuses: number };
        }>;
        warmup: Array<{ to: string; ms: number }>;
        byWorld: Record<string, { count: number }>;
        webgl: WebglStats;
        version: { commit: string; buildTime: string };
    };
    expect(report.warmup).toHaveLength(3);
    expect(report.samples).toHaveLength(30);
    expect(report.byWorld.dodo.count).toBe(10);
    for (const sample of report.samples) {
        expect(sample.ms).toBeGreaterThanOrEqual(0);
        expect(sample.labels).toEqual(sample.expected);
    }
    const dodoSamples = report.samples.filter((sample) => sample.to === 'dodo');
    expect(dodoSamples).toHaveLength(10);
    for (const sample of dodoSamples) {
        expect(sample.labels.names).toBe(50);
        expect(sample.labels.photos).toBe(0);
        expect(sample.labels.excuses).toBe(0);
    }
    for (const emptyWorld of ['bar', 'piscine'] as const) {
        const emptySamples = report.samples.filter((sample) => sample.to === emptyWorld);
        console.log(`empty-${emptyWorld}`, emptySamples.map((sample) => ({ ms: sample.ms, frames: sample.frames })));
        expect(emptySamples).toHaveLength(10);
        for (const sample of emptySamples) {
            expect(sample.frames).toBeLessThanOrEqual(3);
        }
    }
    expect(report.version.commit).not.toBe('inconnu');
    expect(report.webgl.unexpectedLoss).toBe(0);

    writeFileSync(path.join(screenshotDir, '8h4b1-world-probe-dodo50.json'), json);
    await page.screenshot({
        path: path.join(screenshotDir, '8h4b1-world-probe-dodo50.png'),
        fullPage: true,
    });

    // Fermeture : le Canvas monde reste monté mais figé, la carte reste vivante.
    await page.getByRole('button', { name: 'Fermer le panneau de parcours' }).click();
    await page.getByRole('button', { name: 'Fermer les mondes' }).click();
    await page.waitForTimeout(1_200);

    const closed = await readWebglStats(page);
    expectNoContextChurn(before, closed);
    expect(closed.unexpectedLoss).toBe(0);
    await expect(page.getByTestId('world-viewport')).toHaveAttribute('data-open', '0');
    await expect(page.getByRole('button', { name: 'Réessayer la carte' })).toHaveCount(0);
    const mapConnected = await page.evaluate(
        () => Boolean((window as unknown as {
            __beercallMap?: { getCanvas?: () => HTMLCanvasElement | null };
        }).__beercallMap?.getCanvas?.()?.isConnected),
    );
    expect(mapConnected).toBe(true);

    await page.screenshot({
        path: path.join(screenshotDir, '8h4b2-map-apres-fermeture.png'),
        fullPage: true,
    });
});
