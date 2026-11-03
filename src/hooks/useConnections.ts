import {queryOptions, useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {api} from '../lib/api';
import type {AvatarSprites} from '../types/avatar';
import {useDocumentVisible} from './useDocumentVisible';
import {createSpritePollingPolicy} from './avatarSpritePolling';

export interface Connection {
    id: string;
    username: string;
    caps: number;
    score: number;
    title: string;
    avatar: {head: string; body: string; legs: string; feet: string; accessory: string; gender: 'Men' | 'Women'};
    /** B04 — sprites 2D de la tenue courante (A08). */
    avatar_sprites?: AvatarSprites;
}

export function connectionsQueryOptions() {
    return queryOptions({queryKey: ['connections'], queryFn: async () => {
        const response = await api.get<Connection[]>('/auth/connections/');
        return response.data;
    }});
}

export function useConnections(enabled = true) {
    useDocumentVisible();
    const [policy] = useState(() => createSpritePollingPolicy({ isActive: () => !document.hidden }));
    return useQuery({...connectionsQueryOptions(), enabled, refetchInterval: policy});
}
