import { test, expect } from './base';
import { execFileSync } from 'node:child_process';
import { loginAs } from './contextTracker';

const BACKEND_CONTAINER = process.env.FLUIDITE_BACKEND_CONTAINER || 'beercall-fluidite-night-backend-1';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64');
const stamp = () => Date.now().toString(36);

function runPython(script: string): string {
    return execFileSync('docker', ['exec', '-i', BACKEND_CONTAINER, 'python', '-'], {
        input: script,
        encoding: 'utf8',
    });
}

function createApero(name: string, creatorId: number): number {
    const output = runPython(`
from datetime import datetime, timezone
from db.database import SessionLocal
from models.apero import Apero, AperoStatus
db = SessionLocal()
try:
    now = datetime.now(timezone.utc)
    apero = Apero(squad_id=2, creator_id=${creatorId}, location_name=${JSON.stringify(name)},
                  latitude=48.8566, longitude=2.3522, status=AperoStatus.ACTIVE, started_at=now)
    db.add(apero)
    db.commit()
    print(f'APERO_ID={apero.id}')
finally:
    db.close()
`);
    const match = output.match(/APERO_ID=(\d+)/);
    if (!match) throw new Error(`Création apéro impossible: ${output}`);
    return Number(match[1]);
}

function cleanupByName(name: string): void {
    runPython(`
import os
from db.database import SessionLocal
from models.apero import Apero, AperoParticipant
from models.beer_call_job import BeerCallJob
db = SessionLocal()
try:
    aperos = db.query(Apero).filter(Apero.location_name == ${JSON.stringify(name)}).all()
    ids = [a.id for a in aperos]
    paths = [a.photo_path for a in aperos if a.photo_path]
    if ids:
        for participant in db.query(AperoParticipant).filter(AperoParticipant.apero_id.in_(ids)).all():
            if participant.photo_path:
                paths.append(participant.photo_path)
        db.query(AperoParticipant).filter(AperoParticipant.apero_id.in_(ids)).delete(synchronize_session=False)
        db.query(Apero).filter(Apero.id.in_(ids)).delete(synchronize_session=False)
    for job in db.query(BeerCallJob).filter(BeerCallJob.location_name == ${JSON.stringify(name)}).all():
        db.delete(job)
    db.commit()
    referenced = set(paths)
    for path in referenced:
        try:
            os.remove('/app' + path)
        except FileNotFoundError:
            pass
    import time
    cutoff = time.time() - 900
    for folder in ('/app/uploads/aperos', '/app/uploads/proofs'):
        if not os.path.isdir(folder):
            continue
        for filename in os.listdir(folder):
            full = os.path.join(folder, filename)
            relative = '/uploads/' + ('aperos/' if folder.endswith('aperos') else 'proofs/') + filename
            if relative in referenced:
                continue
            try:
                if os.path.getmtime(full) >= cutoff:
                    os.remove(full)
            except FileNotFoundError:
                pass
    print('CLEANED')
finally:
    db.close()
`);
}

async function openDashboard(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/squad/2');
    await expect(page.locator('[data-bottom-nav]')).toBeVisible({timeout: 30_000});
}

async function waitForFix(page: import('@playwright/test').Page): Promise<void> {
    await expect(page.getByRole('button', {name: 'Me recentrer'})).toBeVisible({timeout: 30_000});
}

test.describe('Apéro — cycle de vie complet', () => {
    test('CreateBeerCall : soumission réelle puis nettoyage', async ({ page, request }) => {
        const name = `E2E create ${stamp()}`;
        try {
            await loginAs(page, request, 'FluiditeDemo');
            await openDashboard(page);
            await waitForFix(page);

            const chooser = page.waitForEvent('filechooser');
            await page.getByRole('button', {name: "Lancer l'apéro"}).click();
            await (await chooser).setFiles({name: 'e2e.png', mimeType: 'image/png', buffer: PNG});

            await expect(page.getByRole('heading', {name: /Valider l'Apéro/})).toBeVisible({timeout: 15_000});
            await page.getByPlaceholder('Ex: Bar Le Central...').fill(name);
            await page.getByRole('button', {name: /LANCER L'APPEL/}).click();
            await expect(page.getByRole('heading', {name: /Valider l'Apéro/})).toHaveCount(0, {timeout: 90_000});
        } finally {
            cleanupByName(name);
        }
    });

    test('ScheduleApero : programmation puis démarrage réel', async ({ page, request }) => {
        const name = `E2E schedule ${stamp()}`;
        try {
            await loginAs(page, request, 'FluiditeDemo');
            await openDashboard(page);
            await page.waitForTimeout(1_000);
            await page.waitForFunction(() => Boolean((window as {__beercallMap?: unknown}).__beercallMap), {timeout: 30_000});
            await page.evaluate(() => {
                const map = (window as {__beercallMap?: {fire: (type: string, event: unknown) => void}}).__beercallMap;
                if (!map) throw new Error('Carte MapLibre absente');
                map.fire('mousedown', {
                    point: {x: 200, y: 300},
                    lngLat: {lng: 2.3522, lat: 48.8566, toArray: () => [2.3522, 48.8566]},
                    originalEvent: {target: document.body, touches: undefined},
                });
            });
            await expect(page.getByRole('heading', {name: /Programmer l'Apéro/})).toBeVisible({timeout: 15_000});
            await page.getByPlaceholder('Ex: Bar Le Central, Parc...').fill(name);
            const future = new Date(Date.now() + 3_600_000);
            const pad = (n: number) => String(n).padStart(2, '0');
            const local = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
            await page.locator('input[type="datetime-local"]').fill(local);
            await page.getByRole('button', {name: /PROGRAMMER/}).click();
            await expect(page.getByRole('heading', {name: /Programmer l'Apéro/})).toHaveCount(0, {timeout: 20_000});

            await openDashboard(page);
            await waitForFix(page);
            const card = page.locator('div')
                .filter({hasText: name})
                .filter({has: page.getByRole('button', {name: /Lancer/})})
                .last();
            await expect(card).toBeVisible({timeout: 20_000});
            const chooser = page.waitForEvent('filechooser');
            await card.getByRole('button', {name: /Lancer/}).click();
            await (await chooser).setFiles({name: 'e2e.png', mimeType: 'image/png', buffer: PNG});
            await expect(page.getByRole('heading', {name: /Démarrer l'Apéro/})).toBeVisible({timeout: 15_000});
            await page.getByRole('button', {name: /LANCER L'APPEL/}).click();
            await expect(page.getByRole('heading', {name: /Démarrer l'Apéro/})).toHaveCount(0, {timeout: 90_000});
        } finally {
            cleanupByName(name);
        }
    });

    test('RespondBeerCall : refus Piscine avec excuse', async ({ page, request }) => {
        const name = `E2E decline ${stamp()}`;
        createApero(name, 4);
        try {
            await loginAs(page, request, 'FluiditeDemo');
            await openDashboard(page);
            const card = page.locator('div')
                .filter({hasText: name})
                .filter({has: page.getByRole('button', {name: /Répondre/})})
                .last();
            await expect(card).toBeVisible({timeout: 20_000});
            await card.getByRole('button', {name: /Répondre/}).click();
            await expect(page.getByRole('heading', {name: 'Appel aux armes !'})).toBeVisible({timeout: 10_000});
            await page.getByRole('button', {name: /Je Passe/}).click();
            await expect(page.getByRole('heading', {name: "L'Esquive"})).toBeVisible({timeout: 10_000});
            await page.getByPlaceholder('J\'ai aqua-poney...').fill('E2E excuse');
            await page.getByRole('button', {name: /ASSUMER MON ABSENCE/}).click();
            await expect(page.getByRole('heading', {name: "L'Esquive"})).toHaveCount(0, {timeout: 20_000});
        } finally {
            cleanupByName(name);
        }
    });

    test('RespondBeerCall : participation Bar avec photo', async ({ page, request }) => {
        const name = `E2E join ${stamp()}`;
        createApero(name, 4);
        try {
            await loginAs(page, request, 'FluiditeDemo');
            await openDashboard(page);
            await waitForFix(page);
            const card = page.locator('div')
                .filter({hasText: name})
                .filter({has: page.getByRole('button', {name: /Répondre/})})
                .last();
            await expect(card).toBeVisible({timeout: 20_000});
            await card.getByRole('button', {name: /Répondre/}).click();
            await expect(page.getByRole('heading', {name: 'Appel aux armes !'})).toBeVisible({timeout: 10_000});
            const chooser = page.waitForEvent('filechooser');
            await page.getByRole('button', {name: /J'y Vais/}).click();
            await (await chooser).setFiles({name: 'e2e.png', mimeType: 'image/png', buffer: PNG});
            await expect(page.getByRole('heading', {name: 'Prouve-le !'})).toBeVisible({timeout: 10_000});
            await page.getByRole('button', {name: /VALIDATION IA/}).click();
            await expect(page.getByRole('heading', {name: 'Prouve-le !'})).toHaveCount(0, {timeout: 30_000});
        } finally {
            cleanupByName(name);
        }
    });
});
