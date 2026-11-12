import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';

function Boom(): never {
    throw new Error('boom de test');
}

describe('ErrorBoundary racine', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        errorSpy.mockRestore();
    });

    it('affiche un message visible et un bouton Recharger au lieu d’un écran blanc', () => {
        render(
            <ErrorBoundary>
                <Boom/>
            </ErrorBoundary>,
        );

        expect(screen.getByTestId('root-error-boundary')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/L'application a rencontré une erreur/i)).toBeInTheDocument();
        expect(screen.getByTestId('root-error-detail')).toHaveTextContent('boom de test');
        expect(screen.getByTestId('root-error-reload')).toHaveTextContent('Recharger');
        expect(errorSpy).toHaveBeenCalledWith(
            '[ErrorBoundary] erreur fatale interceptée',
            expect.any(Error),
            expect.anything(),
        );
    });
});
