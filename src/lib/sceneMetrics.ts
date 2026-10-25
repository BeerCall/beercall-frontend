/**
 * LIMITATION TECHNIQUE IMPORTANTE (Proxy de soumission vs Présentation physique) :
 *
 * Les signaux de frame ('avatarFrameSubmitted', 'worldFrameSubmitted') mesurent la
 * soumission effective d'une frame au contexte WebGL par le pipeline de rendu React-Three-Fiber / Three.js
 * (callback de suivi après une progression du compteur de rendu du root concerné).
 *
 * Il s'agit d'un proxy logiciel de soumission (frame submission proxy) et en aucun
 * cas d'une preuve physique de présentation sur l'écran (display scanout / photon presentation / VSync hardware).
 * Le temps écoulé entre cette soumission logicielle et l'affichage physique dépend du compositeur de fenêtres,
 * des buffers d'échange du GPU et de la dalle d'affichage.
 */

export type SceneSignalKind =
    | 'avatarFrameSubmitted'
    | 'mapInteractive'
    | 'worldFrameSubmitted'
    | 'sceneUsable';

export interface SceneSignalOptions {
    instanceId?: string;
    view?: string;
    timestamp?: number;
    drawCalls?: number;
    frames?: number;
    generation?: number;
}

export interface SceneMetricsRecord {
    kind: SceneSignalKind;
    timestamp: number;
    instanceId?: string;
    view?: string;
    drawCalls?: number;
    frames?: number;
    generation: number;
}

const MAX_RECORDS = 50;
const records: SceneMetricsRecord[] = [];
// Historical first usable dashboard of this document, not an active readiness
// signal. Diagnostics opened later (e.g. from the PWA profile) must not label a
// warm-return timestamp as the initial load. Bench consumers keep using records.
let initialDashboardScene: SceneMetricsRecord | undefined;
let nextGeneration = 0;
let nextInstanceId = 0;
const instances = new Map<string, { generation: number; ids: Set<string> }>();
const kinds: SceneSignalKind[] = ['avatarFrameSubmitted', 'mapInteractive', 'worldFrameSubmitted', 'sceneUsable'];

// React DOM and R3F use different reconcilers: their useId counters can collide.
export function allocateSceneInstanceId(prefix: string): string {
    return `${prefix}:${++nextInstanceId}`;
}

export function registerSceneInstance(view: string, instanceId: string): number {
    let current = instances.get(view);
    if (!current) {
        current = { generation: ++nextGeneration, ids: new Set() };
        instances.set(view, current);
    }
    current.ids.add(instanceId);
    return current.generation;
}

export function invalidateSceneInstance(view: string, instanceId: string, generation: number): void {
    const w = typeof window === 'undefined' ? undefined : window as unknown as {
        __bench?: { marks: Record<string, unknown>; sceneMetrics?: Record<string, SceneMetricsRecord> };
        __beercall_scene_metrics?: Record<string, SceneMetricsRecord>;
    };
    for (const record of new Set([...records, ...Object.values(w?.__beercall_scene_metrics ?? {})])) {
        if (record.view !== view || record.generation !== generation ||
            (record.instanceId !== instanceId && record.kind !== 'sceneUsable')) continue;
        const index = records.indexOf(record);
        if (index >= 0) records.splice(index, 1);
        if (w?.__beercall_scene_metrics?.[record.kind] === record) {
            delete w.__beercall_scene_metrics[record.kind];
            if (w.__bench?.marks[record.kind] === record.timestamp) delete w.__bench.marks[record.kind];
            if (w.__bench?.sceneMetrics) delete w.__bench.sceneMetrics[record.kind];
            performance.clearMarks?.(`beercall:${record.kind}`);
            performance.clearMarks?.(record.kind);
        }
    }
    if (view === 'dashboard' && latestDashboardSignals.generation === generation) {
        delete latestDashboardSignals.sceneUsable;
        if (latestDashboardSignals.mapId === instanceId) delete latestDashboardSignals.mapInteractive;
        if (latestDashboardSignals.avatarId === instanceId) delete latestDashboardSignals.avatarFrameSubmitted;
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('beercall:scene-invalidate', { detail: { view, instanceId, generation } }));
}

export function unregisterSceneInstance(view: string, instanceId: string, generation: number): void {
    invalidateSceneInstance(view, instanceId, generation);
    const current = instances.get(view);
    if (current?.generation !== generation) return;
    current.ids.delete(instanceId);
    if (!current.ids.size) instances.delete(view);
}

// Derniers signaux par vue pour calculer sceneUsable = max(mapInteractive, avatarFrameSubmitted)
const latestDashboardSignals: {
    mapInteractive?: number;
    avatarFrameSubmitted?: number;
    sceneUsable?: number;
    generation?: number;
    mapId?: string;
    avatarId?: string;
} = {};

/**
 * Enregistre un signal de scène prête.
 * Les marqueurs et événements ne contiennent AUCUNE donnée utilisateur (uniquement des identifiants techniques).
 */
export function recordSceneSignal(
    kind: SceneSignalKind,
    options: SceneSignalOptions = {}
): SceneMetricsRecord | undefined {
    const timestamp = options.timestamp ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const view = options.view ?? (kind === 'mapInteractive' ? 'dashboard' : undefined);
    const current = view ? instances.get(view) : undefined;
    if (!current || current.generation !== options.generation || !options.instanceId || !current.ids.has(options.instanceId) ||
        !Number.isFinite(timestamp) || timestamp <= 0) return;

    const record: SceneMetricsRecord = {
        kind,
        timestamp,
        instanceId: options.instanceId,
        view,
        drawCalls: options.drawCalls,
        frames: options.frames,
        generation: current.generation,
    };

    if (!initialDashboardScene && kind === 'sceneUsable' && view === 'dashboard') initialDashboardScene = record;
    records.push(record);
    if (records.length > MAX_RECORDS) {
        records.shift();
    }

    // 1. Performance Mark standard (aucun identifiant utilisateur)
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
        try {
            performance.clearMarks?.(`beercall:${kind}`);
            performance.clearMarks?.(kind);
            performance.mark(`beercall:${kind}`, { startTime: timestamp });
            performance.mark(kind, { startTime: timestamp });
        } catch {
            // Ignoré si doublon ou non supporté
        }
    }

    // 2. Événement CustomEvent (aucun identifiant utilisateur)
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(
                new CustomEvent('beercall:scene-metric', {
                    detail: record,
                })
            );
        } catch {
            // Environnement sans CustomEvent
        }
    }

    // 3. Exposition des compteurs UNIQUEMENT au banc de mesure
    if (typeof window !== 'undefined') {
        const w = window as unknown as {
            __bench?: {
                marks: Record<string, unknown>;
                sceneMetrics?: Record<string, unknown>;
            };
            __beercall_scene_metrics?: Record<string, unknown>;
        };

        if (w.__bench) {
            w.__bench.marks = w.__bench.marks || {};
            w.__bench.marks[kind] = timestamp;
            if (options.drawCalls !== undefined || options.frames !== undefined) {
                w.__bench.sceneMetrics = w.__bench.sceneMetrics || {};
                w.__bench.sceneMetrics[kind] = {
                    timestamp,
                    instanceId: options.instanceId,
                    view,
                    drawCalls: options.drawCalls,
                    frames: options.frames,
                };
            }
        }

        w.__beercall_scene_metrics = w.__beercall_scene_metrics || {};
        w.__beercall_scene_metrics[kind] = record;
    }

    // 4. Calcul de sceneUsable = max(mapInteractive, avatarFrameSubmitted) sur dashboard
    if (view === 'dashboard' || kind === 'mapInteractive' || (kind === 'avatarFrameSubmitted' && view === 'dashboard')) {
        if (latestDashboardSignals.generation !== current.generation) {
            delete latestDashboardSignals.mapInteractive;
            delete latestDashboardSignals.avatarFrameSubmitted;
            delete latestDashboardSignals.sceneUsable;
            latestDashboardSignals.generation = current.generation;
        }
        if (kind === 'mapInteractive') {
            latestDashboardSignals.mapInteractive = timestamp;
            latestDashboardSignals.mapId = options.instanceId;
        } else if (kind === 'avatarFrameSubmitted') {
            latestDashboardSignals.avatarFrameSubmitted = timestamp;
            latestDashboardSignals.avatarId = options.instanceId;
        }

        if (
            latestDashboardSignals.mapInteractive !== undefined &&
            latestDashboardSignals.avatarFrameSubmitted !== undefined
        ) {
            const usableTimestamp = Math.max(
                latestDashboardSignals.mapInteractive,
                latestDashboardSignals.avatarFrameSubmitted
            );

            if (latestDashboardSignals.sceneUsable !== usableTimestamp) {
                latestDashboardSignals.sceneUsable = usableTimestamp;
                recordSceneSignal('sceneUsable', {
                    view: 'dashboard',
                    timestamp: usableTimestamp,
                    instanceId: options.instanceId,
                    generation: current.generation,
                });
            }
        }
    }

    return record;
}

/**
 * Récupère l'ensemble des enregistrements de signaux (limité à MAX_RECORDS).
 */
export function getSceneMetrics(): SceneMetricsRecord[] {
    return [...records];
}

export function getInitialDashboardSceneSignal(): SceneMetricsRecord | undefined {
    return initialDashboardScene ? { ...initialDashboardScene } : undefined;
}

/**
 * Récupère le dernier enregistrement pour un type de signal donné.
 */
export function getLatestSceneSignal(
    kind: SceneSignalKind,
    view?: string
): SceneMetricsRecord | undefined {
    for (let i = records.length - 1; i >= 0; i--) {
        const r = records[i];
        if (r.kind === kind && (view === undefined || r.view === view)) {
            return r;
        }
    }
    return undefined;
}

/**
 * Réinitialise l'historique et les signaux enregistrés.
 */
export function clearSceneMetrics(): void {
    records.length = 0;
    initialDashboardScene = undefined;
    instances.clear();
    delete latestDashboardSignals.mapInteractive;
    delete latestDashboardSignals.avatarFrameSubmitted;
    delete latestDashboardSignals.sceneUsable;
    delete latestDashboardSignals.generation;
    delete latestDashboardSignals.mapId;
    delete latestDashboardSignals.avatarId;
    for (const kind of kinds) {
        performance.clearMarks?.(kind);
        performance.clearMarks?.(`beercall:${kind}`);
    }
    if (typeof window !== 'undefined') {
        const w = window as unknown as { __beercall_scene_metrics?: Record<string, unknown>; __bench?: { marks: Record<string, unknown> } };
        delete w.__beercall_scene_metrics;
        for (const kind of kinds) if (w.__bench?.marks) delete w.__bench.marks[kind];
    }
}
