/**
 * B14b — WorldCanvas (CHAL-02 / PERF).
 *
 * Wrapper LeasedCanvas dédié aux mondes 3D (Bar, Piscine, Dodo) :
 * - Surface de lease 'world'.
 * - Caméra historique : position [0, 80, 450], fov 45.
 * - Éclairage studio à 2 sources (HemisphereLight sol #4a5568 2.4 + DirectionalLight 2.2 à [0.6, 2.4, 3]).
 * - Poster de repli statique affiché en surimpression jusqu'à la première frame GPU réelle (`WorldFirstFrame`).
 * - Fondu de 150 ms à la disparition du poster.
 * - En cas d'erreur : affiche le poster avec bouton réessayer (pas de spinner infini).
 */

import React, { useCallback, useState } from 'react';
import { Color, DirectionalLight, HemisphereLight } from 'three';

import { LeasedCanvas } from '../three/lease/LeasedCanvas';
import { WORLD_SCENE_CONFIG, type WorldKind } from './worldSceneConfig';
import { WorldFirstFrame } from './WorldFirstFrame';

export interface WorldCanvasProps {
    world: WorldKind;
    decorReady?: boolean;
    avatarsReady?: boolean;
    children?: React.ReactNode;
    onReady?: (ready: boolean) => void;
    preserveDrawingBuffer?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

export const WorldCanvas: React.FC<WorldCanvasProps> = ({
    world,
    decorReady = true,
    avatarsReady = true,
    children,
    onReady,
    preserveDrawingBuffer = false,
    className = 'w-full h-full relative overflow-hidden',
    style,
}) => {
    const config = WORLD_SCENE_CONFIG[world];
    const [isSceneReady, setIsSceneReady] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [retryKey, setRetryKey] = useState(0);

    const handleFirstFrame = useCallback(() => {
        setIsSceneReady(true);
        onReady?.(true);
    }, [onReady]);

    const handleRetry = useCallback(() => {
        setHasError(false);
        setIsSceneReady(false);
        setRetryKey((k) => k + 1);
    }, []);

    const posterElement = (
        <div
            data-testid="world-poster-overlay"
            className={`absolute inset-0 z-10 transition-opacity duration-150 ${
                isSceneReady ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
        >
            <img
                src={config.posterUrl}
                alt={`Aperçu ${config.name}`}
                className="w-full h-full object-cover"
                onError={() => {
                    /* fallback si poster manquant */
                }}
            />
            {hasError && (
                <div
                    data-testid="world-error-overlay"
                    className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4 text-center text-white"
                >
                    <p className="text-sm font-bold mb-2">Impossible de charger le monde 3D</p>
                    <button
                        type="button"
                        onClick={handleRetry}
                        className="px-4 py-2 bg-amber-500 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-amber-600 active:scale-95 transition-all"
                    >
                        Réessayer
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className={className} style={style}>
            {posterElement}

            <LeasedCanvas
                key={`${world}-${retryKey}`}
                surface="world"
                camera={{
                    position: config.camera.position,
                    fov: config.camera.fov,
                }}
                preserveDrawingBuffer={preserveDrawingBuffer}
                fallback={posterElement}
                className="w-full h-full"
            >
                <ambientLight intensity={0.4} />
                <primitive
                    object={new HemisphereLight(new Color('#ffffff'), new Color('#4a5568'), 2.4)}
                />
                <primitive
                    object={(() => {
                        const dir = new DirectionalLight(new Color('#ffffff'), 2.2);
                        dir.position.set(0.6, 2.4, 3);
                        return dir;
                    })()}
                />

                <WorldFirstFrame
                    readyCondition={decorReady && avatarsReady && !hasError}
                    onFirstFrameRendered={handleFirstFrame}
                />

                {children}
            </LeasedCanvas>
        </div>
    );
};
