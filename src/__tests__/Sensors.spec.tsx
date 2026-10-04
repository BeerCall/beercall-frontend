import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './utils/test-utils';

// Mock Canvas getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,fake');

// Mock mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
    value: {
        getUserMedia: vi.fn().mockResolvedValue({
            getTracks: () => [{ stop: vi.fn() }]
        }),
    },
    configurable: true,
});

import AccelerometerTracker from '../components/Game/Sensors/AccelerometerTracker';
import CameraCapture from '../components/Game/Sensors/CameraCapture';
import CanvasDraw from '../components/Game/Sensors/CanvasDraw';
import DuelSplitScreen from '../components/Game/Sensors/DuelSplitScreen';
import GyroscopeTracker from '../components/Game/Sensors/GyroscopeTracker';
import ImageDisplay from '../components/Game/Sensors/ImageDisplay';
import MultiTouchTracker from '../components/Game/Sensors/MultiTouchTracker';
import StandardButtons from '../components/Game/Sensors/StandardButtons';
import SwipeToTarget from '../components/Game/Sensors/SwipeToTarget';
import TimeBombButton from '../components/Game/Sensors/TimeBombButton';

describe('Sensors Rendering & Interactions', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.clearAllMocks();
    });

    it('AccelerometerTracker: triggers GAME_WON', async () => {
        const onAction = vi.fn();
        render(<AccelerometerTracker sensorPayload={{ duration_ms: 5000, target_shakes: 2 }} onAction={onAction} disabled={false} />);
        
        const startBtn = screen.getByRole('button', { name: /Démarrer/i });
        await userEvent.click(startBtn);
        
        const event = new Event('devicemotion') as any;
        event.accelerationIncludingGravity = { x: 20, y: 0, z: 0 };
        
        // Shake 1
        window.dispatchEvent(event);
        await vi.advanceTimersByTimeAsync(150);
        
        // Shake 2
        window.dispatchEvent(event);
        await vi.advanceTimersByTimeAsync(150);
        
        expect(onAction).toHaveBeenCalledWith('GAME_WON');
    });

    it('CameraCapture: renders capture button and handles action', async () => {
        const onAction = vi.fn();
        const { rerender } = render(<CameraCapture sensorPayload={{ type: 'CAMERA_CAPTURE', facing_mode: 'user', auto_capture_ms: 10000 }} onAction={onAction} disabled={false} />);
        
        // Wait for permission state to be granted (it's async with startCamera)
        const mainBtn = await screen.findByRole('button');
        expect(mainBtn).not.toBeDisabled();
        
        // Ensure disabled prop propagates
        rerender(<CameraCapture sensorPayload={{ type: 'CAMERA_CAPTURE', facing_mode: 'user', auto_capture_ms: 10000 }} onAction={onAction} disabled={true} />);
        expect(mainBtn).toBeDisabled();
        
        rerender(<CameraCapture sensorPayload={{ type: 'CAMERA_CAPTURE', facing_mode: 'user', auto_capture_ms: 10000 }} onAction={onAction} disabled={false} />);
        
        await userEvent.click(mainBtn);
        expect(mainBtn).toBeDisabled(); // disables after capture
        
        await vi.advanceTimersByTimeAsync(1500);
        expect(onAction).toHaveBeenCalledWith('PHOTO_TAKEN', expect.any(Object));
    });

    it('CanvasDraw: renders canvas and allows clearing', async () => {
        const onAction = vi.fn();
        render(<CanvasDraw sensorPayload={{ type: 'CANVAS_DRAW', duration_ms: 10000, stroke_color: '#000', stroke_width: 5 }} onAction={onAction} disabled={false} />);
        
        const canvas = document.querySelector('canvas');
        expect(canvas).toBeInTheDocument();
        
        const validateBtn = screen.getByRole('button', { name: /Effacer/i });
        expect(validateBtn).not.toBeDisabled();
    });

    it('DuelSplitScreen: triggers P1 tap', async () => {
        const onAction = vi.fn();
        render(<DuelSplitScreen sensorPayload={{ duration_ms: 2000, player_top: 'J1', player_bottom: 'J2', signal_delay_ms: 1000, type: 'DUEL' }} actions={[]} onAction={onAction} disabled={false} />);
        
        const p1Text = screen.getByText('J1');
        const clickArea = p1Text.parentElement;
        
        if (clickArea) fireEvent.pointerDown(clickArea);
        expect(onAction).toHaveBeenCalledWith('WINNER_BOTTOM'); 
    });

    it('GyroscopeTracker: renders button', async () => {
        const onAction = vi.fn();
        render(<GyroscopeTracker sensorPayload={{ duration_ms: 5000, target_angle: 90, tolerance: 10 }} onAction={onAction} disabled={false} />);
        
        const startBtn = screen.getByRole('button', { name: /Prêt \? Calibrer !/i });
        expect(startBtn).toBeInTheDocument();
    });

    it('MultiTouchTracker: triggers TARGET_SELECTED after holding', async () => {
        const onAction = vi.fn();
        render(<MultiTouchTracker sensorPayload={{ target_fingers: 2, hold_duration_ms: 100 }} actions={[]} onAction={onAction} disabled={false} />);
        
        const container = screen.getByText(/Posez vos doigts/i).parentElement?.parentElement;
        
        fireEvent.touchStart(container!, { touches: [{ identifier: 1, clientX: 10, clientY: 10 }, { identifier: 2, clientX: 20, clientY: 20 }] });
        
        await vi.advanceTimersByTimeAsync(7000); // 100 + 1500 + 4500 = 6100
        
        expect(onAction).toHaveBeenCalledWith('TARGET_SELECTED');
    });

    it('ImageDisplay: displays image and handles action', async () => {
        const onAction = vi.fn();
        render(<ImageDisplay sensorPayload={{ image_data: 'data:image/png;base64,1234', type: 'IMAGE_DISPLAY' }} actions={[{ action_id: 'btn1', label: 'Go', type: 'primary' }]} onAction={onAction} disabled={false} />);
        
        const img = document.querySelector('img');
        expect(img).toHaveAttribute('src', 'data:image/png;base64,1234');
        
        const btn = screen.getByRole('button', { name: /Go/i });
        await userEvent.click(btn);
        
        expect(onAction).toHaveBeenCalledWith('btn1');
    });

    it('StandardButtons: renders buttons and handles click', async () => {
        const onAction = vi.fn();
        render(<StandardButtons actions={[{ action_id: 'btn-test', label: 'TestBtn', type: 'primary' }]} onAction={onAction} disabled={false} />);
        
        const btn = screen.getByRole('button', { name: 'TestBtn' });
        expect(btn).not.toBeDisabled();
        
        await userEvent.click(btn);
        expect(onAction).toHaveBeenCalledWith('btn-test');
    });

    it('SwipeToTarget: renders successfully', async () => {
        const onAction = vi.fn();
        render(<SwipeToTarget sensorPayload={{ wind_force: 0, target_size: 'large', type: 'SWIPE' }} actions={[]} onAction={onAction} disabled={false} />);
        
        const draggable = screen.getByText('⬆️');
        expect(draggable).toBeInTheDocument();
    });

    it('TimeBombButton: triggers BOMB_PASSED', async () => {
        const onAction = vi.fn();
        render(<TimeBombButton sensorPayload={{ duration_ms: 10000 }} actions={[]} onAction={onAction} disabled={false} />);
        
        const btn = screen.getByRole('button', { name: /Tape pour Passer !/i });
        
        fireEvent.click(btn);
        
        expect(onAction).toHaveBeenCalledWith('BOMB_PASSED');
    });
});