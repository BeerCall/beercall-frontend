import { beforeEach, describe, expect, it, vi } from 'vitest';
import { globalLeaseController } from '../three/lease/leaseController';
import { getLeaseSnapshot, resetLeaseStore } from '../three/lease/leaseStore';

describe('B18 — AppWebglOwnership (règle stricte : 0 ou 1 propriétaire WebGL)', () => {
    beforeEach(() => {
        globalLeaseController.reset();
        resetLeaseStore();
    });

    it('garantit au plus un propriétaire actif sur 10 cycles de navigation consécutifs', async () => {
        const surfaces = ['map', 'profile', 'world', 'signup'] as const;

        for (let cycle = 1; cycle <= 10; cycle += 1) {
            const surface = surfaces[(cycle - 1) % surfaces.length];
            const instanceId = `inst_${surface}_${cycle}`;

            // 1. Demande d'allocation pour la surface courante
            const token = await globalLeaseController.request(surface, instanceId);

            // À tout instant, au plus 1 propriétaire est actif
            const snap = getLeaseSnapshot();
            expect(snap.currentToken).toBe(token);
            expect(snap.currentToken?.surface).toBe(surface);
            expect(snap.phase).toBe('reserved');

            // 2. Attachement de la ressource
            const releaseSpy = vi.fn();
            globalLeaseController.attach(token, releaseSpy);
            expect(getLeaseSnapshot().phase).toBe('bound');

            // 3. Libération de la ressource avant le cycle suivant
            await globalLeaseController.release(token);
            expect(releaseSpy).toHaveBeenCalledOnce();
            expect(getLeaseSnapshot().phase).toBe('idle');
            expect(getLeaseSnapshot().currentToken).toBeNull();
        }
    });

    it('maintient l’unicité stricte du propriétaire même avec les flags modèles désactivés (flagon/off)', async () => {
        vi.stubEnv('VITE_FF_GLB_AVATAR', '0');
        vi.stubEnv('VITE_FF_GLB_WORLDS', '0');

        // Requête Map
        const mapToken = await globalLeaseController.request('map', 'map_fbx');
        globalLeaseController.attach(mapToken, vi.fn());
        expect(globalLeaseController.current()?.surface).toBe('map');

        // Requête Profil en attente
        let profileGranted = false;
        const profileReq = globalLeaseController.request('profile', 'prof_fbx').then((t) => {
            profileGranted = true;
            return t;
        });

        // Tant que Map n'a pas libéré, Profil attend
        await new Promise((r) => setTimeout(r, 20));
        expect(profileGranted).toBe(false);

        await globalLeaseController.release(mapToken);
        const profileToken = await profileReq;
        expect(profileGranted).toBe(true);
        expect(profileToken.surface).toBe('profile');

        await globalLeaseController.release(profileToken);
        expect(globalLeaseController.status()).toBe('idle');
    });
});
