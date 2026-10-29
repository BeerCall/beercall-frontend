import React, {useLayoutEffect} from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene} from 'three';
import SharedAvatar from '../components/3D/SharedAvatar';
import AvatarViewportProvider from '../components/3D/AvatarViewportProvider';
import {useAvatarViewport, type AvatarViewportSession} from '../lib/avatarViewportContext';
import {createAvatarPresentationLease, type AvatarPresentationPhase} from '../lib/avatarPresentationState';
import type {AvatarRenderJob} from '../lib/avatarViewRegistry';

vi.mock('../components/3D/SharedAvatarRenderer', () => ({default: function DeterministicSource() {
    return <canvas data-testid="source-double"/>;
}}));

let session: AvatarViewportSession;
const draw = vi.fn();
const clear = vi.fn();
const observerCleanup = vi.fn();
function Capture() {
    const current = useAvatarViewport();
    useLayoutEffect(() => { session = current!; }, [current]);
    return null;
}
function Host({children}: React.PropsWithChildren) {
    const [client] = React.useState(() => new QueryClient());
    return <QueryClientProvider client={client}><AvatarViewportProvider><Capture/>{children}</AvatarViewportProvider></QueryClientProvider>;
}

function readyJob(job: AvatarRenderJob) {
    const token = session.registry.jobToken(job);
    const group = new Group();
    group.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    session.registry.attachScene(token, new Scene(), new PerspectiveCamera());
    session.registry.setSceneStatus(token, {signature: job.signature, group, ready: true, frameSubmitted: false,
        framing: null, expectedParts: ['head']});
}
function copy(job: AvatarRenderJob) {
    readyJob(job);
    for (const id of job.subscribers) {
        const view = session.registry.getSnapshot().views.find(view => view.id === id)!;
        // Deterministic copy backend: a DOM canvas alone is not acceptance.
        view.target.getContext('2d')!.drawImage(document.createElement('canvas'), 0, 0);
        session.registry.confirmCopy(session.registry.copyToken(view), {copied: true, drawCalls: 1, meshCount: 1, timestamp: performance.now()});
    }
}
function presentation(job: AvatarRenderJob, phase: AvatarPresentationPhase, retry = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)) {
    const lease = createAvatarPresentationLease();
    const update = (next: AvatarPresentationPhase) => {
        const state = lease.update({phase: next, active: true, canNotifyInitialFrame: next !== 'critical-error',
            retry, notifyInitialFrame: vi.fn(), error: next === 'critical-error' ? 'animation-critical-unavailable' : next === 'deferred-error' ? 'animation-deferred-unavailable' : undefined})!;
        session.registry.setPresentation(session.registry.jobToken(job), state);
    };
    update(phase);
    return {lease, update, retry};
}

describe('shared cells (real provider/registry, deterministic copy backend)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 128, 160));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({drawImage: draw, clearRect: clear}) as unknown as CanvasRenderingContext2D);
        class Observer {
            observe = vi.fn(); unobserve = vi.fn(); disconnect = observerCleanup;
        }
        vi.stubGlobal('ResizeObserver', Observer);
        vi.stubGlobal('IntersectionObserver', Observer);
    });

    it('keeps two head cells on one source and shared job, only ready after their own successful copies', async () => {
        const onFrame = vi.fn();
        const view = render(<Host><SharedAvatar config={{head: 'synthetic'}} mode="head" onFrameSubmitted={onFrame}/>
            <SharedAvatar config={{head: 'synthetic'}} mode="head"/></Host>);
        await screen.findByTestId('source-double');
        expect(view.container.querySelectorAll('[data-avatar-cell="2d"]')).toHaveLength(2);
        expect(session.registry.getSnapshot().jobs).toHaveLength(1);
        expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(0);
        expect(onFrame).not.toHaveBeenCalled();
        act(() => copy(session.registry.getSnapshot().jobs[0]));
        expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(2);
        expect(draw).toHaveBeenCalledTimes(2);
        expect(onFrame).toHaveBeenCalledTimes(1);
        act(() => copy(session.registry.getSnapshot().jobs[0]));
        expect(onFrame).toHaveBeenCalledTimes(1);
        expect(screen.getAllByTestId('source-double')).toHaveLength(1);
    });

    it('changes signatures atomically, retains the same painted canvas and rejects an old copy', () => {
        const content = (head: string) => <Host><SharedAvatar config={{head}} mode="thumbnail"/></Host>;
        const view = render(content('first'));
        act(() => copy(session.registry.getSnapshot().jobs[0]));
        const target = view.container.querySelector('[data-avatar-cell]');
        const previous = session.registry.getSnapshot().views[0];
        const stale = session.registry.copyToken(previous);
        view.rerender(content('second'));
        expect(view.container.querySelector('[data-avatar-cell]')).toBe(target);
        expect(view.container.querySelector('[data-avatar-state]')).toHaveAttribute('data-avatar-state', 'preparing');
        expect(screen.queryByText('Préparation de l’avatar')).toBeNull();
        expect(clear).not.toHaveBeenCalled();
        expect(session.registry.confirmCopy(stale, {copied: true, drawCalls: 1, meshCount: 1, timestamp: 1})).toBe(false);
        act(() => copy(session.registry.getJob(session.registry.getSnapshot().views[0].jobId)!));
        expect(view.container.querySelector('[data-avatar-state]')).toHaveAttribute('data-avatar-state', 'frame-ready');
    });

    it('presents critical failure and keyboard retry in the cell, waiting for a real new copy', async () => {
        const view = render(<Host><SharedAvatar config={{head: 'synthetic'}}/></Host>);
        const job = session.registry.getSnapshot().jobs[0];
        let commands!: ReturnType<typeof presentation>;
        act(() => { commands = presentation(job, 'critical-error'); });
        expect(screen.getByRole('alert')).toHaveTextContent('Erreur de chargement des animations');
        const user = userEvent.setup();
        await user.tab();
        expect(screen.getByRole('button', {name: 'Réessayer les animations'})).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(commands.retry).toHaveBeenCalledTimes(1);
        act(() => commands.update('ready'));
        expect(view.container.querySelector('[data-avatar-state]')).toHaveAttribute('data-avatar-state', 'preparing');
        act(() => copy(job));
        expect(view.container.querySelector('[data-avatar-state]')).toHaveAttribute('data-avatar-state', 'frame-ready');
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('preserves the Idle image on deferred errors and deduplicates two subscribers retries', async () => {
        const view = render(<Host><SharedAvatar config={{head: 'synthetic'}} mode="head"/>
            <SharedAvatar config={{head: 'synthetic'}} mode="head"/></Host>);
        const job = session.registry.getSnapshot().jobs[0];
        act(() => copy(job));
        let release!: () => void;
        const retry = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
        let commands!: ReturnType<typeof presentation>;
        act(() => { commands = presentation(job, 'deferred-error', retry); });
        const targets = view.container.querySelectorAll('[data-avatar-cell]');
        const buttons = screen.getAllByRole('button', {name: 'Réessayer les animations'});
        await act(async () => { fireEvent.click(buttons[0]); fireEvent.click(buttons[1]); });
        expect(retry).toHaveBeenCalledTimes(1);
        expect(view.container.querySelectorAll('[data-avatar-cell]')[0]).toBe(targets[0]);
        expect(clear).not.toHaveBeenCalled();
        await act(async () => { release(); });
        act(() => commands.update('ready'));
        expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(0);
        act(() => copy(job));
        expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(2);
    });

    it('keeps model retry distinct and unregisters all views/observers without disposing public sources', async () => {
        const view = render(<Host><SharedAvatar config={{head: 'synthetic'}}/></Host>);
        const retry = vi.fn();
        const job = session.registry.getSnapshot().jobs[0];
        act(() => { session.registry.setModelError(session.registry.jobToken(job), retry); });
        expect(screen.getByText('Modèle d’avatar indisponible')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Réessayer le modèle'}));
        expect(retry).toHaveBeenCalledTimes(1);
        const token = session.registry.copyToken(session.registry.getSnapshot().views[0]);
        view.unmount(); await act(async () => {});
        expect(session.registry.getSnapshot().views).toHaveLength(0);
        expect(session.registry.getSnapshot().jobs).toHaveLength(0);
        expect(observerCleanup).toHaveBeenCalledTimes(2);
        expect(session.registry.confirmCopy(token, {copied: true, drawCalls: 1, meshCount: 1, timestamp: 1})).toBe(false);
    });
});
