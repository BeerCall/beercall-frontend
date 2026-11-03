import { describe, it, expect } from 'vitest';
import {
    CUSTOM_ITEMS_CONFIG,
    IDENTITY_ACCESSORY_TRANSFORM,
    getAccessoryTransform,
} from './accessoryTransforms';

describe('CUSTOM_ITEMS_CONFIG', () => {
    it('conserve exactement les 46 entrées historiques', () => {
        expect(Object.keys(CUSTOM_ITEMS_CONFIG)).toHaveLength(46);
    });

    it('contient la bière pour les deux genres avec les mêmes valeurs', () => {
        expect(CUSTOM_ITEMS_CONFIG['Men_accessory_Beer_500']).toEqual({
            position: [75, 150, 10],
            scale: [100, 100, 100],
            rotation: [0, 0, 0],
        });
        expect(CUSTOM_ITEMS_CONFIG['Women_accessory_Beer_500']).toEqual({
            position: [75, 150, 10],
            scale: [100, 100, 100],
            rotation: [0, 0, 0],
        });
    });

    it('conserve les rotations en radians telles quelles', () => {
        expect(CUSTOM_ITEMS_CONFIG['Men_accessory_Pikachu_2000'].rotation).toEqual([0, 625, 0]);
        expect(CUSTOM_ITEMS_CONFIG['Women_accessory_Bellsprout_2000'].rotation).toEqual([400, 625, 100]);
        expect(CUSTOM_ITEMS_CONFIG['Men_accessory_Cubone_2000'].rotation).toEqual([300, 600, 100]);
    });
});

describe('getAccessoryTransform', () => {
    it('retourne undefined sans accessoire ou pour none', () => {
        expect(getAccessoryTransform(undefined)).toBeUndefined();
        expect(getAccessoryTransform(null)).toBeUndefined();
        expect(getAccessoryTransform('none')).toBeUndefined();
    });

    it('retourne le transform explicite quand il existe', () => {
        expect(getAccessoryTransform('Men_accessory_Beer_500')).toBe(CUSTOM_ITEMS_CONFIG['Men_accessory_Beer_500']);
    });

    it("retombe sur l'identité pour McLaren et Backpack sans override", () => {
        expect(CUSTOM_ITEMS_CONFIG['Men_accessory_McLaren_5000']).toBeUndefined();
        expect(CUSTOM_ITEMS_CONFIG['Women_accessory_McLaren_5000']).toBeUndefined();
        expect(CUSTOM_ITEMS_CONFIG['Men_accessory_Backpack_0']).toBeUndefined();
        expect(CUSTOM_ITEMS_CONFIG['Women_accessory_Backpack_0']).toBeUndefined();
        expect(getAccessoryTransform('Men_accessory_McLaren_5000')).toEqual(IDENTITY_ACCESSORY_TRANSFORM);
        expect(getAccessoryTransform('Women_accessory_Backpack_0')).toEqual(IDENTITY_ACCESSORY_TRANSFORM);
    });
});
