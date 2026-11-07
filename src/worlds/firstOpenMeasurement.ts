/**
 * 8h-4b-3 — Mesure de la vraie première ouverture.
 *
 * Chaque toucher d'un bouton « Mondes » démarre une entrée, sans passer par la
 * préparation du probe. Les phases sont horodatées : données API, Canvas,
 * avatars, première image GPU, libellés. L'historique vit pour la session.
 */

import { useSyncExternalStore } from 'react';
import type { WorldKind } from './pocWorldScenario';
import type { LabelCounts } from '../perf/worldProbeMetrics';
import { getPreparationSnapshot, type WorldPreparationSnapshot } from './worldPreparation';
import { getWorldPreloadStatus } from '../lib/worldPreloadState';

export interface FirstOpenPhaseTimings {
    data: number;
    canvas: number;
    avatars: number;
    frame: number;
    labels: number;
    total: number;
}

export interface FirstOpenEntry {
    id: number;
    beerCallId: string;
    world: WorldKind;
    touchedAt: number;
    dataAt: number | null;
    canvasAt: number | null;
    avatarsAt: number | null;
    frameAt: number | null;
    labelsAt: number | null;
    preparationAtTouch: {
        done: boolean;
        phase: WorldPreparationSnapshot['phase'];
        elapsedMs: number | null;
    };
    preloadAtTouch: {
        done: boolean;
        files: number;
        elapsedMs: number | null;
    };
    expected: LabelCounts | null;
    labels: LabelCounts | null;
    status: 'pending' | 'complete' | 'error';
    error: string | null;
    phases: FirstOpenPhaseTimings | null;
}

const appStartedAt = typeof performance !== 'undefined' ? performance.now() : 0;
const history: FirstOpenEntry[] = [];
const listeners = new Set<() => void>();
let nextId = 1;
let pendingTouchAt: number | null = null;
let pendingPreparation: FirstOpenEntry['preparationAtTouch'] | null = null;
let pendingPrepSnapshot: WorldPreparationSnapshot | null = null;
let pendingPreload: FirstOpenEntry['preloadAtTouch'] | null = null;
let current: FirstOpenEntry | null = null;
let listening = false;

function notify(): void {
    if (typeof window !== 'undefined') {
        window.__beercallFirstOpens = history;
    }
    for (const listener of listeners) {
        try {
            listener();
        } catch (error) {
            console.error('[first-open] abonné en erreur', error);
        }
    }
}

function prepAtTouch(): FirstOpenEntry['preparationAtTouch'] {
    const snap = getPreparationSnapshot();
    return {
        done: snap.phase === 'done',
        phase: snap.phase,
        elapsedMs: snap.doneAt,
    };
}

function preloadAtTouch(): FirstOpenEntry['preloadAtTouch'] {
    const status = getWorldPreloadStatus();
    return {done: status.done, files: status.files, elapsedMs: status.elapsedMs};
}

export function markWorldsTouch(): void {
    pendingTouchAt = performance.now();
    pendingPreparation = prepAtTouch();
    pendingPrepSnapshot = getPreparationSnapshot();
    pendingPreload = preloadAtTouch();
}

function installTouchTracking(): void {
    if (listening || typeof document === 'undefined') return;
    listening = true;
    document.addEventListener('pointerdown', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest('button');
        if (!button) return;
        if ((button.textContent ?? '').toLowerCase().includes('mondes')) {
            markWorldsTouch();
        }
    }, {capture: true, passive: true});
}

if (typeof document !== 'undefined') installTouchTracking();

export function beginFirstOpen(
    beerCallId: string,
    world: WorldKind,
    expected: LabelCounts | null,
    layerReady: boolean,
): FirstOpenEntry {
    const now = performance.now();
    const touchedAt = pendingTouchAt !== null && now - pendingTouchAt < 15_000 ? pendingTouchAt : now;
    const preparation = pendingPreparation ?? prepAtTouch();
    const preload = pendingPreload ?? preloadAtTouch();
    const snap = pendingPrepSnapshot ?? getPreparationSnapshot();
    const prepWorld = snap.worlds[world];
    const prepared = snap.phase === 'done'
        && snap.targetBeerCallId === beerCallId
        && prepWorld.granted === prepWorld.total
        && prepWorld.frame
        && layerReady;

    const entry: FirstOpenEntry = {
        id: nextId++,
        beerCallId,
        world,
        touchedAt,
        dataAt: snap.dataReady && snap.targetBeerCallId === beerCallId ? touchedAt : null,
        canvasAt: snap.canvasReady ? touchedAt : null,
        avatarsAt: prepared ? touchedAt : null,
        frameAt: null,
        labelsAt: null,
        preparationAtTouch: preparation,
        preloadAtTouch: preload,
        expected,
        labels: null,
        status: 'pending',
        error: null,
        phases: null,
    };
    history.push(entry);
    current = entry;
    pendingTouchAt = null;
    pendingPreparation = null;
    pendingPrepSnapshot = null;
    pendingPreload = null;
    notify();
    return entry;
}

function updateCurrent(partial: Partial<FirstOpenEntry>): void {
    if (!current) return;
    Object.assign(current, partial);
    notify();
}

export function markFirstOpenData(): void {
    if (!current || current.dataAt !== null) return;
    updateCurrent({dataAt: performance.now()});
}

export function markFirstOpenCanvas(): void {
    if (!current || current.canvasAt !== null) return;
    updateCurrent({canvasAt: performance.now()});
}

export function markFirstOpenAvatars(): void {
    if (!current || current.avatarsAt !== null) return;
    updateCurrent({avatarsAt: performance.now()});
}

export function markFirstOpenFrame(): void {
    if (!current || current.frameAt !== null) return;
    updateCurrent({frameAt: performance.now()});
}

export function markFirstOpenLabels(labels: LabelCounts): void {
    if (!current || current.status !== 'pending') return;
    const now = performance.now();
    const touchedAt = current.touchedAt;
    const dataAt = current.dataAt ?? now;
    const canvasAt = current.canvasAt ?? dataAt;
    const avatarsAt = current.avatarsAt ?? canvasAt;
    const frameAt = current.frameAt ?? avatarsAt;
    const phases: FirstOpenPhaseTimings = {
        data: Math.max(0, dataAt - touchedAt),
        canvas: Math.max(0, canvasAt - dataAt),
        avatars: Math.max(0, avatarsAt - canvasAt),
        frame: Math.max(0, frameAt - avatarsAt),
        labels: Math.max(0, now - frameAt),
        total: Math.max(0, now - touchedAt),
    };
    Object.assign(current, {
        labelsAt: now,
        labels,
        status: 'complete' as const,
        phases,
    });
    console.info('[first-open] première ouverture', {
        beerCallId: current.beerCallId,
        world: current.world,
        totalMs: Math.round(phases.total),
        phases,
        preparationAtTouch: current.preparationAtTouch,
        preloadAtTouch: current.preloadAtTouch,
    });
    current = null;
    notify();
}

export function failFirstOpen(error: unknown): void {
    if (!current || current.status !== 'pending') return;
    const message = error instanceof Error ? error.message : String(error);
    console.error('[first-open] mesure échouée', error);
    Object.assign(current, {status: 'error' as const, error: message});
    current = null;
    notify();
}

export function getFirstOpenHistory(): readonly FirstOpenEntry[] {
    return history;
}

export function getAppStartedAt(): number {
    return appStartedAt;
}

export function subscribeFirstOpens(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useFirstOpenHistory(): readonly FirstOpenEntry[] {
    return useSyncExternalStore(subscribeFirstOpens, getFirstOpenHistory, getFirstOpenHistory);
}

/** Réinitialisation réservée aux tests. */
export function resetFirstOpenMeasurementForTests(): void {
    history.length = 0;
    current = null;
    pendingTouchAt = null;
    pendingPreparation = null;
    pendingPrepSnapshot = null;
    pendingPreload = null;
    nextId = 1;
    notify();
}

declare global {
    interface Window {
        /** Diagnostic PROBE : historique des premières ouvertures de la session. */
        __beercallFirstOpens?: readonly FirstOpenEntry[];
    }
}
