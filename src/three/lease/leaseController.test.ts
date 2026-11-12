import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaseController } from './leaseController';
import { getLeaseSnapshot } from './leaseStore';

describe('B10 — LeaseController (allocation unique et sérialisée)', () => {
    let controller: LeaseController;

    beforeEach(() => {
        controller = new LeaseController(500); // timeout court pour les tests
        controller.reset();
    });

    it('accorde un token avec génération incrémentée à une demande isolée', async () => {
        const token = await controller.request('map', 'inst1');

        expect(token.surface).toBe('map');
        expect(token.instanceId).toBe('inst1');
        expect(token.generation).toBe(1);
        expect(controller.current()).toBe(token);
        expect(controller.status()).toBe('reserved');

        const releaseFn = vi.fn();
        controller.attach(token, releaseFn);
        expect(controller.status()).toBe('bound');

        await controller.release(token);
        expect(releaseFn).toHaveBeenCalledOnce();
        expect(controller.status()).toBe('idle');
        expect(controller.current()).toBeNull();
    });

    it('sérialise deux demandes simultanées : la seconde attend la libération de la première', async () => {
        const t1 = await controller.request('profile', 'p1');
        const release1 = vi.fn();
        controller.attach(t1, release1);

        let t2Granted = false;
        const p2 = controller.request('world', 'w1').then((token) => {
            t2Granted = true;
            return token;
        });

        // Tant que t1 n'est pas libéré, p2 attend
        await new Promise((r) => setTimeout(r, 50));
        expect(t2Granted).toBe(false);

        // Libération de t1 -> p2 est accordé
        await controller.release(t1);
        const t2 = await p2;

        expect(t2Granted).toBe(true);
        expect(t2.surface).toBe('world');
        expect(t2.generation).toBe(2);
        expect(controller.current()).toBe(t2);

        await controller.release(t2);
    });

    it('annule une demande en vol avant attribution sans bloquer la suivante', async () => {
        const t1 = await controller.request('map', 'm1');
        controller.attach(t1, vi.fn());

        // Demande annulée avant d'avoir le slot
        const p2 = controller.request('profile', 'p2');
        controller.cancel('profile', 'p2');

        const p3 = controller.request('world', 'w1');

        await controller.release(t1);

        // p2 a été rejeté car annulé
        await expect(p2).rejects.toThrow(/annulée/);

        // p3 obtient le slot
        const t3 = await p3;
        expect(t3.surface).toBe('world');
        await controller.release(t3);
    });

    it('nettoie immédiatement une ressource attachée sur un token périmé', async () => {
        const t1 = await controller.request('map', 'm1');
        await controller.release(t1);

        // Attachement tardif sur t1 alors que le slot est déjà libéré
        const orphanRelease = vi.fn();
        controller.attach(t1, orphanRelease);

        await new Promise((r) => setTimeout(r, 20));
        expect(orphanRelease).toHaveBeenCalledOnce();
    });

    it('bloque la lease si la libération expire ou échoue (pas de slot libre fantôme)', async () => {
        const t1 = await controller.request('profile', 'p1');
        // Fonction de libération qui ne termine jamais (dépasse le timeout de 500 ms)
        controller.attach(t1, () => new Promise(() => {}));

        const releasePromise = controller.release(t1);
        await expect(releasePromise).rejects.toThrow(/expirée/);

        expect(controller.status()).toBe('blocked');
        expect(getLeaseSnapshot().blockedReason).toContain('expirée');

        // Toute demande ultérieure est refusée immédiatement
        await expect(controller.request('map', 'm1')).rejects.toThrow(/bloquée/);
    });

    it('génère des tokens distincts pour deux instances de la même surface', async () => {
        const t1 = await controller.request('profile', 'instA');
        await controller.release(t1);

        const t2 = await controller.request('profile', 'instB');
        await controller.release(t2);

        expect(t1.instanceId).toBe('instA');
        expect(t2.instanceId).toBe('instB');
        expect(t1.generation).toBe(1);
        expect(t2.generation).toBe(2);
    });

    it('gère le cycle StrictMode (request -> cancel -> request) sans blocage', async () => {
        // Montage 1
        const p1 = controller.request('profile', 'strict1');
        // Démontage immédiat StrictMode
        controller.cancel('profile', 'strict1');

        // Remontage StrictMode avec nouvel ID d'instance
        const p2 = controller.request('profile', 'strict2');

        await expect(p1).rejects.toThrow(/annulée/);
        const t2 = await p2;
        expect(t2.instanceId).toBe('strict2');

        await controller.release(t2);
        expect(controller.status()).toBe('idle');
    });
});
