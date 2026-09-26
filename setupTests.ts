import '@testing-library/jest-dom';
import * as React from 'react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './src/__tests__/mocks/server';

// Create a dummy scene object with clone and traverse methods
const dummyScene = {
    clone: () => dummyScene,
    traverse: (cb: any) => cb({ isMesh: true }),
};

// Mock WebGL env globally
vi.mock('@react-three/fiber', () => ({
    Canvas: () => null,
    useFrame: vi.fn(),
}));

vi.mock('@react-three/drei', () => {
    const useFBXMock = vi.fn().mockReturnValue(dummyScene) as any;
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
        Float: ({ children }: any) => React.createElement('div', {}, children),
    };
});

// Mock Notification API for JSDOM
global.Notification = {
    requestPermission: vi.fn().mockResolvedValue('granted'),
    permission: 'granted',
} as unknown as any;

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

global.ServiceWorkerRegistration = class ServiceWorkerRegistration {} as any;

global.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
} as any;

beforeAll(() => {
    try {
        server.listen({ onUnhandledRequest: 'error' });
    } catch(e) {
        // Ignore already started
    }
});

afterEach(() => {
    server.resetHandlers();
    cleanup();
});

afterAll(() => server.close());