import {create} from 'zustand';

interface GameUIState {
    isGameScreenOpen: boolean;
    openGameScreen: () => void;
    closeGameScreen: () => void;
}

export const useGameUIStore = create<GameUIState>((set) => ({
    isGameScreenOpen: false,
    openGameScreen: () => set({isGameScreenOpen: true}),
    closeGameScreen: () => set({isGameScreenOpen: false}),
}));