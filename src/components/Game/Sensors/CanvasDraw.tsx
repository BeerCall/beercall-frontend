import {useState, useEffect, useRef, useCallback} from 'react';
import {motion} from 'framer-motion';
import {Eraser} from 'lucide-react';

interface CanvasDrawPayload {
    type: string;
    duration_ms: number;
    stroke_color: string;
    stroke_width: number;
}

interface Props {
    sensorPayload: CanvasDrawPayload;
    onAction: (actionId: string, payload?: any) => void;
    disabled: boolean;
}

export default function CanvasDraw({sensorPayload, onAction, disabled}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [timeLeft, setTimeLeft] = useState(sensorPayload.duration_ms / 1000);

    // Refs de sécurité pour le timer et la soumission
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasSubmittedRef = useRef(false);

    // 🎨 INITIALISATION DU CANVAS
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // 1. Gérer la résolution interne du canvas pour éviter qu'il soit flou
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 2. OBLIGATOIRE : Remplir le fond en BLANC (sinon c'est transparent par défaut)
        // Les IA d'analyse d'image détestent les PNG avec un fond noir/transparent.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 3. Configurer le pinceau
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = sensorPayload.stroke_color || '#000000';
        ctx.lineWidth = sensorPayload.stroke_width || 5;

        ctxRef.current = ctx;
    }, [sensorPayload.stroke_color, sensorPayload.stroke_width]);

    // ⏱️ GESTION DU CHRONOMÈTRE
    useEffect(() => {
        if (!hasSubmittedRef.current) {
            timerRef.current = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        if (timerRef.current) clearInterval(timerRef.current);
                        submitDrawing();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // 🚀 SOUMISSION DE L'IMAGE
    const submitDrawing = useCallback(() => {
        if (hasSubmittedRef.current || !canvasRef.current) return;
        hasSubmittedRef.current = true;

        // On bloque le dessin
        setIsDrawing(false);

        // On convertit en Base64 (PNG)
        const base64Image = canvasRef.current.toDataURL('image/png');

        // Petite vibration de fin
        if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);

        // On envoie l'image au backend
        onAction('DRAWING_FINISHED', {image_base64: base64Image});
    }, [onAction]);

    // 🧹 EFFACER LE DESSIN
    const handleClear = () => {
        if (disabled || hasSubmittedRef.current || !canvasRef.current || !ctxRef.current) return;

        const canvas = canvasRef.current;
        const ctx = ctxRef.current;

        // On remet le fond blanc
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Petite vibration de feedback
        if ('vibrate' in navigator) navigator.vibrate(20);
    };

    // ✏️ CALCUL DES COORDONNÉES (Supporte Touch et Souris pour les tests PC)
    const getCoordinates = (e: React.TouchEvent | React.MouseEvent | MouseEvent | TouchEvent) => {
        if (!canvasRef.current) return {x: 0, y: 0};
        const rect = canvasRef.current.getBoundingClientRect();

        let clientX, clientY;

        if ('touches' in e && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    // ✏️ LOGIQUE DE DESSIN
    const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
        if (disabled || hasSubmittedRef.current || !ctxRef.current) return;
        setIsDrawing(true);
        const {x, y} = getCoordinates(e);
        ctxRef.current.beginPath();
        ctxRef.current.moveTo(x, y);
    };

    const draw = (e: React.TouchEvent | React.MouseEvent) => {
        if (!isDrawing || disabled || hasSubmittedRef.current || !ctxRef.current) return;
        // preventDefault géré par la classe "touch-none" de Tailwind
        const {x, y} = getCoordinates(e);
        ctxRef.current.lineTo(x, y);
        ctxRef.current.stroke();
    };

    const stopDrawing = () => {
        if (!isDrawing || disabled || !ctxRef.current) return;
        setIsDrawing(false);
        ctxRef.current.closePath();
    };

    // --- RENDU VISUEL ---
    return (
        <div className="w-full h-full flex flex-col relative bg-gray-950 p-4 pb-0">

            {/* 🔴 HEADER : Chronomètre et Bouton Effacer */}
            <div className="flex justify-between items-center mb-4 z-10">
                <div className="flex items-center gap-3">
                    <div
                        className={`w-12 h-12 flex items-center justify-center rounded-2xl bg-gray-900 border-2 ${timeLeft <= 3 ? 'border-red-500 text-red-500 animate-pulse' : 'border-gray-800 text-white'}`}>
                        <span className="text-xl font-black">{timeLeft}</span>
                    </div>
                    <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Temps Restant</span>
                </div>

                <button
                    onClick={handleClear}
                    disabled={disabled || hasSubmittedRef.current}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-xl font-bold text-xs uppercase tracking-wider active:scale-95 disabled:opacity-50"
                >
                    <Eraser size={16}/> Effacer
                </button>
            </div>

            {/* 🎨 LE CANVAS */}
            {/* touch-none : Vital pour empêcher le scroll de l'écran avec le doigt */}
            {/* select-none : Empêche la sélection de texte accidentelle */}
            <div
                className="flex-1 w-full bg-white rounded-t-[2rem] overflow-hidden shadow-[0_0_40px_rgba(255,255,255,0.1)] relative border-4 border-gray-800 touch-none select-none">
                <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    onTouchCancel={stopDrawing}
                    className={`w-full h-full ${disabled || hasSubmittedRef.current ? 'opacity-80 pointer-events-none' : 'cursor-crosshair'}`}
                />

                {/* Overlay de fin */}
                {hasSubmittedRef.current && (
                    <motion.div
                        initial={{opacity: 0}}
                        animate={{opacity: 1}}
                        className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center"
                    >
                        <div
                            className="bg-gray-900 text-white px-6 py-3 rounded-full font-black uppercase tracking-widest flex items-center gap-2 shadow-xl">
                            <span className="animate-spin text-xl">⏳</span> Analyse de l'œuvre...
                        </div>
                    </motion.div>
                )}
            </div>

        </div>
    );
}