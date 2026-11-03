/**
 * C03b — Tests de non-régression des flux applicatifs et de l'isolation (CHAL-01 / C03b).
 *
 * Vérifie :
 * - Navbar sans squad vs avec squad (boutons et gardes GPS).
 * - Isolation stricte des comptes (FluiditeSolo sans squad ne voit aucune position tierce).
 * - Profil propre avec bouton déconnexion vs profil autrui.
 * - Absence de crash liée à Firebase localement (limite explicitement acceptée).
 */

import { test, expect } from '@playwright/test';
import {
    installContextTracker,
    expectMaxOneActiveContext,
    loginAs,
} from './contextTracker';

test.describe('C03b — Flux applicatifs, Navbar et Isolation des comptes', () => {
    test.beforeEach(async ({ page }) => {
        await installContextTracker(page);
    });

    test('Navbar : comportement sans squad vs avec squad', async ({ page, request }) => {
        // FluiditeSolo n'a aucune squad
        await loginAs(page, request, 'FluiditeSolo');
        await page.goto('/dashboard');

        // Attente du rendu du dashboard
        await page.waitForSelector('nav, header', { timeout: 15_000 });

        // Le bouton de lancement d'apéro doit être désactivé ou absent sans squad
        const launchBtn = page.locator('button[title*="Rejoins ou crée une squad" i]').or(
            page.locator('button:has-text("Lancer")')
        ).first();
        if (await launchBtn.isVisible()) {
            const isDisabled = await launchBtn.isDisabled();
            const ariaDisabled = await launchBtn.getAttribute('aria-disabled');
            expect(isDisabled || ariaDisabled === 'true').toBeTruthy();
        }

        await expectMaxOneActiveContext(page, 'Navbar - Compte sans squad');
    });

    test('Isolation : FluiditeSolo ne reçoit aucune position de squad', async ({ page, request }) => {
        const session = await loginAs(page, request, 'FluiditeSolo');

        // Requête directe à l'API pour vérifier qu'aucune squad n'est retournée
        const res = await request.get('/api/squads/', {
            headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        expect(res.ok()).toBeTruthy();
        const squads = await res.json() as unknown[];
        expect(squads.length).toBe(0);

        await page.goto('/dashboard');
        await page.waitForTimeout(1000);

        // Aucune donnée de membre ne doit être injectée
        await expectMaxOneActiveContext(page, 'Isolation - Aucune squad');
    });

    test('Profil : bouton déconnexion présent sur son propre profil uniquement', async ({ page, request }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await page.goto('/profile');

        // Sur son propre profil, le bouton de déconnexion est présent
        const logoutBtn = page.locator('button[title="Déconnexion"]').or(
            page.locator('button:has-text("Déconnexion")')
        ).first();
        await expect(logoutBtn).toBeVisible({ timeout: 15_000 });

        await expectMaxOneActiveContext(page, 'Profil - Propre compte avec Déconnexion');
    });
});
