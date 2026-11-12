import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Navbar from '../components/UI/Navbar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

vi.mock('../hooks/useSquads', () => ({
  useSquads: () => ({ data: [], isLoading: false }),
}));


describe('MobileShell - Confinement du scroll et barre basse (UX-03)', () => {
  it('définit le confinement de scroll racine dans index.css sans débordement safe-area', () => {
    const cssPath = path.resolve(__dirname, '../index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // 1. Suppression du calc(100% + safe-area-inset-top)
    expect(cssContent).not.toContain('calc(100% + env(safe-area-inset-top))');
    expect(cssContent).not.toContain('safe-area-inset-top');

    // 2. html, body avec width/height 100%, overflow: hidden et overscroll-behavior: none
    expect(cssContent).toMatch(/html,\s*body\s*\{[^}]*width:\s*100%/);
    expect(cssContent).toMatch(/html,\s*body\s*\{[^}]*height:\s*100%/);
    expect(cssContent).toMatch(/html,\s*body\s*\{[^}]*overflow:\s*hidden/);
    expect(cssContent).toMatch(/html,\s*body\s*\{[^}]*overscroll-behavior:\s*none/);

    // 3. body margin: 0
    expect(cssContent).toMatch(/body\s*\{[^}]*margin:\s*0/);

    // 4. #root position: relative, width: 100%, height: 100vh puis 100dvh, min-height: 0, overflow: hidden
    expect(cssContent).toMatch(/#root\s*\{[^}]*position:\s*relative/);
    expect(cssContent).toMatch(/#root\s*\{[^}]*width:\s*100%/);
    expect(cssContent).toMatch(/#root\s*\{[^}]*min-height:\s*0/);
    expect(cssContent).toMatch(/#root\s*\{[^}]*height:\s*100vh/);
    expect(cssContent).toMatch(/#root\s*\{[^}]*height:\s*100dvh/);
    expect(cssContent).toMatch(/#root\s*\{[^}]*overflow:\s*hidden/);
  });

  it('place data-bottom-nav, touch-none et overscroll-none uniquement sur la barre blanche', () => {
    const onCreate = vi.fn();
    const onJoin = vi.fn();

    const { container } = render(
      <MemoryRouter>
        <Navbar onCreateClick={onCreate} onJoinClick={onJoin} />
      </MemoryRouter>
    );

    // 1. Le wrapper parent externe contenant la roue/carte n'a pas les attributs de blocage
    const outerWrapper = container.firstElementChild as HTMLElement;
    expect(outerWrapper).not.toHaveAttribute('data-bottom-nav');
    expect(outerWrapper.className).not.toContain('touch-none');
    expect(outerWrapper.className).not.toContain('overscroll-none');

    // 2. Seule la barre blanche possède data-bottom-nav
    const bottomNavElements = container.querySelectorAll('[data-bottom-nav]');
    expect(bottomNavElements).toHaveLength(1);

    const bottomNav = bottomNavElements[0] as HTMLElement;
    expect(bottomNav.tagName).toBe('DIV');
    expect(bottomNav.className).toContain('bg-white');
    expect(bottomNav.className).toContain('touch-none');
    expect(bottomNav.className).toContain('overscroll-none');
    expect(bottomNav.className).toContain('pointer-events-auto');
    // T26 : bande basse compacte 64 px sans bande blanche excédentaire sous les boutons.
    expect(bottomNav.className).toContain('h-[64px]');
    expect(bottomNav.className).toContain('pt-1');
    expect(bottomNav.className).toContain('pb-1');
    expect(bottomNav.className).not.toContain('h-[calc(80px_');
    expect(bottomNav.className).not.toContain('pt-4');
    expect(bottomNav.className).not.toContain('pb-[calc(16px_');

    const launch = container.querySelector('[aria-label="Lancer l\'apéro"]') as HTMLElement;
    expect(launch.className).toContain('w-20');
    expect(launch.className).toContain('h-20');
    expect(launch.className).toContain('-translate-y-6');
    expect(launch.className).toContain('border-4');
    expect(launch.className).toContain('shadow-xl');
    expect(launch.className).toContain('bg-beer');
    expect(launch.className).not.toContain('w-14');
    expect(launch.className).not.toContain('shadow-md');
    expect(launch.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('[aria-label="Profil"]')).toBeInTheDocument();
  });

  it('préserve l’interactivité des boutons de navigation et les gestes internes', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    const onLaunch = vi.fn();

    render(
      <MemoryRouter>
        <Navbar onCreateClick={onCreate} onJoinClick={onJoin} onLaunchApero={onLaunch} />
      </MemoryRouter>
    );

    const connectionsBtn = screen.getByRole('button', { name: /Connexions/i });
    const profileBtn = screen.getByRole('button', { name: /Profil/i });
    const launchBtn = screen.getByRole('button', { name: /Lancer l'apéro/i });

    expect(connectionsBtn).toBeInTheDocument();
    expect(profileBtn).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign Out/i })).not.toBeInTheDocument();

    await user.click(launchBtn);
    expect(onLaunch).toHaveBeenCalledTimes(1);
    expect(onLaunch.mock.calls[0]).toEqual([]);
  });

  it('le bouton central est désactivé sans squad et reste inerte hors Dashboard', async () => {
    const user = userEvent.setup();
    const onLaunch = vi.fn();

    const { rerender } = render(
      <MemoryRouter>
        <Navbar onCreateClick={vi.fn()} onJoinClick={vi.fn()} onLaunchApero={onLaunch} launchAperoDisabled />
      </MemoryRouter>
    );
    const disabled = screen.getByRole('button', { name: /lancer un apéro/i });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await user.click(disabled);
    expect(onLaunch).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <Navbar onCreateClick={vi.fn()} onJoinClick={vi.fn()} />
      </MemoryRouter>
    );
    const fallback = screen.getByRole('button', { name: /Lancer l'apéro/i });
    expect(fallback).toBeEnabled();
    await user.click(fallback);
  });
});
