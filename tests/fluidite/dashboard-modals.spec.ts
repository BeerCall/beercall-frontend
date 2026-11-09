import { test, expect } from './base';
import { execFileSync } from 'node:child_process';
import { loginAs } from './contextTracker';

const BACKEND_CONTAINER = process.env.FLUIDITE_BACKEND_CONTAINER || 'beercall-fluidite-night-backend-1';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64');

function runPython(script: string): string {
    return execFileSync('docker', ['exec', '-i', BACKEND_CONTAINER, 'python', '-'], {
        input: script,
        encoding: 'utf8',
    });
}

function deleteSquadByName(name: string): void {
    runPython(`
from db.database import SessionLocal
from models.squad import Squad
db = SessionLocal()
try:
    squad = db.query(Squad).filter(Squad.name == ${JSON.stringify(name)}).first()
    if squad:
        squad.members.clear()
        db.delete(squad)
        db.commit()
        print('DELETED')
finally:
    db.close()
`);
}

test.describe('Dashboard — modales et formulaires', () => {
    test('CreateSquad : création puis nettoyage en base', async ({ page, request }) => {
        const name = `E2ESquad${Date.now()}`;
        try {
            await loginAs(page, request, 'FluiditeDemo');
            await page.goto('/dashboard');
            await expect(page.locator('[data-bottom-nav]')).toBeVisible({timeout: 20_000});

            await page.getByRole('button', {name: 'Créer', exact: true}).first().click();
            await expect(page.getByRole('heading', {name: 'Nouvelle Squad'})).toBeVisible({timeout: 10_000});
            await page.getByPlaceholder('Nom de la Squad...').fill(name);
            await page.getByRole('button', {name: /CRÉER LA SQUAD/}).click();

            await expect(page.getByRole('heading', {name: 'Nouvelle Squad'})).toHaveCount(0, {timeout: 20_000});
            // La roue tronque les noms longs : on vérifie son préfixe affiché.
            await expect(page.getByText(name.slice(0, 7).toUpperCase(), {exact: false})).toBeVisible({timeout: 20_000});
        } finally {
            deleteSquadByName(name);
        }
    });

    test('JoinSquad : code invalide et message d’erreur', async ({ page, request }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await page.goto('/dashboard');
        await expect(page.locator('[data-bottom-nav]')).toBeVisible({timeout: 20_000});

        await page.getByRole('button', {name: 'Rejoindre', exact: true}).first().click();
        await expect(page.getByRole('heading', {name: 'Rejoindre'})).toBeVisible({timeout: 10_000});
        await page.getByPlaceholder('CODE...').fill('ZZZ');
        await page.getByRole('button', {name: /VALIDER LE CODE/}).click();
        await expect(page.getByText(/invalide|introuvable|expiré/i)).toBeVisible({timeout: 15_000});
    });

    test('ScheduleApero : ouverture par appui long sur la carte', async ({ page, request }) => {
        await loginAs(page, request, 'FluiditeDemo');
        const canvas = page.locator('.maplibregl-canvas').first();
        for (let attempt = 0; attempt < 3; attempt += 1) {
            await page.goto('/squad/2');
            try {
                await expect(page.locator('[data-bottom-nav]')).toBeVisible({timeout: 40_000});
                await expect(canvas).toBeVisible({timeout: 40_000});
                break;
            } catch (error) {
                if (attempt === 2) throw error;
                await page.reload();
            }
        }
        await page.waitForTimeout(1_000);
        await page.waitForFunction(() => Boolean((window as {__beercallMap?: unknown}).__beercallMap), {timeout: 30_000});
        const heading = page.getByRole('heading', {name: /Programmer l'Apéro/});
        // Déclenche le même handler que l'appui long MapLibre, sans dépendre
        // de la position d'un marqueur ou d'un drag du navigateur.
        await page.evaluate(() => {
            const map = (window as {__beercallMap?: {fire: (type: string, event: unknown) => void}}).__beercallMap;
            if (!map) throw new Error('Carte MapLibre absente');
            map.fire('mousedown', {
                point: {x: 200, y: 300},
                lngLat: {lng: 2.3522, lat: 48.8566, toArray: () => [2.3522, 48.8566]},
                originalEvent: {target: document.body, touches: undefined},
            });
        });
        await page.waitForTimeout(900);

        await expect(heading).toBeVisible({timeout: 15_000});
        await page.mouse.click(8, 8);
        await expect(heading).toHaveCount(0, {timeout: 10_000});
    });

    test('CreateBeerCall : aperçu de la photo puis fermeture sans création', async ({ page, request }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await page.goto('/squad/2');
        await expect(page.locator('canvas').first()).toBeVisible({timeout: 20_000});

        const input = page.locator('input[aria-label="Photo du Beer Call"]');
        await input.setInputFiles({name: 'e2e.png', mimeType: 'image/png', buffer: PNG});
        await expect(page.getByRole('heading', {name: /Valider l'Apéro/})).toBeVisible({timeout: 15_000});
        await expect(page.locator('img[alt="Preview"]')).toBeVisible();

        const heading = page.getByRole('heading', {name: /Valider l'Apéro/});
        await heading.locator('xpath=following-sibling::button').click();
        await expect(heading).toHaveCount(0, {timeout: 10_000});
    });
});
