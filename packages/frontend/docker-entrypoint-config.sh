#!/bin/sh
# Generates runtime config consumed by the app (see src/App.tsx -> getApiUrl).
# Runs automatically via the nginx image's /docker-entrypoint.d hook, so the
# backend URL is injected at container start rather than baked into the image.
set -e

: "${API_URL:=}"

cat > /usr/share/nginx/html/config.json <<EOF
{"apiUrl": "${API_URL}"}
EOF

echo "Wrote config.json with apiUrl='${API_URL}'"
