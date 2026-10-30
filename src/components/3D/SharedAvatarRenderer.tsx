import {memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {Canvas, createPortal, useFrame, useThree, type EventManager} from '@react-three/fiber';
import {PerspectiveCamera, Scene, type WebGLRenderer} from 'three';
import AvatarScene, {type AvatarSceneStatus} from './AvatarScene';
import {AvatarRenderBoundary} from './AvatarRenderBoundary';
import {useModel} from '../../hooks/useModel';
import {MODELS_URL} from '../../lib/api';
import type {AvatarPresentationState} from '../../lib/avatarPresentationState';
import type {AvatarRenderJob} from '../../lib/avatarViewRegistry';
import type {AvatarViewportSession} from '../../lib/avatarViewportContext';
import {renderSharedAvatarCycle, sharedAvatarSourceSize} from '../../lib/sharedAvatarFrames';

const noEvents = (): EventManager<HTMLElement> => ({enabled: false, priority: 0, connect: () => {}, disconnect: () => {}});

function ModelFailure({session, job, reset}: {session: AvatarViewportSession; job: AvatarRenderJob; reset: () => void}) {
    useLayoutEffect(() => {
        const token = session.registry.jobToken(job);
        session.registry.setModelError(token, () => {
            for (const part of ['head', 'body', 'legs', 'feet', 'accessory']) {
                const value = job.config[part];
                if (typeof value === 'string' && value && value !== 'none') useModel.clear(`${MODELS_URL}/${value}.fbx`);
            }
            session.registry.setModelError(token);
            reset();
        });
        return () => { session.registry.setModelError(token); };
    }, [session, job, reset]);
    return null;
}

// A view certification updates the registry, not every cached assembly. In
// particular, rerendering Drei ContactShadows resets its one-frame pass counter.
export const SharedAvatarJob = memo(function SharedAvatarJob({session, job, active, generation}: {session: AvatarViewportSession; job: AvatarRenderJob; active: boolean; generation: number}) {
    const scene = useMemo(() => new Scene(), []);
    const camera = useMemo(() => {
        const result = new PerspectiveCamera(45, job.width / Math.max(1, job.height), 0.1, 2000);
        result.position.set(0, 80, 300);
        result.lookAt(0, 80, 0);
        return result;
    }, [job.width, job.height]);
    const token = useMemo(() => ({...session.registry.jobToken(job), generation}), [session, job, generation]);
    useLayoutEffect(() => { session.registry.attachScene(token, scene, camera); }, [session, token, scene, camera]);
    const onStatus = useCallback((status: AvatarSceneStatus | null) => { session.registry.setSceneStatus(token, status); }, [session, token]);
    const onPresentation = useCallback((state: AvatarPresentationState | null) => { session.registry.setPresentation(token, state); }, [session, token]);
    return createPortal(<AvatarRenderBoundary fallback={reset => <ModelFailure session={session} job={job} reset={reset}/>}>
        <AvatarScene config={job.config} mode={job.mode} active={active} onStatusChange={onStatus}
            presentation={{mode: 'shared', active, onChange: onPresentation}}/>
    </AvatarRenderBoundary>, scene, {camera, size: {width: job.width, height: job.height, top: 0, left: 0}, events: {enabled: false}});
});

function RenderPass({session, jobs, visible}: {session: AvatarViewportSession; jobs: readonly AvatarRenderJob[]; visible: boolean}) {
    const [mounted, setMounted] = useState<readonly string[]>([]);
    const frames = useMemo(() => new WeakMap<HTMLCanvasElement, HTMLCanvasElement>(), []);
    const lastCycle = useRef(-Infinity);
    useFrame(({gl}) => {
        if (!visible || document.hidden || session.registry.contextStatus === 'lost') return;
        const next = jobs.filter(job => !mounted.includes(job.id)).slice(0, 2).map(job => job.id);
        if (next.length) setMounted(previous => [...previous.filter(id => session.registry.getJob(id)), ...next]);
        const now = performance.now();
        if (now - lastCycle.current < 1000 / 30 - 0.5) return;
        lastCycle.current = now;
        renderSharedAvatarCycle(gl, session, frames, now);
    }, 1);
    return jobs.filter(job => mounted.includes(job.id)).map(job => <SharedAvatarJob key={job.id}
        session={session} job={job} generation={session.registry.generation}
        active={session.registry.isActive(job) && visible && session.registry.contextStatus !== 'lost'}/>);
}

function SourceLifecycle({session, epoch, attach}: {session: AvatarViewportSession; epoch: number; attach: (gl: WebGLRenderer) => () => void}) {
    const gl = useThree(state => state.gl);
    useEffect(() => {
        const detach = attach(gl);
        const lost = (event: Event) => { event.preventDefault(); session.registry.markSourceLost(epoch); };
        const restored = () => { session.registry.markSourceRestored(epoch); };
        gl.domElement.addEventListener('webglcontextlost', lost);
        gl.domElement.addEventListener('webglcontextrestored', restored);
        return () => {
            gl.domElement.removeEventListener('webglcontextlost', lost);
            gl.domElement.removeEventListener('webglcontextrestored', restored);
            detach();
        };
    }, [session, epoch, gl, attach]);
    return null;
}

function SourceFailure({session, epoch}: {session: AvatarViewportSession; epoch: number}) {
    useEffect(() => { session.registry.markSourceLost(epoch); }, [session, epoch]);
    return null;
}

export default function SharedAvatarRenderer({session}: {session: AvatarViewportSession}) {
    const {jobs} = useSyncExternalStore(session.registry.subscribe, session.registry.getSnapshot, session.registry.getSnapshot);
    const [visible, setVisible] = useState(() => !document.hidden);
    const renderer = useRef<WebGLRenderer | undefined>(undefined);
    const epoch = session.registry.sourceEpoch;
    const attachRenderer = useCallback((gl: WebGLRenderer) => {
        renderer.current = gl;
        return () => { if (renderer.current === gl) renderer.current = undefined; };
    }, []);
    useEffect(() => session.registry.setSourceRetry(() => {
        const gl = renderer.current;
        const replace = () => { session.registry.beginSourceReplacement(epoch); };
        if (!gl) { replace(); return; }
        const context = gl.getContext();
        if (!context.isContextLost() && !context.getExtension('WEBGL_lose_context')) {
            session.registry.sourceReleaseUnavailable(epoch);
            return;
        }
        const released = () => {
            gl.domElement.removeEventListener('webglcontextlost', released);
            if (renderer.current === gl) renderer.current = undefined;
            replace();
        };
        // Destroy before creating the replacement, not one retry/Canvas per cell.
        if (context.isContextLost()) { gl.dispose(); released(); }
        else {
            gl.domElement.addEventListener('webglcontextlost', released, {once: true});
            gl.dispose(); gl.forceContextLoss();
            if (context.isContextLost()) released();
        }
    }), [session, epoch]);
    useEffect(() => {
        const update = () => setVisible(!document.hidden);
        document.addEventListener('visibilitychange', update);
        return () => document.removeEventListener('visibilitychange', update);
    }, []);
    const size = sharedAvatarSourceSize(jobs, session);
    // Three floors drawing-buffer dimensions; cell rectangles are rounded.
    // One CSS pixel of source-only slack also covers CSS subpixel rounding.
    // Otherwise an odd height at DPR 1.5 can retain one frame then stop copying.
    return <>
        {session.registry.contextStatus === 'lost' && <div role="status" aria-label="Récupération des avatars"
            data-testid="avatar-source-recovery"
            className="fixed inset-x-4 top-[calc(8px+env(safe-area-inset-top))] z-[120] flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 shadow-lg">
            <p>Affichage des avatars interrompu. Les dernières images sont conservées.</p>
            <button type="button" disabled={session.registry.retryPending}
                onClick={event => { event.stopPropagation(); session.registry.retrySource(); }}
                onKeyDown={event => event.stopPropagation()}
                className="min-h-11 rounded-lg bg-amber-600 px-3 font-bold text-white disabled:opacity-50">Réessayer les avatars</button>
        </div>}
        <div aria-hidden="true" data-avatar-source="shared" className="pointer-events-none fixed -left-[10000px] top-0"
        style={{width: Math.ceil(size.width) + 1, height: Math.ceil(size.height) + 1}}>
        <AvatarRenderBoundary key={epoch} fallback={<SourceFailure session={session} epoch={epoch}/>}>
        <Canvas dpr={size.dpr} gl={{alpha: true, antialias: true, preserveDrawingBuffer: false}} events={noEvents}>
            <SourceLifecycle session={session} epoch={epoch} attach={attachRenderer}/>
            <RenderPass session={session} jobs={jobs} visible={visible}/>
        </Canvas>
        </AvatarRenderBoundary>
    </div>
    </>;
}
