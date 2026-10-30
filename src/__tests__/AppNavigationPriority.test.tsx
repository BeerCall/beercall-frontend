import React from 'react';
import {render} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import App from '../App';

const options = vi.hoisted(() => ({transitions: undefined as boolean | undefined}));
vi.mock('react-router-dom', () => ({
    BrowserRouter: ({children, unstable_useTransitions}: React.PropsWithChildren<{unstable_useTransitions?: boolean}>) => {
        options.transitions = unstable_useTransitions;
        return <>{children}</>;
    },
    Routes: () => null, Route: () => null, Navigate: () => null,
}));
vi.mock('../store/useUserStore', () => ({useUserStore: (selector: (state: {isAuthenticated: boolean; username: null}) => unknown) => selector({isAuthenticated: false, username: null})}));
vi.mock('../hooks/usePushNotifications', () => ({usePushNotifications: () => undefined}));
vi.mock('../components/PersistentDashboard', () => ({default: () => null}));
vi.mock('../components/PersistentConnections', () => ({default: () => null}));
vi.mock('../components/WorldWarmup', () => ({default: () => null}));
vi.mock('../components/AvatarWarmup', () => ({default: () => null}));
vi.mock('../components/UI/ToastContainer', () => ({default: () => null}));

it('commits navigation without a low-priority router transition while the avatar renderer is busy', () => {
    render(<App/>);
    expect(options.transitions).toBe(false);
});
