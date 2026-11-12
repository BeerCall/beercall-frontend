import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CHUNK_RELOAD_KEY,
    FATAL_ERROR_ID,
    canAutoReload,
    isChunkLoadError,
    recoverFromChunkError,
    resetChunkRecoveryForTests,
    showFatalError,
} from '../lib/chunkRecovery';

describe('récupération des chunks perdus', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        resetChunkRecoveryForTests();
        window.sessionStorage.clear();
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        resetChunkRecoveryForTests();
        errorSpy.mockRestore();
        warnSpy.mockRestore();
    });

    it('reconnaît les erreurs de chargement de chunk, pas les autres', () => {
        expect(isChunkLoadError(new TypeError(
            'Failed to fetch dynamically imported module: https://example.test/assets/Login-abc.js',
        ))).toBe(true);
        expect(isChunkLoadError(new Error('Loading chunk 42 failed'))).toBe(true);
        expect(isChunkLoadError(Object.assign(new Error('nope'), {name: 'ChunkLoadError'}))).toBe(true);
        expect(isChunkLoadError(new Error('boom métier'))).toBe(false);
    });

    it('ne recharge qu’une fois par session de navigation', () => {
        const reload = vi.fn();

        expect(canAutoReload()).toBe(true);
        expect(recoverFromChunkError(
            new TypeError('Failed to fetch dynamically imported module: /assets/Login-abc.js'),
            'test',
            {reload},
        )).toBe('reload');
        expect(reload).toHaveBeenCalledTimes(1);
        expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
        expect(canAutoReload()).toBe(false);
        expect(errorSpy).toHaveBeenCalled();
    });

    it('affiche le message visible quand le rechargement a déjà été tenté', () => {
        const reload = vi.fn();
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');

        expect(recoverFromChunkError(
            new TypeError('Failed to fetch dynamically imported module: /assets/Login-abc.js'),
            'test',
            {reload},
        )).toBe('fatal');
        expect(reload).not.toHaveBeenCalled();

        const fallback = document.getElementById(FATAL_ERROR_ID);
        expect(fallback).not.toBeNull();
        expect(fallback).toHaveAttribute('role', 'alert');
        expect(fallback).toHaveTextContent(/L'application n'a pas pu se charger/i);
        expect(fallback).toHaveTextContent(/Recharger/i);
    });

    it('refuse le rechargement automatique si le stockage de session est indisponible', () => {
        const reload = vi.fn();
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('stockage refusé');
        });
        try {
            expect(canAutoReload()).toBe(false);
            expect(recoverFromChunkError(
                new TypeError('Failed to fetch dynamically imported module: /assets/Login-abc.js'),
                'test',
                {reload},
            )).toBe('fatal');
            expect(reload).not.toHaveBeenCalled();
            expect(document.getElementById(FATAL_ERROR_ID)).not.toBeNull();
            expect(warnSpy).toHaveBeenCalled();
        } finally {
            getItem.mockRestore();
        }
    });

    it('refuse le rechargement si la tentative ne peut pas être mémorisée', () => {
        const reload = vi.fn();
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota dépassé');
        });
        try {
            expect(recoverFromChunkError(
                new TypeError('Failed to fetch dynamically imported module: /assets/Login-abc.js'),
                'test',
                {reload},
            )).toBe('fatal');
            expect(reload).not.toHaveBeenCalled();
            expect(document.getElementById(FATAL_ERROR_ID)).not.toBeNull();
        } finally {
            setItem.mockRestore();
        }
    });

    it('injecte un message autonome même sans React', () => {
        showFatalError(new Error('détail technique'));

        const fallback = document.getElementById(FATAL_ERROR_ID);
        expect(fallback).not.toBeNull();
        expect(fallback).toHaveAttribute('data-testid', 'fatal-error');
        expect(fallback).toHaveTextContent('détail technique');
        expect(fallback?.querySelector('[data-testid="fatal-reload"]')).toHaveTextContent('Recharger');
    });
});
