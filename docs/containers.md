# Containers

The app is container-first. There are two ways to run the full stack, both
producing the same browser-reachable app. These are the artifacts Daytona (DinD)
and AWS Fargate consume.

## 1. docker-compose (separate containers)

Runs the frontend and backend as two containers on a shared network, mirroring
the production Fargate topology.

```bash
docker compose up --build
```

Then open <http://localhost:8080>.

- **frontend** — nginx serving the built Vite app on host port `8080`.
  At startup it writes `config.json` from the `API_URL` env var so the browser
  knows where the API lives (set to `http://localhost:3000` in compose).
- **backend** — the Node HTTP server on host port `3000`, exposing the same
  routes as the Lambda handler plus a `/health` probe. CORS is open, so the
  browser can call it cross-origin.
- **minio** / **minio-setup** — a functional mock for AWS S3 (plus a one-shot
  bucket-creation job), so the stack runs fully offline. The same code talks to
  real S3 in production by config only. See [aws-mocks.md](aws-mocks.md).

## 2. Single image (frontend + backend in one container)

Bundles both into one image. nginx serves the SPA and reverse-proxies the API
to the co-located backend, so only one port is exposed and no CORS is needed.

```bash
docker build -t light-agentic-template .
docker run -p 8080:80 light-agentic-template
```

Then open <http://localhost:8080>.

## How the backend runs as a container

The backend is an AWS Lambda handler (`packages/backend/src/index.ts`).
`packages/backend/src/server.ts` wraps that handler in a Node HTTP server,
translating incoming requests into the API Gateway event shape the handler
expects. The same handler therefore runs unchanged on Lambda and in a container.

## Adding a new API route

- **compose / Lambda**: just add the route in the handler — the backend is
  reached directly, nothing else to change.
- **single image**: also add a matching `location` block in
  `docker/nginx.single.conf` so nginx proxies the new path to the backend.

## Testing the containers end to end

Playwright e2e tests drive these containers in a real browser and assert on
behaviour. `yarn e2e` brings the compose stack up (or reuses a running one) and
runs the suite. See [e2e-testing.md](e2e-testing.md).
