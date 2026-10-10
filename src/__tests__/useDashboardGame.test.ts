import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useDashboard } from '../hooks/useDashboard';
import { useGameUIStore } from '../store/useGameUIStore';

const route = vi.hoisted(() => ({ id: '1' }));
vi.mock('react-router-dom', () => ({ useParams: () => route, useNavigate: () => vi.fn() }));
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ data: null }) }));
vi.mock('../hooks/useSquadDetails', () => ({ useSquadDetails: () => ({ data: null }) }));
vi.mock('../hooks/usePushNotifications', () => ({ usePushNotifications: () => ({ subscribeToNotifications: vi.fn() }) }));
vi.mock('../hooks/useSquadWebSocket', () => ({ useSquadWebSocket: vi.fn() }));
vi.mock('../store/useLocationStore', () => ({ useLocationStore: () => ({ userLocation: null, startTracking: vi.fn(), stopTracking: vi.fn() }) }));

afterEach(() => {
    useGameUIStore.getState().closeGameScreen();
    route.id = '1';
});

it('garde le jeu ouvert dans la squad courante et le ferme au changement de squad', () => {
    const { result, rerender } = renderHook(() => useDashboard());
    act(() => useGameUIStore.getState().openGameScreen('bc_1'));
    expect(result.current.isGameScreenOpen).toBe(true);
    expect(result.current.currentAperoId).toBe('bc_1');
    rerender();
    expect(result.current.isGameScreenOpen).toBe(true);
    route.id = '2';
    rerender();
    expect(result.current.isGameScreenOpen).toBe(false);
    expect(result.current.currentAperoId).toBeNull();
});
