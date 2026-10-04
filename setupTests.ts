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
vi.mock('@react-three/fiber', () => ({
    Canvas: () => null,
    useFrame: vi.fn(),
}));

vi.mock('@react-three/drei', () => {
    const useFBXMock = vi.fn().mockReturnValue(dummyScene) as unknown as { preload: () => void };
    useFBXMock.preload = vi.fn();
    
    return {
        useGLTF: vi.fn().mockReturnValue({ scene: dummyScene }),
        useFBX: useFBXMock,
        useAnimations: vi.fn().mockReturnValue({ actions: {}, names: [] }),
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
});

afterAll(() => server.close());