import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface AvatarRenderBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((reset: () => void) => ReactNode);
  onReset?: () => void;
}

export interface AvatarRenderBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AvatarRenderBoundary extends Component<
  AvatarRenderBoundaryProps,
  AvatarRenderBoundaryState
> {
  constructor(props: AvatarRenderBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): AvatarRenderBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Trace locale sans étouffement global
    console.error('[AvatarRenderBoundary] Erreur 3D interceptée:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  override render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.resetError);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          role="alert"
          aria-label="Erreur d'affichage 3D"
          className="w-full h-full min-h-[120px] flex flex-col items-center justify-center p-4 bg-gray-50 border border-gray-200 rounded-2xl text-center select-none"
        >
          <p className="text-xs font-semibold text-gray-500 mb-2">Avatar temporairement indisponible</p>
          <button
            type="button"
            onClick={this.resetError}
            className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
          >
            Réessayer
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
