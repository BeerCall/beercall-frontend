interface IconProps {
    className?: string;
}

/**
 * Icônes du header de profil, reprises de la maquette validée (design
 * « repositionné ») : trophée ambre, capsule rouge/jaune et sortie de session.
 */

export function TrophyIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
            <path d="M4 22h16"/>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
            <path d="M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z"/>
        </svg>
    );
}

export function CapsuleIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 4 L19 11 C21.209 13.209 21.209 16.791 19 19 C16.791 21.209 13.209 21.209 11 19 L12 4 Z"
                  fill="#ef4444"/>
            <path d="M12 4 L11 19 C8.791 16.791 8.791 13.209 11 11 L12 4 Z" fill="#fef08a"/>
            <path d="M12 4 L19 11 C21.209 13.209 21.209 16.791 19 19 C16.791 21.209 13.209 21.209 11 19 L5 13 C2.791 10.791 2.791 7.209 5 5 C7.209 2.791 10.791 2.791 12 4 Z"
                  stroke="#b91c1c" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
    );
}

export function LogoutIcon({className = 'w-5 h-5'}: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
    );
}
