/**
 * Identité d'affichage d'un article de catalogue : le fichier courant
 * (`source`) est prioritaire, l'id reste stable pour l'équipement.
 */
export function catalogAssetId(item: {id: string; source?: string | null}): string {
    const value = item.source?.trim() || item.id;
    return value.replace(/\.(fbx|glb)$/i, '');
}
