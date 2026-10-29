import { Component, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useFBX } from '@react-three/drei';
import { useQuery } from '@tanstack/react-query';
import { WORLD_RESOURCES, worldModuleQueryOptions } from '../lib/worldResources';

function WorldAsset({ path, onReady }: { path: string; onReady: () => () => void }) {
    // useFBX/useLoader's cache is shared with ModelPart in all three worlds.
    // This hook also works outside Canvas: no world, GPU context, game or API hook
    // is mounted. Reading the model prepares its FBX and embedded textures.
    useFBX(path);
    useEffect(() => {
        const mark = `beercall:world-model-prepared:${path}`;
        performance.clearMarks(mark);
        performance.mark(mark);
        return onReady();
    }, [path, onReady]);
    return null;
}

class OptionalAssetBoundary extends Component<{ path: string; onDone: () => void; children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch() {
        // A failed speculative load must not poison the foreground Suspense cache.
        useFBX.clear(this.props.path);
        this.props.onDone();
    }
    render() { return this.state.failed ? null : this.props.children; }
}

export default function WorldResourcePreparation() {
    const [index, setIndex] = useState(0);
    const resource = WORLD_RESOURCES[index];
    const { data, isError } = useQuery({
        ...worldModuleQueryOptions(resource?.tab ?? 'bar'), enabled: !!resource,
    });
    const advance = useCallback(() => setIndex(value => value + 1), []);
    const nextIdle = useCallback(() => {
        // Yield between the three fixed assets instead of parsing them together.
        if (typeof window.requestIdleCallback === 'function') {
            const id = window.requestIdleCallback(advance, { timeout: 5000 });
            return () => window.cancelIdleCallback(id);
        }
        const id = window.setTimeout(advance, 16);
        return () => window.clearTimeout(id);
    }, [advance]);
    useEffect(() => { if (resource && isError) return nextIdle(); }, [resource, isError, nextIdle]);
    if (!resource || !data || isError) return null;
    return (
        <OptionalAssetBoundary key={resource.tab} path={resource.model} onDone={advance}>
            <Suspense fallback={null}>
                <WorldAsset path={resource.model} onReady={nextIdle}/>
            </Suspense>
        </OptionalAssetBoundary>
    );
}
