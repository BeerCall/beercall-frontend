import { useEffect, useMemo, useRef, useState } from 'react';
import { useGlbManifest } from '../avatar/glb/useGlbManifest';
import { whenPreloadIdle } from '../lib/preloadSchedule';
import {
    buildWorldPreloadPlan,
    preloadWorldAsset,
    toMegabytes,
    type WorldPreloadPlan,
} from '../lib/worldPreload';
import {
    getWorldPreloadStatus,
    reportWorldPreloadDone,
    reportWorldPreloadStart,
} from '../lib/worldPreloadState';

/**
 * 8h-4b-3 — Préchargement GLB parallèle au repos.
 *
 * - 3 fichiers en vol au maximum ; aucun nouveau départ pendant une interaction
 *   (l'ordonnanceur `whenPreloadIdle` attend une fenêtre calme).
 * - Une signature de plan évite de repasser « non terminé » lorsqu'une requête
 *   de manifeste est simplement rafraîchie.
 * - Chaque échec est journalisé ; le plan se termine quand même et le compte
 *   d'échecs reste visible.
 */
export const WORLD_PRELOAD_CONCURRENCY = 3;

function WorldPreloadQueue({plan}: {plan: WorldPreloadPlan}) {
    const existingStatus = getWorldPreloadStatus();
    const alreadyDone = existingStatus.done && existingStatus.signature === plan.signature;
    const [completed, setCompleted] = useState(alreadyDone ? plan.items.length : 0);
    const [failures, setFailures] = useState(alreadyDone ? existingStatus.failures : 0);
    const startedAt = useRef<number | null>(null);
    const nextIndex = useRef(0);
    const inFlight = useRef(0);
    const failuresList = useRef<string[]>([]);
    const cancelled = useRef(false);
    const finished = useRef(false);
    const cancelIdle = useRef<(() => void) | null>(null);

    useEffect(() => {
        const existing = getWorldPreloadStatus();
        if (existing.done && existing.signature === plan.signature) {
            finished.current = true;
            return;
        }

        cancelled.current = false;
        finished.current = false;
        nextIndex.current = 0;
        inFlight.current = 0;
        failuresList.current = [];
        startedAt.current = null;

        const finish = () => {
            if (finished.current) return;
            finished.current = true;
            const elapsedMs = Math.round(performance.now() - (startedAt.current ?? performance.now()));
            reportWorldPreloadDone(
                plan.items.length,
                failuresList.current.length,
                elapsedMs,
                plan.signature,
            );
            console.info('[world] préchargement terminé', {
                files: plan.items.length,
                megabytes: toMegabytes(plan.bytes),
                failures: failuresList.current.length,
                elapsedMs,
                concurrency: WORLD_PRELOAD_CONCURRENCY,
            });
        };

        const schedule = () => {
            if (cancelled.current || finished.current) return;
            cancelIdle.current?.();
            cancelIdle.current = whenPreloadIdle(pump);
        };

        const pump = () => {
            if (cancelled.current || finished.current) return;
            if (startedAt.current === null) startedAt.current = performance.now();
            while (inFlight.current < WORLD_PRELOAD_CONCURRENCY && nextIndex.current < plan.items.length) {
                const item = plan.items[nextIndex.current];
                nextIndex.current += 1;
                inFlight.current += 1;
                preloadWorldAsset(item)
                    .then(() => {
                        if (cancelled.current) return;
                        performance.mark(`beercall:world-preload:${item.key}`);
                    })
                    .catch((error: unknown) => {
                        if (cancelled.current) return;
                        failuresList.current.push(item.url);
                        console.error(`[world] préchargement échoué : ${item.url}`, error);
                    })
                    .finally(() => {
                        if (cancelled.current) return;
                        inFlight.current -= 1;
                        setCompleted((current) => current + 1);
                        setFailures(failuresList.current.length);
                        if (nextIndex.current >= plan.items.length && inFlight.current === 0) {
                            finish();
                        } else {
                            schedule();
                        }
                    });
            }
            if (nextIndex.current >= plan.items.length && inFlight.current === 0) {
                finish();
            }
        };

        schedule();

        return () => {
            cancelled.current = true;
            cancelIdle.current?.();
            cancelIdle.current = null;
        };
    }, [plan]);

    return (
        <p className="sr-only" data-testid="world-preload-progress">
            Préchargement : {completed}/{plan.items.length} fichiers, {failures} échec(s).
        </p>
    );
}

export default function WorldResourcePreparation() {
    const manifest = useGlbManifest();
    const plan = useMemo(() => {
        if (!manifest.data) return null;
        try {
            return buildWorldPreloadPlan(manifest.data);
        } catch (error) {
            console.error('[world] préchargement impossible', error);
            return null;
        }
    }, [manifest.data]);

    useEffect(() => {
        if (!plan) return;
        reportWorldPreloadStart(plan.items.length, plan.signature);
        console.info('[world] préchargement démarré', {
            files: plan.items.length,
            decors: plan.decorCount,
            avatarParts: plan.avatarCount,
            megabytes: toMegabytes(plan.bytes),
            concurrency: WORLD_PRELOAD_CONCURRENCY,
        });
    }, [plan]);

    useEffect(() => {
        if (!manifest.isError || !manifest.error) return;
        console.error('[world] préchargement : manifeste GLB indisponible', manifest.error);
    }, [manifest.isError, manifest.error]);

    if (!plan) return null;
    return <WorldPreloadQueue key={plan.signature} plan={plan}/>;
}
