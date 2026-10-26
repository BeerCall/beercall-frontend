import {describe, expect, it, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import ChatPage from '../pages/ChatPage';

const sendMessage = vi.fn();

vi.mock('react-router-dom', async () => ({
  ...await vi.importActual<typeof import('react-router-dom')>('react-router-dom'),
  useParams: () => ({id: '1'}),
  useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useSquadWebSocket', () => ({useSquadWebSocket: () => undefined}));
vi.mock('../hooks/useSquadDetails', () => ({
  useSquadDetails: () => ({data: {id: '1', name: 'Une squad au nom très long pour tester le débordement', active_beer_call: [], past_beer_calls: []}}),
}));
vi.mock('../hooks/useProfile', () => ({
  useProfile: () => ({data: {id: '42', username: 'Moi', avatar: {head: 'head_base', body: 'body', legs: 'legs', feet: 'feet', accessory: 'none', gender: 'Men'}}}),
}));
vi.mock('../hooks/useChat', () => ({
  useChat: () => ({
    messages: [{id: 'm1', userId: '42', username: 'Moi', text: 'Bonjour', timestamp: Date.now()}],
    sendMessage,
    loading: false,
    error: null,
  }),
}));
vi.mock('../hooks/useChatViewport', () => ({
  useChatViewport: () => ({top: 0, left: 0, width: 320, height: 480, scale: 1}),
}));
vi.mock('framer-motion', async () => ({
  ...await vi.importActual<typeof import('framer-motion')>('framer-motion'),
  useInView: () => true,
}));

describe('ChatPage - compositeur iOS (T27)', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    sendMessage.mockResolvedValue(true);
  });

  it('garde le champ à 16 px et un bouton Envoyer complet nommé', () => {
    render(<ChatPage />);

    const field = screen.getByPlaceholderText('Écris un message...');
    expect(field.className).toContain('text-base');
    expect(field.className).not.toContain('text-sm');
    expect(field.className).toContain('min-w-0');

    const send = screen.getByRole('button', {name: 'Envoyer'});
    expect(send.className).toContain('shrink-0');
    expect(send.className).toContain('w-11');
    expect(send.className).toContain('h-11');
    expect(screen.getByRole('button', {name: 'Retour'})).toBeInTheDocument();
  });

  it('la surface chat ne dépend plus de h-screen', () => {
    const {container} = render(<ChatPage />);
    const surface = container.firstElementChild as HTMLElement;
    expect(surface.className).toContain('absolute');
    expect(surface.className).not.toContain('h-screen');
    expect(surface.style.height).toBe('480px');
  });

  it('Enter envoie une fois, Shift+Enter ajoute une ligne, IME ne déclenche rien', async () => {
    render(<ChatPage />);
    const field = screen.getByPlaceholderText('Écris un message...') as HTMLTextAreaElement;

    fireEvent.change(field, {target: {value: 'Salut'}});
    fireEvent.keyDown(field, {key: 'Enter', isComposing: true});
    expect(sendMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(field, {key: 'Enter', shiftKey: true});
    expect(sendMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(field, {key: 'Enter'});
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage.mock.calls[0][0]).toMatchObject({text: 'Salut'});
  });

  it('conserve le brouillon quand l envoi échoue', async () => {
    sendMessage.mockResolvedValue(false);
    render(<ChatPage />);
    const field = screen.getByPlaceholderText('Écris un message...') as HTMLTextAreaElement;

    fireEvent.change(field, {target: {value: 'à retenter'}});
    fireEvent.click(screen.getByRole('button', {name: 'Envoyer'}));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(field.value).toBe('à retenter');
  });
});
