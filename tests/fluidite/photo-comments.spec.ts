import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {test, expect} from './base';
import {execFileSync} from 'node:child_process';
import {loginAs} from './contextTracker';

const BACKEND_CONTAINER = process.env.FLUIDITE_BACKEND_CONTAINER || 'beercall-fluidite-night-backend-1';
const runDir = process.env.FLUIDITE_RUN_DIR || path.resolve('..', '.opencode', 'plan', 'beercall', 'runs', 'C03');
const screenshotDir = path.join(runDir, 'screenshots');

function runPython(script: string): string {
    return execFileSync('docker', ['exec', '-i', BACKEND_CONTAINER, 'python', '-'], {
        input: script,
        encoding: 'utf8',
    });
}

function createTestApero(name: string): {aperoId: number; photoPath: string} {
    const photoPath = `uploads/aperos/e2e-comments-${Date.now().toString(36)}.png`;
    const output = runPython(`
from datetime import datetime, timezone, timedelta
from pathlib import Path
from PIL import Image, ImageDraw
from db.database import SessionLocal
from models.apero import Apero, AperoParticipant, AperoStatus, ParticipationStatus
db = SessionLocal()
try:
    now = datetime.now(timezone.utc)
    apero = Apero(
        squad_id=2, creator_id=1, location_name=${JSON.stringify(name)},
        latitude=48.8566, longitude=2.3522, status=AperoStatus.ACTIVE,
        started_at=now, ended_at=now + timedelta(hours=4),
    )
    db.add(apero)
    db.flush()
    db.add_all([
        AperoParticipant(apero_id=apero.id, user_id=1, status=ParticipationStatus.JOINED, created_at=now),
        AperoParticipant(apero_id=apero.id, user_id=4, status=ParticipationStatus.JOINED,
                         photo_path=${JSON.stringify(photoPath)}, created_at=now),
    ])
    image = Image.new('RGB', (240, 320), (180, 120, 40))
    draw = ImageDraw.Draw(image)
    draw.rectangle((24, 24, 216, 296), outline=(255, 255, 255), width=6)
    draw.text((56, 150), 'PREUVE E2E', fill=(255, 255, 255))
    image.save('/app/${photoPath}', 'PNG')
    db.commit()
    print(f'APERO_ID={apero.id}')
except Exception:
    db.rollback()
    Path('/app/${photoPath}').unlink(missing_ok=True)
    raise
finally:
    db.close()
`);
    const match = output.match(/APERO_ID=(\d+)/);
    if (!match) throw new Error(`Création apéro impossible: ${output}`);
    return {aperoId: Number(match[1]), photoPath};
}

function deleteTestApero(name: string, photoPath: string): void {
    runPython(`
import os
from db.database import SessionLocal
from models.apero import Apero, AperoParticipant
from models.photo_comment import ProofPhotoComment
from models.realtime_event import RealtimeEvent
db = SessionLocal()
try:
    aperos = db.query(Apero).filter(Apero.location_name == ${JSON.stringify(name)}).all()
    ids = [apero.id for apero in aperos]
    if ids:
        for event in db.query(RealtimeEvent).filter(RealtimeEvent.squad_id == 2).all():
            if event.payload.get('type') == 'PHOTO_COMMENT' and event.payload.get('beer_call_id') in ids:
                db.delete(event)
        db.query(ProofPhotoComment).filter(ProofPhotoComment.apero_id.in_(ids)).delete(synchronize_session=False)
        db.query(AperoParticipant).filter(AperoParticipant.apero_id.in_(ids)).delete(synchronize_session=False)
        db.query(Apero).filter(Apero.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    try:
        os.remove('/app/${photoPath}')
    except FileNotFoundError:
        pass
    print('DELETED')
finally:
    db.close()
`);
}

test('10b — commentaire sous une preuve photo : ajout, affichage et suppression', async ({page, request}) => {
    test.setTimeout(300_000);
    const name = `E2E comments ${Date.now().toString(36)}`;
    mkdirSync(screenshotDir, {recursive: true});
    const {aperoId, photoPath} = createTestApero(name);
    try {
        const session = await loginAs(page, request, 'FluiditeDemo');
        await page.setViewportSize({width: 390, height: 844});
        await page.goto('/squad/2');
        await expect(page.locator('[data-bottom-nav]')).toBeVisible({timeout: 30_000});

        const card = page.locator('div')
            .filter({hasText: name})
            .filter({has: page.getByRole('button', {name: /Mondes/})})
            .last();
        await expect(card).toBeVisible({timeout: 30_000});
        await card.getByRole('button', {name: /Mondes/}).click();
        await expect(page.locator('button[data-world-tab="bar"]')).toBeVisible({timeout: 30_000});

        const photo = page.locator('[data-world-photo]').first();
        await expect(photo).toBeVisible({timeout: 180_000});
        // Le libellé 3D est rendu hors viewport sur ce format : on déclenche son handler.
        await photo.evaluate((button) => (button as HTMLButtonElement).click());

        await expect(page.getByAltText('Aperçu de la photo')).toBeVisible({timeout: 15_000});
        const comments = page.getByTestId('photo-comments');
        await expect(comments).toBeVisible({timeout: 15_000});

        await comments.getByPlaceholder('Ajouter un commentaire…').fill('Petit joueur !');
        const created = page.waitForResponse(
            (response) => response.url().includes(`/beer-calls/bc_${aperoId}/photos/`) && response.request().method() === 'POST',
        );
        await comments.getByRole('button', {name: 'Envoyer le commentaire'}).click();
        expect((await created).ok()).toBeTruthy();

        await expect(comments.getByText('Petit joueur !')).toBeVisible({timeout: 15_000});
        await expect(comments.getByText('FluiditeDemo')).toBeVisible({timeout: 15_000});
        await page.screenshot({path: path.join(screenshotDir, '10b-photo-comments.png')});

        const listed = await request.get(
            `/api/squads/2/beer-calls/bc_${aperoId}/photos/u_4/comments`,
            {headers: {Authorization: `Bearer ${session.accessToken}`}},
        );
        expect(listed.status()).toBe(200);
        expect((await listed.json() as Array<{content: string}>).map((item) => item.content)).toContain('Petit joueur !');

        // Requête distante : pas de mutation React Query locale ni reload.
        // Seul l'événement WebSocket doit rafraîchir le panneau déjà ouvert.
        const remote = await request.post(`/api/squads/2/beer-calls/bc_${aperoId}/photos/u_4/comments`, {
            headers: {Authorization: `Bearer ${session.accessToken}`}, data: {content: 'Ajout distant en direct'},
        });
        expect(remote.status()).toBe(201);
        const remoteId = (await remote.json() as {id: number}).id;
        await expect(comments.getByText('Ajout distant en direct')).toBeVisible({timeout: 15_000});
        expect((await request.delete(`/api/squads/2/beer-calls/bc_${aperoId}/comments/${remoteId}`, {
            headers: {Authorization: `Bearer ${session.accessToken}`},
        })).status()).toBe(204);
        await expect(comments.getByText('Ajout distant en direct')).toHaveCount(0, {timeout: 15_000});

        const deleted = page.waitForResponse(
            (response) => response.url().includes('/comments/') && response.request().method() === 'DELETE',
        );
        await comments.getByRole('button', {name: 'Supprimer le commentaire'}).click();
        expect((await deleted).ok()).toBeTruthy();
        await expect(comments.getByText('Petit joueur !')).toHaveCount(0, {timeout: 15_000});

        const empty = await request.get(
            `/api/squads/2/beer-calls/bc_${aperoId}/photos/u_4/comments`,
            {headers: {Authorization: `Bearer ${session.accessToken}`}},
        );
        expect(empty.status()).toBe(200);
        expect(await empty.json()).toEqual([]);
    } finally {
        deleteTestApero(name, photoPath);
    }
});
