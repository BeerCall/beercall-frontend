import { test, expect, captureCoverage } from './base';
import { execFileSync } from 'node:child_process';
import { loginAs } from './contextTracker';

type Page = import('@playwright/test').Page;

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
const EXPECTED_SENSOR: Record<string, string> = {
    AVATAR_ROULETTE: 'BUTTONS',
    HOT_POTATO: 'TIME_BOMB_BUTTON',
    BRAIN_DUEL: 'DUEL_SPLIT_SCREEN',
    DEATH_FINGER: 'MULTI_TOUCH_TRACKER',
    BARMAN_EQUILIBRISTE: 'GYROSCOPE',
    MAX_PRESSURE: 'ACCELEROMETER',
    PENALTY_SHOOTOUT: 'SWIPE_TO_TARGET',
    PHOTO_CHALLENGE: 'CAMERA_CAPTURE',
    DRUNKEN_DRAWING: 'CANVAS_DRAW',
};

interface GameState {
    game_id?: string;
    required_sensor?: {type?: string};
}

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

/** Exécute une action de jeu et exige que le backend l'accepte. */
async function waitForAction(
    page: Page,
    trigger: () => Promise<void>,
    timeout = 30_000,
): Promise<void> {
    const responsePromise = page.waitForResponse(
        (response) => response.url().includes('/game/action') && response.request().method() === 'POST',
        {timeout},
    );
    await trigger();
    const response = await responsePromise;
    expect(response.ok(), `action de mini-jeu rejetée (${response.status()})`).toBeTruthy();
}

interface TouchPoint {
    x: number;
    y: number;
}

async function dispatchTouches(page: Page, selector: string, kind: string, points: TouchPoint[]): Promise<void> {
    await page.locator(selector).first().evaluate((element, payload) => {
        const event = new Event(payload.kind, {bubbles: true, cancelable: true});
        const touches = payload.points.map((point, index) => ({
            clientX: point.x,
            clientY: point.y,
            pageX: point.x,
            pageY: point.y,
            identifier: index,
            target: element,
        }));
        Object.defineProperties(event, {
            touches: {value: payload.kind === 'touchend' ? [] : touches},
            changedTouches: {value: touches},
        });
        element.dispatchEvent(event);
    }, {kind, points});
}

/** Exerce le capteur réellement rendu et vérifie qu'il envoie une action acceptée. */
async function exerciseSensor(page: Page, sensorType: string): Promise<void> {
    switch (sensorType) {
        case 'BUTTONS': {
            const action = page.locator('footer button').first();
            await expect(action).toBeVisible({timeout: 10_000});
            await waitForAction(page, () => action.click());
            return;
        }
        case 'TIME_BOMB_BUTTON': {
            const bomb = page.getByRole('button', {name: /Tape pour/});
            await expect(bomb).toBeVisible({timeout: 10_000});
            await waitForAction(page, () => bomb.click());
            return;
        }
        case 'DUEL_SPLIT_SCREEN': {
            const half = page.locator('footer div.rotate-180').first();
            await expect(half).toBeVisible({timeout: 10_000});
            await waitForAction(page, () => half.click());
            return;
        }
        case 'CANVAS_DRAW': {
            const canvas = page.locator('footer canvas').first();
            await expect(canvas).toBeVisible({timeout: 10_000});
            const box = await canvas.boundingBox();
            if (!box) throw new Error('Canvas de dessin sans dimensions');
            // Le dessin est soumis automatiquement à la fin du chronomètre (15 s).
            await waitForAction(page, async () => {
                await page.mouse.move(box.x + 20, box.y + 20);
                await page.mouse.down();
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps: 8});
                await page.mouse.up();
                await page.getByRole('button', {name: /Effacer/}).click();
                await page.waitForTimeout(16_000);
            }, 30_000);
            return;
        }
        case 'CAMERA_CAPTURE': {
            await expect(page.locator('footer video').first()).toBeVisible({timeout: 20_000});
            const shutter = page.locator('footer button').last();
            await expect(shutter).toBeVisible({timeout: 10_000});
            await waitForAction(page, () => shutter.click());
            return;
        }
        case 'SWIPE_TO_TARGET': {
            const ball = page.locator('footer div.w-24.h-24').first();
            await expect(ball).toBeVisible({timeout: 10_000});
            await waitForAction(page, async () => {
                await dispatchTouches(page, 'footer div.w-24.h-24', 'touchstart', [{x: 180, y: 600}]);
                await page.waitForTimeout(200);
                await dispatchTouches(page, 'footer div.w-24.h-24', 'touchend', [{x: 180, y: 300}]);
            }, 15_000);
            return;
        }
        case 'MULTI_TOUCH_TRACKER': {
            await expect(page.getByText('Posez vos doigts')).toBeVisible({timeout: 10_000});
            await waitForAction(page, async () => {
                await dispatchTouches(page, 'footer div.fixed.inset-0', 'touchstart', [
                    {x: 120, y: 300},
                    {x: 200, y: 300},
                    {x: 280, y: 300},
                ]);
            }, 20_000);
            return;
        }
        case 'GYROSCOPE': {
            const calibrate = page.getByRole('button', {name: /Calibrer/});
            await expect(calibrate).toBeVisible({timeout: 10_000});
            await calibrate.click();
            await waitForAction(page, async () => {
                await page.evaluate(() => {
                    const event = new Event('deviceorientation');
                    Object.defineProperties(event, {
                        alpha: {value: 0},
                        beta: {value: 60},
                        gamma: {value: 0},
                    });
                    window.dispatchEvent(event);
                });
            }, 15_000);
            return;
        }
        case 'ACCELEROMETER': {
            const start = page.getByRole('button', {name: /Démarrer/});
            await expect(start).toBeVisible({timeout: 10_000});
            await start.click();
            await waitForAction(page, async () => {
                await page.evaluate(() => {
                    const event = new Event('devicemotion');
                    Object.defineProperties(event, {
                        accelerationIncludingGravity: {value: {x: 30, y: 30, z: 30}},
                    });
                    window.dispatchEvent(event);
                });
            }, 20_000);
            return;
        }
        default:
            throw new Error(`Capteur non couvert par le test: ${sensorType}`);
    }
}

async function openActiveWorlds(page: Page): Promise<void> {
    const card = page.locator('div')
        .filter({hasText: 'E2E minigames'})
        .filter({has: page.getByRole('button', {name: /Mondes/})})
        .last();
    await expect(card).toBeVisible({timeout: 30_000});
    await card.getByRole('button', {name: /Mondes/}).click();
    await expect(page.locator('button[data-world-tab="bar"]')).toBeVisible({timeout: 30_000});
}

test('Mini-jeux : les 9 capteurs envoient une action backend acceptée', async ({ page, request }) => {
    test.setTimeout(600_000);
    const aperoId = createTestApero();
    try {
        const session = await loginAs(page, request, 'FluiditeDemo');
        const readState = async (): Promise<GameState> => {
            const response = await request.get(`/api/aperos/${aperoId}/game/state`, {
                headers: {Authorization: `Bearer ${session.accessToken}`},
            });
            expect(response.ok(), `state mini-jeu en échec (${response.status()})`).toBeTruthy();
            return response.json();
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

            // Traverse les écrans d'introduction BUTTONS jusqu'au capteur du jeu.
            if (gameId !== 'AVATAR_ROULETTE') {
                for (let step = 0; step < 4; step += 1) {
                    const state = await readState();
                    if (state.required_sensor?.type !== 'BUTTONS') break;
                    const action = page.locator('footer button').first();
                    await expect(action).toBeVisible({timeout: 10_000});
                    await waitForAction(page, () => action.click());
                    await page.waitForTimeout(500);
                }
            }

            await expect
                .poll(async () => (await readState()).required_sensor?.type, {timeout: 15_000})
                .toBe(EXPECTED_SENSOR[gameId]);

            const sensorType = (await readState()).required_sensor?.type;
            await exerciseSensor(page, sensorType ?? '');
            await captureCoverage(page, gameId);

            await page.getByRole('button', {name: 'Fermer le jeu'}).click();
            await expect(page.getByRole('button', {name: 'Fermer le jeu'})).toHaveCount(0, {timeout: 10_000});
        }
    } finally {
        deleteTestApero(aperoId);
    }
});
