// src/pages/ChatPage.tsx
import {useState, useEffect, useRef, Suspense} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {motion, AnimatePresence, useInView} from 'framer-motion';
import {ChevronLeft, Send, MessageCircle, User as UserIcon} from 'lucide-react';
import {useSquadDetails} from '../hooks/useSquadDetails';
import {useSquadWebSocket} from '../hooks/useSquadWebSocket';
import {useChat} from '../hooks/useChat';
import {useProfile} from '../hooks/useProfile';
import {useChatViewport} from '../hooks/useChatViewport';
import type {ChatMessage} from '../types/chat';
import SafeAvatar from '../components/3D/SafeAvatar';

// ⏱️ Formate un timestamp en heure (ex: 14:32)
const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
};

// 💬 Une seule bulle de message
function MessageBubble({message, isOwn}: { message: ChatMessage, isOwn: boolean }) {
    const ref = useRef(null);
    const isInView = useInView(ref, {margin: "50px"});
    const { data: senderProfile } = useProfile(String(message.userId));

    return (
        <motion.div
            ref={ref}
            initial={{opacity: 0, y: 16, scale: 0.95}}
            animate={{opacity: 1, y: 0, scale: 1}}
            transition={{type: "spring", damping: 20, stiffness: 300}}
            className={`flex gap-2 items-end ${isOwn ? 'flex-row-reverse' : ''}`}
        >
            {/* Avatar */}
            <div
                className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white font-black text-xs shadow overflow-hidden relative ${isOwn ? 'bg-amber-500' : 'bg-gray-400'}`}>
                {senderProfile?.avatar && senderProfile.avatar.head ? (
                    isInView ? (
                        <Suspense fallback={<div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>}>
                            <SafeAvatar config={senderProfile.avatar} headOnly={true} disableZoom={true} disablePan={true}/>
                        </Suspense>
                    ) : null
                ) : (
                    <UserIcon size={18}/>
                )}
            </div>

            {/* Bulle */}
            <div className={`max-w-[70%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-0.5 px-1">
                    {isOwn ? 'Toi' : (message.username || 'Squad')}
                </span>
                <div
                    className={`px-4 py-2.5 rounded-2xl text-sm shadow-sm leading-snug ${
                        isOwn
                            ? 'bg-amber-500 text-white rounded-br-md'
                            : 'bg-white text-gray-900 border border-gray-100 rounded-bl-md'
                    }`}>
                    <span className="whitespace-pre-wrap break-words">{message.text}</span>
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5 px-1">{formatTime(message.timestamp)}</span>
            </div>
        </motion.div>
    );
}

export default function ChatPage() {
    const {id, squadId, beerCallId} = useParams();
    const navigate = useNavigate();
    const currentSquadId = squadId || id;
    const squadIdNumber = currentSquadId ? parseInt(currentSquadId, 10) : undefined;
    useSquadWebSocket(Number.isNaN(squadIdNumber) ? undefined : squadIdNumber);

    const {data: squad} = useSquadDetails(currentSquadId);
    const {data: profile} = useProfile(); // profil du user courant
    const {messages, sendMessage, loading, error} = useChat(currentSquadId, beerCallId);

    // 🍻 Recherche de l'apéro courant (actif ou passé) pour afficher ses détails
    const beerCall = beerCallId
        ? [...(squad?.active_beer_call || []), ...(squad?.past_beer_calls || [])]
            .find((call) => call.id === beerCallId)
        : undefined;

    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const viewport = useChatViewport(containerRef);

    // 🔃 Auto-scroll dans la seule liste de messages, jamais vers un ancêtre.
    useEffect(() => {
        const list = messagesRef.current;
        if (!list) return;
        if (typeof list.scrollTo === 'function') {
            list.scrollTo({top: list.scrollHeight, behavior: 'smooth'});
        } else {
            list.scrollTop = list.scrollHeight;
        }
    }, [messages]);

    const currentUserId = profile?.id;

    const handleSend = async () => {
        const text = input.trim();
        if (!text || sending) return;

        setSending(true);
        const ok = await sendMessage({
            text,
            userId: currentUserId ?? 'anonymous',
            username: profile?.username || 'Squad',
            avatar: '',
        });
        setSending(false);

        if (ok) {
            setInput('');
        }
    };

    return (
        <div ref={containerRef}
             className="absolute inset-x-0 flex flex-col bg-[#f8fafc] overflow-hidden"
             style={{top: viewport.top, height: viewport.height}}>
            {/* 🧾 HEADER */}
            <header className="pt-[calc(10px+env(safe-area-inset-top))] shrink-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm z-10">
                <button
                    onClick={() => navigate(-1)}
                    aria-label="Retour"
                    className="p-2 min-w-11 min-h-11 flex items-center justify-center bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
                >
                    <ChevronLeft size={20}/>
                </button>

                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow shrink-0">
                        <MessageCircle size={20}/>
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-black text-gray-900 uppercase italic tracking-tighter leading-none truncate">
                            {beerCall ? beerCall.location_name || 'Chat Apéro' : (squad?.name || 'Chat Squad')}
                        </h1>
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mt-0.5 truncate">
                            {beerCall ? `${squad?.name || 'Squad'} · En direct` : 'En direct'}
                        </p>
                    </div>
                </div>
            </header>

            {/* 💬 ZONE MESSAGES */}
            <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
                {error ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                        <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-500 flex items-center justify-center mb-3">
                            <MessageCircle size={28}/>
                        </div>
                        <p className="font-black text-red-600 uppercase italic text-sm">Erreur de connexion au chat</p>
                        <p className="text-xs text-gray-500 mt-1 max-w-xs">{error}</p>
                    </div>
                ) : loading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-400">
                        <div className="w-8 h-8 border-4 border-beer border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-xs font-bold uppercase tracking-widest">Chargement du chat...</p>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-8">
                        <div className="w-16 h-16 rounded-3xl bg-amber-100 flex items-center justify-center text-amber-500 mb-4">
                            <MessageCircle size={30}/>
                        </div>
                        <p className="font-black text-gray-700 uppercase italic">Aucun message</p>
                        <p className="text-sm text-gray-400 mt-1">
                            Sois le premier à lancer la conversation avec ta squad !
                        </p>
                    </div>
                ) : (
                    <>
                        <AnimatePresence initial={false}>
                            {messages.map((msg) => (
                                <MessageBubble
                                    key={msg.id}
                                    message={msg}
                                    isOwn={String(msg.userId) === String(currentUserId)}
                                />
                            ))}
                        </AnimatePresence>
                    </>
                )}
            </div>

            {/* 📝 SAISIE */}
            <footer className="shrink-0 min-w-0 bg-white border-t border-gray-100 px-4 py-3 flex items-end gap-2 z-10 pb-[max(12px,env(safe-area-inset-bottom))]">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        // Enter = envoi, Shift+Enter = nouvelle ligne, IME respecté
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    rows={1}
                    placeholder="Écris un message..."
                    className="text-base flex-1 min-w-0 w-full resize-none rounded-2xl bg-gray-100 border border-transparent focus:border-amber-400 focus:bg-white focus:outline-none px-4 py-3 transition-colors max-h-32"
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    aria-label="Envoyer"
                    className="shrink-0 w-11 h-11 flex items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/30 disabled:opacity-40 disabled:shadow-none hover:bg-amber-600 transition-all"
                >
                    <Send size={18}/>
                </button>
            </footer>
        </div>
    );
}