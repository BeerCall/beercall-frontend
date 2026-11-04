import { beforeEach, describe, expect, it, vi } from 'vitest';
import { globalLeaseController } from '../three/lease/leaseController';
import { getLeaseSnapshot, resetLeaseStore } from '../three/lease/leaseStore';

describe('B18 — AppWebglOwnership (règle : au plus 2 contextes WebGL simultanés)', () => {
    beforeEach(() => {
        globalLeaseController.reset();
        resetLeaseStore();
    });

    it('garantit au plus 2 propriétaires actifs sur 10 cycles de navigation consécutifs', async () => {
        const surfaces = ['map', 'profile', 'world', 'signup'] as const;

        for (let cycle = 1; cycle <= 10; cycle += 1) {
            const surface = surfaces[(cycle - 1) % surfaces.length];
            const instanceId = `inst_${surface}_${cycle}`;

            // 1. Demande d'allocation pour la surface courante
            const token = await globalLeaseController.request(surface, instanceId);

            // À tout instant, les tokens sont suivis dans la limite autorisée
            const snap = getLeaseSnapshot();
            expect(snap.tokens).toContain(token);
            expect(token.surface).toBe(surface);

            // 2. Attachement de la ressource
            const releaseSpy = vi.fn();
            globalLeaseController.attach(token, releaseSpy);
            expect(getLeaseSnapshot().phase).toBe('bound');

            // 3. Libération de la ressource avant le cycle suivant
            await globalLeaseController.release(token);
            expect(releaseSpy).toHaveBeenCalledOnce();
            expect(getLeaseSnapshot().phase).toBe('idle');
            expect(getLeaseSnapshot().tokens).toHaveLength(0);
        }
    });

    it('maintient la limite stricte de 2 contextes simultanés (carte + three.js)', async () => {
        vi.stubEnv('VITE_FF_GLB_AVATAR', '0');
        vi.stubEnv('VITE_FF_GLB_WORLDS', '0');

        // Slot 1 : Requête Map
        const mapToken = await globalLeaseController.request('map', 'map_fbx');
        globalLeaseController.attach(mapToken, vi.fn());
        expect(globalLeaseController.tokens().some((t) => t.surface === 'map')).toBe(true);

        // Slot 2 : Requête Profil accordée en parallèle sans blocage
        const profileToken = await globalLeaseController.request('profile', 'prof_fbx');
        globalLeaseController.attach(profileToken, vi.fn());
        expect(globalLeaseController.tokens()).toHaveLength(2);

        // Slot 3 en attente (capacité 2 atteinte : world attend qu'un slot se libère)
        let worldGranted = false;
        const worldReq = globalLeaseController.request('world', 'world_fbx').then((t) => {
            worldGranted = true;
            return t;
        });

        // Tant que ni Map ni Profil n'a libéré, World attend
        await new Promise((r) => setTimeout(r, 20));
        expect(worldGranted).toBe(false);

        // Libération de Profil -> World obtient le slot 2
        await globalLeaseController.release(profileToken);
        const worldToken = await worldReq;
        expect(worldGranted).toBe(true);
        expect(worldToken.surface).toBe('world');

        // Nettoyage final
        await globalLeaseController.release(worldToken);
        await globalLeaseController.release(mapToken);
        expect(globalLeaseController.status()).toBe('idle');
    });
});
