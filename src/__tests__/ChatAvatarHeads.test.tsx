import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPage from '../pages/ChatPage';

const sprite = (id: string) => ({
    hash: `h${id}`,
    head_url: `/uploads/avatars/v1/h${id}/head.webp`,
    portrait_url: null,
    body_url: null,
    pending: false,
    status: 'ready',
});

const state = vi.hoisted(() => ({
    profiles: {} as Record<string, { id: string; username: string; avatar_sprites?: unknown } | undefined>,
    send: vi.fn(),
    messages: [] as { id: string; userId: string; username: string; text: string; timestamp: number }[],
}));

vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '1' }), useNavigate: () => vi.fn() }));
vi.mock('../hooks/useSquadWebSocket', () => ({ useSquadWebSocket: () => undefined }));
vi.mock('../hooks/useSquadDetails', () => ({ useSquadDetails: () => ({ data: { name: 'Synthetic squad' } }) }));
vi.mock('../hooks/useChat', () => ({ useChat: () => ({ messages: state.messages, sendMessage: state.send, loading: false, error: null }) }));
vi.mock('../hooks/useProfile', () => ({ useProfile: (id = 'me') => ({ data: state.profiles[id] }) }));

function Host() {
    const [client] = React.useState(() => new QueryClient());
    return <QueryClientProvider client={client}><ChatPage /></QueryClientProvider>;
}

describe('chat portraits 2D (B06b)', () => {
    beforeEach(() => {
        state.send.mockReset();
        state.profiles = { me: { id: '0', username: 'Fixture me' } };
        for (const id of ['1', '2', '3']) state.profiles[id] = { id, username: `Fixture ${id}`, avatar_sprites: sprite(id) };
        state.messages = Array.from({ length: 30 }, (_, i) => ({
            id: `message-${i}`, userId: String(i % 3 + 1), username: 'Fixture', text: `Synthetic message ${i}`, timestamp: 1,
        }));
    });

    it('affiche 30 portraits, 3 sources distinctes, 0 canvas', () => {
        const view = render(<Host />);
        const images = [...view.container.querySelectorAll('img')];
        expect(images).toHaveLength(30);
        expect(new Set(images.map((img) => img.getAttribute('src'))).size).toBe(3);
        expect(view.container.querySelectorAll('canvas')).toHaveLength(0);
        expect(state.send).not.toHaveBeenCalled();
    });

    it('affiche une initiale quand le sprite manque', () => {
        state.profiles['1'] = { id: '1', username: 'Alice' };
        state.messages = [state.messages[0]];
        const view = render(<Host />);
        expect(view.container.querySelector('[data-avatar-fallback]')?.textContent).toBe('F');
        expect(view.container.querySelectorAll('img')).toHaveLength(0);
    });

    it('conserve les sprites du meme sender, puis ne met a jour que le sender change', () => {
        state.messages = [state.messages[0], state.messages[1]];
        const view = render(<Host />);
        const before = [...view.container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
        state.profiles['1'] = undefined;
        view.rerender(<Host />);
        const retained = [...view.container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
        expect(retained[0]).toBe(before[0]);
        state.profiles['1'] = { id: '1', username: 'Fixture 1', avatar_sprites: { ...sprite('1'), head_url: '/new.webp' } };
        view.rerender(<Host />);
        const after = [...view.container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
        expect(after[0]).toBe('/new.webp');
        expect(after[1]).toBe(before[1]);
    });
});
