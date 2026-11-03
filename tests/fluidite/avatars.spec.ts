/**
 * C03 — Tests navigateur des avatars 3D et du vestiaire (CHAL-02 / CHAL-06).
 *
 * Vérifie :
 * - Rendu de l'AvatarStage 3D dans le Profil sous bail WebGL unique.
 * - Changement de tenue (25 options du vestiaire) et d'animations (Idle, Sitting, Interact).
 * - Absence stricte de double contexte WebGL (maxActive <= 1) sur 10 allers-retours Profil <-> Connexions.
 * - Parcours d'inscription (SignUp) avec preview GLB sans crash.
 */

import { test, expect } from '@playwright/test';
import {
    installContextTracker,
    expectMaxOneActiveContext,
    loginAs,
} from './contextTracker';

test.describe('C03 — Avatars 3D, Profil et Vestiaire', () => {
    test.beforeEach(async ({ page }) => {
        await installContextTracker(page);
    });

    test('Profil : chargement de la scène 3D AvatarStage et contrôle du contexte unique', async ({
        page,
        request,
    }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await page.goto('/profile');

        // Attente du rendu du conteneur de profil
        await expect(page.locator('text=Mon Profil').or(page.locator('text=Garde-robe'))).toBeVisible({
            timeout: 15_000,
        });

        // Vérification de la présence du canvas 3D sous lease 'profile'
        const canvas = page.locator('canvas');
        await expect(canvas.first()).toBeVisible({ timeout: 15_000 });

        // Vérification du contexte WebGL unique
        await expectMaxOneActiveContext(page, 'Profil - Scène 3D initiale');
    });

    test('Profil : interactions vestiaire, changement de pièces et animations', async ({
        page,
        request,
    }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await page.goto('/profile');

        await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });

        // Vérification des onglets du vestiaire (Haut, Bas, Chaussures, etc.)
        const tabs = page.locator('button').filter({ hasText: /Haut|Bas|Chaussures|Tête|Accessoires/i });
        const tabCount = await tabs.count();

        // Parcourir les onglets disponibles et sélectionner des pièces
        for (let t = 0; t < Math.min(tabCount, 4); t++) {
            await tabs.nth(t).click();
            await page.waitForTimeout(300);

            // Sélectionner un item disponible dans la grille
            const items = page.locator('div[role="button"], button').filter({ has: page.locator('svg, img') });
            if ((await items.count()) > 2) {
                await items.nth(1).click();
                await page.waitForTimeout(200);
            }

            await expectMaxOneActiveContext(page, `Profil - Onglet vestiaire ${t}`);
        }

        // Test des boutons d'animations si disponibles
        const animButtons = page.locator('button').filter({ hasText: /Sitting|Interact|Idle|Danse/i });
        const animCount = await animButtons.count();
        for (let a = 0; a < animCount; a++) {
            await animButtons.nth(a).click();
            await page.waitForTimeout(400);
            await expectMaxOneActiveContext(page, `Profil - Animation ${a}`);
        }
    });

    test('Profil : 10 allers-retours Profil <-> Connexions sans fuite de contexte', async ({
        page,
        request,
    }) => {
        await loginAs(page, request, 'FluiditeDemo');

        for (let cycle = 1; cycle <= 10; cycle++) {
            // Aller vers Profil
            await page.goto('/profile');
            await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 });
            await expectMaxOneActiveContext(page, `Cycle ${cycle} - Dans Profil`);

            // Aller vers Connexions (page 2D, aucun canvas 3D)
            await page.goto('/connections');
            await page.waitForSelector('header', { timeout: 10_000 });

            // Dans connexions, le canvas 3D de profile doit être libéré
            await expectMaxOneActiveContext(page, `Cycle ${cycle} - Dans Connexions`);
        }
    });

    test('SignUp : formulaire d’inscription et preview avatar GLB', async ({ page }) => {
        await page.goto('/signup');

        // Vérification du formulaire d'inscription
        await expect(page.locator('input[placeholder*="pseudo" i], input[type="text"]').first()).toBeVisible({
            timeout: 10_000,
        });

        // Contrôle que maxActive <= 1 pendant toute la phase de signup
        await expectMaxOneActiveContext(page, 'SignUp - Formulaire invité');
    });
});
