/**
 * 8h-4b-1 — Panneau de parcours (build de recette uniquement).
 *
 * 10 cycles Bar → Piscine → Dodo. Chaque transition est mesurée du
 * `pointerdown` sur l'onglet jusqu'à ce que la scène, tous les avatars et tous
 * les libellés (pseudos, photos, bulles) soient présents.
 *
 * Le panneau ne modifie aucun rendu : il n'existe que si
 * `VITE_WORLD_PROBE=1` et n'ajoute qu'une surcouche DOM.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Play, Square, X } from 'lucide-react';
import type { WorldDetails } from '../types/api';
import type { WorldKind } from '../worlds/pocWorldScenario';
import { webglStats } from '../three/lease/webgl';
import { getWorldPreloadStatus, type WorldPreloadStatus } from '../lib/worldPreloadState';
import { WORLD_PROBE_BUILD_TIME, WORLD_PROBE_COMMIT } from './worldProbeGate';
import {
    getPreparationSnapshot,
    grantAllPreparationAvatars,
} from '../worlds/worldPreparation';
import { getAppStartedAt, getFirstOpenHistory } from '../worlds/firstOpenMeasurement';
import {
    countWorldLabels,
    describeLabels,
    expectedLabels,
    formatMs,
    labelsSatisfied,
    labelsTotal,
    summarize,
    summarizeByWorld,
    type LabelCounts,
    type ProbeSample,
} from './worldProbeMetrics';

const CYCLES = 10;
const SEQUENCE: WorldKind[] = ['piscine', 'dodo', 'bar'];
const TRANSITION_TIMEOUT_MS = 30_000;
const INITIAL_TIMEOUT_MS = 60_000;

function nextSettledFrame(): Promise<void> {
    return new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
        });
    });
}

type RunStatus = 'idle' | 'running' | 'done' | 'error' | 'stopped';

interface PendingTransition {
    to: WorldKind;
    expected: LabelCounts;
    sceneReady: boolean;
    startedAt: number;
}

class ProbeCancelled extends Error {}

export interface WorldProbePanelProps {
    worlds?: Record<string, WorldDetails>;
    sceneReady: { world: WorldKind | null; tick: number };
    readyWorlds: Partial<Record<WorldKind, boolean>>;
}

function WorldProbePanelComponent({ worlds, sceneReady, readyWorlds }: WorldProbePanelProps) {
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState<RunStatus>('idle');
    const [runCount, setRunCount] = useState(0);
    const [samples, setSamples] = useState<ProbeSample[]>([]);
    const [warmup, setWarmup] = useState<ProbeSample[]>([]);
    const [progress, setProgress] = useState<{ cycle: number; transition: number; world: WorldKind | null }>({
        cycle: 0,
        transition: 0,
        world: null,
    });
    const [message, setMessage] = useState<string | null>(null);
    const [preload, setPreload] = useState<WorldPreloadStatus>(getWorldPreloadStatus);
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

    const pendingRef = useRef<PendingTransition | null>(null);
    const cancelledRef = useRef(false);
    const runningRef = useRef(false);
    const mountedRef = useRef(true);
    const worldsRef = useRef(worlds);
    const readyWorldsRef = useRef(readyWorlds);

    useEffect(() => {
        worldsRef.current = worlds;
        readyWorldsRef.current = readyWorlds;
    }, [worlds, readyWorlds]);

    useEffect(() => {
        const pending = pendingRef.current;
        if (pending && sceneReady.world === pending.to) {
            pending.sceneReady = true;
        }
    }, [sceneReady]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            cancelledRef.current = true;
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        const refresh = () => setPreload(getWorldPreloadStatus());
        refresh();
        const id = window.setInterval(refresh, 500);
        return () => window.clearInterval(id);
    }, [open]);

    const waitForTransition = useCallback((
        pending: PendingTransition,
        timeoutMs: number,
        requireScene: boolean,
    ): Promise<LabelCounts> => new Promise<LabelCounts>((resolve, reject) => {
        const tick = () => {
            if (cancelledRef.current || !mountedRef.current) {
                reject(new ProbeCancelled('Parcours arrêté'));
                return;
            }
            const counts = countWorldLabels();
            if ((!requireScene || pending.sceneReady) && labelsSatisfied(counts, pending.expected)) {
                resolve(counts);
                return;
            }
            const elapsed = performance.now() - pending.startedAt;
            if (elapsed > timeoutMs) {
                reject(new Error(
                    `Monde ${pending.to} non prêt après ${Math.round(timeoutMs / 1000)} s : ` +
                    `scène ${pending.sceneReady ? 'prête' : 'non prête'}, ` +
                    `libellés ${describeLabels(counts)} (attendu ${describeLabels(pending.expected)}).`,
                ));
                return;
            }
            window.requestAnimationFrame(tick);
        };
        window.requestAnimationFrame(tick);
    }), []);

    const clickTab = useCallback((world: WorldKind): number => {
        const button = document.querySelector<HTMLButtonElement>(`[data-world-tab="${world}"]`);
        if (!button) throw new Error(`Onglet ${world} introuvable dans la modale.`);
        if (typeof PointerEvent !== 'function') throw new Error('PointerEvent indisponible dans ce navigateur.');
        const startedAt = performance.now();
        button.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerType: 'touch',
            isPrimary: true,
        }));
        button.click();
        return startedAt;
    }, []);

    const settleOnBar = useCallback(async (): Promise<void> => {
        const participants = worldsRef.current?.bar?.participants ?? [];
        const pending: PendingTransition = {
            to: 'bar',
            expected: expectedLabels('bar', participants),
            sceneReady: false,
            startedAt: performance.now(),
        };
        pendingRef.current = pending;
        try {
            pending.startedAt = clickTab('bar');
            // Premier Bar non mesuré : les libellés suffisent à prouver que la
            // scène et les avatars sont déjà rendus.
            await waitForTransition(pending, INITIAL_TIMEOUT_MS, false);
        } finally {
            pendingRef.current = null;
        }
    }, [clickTab, waitForTransition]);

    /**
     * Prépare les trois couches avant la première mesure. La construction des
     * avatars n'est pas une transition d'onglet : la mesurer fausserait le
     * parcours. Les trois scènes doivent être prêtes, puis on démarre.
     */
    const waitForAllLayersReady = useCallback((): Promise<void> => new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + INITIAL_TIMEOUT_MS;
        const tick = () => {
            if (cancelledRef.current || !mountedRef.current) {
                reject(new ProbeCancelled('Parcours arrêté'));
                return;
            }
            const ready = readyWorldsRef.current;
            if (ready.bar && ready.piscine && ready.dodo) {
                resolve();
                return;
            }
            if (performance.now() > deadline) {
                reject(new Error(
                    `Les 3 scènes ne sont pas prêtes après ${Math.round(INITIAL_TIMEOUT_MS / 1000)} s ` +
                    `(bar=${ready.bar ? 'oui' : 'non'}, piscine=${ready.piscine ? 'oui' : 'non'}, ` +
                    `dodo=${ready.dodo ? 'oui' : 'non'}).`,
                ));
                return;
            }
            window.requestAnimationFrame(tick);
        };
        tick();
    }), []);

    const runTransition = useCallback(async (
        from: WorldKind,
        to: WorldKind,
        cycle: number,
    ): Promise<ProbeSample> => {
        const participants = worldsRef.current?.[to]?.participants ?? [];
        const pending: PendingTransition = {
            to,
            expected: expectedLabels(to, participants),
            sceneReady: Boolean(readyWorldsRef.current[to]),
            startedAt: 0,
        };
        pendingRef.current = pending;
        try {
            const startFrame = window.__beercallWorldFrame ?? 0;
            pending.startedAt = clickTab(to);
            const labels = await waitForTransition(pending, TRANSITION_TIMEOUT_MS, true);
            // La fin n'est valide que si le Canvas a rendu au moins une image
            // depuis le toucher : les libellés DOM seuls ne prouvent pas l'affichage.
            const frameDeadline = performance.now() + 1_000;
            while ((window.__beercallWorldFrame ?? 0) <= startFrame && performance.now() < frameDeadline) {
                await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
            }
            const ms = Math.round((performance.now() - pending.startedAt) * 10) / 10;
            const frames = Math.max(0, (window.__beercallWorldFrame ?? 0) - startFrame);
            return { cycle, from, to, ms, frames, labels, expected: pending.expected };
        } finally {
            pendingRef.current = null;
        }
    }, [clickTab, waitForTransition]);

    /**
     * Premier affichage de chaque couche, non mesuré dans les 30 transitions.
     * Il paie la compilation GPU et le premier montage des libellés ; 4b-4
     * déplacera ce coût au repos. Les durées sont affichées à part.
     */
    const warmUpAllLayers = useCallback(async (): Promise<ProbeSample[]> => {
        let from: WorldKind = 'bar';
        const collected: ProbeSample[] = [];
        for (const to of SEQUENCE) {
            if (cancelledRef.current) throw new ProbeCancelled('Parcours arrêté');
            setProgress({ cycle: 0, transition: 0, world: to });
            const sample = await runTransition(from, to, 0);
            collected.push(sample);
            from = to;
        }
        return collected;
    }, [runTransition]);

    const start = useCallback(async () => {
        if (runningRef.current) return;
        if (!getWorldPreloadStatus().done) {
            setMessage('Préchargement non terminé : ferme la modale, laisse le squad au repos, puis rouvre-la.');
            return;
        }
        runningRef.current = true;
        cancelledRef.current = false;
        setRunCount((count) => count + 1);
        setStatus('running');
        setSamples([]);
        setWarmup([]);
        setMessage(null);
        setCopyState('idle');
        setProgress({ cycle: 0, transition: 0, world: null });

        try {
            grantAllPreparationAvatars('bar');
            grantAllPreparationAvatars('piscine');
            grantAllPreparationAvatars('dodo');
            await waitForAllLayersReady();
            const warm = await warmUpAllLayers();
            if (mountedRef.current) setWarmup(warm);
            await settleOnBar();
            setProgress({ cycle: 1, transition: 0, world: null });
            await nextSettledFrame();
            let from: WorldKind = 'bar';
            const collected: ProbeSample[] = [];
            for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
                for (const to of SEQUENCE) {
                    if (cancelledRef.current) throw new ProbeCancelled('Parcours arrêté');
                    const sample = await runTransition(from, to, cycle);
                    collected.push(sample);
                    setSamples([...collected]);
                    setProgress({ cycle, transition: collected.length, world: to });
                    from = to;
                    // Laisse le panneau se rendre et se peindre hors de la mesure suivante.
                    await nextSettledFrame();
                }
            }
            if (mountedRef.current) {
                setStatus('done');
                setProgress({ cycle: CYCLES, transition: collected.length, world: null });
            }
        } catch (error) {
            if (error instanceof ProbeCancelled) {
                if (mountedRef.current) setStatus('stopped');
            } else {
                console.error('[world-probe] parcours échoué', error);
                if (mountedRef.current) {
                    setStatus('error');
                    setMessage(error instanceof Error ? error.message : String(error));
                }
            }
        } finally {
            runningRef.current = false;
            pendingRef.current = null;
        }
    }, [runTransition, settleOnBar, waitForAllLayersReady, warmUpAllLayers]);

    const stop = useCallback(() => {
        cancelledRef.current = true;
    }, []);

    const stats = summarize(samples.map((sample) => sample.ms));
    const byWorld = summarizeByWorld(samples);
    const lastSample = samples[samples.length - 1];
    const preparation = getPreparationSnapshot();
    const firstOpens = getFirstOpenHistory();
    const appStartedAt = getAppStartedAt();
    const lastByWorld = (['bar', 'piscine', 'dodo'] as WorldKind[]).reduce((result, world) => {
        result[world] = [...samples].reverse().find((sample) => sample.to === world);
        return result;
    }, {} as Record<WorldKind, ProbeSample | undefined>);
    const reference = (['bar', 'piscine', 'dodo'] as WorldKind[]).map((world) => ({
        world,
        expected: expectedLabels(world, worlds?.[world]?.participants ?? []),
    }));
    const emptyWorlds = reference.filter((entry) => labelsTotal(entry.expected) === 0);
    const gl = webglStats();
    const report = {
        version: {
            commit: WORLD_PROBE_COMMIT,
            buildTime: WORLD_PROBE_BUILD_TIME,
            probeEnabled: true,
        },
        run: runCount,
        preload: getWorldPreloadStatus(),
        preparation,
        firstOpens,
        appStartedAt,
        webgl: gl,
        warmup,
        status,
        stats,
        byWorld,
        samples,
    };
    const json = JSON.stringify(report, null, 2);

    const copyJson = async () => {
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Presse-papiers indisponible');
            await navigator.clipboard.writeText(json);
            setCopyState('copied');
        } catch (error) {
            console.warn('[world-probe] copie du JSON impossible', error);
            setCopyState('failed');
        }
    };

    const statusText = status === 'running'
        ? progress.cycle === 0
            ? 'Préparation des 3 mondes…'
            : `En cours — cycle ${Math.max(1, progress.cycle)}/${CYCLES}, transition ${progress.transition}/${CYCLES * SEQUENCE.length}` +
              (progress.world ? ` (${progress.world})` : '')
        : status === 'done'
            ? `Terminé — ${samples.length} mesures`
            : status === 'error'
                ? 'Erreur — voir le détail ci-dessous'
                : status === 'stopped'
                    ? `Arrêté — ${samples.length} mesures`
                    : 'En attente';

    if (!open) {
        return (
            <button
                type="button"
                data-testid="world-probe-toggle"
                onClick={() => setOpen(true)}
                className="absolute bottom-4 right-4 z-[130] rounded-full bg-black/80 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-xl backdrop-blur"
            >
                Probe
            </button>
        );
    }

    const versionMissing = WORLD_PROBE_COMMIT === 'inconnu' || WORLD_PROBE_BUILD_TIME === 'inconnu';

    return (
        <div
            data-testid="world-probe-panel"
            className="absolute inset-x-2 bottom-2 top-16 z-[130] flex flex-col overflow-hidden rounded-3xl border border-white/20 bg-black/90 text-white shadow-2xl backdrop-blur-md"
        >
            <div className="flex items-center justify-between border-b border-white/15 px-4 py-3">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">Parcours des mondes</p>
                    <p className="text-[11px] text-white/70">
                        10 cycles Bar → Piscine → Dodo
                        {runCount > 0 && <span data-testid="world-probe-run-count"> · passage #{runCount}</span>}
                    </p>
                </div>
                <button
                    type="button"
                    aria-label="Fermer le panneau de parcours"
                    onClick={() => setOpen(false)}
                    className="rounded-full bg-white/10 p-2 text-white/80"
                >
                    <X size={16}/>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 text-xs">
                <div className="rounded-xl bg-white/5 p-3">
                    <p data-testid="world-probe-version" className="font-mono text-[11px] text-white/90">
                        Version front : <strong>{WORLD_PROBE_COMMIT}</strong>
                    </p>
                    <p data-testid="world-probe-build" className="mt-1 font-mono text-[11px] text-white/60">
                        Build : {WORLD_PROBE_BUILD_TIME}
                    </p>
                    {versionMissing && (
                        <p className="mt-2 text-[11px] font-bold text-amber-300">
                            Métadonnées de build absentes : ce n'est pas un build de recette complet.
                        </p>
                    )}
                </div>

                <div data-testid="world-probe-preload" className="mt-3 rounded-xl bg-white/5 p-3">
                    <p className="font-bold">
                        Préchargement terminé : <span className={preload.done ? 'text-emerald-400' : 'text-amber-300'}>
                            {preload.done ? 'oui' : 'non'}
                        </span>
                    </p>
                    <p className="mt-1 text-[11px] text-white/60">
                        {!preload.started
                            ? 'Pas encore démarré sur le tableau de bord.'
                            : preload.done
                                ? `${preload.files} fichier(s), ${preload.failures} échec(s), ${formatMs(preload.elapsedMs)}`
                                : `${preload.files} fichier(s) en cours…`}
                    </p>
                </div>

                <div data-testid="world-probe-reference" className="mt-3 rounded-xl bg-white/5 p-3">
                    <p className="text-[9px] uppercase tracking-widest text-white/50">Référence de cet apéro</p>
                    {reference.map(({ world, expected }) => (
                        <p key={world} className="mt-1 text-[11px] text-white/80">
                            <span className="font-bold capitalize">{world}</span> : {describeLabels(expected)}
                        </p>
                    ))}
                    {emptyWorlds.length > 0 && (
                        <p data-testid="world-probe-reference-warning"
                           className="mt-2 rounded-lg bg-amber-500/15 p-2 text-[11px] font-bold leading-relaxed text-amber-200">
                            Référence incomplète : {emptyWorlds.map((entry) => entry.world).join(', ')} sans
                            libellé. Ce monde sera mesuré vide ; les critères attendus ne sont pas réunis
                            sur cet apéro.
                        </p>
                    )}
                </div>

                <div data-testid="world-preparation" className="mt-3 rounded-xl bg-white/5 p-3">
                    <p className="font-bold">
                        Préparation terminée : <span className={preparation.phase === 'done' ? 'text-emerald-400' : 'text-amber-300'}>
                            {preparation.phase === 'done' ? 'oui' : 'non'}
                        </span>
                    </p>
                    <p className="mt-1 text-[11px] text-white/60">
                        Phase : {preparation.phase} · avatars{' '}
                        {(['bar', 'piscine', 'dodo'] as WorldKind[]).reduce((total, world) => total + preparation.worlds[world].granted, 0)}
                        /{(['bar', 'piscine', 'dodo'] as WorldKind[]).reduce((total, world) => total + preparation.worlds[world].total, 0)}
                        {' '}· rendus {(['bar', 'piscine', 'dodo'] as WorldKind[]).filter((world) => preparation.worlds[world].frame).length}/3
                        {' '}· libellés {preparation.labelsReady ? 'oui' : 'non'}
                    </p>
                    {preparation.doneAt !== null && (
                        <p data-testid="world-preparation-elapsed" className="mt-1 text-[11px] text-white/60">
                            Terminée à {formatMs(preparation.doneAt)} depuis l’ouverture · travail{' '}
                            {formatMs(preparation.doneAt - (preparation.startedAt ?? preparation.doneAt))}
                        </p>
                    )}
                    {preparation.errors.length > 0 && (
                        <p className="mt-1 text-[11px] text-red-300">{preparation.errors.join(' · ')}</p>
                    )}
                </div>

                <div data-testid="world-first-opens" className="mt-3 rounded-xl bg-white/5 p-3">
                    <p className="font-bold">Premières ouvertures ({firstOpens.length})</p>
                    {firstOpens.length === 0 && <p className="mt-1 text-[11px] text-white/50">Aucune mesure.</p>}
                    {[...firstOpens].slice(-6).reverse().map((entry) => (
                        <div key={entry.id} className="mt-2 border-t border-white/10 pt-2 text-[11px] text-white/70">
                            <p>
                                <span className="font-bold text-white">#{entry.id} {entry.world}</span>
                                {' · '}{entry.beerCallId}
                                {' · '}{entry.status === 'complete' && entry.phases
                                    ? formatMs(entry.phases.total)
                                    : entry.status}
                            </p>
                            {entry.phases && (
                                <p className="mt-1 text-white/50">
                                    API {formatMs(entry.phases.data)} · Canvas {formatMs(entry.phases.canvas)}
                                    {' '}· avatars {formatMs(entry.phases.avatars)} · GPU {formatMs(entry.phases.frame)}
                                    {' '}· libellés {formatMs(entry.phases.labels)}
                                </p>
                            )}
                            <p className="mt-1 text-white/50">
                                Au toucher : préparation {entry.preparationAtTouch.done ? 'oui' : entry.preparationAtTouch.phase}
                                {' '}· préchargement {entry.preloadAtTouch.done ? 'oui' : 'non'}
                            </p>
                        </div>
                    ))}
                </div>

                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        data-testid="world-probe-start"
                        disabled={status === 'running' || !worlds || !preload.done}
                        onClick={() => void start()}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-black disabled:opacity-40"
                    >
                        <Play size={14}/> Lancer le parcours
                    </button>
                    <button
                        type="button"
                        data-testid="world-probe-stop"
                        disabled={status !== 'running'}
                        onClick={stop}
                        className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40"
                    >
                        <Square size={14}/> Arrêter
                    </button>
                </div>

                {!preload.done && (
                    <p data-testid="world-probe-preload-wait"
                       className="mt-2 rounded-lg bg-amber-500/15 p-2 text-[11px] leading-relaxed text-amber-200">
                        Parcours bloqué tant que le préchargement n'est pas terminé. Ferme la modale,
                        laisse le squad au repos quelques secondes, puis rouvre-la.
                    </p>
                )}

                <p data-testid="world-probe-status" className="mt-3 font-bold text-amber-300">{statusText}</p>
                {warmup.length > 0 && (
                    <p data-testid="world-probe-warmup" className="mt-1 text-[10px] leading-relaxed text-white/50">
                        Préchauffage non mesuré : {warmup.map((sample) =>
                            `${sample.to} ${formatMs(sample.ms)}`).join(' · ')}
                    </p>
                )}
                {message && (
                    <p data-testid="world-probe-error" className="mt-2 rounded-lg bg-red-500/20 p-2 text-[11px] leading-relaxed text-red-200">
                        {message}
                    </p>
                )}

                <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-white/5 p-2 text-center">
                        <p className="text-[9px] uppercase tracking-widest text-white/50">Dernier</p>
                        <p data-testid="world-probe-last" className="text-sm font-black">{formatMs(stats.last)}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 p-2 text-center">
                        <p className="text-[9px] uppercase tracking-widest text-white/50">Médiane</p>
                        <p data-testid="world-probe-median" className="text-sm font-black">{formatMs(stats.median)}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 p-2 text-center">
                        <p className="text-[9px] uppercase tracking-widest text-white/50">p95</p>
                        <p data-testid="world-probe-p95" className="text-sm font-black">{formatMs(stats.p95)}</p>
                    </div>
                </div>

                <div data-testid="world-probe-labels" className="mt-3 rounded-xl bg-white/5 p-3">
                    <p className="font-bold">Libellés par monde</p>
                    {(['bar', 'piscine', 'dodo'] as WorldKind[]).map((world) => {
                        const sample = lastByWorld[world];
                        const label = world === 'bar' ? 'Bar' : world === 'piscine' ? 'Piscine' : 'Dodo';
                        return (
                            <p key={world} className="mt-1 text-[11px] text-white/70">
                                <span className="font-bold text-white">{label}</span> :{' '}
                                {sample
                                    ? `${labelsTotal(sample.labels)}/${labelsTotal(sample.expected)} — ${describeLabels(sample.labels)}`
                                    : 'aucune mesure'}
                            </p>
                        );
                    })}
                    {lastSample && (
                        <p data-testid="world-probe-frames" className="mt-2 text-[10px] text-white/50">
                            Images rendues (dernière transition) : {lastSample.frames}
                        </p>
                    )}
                </div>

                <div className="mt-3 overflow-hidden rounded-xl bg-white/5">
                    <table className="w-full text-[11px]">
                        <thead className="bg-white/5 text-white/50">
                            <tr>
                                <th className="px-2 py-1 text-left">Monde</th>
                                <th className="px-2 py-1 text-right">n</th>
                                <th className="px-2 py-1 text-right">Libellés</th>
                                <th className="px-2 py-1 text-right">Dernier</th>
                                <th className="px-2 py-1 text-right">Médiane</th>
                                <th className="px-2 py-1 text-right">p95</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(['bar', 'piscine', 'dodo'] as WorldKind[]).map((world) => (
                                <tr key={world} data-testid={`world-probe-world-${world}`} className="border-t border-white/10">
                                    <td className="px-2 py-1 capitalize">{world}</td>
                                    <td className="px-2 py-1 text-right">{byWorld[world].count}</td>
                                    <td className="px-2 py-1 text-right">
                                        {lastByWorld[world]
                                            ? `${labelsTotal(lastByWorld[world]!.labels)}/${labelsTotal(lastByWorld[world]!.expected)}`
                                            : '—'}
                                    </td>
                                    <td className="px-2 py-1 text-right">{formatMs(byWorld[world].last)}</td>
                                    <td className="px-2 py-1 text-right">{formatMs(byWorld[world].median)}</td>
                                    <td className="px-2 py-1 text-right">{formatMs(byWorld[world].p95)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-3 rounded-xl bg-white/5 p-3">
                    <p className="text-[9px] uppercase tracking-widest text-white/50">__webglStats</p>
                    <pre data-testid="world-probe-webgl" className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-white/80">
{JSON.stringify(gl, null, 2)}
                    </pre>
                </div>

                <div className="mt-3 rounded-xl bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[9px] uppercase tracking-widest text-white/50">JSON copiable</p>
                        <button
                            type="button"
                            data-testid="world-probe-copy"
                            onClick={() => void copyJson()}
                            className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold"
                        >
                            <Copy size={12}/> {copyState === 'copied' ? 'Copié' : 'Copier'}
                        </button>
                    </div>
                    {copyState === 'failed' && (
                        <p className="mt-1 text-[10px] font-bold text-amber-300">
                            Copie impossible — sélectionne le JSON ci-dessous.
                        </p>
                    )}
                    <textarea
                        data-testid="world-probe-json"
                        readOnly
                        value={json}
                        rows={6}
                        onFocus={(event) => event.currentTarget.select()}
                        className="mt-2 w-full resize-y rounded-lg bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-white/80"
                    />
                </div>
            </div>
        </div>
    );
}

const WorldProbePanel = memo(WorldProbePanelComponent);

export default WorldProbePanel;
