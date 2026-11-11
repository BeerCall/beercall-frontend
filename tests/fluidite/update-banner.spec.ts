import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {test, expect} from './base';

const runDir = process.env.FLUIDITE_RUN_DIR || path.resolve('..', '.opencode', 'plan', 'beercall', 'runs', 'C03');
const screenshotDir = path.join(runDir, 'screenshots');

test('11a — bandeau de mise à jour PWA et activation explicite du worker', async ({page}) => {
    await page.addInitScript(() => {
        const waiting = {
            state: 'installed',
            postMessage: (message: unknown) => {
                (window as unknown as {__swMessage?: unknown}).__swMessage = message;
            },
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        };
        const registration = {
            waiting,
            installing: null,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            update: async () => undefined,
        };
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {
                controller: {},
                ready: Promise.resolve(registration),
                register: async () => registration,
                getRegistration: async () => registration,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            },
        });
    });

    mkdirSync(screenshotDir, {recursive: true});
    await page.setViewportSize({width: 390, height: 844});
    await page.goto('/login');

    await expect(page.getByText('Nouvelle version disponible')).toBeVisible({timeout: 15_000});
    await page.screenshot({path: path.join(screenshotDir, '11a-update-banner.png')});

    await page.getByRole('button', {name: 'Mettre à jour'}).click();
    await expect.poll(async () => page.evaluate(
        () => (window as unknown as {__swMessage?: unknown}).__swMessage,
    )).toEqual({type: 'SKIP_WAITING'});
});
