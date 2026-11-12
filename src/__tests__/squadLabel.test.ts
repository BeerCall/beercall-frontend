import { describe, it, expect } from 'vitest';
import { SQUAD_LABEL_MAX, squadLabel, squadLabels, formatSquadLabel } from '../lib/squadLabel';

describe('libellé des squads (8b / 8b-2)', () => {
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
        expect(squadLabel('beer')).toBe('BEER');
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

    it('coupe à 7 caractères sans points de suspension', () => {
        expect(SQUAD_LABEL_MAX).toBe(7);
        expect(squadLabel('Montagnards')).toBe('MONTAGN');
        expect(squadLabel('Montagnards')).not.toContain('…');
        expect(squadLabel('Montagnards')).not.toContain('...');
        expect(squadLabel('Montagnards', 11)).toBe('MONTAGNARDS');
        expect(squadLabel('Un Deux Trois Quatre Cinq Six', 5)).toBe('UDTQC');
        expect(squadLabel('Potes', 3)).toBe('POT');
        expect(squadLabel('Potes', 0)).toBe('');
    });

    it('laisse passer 7 lettres larges sans les tronquer', () => {
        expect(squadLabel('MMMMMMM')).toBe('MMMMMMM');
        expect(squadLabel('WWWWWWW')).toBe('WWWWWWW');
        expect(Array.from(squadLabel('MMMMMMM')).length).toBe(7);
    });

    it('conserve les accents et les points de code Unicode', () => {
        expect(squadLabel('Élite')).toBe('ÉLITE');
        expect(squadLabel('🎉 Golden Team')).toBe('🎉GT');
        expect(squadLabel('Équipe 🍻 du bar')).toBe('É🍻DB');
    });

    it('désambiguïse deux libellés identiques avec la fin du nom', () => {
        expect(squadLabels(['Fluidite50', 'Fluidite40'])).toEqual(['FLUID50', 'FLUID40']);
        expect(squadLabels(['Les Gros Buveurs 1', 'Les Gros Buveurs 2'])).toEqual(['LGB1', 'LGB2']);
        expect(squadLabels(['Montagnards', 'Potes'])).toEqual(['MONTAGN', 'POTES']);
        expect(squadLabels([])).toEqual([]);
    });

    it('laisse identiques deux noms strictement identiques', () => {
        expect(squadLabels(['Potes', 'Potes'])).toEqual(['POTES', 'POTES']);
        expect(squadLabels(['Fluidite50', 'Fluidite50'])).toEqual(['FLUIDIT', 'FLUIDIT']);
    });
});
