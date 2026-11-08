/**
 * 8j — sol mesuré de chaque monde, partagé avec les contrôles de caméra.
 *
 * `Crowd` mesure déjà le décor une fois (`measure`) et obtient `planeY` ;
 * `Controls` lit cette valeur pour borner l'inclinaison. Le décor d'un monde ne
 * change pas pendant la session : la valeur mesurée reste valable au changement
 * de Beer Call, et aucun raycast n'est refait par image.
 */
import { useSyncExternalStore } from 'react';
import type { WorldKind } from './pocWorldScenario';

const floors = new Map<WorldKind, number>();
const listeners = new Set<() => void>();

function emit(): void {
    for (const listener of listeners) listener();
}

/** Publie le sol mesuré d'un monde ; `null` efface la valeur connue. */
export function setWorldFloor(world: WorldKind, floorY: number | null): void {
    const current = floors.get(world) ?? null;
    if (current === floorY) return;
    if (floorY === null) floors.delete(world);
    else floors.set(world, floorY);
    emit();
}

export function getWorldFloor(world: WorldKind): number | null {
    return floors.get(world) ?? null;
}

export function subscribeWorldFloors(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function resetWorldFloorsForTests(): void {
    floors.clear();
    emit();
}

/** Sol mesuré du monde, ou `null` tant que la mesure n'a pas eu lieu. */
export function useWorldFloor(world: WorldKind): number | null {
    return useSyncExternalStore(
        subscribeWorldFloors,
        () => getWorldFloor(world),
        () => null,
    );
}
