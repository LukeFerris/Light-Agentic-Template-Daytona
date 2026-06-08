#!/bin/sh
# Entrypoint for the single-image build: runs the Node backend and nginx
# (serving the frontend + proxying the API) side by side in one container.
set -e

# Same-origin API: nginx proxies /hello to the local backend, so no apiUrl.
echo '{"apiUrl": ""}' > /usr/share/nginx/html/config.json

node /app/server.js &
NODE_PID=$!

nginx -g 'daemon off;' &
NGINX_PID=$!

shutdown() {
    kill "$NODE_PID" "$NGINX_PID" 2>/dev/null || true
}
trap shutdown TERM INT

# If either process exits, tear the other down so the container stops too.
while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
    sleep 2
done

shutdown
