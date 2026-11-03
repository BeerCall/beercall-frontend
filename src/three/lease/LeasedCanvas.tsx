/**
 * B10b — LeasedCanvas (CHAL-02).
 *
 * Composant Canvas Fiber sous contrôle de lease globale WebGL.
 * Aucun Canvas ni contexte n'est instancié tant que la lease n'est pas explicitement accordée.
 * Ferme la course réservation/allocation en vérifiant le token dans la factory `gl`.
 * Limite le DPR à 1.5 pour soulager le GPU mobile.
 */

import React from 'react';
import { Canvas } from '@react-three/fiber';
import { WebGLRenderer } from 'three';

import { globalLeaseController } from './leaseController';
import { type LeaseSurface } from './leaseStore';
import { useLease } from './useLease';
import { destroyRenderer, trackRenderer } from './webgl';

export interface LeasedCanvasProps {
    surface: LeaseSurface | string;
    enabled?: boolean;
    fallback?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    camera?: Parameters<typeof Canvas>[0]['camera'];
    onCreated?: Parameters<typeof Canvas>[0]['onCreated'];
    preserveDrawingBuffer?: boolean;
    dpr?: number | [number, number];
    style?: React.CSSProperties;
}

export const LeasedCanvas: React.FC<LeasedCanvasProps> = ({
    surface,
    enabled = true,
    fallback = null,
    children,
    className,
    camera,
    onCreated,
    preserveDrawingBuffer = false,
    dpr,
    style,
}) => {
    const { granted, blocked, blockedReason, token, error } = useLease(surface, enabled);

    // 1. Si la lease est bloquée par un échec de libération antérieur
    if (blocked) {
        return (
            <div data-testid="leased-canvas-blocked" role="alert" className={className} style={style}>
                {fallback ?? (
                    <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-red-600 bg-red-50 rounded-xl">
                        Contexte 3D bloqué : {blockedReason}. Veuillez recharger la page.
                    </div>
                )}
            </div>
        );
    }

    // 2. Si une erreur d'attribution est survenue
    if (error) {
        return (
            <div data-testid="leased-canvas-error" role="alert" className={className} style={style}>
                {fallback ?? (
                    <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-amber-600 bg-amber-50 rounded-xl">
                        Ressource 3D momentanément indisponible ({error.message}).
                    </div>
                )}
            </div>
        );
    }

    // 3. Tant que la lease n'est pas accordée : aucun Canvas monté
    if (!granted || !token) {
        return (
            <div data-testid="leased-canvas-pending" className={className} style={style}>
                {fallback}
            </div>
        );
    }

    // 4. DPR borné à 1.5 maximum sur mobile
    const resolvedDpr =
        dpr ?? [1, Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5)];

    return (
        <div data-testid="leased-canvas-active" className={className} style={style}>
            <Canvas
                shadows={false}
                dpr={resolvedDpr}
                camera={camera}
                onCreated={onCreated}
                gl={(canvas) => {
                    // Vérification synchrone fermant la course réservation/allocation
                    const current = globalLeaseController.current();
                    if (
                        !current ||
                        current.instanceId !== token.instanceId ||
                        current.generation !== token.generation
                    ) {
                        throw new Error("Token de lease WebGL périmé lors de l'allocation du renderer");
                    }

                    const renderer = new WebGLRenderer({
                        canvas: canvas as unknown as HTMLCanvasElement,
                        antialias: false,
                        preserveDrawingBuffer,
                        powerPreference: 'high-performance',
                    });

                    trackRenderer(renderer);
                    globalLeaseController.attach(token, () => destroyRenderer(renderer));

                    return renderer;
                }}
            >
                {children}
            </Canvas>
        </div>
    );
};
