# syntax=docker/dockerfile:1

# Single-image build: frontend (nginx) + backend (Node) in one container.
# Exposes a single port (80); nginx serves the SPA and proxies the API to the
# co-located backend. Useful for the simplest possible deploy target.
#
#   docker build -t light-agentic-template .
#   docker run -p 8080:80 light-agentic-template
#
# Then open http://localhost:8080 in a browser.

# --- Build stage: build both packages from the workspace ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
COPY packages/frontend/package.json packages/frontend/
COPY packages/backend/package.json packages/backend/
RUN yarn install --frozen-lockfile
COPY packages/frontend packages/frontend
COPY packages/backend packages/backend
RUN yarn workspace frontend build && yarn workspace backend build:server

# --- Runtime stage: Node + nginx ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache nginx && mkdir -p /usr/share/nginx/html /run/nginx

COPY docker/nginx.single.conf /etc/nginx/http.d/default.conf
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

COPY --from=build /app/packages/backend/dist/server.js /app/server.js
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html

EXPOSE 80
CMD ["/app/start.sh"]
