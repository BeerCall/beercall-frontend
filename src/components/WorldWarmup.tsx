import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUserStore } from '../store/useUserStore';
import type { SceneMetricsRecord } from '../lib/sceneMetrics';

// Import Three/Drei only AFTER the map is interactive, not in the startup bundle.
const PrepareResources = lazy(() => import('./WorldResourcePreparation'));

export default function WorldWarmup() {
    const authenticated = useUserStore(state => state.isAuthenticated);
    const { pathname } = useLocation();
    const onDashboard = pathname === '/dashboard' || /^\/squad\/[^/]+$/.test(pathname);
    const [started, setStarted] = useState(false);
    const [visible, setVisible] = useState(() => !document.hidden);
    useEffect(() => {
        const update = () => setVisible(!document.hidden);
        document.addEventListener('visibilitychange', update);
        return () => document.removeEventListener('visibilitychange', update);
    }, []);
    useEffect(() => {
        if (!authenticated || !onDashboard || !visible || started) return;
        let cancel: (() => void) | undefined;
        const schedule = () => {
            if (cancel) return;
            if (typeof window.requestIdleCallback === 'function') {
                const id = window.requestIdleCallback(() => setStarted(true), { timeout: 5000 });
                cancel = () => window.cancelIdleCallback(id);
            } else {
                const id = window.setTimeout(() => setStarted(true), 500);
                cancel = () => window.clearTimeout(id);
            }
        };
        const metric = (event: Event) => {
            const record = (event as CustomEvent<SceneMetricsRecord>).detail;
            if (record?.view === 'dashboard' && record.kind === 'mapInteractive') schedule();
        };
        window.addEventListener('beercall:scene-metric', metric);
        if (performance.getEntriesByName('beercall:mapInteractive').length) schedule();
        return () => { window.removeEventListener('beercall:scene-metric', metric); cancel?.(); };
    }, [authenticated, onDashboard, visible, started]);
    if (!authenticated || !onDashboard || !visible || !started) return null;
    return <Suspense fallback={null}><PrepareResources/></Suspense>;
}
