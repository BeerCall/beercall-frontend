import { describe, it, expect } from 'vitest';
import { numericUserId, numericSquadId } from './entityIds';

describe('numericUserId', () => {
    it('accepte entier positif, chaîne de chiffres et u_<chiffres>', () => {
        expect(numericUserId(12)).toBe(12);
        expect(numericUserId('12')).toBe(12);
        expect(numericUserId('u_12')).toBe(12);
        expect(numericUserId(' u_12 ')).toBe(12);
    });

    it('rejette les valeurs invalides', () => {
        expect(numericUserId('')).toBeUndefined();
        expect(numericUserId('u_')).toBeUndefined();
        expect(numericUserId('u_abc')).toBeUndefined();
        expect(numericUserId('12abc')).toBeUndefined();
        expect(numericUserId('1.5')).toBeUndefined();
        expect(numericUserId('-3')).toBeUndefined();
        expect(numericUserId(-3)).toBeUndefined();
        expect(numericUserId(0)).toBeUndefined();
        expect(numericUserId(NaN)).toBeUndefined();
        expect(numericUserId(Infinity)).toBeUndefined();
        expect(numericUserId(1.2)).toBeUndefined();
        expect(numericUserId('9007199254740993')).toBeUndefined();
        expect(numericUserId(null)).toBeUndefined();
        expect(numericUserId(undefined)).toBeUndefined();
        expect(numericUserId({})).toBeUndefined();
    });
});

describe('numericSquadId', () => {
    it('accepte chiffres et sq_<chiffres>', () => {
        expect(numericSquadId('7')).toBe(7);
        expect(numericSquadId('sq_7')).toBe(7);
        expect(numericSquadId(7)).toBe(7);
    });

    it("ne confond pas le préfixe u_ avec sq_", () => {
        expect(numericSquadId('u_7')).toBeUndefined();
        expect(numericUserId('sq_7')).toBeUndefined();
    });

    it('rejette sq_ sans chiffres et le vide', () => {
        expect(numericSquadId('sq_')).toBeUndefined();
        expect(numericSquadId('sq_x')).toBeUndefined();
        expect(numericSquadId('')).toBeUndefined();
    });
});
