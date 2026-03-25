import axios from 'axios';
import { useUserStore } from '../store/useUserStore';

export const MODELS_URL = '/models';

export const api = axios.create({
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

api.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        if (error.response && error.response.status === 401) {
            if (error.response.data && error.response.data.detail === "Could not validate credentials") {
                console.warn("🔒 Token expiré ou invalide. Déconnexion forcée.");

                useUserStore.getState().logout();
            }
        }

        return Promise.reject(error);
    }
);