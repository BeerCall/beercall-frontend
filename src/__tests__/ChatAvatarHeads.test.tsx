import React, {useEffect} from 'react';
import {act, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene} from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import ChatPage from '../pages/ChatPage';
import AvatarViewportProvider from '../components/3D/AvatarViewportProvider';
import type {AvatarViewportSession} from '../lib/avatarViewportContext';

const state = vi.hoisted(() => ({
    profiles: {} as Record<string, {id: string; username: string; avatar: {head?: string | null} | null} | undefined>,
    send: vi.fn(), live: 0, messages: [] as {id: string; userId: string; username: string; text: string; timestamp: number}[],
}));
let session: AvatarViewportSession;
vi.mock('react-router-dom', () => ({useParams: () => ({id: '1'}), useNavigate: () => vi.fn()}));
vi.mock('../hooks/useSquadWebSocket', () => ({useSquadWebSocket: () => undefined}));
vi.mock('../hooks/useSquadDetails', () => ({useSquadDetails: () => ({data: {name: 'Synthetic squad'}})}));
vi.mock('../hooks/useChat', () => ({useChat: () => ({messages: state.messages, sendMessage: state.send, loading: false, error: null})}));
vi.mock('../hooks/useProfile', () => ({useProfile: (id = 'me') => ({data: state.profiles[id]})}));
vi.mock('framer-motion', async original => ({...await original<typeof import('framer-motion')>(), useInView: () => true}));
vi.mock('../components/3D/SharedAvatarRenderer', () => ({default: function Source({session: current}: {session: AvatarViewportSession}) {
    session = current;
    useEffect(() => { state.live++; return () => { state.live--; }; }, []);
    return <canvas data-testid="head-source-double"/>;
}}));
function copies() {
    for (const job of session.registry.getSnapshot().jobs) {
        const group = new Group(); group.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
        const token = session.registry.jobToken(job);
        session.registry.attachScene(token, new Scene(), new PerspectiveCamera());
        session.registry.setSceneStatus(token, {signature: job.signature, ready: true, group, expectedParts: ['head'], framing: null, frameSubmitted: false});
    }
    for (const view of session.registry.getSnapshot().views) {
        view.target.getContext('2d')!.drawImage(document.createElement('canvas'), 0, 0);
        session.registry.confirmCopy(session.registry.copyToken(view), {copied: true, drawCalls: 1, meshCount: 1, timestamp: performance.now()});
    }
}
function Host() {
    const [client] = React.useState(() => new QueryClient());
    return <QueryClientProvider client={client}><AvatarViewportProvider><ChatPage/></AvatarViewportProvider></QueryClientProvider>;
}
describe('chat portraits, real registry and synthetic copy backend', () => {
    beforeEach(() => {
        state.live = 0; state.send.mockReset();
        state.profiles = {me: {id: '0', username: 'Fixture me', avatar: null}};
        for (const id of ['1', '2', '3']) state.profiles[id] = {id, username: `Fixture ${id}`, avatar: {head: `head-${id}`}};
        state.messages = Array.from({length: 30}, (_, i) => ({id: `message-${i}`, userId: String(i % 3 + 1), username: 'Fixture', text: `Synthetic message ${i}`, timestamp: 1}));
        vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 36, 36));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({drawImage: vi.fn(), clearRect: vi.fn()}) as unknown as CanvasRenderingContext2D);
    });
    it('requests thirty real portrait cells but only three shared jobs and one source', async () => {
        const view = render(<Host/>);
        await screen.findByTestId('head-source-double');
        expect(view.container.querySelectorAll('[data-avatar-cell]')).toHaveLength(30);
        expect(session.registry.getSnapshot().jobs).toHaveLength(3);
        expect(state.live).toBe(1);
        expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(0);
        act(() => copies());
        expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(30);
        expect(state.send).not.toHaveBeenCalled();
    });
    it.each([null, '', 'none', undefined])('uses a real fallback for absent head %s rather than a blank 3D request', head => {
        state.profiles['1']!.avatar = {head};
        state.messages = [state.messages[0]];
        const view = render(<Host/>);
        expect(screen.getByLabelText('Avatar indisponible')).toBeInTheDocument();
        expect(view.container.querySelector('[data-avatar-cell]')).toBeNull();
    });
    it('retains a copied head during profile refresh, then invalidates only the changed sender signature', async () => {
        state.messages = [state.messages[0], state.messages[1]];
        const view = render(<Host/>);
        await screen.findByTestId('head-source-double');
        act(() => copies());
        const original = session.registry.getSnapshot().views.map(view => ({frame: view.frame, target: view.target}));
        state.profiles['1'] = undefined;
        view.rerender(<Host/>);
        expect(session.registry.getSnapshot().views[0].target).toBe(original[0].target);
        expect(session.registry.getSnapshot().views[0].frame).toBe(original[0].frame);
        state.profiles['1'] = {id: '1', username: 'Fixture', avatar: {head: 'new-head'}};
        view.rerender(<Host/>);
        await waitFor(() => expect(session.registry.getSnapshot().views[0].signature).toContain('new-head'));
        expect(session.registry.getSnapshot().views[1].frame).toBe(original[1].frame);
        act(() => copies());
        expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(2);
    });
});
