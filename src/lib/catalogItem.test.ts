import {describe, expect, it} from 'vitest';
import {catalogAssetId} from './catalogItem';

describe('catalogAssetId', () => {
    it('privilégie le nom de fichier courant', () => {
        expect(catalogAssetId({id: 'Men_head_X_500', source: 'Men_head_X_800.fbx'}))
            .toBe('Men_head_X_800');
    });

    it('retombe sur l’id quand la source manque', () => {
        expect(catalogAssetId({id: 'Men_head_X_500'})).toBe('Men_head_X_500');
        expect(catalogAssetId({id: 'Men_head_X_500', source: null})).toBe('Men_head_X_500');
    });

    it('retire l’extension et les espaces', () => {
        expect(catalogAssetId({id: 'id', source: ' Men_head_X_800.FBX '}))
            .toBe('Men_head_X_800');
    });
});
