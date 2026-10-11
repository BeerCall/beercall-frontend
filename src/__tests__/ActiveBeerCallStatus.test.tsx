import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveBeerCallCard } from '../components/Dashboard/ActiveBeerCallCard';
import type { BeerCall } from '../types/api';

const base: BeerCall = { id: 'bc_test', creator_name: 'Fixture', creator_id: 1, location_name: 'Lieu test',
    longitude: 2, latitude: 48, status: 'active', participants_count: 1, has_responded: false, can_start: false };
function mount(call: BeerCall) {
    const navigate = vi.fn(), setSelectedBeerCall = vi.fn(), setIsWorldsModalOpen = vi.fn(), focusOnLocation = vi.fn();
    render(<ActiveBeerCallCard call={call} squadId="1" navigate={navigate} setSelectedBeerCall={setSelectedBeerCall}
        setIsWorldsModalOpen={setIsWorldsModalOpen} focusOnLocation={focusOnLocation} timeAgo={() => 'Maintenant'} />);
    return { navigate, setSelectedBeerCall, setIsWorldsModalOpen, focusOnLocation };
}

describe('Statut effectif de participation', () => {
    it.each([
        ['joined', true, 'REJOINT', 'bg-blue-100'],
        ['declined', true, 'ABSENT', 'bg-cyan-100'],
        [null, false, 'EN COURS', 'bg-orange-100'],
        ['unknown', true, 'RÉPONSE ENREGISTRÉE', 'bg-gray-100'],
        [undefined, true, 'RÉPONSE ENREGISTRÉE', 'bg-gray-100'],
    ] as const)('rend %s sans inventer la présence', async (status, responded, label, badge) => {
        const call = { ...base, user_status: status, has_responded: responded };
        const callbacks = mount(call);
        expect(screen.getByText(label).parentElement).toHaveClass(badge);
        if (status === 'declined') expect(screen.queryByText('REJOINT')).not.toBeInTheDocument();
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Chat', exact: true }));
        expect(callbacks.navigate).toHaveBeenCalledExactlyOnceWith('/squad/1/beer-call/bc_test/chat');
        expect(callbacks.focusOnLocation).not.toHaveBeenCalled();
        if (responded) {
            await user.click(screen.getByRole('button', { name: /Mondes/ }));
            expect(callbacks.setIsWorldsModalOpen).toHaveBeenCalledExactlyOnceWith('bc_test');
            expect(callbacks.setSelectedBeerCall).not.toHaveBeenCalled();
        } else {
            await user.click(screen.getByRole('button', { name: /Répondre/ }));
            expect(callbacks.setSelectedBeerCall).toHaveBeenCalledExactlyOnceWith(call);
            expect(callbacks.setIsWorldsModalOpen).not.toHaveBeenCalled();
        }
        expect(callbacks.focusOnLocation).not.toHaveBeenCalled();
    });
});
