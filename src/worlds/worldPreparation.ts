/**
 * 8h-4b-3 — Préparation au repos des trois mondes.
 *
 * Les couches sont montées pendant que le tableau de bord est affiché. Les
 * avatars sont accordés un par tranche de repos (jamais pendant une
 * interaction), puis chaque couche reçoit un rendu caché pour compiler
 * textures et shaders. La préparation est terminée quand les données, le
 * Canvas, tous les avatars, les trois rendus et les libellés du monde affiché
 * sont prêts.
 */

import { useSyncExternalStore } from 'react';
import type { WorldKind } from './pocWorldScenario';
import { isPreloadQuiet } from '../lib/preloadSchedule';

export type PreparationPhase =
    | 'idle'
    | 'waiting-data'
    | 'layers'
    | 'avatars'
    | 'gpu'
    | 'done'
    | 'error';

export interface WorldPreparationProgress {
    total: number;
    granted: number;
    frame: boolean;
}

export interface WorldPreparationSnapshot {
    targetBeerCallId: string | null;
    startedAt: number | null;
    doneAt: number | null;
    phase: PreparationPhase;
    dataReady: boolean;
    canvasReady: boolean;
    labelsReady: boolean;
    worlds: Record<WorldKind, WorldPreparationProgress>;
    errors: string[];
}

const WORLD_KINDS: WorldKind[] = ['bar', 'piscine', 'dodo'];

function emptyWorlds(): Record<WorldKind, WorldPreparationProgress> {
    return {
        bar: { total: 0, granted: 0, frame: false },
        piscine: { total: 0, granted: 0, frame: false },
        dodo: { total: 0, granted: 0, frame: false },
    };
}

function emptySnapshot(targetBeerCallId: string | null, startedAt: number | null): WorldPreparationSnapshot {
    return {
        targetBeerCallId,
        startedAt,
        doneAt: null,
        phase: targetBeerCallId ? 'waiting-data' : 'idle',
        dataReady: false,
        canvasReady: false,
        labelsReady: false,
        worlds: emptyWorlds(),
        errors: [],
    };
}

let snapshot: WorldPreparationSnapshot = emptySnapshot(null, null);
let queue: Array<{ world: WorldKind; index: number }> = [];
const granted = new Set<string>();
const worldSignatures: Partial<Record<WorldKind, string>> = {};
const listeners = new Set<() => void>();
let workTimer: number | null = null;
let priorityWorld: WorldKind = 'bar';
let openWorld: WorldKind | null = null;
let autoWork = true;

function clearWorkTimer(): void {
    if (workTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(workTimer);
    }
    workTimer = null;
}

function scheduleWork(delay = 40): void {
    if (!autoWork || typeof window === 'undefined' || workTimer !== null) return;
    if (!snapshot.targetBeerCallId
        || snapshot.phase === 'done'
        || snapshot.phase === 'error'
        || snapshot.phase === 'gpu'
        || queue.length === 0) {
        return;
    }
    workTimer = window.setTimeout(runWork, delay);
}

function runWork(): void {
    workTimer = null;
    if (!autoWork
        || !snapshot.targetBeerCallId
        || snapshot.phase === 'done'
        || snapshot.phase === 'error'
        || snapshot.phase === 'gpu') {
        return;
    }
    if (!isPreloadQuiet()) {
        scheduleWork(250);
        return;
    }
    if (grantNextPreparationAvatar(priorityWorld)) {
        scheduleWork(40);
    }
}

function avatarKey(world: WorldKind, index: number): string {
    return `${world}:${index}`;
}

function notify(): void {
    if (typeof window !== 'undefined') {
        window.__beercallPreparation = snapshot;
    }
    for (const listener of listeners) {
        try {
            listener();
        } catch (error) {
            console.error('[preparation] abonné en erreur', error);
        }
    }
}

function publish(partial: Partial<WorldPreparationSnapshot>): void {
    snapshot = {...snapshot, ...partial};
    notify();
}

function worldProgress(worlds: WorldPreparationSnapshot['worlds'], world: WorldKind, update: Partial<WorldPreparationProgress>): WorldPreparationSnapshot['worlds'] {
    return {...worlds, [world]: {...worlds[world], ...update}};
}

function allWorldsGranted(): boolean {
    return queue.length === 0
        && worldSignatures.bar !== undefined
        && worldSignatures.piscine !== undefined
        && worldSignatures.dodo !== undefined;
}

function allWorldsFramed(): boolean {
    return WORLD_KINDS.every((world) =>
        worldSignatures[world] !== undefined && snapshot.worlds[world].frame);
}

function maybeFinish(): void {
    if (snapshot.phase === 'done') return;
    if (!snapshot.dataReady || !snapshot.canvasReady || !snapshot.labelsReady) return;
    if (!allWorldsGranted() || !allWorldsFramed()) return;
    publish({phase: 'done', doneAt: performance.now()});
    console.info('[preparation] préparation terminée', {
        elapsedMs: Math.round(snapshot.doneAt ?? 0),
        workMs: Math.round((snapshot.doneAt ?? 0) - (snapshot.startedAt ?? 0)),
        avatars: WORLD_KINDS.reduce((total, world) => total + snapshot.worlds[world].total, 0),
    });
}

export function resetPreparationForTarget(targetBeerCallId: string | null): void {
    if (snapshot.targetBeerCallId === targetBeerCallId && snapshot.phase !== 'done' && snapshot.phase !== 'error') {
        return;
    }
    if (snapshot.targetBeerCallId === targetBeerCallId && snapshot.phase === 'done') {
        return;
    }
    queue = [];
    granted.clear();
    for (const world of WORLD_KINDS) delete worldSignatures[world];
    clearWorkTimer();
    snapshot = emptySnapshot(targetBeerCallId, targetBeerCallId ? performance.now() : null);
    notify();
}

/** Monde affiché : ses avatars passent en premier dans les tranches. */
export function setPreparationPriority(world: WorldKind): void {
    priorityWorld = world;
    scheduleWork();
}

/**
 * Monde dont la modale est ouverte. Dès que sa couche enregistre ses avatars,
 * tous sont accordés immédiatement : on ne dépend pas de l'ordre des effets.
 */
export function setPreparationOpenWorld(world: WorldKind | null): void {
    openWorld = world;
    if (world) grantAllPreparationAvatars(world);
}

export function markPreparationDataReady(): void {
    if (snapshot.dataReady || !snapshot.targetBeerCallId) return;
    publish({dataReady: true, phase: snapshot.phase === 'waiting-data' ? 'layers' : snapshot.phase});
    maybeFinish();
}

export function markPreparationCanvasReady(): void {
    if (snapshot.canvasReady || !snapshot.targetBeerCallId) return;
    publish({canvasReady: true, phase: snapshot.phase === 'waiting-data' ? 'layers' : snapshot.phase});
    maybeFinish();
}

/**
 * Déclare les avatars d'un monde. Les indices sont les positions stables dans
 * les participants ; un changement de signature (autre Beer Call) réinitialise
 * les accords de ce monde.
 */
export function registerPreparationWorld(world: WorldKind, indices: number[]): void {
    if (!snapshot.targetBeerCallId) return;
    const signature = indices.join(',');
    if (worldSignatures[world] === signature) return;
    worldSignatures[world] = signature;

    for (const key of [...granted]) {
        if (key.startsWith(`${world}:`)) granted.delete(key);
    }
    queue = queue.filter((entry) => entry.world !== world);
    for (const index of indices) {
        const key = avatarKey(world, index);
        if (!granted.has(key)) queue.push({world, index});
    }
    const worlds = worldProgress(snapshot.worlds, world, {
        total: indices.length,
        granted: 0,
        frame: false,
    });
    publish({
        worlds,
        phase: snapshot.phase === 'gpu' ? 'avatars' : snapshot.phase,
    });
    scheduleWork();
    if (openWorld === world) grantAllPreparationAvatars(world);
}

/** Accorde un avatar. Le monde prioritaire passe devant les autres. */
export function grantNextPreparationAvatar(priorityWorld?: WorldKind): { world: WorldKind; index: number } | null {
    if (!snapshot.targetBeerCallId || snapshot.phase === 'done') return null;
    if (queue.length === 0) return null;
    let position = priorityWorld
        ? queue.findIndex((entry) => entry.world === priorityWorld)
        : -1;
    if (position < 0) position = 0;
    const [entry] = queue.splice(position, 1);
    granted.add(avatarKey(entry.world, entry.index));
    const worlds = worldProgress(snapshot.worlds, entry.world, {
        granted: snapshot.worlds[entry.world].granted + 1,
    });
    publish({
        worlds,
        phase: queue.length === 0 ? 'gpu' : 'avatars',
    });
    return entry;
}

/** Termine en priorité un monde (touche Mondes avant la fin du repos). */
export function grantAllPreparationAvatars(world: WorldKind): number {
    if (!snapshot.targetBeerCallId || snapshot.phase === 'done') return 0;
    let grantedCount = 0;
    for (const entry of [...queue]) {
        if (entry.world !== world) continue;
        queue = queue.filter((candidate) => candidate !== entry);
        granted.add(avatarKey(entry.world, entry.index));
        grantedCount += 1;
    }
    if (grantedCount > 0) {
        const worlds = worldProgress(snapshot.worlds, world, {
            granted: snapshot.worlds[world].total,
        });
        publish({
            worlds,
            phase: queue.length === 0 ? 'gpu' : 'avatars',
        });
    }
    scheduleWork();
    return grantedCount;
}

export function isPreparationAvatarGranted(world: WorldKind, index: number): boolean {
    return granted.has(avatarKey(world, index));
}

export function markPreparationGpuFrame(world: WorldKind): void {
    if (!snapshot.targetBeerCallId || snapshot.worlds[world].frame) return;
    const worlds = worldProgress(snapshot.worlds, world, {frame: true});
    publish({worlds});
    maybeFinish();
}

export function markPreparationLabelsReady(): void {
    if (snapshot.labelsReady) return;
    publish({labelsReady: true});
    maybeFinish();
}

export function markPreparationError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[preparation] échec', error);
    publish({phase: 'error', errors: [...snapshot.errors, message]});
}

export function getPreparationSnapshot(): WorldPreparationSnapshot {
    return snapshot;
}

export function getPreparationDebug(): {
    queued: number;
    granted: number;
    signatures: Partial<Record<WorldKind, string>>;
    timer: boolean;
    priorityWorld: WorldKind;
} {
    return {
        queued: queue.length,
        granted: granted.size,
        signatures: {...worldSignatures},
        timer: workTimer !== null,
        priorityWorld,
    };
}

if (typeof window !== 'undefined') {
    (window as unknown as {__beercallPreparationDebug?: typeof getPreparationDebug})
        .__beercallPreparationDebug = getPreparationDebug;
}

export function subscribePreparation(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function usePreparationSnapshot(): WorldPreparationSnapshot {
    return useSyncExternalStore(subscribePreparation, getPreparationSnapshot, getPreparationSnapshot);
}

export function usePreparationAvatarGranted(world: WorldKind, index: number): boolean {
    return useSyncExternalStore(
        subscribePreparation,
        () => isPreparationAvatarGranted(world, index),
        () => false,
    );
}

/** Réinitialisation réservée aux tests. */
export function resetWorldPreparationForTests(): void {
    clearWorkTimer();
    autoWork = false;
    priorityWorld = 'bar';
    openWorld = null;
    queue = [];
    granted.clear();
    for (const world of WORLD_KINDS) delete worldSignatures[world];
    snapshot = emptySnapshot(null, null);
    notify();
}

declare global {
    interface Window {
        /** Diagnostic PROBE : snapshot de la préparation au repos. */
        __beercallPreparation?: WorldPreparationSnapshot;
    }
}
