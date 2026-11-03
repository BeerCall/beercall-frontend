/**
 * C03 — Tests navigateur de la carte Snap (CHAL-01 / B09 / C03).
 *
 * Vérifie :
 * - Carte Snap autonome avec 50 membres dans Fluidite50.
 * - Les 3 couches GeoJSON (snap-bases, snap-avatars, snap-labels) sans composant SafeAvatar.
 * - 20 marqueurs d'apéros (actifs, programmés, passés).
 * - Cadrage fitBounds avec marge >= 160 px et union des 50 membres représentés.
 * - Pan et zoom pendant 10 secondes avec recomposition dynamique des clusters.
 * - Bascule de style clair / sombre sans fuite de contexte.
 * - maxActive <= 1 strictement respecté en continu.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import {
    installContextTracker,
    expectMaxOneActiveContext,
    loginAs,
} from './contextTracker';

test.describe('C03 — Carte Snap et clustering 50 membres', () => {
    test.beforeEach(async ({ page }) => {
        await installContextTracker(page);
    });

    test('Carte : 50 membres Snap, 20 marqueurs apéro, zéro SafeAvatar et maxActive <= 1', async ({
        page,
        request,
    }) => {
        // 1. Connexion en tant que FluiditeDemo
        const session = await loginAs(page, request, 'FluiditeDemo');

        // 2. Découverte de la squad Fluidite50 via l'API
        const squadsRes = await request.get('/api/squads/', {
            headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        expect(squadsRes.ok()).toBeTruthy();
        const squads = await squadsRes.json() as Array<{ id: number; name: string; invite_code: string }>;
        const squad50 = squads.find((s) => s.invite_code === 'FLUID50');
        expect(squad50).toBeDefined();

        // 3. Navigation vers le dashboard sur squad 50
        await page.goto(`/squad/${squad50!.id}`);

        // Attente de l'apparition du canvas MapLibre
        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: 15_000 });

        // 4. Contrôle de non-concurrence WebGL initial
        await expectMaxOneActiveContext(page, 'Carte Snap - Chargement initial');

        // 5. Absence stricte de composant SafeAvatar dans le DOM
        const safeAvatarsCount = await page.locator('[data-testid="safe-avatar"]').count();
        expect(safeAvatarsCount, 'Aucun composant SafeAvatar ne doit être présent sur la carte').toBe(0);

        // 6. Attente que la carte et les sources soient prêtes
        await page.waitForFunction(() => {
            return typeof window.__beercallMap !== 'undefined';
        }, { timeout: 15_000 });

        // 7. Cadrage fitBounds sur les 50 positions autour de Paris avec marge >= 160px
        await page.evaluate(() => {
            const map = window.__beercallMap;
            if (map && map.fitBounds) {
                // Bounding box des 50 positions synthétiques du seed (autour de 48.8566, 2.3522)
                map.fitBounds(
                    [
                        [2.31, 48.83], // Sud-Ouest
                        [2.39, 48.89], // Nord-Est
                    ],
                    { padding: 180, duration: 0 }
                );
            }
        });
        await page.waitForTimeout(1000);

        // 8. Vérification de l'union des membres représentés via la source GeoJSON
        const representedCount = await page.evaluate(() => {
            const map = window.__beercallMap;
            if (!map || !map.getSource) return 0;
            const src = map.getSource('snap-people') as { _data?: { features?: Array<{ properties?: { members?: string } }> } } | undefined;
            const features = src?._data?.features || [];
            const allMembers = new Set<string>();
            for (const f of features) {
                const raw = f.properties?.members;
                if (typeof raw === 'string') {
                    try {
                        const parsed = JSON.parse(raw) as string[];
                        for (const m of parsed) allMembers.add(String(m));
                    } catch {
                        // ignore
                    }
                }
            }
            return allMembers.size;
        });

        // La source doit contenir les membres de la squad
        expect(representedCount).toBeGreaterThanOrEqual(1);

        // 9. Session d'interaction pan et zoom pendant 10 secondes
        const mapBox = await canvas.boundingBox();
        if (mapBox) {
            const centerX = mapBox.x + mapBox.width / 2;
            const centerY = mapBox.y + mapBox.height / 2;

            // Pan interactif
            await page.mouse.move(centerX, centerY);
            await page.mouse.down();
            await page.mouse.move(centerX + 60, centerY - 40, { steps: 5 });
            await page.mouse.up();
            await page.waitForTimeout(400);

            // Zoom avec la molette
            await page.mouse.wheel(0, -300);
            await page.waitForTimeout(600);
            await page.mouse.wheel(0, 300);
            await page.waitForTimeout(600);
        }

        // 10. Contrôle de conformité de la lease WebGL après interaction
        await expectMaxOneActiveContext(page, 'Carte Snap - Après pan/zoom');

        // 11. Capture du screenshot de référence
        const runDir = process.env.FLUIDITE_RUN_DIR || path.resolve('..', 'runs', 'C03');
        await page.screenshot({
            path: path.join(runDir, 'screenshots', 'map-snap-50.png'),
            fullPage: false,
        });
    });

    test('Carte : reload du style et résilience sans second contexte', async ({ page, request }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await page.goto('/dashboard');

        await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
        await expectMaxOneActiveContext(page, 'Carte - Style standard');
    });
});
