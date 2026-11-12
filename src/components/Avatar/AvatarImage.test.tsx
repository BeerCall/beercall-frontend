import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AvatarImage, type AvatarSpritesLike } from './AvatarImage';

const sprites = (over: Partial<AvatarSpritesLike> = {}): AvatarSpritesLike => ({
    hash: 'h',
    head_url: '/uploads/avatars/v1/h/head.webp',
    portrait_url: '/p.webp',
    body_url: '/b.webp',
    pending: false,
    status: 'ready',
    ...over,
});

describe('AvatarImage', () => {
    it('rend une image head avec les bons attributs', () => {
        render(<AvatarImage sprites={sprites()} username='Alice' kind='head' sizePx={36} />);
        const img = screen.getByAltText('Alice') as HTMLImageElement;
        expect(img.tagName).toBe('IMG');
        expect(img.getAttribute('src')).toBe('/uploads/avatars/v1/h/head.webp');
        expect(img.getAttribute('width')).toBe('36');
        expect(img.getAttribute('height')).toBe('36');
        expect(img.getAttribute('loading')).toBe('lazy');
        expect(img.getAttribute('decoding')).toBe('async');
        expect(img.getAttribute('draggable')).toBe('false');
        expect(img.getAttribute('fetchpriority')).toBe('auto');
        expect(img.className).toContain('object-cover');
    });

    it('double la hauteur du corps et passe en eager', () => {
        render(<AvatarImage sprites={sprites()} username='Bob' kind='body' sizePx={128} eager />);
        const img = screen.getByAltText('Bob') as HTMLImageElement;
        expect(img.getAttribute('width')).toBe('128');
        expect(img.getAttribute('height')).toBe('256');
        expect(img.getAttribute('loading')).toBe('eager');
        expect(img.getAttribute('fetchpriority')).toBe('high');
    });

    it('affiche une initiale quand l URL est absente', () => {
        render(<AvatarImage username='Chloe' kind='head' sizePx={36} />);
        const fallback = screen.getByRole('img', { name: 'Chloe' });
        expect(fallback.tagName).toBe('SPAN');
        expect(fallback.textContent).toBe('C');
    });

    it('affiche ? quand le nom est vide', () => {
        render(<AvatarImage username='   ' kind='head' sizePx={36} />);
        expect(screen.getByRole('img').textContent).toBe('?');
    });

    it("bascule sur l'initiale en cas d'erreur d'image", () => {
        render(<AvatarImage sprites={sprites()} username='Dora' kind='head' sizePx={36} />);
        fireEvent.error(screen.getByAltText('Dora'));
        expect(screen.getByRole('img', { name: 'Dora' }).textContent).toBe('D');
    });

    it("n'hérite pas de l'erreur d'une ancienne URL", () => {
        const { rerender } = render(<AvatarImage sprites={sprites()} username='Eve' kind='head' sizePx={36} />);
        fireEvent.error(screen.getByAltText('Eve'));
        expect(screen.getByRole('img', { name: 'Eve' }).tagName).toBe('SPAN');
        rerender(<AvatarImage sprites={sprites({ head_url: '/new.webp' })} username='Eve' kind='head' sizePx={36} />);
        expect(screen.getByAltText('Eve').tagName).toBe('IMG');
    });

    it("ne pulse qu'en pending", () => {
        const { rerender } = render(<AvatarImage sprites={sprites({ status: 'pending' })} username='F' kind='head' sizePx={36} />);
        expect(screen.getByAltText('F').className).toContain('animate-pulse');
        rerender(<AvatarImage sprites={sprites({ status: 'failed' })} username='F' kind='head' sizePx={36} />);
        expect(screen.getByAltText('F').className).not.toContain('animate-pulse');
        rerender(<AvatarImage sprites={sprites({ status: 'disabled' })} username='F' kind='head' sizePx={36} />);
        expect(screen.getByAltText('F').className).not.toContain('animate-pulse');
    });

    it('ne rend aucun canvas', () => {
        const { container } = render(<AvatarImage sprites={sprites()} username='G' kind='portrait' sizePx={40} />);
        expect(container.querySelector('canvas')).toBeNull();
    });
});
