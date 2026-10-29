import {useEffect, useLayoutEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import AvatarViewportProvider from '../../src/components/3D/AvatarViewportProvider';
import SharedAvatar from '../../src/components/3D/SharedAvatar';
import {useAvatarViewport} from '../../src/lib/avatarViewportContext';
import type {AvatarConfig} from '../../src/types/avatar';
import {HardwareMeasurements, type HardwareProtocol, type ProbeLoad, type ProbeOrientation} from './measurements';
import '../../src/index.css';

declare const __BEERCALL_AVATAR_PROBE_SHA__: string;
const measurements = new HardwareMeasurements();
const sources = new Set<HTMLCanvasElement>();
const lostSources = new Set<HTMLCanvasElement>();
let sourceLosses = 0;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const readContext = originalGetContext as (this: HTMLCanvasElement, type: string, options?: unknown) => RenderingContext | null;
HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, options?: unknown) {
    const result = readContext.call(this, type, options);
    if ((type === 'webgl' || type === 'webgl2') && result && !sources.has(this)) {
        sources.add(this); measurements.recordContext(performance.now(), 'created');
        this.addEventListener('webglcontextlost', () => {
            if (!lostSources.has(this)) { lostSources.add(this); sourceLosses++; measurements.recordContext(performance.now(), 'lost'); }
        });
        this.addEventListener('webglcontextrestored', () => {
            lostSources.delete(this); measurements.recordContext(performance.now(), 'restored');
        });
    }
    return result;
} as typeof originalGetContext;
measurements.recordVisibility(performance.now(), !document.hidden);
document.addEventListener('visibilitychange', () => measurements.recordVisibility(performance.now(), !document.hidden));

const WORKER: AvatarConfig = {gender: 'Men', head: 'Men_head_Worker_0', body: 'Men_body_Worker_0', legs: 'Men_legs_Worker_0',
    feet: 'Men_feet_Worker_0', animation: 'Idle'};
const SCIFI: AvatarConfig = {gender: 'Women', head: 'Women_head_SciFi_150', body: 'Women_body_SciFi_300', legs: 'Women_legs_SciFi_200',
    feet: 'Women_feet_SciFi_100', animation: 'Idle'};
const BODIES = [WORKER, {...WORKER, accessory: 'Men_accessory_Kart_3000'}, {...WORKER, accessory: 'Men_accessory_RacingBulls_5000'},
    {...SCIFI, accessory: 'Women_accessory_Charmander_2000'}];
const HEADS = [WORKER, SCIFI, {gender: 'Women', head: 'Women_head_Worker_0', animation: 'Idle'} satisfies AvatarConfig];
const LABELS = ['Worker', 'Worker + Kart', 'Worker + RacingBulls', 'Women SciFi + Charmander'];
const orientation = (): ProbeOrientation => window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';

function Monitor({load, currentOrientation}: {load: ProbeLoad; currentOrientation: ProbeOrientation}) {
    const session = useAvatarViewport();
    useEffect(() => {
        if (!session) return;
        const sample = () => {
            const snapshot = session.registry.getSnapshot();
            measurements.setExpectedViews(snapshot.views.map(view => view.id));
            const buffers = new Set<HTMLCanvasElement>(snapshot.views.map(view => view.target));
            snapshot.jobs.forEach(job => { if (job.lastFrame) buffers.add(job.lastFrame); });
            const memory = (performance as Performance & {memory?: {usedJSHeapSize: number}}).memory;
            measurements.recordSnapshot({timestamp: performance.now(), sourcesCreated: sources.size, sourcesLive: sources.size - lostSources.size,
                sourcesLost: sourceLosses, assemblies: snapshot.jobs.length,
                hiddenAssemblies: snapshot.jobs.filter(job => !session.registry.isActive(job)).length,
                buffers2D: buffers.size, bufferAreaPixels: [...buffers].reduce((total, canvas) => total + canvas.width * canvas.height, 0),
                views: snapshot.views.map(view => ({id: view.id, width: view.width, height: view.height, dpr: view.dpr})),
                jsHeapBytes: memory?.usedJSHeapSize ?? 'inconnue', nativeMemory: 'inconnue'});
        };
        sample();
        const unsubscribeRegistry = session.registry.subscribe(() => measurements.setExpectedViews(session.registry.getSnapshot().views.map(view => view.id)));
        const unsubscribeMetrics = session.subscribeMetrics(metric => measurements.recordMetric(metric));
        const timer = window.setInterval(sample, 1000); // Observation only, never paints/certifies a frame.
        return () => { unsubscribeRegistry(); unsubscribeMetrics(); window.clearInterval(timer); };
    }, [session, load, currentOrientation]);
    return null;
}

function LoadViews({load}: {load: ProbeLoad}) {
    if (load === 'bodies') return <div className="grid w-max grid-cols-2 gap-3" data-testid="probe-load">
        {BODIES.map((config, index) => <div key={`body-${index}`}>
            <div className="h-40 w-32 overflow-hidden rounded-2xl bg-white shadow"><SharedAvatar config={config} mode="thumbnail" instanceId={`body-${index}`}/></div>
            <p className="mt-1 w-32 text-xs text-slate-600">{LABELS[index]}</p>
        </div>)}
    </div>;
    if (load === 'heads') return <div className="grid w-max grid-cols-5 gap-1" data-testid="probe-load">
        {Array.from({length: 30}, (_, index) => <div key={`head-${index}`} className="h-9 w-9 overflow-hidden rounded-full bg-white">
            <SharedAvatar config={HEADS[index % 3]} mode="head" instanceId={`head-${index}`}/>
        </div>)}
    </div>;
    return <div className="relative h-[422px] w-[390px] shrink-0 bg-white" data-testid="probe-load">
        <SharedAvatar config={SCIFI} mode="profile" instanceId="profile"/>
        <div className="absolute bottom-3 right-3 h-32 w-24 rounded-xl bg-amber-50 shadow">
            <SharedAvatar config={WORKER} mode="full" instanceId="player"/>
        </div>
    </div>;
}

function ProtocolForm({onSave}: {onSave: (protocol: HardwareProtocol | null) => void}) {
    return <details className="rounded-xl bg-white p-3 text-sm">
        <summary className="cursor-pointer font-bold">H04 — seuils proposés, non approuvés par défaut</summary>
        <form className="mt-3 grid gap-2" onSubmit={event => {
            event.preventDefault(); const data = new FormData(event.currentTarget);
            if (!data.has('approved')) { onSave(null); return; }
            onSave({approved: true, approvedAt: new Date().toISOString(), device: String(data.get('device')), ios: String(data.get('ios')),
                mode: data.get('mode') === 'pwa' ? 'pwa' : 'tab', certificateTrusted: data.has('certificate'), lanAuthorized: data.has('lan'),
                minFps: Number(data.get('fps')), cycleP95MaxMs: Number(data.get('cycle')), intervalP95MaxMs: Number(data.get('p95')),
                intervalMaxMs: Number(data.get('max')), durationMs: 60_000, windowMs: 10_000});
        }}>
            <label>Modèle iPhone <input name="device" required className="w-full rounded border p-1"/></label>
            <label>Version iOS/Safari <input name="ios" required className="w-full rounded border p-1"/></label>
            <label>Mode <select name="mode" className="rounded border p-1"><option value="tab">Onglet Safari</option><option value="pwa">Mode autonome déclaré</option></select></label>
            <label><input name="certificate" type="checkbox"/> Certificat HTTPS approuvé sur cet appareil</label>
            <label><input name="lan" type="checkbox"/> Accès LAN autorisé par l’utilisateur</label>
            <label>Cadence minimale par vue (copies/s) <input name="fps" type="number" min="1" step="0.1" defaultValue="28.5" required className="w-24 rounded border p-1"/></label>
            <label>Cycle p95 maximal (ms) <input name="cycle" type="number" min="1" step="0.1" defaultValue="25" required className="w-24 rounded border p-1"/></label>
            <label>Intervalle p95 maximal (ms) <input name="p95" type="number" min="1" step="0.1" defaultValue="66.7" required className="w-24 rounded border p-1"/></label>
            <label>Trou maximal (ms) <input name="max" type="number" min="1" step="0.1" defaultValue="250" required className="w-24 rounded border p-1"/></label>
            <p>60 s préparées continues au premier plan par charge/orientation, fenêtres complètes de 10 s. Conserver les échecs et toutes les séries.</p>
            <label><input name="approved" type="checkbox"/> H04 a été explicitement approuvée et sera consignée au journal du plan.</label>
            <button type="submit" className="rounded bg-amber-600 p-2 font-bold text-white">Consigner les valeurs H04</button>
        </form>
    </details>;
}

export default function Probe() {
    const [client] = useState(() => new QueryClient());
    const [load, setLoad] = useState<ProbeLoad>('bodies');
    const [currentOrientation, setOrientation] = useState(orientation);
    const [protocol, setProtocol] = useState<HardwareProtocol | null>(null);
    const [clock, setClock] = useState(() => performance.now());
    const [clicks, setClicks] = useState(0);
    useLayoutEffect(() => { measurements.startRun(load, currentOrientation, performance.now()); }, [load, currentOrientation]);
    useEffect(() => {
        const resize = () => setOrientation(orientation());
        window.addEventListener('resize', resize);
        const timer = window.setInterval(() => setClock(performance.now()), 1000);
        return () => { window.removeEventListener('resize', resize); window.clearInterval(timer); };
    }, []);
    const current = measurements.runs.at(-1);
    const report = current && measurements.report(current, clock, protocol);
    const exportJson = () => {
        const now = performance.now();
        const data = {sha: __BEERCALL_AVATAR_PROBE_SHA__, exportedAt: new Date().toISOString(), userAgent: navigator.userAgent,
            iosCommunique: protocol?.ios ?? 'inconnu', deviceCommunique: protocol?.device ?? 'inconnu', protocol,
            viewport: {width: window.innerWidth, height: window.innerHeight, deviceDpr: window.devicePixelRatio, maxAppDpr: 1.5},
            timing: 'CPU/synchronisation autour de render/drawImage ; ni durée GPU physique ni mesure de dalle',
            coldCondition: 'phase cold = préparation initiale de la vue ; cache HTTP matériel non attesté, à consigner séparément',
            nativeMemory: 'inconnue', visibility: measurements.visibility, contextEvents: measurements.contextEvents,
            reports: measurements.runs.map(run => measurements.report(run, now, protocol)), rawRuns: measurements.runs};
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
        const link = document.createElement('a'); link.href = url; link.download = `avatar-hardware-${__BEERCALL_AVATAR_PROBE_SHA__}-${Date.now()}.json`;
        link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return <QueryClientProvider client={client}><AvatarViewportProvider>
        <Monitor load={load} currentOrientation={currentOrientation}/>
        <main className="h-dvh overflow-auto bg-slate-100 font-sans text-slate-900" data-tick={clock}>
            <header className="sticky top-0 z-30 grid gap-1 bg-slate-900 p-2 text-xs text-white">
                <p>BeerCall · banc local · <span data-testid="probe-sha">{__BEERCALL_AVATAR_PROBE_SHA__}</span></p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setLoad('bodies')} className="rounded bg-slate-700 px-2 py-1">4 corps</button>
                    <button type="button" onClick={() => setLoad('heads')} className="rounded bg-slate-700 px-2 py-1">30 têtes</button>
                    <button type="button" onClick={() => setLoad('profile-player')} className="rounded bg-slate-700 px-2 py-1">Profil + joueur</button>
                    <button type="button" onClick={event => {
                        const eventTime = event.timeStamp; setClicks(value => value + 1);
                        requestAnimationFrame(() => {
                            const now = performance.now();
                            measurements.recordControl(now, eventTime > 0 && eventTime <= now && now - eventTime < 60_000 ? now - eventTime : 'inconnue');
                        });
                    }} className="rounded bg-amber-500 px-2 py-1 text-slate-950">Réactivité {clicks}</button>
                    <button type="button" onClick={exportJson} className="rounded bg-white px-2 py-1 text-slate-900">Exporter JSON</button>
                </div>
                <p data-testid="probe-verdict">{load} · {currentOrientation} · {report?.verdict ?? 'not-qualified'} · {Math.floor((report?.elapsedPreparedMs ?? 0) / 1000)} s préparées</p>
            </header>
            <section className="grid gap-4 p-2">
                <div className="max-w-full overflow-x-auto"><LoadViews key={load} load={load}/></div>
                <p className="text-xs">Vrais FBX/animations publics, sans App/Firebase/compte. Aucune lecture de pixels dans la mesure. Ne pas exporter pendant les 60 s mesurées ; garder les vues entièrement visibles.</p>
                <ProtocolForm onSave={setProtocol}/>
                <details className="rounded-xl bg-white p-3 text-xs"><summary>Mesures par vue, fenêtres et mémoire inconnue</summary>
                    <pre className="max-w-full overflow-auto whitespace-pre-wrap">{JSON.stringify(report, null, 2)}</pre>
                </details>
            </section>
        </main>
    </AvatarViewportProvider></QueryClientProvider>;
}

createRoot(document.getElementById('root')!).render(<Probe/>);
