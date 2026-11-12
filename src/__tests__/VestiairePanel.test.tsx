import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VestiairePanel from '../components/Profile/VestiairePanel';
import type { ShopItem } from '../hooks/useProfile';
import type { AnimationClipEntry } from '../types/animationPack';

const avatar = { head: 'none', body: 'none', legs: 'none', feet: 'none', accessory: 'none', animation: 'Idle' };
const fakeThumbnail = (name: string, gender: 'Men' | 'Women') => ({
    url: `/animations/thumbnails/Anim_${name}_l_${gender}.webp`,
    sha256: 'b'.repeat(64),
    bytes: 1234,
    width: 192,
    height: 192,
});

const animation = (
    name: string,
    thumbnails: AnimationClipEntry['thumbnails'] = {
        Men: fakeThumbnail(name, 'Men'),
        Women: fakeThumbnail(name, 'Women'),
    },
): AnimationClipEntry => ({
    id: `Anim_${name}_l`,
    name,
    loop: name === 'Idle',
    duration: 1,
    pack: name === 'Idle' ? 'idle' : 'deferred',
    thumbnails,
    sourceSha256: 'a'.repeat(64),
});

const catalogue: ShopItem[] = [
    { id: 'none', name: 'Sans couvre-chef', category: 'head', gender: 'Men', price: 0, is_owned: true },
    { id: 'owned', name: 'Article possédé', category: 'head', gender: 'Men', price: 0, is_owned: true },
    { id: 'unowned', name: 'Article à acheter', category: 'head', gender: 'Men', price: 10, is_owned: false },
    { id: 'free-unowned', name: 'Article gratuit', category: 'head', gender: 'Men', price: 0, is_owned: false },
    { id: 'hidden', name: 'Hidden article', category: 'head', gender: 'Men', price: 0, is_owned: true, available: false },
];

function mountPanel(
    readonly = false,
    save = vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    thumbnailUrls?: Record<string, string>,
) {
    const equip = vi.fn();
    function Parent() {
        const [config, setConfig] = useState<Record<string, string>>({ ...avatar });
        return <VestiairePanel shopItems={catalogue} avatarConfig={config} gender="Men"
            readonly={readonly} onEquipAndSave={save} thumbnailUrls={thumbnailUrls}
            setAvatarConfig={(next: Record<string, string>) => { equip(next); setConfig(next); }} />;
    }
    render(<Parent />);
    return { equip, save, user: userEvent.setup() };
}

describe('Vestiaire : équipement et droits existants', () => {
    it('équipe un article possédé via le parent', async () => {
        const { equip, user } = mountPanel();
        await user.click(screen.getByText('Article possédé'));
        expect(equip).toHaveBeenCalledWith({ ...avatar, head: 'owned' });
    });

    it('affiche Gratuit pour un article à prix 0 non possédé', async () => {
        const equip = vi.fn();
        const onBuy = vi.fn();
        function Parent() {
            const [config, setConfig] = useState<Record<string, string>>({ ...avatar });
            return <VestiairePanel shopItems={catalogue} avatarConfig={config} gender="Men"
                onBuy={onBuy}
                setAvatarConfig={(next: Record<string, string>) => { equip(next); setConfig(next); }} />;
        }
        render(<Parent />);
        const user = userEvent.setup();

        const freeCard = screen.getByText('Article gratuit').closest('[role="button"]') as HTMLElement;
        const freeButton = within(freeCard).getByRole('button', { name: /Gratuit/i });
        expect(freeButton.textContent).not.toContain('ACHETER 0');

        const paidCard = screen.getByText('Article à acheter').closest('[role="button"]') as HTMLElement;
        expect(within(paidCard).getByRole('button', { name: /ACHETER 10/i })).toBeInTheDocument();

        await user.click(freeButton);
        expect(onBuy).toHaveBeenCalledWith('free-unowned', 0, 'Article gratuit');
    });

    it('sauvegarde une tenue modifiée via le callback', async () => {
        const { save, user } = mountPanel();
        await user.click(screen.getByText('Article possédé'));
        await user.click(await screen.findByRole('button', { name: /SAUVEGARDER LE STYLE/ }));
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('interdit la sauvegarde avec un article non possédé', async () => {
        const { save, user } = mountPanel();
        await user.click(screen.getByText('Article à acheter'));
        const action = await screen.findByRole('button', { name: /ACHETEZ POUR SAUVEGARDER/ });
        expect(action).toBeDisabled();
        await user.click(action);
        expect(save).not.toHaveBeenCalled();
    });

    it('ne modifie pas l’équipement en lecture seule', async () => {
        const { equip, save, user } = mountPanel(true);
        await user.click(screen.getByText('Article possédé'));
        expect(equip).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: /SAUVEGARDER/ })).not.toBeInTheDocument();
    });

    it('attend le succès asynchrone avant de confirmer la tenue', async () => {
        let finish: (success: boolean) => void = () => {};
        const deferred = new Promise<boolean>(resolve => { finish = resolve; });
        const save = vi.fn<() => Promise<boolean>>().mockReturnValue(deferred);
        const { user } = mountPanel(false, save);
        await user.click(screen.getByText('Article possédé'));
        await user.click(screen.getByRole('button', { name: /SAUVEGARDER LE STYLE/ }));
        expect(save).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: '' })).toBeDisabled();
        await act(async () => { finish(true); await deferred; });
        await waitFor(() => expect(screen.queryByRole('button', { name: /SAUVEGARDER/ })).not.toBeInTheDocument());
    });

    it('conserve la tenue et permet de réessayer après false', async () => {
        const save = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        const { equip, user } = mountPanel(false, save);
        await user.click(screen.getByText('Article possédé'));
        await user.click(screen.getByRole('button', { name: /SAUVEGARDER LE STYLE/ }));
        const button = await screen.findByRole('button', { name: /SAUVEGARDER LE STYLE/ });
        expect(button).toBeEnabled();
        expect(equip).toHaveBeenLastCalledWith({ ...avatar, head: 'owned' });
        await user.click(button);
        expect(save).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(screen.queryByRole('button', { name: /SAUVEGARDER/ })).not.toBeInTheDocument());
    });

    it('capture une rejection sans perdre l’action de sauvegarde', async () => {
        const save = vi.fn<() => Promise<boolean>>().mockRejectedValue(new Error('Panne'));
        const { equip, user } = mountPanel(false, save);
        await user.click(screen.getByText('Article possédé'));
        await user.click(screen.getByRole('button', { name: /SAUVEGARDER LE STYLE/ }));
        expect(await screen.findByRole('button', { name: /SAUVEGARDER LE STYLE/ })).toBeEnabled();
        expect(equip).toHaveBeenLastCalledWith({ ...avatar, head: 'owned' });
    });

    it('affiche une vignette fixe et lazy quand elle existe', () => {
        mountPanel(false, undefined, { owned: '/thumbs/owned.webp' });
        const card = screen.getByText('Article possédé').closest('[role="button"]');
        const image = card?.querySelector('img');
        expect(image).not.toBeNull();
        expect(image?.getAttribute('src')).toBe('/thumbs/owned.webp');
        expect(image?.getAttribute('loading')).toBe('lazy');
        expect(image?.getAttribute('width')).toBe('64');
        expect(image?.getAttribute('height')).toBe('64');
        expect(image?.className).toContain('w-16');
        expect(image?.className).toContain('h-16');
    });

    it('signale une vignette absente et garde l’icône de catégorie', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mountPanel(false, undefined, {});
        await waitFor(() => {
            expect(warn.mock.calls.some((call) => String(call[0]).includes('owned'))).toBe(true);
        });
        const card = screen.getByText('Article possédé').closest('[role="button"]');
        expect(card?.querySelector('img')).toBeNull();
        warn.mockRestore();
    });

    it('ne rend pas un article indisponible', () => {
        mountPanel();
        expect(screen.queryByText('Hidden article')).not.toBeInTheDocument();
    });

    it('relance une animation déjà équipée sans réécrire la config ni appeler /auth/equip/', async () => {
        const setAvatarConfig = vi.fn();
        const onAnimationSelected = vi.fn();
        render(
            <VestiairePanel
                shopItems={[]}
                avatarConfig={{ ...avatar, animation: 'Death' }}
                gender="Men"
                setAvatarConfig={setAvatarConfig}
                availableAnimations={[animation('Death'), animation('Idle')]}
                onAnimationSelected={onAnimationSelected}
            />,
        );
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /Anim/i }));
        await user.click(screen.getByRole('button', { name: 'Death' }));

        expect(onAnimationSelected).toHaveBeenCalledWith('Death');
        expect(setAvatarConfig).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: /SAUVEGARDER/ })).not.toBeInTheDocument();
    });

    it('équipe une nouvelle animation et demande sa relance', async () => {
        const setAvatarConfig = vi.fn();
        const onAnimationSelected = vi.fn();
        render(
            <VestiairePanel
                shopItems={[]}
                avatarConfig={{ ...avatar, animation: 'Idle' }}
                gender="Men"
                setAvatarConfig={setAvatarConfig}
                availableAnimations={[animation('Death'), animation('Idle')]}
                onAnimationSelected={onAnimationSelected}
            />,
        );
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /Anim/i }));
        await user.click(screen.getByRole('button', { name: 'Death' }));

        expect(setAvatarConfig).toHaveBeenCalledWith({ ...avatar, animation: 'Death' });
        expect(onAnimationSelected).toHaveBeenCalledWith('Death');
    });

    it('ne relance aucune animation en lecture seule', async () => {
        const setAvatarConfig = vi.fn();
        const onAnimationSelected = vi.fn();
        render(
            <VestiairePanel
                shopItems={[]}
                avatarConfig={{ ...avatar, animation: 'Death' }}
                gender="Men"
                readonly
                setAvatarConfig={setAvatarConfig}
                availableAnimations={[animation('Death'), animation('Idle')]}
                onAnimationSelected={onAnimationSelected}
            />,
        );
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /Anim/i }));
        await user.click(screen.getByRole('button', { name: 'Death' }));

        expect(setAvatarConfig).not.toHaveBeenCalled();
        expect(onAnimationSelected).not.toHaveBeenCalled();
    });

    it('affiche la vignette du genre de l’avatar à la place de l’icône ▶', async () => {
        const thumbnail = {
            url: '/animations/thumbnails/Anim_Death_o_Men.webp',
            sha256: 'b'.repeat(64),
            bytes: 1234,
            width: 192,
            height: 192,
        };
        render(
            <VestiairePanel
                shopItems={[]}
                avatarConfig={{ ...avatar, animation: 'Idle' }}
                gender="Men"
                setAvatarConfig={vi.fn()}
                availableAnimations={[
                    animation('Death', { Men: thumbnail, Women: null }),
                    animation('Idle'),
                ]}
            />,
        );
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /Anim/i }));
        const button = screen.getByRole('button', { name: 'Death' });
        const image = button.querySelector('img');
        expect(image).not.toBeNull();
        expect(image?.getAttribute('src')).toBe(thumbnail.url);
        expect(image?.getAttribute('loading')).toBe('lazy');
        expect(image?.getAttribute('width')).toBe('64');
        expect(image?.getAttribute('height')).toBe('64');
    });

    it('garde l’icône ▶ et avertit quand la vignette d’animation manque', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        render(
            <VestiairePanel
                shopItems={[]}
                avatarConfig={{ ...avatar, animation: 'Idle' }}
                gender="Men"
                setAvatarConfig={vi.fn()}
                availableAnimations={[animation('Death', { Men: null, Women: null })]}
            />,
        );
        await waitFor(() => {
            expect(warn.mock.calls.some((call) => String(call[0]).includes('Anim_Death'))).toBe(true);
        });
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /Anim/i }));
        const button = screen.getByRole('button', { name: 'Death' });
        expect(button.querySelector('img')).toBeNull();
        expect(button.querySelector('svg')).not.toBeNull();
        warn.mockRestore();
    });

    it('compare au snapshot soumis si la tenue change pendant la sauvegarde', async () => {
        let finish: (success: boolean) => void = () => {};
        const deferred = new Promise<boolean>(resolve => { finish = resolve; });
        const save = vi.fn<() => Promise<boolean>>().mockReturnValue(deferred);
        const { equip, user } = mountPanel(false, save);
        await user.click(screen.getByText('Article possédé'));
        await user.click(screen.getByRole('button', { name: /SAUVEGARDER LE STYLE/ }));
        await user.click(screen.getByText('Sans couvre-chef'));
        await act(async () => { finish(true); await deferred; });
        expect(equip).toHaveBeenLastCalledWith(avatar);
        expect(await screen.findByRole('button', { name: /SAUVEGARDER LE STYLE/ })).toBeEnabled();
        await user.click(screen.getByText('Article possédé'));
        await waitFor(() => expect(screen.queryByRole('button', { name: /SAUVEGARDER/ })).not.toBeInTheDocument());
    });
});
