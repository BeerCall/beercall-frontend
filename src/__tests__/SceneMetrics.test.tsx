import { StrictMode, createRef } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RootState } from '@react-three/fiber';
import type { MapRef } from 'react-map-gl/maplibre';
import SceneReadyProbe from '../components/3D/SceneReadyProbe';
import { MapSection } from '../components/Dashboard/MapSection';
import { clearSceneMetrics, getLatestSceneSignal, getSceneMetrics, recordSceneSignal, registerSceneInstance, unregisterSceneInstance } from '../lib/sceneMetrics';

const mock = vi.hoisted(() => ({
  frame: undefined as ((state: RootState) => void) | undefined,
  map: {} as { onLoad?: () => void; onIdle?: () => void; onError?: () => void },
}));
vi.mock('@react-three/fiber', () => ({ useFrame: (callback: (state: RootState) => void) => { mock.frame = callback; } }));
vi.mock('react-map-gl/maplibre', () => ({
  default: (props: { onLoad?: () => void; onIdle?: () => void; onError?: () => void }) => { mock.map = props; return null; },
  Marker: () => null, NavigationControl: () => null,
}));
const requests = new Map<number, FrameRequestCallback>();
let next = 0;
const gl = { info: { render: { calls: 0, frame: 0 } } };
const state = { gl } as unknown as RootState;
function frame() { act(() => mock.frame?.(state)); }
function followUp() { act(() => { const pending = [...requests.values()]; requests.clear(); pending.forEach(fn => fn(performance.now())); }); }

beforeEach(() => {
  clearSceneMetrics(); requests.clear(); next = 0; gl.info.render = { calls: 0, frame: 0 };
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { requests.set(++next, callback); return next; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => requests.delete(id));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); clearSceneMetrics(); });

describe('submitted frame signals', () => {
  it('does not certify useFrame before render, zero draws or an unchanged root counter', () => {
    const submitted = vi.fn();
    render(<SceneReadyProbe kind="avatar" id="avatar" view="dashboard" ready onFrameSubmitted={submitted} />);
    frame(); expect(submitted).not.toHaveBeenCalled(); followUp();
    expect(getLatestSceneSignal('avatarFrameSubmitted')).toBeUndefined();
    frame(); gl.info.render.frame++; followUp();
    expect(submitted).not.toHaveBeenCalled();
    frame(); gl.info.render.frame++; gl.info.render.calls = 4; followUp();
    expect(submitted).toHaveBeenCalledOnce();
    expect(getLatestSceneSignal('avatarFrameSubmitted')?.instanceId).toBe('avatar');
    frame(); followUp(); expect(submitted).toHaveBeenCalledOnce();
  });
  it('cancels a stale pending callback on ready=false or unmount', () => {
    const submitted = vi.fn();
    const { rerender, unmount } = render(<SceneReadyProbe kind="world" ready onFrameSubmitted={submitted} />);
    frame(); expect(requests.size).toBe(1);
    rerender(<SceneReadyProbe kind="world" ready={false} onFrameSubmitted={submitted} />);
    expect(requests.size).toBe(0); gl.info.render.frame++; gl.info.render.calls = 4; followUp();
    expect(submitted).not.toHaveBeenCalled();
    rerender(<SceneReadyProbe kind="world" ready onFrameSubmitted={submitted} />);
    frame(); unmount(); expect(requests.size).toBe(0);
  });
  it('does not arm an avatar with no configured pieces and survives StrictMode without duplicates', () => {
    const { rerender } = render(<StrictMode><SceneReadyProbe kind="avatar" expectedParts={[]} /></StrictMode>);
    frame(); expect(requests.size).toBe(0);
    rerender(<StrictMode><SceneReadyProbe kind="avatar" expectedParts={['head']} /></StrictMode>);
    frame(); gl.info.render.frame++; gl.info.render.calls = 1; followUp();
    expect(getSceneMetrics().filter(record => record.kind === 'avatarFrameSubmitted')).toHaveLength(1);
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
});

it('map readiness requires onLoad THEN idle, never the existing UI timer; errors invalidate it', () => {
  render(<MapSection mapRef={createRef<MapRef>()} userLocation={null} isNightMode={false} isMapReady
    squadDetails={null} profile={null} handleMapPointerDown={vi.fn()} cancelLongPress={vi.fn()}
    handleManualRecenter={vi.fn()} handleBeerCallClick={vi.fn()} openCamera={vi.fn()} setIsWorldsModalOpen={vi.fn()} />);
  expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
  act(() => mock.map.onIdle?.()); expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
  act(() => mock.map.onLoad?.()); expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
  act(() => mock.map.onIdle?.()); expect(getLatestSceneSignal('mapInteractive')).toBeDefined();
  act(() => mock.map.onError?.()); expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
  act(() => mock.map.onIdle?.()); expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
});
