import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AvatarLoadingIndicator from '../components/Dashboard/AvatarLoadingIndicator';
import { getAvatarLoadingTrace, recordAvatarLoading } from '../lib/avatarLoadingTrace';

describe('avatar loading evidence', () => {
    it('distinguishes map bootstrap from Canvas suspension and records both ends', () => {
        const { rerender, unmount, getByRole } = render(<AvatarLoadingIndicator phase="map-bootstrap"/>);
        expect(getByRole('status')).toHaveAttribute('data-avatar-loading', 'map-bootstrap');
        rerender(<AvatarLoadingIndicator phase="canvas-suspense"/>);
        expect(getByRole('status')).toHaveAttribute('data-avatar-loading', 'canvas-suspense');
        unmount();
        expect(getAvatarLoadingTrace().slice(-4).map(({ phase, event, view }) => ({ phase, event, view }))).toEqual([
            { phase: 'map-bootstrap', event: 'start', view: 'dashboard' },
            { phase: 'map-bootstrap', event: 'end', view: 'dashboard' },
            { phase: 'canvas-suspense', event: 'start', view: 'dashboard' },
            { phase: 'canvas-suspense', event: 'end', view: 'dashboard' },
        ]);
    });
    it('bounds the trace and returns a copy rather than a mutable history array', () => {
        for (let i = 0; i < 150; i++) recordAvatarLoading('avatar-mount', 'start', 'dashboard');
        const trace = getAvatarLoadingTrace();
        expect(trace).toHaveLength(100);
        expect(trace[0].timestamp).toBeGreaterThanOrEqual(0);
        trace.length = 0;
        expect(getAvatarLoadingTrace()).toHaveLength(100);
    });
});
