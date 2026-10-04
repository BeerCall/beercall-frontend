import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { render } from './utils/test-utils';
import GameScreen from '../pages/GameScreen';
import { useGameEngine } from '../hooks/useGameEngine';

// Mock de useNavigate
const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockedNavigate,
        useParams: () => ({ aperoId: 'test-apero-123' }),
    };
});

// Mock complet du hook complexe de GameEngine pour isoler le GameScreen
vi.mock('../hooks/useGameEngine', () => ({
    useGameEngine: vi.fn(),
}));

interface GameState {
    title: string;
    description: string;
    instruction_header?: string;
    turn_of?: string;
    required_sensor?: { type: string };
    actions?: unknown[];
}

interface GameEngineMock {
    gameState: GameState | null;
    isLocked: boolean;
    isError: boolean;
    sendAction: ReturnType<typeof vi.fn>;
}

describe('Système de Jeu (GameScreen)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Setup par défaut : Chargement
        const mockReturn: GameEngineMock = {
            gameState: null,
            isLocked: false,
            isError: false,
            sendAction: vi.fn(),
        };
        vi.mocked(useGameEngine).mockReturnValue(mockReturn as unknown as ReturnType<typeof useGameEngine>);
    });

    it('Scenario: Affiche l\'état de chargement si le jeu n\'est pas encore prêt', () => {
        render(<GameScreen aperoIdProp="test-apero-123" />);
        
        expect(screen.getByText(/Chargement de l'apéro test-apero-123/i)).toBeInTheDocument();
    });

    it('Scenario: Erreur Serveur (500) - Affiche l\'écran de repli explicite', async () => {
        const user = userEvent.setup();
        const mockReturn: GameEngineMock = {
            gameState: null,
            isLocked: false,
            isError: true,
            sendAction: vi.fn(),
        };
        vi.mocked(useGameEngine).mockReturnValue(mockReturn as unknown as ReturnType<typeof useGameEngine>);

        render(<GameScreen aperoIdProp="test-apero-123" />);
        
        expect(screen.getByText(/Aïe, ça a cassé !/i)).toBeInTheDocument();
        
        const returnBtn = screen.getByRole('button', { name: /Retour à l'Apéro/i });
        await user.click(returnBtn);
        
        expect(mockedNavigate).toHaveBeenCalledWith(-1);
    });

    it('Scenario: Rendu en jeu (Buttons) avec interaction', async () => {
        const user = userEvent.setup();
        const sendActionMock = vi.fn();
        
        const mockReturn: GameEngineMock = {
            gameState: {
                title: "Attention à la bombe",
                description: "Ne cliquez pas !",
                instruction_header: "TOUR DE X",
                turn_of: "Alice",
                required_sensor: { type: "BUTTONS" },
                actions: [{ action_id: 'pass', label: 'PASSER', style: 'primary' }]
            },
            isLocked: false,
            isError: false,
            sendAction: sendActionMock,
        };
        vi.mocked(useGameEngine).mockReturnValue(mockReturn as unknown as ReturnType<typeof useGameEngine>);

        render(<GameScreen aperoIdProp={null} />);
        
        // Assert Title is rendered
        expect(screen.getByText(/Attention à la bombe/i)).toBeInTheDocument();
        
        expect(screen.queryByText(/Chargement de l'apéro/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Aïe, ça a cassé !/i)).not.toBeInTheDocument();
        
        const bombButton = screen.getByRole('button', { name: /PASSER/i });
        await user.click(bombButton);
        
        expect(sendActionMock).toHaveBeenCalledWith('pass');
    });
});