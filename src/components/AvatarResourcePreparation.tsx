import {Suspense, useEffect, useSyncExternalStore} from 'react';
import {useModel} from '../hooks/useModel';
import {useAvatarViewport, type AvatarViewportSession} from '../lib/avatarViewportContext';
import type {AvatarPreparationEntry} from '../lib/avatarPreparationQueue';
import {AvatarRenderBoundary} from './3D/AvatarRenderBoundary';

function ResourceReader({session, entry}: {session: AvatarViewportSession; entry: AvatarPreparationEntry}) {
    useModel(entry.url);
    useEffect(() => { session.preparation.ready(entry.url, entry.ticket); }, [session, entry.url, entry.ticket]);
    return null;
}

function ResourceFailure({session, entry}: {session: AvatarViewportSession; entry: AvatarPreparationEntry}) {
    useEffect(() => { session.preparation.fail(entry.url, entry.ticket); }, [session, entry.url, entry.ticket]);
    return null;
}

function PreparationReaders({session}: {session: AvatarViewportSession}) {
    const entries = useSyncExternalStore(session.preparation.subscribe, session.preparation.getSnapshot, session.preparation.getSnapshot);
    const failed = entries.filter(entry => entry.status === 'error');
    return <>
        {entries.filter(entry => entry.status === 'reading').map(entry => <AvatarRenderBoundary key={entry.ticket}
            fallback={() => <ResourceFailure session={session} entry={entry}/>}>
            <Suspense fallback={null}><ResourceReader session={session} entry={entry}/></Suspense>
        </AvatarRenderBoundary>)}
        {failed.length > 0 && <div role="status" className="fixed bottom-24 left-4 right-4 z-40 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Préparation des avatars interrompue.
            <button type="button" className="ml-2 underline font-bold" onClick={() => {
                for (const entry of failed) {
                    useModel.clear(entry.url);
                    session.preparation.retry(entry.url);
                }
            }}>Réessayer la préparation des avatars</button>
        </div>}
    </>;
}

/** These Suspense readers share Fiber's PreparedModelLoader cache without mounting a Canvas. */
export default function AvatarResourcePreparation() {
    const session = useAvatarViewport();
    return session ? <PreparationReaders session={session}/> : null;
}
