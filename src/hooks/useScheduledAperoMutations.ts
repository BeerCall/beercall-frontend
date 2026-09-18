import {useMutation, useQueryClient} from '@tanstack/react-query';
import {api} from '../lib/api';

export function useScheduledAperoMutations(squadId: string) {
    const queryClient = useQueryClient();
    const refresh = () => queryClient.invalidateQueries({queryKey: ['squad', squadId]});
    const scheduleApero = useMutation({
        mutationFn: (payload: {location_name: string; latitude: number; longitude: number; scheduled_for: string}) =>
            api.post(`/squads/${squadId}/scheduled-beer-calls/`, payload),
        onSuccess: refresh,
    });
    const startScheduledApero = useMutation({
        mutationFn: ({aperoId, file, latitude, longitude}: {aperoId: string; file: File; latitude: number; longitude: number}) => {
            const form = new FormData();
            form.append('file', file);
            form.append('latitude', String(latitude));
            form.append('longitude', String(longitude));
            return api.post(`/squads/${squadId}/beer-calls/${aperoId}/start/`, form, {headers: {'Content-Type': 'multipart/form-data'}});
        },
        onSuccess: refresh,
    });
    return {scheduleApero, startScheduledApero};
}
