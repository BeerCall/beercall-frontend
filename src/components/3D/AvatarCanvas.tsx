import {useCallback, useContext, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Canvas, useThree, type EventManager} from '@react-three/fiber';
import {QueryClientContext} from '@tanstack/react-query';
import {MODELS_URL} from '../../lib/api';
import type {AvatarConfig} from '../../types/avatar';
import {preloadAvatarAnimations} from '../../hooks/useAvatarAnimations';
import {useModel} from '../../hooks/useModel';
import {recordAvatarLoading} from '../../lib/avatarLoadingTrace';
import {warmAvatarModels} from './warmupAvatar';
import AvatarScene, {type AvatarSceneStatus} from './AvatarScene';

export {ModularAvatar} from './ModularAvatar';
export type {ThumbnailFramingInfo} from './AvatarScene';

// Miniatures have no raycasting or DOM pointer listeners.
const noopEventManager = (): EventManager<HTMLElement> => ({
    enabled: false, priority: 0, connect: () => {}, disconnect: () => {},
});

function restoreClockElapsed(clock: {elapsedTime: number}, elapsed: number) {
    clock.elapsedTime = elapsed;
}

function AvatarFrameloopController({active}: {active: boolean}) {
    const setFrameloop = useThree(state => state.setFrameloop);
    const clock = useThree(state => state.clock);
    const invalidate = useThree(state => state.invalidate);
    const savedElapsedRef = useRef(0);
    const wasActiveRef = useRef(true);
    useLayoutEffect(() => {
        if (active && !wasActiveRef.current) {
            if (typeof setFrameloop === 'function') setFrameloop('always');
            if (clock) restoreClockElapsed(clock, savedElapsedRef.current);
            if (typeof invalidate === 'function') invalidate();
            wasActiveRef.current = true;
        } else if (!active && wasActiveRef.current) {
            if (clock) savedElapsedRef.current = typeof clock.getElapsedTime === 'function' ? clock.getElapsedTime() : (clock.elapsedTime || 0);
            if (typeof setFrameloop === 'function') setFrameloop('never');
            wasActiveRef.current = false;
        }
    }, [active, setFrameloop, clock, invalidate]);
    useEffect(() => () => {
        if (!wasActiveRef.current && typeof setFrameloop === 'function') setFrameloop('always');
    }, [setFrameloop]);
    return null;
}

interface AvatarCanvasProps {
    config: AvatarConfig;
    disableZoom?: boolean;
    disablePan?: boolean;
    onAnimationsLoaded?: (animations: string[]) => void;
    headOnly?: boolean;
    view?: string;
    instanceId?: string;
    active?: boolean;
    onFrameSubmitted?: () => void;
    framing?: 'default' | 'thumbnail' | 'profile';
}

/** Standalone owner retained for Signup and historical callers. Shared scenes never mount it. */
export default function AvatarCanvas({config, headOnly = false, active = true, framing = 'default', ...props}: AvatarCanvasProps) {
    const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
    const [status, setStatus] = useState<AvatarSceneStatus | null>(null);
    useEffect(() => {
        const update = () => setVisible(!document.hidden);
        document.addEventListener('visibilitychange', update);
        return () => document.removeEventListener('visibilitychange', update);
    }, []);
    useEffect(() => {
        const view = props.view ?? (headOnly ? 'head' : 'full');
        recordAvatarLoading('avatar-mount', 'start', view);
        return () => recordAvatarLoading('avatar-mount', 'end', view);
    }, [props.view, headOnly]);
    const client = useContext(QueryClientContext);
    useEffect(() => { if (client) void preloadAvatarAnimations(client); }, [client]);
    useEffect(() => {
        if (headOnly) {
            if (config.head && config.head !== 'none') useModel.preload(`${MODELS_URL}/${config.head}.fbx`);
        } else warmAvatarModels(config);
    }, [config, headOnly]);
    const mode = headOnly ? 'head' : framing === 'default' ? 'full' : framing;
    const onStatusChange = useCallback((next: AvatarSceneStatus | null) => setStatus(next), []);
    const framed = mode !== 'full';
    const info = status?.framing;
    return <div className="w-full h-full relative"
        data-avatar-framing={framed ? status?.frameSubmitted && active && visible && info ? 'ready' : 'pending' : undefined}
        data-avatar-framing-info={framed && info ? JSON.stringify(info) : undefined}>
        <Canvas camera={{position: [0, 80, 300], fov: 45}} dpr={[1.5, 1.5]}
            events={mode === 'thumbnail' ? noopEventManager : undefined}
            className={`z-10 relative ${framed && !info ? 'opacity-0' : 'opacity-100'}`}>
            <AvatarFrameloopController active={active && visible}/>
            <AvatarScene {...props} config={config} mode={mode} active={active && visible} onStatusChange={onStatusChange}/>
        </Canvas>
    </div>;
}
