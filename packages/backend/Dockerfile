# syntax=docker/dockerfile:1

# --- Build stage: bundle the Lambda handler + HTTP server into one file ---
FROM node:20-alpine AS build
WORKDIR /app

# Install workspace dependencies (lockfile-driven for reproducible builds).
COPY package.json yarn.lock ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
RUN yarn install --frozen-lockfile

# Build the standalone server bundle (zero runtime deps).
COPY packages/backend packages/backend
RUN yarn workspace backend build:server

# --- Runtime stage: just Node + the bundled server ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/packages/backend/dist/server.js ./server.js
EXPOSE 3000
USER node
CMD ["node", "server.js"]
