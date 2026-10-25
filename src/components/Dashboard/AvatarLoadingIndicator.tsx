import { useEffect } from 'react';
import { recordAvatarLoading } from '../../lib/avatarLoadingTrace';

export default function AvatarLoadingIndicator({ phase }: { phase: 'map-bootstrap' | 'canvas-suspense' }) {
    useEffect(() => {
        recordAvatarLoading(phase, 'start', 'dashboard');
        return () => recordAvatarLoading(phase, 'end', 'dashboard');
    }, [phase]);
    return <div role="status" aria-label="Chargement de l’avatar" data-avatar-loading={phase}
                className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-beer"/>
    </div>;
}
