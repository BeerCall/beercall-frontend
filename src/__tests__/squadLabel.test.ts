import { describe, it, expect } from 'vitest';
import { squadLabel, formatSquadLabel } from '../lib/squadLabel';

describe('Règle de libellé squadLabel (UI-02 / T03a)', () => {
    it('renvoie une chaîne vide pour entrée vide, blancs ou null/undefined', () => {
        expect(squadLabel('')).toBe('');
        expect(squadLabel('   ')).toBe('');
        expect(squadLabel('\t\n  \r')).toBe('');
        expect(squadLabel(null)).toBe('');
        expect(squadLabel(undefined)).toBe('');
        expect(formatSquadLabel('')).toBe('');
    });

    it('conserve intact un mot unique sans modification de casse ni troncature', () => {
        expect(squadLabel('BeerCall')).toBe('BeerCall');
        expect(squadLabel('Squad')).toBe('Squad');
        expect(squadLabel('supercalifragilisticexpialidocious')).toBe('supercalifragilisticexpialidocious');
        expect(squadLabel('  BeerCall  ')).toBe('BeerCall');
        expect(squadLabel('A')).toBe('A');
    });

    it('traite correctement les noms à 2 mots', () => {
        expect(squadLabel('Les Amis')).toBe('LA');
        expect(squadLabel('Night Owl')).toBe('NO');
        expect(squadLabel('Alpha Beta')).toBe('AB');
    });

    it('traite correctement les noms à 4 mots ou plus', () => {
        expect(squadLabel('Les Amis du Bar')).toBe('LADB');
        expect(squadLabel('La fine équipe bis')).toBe('LFÉB');
        expect(squadLabel('Un Deux Trois Quatre Cinq')).toBe('UDTQC');
    });

    it('gère les accents français sur les initiales', () => {
        expect(squadLabel('Équipe du jeudi')).toBe('ÉDJ');
        expect(squadLabel('À la vôtre')).toBe('ÀLV');
        expect(squadLabel('Île de France')).toBe('ÎDF');
        expect(squadLabel('été indien')).toBe('ÉI');
    });

    it('ne sépare pas les mots sur les apostrophes et tirets internes', () => {
        expect(squadLabel("L'équipe du bar")).toBe('LDB');
        expect(squadLabel('Jean-Paul et Marie-Claire')).toBe('JEM');
        expect(squadLabel("L'équipe-A du bar")).toBe('LDB');
        expect(squadLabel('Coup-de-vent matinal')).toBe('CM');
    });

    it('gère les espaces multiples ou irréguliers entre les mots', () => {
        expect(squadLabel('  Les    Amis    du    Bar   ')).toBe('LADB');
        expect(squadLabel('Alpha\t\tBeta\nGamma')).toBe('ABG');
    });

    it('gère les caractères Unicode et emojis sans corrompre les points de code', () => {
        expect(squadLabel('🍻 Squad')).toBe('🍻S');
        expect(squadLabel('🌟 Golden Team')).toBe('🌟GT');
        expect(squadLabel('Σύλλογος Φίλων')).toBe('ΣΦ');
    });
});
