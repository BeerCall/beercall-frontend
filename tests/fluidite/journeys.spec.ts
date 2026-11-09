import { test, expect } from './base';
import { loginAs } from './contextTracker';

test.describe('Parcours utilisateur — Login, SignUp, PhotoModal, Chat', () => {
    test('Login : identifiants invalides puis connexion réussie', async ({ page }) => {
        await page.goto('/login');
        await page.getByPlaceholder('Ton Pseudo').fill('FluiditeDemo');
        await page.getByPlaceholder('Mot de passe').fill('MauvaisMotDePasse');
        await page.getByRole('button', {name: /SE CONNECTER/}).click();
        await expect(page.getByText(/Identifiants incorrects/)).toBeVisible({timeout: 15_000});

        await page.getByPlaceholder('Mot de passe').fill('FluiditeTest2026!');
        await page.getByRole('button', {name: /SE CONNECTER/}).click();
        await expect(page).toHaveURL(/\/dashboard/, {timeout: 20_000});
        await expect(page.locator('[data-bottom-nav]')).toBeVisible({timeout: 20_000});
    });

    test('SignUp : formulaire puis aperçu du vestiaire sans créer de compte', async ({ page }) => {
        await page.goto('/signup');
        await page.getByPlaceholder('Pseudo').fill('E2EUser');
        await page.getByPlaceholder('Mot de passe').fill('Test1234');
        await page.getByRole('button', {name: /CRÉER L'AVATAR/}).click();

        await expect(page.getByRole('heading', {name: 'Vestiaire'})).toBeVisible({timeout: 20_000});
        await expect(page.getByRole('button', {name: /Créer mon compte/})).toBeVisible();
        // Parcours des catégories sans validation : aucun compte n'est créé.
        await page.getByRole('button', {name: /Haut/}).first().click();
        await page.waitForTimeout(300);
        await page.getByRole('button', {name: /Bas/}).first().click();
        await page.waitForTimeout(300);
    });

    test('PhotoModal : ouverture d’une preuve photo au Bar puis fermeture', async ({ page, request }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await page.goto('/squad/2');
        await expect(page.locator('canvas').first()).toBeVisible({timeout: 20_000});

        const worlds = page.getByRole('button', {name: /Mondes/}).first();
        await expect(worlds).toBeVisible({timeout: 20_000});
        await worlds.click();

        const proof = page.locator('[data-world-photo]').first();
        await expect(proof).toBeVisible({timeout: 90_000});
        // Les preuves se chevauchent dans la scène : on déclenche le handler
        // du bouton sans dépendre de l'empilement visuel.
        await proof.evaluate((button) => (button as HTMLButtonElement).click());

        const preview = page.locator('img[alt="Aperçu de la photo"]');
        await expect(preview).toBeVisible({timeout: 15_000});
        const firstSource = await preview.getAttribute('src');
        expect(firstSource).toBeTruthy();

        // Fermeture par le fond (le clic sur l'image ne ferme pas).
        await page.mouse.click(8, 8);
        await expect(preview).toHaveCount(0, {timeout: 10_000});
    });

    test('ChatPage : ouverture, saisie et retour sans écrire dans Firebase', async ({ page, request }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await page.goto('/squad/2');
        await expect(page.locator('[data-bottom-nav]')).toBeVisible({timeout: 20_000});
        await page.goto('/squad/2/chat');

        await expect(page.getByRole('button', {name: 'Retour'})).toBeVisible({timeout: 20_000});
        const input = page.getByPlaceholder(/cris un message/);
        await expect(input).toBeVisible({timeout: 20_000});
        await input.fill('Message de test non envoyé');
        await expect(page.getByRole('button', {name: 'Envoyer'})).toBeEnabled();
        await page.getByRole('button', {name: 'Retour'}).click();
        await expect(page).toHaveURL(/\/squad\/2/, {timeout: 10_000});
    });
});
