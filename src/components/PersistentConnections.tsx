import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUserStore } from '../store/useUserStore';
import type { SceneMetricsRecord } from '../lib/sceneMetrics';

const Connections = lazy(() => import('../pages/Connections'));

/** Two budgeted thumbnails, prepared only after the map has become interactive.
 * Keep positive layout bounds and the rendered buffers on route changes. Hidden
 * thumbnails stop their frameloops once a correctly framed frame was submitted.
 * AppSession's user key destroys this cache on logout/account change.
 */
export default function PersistentConnections() {
    const authenticated = useUserStore(state => state.isAuthenticated);
    const { pathname } = useLocation();
    const active = pathname === '/connections';
    const onDashboard = pathname === '/dashboard' || /^\/squad\/[^/]+$/.test(pathname);
    const [prepared, setPrepared] = useState(false);
    if (active && !prepared) setPrepared(true);

    useEffect(() => {
        if (!authenticated || !onDashboard || prepared) return;
        let cancel: (() => void) | undefined;
        const schedule = () => {
            if (cancel) return;
            if (typeof window.requestIdleCallback === 'function') {
                const id = window.requestIdleCallback(() => setPrepared(true), { timeout: 1500 });
                cancel = () => window.cancelIdleCallback(id);
            } else {
                const id = window.setTimeout(() => setPrepared(true), 0);
                cancel = () => window.clearTimeout(id);
            }
        };
        const metric = (event: Event) => {
            const record = (event as CustomEvent<SceneMetricsRecord>).detail;
            if (record.view === 'dashboard' && record.kind === 'mapInteractive') schedule();
        };
        window.addEventListener('beercall:scene-metric', metric);
        // The map may have submitted its signal before this effect attached.
        if (performance.getEntriesByName('beercall:mapInteractive').length) schedule();
        return () => {
            window.removeEventListener('beercall:scene-metric', metric);
            cancel?.();
        };
    }, [authenticated, onDashboard, prepared]);

    if (!authenticated || (!active && !prepared)) return null;
    return (
        <div className={`absolute inset-0 ${active ? '' : 'invisible pointer-events-none'}`}
             inert={!active} aria-hidden={!active} data-testid="retained-connections">
            <Suspense fallback={active ? <div role="status">Chargement des connexions…</div> : null}>
                <Connections active={active}/>
            </Suspense>
        </div>
    );
}
