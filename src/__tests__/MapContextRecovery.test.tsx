import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MapSection } from '../components/Dashboard/MapSection';
import { mapMockControl } from '../../setupTests';
import { clearSceneMetrics, getLatestSceneSignal } from '../lib/sceneMetrics';
import type { MapRef } from 'react-map-gl/maplibre';

// Fake MapLibre Map instance avec gestionnaire d'événements
class FakeMapLibreMap {
  private listeners = new Map<string, Set<(evt?: unknown) => void>>();
  public resizeCalled = 0;
  public repaintCalled = 0;
  public stopCalled = 0;

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
});
