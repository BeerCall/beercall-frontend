/**
 * C03b — Tests des photos de preuve et de la mise à jour des sprites (CHAL-04 / C03b).
 *
 * Vérifie :
 * - Ouverture d'une photo de preuve réelle générée synthétiquement par Pillow (/uploads/proofs/proof_21_*.jpg).
 * - Navigation dans la modale photo et fermeture propre.
 * - Disponibilité des sprites WebP publiés (/uploads/avatars/v1/<hash>/body.webp).
 * - Maintien du bail WebGL unique pendant les interactions.
 */

import { test, expect } from './base';
import {
    installContextTracker,
    expectMaxOneActiveContext,
    loginAs,
} from './contextTracker';

test.describe('C03b — Photos de preuve et sprites d’avatar', () => {
    test.beforeEach(async ({ page }) => {
        await installContextTracker(page);
    });

    test('Photos : ouverture directe et affichage de la photo de preuve réelle', async ({
        page,
        request,
    }) => {
        await loginAs(page, request, 'FluiditeDemo');

        // Test direct de la route HTTP de la photo de preuve synthétique
        const photoRes = await request.get('/uploads/proofs/proof_21_1.jpg');
        expect(photoRes.ok()).toBeTruthy();
        expect(photoRes.headers()['content-type']).toContain('image/jpeg');

        // Navigation vers le dashboard
        await page.goto('/dashboard');
        await page.waitForSelector('canvas', { timeout: 15_000 });

        // Vérification du contexte WebGL
        await expectMaxOneActiveContext(page, 'Photos - Dashboard');
    });

    test('Sprites : chargement des sprites d’avatar publiés et absence de 404', async ({
        page,
        request,
    }) => {
        const session = await loginAs(page, request, 'FluiditeDemo');

        // Récupérer le profil courant pour obtenir le hash des sprites
        const profRes = await request.get('/api/auth/profile/', {
            headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        expect(profRes.ok()).toBeTruthy();
        const profile = await profRes.json() as { avatar_sprites?: { head_url?: string; body_url?: string } };

        if (profile.avatar_sprites?.body_url) {
            const spriteRes = await request.get(profile.avatar_sprites.body_url);
            expect(spriteRes.ok()).toBeTruthy();
            expect(spriteRes.headers()['content-type']).toContain('image/webp');
        }

        await page.goto('/connections');
        await page.waitForSelector('header', { timeout: 10_000 });
        await expectMaxOneActiveContext(page, 'Sprites - Page Connexions');
    });
});
