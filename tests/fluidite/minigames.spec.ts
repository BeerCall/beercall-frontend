import { test, expect, captureCoverage } from './base';
import { execFileSync } from 'node:child_process';
import { loginAs } from './contextTracker';

const BACKEND_CONTAINER = process.env.FLUIDITE_BACKEND_CONTAINER || 'beercall-fluidite-night-backend-1';
const GAMES = [
    'AVATAR_ROULETTE',
    'HOT_POTATO',
    'BRAIN_DUEL',
    'DEATH_FINGER',
    'BARMAN_EQUILIBRISTE',
    'MAX_PRESSURE',
    'PENALTY_SHOOTOUT',
    'PHOTO_CHALLENGE',
    'DRUNKEN_DRAWING',
];

function runPython(script: string): string {
    return execFileSync('docker', ['exec', '-i', BACKEND_CONTAINER, 'python', '-'], {
        input: script,
        encoding: 'utf8',
    });
}

function createTestApero(): number {
    const output = runPython(`
from datetime import datetime, timezone
from db.database import SessionLocal
from models.apero import Apero, AperoParticipant, AperoStatus, ParticipationStatus
db = SessionLocal()
try:
    now = datetime.now(timezone.utc)
    apero = Apero(
        squad_id=2,
        creator_id=1,
        location_name='E2E minigames',
        latitude=48.8566,
        longitude=2.3522,
        status=AperoStatus.ACTIVE,
        started_at=now,
    )
    db.add(apero)
    db.flush()
    db.add_all([
        AperoParticipant(apero_id=apero.id, user_id=1, status=ParticipationStatus.JOINED, created_at=now),
        AperoParticipant(apero_id=apero.id, user_id=4, status=ParticipationStatus.JOINED, created_at=now),
    ])
    db.commit()
    print(f'APERO_ID={apero.id}')
finally:
    db.close()
`);
    const match = output.match(/APERO_ID=(\d+)/);
    if (!match) throw new Error(`Création de l'apéro de test impossible: ${output}`);
    return Number(match[1]);
}

function setTestGame(aperoId: number, gameId: string): void {
    runPython(`
from db.database import SessionLocal
from models.apero import Apero
from services.minigames.registry import GAME_REGISTRY
db = SessionLocal()
try:
    apero = db.query(Apero).filter(Apero.id == ${aperoId}).one()
    apero.current_game_state = {'player_ids': [1, 4], 'turn_index': 0}
    apero.current_game_id = '${gameId}'
    GAME_REGISTRY['${gameId}'].setup_game(apero, db)
    db.commit()
    print('GAME_SET')
finally:
    db.close()
`);
}

function deleteTestApero(aperoId: number): void {
    runPython(`
from db.database import SessionLocal
from models.apero import Apero, AperoParticipant
db = SessionLocal()
try:
    db.query(AperoParticipant).filter(AperoParticipant.apero_id == ${aperoId}).delete()
    db.query(Apero).filter(Apero.id == ${aperoId}).delete()
    db.commit()
    print('DELETED')
finally:
    db.close()
`);
}

async function exerciseSensor(page: import('@playwright/test').Page, sensorType: string | undefined): Promise<void> {
    if (!sensorType) return;
    if (sensorType === 'GYROSCOPE') {
        const calibrate = page.getByRole('button', {name: /Calibrer/});
        if (await calibrate.count()) await calibrate.click();
        await page.evaluate(() => {
            for (let i = 0; i < 24; i += 1) {
                const event = new Event('deviceorientation');
                Object.defineProperties(event, {
                    alpha: {value: i},
                    beta: {value: i % 12},
                    gamma: {value: i % 18},
                });
                window.dispatchEvent(event);
            }
        });
        await page.waitForTimeout(500);
        return;
    }
    if (sensorType === 'ACCELEROMETER') {
        const start = page.getByRole('button', {name: /Démarrer/});
        if (await start.count()) await start.click();
        await page.evaluate(() => {
            for (let i = 0; i < 40; i += 1) {
                const event = new Event('devicemotion');
                Object.defineProperties(event, {
                    accelerationIncludingGravity: {value: {x: i % 20, y: (i * 3) % 20, z: 9.8}},
                    acceleration: {value: {x: i % 20, y: (i * 3) % 20, z: 0}},
                });
                window.dispatchEvent(event);
            }
        });
        await page.waitForTimeout(500);
        return;
    }
    if (sensorType === 'CANVAS_DRAW') {
        const canvas = page.locator('footer canvas').first();
        if (await canvas.count()) {
            const box = await canvas.boundingBox();
            if (box) {
                await page.mouse.move(box.x + 20, box.y + 20);
                await page.mouse.down();
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps: 8});
                await page.mouse.up();
            }
        }
        const clear = page.getByRole('button', {name: /Effacer/});
        if (await clear.count()) await clear.click();
        await page.waitForTimeout(400);
        return;
    }
    if (sensorType === 'TIME_BOMB_BUTTON' || sensorType === 'DUEL_SPLIT_SCREEN' || sensorType === 'IMAGE_DISPLAY' || sensorType === 'BUTTONS') {
        const action = page.locator('footer button').first();
        if (await action.count()) await action.evaluate((button) => (button as HTMLButtonElement).click());
        await page.waitForTimeout(500);
        return;
    }
    if (sensorType === 'CAMERA_CAPTURE') {
        const camera = page.getByRole('button', {name: /Caméra|Activer|Démarrer|Prendre/i}).first();
        if (await camera.count()) await camera.click();
        await page.waitForTimeout(700);
        return;
    }
    if (sensorType === 'SWIPE_TO_TARGET' || sensorType === 'MULTI_TOUCH_TRACKER') {
        await page.evaluate((type) => {
            const target = document.querySelector('footer div') ?? document.querySelector('footer') ?? document.body;
            const makeEvent = (kind: string, count: number) => {
                const event = new Event(kind, {bubbles: true});
                const touches = Array.from({length: count}, (_, index) => ({
                    clientX: 80 + index * 40,
                    clientY: 120 + index * 30,
                    pageX: 80 + index * 40,
                    pageY: 120 + index * 30,
                    identifier: index,
                    target,
                }));
                Object.defineProperties(event, {
                    touches: {value: kind === 'touchend' ? [] : touches},
                    changedTouches: {value: touches},
                });
                target.dispatchEvent(event);
            };
            makeEvent('touchstart', type === 'MULTI_TOUCH_TRACKER' ? 3 : 1);
            makeEvent('touchmove', type === 'MULTI_TOUCH_TRACKER' ? 3 : 1);
            makeEvent('touchend', type === 'MULTI_TOUCH_TRACKER' ? 3 : 1);
        }, sensorType);
        await page.waitForTimeout(500);
    }
}

async function openActiveWorlds(page: import('@playwright/test').Page): Promise<void> {
    const card = page.locator('div')
        .filter({hasText: 'E2E minigames'})
        .filter({has: page.getByRole('button', {name: /Mondes/})})
        .last();
    await expect(card).toBeVisible({timeout: 30_000});
    await card.getByRole('button', {name: /Mondes/}).click();
    await expect(page.locator('button[data-world-tab="bar"]')).toBeVisible({timeout: 30_000});
}

test('Mini-jeux : rendu des 9 capteurs et payloads backend', async ({ page, request }) => {
    test.setTimeout(600_000);
    const aperoId = createTestApero();
    try {
        const session = await loginAs(page, request, 'FluiditeDemo');
        const readState = async (): Promise<{required_sensor?: {type?: string}}> => {
            const response = await request.get(`/api/aperos/${aperoId}/game/state`, {
                headers: {Authorization: `Bearer ${session.accessToken}`},
            });
            return response.ok() ? response.json() : {};
        };
        for (const gameId of GAMES) {
            setTestGame(aperoId, gameId);
            await page.goto('/squad/2');
            await expect(page.locator('[data-bottom-nav]')).toBeVisible({timeout: 30_000});
            await openActiveWorlds(page);
            const start = page.getByRole('button', {name: 'Démarrer la partie'});
            await expect(start).toBeEnabled({timeout: 20_000});
            // Le contrôle accessible est `sr-only` (hors viewport) : on déclenche
            // son handler directement.
            await start.evaluate((button) => (button as HTMLButtonElement).click());
            await expect(page.getByRole('button', {name: 'Fermer le jeu'})).toBeVisible({timeout: 20_000});
            await expect(page.locator('header h3').first()).toBeVisible({timeout: 20_000});

            // Traverse les écrans d'introduction BUTTONS jusqu'au capteur réel
            // du mini-jeu (chaque étape est envoyée via l'UI).
            for (let step = 0; step < 4; step += 1) {
                const state = await readState();
                if (state.required_sensor?.type !== 'BUTTONS') break;
                const action = page.locator('footer button').first();
                if (await action.count() === 0) break;
                await action.evaluate((button) => (button as HTMLButtonElement).click());
                await page.waitForTimeout(900);
            }
            // Laisse le capteur du mini-jeu se monter et exécuter son rendu.
            await page.waitForTimeout(800);
            const sensorType = (await readState()).required_sensor?.type;
            await exerciseSensor(page, sensorType);
            await captureCoverage(page, gameId);
            await page.getByRole('button', {name: 'Fermer le jeu'}).click();
            await expect(page.getByRole('button', {name: 'Fermer le jeu'})).toHaveCount(0, {timeout: 10_000});
        }
    } finally {
        deleteTestApero(aperoId);
    }
});
