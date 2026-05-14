import {useState, useEffect, useRef, useCallback} from 'react';
import {motion, AnimatePresence} from 'framer-motion';

interface CameraPayload {
    type: string;
    facing_mode: 'user' | 'environment';
    auto_capture_ms: number;
}

interface Props {
    sensorPayload: CameraPayload;
    // On type correctement onAction pour accepter le payload de l'image
    onAction: (actionId: string, payload?: any) => void;
    disabled: boolean;
}

export default function CameraCapture({sensorPayload, onAction, disabled}: Props) {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [timeLeft, setTimeLeft] = useState(sensorPayload.auto_capture_ms / 1000);
    const [isFlashing, setIsFlashing] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasCapturedRef = useRef(false);

    // 🛑 FONCTION VITALE : Couper la caméra
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }, []);

    // 🟢 Démarrer la caméra
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: sensorPayload.facing_mode || 'user',
                    // On demande une résolution correcte mais pas 4K pour ne pas exploser le Base64
                    width: {ideal: 1280},
                    height: {ideal: 720}
                },
                audio: false
            });

            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setHasPermission(true);
        } catch (err) {
            console.error("Erreur d'accès à la caméra :", err);
            setHasPermission(false);
        }
    };

    // 📸 Prendre la photo
    const takePhoto = useCallback(() => {
        if (hasCapturedRef.current || disabled || !videoRef.current || !canvasRef.current) return;
        hasCapturedRef.current = true;

        // 1. Déclencher le flash visuel
        setIsFlashing(true);
        if ('vibrate' in navigator) navigator.vibrate(50);

        // 2. Préparer le canvas à la taille de la vidéo
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // 🪞 EFFET MIROIR : Si c'est la caméra frontale, il faut inverser l'image avant de dessiner !
        if (sensorPayload.facing_mode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }

        // 3. Dessiner la frame vidéo actuelle sur le canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 4. Convertir en Base64 (JPEG qualité 70% pour la légèreté réseau)
        const base64Image = canvas.toDataURL('image/jpeg', 0.7);

        // 5. Couper la caméra immédiatement pour figer l'image à l'écran
        video.pause();
        stopCamera();

        // 6. Envoyer au Backend après un court délai pour laisser le joueur voir sa tête
        setTimeout(() => {
            onAction('PHOTO_TAKEN', {image_base64: base64Image});
        }, 1500);

    }, [disabled, onAction, sensorPayload.facing_mode, stopCamera]);

    // ⏱️ Lancer la caméra au montage et gérer le chrono
    useEffect(() => {
        startCamera();

        // Cleanup au démontage du composant
        return () => {
            stopCamera();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // ⏱️ Gestion du chronomètre une fois la permission accordée
    useEffect(() => {
        if (hasPermission && !hasCapturedRef.current) {
            timerRef.current = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        if (timerRef.current) clearInterval(timerRef.current);
                        takePhoto(); // 📸 SNAP !
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [hasPermission, takePhoto]);

    // --- RENDU VISUEL ---

    // Cas 1 : Demande de permission
    if (hasPermission === false) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <span className="text-3xl">📷</span>
                </div>
                <h3 className="text-xl font-black text-white uppercase mb-2">Caméra requise</h3>
                <p className="text-gray-400 mb-6 font-medium">Nous avons besoin de la caméra pour ce défi !</p>
                <button
                    onClick={startCamera}
                    className="px-6 py-3 bg-amber-600 text-white rounded-2xl font-black uppercase tracking-wider"
                >
                    Autoriser l'accès
                </button>
            </div>
        );
    }

    // Cas 2 : Caméra active
// Cas 2 : Caméra active
    return (
        <div className="w-full flex justify-center z-10 relative">
            {/* 🚀 LA CAMÉRA DEVIENT UNE CARTE AU FORMAT PORTRAIT */}
            <div
                className="w-full aspect-[3/4] max-h-[50vh] max-w-sm flex flex-col items-center justify-center bg-black relative overflow-hidden rounded-[2rem] shadow-[0_0_40px_rgba(0,0,0,0.5)] border-4 border-gray-800">

                {/* 🔴 LE CHRONOMÈTRE */}
                <div
                    className="absolute top-4 right-4 z-20 flex items-center justify-center w-12 h-12 bg-black/50 backdrop-blur-md rounded-full border-2 border-white/20">
                    <span
                        className={`text-xl font-black ${timeLeft <= 3 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                        {timeLeft}
                    </span>
                </div>

                {/* 🎥 LE FLUX VIDÉO */}
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{transform: sensorPayload.facing_mode === 'user' ? 'scaleX(-1)' : 'none'}}
                />

                {/* 🖼️ LE CANVAS INVISIBLE */}
                <canvas ref={canvasRef} className="hidden"/>

                {/* 📸 LE BOUTON DÉCLENCHEUR */}
                <div className="absolute bottom-6 left-0 right-0 flex justify-center z-20">
                    <button
                        onClick={takePhoto}
                        disabled={disabled || hasCapturedRef.current}
                        className="w-16 h-16 rounded-full bg-white/20 p-1.5 flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <div className="w-full h-full bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)]"/>
                    </button>
                </div>

                {/* ⚡ LE FLASH BLANC */}
                <AnimatePresence>
                    {isFlashing && (
                        <motion.div
                            initial={{opacity: 1}}
                            animate={{opacity: 0}}
                            transition={{duration: 0.8, ease: "easeOut"}}
                            className="absolute inset-0 bg-white z-50 pointer-events-none"
                        />
                    )}
                </AnimatePresence>

            </div>
        </div>
    );
}