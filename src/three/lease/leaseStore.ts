/**
 * B10 — Singleton d'état de la lease globale WebGL.
 *
 * Expose un snapshot immuable et stable pour `useSyncExternalStore`.
 * Chaque token propriétaire est unique par instance (surface + instanceId + generation).
 */

export type LeaseSurface = 'map' | 'profile' | 'signup' | 'world';
export type LeasePhase = 'idle' | 'reserved' | 'bound' | 'releasing' | 'blocked';

export interface LeaseToken {
    readonly surface: string;
    readonly instanceId: string;
    readonly generation: number;
}

export interface LeaseState {
    readonly currentToken: LeaseToken | null;
    readonly phase: LeasePhase;
    readonly blockedReason: string | null;
}

let state: LeaseState = Object.freeze({
    currentToken: null,
    phase: 'idle',
    blockedReason: null,
});

const listeners = new Set<() => void>();

export function getLeaseSnapshot(): LeaseState {
    return state;
}

export function subscribeLease(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function updateLeaseState(partial: Partial<LeaseState>): void {
    state = Object.freeze({
        ...state,
        ...partial,
    });
    for (const listener of listeners) {
        try {
            listener();
        } catch (error) {
            console.error('[leaseStore] Erreur dans un abonné :', error);
        }
    }
}

export function resetLeaseStore(): void {
    state = Object.freeze({
        currentToken: null,
        phase: 'idle',
        blockedReason: null,
    });
    for (const listener of listeners) {
        try {
            listener();
        } catch {
            /* ignore */
        }
    }
}
