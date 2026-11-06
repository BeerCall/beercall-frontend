import type { MouseEvent } from 'react';

export interface WorldPhotoProofProps {
    url: string;
    onSelect: (url: string) => void;
}

/**
 * 8d — cible tactile d'une preuve photo dans un monde.
 * Le bouton fait 52×52 px (44 px d'image + 4 px de padding), au-dessus du
 * minimum 44×44 px. Aucun mesh, aucune caméra, aucune lumière modifiée.
 */
export default function WorldPhotoProof({ url, onSelect }: WorldPhotoProofProps) {
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onSelect(url);
    };
    return (
        <button type="button" data-world-photo aria-label="Preuve photo"
                onClick={handleClick}
                className="min-w-14 min-h-14 p-1 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/60 cursor-pointer active:scale-95 transition-transform">
            <img src={url} alt="Preuve" className="w-11 h-11 object-cover rounded-lg bg-gray-900"/>
        </button>
    );
}
