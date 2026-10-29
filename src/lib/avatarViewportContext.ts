import {createContext, useContext} from 'react';
import {AvatarViewRegistry} from './avatarViewRegistry';
import {AvatarPreparationQueue} from './avatarPreparationQueue';

export interface AvatarCopyMetric {
    kind: 'copy' | 'cycle';
    timestamp: number;
    durationMs: number;
    renderMs: number;
    copyMs: number;
    viewId?: string;
    jobId?: string;
    width?: number;
    height?: number;
    dpr?: number;
    copied?: boolean;
    drawCalls?: number;
}

export interface AvatarViewportSession {
    registry: AvatarViewRegistry;
    preparation: AvatarPreparationQueue;
    emitMetric: (metric: AvatarCopyMetric) => void;
    subscribeMetrics: (listener: (metric: AvatarCopyMetric) => void) => () => void;
    dispose: () => void;
}

export const AvatarViewportContext = createContext<AvatarViewportSession | null>(null);

export function createAvatarViewportSession(): AvatarViewportSession {
    const listeners = new Set<(metric: AvatarCopyMetric) => void>();
    const registry = new AvatarViewRegistry();
    const preparation = new AvatarPreparationQueue();
    return {registry, preparation,
        emitMetric: metric => listeners.forEach(listener => listener(metric)),
        dispose: () => { listeners.clear(); preparation.cancelSession(); registry.clearSession(); },
        subscribeMetrics: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }};
}

export function useAvatarViewport() { return useContext(AvatarViewportContext); }
