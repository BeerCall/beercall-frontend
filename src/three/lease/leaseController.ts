/**
 * B10 — Contrôleur global de lease WebGL (CHAL-02).
 *
 * Garantit l'existence d'au plus `capacity` contextes WebGL actifs.
 * Capacité 1 par défaut (comportement historique) ; l'application utilise 2
 * pour garder la carte MapLibre montée tout en laissant un slot à three.js.
 * Pas de préemption aveugle : request attend qu'un slot soit libéré.
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
import { webglStats } from './webgl';

export type ReleaseFunction = () => Promise<void> | void;

interface LeaseEntry {
    token: LeaseToken;
    release: ReleaseFunction | null;
}

export class LeaseController {
    private leases = new Map<number, LeaseEntry>();
    private generation = 0;
    private queue: Promise<void> = Promise.resolve();
    private activeRequests = new Map<string, { cancelled: boolean }>();
    private idleResolvers = new Set<() => void>();
    private releasePromises = new Map<number, Promise<void>>();
    private readonly timeoutMs: number;
    private readonly capacity: number;

    constructor(timeoutMs = 2_000, capacity = 1) {
        this.timeoutMs = timeoutMs;
        this.capacity = Math.max(1, Math.floor(capacity));
    }

    /** Dernier token accordé (diagnostic et compatibilité mono-slot). */
    current(): LeaseToken | null {
        const entries = [...this.leases.values()];
        return entries.length > 0 ? entries[entries.length - 1].token : null;
    }

    /** Tous les tokens actifs, dans l'ordre d'attribution. */
    tokens(): LeaseToken[] {
        return [...this.leases.values()].map((entry) => entry.token);
    }

    /** Vrai si ce token fait partie des contextes actuellement autorisés. */
    isCurrent(token: LeaseToken): boolean {
        const entry = this.leases.get(token.generation);
        return Boolean(
            entry &&
                entry.token.surface === token.surface &&
                entry.token.instanceId === token.instanceId,
        );
    }

    status(): LeasePhase {
        return getLeaseSnapshot().phase;
    }

    block(reason: string): void {
        if (getLeaseSnapshot().phase === 'blocked') return;
        // Un blocage est une panne : il doit être visible dans la console.
        console.error('[lease] Contexte WebGL bloqué', { reason });
        updateLeaseState({
            phase: 'blocked',
            blockedReason: reason,
        });
        // Réveiller les demandes en attente pour qu'elles échouent explicitement
        // au lieu de rester suspendues indéfiniment.
        this.notifyIdle();
    }

    private waitForIdle(): Promise<void> {
        if (this.leases.size < this.capacity && getLeaseSnapshot().phase !== 'blocked') {
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

    private publish(phase: LeasePhase): void {
        const tokens = this.tokens();
        updateLeaseState({
            tokens,
            currentToken: tokens.length > 0 ? tokens[tokens.length - 1] : null,
            phase,
        });
    }

    private phaseForRemaining(): LeasePhase {
        if (this.leases.size === 0) return 'idle';
        return [...this.leases.values()].some((entry) => entry.release)
            ? 'bound'
            : 'reserved';
    }

    private findLease(surface: string, instanceId: string): LeaseEntry | null {
        for (const entry of this.leases.values()) {
            if (entry.token.surface === surface && entry.token.instanceId === instanceId) {
                return entry;
            }
        }
        return null;
    }

    private getEntry(token: LeaseToken): LeaseEntry | null {
        const entry = this.leases.get(token.generation);
        if (
            entry &&
            entry.token.surface === token.surface &&
            entry.token.instanceId === token.instanceId
        ) {
            return entry;
        }
        return null;
    }

    /**
     * Demande l'accès à un slot WebGL pour une surface et un ID d'instance donnés.
     * Attend dans une file FIFO sérialisée qu'un propriétaire libère son contexte
     * quand la capacité est atteinte.
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

            // Si cette instance possède déjà un slot
            const existing = this.findLease(surface, instanceId);
            if (existing) {
                this.activeRequests.delete(requestId);
                return existing.token;
            }

            // Pas de préemption aveugle : attendre qu'un slot se libère
            while (this.leases.size >= this.capacity) {
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

            this.leases.set(token.generation, { token, release: null });
            this.activeRequests.delete(requestId);
            this.publish(this.phaseForRemaining());

            return token;
        });
    }

    /**
     * Lie la fonction de libération de la ressource WebGL dès sa création synchrone.
     * Si le token est périmé ou la lease bloquée, détruit immédiatement la ressource orpheline.
     */
    attach(token: LeaseToken, release: ReleaseFunction): void {
        const entry = this.getEntry(token);
        const currentPhase = getLeaseSnapshot().phase;

        if (!entry || currentPhase === 'blocked') {
            // Ressource créée en retard ou token annulé : nettoyage immédiat
            void Promise.resolve()
                .then(() => release())
                .catch((error) => {
                    console.error('[lease] Libération de la ressource orpheline échouée', { token, error });
                });
            return;
        }

        if (entry.release) {
            // Ressource déjà liée pour ce token (idempotent lors des re-renders Fiber)
            return;
        }

        entry.release = release;
        this.publish('bound');
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

        // Si un slot actif correspond à cette instance et n'est pas déjà en libération
        const entry = this.findLease(surface, instanceId);
        if (entry && !this.releasePromises.has(entry.token.generation)) {
            void this.release(entry.token).catch((error) => {
                console.error('[lease] Libération annulée échouée', { surface, instanceId, error });
            });
        }
    }

    /**
     * Libère le token propriétaire et détruit sa ressource associée avec preuve de perte.
     */
    release(token: LeaseToken): Promise<void> {
        if (!this.getEntry(token)) return Promise.resolve();

        // Une même libération peut être demandée plusieurs fois (cleanup React
        // + corps d'effet, cancel externe...) : on ne doit jamais exécuter
        // deux fois la destruction ni bloquer la lease pour ce motif.
        const existing = this.releasePromises.get(token.generation);
        if (existing) return existing;

        const tracked = this.releaseEntry(token).finally(() => {
            this.releasePromises.delete(token.generation);
        });
        this.releasePromises.set(token.generation, tracked);
        return tracked;
    }

    reset(): void {
        this.leases.clear();
        this.activeRequests.clear();
        this.idleResolvers.clear();
        this.releasePromises.clear();
        this.queue = Promise.resolve();
        resetLeaseStore();
    }

    private async releaseEntry(token: LeaseToken): Promise<void> {
        const entry = this.getEntry(token);
        if (!entry) return;

        const wasBlocked = getLeaseSnapshot().phase === 'blocked';
        this.publish('releasing');

        try {
            if (entry.release) {
                await this.withTimeout(Promise.resolve(entry.release()), token);
            }

            if (!this.getEntry(token)) {
                // Contrôleur réinitialisé pendant la libération : rien à faire.
                return;
            }

            this.leases.delete(token.generation);
            this.publish(wasBlocked ? 'blocked' : this.phaseForRemaining());
            if (!wasBlocked) {
                this.notifyIdle();
            }
        } catch (error) {
            const reason =
                this.status() === 'blocked'
                    ? getLeaseSnapshot().blockedReason
                    : error instanceof Error
                      ? error.message
                      : 'Libération échouée';

            console.error('[lease] Libération WebGL échouée', {
                token,
                reason,
                error,
                activeContexts: webglStats().active,
            });

            if (!this.getEntry(token)) {
                // Slot déjà libéré, libération concurrente déjà traitée ou
                // contrôleur réinitialisé : rien à bloquer.
                return;
            }

            if (!entry.release) {
                // Aucune ressource attachée : rien à détruire, le slot est
                // réellement libre malgré l'échec rapporté.
                this.leases.delete(token.generation);
                this.publish(wasBlocked ? 'blocked' : this.phaseForRemaining());
                if (!wasBlocked) {
                    this.notifyIdle();
                }
                return;
            }

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

// P0: mono-slot PoC. Seul three.js (Profil ou Mondes) consomme la lease ;
// la carte MapLibre est créée hors lease et retenue par PersistentDashboard.
export const globalLeaseController = new LeaseController(2_000, 1);
