// src/hooks/useProfile.ts
import {useQuery} from '@tanstack/react-query';
import {api} from '../lib/api';

export type ItemCategory = 'head' | 'body' | 'legs' | 'feet' | 'accessory';
export type Gender = 'Men' | 'Women' | 'Unisex';

export interface ShopItem {
    id: string;
    name: string;
    category: ItemCategory;
    gender: Gender;
    price: number;
    is_owned: boolean; // Flag critique pour l'UI
}

export interface UserProfile {
    id: number;
    username: string;
    caps: number;
    title: string;
    avatar: {
        head: string;
        body: string;
        legs: string;
        feet: string;
        accessory: string;
        gender: Gender;
    };
    unlocked_badges: any[];
    shop_items: ShopItem[]; // Catalogue complet
    squads: any[];
}

export function useProfile(userId: string = 'me') {
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
    });
}