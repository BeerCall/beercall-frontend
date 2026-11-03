import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from './utils/test-utils';
import Connections from '../pages/Connections';

vi.mock('@tanstack/react-query', async () => ({
    ...(await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')),
    useQuery: () => ({
        isLoading: false,
        data: [{
            id: '7',
            username: 'LISA',
            caps: 3,
            score: 12,
            title: 'Brasseur',
            avatar: { head: 'head_base', body: 'body_tshirt', legs: 'legs_jeans', feet: 'shoes', accessory: 'none', gender: 'Women' },
            avatar_sprites: { hash: 'h', portrait_url: '/uploads/avatars/v1/h/portrait.webp', head_url: null, body_url: null, pending: false, status: 'ready' },
        }],
    }),
}));

vi.mock('react-router-dom', async () => ({
    ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
    useNavigate: () => vi.fn(),
}));

describe('Connexions - miniature 2D (B06)', () => {
    it('rend un portrait object-cover dans la cellule', async () => {
        const view = render(<Connections />);
        const img = await screen.findByAltText('LISA');
        expect(img.tagName).toBe('IMG');
        expect(img.getAttribute('src')).toBe('/uploads/avatars/v1/h/portrait.webp');
        expect(img.className).toContain('object-cover');
        const cell = view.container.querySelector('[data-avatar-sprite="portrait"]')!.parentElement!.parentElement!;
        expect(cell.className).toContain('w-24');
        const card = screen.getByText('LISA').closest('div.group');
        expect(card).not.toHaveStyle({ opacity: '0' });
        expect(card).not.toHaveStyle({ transform: 'translateX(-20px)' });
    });

    it('conserve la cellule hors route sans remontage', async () => {
        const view = render(<Connections active={false} />);
        const img = await screen.findByAltText('LISA');
        view.rerender(<Connections active />);
        expect(screen.getByAltText('LISA')).toBe(img);
    });
});
