import type { GlbManifest } from '../avatar/glb/manifest';

/**
 * Associe l'identité d'affichage d'un article (`source` ou `id`) à l'URL de
 * sa vignette publiée dans le manifeste. Aucune liste d'articles en dur.
 */
export function buildCatalogThumbnailMap(
    manifest?: GlbManifest | null,
): Record<string, string> | undefined {
    if (!manifest) return undefined;

    const thumbnails: Record<string, string> = {};
    for (const item of manifest.items) {
        const url = item.thumbnail?.url;
        if (!url) continue;
        if (item.sourceId) thumbnails[item.sourceId] = url;
        if (item.source) {
            thumbnails[item.source.replace(/\.(fbx|glb)$/i, '')] = url;
        }
    }
    return thumbnails;
}
