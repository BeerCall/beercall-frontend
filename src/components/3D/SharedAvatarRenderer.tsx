import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {Canvas, createPortal, useFrame, type EventManager} from '@react-three/fiber';
import {PerspectiveCamera, Scene} from 'three';
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

function JobPortal({session, job, active}: {session: AvatarViewportSession; job: AvatarRenderJob; active: boolean}) {
    const scene = useMemo(() => new Scene(), []);
    const camera = useMemo(() => {
        const result = new PerspectiveCamera(45, job.width / Math.max(1, job.height), 0.1, 2000);
        result.position.set(0, 80, 300);
        result.lookAt(0, 80, 0);
        return result;
    }, [job.width, job.height]);
    const token = useMemo(() => session.registry.jobToken(job), [session, job]);
    useLayoutEffect(() => { session.registry.attachScene(token, scene, camera); }, [session, token, scene, camera]);
    const onStatus = useCallback((status: AvatarSceneStatus | null) => { session.registry.setSceneStatus(token, status); }, [session, token]);
    const onPresentation = useCallback((state: AvatarPresentationState | null) => { session.registry.setPresentation(token, state); }, [session, token]);
    return createPortal(<AvatarRenderBoundary fallback={reset => <ModelFailure session={session} job={job} reset={reset}/>}>
        <AvatarScene config={job.config} mode={job.mode} active={active} onStatusChange={onStatus}
            presentation={{mode: 'shared', active, onChange: onPresentation}}/>
    </AvatarRenderBoundary>, scene, {camera, size: {width: job.width, height: job.height, top: 0, left: 0}, events: {enabled: false}});
}

function RenderPass({session, jobs, visible}: {session: AvatarViewportSession; jobs: readonly AvatarRenderJob[]; visible: boolean}) {
    const [mounted, setMounted] = useState<readonly string[]>([]);
    const frames = useMemo(() => new WeakMap<HTMLCanvasElement, HTMLCanvasElement>(), []);
    const lastCycle = useRef(-Infinity);
    useFrame(({gl}) => {
        if (!visible || document.hidden) return;
        const next = jobs.filter(job => !mounted.includes(job.id)).slice(0, 2).map(job => job.id);
        if (next.length) setMounted(previous => [...previous.filter(id => session.registry.getJob(id)), ...next]);
        const now = performance.now();
        if (now - lastCycle.current < 1000 / 30 - 0.5) return;
        lastCycle.current = now;
        renderSharedAvatarCycle(gl, session, frames, now);
    }, 1);
    return jobs.filter(job => mounted.includes(job.id)).map(job => <JobPortal key={job.id}
        session={session} job={job} active={session.registry.isActive(job) && visible}/>);
}

export default function SharedAvatarRenderer({session}: {session: AvatarViewportSession}) {
    const {jobs} = useSyncExternalStore(session.registry.subscribe, session.registry.getSnapshot, session.registry.getSnapshot);
    const [visible, setVisible] = useState(() => !document.hidden);
    useEffect(() => {
        const update = () => setVisible(!document.hidden);
        document.addEventListener('visibilitychange', update);
        return () => document.removeEventListener('visibilitychange', update);
    }, []);
    const size = sharedAvatarSourceSize(jobs, session);
    return <div aria-hidden="true" data-avatar-source="shared" className="pointer-events-none fixed -left-[10000px] top-0"
        style={{width: size.width, height: size.height}}>
        <Canvas dpr={size.dpr} gl={{alpha: true, antialias: true, preserveDrawingBuffer: false}} events={noEvents}>
            <RenderPass session={session} jobs={jobs} visible={visible}/>
        </Canvas>
    </div>;
}
