import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import Profile from '../pages/Profile';
import { api } from '../lib/api';
import type { AvatarConfig } from '../types/avatar';

const fixtures = vi.hoisted(() => ({
    id: undefined as string | undefined,
    put: vi.fn(),
    post: vi.fn(),
}));

const makeProfile = (id: number) => ({
    id,
    username: `Fixture ${id}`,
    caps: 100,
    score: 1,
    title: 'Fixture',
    avatar: {
        head: `head-${id}`,
        body: 'public-body',
        gender: 'Men' as const,
        animation: 'Idle',
    },
    avatar_sprites: {
        status: 'ready',
        pending: false,
        hash: 'abc',
        portrait_url: '/portrait.webp',
    },
    shop_items: [
        { id: 'fixture-item', name: 'Synthetic item', price_caps: 10, is_owned: false, category: 'accessory', gender: 'Men' },
    ],
    squads: [],
    unlocked_badges: [],
    stats: {
        aperos_created: 0,
        aperos_joined: 0,
        aperos_declined: 0,
        aperos_missed: 0,
        fraud_count: 0,
    },
});

vi.mock('react-router-dom', async () => ({
    ...((await vi.importActual('react-router-dom')) as Record<string, unknown>),
    useParams: () => ({ id: fixtures.id }),
    useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useProfile', () => ({
    useProfile: (id: string) => ({
        data: makeProfile(id === 'me' ? 1 : Number(id)),
        isLoading: false,
    }),
}));

vi.mock('../components/3D/ProfileAvatarScene', () => ({
    ProfileAvatarScene: ({ config }: { config: AvatarConfig | null }) => (
        <div data-testid="profile-avatar-scene-double" data-head={config?.head}>
            Avatar 3D PoC ({config?.head})
        </div>
    ),
}));

vi.mock('../components/Profile/VestiairePanel', () => ({
    default: function Panel({
        setAvatarConfig,
        onEquipAndSave,
        onBuy,
    }: {
        setAvatarConfig: React.Dispatch<React.SetStateAction<AvatarConfig | null>>;
        onEquipAndSave: () => void;
        onBuy: (id: string, price: number, name: string) => void;
    }) {
        return (
            <div>
                {[1, 2, 3].map((i) => (
                    <button
                        key={i}
                        onClick={() =>
                            setAvatarConfig((prev) => ({
                                ...(prev || makeProfile(1).avatar),
                                head: `new-${i}`,
                            }))
                        }
                    >
                        Tenue {i}
                    </button>
                ))}
                <button onClick={onEquipAndSave}>Sauvegarder fixture</button>
                <button onClick={() => onBuy('fixture-item', 10, 'Synthetic item')}>
                    Acheter fixture
                </button>
            </div>
        );
    },
}));

function Host() {
    const [client] = React.useState(
        () =>
            new QueryClient({
                defaultOptions: { queries: { retry: false } },
            }),
    );
    return (
        <MemoryRouter>
            <QueryClientProvider client={client}>
                <Profile />
            </QueryClientProvider>
        </MemoryRouter>
    );
}

describe('B13 — ProfileAvatarPreparation (intégration Profil avec la scène PoC)', () => {
    beforeEach(() => {
        fixtures.id = undefined;
        fixtures.put.mockReset().mockResolvedValue({});
        fixtures.post.mockReset().mockResolvedValue({});
        vi.spyOn(api, 'put').mockImplementation(fixtures.put);
        vi.spyOn(api, 'post').mockImplementation(fixtures.post);
    });

    it('monte la scène Profil PoC et utilise la tenue du profil actif', async () => {
        render(<Host />);

        await waitFor(() => {
            const stage = screen.getByTestId('profile-avatar-scene-double');
            expect(stage).not.toBeNull();
            expect(stage.getAttribute('data-head')).toBe('head-1');
        });
    });

    it('bascule de profil A vers B en appliquant immédiatement la tenue de B', async () => {
        fixtures.id = '1';
        const { rerender } = render(<Host />);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Fixture 1' })).not.toBeNull();
            expect(screen.getByTestId('profile-avatar-scene-double').getAttribute('data-head')).toBe('head-1');
        });

        // Navigation vers le profil 2
        fixtures.id = '2';
        rerender(<Host />);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Fixture 2' })).not.toBeNull();
            expect(screen.getByTestId('profile-avatar-scene-double').getAttribute('data-head')).toBe('head-2');
        });
    });

    it('enchaîne trois changements rapides de tenue et ne sauvegarde que le dernier', async () => {
        render(<Host />);

        await waitFor(() => {
            expect(screen.getByTestId('profile-avatar-scene-double')).not.toBeNull();
        });

        // Clics rapides sur les 3 tenues du vestiaire
        fireEvent.click(screen.getByRole('button', { name: 'Tenue 1' }));
        fireEvent.click(screen.getByRole('button', { name: 'Tenue 2' }));
        fireEvent.click(screen.getByRole('button', { name: 'Tenue 3' }));

        // La dernière tenue sélectionnée est affichée sur la scène Profil
        expect(screen.getByTestId('profile-avatar-scene-double').getAttribute('data-head')).toBe('new-3');

        // Sauvegarde de la tenue
        fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder fixture' }));
        await waitFor(() => {
            expect(fixtures.put).toHaveBeenCalledWith(
                '/auth/equip/',
                expect.objectContaining({ head: 'new-3' }),
            );
        });

        // Achat d'un item
        fireEvent.click(screen.getByRole('button', { name: 'Acheter fixture' }));
        fireEvent.click(screen.getByRole('button', { name: /^Acheter$/ }));
        await waitFor(() => {
            expect(fixtures.post).toHaveBeenCalledWith('/auth/buy/', { item_id: 'fixture-item' });
        });
    });
});
