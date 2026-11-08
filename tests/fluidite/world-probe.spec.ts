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

/**
 * Précharge les GLB dans le cache HTTP du navigateur. Ce banc a un réseau
 * local très irrégulier à froid (certaines pièces mettent >10 s) ; on isole la
 * mesure de première ouverture du téléchargement sans toucher à la préparation
 * applicative (l'API des mondes reste bloquée par le test).
 */
async function warmGlbCache(page: Page): Promise<void> {
    await page.evaluate(async () => {
        const response = await fetch('/models/glb/manifest.json');
        if (!response.ok) throw new Error(`Manifeste GLB indisponible (${response.status})`);
        const manifest = await response.json() as { items?: Array<{ url?: string }> };
        const urls = (manifest.items ?? [])
            .map((item) => item.url)
            .filter((url): url is string => Boolean(url));
        if (urls.length === 0) throw new Error('Manifeste GLB sans fichier');
        await Promise.all(urls.map(async (url) => {
            const file = await fetch(url);
            if (!file.ok) throw new Error(`GLB indisponible (${file.status}) : ${url}`);
            await file.arrayBuffer();
        }));
    });
}

async function openWorlds(page: Page): Promise<void> {
    const worldsButton = page.locator('button').filter({ hasText: /Mondes/i }).first();
    await expect(worldsButton).toBeVisible({ timeout: 15_000 });
    await worldsButton.click();
    await expect(page.locator('button[data-world-tab="bar"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('world-probe-toggle')).toBeVisible({ timeout: 20_000 });
}

/** Rouvre les mondes depuis le dashboard restauré après un retour de profil. */
async function reopenWorlds(page: Page): Promise<void> {
    const worldsButton = page.locator('button').filter({ hasText: /Mondes/i }).first();
    await expect(worldsButton).toBeVisible({ timeout: 20_000 });
    await worldsButton.click();
    await expect(page.locator('button[data-world-tab="bar"]')).toBeVisible({ timeout: 20_000 });
}

interface ScreenPoint {
    x: number;
    y: number;
}

/** Cible publiée par le build probe : position NDC du centre d'un avatar. */
interface WorldHitTarget {
    world: string;
    userId: string;
    username: string | null;
    ndcX: number;
    ndcY: number;
}

async function readHitTargets(page: Page): Promise<WorldHitTarget[]> {
    return page.evaluate(
        () => (window as unknown as {
            __beercallWorldHitTargets?: () => WorldHitTarget[];
        }).__beercallWorldHitTargets?.() ?? [],
    );
}

/** Attend la publication des cibles de la couche active (deux RAF après montage). */
async function waitForHitTargets(page: Page, world: string): Promise<WorldHitTarget[]> {
    const inside = (targets: WorldHitTarget[]) => targets.filter(
        (target) => target.world === world
            && Math.abs(target.ndcX) < 0.92
            && Math.abs(target.ndcY) < 0.92,
    );
    await expect.poll(
        async () => inside(await readHitTargets(page)).length,
        { timeout: 180_000 },
    ).toBeGreaterThan(0);
    return inside(await readHitTargets(page));
}

/** Traduit les coordonnées NDC d'une cible en point écran sur le canvas. */
async function pointForTarget(page: Page, target: WorldHitTarget): Promise<ScreenPoint> {
    const box = await worldCanvasBox(page);
    return {
        x: box.x + ((target.ndcX + 1) / 2) * box.width,
        y: box.y + (1 - (target.ndcY + 1) / 2) * box.height,
    };
}

async function worldCanvasBox(page: Page) {
    const canvas = page.getByTestId('world-viewport').locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas monde introuvable');
    return box;
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
    test.setTimeout(420_000);

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
    await warmGlbCache(page);
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
        { timeout: 180_000 },
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

test('une première ouverture à froid enregistre le temps sans borne stricte', async ({ page, request }) => {
    test.setTimeout(600_000);

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

    // Aucun préchauffage du cache HTTP : c'est le froid réel qui est mesuré.
    const worldsButton = page.locator('button').filter({ hasText: /Mondes/i }).first();
    await expect(worldsButton).toBeVisible({ timeout: 15_000 });
    await worldsButton.click();
    await expect(page.getByTestId('world-probe-toggle')).toBeVisible({ timeout: 20_000 });

    await page.waitForTimeout(2_000);
    release();

    // Seule une absence totale de résultat fait échouer : pas de borne sur le
    // temps mesuré, et l'application échoue elle-même après 30 s sans progrès.
    await page.waitForFunction(
        () => {
            const last = (window as unknown as {
                __beercallFirstOpens?: Array<{ status?: string }>;
            }).__beercallFirstOpens?.at(-1);
            return last?.status === 'complete' || last?.status === 'error';
        },
        null,
        { timeout: 240_000 },
    );
    const entry = await page.evaluate(
        () => (window as unknown as {
            __beercallFirstOpens?: Array<{
                status: string;
                error: string | null;
                world: string;
                preparationAtTouch: { done: boolean; phase: string };
                phases: { data: number; total: number } | null;
            }>;
        }).__beercallFirstOpens?.at(-1),
    );
    expect(entry).toBeDefined();
    if (entry?.status === 'error') {
        throw new Error(`Première ouverture à froid échouée : ${entry.error}`);
    }
    expect(entry?.status).toBe('complete');
    expect(entry?.phases?.total).toBeGreaterThan(0);

    writeFileSync(
        path.join(screenshotDir, '8h8i-first-open-cold.json'),
        JSON.stringify(entry, null, 2),
    );

    await page.screenshot({
        path: path.join(screenshotDir, '8h8i-first-open-cold.png'),
        fullPage: true,
    });
});

test('le badge garde le total de la squad courante au changement de squad', async ({ page, request }) => {
    test.setTimeout(600_000);

    const session = await loginAs(page, request, 'FluiditeDemo');
    const squadsResponse = await request.get('/api/squads/', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(squadsResponse.ok()).toBeTruthy();
    const squads = await squadsResponse.json() as Array<{ id: number; name: string; invite_code: string }>;
    const squad50 = squads.find((squad) => squad.invite_code === 'FLUID50');
    const squad40 = squads.find((squad) => squad.invite_code === 'FLUID40');
    expect(squad50).toBeDefined();
    expect(squad40).toBeDefined();

    const detailsResponse = await request.get(`/api/squads/${squad40!.id}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(detailsResponse.ok()).toBeTruthy();
    const details = await detailsResponse.json() as {
        active_beer_call?: Array<{ id: string }>;
        past_beer_calls?: Array<{ id: string }>;
    };
    const target40 = details.active_beer_call?.[0]?.id ?? details.past_beer_calls?.[0]?.id;
    expect(target40).toBeTruthy();

    await page.goto(`/squad/${squad50!.id}`);
    const badge = page.getByTestId('world-preparation-badge');
    await expect(badge).toBeVisible({ timeout: 30_000 });

    // Squad A (FLUID50) préparée : Dodo 50, Bar/Piscine 0 → total 50.
    await page.waitForFunction(
        () => (window as unknown as { __beercallPreparation?: { phase?: string } })
            .__beercallPreparation?.phase === 'done',
        null,
        { timeout: 240_000 },
    );
    await expect(badge).toHaveAttribute('data-total-avatars', '50');
    await expect(badge).toContainText('Préparation terminée : oui');

    // Le prochain apéro (FLUID40) est retenu pour observer le badge pendant
    // que la nouvelle squad charge encore.
    let release40!: () => void;
    const gate40 = new Promise<void>((resolve) => {
        release40 = resolve;
    });
    await page.route(`**/beer-calls/${target40}/worlds`, async (route) => {
        await gate40;
        await route.continue();
    });

    await page.locator(`button[data-squad-id="${squad40!.id}"]`).click();
    await expect(badge).toHaveAttribute('data-beer-call-id', target40!, { timeout: 30_000 });

    // Pendant le chargement de B, le total ne doit jamais être celui de A.
    expect(await badge.getAttribute('data-data-ready')).toBe('false');
    expect(await badge.getAttribute('data-total-avatars')).toBe('0');

    release40();

    // Squad B (FLUID40) : Bar 10 + Piscine 10 + Dodo 0 → total 20.
    await expect(badge).toHaveAttribute('data-data-ready', 'true', { timeout: 60_000 });
    await expect(badge).toHaveAttribute('data-total-avatars', '20', { timeout: 60_000 });
    await page.waitForFunction(
        (target) => {
            const preparation = (window as unknown as {
                __beercallPreparation?: { targetBeerCallId?: string; phase?: string };
            }).__beercallPreparation;
            return preparation?.targetBeerCallId === target && preparation?.phase === 'done';
        },
        target40,
        { timeout: 240_000 },
    );
    await expect(badge).toHaveAttribute('data-total-avatars', '20');
    await expect(badge).toContainText('Préparation terminée : oui');

    writeFileSync(
        path.join(screenshotDir, '8h4b3b-badge-squads.json'),
        JSON.stringify({
            squad50: {id: squad50!.id, invite_code: squad50!.invite_code},
            squad40: {id: squad40!.id, invite_code: squad40!.invite_code},
            target40,
            finalTotal: await badge.getAttribute('data-total-avatars'),
            finalPhase: await badge.getAttribute('data-preparation-phase'),
        }, null, 2),
    );
    await page.screenshot({
        path: path.join(screenshotDir, '8h4b3b-badge-squad40.png'),
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

/** Vérifie que la fiche ouverte correspond à un avatar de la couche active. */
async function expectProfileOfActiveAvatar(
    page: Page,
    targets: WorldHitTarget[],
): Promise<WorldHitTarget> {
    await expect.poll(() => page.url(), { timeout: 20_000 }).toMatch(/\/profile\//);
    const openedId = decodeURIComponent(new URL(page.url()).pathname.replace(/^\/profile\//, ''));
    const match = targets.find((target) => target.userId === openedId);
    expect(match, `profil ${openedId} absent des cibles de la couche active`).toBeDefined();
    if (match?.username) {
        await expect(page.locator('h1').first())
            .toContainText(match.username, { ignoreCase: true, timeout: 20_000 });
    }
    return match!;
}

test('un avatar ouvre son profil au Bar et à la Piscine, une preuve ouvre la photo', async ({ page, request }) => {
    test.setTimeout(900_000);

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
    await openWorlds(page);

    // Pseudos et bulles ne doivent jamais intercepter un toucher.
    await expect(page.locator('[data-world-name]').first()).toBeVisible({ timeout: 180_000 });
    const labelPointerEvents = await page.locator('[data-world-name]').first()
        .evaluate((element) => getComputedStyle(element).pointerEvents);
    expect(labelPointerEvents).toBe('none');

    // Un simple déplacement ne doit tester aucun objet : la zone n'écoute que
    // l'appui et le clic, jamais le survol.
    const canvasBox = await worldCanvasBox(page);
    const raycastsBefore = await page.evaluate(
        () => (window as unknown as { __beercallWorldRaycasts?: number }).__beercallWorldRaycasts ?? -1,
    );
    expect(raycastsBefore).toBeGreaterThanOrEqual(0);
    for (let step = 0; step < 8; step += 1) {
        await page.mouse.move(canvasBox.x + 12 + step * 3, canvasBox.y + 40 + step * 7);
    }
    const raycastsAfter = await page.evaluate(
        () => (window as unknown as { __beercallWorldRaycasts?: number }).__beercallWorldRaycasts ?? -1,
    );
    expect(raycastsAfter).toBe(raycastsBefore);

    // Bar : toucher le centre d'une cible connue ouvre une fiche du Bar.
    const barTargets = await waitForHitTargets(page, 'bar');
    const barPoint = await pointForTarget(page, barTargets[0]);
    await page.mouse.click(barPoint.x, barPoint.y);
    const barTarget = await expectProfileOfActiveAvatar(page, barTargets);
    const barProfileUrl = page.url();

    await page.goBack();
    await expect(page.getByTestId('world-viewport')).toHaveAttribute('data-open', '0', { timeout: 20_000 });

    // Piscine : la bulle d'excuse ne bloque pas le toucher non plus.
    await reopenWorlds(page);
    await page.locator('button[data-world-tab="piscine"]').click();
    await expect(page.locator('[data-world-excuse]').first()).toBeVisible({ timeout: 180_000 });
    const bubblePointerEvents = await page.locator('[data-world-excuse]').first()
        .evaluate((element) => getComputedStyle(element).pointerEvents);
    expect(bubblePointerEvents).toBe('none');
    const piscineTargets = await waitForHitTargets(page, 'piscine');
    const piscinePoint = await pointForTarget(page, piscineTargets[0]);
    await page.mouse.click(piscinePoint.x, piscinePoint.y);
    const piscineTarget = await expectProfileOfActiveAvatar(page, piscineTargets);
    const piscineProfileUrl = page.url();

    await page.goBack();
    await expect(page.getByTestId('world-viewport')).toHaveAttribute('data-open', '0', { timeout: 20_000 });

    // Bar : la preuve photo reste prioritaire et ouvre la photo, pas un profil.
    await reopenWorlds(page);
    await page.locator('button[data-world-tab="bar"]').click();
    const photo = page.locator('[data-world-photo]').first();
    await expect(photo).toBeVisible({ timeout: 180_000 });
    const photoPointerEvents = await photo.evaluate((element) => getComputedStyle(element).pointerEvents);
    expect(photoPointerEvents).toBe('auto');
    // Deux preuves peuvent se chevaucher : on touche un point où une preuve est
    // réellement au premier plan, comme le ferait un doigt.
    const photoPoint = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('[data-world-photo]'));
        for (const node of nodes) {
            const rect = node.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const hit = document.elementFromPoint(x, y);
            if (hit?.closest('[data-world-photo]')) return { x, y };
        }
        return null;
    });
    expect(photoPoint).not.toBeNull();
    await page.mouse.click(photoPoint!.x, photoPoint!.y);
    const fullPhoto = page.locator('img[alt="Aperçu de la photo"]');
    await expect(fullPhoto).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`/squad/${squad40!.id}`));
    await page.mouse.click(8, 300);
    await expect(fullPhoto).toHaveCount(0, { timeout: 10_000 });

    // Glissement de caméra : au-delà du seuil, aucun profil ne s'ouvre.
    const dragTargets = await waitForHitTargets(page, 'bar');
    const dragPoint = await pointForTarget(page, dragTargets[0]);
    await page.mouse.move(dragPoint.x, dragPoint.y);
    await page.mouse.down();
    await page.mouse.move(dragPoint.x + 48, dragPoint.y + 12, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(1_000);
    await expect(page).toHaveURL(new RegExp(`/squad/${squad40!.id}`));
    await expect(page.getByTestId('world-viewport')).toHaveAttribute('data-open', '1');

    writeFileSync(
        path.join(screenshotDir, '8h8i-avatar-touch.json'),
        JSON.stringify({
            bar: {
                username: barTarget.username,
                userId: barTarget.userId,
                profileUrl: barProfileUrl,
            },
            piscine: {
                username: piscineTarget.username,
                userId: piscineTarget.userId,
                profileUrl: piscineProfileUrl,
            },
            photoOpened: true,
            pointerEvents: {
                label: labelPointerEvents,
                bubble: bubblePointerEvents,
                photo: photoPointerEvents,
            },
            dragThresholdPx: 8,
            dragDistancePx: 48,
            dragOpenedProfile: false,
            raycastsBeforeMove: raycastsBefore,
            raycastsAfterMove: raycastsAfter,
        }, null, 2),
    );
    await page.screenshot({
        path: path.join(screenshotDir, '8h8i-avatar-touch.png'),
        fullPage: true,
    });
});

test('un avatar d’une couche cachée ne réagit pas et le Dodo ouvre son profil', async ({ page, request }) => {
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
    await openWorlds(page);

    // Dodo : 50 avatars. On retient une cible et son point écran.
    await page.locator('button[data-world-tab="dodo"]').click();
    const dodoTargets = await waitForHitTargets(page, 'dodo');
    const dodoTarget = dodoTargets[0];
    const hiddenPoint = await pointForTarget(page, dodoTarget);

    // Bar : couche active vide dans FLUID50. La couche Dodo cachée ne monte
    // plus aucune zone de toucher : le registre ne contient aucune cible.
    await page.locator('button[data-world-tab="bar"]').click();
    await expect.poll(
        async () => (await readHitTargets(page)).filter((target) => target.world === 'dodo').length,
        { timeout: 20_000 },
    ).toBe(0);
    await expect.poll(
        async () => (await readHitTargets(page)).filter((target) => target.world !== 'bar').length,
        { timeout: 20_000 },
    ).toBe(0);
    await expect(page.locator('[data-world-name]')).toHaveCount(0, { timeout: 20_000 });
    const targetsAfterSwitch = await readHitTargets(page);

    const urlBeforeHiddenClick = page.url();
    await page.mouse.click(hiddenPoint.x, hiddenPoint.y);
    await page.waitForTimeout(1_000);
    const urlAfterHiddenClick = page.url();
    await expect(page).toHaveURL(new RegExp(`/squad/${squad50!.id}`));
    await expect(page.getByTestId('world-viewport')).toHaveAttribute('data-open', '1');

    // Retour au Dodo : une cible réelle ouvre sa fiche.
    await page.locator('button[data-world-tab="dodo"]').click();
    const dodoTargetsAgain = await waitForHitTargets(page, 'dodo');
    const dodoPointAgain = await pointForTarget(page, dodoTargetsAgain[0]);
    await page.mouse.click(dodoPointAgain.x, dodoPointAgain.y);
    const openedDodo = await expectProfileOfActiveAvatar(page, dodoTargetsAgain);

    writeFileSync(
        path.join(screenshotDir, '8h8i-hidden-layer.json'),
        JSON.stringify({
            hiddenWorld: 'dodo',
            hiddenAvatars: 50,
            activeWorld: 'bar',
            hiddenTargetsRegistered: targetsAfterSwitch.length,
            hiddenAvatarPoint: hiddenPoint,
            hiddenClickOpenedProfile: urlBeforeHiddenClick !== urlAfterHiddenClick,
            dodo: {
                username: openedDodo.username,
                userId: openedDodo.userId,
                profileUrl: page.url(),
            },
        }, null, 2),
    );
    await page.screenshot({
        path: path.join(screenshotDir, '8h8i-hidden-layer.png'),
        fullPage: true,
    });
});
