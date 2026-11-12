import React from 'react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import Profile from '../pages/Profile';

const manifestPath = resolve(__dirname, '../../public/animations/manifest.json');
let manifestJson = '';

const profileFixture = {
    id: 7,
    username: 'Fixture Anim',
    caps: 0,
    score: 0,
    title: 'Fixture',
    avatar: {
        head: 'Men_head_Casual_0',
        body: 'Men_body_Casual_0',
        legs: 'Men_legs_Casual_0',
        feet: 'Men_feet_Casual_0',
        accessory: 'none',
        gender: 'Men',
        animation: 'Idle',
    },
    avatar_sprites: { status: 'ready', pending: false, hash: 'abc', portrait_url: '/portrait.webp' },
    shop_items: [],
    squads: [],
    unlocked_badges: [],
    stats: {
        aperos_created: 0,
        aperos_joined: 0,
        aperos_declined: 0,
        aperos_missed: 0,
        fraud_count: 0,
    },
};

vi.mock('react-router-dom', async () => ({
    ...((await vi.importActual('react-router-dom')) as Record<string, unknown>),
    useParams: () => ({ id: undefined }),
    useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useProfile', () => ({
    useProfile: () => ({ data: profileFixture, isLoading: false }),
}));

vi.mock('../avatar/glb/useGlbManifest', () => ({
    useGlbManifest: () => ({ data: undefined, isError: false, error: null }),
}));

// Repli sprite : la scène 3D ne monte pas et ne notifie aucun clip.
vi.mock('../components/3D/ProfileAvatarScene', () => ({
    ProfileAvatarScene: () => <div data-testid="profile-avatar-scene-fallback">Repli sprite</div>,
}));

beforeAll(async () => {
    manifestJson = await readFile(manifestPath, 'utf8');
});

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === '/animations/manifest.json') {
            return new Response(manifestJson, { status: 200 });
        }
        return new Response(null, { status: 404 });
    }));
});

describe('onglet Anim indépendant de la scène 3D', () => {
    it('liste les animations du manifeste v2 même quand la scène 3D est en repli sprite', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <MemoryRouter>
                <QueryClientProvider client={client}>
                    <Profile />
                </QueryClientProvider>
            </MemoryRouter>,
        );

        expect(await screen.findByTestId('profile-avatar-scene-fallback')).toBeInTheDocument();
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /Anim/i }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Death' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Idle' })).toBeInTheDocument();
        });
        expect(fetch).toHaveBeenCalledWith('/animations/manifest.json', expect.anything());
    });
});
