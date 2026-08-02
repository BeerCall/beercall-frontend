import {useQuery, useMutation, useQueryClient} from '@tanstack/react-query';
import {useCallback} from 'react';
import {api} from '../lib/api';
import type {SduiPayload} from '../types/game';

export const useGameEngine = (aperoId: string | number | undefined) => {
    const queryClient = useQueryClient();

    // 🚀 SÉCURITÉ ABSOLUE : On force la string pour que le cache soit unique
    const stringId = aperoId?.toString().replace('bc_', '');
    const queryKey = ['gameState', stringId];

    // 1. Initialisation
    const {data: gameState, isLoading, isError} = useQuery({
        queryKey,
        queryFn: async () => {
            const res = await api.get<SduiPayload>(`/aperos/${stringId}/game/state`);
            return res.data;
        },
        enabled: !!stringId, // Ne s'exécute QUE si stringId existe
        refetchOnWindowFocus: false,
    });

    const {mutate: sendActionMutation, isPending: isSending} = useMutation({
        // 🚀 On accepte maintenant un objet avec actionId ET un payload optionnel
        mutationFn: async ({actionId, payload}: { actionId: string, payload?: any }) => {
            const body = payload ? {action_id: actionId, ...payload} : {action_id: actionId};
            const res = await api.post<SduiPayload>(`/aperos/${stringId}/game/action`, body);
            return res.data;
        },
        onSuccess: (newGameState) => {
            queryClient.setQueryData(queryKey, newGameState);
        }
    });

    // 🚀 Un wrapper mémorisé pour garder une référence stable et sauver les timers
    const sendAction = useCallback((actionId: string, payload?: any) => {
        sendActionMutation({actionId, payload});
    }, [sendActionMutation]);

    // 3. Lancer la partie
    const {mutate: startGame, isPending: isStarting} = useMutation({
        mutationFn: async () => {
            const res = await api.post<SduiPayload>(`/aperos/${stringId}/game/start`);
            return res.data;
        },
        onSuccess: (initialPayload) => {
            queryClient.setQueryData(queryKey, initialPayload);
        }
    });

    return {
        gameState,
        // On bloque si c'est le tout premier chargement OU si une action est en cours
        isLocked: isLoading || isSending || isStarting,
        isError,
        sendAction,
        startGame
    };
};