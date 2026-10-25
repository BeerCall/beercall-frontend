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
import BarWorld from '../components/3D/BarWorld';
import PiscineWorld from '../components/3D/PiscineWorld';
import FloatyIslandWorld from '../components/3D/FloatyIslandWorld';
import type { WorldParticipant } from '../types/api';

const contactShadowsCaptor = vi.fn();

vi.mock('@react-three/drei', () => ({
    ContactShadows: (props: unknown) => {
        contactShadowsCaptor(props);
        return <div data-testid="mock-contact-shadows" />;
    },
    useFBX: vi.fn().mockReturnValue({
        clone: () => ({ traverse: () => {} }),
        traverse: () => {},
    }),
    Float: ({ children }: React.PropsWithChildren<unknown>) => <div>{children}</div>,
    Html: ({ children }: React.PropsWithChildren<unknown>) => <div>{children}</div>,
    Text: () => null,
}));

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useGameEngine', () => ({
    useGameEngine: () => ({ gameState: null, startGame: vi.fn(), isLocked: false }),
}));

vi.mock('../components/3D/AvatarCanvas', () => ({
    ModularAvatar: () => <div data-testid="mock-avatar" />,
}));

describe('Politique expérimentale d’ombres (T20 / CHAL-06)', () => {
    beforeEach(() => {
        contactShadowsCaptor.mockClear();
    });

    describe('1. Résolution de la politique (resolveWorldShadowPolicy & details)', () => {
        it('applique par défaut la politique "static" sans configuration d’environnement', () => {
            expect(DEFAULT_SHADOW_POLICY).toBe('static');
            expect(resolveWorldShadowPolicy(undefined, undefined)).toBe('static');
            expect(resolveWorldShadowPolicy(null, null)).toBe('static');
            expect(resolveWorldShadowPolicy('', '')).toBe('static');

            const details = getShadowPolicyDetails('static');
            expect(details.policy).toBe('static');
            expect(details.localFrames).toBe(1);
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
            expect(resolveWorldShadowPolicy(undefined, 'false')).toBe('static');
            expect(resolveWorldShadowPolicy(undefined, false)).toBe('static');
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

    describe('4. Intégration BarWorld (T21 / CHAL-06)', () => {
        const createParticipants = (count: number): WorldParticipant[] =>
            Array.from({ length: count }, (_, i) => ({
                user_id: `u_${i}`,
                username: `Soldat ${i}`,
                avatar_config: { head: 'default' },
            }));

        it('politique static par défaut : rend N ombres locales avec frames=1 pour N participants', () => {
            const participants = createParticipants(10);

            render(
                <BarWorld
                    aperoId="bc_1"
                    squadId="sq_1"
                    participants={participants}
                    isActiveApero={false}
                    onSelectPhoto={vi.fn()}
                />
            );

            // 10 instances locales de ContactShadows, chacune avec frames=1
            expect(contactShadowsCaptor).toHaveBeenCalledTimes(10);
            for (const call of contactShadowsCaptor.mock.calls) {
                const props = call[0];
                expect(props.frames).toBe(1);
                expect(props.scale).toBe(150);
                expect(props.position).toEqual([0, 0, 0]);
            }
        });

        it('politique legacy explicite : rend N ombres locales avec frames=Infinity', () => {
            const participants = createParticipants(10);

            render(
                <BarWorld
                    aperoId="bc_1"
                    squadId="sq_1"
                    participants={participants}
                    isActiveApero={false}
                    onSelectPhoto={vi.fn()}
                    shadowPolicy="legacy"
                />
            );

            // 10 instances locales de ContactShadows avec frames=Infinity
            expect(contactShadowsCaptor).toHaveBeenCalledTimes(10);
            for (const call of contactShadowsCaptor.mock.calls) {
                const props = call[0];
                expect(props.frames).toBe(Infinity);
                expect(props.scale).toBe(150);
                expect(props.position).toEqual([0, 0, 0]);
            }
        });

        it('politique static explicite : conserve N ombres locales avec frames=1', () => {
            const participants = createParticipants(10);

            render(
                <BarWorld
                    aperoId="bc_1"
                    squadId="sq_1"
                    participants={participants}
                    isActiveApero={false}
                    onSelectPhoto={vi.fn()}
                    shadowPolicy="static"
                />
            );

            // 10 instances locales avec frames=1
            expect(contactShadowsCaptor).toHaveBeenCalledTimes(10);
            for (const call of contactShadowsCaptor.mock.calls) {
                const props = call[0];
                expect(props.frames).toBe(1);
                expect(props.scale).toBe(150);
                expect(props.position).toEqual([0, 0, 0]);
            }
        });

        it('politique shared : remplace les ombres locales par une seule ombre partagée sur le sol Y=5', () => {
            const participants = createParticipants(10);

            render(
                <BarWorld
                    aperoId="bc_1"
                    squadId="sq_1"
                    participants={participants}
                    isActiveApero={false}
                    onSelectPhoto={vi.fn()}
                    shadowPolicy="shared"
                />
            );

            // Exactement 1 seule instance de ContactShadows rendue au niveau root
            expect(contactShadowsCaptor).toHaveBeenCalledTimes(1);
            const callProps = contactShadowsCaptor.mock.calls[0][0];
            expect(callProps.position[1]).toBe(5);
            expect(callProps.frames).toBe(Infinity);
            expect(callProps.resolution).toBe(512);
            // Couvre l'ensemble des 10 avatars + 75
            expect(callProps.scale[0]).toBeGreaterThanOrEqual(300);
            expect(callProps.scale[1]).toBeGreaterThanOrEqual(300);
        });

        it('ne produit aucune ombre si la liste de participants est vide sous shared', () => {
            render(
                <BarWorld
                    aperoId="bc_1"
                    squadId="sq_1"
                    participants={[]}
                    isActiveApero={false}
                    onSelectPhoto={vi.fn()}
                    shadowPolicy="shared"
                />
            );

            expect(contactShadowsCaptor).not.toHaveBeenCalled();
        });
    });

    describe('5. Intégration PiscineWorld & FloatyIslandWorld (T22 / CHAL-06)', () => {
        const createParticipants = (count: number): WorldParticipant[] =>
            Array.from({ length: count }, (_, i) => ({
                user_id: `u_${i}`,
                username: `Nageur ${i}`,
                avatar_config: { head: 'default' },
                excuse: i === 0 ? 'Piscine fermée' : undefined,
            }));

        it('PiscineWorld static par défaut : rend N ombres locales avec frames=1', () => {
            const participants = createParticipants(5);
            render(<PiscineWorld participants={participants} />);

            expect(contactShadowsCaptor).toHaveBeenCalledTimes(5);
            for (const call of contactShadowsCaptor.mock.calls) {
                const props = call[0];
                expect(props.frames).toBe(1);
                expect(props.scale).toBe(150);
                expect(props.position).toEqual([0, 0, 0]);
            }
        });

        it('PiscineWorld legacy explicite : rend N ombres locales avec frames=Infinity', () => {
            const participants = createParticipants(5);
            render(<PiscineWorld participants={participants} shadowPolicy="legacy" />);

            expect(contactShadowsCaptor).toHaveBeenCalledTimes(5);
            for (const call of contactShadowsCaptor.mock.calls) {
                const props = call[0];
                expect(props.frames).toBe(Infinity);
                expect(props.scale).toBe(150);
                expect(props.position).toEqual([0, 0, 0]);
            }
        });

        it('PiscineWorld static explicite : conserve N ombres locales avec frames=1', () => {
            const participants = createParticipants(5);
            render(<PiscineWorld participants={participants} shadowPolicy="static" />);

            expect(contactShadowsCaptor).toHaveBeenCalledTimes(5);
            for (const call of contactShadowsCaptor.mock.calls) {
                const props = call[0];
                expect(props.frames).toBe(1);
                expect(props.scale).toBe(150);
                expect(props.position).toEqual([0, 0, 0]);
            }
        });

        it('PiscineWorld shared : rend 1 seule ombre partagée sur le sol de la piscine Y=50', () => {
            const participants = createParticipants(5);
            render(<PiscineWorld participants={participants} shadowPolicy="shared" />);

            expect(contactShadowsCaptor).toHaveBeenCalledTimes(1);
            const callProps = contactShadowsCaptor.mock.calls[0][0];
            expect(callProps.position[1]).toBe(50);
            expect(callProps.frames).toBe(Infinity);
            expect(callProps.resolution).toBe(512);
            expect(callProps.scale[0]).toBeGreaterThanOrEqual(250);
            expect(callProps.scale[1]).toBeGreaterThanOrEqual(250);
        });

        it('PiscineWorld shared vide : ne produit aucune ombre si 0 participant', () => {
            render(<PiscineWorld participants={[]} shadowPolicy="shared" />);
            expect(contactShadowsCaptor).not.toHaveBeenCalled();
        });

        it('FloatyIslandWorld static par défaut : rend N ombres locales avec frames=1', () => {
            const participants = createParticipants(5);
            render(<FloatyIslandWorld participants={participants} />);

            expect(contactShadowsCaptor).toHaveBeenCalledTimes(5);
            for (const call of contactShadowsCaptor.mock.calls) {
                const props = call[0];
                expect(props.frames).toBe(1);
                expect(props.scale).toBe(150);
                expect(props.position).toEqual([0, 0, 0]);
            }
        });

        it('FloatyIslandWorld legacy explicite : rend N ombres locales avec frames=Infinity', () => {
            const participants = createParticipants(5);
            render(<FloatyIslandWorld participants={participants} shadowPolicy="legacy" />);

            expect(contactShadowsCaptor).toHaveBeenCalledTimes(5);
            for (const call of contactShadowsCaptor.mock.calls) {
                const props = call[0];
                expect(props.frames).toBe(Infinity);
                expect(props.scale).toBe(150);
                expect(props.position).toEqual([0, 0, 0]);
            }
        });

        it('FloatyIslandWorld static explicite : conserve N ombres locales avec frames=1', () => {
            const participants = createParticipants(5);
            render(<FloatyIslandWorld participants={participants} shadowPolicy="static" />);

            expect(contactShadowsCaptor).toHaveBeenCalledTimes(5);
            for (const call of contactShadowsCaptor.mock.calls) {
                const props = call[0];
                expect(props.frames).toBe(1);
                expect(props.scale).toBe(150);
                expect(props.position).toEqual([0, 0, 0]);
            }
        });

        it('FloatyIslandWorld shared : rend 1 seule ombre partagée sur le sol de l’île Y=95', () => {
            const participants = createParticipants(5);
            render(<FloatyIslandWorld participants={participants} shadowPolicy="shared" />);

            expect(contactShadowsCaptor).toHaveBeenCalledTimes(1);
            const callProps = contactShadowsCaptor.mock.calls[0][0];
            expect(callProps.position[1]).toBe(95);
            expect(callProps.frames).toBe(Infinity);
            expect(callProps.resolution).toBe(512);
            expect(callProps.scale[0]).toBeGreaterThanOrEqual(250);
            expect(callProps.scale[1]).toBeGreaterThanOrEqual(250);
        });

        it('FloatyIslandWorld shared vide : ne produit aucune ombre si 0 participant', () => {
            render(<FloatyIslandWorld participants={[]} shadowPolicy="shared" />);
            expect(contactShadowsCaptor).not.toHaveBeenCalled();
        });
    });
});
