import '@testing-library/jest-dom';
import * as React from 'react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './src/__tests__/mocks/server';

// Create a dummy scene object with clone and traverse methods
interface DummyScene {
    clone: () => DummyScene;
    traverse: (cb: (node: { isMesh: boolean }) => void) => void;
}

const dummyScene: DummyScene = {
    clone: () => dummyScene,
    traverse: (cb) => cb({ isMesh: true }),
};

// Mock WebGL env globally
const { globalMockState, globalFrameCallbacks, globalFiberMock } = vi.hoisted(() => {
    const gl = {
        domElement: document.createElement('canvas'),
        render: vi.fn(),
        info: {
            render: { calls: 0, frame: 0, lines: 0, points: 0, triangles: 0 },
            memory: { geometries: 0, textures: 0 },
        },
    };
    const scene = {};
    const camera = {};
    const invalidate = vi.fn();
    const state = {
        gl,
        scene,
        camera,
        invalidate,
        get: vi.fn(),
        advance: vi.fn(),
        clock: { getElapsedTime: () => 0, getDelta: () => 1 / 60 },
    };
    state.get.mockReturnValue(state);

    const callbacks = new Set<(state: unknown, delta: number) => void>();
    const fiberMock = {
        state,
        callbacks,
        advance: (delta = 1 / 60) => {
            gl.info.render.frame += 1;
            gl.info.render.calls += 1;
            callbacks.forEach((cb) => cb(state, delta));
        },
        clear: () => callbacks.clear(),
    };

    return { globalMockState: state, globalFrameCallbacks: callbacks, globalFiberMock: fiberMock };
});

export interface MapMockControl {
    autoLoad: boolean;
    autoIdle: boolean;
    latestProps: {
        onLoad?: () => void;
        onIdle?: () => void;
        onError?: () => void;
        [key: string]: unknown;
    } | null;
    triggerLoad: () => void;
    triggerIdle: () => void;
    triggerError: () => void;
    reset: () => void;
}

export const mapMockControl: MapMockControl = {
    autoLoad: false,
    autoIdle: false,
    latestProps: null,
    triggerLoad: () => {
        mapMockControl.latestProps?.onLoad?.();
    },
    triggerIdle: () => {
        mapMockControl.latestProps?.onIdle?.();
    },
    triggerError: () => {
        mapMockControl.latestProps?.onError?.();
    },
    reset: () => {
        mapMockControl.autoLoad = false;
        mapMockControl.autoIdle = false;
        mapMockControl.latestProps = null;
    },
};

export { globalFiberMock };

vi.mock('react-map-gl/maplibre', () => {
    const MockMap = (props: React.PropsWithChildren<{
        onLoad?: () => void;
        onIdle?: () => void;
        onError?: () => void;
        [key: string]: unknown;
    }>) => {
        const { children, onLoad, onIdle } = props;

        React.useEffect(() => {
            mapMockControl.latestProps = props;
            if (mapMockControl.autoLoad) {
                onLoad?.();
                if (mapMockControl.autoIdle) {
                    onIdle?.();
                }
            }
            return () => {
                if (mapMockControl.latestProps === props) {
                    mapMockControl.latestProps = null;
                }
            };
        }, [props, onLoad, onIdle]);

        return React.createElement('div', { 'data-testid': 'mock-map' }, children);
    };

    return {
        default: MockMap,
        Marker: ({ children }: React.PropsWithChildren<unknown>) => React.createElement('div', { 'data-testid': 'mock-marker' }, children),
        NavigationControl: () => React.createElement('div', { 'data-testid': 'mock-nav-control' }),
    };
});

vi.mock('@react-three/fiber', () => ({
    Canvas: () => null,
    useFrame: Object.assign(
        vi.fn((cb: (state: unknown, delta: number) => void) => {
            if (typeof cb === 'function') {
                globalFrameCallbacks.add(cb);
            }
        }),
        {
            advance: globalFiberMock.advance,
            clear: globalFiberMock.clear,
            callbacks: globalFrameCallbacks,
        }
    ),
    useThree: vi.fn((selector?: (state: unknown) => unknown) => {
        return typeof selector === 'function' ? selector(globalMockState) : globalMockState;
    }),
}));

vi.mock('@react-three/drei', () => {
    const useFBXMock = vi.fn().mockReturnValue(dummyScene) as unknown as { preload: () => void };
    useFBXMock.preload = vi.fn();
    
    return {
        useGLTF: vi.fn().mockReturnValue({ scene: dummyScene }),
        useFBX: useFBXMock,
        useAnimations: vi.fn((animations: Array<{ name: string }> = []) => {
            const actions: Record<string, unknown> = {};
            for (const anim of (animations || [])) {
                if (anim?.name) {
                    actions[anim.name] = {
                        reset: vi.fn().mockReturnThis(),
                        fadeIn: vi.fn().mockReturnThis(),
                        fadeOut: vi.fn().mockReturnThis(),
                        play: vi.fn().mockReturnThis(),
                        stop: vi.fn().mockReturnThis(),
                        isRunning: vi.fn().mockReturnValue(true),
                    };
                }
            }
            return { actions, names: (animations || []).map(a => a?.name) };
        }),
        Environment: () => null,
        OrbitControls: () => null,
        ContactShadows: () => null,
        Center: () => null,
        PositionalAudio: () => null,
        Float: ({ children }: React.PropsWithChildren<unknown>) => React.createElement('div', {}, children),
    };
});

// Mock Notification API for JSDOM
global.Notification = {
    requestPermission: vi.fn().mockResolvedValue('granted'),
    permission: 'granted',
} as unknown as typeof Notification;

if (!global.navigator.serviceWorker) {
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          pushManager: {
            subscribe: vi.fn(),
          }
        }),
        register: vi.fn(),
      },
      configurable: true,
      writable: true
    });
} else {
    Object.assign(global.navigator.serviceWorker, {
        ready: Promise.resolve({
          pushManager: {
            subscribe: vi.fn(),
          }
        }),
        register: vi.fn(),
    });
}

global.ServiceWorkerRegistration = class ServiceWorkerRegistration {} as unknown as typeof ServiceWorkerRegistration;

global.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
} as unknown as typeof IntersectionObserver;

beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
    server.resetHandlers();
    cleanup();
    globalFiberMock.clear();
    mapMockControl.reset();
});

afterAll(() => server.close());