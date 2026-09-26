import { describe, it, expect } from 'vitest';
import { render } from './utils/test-utils';
import AvatarCanvas from '../components/3D/AvatarCanvas';
import BarWorld from '../components/3D/BarWorld';
import FloatyIslandWorld from '../components/3D/FloatyIslandWorld';
import PiscineWorld from '../components/3D/PiscineWorld';

describe('3D Components Rendering (Smoke Tests)', () => {
    it('renders AvatarCanvas', () => {
        render(<AvatarCanvas />);
        expect(true).toBe(true);
    });

    it('renders BarWorld', () => {
        render(<BarWorld participants={[]} isGameActive={false} cameraAction="IDLE" />);
        expect(true).toBe(true);
    });

    it('renders FloatyIslandWorld', () => {
        render(<FloatyIslandWorld participants={[]} isGameActive={false} cameraAction="IDLE" />);
        expect(true).toBe(true);
    });

    it('renders PiscineWorld', () => {
        render(<PiscineWorld participants={[]} isGameActive={false} cameraAction="IDLE" />);
        expect(true).toBe(true);
    });
});
