# Containers

The app is container-first. There are two ways to run the full stack, both
producing the same browser-reachable app. These are the artifacts Daytona (DinD)
and AWS Fargate consume.

> Production promotes these same images to AWS Fargate — see [deploy.md](deploy.md).

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

The backend is built around a framework-agnostic router
(`packages/backend/src/router.ts`): it takes a normalized `ApiRequest` and
returns a normalized `ApiResponse`, with no knowledge of any transport. Two thin
adapters share that one router:

- `packages/backend/src/index.ts` — the **AWS Lambda** adapter: API Gateway
  event → `route()` → API Gateway result.
- `packages/backend/src/server.ts` — the **Node `http`** adapter: incoming
  request → `route()` → HTTP response. `src/dev.ts` boots it.

The same router therefore runs unchanged on Lambda, in the container, and under
the local dev server — only the adapter differs.

## Running the API locally (no container)

For a fast inner loop you can run the backend directly on the host, no Docker
required:

```bash
yarn dev:api   # backend HTTP server on http://localhost:3000 (the frontend's API fallback)
yarn dev       # frontend dev server, in a second terminal
```

`yarn dev:api` bundles `src/dev.ts` with esbuild (already a dev-dependency — zero
new deps) and runs it. For the fully containerized stack with the S3 mock, use
`docker compose up` as above.

## Adding a new API route

- **compose / Lambda / local**: add the route in `src/router.ts` (and a handler
  under `src/handlers/`) — all three transports pick it up, nothing else to change.
- **single image**: also add a matching `location` block in
  `docker/nginx.single.conf` so nginx proxies the new path to the backend.

## Testing the containers end to end

Playwright e2e tests drive these containers in a real browser and assert on
behaviour. `yarn e2e` brings the compose stack up (or reuses a running one) and
runs the suite. See [e2e-testing.md](e2e-testing.md).
