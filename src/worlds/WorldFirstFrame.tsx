/**
 * B14b — WorldFirstFrame (CHAL-02 / PERF).
 *
 * Attend que le décor et tous les participants soient prêts, compile les shaders
 * de la scène (`compileAsync` avec repli `compile`), puis certifie la soumission
 * effective d'au moins une frame au GPU (`gl.info.render.frame > 0`).
 */

import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

export interface WorldFirstFrameProps {
    readyCondition: boolean;
    onFirstFrameRendered?: () => void;
}

export const WorldFirstFrame: React.FC<WorldFirstFrameProps> = ({
    readyCondition,
    onFirstFrameRendered,
}) => {
    const { gl, scene, camera } = useThree();
    const isCompiled = useRef(false);
    const isReported = useRef(false);

    useEffect(() => {
        if (!readyCondition || isCompiled.current) return;

        let cancelled = false;

        (async () => {
            try {
                const glWithCompile = gl as unknown as {
                    compileAsync?: (s: unknown, c: unknown) => Promise<void>;
                    compile?: (s: unknown, c: unknown) => void;
                };

                if (typeof glWithCompile.compileAsync === 'function') {
                    await glWithCompile.compileAsync(scene, camera);
                } else if (typeof glWithCompile.compile === 'function') {
                    glWithCompile.compile(scene, camera);
                }
                if (!cancelled) {
                    isCompiled.current = true;
                }
            } catch {
                if (!cancelled) {
                    // Repli sur le pipeline normal si compile échoue
                    isCompiled.current = true;
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [readyCondition, gl, scene, camera]);

    useFrame(() => {
        if (!isCompiled.current || isReported.current) return;

        const info = gl.info?.render;
        const hasDrawn = !info || info.frame > 0 || (info.calls ?? 0) > 0;

        if (hasDrawn) {
            isReported.current = true;
            onFirstFrameRendered?.();
        }
    });

    return null;
};
