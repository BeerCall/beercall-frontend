// src/components/UI/PhotoModal.tsx
import {useState} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {createPortal} from 'react-dom';
import {Trash2} from 'lucide-react';
import {usePhotoComments} from '../../hooks/usePhotoComments';

export interface PhotoItem {
    url: string;
    ownerId?: string;
    ownerUsername?: string;
}

interface Props {
    imageUrls: string[];
    photoItems?: PhotoItem[];
    squadId?: string;
    beerCallId?: string;
    currentIndex: number;
    onClose: () => void;
    onIndexChange: (index: number) => void;
}

type SwipeTarget = HTMLElement & {
    touchStartX?: number;
    touchStartY?: number;
};

const relativeDate = (value: string): string => {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return "à l'instant";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours} h`;
    return new Date(value).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'});
};

interface CommentsPanelProps {
    squadId: string;
    beerCallId: string;
    ownerId: string;
    ownerUsername?: string;
}

function PhotoCommentsPanel({squadId, beerCallId, ownerId, ownerUsername}: CommentsPanelProps) {
    const [draft, setDraft] = useState('');
    const {
        comments,
        isLoading,
        isError,
        addComment,
        deleteComment,
        isAdding,
        deletingId,
        addError,
        deleteError,
    } = usePhotoComments({squadId, beerCallId, ownerId});

    const handleSubmit = async () => {
        const content = draft.trim();
        if (!content || isAdding) return;
        try {
            await addComment(content);
            setDraft('');
        } catch (error) {
            console.warn('[photo-comments] ajout impossible', error);
        }
    };

    const handleDelete = async (commentId: number) => {
        try {
            await deleteComment(commentId);
        } catch (error) {
            console.warn('[photo-comments] suppression impossible', {commentId, error});
        }
    };

    const stop = (event: React.SyntheticEvent) => event.stopPropagation();

    return (
        <div
            data-testid="photo-comments"
            className="w-full max-w-sm rounded-2xl bg-gray-950/90 border border-white/10 p-3 text-white shadow-2xl"
            onClick={stop}
            onTouchStart={stop}
            onTouchEnd={stop}
        >
            <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Commentaires
                </h3>
                {ownerUsername && (
                    <span className="text-[10px] font-bold text-gray-500">preuve de {ownerUsername}</span>
                )}
            </div>

            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {isLoading && <p className="text-xs text-gray-400">Chargement…</p>}
                {isError && <p className="text-xs text-red-400">Impossible de charger les commentaires.</p>}
                {!isLoading && !isError && comments.length === 0 && (
                    <p className="text-xs text-gray-500">Aucun commentaire pour l'instant.</p>
                )}
                {comments.map((comment) => (
                    <div key={comment.id} className="flex items-start gap-2 rounded-xl bg-white/5 px-2 py-1.5">
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-black text-amber-300">
                                {comment.author_username}
                                <span className="ml-1 font-medium text-gray-500">{relativeDate(comment.created_at)}</span>
                            </p>
                            <p className="break-words text-xs text-gray-100">{comment.content}</p>
                        </div>
                        {comment.can_delete && (
                            <button
                                type="button"
                                aria-label="Supprimer le commentaire"
                                disabled={deletingId === comment.id}
                                onClick={() => void handleDelete(comment.id)}
                                className="mt-0.5 rounded-lg p-1 text-gray-400 active:bg-white/10 disabled:opacity-40"
                            >
                                <Trash2 size={15}/>
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <div className="mt-2 flex items-center gap-2">
                <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            void handleSubmit();
                        }
                    }}
                    maxLength={500}
                    placeholder="Ajouter un commentaire…"
                    aria-label="Ajouter un commentaire"
                    style={{fontSize: '16px'}}
                    className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 text-base leading-tight text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                    type="button"
                    aria-label="Envoyer le commentaire"
                    disabled={!draft.trim() || isAdding}
                    onClick={() => void handleSubmit()}
                    className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-black uppercase text-white active:bg-amber-700 disabled:opacity-40"
                >
                    Envoyer
                </button>
            </div>
            {addError && <p role="alert" className="mt-2 text-xs text-red-400">Impossible d'enregistrer le commentaire.</p>}
            {deleteError && <p role="alert" className="mt-2 text-xs text-red-400">Impossible de supprimer le commentaire.</p>}
        </div>
    );
}

export default function PhotoModal({
    imageUrls,
    photoItems,
    squadId,
    beerCallId,
    currentIndex,
    onClose,
    onIndexChange,
}: Props) {
    const items: PhotoItem[] = photoItems?.length ? photoItems : imageUrls.map((url) => ({url}));
    const currentItem = items[currentIndex];

    // Sécurité pour le SSR (Next.js/Remix) pour s'assurer que 'document' existe
    if (typeof document === 'undefined') return null;
    if (!currentItem) return null;

    const commentsEnabled = Boolean(currentItem.ownerId && squadId && beerCallId);

    // Handle touch events for swipe gestures
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            const target = e.target as SwipeTarget;
            target.touchStartX = e.touches[0].clientX;
            target.touchStartY = e.touches[0].clientY;
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        const target = e.target as SwipeTarget;
        if (!target.touchStartX || !target.touchStartY) return;

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const diffX = touchEndX - target.touchStartX;
        const diffY = touchEndY - target.touchStartY;

        // Threshold for swipe detection
        const threshold = 50;

        // Vertical swipe (up/down) to close modal
        if (Math.abs(diffY) > threshold && Math.abs(diffY) > Math.abs(diffX)) {
            onClose();
        }
        // Horizontal swipe (left/right) to change image
        else if (Math.abs(diffX) > threshold && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX < 0) {
                const nextIndex = (currentIndex + 1) % imageUrls.length;
                onIndexChange(nextIndex);
            } else {
                const prevIndex = (currentIndex - 1 + imageUrls.length) % imageUrls.length;
                onIndexChange(prevIndex);
            }
        }

        // Reset touch coordinates
        target.touchStartX = undefined;
        target.touchStartY = undefined;
    };

    const stop = (event: React.SyntheticEvent) => event.stopPropagation();

    return createPortal(
        <AnimatePresence>
            {items.length > 0 && (
                <motion.div
                    initial={{opacity: 0}}
                    animate={{opacity: 1}}
                    exit={{opacity: 0}}
                    className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-4 pointer-events-auto overflow-y-auto"
                    style={{paddingTop: 'calc(0px + env(safe-area-inset-top))'}}
                    onClick={onClose}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    <motion.img
                        initial={{scale: 0.8, y: 20}}
                        animate={{scale: 1, y: 0}}
                        exit={{scale: 0.8, y: 20}}
                        src={currentItem.url}
                        alt="Aperçu de la photo"
                        className={`max-w-full ${commentsEnabled ? 'max-h-[55vh]' : 'max-h-[85vh]'} object-contain rounded-xl shadow-2xl`}
                        onClick={stop}
                    />

                    {commentsEnabled && (
                        <PhotoCommentsPanel
                            key={`${squadId}:${beerCallId}:${currentItem.ownerId}`}
                            squadId={squadId!}
                            beerCallId={beerCallId!}
                            ownerId={currentItem.ownerId!}
                            ownerUsername={currentItem.ownerUsername}
                        />
                    )}
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
