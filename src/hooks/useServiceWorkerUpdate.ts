import {useCallback, useEffect, useRef, useState} from 'react';

const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
const defaultReload = () => window.location.reload();

interface Options {
    reload?: () => void;
}

/**
 * Détecte un Service Worker en attente (nouvelle version téléchargée) et
 * permet de l'activer explicitement. Le rechargement n'a lieu qu'après
 * `controllerchange`, donc quand le nouveau worker contrôle réellement la page.
 */
export function useServiceWorkerUpdate({reload = defaultReload}: Options = {}) {
    const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const waitingRef = useRef<ServiceWorker | null>(null);
    const updateRequestedRef = useRef(false);

    useEffect(() => {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
        const serviceWorker = navigator.serviceWorker;

        let disposed = false;
        let registration: ServiceWorkerRegistration | null = null;
        let reloaded = false;

        const consider = (worker: ServiceWorker | null) => {
            if (!worker || !serviceWorker.controller) return;
            waitingRef.current = worker;
            setWaiting(worker);
            setDismissed(false);
        };

        const watchWorker = (worker: ServiceWorker | null) => {
            if (!worker) return;
            const onStateChange = () => {
                if (worker.state === 'installed') consider(worker);
            };
            worker.addEventListener('statechange', onStateChange);
        };

        const trackRegistration = (next: ServiceWorkerRegistration) => {
            if (disposed) return;
            registration = next;
            if (next.waiting) consider(next.waiting);
            next.addEventListener('updatefound', () => watchWorker(next.installing));
        };

        const onControllerChange = () => {
            if (!updateRequestedRef.current || reloaded) return;
            reloaded = true;
            reload();
        };

        serviceWorker.addEventListener('controllerchange', onControllerChange);
        void serviceWorker.ready.then(trackRegistration).catch(() => {});

        const checkForUpdate = () => {
            if (!registration) return;
            void registration.update().catch(() => {});
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') checkForUpdate();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        const timer = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);

        return () => {
            disposed = true;
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.clearInterval(timer);
            serviceWorker.removeEventListener('controllerchange', onControllerChange);
        };
    }, [reload]);

    const applyUpdate = useCallback(() => {
        if (!waitingRef.current) return;
        updateRequestedRef.current = true;
        waitingRef.current.postMessage({type: 'SKIP_WAITING'});
    }, []);

    const dismiss = useCallback(() => setDismissed(true), []);

    return {
        updateAvailable: Boolean(waiting) && !dismissed,
        applyUpdate,
        dismiss,
    };
}
