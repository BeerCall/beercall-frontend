import {createServer} from 'node:http';
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test, expect} from './base';

// Vrai build et vrais workers sur une origine jetable, sans API ni DB de recette.
test('11a — vrai Service Worker : première installation et mise à jour dans deux onglets', async ({page, context}) => {
    test.setTimeout(120_000);
    // La suite standard ne dépend pas d'un dist local potentiellement ancien.
    // Un build prévalidé peut être fourni pour éviter de le refaire en review.
    const suppliedBuild = process.env.FLUIDITE_SW_BUILD_DIR;
    const temporary = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : path.join(tmpdir(), 'opencode');
    if (!suppliedBuild) await mkdir(temporary, {recursive: true});
    const root = suppliedBuild ? path.resolve(suppliedBuild) : await mkdtemp(path.join(temporary, 'beercall-sw-review-'));
    try {
        if (!suppliedBuild) execFileSync(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'build', '--outDir', root], {
            timeout: 60_000, encoding: 'utf8', stdio: 'pipe',
        });
        const workerSource = await readFile(path.join(root, 'firebase-messaging-sw.js'), 'utf8');
        let version = 1;
        const mime: Record<string, string> = {
            '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
            '.json': 'application/json', '.webmanifest': 'application/manifest+json',
            '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
        };
        const server = createServer(async (request, response) => {
            try {
                const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
                const file = path.resolve(root, `.${pathname === '/' || pathname === '/login' ? '/index.html' : pathname}`);
                const relative = path.relative(root, file);
                if (relative.startsWith('..') || path.isAbsolute(relative)) {
                    response.writeHead(403).end();
                    return;
                }
                const body = pathname === '/firebase-messaging-sw.js'
                    ? `${workerSource}\n// review-lifecycle-version-${version}\n`
                    : await readFile(file);
                response.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
                response.end(body);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[sw-real-test] lecture impossible', error);
                response.writeHead(404).end();
            }
        });
        const other = await context.newPage();
        try {
            await new Promise<void>((resolve, reject) => {
                server.once('error', reject);
                server.listen(0, '127.0.0.1', resolve);
            });
            const address = server.address();
            if (!address || typeof address === 'string') throw new Error('Origine de test introuvable');
            const origin = `http://127.0.0.1:${address.port}`;
            let loads = 0;
            let otherLoads = 0;
            page.on('load', () => { loads++; });
            other.on('load', () => { otherLoads++; });
            await page.setViewportSize({width: 390, height: 844});
            await page.goto(`${origin}/login`);
            await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
            await expect(page.getByPlaceholder('Ton Pseudo')).toBeVisible();
            expect(loads).toBe(1);
            await expect(page.getByText('Nouvelle version disponible')).toHaveCount(0);

            await other.goto(`${origin}/login`);
            await other.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
            await other.evaluate(() => {
                (window as Window & {__initialSw?: ServiceWorker | null}).__initialSw = navigator.serviceWorker.controller;
            });
            version = 2;
            await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
            await expect(page.getByRole('button', {name: 'Mettre à jour'})).toBeVisible();
            await expect(other.getByRole('button', {name: 'Mettre à jour'})).toBeVisible();
            await page.screenshot({path: test.info().outputPath('11a-real-sw-waiting.png')});
            await page.getByRole('button', {name: 'Mettre à jour'}).click();
            await expect.poll(() => loads).toBe(2);
            await expect(page.getByPlaceholder('Ton Pseudo')).toBeVisible();
            await other.waitForFunction(() => navigator.serviceWorker.controller !==
                (window as Window & {__initialSw?: ServiceWorker | null}).__initialSw);
            expect(otherLoads).toBe(1); // Aucun consentement dans cet onglet.
            await other.getByRole('button', {name: 'Mettre à jour'}).click();
            await expect.poll(() => otherLoads).toBe(2);
            await expect(other.getByPlaceholder('Ton Pseudo')).toBeVisible();
            expect(loads).toBe(2);
            await expect(other.getByText('Nouvelle version disponible')).toHaveCount(0);
            await page.screenshot({path: test.info().outputPath('11a-real-sw-updated.png')});
        } finally {
            await other.close();
            server.closeAllConnections();
            if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        }
    } finally {
        if (!suppliedBuild) await rm(root, {recursive: true, force: true});
    }
});
