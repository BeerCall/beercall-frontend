import {lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode} from 'react';
import {AvatarViewportContext, createAvatarViewportSession} from '../../lib/avatarViewportContext';

const Renderer = lazy(() => import('./SharedAvatarRenderer'));

export default function AvatarViewportProvider({children}: {children: ReactNode}) {
    const [session] = useState(createAvatarViewportSession);
    const cleanupEpoch = useRef({epoch: 0});
    const snapshot = useSyncExternalStore(session.registry.subscribe, session.registry.getSnapshot, session.registry.getSnapshot);
    useEffect(() => {
        const lifecycle = cleanupEpoch.current;
        const epoch = ++lifecycle.epoch;
        return () => {
            // React StrictMode replays effects on the same mounted provider.
            // A terminal session reset happens only if no replacement setup ran.
            queueMicrotask(() => {
                if (lifecycle.epoch !== epoch) return;
                session.dispose();
            });
        };
    }, [session]);
    return <AvatarViewportContext.Provider value={session}>
        {children}
        {snapshot.jobs.length > 0 && <Suspense fallback={null}><Renderer session={session}/></Suspense>}
    </AvatarViewportContext.Provider>;
}
