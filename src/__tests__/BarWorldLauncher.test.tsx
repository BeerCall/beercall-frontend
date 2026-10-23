import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { render } from './utils/test-utils';
import BarWorld from '../components/3D/BarWorld';
import { useGameEngine } from '../hooks/useGameEngine';
import { useGameUIStore } from '../store/useGameUIStore';
import { useToastStore } from '../store/useToastStore';

// Mocks Three / Drei / Fiber
vi.mock('three-stdlib', () => ({
    SkeletonUtils: { clone: (obj: unknown) => obj }
}));

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }: React.PropsWithChildren<unknown>) => <div data-testid="canvas-mock">{children}</div>,
    useFrame: vi.fn(),
}));

vi.mock('@react-three/drei', () => {
    const dummyScene = { clone: () => dummyScene, traverse: (cb: (node: { isMesh: boolean }) => void) => cb({ isMesh: true }), children: [] };
    const useFBXMock = vi.fn().mockReturnValue(dummyScene) as unknown as { preload: () => void; (path: string): unknown };
    useFBXMock.preload = vi.fn();
    return {
        useFBX: useFBXMock,
        Float: ({ children }: React.PropsWithChildren<unknown>) => <div>{children}</div>,
        ContactShadows: () => null,
        Html: ({ children }: React.PropsWithChildren<unknown>) => <div>{children}</div>,
        Text: ({ children }: React.PropsWithChildren<unknown>) => <span>{children}</span>,
    };
});

vi.mock('../hooks/useGameEngine', () => ({
    useGameEngine: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => vi.fn(),
    };
});

describe('BarWorld Launcher & 3D Machine Visibility (T05)', () => {
    let mockStartGame: ReturnType<typeof vi.fn>;
    let mockOpenGameScreen: ReturnType<typeof vi.fn>;

    const sampleParticipants = (count: number) =>
        Array.from({ length: count }, (_, i) => ({
            id: String(i + 1),
            username: `User${i + 1}`,
            avatar: { head: 'cap', gender: 'Men' },
        }));

    beforeEach(() => {
        vi.useFakeTimers();
        mockStartGame = vi.fn();
        mockOpenGameScreen = vi.fn();

        vi.mocked(useGameEngine).mockReturnValue({
            gameState: null,
            startGame: mockStartGame,
            isLocked: false,
            isError: false,
            sendAction: vi.fn(),
        } as unknown as ReturnType<typeof useGameEngine>);

        useGameUIStore.setState({ openGameScreen: mockOpenGameScreen });
        useToastStore.setState({ toasts: [] });
    });

    it('0 participant -> machine absente de la scène', () => {
        render(
            <BarWorld
                aperoId="apero-1"
                squadId="squad-1"
                participants={[]}
                isActiveApero={true}
                participantsReliable={true}
                onSelectPhoto={vi.fn()}
            />
        );
        expect(screen.queryByText(/JACKPOT/i)).not.toBeInTheDocument();
    });

    it('1 participant -> machine absente de la scène', () => {
        render(
            <BarWorld
                aperoId="apero-1"
                squadId="squad-1"
                participants={sampleParticipants(1)}
                isActiveApero={true}
                participantsReliable={true}
                onSelectPhoto={vi.fn()}
            />
        );
        expect(screen.queryByText(/JACKPOT/i)).not.toBeInTheDocument();
    });

    it('apéro inactif -> machine absente même avec >= 2 participants', () => {
        render(
            <BarWorld
                aperoId="apero-1"
                squadId="squad-1"
                participants={sampleParticipants(3)}
                isActiveApero={false}
                participantsReliable={true}
                onSelectPhoto={vi.fn()}
            />
        );
        expect(screen.queryByText(/JACKPOT/i)).not.toBeInTheDocument();
    });

    it('données non fiables -> machine absente même avec 2 participants', () => {
        render(
            <BarWorld
                aperoId="apero-1"
                squadId="squad-1"
                participants={sampleParticipants(2)}
                isActiveApero={true}
                participantsReliable={false}
                onSelectPhoto={vi.fn()}
            />
        );
        expect(screen.queryByText(/JACKPOT/i)).not.toBeInTheDocument();
    });

    it('2 participants, actif et fiable -> machine présente sur la scène', () => {
        render(
            <BarWorld
                aperoId="apero-1"
                squadId="squad-1"
                participants={sampleParticipants(2)}
                isActiveApero={true}
                participantsReliable={true}
                onSelectPhoto={vi.fn()}
            />
        );
        expect(screen.getByText(/JACKPOT/i)).toBeInTheDocument();
    });

    it('tirer le levier avec succès serveur -> ouvre GameScreen après 600ms', () => {
        mockStartGame.mockImplementation((callbacks?: { onSuccess?: () => void }) => {
            callbacks?.onSuccess?.();
        });

        render(
            <BarWorld
                aperoId="apero-42"
                squadId="squad-1"
                participants={sampleParticipants(2)}
                isActiveApero={true}
                participantsReliable={true}
                onSelectPhoto={vi.fn()}
            />
        );

        const jackpot = screen.getByText(/JACKPOT/i);
        const machineGroup = jackpot.closest('group');
        expect(machineGroup).toBeInTheDocument();

        // Le levier cliquable est le 4e enfant de SlotMachine
        const clickableGroup = machineGroup?.parentElement?.querySelector('group[position="4.5,5,0"]');
        expect(clickableGroup).toBeTruthy();
        fireEvent.click(clickableGroup!);

        // Avant les 600ms de l'animation physique, pas d'appel réseau
        expect(mockStartGame).not.toHaveBeenCalled();

        // Après 600ms
        vi.advanceTimersByTime(600);
        expect(mockStartGame).toHaveBeenCalledTimes(1);
        expect(mockOpenGameScreen).toHaveBeenCalledWith('apero-42');
    });

    it('démarrage rejeté par le serveur -> aucune ouverture d’écran et toast d’erreur affiché (CHAL-08)', () => {
        mockStartGame.mockImplementation((callbacks?: { onError?: (err: Error) => void }) => {
            callbacks?.onError?.(new Error('Apéro expiré'));
        });

        render(
            <BarWorld
                aperoId="apero-42"
                squadId="squad-1"
                participants={sampleParticipants(2)}
                isActiveApero={true}
                participantsReliable={true}
                onSelectPhoto={vi.fn()}
            />
        );

        const jackpot = screen.getByText(/JACKPOT/i);
        const machineGroup = jackpot.closest('group');
        const clickableGroup = machineGroup?.parentElement?.querySelector('group[position="4.5,5,0"]');
        expect(clickableGroup).toBeTruthy();
        fireEvent.click(clickableGroup!);

        vi.advanceTimersByTime(600);
        expect(mockStartGame).toHaveBeenCalledTimes(1);
        // Ne doit PAS ouvrir l'écran de jeu
        expect(mockOpenGameScreen).not.toHaveBeenCalled();

        // Doit émettre un toast d'erreur
        const toasts = useToastStore.getState().toasts;
        expect(toasts.some(t => t.title === 'Jeu indisponible')).toBe(true);
    });

    it('quand isLocked est vrai -> action interdite, ni mutation ni ouverture', () => {
        vi.mocked(useGameEngine).mockReturnValue({
            gameState: null,
            startGame: mockStartGame,
            isLocked: true,
            isError: false,
            sendAction: vi.fn(),
        } as unknown as ReturnType<typeof useGameEngine>);

        render(
            <BarWorld
                aperoId="apero-42"
                squadId="squad-1"
                participants={sampleParticipants(2)}
                isActiveApero={true}
                participantsReliable={true}
                onSelectPhoto={vi.fn()}
            />
        );

        const jackpot = screen.getByText(/JACKPOT/i);
        const machineGroup = jackpot.closest('group');
        const clickableGroup = machineGroup?.parentElement?.querySelector('group[position="4.5,5,0"]');
        expect(clickableGroup).toBeTruthy();
        fireEvent.click(clickableGroup!);

        vi.advanceTimersByTime(1000);
        expect(mockStartGame).not.toHaveBeenCalled();
        expect(mockOpenGameScreen).not.toHaveBeenCalled();
    });
});
