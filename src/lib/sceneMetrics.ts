/**
 * LIMITATION TECHNIQUE IMPORTANTE (Proxy de soumission vs Présentation physique) :
 *
 * Les signaux de frame ('avatarFrameSubmitted', 'worldFrameSubmitted') mesurent la
 * soumission effective d'une frame au contexte WebGL par le pipeline de rendu React-Three-Fiber / Three.js
 * (fin de la passe d'animation et de dessin des géométries dans le callback useFrame).
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
}

export interface SceneMetricsRecord {
    kind: SceneSignalKind;
    timestamp: number;
    instanceId?: string;
    view?: string;
    drawCalls?: number;
    frames?: number;
}

const MAX_RECORDS = 50;
const records: SceneMetricsRecord[] = [];

// Derniers signaux par vue pour calculer sceneUsable = max(mapInteractive, avatarFrameSubmitted)
const latestDashboardSignals: {
    mapInteractive?: number;
    avatarFrameSubmitted?: number;
    sceneUsable?: number;
} = {};

/**
 * Enregistre un signal de scène prête.
 * Les marqueurs et événements ne contiennent AUCUNE donnée utilisateur (uniquement des identifiants techniques).
 */
export function recordSceneSignal(
    kind: SceneSignalKind,
    options: SceneSignalOptions = {}
): SceneMetricsRecord {
    const timestamp = options.timestamp ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const view = options.view ?? (kind === 'mapInteractive' ? 'dashboard' : undefined);

    const record: SceneMetricsRecord = {
        kind,
        timestamp,
        instanceId: options.instanceId,
        view,
        drawCalls: options.drawCalls,
        frames: options.frames,
    };

    records.push(record);
    if (records.length > MAX_RECORDS) {
        records.shift();
    }

    // 1. Performance Mark standard (aucun identifiant utilisateur)
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
        try {
            performance.mark(`beercall:${kind}`);
            performance.mark(kind);
        } catch {
            // Ignoré si doublon ou non supporté
        }
    }

    // 2. Événement CustomEvent (aucun identifiant utilisateur)
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(
                new CustomEvent('beercall:scene-metric', {
                    detail: { kind, timestamp, view },
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
        w.__beercall_scene_metrics[kind] = {
            timestamp,
            instanceId: options.instanceId,
            view,
            ...(options.drawCalls !== undefined ? { drawCalls: options.drawCalls } : {}),
            ...(options.frames !== undefined ? { frames: options.frames } : {}),
        };
    }

    // 4. Calcul de sceneUsable = max(mapInteractive, avatarFrameSubmitted) sur dashboard
    if (view === 'dashboard' || kind === 'mapInteractive' || (kind === 'avatarFrameSubmitted' && view === 'dashboard')) {
        if (kind === 'mapInteractive') {
            latestDashboardSignals.mapInteractive = timestamp;
        } else if (kind === 'avatarFrameSubmitted') {
            latestDashboardSignals.avatarFrameSubmitted = timestamp;
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
    delete latestDashboardSignals.mapInteractive;
    delete latestDashboardSignals.avatarFrameSubmitted;
    delete latestDashboardSignals.sceneUsable;
}
