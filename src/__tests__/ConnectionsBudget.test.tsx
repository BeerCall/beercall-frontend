import {describe, it, expect, vi, beforeEach} from 'vitest';
import {screen, waitFor, fireEvent, act} from '@testing-library/react';
import React, {useLayoutEffect, useSyncExternalStore} from 'react';
import {http, HttpResponse} from 'msw';
import {Group, Mesh, BoxGeometry, MeshBasicMaterial, Scene, PerspectiveCamera} from 'three';
import {server} from './mocks/server';
import {render} from './utils/test-utils';
import Connections from '../pages/Connections';
import AvatarViewportProvider from '../components/3D/AvatarViewportProvider';
import type {AvatarViewportSession} from '../lib/avatarViewportContext';

const fixtures = vi.hoisted(() => ({live: 0, created: 0, navigate: vi.fn(), observed: new Set<Element>()}));
let session: AvatarViewportSession;
const people = Array.from({length: 30}, (_, i) => ({id: `user_${i + 1}`, username: `Ami_${i + 1}`, caps: (i + 1) * 10,
    score: (i + 1) * 100, title: 'Camarade', avatar: {head: 'head_base', body: 'body_tshirt', legs: 'legs_jeans',
        feet: 'shoes_sneakers', accessory: 'none', gender: 'Men' as const}}));

vi.mock('react-router-dom', async original => ({...await original<typeof import('react-router-dom')>(), useNavigate: () => fixtures.navigate}));
vi.mock('../components/3D/SharedAvatarRenderer', () => ({default: function CopyBackend({session: current}: {session: AvatarViewportSession}) {
    session = current;
    const snapshot = useSyncExternalStore(current.registry.subscribe, current.registry.getSnapshot);
    React.useEffect(() => { fixtures.created++; fixtures.live++; return () => { fixtures.live--; }; }, []);
    useLayoutEffect(() => {
        for (const job of snapshot.jobs) {
            if (!job.ready) {
                const group = new Group(); group.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
                const token = current.registry.jobToken(job);
                current.registry.attachScene(token, new Scene(), new PerspectiveCamera());
                current.registry.setSceneStatus(token, {signature: job.signature, ready: true, group, expectedParts: ['head'], framing: null, frameSubmitted: false});
            }
        }
        for (const view of snapshot.views) if (view.visible && view.frame?.signature !== view.signature) {
            view.target.getContext('2d')!.drawImage(document.createElement('canvas'), 0, 0);
            current.registry.confirmCopy(current.registry.copyToken(view), {copied: true, meshCount: 1, drawCalls: 1, timestamp: performance.now()});
        }
    }, [current, snapshot]);
    return <canvas data-testid="shared-source-double"/>;
}}));

function Page() { return <AvatarViewportProvider><Connections/></AvatarViewportProvider>; }
describe('Connections shared budget: all thirty people, one source (deterministic copies)', () => {
    beforeEach(() => {
        fixtures.live = 0; fixtures.created = 0; fixtures.navigate.mockClear(); fixtures.observed.clear();
        server.use(http.get('*/auth/connections/', () => HttpResponse.json(people)));
        vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 128, 160));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({drawImage: vi.fn(), clearRect: vi.fn()}) as unknown as CanvasRenderingContext2D);
        class Observer {
            private nodes = new Set<Element>();
            observe(node: Element) { this.nodes.add(node); fixtures.observed.add(node); }
            disconnect() { this.nodes.forEach(node => fixtures.observed.delete(node)); this.nodes.clear(); }
            unobserve(node: Element) { this.nodes.delete(node); fixtures.observed.delete(node); }
        }
        vi.stubGlobal('ResizeObserver', Observer); vi.stubGlobal('IntersectionObserver', Observer);
    });
    it('affiche trente cartes et trente cellules certifiées, sans initiales pour des avatars valides', async () => {
        const view = render(<Page/>);
        await screen.findByText('Ami_30');
        await waitFor(() => expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(30));
        expect(screen.getAllByTestId(/^avatar-thumb-user_/)).toHaveLength(30);
        expect(session.registry.getSnapshot().views).toHaveLength(30);
        expect(screen.queryAllByLabelText(/^Avatar de Ami_/)).toHaveLength(0);
        expect(screen.getAllByTestId('shared-source-double')).toHaveLength(1);
        expect(fixtures.live).toBe(1);
    });
    it('StrictMode conserve une seule source vivante et nettoie toutes les réservations/observateurs', async () => {
        const view = render(<React.StrictMode><Page/></React.StrictMode>);
        await waitFor(() => expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(30));
        expect(fixtures.live).toBe(1); expect(fixtures.created).toBeGreaterThanOrEqual(1);
        view.unmount(); await act(async () => {});
        expect(fixtures.live).toBe(0); expect(fixtures.observed.size).toBe(0);
        expect(session.registry.getSnapshot().views).toHaveLength(0);
        expect(session.registry.getSnapshot().jobs).toHaveLength(0);
    });
    it('préserve un vrai clic vers le trentième profil', async () => {
        render(<Page/>);
        const last = await screen.findByText('Ami_30');
        fireEvent.click(last.closest('div.cursor-pointer')!);
        expect(fixtures.navigate).toHaveBeenCalledWith('/profile/user_30');
    });
});
