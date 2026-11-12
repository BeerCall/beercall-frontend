import { test, expect, captureCoverage } from './base';
import { loginAs } from './contextTracker';
import { captureUsers, lastJsonLine, runPython } from './backendState';

type Page = import('@playwright/test').Page;

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
const USER_IDS = [1, 4];

interface GameState {
    game_id?: string;
    required_sensor?: {type?: string};
    actions?: Array<{action_id?: string}>;
}

interface PersistedGame {
    game_id: string | null;
    state: Record<string, unknown>;
}

function createTestApero(name: string): number {
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
        location_name=${JSON.stringify(name)},
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

function deleteTestApero(name: string): void {
    runPython(`
from db.database import SessionLocal
from models.apero import Apero, AperoParticipant
db = SessionLocal()
try:
    aperos = db.query(Apero).filter(Apero.location_name == ${JSON.stringify(name)}).all()
    ids = [a.id for a in aperos]
    if ids:
        db.query(AperoParticipant).filter(
            AperoParticipant.apero_id.in_(ids)
        ).delete(synchronize_session=False)
        db.query(Apero).filter(Apero.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    print(f'DELETED {len(ids)}')
finally:
    db.close()
`);
}

function fetchPersistedGame(aperoId: number): PersistedGame {
    const output = runPython(`
import json
from db.database import SessionLocal
from models.apero import Apero
db = SessionLocal()
try:
    apero = db.query(Apero).filter(Apero.id == ${aperoId}).one()
    state = dict(apero.current_game_state or {})
    for key in ('photo_base64', 'drawing_base64'):
        if key in state:
            state[key] = bool(state[key])
    print(json.dumps({'game_id': apero.current_game_id, 'state': state}))
finally:
    db.close()
`);
    return JSON.parse(lastJsonLine(output)) as PersistedGame;
}

/**
 * Attend la réponse de l'action du bon apéro et vérifie l'action envoyée.
 * Un capteur absent, une action inattendue ou une réponse non-2xx fait échouer
 * le test.
 */
async function waitForAction(
    page: Page,
    aperoId: number,
    expected: string | string[],
    trigger: () => Promise<void>,
    timeout = 30_000,
): Promise<string> {
    const allowed = Array.isArray(expected) ? expected : [expected];
    const actionUrl = new RegExp(`/api/aperos/${aperoId}/game/action$`);
    const responsePromise = page.waitForResponse(
        (response) => actionUrl.test(response.url()) && response.request().method() === 'POST',
        {timeout},
    );
    await trigger();
    const response = await responsePromise;
    expect(response.ok(), `action de mini-jeu rejetée (${response.status()})`).toBeTruthy();
    const payload = response.request().postDataJSON() as {action_id?: string};
    const actionId = payload.action_id ?? '';
    expect(allowed, `action inattendue pour l'apéro ${aperoId}: ${actionId}`).toContain(actionId);
    return actionId;
}

interface TouchPoint {
    x: number;
    y: number;
}

/**
 * Simule un geste tactile matériel (le navigateur de test n'a pas d'écran
 * tactile). Les événements natifs sont dispatchés sur l'élément qui porte les
 * handlers React du capteur, avec des coordonnées distinctes début/fin.
 */
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

function expectedAction(gameId: string, state: GameState): string | string[] {
    switch (gameId) {
        case 'AVATAR_ROULETTE': {
            const actionId = state.actions?.[0]?.action_id;
            expect(actionId, 'aucune action TARGET_ exposée par la roulette').toBeTruthy();
            return actionId as string;
        }
        case 'HOT_POTATO':
            return 'BOMB_PASSED';
        case 'BRAIN_DUEL':
            return ['WINNER_TOP', 'WINNER_BOTTOM'];
        case 'DEATH_FINGER':
            return 'TARGET_SELECTED';
        case 'BARMAN_EQUILIBRISTE':
            return 'GAME_LOST';
        case 'MAX_PRESSURE':
        case 'PENALTY_SHOOTOUT':
            return ['GAME_WON', 'GAME_LOST'];
        case 'PHOTO_CHALLENGE':
            return 'PHOTO_TAKEN';
        case 'DRUNKEN_DRAWING':
            return 'DRAWING_FINISHED';
        default:
            throw new Error(`Action attendue inconnue pour ${gameId}`);
    }
}

/**
 * Exerce le capteur réellement rendu et renvoie l'action acceptée.
 * Les capteurs matériels (gyroscope, accéléromètre) sont simulés par des
 * événements natifs ; les gestes tactiles par des TouchEvent synthétiques.
 */
async function exerciseSensor(
    page: Page,
    aperoId: number,
    sensorType: string,
    state: GameState,
): Promise<string> {
    const expected = expectedAction(state.game_id ?? '', state);
    switch (sensorType) {
        case 'BUTTONS': {
            const action = page.locator('footer button').first();
            await expect(action).toBeVisible({timeout: 10_000});
            return waitForAction(page, aperoId, expected, () => action.click());
        }
        case 'TIME_BOMB_BUTTON': {
            const bomb = page.getByRole('button', {name: /Tape pour/});
            await expect(bomb).toBeVisible({timeout: 10_000});
            return waitForAction(page, aperoId, expected, () => bomb.click());
        }
        case 'DUEL_SPLIT_SCREEN': {
            const half = page.locator('footer div.rotate-180').first();
            await expect(half).toBeVisible({timeout: 10_000});
            return waitForAction(page, aperoId, expected, () => half.click());
        }
        case 'CANVAS_DRAW': {
            const canvas = page.locator('footer canvas').first();
            await expect(canvas).toBeVisible({timeout: 10_000});
            const box = await canvas.boundingBox();
            if (!box) throw new Error('Canvas de dessin sans dimensions');
            // Le dessin est soumis automatiquement à la fin du chronomètre (15 s).
            return waitForAction(page, aperoId, expected, async () => {
                await page.mouse.move(box.x + 20, box.y + 20);
                await page.mouse.down();
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps: 8});
                await page.mouse.up();
                await page.getByRole('button', {name: /Effacer/}).click();
                await page.waitForTimeout(16_000);
            }, 30_000);
        }
        case 'CAMERA_CAPTURE': {
            await expect(page.locator('footer video').first()).toBeVisible({timeout: 20_000});
            const shutter = page.locator('footer button').last();
            await expect(shutter).toBeVisible({timeout: 10_000});
            return waitForAction(page, aperoId, expected, () => shutter.click());
        }
        case 'SWIPE_TO_TARGET': {
            const ball = page.locator('footer div.w-24.h-24').first();
            await expect(ball).toBeVisible({timeout: 10_000});
            return waitForAction(page, aperoId, expected, async () => {
                await dispatchTouches(page, 'footer div.w-24.h-24', 'touchstart', [{x: 180, y: 600}]);
                await page.waitForTimeout(200);
                await dispatchTouches(page, 'footer div.w-24.h-24', 'touchend', [{x: 180, y: 300}]);
            }, 15_000);
        }
        case 'MULTI_TOUCH_TRACKER': {
            await expect(page.getByText('Posez vos doigts')).toBeVisible({timeout: 10_000});
            return waitForAction(page, aperoId, expected, async () => {
                await dispatchTouches(page, 'footer div.fixed.inset-0', 'touchstart', [
                    {x: 120, y: 300},
                    {x: 200, y: 300},
                    {x: 280, y: 300},
                ]);
            }, 20_000);
        }
        case 'GYROSCOPE': {
            const calibrate = page.getByRole('button', {name: /Calibrer/});
            await expect(calibrate).toBeVisible({timeout: 10_000});
            await calibrate.click();
            return waitForAction(page, aperoId, expected, async () => {
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
        }
        case 'ACCELEROMETER': {
            const start = page.getByRole('button', {name: /Démarrer/});
            await expect(start).toBeVisible({timeout: 10_000});
            await start.click();
            return waitForAction(page, aperoId, expected, async () => {
                await page.evaluate(() => {
                    const event = new Event('devicemotion');
                    Object.defineProperties(event, {
                        accelerationIncludingGravity: {value: {x: 30, y: 30, z: 30}},
                    });
                    window.dispatchEvent(event);
                });
            }, 20_000);
        }
        default:
            throw new Error(`Capteur non couvert par le test: ${sensorType}`);
    }
}

/** Vérifie la transition réellement persistée en base après l'action. */
function assertPersistedTransition(gameId: string, actionId: string, before: PersistedGame, after: PersistedGame): void {
    expect(before.game_id).toBe(gameId);
    expect(after.game_id).toBe(gameId === 'AVATAR_ROULETTE' ? 'TURN_TRANSITION' : gameId);
    const state = after.state;
    switch (gameId) {
        case 'AVATAR_ROULETTE':
            expect(state.turn_index).toBe(Number(before.state.turn_index) + 1);
            break;
        case 'HOT_POTATO':
            expect(
                state.is_exploded === true || state.holder_index === Number(before.state.holder_index) + 1,
                `la patate n'a pas tourné: ${JSON.stringify(state)}`,
            ).toBe(true);
            break;
        case 'BRAIN_DUEL':
            expect(state.winner).toBe(actionId === 'WINNER_TOP' ? 'P2' : 'P1');
            break;
        case 'DEATH_FINGER':
            expect(state.selection_done).toBe(true);
            break;
        case 'BARMAN_EQUILIBRISTE':
            expect(state.status).toBe('LOST');
            break;
        case 'MAX_PRESSURE':
        case 'PENALTY_SHOOTOUT':
            expect(state.status).toBe(actionId === 'GAME_WON' ? 'WON' : 'LOST');
            break;
        case 'PHOTO_CHALLENGE':
            expect(state.photo_base64).toBe(true);
            expect(['WON', 'LOST']).toContain(state.ai_verdict);
            break;
        case 'DRUNKEN_DRAWING':
            expect(state.drawing_base64).toBe(true);
            expect(['WON', 'LOST']).toContain(state.ai_verdict);
            break;
        default:
            throw new Error(`Transition attendue inconnue pour ${gameId}`);
    }
}

async function openActiveWorlds(page: Page, aperoName: string): Promise<void> {
    const card = page.locator('div')
        .filter({hasText: aperoName})
        .filter({has: page.getByRole('button', {name: /Mondes/})})
        .last();
    await expect(card).toBeVisible({timeout: 30_000});
    await card.getByRole('button', {name: /Mondes/}).click();
    await expect(page.locator('button[data-world-tab="bar"]')).toBeVisible({timeout: 30_000});
}

test('Mini-jeux : les 9 capteurs envoient l’action attendue et la transition persiste', async ({ page, request }) => {
    test.setTimeout(600_000);
    const name = `E2E minigames ${Date.now().toString(36)}`;
    const users = captureUsers(USER_IDS);
    let aperoId: number | null = null;
    try {
        aperoId = createTestApero(name);
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
            await openActiveWorlds(page, name);

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
                    const introAction = state.actions?.[0]?.action_id;
                    expect(introAction, `aucune action d'introduction pour ${gameId}`).toBeTruthy();
                    await waitForAction(
                        page,
                        aperoId,
                        introAction as string,
                        () => page.locator('footer button').first().click(),
                    );
                    await page.waitForTimeout(400);
                }
            }

            await expect
                .poll(async () => (await readState()).required_sensor?.type, {timeout: 15_000})
                .toBe(EXPECTED_SENSOR[gameId]);

            const before = fetchPersistedGame(aperoId);
            const state = await readState();
            const actionId = await exerciseSensor(page, aperoId, state.required_sensor?.type ?? '', state);
            const after = fetchPersistedGame(aperoId);
            assertPersistedTransition(gameId, actionId, before, after);
            await captureCoverage(page, gameId);

            await page.getByRole('button', {name: 'Fermer le jeu'}).click();
            await expect(page.getByRole('button', {name: 'Fermer le jeu'})).toHaveCount(0, {timeout: 10_000});
        }
    } finally {
        try {
            deleteTestApero(name);
        } finally {
            expect(captureUsers(USER_IDS)).toEqual(users);
        }
    }
});
