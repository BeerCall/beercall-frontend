FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# Copie des manifestes npm pour le cache des couches
COPY package.json package-lock.json ./

# Installation propre des dépendances
RUN npm ci --legacy-peer-deps

# Copie des sources requises pour le build du renderer
COPY src/ ./src/
COPY tools/avatar-renderer/ ./tools/avatar-renderer/
COPY scripts/glb/ ./scripts/glb/
COPY tsconfig*.json ./

# Compilation de l'entrée renderer vers .renderer-dist
RUN npm run renderer:build

# Variables d'exécution en conteneur
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV MODELS_DIR=/models
ENV ANIMATIONS_DIR=/animations
ENV RENDERER_SOFTWARE_GL=1

# Utilisateur non-root fourni par l'image Playwright
USER pwuser

CMD ["node", "tools/avatar-renderer/server.mjs"]
