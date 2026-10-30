import {useCallback, useId, useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useAvatarViewport, type AvatarViewportSession} from '../../lib/avatarViewportContext';
import {avatarViewSignature, normalizeAvatarConfig, type AvatarViewHandle, type AvatarViewRequest} from '../../lib/avatarViewRegistry';
import type {AvatarConfig} from '../../types/avatar';
import type {AnimationManifest} from '../../types/animationPack';
import type {AvatarSceneMode} from './AvatarScene';

export interface SharedAvatarProps {
    config: AvatarConfig;
    mode?: AvatarSceneMode;
    active?: boolean;
    instanceId?: string;
    view?: string;
    className?: string;
    onFrameSubmitted?: () => void;
    onAnimationsLoaded?: (animations: string[]) => void;
    revision?: string;
}

function SharedAvatarCell({session, config, mode = 'full', active = true, instanceId, view: viewName,
    className = 'w-full h-full relative', onFrameSubmitted, onAnimationsLoaded, revision}: SharedAvatarProps & {session: AvatarViewportSession}) {
    const generatedId = useId();
    const id = `avatar-view-${generatedId}`;
    const container = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const handle = useRef<AvatarViewHandle | null>(null);
    const lastSubmitted = useRef('');
    const pendingRetry = useRef<{key: string; complete: boolean} | undefined>(undefined);
    const [retryKey, setRetryKey] = useState<string>();
    const client = useQueryClient();
    const cache = client.getQueryCache();
    const subscribeCache = useCallback((listener: () => void) => cache.subscribe(listener), [cache]);
    const manifest = useSyncExternalStore(subscribeCache, () => client.getQueryData<AnimationManifest>(['avatar-animations', 'manifest', 1]));
    const animationRevision = revision ?? (manifest ? `${manifest.formatVersion}:${manifest.sourceHash}:${manifest.critical.sha256}` : 'manifest-pending');
    const requestKey = JSON.stringify([mode, normalizeAvatarConfig(config, mode), animationRevision]);
    const snapshot = useSyncExternalStore(session.registry.subscribe, session.registry.getSnapshot, session.registry.getSnapshot);
    const view = snapshot.views.find(candidate => candidate.id === id);
    const job = snapshot.jobs.find(candidate => candidate.id === view?.jobId);

    useLayoutEffect(() => {
        if (manifest?.clips.length) onAnimationsLoaded?.([...manifest.clips]);
    }, [manifest, onAnimationsLoaded]);

    const onFrameCopied = useCallback(() => {
        const current = handle.current && session.registry.getView(handle.current);
        if (!current?.frame || current.frame.signature !== current.signature) return;
        const certification = `${current.frame.signature}:${current.frame.generation}`;
        if (lastSubmitted.current !== certification) {
            lastSubmitted.current = certification;
            onFrameSubmitted?.();
        }
        const retry = pendingRetry.current;
        if (retry?.key === requestKey && retry.complete) {
            pendingRetry.current = undefined;
            setRetryKey(undefined);
        }
    }, [session, onFrameSubmitted, requestKey]);

    useLayoutEffect(() => {
        const node = container.current;
        const target = canvas.current;
        if (!node || !target) return;
        let intersecting = true;
        let pendingMeasure: number | undefined;
        const update = () => {
            if (pendingMeasure !== undefined) cancelAnimationFrame(pendingMeasure);
            pendingMeasure = undefined;
            const rect = node.getBoundingClientRect();
            const request: AvatarViewRequest = {id, config, mode, revision: animationRevision,
                // Layout size is stable while a message entrance scales its DOM.
                width: node.clientWidth || rect.width, height: node.clientHeight || rect.height,
                dpr: Math.min(1.5, window.devicePixelRatio || 1), target,
                visible: active && intersecting && rect.width > 0 && rect.height > 0, onFrameCopied};
            const previous = handle.current && session.registry.getView(handle.current);
            if (previous && previous.signature === avatarViewSignature(request) && previous.visible === request.visible &&
                previous.target === target && previous.onFrameCopied === onFrameCopied && previous.jobId) return;
            if (handle.current) session.registry.update(handle.current, request);
            else handle.current = session.registry.register(request);
        };
        const schedule = () => {
            if (pendingMeasure === undefined) pendingMeasure = requestAnimationFrame(update);
        };
        update();
        // Updating the shared source size synchronously during observer delivery
        // can trigger WebKit's ResizeObserver loop. Coalesce outside that phase.
        const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : undefined;
        resize?.observe(node);
        const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
            const entry = entries.find(entry => entry.target === node);
            if (entry) { intersecting = entry.isIntersecting; update(); }
        }) : undefined;
        intersection?.observe(node);
        return () => {
            resize?.disconnect(); intersection?.disconnect();
            if (pendingMeasure !== undefined) cancelAnimationFrame(pendingMeasure);
        };
    }, [session, id, config, mode, animationRevision, active, onFrameCopied]);

    useLayoutEffect(() => () => {
        if (handle.current) session.registry.unregister(handle.current);
        handle.current = null;
        pendingRetry.current = undefined;
    }, [session]);

    const hasFrame = !!view?.frame;
    const ready = view?.frame?.signature === view?.signature && !!view?.frame && view.frame.generation === session.registry.generation;
    const retrying = retryKey === requestKey;
    const phase = job?.presentation?.phase;
    const animationError = phase === 'critical-error' || phase === 'deferred-error';
    const modelError = !!job?.modelError;
    const retryAnimations = () => {
        const command = job?.presentation?.retryAnimations;
        if (!command || retrying) return;
        const retry = {key: requestKey, complete: false};
        pendingRetry.current = retry;
        setRetryKey(requestKey);
        void command().then(() => {
            if (pendingRetry.current === retry) retry.complete = true;
        }, () => {
            if (pendingRetry.current !== retry) return;
            pendingRetry.current = undefined;
            setRetryKey(undefined);
        });
    };
    return <div ref={container} className={className} data-avatar-view={id} data-avatar-instance={instanceId}
        data-avatar-view-name={viewName} data-avatar-signature={view?.signature}
        data-avatar-state={session.registry.contextStatus === 'lost' ? 'context-lost' : modelError ? 'model-error' : animationError ? phase : ready && !retrying ? 'frame-ready' : 'preparing'}
        data-avatar-framing={mode !== 'full' ? ready && !retrying ? 'ready' : 'pending' : undefined}
        data-avatar-framing-info={job?.framing ? JSON.stringify(job.framing) : undefined}>
        <canvas ref={canvas} className="h-full w-full" aria-hidden="true" data-avatar-cell="2d"/>
        {!hasFrame && !animationError && !modelError && <div role="status" className="absolute inset-0 flex items-center justify-center">
            <span className="sr-only">Préparation de l’avatar</span>
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-beer border-t-transparent"/>
        </div>}
        {animationError && <div role="alert" className="absolute inset-x-0 bottom-0 rounded-lg bg-amber-50/95 p-2 text-center text-xs text-amber-900">
            <p>{phase === 'critical-error' ? 'Erreur de chargement des animations' : 'Animations différées indisponibles'}</p>
            <button type="button" disabled={retrying} onClick={retryAnimations} className="font-bold underline disabled:opacity-50">Réessayer les animations</button>
        </div>}
        {modelError && <div role="alert" className="absolute inset-x-0 bottom-0 rounded-lg bg-amber-50/95 p-2 text-center text-xs text-amber-900">
            <p>Modèle d’avatar indisponible</p>
            <button type="button" onClick={() => job?.retryModels?.()} className="font-bold underline">Réessayer le modèle</button>
        </div>}
        {session.registry.contextStatus === 'lost' && <div role="status" aria-label="Contexte WebGL perdu"
            className="absolute inset-x-0 bottom-0 rounded-lg bg-amber-50/95 p-2 text-center text-xs text-amber-900">
            <p>Affichage des avatars suspendu (WebGL)</p>
            <button type="button" disabled={session.registry.retryPending} onClick={() => session.registry.retrySource()}
                className="font-bold underline disabled:opacity-50">Réessayer l’affichage</button>
        </div>}
        {session.registry.contextStatus === 'restoring' && !ready && <div role="status" aria-label="Restauration de l’affichage"
            className="absolute inset-x-0 bottom-0 rounded-lg bg-amber-50/95 p-2 text-center text-xs text-amber-900">Restauration des avatars…</div>}
    </div>;
}

export default function SharedAvatar(props: SharedAvatarProps) {
    const session = useAvatarViewport();
    if (!session) return <div className={props.className} role="alert">
        Avatar temporairement indisponible
        {import.meta.env.DEV && <span className="sr-only">AvatarViewportProvider manquant</span>}
    </div>;
    return <SharedAvatarCell {...props} session={session}/>;
}
