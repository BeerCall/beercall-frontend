import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.unmock('../../three/lease/useLease');

import { globalLeaseController } from '../../three/lease/leaseController';
import { resetLeaseStore } from '../../three/lease/leaseStore';
import { resetWebglStats } from '../../three/lease/webgl';
import { MapSection } from './MapSection';

vi.mock('react-map-gl/maplibre', () => ({
    default: ({ initialViewState, children }: { initialViewState?: { zoom?: number }; children?: React.ReactNode }) => (
        <div data-testid="mock-map" data-zoom={initialViewState?.zoom}>
            {children}
        </div>
    ),
    Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    NavigationControl: () => null,
    useMap: () => ({ current: null }),
    Source: ({ children }: { children?: React.ReactNode }) => <div data-testid="mock-source">{children}</div>,
    Layer: () => null,
}));

describe('B12 — MapSection sous lease (gestion du slot WebGL et reprise de vue)', () => {
    beforeEach(() => {
        globalLeaseController.reset();
        resetLeaseStore();
        resetWebglStats();
    });

    it('démonte la carte native quand active=false et libère le slot pour le profil', async () => {
        const dummyProfile = { id: 1, username: 'test', avatar: {} } as unknown as Parameters<typeof MapSection>[0]['profile'];
        const props: Parameters<typeof MapSection>[0] = {
            mapRef: { current: null },
            userLocation: { lat: 48.8566, lng: 2.3522 },
            isNightMode: false,
            canCreateFromLocation: true,
            visible: true,
            active: true,
            squadDetails: null,
            profile: dummyProfile,
            handleMapPointerDown: vi.fn(),
            cancelLongPress: vi.fn(),
            handleMapPointerMove: vi.fn(),
            handleManualRecenter: vi.fn(),
            handleBeerCallClick: vi.fn(),
            openCamera: vi.fn(),
            setIsWorldsModalOpen: vi.fn(),
            people: [],
        };

        const { rerender } = render(<MapSection {...props} />);

        // Carte montée sous lease
        await waitFor(() => {
            expect(screen.getByTestId('mock-map')).not.toBeNull();
            expect(globalLeaseController.current()?.surface).toBe('map');
        });

        // Demande concurrente du profil en attente
        let profileGranted = false;
        const profileReq = globalLeaseController.request('profile', 'prof1').then((t) => {
            profileGranted = true;
            return t;
        });

        // Tant que la carte est active, le profil attend
        await new Promise((r) => setTimeout(r, 50));
        expect(profileGranted).toBe(false);

        // Désactivation de la carte (sortie route ou modal ouvert)
        rerender(<MapSection {...props} active={false} />);

        // La carte est démontée du DOM
        await waitFor(() => {
            expect(screen.queryByTestId('mock-map')).toBeNull();
        });

        // Le profil obtient maintenant le slot
        const profileToken = await profileReq;
        expect(profileGranted).toBe(true);
        expect(profileToken.surface).toBe('profile');

        await globalLeaseController.release(profileToken);
    });

    it('restaure la vue sauvegardée lors du remontage de la carte au retour', async () => {
        const dummyProfile = { id: 1, username: 'test', avatar: {} } as unknown as Parameters<typeof MapSection>[0]['profile'];
        const fakeNativeMap = {
            getCenter: () => ({ lng: 2.4, lat: 48.9 }),
            getZoom: () => 16,
            getBearing: () => 10,
            getPitch: () => 30,
        };

        const mapRef = {
            current: {
                getMap: () => fakeNativeMap,
            },
        } as unknown as Parameters<typeof MapSection>[0]['mapRef'];

        const props: Parameters<typeof MapSection>[0] = {
            mapRef,
            userLocation: { lat: 48.8566, lng: 2.3522 },
            isNightMode: false,
            canCreateFromLocation: true,
            visible: true,
            active: true,
            squadDetails: null,
            profile: dummyProfile,
            handleMapPointerDown: vi.fn(),
            cancelLongPress: vi.fn(),
            handleMapPointerMove: vi.fn(),
            handleManualRecenter: vi.fn(),
            handleBeerCallClick: vi.fn(),
            openCamera: vi.fn(),
            setIsWorldsModalOpen: vi.fn(),
            people: [],
        };

        const { rerender } = render(<MapSection {...props} />);

        await waitFor(() => {
            expect(screen.getByTestId('mock-map')).not.toBeNull();
        });

        // Désactivation -> sauvegarde la vue courante (zoom 16)
        rerender(<MapSection {...props} active={false} />);
        await waitFor(() => {
            expect(screen.queryByTestId('mock-map')).toBeNull();
        });

        // Réactivation -> remonte une nouvelle Map avec initialViewState contenant le zoom sauvegardé 16
        rerender(<MapSection {...props} active={true} />);
        await waitFor(() => {
            const map = screen.getByTestId('mock-map');
            expect(map.getAttribute('data-zoom')).toBe('16');
        });
    });
});
