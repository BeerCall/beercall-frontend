import { AvatarImage, type AvatarSpritesLike } from '../Avatar/AvatarImage';

export interface ProfileAvatarFallbackProps {
    sprites?: AvatarSpritesLike | null;
    username: string;
}

/**
 * Repli du profil : le sprite corps entier, transparent, à la même échelle et
 * au même ancrage que l'avatar 3D (caméra [1.9, 1.55, 3.2], fov 38, scale 0.01).
 * Pas de fond gris, chargement immédiat, aucun passage par le portrait buste.
 */
export function ProfileAvatarFallback({ sprites, username }: ProfileAvatarFallbackProps) {
    const bodyUrl = sprites?.body_url;
    if (!bodyUrl) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <AvatarImage sprites={sprites} username={username} kind="portrait" sizePx={200} eager />
            </div>
        );
    }

    return (
        <img
            src={bodyUrl}
            alt=""
            draggable={false}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            data-profile-avatar-sprite="body"
            className="absolute left-[48.3%] top-[9.1%] h-[92.8%] w-auto max-w-none -translate-x-1/2 object-contain"
        />
    );
}
