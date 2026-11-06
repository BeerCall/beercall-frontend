import type {SymbolLayerSpecification} from 'maplibre-gl';

/** B09a — constantes de rendu Snap (corps 100 px, base, piles). */
export const BODY_CSS_PX = 100;
export const BODY_SPRITE = {width: 128, height: 256} as const;
export const BODY_ICON_SIZE = BODY_CSS_PX / BODY_SPRITE.height;
export const BASE_SPRITE = {width: 64, height: 22} as const;
export const CLUSTER_RADIUS_PX = 34;
export const CLUSTER_MAX_STACK = 4;
export const SNAP_ZOOM_RANGE = {min: 10, max: 18} as const;

/**
 * Taille des corps de carte selon le zoom, façon Snapchat.
 * Référence 7b-3d conservée à zoom 14 : 87,5 px visibles dans un cadre de 100 px.
 * Minimum 56 px à zoom 10, maximum 140 px à zoom 18.
 */
export const AVATAR_ZOOM = {min: SNAP_ZOOM_RANGE.min, default: 14, max: SNAP_ZOOM_RANGE.max} as const;
export const AVATAR_VISIBLE_PX = {min: 56, default: 87.5, max: 140} as const;
export const BODY_VISIBLE_RATIO = 448 / 512;

const AVATAR_CURVE_EXPONENT = Math.log(
    (AVATAR_VISIBLE_PX.default - AVATAR_VISIBLE_PX.min)
    / (AVATAR_VISIBLE_PX.max - AVATAR_VISIBLE_PX.min),
) / Math.log(
    (AVATAR_ZOOM.default - AVATAR_ZOOM.min)
    / (AVATAR_ZOOM.max - AVATAR_ZOOM.min),
);

/** Hauteur visible du corps en px CSS pour un zoom donné. */
export function avatarVisiblePx(zoom: number): number {
    const t = Math.min(1, Math.max(0,
        (zoom - AVATAR_ZOOM.min) / (AVATAR_ZOOM.max - AVATAR_ZOOM.min),
    ));
    return AVATAR_VISIBLE_PX.min
        + (AVATAR_VISIBLE_PX.max - AVATAR_VISIBLE_PX.min) * Math.pow(t, AVATAR_CURVE_EXPONENT);
}

/** Hauteur du cadre 128×256 en px CSS (le corps occupe 87,5 % du sprite). */
export function avatarFramePx(zoom: number): number {
    return avatarVisiblePx(zoom) / BODY_VISIBLE_RATIO;
}

/** Facteur MapLibre `icon-size` pour un zoom donné. */
export function avatarIconSizeAtZoom(zoom: number): number {
    return avatarFramePx(zoom) / BODY_SPRITE.height;
}

/** Expression MapLibre continue : le rendu suit le zoom sans recalcul de bitmap. */
export function avatarIconSizeExpression(): unknown {
    const stops: number[] = [];
    for (let zoom = AVATAR_ZOOM.min; zoom <= AVATAR_ZOOM.max; zoom += 1) {
        stops.push(zoom, avatarIconSizeAtZoom(zoom));
    }
    return ['interpolate', ['linear'], ['zoom'], ...stops];
}
export const SNAP_SOURCE_ID = 'snap-people';
export const SNAP_LAYER_IDS = {
    bases: 'snap-bases',
    avatars: 'snap-avatars',
    labels: 'snap-labels',
} as const;

export type StackSlot = {dx: number; dy: number};

/** Décalages CSS des corps d'un groupe, rangée arrière en premier. */
export const STACK_LAYOUT: Record<number, StackSlot[]> = {
    1: [{dx: 0, dy: 0}],
    2: [{dx: -16, dy: 0}, {dx: 16, dy: 0}],
    3: [{dx: 0, dy: -14}, {dx: -26, dy: 0}, {dx: 26, dy: 0}],
    4: [{dx: -13, dy: -14}, {dx: 13, dy: -14}, {dx: -28, dy: 0}, {dx: 28, dy: 0}],
};

export function stackSlots(count: number): StackSlot[] {
    if (!Number.isInteger(count) || count < 1) throw new Error(`Pile de groupe inconnue: ${count}`);
    const slots = STACK_LAYOUT[Math.min(CLUSTER_MAX_STACK, count)];
    if (!slots) throw new Error(`Pile de groupe inconnue: ${count}`);
    return slots;
}

export function slotKey(shown: number, slot: number): string {
    return `${shown}-${slot}`;
}

/**
 * Expression MapLibre d'offset par slot, en unités d'icône. MapLibre la
 * multiplie par `icon-size` : les slots suivent donc l'échelle du zoom.
 */
export function slotOffsetExpression(): unknown {
    const cases: unknown[] = [];
    for (let shown = 1; shown <= CLUSTER_MAX_STACK; shown += 1) {
        stackSlots(shown).forEach((slot, index) => {
            cases.push(slotKey(shown, index), ['literal', [slot.dx / BODY_ICON_SIZE, slot.dy / BODY_ICON_SIZE]]);
        });
    }
    return ['match', ['get', 'slot'], ...cases, ['literal', [0, 0]]];
}

/**
 * Trois couches Snap : bases, corps, pastilles. La couche « appels » du POC
 * n'est pas portée ici (les markers apéros restent des éléments DOM).
 */
export function createSnapLayers(source: string = SNAP_SOURCE_ID): SymbolLayerSpecification[] {
    return [
        {
            id: SNAP_LAYER_IDS.bases,
            type: 'symbol',
            source,
            filter: ['==', ['get', 'kind'], 'base'],
            layout: {
                'icon-image': 'avatar-base',
                'icon-size': ['get', 'baseScale'],
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            },
        },
        {
            id: SNAP_LAYER_IDS.avatars,
            type: 'symbol',
            source,
            filter: ['==', ['get', 'kind'], 'avatar'],
            layout: {
                'icon-image': ['get', 'avatarKey'],
                'icon-size': avatarIconSizeExpression() as never,
                'icon-anchor': 'bottom',
                'icon-offset': slotOffsetExpression() as never,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'symbol-sort-key': ['get', 'sort'],
            },
        },
        {
            id: SNAP_LAYER_IDS.labels,
            type: 'symbol',
            source,
            filter: ['==', ['get', 'kind'], 'label'],
            layout: {
                'icon-image': ['get', 'pill'],
                'icon-anchor': 'top',
                'icon-offset': [0, 4],
                // Anti-chevauchement explicite (MapLibre v5) + marge : deux
                // pastilles proches ne peuvent plus se toucher, même de 2 px.
                'icon-allow-overlap': false,
                'icon-overlap': 'never',
                'icon-padding': 8,
                'symbol-sort-key': ['get', 'sort'],
            },
        },
    ];
}
