import { describe, it, expect, vi, beforeEach } from 'vitest';
import { warmAvatarModels } from '../components/3D/warmupAvatar';
import { useFBX } from '@react-three/drei';

vi.mock('@react-three/drei', () => ({
    useFBX: { preload: vi.fn() },
}));

describe('warmAvatarModels', () => {
    beforeEach(() => {
        vi.mocked(useFBX.preload).mockClear();
    });

    it('préchage les parties présentes et ignore "none"', () => {
        warmAvatarModels({
            head: 'Men_head_Casual2_0',
            body: 'Men_body_Casual2_0',
            legs: 'Men_legs_Casual2_0',
            feet: 'Men_feet_Casual2_0',
            accessory: 'none',
        });

        expect(useFBX.preload).toHaveBeenCalledTimes(4);
        expect(vi.mocked(useFBX.preload).mock.calls.map(([url]) => url)).toEqual([
            '/models/Men_head_Casual2_0.fbx',
            '/models/Men_body_Casual2_0.fbx',
            '/models/Men_legs_Casual2_0.fbx',
            '/models/Men_feet_Casual2_0.fbx',
        ]);
    });

    it('ne fait rien sans configuration', () => {
        warmAvatarModels(null);
        warmAvatarModels(undefined);
        expect(useFBX.preload).not.toHaveBeenCalled();
    });

    it('ne propage pas une erreur de préchargement', () => {
        vi.mocked(useFBX.preload).mockImplementationOnce(() => {
            throw new Error('loader indisponible');
        });

        expect(() => warmAvatarModels({ head: 'head', body: 'body' })).not.toThrow();
        expect(useFBX.preload).toHaveBeenCalledTimes(2);
    });
});
