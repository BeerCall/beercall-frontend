import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUserStore } from '../store/useUserStore';
import { useToastStore, toast } from '../store/useToastStore';
import { useGameUIStore } from '../store/useGameUIStore';
import { useLocationStore } from '../store/useLocationStore';

describe('Zustand Stores', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useUserStore.setState({ username: null, isAuthenticated: false });
        useToastStore.setState({ toasts: [] });
        useGameUIStore.setState({ isGameScreenOpen: false, currentAperoId: null });
        useLocationStore.setState({ userLocation: null, isTracking: false });
    });

    it('useUserStore: login and logout', () => {
        const { result } = renderHook(() => useUserStore());
        act(() => {
            result.current.login('TestUser');
        });
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.username).toBe('TestUser');

        act(() => {
            result.current.logout();
        });
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.username).toBeNull();
    });

    it('useToastStore: add and remove toast via store and helpers', () => {
        const { result } = renderHook(() => useToastStore());
        act(() => {
            toast.success('Test Title', 'Test Message');
        });
        expect(result.current.toasts.length).toBe(1);
        expect(result.current.toasts[0].message).toBe('Test Message');
        expect(result.current.toasts[0].title).toBe('Test Title');

        const toastId = result.current.toasts[0].id;
        act(() => {
            result.current.removeToast(toastId);
        });
        expect(result.current.toasts.length).toBe(0);

        // Test auto destruction
        act(() => {
            toast.error('Error');
        });
        expect(result.current.toasts.length).toBe(1);
        act(() => {
            vi.advanceTimersByTime(6000);
        });
        expect(result.current.toasts.length).toBe(0);
    });

    it('useGameUIStore: toggle game screen', () => {
        const { result } = renderHook(() => useGameUIStore());
        act(() => {
            result.current.openGameScreen('apero-123');
        });
        expect(result.current.isGameScreenOpen).toBe(true);
        expect(result.current.currentAperoId).toBe('apero-123');

        act(() => {
            result.current.closeGameScreen();
        });
        expect(result.current.isGameScreenOpen).toBe(false);
        expect(result.current.currentAperoId).toBeNull();
    });

    it('useLocationStore: start and stop tracking', () => {
        const mockWatchPosition = vi.fn().mockImplementation((success) => {
            success({ coords: { latitude: 48, longitude: 2 } });
            return 1;
        });
        const mockGetCurrentPosition = vi.fn().mockImplementation((success) => {
            success({ coords: { latitude: 48, longitude: 2 } });
        });
        const mockClearWatch = vi.fn();
        
        global.navigator.geolocation = {
            watchPosition: mockWatchPosition,
            getCurrentPosition: mockGetCurrentPosition,
            clearWatch: mockClearWatch
        } as any;

        const { result } = renderHook(() => useLocationStore());
        act(() => {
            result.current.startTracking();
        });
        expect(result.current.isTracking).toBe(true);
        expect(result.current.userLocation?.lat).toBe(48);

        act(() => {
            result.current.stopTracking();
        });
        expect(result.current.isTracking).toBe(false);
        expect(mockClearWatch).toHaveBeenCalledWith(1);
    });
});
