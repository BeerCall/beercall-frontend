import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VestiairePanel from '../components/Profile/VestiairePanel';
import type { ShopItem } from '../hooks/useProfile';

const avatar = { head: 'none', body: 'none', legs: 'none', feet: 'none', accessory: 'none', animation: 'Idle' };
const catalogue: ShopItem[] = [
    { id: 'none', name: 'Sans couvre-chef', category: 'head', gender: 'Men', price: 0, is_owned: true },
    { id: 'owned', name: 'Article possédé', category: 'head', gender: 'Men', price: 0, is_owned: true },
    { id: 'unowned', name: 'Article à acheter', category: 'head', gender: 'Men', price: 10, is_owned: false },
];

function mountPanel(readonly = false) {
    const equip = vi.fn();
    const save = vi.fn();
    function Parent() {
        const [config, setConfig] = useState<Record<string, string>>({ ...avatar });
        return <VestiairePanel shopItems={catalogue} avatarConfig={config} gender="Men"
            readonly={readonly} onEquipAndSave={save}
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
});
