import React, {useLayoutEffect} from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene} from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import Profile from '../pages/Profile';
import AvatarViewportProvider from '../components/3D/AvatarViewportProvider';
import {useAvatarViewport, type AvatarViewportSession} from '../lib/avatarViewportContext';
import type {AvatarConfig} from '../types/avatar';
import {api} from '../lib/api';

const fixtures = vi.hoisted(() => ({id: undefined as string | undefined, put: vi.fn(), post: vi.fn()}));
const makeProfile = (id: number) => ({id, username: `Fixture ${id}`, caps: 100, score: 1, title: 'Fixture',
    avatar: {head: `head-${id}`, body: 'public-body', gender: 'Men' as const, animation: 'Idle'},
    shop_items: [], squads: [], unlocked_badges: [], stats: {aperos_created: 0, aperos_joined: 0, aperos_declined: 0, aperos_missed: 0, fraud_count: 0}});
let session: AvatarViewportSession;
let preparedJobId: string;
vi.mock('react-router-dom', () => ({useParams: () => ({id: fixtures.id}), useNavigate: () => vi.fn()}));
vi.mock('../hooks/useProfile', () => ({useProfile: (id: string) => ({data: makeProfile(id === 'me' ? 1 : Number(id)), isLoading: false})}));
vi.mock('../components/3D/SharedAvatarRenderer', () => ({default: function Source() { return <canvas data-testid="profile-source-double"/>; }}));
vi.mock('../components/Profile/VestiairePanel', () => ({default: function Panel({setAvatarConfig, onEquipAndSave, onBuy}: {
    setAvatarConfig: React.Dispatch<React.SetStateAction<AvatarConfig | null>>; onEquipAndSave: () => void; onBuy: (id: string, price: number, name: string) => void;
}) { return <>
    {[1, 2, 3].map(i => <button key={i} onClick={() => setAvatarConfig(previous => ({...previous, head: `new-${i}`}))}>Tenue {i}</button>)}
    <button onClick={onEquipAndSave}>Sauvegarder fixture</button><button onClick={() => onBuy('fixture-item', 10, 'Synthetic item')}>Acheter fixture</button>
</>; }}));

function attach(jobId: string) {
    const job = session.registry.getJob(jobId)!;
    const group = new Group(); group.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    const token = session.registry.jobToken(job);
    session.registry.attachScene(token, new Scene(), new PerspectiveCamera());
    session.registry.setSceneStatus(token, {signature: job.signature, ready: true, group, expectedParts: ['head', 'body'], framing: null, frameSubmitted: false});
}
function Warm({enabled}: {enabled: boolean}) {
    const current = useAvatarViewport();
    useLayoutEffect(() => {
        session = current!;
        if (!enabled) return;
        const target = document.createElement('canvas');
        const handle = session.registry.register({id: 'prepared-profile', config: makeProfile(1).avatar, mode: 'profile', revision: 'manifest-pending',
            width: 390, height: 290, dpr: 1, target, visible: false, prepare: true});
        const view = session.registry.getView(handle)!;
        preparedJobId = view.jobId; attach(view.jobId);
        session.registry.confirmCopy(session.registry.copyToken(view), {copied: true, drawCalls: 1, meshCount: 1, timestamp: 1});
        session.registry.update(handle, {...view, prepare: false});
        session.registry.getJob(preparedJobId)!.lastFrame = target;
        return () => session.registry.unregister(handle);
    }, [current, enabled]);
    return null;
}
function Host({warm = false}: {warm?: boolean}) {
    const [client] = React.useState(() => new QueryClient());
    return <QueryClientProvider client={client}><AvatarViewportProvider><Warm enabled={warm}/><Profile/></AvatarViewportProvider></QueryClientProvider>;
}
function copyCurrent() {
    for (const view of session.registry.getSnapshot().views.filter(view => view.visible)) {
        attach(view.jobId);
        view.target.getContext('2d')!.drawImage(document.createElement('canvas'), 0, 0);
        session.registry.confirmCopy(session.registry.copyToken(view), {copied: true, drawCalls: 1, meshCount: 1, timestamp: performance.now()});
    }
}
describe('profile preparation integration (deterministic copy backend)', () => {
    beforeEach(() => {
        fixtures.id = undefined; fixtures.put.mockReset().mockResolvedValue({}); fixtures.post.mockReset().mockResolvedValue({});
        vi.spyOn(api, 'put').mockImplementation(fixtures.put); vi.spyOn(api, 'post').mockImplementation(fixtures.post);
        vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 390, 290));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({drawImage: vi.fn(), clearRect: vi.fn()}) as unknown as CanvasRenderingContext2D);
    });
    it('adopts the actually prepared assembly instead of creating a second source/scene on entry', async () => {
        const view = render(<Host warm/>);
        await screen.findByTestId('profile-source-double');
        const live = session.registry.getSnapshot().views.find(view => view.visible)!;
        expect(live.jobId).toBe(preparedJobId);
        expect(session.registry.getSnapshot().jobs).toHaveLength(1);
        expect(view.container.querySelector('[data-avatar-state]')).toHaveAttribute('data-avatar-state', 'preparing');
        act(() => copyCurrent());
        expect(view.container.querySelector('[data-avatar-state]')).toHaveAttribute('data-avatar-state', 'frame-ready');
    });
    it('changes A to B using Bs outfit, never the previous profile configuration', async () => {
        fixtures.id = '1'; const view = render(<Host/>);
        await screen.findByTestId('profile-source-double');
        act(() => copyCurrent());
        fixtures.id = '2'; view.rerender(<Host/>);
        expect(screen.getByRole('heading', {name: 'Fixture 2'})).toBeInTheDocument();
        const current = session.registry.getSnapshot().views.find(view => view.visible)!;
        expect(current.config.head).toBe('head-2');
        expect(current.frame).toBeUndefined();
    });
    it('keeps the painted cell across three rapid outfit changes and accepts only the latest signature', async () => {
        const view = render(<Host/>); await screen.findByTestId('profile-source-double');
        act(() => copyCurrent());
        const current = session.registry.getSnapshot().views.find(view => view.visible)!;
        const stale = session.registry.copyToken(current); const target = current.target;
        act(() => { [1, 2, 3].forEach(i => fireEvent.click(screen.getByRole('button', {name: `Tenue ${i}`}))); });
        expect(session.registry.getSnapshot().views.find(view => view.visible)!.config.head).toBe('new-3');
        expect(view.container.querySelector('[data-avatar-cell]')).toBe(target);
        expect(session.registry.confirmCopy(stale, {copied: true, drawCalls: 1, meshCount: 1, timestamp: 2})).toBe(false);
        act(() => copyCurrent());
        expect(view.container.querySelector('[data-avatar-state]')).toHaveAttribute('data-avatar-state', 'frame-ready');
        fireEvent.click(screen.getByRole('button', {name: 'Sauvegarder fixture'}));
        await waitFor(() => expect(fixtures.put).toHaveBeenCalledWith('/auth/equip/', expect.objectContaining({head: 'new-3'})));
        fireEvent.click(screen.getByRole('button', {name: 'Acheter fixture'}));
        fireEvent.click(screen.getByRole('button', {name: /^Acheter$/}));
        await waitFor(() => expect(fixtures.post).toHaveBeenCalledWith('/auth/buy/', {item_id: 'fixture-item'}));
    });
});
