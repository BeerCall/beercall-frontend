// src/lib/api.ts
import axios from 'axios';

export const MODELS_URL = '/models';

export const api = axios.create({
    // ⚠️ On remplace l'URL complète par un chemin relatif
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});