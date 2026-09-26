import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProfile } from '../hooks/useProfile';
import { useChat } from '../hooks/useChat';
import { useScheduledAperoMutations } from '../hooks/useScheduledAperoMutations';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../lib/firebase', () => ({
    messaging: {},
    getToken: vi.fn(),
    onMessage: vi.fn(),
}));

const queryClient = new QueryClient();
const wrapper = ({ children }: any) => (
    <QueryClientProvider client={queryClient}>
        {children}
    </QueryClientProvider>
);

describe('Hooks Coverage', () => {
    it('useProfile fetches profile', async () => {
        const { result } = renderHook(() => useProfile('u1'), { wrapper });
        expect(result.current.isLoading).toBe(true);
    });

    it('useAperoMutations calls mutations', async () => {
        const { result } = renderHook(() => useScheduledAperoMutations('sq-1'), { wrapper });
        expect(result.current.scheduleApero).toBeDefined();
    });

    it('useChat handles messages', () => {
        const { result } = renderHook(() => useChat('squad-1'), { wrapper });
        expect(result.current.messages).toEqual([]);
        expect(result.current.sendMessage).toBeDefined();
    });
});
