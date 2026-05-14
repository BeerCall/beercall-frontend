import type {ActionButton} from '../../../types/game';

interface Props {
    actions: ActionButton[];
    onAction: (actionId: string) => void;
    disabled: boolean; // Vital pour les fêtards : on coupe le bouton pendant la requête
}

// Design System : Mapping des styles du Backend vers Tailwind
const styleMap: Record<ActionButton['style'], string> = {
    primary: "bg-amber-600 text-white shadow-amber-600/20 border-amber-500 active:bg-amber-700",
    secondary: "bg-gray-800 text-gray-200 border-gray-700 active:bg-gray-900 shadow-black/50",
    danger: "bg-red-600 text-white shadow-red-600/20 border-red-500 active:bg-red-700",
    success: "bg-emerald-600 text-white shadow-emerald-600/20 border-emerald-500 active:bg-emerald-700",
};

export default function StandardButtons({actions, onAction, disabled}: Props) {
    return (
        <div className="flex flex-col gap-4 w-full">
            {actions.map((btn) => (
                <button
                    key={btn.action_id}
                    onClick={() => onAction(btn.action_id)}
                    disabled={disabled}
                    className={`
                        relative w-full min-h-[64px] rounded-2xl px-6 py-4 border-b-4
                        text-lg font-black uppercase tracking-widest leading-none
                        transition-all active:translate-y-1 active:border-b-0
                        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:active:border-b-4
                        ${styleMap[btn.style] || styleMap.secondary}
                    `}
                >
                    {btn.label}
                </button>
            ))}
        </div>
    );
}