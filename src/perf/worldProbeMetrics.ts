/**
 * 8h-4b-1 — Mesure du parcours Bar → Piscine → Dodo.
 *
 * Le temps mesuré part du `pointerdown` sur l'onglet et s'arrête quand :
 * - la scène a soumis sa première frame et tous les avatars sont prêts/idle
 *   (signal `onReady` de WorldScene) ;
 * - le décor est donc chargé (WorldScene suspend sur le GLB du décor) ;
 * - tous les libellés attendus sont réellement présents dans le DOM
 *   (pseudos, photos, bulles d'excuse).
 *
 * Aucun seuil n'est ajusté : les libellés attendus sont calculés à partir des
 * participants réellement rendus par la scène.
 */

import type { WorldParticipant } from '../types/api';
import type { WorldKind } from '../worlds/pocWorldScenario';

export type LabelCounts = {
    names: number;
    photos: number;
    excuses: number;
};

export type ProbeSample = {
    cycle: number;
    from: WorldKind;
    to: WorldKind;
    ms: number;
    labels: LabelCounts;
    expected: LabelCounts;
};

export type ProbeStats = {
    count: number;
    last: number | null;
    median: number | null;
    p95: number | null;
};

/** Libellés réellement rendus par WorldScene pour un monde donné. */
export function expectedLabels(
    world: WorldKind,
    participants: WorldParticipant[],
): LabelCounts {
    const rendered = participants.filter((participant) => Boolean(participant.avatar_config));
    if (world === 'piscine') {
        return {
            names: 0,
            photos: 0,
            excuses: rendered.filter((participant) => (participant.excuse ?? '').trim().length > 0).length,
        };
    }
    return {
        names: rendered.filter((participant) => (participant.username ?? '').trim().length > 0).length,
        photos: rendered.filter((participant) => Boolean(participant.proof_photo_url)).length,
        excuses: 0,
    };
}

/** Compte les libellés présents dans le document au moment de l'appel. */
export function countWorldLabels(): LabelCounts {
    if (typeof document === 'undefined') return { names: 0, photos: 0, excuses: 0 };
    return {
        names: document.querySelectorAll('[data-world-name]').length,
        photos: document.querySelectorAll('[data-world-photo]').length,
        excuses: document.querySelectorAll('[data-world-excuse]').length,
    };
}

export function labelsSatisfied(actual: LabelCounts, expected: LabelCounts): boolean {
    return actual.names === expected.names
        && actual.photos === expected.photos
        && actual.excuses === expected.excuses;
}

export function labelsTotal(labels: LabelCounts): number {
    return labels.names + labels.photos + labels.excuses;
}

export function describeLabels(labels: LabelCounts): string {
    return `${labels.names} pseudo(s) · ${labels.photos} photo(s) · ${labels.excuses} bulle(s)`;
}

function round(value: number): number {
    return Math.round(value * 10) / 10;
}

/** Dernier, médiane et p95 (nearest-rank) sur les durées en ms. */
export function summarize(values: number[]): ProbeStats {
    if (values.length === 0) {
        return { count: 0, last: null, median: null, p95: null };
    }
    const sorted = [...values].sort((left, right) => left - right);
    const count = sorted.length;
    const median = count % 2 === 1
        ? sorted[(count - 1) / 2]
        : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
    const p95Index = Math.max(0, Math.ceil(0.95 * count) - 1);
    return {
        count,
        last: round(values[values.length - 1]),
        median: round(median),
        p95: round(sorted[p95Index]),
    };
}

export function summarizeByWorld(samples: ProbeSample[]): Record<WorldKind, ProbeStats> {
    const worlds: WorldKind[] = ['bar', 'piscine', 'dodo'];
    return worlds.reduce((result, world) => {
        result[world] = summarize(samples.filter((sample) => sample.to === world).map((sample) => sample.ms));
        return result;
    }, {} as Record<WorldKind, ProbeStats>);
}

export function formatMs(value: number | null): string {
    if (value === null) return '—';
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ms`;
}
