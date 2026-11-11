import React from 'react';
import {act, render, screen} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import App from '../App';

const options = vi.hoisted(() => ({transitions: undefined as boolean | undefined, authenticated: false, profileRoute: false, mounts: 0, bannerMounts: 0}));
vi.mock('react-router-dom', () => ({
    BrowserRouter: ({children, unstable_useTransitions}: React.PropsWithChildren<{unstable_useTransitions?: boolean}>) => {
        options.transitions = unstable_useTransitions;
        return <>{children}</>;
    },
    Routes: ({children}: React.PropsWithChildren) => options.profileRoute ? <>{children}</> : null,
    Route: ({path, element, children}: React.PropsWithChildren<{path?: string; element: React.ReactNode}>) =>
        path === undefined ? <>{children}</> : path === '/profile' ? element : null,
    Navigate: () => null,
}));
vi.mock('../store/useUserStore', () => ({useUserStore: (selector: (state: {isAuthenticated: boolean; username: null}) => unknown) => selector({isAuthenticated: options.authenticated, username: null})}));
vi.mock('../pages/Profile.tsx', () => ({default: function ProfileFixture() {
    React.useEffect(() => {options.mounts++;}, []);
    return <div data-testid="prepared-profile">Prepared profile</div>;
}}));
vi.mock('../hooks/usePushNotifications', () => ({usePushNotifications: () => undefined}));
vi.mock('../components/PersistentDashboard', () => ({default: () => null}));
vi.mock('../components/PersistentConnections', () => ({default: () => null}));
vi.mock('../components/WorldWarmup', () => ({default: () => null}));
vi.mock('../components/UI/ToastContainer', () => ({default: () => null}));
vi.mock('../components/UI/UpdateBanner', () => ({default: function BannerFixture() {
    React.useEffect(() => {options.bannerMounts++;}, []);
    return null;
}}));

it('commits navigation without a low-priority router transition while the avatar renderer is busy', () => {
    render(<App/>);
    expect(options.transitions).toBe(false);
});

it('reveals the resolved prepared profile synchronously without a lazy fallback or remount', async () => {
    options.authenticated = true;
    const view = render(<App/>);
    await act(async () => {await vi.dynamicImportSettled();});
    options.profileRoute = true;
    view.rerender(<App/>);
    expect(screen.getByTestId('prepared-profile')).toBeInTheDocument();
    expect(view.container.querySelector('.animate-spin')).toBeNull();
    expect(options.mounts).toBe(1);
    view.rerender(<App/>);
    expect(options.mounts).toBe(1);
});

it('keeps the update banner mounted when the authenticated session changes', () => {
    options.profileRoute = false;
    options.authenticated = false;
    const view = render(<App/>);
    const mounts = options.bannerMounts;
    options.authenticated = true;
    view.rerender(<App/>);
    options.authenticated = false;
    view.rerender(<App/>);
    expect(options.bannerMounts).toBe(mounts);
});
