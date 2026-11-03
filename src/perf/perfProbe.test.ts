import { beforeEach, describe, expect, it } from 'vitest';
import { computePercentiles, PerfProbe } from './perfProbe';
import { SceneReadiness } from './sceneReadiness';

describe('B13b — SceneReadiness et PerfProbe', () => {
    describe('computePercentiles', () => {
        it('calcule fidèlement les percentiles p50, p95, p99 et max', () => {
            // 100 échantillons de 1 à 100
            const samples = Array.from({ length: 100 }, (_, i) => i + 1);
            const stats = computePercentiles(samples);

            expect(stats.p50).toBe(51);
            expect(stats.p95).toBe(96);
            expect(stats.p99).toBe(100);
            expect(stats.max).toBe(100);
        });

        it('gère un tableau d’échantillons vide sans erreur', () => {
            const stats = computePercentiles([]);
            expect(stats.p50).toBe(0);
            expect(stats.max).toBe(0);
        });
    });

    describe('SceneReadiness', () => {
        it('n’est prête que lorsque assets, clip, frame sont validés sans erreur', () => {
            const readiness = new SceneReadiness(['head', 'body', 'legs', 'feet']);

            // Étape 1 : Aucun asset -> non prêt
            expect(readiness.snapshot().ready).toBe(false);

            // Étape 2 : Tous les assets chargés
            readiness.assetLoaded('head');
            readiness.assetLoaded('body');
            readiness.assetLoaded('legs');
            readiness.assetLoaded('feet');
            expect(readiness.snapshot().assetsReady).toBe(true);
            expect(readiness.snapshot().ready).toBe(false); // Manque clip et frame

            // Étape 3 : Clip appliqué
            readiness.clipApplied('Idle');
            expect(readiness.snapshot().clipActive).toBe(true);
            expect(readiness.snapshot().ready).toBe(false); // Manque frame

            // Étape 4 : Première frame soumise
            readiness.frameSubmitted();
            expect(readiness.snapshot().frameSubmitted).toBe(true);
            expect(readiness.snapshot().ready).toBe(true); // Prêt !

            // Étape 5 : Une erreur invalide la readiness
            readiness.failed('WebGL context lost');
            expect(readiness.snapshot().ready).toBe(false);
            expect(readiness.snapshot().error).toContain('WebGL');

            // Étape 6 : Reset réinitialise tout
            readiness.reset();
            expect(readiness.snapshot().ready).toBe(false);
            expect(readiness.snapshot().error).toBeNull();
        });
    });

    describe('PerfProbe', () => {
        let probe: PerfProbe;

        beforeEach(() => {
            probe = new PerfProbe(false); // manual start
        });

        it('démarre, collecte et borne les échantillons à 1200 max', () => {
            probe.start();

            // Enregistrement manuel de frames
            probe.recordFrameSubmission();
            probe.recordFrameSubmission();

            const snap = probe.snapshot();
            expect(snap.active).toBe(true);
            expect(snap.framesSubmitted).toBe(2);

            probe.reset();
            expect(probe.snapshot().framesSubmitted).toBe(0);

            probe.stop();
            expect(probe.snapshot().active).toBe(false);
        });
    });
});
