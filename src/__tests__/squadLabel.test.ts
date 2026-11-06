import { describe, it, expect } from 'vitest';
import { SQUAD_LABEL_MAX, squadLabel, formatSquadLabel } from '../lib/squadLabel';

describe('libellé des squads (8b)', () => {
    it('renvoie une chaîne vide pour une entrée vide', () => {
        expect(squadLabel('')).toBe('');
        expect(squadLabel('   ')).toBe('');
        expect(squadLabel('\t\n  \r')).toBe('');
        expect(squadLabel(null)).toBe('');
        expect(squadLabel(undefined)).toBe('');
        expect(formatSquadLabel('')).toBe('');
    });

    it('met un mot unique en majuscules', () => {
        expect(squadLabel('Potes')).toBe('POTES');
        expect(squadLabel('beercall')).toBe('BEERCALL');
        expect(squadLabel('  Potes  ')).toBe('POTES');
        expect(squadLabel('Élite')).toBe('ÉLITE');
    });

    it('prend les initiales en majuscules pour plusieurs mots', () => {
        expect(squadLabel('Les Gros Buveurs')).toBe('LGB');
        expect(squadLabel('Squad de la Plage')).toBe('SDLP');
        expect(squadLabel("Buveurs d'Élite")).toBe('BDÉ');
        expect(squadLabel('Équipe du Jeudi')).toBe('ÉDJ');
    });

    it('traite les tirets et apostrophes comme séparateurs de mots', () => {
        expect(squadLabel('Team Après-Midi')).toBe('TAM');
        expect(squadLabel('Jean-Pierre')).toBe('JP');
        expect(squadLabel("L'Équipe du bar")).toBe('LÉDB');
        expect(squadLabel('Coup-de-vent matinal')).toBe('CDVM');
    });

    it('gère les espaces multiples ou irréguliers', () => {
        expect(squadLabel('  Les    Gros    Buveurs   ')).toBe('LGB');
        expect(squadLabel('Alpha\t\tBeta\nGamma')).toBe('ABG');
    });

    it('coupe à 8 caractères sans points de suspension', () => {
        expect(SQUAD_LABEL_MAX).toBe(8);
        expect(squadLabel('Montagnards')).toBe('MONTAGNA');
        expect(squadLabel('Montagnards')).not.toContain('…');
        expect(squadLabel('Montagnards')).not.toContain('...');
        expect(squadLabel('Montagnards', 11)).toBe('MONTAGNARDS');
        expect(squadLabel('Un Deux Trois Quatre Cinq Six', 5)).toBe('UDTQC');
        expect(squadLabel('Potes', 3)).toBe('POT');
        expect(squadLabel('Potes', 0)).toBe('');
    });

    it('conserve les accents et les points de code Unicode', () => {
        expect(squadLabel('Élite')).toBe('ÉLITE');
        expect(squadLabel('🎉 Golden Team')).toBe('🎉GT');
        expect(squadLabel('Équipe 🍻 du bar')).toBe('É🍻DB');
    });
});
