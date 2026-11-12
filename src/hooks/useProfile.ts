// src/hooks/useProfile.ts
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {api} from '../lib/api';
import type {AvatarSprites} from '../types/avatar';
import {useDocumentVisible} from './useDocumentVisible';
import {createSpritePollingPolicy} from './avatarSpritePolling';

export type ItemCategory = 'head' | 'body' | 'legs' | 'feet' | 'accessory';
export type Gender = 'Men' | 'Women' | 'Unisex';

export interface ShopItem {
    id: string;
    name: string;
    category: ItemCategory;
    gender: Gender;
    price: number;
    is_owned: boolean; // Flag critique pour l'UI
    /** Nom de fichier courant ; l'id reste la clé stable d'équipement. */
    source?: string | null;
    /** Défense locale : absent = considéré disponible. */
    available?: boolean;
}

// 🚀 NOUVELLE INTERFACE POUR LES STATS
export interface UserStats {
    aperos_created: number;
    aperos_joined: number;
    aperos_declined: number;
    aperos_missed: number;
    fraud_count: number;
}

export interface Badge {
    id: string;
    name: string;
    description?: string | null;
    icon?: string | null;
}

export interface ProfileSquad {
    id: number;
    name: string;
    icon: string;
    color: string;
}

export interface UserProfile {
    id: number;
    username: string;
    caps: number;
    score: number;
    title: string;
    avatar: {
        head: string;
        body: string;
        legs: string;
        feet: string;
        accessory: string;
        animation?: string;
        gender: Gender;
    };
    unlocked_badges: Badge[];
    shop_items: ShopItem[];
    squads: ProfileSquad[];
    stats: UserStats;
    /** B04 — sprites 2D de la tenue courante (A07/A08). */
    avatar_sprites?: AvatarSprites;
}

export function useProfile(userId: string = 'me', enabled = true) {
    // Abonnement à la visibilité (re-render au changement) ; la politique lit
    // document.hidden à l'appel de l'interval, jamais pendant le rendu.
    useDocumentVisible();
    const [policy] = useState(() => createSpritePollingPolicy({ isActive: () => !document.hidden }));

    return useQuery({
        queryKey: ['profile', userId],
        queryFn: async () => {
            // Unifie les routes : 'me' pointe vers son propre profil, sinon vers l'ID cible
            const endpoint = userId === 'me' ? '/auth/profile/' : `/auth/profile/${userId}/`;
            const response = await api.get<UserProfile>(endpoint);
            return response.data;
        },
        // Garde les données fraîches pour éviter les flashs au passage Signup -> Dashboard
        staleTime: 1000 * 60,
        enabled,
        refetchInterval: policy,
    });
}
