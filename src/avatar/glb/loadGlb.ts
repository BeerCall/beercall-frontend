/**
 * A13 — Chargeur GLB avec cache CPU et clonage de squelette.
 *
 * Utilise GLTFLoader configuré avec MeshoptDecoder.
 * Les promesses rejetées sont supprimées du cache pour permettre le rejeu.
 * Le cache CPU est borné à 256 URLs.
 * `cloneGlbInstance` produit des instances de squelette indépendantes sans dupliquer géométries/matériaux.
 */

import { Group } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const MAX_CACHE_SIZE = 256;
const templateCache = new Map<string, Promise<GLTF>>();

let sharedLoader: GLTFLoader | null = null;

function getLoader(): GLTFLoader {
    if (!sharedLoader) {
        sharedLoader = new GLTFLoader();
        sharedLoader.setMeshoptDecoder(MeshoptDecoder);
    }
    return sharedLoader;
}

export function getCachedUrlCount(): number {
    return templateCache.size;
}

export function clearGlbCache(): void {
    templateCache.clear();
}

/**
 * Charge un fichier GLB depuis son URL (ou le retourne depuis le cache CPU).
 * Déduplique les requêtes concurrentes vers la même URL.
 * En cas d'échec, la promesse est retirée du cache pour autoriser un nouvel essai.
 */
export function loadGlb(url: string): Promise<GLTF> {
    const existing = templateCache.get(url);
    if (existing) return existing;

    // Éviction FIFO si le cache atteint la limite
    if (templateCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = templateCache.keys().next().value;
        if (oldestKey) templateCache.delete(oldestKey);
    }

    const loader = getLoader();
    const promise = (async () => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Échec du téléchargement GLB depuis ${url} (HTTP ${response.status})`);
        }
        const buffer = await response.arrayBuffer();
        return await loader.parseAsync(buffer, '');
    })().catch((error) => {
        // Suppression du rejet pour autoriser le rejeu
        templateCache.delete(url);
        throw error;
    });

    templateCache.set(url, promise);
    return promise;
}

/**
 * Clone la scène GLTF avec indépendance de son squelette via SkeletonUtils.
 * Ne clone pas inutilement les buffers GPU ni les textures.
 */
export function cloneGlbInstance(gltf: GLTF): Group {
    return SkeletonUtils.clone(gltf.scene) as Group;
}
