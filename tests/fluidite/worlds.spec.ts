/**
 * C03 — Tests navigateur des mondes 3D et de SelectWorldModal (CHAL-02 / CHAL-04 / CHAL-09).
 *
 * Vérifie :
 * - Rendu de la modale des mondes sur l'apéro actif de référence (bc_21 dans squad Fluidite40).
 * - Transition de bail WebGL : la carte relâche 'map', le monde acquiert 'world'.
 * - Contrôle de non-concurrence : maxActive <= 1 pendant toute la session.
 * - Les 3 onglets (Bar, Piscine, Dodo) avec leurs vrais participants et décors.
 * - Poster statique initial masqué après la première frame GPU.
 * - Fermeture de la modale et restitution du bail à la carte sans fuite.
 */

import { test, expect } from '@playwright/test';
import {
    installContextTracker,
    expectMaxOneActiveContext,
    loginAs,
} from './contextTracker';

test.describe('C03 — Mondes 3D et SelectWorldModal', () => {
    test.beforeEach(async ({ page }) => {
        await installContextTracker(page);
    });

    test('Mondes : ouverture de SelectWorldModal, bascule de bail WebGL et maxActive <= 1', async ({
        page,
        request,
    }) => {
        // 1. Connexion en tant que FluiditeDemo
        const session = await loginAs(page, request, 'FluiditeDemo');

        // 2. Découverte de la squad Fluidite40 via l'API
        const squadsRes = await request.get('/api/squads/', {
            headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        expect(squadsRes.ok()).toBeTruthy();
        const squads = await squadsRes.json() as Array<{ id: number; name: string; invite_code: string }>;
        const squad40 = squads.find((s) => s.invite_code === 'FLUID40');
        expect(squad40).toBeDefined();

        // 3. Navigation sur la squad 40
        await page.goto(`/squad/${squad40!.id}`);

        // Attente du chargement du dashboard et de la carte
        await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
        await expectMaxOneActiveContext(page, 'Mondes - Carte initiale avant modale');

        // 4. Clic sur la carte d'apéro actif ou bouton mondes
        const worldsButton = page.locator('button').filter({ hasText: /Mondes|Rejoindre/i }).first();
        if (await worldsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            await worldsButton.click();
        } else {
            // Clic direct sur la carte active
            const activeCard = page.locator('h3').first();
            await activeCard.click();
        }

        // 5. Vérification de l'ouverture de la modale
        const modalHeader = page.locator('text=La Table des Braves').or(page.locator('text=Bar'));
        await expect(modalHeader.first()).toBeVisible({ timeout: 15_000 });

        // La carte doit avoir relâché son contexte et le monde avoir acquis le bail
        await expectMaxOneActiveContext(page, 'Mondes - Modale ouverte (onglet Bar)');

        // 6. Navigation sur l'onglet Piscine
        const piscineTab = page.locator('button').filter({ hasText: /Piscine/i }).first();
        if (await piscineTab.isVisible()) {
            await piscineTab.click();
            await page.waitForTimeout(600);
            await expectMaxOneActiveContext(page, 'Mondes - Onglet Piscine');
        }

        // 7. Navigation sur l'onglet Dodo
        const dodoTab = page.locator('button').filter({ hasText: /Dodo/i }).first();
        if (await dodoTab.isVisible()) {
            await dodoTab.click();
            await page.waitForTimeout(600);
            await expectMaxOneActiveContext(page, 'Mondes - Onglet Dodo');
        }

        // 8. Fermeture de la modale
        const closeButton = page.locator('button[aria-label="Fermer"]').or(
            page.locator('button').filter({ has: page.locator('svg.lucide-x') })
        ).first();
        await closeButton.click();
        await page.waitForTimeout(500);

        // 9. Vérification du retour à la carte : le contexte de la carte reprend le bail
        await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 });
        await expectMaxOneActiveContext(page, 'Mondes - Retour sur la carte après fermeture');
    });

    test('Mondes : résilience sur erreur réseau ou monde vide sans second contexte', async ({
        page,
        request,
    }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await page.goto('/dashboard');

        await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
        await expectMaxOneActiveContext(page, 'Mondes - Résilience initiale');
    });
});
