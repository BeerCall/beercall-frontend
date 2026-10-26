import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import SafeAvatar, { preloadAvatarCanvas } from '../components/3D/SafeAvatar';
import { AvatarRenderBoundary } from '../components/3D/AvatarRenderBoundary';
import type { AvatarConfig } from '../types/avatar';

const canvasState = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));

// Canvas factice : permet de prouver l'identité DOM conservée et de simuler une frame soumise.
vi.mock('../components/3D/AvatarCanvas', async () => {
  const ReactModule = await import('react');
  function MockAvatarCanvas({active, onFrameSubmitted}: {active?: boolean; onFrameSubmitted?: () => void}) {
    ReactModule.useEffect(() => {
      canvasState.mounts += 1;
      return () => {
        canvasState.unmounts += 1;
      };
    }, []);
    return (
      <div data-testid="avatar-canvas" data-active={active === false ? 'false' : 'true'}>
        <button type="button" onClick={onFrameSubmitted}>frame</button>
      </div>
    );
  }
  return {default: MockAvatarCanvas};
});

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
  beforeEach(() => {
    canvasState.mounts = 0;
    canvasState.unmounts = 0;
  });

  it('monte le conteneur SafeAvatar sans bloquer par un probe synchrone', async () => {
    render(<SafeAvatar config={dummyConfig} />);

    expect(screen.getByTestId('safe-avatar-container')).toBeInTheDocument();
  });

  it('conserve le même Canvas pendant la perte puis la restauration native, sans clôturer avant une frame', async () => {
    const { container } = render(<SafeAvatar config={dummyConfig} />);

    const safeContainer = container.querySelector('[data-testid="safe-avatar-container"]');
    expect(safeContainer).toBeInTheDocument();

    const firstCanvas = await screen.findByTestId('avatar-canvas');
    expect(canvasState.mounts).toBe(1);

    // Perte émise depuis le canvas enfant : la capture du conteneur doit la recevoir.
    await act(async () => {
      firstCanvas.dispatchEvent(new Event('webglcontextlost', {bubbles: true, cancelable: true}));
    });

    expect(screen.getByRole('status', {name: 'Contexte WebGL perdu'})).toBeInTheDocument();
    expect(screen.getByText('Affichage suspendu (WebGL)')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-canvas')).toBe(firstCanvas);
    expect(screen.getByTestId('avatar-canvas')).toHaveAttribute('data-active', 'false');
    expect(canvasState.mounts).toBe(1);

    const restoredEvent = new Event('webglcontextrestored', {bubbles: true, cancelable: true});
    let childReceived = false;
    const child = document.createElement('span');
    child.addEventListener('webglcontextrestored', () => {
      childReceived = true;
    });
    firstCanvas.appendChild(child);

    await act(async () => {
      child.dispatchEvent(restoredEvent);
    });

    // Le handler ne bloque ni preventDefault ni la propagation vers R3F.
    expect(restoredEvent.defaultPrevented).toBe(false);
    expect(childReceived).toBe(true);

    expect(screen.getByRole('status', {name: "Restauration de l'affichage"})).toBeInTheDocument();
    expect(screen.getByTestId('avatar-canvas')).toBe(firstCanvas);
    expect(screen.getByTestId('avatar-canvas')).toHaveAttribute('data-active', 'true');
    expect(canvasState.mounts).toBe(1);

    // Aucune frame soumise : le statut de restauration reste affiché.
    expect(screen.queryByRole('status', {name: 'Contexte WebGL perdu'})).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'frame'}));
    });

    expect(screen.queryByRole('status', {name: "Restauration de l'affichage"})).not.toBeInTheDocument();
    expect(canvasState.mounts).toBe(1);
  });

  it('le réessai manuel reste une action locale distincte qui remonte le Canvas', async () => {
    render(<SafeAvatar config={dummyConfig} />);
    const firstCanvas = await screen.findByTestId('avatar-canvas');

    await act(async () => {
      firstCanvas.dispatchEvent(new Event('webglcontextlost', {bubbles: true, cancelable: true}));
    });

    expect(screen.getByRole('status', {name: 'Contexte WebGL perdu'})).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: 'Réessayer'}));

    await waitFor(() => {
      expect(screen.queryByRole('status', {name: 'Contexte WebGL perdu'})).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('avatar-canvas')).not.toBe(firstCanvas);
    expect(canvasState.mounts).toBe(2);
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
