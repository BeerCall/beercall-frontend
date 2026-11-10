import {act, fireEvent, render, renderHook, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UpdateBanner from '../components/UI/UpdateBanner';
import {useServiceWorkerUpdate} from '../hooks/useServiceWorkerUpdate';

interface MockWorker {
    state: ServiceWorkerState;
    postMessage: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
}

interface MockRegistration {
    waiting: MockWorker | null;
    installing: MockWorker | null;
    addEventListener: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
}

function makeWorker(state: ServiceWorkerState = 'installed'): MockWorker {
    return {
        state,
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
    };
}

function makeRegistration(waiting: MockWorker | null): MockRegistration {
    return {
        waiting,
        installing: null,
        addEventListener: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
    };
}

describe('UpdateBanner', () => {
    let originalDescriptor: PropertyDescriptor | undefined;

    beforeEach(() => {
        originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    });

    afterEach(() => {
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
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
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
        const container = installServiceWorker(makeRegistration(makeWorker()));
        const {result} = renderHook(() => useServiceWorkerUpdate({reload}));

        await waitFor(() => expect(result.current.updateAvailable).toBe(true));
        const controllerChange = container.addEventListener.mock.calls
            .find(([event]) => event === 'controllerchange')?.[1] as (() => void) | undefined;
        expect(controllerChange).toBeTypeOf('function');

        // Première activation (clients.claim) : aucun rechargement demandé.
        act(() => controllerChange?.());
        expect(reload).not.toHaveBeenCalled();

        act(() => result.current.applyUpdate());
        act(() => {
            controllerChange?.();
            controllerChange?.();
        });
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
