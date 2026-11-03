import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { resetLeaseStore } from '../three/lease/leaseStore';
import { WorldCanvas } from './WorldCanvas';

let triggerFirstFrameCallback: (() => void) | null = null;

vi.mock('./WorldFirstFrame', () => ({
    WorldFirstFrame: ({ onFirstFrameRendered }: { onFirstFrameRendered?: () => void }) => {
        triggerFirstFrameCallback = onFirstFrameRendered ?? null;
        return null;
    },
}));

vi.mock('../three/lease/LeasedCanvas', () => ({
    LeasedCanvas: ({ children }: { children?: React.ReactNode }) => (
        <div data-testid="leased-canvas-double">{children}</div>
    ),
}));

describe('B14b — WorldCanvas (gestion du poster et de la première frame)', () => {
    beforeEach(() => {
        resetLeaseStore();
        triggerFirstFrameCallback = null;
    });

    it('affiche le poster en surimpression opaque tant que la scène n’a pas rendu de frame', () => {
        render(
            <WorldCanvas world="bar">
                <mesh />
            </WorldCanvas>,
        );

        const overlay = screen.getByTestId('world-poster-overlay');
        expect(overlay).not.toBeNull();
        expect(overlay.className).toContain('opacity-100');
        expect(overlay.className).not.toContain('opacity-0');
    });

    it('masque le poster par transition d’opacité dès la première frame GPU rendue', async () => {
        const onReady = vi.fn();

        render(
            <WorldCanvas world="piscine" onReady={onReady}>
                <mesh />
            </WorldCanvas>,
        );

        const overlay = screen.getByTestId('world-poster-overlay');
        expect(overlay.className).toContain('opacity-100');

        // Simulation de la première frame rendue
        triggerFirstFrameCallback?.();

        await waitFor(() => {
            expect(overlay.className).toContain('opacity-0');
            expect(overlay.className).toContain('pointer-events-none');
            expect(onReady).toHaveBeenCalledWith(true);
        });
    });

    it('charge l’image du poster correspondant au monde demandé', () => {
        render(<WorldCanvas world="dodo" />);

        const img = screen.getByRole('img');
        expect(img.getAttribute('src')).toBe('/worlds/dodo.webp');
        expect(img.getAttribute('alt')).toContain('Dodo');
    });
});
