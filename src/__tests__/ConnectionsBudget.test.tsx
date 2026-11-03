import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { render } from './utils/test-utils';
import Connections from '../pages/Connections';

const fixtures = vi.hoisted(() => ({ navigate: vi.fn() }));
const sprites = (i: number) => ({
    hash: `h${i}`,
    portrait_url: `/uploads/avatars/v1/h${i}/portrait.webp`,
    head_url: `/uploads/avatars/v1/h${i}/head.webp`,
    body_url: `/uploads/avatars/v1/h${i}/body.webp`,
    pending: false,
    status: 'ready',
});
const people = Array.from({ length: 30 }, (_, i) => ({
    id: `user_${i + 1}`,
    username: `Ami_${i + 1}`,
    caps: (i + 1) * 10,
    score: (i + 1) * 100,
    title: 'Camarade',
    avatar: { head: 'head_base', body: 'body_tshirt', legs: 'legs_jeans', feet: 'shoes_sneakers', accessory: 'none', gender: 'Men' as const },
    avatar_sprites: sprites(i + 1),
}));

vi.mock('react-router-dom', async original => ({
    ...(await original<typeof import('react-router-dom')>()),
    useNavigate: () => fixtures.navigate,
}));

describe('Connections 2D budget: thirty people, zero canvas', () => {
    beforeEach(() => {
        fixtures.navigate.mockClear();
        server.use(http.get('*/auth/connections/', () => HttpResponse.json(people)));
    });

    it('affiche trente cartes et trente images, sans canvas ni initiale', async () => {
        const view = render(<Connections />);
        await screen.findByText('Ami_30');
        await waitFor(() => expect(screen.getAllByTestId(/^avatar-thumb-user_/)).toHaveLength(30));
        expect(view.container.querySelectorAll('[data-avatar-sprite="portrait"]')).toHaveLength(30);
        expect(view.container.querySelectorAll('canvas')).toHaveLength(0);
        expect(view.container.querySelectorAll('[data-avatar-fallback]')).toHaveLength(0);
    });

    it('ne monte aucun renderer 3D sous StrictMode et nettoie au demontage', async () => {
        const view = render(<React.StrictMode><Connections /></React.StrictMode>);
        await screen.findByText('Ami_30');
        expect(view.container.querySelectorAll('canvas')).toHaveLength(0);
        expect(view.container.querySelectorAll('[data-avatar-sprite="portrait"]')).toHaveLength(30);
        view.unmount();
    });

    it('preserve le clic vers le trentieme profil', async () => {
        render(<Connections />);
        const last = await screen.findByText('Ami_30');
        fireEvent.click(last.closest('div.cursor-pointer')!);
        expect(fixtures.navigate).toHaveBeenCalledWith('/profile/user_30');
    });
});
