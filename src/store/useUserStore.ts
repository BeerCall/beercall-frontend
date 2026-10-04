import {create} from 'zustand';
import {persist} from 'zustand/middleware';

interface UserState {
    isAuthenticated: boolean;
    username: string | null;
    login: (username: string) => void;
    logout: () => void;
}

export const useUserStore = create<UserState>()(
    persist(
        (set) => ({
            isAuthenticated: false,
            username: null,
            login: (username) => set({isAuthenticated: true, username}),
            logout: () => {
                set({isAuthenticated: false, username: null});
            },
        }),
        {name: 'user-storage'}
    )
);