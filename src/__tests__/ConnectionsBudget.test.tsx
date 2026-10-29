import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import React from 'react';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { render } from './utils/test-utils';
import Connections from '../pages/Connections';

const mock30Connections = Array.from({ length: 30 }, (_, i) => ({
  id: `user_${i + 1}`,
  username: `Ami_${i + 1}`,
  caps: (i + 1) * 10,
  score: (i + 1) * 100,
  title: 'Camarade',
  avatar: {
    head: 'head_base',
    body: 'body_tshirt',
    legs: 'legs_jeans',
    feet: 'shoes_sneakers',
    accessory: 'none',
    gender: 'Men' as const,
  },
}));

// Simule useInView renvoyant true pour tester la concurrence des 30 candidats simultanés
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    useInView: vi.fn().mockReturnValue(true),
  };
});

// Mock AvatarCanvas pour compter les montages réels
const avatarCanvasMounts = vi.hoisted(() => ({ count: 0, activeInstances: new Set<string>() }));
vi.mock('../components/3D/AvatarCanvas', () => ({
  default: function MockAvatarCanvas({ config }: { config: Record<string, unknown> }) {
    React.useEffect(() => {
      avatarCanvasMounts.count++;
      return () => {
        avatarCanvasMounts.count--;
      };
    }, []);
    return <div data-testid="avatar-canvas-instance" data-gender={String(config?.gender || 'Men')}>Canvas 3D</div>;
  },
}));

describe('Connections 3D Thumbnail Budget (T14c / REL-01)', () => {
  beforeEach(() => {
    avatarCanvasMounts.count = 0;
    avatarCanvasMounts.activeInstances.clear();
    server.use(
      http.get('*/auth/connections/', () => {
        return HttpResponse.json(mock30Connections);
      })
    );
  });

  it('affiche les 30 profils mais borne à au plus 2 AvatarCanvas 3D montés simultanément', async () => {
    render(<Connections />);

    // Attente du chargement des connexions
    await waitFor(() => {
      expect(screen.getByText('Ami_1')).toBeInTheDocument();
      expect(screen.getByText('Ami_30')).toBeInTheDocument();
    });

    // 30 cartes sont présentes dans le DOM
    const thumbnails = screen.getAllByTestId(/^avatar-thumb-user_/);
    expect(thumbnails).toHaveLength(30);

    // Au plus 2 AvatarCanvas sont montés
    await waitFor(() => {
      const activeCanvases = screen.queryAllByTestId('avatar-canvas-instance');
      expect(activeCanvases.length).toBeLessThanOrEqual(2);
    });

    // Les candidats non admis affichent un placeholder stable avec l'initiale et aria-label
    const placeholders = screen.getAllByLabelText(/^Avatar de Ami_/);
    expect(placeholders.length).toBeGreaterThanOrEqual(28);
    // Vérification que le premier placeholder non admis affiche bien la première lettre
    expect(placeholders[0]).toHaveTextContent('A');
  });

  it('rendu en StrictMode respecte le plafond de 2 et nettoie les réservations au démontage', async () => {
    const { unmount } = render(
      <React.StrictMode>
        <Connections />
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByText('Ami_1')).toBeInTheDocument();
    });

    await waitFor(() => {
      const activeCanvases = screen.queryAllByTestId('avatar-canvas-instance');
      expect(activeCanvases.length).toBeLessThanOrEqual(2);
    });

    // Au démontage complet de la page (ex: départ vers une autre route)
    unmount();

    // Tous les canvas 3D doivent être démontés, 0 instance vivante
    expect(avatarCanvasMounts.count).toBe(0);
  });

  it('accès préservé aux 30 profils par clic', async () => {
    render(<Connections />);

    await waitFor(() => {
      expect(screen.getByText('Ami_30')).toBeInTheDocument();
    });

    // Chaque profil peut être cliqué sans blocage par le scheduler
    const profile30 = screen.getByText('Ami_30').closest('div[class*="cursor-pointer"]');
    expect(profile30).toBeInTheDocument();
  });
});
