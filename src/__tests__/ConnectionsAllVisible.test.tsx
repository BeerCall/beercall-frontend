import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Connections from '../pages/Connections';

const sprites = (i: number) => ({
    hash: `h${i}`,
    portrait_url: `/p${i}.webp`,
    head_url: `/h${i}.webp`,
    body_url: `/b${i}.webp`,
    pending: false,
    status: 'ready',
});

const people = Array.from({ length: 4 }, (_, i) => ({
    id: String(i),
    username: `Synthetic ${i}`,
    caps: 0,
    score: 0,
    title: 'Fixture',
    avatar: { head: `head-${i}`, gender: 'Men' as const },
    avatar_sprites: sprites(i),
}));

function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(['connections'], people);
    const content = (active: boolean) => (
        <QueryClientProvider client={client}><BrowserRouter><Connections active={active} /></BrowserRouter></QueryClientProvider>
    );
    return { ...render(content(true)), client, content };
}

describe('Connexions 2D : visibilite et donnees', () => {
    it('affiche les quatre portraits, conserve le scroll et les images hors route', async () => {
        const view = mount();
        await waitFor(() => expect(view.container.querySelectorAll('[data-avatar-sprite="portrait"]')).toHaveLength(4));
        const port = screen.getByTestId('connections-scrollport');
        expect(port.scrollTop).toBe(0);
        port.scrollTop = 321;
        view.rerender(view.content(false));
        expect(view.container.querySelectorAll('[data-avatar-sprite="portrait"]')).toHaveLength(4);
        view.rerender(view.content(true));
        expect(port.scrollTop).toBe(321);
        expect(screen.getAllByTestId(/^avatar-thumb-/)).toHaveLength(4);
    });

    it('une nouvelle tenue ne change que le portrait du membre concerne', async () => {
        const view = mount();
        await waitFor(() => expect(view.container.querySelectorAll('[data-avatar-sprite="portrait"]')).toHaveLength(4));
        const before = [...view.container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
        act(() => view.client.setQueryData(['connections'], people.map((p, i) => i === 0 ? { ...p, avatar_sprites: { ...p.avatar_sprites, portrait_url: '/new.webp' } } : p)));
        await waitFor(() => expect(view.container.querySelector('img')!.getAttribute('src')).toBe('/new.webp'));
        const after = [...view.container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
        for (let i = 1; i < 4; i++) expect(after[i]).toBe(before[i]);
    });

    it('preserve le feedback hover des cartes', () => {
        mount();
        const port = screen.getByTestId('connections-scrollport');
        for (const card of port.children) {
            expect(card).toHaveClass('hover:border-beer', 'transition-[color,background-color,border-color,box-shadow,transform]');
        }
    });
});

