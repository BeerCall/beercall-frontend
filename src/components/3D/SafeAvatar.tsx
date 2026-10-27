/* eslint-disable react-refresh/only-export-components -- expose le composant SafeAvatar et sa fonction utilitaire preloadAvatarCanvas */
import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import type { AvatarConfig } from '../../types/avatar';
import { AvatarRenderBoundary } from './AvatarRenderBoundary';
import { defaultAvatarCanvasLoader, type AvatarCanvasLoader } from './avatarCanvasLoader';

export interface SafeAvatarProps {
  config: AvatarConfig;
  disableZoom?: boolean;
  disablePan?: boolean;
  onAnimationsLoaded?: (animations: string[]) => void;
  headOnly?: boolean;
  view?: string;
  instanceId?: string;
  active?: boolean;
  className?: string;
  fallback?: React.ReactNode;
  /** `thumbnail` = cadrage local borné (Connexions) ; `profile` = cadrage borné interactif (Profil) ; défaut inchangé. */
  framing?: 'default' | 'thumbnail' | 'profile';
  /** Injection optionnelle de loader pour les tests (VER-03) */
  loader?: AvatarCanvasLoader;
}

// Préchargement exposé pour synchronisation test et transition fluide
export const preloadAvatarCanvas = (loader: AvatarCanvasLoader = defaultAvatarCanvasLoader) =>
  loader.preload();

export default function SafeAvatar({
  className = 'w-full h-full relative',
  fallback,
  active = true,
  loader = defaultAvatarCanvasLoader,
  ...avatarProps
}: SafeAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextState, setContextState] = useState<'ok' | 'lost' | 'restoring'>('ok');
  // Remontage manuel volontaire uniquement : une restauration native conserve le même Canvas.
  const [retryKey, setRetryKey] = useState(0);
  const [, setGeneration] = useState(() => loader.getGeneration());

  // Capture des événements de perte/restauration de contexte WebGL
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setContextState('lost');
    };

    // Ne bloque ni preventDefault ni la propagation : React Three Fiber doit
    // recevoir l'événement pour restaurer son contexte.
    const handleContextRestored = () => {
      setContextState('restoring');
    };

    container.addEventListener('webglcontextlost', handleContextLost, true);
    container.addEventListener('webglcontextrestored', handleContextRestored, true);

    return () => {
      container.removeEventListener('webglcontextlost', handleContextLost, true);
      container.removeEventListener('webglcontextrestored', handleContextRestored, true);
    };
  }, []);

  const handleManualReset = useCallback(() => {
    setContextState('ok');
    setGeneration(prevGen => loader.retry(prevGen));
    setRetryKey(k => k + 1);
  }, [loader]);

  // Le statut « restauration » ne se ferme qu'après une frame réellement soumise.
  const handleFrameSubmitted = useCallback(() => {
    setContextState(prev => (prev === 'restoring' ? 'ok' : prev));
  }, []);

  const defaultLoadingFallback = (
    <div className="flex h-full w-full items-center justify-center">
      <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-beer" />
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${className}`} data-testid="safe-avatar-container">
      <AvatarRenderBoundary onReset={handleManualReset} fallback={fallback}>
        <Suspense fallback={fallback ?? defaultLoadingFallback}>
          {React.createElement(loader.getLazyComponent(), {
            key: retryKey,
            active: active && contextState !== 'lost',
            onFrameSubmitted: handleFrameSubmitted,
            ...avatarProps,
          })}
        </Suspense>

        {contextState === 'lost' && (
          <div
            role="status"
            aria-label="Contexte WebGL perdu"
            className="absolute inset-0 w-full h-full min-h-[100px] flex flex-col items-center justify-center p-3 bg-gray-50 rounded-2xl text-center"
          >
            <p className="text-xs font-semibold text-gray-500 mb-2">Affichage suspendu (WebGL)</p>
            <button
              type="button"
              onClick={handleManualReset}
              className="px-3 py-1 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50"
            >
              Réessayer
            </button>
          </div>
        )}

        {contextState === 'restoring' && (
          <div
            role="status"
            aria-label="Restauration de l'affichage"
            className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-3 pointer-events-none text-center"
          >
            <p className="text-xs font-semibold text-gray-500">Restauration de l'affichage…</p>
          </div>
        )}
      </AvatarRenderBoundary>
    </div>
  );
}
