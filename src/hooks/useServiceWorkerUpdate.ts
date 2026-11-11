import {useCallback, useEffect, useRef, useState} from 'react';

const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
const ACTIVATION_TIMEOUT_MS = 30_000;
const defaultReload = () => window.location.reload();

interface Options {
    reload?: () => void;
}

/**
 * Détecte un Service Worker en attente (nouvelle version téléchargée) et
 * permet de l'activer explicitement. Le rechargement n'a lieu qu'après
 * `controllerchange`, ou sur consentement si un autre onglet l'a déjà activé.
 */
export function useServiceWorkerUpdate({reload = defaultReload}: Options = {}) {
    const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const waitingRef = useRef<ServiceWorker | null>(null);
    const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
    const requestedWorkerRef = useRef<ServiceWorker | null>(null);
    const reloadedRef = useRef(false);
    const activationTimerRef = useRef<number | null>(null);

    const clearActivationTimer = useCallback(() => {
        if (activationTimerRef.current !== null) window.clearTimeout(activationTimerRef.current);
        activationTimerRef.current = null;
    }, []);

    const reloadOnce = useCallback(() => {
        if (reloadedRef.current) return;
        reloadedRef.current = true;
        clearActivationTimer();
        reload();
    }, [clearActivationTimer, reload]);

    useEffect(() => {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
        const serviceWorker = navigator.serviceWorker;

        let disposed = false;
        let registration: ServiceWorkerRegistration | null = null;
        const workerListeners = new Map<ServiceWorker, () => void>();

        const consider = (worker: ServiceWorker | null) => {
            if (!worker || !serviceWorker.controller || worker.state !== 'installed') return;
            if (waitingRef.current === worker) return;
            waitingRef.current = worker;
            setWaiting(worker);
            setDismissed(false);
            setError(null);
        };

        const watchWorker = (worker: ServiceWorker | null) => {
            if (!worker || workerListeners.has(worker)) return;
            const onStateChange = () => {
                if (disposed) return;
                if (worker.state === 'installed') consider(worker);
                if (worker.state === 'redundant') {
                    worker.removeEventListener('statechange', onStateChange);
                    workerListeners.delete(worker);
                }
                if (worker.state === 'redundant' && waitingRef.current === worker) {
                    waitingRef.current = null;
                    setWaiting(null);
                    requestedWorkerRef.current = null;
                    clearActivationTimer();
                    setIsApplying(false);
                    console.warn('[pwa-update] worker en attente devenu obsolète');
                }
            };
            workerListeners.set(worker, onStateChange);
            worker.addEventListener('statechange', onStateChange);
            onStateChange();
        };

        const onUpdateFound = () => watchWorker(registration?.installing ?? null);

        const trackRegistration = (next: ServiceWorkerRegistration) => {
            if (disposed) return;
            registration = next;
            registrationRef.current = next;
            next.addEventListener('updatefound', onUpdateFound);
            watchWorker(next.waiting);
            watchWorker(next.installing);
        };

        const onControllerChange = () => {
            // Première installation ou activation depuis un autre onglet :
            // ne pas interrompre ce document sans son consentement.
            if (requestedWorkerRef.current && serviceWorker.controller === requestedWorkerRef.current) reloadOnce();
        };

        serviceWorker.addEventListener('controllerchange', onControllerChange);
        void serviceWorker.ready.then(trackRegistration).catch((error: unknown) => {
            if (!disposed) console.warn('[pwa-update] inscription indisponible', error instanceof Error ? error.message : 'Erreur inconnue');
        });

        const checkForUpdate = () => {
            if (!registration) return;
            watchWorker(registration.waiting);
            watchWorker(registration.installing);
            void registration.update().then(() => {
                if (!disposed) {
                    watchWorker(registration?.waiting ?? null);
                    watchWorker(registration?.installing ?? null);
                }
            }).catch((error: unknown) => {
                if (!disposed) console.warn('[pwa-update] vérification impossible', error instanceof Error ? error.message : 'Erreur inconnue');
            });
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
            registration?.removeEventListener('updatefound', onUpdateFound);
            for (const [worker, listener] of workerListeners) worker.removeEventListener('statechange', listener);
            registrationRef.current = null;
            requestedWorkerRef.current = null;
            clearActivationTimer();
        };
    }, [clearActivationTimer, reloadOnce]);

    const applyUpdate = useCallback(() => {
        if (requestedWorkerRef.current || reloadedRef.current) return;
        const worker = registrationRef.current?.waiting ?? waitingRef.current;
        if (!worker) return;
        setError(null);
        // Un autre onglet peut avoir activé le worker depuis l'affichage du
        // bandeau. Le consentement donné ici suffit alors à recharger une fois.
        if (navigator.serviceWorker.controller === worker) {
            reloadOnce();
            return;
        }
        if (worker.state === 'redundant') {
            setError('Cette mise à jour n’est plus disponible. Réessaie plus tard.');
            console.warn('[pwa-update] activation refusée pour un worker obsolète');
            return;
        }
        requestedWorkerRef.current = worker;
        setIsApplying(true);
        activationTimerRef.current = window.setTimeout(() => {
            requestedWorkerRef.current = null;
            activationTimerRef.current = null;
            setIsApplying(false);
            setError('La mise à jour n’a pas abouti. Tu peux réessayer.');
            console.warn('[pwa-update] délai d’activation dépassé');
        }, ACTIVATION_TIMEOUT_MS);
        try {
            if (worker.state === 'installed') worker.postMessage({type: 'SKIP_WAITING'});
        } catch (error) {
            requestedWorkerRef.current = null;
            clearActivationTimer();
            setIsApplying(false);
            setError('Impossible de lancer la mise à jour. Tu peux réessayer.');
            console.warn('[pwa-update] activation impossible', error instanceof Error ? error.message : 'Erreur inconnue');
        }
    }, [clearActivationTimer, reloadOnce]);

    const dismiss = useCallback(() => setDismissed(true), []);

    return {
        updateAvailable: Boolean(waiting) && !dismissed,
        isApplying,
        error,
        applyUpdate,
        dismiss,
    };
}
