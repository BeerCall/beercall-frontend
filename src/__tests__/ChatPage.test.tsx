import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import ChatPage from '../pages/ChatPage';
import type {ChatMessage} from '../types/chat';

const sendMessage = vi.fn();
let mockMessages: ChatMessage[] = [];
let mockSquadName = 'Squad Test';

vi.mock('react-router-dom', async () => ({
  ...await vi.importActual<typeof import('react-router-dom')>('react-router-dom'),
  useParams: () => ({id: '1'}),
  useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useSquadWebSocket', () => ({useSquadWebSocket: () => undefined}));
vi.mock('../hooks/useSquadDetails', () => ({
  useSquadDetails: () => ({data: {id: '1', name: mockSquadName, active_beer_call: [], past_beer_calls: []}}),
}));
vi.mock('../hooks/useProfile', () => ({
  useProfile: () => ({data: {id: '42', username: 'Moi', avatar: {head: 'head_base', body: 'body', legs: 'legs', feet: 'feet', accessory: 'none', gender: 'Men'}}}),
}));
vi.mock('../hooks/useChat', () => ({
  useChat: () => ({
    messages: mockMessages,
    sendMessage,
    loading: false,
    error: null,
  }),
}));

vi.mock('framer-motion', async () => ({
  ...await vi.importActual<typeof import('framer-motion')>('framer-motion'),
  useInView: () => true,
}));

function setupVisualViewport(height = 480, width = 320) {
  const listeners = new Map<string, Set<() => void>>();
  const vv = {
    height,
    width,
    offsetTop: 0,
    offsetLeft: 0,
    scale: 1,
    addEventListener: (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
  };
  Object.defineProperty(window, 'visualViewport', {configurable: true, value: vv});
  return {vv, listeners};
}

describe('ChatPage - transitions viewport et composition iOS (T27/T38)', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    sendMessage.mockResolvedValue(true);
    mockMessages = [{id: 'm1', userId: '42', username: 'Moi', text: 'Bonjour', timestamp: Date.now()}];
    mockSquadName = 'Squad Test';
    setupVisualViewport(480, 320);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('garde le champ à >=16 px et un bouton Envoyer tactile (>=44px)', () => {
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

  it('la surface chat utilise la hauteur du viewport réel contrôlé sans h-screen', async () => {
    const {container} = render(<ChatPage />);
    const surface = container.firstElementChild as HTMLElement;
    expect(surface.className).toContain('absolute');
    expect(surface.className).not.toContain('h-screen');

    await waitFor(() => {
      expect(surface.style.height).toBe('480px');
    });
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

  it('gère un titre de 120 caractères et un mot long de 120 caractères sans débordement', () => {
    mockSquadName = 'A'.repeat(120);
    mockMessages = [
      {id: 'm1', userId: '42', username: 'Moi', text: 'B'.repeat(120), timestamp: Date.now()},
    ];

    const {container} = render(<ChatPage />);
    const title = screen.getByRole('heading', {level: 1});
    expect(title.className).toContain('truncate');
    expect(title.className).toContain('break-all');
    expect(title.textContent).toBe('A'.repeat(120));

    const bubbleText = container.querySelector('.whitespace-pre-wrap');
    expect(bubbleText).not.toBeNull();
    expect(bubbleText?.className).toContain('break-words');
    expect(bubbleText?.textContent).toBe('B'.repeat(120));
  });

  it('conserve le brouillon en cours lors de la réception d un nouveau message', async () => {
    const {rerender} = render(<ChatPage />);
    const field = screen.getByPlaceholderText('Écris un message...') as HTMLTextAreaElement;

    fireEvent.change(field, {target: {value: 'Mon brouillon en cours'}});
    expect(field.value).toBe('Mon brouillon en cours');

    // Réception d'un message entrant pendant la saisie
    mockMessages = [
      ...mockMessages,
      {id: 'm2', userId: '99', username: 'Autre', text: 'Nouveau message', timestamp: Date.now()},
    ];
    rerender(<ChatPage />);

    // Le brouillon tapé par l'utilisateur ne doit pas être écrasé
    expect(field.value).toBe('Mon brouillon en cours');
    expect(screen.getByText('Nouveau message')).toBeInTheDocument();
  });
});
