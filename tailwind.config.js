// tailwind.config.js (recommandé)
module.exports = {
    theme: {
        extend: {
            keyframes: {
                'soft-pulse': {
                    '0%, 100%': { boxShadow: '0 0 0 0px rgba(217, 119, 6, 0.3)', transform: 'scale(1)' },
                    '50%': { boxShadow: '0 0 0 15px rgba(217, 119, 6, 0)', transform: 'scale(1.02)' },
                },
            },
            animation: {
                'soft-pulse': 'soft-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
        },
    },
}