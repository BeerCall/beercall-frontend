/* eslint-disable react-refresh/only-export-components -- expose le composant SafeAvatar et sa fonction utilitaire preloadAvatarCanvas */
import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import type { AvatarConfig } from '../../types/avatar';
import { AvatarRenderBoundary } from './AvatarRenderBoundary';

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
}

// Lazy import direct d'AvatarCanvas
const LazyAvatarCanvas = React.lazy(() => import('./AvatarCanvas'));

// Préchargement exposé pour synchronisation test et transition fluide
export const preloadAvatarCanvas = () => import('./AvatarCanvas');

export default function SafeAvatar({
  className = 'w-full h-full relative',
  fallback,
  active = true,
  ...avatarProps
}: SafeAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isContextLost, setIsContextLost] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Capture des événements de perte/restauration de contexte WebGL
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setIsContextLost(true);
    };

    const handleContextRestored = () => {
      setIsContextLost(false);
      setRetryKey(k => k + 1);
    };

    container.addEventListener('webglcontextlost', handleContextLost, true);
    container.addEventListener('webglcontextrestored', handleContextRestored, true);

    return () => {
      container.removeEventListener('webglcontextlost', handleContextLost, true);
      container.removeEventListener('webglcontextrestored', handleContextRestored, true);
    };
  }, []);

  const handleManualReset = useCallback(() => {
    setIsContextLost(false);
    setRetryKey(k => k + 1);
  }, []);

  const defaultLoadingFallback = (
    <div className="flex h-full w-full items-center justify-center">
      <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-beer" />
    </div>
  );

  return (
    <div ref={containerRef} className={className} data-testid="safe-avatar-container">
      <AvatarRenderBoundary onReset={handleManualReset} fallback={fallback}>
        {isContextLost ? (
          <div
            role="status"
            aria-label="Contexte WebGL perdu"
            className="w-full h-full min-h-[100px] flex flex-col items-center justify-center p-3 bg-gray-50 rounded-2xl text-center"
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
        ) : (
          <Suspense fallback={fallback ?? defaultLoadingFallback}>
            <LazyAvatarCanvas key={retryKey} active={active} {...avatarProps} />
          </Suspense>
        )}
      </AvatarRenderBoundary>
    </div>
  );
}
