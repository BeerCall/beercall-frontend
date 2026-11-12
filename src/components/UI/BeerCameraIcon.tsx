interface BeerCameraIconProps {
    size?: number;
    className?: string;
}

/**
 * Icône unique du bouton d'apéro : une chope de bière dont le corps porte
 * l'objectif d'un appareil photo. Évite l'empilement de deux icônes distinctes.
 */
export default function BeerCameraIcon({size = 40, className}: BeerCameraIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={className}
        >
            <path d="M9 14h25v27a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z"/>
            <path d="M34 21h4a6 6 0 0 1 0 12h-4"/>
            <path d="M9 14c2.2-4 6.2-4.6 9-1.6 2.6-4.2 8-3.6 9.6.4 3.2-2 6.4-.4 6.4 1.2"/>
            <circle cx="21.5" cy="29" r="7.5"/>
            <circle cx="21.5" cy="29" r="3" fill="currentColor" stroke="none"/>
            <circle cx="30.5" cy="18.5" r="1.4" fill="currentColor" stroke="none"/>
        </svg>
    );
}
