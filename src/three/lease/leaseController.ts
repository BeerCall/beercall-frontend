/**
 * B10 — Contrôleur global de lease WebGL (CHAL-02).
 *
 * Garantit l'existence d'au plus un contexte WebGL actif sur mobile.
 * Pas de préemption aveugle : request attend que le slot soit libéré.
 * Chaque token est unique par instance (surface + instanceId + generation).
 * L'annulation synchrone protège contre les courses de montage/démontage React.
 */

import {
    type LeasePhase,
    type LeaseToken,
    getLeaseSnapshot,
    resetLeaseStore,
    updateLeaseState,
} from './leaseStore';

export type ReleaseFunction = () => Promise<void> | void;

export class LeaseController {
    private currentLease: LeaseToken | null = null;
    private releaseResource: ReleaseFunction | null = null;
    private generation = 0;
    private queue: Promise<void> = Promise.resolve();
    private activeRequests = new Map<string, { cancelled: boolean }>();
    private idleResolvers = new Set<() => void>();
    private readonly timeoutMs: number;

    constructor(timeoutMs = 2_000) {
        this.timeoutMs = timeoutMs;
    }

    current(): LeaseToken | null {
        return this.currentLease;
    }

    status(): LeasePhase {
        return getLeaseSnapshot().phase;
    }

    block(reason: string): void {
        updateLeaseState({
            phase: 'blocked',
            blockedReason: reason,
        });
    }

    private waitForIdle(): Promise<void> {
        if (!this.currentLease && getLeaseSnapshot().phase !== 'blocked') {
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            this.idleResolvers.add(resolve);
        });
    }

    private notifyIdle(): void {
        const resolvers = [...this.idleResolvers];
        this.idleResolvers.clear();
        for (const resolve of resolvers) {
            resolve();
        }
    }

    /**
     * Demande l'accès au slot WebGL unique pour une surface et un ID d'instance donnés.
     * Attend dans une file FIFO sérialisée que le propriétaire précédent ait libéré et détruit son contexte.
     * Pas de préemption aveugle : attend que le propriétaire actif se démonte et libère.
     */
    request(surface: string, instanceId: string): Promise<LeaseToken> {
        const requestId = `${surface}:${instanceId}`;
        const tracker = { cancelled: false };
        this.activeRequests.set(requestId, tracker);

        return this.enqueue(async () => {
            const currentSnapshot = getLeaseSnapshot();
            if (currentSnapshot.phase === 'blocked') {
                throw new Error(
                    `Lease WebGL bloquée : ${currentSnapshot.blockedReason ?? 'libération non confirmée'}. Veuillez rafraîchir l'application.`,
                );
            }

            if (tracker.cancelled) {
                throw new Error(`Demande de lease annulée pour ${surface}#${instanceId}`);
            }

            // Si cette instance possède déjà la lease courante
            if (
                this.currentLease &&
                this.currentLease.surface === surface &&
                this.currentLease.instanceId === instanceId
            ) {
                return this.currentLease;
            }

            // Pas de préemption aveugle : attendre que le propriétaire actif libère le slot
            while (this.currentLease) {
                await this.waitForIdle();
                if (tracker.cancelled) {
                    throw new Error(`Demande de lease annulée pour ${surface}#${instanceId}`);
                }
                const snap = getLeaseSnapshot();
                if (snap.phase === 'blocked') {
                    throw new Error(`Lease WebGL bloquée : ${snap.blockedReason}`);
                }
            }

            if (tracker.cancelled) {
                throw new Error(`Demande de lease annulée avant attribution pour ${surface}#${instanceId}`);
            }

            this.generation += 1;
            const token: LeaseToken = Object.freeze({
                surface,
                instanceId,
                generation: this.generation,
            });

            this.currentLease = token;
            this.releaseResource = null;
            updateLeaseState({
                currentToken: token,
                phase: 'reserved',
                blockedReason: null,
            });

            return token;
        });
    }

    /**
     * Lie la fonction de libération de la ressource WebGL dès sa création synchrone.
     * Si le token est périmé ou la lease bloquée, détruit immédiatement la ressource orpheline.
     */
    attach(token: LeaseToken, release: ReleaseFunction): void {
        const isCurrent =
            this.currentLease &&
            this.currentLease.surface === token.surface &&
            this.currentLease.instanceId === token.instanceId &&
            this.currentLease.generation === token.generation;

        const currentPhase = getLeaseSnapshot().phase;

        if (!isCurrent || currentPhase === 'blocked') {
            // Ressource créée en retard ou token annulé : nettoyage immédiat
            void Promise.resolve()
                .then(() => release())
                .catch(() => {});
            return;
        }

        if (this.releaseResource) {
            throw new Error(`Ressource déjà liée à ${token.surface}#${token.generation}`);
        }

        this.releaseResource = release;
        updateLeaseState({ phase: 'bound' });
    }

    /**
     * Annule une demande en cours ou une réservation avant ou pendant son attribution.
     */
    cancel(surface: string, instanceId: string): void {
        const requestId = `${surface}:${instanceId}`;
        const tracker = this.activeRequests.get(requestId);
        if (tracker) {
            tracker.cancelled = true;
            this.activeRequests.delete(requestId);
            this.notifyIdle();
        }

        // Si la lease actuelle correspond à cette instance et n'est pas encore liée à une ressource
        if (
            this.currentLease &&
            this.currentLease.surface === surface &&
            this.currentLease.instanceId === instanceId
        ) {
            void this.release(this.currentLease).catch(() => {});
        }
    }

    /**
     * Libère le token propriétaire et détruit sa ressource associée avec preuve de perte.
     */
    release(token: LeaseToken): Promise<void> {
        if (!this.matchesCurrent(token)) return Promise.resolve();
        return this.releaseCurrent(token);
    }

    reset(): void {
        this.currentLease = null;
        this.releaseResource = null;
        this.activeRequests.clear();
        this.idleResolvers.clear();
        this.queue = Promise.resolve();
        resetLeaseStore();
    }

    private matchesCurrent(token: LeaseToken): boolean {
        return (
            this.currentLease !== null &&
            this.currentLease.surface === token.surface &&
            this.currentLease.instanceId === token.instanceId &&
            this.currentLease.generation === token.generation
        );
    }

    private async releaseCurrent(token: LeaseToken): Promise<void> {
        if (!this.matchesCurrent(token)) return;

        const currentSnapshot = getLeaseSnapshot();
        const wasBlocked = currentSnapshot.blockedReason;
        updateLeaseState({ phase: 'releasing' });

        const release = this.releaseResource;

        try {
            if (release) {
                await this.withTimeout(Promise.resolve(release()), token);
            }

            if (!this.matchesCurrent(token)) {
                throw new Error('Lease remplacée pendant sa libération');
            }

            this.releaseResource = null;
            this.currentLease = null;

            updateLeaseState({
                currentToken: null,
                phase: wasBlocked ? 'blocked' : 'idle',
            });
            if (!wasBlocked) {
                this.notifyIdle();
            }
        } catch (error) {
            const reason =
                this.status() === 'blocked'
                    ? currentSnapshot.blockedReason
                    : error instanceof Error
                      ? error.message
                      : 'Libération échouée';

            this.block(reason || 'Échec de libération du contexte WebGL');
            throw error;
        }
    }

    private withTimeout(releasePromise: Promise<void>, token: LeaseToken): Promise<void> {
        return Promise.race([
            releasePromise,
            new Promise<never>((_, reject) => {
                const timer = setTimeout(() => {
                    reject(
                        new Error(
                            `Libération WebGL expirée (> ${this.timeoutMs} ms) pour ${token.surface}#${token.generation}`,
                        ),
                    );
                }, this.timeoutMs);
                // Si la libération résout avant le timeout, le timer est nettoyé
                releasePromise.finally(() => clearTimeout(timer));
            }),
        ]);
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const next = this.queue.then(task, task);
        this.queue = next.then(
            () => {},
            () => {},
        );
        return next;
    }
}

export const globalLeaseController = new LeaseController();
