import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useChat } from '../hooks/useChat';

vi.mock('../lib/firebase', () => ({
    squadChatRef: () => { throw new Error('Firebase n’est pas configuré.'); },
    beerCallChatRef: () => { throw new Error('Firebase n’est pas configuré.'); },
}));
vi.mock('firebase/database', () => ({
    onValue: vi.fn(), push: vi.fn(), query: vi.fn(), orderByChild: vi.fn(), limitToLast: vi.fn(),
}));

it('termine le chargement et refuse proprement un envoi sans Firebase', async () => {
    const { result } = renderHook(() => useChat('42'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Firebase n’est pas configuré.');
    expect(result.current.messages).toEqual([]);
    let sent = true;
    await act(async () => {
        sent = await result.current.sendMessage({ text: 'Hello', userId: '1', username: 'user' });
    });
    expect(sent).toBe(false);
});
