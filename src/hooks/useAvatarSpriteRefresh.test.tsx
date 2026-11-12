import { useEffect } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../__tests__/mocks/server';
import { useProfile } from './useProfile';

beforeEach(() => server.resetHandlers());

const mounts = vi.hoisted(() => ({ count: 0 }));

function Probe() {
    const { data } = useProfile();
    useEffect(() => { mounts.count += 1; }, []);
    return <img data-testid="probe" alt="probe" src={data?.avatar_sprites?.portrait_url ?? ''} />;
}

function ready(portrait: string) {
    return {
        username: 'Fixture',
        avatar_sprites: {
            hash: 'abc', head_url: null, portrait_url: portrait, body_url: null,
            pending: false, status: 'ready',
        },
    };
}

describe('rafraîchissement des sprites sans quitter la page', () => {
    it('profil pending puis ready met à jour l’image sans remonter le composant', async () => {
        let calls = 0;
        server.use(http.get('*/auth/profile/', () => {
            calls += 1;
            if (calls === 1) return HttpResponse.json({
                username: 'Fixture',
                avatar_sprites: {
                    hash: 'abc', head_url: null, portrait_url: null, body_url: null,
                    pending: true, status: 'pending',
                },
            });
            return HttpResponse.json(ready('/uploads/avatars/v1/abc/portrait.webp'));
        }));

        const client = new QueryClient();
        render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);

        expect(screen.getByTestId('probe').getAttribute('src') ?? '').toBe('');
        await waitFor(() => expect(screen.getByTestId('probe').getAttribute('src'))
            .toBe('/uploads/avatars/v1/abc/portrait.webp'), { timeout: 6000 });
        expect(calls).toBeGreaterThanOrEqual(2);
        expect(mounts.count).toBe(1);
    });
});
