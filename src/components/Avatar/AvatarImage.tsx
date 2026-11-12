import { useState, type CSSProperties } from 'react';

export interface AvatarSpritesLike {
    hash?: string | null;
    head_url?: string | null;
    portrait_url?: string | null;
    body_url?: string | null;
    pending?: boolean;
    status?: string | null;
}

export type AvatarKind = 'head' | 'portrait' | 'body';

interface AvatarImageProps {
    sprites?: AvatarSpritesLike | null;
    username: string;
    kind: AvatarKind;
    sizePx: number;
    className?: string;
    eager?: boolean;
}

function spriteUrl(sprites: AvatarSpritesLike | null | undefined, kind: AvatarKind): string | null {
    if (!sprites) return null;
    if (kind === 'head') return sprites.head_url ?? null;
    if (kind === 'portrait') return sprites.portrait_url ?? null;
    return sprites.body_url ?? null;
}

export function AvatarImage({ sprites, username, kind, sizePx, className, eager }: AvatarImageProps) {
    const url = spriteUrl(sprites, kind);
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const height = kind === 'body' ? sizePx * 2 : sizePx;
    const pending = sprites?.status === 'pending' || sprites?.pending === true;
    const base = 'inline-flex items-center justify-center overflow-hidden select-none' + (pending ? ' animate-pulse' : '');
    const style: CSSProperties = { width: sizePx, height };
    const classes = [base, className].filter(Boolean).join(' ');

    if (!url || url === failedUrl) {
        const initial = username.trim().charAt(0).toUpperCase() || '?';
        return (
            <span
                role='img'
                aria-label={username}
                className={[classes, 'bg-neutral-200 text-neutral-600 font-semibold'].join(' ')}
                style={style}
                data-avatar-fallback={kind}
            >
                {initial}
            </span>
        );
    }

    return (
        <img
            src={url}
            alt={username}
            width={sizePx}
            height={height}
            loading={eager ? 'eager' : 'lazy'}
            decoding='async'
            draggable={false}
            fetchPriority={eager ? 'high' : 'auto'}
            onError={() => setFailedUrl(url)}
            className={[classes, 'object-cover'].join(' ')}
            style={style}
            data-avatar-sprite={kind}
        />
    );
}
