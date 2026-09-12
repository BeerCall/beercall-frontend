// src/types/chat.ts

// Un message envoyé dans le chat d'un apéro (ou d'un squad)
export interface ChatMessage {
    id: string;
    text: string;
    userId: string | number;
    username: string;
    avatar?: string;
    timestamp: number;
    beerCallId?: string; // Identifiant de l'apéro rattaché
}