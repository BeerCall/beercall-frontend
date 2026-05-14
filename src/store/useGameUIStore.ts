import {create} from 'zustand';

interface GameUIState {
    isGameScreenOpen: boolean;
    currentAperoId: string | null;
    openGameScreen: (aperoId: string) => void;
    closeGameScreen: () => void;
}

export const useGameUIStore = create<GameUIState>((set) => ({
    isGameScreenOpen: false,
    currentAperoId: null,
    openGameScreen: (aperoId) => set({
        isGameScreenOpen: true,
        currentAperoId: aperoId
    }),
    closeGameScreen: () => set({
        isGameScreenOpen: false,
        currentAperoId: null
    }),
}));