interface BigPintButtonProps {
    variant?: 'flat' | '3d' | 'outline';
}

/**
 * Bouton d'apéro fourni par la maquette 11c : une pinte dont l'objectif photo
 * est intégré au verre. Le style 3D est celui retenu pour la barre de navigation.
 */
export default function BigPintButton({variant = '3d'}: BigPintButtonProps) {
    const is3D = variant === '3d';
    const isOutline = variant === 'outline';

    return (
        <svg width="85" height="95" viewBox="0 0 100 110" className="drop-shadow-2xl" aria-hidden="true">
            <defs>
                <linearGradient id="orangeGradPint" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb923c"/>
                    <stop offset="100%" stopColor="#ea580c"/>
                </linearGradient>
                <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="1"/>
                    <stop offset="100%" stopColor="#f1f5f9" stopOpacity="1"/>
                </linearGradient>
            </defs>

            <path d="M 75 45 H 85 A 12 12 0 0 1 97 57 V 70 A 12 12 0 0 1 85 82 H 75" fill="none"
                  stroke={isOutline ? '#f97316' : (is3D ? '#ea580c' : '#f8fafc')} strokeWidth="10"
                  strokeLinecap="round"/>

            <rect x="25" y="30" width="50" height="65" rx="8"
                  fill={isOutline ? 'transparent' : (is3D ? 'url(#orangeGradPint)' : 'url(#glassGrad)')}
                  stroke={isOutline ? '#f97316' : (is3D ? '#c2410c' : '#cbd5e1')}
                  strokeWidth={isOutline ? '6' : '2'}/>

            {variant === 'flat' && <rect x="29" y="45" width="42" height="46" rx="4" fill="#f97316"/>}

            {is3D && <rect x="30" y="35" width="6" height="50" rx="3" fill="white" opacity="0.3"/>}

            <path d="M 20 30 C 20 12, 35 12, 40 18 C 45 2, 60 2, 65 18 C 70 12, 80 12, 80 30 C 80 42, 20 42, 20 30 Z"
                  fill="white" stroke={isOutline ? '#f97316' : '#f1f5f9'} strokeWidth={isOutline ? '6' : '2'}/>

            <g transform="translate(50, 62)">
                <circle cx="0" cy="0" r="20"
                        fill={isOutline ? 'transparent' : '#1e293b'}
                        stroke={isOutline ? '#f97316' : (is3D ? '#0f172a' : '#475569')}
                        strokeWidth={isOutline ? '6' : '4'}/>
                <circle cx="0" cy="0" r="11"
                        fill={isOutline ? 'transparent' : '#0f172a'}
                        stroke={isOutline ? '#f97316' : '#334155'}
                        strokeWidth={isOutline ? '4' : '2'}/>
                <circle cx="4" cy="-4" r="3" fill={isOutline ? '#f97316' : 'white'}
                        opacity={isOutline ? '1' : '0.8'}/>
            </g>
        </svg>
    );
}
