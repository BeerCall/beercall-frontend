import { Object3D, PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { AVATAR_DRAG_THRESHOLD_PX } from '../worlds/avatarHitTarget';
import {
    SLOT_LEVER_DOWN_ANGLE,
    SLOT_LEVER_PULL_MS,
    shouldPullLever,
    slotMachineScreen,
} from '../worlds/slotMachineRules';
import {
    registerSlotMachineTarget,
    resetSlotMachineTargetForTests,
    resolveSlotMachineTarget,
    unregisterSlotMachineTarget,
} from '../worlds/slotMachineProbe';

const TOUCH = {active: true, canLaunch: true, locked: false, pulled: false, delta: 2};

function camera(): PerspectiveCamera {
    const view = new PerspectiveCamera(45, 16 / 9, 0.1, 100);
    view.position.set(0, 0, 8);
    view.lookAt(0, 0, 0);
    view.updateMatrixWorld(true);
    return view;
}

afterEach(() => {
    resetSlotMachineTargetForTests();
});

describe('8l — règles de la machine à sous du Bar', () => {
    it('tire le levier sur un vrai toucher', () => {
        expect(shouldPullLever(TOUCH)).toBe(true);
        expect(shouldPullLever({...TOUCH, delta: AVATAR_DRAG_THRESHOLD_PX})).toBe(true);
    });

    it('ignore un glissement de caméra au-delà de 8 px', () => {
        expect(shouldPullLever({...TOUCH, delta: AVATAR_DRAG_THRESHOLD_PX + 1})).toBe(false);
        expect(shouldPullLever({...TOUCH, delta: 48})).toBe(false);
    });

    it('ignore une couche inactive, un levier verrouillé, déjà tiré ou sans lancement', () => {
        expect(shouldPullLever({...TOUCH, active: false})).toBe(false);
        expect(shouldPullLever({...TOUCH, canLaunch: false})).toBe(false);
        expect(shouldPullLever({...TOUCH, locked: true})).toBe(false);
        expect(shouldPullLever({...TOUCH, pulled: true})).toBe(false);
    });

    it('garde la durée et l’angle de l’ancien BarWorld', () => {
        expect(SLOT_LEVER_PULL_MS).toBe(600);
        expect(SLOT_LEVER_DOWN_ANGLE).toBeCloseTo(Math.PI / 2.5, 12);
    });

    it('affiche JACKPOT avant la partie et REJOINDRE LA SQUAD pendant', () => {
        expect(slotMachineScreen(false)).toEqual({color: '#d97706', lines: ['JACKPOT']});
        expect(slotMachineScreen(true)).toEqual({color: '#059669', lines: ['REJOINDRE', 'LA SQUAD']});
    });
});

describe('8l — cible PROBE de la machine à sous', () => {
    it('projette la machine au centre quand elle est devant la caméra', () => {
        const mesh = new Object3D();
        mesh.position.set(0, 0, 0);
        mesh.updateMatrixWorld(true);
        registerSlotMachineTarget(mesh, camera());
        expect(resolveSlotMachineTarget()).toEqual({ndcX: 0, ndcY: 0});
        expect(window.__beercallSlotMachineTarget?.()).toEqual({ndcX: 0, ndcY: 0});
    });

    it('ne publie rien hors cadre et se retire au démontage', () => {
        const mesh = new Object3D();
        mesh.position.set(50, 0, 0);
        mesh.updateMatrixWorld(true);
        registerSlotMachineTarget(mesh, camera());
        expect(resolveSlotMachineTarget()).toBeNull();
        unregisterSlotMachineTarget(mesh);
        expect(window.__beercallSlotMachineTarget?.()).toBeNull();
    });
});
