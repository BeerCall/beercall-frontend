import type {SymbolLayerSpecification} from 'maplibre-gl';

/** B09a — constantes de rendu Snap (corps 100 px, base, piles). */
export const BODY_CSS_PX = 100;
export const BODY_SPRITE = {width: 128, height: 256} as const;
export const BODY_ICON_SIZE = BODY_CSS_PX / BODY_SPRITE.height;
export const BASE_SPRITE = {width: 64, height: 22} as const;
export const CLUSTER_RADIUS_PX = 34;
export const CLUSTER_MAX_STACK = 4;
export const SNAP_ZOOM_RANGE = {min: 10, max: 18} as const;
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

/** Expression MapLibre d'offset par slot ; divisée par icon-size pour rester en px CSS. */
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
                'icon-size': BODY_ICON_SIZE,
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
                'icon-allow-overlap': false,
                'symbol-sort-key': ['get', 'sort'],
            },
        },
    ];
}
