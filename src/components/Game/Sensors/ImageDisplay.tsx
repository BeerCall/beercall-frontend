import {motion} from 'framer-motion';
import StandardButtons from './StandardButtons';
import type {ActionButton} from '../../../types/game';

interface ImageDisplayPayload {
    type: string;
    image_url: string; // L'URL ou le Base64 de la photo renvoyée par le serveur
}

interface Props {
    sensorPayload: ImageDisplayPayload;
    actions: ActionButton[];
    onAction: (actionId: string) => void;
    disabled: boolean;
}

export default function ImageDisplay({sensorPayload, actions, onAction, disabled}: Props) {
    return (
        <div className="w-full flex flex-col items-center gap-6 z-10 relative">

            {/* 📸 LA PHOTO À JUGER */}
            <motion.div
                initial={{opacity: 0, y: 20, rotate: -2}}
                animate={{opacity: 1, y: 0, rotate: 0}}
                transition={{type: "spring", bounce: 0.5}}
                className="w-full max-w-sm rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)] border-4 border-gray-800 bg-black relative"
            >
                {/* Petit badge polaroid */}
                <div
                    className="absolute top-3 right-3 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-sm shadow-md z-10 transform rotate-3">
                    PREUVE
                </div>

                <img
                    src={sensorPayload.image_url}
                    alt="Preuve du défi"
                    className="w-full h-auto max-h-[40vh] object-contain"
                />
            </motion.div>

            {/* ⚖️ LES BOUTONS DE VOTE DU JURY */}
            <div className="w-full mt-2">
                <StandardButtons
                    actions={actions}
                    onAction={onAction}
                    disabled={disabled}
                />
            </div>

        </div>
    );
}