import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { readMobileDiagnostics, summarizeFrames } from '../../lib/mobileDiagnostics';
import { getInitialDashboardSceneSignal, getSceneMetrics, type SceneMetricsRecord } from '../../lib/sceneMetrics';

/** Opt-in only (?perf=1). No upload, credentials, user IDs, URLs or API payloads. */
export default function PerformancePanel() {
    const location = useLocation();
    const [open, setOpen] = useState(false);
    const [signals, setSignals] = useState(getSceneMetrics);
    const [returns, setReturns] = useState<{ ms: number; start: 'input' | 'route-commit' }[]>([]);
    const [frames, setFrames] = useState<ReturnType<typeof summarizeFrames>>(null);
    const [sampling, setSampling] = useState(false);
    const [sampleAborted, setSampleAborted] = useState(false);
    const [longTasks, setLongTasks] = useState<{ count: number; maxMs: number } | null>(null);
    const lastInput = useRef(0);
    const pending = useRef<{ time: number; start: 'input' | 'route-commit' } | null>(null);
    const hasDashboard = useRef(false);

    useLayoutEffect(() => {
        const dashboard = location.pathname === '/dashboard' || !!matchPath('/squad/:id', location.pathname);
        if (dashboard && hasDashboard.current) {
            const now = performance.now();
            const fromInput = lastInput.current > 0 && now - lastInput.current < 1500;
            pending.current = { time: fromInput ? lastInput.current : now, start: fromInput ? 'input' : 'route-commit' };
        } else pending.current = null;
        if (dashboard) hasDashboard.current = true;
    }, [location.key, location.pathname]);

    useEffect(() => {
        const input = () => { lastInput.current = performance.now(); };
        const signal = (event: Event) => {
            const record = (event as CustomEvent<SceneMetricsRecord>).detail;
            setSignals(previous => [...previous.slice(-49), record]);
            const action = pending.current;
            if (action && record.kind === 'sceneUsable' && record.view === 'dashboard' && record.timestamp >= action.time) {
                setReturns(previous => [...previous.slice(-9), { ms: record.timestamp - action.time, start: action.start }]);
                pending.current = null;
            }
        };
        window.addEventListener('pointerdown', input, true);
        window.addEventListener('keydown', input, true);
        window.addEventListener('beercall:scene-metric', signal);
        performance.setResourceTimingBufferSize?.(2000);
        return () => {
            window.removeEventListener('pointerdown', input, true);
            window.removeEventListener('keydown', input, true);
            window.removeEventListener('beercall:scene-metric', signal);
        };
    }, []);

    useEffect(() => {
        if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
        const observer = new PerformanceObserver(list => {
            const entries = list.getEntries().filter(entry => entry.duration > 50);
            setLongTasks(previous => ({ count: (previous?.count ?? 0) + entries.length,
                maxMs: Math.max(previous?.maxMs ?? 0, ...entries.map(entry => entry.duration)) }));
        });
        observer.observe({ type: 'longtask', buffered: true });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!sampling) return;
        const samples: number[] = [];
        const started = performance.now();
        let previous: number | undefined;
        let request = 0;
        const tick = (time: number) => {
            if (document.hidden) {
                setSampleAborted(true); setSampling(false); return;
            }
            if (previous !== undefined) samples.push(time - previous);
            previous = time;
            if (time - started < 10000) request = requestAnimationFrame(tick);
            else { setFrames(summarizeFrames(samples)); setSampling(false); }
        };
        request = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(request);
    }, [sampling]);

    const exportReport = () => {
        const report = { ...readMobileDiagnostics(), sceneSignals: signals, dashboardReturns: returns,
            interactionFrames: frames, interactionSampleAborted: sampleAborted, longTasks };
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url; link.download = `beercall-perf-${Date.now()}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const firstScene = getInitialDashboardSceneSignal();
    return (
        <aside className="fixed bottom-20 right-2 z-[300] max-w-[calc(100vw-1rem)] text-xs">
            <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
                    className="rounded-lg bg-gray-950 px-3 py-2 font-bold text-white">Mesures</button>
            {open && <section aria-label="Diagnostic de fluidité" className="mt-2 w-72 max-w-full rounded-xl bg-white p-4 text-gray-950 shadow-xl">
                <h2 className="mb-2 font-bold">Diagnostic local — non certifiant</h2>
                <p>Scène initiale : {firstScene ? `${Math.round(firstScene.timestamp)} ms` : 'en attente'}</p>
                <p>Dernier retour : {returns.length ? `${Math.round(returns.at(-1)!.ms)} ms (${returns.at(-1)!.start === 'input' ? 'entrée→scène' : 'route→scène'})` : 'non mesuré'}</p>
                <p>Long Tasks : {longTasks ? `${longTasks.count}, max ${Math.round(longTasks.maxMs)} ms` : 'non mesurées (navigateur)'}</p>
                <p>Frames p95 : {frames ? `${frames.p95Ms.toFixed(1)} ms ; ${frames.over33MsPercent.toFixed(1)} % > 33,4 ms` : 'non mesurées'}</p>
                <button type="button" disabled={sampling} className="mt-3 rounded bg-amber-100 p-2 font-bold disabled:opacity-50"
                        onClick={() => { setSampleAborted(false); setSampling(true); }}>
                    {sampling ? 'Interagis pendant 10 secondes…' : 'Mesurer 10 s d’interaction'}
                </button>
                {sampleAborted && <p role="status">Passe interrompue : application masquée.</p>}
                <button type="button" onClick={exportReport} className="mt-2 block underline">Exporter le relevé JSON</button>
                <button type="button" onClick={() => window.dispatchEvent(new Event('beercall:diagnostics-disable'))}
                        className="mt-2 block underline">Arrêter le diagnostic</button>
                <p className="mt-2 text-gray-600">Aucun envoi. Les compteurs sont des proxys logiciels ; aucun résultat Android n’est déduit d’un relevé iPhone.</p>
            </section>}
        </aside>
    );
}
