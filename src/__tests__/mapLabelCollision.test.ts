import { describe, expect, it } from 'vitest';

import { SNAP_LAYER_IDS, createSnapLayers } from '../map/snap/mapScenario';

describe('anti-chevauchement des noms carte (8c)', () => {
    const labels = createSnapLayers().find(layer => layer.id === SNAP_LAYER_IDS.labels);

    it('désactive explicitement le chevauchement des pastilles', () => {
        expect(labels).toBeDefined();
        const layout = labels!.layout as Record<string, unknown>;
        expect(layout['icon-allow-overlap']).toBe(false);
        expect(layout['icon-overlap']).toBe('never');
        expect(layout['icon-padding']).toBe(8);
    });

    it('garde le libellé au-dessus du corps et sa taille fixe', () => {
        const layout = labels!.layout as Record<string, unknown>;
        expect(layout['icon-anchor']).toBe('top');
        expect(layout['icon-offset']).toEqual([0, 4]);
        expect(layout['icon-size']).toBeUndefined();
    });
});
