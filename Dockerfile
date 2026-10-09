ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:stable-alpine

# Étape 1 : Build
FROM ${NODE_IMAGE} AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# Étape 2 : Production
FROM ${NGINX_IMAGE} AS production-stage
COPY --from=build-stage /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
