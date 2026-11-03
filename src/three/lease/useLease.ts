/**
 * B10b — Hook React de réservation de la lease WebGL (CHAL-02).
 *
 * Utilise `useSyncExternalStore` pour un suivi d'état sans désynchronisation.
 * Génère un identifiant d'instance unique par montage via `useId()`.
 * Annule proprement toute demande en vol au démontage ou lors de la désactivation.
 */

import { useCallback, useEffect, useId, useState, useSyncExternalStore } from 'react';
import {
    type LeaseController,
    globalLeaseController,
} from './leaseController';
import {
    type LeaseSurface,
    type LeaseToken,
    getLeaseSnapshot,
    subscribeLease,
} from './leaseStore';

export interface UseLeaseOptions {
    surface: LeaseSurface | string;
    enabled?: boolean;
    controller?: LeaseController;
}

export interface UseLeaseResult {
    requested: boolean;
    granted: boolean;
    blocked: boolean;
    blockedReason: string | null;
    token: LeaseToken | null;
    error: Error | null;
    release: () => Promise<void>;
}

export function useLease(
    surface: LeaseSurface | string,
    enabled = true,
    controller: LeaseController = globalLeaseController,
): UseLeaseResult {
    const instanceId = useId();
    const snapshot = useSyncExternalStore(subscribeLease, getLeaseSnapshot, getLeaseSnapshot);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!enabled) {
            controller.cancel(surface, instanceId);
            return;
        }

        let active = true;
        controller
            .request(surface, instanceId)
            .then(() => {
                if (!active) return;
                setError(null);
            })
            .catch((err) => {
                if (!active) return;
                const normalized = err instanceof Error ? err : new Error(String(err));
                setError(normalized);
            });

        return () => {
            active = false;
            controller.cancel(surface, instanceId);
        };
    }, [surface, enabled, instanceId, controller]);

    const isCurrent = Boolean(
        enabled &&
        snapshot.currentToken?.surface === surface &&
        snapshot.currentToken?.instanceId === instanceId &&
        snapshot.phase !== 'blocked',
    );

    const release = useCallback(async () => {
        if (isCurrent && snapshot.currentToken) {
            await controller.release(snapshot.currentToken);
        }
    }, [controller, isCurrent, snapshot.currentToken]);

    return {
        requested: enabled,
        granted: isCurrent,
        blocked: snapshot.phase === 'blocked',
        blockedReason: snapshot.blockedReason,
        token: isCurrent ? snapshot.currentToken : null,
        error,
        release,
    };
}
