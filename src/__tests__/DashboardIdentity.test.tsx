import {describe, expect, it, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import Dashboard from '../pages/Dashboard';

const actions = vi.hoisted(() => ({
    handleCopyCode: vi.fn(),
    handleEnableNotifications: vi.fn(),
    refetchSquad: vi.fn(),
}));

vi.mock('../hooks/useDashboard', () => ({useDashboard: vi.fn()}));
vi.mock('../components/Dashboard/MapSection', () => ({MapSection: () => <div data-testid="map"/>}));
vi.mock('../components/Dashboard/Timeline', () => ({Timeline: () => <div data-testid="timeline"/>}));
vi.mock('../components/UI/Navbar', () => ({default: () => <div data-testid="navbar"/>}));
vi.mock('react-router-dom', async () => ({
    ...await vi.importActual<typeof import('react-router-dom')>('react-router-dom'),
    useParams: () => ({id: '1'}),
    useNavigate: () => vi.fn(),
}));

import {useDashboard} from '../hooks/useDashboard';

const squad = {
    id: '1',
    name: 'Les Amis du Bar',
    color: '#F59E0B',
    icon: 'beer',
    invite_code: 'BLE-2026-XYZ',
    active_beer_call: [],
    scheduled_beer_calls: [],
    past_beer_calls: [],
};

function baseDashboard(overrides: Record<string, unknown> = {}) {
    return {
        id: '1',
        squadDetails: squad,
        isSquadPending: false,
        isSquadError: false,
        squadError: null,
        locationMessage: null,
        copied: false,
        isNightMode: false,
        showPushBanner: false,
        handleCopyCode: actions.handleCopyCode,
        handleEnableNotifications: actions.handleEnableNotifications,
        refetchSquad: actions.refetchSquad,
        isGameScreenOpen: false,
        currentAperoId: null,
        isWorldsModalOpen: null,
        isSquadModalOpen: false,
        setIsSquadModalOpen: vi.fn(),
        isJoinModalOpen: false,
        setIsJoinModalOpen: vi.fn(),
        setIsWorldsModalOpen: vi.fn(),
        fileInputRef: {current: null},
        mapRef: {current: null},
        ...overrides,
    };
}

describe('DashboardIdentity (T25b)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('affiche le nom et le code sur deux rangées, identité avant la bannière push', () => {
        vi.mocked(useDashboard).mockReturnValue(baseDashboard({showPushBanner: true, locationMessage: 'Recherche de la position GPS…'}) as never);

        render(<Dashboard/>);

        const identity = document.querySelector('[data-dashboard-identity]') as HTMLElement;
        expect(identity).toBeInTheDocument();
        expect(identity).toHaveClass('bg-white', 'text-gray-900');

        const name = screen.getByRole('heading', {name: 'Les Amis du Bar'});
        const codeButton = screen.getByRole('button', {name: 'Copier le code BLE-2026-XYZ'});
        expect(name).toBeInTheDocument();
        expect(codeButton).toBeInTheDocument();
        expect(codeButton).toHaveClass('min-h-11');
        expect(codeButton.textContent).toContain('BLE-2026-XYZ');

        // Deux rangées distinctes, dans cet ordre.
        expect(name.compareDocumentPosition(codeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        const banner = document.querySelector('[data-push-banner]') as HTMLElement;
        expect(banner).toBeInTheDocument();
        expect(identity.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // La bannière n'est plus un overlay plein écran indépendant.
        expect(banner.className).not.toContain('absolute');
        expect(banner.className).not.toContain('left-0');

        fireEvent.click(codeButton);
        expect(actions.handleCopyCode).toHaveBeenCalledTimes(1);
    });

    it('sans bannière push, l identité reste seule et le bouton Activer absent', () => {
        vi.mocked(useDashboard).mockReturnValue(baseDashboard({showPushBanner: false}) as never);
        render(<Dashboard/>);

        expect(screen.getByRole('heading', {name: 'Les Amis du Bar'})).toBeInTheDocument();
        expect(document.querySelector('[data-push-banner]')).toBeNull();
        expect(screen.queryByRole('button', {name: 'Activer'})).not.toBeInTheDocument();
    });

    it('la bannière conserve un bouton Activer de 44 px sans recouvrir le code', () => {
        vi.mocked(useDashboard).mockReturnValue(baseDashboard({showPushBanner: true}) as never);
        render(<Dashboard/>);

        const activate = screen.getByRole('button', {name: 'Activer'});
        expect(activate).toHaveClass('min-h-11', 'min-w-11', 'shrink-0');
        fireEvent.click(activate);
        expect(actions.handleEnableNotifications).toHaveBeenCalledTimes(1);
    });

    it('conserve le nom complet et le code exact, même longs', () => {
        const longName = 'Une squad au nom vraiment très long qui doit rester accessible en entier';
        vi.mocked(useDashboard).mockReturnValue(baseDashboard({
            squadDetails: {...squad, name: longName, invite_code: 'CODE-TRES-LONG-1234'},
        }) as never);

        render(<Dashboard/>);

        expect(screen.getByRole('heading', {name: longName})).toHaveClass('line-clamp-2', 'break-words');
        const codeButton = screen.getByRole('button', {name: 'Copier le code CODE-TRES-LONG-1234'});
        expect(codeButton.textContent).toContain('CODE-TRES-LONG-1234');
        expect(codeButton.className).not.toContain('truncate');
        expect(document.querySelector('[data-wheel-active]')).toBeNull();
    });

    it('en mode nuit, l identité reste opaque avec la palette de nuit', () => {
        vi.mocked(useDashboard).mockReturnValue(baseDashboard({isNightMode: true}) as never);
        render(<Dashboard/>);

        const identity = document.querySelector('[data-dashboard-identity]') as HTMLElement;
        expect(identity).toHaveClass('bg-[#0F081C]', 'text-beer-light');
        expect(identity.className).not.toContain('bg-white');
    });

    it('affiche l erreur d actualisation sans masquer les dernières données', () => {
        vi.mocked(useDashboard).mockReturnValue(baseDashboard({isSquadError: true}) as never);
        render(<Dashboard/>);

        expect(screen.getByRole('heading', {name: 'Les Amis du Bar'})).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('Actualisation impossible — dernières données affichées');
        fireEvent.click(screen.getByRole('button', {name: 'Réessayer'}));
        expect(actions.refetchSquad).toHaveBeenCalledTimes(1);
    });

    it('n affiche plus le bouton textuel Réessayer le GPS', () => {
        vi.mocked(useDashboard).mockReturnValue(baseDashboard({locationMessage: 'Position GPS indisponible'}) as never);
        render(<Dashboard/>);

        expect(screen.getByText('Position GPS indisponible')).toBeInTheDocument();
        expect(screen.queryByText('Réessayer le GPS')).not.toBeInTheDocument();
    });
});
