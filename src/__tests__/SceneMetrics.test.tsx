import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapRef } from 'react-map-gl/maplibre';
import { MapSection } from '../components/Dashboard/MapSection';
import {
  clearSceneMetrics,
  getInitialDashboardSceneSignal,
  getLatestSceneSignal,
  getSceneMetrics,
  recordSceneSignal,
  registerSceneInstance,
  unregisterSceneInstance,
  invalidateSceneInstance,
  type SceneMetricsRecord,
} from '../lib/sceneMetrics';

const mock = vi.hoisted(() => ({
  map: {} as { onLoad?: () => void; onIdle?: () => void; onError?: () => void },
}));
vi.mock('react-map-gl/maplibre', () => ({
  default: (props: { onLoad?: () => void; onIdle?: () => void; onError?: () => void }) => { mock.map = props; return null; },
  Marker: () => null, NavigationControl: () => null,
}));

beforeEach(() => {
  clearSceneMetrics();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => { vi.restoreAllMocks(); clearSceneMetrics(); });

describe('submitted frame signals', () => {
  it('keeps dashboard readiness independent from another view submitting and invalidating its avatar', () => {
    const w = window as unknown as { __beercall_scene_metrics_by_view?: Record<string, Record<string, SceneMetricsRecord>> };
    const generation = registerSceneInstance('dashboard', 'map');
    registerSceneInstance('dashboard', 'player');
    recordSceneSignal('mapInteractive', { view: 'dashboard', instanceId: 'map', generation, timestamp: 100 });
    const player = recordSceneSignal('avatarFrameSubmitted', { view: 'dashboard', instanceId: 'player', generation, timestamp: 110, drawCalls: 4 });
    const other = registerSceneInstance('full', 'other');
    recordSceneSignal('avatarFrameSubmitted', { view: 'full', instanceId: 'other', generation: other, timestamp: 120, drawCalls: 2 });
    expect(w.__beercall_scene_metrics_by_view?.dashboard.avatarFrameSubmitted).toBe(player);
    expect(w.__beercall_scene_metrics_by_view?.dashboard.sceneUsable.timestamp).toBe(110);
    unregisterSceneInstance('full', 'other', other);
    expect(w.__beercall_scene_metrics_by_view?.full).toBeUndefined();
    expect(w.__beercall_scene_metrics_by_view?.dashboard.avatarFrameSubmitted).toBe(player);
    invalidateSceneInstance('dashboard', 'player', generation);
    expect(w.__beercall_scene_metrics_by_view?.dashboard.avatarFrameSubmitted).toBeUndefined();
    expect(w.__beercall_scene_metrics_by_view?.dashboard.sceneUsable).toBeUndefined();
    expect(w.__beercall_scene_metrics_by_view?.dashboard.mapInteractive).toBeDefined();
    unregisterSceneInstance('dashboard', 'map', generation);
    expect(w.__beercall_scene_metrics_by_view?.dashboard).toBeUndefined();
    clearSceneMetrics();
    expect(w.__beercall_scene_metrics_by_view).toBeUndefined();
  });
  it('never combines a profile avatar or a stale dashboard instance with the new map', () => {
    const old = registerSceneInstance('dashboard', 'old-map');
    recordSceneSignal('mapInteractive', { view: 'dashboard', instanceId: 'old-map', generation: old, timestamp: 100 });
    unregisterSceneInstance('dashboard', 'old-map', old);
    const current = registerSceneInstance('dashboard', 'new-map');
    const profile = registerSceneInstance('full', 'profile');
    recordSceneSignal('avatarFrameSubmitted', { view: 'full', instanceId: 'profile', generation: profile, timestamp: 200 });
    expect(getLatestSceneSignal('sceneUsable')).toBeUndefined();
    expect(recordSceneSignal('mapInteractive', { view: 'dashboard', instanceId: 'old-map', generation: old, timestamp: 201 })).toBeUndefined();
    registerSceneInstance('dashboard', 'avatar');
    recordSceneSignal('avatarFrameSubmitted', { view: 'dashboard', instanceId: 'avatar', generation: current, timestamp: 202 });
    expect(getLatestSceneSignal('sceneUsable')).toBeUndefined();
    recordSceneSignal('mapInteractive', { view: 'dashboard', instanceId: 'new-map', generation: current, timestamp: 203 });
    expect(getLatestSceneSignal('sceneUsable')?.timestamp).toBe(203);
    unregisterSceneInstance('dashboard', 'new-map', current);
    expect(getLatestSceneSignal('sceneUsable')).toBeUndefined();
  });
  it('bounds the record history and performance marks', () => {
    const generation = registerSceneInstance('full', 'avatar');
    for (let i = 1; i <= 150; i++) recordSceneSignal('avatarFrameSubmitted', { view: 'full', instanceId: 'avatar', generation, timestamp: i });
    expect(getSceneMetrics()).toHaveLength(50);
    expect(performance.getEntriesByType('mark').filter(mark => mark.name.includes('avatarFrameSubmitted')).length).toBeLessThanOrEqual(2);
  });
  it('keeps the initial diagnostic timestamp separate from invalidated/resumed readiness', () => {
    const generation = registerSceneInstance('dashboard', 'map');
    registerSceneInstance('dashboard', 'avatar');
    recordSceneSignal('mapInteractive', { view: 'dashboard', instanceId: 'map', generation, timestamp: 100 });
    recordSceneSignal('avatarFrameSubmitted', { view: 'dashboard', instanceId: 'avatar', generation, timestamp: 110 });
    expect(getInitialDashboardSceneSignal()?.timestamp).toBe(110);
    unregisterSceneInstance('dashboard', 'map', generation);
    expect(getLatestSceneSignal('sceneUsable')).toBeUndefined();
    registerSceneInstance('dashboard', 'map-new');
    recordSceneSignal('mapInteractive', { view: 'dashboard', instanceId: 'map-new', generation, timestamp: 200 });
    expect(getLatestSceneSignal('sceneUsable')?.timestamp).toBe(200);
    expect(getInitialDashboardSceneSignal()?.timestamp).toBe(110);
    clearSceneMetrics();
    expect(getInitialDashboardSceneSignal()).toBeUndefined();
  });
});

it('map readiness requires onLoad THEN idle, never the existing UI timer; errors invalidate it', () => {
  const { unmount } = render(<MapSection mapRef={createRef<MapRef>()} userLocation={null} isNightMode={false} isMapReady
    squadDetails={null} profile={null} handleMapPointerDown={vi.fn()} cancelLongPress={vi.fn()} handleMapPointerMove={vi.fn()}
    handleManualRecenter={vi.fn()} handleBeerCallClick={vi.fn()} openCamera={vi.fn()} setIsWorldsModalOpen={vi.fn()} />);
  expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
  act(() => mock.map.onIdle?.()); expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
  act(() => mock.map.onLoad?.()); expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
  act(() => mock.map.onIdle?.()); expect(getLatestSceneSignal('mapInteractive')).toBeDefined();
  act(() => mock.map.onError?.()); expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
  act(() => mock.map.onIdle?.()); expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
  unmount();
  act(() => { mock.map.onLoad?.(); mock.map.onIdle?.(); });
  expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
});

it('retains the map identity while suspending hidden readiness and resizing on return', () => {
  const stop = vi.fn(), triggerRepaint = vi.fn(), resize = vi.fn();
  const mapRef = { current: { getMap: () => ({ stop, triggerRepaint }), resize } } as unknown as React.RefObject<MapRef>;
  const props = { mapRef, userLocation: null, isNightMode: false, squadDetails: null, profile: null,
    handleMapPointerDown: vi.fn(), cancelLongPress: vi.fn(), handleMapPointerMove: vi.fn(), handleManualRecenter: vi.fn(),
    handleBeerCallClick: vi.fn(), openCamera: vi.fn(), setIsWorldsModalOpen: vi.fn() };
  const { rerender } = render(<MapSection {...props} visible/>);
  act(() => { mock.map.onLoad?.(); mock.map.onIdle?.(); });
  const first = getLatestSceneSignal('mapInteractive')!;
  rerender(<MapSection {...props} visible={false}/>);
  expect(stop).toHaveBeenCalledOnce();
  expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
  act(() => mock.map.onIdle?.());
  expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
  rerender(<MapSection {...props} visible/>);
  expect(resize).toHaveBeenCalledOnce();
  expect(triggerRepaint).toHaveBeenCalledOnce();
  expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
  act(() => mock.map.onIdle?.());
  expect(getLatestSceneSignal('mapInteractive')?.instanceId).toBe(first.instanceId);
});
