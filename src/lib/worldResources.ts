import type { ComponentType } from 'react';
import type { WorldParticipant } from '../types/api';

export type WorldTab = 'bar' | 'piscine' | 'dodo';
export interface WorldComponentProps {
    participants: WorldParticipant[];
    onReadinessChange?: (isReady: boolean) => void;
    isActiveApero?: boolean;
    aperoId?: string;
    squadId?: string;
    onSelectPhoto?: (url: string) => void;
    participantsReliable?: boolean;
}
export interface LoadedWorldModule { default: ComponentType<WorldComponentProps> }
export const WORLD_RESOURCES = [
    { tab: 'bar', model: '/models/Bar.fbx' },
    { tab: 'piscine', model: '/models/Swimming_pool.fbx' },
    { tab: 'dodo', model: '/models/Floaty_Island.fbx' },
] as const;

export function loadWorldModule(tab: WorldTab): Promise<LoadedWorldModule> {
    switch (tab) {
        // SelectWorldModal's bar branch supplies the required game/photo props.
        case 'bar': return import('../components/3D/BarWorld') as Promise<LoadedWorldModule>;
        case 'piscine': return import('../components/3D/PiscineWorld');
        case 'dodo': return import('../components/3D/FloatyIslandWorld');
    }
}

// Foreground and preparation MUST share the same query and module identity.
export function worldModuleQueryOptions(tab: WorldTab, loader = loadWorldModule) {
    return {
        queryKey: ['world-module', tab], queryFn: () => loader(tab),
        staleTime: Infinity, gcTime: Infinity, retry: 1, retryDelay: 100,
        refetchOnWindowFocus: false, refetchOnReconnect: false,
    } as const;
}
