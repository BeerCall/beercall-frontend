import { useEffect, useMemo, useRef, useState } from 'react';
import { useGlbManifest } from '../avatar/glb/useGlbManifest';
import { whenPreloadIdle } from '../lib/preloadSchedule';
import {
    buildWorldPreloadPlan,
    preloadWorldAsset,
    toMegabytes,
    type WorldPreloadPlan,
} from '../lib/worldPreload';
import { reportWorldPreloadDone, reportWorldPreloadStart } from '../lib/worldPreloadState';

/**
 * 8h-3 — Préchargement au repos des GLB réellement montés par WorldScene.
 *
 * - 3 décors GLB + les pièces d'avatar head/body/legs/feet (accessoires exclus).
 * - Un fichier à la fois, uniquement dans une fenêtre de repos du tableau de
 *   bord : `whenPreloadIdle` écarte les interactions récentes, y compris sur
 *   Safari iOS qui n'a pas `requestIdleCallback`.
 * - Le cache `loadGlb` est partagé avec WorldScene/RealAvatar : un monde ouvert
 *   avant la fin réutilise les promesses en cours, sans second téléchargement.
 * - Tout échec est journalisé via `console.error` puis le fichier suivant est
 *   préparé ; aucun échec n'est avalé.
 */
function WorldPreloadQueue({plan}: {plan: WorldPreloadPlan}) {
    const [index, setIndex] = useState(0);
    const startedAt = useRef<number | null>(null);
    const failures = useRef<string[]>([]);
    const finishedLogged = useRef(false);

    useEffect(() => {
        if (index < plan.items.length || finishedLogged.current) return;
        finishedLogged.current = true;
        const elapsedMs = Math.round(performance.now() - (startedAt.current ?? performance.now()));
        reportWorldPreloadDone(plan.items.length, failures.current.length, elapsedMs);
        console.info('[world] préchargement terminé', {
            files: plan.items.length,
            megabytes: toMegabytes(plan.bytes),
            failures: failures.current.length,
            elapsedMs,
        });
    }, [index, plan]);

    useEffect(() => {
        if (index >= plan.items.length) return;
        const item = plan.items[index];
        let cancelled = false;
        const cancelIdle = whenPreloadIdle(() => {
            if (startedAt.current === null) startedAt.current = performance.now();
            preloadWorldAsset(item)
                .then(() => {
                    if (cancelled) return;
                    performance.mark(`beercall:world-preload:${item.key}`);
                    setIndex(current => current + 1);
                })
                .catch((error: unknown) => {
                    if (cancelled) return;
                    failures.current.push(item.url);
                    console.error(`[world] préchargement échoué : ${item.url}`, error);
                    setIndex(current => current + 1);
                });
        });

        return () => {
            cancelled = true;
            cancelIdle();
        };
    }, [plan, index]);

    return null;
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
        reportWorldPreloadStart(plan.items.length);
        console.info('[world] préchargement démarré', {
            files: plan.items.length,
            decors: plan.decorCount,
            avatarParts: plan.avatarCount,
            megabytes: toMegabytes(plan.bytes),
        });
    }, [plan]);

    useEffect(() => {
        if (!manifest.isError || !manifest.error) return;
        console.error('[world] préchargement : manifeste GLB indisponible', manifest.error);
    }, [manifest.isError, manifest.error]);

    if (!plan) return null;
    return <WorldPreloadQueue key={`${plan.items.length}:${plan.items[0]?.url ?? ''}`} plan={plan}/>;
}
