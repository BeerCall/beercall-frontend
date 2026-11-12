import { beforeEach, describe, expect, it, vi } from 'vitest';
import { globalLeaseController } from '../three/lease/leaseController';
import { getLeaseSnapshot, resetLeaseStore } from '../three/lease/leaseStore';

describe('P0 — Lease mono-slot trois.js (la carte est hors lease)', () => {
    beforeEach(() => {
        globalLeaseController.reset();
        resetLeaseStore();
    });

    it('garantit au plus un propriétaire three.js sur 10 cycles consécutifs', async () => {
        const surfaces = ['profile', 'world', 'signup'] as const;

        for (let cycle = 1; cycle <= 10; cycle += 1) {
            const surface = surfaces[(cycle - 1) % surfaces.length];
            const instanceId = `inst_${surface}_${cycle}`;

            const token = await globalLeaseController.request(surface, instanceId);
            const snap = getLeaseSnapshot();
            expect(snap.tokens).toContain(token);
            expect(snap.tokens).toHaveLength(1);
            expect(token.surface).toBe(surface);

            const releaseSpy = vi.fn();
            globalLeaseController.attach(token, releaseSpy);
            expect(getLeaseSnapshot().phase).toBe('bound');

            await globalLeaseController.release(token);
            expect(releaseSpy).toHaveBeenCalledOnce();
            expect(getLeaseSnapshot().phase).toBe('idle');
            expect(getLeaseSnapshot().tokens).toHaveLength(0);
        }
    });

    it('sérialise Profil et Monde : le second attend la libération du premier', async () => {
        const profileToken = await globalLeaseController.request('profile', 'prof');
        globalLeaseController.attach(profileToken, vi.fn());
        expect(globalLeaseController.tokens()).toHaveLength(1);

        let worldGranted = false;
        const worldReq = globalLeaseController.request('world', 'world').then((token) => {
            worldGranted = true;
            return token;
        });

        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(worldGranted).toBe(false);

        await globalLeaseController.release(profileToken);
        const worldToken = await worldReq;
        expect(worldGranted).toBe(true);
        expect(worldToken.surface).toBe('world');

        await globalLeaseController.release(worldToken);
        expect(globalLeaseController.status()).toBe('idle');
    });
});
