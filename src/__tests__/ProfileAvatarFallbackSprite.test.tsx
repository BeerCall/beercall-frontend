import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProfileAvatarFallback } from '../components/Profile/ProfileAvatarFallback';

describe('ProfileAvatarFallback', () => {
    it('affiche le sprite corps entier eager, transparent, sans fond neutre', () => {
        const { container } = render(
            <ProfileAvatarFallback
                sprites={{
                    body_url: '/uploads/avatars/v1/hash/body.webp',
                    portrait_url: '/uploads/avatars/v1/hash/portrait.webp',
                    status: 'ready',
                }}
                username="Test"
            />,
        );

        const image = container.querySelector('[data-profile-avatar-sprite="body"]') as HTMLImageElement;
        expect(image).not.toBeNull();
        expect(image.getAttribute('src')).toBe('/uploads/avatars/v1/hash/body.webp');
        expect(image.getAttribute('loading')).toBe('eager');
        expect(image.getAttribute('fetchpriority')).toBe('high');
        expect(image.className).not.toContain('bg-neutral');
        expect(image.className).not.toContain('bg-gray');
    });

    it('retombe sur le portrait sans appliquer de fond neutre à l’image', () => {
        const { container } = render(
            <ProfileAvatarFallback
                sprites={{
                    body_url: null,
                    portrait_url: '/uploads/avatars/v1/hash/portrait.webp',
                    status: 'ready',
                }}
                username="Test"
            />,
        );

        const image = container.querySelector('[data-avatar-sprite="portrait"]') as HTMLImageElement;
        expect(image).not.toBeNull();
        expect(image.getAttribute('src')).toBe('/uploads/avatars/v1/hash/portrait.webp');
        expect(image.className).not.toContain('bg-neutral');
    });
});
