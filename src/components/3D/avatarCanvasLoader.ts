import React from 'react';
import type { AvatarConfig } from '../../types/avatar';

export interface AvatarCanvasProps {
  config: AvatarConfig;
  disableZoom?: boolean;
  disablePan?: boolean;
  onAnimationsLoaded?: (animations: string[]) => void;
  headOnly?: boolean;
  view?: string;
  instanceId?: string;
  active?: boolean;
  onFrameSubmitted?: () => void;
  framing?: 'default' | 'thumbnail';
}

export type AvatarCanvasModule = { default: React.ComponentType<AvatarCanvasProps> };
export type AvatarCanvasImporter = () => Promise<AvatarCanvasModule>;
export type AvatarCanvasLoaderStatus = 'idle' | 'pending' | 'resolved' | 'rejected';

export interface AvatarCanvasLoader {
  getGeneration(): number;
  getStatus(): AvatarCanvasLoaderStatus;
  load(): Promise<AvatarCanvasModule>;
  preload(): Promise<AvatarCanvasModule>;
  getLazyComponent(): React.LazyExoticComponent<React.ComponentType<AvatarCanvasProps>>;
  retry(failedGeneration?: number): number;
}

export function createAvatarCanvasLoader(
  importer: AvatarCanvasImporter = () => import('./AvatarCanvas')
): AvatarCanvasLoader {
  let generation = 0;
  let status: AvatarCanvasLoaderStatus = 'idle';
  let currentPromise: Promise<AvatarCanvasModule> | null = null;
  let lazyComponent: React.LazyExoticComponent<React.ComponentType<AvatarCanvasProps>> | null = null;

  function executeImport(): Promise<AvatarCanvasModule> {
    status = 'pending';
    let promise: Promise<AvatarCanvasModule>;
    try {
      promise = importer();
    } catch (err) {
      promise = Promise.reject(err);
    }
    currentPromise = promise;

    promise
      .then(() => {
        if (currentPromise === promise) {
          status = 'resolved';
        }
      })
      .catch(() => {
        if (currentPromise === promise) {
          status = 'rejected';
        }
      });

    return promise;
  }

  function load(): Promise<AvatarCanvasModule> {
    if (currentPromise !== null) {
      return currentPromise;
    }
    return executeImport();
  }

  function preload(): Promise<AvatarCanvasModule> {
    return load();
  }

  function getLazyComponent(): React.LazyExoticComponent<React.ComponentType<AvatarCanvasProps>> {
    if (!lazyComponent) {
      lazyComponent = React.lazy(() => load());
    }
    return lazyComponent;
  }

  function retry(failedGeneration?: number): number {
    // Si une génération spécifique rejetée est fournie et ne correspond plus à la génération
    // courante (ex: une autre instance a déjà déclenché la tentative suivante),
    // on ne relance pas une nouvelle tentative et on réutilise la génération actuelle.
    if (failedGeneration !== undefined && failedGeneration !== generation) {
      return generation;
    }

    if (status === 'rejected') {
      generation += 1;
      lazyComponent = null;
      executeImport();
    }

    return generation;
  }

  return {
    getGeneration: () => generation,
    getStatus: () => status,
    load,
    preload,
    getLazyComponent,
    retry,
  };
}

export const defaultAvatarCanvasLoader = createAvatarCanvasLoader();
