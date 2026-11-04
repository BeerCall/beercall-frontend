import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { globalLeaseController } from '../../three/lease/leaseController';
import { resetLeaseStore } from '../../three/lease/leaseStore';
import { resetWebglStats } from '../../three/lease/webgl';
import { MapSection } from './MapSection';

const mapProps = vi.fn();

vi.mock('react-map-gl/maplibre', () => ({
    default: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
        mapProps(props);
        return <div data-testid="mock-map">{props.children as React.ReactNode}</div>;
    },
    Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    NavigationControl: () => null,
    useMap: () => ({ current: null }),
    Source: ({ children }: { children?: React.ReactNode }) => <div data-testid="mock-source">{children}</div>,
    Layer: () => null,
}));

const baseProps: Parameters<typeof MapSection>[0] = {
    mapRef: { current: null },
    userLocation: { lat: 48.8566, lng: 2.3522 },
    isNightMode: false,
    canCreateFromLocation: true,
    visible: true,
    active: true,
    squadDetails: null,
    profile: { id: 1, username: 'test', avatar: {} } as unknown as Parameters<typeof MapSection>[0]['profile'],
    handleMapPointerDown: vi.fn(),
    cancelLongPress: vi.fn(),
    handleMapPointerMove: vi.fn(),
    handleManualRecenter: vi.fn(),
    handleBeerCallClick: vi.fn(),
    openCamera: vi.fn(),
    setIsWorldsModalOpen: vi.fn(),
    people: [],
};

describe('P0 — carte hors lease et persistante', () => {
    beforeEach(() => {
        globalLeaseController.reset();
        resetLeaseStore();
        resetWebglStats();
        mapProps.mockClear();
    });

    it('crée la carte native maplibregl sans consommer de lease', async () => {
        render(<MapSection {...baseProps} />);

        expect(await screen.findByTestId('mock-map')).not.toBeNull();
        expect(globalLeaseController.tokens()).toHaveLength(0);
        expect(globalLeaseController.status()).toBe('idle');
    });

    it('garde la carte montée quand active/visible changent (PersistentDashboard)', async () => {
        const { rerender } = render(<MapSection {...baseProps} />);
        expect(await screen.findByTestId('mock-map')).not.toBeNull();

        rerender(<MapSection {...baseProps} active={false} visible={false} />);
        expect(screen.getByTestId('mock-map')).not.toBeNull();

        rerender(<MapSection {...baseProps} active={true} visible={true} />);
        expect(screen.getByTestId('mock-map')).not.toBeNull();
        expect(globalLeaseController.tokens()).toHaveLength(0);
    });
});
