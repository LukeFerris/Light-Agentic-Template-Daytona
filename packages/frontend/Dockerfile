# syntax=docker/dockerfile:1

# --- Build stage: produce the static Vite bundle ---
FROM node:20-alpine AS build
WORKDIR /app

# Install workspace dependencies (lockfile-driven for reproducible builds).
COPY package.json yarn.lock ./
COPY packages/frontend/package.json packages/frontend/
COPY packages/backend/package.json packages/backend/
RUN yarn install --frozen-lockfile

# Build the frontend.
COPY packages/frontend packages/frontend
RUN yarn workspace frontend build

# --- Runtime stage: serve the static bundle with nginx ---
FROM nginx:alpine AS runtime
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
# Injects config.json (apiUrl) at startup via the nginx entrypoint hook.
COPY packages/frontend/docker-entrypoint-config.sh /docker-entrypoint.d/40-config-json.sh
RUN chmod +x /docker-entrypoint.d/40-config-json.sh
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
EXPOSE 80
