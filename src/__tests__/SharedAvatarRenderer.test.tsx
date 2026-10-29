import React, {useEffect} from 'react';
import {act, render, screen, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import AvatarViewportProvider from '../components/3D/AvatarViewportProvider';
import {useAvatarViewport, type AvatarViewportSession} from '../lib/avatarViewportContext';

const state = vi.hoisted(() => ({live: 0, created: 0}));
vi.mock('../components/3D/SharedAvatarRenderer', () => ({default: function MockSharedAvatarRenderer() {
    useEffect(() => { state.created++; state.live++; return () => { state.live--; }; }, []);
    return <canvas data-testid="single-source-double"/>;
}}));

function Demand({count, capture}: {count: number; capture?: (session: AvatarViewportSession) => void}) {
    const session = useAvatarViewport();
    useEffect(() => {
        if (!session) return;
        capture?.(session);
        const handles = Array.from({length: count}, (_, i) => session.registry.register({id: `view-${i}`, config: {head: 'synthetic'},
            mode: i === 0 ? 'head' : 'thumbnail', revision: 'test', width: 128, height: 160, dpr: 1,
            target: document.createElement('canvas'), visible: true}));
        return () => handles.forEach(handle => session.registry.unregister(handle));
    }, [session, count, capture]);
    return null;
}

describe('one lazily mounted source per avatar session', () => {
    it('creates no renderer without demand and one live source for four cells and rerenders', async () => {
        const view = render(<AvatarViewportProvider><Demand count={0}/></AvatarViewportProvider>);
        expect(screen.queryByTestId('single-source-double')).toBeNull();
        view.rerender(<AvatarViewportProvider><Demand count={4}/></AvatarViewportProvider>);
        await screen.findByTestId('single-source-double');
        const source = screen.getByTestId('single-source-double');
        expect(state.live).toBe(1);
        view.rerender(<AvatarViewportProvider><Demand count={4}/></AvatarViewportProvider>);
        expect(screen.getByTestId('single-source-double')).toBe(source);
        view.unmount();
        await act(async () => {});
        expect(state.live).toBe(0);
    });

    it('survives StrictMode effect replay and clears the ended session and callbacks', async () => {
        let captured: AvatarViewportSession | undefined;
        const capture = (session: AvatarViewportSession) => { captured = session; };
        const view = render(<React.StrictMode><AvatarViewportProvider><Demand count={4} capture={capture}/></AvatarViewportProvider></React.StrictMode>);
        await screen.findByTestId('single-source-double');
        await waitFor(() => expect(captured!.registry.getSnapshot().views).toHaveLength(4));
        expect(state.live).toBe(1);
        const metrics = vi.fn();
        captured!.subscribeMetrics(metrics);
        view.unmount();
        await act(async () => {});
        expect(captured!.registry.getSnapshot().jobs).toEqual([]);
        expect(captured!.registry.getSnapshot().views).toEqual([]);
        captured!.emitMetric({kind: 'cycle', timestamp: 1, durationMs: 1, renderMs: 0, copyMs: 0});
        expect(metrics).not.toHaveBeenCalled();
        expect(state.live).toBe(0);
        // Count creations honestly; StrictMode may replay mount effects.
        expect(state.created).toBeGreaterThanOrEqual(1);
    });
});
