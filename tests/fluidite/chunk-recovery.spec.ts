import { expect, test } from '@playwright/test';
import path from 'node:path';

// 8h-4b-0 — reproduit un chunk lazy disparu (rebuild) sans service worker
// pour que l'interception réseau soit déterministe.
test.use({ serviceWorkers: 'block' });

const screenshotDir = path.resolve(process.cwd(), '../.openchamber/screenshots');

test('un chunk lazy manquant déclenche un seul rechargement et l’app récupère', async ({ page }) => {
    let attempts = 0;
    await page.route('**/assets/Login-*.js', async (route) => {
        attempts += 1;
        if (attempts === 1) {
            await route.abort('failed');
            return;
        }
        await route.continue();
    });

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'SE CONNECTER' })).toBeVisible({timeout: 20_000});

    // Un seul rechargement : le chunk est demandé une fois avant, une fois après.
    // Attendre un peu détecte aussi un éventuel second rechargement en boucle.
    await page.waitForTimeout(1_000);
    expect(attempts).toBe(2);
    await page.screenshot({
        path: path.join(screenshotDir, '8h4b0-chunk-recovery.png'),
        fullPage: true,
    });
});

test('un second échec affiche un message et ne boucle pas', async ({ page }) => {
    let attempts = 0;
    await page.route('**/assets/Login-*.js', async (route) => {
        attempts += 1;
        await route.abort('failed');
    });

    let loads = 0;
    page.on('load', () => { loads += 1; });

    await page.goto('/');
    await expect(page.getByTestId('fatal-error')).toBeVisible({timeout: 20_000});
    await expect(page.getByTestId('fatal-reload')).toHaveText('Recharger');
    expect(attempts).toBeGreaterThanOrEqual(2);

    const loadsAfterFallback = loads;
    await page.waitForTimeout(1_500);
    expect(loads).toBe(loadsAfterFallback);

    await page.screenshot({
        path: path.join(screenshotDir, '8h4b0-chunk-fatal.png'),
        fullPage: true,
    });
});
