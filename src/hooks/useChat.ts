// src/hooks/useChat.ts
import {useEffect, useState, useCallback} from 'react';
import {onValue, push, orderByChild, query, limitToLast} from 'firebase/database';
import {squadChatRef, beerCallChatRef} from '../lib/firebase';
import type {ChatMessage} from '../types/chat';

// 📡 Hook de chat temps réel pour un squad ou un apéro
// - Si `beerCallId` est fourni, on écoute la conversation dédiée de l'apéro.
// - Sinon on retombe sur la conversation globale du squad.
// - Ne charge rien tant que `squadId` (et `beerCallId` si demandé) ne sont pas fournis.
export function useChat(squadId: string | undefined, beerCallId?: string | undefined) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // On ne charge rien tant que le squad n'est pas connu.
        // Si un apéro est visé, il doit aussi être fourni.
        if (!squadId || (beerCallId !== undefined && !beerCallId)) {
            setTimeout(() => setLoading(false), 0);
            return;
        }

        setTimeout(() => {
            setLoading(true);
            setError(null);
        }, 0);

        try {
            // Requête : triée par timestamp, on garde les 50 derniers messages
            const chatRef = beerCallId
                ? beerCallChatRef(squadId, beerCallId)
                : squadChatRef(squadId);
            const q = query(
                chatRef,
                orderByChild('timestamp'),
                limitToLast(50)
            );

            const unsubscribe = onValue(
                q,
                (snapshot) => {
                    const data = (snapshot.val() ?? {}) as Record<string, Omit<ChatMessage, 'id'>>;
                    const list: ChatMessage[] = Object.entries(data).map(([id, value]) => ({
                        ...value,
                        id,
                    }));
                    setMessages(list);
                    setTimeout(() => setLoading(false), 0);
                },
                (err) => {
                    console.error('❌ Erreur chat Firebase:', err);
                    setError(err.message || 'Impossible de charger les messages.');
                    setTimeout(() => setLoading(false), 0);
                }
            );

            return () => unsubscribe();
        } catch (e) {
            console.error('❌ Exception init chat Firebase:', e);
            setTimeout(() => {
                setError((e as Error)?.message || 'Erreur d\'initialisation du chat');
                setLoading(false);
            }, 0);
        }
    }, [squadId, beerCallId]);

    // ✉️ Envoie un message et renvoie true si l'écriture a réussi
    const sendMessage = useCallback(async (payload: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: number }) => {
        if (!squadId) return false;
        try {
            const target = beerCallId
                ? beerCallChatRef(squadId, beerCallId)
                : squadChatRef(squadId);
            await push(target, {
                ...payload,
                beerCallId: beerCallId || payload.beerCallId,
                timestamp: Date.now(),
            });
            return true;
        } catch (e) {
            console.error('❌ Échec envoi message:', e);
            return false;
        }
    }, [squadId, beerCallId]);

    return {messages, sendMessage, loading, error};
}
