export type AvatarPresentationPhase = 'critical-loading' | 'critical-error' | 'ready' | 'deferred-error';
export type AvatarPresentationError = 'animation-critical-unavailable' | 'animation-deferred-unavailable';

export interface AvatarPresentationState {
    readonly phase: AvatarPresentationPhase;
    readonly error?: AvatarPresentationError;
    readonly active: boolean;
    /** These commands belong only to this mounted assembly/signature. */
    readonly retryAnimations: () => Promise<void>;
    readonly notifyFrameCopied: () => void;
}

export interface AvatarPresentationOptions {
    mode: 'shared';
    active: boolean;
    /** Keep this callback stable for the lifetime of the scene. */
    onChange: (state: AvatarPresentationState | null) => void;
}

interface PresentationUpdate {
    phase: AvatarPresentationPhase;
    error?: AvatarPresentationError;
    active: boolean;
    canNotifyInitialFrame: boolean;
    retry: () => Promise<void>;
    notifyInitialFrame: () => void;
}

/** A ready animation pack is not a pixel certificate. Only the copying job calls notifyFrameCopied. */
export function createAvatarPresentationLease() {
    let current: PresentationUpdate | undefined;
    let snapshot: AvatarPresentationState | undefined;
    let revoked = false;
    let retrying: Promise<void> | undefined;
    const retryAnimations = (): Promise<void> => {
        if (revoked || !current) return Promise.resolve();
        if (retrying) return retrying;
        const retry = current.retry;
        retrying = Promise.resolve().then(() => { if (!revoked) return retry(); })
            .finally(() => { retrying = undefined; });
        return retrying;
    };
    const notifyFrameCopied = () => {
        if (!revoked && current?.active && current.canNotifyInitialFrame) current.notifyInitialFrame();
    };
    return {
        update(next: PresentationUpdate): AvatarPresentationState | undefined {
            if (revoked) return undefined;
            current = next;
            if (!snapshot || snapshot.phase !== next.phase || snapshot.active !== next.active || snapshot.error !== next.error) {
                snapshot = { phase: next.phase, active: next.active, error: next.error, retryAnimations, notifyFrameCopied };
            }
            return snapshot;
        },
        revoke() { revoked = true; current = undefined; snapshot = undefined; },
    };
}
