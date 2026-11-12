import {useQuery} from '@tanstack/react-query';
import {api} from '../lib/api';
import type {MemberLocation} from '../types/api';
import {useDocumentVisible} from './useDocumentVisible';

/** B04b — normalise un identifiant de squad (chiffres uniquement, > 0). */
export function normalizeSquadId(squadId: string | number | null | undefined): number | null {
    if (typeof squadId === 'number') {
        return Number.isSafeInteger(squadId) && squadId > 0 ? squadId : null;
    }
    if (typeof squadId !== 'string') return null;
    const trimmed = squadId.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function httpStatus(error: unknown): number | undefined {
    return (error as {response?: {status?: number}} | undefined)?.response?.status;
}

/** B04b — positions des membres d'une squad, rafraîchies seulement si actif et visible. */
export function useMemberLocations(
    squadId: string | number | null | undefined,
    enabled = true,
) {
    const visible = useDocumentVisible();
    const numericId = normalizeSquadId(squadId);
    const active = numericId !== null && enabled && visible;

    return useQuery({
        queryKey: ['squad', numericId, 'member-locations'],
        queryFn: async (): Promise<MemberLocation[]> => {
            if (numericId === null) return [];
            const response = await api.get<MemberLocation[]>(`/squads/${numericId}/member-locations`);
            return response.data;
        },
        enabled: active,
        staleTime: 15_000,
        refetchInterval: active ? 30_000 : false,
        // Un retrait d'accès (401/403) n'est ni une liste vide ni une raison de
        // réessayer : la query reste en erreur, aucune donnée d'une autre squad
        // n'est réutilisée (pas de placeholderData inter-squad).
        retry: (failureCount, error) => {
            const status = httpStatus(error);
            if (status === 401 || status === 403) return false;
            return failureCount < 1;
        },
    });
}
