import { createElement, type ReactNode } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../__tests__/mocks/server';
import { normalizeSquadId, useMemberLocations } from './useMemberLocations';

beforeEach(() => server.resetHandlers());

const member = (id: number) => ({
    user_id: id,
    username: `Membre ${id}`,
    latitude: 48.85 + id / 1000,
    longitude: 2.35 + id / 1000,
    located_at: '2026-11-01T10:00:00Z',
});

function wrap(client: QueryClient) {
    return ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children);
}

describe('normalizeSquadId', () => {
    it('accepte les identifiants numériques positifs', () => {
        expect(normalizeSquadId(12)).toBe(12);
        expect(normalizeSquadId('12')).toBe(12);
        expect(normalizeSquadId(' 7 ')).toBe(7);
    });

    it('refuse absent, vide, négatif, décimal et texte', () => {
        expect(normalizeSquadId(undefined)).toBeNull();
        expect(normalizeSquadId(null)).toBeNull();
        expect(normalizeSquadId('')).toBeNull();
        expect(normalizeSquadId('0')).toBeNull();
        expect(normalizeSquadId('-3')).toBeNull();
        expect(normalizeSquadId('1.5')).toBeNull();
        expect(normalizeSquadId('abc')).toBeNull();
    });
});

describe('useMemberLocations', () => {
    it('utilise la clé numérique et l’URL de la squad', async () => {
        server.use(http.get('*/api/squads/12/member-locations', () => HttpResponse.json([member(1), member(2)])));
        const client = new QueryClient();
        const { result } = renderHook(() => useMemberLocations('12'), { wrapper: wrap(client) });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toHaveLength(2);
        expect(client.getQueryData(['squad', 12, 'member-locations'])).toHaveLength(2);
    });

    it('ne requête pas quand l’identifiant est invalide', () => {
        const client = new QueryClient();
        const { result } = renderHook(() => useMemberLocations('abc'), { wrapper: wrap(client) });
        expect(result.current.fetchStatus).toBe('idle');
    });

    it('ne requête pas quand désactivé', () => {
        const client = new QueryClient();
        const { result } = renderHook(() => useMemberLocations('12', false), { wrapper: wrap(client) });
        expect(result.current.fetchStatus).toBe('idle');
    });

    it('un 403 reste une erreur, jamais une liste vide prête', async () => {
        let calls = 0;
        server.use(http.get('*/api/squads/12/member-locations', () => {
            calls += 1;
            return new HttpResponse(null, { status: 403 });
        }));
        const client = new QueryClient();
        const { result } = renderHook(() => useMemberLocations('12'), { wrapper: wrap(client) });
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.data).toBeUndefined();
        expect(result.current.isSuccess).toBe(false);
        expect(calls).toBe(1);
    });
});
