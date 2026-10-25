import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import {
    resolveWorldShadowPolicy,
    getShadowPolicyDetails,
    calculateSharedShadowBounds,
    DEFAULT_SHADOW_POLICY,
    type Position3D,
} from '../lib/renderPolicy';
import WorldContactShadows from '../components/3D/WorldContactShadows';

const contactShadowsCaptor = vi.fn();

vi.mock('@react-three/drei', () => ({
    ContactShadows: (props: unknown) => {
        contactShadowsCaptor(props);
        return <div data-testid="mock-contact-shadows" />;
    },
}));

describe('Politique expérimentale d’ombres (T20 / CHAL-06)', () => {
    beforeEach(() => {
        contactShadowsCaptor.mockClear();
    });

    describe('1. Résolution de la politique (resolveWorldShadowPolicy & details)', () => {
        it('applique par défaut la politique "legacy" sans configuration d’environnement', () => {
            expect(DEFAULT_SHADOW_POLICY).toBe('legacy');
            expect(resolveWorldShadowPolicy(undefined, undefined)).toBe('legacy');
            expect(resolveWorldShadowPolicy(null, null)).toBe('legacy');
            expect(resolveWorldShadowPolicy('', '')).toBe('legacy');

            const details = getShadowPolicyDetails('legacy');
            expect(details.policy).toBe('legacy');
            expect(details.localFrames).toBe(Infinity);
            expect(details.useLocalShadows).toBe(true);
            expect(details.useSharedShadows).toBe(false);
        });

        it('résout explicitement la politique "static" avec localFrames={1}', () => {
            expect(resolveWorldShadowPolicy('static')).toBe('static');
            expect(resolveWorldShadowPolicy('  STATIC  ')).toBe('static');

            const details = getShadowPolicyDetails('static');
            expect(details.policy).toBe('static');
            expect(details.localFrames).toBe(1);
            expect(details.useLocalShadows).toBe(true);
            expect(details.useSharedShadows).toBe(false);
        });

        it('résout explicitement la politique "shared"', () => {
            expect(resolveWorldShadowPolicy('shared')).toBe('shared');
            expect(resolveWorldShadowPolicy('  SHARED  ')).toBe('shared');

            const details = getShadowPolicyDetails('shared');
            expect(details.policy).toBe('shared');
            expect(details.localFrames).toBe(Infinity);
            expect(details.useLocalShadows).toBe(false);
            expect(details.useSharedShadows).toBe(true);
        });

        it('assure la rétrocompatibilité avec VITE_SHARED_WORLD_SHADOWS', () => {
            expect(resolveWorldShadowPolicy(undefined, true)).toBe('shared');
            expect(resolveWorldShadowPolicy(undefined, 'true')).toBe('shared');
            expect(resolveWorldShadowPolicy(undefined, '1')).toBe('shared');
            expect(resolveWorldShadowPolicy(undefined, 'false')).toBe('legacy');
            expect(resolveWorldShadowPolicy(undefined, false)).toBe('legacy');
        });

        it('priorise VITE_WORLD_SHADOW_POLICY sur l’ancien booléen VITE_SHARED_WORLD_SHADOWS', () => {
            expect(resolveWorldShadowPolicy('legacy', true)).toBe('legacy');
            expect(resolveWorldShadowPolicy('static', true)).toBe('static');
            expect(resolveWorldShadowPolicy('shared', false)).toBe('shared');
        });
    });

    describe('2. Calcul pur des limites de l’ombre partagée (calculateSharedShadowBounds)', () => {
        it('retourne null si aucun avatar n’est fourni (0 avatar = 0 shadow)', () => {
            expect(calculateSharedShadowBounds([], 5)).toBeNull();
        });

        it('calcule une empreinte de 150x150 centrée sur un avatar unique', () => {
            const bounds = calculateSharedShadowBounds([[0, 5, 0]], 5);
            expect(bounds).not.toBeNull();
            expect(bounds).toEqual({
                minX: -75,
                maxX: 75,
                minZ: -75,
                maxZ: 75,
                centerX: 0,
                centerZ: 0,
                width: 150,
                depth: 150,
                scale: [150, 150],
                position: [0, 5, 0],
            });
        });

        it('gère correctement les coordonnées négatives et préserve le plan Y du sol', () => {
            const bounds = calculateSharedShadowBounds([[-40, 50, -80]], 50);
            expect(bounds).not.toBeNull();
            expect(bounds?.centerX).toBe(-40);
            expect(bounds?.centerZ).toBe(-80);
            expect(bounds?.position).toEqual([-40, 50, -80]);
            expect(bounds?.scale).toEqual([150, 150]);
            expect(bounds?.minX).toBe(-115);
            expect(bounds?.maxX).toBe(35);
            expect(bounds?.minZ).toBe(-155);
            expect(bounds?.maxZ).toBe(-5);
        });

        it('calcule une ombre englobant exactement tous les centres + 75 pour 10 avatars', () => {
            // Disposition en cercle typique de BarWorld (rayon 150)
            const positions: Position3D[] = Array.from({ length: 10 }, (_, i) => {
                const angle = (i / 10) * Math.PI * 2;
                return [Math.cos(angle) * 150, 5, Math.sin(angle) * 150];
            });

            const bounds = calculateSharedShadowBounds(positions, 5);
            expect(bounds).not.toBeNull();

            // Vérifie que chaque avatar avec son empreinte locale (rayon 75) est strictement inclus dans l'ombre partagée
            for (const pos of positions) {
                const [x, , z] = pos as [number, number, number];
                expect(x - 75).toBeGreaterThanOrEqual(bounds!.minX - 0.0001);
                expect(x + 75).toBeLessThanOrEqual(bounds!.maxX + 0.0001);
                expect(z - 75).toBeGreaterThanOrEqual(bounds!.minZ - 0.0001);
                expect(z + 75).toBeLessThanOrEqual(bounds!.maxZ + 0.0001);
            }

            // Sur X : les angles 0 et PI donnent exactement -150 et +150
            expect(bounds?.minX).toBeCloseTo(-225, 1);
            expect(bounds?.maxX).toBeCloseTo(225, 1);
            expect(bounds?.width).toBeCloseTo(450, 1);
            expect(bounds?.position[1]).toBe(5);
        });

        it('calcule correctement pour 20 et 30 avatars', () => {
            for (const count of [20, 30]) {
                const radius = Math.max(40, 15 * count);
                const positions: Position3D[] = Array.from({ length: count }, (_, i) => {
                    const angle = (i / count) * Math.PI * 2;
                    return [Math.cos(angle) * radius, 10, Math.sin(angle) * radius];
                });

                const bounds = calculateSharedShadowBounds(positions, 10);
                expect(bounds).not.toBeNull();
                expect(bounds?.position[1]).toBe(10);

                // Vérifie que tous les avatars sont couverts
                for (const pos of positions) {
                    const [x, , z] = pos as [number, number, number];
                    expect(x - 75).toBeGreaterThanOrEqual(bounds!.minX - 0.0001);
                    expect(x + 75).toBeLessThanOrEqual(bounds!.maxX + 0.0001);
                    expect(z - 75).toBeGreaterThanOrEqual(bounds!.minZ - 0.0001);
                    expect(z + 75).toBeLessThanOrEqual(bounds!.maxZ + 0.0001);
                }
            }
        });

        it('accepte indifféremment les tuples [x, y, z] et les objets { x, y, z }', () => {
            const boundsFromTuples = calculateSharedShadowBounds([[-10, 5, 20], [30, 5, -40]], 5);
            const boundsFromObjects = calculateSharedShadowBounds([{ x: -10, y: 5, z: 20 }, { x: 30, y: 5, z: -40 }], 5);

            expect(boundsFromTuples).toEqual(boundsFromObjects);
        });
    });

    describe('3. Rendu React du composant WorldContactShadows', () => {
        it('ne rend aucun ContactShadows si aucun avatar n’est présent (0 avatar = 0 shadow)', () => {
            const { container } = render(<WorldContactShadows positions={[]} groundY={5} />);
            expect(container.firstChild).toBeNull();
            expect(contactShadowsCaptor).not.toHaveBeenCalled();
        });

        it('rend un unique ContactShadows avec les paramètres attendus pour 1 avatar', () => {
            render(<WorldContactShadows positions={[[10, 5, -20]]} groundY={5} />);

            expect(contactShadowsCaptor).toHaveBeenCalledTimes(1);
            expect(contactShadowsCaptor).toHaveBeenCalledWith(
                expect.objectContaining({
                    position: [10, 5, -20],
                    scale: [150, 150],
                    opacity: 0.6,
                    blur: 2,
                    far: 100,
                    color: '#000000',
                    frames: Infinity,
                    resolution: 512,
                })
            );
        });

        it('rend un seul ContactShadows pour 10, 20 et 30 avatars avec dimensions englobantes', () => {
            for (const count of [10, 20, 30]) {
                contactShadowsCaptor.mockClear();

                const positions: Position3D[] = Array.from({ length: count }, (_, i) => [
                    i * 10 - (count * 5),
                    5,
                    (i % 2 === 0 ? 1 : -1) * (i * 5),
                ]);

                render(<WorldContactShadows positions={positions} groundY={5} />);

                expect(contactShadowsCaptor).toHaveBeenCalledTimes(1);
                const lastCall = contactShadowsCaptor.mock.calls[0][0];
                expect(lastCall.frames).toBe(Infinity);
                expect(lastCall.resolution).toBe(512);
                expect(lastCall.opacity).toBe(0.6);
                expect(lastCall.blur).toBe(2);
                expect(lastCall.far).toBe(100);
                expect(lastCall.color).toBe('#000000');
                expect(lastCall.position[1]).toBe(5);
                // Vérifie que scale couvre bien tous les centres + 75
                expect(lastCall.scale[0]).toBeGreaterThanOrEqual(150);
                expect(lastCall.scale[1]).toBeGreaterThanOrEqual(150);
            }
        });

        it('autorise la personnalisation des props (couleur, blur, far, frames, resolution)', () => {
            render(
                <WorldContactShadows
                    positions={[[0, 0, 0]]}
                    groundY={0}
                    opacity={0.8}
                    blur={3}
                    far={200}
                    color="#111111"
                    frames={1}
                    resolution={1024}
                />
            );

            expect(contactShadowsCaptor).toHaveBeenCalledWith(
                expect.objectContaining({
                    opacity: 0.8,
                    blur: 3,
                    far: 200,
                    color: '#111111',
                    frames: 1,
                    resolution: 1024,
                })
            );
        });
    });
});
