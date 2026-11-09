import { test, expect } from './base';
import { execFileSync } from 'node:child_process';
import { loginAs } from './contextTracker';

const BACKEND_CONTAINER = process.env.FLUIDITE_BACKEND_CONTAINER || 'beercall-fluidite-night-backend-1';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64');
const stamp = () => Date.now().toString(36);

interface UploadSnapshot {
    aperos: string[];
    proofs: string[];
}

interface UserSnapshot {
    id: number;
    capsules: number;
    consecutive_joins: number;
    consecutive_declines: number;
    consecutive_piscine: number;
    ia_fraud_count: number;
    badges: string[];
}

interface DbState {
    aperos: Array<{ id: number; status: string; photo_path: string | null }>;
    participants: Array<{ user_id: number; status: string; excuse: string | null; photo_path: string | null }>;
    jobs: Array<{ id: string; status: string }>;
}

function runPython(script: string): string {
    return execFileSync('docker', ['exec', '-i', BACKEND_CONTAINER, 'python', '-'], {
        input: script,
        encoding: 'utf8',
    });
}

function lastJsonLine(output: string): string {
    const lines = output.trim().split(/\r?\n/).filter(Boolean);
    return lines[lines.length - 1];
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

function snapshotUploads(): UploadSnapshot {
    const output = runPython(`
import json, os
result = {}
for key, folder in (('aperos', '/app/uploads/aperos'), ('proofs', '/app/uploads/proofs')):
    result[key] = sorted(os.listdir(folder)) if os.path.isdir(folder) else []
print(json.dumps(result))
`);
    return JSON.parse(lastJsonLine(output)) as UploadSnapshot;
}

function captureUsers(ids: number[]): UserSnapshot[] {
    const output = runPython(`
import json
from db.database import SessionLocal
from models.user import User
from models.gamification import user_badges
db = SessionLocal()
try:
    result = []
    for user in db.query(User).filter(User.id.in_(${JSON.stringify(ids)})).all():
        badges = [row[1] for row in db.execute(
            user_badges.select().where(user_badges.c.user_id == user.id)
        ).all()]
        result.append({
            'id': user.id,
            'capsules': user.capsules,
            'consecutive_joins': user.consecutive_joins,
            'consecutive_declines': user.consecutive_declines,
            'consecutive_piscine': user.consecutive_piscine,
            'ia_fraud_count': user.ia_fraud_count,
            'badges': sorted(badges),
        })
    print(json.dumps(result))
finally:
    db.close()
`);
    return JSON.parse(lastJsonLine(output)) as UserSnapshot[];
}

function restoreUsers(states: UserSnapshot[]): void {
    if (states.length === 0) return;
    runPython(`
import json
from db.database import SessionLocal
from models.user import User
from models.gamification import user_badges
states = json.loads(${JSON.stringify(JSON.stringify(states))})
db = SessionLocal()
try:
    for state in states:
        user = db.get(User, state['id'])
        if not user:
            continue
        user.capsules = state['capsules']
        user.consecutive_joins = state['consecutive_joins']
        user.consecutive_declines = state['consecutive_declines']
        user.consecutive_piscine = state['consecutive_piscine']
        user.ia_fraud_count = state['ia_fraud_count']
        current = {row[1] for row in db.execute(
            user_badges.select().where(user_badges.c.user_id == user.id)
        ).all()}
        saved = set(state['badges'])
        for extra in current - saved:
            db.execute(user_badges.delete().where(
                user_badges.c.user_id == user.id,
                user_badges.c.badge_id == extra,
            ))
        for missing in saved - current:
            db.execute(user_badges.insert().values(user_id=user.id, badge_id=missing))
    db.commit()
    print('RESTORED')
finally:
    db.close()
`);
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
 * Supprime uniquement les données de l'apéro de test et les fichiers créés
 * pendant le test. Les fichiers absents du snapshot initial ne sont retirés
 * que s'ils ne sont référencés par aucune autre ligne de la base.
 */
function cleanupTestData(name: string, uploads: UploadSnapshot): void {
    runPython(`
import json, os
from db.database import SessionLocal
from models.apero import Apero, AperoParticipant
from models.beer_call_job import BeerCallJob
snapshot = json.loads(${JSON.stringify(JSON.stringify(uploads))})
db = SessionLocal()
try:
    aperos = db.query(Apero).filter(Apero.location_name == ${JSON.stringify(name)}).all()
    ids = [a.id for a in aperos]
    referenced = set()
    for apero in aperos:
        if apero.photo_path:
            referenced.add(apero.photo_path.lstrip('/'))
    if ids:
        for participant in db.query(AperoParticipant).filter(AperoParticipant.apero_id.in_(ids)).all():
            if participant.photo_path:
                referenced.add(participant.photo_path.lstrip('/'))
        db.query(AperoParticipant).filter(
            AperoParticipant.apero_id.in_(ids)
        ).delete(synchronize_session=False)
        db.query(Apero).filter(Apero.id.in_(ids)).delete(synchronize_session=False)
    db.query(BeerCallJob).filter(
        BeerCallJob.location_name == ${JSON.stringify(name)}
    ).delete(synchronize_session=False)
    db.commit()

    remaining = set()
    for apero in db.query(Apero).all():
        if apero.photo_path:
            remaining.add(apero.photo_path.lstrip('/'))
    for participant in db.query(AperoParticipant).all():
        if participant.photo_path:
            remaining.add(participant.photo_path.lstrip('/'))

    for relative in referenced - remaining:
        try:
            os.remove('/app/' + relative)
        except FileNotFoundError:
            pass

    for key, folder in (('aperos', '/app/uploads/aperos'), ('proofs', '/app/uploads/proofs')):
        if not os.path.isdir(folder):
            continue
        known = set(snapshot.get(key, []))
        for filename in os.listdir(folder):
            relative = f'uploads/{key}/{filename}'
            if filename in known or relative in remaining:
                continue
            try:
                os.remove(os.path.join(folder, filename))
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

function beginTest(): {users: UserSnapshot[]; uploads: UploadSnapshot} {
    return {users: captureUsers([1, 4]), uploads: snapshotUploads()};
}

function endTest(name: string, context: {users: UserSnapshot[]; uploads: UploadSnapshot}): void {
    cleanupTestData(name, context.uploads);
    restoreUsers(context.users);
}

test.describe('Apéro — cycle de vie complet', () => {
    test('CreateBeerCall : soumission réelle, job et nettoyage', async ({ page, request }) => {
        const name = `E2E create ${stamp()}`;
        const context = beginTest();
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

            const state = fetchState(name);
            expect(state.aperos).toHaveLength(1);
            expect(state.aperos[0].status).toBe('ACTIVE');
            expect(state.aperos[0].photo_path).toBeTruthy();
            expect(state.jobs.at(-1)?.status).toBe('SUCCEEDED');
        } finally {
            endTest(name, context);
        }
    });

    test('ScheduleApero : programmation puis démarrage réel', async ({ page, request }) => {
        const name = `E2E schedule ${stamp()}`;
        const context = beginTest();
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
            endTest(name, context);
        }
    });

    test('RespondBeerCall : refus Piscine avec excuse', async ({ page, request }) => {
        const name = `E2E decline ${stamp()}`;
        const context = beginTest();
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

            const state = fetchState(name);
            expect(state.participants).toHaveLength(1);
            expect(state.participants[0]).toMatchObject({
                user_id: 1,
                status: 'DECLINED',
                excuse: 'E2E excuse',
            });
        } finally {
            endTest(name, context);
        }
    });

    test('RespondBeerCall : participation Bar avec photo', async ({ page, request }) => {
        const name = `E2E join ${stamp()}`;
        const context = beginTest();
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

            const state = fetchState(name);
            expect(state.participants).toHaveLength(1);
            expect(state.participants[0]).toMatchObject({user_id: 1, status: 'JOINED'});
            expect(state.participants[0].photo_path).toBeTruthy();
        } finally {
            endTest(name, context);
        }
    });
});
