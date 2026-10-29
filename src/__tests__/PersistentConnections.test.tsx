import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PersistentConnections from '../components/PersistentConnections';

const session = vi.hoisted(() => ({ authenticated: true, mounts: 0 }));
vi.mock('../store/useUserStore', () => ({
    useUserStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: session.authenticated }),
}));
vi.mock('../pages/Connections', async () => {
    const { useState } = await import('react');
    return { default: function MockConnections({ active }: { active: boolean }) {
        const [mount] = useState(() => ++session.mounts);
        return <div data-testid="connections-page" data-active={String(active)} data-mount={mount}/>;
    } };
});

function Navigation() {
    const navigate = useNavigate();
    return <><button onClick={() => navigate('/connections')}>open</button><button onClick={() => navigate('/dashboard')}>back</button></>;
}
function mount(path = '/dashboard') {
    return render(<MemoryRouter initialEntries={[path]}><Navigation/><PersistentConnections/></MemoryRouter>);
}

describe('retained Connexions preparation', () => {
    beforeEach(() => {
        session.authenticated = true;
        session.mounts = 0;
        performance.clearMarks();
    });

    it('waits for map interactivity, prepares inertly, and reveals the same page on navigation', async () => {
        mount();
        expect(screen.queryByTestId('retained-connections')).toBeNull();
        act(() => window.dispatchEvent(new CustomEvent('beercall:scene-metric', {
            detail: { kind: 'mapInteractive', view: 'dashboard' },
        })));
        const page = await screen.findByTestId('connections-page');
        const retained = screen.getByTestId('retained-connections');
        expect(retained).toHaveAttribute('inert');
        expect(retained).toHaveAttribute('aria-hidden', 'true');
        expect(page).toHaveAttribute('data-active', 'false');
        fireEvent.click(screen.getByText('open'));
        expect(retained).not.toHaveAttribute('inert');
        expect(page).toHaveAttribute('data-active', 'true');
        fireEvent.click(screen.getByText('back'));
        expect(screen.getByTestId('connections-page')).toBe(page);
        expect(page).toHaveAttribute('data-active', 'false');
        expect(session.mounts).toBe(1);
    });

    it('also retains a direct opening on /connections without waiting for a map', async () => {
        mount('/connections');
        const page = await screen.findByTestId('connections-page');
        fireEvent.click(screen.getByText('back'));
        await waitFor(() => expect(page).toHaveAttribute('data-active', 'false'));
        expect(screen.getByTestId('connections-page')).toBe(page);
        expect(session.mounts).toBe(1);
    });

    it('never prepares authenticated data for a guest', async () => {
        session.authenticated = false;
        mount('/connections');
        act(() => window.dispatchEvent(new CustomEvent('beercall:scene-metric', {
            detail: { kind: 'mapInteractive', view: 'dashboard' },
        })));
        expect(screen.queryByTestId('retained-connections')).toBeNull();
    });
});
