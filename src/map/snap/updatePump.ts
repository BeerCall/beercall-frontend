/**
 * B09a — pompe d'écriture « au plus un en vol ».
 *
 * Portée depuis `poc/fluidite/src/map/friendMotion.ts` (UpdatePump), sans
 * FriendMotion ni fixtures : un push pendant un envoi remplace l'attente
 * (coalescing) et la dernière valeur part dès que l'envoi courant finit.
 */
export type PumpMetrics = {
    submitted: number;
    coalesced: number;
    completed: number;
    errors: number;
    inFlight: number;
    maxInFlight: number;
    cpuMs: number;
    stopped: boolean;
};

export class UpdatePump<T> {
    private inFlight = false;
    private pending: T | null = null;
    private stopped = false;
    readonly metrics: PumpMetrics = {
        submitted: 0,
        coalesced: 0,
        completed: 0,
        errors: 0,
        inFlight: 0,
        maxInFlight: 0,
        cpuMs: 0,
        stopped: false,
    };

    private readonly send: (value: T) => Promise<void> | void;
    private readonly now: () => number;

    constructor(send: (value: T) => Promise<void> | void, now: () => number = () => performance.now()) {
        this.send = send;
        this.now = now;
    }

    push(value: T): void {
        if (this.stopped) return;
        if (this.inFlight) {
            this.pending = value;
            this.metrics.coalesced += 1;
            return;
        }
        this.start(value);
    }

    stop(): void {
        this.stopped = true;
        this.pending = null;
        this.metrics.stopped = true;
    }

    private start(value: T): void {
        this.inFlight = true;
        this.metrics.inFlight = 1;
        this.metrics.maxInFlight = Math.max(this.metrics.maxInFlight, 1);
        this.metrics.submitted += 1;
        const started = this.now();
        void Promise.resolve(this.send(value)).then(
            () => {
                this.metrics.completed += 1;
            },
            () => {
                this.metrics.errors += 1;
            },
        ).finally(() => {
            this.metrics.cpuMs += this.now() - started;
            this.inFlight = false;
            this.metrics.inFlight = 0;
            const next = this.pending;
            this.pending = null;
            if (!this.stopped && next !== null) this.start(next);
        });
    }
}
