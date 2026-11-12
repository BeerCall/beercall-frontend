import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

/**
 * 8h-4b-0 — Filet racine : une erreur de rendu ne laisse plus un écran blanc.
 * Le bouton recharge le document pour repartir sur les chunks courants.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('[ErrorBoundary] erreur fatale interceptée', error, errorInfo);
    }

    override render(): ReactNode {
        if (!this.state.error) return this.props.children;

        const message = this.state.error.message || 'Erreur inconnue';

        return (
            <div role="alert"
                 data-testid="root-error-boundary"
                 className="min-h-screen w-full bg-[#0F081C] text-white flex items-center justify-center p-6 font-sans">
                <div className="w-full max-w-md text-center">
                    <h1 className="text-2xl font-black uppercase italic tracking-tight">
                        L'application a rencontré une erreur
                    </h1>
                    <p className="mt-3 text-sm leading-relaxed text-white/80">
                        Une partie de l'application n'a pas pu s'afficher. Recharge la page pour repartir
                        sur une version cohérente.
                    </p>
                    <p data-testid="root-error-detail"
                       className="mt-4 break-words text-xs leading-relaxed text-white/60">
                        {message}
                    </p>
                    <button type="button"
                            data-testid="root-error-reload"
                            onClick={() => window.location.reload()}
                            className="mt-6 min-h-11 rounded-full bg-amber-400 px-6 py-3 text-base font-black text-[#0F081C] active:scale-95 transition-transform">
                        Recharger
                    </button>
                </div>
            </div>
        );
    }
}
