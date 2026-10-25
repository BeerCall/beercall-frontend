import { lazy, Suspense, useState } from 'react';
import { matchPath, Route, Routes, useLocation, type Location } from 'react-router-dom';
import { useUserStore } from '../store/useUserStore';
import { DashboardActivityContext } from '../lib/dashboardActivity';

const Dashboard = lazy(() => import('../pages/Dashboard'));

function isDashboard(location: Location): boolean {
    return location.pathname === '/dashboard' || !!matchPath('/squad/:id', location.pathname);
}

/** One retained dashboard, not a cache of pages/squads. Logout destroys the scene. */
function RetainedDashboard() {
    const location = useLocation();
    const active = isDashboard(location);
    const [retained, setRetained] = useState<Location | null>(() => active ? location : null);
    if (active && retained !== location) setRetained(location);
    if (!retained) return null;

    return (
        // Keep positive layout bounds for MapLibre/Fiber while inactive. display:none
        // makes ResizeObserver report 0x0 and forces a resize/reconfigure on return.
        <div className={`absolute inset-0 ${active ? '' : 'invisible opacity-0 pointer-events-none'}`}
             inert={!active} aria-hidden={!active} data-testid="retained-dashboard">
            <DashboardActivityContext.Provider value={active}>
                <Suspense fallback={<div role="status" className="flex h-full items-center justify-center">Chargement…</div>}>
                    {/* Freeze params/location while another page is displayed. */}
                    <Routes location={active ? location : retained}>
                        <Route path="/dashboard" element={<Dashboard/>}/>
                        <Route path="/squad/:id" element={<Dashboard/>}/>
                    </Routes>
                </Suspense>
            </DashboardActivityContext.Provider>
        </div>
    );
}

export default function PersistentDashboard() {
    const authenticated = useUserStore(state => state.isAuthenticated);
    const username = useUserStore(state => state.username);
    return authenticated ? <RetainedDashboard key={username}/> : null;
}
