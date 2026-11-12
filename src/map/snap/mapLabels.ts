import type {Cluster, Coordinates, PersonMeta, SnapFeature, SnapFeatureCollection} from './types';
import {CLUSTER_MAX_STACK, slotKey, stackSlots} from './mapScenario';

/** B09a — composition GeoJSON des bases, corps et pastilles. */
export function baseScale(memberCount: number): number {
    return Math.min(1.6, 1 + 0.18 * (Math.max(1, memberCount) - 1));
}

export function labelText(cluster: Cluster, meta: ReadonlyMap<string, PersonMeta>): string {
    const first = meta.get(cluster.members[0]);
    if (!first) throw new Error(`Personne inconnue: ${cluster.members[0]}`);
    return cluster.members.length === 1
        ? `${first.name} · ${first.since}`
        : `${first.name} +${cluster.members.length - 1}`;
}

const point = (
    properties: SnapFeature['properties'],
    coordinates: Coordinates,
): SnapFeature => ({
    type: 'Feature',
    properties,
    geometry: {type: 'Point', coordinates},
});

/**
 * Bases, corps et pastilles d'une composition. Les groupes au sud reçoivent un
 * sort plus grand pour passer devant, comme dans les captures de référence.
 * Aucune couche « appels » : les apéros restent des markers DOM.
 */
export function buildSnapFeatures(
    clusters: readonly Cluster[],
    meta: ReadonlyMap<string, PersonMeta>,
    bucket: number,
): SnapFeatureCollection {
    const ordered = [...clusters].sort((a, b) => b.coordinates[1] - a.coordinates[1] || (a.id < b.id ? -1 : 1));
    const features: SnapFeature[] = [];

    ordered.forEach((cluster, rank) => {
        if (cluster.shown.length > CLUSTER_MAX_STACK) {
            throw new Error(`Groupe ${cluster.id}: pile ${cluster.shown.length} > ${CLUSTER_MAX_STACK}`);
        }
        const members = JSON.stringify(cluster.members);
        features.push(point({
            kind: 'base',
            id: `base-${cluster.id}`,
            cluster: cluster.id,
            baseScale: baseScale(cluster.members.length),
            bucket,
        }, cluster.coordinates));

        stackSlots(cluster.shown.length);
        cluster.shown.forEach((memberId, slot) => {
            if (!meta.get(memberId)) throw new Error(`Personne inconnue: ${memberId}`);
            features.push(point({
                kind: 'avatar',
                id: memberId,
                cluster: cluster.id,
                members,
                size: cluster.members.length,
                avatarKey: cluster.keys[slot],
                slot: slotKey(cluster.shown.length, slot),
                sort: rank * 10 + slot,
                bucket,
            }, cluster.coordinates));
        });

        const text = labelText(cluster, meta);
        features.push(point({
            kind: 'label',
            id: `label-${cluster.id}`,
            cluster: cluster.id,
            label: text,
            pill: text,
            sort: rank,
            bucket,
        }, cluster.coordinates));
    });

    return {type: 'FeatureCollection', features};
}

/** Union complète des membres représentés (pas seulement les 4 de la pile). */
export function representedMembers(
    rendered: ReadonlyArray<{properties?: Record<string, unknown> | null}>,
): {clusters: string[]; members: string[]} {
    const clusters = new Set<string>();
    const members = new Set<string>();
    for (const feature of rendered) {
        const properties = feature.properties ?? {};
        if (properties.kind !== 'avatar') continue;
        const cluster = String(properties.cluster ?? '');
        if (!cluster || clusters.has(cluster)) continue;
        clusters.add(cluster);
        const raw = properties.members;
        const list: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(list)) throw new Error(`members illisible pour ${cluster}`);
        for (const member of list) members.add(String(member));
    }
    return {clusters: [...clusters].sort(), members: [...members].sort()};
}
