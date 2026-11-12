/**
 * 8l — la machine à sous du Bar lance la partie et la reprend au même endroit.
 *
 * Le clic passe par la cible PROBE de la machine (aucun DOM en 3D) ; le seuil de
 * glissement de 8 px est vérifié séparément par le test unitaire.
 */
import { test, expect, type Page } from './base';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    installContextTracker,
    loginAs,
    readContextTracker,
} from './contextTracker';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.resolve(HERE, '../../../.openchamber/screenshots');
const BACKEND_CONTAINER = process.env.FLUIDITE_BACKEND_CONTAINER || 'beercall-fluidite-night-backend-1';

function runPython(script: string): string {
    return execFileSync('docker', ['exec', '-i', BACKEND_CONTAINER, 'python', '-'], {
        input: script,
        encoding: 'utf8',
    });
}

/** Crée un apéro actif isolé dans FLUID40 et renvoie son id (nettoyé par le test). */
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
        location_name='E2E world-slot',
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

interface SlotTarget {
    ndcX: number;
    ndcY: number;
}

async function readSlotTarget(page: Page): Promise<SlotTarget | null> {
    return page.evaluate(
        () => (window as unknown as {
            __beercallSlotMachineTarget?: () => SlotTarget | null;
        }).__beercallSlotMachineTarget?.() ?? null,
    );
}

async function waitForSlotTarget(page: Page): Promise<SlotTarget> {
    await expect.poll(
        async () => Boolean(await readSlotTarget(page)),
        { timeout: 180_000 },
    ).toBe(true);
    const target = await readSlotTarget(page);
    if (!target) throw new Error('Machine à sous introuvable');
    return target;
}

async function worldCanvasBox(page: Page) {
    const canvas = page.getByTestId('world-viewport').locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas monde introuvable');
    return box;
}

async function pointForTarget(page: Page, target: SlotTarget) {
    const box = await worldCanvasBox(page);
    return {
        x: box.x + ((target.ndcX + 1) / 2) * box.width,
        y: box.y + (1 - (target.ndcY + 1) / 2) * box.height,
    };
}

async function openSquad(page: Page, squadId: number): Promise<void> {
    await page.goto(`/squad/${squadId}`);
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    // Crash MapLibre `_loaded` aléatoire et préexistant : un rechargement suffit.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        if (await page.locator('text=L\'application a rencontré une erreur').count() === 0) break;
        await page.reload();
        await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.locator('text=L\'application a rencontré une erreur')).toHaveCount(0);
}

async function openWorlds(page: Page, locationName?: string): Promise<void> {
    const worldsButton = locationName
        ? page.locator('div')
            .filter({hasText: locationName})
            .filter({has: page.getByRole('button', {name: /Mondes/})})
            .last()
            .getByRole('button', {name: /Mondes/})
        : page.getByRole('button', {name: /Mondes/}).first();
    await expect(worldsButton).toBeVisible({ timeout: 20_000 });
    await worldsButton.click();
    await expect(page.locator('button[data-world-tab="bar"]')).toBeVisible({ timeout: 20_000 });
}

async function pullLever(page: Page): Promise<void> {
    const target = await waitForSlotTarget(page);
    const point = await pointForTarget(page, target);
    await page.mouse.click(point.x, point.y);
}

interface GameStatePayload {
    game_id?: string;
    turn_of?: string;
    instruction_header?: string;
}

/** Avance les transitions jusqu'à un mini-jeu encore en cours. */
async function advanceToRunningGame(
    page: Page,
    aperoId: number,
    readGameState: () => Promise<GameStatePayload>,
): Promise<GameStatePayload> {
    expect((await readGameState()).game_id).toBe('TURN_TRANSITION');
    const ready = page.getByRole('button', {name: /Je suis prêt !/i});
    await expect(ready).toBeEnabled({timeout: 20_000});
    const actionResponse = page.waitForResponse((response) =>
        response.url().endsWith(`/api/aperos/${aperoId}/game/action`) &&
        response.request().method() === 'POST', {timeout: 30_000});
    // Un seul clic : une ancienne frame du bouton peut rester montée pendant
    // AnimatePresence alors que le serveur a déjà changé de mini-jeu.
    await ready.click({timeout: 20_000});
    const response = await actionResponse;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toMatchObject({action_id: 'START_RANDOM_GAME'});
    const state = await response.json() as GameStatePayload;
    expect(state.game_id).toBeTruthy();
    expect(state.game_id).not.toBe('TURN_TRANSITION');
    await expect(page.locator('header h3').first()).toHaveText(
        state.instruction_header ?? '', {timeout: 20_000});
    return state;
}

test('8l — le levier du Bar lance puis reprend la partie au même endroit', async ({ page, request }) => {
    test.setTimeout(900_000);
    const aperoId = createTestApero();
    try {
        await installContextTracker(page);
        const session = await loginAs(page, request, 'FluiditeDemo');
        const readGameState = async (): Promise<GameStatePayload> => {
            const response = await request.get(`/api/aperos/${aperoId}/game/state`, {
                headers: { Authorization: `Bearer ${session.accessToken}` },
            });
            expect(response.ok()).toBeTruthy();
            return response.json() as Promise<GameStatePayload>;
        };

        await openSquad(page, 2);
        await openWorlds(page, 'E2E world-slot');
        await expect(page.locator('[data-world-name]').first()).toBeVisible({ timeout: 180_000 });
        await expect(page.locator('button[aria-label="Démarrer la partie"]')).toBeEnabled({ timeout: 20_000 });

        const before = await readContextTracker(page);
        await waitForSlotTarget(page);
        await page.screenshot({ path: path.join(screenshotDir, '8l-bar-machine.png') });

        // 1. Le levier s'abaisse puis ouvre le jeu (transition de tour).
        await pullLever(page);
        await expect(page.getByText('NOUVEAU DÉFI', { exact: false })).toBeVisible({ timeout: 30_000 });
        await page.screenshot({ path: path.join(screenshotDir, '8l-jeu-ouverture.png') });
        const afterOpen = await readContextTracker(page);

        // 2. Le tour avance jusqu'à un mini-jeu en cours : on retient son état.
        const transitionHeader = (await page.locator('header h3').first().innerText()).trim();
        const stateBefore = await advanceToRunningGame(page, aperoId, readGameState);
        const headerBefore = (await page.locator('header h3').first().innerText()).trim();
        expect(headerBefore.toLocaleLowerCase()).toBe((stateBefore.instruction_header ?? '').toLocaleLowerCase());
        await page.screenshot({ path: path.join(screenshotDir, '8l-jeu-mini-jeu.png') });

        // 3. Fermer le jeu, rouvrir le Bar, ré-actionner le levier : même partie.
        await page.getByRole('button', { name: 'Fermer le jeu' }).click();
        await expect(page.locator('header h3')).toHaveCount(0, { timeout: 20_000 });
        const afterClose = await readContextTracker(page);
        await openWorlds(page, 'E2E world-slot');
        await pullLever(page);
        await expect(page.locator('header h3').first()).toBeVisible({ timeout: 30_000 });
        const headerAfter = (await page.locator('header h3').first().innerText()).trim();
        const stateAfter = await readGameState();
        expect(stateAfter.game_id).toBe(stateBefore.game_id);
        expect(headerAfter.toLocaleLowerCase()).toBe((stateAfter.instruction_header ?? '').toLocaleLowerCase());
        await page.screenshot({ path: path.join(screenshotDir, '8l-reprise.png') });

        const after = await readContextTracker(page);

        writeFileSync(
            path.join(screenshotDir, '8l-slot-machine.json'),
            JSON.stringify({
                launched: true,
                aperoId,
                transitionHeader,
                headerBefore,
                headerAfter,
                gameIdBefore: stateBefore.game_id,
                gameIdAfter: stateAfter.game_id,
                contexts: {
                    before: { active: before.active, totalCreated: before.totalCreated, maxActive: before.maxActive, contexts: before.contexts },
                    afterOpen: { active: afterOpen.active, totalCreated: afterOpen.totalCreated, maxActive: afterOpen.maxActive, contexts: afterOpen.contexts },
                    afterClose: { active: afterClose.active, totalCreated: afterClose.totalCreated, maxActive: afterClose.maxActive, contexts: afterClose.contexts },
                    after: { active: after.active, totalCreated: after.totalCreated, maxActive: after.maxActive, contexts: after.contexts },
                },
                canvasRecreated: after.totalCreated !== before.totalCreated,
            }, null, 2),
        );

        // Deux contextes sont voulus depuis 8h-4b (carte + mondes) : on vérifie
        // qu'aucun Canvas n'a été recréé ni perdu pendant le jeu et la reprise.
        expect(after.totalCreated).toBe(before.totalCreated);
        expect(after.totalLost).toBe(before.totalLost);
        expect(after.active).toBe(before.active);
    } finally {
        deleteTestApero(aperoId);
    }
});
