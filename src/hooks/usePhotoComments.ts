import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {api} from '../lib/api';
import type {PhotoComment} from '../types/api';

interface PhotoCommentsArgs {
    squadId?: string;
    beerCallId?: string;
    ownerId?: string;
    enabled?: boolean;
}

const queryKeyFor = ({squadId, beerCallId, ownerId}: PhotoCommentsArgs) =>
    ['photo-comments', squadId ?? '', beerCallId ?? '', ownerId ?? ''] as const;

export function usePhotoComments({squadId, beerCallId, ownerId, enabled = true}: PhotoCommentsArgs) {
    const queryClient = useQueryClient();
    const ready = enabled && Boolean(squadId && beerCallId && ownerId);
    const queryKey = queryKeyFor({squadId, beerCallId, ownerId});
    const basePath = `/squads/${squadId}/beer-calls/${beerCallId}/photos/${ownerId}/comments`;

    const query = useQuery({
        queryKey,
        queryFn: async () => {
            const response = await api.get<PhotoComment[]>(basePath);
            return response.data;
        },
        enabled: ready,
    });

    const addMutation = useMutation({
        mutationFn: async (content: string) => {
            const response = await api.post<PhotoComment>(basePath, {content});
            return response.data;
        },
        onSuccess: () => queryClient.invalidateQueries({queryKey}),
    });

    const deleteMutation = useMutation({
        mutationFn: async (commentId: number) => {
            await api.delete(`/squads/${squadId}/beer-calls/${beerCallId}/comments/${commentId}`);
        },
        onSuccess: () => queryClient.invalidateQueries({queryKey}),
    });

    return {
        comments: query.data ?? [],
        isLoading: query.isPending,
        isError: query.isError,
        addComment: addMutation.mutateAsync,
        deleteComment: deleteMutation.mutateAsync,
        isAdding: addMutation.isPending,
        deletingId: deleteMutation.isPending ? deleteMutation.variables ?? null : null,
        addError: addMutation.error,
        deleteError: deleteMutation.error,
    };
}
