import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import PersistentDashboard from '../components/PersistentDashboard';
import { useDashboardActive } from '../lib/dashboardActivity';
import { useUserStore } from '../store/useUserStore';

const lifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
vi.mock('../pages/Dashboard', () => ({ default: function FakeDashboard() {
    const active = useDashboardActive();
    const { id } = useParams();
    const navigate = useNavigate();
    const [value, setValue] = useState('position conservée');
    useEffect(() => { lifecycle.mounts++; return () => { lifecycle.unmounts++; }; }, []);
    return <div>
        <p>Squad {id ?? 'aucune'} / {active ? 'active' : 'pause'}</p>
        <input aria-label="état de la scène" value={value} onChange={event => setValue(event.target.value)}/>
        <button onClick={() => navigate('/profile')}>Profil test</button>
        <button onClick={() => navigate('/squad/2')}>Squad suivante</button>
    </div>;
} }));

function Profile() {
    const navigate = useNavigate();
    return <><h1>Profil test</h1><button onClick={() => navigate(-1)}>Retour test</button></>;
}
function Harness({ initial = '/squad/1' }: { initial?: string }) {
    return <MemoryRouter initialEntries={[initial]}>
        <PersistentDashboard/>
        <Routes><Route path="/profile" element={<Profile/>}/><Route path="*" element={null}/></Routes>
    </MemoryRouter>;
}
beforeEach(() => { lifecycle.mounts = 0; lifecycle.unmounts = 0; useUserStore.setState({ isAuthenticated: true, username: 'test-a' }); });
afterEach(() => { useUserStore.setState({ isAuthenticated: false, username: null }); });

describe('single retained dashboard', () => {
    it('retains the same DOM/state across profile returns and hides it from input/accessibility', async () => {
        render(<Harness/>);
        const input = await screen.findByLabelText('état de la scène');
        fireEvent.change(input, { target: { value: 'zoom 16' } });
        fireEvent.click(screen.getByRole('button', { name: 'Profil test' }));
        expect(await screen.findByRole('heading', { name: 'Profil test' })).toBeVisible();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        const retained = screen.getByTestId('retained-dashboard');
        expect(retained).toHaveAttribute('hidden');
        expect(retained).toHaveAttribute('inert');
        expect(retained).toHaveAttribute('aria-hidden', 'true');
        expect(retained).toHaveTextContent('Squad 1 / pause');
        fireEvent.click(screen.getByRole('button', { name: 'Retour test' }));
        expect(await screen.findByRole('textbox')).toBe(input);
        expect(input).toHaveValue('zoom 16');
        expect(lifecycle.mounts).toBe(1);
        expect(lifecycle.unmounts).toBe(0);
    });
    it('updates squad params without accumulating another retained scene', async () => {
        render(<Harness/>);
        fireEvent.click(await screen.findByRole('button', { name: 'Squad suivante' }));
        expect(await screen.findByText('Squad 2 / active')).toBeVisible();
        expect(screen.getAllByTestId('retained-dashboard')).toHaveLength(1);
        expect(lifecycle.mounts).toBe(1);
    });
    it('does not initialize a map when opening profile directly', async () => {
        render(<Harness initial="/profile"/>);
        expect(await screen.findByRole('heading', { name: 'Profil test' })).toBeVisible();
        expect(screen.queryByTestId('retained-dashboard')).not.toBeInTheDocument();
        expect(lifecycle.mounts).toBe(0);
    });
    it('destroys all retained state on logout and on account change', async () => {
        render(<Harness/>);
        const input = await screen.findByRole('textbox');
        act(() => useUserStore.setState({ username: 'test-b' }));
        expect(await screen.findByRole('textbox')).not.toBe(input);
        expect(lifecycle.unmounts).toBe(1);
        act(() => useUserStore.setState({ isAuthenticated: false, username: null }));
        expect(screen.queryByTestId('retained-dashboard')).not.toBeInTheDocument();
        expect(lifecycle.unmounts).toBe(2);
    });
});
