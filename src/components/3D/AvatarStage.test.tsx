import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { AvatarStage } from './AvatarStage';
import type { AvatarConfig } from '../../types/avatar';
import { globalLeaseController } from '../../three/lease/leaseController';
import { resetLeaseStore } from '../../three/lease/leaseStore';

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }: { children?: React.ReactNode }) => <div data-testid="mock-fiber-canvas">{children}</div>,
    useThree: () => ({
        camera: {
            fov: 38,
            position: { set: vi.fn() },
            lookAt: vi.fn(),
            updateProjectionMatrix: vi.fn(),
            updateMatrixWorld: vi.fn(),
        },
        size: { width: 300, height: 400 },
    }),
}));

vi.mock('../../avatar/AvatarRenderer', () => ({
    AvatarRenderer: ({ config, onAnimationsLoaded, onReadinessChange }: {
        config: AvatarConfig;
        onAnimationsLoaded?: (names: string[]) => void;
        onReadinessChange?: (ready: boolean, details?: { parts: string[]; meshCount: number }) => void;
    }) => {
        React.useEffect(() => {
            onAnimationsLoaded?.(['Idle', 'Walk', 'Sitting']);
            onReadinessChange?.(true, { parts: ['head', 'body'], meshCount: 2 });
        }, [onAnimationsLoaded, onReadinessChange]);

        return <div data-testid="avatar-renderer-double" data-head={config.head} />;
    },
}));

describe('B13 — AvatarStage (scène 3D isolée sous LeasedCanvas)', () => {
    beforeEach(() => {
        globalLeaseController.reset();
        resetLeaseStore();
    });

    it('monte LeasedCanvas avec la surface profile et transmet les callbacks', async () => {
        const onAnimationsLoaded = vi.fn();
        const onReadinessChange = vi.fn();

        const config: AvatarConfig = {
            gender: 'Men',
            head: 'Men_head_Casual_0',
            body: 'Men_body_Casual_0',
            legs: 'Men_legs_Casual_0',
            feet: 'Men_feet_Casual_0',
            animation: 'Idle',
        };

        render(
            <AvatarStage
                surface="profile"
                config={config}
                onAnimationsLoaded={onAnimationsLoaded}
                onReadinessChange={onReadinessChange}
            />,
        );

        await waitFor(() => {
            expect(screen.getByTestId('avatar-renderer-double')).not.toBeNull();
        });

        expect(screen.getByTestId('avatar-renderer-double').getAttribute('data-head')).toBe('Men_head_Casual_0');
        expect(onAnimationsLoaded).toHaveBeenCalledWith(['Idle', 'Walk', 'Sitting']);
        expect(onReadinessChange).toHaveBeenCalledWith(true, { parts: ['head', 'body'], meshCount: 2 });
    });

    it('affiche le fallback quand aucune configuration n’est fournie', () => {
        render(
            <AvatarStage
                surface="profile"
                config={null}
                fallback={<div data-testid="stage-fallback">Aucun avatar</div>}
            />,
        );

        expect(screen.getByTestId('stage-fallback')).not.toBeNull();
        expect(screen.queryByTestId('avatar-renderer-double')).toBeNull();
    });
});
