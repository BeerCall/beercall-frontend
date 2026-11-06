import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import WorldExcuseBubble, { excuseForWorld } from '../worlds/WorldExcuseBubble';

const longExcuse = "J'avais promis de venir mais mon poisson rouge a besoin d'une présence constante, et en plus j'ai perdu mes chaussures.";

describe('bulle d’excuse du monde Piscine (8f)', () => {
    it('n’affiche une excuse que dans le monde Piscine et seulement si elle existe', () => {
        expect(excuseForWorld('piscine', {excuse: 'Aquaponey'})).toBe('Aquaponey');
        expect(excuseForWorld('piscine', {excuse: '  Aquaponey  '})).toBe('Aquaponey');
        expect(excuseForWorld('bar', {excuse: 'Aquaponey'})).toBeNull();
        expect(excuseForWorld('dodo', {excuse: 'Aquaponey'})).toBeNull();
        expect(excuseForWorld('piscine', {excuse: null})).toBeNull();
        expect(excuseForWorld('piscine', {excuse: '   '})).toBeNull();
    });

    it('affiche l’excuse et le pseudo, sans animation ni flou', () => {
        render(<WorldExcuseBubble excuse="Piscine municipale" username="FluiditeUser_10"/>);
        const bubble = document.querySelector('[data-world-excuse]') as HTMLElement;
        expect(bubble).toBeInTheDocument();
        expect(screen.getByText('Piscine municipale')).toBeInTheDocument();
        expect(screen.getByText('FluiditeUser_10')).toBeInTheDocument();
        expect(bubble).toHaveClass('max-w-[240px]', 'rounded-[1.15rem]', 'pointer-events-none');
        expect(bubble.className).not.toContain('animate-');
        expect(bubble.className).not.toContain('backdrop-blur');
        expect(screen.getByText('Piscine municipale')).toHaveClass('break-words', 'text-cyan-700');
    });

    it('garde une excuse longue entière, sur plusieurs lignes', () => {
        render(<WorldExcuseBubble excuse={longExcuse} username="FluiditeUser_11"/>);
        const text = screen.getByText(longExcuse);
        expect(text).toBeInTheDocument();
        expect(text).toHaveClass('break-words');
        expect(text.className).not.toContain('truncate');
        expect(text.textContent).toBe(longExcuse);
    });

    it('ne rend rien sans excuse', () => {
        const {container} = render(<WorldExcuseBubble excuse="   " username="FluiditeUser_12"/>);
        expect(container.querySelector('[data-world-excuse]')).toBeNull();
    });
});
