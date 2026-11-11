import {act, fireEvent, render, renderHook, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UpdateBanner from '../components/UI/UpdateBanner';
import {useServiceWorkerUpdate} from '../hooks/useServiceWorkerUpdate';

interface MockWorker {
    state: ServiceWorkerState;
    postMessage: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    emit: (type: string) => void;
}

interface MockRegistration {
    waiting: MockWorker | null;
    installing: MockWorker | null;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    emit: (type: string) => void;
    update: ReturnType<typeof vi.fn>;
}

function events() {
    const target = new EventTarget();
    return {
        addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => target.addEventListener(type, listener)),
        removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => target.removeEventListener(type, listener)),
        emit: (type: string) => { target.dispatchEvent(new Event(type)); },
    };
}

function makeWorker(state: ServiceWorkerState = 'installed'): MockWorker {
    return {
        state,
        postMessage: vi.fn(),
        ...events(),
    };
}

function makeRegistration(waiting: MockWorker | null): MockRegistration {
    return {
        waiting,
        installing: null,
        ...events(),
        update: vi.fn().mockResolvedValue(undefined),
    };
}

describe('UpdateBanner', () => {
    let originalDescriptor: PropertyDescriptor | undefined;

    beforeEach(() => {
        originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        if (originalDescriptor) {
            Object.defineProperty(navigator, 'serviceWorker', originalDescriptor);
        } else {
            delete (navigator as Navigator & {serviceWorker?: ServiceWorkerContainer}).serviceWorker;
        }
    });

    function installServiceWorker(registration: MockRegistration, hasController = true) {
        const container = {
            controller: hasController ? ({} as ServiceWorker) : null,
            ready: Promise.resolve(registration as unknown as ServiceWorkerRegistration),
            ...events(),
        };
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: container as unknown as ServiceWorkerContainer,
        });
        return container;
    }

    it('affiche le bandeau pour un worker en attente et demande son activation', async () => {
        const worker = makeWorker();
        installServiceWorker(makeRegistration(worker));

        render(<UpdateBanner/>);

        expect(await screen.findByText('Nouvelle version disponible')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Mettre à jour'}));
        expect(worker.postMessage).toHaveBeenCalledWith({type: 'SKIP_WAITING'});
    });

    it('peut être ignoré sans activer le worker', async () => {
        const worker = makeWorker();
        installServiceWorker(makeRegistration(worker));

        render(<UpdateBanner/>);
        expect(await screen.findByText('Nouvelle version disponible')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Ignorer la mise à jour'}));
        await waitFor(() => expect(screen.queryByText('Nouvelle version disponible')).not.toBeInTheDocument());
        expect(worker.postMessage).not.toHaveBeenCalled();
    });

    it('ne signale pas une première installation sans contrôleur', async () => {
        installServiceWorker(makeRegistration(makeWorker()), false);

        render(<UpdateBanner/>);
        await waitFor(() => expect(screen.queryByText('Nouvelle version disponible')).not.toBeInTheDocument());
    });

    it('recharge une seule fois quand le nouveau worker prend le contrôle', async () => {
        const reload = vi.fn();
        const worker = makeWorker();
        const container = installServiceWorker(makeRegistration(worker));
        const {result} = renderHook(() => useServiceWorkerUpdate({reload}));

        await waitFor(() => expect(result.current.updateAvailable).toBe(true));
        const controllerChange = container.addEventListener.mock.calls
            .find(([event]) => event === 'controllerchange')?.[1] as (() => void) | undefined;
        expect(controllerChange).toBeTypeOf('function');

        // Première activation (clients.claim) : aucun rechargement demandé.
        act(() => controllerChange?.());
        expect(reload).not.toHaveBeenCalled();

        act(() => result.current.applyUpdate());
        container.controller = worker as unknown as ServiceWorker;
        act(() => {
            controllerChange?.();
            controllerChange?.();
        });
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('detects an installation that started before registration.ready resolved', async () => {
        const worker = makeWorker('installing');
        const registration = makeRegistration(null);
        registration.installing = worker;
        installServiceWorker(registration);
        const {result} = renderHook(() => useServiceWorkerUpdate());
        await waitFor(() => expect(registration.addEventListener).toHaveBeenCalled());
        act(() => {
            worker.state = 'installed';
            registration.waiting = worker;
            worker.emit('statechange');
        });
        expect(result.current.updateAvailable).toBe(true);
    });

    it('allows an explicit reload when another tab already activated the waiting worker', async () => {
        const worker = makeWorker();
        const registration = makeRegistration(worker);
        const container = installServiceWorker(registration);
        const reload = vi.fn();
        const {result} = renderHook(() => useServiceWorkerUpdate({reload}));
        await waitFor(() => expect(result.current.updateAvailable).toBe(true));
        act(() => {
            registration.waiting = null;
            worker.state = 'activated';
            container.controller = worker as unknown as ServiceWorker;
            container.emit('controllerchange');
        });
        expect(reload).not.toHaveBeenCalled();
        act(() => result.current.applyUpdate());
        expect(reload).toHaveBeenCalledTimes(1);
        expect(worker.postMessage).not.toHaveBeenCalled();
    });

    it('removes registration and worker listeners on unmount', async () => {
        const worker = makeWorker('installing');
        const registration = makeRegistration(null);
        installServiceWorker(registration);
        const {unmount} = renderHook(() => useServiceWorkerUpdate());
        await waitFor(() => expect(registration.addEventListener).toHaveBeenCalled());
        act(() => { registration.installing = worker; registration.emit('updatefound'); });
        expect(worker.addEventListener).toHaveBeenCalled();
        unmount();
        expect(registration.removeEventListener).toHaveBeenCalledWith('updatefound', expect.any(Function));
        expect(worker.removeEventListener).toHaveBeenCalledWith('statechange', expect.any(Function));
    });

    it('sends only one activation request even on repeated clicks', async () => {
        const worker = makeWorker();
        installServiceWorker(makeRegistration(worker));
        const {result} = renderHook(() => useServiceWorkerUpdate());
        await waitFor(() => expect(result.current.updateAvailable).toBe(true));
        act(() => { result.current.applyUpdate(); result.current.applyUpdate(); });
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
    });

    it('keeps retry available and reports a failed activation message', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const worker = makeWorker();
        worker.postMessage.mockImplementationOnce(() => { throw new Error('worker stopped'); });
        installServiceWorker(makeRegistration(worker));
        render(<UpdateBanner/>);
        fireEvent.click(await screen.findByRole('button', {name: 'Mettre à jour'}));
        expect(screen.getByRole('alert')).toHaveTextContent('Impossible de lancer');
        expect(screen.getByRole('button', {name: 'Mettre à jour'})).toBeEnabled();
        fireEvent.click(screen.getByRole('button', {name: 'Mettre à jour'}));
        expect(worker.postMessage).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('button', {name: 'Mise à jour…'})).toBeDisabled();
    });

    it('does not reload on activation timeout and allows retry', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const worker = makeWorker();
        const reload = vi.fn();
        installServiceWorker(makeRegistration(worker));
        vi.useFakeTimers();
        const {result} = renderHook(() => useServiceWorkerUpdate({reload}));
        await act(async () => { await Promise.resolve(); });
        expect(result.current.updateAvailable).toBe(true);
        act(() => result.current.applyUpdate());
        await act(async () => { await vi.advanceTimersByTimeAsync(30_001); });
        expect(result.current.isApplying).toBe(false);
        expect(result.current.error).toContain('réessayer');
        expect(reload).not.toHaveBeenCalled();
        act(() => result.current.applyUpdate());
        expect(worker.postMessage).toHaveBeenCalledTimes(2);
    });

    it('logs update checks that fail offline without crashing', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const registration = makeRegistration(null);
        registration.update.mockRejectedValue(new Error('offline'));
        installServiceWorker(registration);
        vi.useFakeTimers();
        renderHook(() => useServiceWorkerUpdate());
        await act(async () => { await Promise.resolve(); });
        expect(registration.addEventListener).toHaveBeenCalled();
        await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60 * 1000); });
        expect(registration.update).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith('[pwa-update] vérification impossible', 'offline');
    });
});
