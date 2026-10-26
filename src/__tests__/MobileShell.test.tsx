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

const mockLogout = vi.fn();
vi.mock('../store/useUserStore', () => ({
  useUserStore: (selector: (state: { logout: () => void }) => unknown) =>
    selector({ logout: mockLogout }),
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
    // T26 : bande bornée 58 px utiles + inset bas appliqué une seule fois.
    expect(bottomNav.className).toContain('h-[calc(58px_+_env(safe-area-inset-bottom))]');
    expect(bottomNav.className).toContain('pt-0');
    expect(bottomNav.className).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(bottomNav.className).not.toContain('h-[calc(80px_');
    expect(bottomNav.className).not.toContain('pt-4');
    expect(bottomNav.className).not.toContain('pb-[calc(16px_');

    const profile = container.querySelector('[aria-label="Profil"]') as HTMLElement;
    expect(profile.className).toContain('w-14');
    expect(profile.className).toContain('h-14');
    expect(profile.className).toContain('border-4');
    expect(profile.className).toContain('shadow-md');
    expect(profile.className).not.toContain('w-[70px]');
    expect(profile.className).not.toContain('shadow-2xl');
  });

  it('préserve l’interactivité des boutons de navigation et les gestes internes', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onJoin = vi.fn();

    render(
      <MemoryRouter>
        <Navbar onCreateClick={onCreate} onJoinClick={onJoin} />
      </MemoryRouter>
    );

    const connectionsBtn = screen.getByRole('button', { name: /Connexions/i });
    const profileBtn = screen.getByRole('button', { name: /Profil/i });
    const signOutBtn = screen.getByRole('button', { name: /Sign Out/i });

    expect(connectionsBtn).toBeInTheDocument();
    expect(profileBtn).toBeInTheDocument();
    expect(signOutBtn).toBeInTheDocument();

    await user.click(signOutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
