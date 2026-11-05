/**
 * A13 — Types et résolution du manifeste GLB.
 *
 * Seules les URLs sous `/models/glb/v1/` sont autorisées.
 * La résolution par sourceId est stricte : toute pièce inconnue lève une erreur visible.
 */

export interface ManifestAccessoryTransform {
    /** Position en unités avatar (cm), neutre [0, 0, 0]. */
    position: [number, number, number];
    /** Rotation en degrés, neutre [0, 0, 0]. */
    rotation: [number, number, number];
    /** Échelle scalaire, neutre 1. */
    scale: number;
    /** Os d'attache, ou null pour la racine. */
    bone: string | null;
}

export interface GlbManifestItem {
    key: string;
    url: string;
    sha256: string;
    bytes: number;
    drawCalls: number;
    triangles: number;
    joints: number;
    textures: number;
    source: string;
    sourceId: string;
    sourceSha256: string;
    sourceBBox: { min: [number, number, number]; max: [number, number, number] } | null;
    pipelineVersion: number;
    transform?: ManifestAccessoryTransform | null;
}

export interface GlbManifest {
    version: number;
    pipelineVersion: number;
    generatedAt: string;
    items: GlbManifestItem[];
}

export interface AvatarPartsConfig {
    head?: string;
    body?: string;
    legs?: string;
    feet?: string;
    accessory?: string | null;
    gender?: string;
}

export interface ResolvedAvatarParts {
    head: GlbManifestItem;
    body: GlbManifestItem;
    legs: GlbManifestItem;
    feet: GlbManifestItem;
    accessory: GlbManifestItem | null;
    gender: 'Men' | 'Women';
}

/** Pièce demandée par la configuration mais absente du manifeste publié. */
export class AvatarPieceNotFoundError extends Error {
    readonly pieceId: string;
    readonly slot: string;

    constructor(pieceId: string, slot: string, message: string) {
        super(message);
        this.name = 'AvatarPieceNotFoundError';
        this.pieceId = pieceId;
        this.slot = slot;
    }
}

const ALLOWED_URL_PREFIX = '/models/glb/v1/';
let manifestPromise: Promise<GlbManifest> | null = null;
let cachedManifest: GlbManifest | null = null;

export function validateManifestItem(item: GlbManifestItem): void {
    if (!item.url || !item.url.startsWith(ALLOWED_URL_PREFIX)) {
        throw new Error(`URL GLB non autorisée : "${item.url}" (doit débuter par ${ALLOWED_URL_PREFIX})`);
    }
    if (!item.sourceId || typeof item.sourceId !== 'string') {
        throw new Error(`sourceId manquant ou invalide pour l'item : ${JSON.stringify(item)}`);
    }
}

/**
 * Clé de catalogue : genre + partie + nom, sans le prix.
 * ``Men_accessory_Beer_500`` et ``Men_accessory_Beer_800`` partagent la même clé.
 */
export function sourceKey(value: string): string | null {
    const stem = value.split(/[\\/]/).pop()?.replace(/\.(fbx|glb)$/i, '') ?? '';
    const parts = stem.split('_');
    if (parts.length < 3) return null;
    if (!['Men', 'Women'].includes(parts[0])) return null;
    if (!['head', 'body', 'legs', 'feet', 'accessory'].includes(parts[1])) return null;
    if (!parts[2]) return null;
    // Le nom est le 3e segment ; les jetons et le prix suivent.
    return `${parts[0]}_${parts[1]}_${parts[2]}`;
}

export function validateManifest(manifest: GlbManifest): GlbManifest {
    if (!manifest || !Array.isArray(manifest.items)) {
        throw new Error('Manifeste GLB invalide : tableau "items" requis');
    }
    for (const item of manifest.items) {
        validateManifestItem(item);
    }
    return manifest;
}

export async function loadGlbManifest(url = '/models/glb/manifest.json'): Promise<GlbManifest> {
    if (cachedManifest) return cachedManifest;
    if (manifestPromise) return manifestPromise;

    manifestPromise = (async () => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Impossible de charger le manifeste GLB depuis ${url} (HTTP ${response.status})`);
        }
        const data = (await response.json()) as GlbManifest;
        validateManifest(data);
        cachedManifest = data;
        return data;
    })().catch((error) => {
        manifestPromise = null;
        throw error;
    });

    return manifestPromise;
}

export function setGlbManifest(manifest: GlbManifest): void {
    validateManifest(manifest);
    cachedManifest = manifest;
    manifestPromise = Promise.resolve(manifest);
}

export function getCachedGlbManifest(): GlbManifest | null {
    return cachedManifest;
}

export function clearGlbManifest(): void {
    cachedManifest = null;
    manifestPromise = null;
}

export function resolveAvatarParts(
    config: AvatarPartsConfig,
    manifest?: GlbManifest,
): ResolvedAvatarParts {
    const activeManifest = manifest ?? cachedManifest;
    if (!activeManifest) {
        throw new Error('Manifeste GLB non initialisé. Appeler loadGlbManifest() ou fournir le manifeste.');
    }

    const bySourceId = new Map<string, GlbManifestItem>();
    const bySource = new Map<string, GlbManifestItem>();
    const byKey = new Map<string, GlbManifestItem | null>();
    for (const item of activeManifest.items) {
        bySourceId.set(item.sourceId, item);
        if (item.source) {
            bySource.set(item.source, item);
            bySource.set(item.source.replace(/\.(fbx|glb)$/i, ''), item);
            const key = sourceKey(item.source);
            if (key) {
                // Une clé ambiguë ne doit jamais choisir arbitrairement un fichier.
                byKey.set(key, byKey.has(key) ? null : item);
            }
        }
    }

    const resolveItem = (id: string): GlbManifestItem | undefined => {
        const direct = bySourceId.get(id) ?? bySource.get(id) ?? bySource.get(`${id}.fbx`);
        if (direct) return direct;
        const key = sourceKey(id);
        return key ? byKey.get(key) ?? undefined : undefined;
    };

    const resolveSlot = (slotName: 'head' | 'body' | 'legs' | 'feet'): GlbManifestItem => {
        const id = config[slotName];
        if (!id || typeof id !== 'string' || id.toLowerCase() === 'none') {
            throw new Error(`Pièce obligatoire manquante : "${slotName}"`);
        }
        const found = resolveItem(id);
        if (!found) {
            throw new AvatarPieceNotFoundError(
                id,
                slotName,
                `Pièce inconnue dans le catalogue : "${id}" pour le slot "${slotName}"`,
            );
        }
        return found;
    };

    const head = resolveSlot('head');
    const body = resolveSlot('body');
    const legs = resolveSlot('legs');
    const feet = resolveSlot('feet');

    let accessory: GlbManifestItem | null = null;
    const accId = config.accessory;
    if (accId && typeof accId === 'string' && accId.toLowerCase() !== 'none' && accId.trim() !== '') {
        const foundAcc = resolveItem(accId);
        if (!foundAcc) {
            throw new AvatarPieceNotFoundError(
                accId,
                'accessory',
                `Accessoire inconnu dans le catalogue : "${accId}"`,
            );
        }
        accessory = foundAcc;
    }

    // Détermination stricte du genre
    let gender: 'Men' | 'Women';
    if (config.gender === 'Men' || config.gender === 'Women') {
        gender = config.gender;
    } else {
        const prefixes = new Set<string>();
        for (const item of [head, body, legs, feet]) {
            if (item.sourceId.startsWith('Men_')) prefixes.add('Men');
            if (item.sourceId.startsWith('Women_')) prefixes.add('Women');
        }
        if (prefixes.size === 1) {
            gender = prefixes.values().next().value as 'Men' | 'Women';
        } else {
            throw new Error(`Genre incohérent ou indéterminable depuis les pièces : ${[head.sourceId, body.sourceId, legs.sourceId, feet.sourceId].join(', ')}`);
        }
    }

    return { head, body, legs, feet, accessory, gender };
}
