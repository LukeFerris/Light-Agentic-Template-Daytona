# Base snapshot for the post-commit Daytona TDD loop.
#
# This bakes the SLOW, dependency-only parts of a run so the per-commit hot path
# only has to copy source in and run tests:
#   - OS + Playwright + the browsers (FROM the official Playwright image, so
#     Chromium et al. ship in the image and are NEVER downloaded per run),
#   - the workspace node_modules (yarn install against the committed lockfile),
#   - the MinIO server + client binaries (the functional S3 mock the app's
#     storage handler talks to — same role MinIO plays in docker-compose.yml).
#
# The harness (scripts/daytona/harness.mjs) keys the snapshot on a hash of THIS
# file + yarn.lock + the workspace package.json files, so the snapshot is rebuilt
# only when dependencies change — never on source-only changes. See
# docs/daytona-loop.md.
#
# Pinned to the Playwright tag that matches @playwright/test in package.json
# (1.60.0). Bump both together — see docs/e2e-testing.md.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Classic Yarn drives this repo's v1 lockfile. The Playwright image ships Node,
# so we just need the yarn CLI on top of it.
RUN npm install -g yarn@1 >/dev/null 2>&1

# Only the manifests + lockfile go into the snapshot; the source itself is copied
# in at runtime. This is what lets the snapshot be reused across source changes.
COPY package.json yarn.lock ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json

# Bake the full workspace node_modules (dev deps included: vite, esbuild, vitest,
# @playwright/test, ...). --frozen-lockfile makes the install reproducible and
# fails loudly if the lockfile is out of sync with the manifests.
RUN yarn install --frozen-lockfile --network-timeout 600000

# Functional S3 mock (stands in for AWS S3, exactly as MinIO does in compose).
RUN (command -v curl >/dev/null || (apt-get update && apt-get install -y --no-install-recommends curl)) \
 && curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio \
        -o /usr/local/bin/minio \
 && curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc \
        -o /usr/local/bin/mc \
 && chmod +x /usr/local/bin/minio /usr/local/bin/mc

# The sandbox boots from this image as a NON-root user, but the build above runs
# as root, so /app (incl. the baked node_modules) is root-owned. Make it
# world-writable so the runtime user can extract source, build, and drop
# artifacts into it. (Same reason the spike chmod 0777'd its workdir.)
RUN chmod -R 0777 /app

# Playwright/vitest both honour CI for deterministic, non-interactive runs.
ENV CI=1
