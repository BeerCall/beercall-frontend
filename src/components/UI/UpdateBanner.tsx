import {RefreshCw, X} from 'lucide-react';
import {useServiceWorkerUpdate} from '../../hooks/useServiceWorkerUpdate';

export default function UpdateBanner() {
    const {updateAvailable, isApplying, error, applyUpdate, dismiss} = useServiceWorkerUpdate();

    if (!updateAvailable) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed left-3 right-3 z-[300] flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-gray-950/95 px-3 py-2.5 text-white shadow-2xl backdrop-blur-md"
            style={{bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)'}}
        >
            <RefreshCw size={18} className="shrink-0 text-amber-400"/>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-wide">Nouvelle version disponible</p>
                <p className="text-[11px] text-gray-400">Recharge pour profiter des dernières corrections.</p>
                {error && <p role="alert" className="text-[11px] text-red-300">{error}</p>}
            </div>
            <button
                type="button"
                onClick={applyUpdate}
                disabled={isApplying}
                className="shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-[11px] font-black uppercase active:bg-amber-700 disabled:opacity-50"
            >
                {isApplying ? 'Mise à jour…' : 'Mettre à jour'}
            </button>
            <button
                type="button"
                aria-label="Ignorer la mise à jour"
                onClick={dismiss}
                disabled={isApplying}
                className="shrink-0 rounded-lg p-1 text-gray-400 active:bg-white/10"
            >
                <X size={16}/>
            </button>
        </div>
    );
}
