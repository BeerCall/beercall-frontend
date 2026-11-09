import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Profile from '../pages/Profile';

const fixtures = vi.hoisted(() => ({ id: undefined as string | undefined, logout: vi.fn() }));

vi.mock('react-router-dom', () => ({
    useParams: () => ({ id: fixtures.id }),
    useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useProfile', () => ({
    useProfile: (id: string) => ({
        data: {
            id: id === 'me' ? 1 : Number(id),
            username: id === 'me' ? 'Moi' : 'Autre',
            caps: 10,
            score: 2,
            title: 'Titre',
            avatar: { head: 'h', body: 'b', legs: 'l', feet: 'f', gender: 'Men', animation: 'Idle' },
            shop_items: [],
            squads: [],
            unlocked_badges: [],
            stats: {},
        },
        isLoading: false,
    }),
}));

vi.mock('../components/Profile/VestiairePanel', () => ({ default: () => <div data-testid='vestiaire-fixture'/> }));
vi.mock('../store/useUserStore', () => ({
    useUserStore: (selector: (state: { logout: () => void }) => unknown) => selector({ logout: fixtures.logout }),
}));

function host() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}><Profile/></QueryClientProvider>;
}

describe('B08 - logout du profil', () => {
    beforeEach(() => {
        fixtures.id = undefined;
        fixtures.logout.mockReset();
    });

    it('affiche le bouton sur son propre profil et declenche logout une seule fois', () => {
        render(host());
        const button = screen.getByRole('button', { name: 'Se déconnecter' });
        fireEvent.click(button);
        expect(fixtures.logout).toHaveBeenCalledTimes(1);
    });

    it("n'affiche pas le bouton sur le profil d'un autre", () => {
        fixtures.id = '2';
        render(host());
        expect(screen.queryByRole('button', { name: 'Se déconnecter' })).toBeNull();
    });

    it('est atteignable au clavier', () => {
        render(host());
        const button = screen.getByRole('button', { name: 'Se déconnecter' });
        button.focus();
        expect(button).toHaveFocus();
        expect(button.tagName).toBe('BUTTON');
    });
});
