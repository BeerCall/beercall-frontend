import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { render } from './utils/test-utils';
import AvatarCanvas from '../components/3D/AvatarCanvas';
import BarWorld from '../components/3D/BarWorld';
import FloatyIslandWorld from '../components/3D/FloatyIslandWorld';
import PiscineWorld from '../components/3D/PiscineWorld';

vi.mock('three-stdlib', () => ({
    SkeletonUtils: {
        clone: (obj: unknown) => obj
    }
}));

vi.mock('@react-three/fiber', () => ({
    Canvas: vi.fn(({ children }: React.PropsWithChildren<unknown>) => <div data-testid="canvas-mock">{children}</div>),
    useFrame: vi.fn(),
}));

vi.mock('@react-three/drei', () => {
    const dummyScene = { clone: () => dummyScene, traverse: (cb: (node: { isMesh: boolean }) => void) => cb({ isMesh: true }), children: [] };
    const useFBXMock = vi.fn().mockReturnValue(dummyScene) as unknown as { preload: () => void, (path: string): unknown };
    useFBXMock.preload = vi.fn();
    
    return {
        useFBX: useFBXMock,
        useGLTF: vi.fn().mockReturnValue({ scene: dummyScene }),
        useAnimations: vi.fn().mockReturnValue({ actions: {}, names: [] }),
        Environment: () => null,
        OrbitControls: () => null,
        ContactShadows: () => null,
        Center: ({ children }: React.PropsWithChildren<unknown>) => <>{children}</>,
        PositionalAudio: () => null,
        Float: ({ children }: React.PropsWithChildren<unknown>) => <>{children}</>,
        Html: ({ children }: React.PropsWithChildren<unknown>) => <div data-testid="html-mock">{children}</div>,
        Text: ({ children }: React.PropsWithChildren<unknown>) => <>{children}</>,
    };
});

vi.mock('../../hooks/useGameEngine', () => ({
    useGameEngine: vi.fn().mockReturnValue({ gameState: true, startGame: vi.fn(), isLocked: false })
}));

vi.mock('../../store/useGameUIStore', () => ({
    useGameUIStore: vi.fn().mockReturnValue(vi.fn())
}));

import * as drei from '@react-three/drei';
import * as fiber from '@react-three/fiber';

describe('3D Components Rendering & Observability', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders AvatarCanvas and calls useFBX', () => {
        const config = {
            head: 'cap',
            body: 'tshirt',
            legs: 'jeans',
            feet: 'sneakers',
            accessory: 'none',
            animation: 'Idle',
            gender: 'Men' as const
        };
        
        render(<AvatarCanvas config={config} />);
        
        expect(fiber.Canvas).toHaveBeenCalled();
        expect(drei.useFBX.preload).toHaveBeenCalled();
        expect(drei.useFBX).toHaveBeenCalled();
    });

    it('renders BarWorld and passes participants', async () => {
        const onSelectPhotoMock = vi.fn();
        const participants = [
            { id: '1', username: 'P1', proof_photo_url: 'http://test.com/photo.jpg', avatar: { head: 'cap', gender: 'Men' } }
        ];
        
        render(<BarWorld participants={participants} isActiveApero={true} aperoId="apero-1" squadId="sq-1" onSelectPhoto={onSelectPhotoMock} />);
        
        expect(drei.useFBX).toHaveBeenCalled();
        expect(screen.getByText('P1')).toBeInTheDocument();
        expect(screen.getByText('JACKPOT')).toBeInTheDocument(); // SlotMachine active if isActiveApero
        
        const photoMock = screen.getByAltText('Preuve');
        photoMock.click();
        
        await waitFor(() => {
            expect(onSelectPhotoMock).toHaveBeenCalledWith('http://test.com/photo.jpg');
        });
    });

    it('renders FloatyIslandWorld and handles game active', () => {
        const participants = [
            { id: '1', username: 'P1', avatar: { head: 'cap', gender: 'Men' } }
        ];
        
        render(<FloatyIslandWorld participants={participants} />);
        
        expect(drei.useFBX).toHaveBeenCalled();
        expect(screen.getByText('P1')).toBeInTheDocument();
    });

    it('renders PiscineWorld and handles camera action', () => {
        const participants = [
            { id: '1', username: 'P1', excuse: 'Sorry!', avatar: { head: 'cap', gender: 'Men' } }
        ];
        
        render(<PiscineWorld participants={participants} />);
        
        expect(drei.useFBX).toHaveBeenCalled();
        expect(screen.getByText('P1')).toBeInTheDocument();
    });
});