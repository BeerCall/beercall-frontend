import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BoxGeometry, Group, Mesh, MeshLambertMaterial, MeshStandardMaterial } from 'three';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { cheapMaterials, getOrCreateCheapMaterial } from './cheapMaterials';
import { clearGlbCache } from './loadGlb';
import { clearGlbManifest, setGlbManifest, type GlbManifest } from './manifest';
import { RealAvatar } from './RealAvatar';
import type { AvatarConfig } from '../../types/avatar';

const manifestFixture = {
    version: 1,
    pipelineVersion: 1,
    generatedAt: '2026-11-02T00:00:00.000Z',
    items: [
        { key: 'men/head/Men_head_Casual_0', url: '/models/glb/v1/pieces/Men/Men_head_Casual_0.glb', sourceId: 'Men_head_Casual_0' },
        { key: 'men/body/Men_body_Casual_0', url: '/models/glb/v1/pieces/Men/Men_body_Casual_0.glb', sourceId: 'Men_body_Casual_0' },
        { key: 'men/legs/Men_legs_Casual_0', url: '/models/glb/v1/pieces/Men/Men_legs_Casual_0.glb', sourceId: 'Men_legs_Casual_0' },
        { key: 'men/feet/Men_feet_Casual_0', url: '/models/glb/v1/pieces/Men/Men_feet_Casual_0.glb', sourceId: 'Men_feet_Casual_0' },
        { key: 'men/body/Men_body_Casual2_0', url: '/models/glb/v1/pieces/Men/Men_body_Casual2_0.glb', sourceId: 'Men_body_Casual2_0' },
        { key: 'acc/men/Men_accessory_Beer_500', url: '/models/glb/v1/accessories/Men/Men_accessory_Beer_500.glb', sourceId: 'Men_accessory_Beer_500' },
    ],
} as unknown as GlbManifest;

vi.mock('../../hooks/useAvatarAnimations', () => ({
    useAvatarAnimations: (targetClip: string) => ({
        clipNames: ['Idle', 'Walk', 'Run', 'Sitting', 'Interact', 'Wave'],
        activeClip: { name: targetClip || 'Idle', tracks: [] },
        activeClipLoop: true,
        notifyInitialFrame: vi.fn(),
    }),
}));

vi.mock('./loadGlb', () => {
    const dummyGltf = (id: string) => {
        const scene = new Group();
        scene.name = id;
        const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
        scene.add(mesh);
        return { scene };
    };

    return {
        loadGlb: vi.fn().mockImplementation(async (url: string) => dummyGltf(url)),
        cloneGlbInstance: (gltf: { scene: Group }) => gltf.scene.clone(),
        clearGlbCache: vi.fn(),
    };
});

function wrap(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('B11 — RealAvatar et matériaux économiques', () => {
    beforeEach(() => {
        clearGlbCache();
        clearGlbManifest();
        setGlbManifest(manifestFixture);
        vi.restoreAllMocks();
    });

    it('convertit les MeshStandardMaterial en MeshLambertMaterial et désactive les ombres', () => {
        const root = new Group();
        const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshStandardMaterial({ color: 0xff0000 }));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);

        cheapMaterials(root);

        expect(mesh.material).toBeInstanceOf(MeshLambertMaterial);
        expect(mesh.castShadow).toBe(false);
        expect(mesh.receiveShadow).toBe(false);
    });

    it('partage les matériaux créés via WeakMap sans instanciation redondante', () => {
        const sourceMat = new MeshStandardMaterial({ color: 0x00ff00 });
        const cheap1 = getOrCreateCheapMaterial(sourceMat);
        const cheap2 = getOrCreateCheapMaterial(sourceMat);

        expect(cheap1).toBe(cheap2);
    });

    it('monte un avatar GLB et notifie sa disponibilité', async () => {
        const onReady = vi.fn();
        const onReadinessChange = vi.fn();
        const onAnimationsLoaded = vi.fn();

        const config: AvatarConfig = {
            gender: 'Men',
            head: 'Men_head_Casual_0',
            body: 'Men_body_Casual_0',
            legs: 'Men_legs_Casual_0',
            feet: 'Men_feet_Casual_0',
            accessory: 'Men_accessory_Beer_500',
            animation: 'Sitting',
        };

        wrap(
            <RealAvatar
                config={config}
                onReady={onReady}
                onReadinessChange={onReadinessChange}
                onAnimationsLoaded={onAnimationsLoaded}
            />,
        );

        await waitFor(() => {
            expect(onReady).toHaveBeenCalled();
        });

        expect(onAnimationsLoaded).toHaveBeenCalledWith(expect.arrayContaining(['Sitting', 'Interact']));
        expect(onReadinessChange).toHaveBeenCalledWith(
            true,
            expect.objectContaining({
                parts: expect.arrayContaining(['Men_head_Casual_0', 'Men_accessory_Beer_500']),
            }),
        );
    });

    it('signale explicitement une pièce introuvable avec l’id de l’utilisateur', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        wrap(
            <RealAvatar
                userId={42}
                config={{
                    gender: 'Men',
                    head: 'Men_head_Casual_0',
                    body: 'Men_body_Casual_0',
                    legs: 'Men_legs_Casual_0',
                    feet: 'Men_feet_Casual_0',
                    accessory: 'Men_accessory_Fantome_500',
                }}
            />,
        );

        await waitFor(() => {
            const messages = errorSpy.mock.calls.map((call) => call.join(' '));
            expect(messages.some((message) => message.includes('Men_accessory_Fantome_500'))).toBe(true);
            expect(messages.some((message) => message.includes('42'))).toBe(true);
        });
    });

    it('gère le changement de tenue A -> B et applique les nouvelles pièces', async () => {
        const onReadinessChange = vi.fn();

        const configA: AvatarConfig = {
            gender: 'Men',
            head: 'Men_head_Casual_0',
            body: 'Men_body_Casual_0',
            legs: 'Men_legs_Casual_0',
            feet: 'Men_feet_Casual_0',
        };

        const configB: AvatarConfig = {
            gender: 'Men',
            head: 'Men_head_Casual_0',
            body: 'Men_body_Casual2_0',
            legs: 'Men_legs_Casual_0',
            feet: 'Men_feet_Casual_0',
        };

        const { rerender } = wrap(
            <RealAvatar config={configA} onReadinessChange={onReadinessChange} />,
        );

        await waitFor(() => {
            expect(onReadinessChange).toHaveBeenCalledWith(
                true,
                expect.objectContaining({ parts: expect.arrayContaining(['Men_body_Casual_0']) }),
            );
        });

        rerender(
            <QueryClientProvider client={new QueryClient()}>
                <RealAvatar config={configB} onReadinessChange={onReadinessChange} />
            </QueryClientProvider>,
        );

        await waitFor(() => {
            expect(onReadinessChange).toHaveBeenCalledWith(
                true,
                expect.objectContaining({ parts: expect.arrayContaining(['Men_body_Casual2_0']) }),
            );
        });
    });
});
