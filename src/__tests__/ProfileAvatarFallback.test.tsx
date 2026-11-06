import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileAvatarScene } from '../components/3D/ProfileAvatarScene';
import type { AvatarConfig } from '../types/avatar';

const realAvatarMock = vi.hoisted(() => ({
    mode: 'loading' as 'loading' | 'ready' | 'error',
}));

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
    useThree: () => ({ camera: { lookAt: vi.fn() } }),
}));

vi.mock('../three/lease/useLease', () => ({
    useLease: () => ({ granted: true, token: { generation: 1 } }),
}));

vi.mock('../avatar/glb/RealAvatar', () => ({
    RealAvatar: ({
        onReadinessChange,
        onActiveClipChange,
    }: {
        onReadinessChange?: (ready: boolean) => void;
        onActiveClipChange?: (name: string) => void;
    }) => {
        React.useEffect(() => {
            if (realAvatarMock.mode === 'ready') {
                onReadinessChange?.(true);
                onActiveClipChange?.('Idle');
            } else if (realAvatarMock.mode === 'error') {
                onReadinessChange?.(false);
            }
        }, [onReadinessChange, onActiveClipChange]);
        return realAvatarMock.mode === 'ready' ? <div data-testid="real-avatar" /> : null;
    },
}));

const config: AvatarConfig = {
    head: 'Men_head_Casual_0',
    body: 'Men_body_Casual_0',
    legs: 'Men_legs_Casual_0',
    feet: 'Men_feet_Casual_0',
    accessory: 'none',
    gender: 'Men',
    animation: 'Idle',
};

function renderScene() {
    return render(
        <ProfileAvatarScene
            config={config}
            fallback={<div data-testid="sprite-fallback">Sprite de secours</div>}
        />,
    );
}

describe('ProfileAvatarScene — aucun état vide sans repli', () => {
    beforeEach(() => {
        realAvatarMock.mode = 'loading';
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(performance.now());
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', () => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('affiche le sprite pendant le chargement 3D', () => {
        renderScene();
        expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
        expect(screen.getByTestId('sprite-fallback')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('affiche le sprite et une erreur visible si la 3D échoue', () => {
        realAvatarMock.mode = 'error';
        renderScene();
        expect(screen.getByTestId('sprite-fallback')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent(/3D indisponible/i);
    });

    it('masque le sprite quand la 3D et le clip actif sont prêts', () => {
        realAvatarMock.mode = 'ready';
        renderScene();
        expect(screen.queryByTestId('avatar-fallback')).toBeNull();
        expect(screen.getByTestId('real-avatar')).toBeInTheDocument();
    });
});
