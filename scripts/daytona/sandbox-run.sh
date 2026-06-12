#!/usr/bin/env bash
#
# Runs INSIDE a Daytona sandbox (booted from the base snapshot, with the
# just-committed source already extracted at /app). It boots the app exactly the
# way production does in spirit — frontend + backend + a MinIO S3 mock — but as
# host processes on localhost rather than via docker compose, because the sandbox
# is itself the container. Playwright then reuses that running app
# (reuseExistingServer in playwright.config.ts) instead of bringing up compose.
#
# It writes a machine-readable results.json plus per-service logs under
# /app/.daytona-run, which the harness (scripts/daytona/harness.mjs) pulls back
# and turns into the agent-facing report. Exit 0 = everything green.
#
# No `set -e`: we want to run every stage and report all failures, not stop at
# the first one.
set -uo pipefail

APP_DIR=/app
RUN_DIR="$APP_DIR/.daytona-run"
mkdir -p "$RUN_DIR"
cd "$APP_DIR" || exit 99

BACKEND_PORT=3000
FRONTEND_PORT=8080
MINIO_PORT=9000

log() { echo "[sandbox-run] $*"; }

PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done
}
trap cleanup EXIT

# 1) Build the deployable artifacts (the same builds the package Dockerfiles run).
log "building backend + frontend ..."
yarn workspace backend build:server >"$RUN_DIR/build.log" 2>&1 &&
  yarn workspace frontend build >>"$RUN_DIR/build.log" 2>&1
BUILD_EXIT=$?
log "build exit=$BUILD_EXIT"

# The SPA reads its API origin from /config.json (same mechanism nginx uses in
# production); in-sandbox everything is on localhost.
if [ -d packages/frontend/dist ]; then
  echo "{\"apiUrl\": \"http://localhost:$BACKEND_PORT\"}" >packages/frontend/dist/config.json
fi

# 2) Start the S3 mock (functional stand-in for AWS S3, like MinIO in compose).
log "starting minio ..."
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin \
  minio server "$RUN_DIR/minio-data" --address ":$MINIO_PORT" >"$RUN_DIR/minio.log" 2>&1 &
PIDS+=($!)

# 3) Start the backend, pointed at the mock (config-only switch — see s3Client.ts).
log "starting backend ..."
PORT=$BACKEND_PORT \
  S3_ENDPOINT="http://localhost:$MINIO_PORT" S3_BUCKET=app-bucket AWS_REGION=us-east-1 \
  AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin \
  node packages/backend/dist/server.js >"$RUN_DIR/backend.log" 2>&1 &
PIDS+=($!)

# 4) Serve the built frontend (vite preview serves dist/ with SPA fallback).
log "starting frontend ..."
yarn workspace frontend preview --port "$FRONTEND_PORT" --strictPort --host 127.0.0.1 \
  >"$RUN_DIR/frontend.log" 2>&1 &
PIDS+=($!)

# Create the bucket the storage handler expects, once MinIO answers.
(
  for _ in $(seq 1 30); do
    mc alias set local "http://localhost:$MINIO_PORT" minioadmin minioadmin >/dev/null 2>&1 &&
      mc mb --ignore-existing local/app-bucket >/dev/null 2>&1 && break
    sleep 1
  done
) >>"$RUN_DIR/minio.log" 2>&1

# 5) Wait for the app to come up before testing it.
wait_for() { # url, name -> 0 up / 1 down
  for _ in $(seq 1 60); do
    if curl -fsS "$1" >/dev/null 2>&1; then
      log "$2 is up"
      return 0
    fi
    sleep 1
  done
  log "$2 did NOT come up ($1)"
  return 1
}
wait_for "http://localhost:$BACKEND_PORT/health" backend
BACKEND_UP=$?
wait_for "http://localhost:$FRONTEND_PORT/" frontend
FRONTEND_UP=$?

# 6) Unit tests (vitest). Excludes e2e/ via vitest.config.ts.
log "running unit tests ..."
yarn test:run >"$RUN_DIR/unit.log" 2>&1
UNIT_EXIT=$?
log "unit exit=$UNIT_EXIT"

# 7) E2e tests. Playwright detects the already-listening app and skips its
#    docker-compose webServer command (reuseExistingServer: true).
log "running e2e tests ..."
E2E_BASE_URL="http://localhost:$FRONTEND_PORT" E2E_API_URL="http://localhost:$BACKEND_PORT" \
  yarn e2e >"$RUN_DIR/e2e.log" 2>&1
E2E_EXIT=$?
log "e2e exit=$E2E_EXIT"

# 8) Machine-readable summary for the harness.
bool() { [ "$1" -eq 0 ] && echo true || echo false; }
cat >"$RUN_DIR/results.json" <<EOF
{
  "buildExit": $BUILD_EXIT,
  "backendUp": $(bool $BACKEND_UP),
  "frontendUp": $(bool $FRONTEND_UP),
  "unitExit": $UNIT_EXIT,
  "e2eExit": $E2E_EXIT
}
EOF
log "wrote $RUN_DIR/results.json"
cat "$RUN_DIR/results.json"

# Green only when the build and both suites pass.
if [ "$BUILD_EXIT" -eq 0 ] && [ "$UNIT_EXIT" -eq 0 ] && [ "$E2E_EXIT" -eq 0 ]; then
  exit 0
fi
exit 1
