import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRendererServer } from './server.mjs';

const TEST_PORT = 5195;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe('A17 — Serveur HTTP du renderer (contrôles d’erreurs et limites)', () => {
    let serverInstance = null;

    before(async () => {
        serverInstance = createRendererServer({ port: TEST_PORT, host: '127.0.0.1' });
        await serverInstance.start();
    });

    after(async () => {
        if (serverInstance) {
            await serverInstance.stop();
        }
    });

    it('retourne 200 sur /healthz lorsque le renderer est prêt', async () => {
        const res = await fetch(`${BASE_URL}/healthz`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.ready, true);
    });

    it('rejette les payloads de taille supérieure à 64 Ko avec HTTP 413', async () => {
        const largeString = 'a'.repeat(70 * 1024);
        const res = await fetch(`${BASE_URL}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ large: largeString }),
        });
        assert.equal(res.status, 413);
    });

    it('rejette les requêtes avec un hash invalide avec HTTP 422', async () => {
        const res = await fetch(`${BASE_URL}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hash: 'not-16-hex',
                config: { head: 'Men_head_Casual_0' },
            }),
        });
        assert.equal(res.status, 422);
        const data = await res.json();
        assert.ok(data.detail.includes('hash'));
    });

    it('rejette les configurations incomplètes ou invalides avec HTTP 422', async () => {
        const res = await fetch(`${BASE_URL}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hash: '0123456789abcdef',
                config: {
                    head: 'Men_head_Casual_0',
                },
            }),
        });
        assert.equal(res.status, 422);
    });

    it('interdit l’évasion de répertoire et le path traversal sur les statiques (HTTP 404)', async () => {
        const res1 = await fetch(`${BASE_URL}/models/../../package.json`);
        assert.equal(res1.status, 404);

        const res2 = await fetch(`${BASE_URL}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`);
        assert.equal(res2.status, 404);
    });
});
