export type AvatarPreparationStatus = 'queued' | 'reading' | 'ready' | 'error';
export type AvatarPreparationPriority = 'player' | 'visible' | 'contact' | 'background';

export interface AvatarPreparationEntry {
    readonly url: string;
    readonly priority: AvatarPreparationPriority;
    readonly status: AvatarPreparationStatus;
    /** A reader must return this exact ticket; old retries/sessions cannot settle it. */
    readonly ticket: number;
    readonly error?: 'model-unavailable';
}

const PRIORITY: Record<AvatarPreparationPriority, number> = { player: 0, visible: 1, contact: 2, background: 3 };

/** Session-owned scheduler. It performs no IO: mounted useModel readers settle tickets. */
export class AvatarPreparationQueue {
    private entries = new Map<string, AvatarPreparationEntry>();
    private listeners = new Set<() => void>();
    private snapshot: readonly AvatarPreparationEntry[] = [];
    private nextTicket = 0;
    private cancelled = false;

    getSnapshot = (): readonly AvatarPreparationEntry[] => this.snapshot;

    subscribe = (listener: () => void): (() => void) => {
        if (this.cancelled) return () => {};
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    request(url: string, priority: AvatarPreparationPriority = 'background'): void {
        if (this.cancelled || !url) return;
        const previous = this.entries.get(url);
        if (previous) {
            if (PRIORITY[priority] >= PRIORITY[previous.priority]) return;
            this.entries.set(url, { ...previous, priority });
        } else {
            this.entries.set(url, { url, priority, status: 'queued', ticket: ++this.nextTicket });
        }
        this.publish();
    }

    /** Called after a reader has actually resolved the shared loader cache. */
    ready(url: string, ticket: number): boolean {
        return this.settle(url, ticket, 'ready');
    }

    fail(url: string, ticket: number): boolean {
        return this.settle(url, ticket, 'error');
    }

    retry(url: string): boolean {
        const previous = this.entries.get(url);
        if (this.cancelled || previous?.status !== 'error') return false;
        this.entries.set(url, { url, priority: previous.priority, status: 'queued', ticket: ++this.nextTicket });
        this.publish();
        return true;
    }

    /** Terminal cancellation: no callback can revive the former account's queue. */
    cancelSession(): void {
        if (this.cancelled) return;
        this.cancelled = true;
        this.entries.clear();
        this.snapshot = [];
        const listeners = [...this.listeners];
        this.listeners.clear();
        listeners.forEach(listener => listener());
    }

    private settle(url: string, ticket: number, status: 'ready' | 'error'): boolean {
        const previous = this.entries.get(url);
        if (this.cancelled || previous?.ticket !== ticket || previous.status !== 'reading') return false;
        this.entries.set(url, { ...previous, status, error: status === 'error' ? 'model-unavailable' : undefined });
        this.publish();
        return true;
    }

    private publish(): void {
        let capacity = 2 - [...this.entries.values()].filter(entry => entry.status === 'reading').length;
        const pending = [...this.entries.values()].filter(entry => entry.status === 'queued')
            .sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority] || a.ticket - b.ticket);
        for (const entry of pending) {
            if (capacity-- <= 0) break;
            this.entries.set(entry.url, { ...entry, status: 'reading' });
        }
        this.snapshot = [...this.entries.values()];
        [...this.listeners].forEach(listener => listener());
    }
}
