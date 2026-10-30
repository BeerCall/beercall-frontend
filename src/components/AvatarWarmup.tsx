import {useCallback, useEffect, useRef, useSyncExternalStore} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useUserStore} from '../store/useUserStore';
import {useProfile, type UserProfile} from '../hooks/useProfile';
import {useConnections} from '../hooks/useConnections';
import {preloadAvatarAnimations} from '../hooks/useAvatarAnimations';
import {MODELS_URL} from '../lib/api';
import {avatarViewSignature, type AvatarViewHandle, type AvatarViewRequest} from '../lib/avatarViewRegistry';
import {useAvatarViewport, type AvatarViewportSession} from '../lib/avatarViewportContext';
import type {AvatarConfig} from '../types/avatar';
import type {AnimationManifest} from '../types/animationPack';
import AvatarResourcePreparation from './AvatarResourcePreparation';

type Demand = Omit<AvatarViewRequest, 'id' | 'target' | 'visible' | 'onFrameCopied'> & {player: boolean};

function SessionWarmup({session}: {session: AvatarViewportSession}) {
    const client = useQueryClient();
    const profile = useProfile();
    const connections = useConnections();
    const cache = client.getQueryCache();
    const subscribe = useCallback((listener: () => void) => cache.subscribe(listener), [cache]);
    useSyncExternalStore(subscribe, () => cache.getAll()
        .filter(query => query.queryKey[0] === 'profile' || query.queryKey[0] === 'avatar-animations')
        .map(query => `${query.queryHash}:${query.state.dataUpdateCount}`).join('|'));
    const resources = useSyncExternalStore(session.preparation.subscribe, session.preparation.getSnapshot, session.preparation.getSnapshot);
    const registrySnapshot = useSyncExternalStore(session.registry.subscribe, session.registry.getSnapshot, session.registry.getSnapshot);
    const handles = useRef(new Map<string, AvatarViewHandle>());
    const demandSequence = useRef(0);
    useEffect(() => {
        void preloadAvatarAnimations(client);
        void import('../pages/Profile.tsx').catch(() => {});
        void import('../pages/Connections').catch(() => {});
        void import('../pages/ChatPage').catch(() => {});
    }, [client]);

    const demands = (() => {
        const manifest = client.getQueryData<AnimationManifest>(['avatar-animations', 'manifest', 1]);
        const revision = manifest ? `${manifest.formatVersion}:${manifest.sourceHash}:${manifest.critical.sha256}` : 'manifest-pending';
        const result = new Map<string, Demand>();
        const add = (config: AvatarConfig, mode: Demand['mode'], width: number, height: number, player: boolean) => {
            if (!['head', 'body', 'legs', 'feet', 'accessory'].some(part => typeof config[part] === 'string' && config[part] && config[part] !== 'none')) return;
            if (mode === 'head' && (!config.head || config.head === 'none')) return;
            const demand: Demand = {config, mode, width, height, dpr: Math.min(1.5, window.devicePixelRatio || 1), revision, player};
            const signature = avatarViewSignature(demand);
            if (!result.has(signature)) result.set(signature, demand);
        };
        if (profile.data?.avatar) {
            add(profile.data.avatar, 'full', 96, 128, true);
            add(profile.data.avatar, 'profile', window.innerWidth, Math.max(1, Math.round(window.innerHeight / 2 - 132)), true);
        }
        const known: AvatarConfig[] = [...(connections.data ?? []).map(connection => connection.avatar)];
        for (const query of cache.findAll({queryKey: ['profile']})) {
            const data = query.state.data as UserProfile | undefined;
            if (data?.avatar && data !== profile.data) known.push(data.avatar);
        }
        for (const config of known) {
            // Connections cards wrap thumbnails in w-24 h-32 / min-[400px]:w-32 min-[400px]:h-40 with border-2 (4px border).
            add(config, 'thumbnail', window.innerWidth >= 400 ? 124 : 92, window.innerWidth >= 400 ? 156 : 124, false);
            add(config, 'head', 36, 36, false);
        }
        return result;
    })();

    useEffect(() => {
        for (const [signature, handle] of handles.current) {
            if (!demands.has(signature)) { session.registry.unregister(handle); handles.current.delete(signature); }
        }
        for (const demand of demands.values()) {
            for (const part of ['head', 'body', 'legs', 'feet', 'accessory']) {
                const value = demand.config[part];
                if (typeof value === 'string' && value && value !== 'none' && (demand.mode !== 'head' || part === 'head')) {
                    session.preparation.request(`${MODELS_URL}/${value}.fbx`, demand.player ? 'player' : 'contact');
                }
            }
        }
    }, [session, demands]);

    useEffect(() => {
        let capacity = 2 - [...handles.current.values()].filter(handle => session.registry.getView(handle)?.prepare).length;
        for (const [signature, demand] of demands) {
            if (capacity <= 0) break;
            if (handles.current.has(signature)) continue;
            const urls = (demand.mode === 'head' ? ['head'] : ['head', 'body', 'legs', 'feet', 'accessory'])
                .map(part => demand.config[part]).filter((value): value is string => typeof value === 'string' && !!value && value !== 'none')
                .map(value => `${MODELS_URL}/${value}.fbx`);
            if (!urls.every(url => resources.some(entry => entry.url === url && entry.status === 'ready'))) continue;
            const id = `warmup-${++demandSequence.current}`;
            const target = document.createElement('canvas');
            const request: AvatarViewRequest = {...demand, id, target, visible: false, prepare: true, onFrameCopied: () => {
                const handle = handles.current.get(signature);
                const view = handle && session.registry.getView(handle);
                if (!handle || !view?.prepare) return;
                session.registry.update(handle, {...view, prepare: false});
                performance.mark('beercall:avatar-preparation-ready', {detail: {signature, mode: demand.mode}});
                window.dispatchEvent(new CustomEvent('beercall:avatar-preparation-ready', {detail: {signature, mode: demand.mode}}));
            }};
            const handle = session.registry.register(request);
            handles.current.set(signature, handle);
            capacity--;
        }
    }, [session, demands, resources, registrySnapshot.version]);

    useEffect(() => {
        const owned = handles.current;
        return () => { owned.forEach(handle => session.registry.unregister(handle)); owned.clear(); };
    }, [session]);
    const jobsWithErrors = registrySnapshot.jobs.filter(job => job.presentation?.phase === 'critical-error' || job.presentation?.phase === 'deferred-error');
    const allPrepared = demands.size > 0 && [...demands.keys()].every(signature => {
        return registrySnapshot.views.some(view => view.id.startsWith('warmup-') && view.signature === signature && view.frame?.signature === signature);
    });
    return <>
        <AvatarResourcePreparation/>
        <span hidden data-avatar-preparation-ready={allPrepared ? 'true' : 'false'}/>
        {jobsWithErrors.length > 0 && <div role="status" className="fixed bottom-24 left-4 right-4 z-40 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Préparation des animations interrompue.
            <button type="button" className="ml-2 underline font-bold" onClick={() => {
                for (const job of jobsWithErrors) void job.presentation?.retryAnimations();
            }}>Réessayer les animations</button>
        </div>}
    </>;
}

export default function AvatarWarmup() {
    const authenticated = useUserStore(state => state.isAuthenticated);
    const session = useAvatarViewport();
    return authenticated && session ? <SessionWarmup session={session}/> : null;
}
