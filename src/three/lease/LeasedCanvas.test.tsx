import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.unmock('./useLease');

import { globalLeaseController } from './leaseController';
import { LeasedCanvas } from './LeasedCanvas';
import { resetLeaseStore } from './leaseStore';
import { resetWebglStats } from './webgl';

// Mock local de Canvas pour capturer les props et simuler la factory gl
const mockCanvasRender = vi.fn();
vi.mock('@react-three/fiber', () => ({
    Canvas: (props: Record<string, unknown>) => {
        mockCanvasRender(props);
        return <div data-testid="fiber-canvas">{props.children as React.ReactNode}</div>;
    },
}));

describe('B10b — LeasedCanvas (allocation sous contrôle de lease)', () => {
    beforeEach(() => {
        globalLeaseController.reset();
        resetLeaseStore();
        resetWebglStats();
        mockCanvasRender.mockClear();
    });

    afterEach(() => {
        globalLeaseController.reset();
    });

    it('affiche le fallback et ne monte aucun Canvas tant que la lease n’est pas accordée', async () => {
        // Occuper la lease avec une autre ressource
        const token1 = await globalLeaseController.request('map', 'm1');

        render(
            <LeasedCanvas
                surface="profile"
                fallback={<div data-testid="my-fallback">Chargement 3D...</div>}
            >
                <mesh />
            </LeasedCanvas>,
        );

        // Tant que token1 n'est pas libéré, le canvas Fiber n'existe pas
        expect(screen.getByTestId('my-fallback')).not.toBeNull();
        expect(screen.queryByTestId('fiber-canvas')).toBeNull();

        // Libération de token1 -> la lease profile est accordée et Canvas est monté
        await globalLeaseController.release(token1);

        await waitFor(() => {
            expect(screen.getByTestId('fiber-canvas')).not.toBeNull();
        });
        expect(screen.queryByTestId('my-fallback')).toBeNull();
    });

    it('affiche un message d’erreur quand la lease est bloquée', () => {
        globalLeaseController.block('Contexte GPU perdu');

        render(
            <LeasedCanvas surface="profile">
                <mesh />
            </LeasedCanvas>,
        );

        expect(screen.getByRole('alert')).not.toBeNull();
        expect(screen.getByText(/Contexte 3D bloqué/)).not.toBeNull();
        expect(screen.queryByTestId('fiber-canvas')).toBeNull();
    });

    it('configure un DPR borné à 1.5 maximum et désactive antialias et shadows', async () => {
        render(
            <LeasedCanvas surface="signup">
                <mesh />
            </LeasedCanvas>,
        );

        await waitFor(() => {
            expect(mockCanvasRender).toHaveBeenCalled();
        });

        const props = mockCanvasRender.mock.calls[0][0];
        expect(props.shadows).toBe(false);
        const resolvedMaxDpr = Array.isArray(props.dpr) ? props.dpr[1] : props.dpr;
        expect(resolvedMaxDpr).toBeLessThanOrEqual(1.5);
    });

    it('rejette la factory gl si le token est devenu périmé avant l’allocation', async () => {
        render(
            <LeasedCanvas surface="world">
                <mesh />
            </LeasedCanvas>,
        );

        await waitFor(() => {
            expect(mockCanvasRender).toHaveBeenCalled();
        });

        const props = mockCanvasRender.mock.calls[0][0];
        const glFactory = props.gl;

        // Périmer artificiellement la lease en réinitialisant le contrôleur
        globalLeaseController.reset();

        const fakeCanvas = document.createElement('canvas');
        expect(() => glFactory(fakeCanvas)).toThrow(/Token de lease WebGL périmé/);
    });

    it('gère le démontage sans attente infinie et libère le slot pour le suivant', async () => {
        const { unmount } = render(
            <LeasedCanvas surface="profile">
                <mesh />
            </LeasedCanvas>,
        );

        await waitFor(() => {
            expect(globalLeaseController.current()?.surface).toBe('profile');
        });

        // Démontage du composant
        unmount();

        // Le contrôleur redevient disponible
        await waitFor(() => {
            expect(globalLeaseController.current()).toBeNull();
            expect(globalLeaseController.status()).toBe('idle');
        });
    });
});
