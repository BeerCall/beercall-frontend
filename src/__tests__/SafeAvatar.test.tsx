import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import SafeAvatar, { preloadAvatarCanvas } from '../components/3D/SafeAvatar';
import { AvatarRenderBoundary } from '../components/3D/AvatarRenderBoundary';
import type { AvatarConfig } from '../types/avatar';

const dummyConfig: AvatarConfig = {
  head: 'head_base',
  body: 'body_tshirt',
  legs: 'legs_jeans',
  feet: 'shoes_sneakers',
  accessory: 'none',
  gender: 'Men',
};

// Composant qui lance volontairement une exception de rendu
function CrashingComponent({ shouldCrash }: { shouldCrash: boolean }) {
  if (shouldCrash) {
    throw new Error('Erreur de rendu 3D simulée');
  }
  return <div data-testid="crashing-child-ok">Contenu enfant nominal</div>;
}

describe('AvatarRenderBoundary (T14d)', () => {
  beforeEach(() => {
    // Évite d'encombrer la console de test avec le console.error du boundary
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('affiche les enfants normalement quand aucune erreur ne survient', () => {
    render(
      <AvatarRenderBoundary>
        <div>Enfant sans erreur</div>
      </AvatarRenderBoundary>
    );

    expect(screen.getByText('Enfant sans erreur')).toBeInTheDocument();
  });

  it('intercepte une exception de rendu et présente une récupération locale avec réessai manuel', () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <AvatarRenderBoundary onReset={onReset}>
        <CrashingComponent shouldCrash={true} />
      </AvatarRenderBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Avatar temporairement indisponible')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: 'Réessayer' });
    expect(retryBtn).toBeInTheDocument();

    // Rerender avec le composant réparé
    rerender(
      <AvatarRenderBoundary onReset={onReset}>
        <CrashingComponent shouldCrash={false} />
      </AvatarRenderBoundary>
    );

    // Clic sur Réessayer pour déclencher le reset
    fireEvent.click(retryBtn);
    expect(onReset).toHaveBeenCalled();
    expect(screen.getByTestId('crashing-child-ok')).toBeInTheDocument();
  });

  it('supporte un fallback personnalisé sous forme de fonction recevant reset', () => {
    render(
      <AvatarRenderBoundary
        fallback={reset => (
          <div>
            <p>Mon fallback personnalisé</p>
            <button onClick={reset}>Bouton reset custom</button>
          </div>
        )}
      >
        <CrashingComponent shouldCrash={true} />
      </AvatarRenderBoundary>
    );

    expect(screen.getByText('Mon fallback personnalisé')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bouton reset custom' })).toBeInTheDocument();
  });
});

describe('SafeAvatar Component (T14d)', () => {
  it('monte le conteneur SafeAvatar sans bloquer par un probe synchrone', async () => {
    render(<SafeAvatar config={dummyConfig} />);

    expect(screen.getByTestId('safe-avatar-container')).toBeInTheDocument();
  });

  it('intercepte webglcontextlost, affiche le statut suspendu et restaure sur webglcontextrestored', async () => {
    const { container } = render(<SafeAvatar config={dummyConfig} />);

    const safeContainer = container.querySelector('[data-testid="safe-avatar-container"]');
    expect(safeContainer).toBeInTheDocument();

    // Simulation de perte de contexte WebGL
    await act(async () => {
      const lostEvent = new Event('webglcontextlost', { bubbles: true, cancelable: true });
      safeContainer?.dispatchEvent(lostEvent);
    });

    expect(screen.getByRole('status', { name: 'Contexte WebGL perdu' })).toBeInTheDocument();
    expect(screen.getByText('Affichage suspendu (WebGL)')).toBeInTheDocument();

    // Simulation de restauration du contexte WebGL
    await act(async () => {
      const restoredEvent = new Event('webglcontextrestored', { bubbles: true, cancelable: true });
      safeContainer?.dispatchEvent(restoredEvent);
    });

    expect(screen.queryByRole('status', { name: 'Contexte WebGL perdu' })).not.toBeInTheDocument();
  });

  it('nettoie les écouteurs de contexte au démontage', () => {
    const removeEventListenerSpy = vi.spyOn(HTMLDivElement.prototype, 'removeEventListener');

    const { unmount } = render(<SafeAvatar config={dummyConfig} />);
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('webglcontextlost', expect.any(Function), true);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function), true);

    removeEventListenerSpy.mockRestore();
  });

  it('expose preloadAvatarCanvas() appelable', async () => {
    const promise = preloadAvatarCanvas();
    expect(promise).toBeInstanceOf(Promise);
    const mod = await promise;
    expect(mod.default).toBeDefined();
  });
});
