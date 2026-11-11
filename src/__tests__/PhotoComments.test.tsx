import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import PhotoModal from '../components/Modals/PhotoModal';
import {api} from '../lib/api';

vi.mock('../lib/api', () => ({api: {get: vi.fn(), post: vi.fn(), delete: vi.fn()}}));

describe('Photo comments isolation and errors', () => {
    let client: QueryClient;
    beforeEach(() => {
        vi.clearAllMocks();
        client = new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}});
        vi.mocked(api.get).mockResolvedValue({data: []});
    });
    afterEach(() => {
        client.clear();
        vi.restoreAllMocks();
    });

    function modal(index: number) {
        return <QueryClientProvider client={client}>
            <PhotoModal imageUrls={['one.jpg', 'two.jpg']}
                photoItems={[{url: 'one.jpg', ownerId: 'u_1'}, {url: 'two.jpg', ownerId: 'u_2'}]}
                squadId="2" beerCallId="bc_3" currentIndex={index} onClose={vi.fn()} onIndexChange={vi.fn()}/>
        </QueryClientProvider>;
    }

    it('does not carry a draft to another photo', async () => {
        const {rerender} = render(modal(0));
        fireEvent.change(screen.getByLabelText('Ajouter un commentaire'), {target: {value: 'Pour la première photo'}});
        rerender(modal(1));
        expect(screen.getByLabelText('Ajouter un commentaire')).toHaveValue('');
        expect(screen.getByRole('button', {name: 'Envoyer le commentaire'})).toBeDisabled();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('keeps the draft when creation fails and shows feedback', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.mocked(api.post).mockRejectedValue(new Error('offline'));
        render(modal(0));
        fireEvent.change(screen.getByLabelText('Ajouter un commentaire'), {target: {value: 'À réessayer'}});
        fireEvent.click(screen.getByRole('button', {name: 'Envoyer le commentaire'}));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Impossible d'enregistrer"));
        expect(screen.getByLabelText('Ajouter un commentaire')).toHaveValue('À réessayer');
    });

    it('handles a rejected deletion without an unhandled promise', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.mocked(api.get).mockResolvedValue({data: [{id: 8, author_id: 1, author_username: 'Auteur',
            content: 'À conserver', can_delete: true, created_at: '2026-11-10T00:00:00Z'}]});
        vi.mocked(api.delete).mockRejectedValue(new Error('forbidden'));
        render(modal(0));
        fireEvent.click(await screen.findByRole('button', {name: 'Supprimer le commentaire'}));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Impossible de supprimer'));
        expect(screen.getByText('À conserver')).toBeInTheDocument();
    });
});
