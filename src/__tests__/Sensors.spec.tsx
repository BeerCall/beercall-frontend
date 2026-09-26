import { describe, it, expect, vi } from 'vitest';
import { render } from './utils/test-utils';
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

describe('Sensors Rendering (Smoke Tests)', () => {
    it('renders AccelerometerTracker', () => {
        render(<AccelerometerTracker sensorPayload={{ duration_ms: 5000, difficulty: 1 }} actions={[{ action_id: '1', label: 'Go', type: 'primary' }]} onAction={vi.fn()} disabled={false} />);
        expect(true).toBe(true);
    });

    it('renders CameraCapture', () => {
        render(<CameraCapture sensorPayload={{ type: 'CAMERA_CAPTURE' }} onAction={vi.fn()} disabled={false} />);
        expect(true).toBe(true);
    });

    it('renders CanvasDraw', () => {
        render(<CanvasDraw sensorPayload={{ type: 'CANVAS_DRAW' }} onAction={vi.fn()} disabled={false} />);
        expect(true).toBe(true);
    });

    it('renders DuelSplitScreen', () => {
        render(<DuelSplitScreen sensorPayload={{ signal_delay_ms: 2000 }} actions={[{ action_id: '1', label: 'Go', type: 'primary' }]} onAction={vi.fn()} disabled={false} />);
        expect(true).toBe(true);
    });

    it('renders GyroscopeTracker', () => {
        render(<GyroscopeTracker sensorPayload={{ duration_ms: 3000, target_angle: 90, tolerance: 15 }} actions={[{ action_id: '1', label: 'Go', type: 'primary' }]} onAction={vi.fn()} disabled={false} />);
        expect(true).toBe(true);
    });

    it('renders ImageDisplay', () => {
        render(<ImageDisplay sensorPayload={{ image_data: 'data:image/png;base64,1234', type: 'IMAGE_DISPLAY' }} actions={[]} onAction={vi.fn()} disabled={false} />);
        expect(true).toBe(true);
    });

    it('renders MultiTouchTracker', () => {
        render(<MultiTouchTracker sensorPayload={{ hold_duration_ms: 2000 }} actions={[]} onAction={vi.fn()} disabled={false} />);
        expect(true).toBe(true);
    });

    it('renders StandardButtons', () => {
        render(<StandardButtons actions={[{ action_id: '1', label: 'Go', type: 'primary' }]} onAction={vi.fn()} disabled={false} />);
        expect(true).toBe(true);
    });

    it('renders SwipeToTarget', () => {
        render(<SwipeToTarget sensorPayload={{ target_size: 'medium', move_speed: 100 }} actions={[{ action_id: '1', label: 'Go', type: 'primary' }]} onAction={vi.fn()} disabled={false} />);
        expect(true).toBe(true);
    });

    it('renders TimeBombButton', () => {
        render(<TimeBombButton sensorPayload={{ remaining_ms: 10000 }} actions={[{ action_id: '1', label: 'Go', type: 'primary' }]} onAction={vi.fn()} disabled={false} />);
        expect(true).toBe(true);
    });
});
