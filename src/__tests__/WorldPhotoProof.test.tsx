import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import WorldPhotoProof from '../worlds/WorldPhotoProof';

describe('preuve photo des mondes (8d)', () => {
    it('expose une cible tactile de 44 px minimum', () => {
        render(<WorldPhotoProof url="/uploads/proofs/proof_21_1.jpg" onSelect={vi.fn()}/>);
        const button = screen.getByRole('button', {name: 'Preuve photo'});
        expect(button).toHaveClass('min-w-14', 'min-h-14', 'p-1');
        expect(button).toHaveAttribute('data-world-photo');
        expect(screen.getByAltText('Preuve')).toHaveClass('w-11', 'h-11');
    });

    it('ouvre la photo sans propager le clic à la scène 3D', () => {
        const onSelect = vi.fn();
        const onParentClick = vi.fn();
        render(
            <div onClick={onParentClick}>
                <WorldPhotoProof url="/uploads/proofs/proof_21_1.jpg" onSelect={onSelect}/>
            </div>,
        );
        fireEvent.click(screen.getByRole('button', {name: 'Preuve photo'}));
        expect(onSelect).toHaveBeenCalledExactlyOnceWith('/uploads/proofs/proof_21_1.jpg');
        expect(onParentClick).not.toHaveBeenCalled();
    });
});
