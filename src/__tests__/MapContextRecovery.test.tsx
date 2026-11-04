import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MapSection } from '../components/Dashboard/MapSection';
import { mapMockControl } from '../../setupTests';
import { clearSceneMetrics, getLatestSceneSignal } from '../lib/sceneMetrics';
import type { MapRef } from 'react-map-gl/maplibre';

vi.mock('../three/lease/useLease', () => ({
    useLease: (_surface: string, enabled = true) => ({
        requested: enabled,
        granted: enabled,
        blocked: false,
        blockedReason: null,
        token: enabled ? { surface: 'map', instanceId: 'inst_map', generation: 1 } : null,
        error: null,
        release: vi.fn(),
    }),
}));

// Fake MapLibre Map instance avec gestionnaire d'événements
class FakeMapLibreMap {
  private listeners = new Map<string, Set<(evt?: unknown) => void>>();
  public resizeCalled = 0;
  public repaintCalled = 0;
  public stopCalled = 0;
  getCenter() { return {lng: 3.5, lat: 49.25}; }
  getZoom() { return 15; }
  getBearing() { return 37; }
  getPitch() { return 51; }

  on(event: string, fn: (evt?: unknown) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn);
  }

  off(event: string, fn: (evt?: unknown) => void) {
    this.listeners.get(event)?.delete(fn);
  }

  fire(event: string, data?: unknown) {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        listener(data);
      }
    }
  }

  resize() {
    this.resizeCalled++;
  }

  triggerRepaint() {
    this.repaintCalled++;
  }

  stop() {
    this.stopCalled++;
  }

  getListenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

function createFakeMapRef(fakeMap: FakeMapLibreMap) {
  const ref = {
    current: {
      getMap: () => fakeMap as unknown as import('maplibre-gl').Map,
      resize: () => fakeMap.resize(),
    } as unknown as MapRef,
  };
  return ref;
}

const dummyProfile = {
  id: 'u1',
  username: 'testeur',
  avatar: { head: 'head_base', body: 'body_tshirt', legs: 'legs_jeans', feet: 'shoes_sneakers', accessory: 'none', gender: 'Men' as const },
};

describe('Map Context Recovery (T14g / REL-01)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.advanceTimersByTime(100);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    mapMockControl.reset();
    clearSceneMetrics();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    clearSceneMetrics();
  });

  it('perte de contexte WebGL : invalide la readiness et affiche le statut local sans démonter la carte', async () => {
    const fakeMap = new FakeMapLibreMap();
    const mapRef = createFakeMapRef(fakeMap);

    render(
      <MapSection
        mapRef={mapRef}
        userLocation={{ lat: 48.8566, lng: 2.3522 }}
        isNightMode={false}
        visible={true}
        active={true}
        squadDetails={null}
        profile={dummyProfile}
        handleMapPointerDown={vi.fn()}
        cancelLongPress={vi.fn()}
        handleManualRecenter={vi.fn()}
        handleBeerCallClick={vi.fn()}
        openCamera={vi.fn()}
        setIsWorldsModalOpen={vi.fn()}
      />
    );

    // Initialisation nominale de la carte
    act(() => {
      mapMockControl.triggerLoad();
      mapMockControl.triggerIdle();
    });

    expect(getLatestSceneSignal('mapInteractive')).toBeDefined();
    expect(screen.queryByRole('status', { name: 'Statut carte' })).not.toBeInTheDocument();

    // Émission de la perte de contexte WebGL par l'instance MapLibre
    act(() => {
      fakeMap.fire('webglcontextlost');
    });

    // 1. La readiness est invalidée
    expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();

    // 2. Le statut HTML local est affiché
    expect(screen.getByRole('status', { name: 'Statut carte' })).toBeInTheDocument();
    expect(screen.getByText('Carte momentanément indisponible')).toBeInTheDocument();

    // 3. La carte et le conteneur restent montés dans le DOM (aucun démontage brutal)
    expect(screen.getByTestId('mock-map')).toBeInTheDocument();
  });

  it('restauration de contexte WebGL : resize/repaint, réarmement et fermeture uniquement après nouvel idle valide', async () => {
    const fakeMap = new FakeMapLibreMap();
    const mapRef = createFakeMapRef(fakeMap);

    render(
      <MapSection
        mapRef={mapRef}
        userLocation={{ lat: 48.8566, lng: 2.3522 }}
        isNightMode={false}
        visible={true}
        active={true}
        squadDetails={null}
        profile={dummyProfile}
        handleMapPointerDown={vi.fn()}
        cancelLongPress={vi.fn()}
        handleManualRecenter={vi.fn()}
        handleBeerCallClick={vi.fn()}
        openCamera={vi.fn()}
        setIsWorldsModalOpen={vi.fn()}
      />
    );

    act(() => {
      mapMockControl.triggerLoad();
      mapMockControl.triggerIdle();
    });

    // Perte
    act(() => {
      fakeMap.fire('webglcontextlost');
    });
    expect(screen.getByText('Carte momentanément indisponible')).toBeInTheDocument();

    // Restauration
    act(() => {
      fakeMap.fire('webglcontextrestored');
    });

    // resize et triggerRepaint ont été appelés sur l'instance MapLibre
    expect(fakeMap.resizeCalled).toBeGreaterThanOrEqual(1);
    expect(fakeMap.repaintCalled).toBeGreaterThanOrEqual(1);

    // Le statut DOIT rester visible tant que le nouvel idle n'a pas été confirmé
    expect(screen.getByText('Carte momentanément indisponible')).toBeInTheDocument();
    expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();

    // Arrivée du nouvel idle valide
    act(() => {
      mapMockControl.triggerIdle();
    });

    // Maintenant, le signal est réarmé et le statut est fermé
    expect(getLatestSceneSignal('mapInteractive')).toBeDefined();
    expect(screen.queryByText('Carte momentanément indisponible')).not.toBeInTheDocument();
  });

  it('une erreur de tuile ou de style distincte n’active pas le statut WebGL context lost', () => {
    const fakeMap = new FakeMapLibreMap();
    const mapRef = createFakeMapRef(fakeMap);

    render(
      <MapSection
        mapRef={mapRef}
        userLocation={{ lat: 48.8566, lng: 2.3522 }}
        isNightMode={false}
        visible={true}
        active={true}
        squadDetails={null}
        profile={dummyProfile}
        handleMapPointerDown={vi.fn()}
        cancelLongPress={vi.fn()}
        handleManualRecenter={vi.fn()}
        handleBeerCallClick={vi.fn()}
        openCamera={vi.fn()}
        setIsWorldsModalOpen={vi.fn()}
      />
    );

    act(() => {
      mapMockControl.triggerLoad();
    });

    // Erreur de tuile
    act(() => {
      mapMockControl.triggerError();
    });

    // Le statut "Carte momentanément indisponible" est réservé à WebGL et ne doit PAS apparaître
    expect(screen.queryByText('Carte momentanément indisponible')).not.toBeInTheDocument();
  });

  it('nettoyage des écouteurs webglcontextlost/restored au démontage', () => {
    const fakeMap = new FakeMapLibreMap();
    const mapRef = createFakeMapRef(fakeMap);

    const { unmount } = render(
      <MapSection
        mapRef={mapRef}
        userLocation={{ lat: 48.8566, lng: 2.3522 }}
        isNightMode={false}
        visible={true}
        active={true}
        squadDetails={null}
        profile={dummyProfile}
        handleMapPointerDown={vi.fn()}
        cancelLongPress={vi.fn()}
        handleManualRecenter={vi.fn()}
        handleBeerCallClick={vi.fn()}
        openCamera={vi.fn()}
        setIsWorldsModalOpen={vi.fn()}
      />
    );

    act(() => {
      mapMockControl.triggerLoad();
    });

    expect(fakeMap.getListenerCount('webglcontextlost')).toBe(1);
    expect(fakeMap.getListenerCount('webglcontextrestored')).toBe(1);

    unmount();

    expect(fakeMap.getListenerCount('webglcontextlost')).toBe(0);
    expect(fakeMap.getListenerCount('webglcontextrestored')).toBe(0);
  });

  it('gèle seulement les props natives pendant style null, actualise les enfants et reprend après restored puis idle', () => {
    const fakeMap = new FakeMapLibreMap();
    const mapRef = createFakeMapRef(fakeMap);
    const props: React.ComponentProps<typeof MapSection> = {
      mapRef, userLocation: { lat: 48.8566, lng: 2.3522 }, isNightMode: false,
      canCreateFromLocation: false, visible: true, active: true,
      squadDetails: null, profile: dummyProfile, handleMapPointerDown: vi.fn(),
      handleMapPointerMove: vi.fn(), cancelLongPress: vi.fn(), handleManualRecenter: vi.fn(),
      handleBeerCallClick: vi.fn(), openCamera: vi.fn(), setIsWorldsModalOpen: vi.fn(),
    };
    const { rerender, unmount } = render(<MapSection {...props}/>);
    act(() => { mapMockControl.triggerLoad(); mapMockControl.triggerIdle(); });
    const mapNode = screen.getByTestId('mock-map');
    const initialNativeProps = mapMockControl.latestProps;
    expect(initialNativeProps?.mapStyle).toContain('positron');

    act(() => { fakeMap.fire('webglcontextlost'); });
    expect(mapMockControl.latestProps).toBe(initialNativeProps);
    expect(screen.getByRole('status', { name: 'Statut carte' })).toBeInTheDocument();
    expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();

    rerender(<MapSection {...props} isNightMode={true} canCreateFromLocation={true} active={false}/>);
    // P0 : la carte reste montée et garde son contexte ; PersistentDashboard la masque.
    expect(screen.getByTestId('mock-map')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Statut carte' })).toBeInTheDocument();

    // Au retour actif, la même map est conservée avec la vue restaurée
    rerender(<MapSection {...props} isNightMode={true} canCreateFromLocation={true} active={true}/>);
    act(() => { fakeMap.fire('webglcontextrestored'); });
    act(() => { mapMockControl.triggerIdle(); });
    expect(mapMockControl.latestProps?.mapStyle).toContain('dark-matter');
    expect(screen.getByTestId('mock-map')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Me recentrer' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Statut carte' })).not.toBeInTheDocument();
    expect(getLatestSceneSignal('mapInteractive')).toBeDefined();

    unmount();
    expect(fakeMap.getListenerCount('webglcontextlost')).toBe(0);
    expect(fakeMap.getListenerCount('webglcontextrestored')).toBe(0);
  });

  it('ne monte jamais le vieux marker joueur et garde la source Snap stable', () => {
    const fakeMap = new FakeMapLibreMap();
    const openCamera = vi.fn();
    const props: React.ComponentProps<typeof MapSection> = {
      mapRef: createFakeMapRef(fakeMap), userLocation: { lat: 48.8566, lng: 2.3522 }, isNightMode: false,
      canCreateFromLocation: false, visible: true, active: true, squadDetails: null, profile: dummyProfile,
      handleMapPointerDown: vi.fn(), handleMapPointerMove: vi.fn(), cancelLongPress: vi.fn(),
      handleManualRecenter: vi.fn(), handleBeerCallClick: vi.fn(), openCamera, setIsWorldsModalOpen: vi.fn(),
    };
    const { rerender } = render(<MapSection {...props}/>);
    act(() => { mapMockControl.triggerLoad(); mapMockControl.triggerIdle(); });
    expect(screen.queryByRole('button', { name: 'Créer un Beer Call' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('safe-avatar-container')).not.toBeInTheDocument();
    const source = screen.getByTestId('mock-source');
    expect(source.querySelectorAll('[data-layer]')).toHaveLength(3);

    rerender(<MapSection {...props} canCreateFromLocation={true}/>);
    rerender(<MapSection {...props} active={false}/>);
    rerender(<MapSection {...props} canCreateFromLocation={true}/>);
    const newSource = screen.getByTestId('mock-source');
    expect(newSource).toBeInTheDocument();
    expect(newSource.querySelectorAll('[data-layer]')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Créer un Beer Call' })).not.toBeInTheDocument();
    expect(openCamera).not.toHaveBeenCalled();
  });

  it('manual retry replaces only the map, preserves its camera and rejects every retired callback', () => {
    const oldMap = new FakeMapLibreMap();
    const mapRef = createFakeMapRef(oldMap);
    const openCamera = vi.fn();
    render(<MapSection mapRef={mapRef} userLocation={{lat: 48, lng: 2}} isNightMode={false}
      canCreateFromLocation={false} squadDetails={null} profile={dummyProfile} handleMapPointerDown={vi.fn()}
      handleMapPointerMove={vi.fn()} cancelLongPress={vi.fn()} handleManualRecenter={vi.fn()}
      handleBeerCallClick={vi.fn()} openCamera={openCamera} setIsWorldsModalOpen={vi.fn()}/>);
    act(() => { mapMockControl.triggerLoad(); mapMockControl.triggerIdle(); });
    const oldNode = screen.getByTestId('mock-map');
    const oldLoad = mapMockControl.latestProps!.onLoad!;
    const oldIdle = mapMockControl.latestProps!.onIdle!;
    act(() => oldMap.fire('webglcontextlost'));
    fireEvent.click(screen.getByRole('button', {name: 'Réessayer la carte'}));
    expect(screen.getByTestId('mock-map')).not.toBe(oldNode);
    expect(screen.getAllByTestId('mock-map')).toHaveLength(1);
    expect(mapMockControl.latestProps!.initialViewState).toEqual({longitude: 3.5, latitude: 49.25, zoom: 15, bearing: 37, pitch: 51});
    expect(oldMap.getListenerCount('webglcontextlost')).toBe(0);
    expect(oldMap.getListenerCount('webglcontextrestored')).toBe(0);
    const nextMap = new FakeMapLibreMap();
    mapRef.current = createFakeMapRef(nextMap).current;
    act(() => { oldLoad(); oldIdle(); oldMap.fire('webglcontextrestored'); mapMockControl.triggerIdle(); });
    expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
    expect(screen.getByRole('status', {name: 'Statut carte'})).toBeInTheDocument();
    act(() => { (mapMockControl.latestProps!.onLoad as (event: {target: unknown}) => void)({target: nextMap}); });
    expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
    act(() => oldIdle());
    expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
    act(() => mapMockControl.triggerIdle());
    expect(getLatestSceneSignal('mapInteractive')).toBeDefined();
    expect(screen.queryByRole('status', {name: 'Statut carte'})).not.toBeInTheDocument();
    expect(nextMap.getListenerCount('webglcontextlost')).toBe(1);
    expect(screen.queryByRole('button', {name: 'Créer un Beer Call'})).not.toBeInTheDocument();
    expect(openCamera).not.toHaveBeenCalled();
  });

  it('keeps native recovery outside the map stacking context and hides it when the retained route is invisible', () => {
    const fakeMap = new FakeMapLibreMap();
    const props: React.ComponentProps<typeof MapSection> = {
      mapRef: createFakeMapRef(fakeMap), userLocation: {lat: 48, lng: 2}, isNightMode: false, squadDetails: null,
      profile: dummyProfile, handleMapPointerDown: vi.fn(), handleMapPointerMove: vi.fn(), cancelLongPress: vi.fn(),
      handleManualRecenter: vi.fn(), handleBeerCallClick: vi.fn(), openCamera: vi.fn(), setIsWorldsModalOpen: vi.fn(),
    };
    const content = (visible: boolean) => <div data-testid="map-stacking-context" style={{position: 'relative', zIndex: 0}}>
      <MapSection {...props} visible={visible}/>
    </div>;
    const view = render(content(true));
    act(() => { mapMockControl.triggerLoad(); mapMockControl.triggerIdle(); fakeMap.fire('webglcontextlost'); });
    const status = screen.getByRole('status', {name: 'Statut carte'});
    expect(status.closest('[data-testid="map-stacking-context"]')).toBeNull();
    expect(screen.getByRole('button', {name: 'Réessayer la carte'})).toBeEnabled();
    view.rerender(content(false));
    expect(screen.queryByRole('status', {name: 'Statut carte'})).toBeNull();
    view.rerender(content(true));
    expect(screen.getByRole('status', {name: 'Statut carte'})).toBeInTheDocument();
  });

  it('recertifies a loaded map after real restoration even when an earlier tile error removed its metric generation', () => {
    const fakeMap = new FakeMapLibreMap();
    render(<MapSection mapRef={createFakeMapRef(fakeMap)} userLocation={{lat: 48, lng: 2}} isNightMode={false}
      squadDetails={null} profile={dummyProfile} handleMapPointerDown={vi.fn()} handleMapPointerMove={vi.fn()}
      cancelLongPress={vi.fn()} handleManualRecenter={vi.fn()} handleBeerCallClick={vi.fn()}
      openCamera={vi.fn()} setIsWorldsModalOpen={vi.fn()}/>);
    act(() => { mapMockControl.triggerLoad(); mapMockControl.triggerIdle(); });
    expect(getLatestSceneSignal('mapInteractive')).toBeDefined();
    act(() => { mapMockControl.triggerError(); mapMockControl.triggerIdle(); });
    expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
    act(() => { fakeMap.fire('webglcontextlost'); fakeMap.fire('webglcontextrestored'); });
    expect(screen.getByRole('status', {name: 'Statut carte'})).toBeInTheDocument();
    expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
    act(() => mapMockControl.triggerIdle());
    expect(getLatestSceneSignal('mapInteractive')).toBeDefined();
    expect(screen.queryByRole('status', {name: 'Statut carte'})).toBeNull();
  });
});
