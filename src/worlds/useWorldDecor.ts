/**
 * B14 — Hook React de chargement du décor d'un monde 3D.
 *
 * Résout l'URL GLB depuis le manifeste A13, charge via le cache CPU partagé `loadGlb`,
 * clone l'instance et convertit les matériaux en Lambert économiques (`cheapMaterials`).
 * Désactive `matrixAutoUpdate` pour les meshes statiques afin d'optimiser le graphe de scène.
 */

import { useEffect, useState } from 'react';
import { Group, Mesh } from 'three';

import { cheapMaterials } from '../avatar/glb/cheapMaterials';
import { cloneGlbInstance, loadGlb } from '../avatar/glb/loadGlb';
import { useGlbManifest } from '../avatar/glb/useGlbManifest';

export interface UseWorldDecorResult {
    decor: Group | null;
    isLoading: boolean;
    error: Error | null;
}

export function useWorldDecor(decorKey: string): UseWorldDecorResult {
    const { data: manifest, isLoading: manifestLoading, error: manifestError } = useGlbManifest();
    const [decor, setDecor] = useState<Group | null>(null);
    const [isDecorLoading, setIsDecorLoading] = useState(true);
    const [loadError, setLoadError] = useState<Error | null>(null);

    useEffect(() => {
        if (!manifest) return;

        const decorItem = manifest.items.find((item) => item.key === decorKey);
        if (!decorItem) {
            return;
        }

        let cancelled = false;

        loadGlb(decorItem.url)
            .then((gltf) => {
                if (cancelled) return;
                const instance = cloneGlbInstance(gltf);
                cheapMaterials(instance);

                // Désactivation de matrixAutoUpdate uniquement sur les nœuds statiques
                instance.traverse((node) => {
                    const mesh = node as Mesh;
                    if (mesh.isMesh && !(node as unknown as { isBone?: boolean }).isBone) {
                        node.updateMatrix();
                        node.matrixAutoUpdate = false;
                    }
                });

                setDecor(instance);
                setIsDecorLoading(false);
                setLoadError(null);
            })
            .catch((err) => {
                if (cancelled) return;
                setLoadError(err instanceof Error ? err : new Error(String(err)));
                setIsDecorLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [decorKey, manifest]);

    return {
        decor,
        isLoading: manifestLoading || isDecorLoading,
        error: manifestError || loadError,
    };
}
