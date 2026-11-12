import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import WorldNameLabel, { WorldIdentityStack, nameForWorld } from '../worlds/WorldNameLabel';

describe('pseudos des mondes Bar et Dodo (8h)', () => {
    it('n’affiche un pseudo autonome qu’au Bar et au Dodo', () => {
        expect(nameForWorld('bar', {username: 'FluiditeUser_10'})).toBe('FluiditeUser_10');
        expect(nameForWorld('dodo', {username: ' FluiditeUser_11 '})).toBe('FluiditeUser_11');
        expect(nameForWorld('piscine', {username: 'FluiditeUser_12'})).toBeNull();
        expect(nameForWorld('bar', {username: '   '})).toBeNull();
        expect(nameForWorld('bar', {username: null})).toBeNull();
    });

    it('affiche la pastille orange non interactive', () => {
        render(<WorldNameLabel username="FluiditeUser_10"/>);
        const name = document.querySelector('[data-world-name]') as HTMLElement;
        expect(name).toBeInTheDocument();
        expect(name).toHaveClass('pointer-events-none', 'bg-amber-500', 'text-white', 'rounded-full');
        expect(name).toHaveTextContent('FluiditeUser_10');
        expect(name).toHaveClass('uppercase');
    });

    it('place la photo au-dessus du pseudo au Bar, sans les mélanger', () => {
        const onSelect = vi.fn();
        render(<WorldIdentityStack name="FluiditeUser_10" photoUrl="/uploads/proofs/proof_21_1.jpg"
                                   onSelectPhoto={onSelect}/>);
        const stack = document.querySelector('[data-world-identity]') as HTMLElement;
        expect(stack).toHaveClass('flex', 'flex-col', 'items-center');
        const photo = stack.children[0] as HTMLElement;
        const name = stack.children[1] as HTMLElement;
        expect(photo).toHaveAttribute('data-world-photo');
        expect(photo).toHaveClass('min-w-14', 'min-h-14', 'pointer-events-auto');
        expect(name).toHaveAttribute('data-world-name');
        expect(photo.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('affiche le pseudo seul au Dodo', () => {
        render(<WorldIdentityStack name="FluiditeUser_11" photoUrl={null} onSelectPhoto={undefined}/>);
        expect(screen.getByText('FluiditeUser_11')).toBeInTheDocument();
        expect(document.querySelector('[data-world-photo]')).toBeNull();
    });

    it('ne rend rien sans pseudo ni photo, au lieu d’un cadre vide', () => {
        const {container} = render(<WorldIdentityStack name={null}/>);
        expect(container.querySelector('[data-world-identity]')).toBeNull();
    });
});
