import { test, expect } from './base';
import { loginAs } from './contextTracker';
import { captureUsers, lastJsonLine, restoreUsers, runPython, type UserSnapshot } from './backendState';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64');
const stamp = () => Date.now().toString(36);
const USER_IDS = [1, 4];

interface DbState {
    aperos: Array<{ id: number; status: string; photo_path: string | null }>;
    participants: Array<{ user_id: number; status: string; excuse: string | null; photo_path: string | null }>;
    jobs: Array<{ id: string; status: string }>;
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

function fetchState(name: string): DbState {
    const output = runPython(`
import json
from db.database import SessionLocal
from models.apero import Apero, AperoParticipant
from models.beer_call_job import BeerCallJob
db = SessionLocal()
try:
    aperos = db.query(Apero).filter(Apero.location_name == ${JSON.stringify(name)}).all()
    ids = [a.id for a in aperos]
    participants = db.query(AperoParticipant).filter(
        AperoParticipant.apero_id.in_(ids)
    ).all() if ids else []
    jobs = db.query(BeerCallJob).filter(
        BeerCallJob.location_name == ${JSON.stringify(name)}
    ).all()
    print(json.dumps({
        'aperos': [
            {'id': a.id, 'status': a.status.name, 'photo_path': a.photo_path}
            for a in aperos
        ],
        'participants': [
            {'user_id': p.user_id, 'status': p.status.name, 'excuse': p.excuse, 'photo_path': p.photo_path}
            for p in participants
        ],
        'jobs': [{'id': str(j.id), 'status': j.status.name} for j in jobs],
    }))
finally:
    db.close()
`);
    return JSON.parse(lastJsonLine(output)) as DbState;
}

/**
 * Supprime uniquement les lignes de l'apéro de test et les fichiers qui leur
 * appartiennent explicitement : chemins photo des apéros/participations et
 * fichiers dérivés des jobs Beer Call associés. Aucun autre fichier du dossier
 * n'est touché, même s'il est apparu pendant le test.
 */
function cleanupTestData(name: string): void {
    runPython(`
import os
from db.database import SessionLocal
from models.apero import Apero, AperoParticipant
from models.beer_call_job import BeerCallJob
db = SessionLocal()
try:
    aperos = db.query(Apero).filter(Apero.location_name == ${JSON.stringify(name)}).all()
    ids = [a.id for a in aperos]
    jobs = db.query(BeerCallJob).filter(
        BeerCallJob.location_name == ${JSON.stringify(name)}
    ).all()
    job_ids = [str(job.id) for job in jobs]

    owned = set()
    for apero in aperos:
        if apero.photo_path:
            owned.add(apero.photo_path.lstrip('/'))
    if ids:
        for participant in db.query(AperoParticipant).filter(AperoParticipant.apero_id.in_(ids)).all():
            if participant.photo_path:
                owned.add(participant.photo_path.lstrip('/'))
        db.query(AperoParticipant).filter(
            AperoParticipant.apero_id.in_(ids)
        ).delete(synchronize_session=False)
        db.query(Apero).filter(Apero.id.in_(ids)).delete(synchronize_session=False)
    for job in jobs:
        db.delete(job)
    for job_id in job_ids:
        owned.update({
            f'uploads/jobs/{job_id}.input',
            f'uploads/jobs/{job_id}.tmp',
            f'uploads/aperos/{job_id}.jpg',
        })
    db.commit()

    remaining = set()
    for apero in db.query(Apero).all():
        if apero.photo_path:
            remaining.add(apero.photo_path.lstrip('/'))
    for participant in db.query(AperoParticipant).all():
        if participant.photo_path:
            remaining.add(participant.photo_path.lstrip('/'))

    for relative in owned - remaining:
        if not relative.startswith('uploads/') or '..' in relative:
            continue
        try:
            os.remove('/app/' + relative)
        except FileNotFoundError:
            pass
    print('CLEANED')
finally:
    db.close()
`);
}

function writeExternalUpload(): string {
    const relative = `uploads/aperos/e2e-external-${stamp()}.jpg`;
    runPython(`open('/app/${relative}', 'wb').write(b'external')`);
    return relative;
}

function uploadExists(relative: string): boolean {
    const output = runPython(`
import os
print('YES' if os.path.exists('/app/${relative}') else 'NO')
`);
    return lastJsonLine(output).trim() === 'YES';
}

function removeUpload(relative: string): void {
    runPython(`
import os
try:
    os.remove('/app/${relative}')
except FileNotFoundError:
    pass
`);
}

async function openDashboard(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/squad/2');
    await expect(page.locator('[data-bottom-nav]')).toBeVisible({timeout: 30_000});
}

async function waitForFix(page: import('@playwright/test').Page): Promise<void> {
    await expect(page.getByRole('button', {name: 'Me recentrer'})).toBeVisible({timeout: 30_000});
}

function beginTest(): UserSnapshot[] {
    return captureUsers(USER_IDS);
}

/**
 * Nettoyage et restauration sont indépendants : si le nettoyage échoue, la
 * restauration des joueurs a quand même lieu, puis l'état final est comparé au
 * snapshot. `preservedFile` prouve qu'un fichier étranger n'a pas été supprimé.
 */
function endTest(name: string, users: UserSnapshot[], preservedFile?: string): void {
    try {
        cleanupTestData(name);
    } finally {
        try {
            restoreUsers(users);
        } finally {
            expect(captureUsers(users.map((user) => user.id))).toEqual(users);
            if (preservedFile) {
                expect(uploadExists(preservedFile), `fichier étranger supprimé: ${preservedFile}`).toBe(true);
            }
        }
    }
}

test.describe('Apéro — cycle de vie complet', () => {
    test('Restauration : conserve les dates de badges historiques et nulles', async () => {
        const initial = beginTest();
        try {
            for (const timestamp of [null, '2001-02-03T04:05:06+00:00']) {
                runPython(`
from datetime import datetime
from db.database import SessionLocal
from models.gamification import user_badges
db = SessionLocal()
try:
    db.execute(user_badges.delete().where(
        user_badges.c.user_id == 1, user_badges.c.badge_id == 'BAPTEME',
    ))
    db.execute(user_badges.insert().values(
        user_id=1, badge_id='BAPTEME',
        unlocked_at=${timestamp ? `datetime.fromisoformat('${timestamp}')` : 'None'},
    ))
    db.commit()
finally:
    db.close()
`);
                const snapshot = beginTest();
                const badge = snapshot.find((user) => user.id === 1)?.badges.find((item) => item.badge_id === 'BAPTEME');
                expect(badge?.unlocked_at).toBe(timestamp);
                // Force une réinsertion pour tester le helper, pas seulement la capture.
                restoreUsers(snapshot);
                expect(beginTest()).toEqual(snapshot);
            }
        } finally {
            try {
                restoreUsers(initial);
            } finally {
                expect(beginTest()).toEqual(initial);
            }
        }
    });

    test('CreateBeerCall : soumission réelle, job et nettoyage', async ({ page, request }) => {
        const name = `E2E create ${stamp()}`;
        const users = beginTest();
        let externalFile: string | undefined;
        try {
            externalFile = writeExternalUpload();
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

            const state = fetchState(name);
            expect(state.aperos).toHaveLength(1);
            expect(state.aperos[0].status).toBe('ACTIVE');
            expect(state.aperos[0].photo_path).toBeTruthy();
            expect(state.jobs.at(-1)?.status).toBe('SUCCEEDED');
        } finally {
            try {
                endTest(name, users, externalFile);
            } finally {
                if (externalFile) removeUpload(externalFile);
            }
        }
    });

    test('ScheduleApero : programmation puis démarrage réel', async ({ page, request }) => {
        const name = `E2E schedule ${stamp()}`;
        const users = beginTest();
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

            const scheduled = fetchState(name);
            expect(scheduled.aperos).toHaveLength(1);
            expect(scheduled.aperos[0].status).toBe('SCHEDULED');

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

            const started = fetchState(name);
            expect(started.aperos).toHaveLength(1);
            expect(started.aperos[0].status).toBe('ACTIVE');
            expect(started.aperos[0].photo_path).toBeTruthy();
        } finally {
            endTest(name, users);
        }
    });

    test('RespondBeerCall : refus Piscine avec excuse', async ({ page, request }) => {
        const name = `E2E decline ${stamp()}`;
        const users = beginTest();
        try {
            createApero(name, 4);
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

            const state = fetchState(name);
            expect(state.participants).toHaveLength(1);
            expect(state.participants[0]).toMatchObject({
                user_id: 1,
                status: 'DECLINED',
                excuse: 'E2E excuse',
            });
        } finally {
            endTest(name, users);
        }
    });

    test('RespondBeerCall : participation Bar avec photo', async ({ page, request }) => {
        const name = `E2E join ${stamp()}`;
        const users = beginTest();
        try {
            createApero(name, 4);
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

            const state = fetchState(name);
            expect(state.participants).toHaveLength(1);
            expect(state.participants[0]).toMatchObject({user_id: 1, status: 'JOINED'});
            expect(state.participants[0].photo_path).toBeTruthy();
        } finally {
            endTest(name, users);
        }
    });
});
