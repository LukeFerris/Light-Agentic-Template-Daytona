# CLAUDE.md

## Project Overview

Light Agentic Template (Daytona) - A lightweight fullstack TypeScript template
with a React frontend and a containerized Node API backend, designed for Claude
Code agents. The template bakes in a **Daytona-driven TDD loop** and a
**container-first deployment model**: the same images run locally via
`docker compose`, get exercised per-commit in a throwaway Daytona sandbox, and
ship to AWS Fargate in production.

## Package Structure

- `packages/frontend` - React TypeScript frontend with Tailwind CSS (Vite-powered)
- `packages/backend` - Node TypeScript API. Runs as a container (an HTTP server,
  `src/server.ts`); deployed to AWS Fargate in production, not Lambda.

## How you work in this template (read this first)

This template enforces a test-driven, container-first loop. As the agent picking
up this repo, follow it by default:

1. **Write tests as part of TDD** — for every feature, write both **unit tests**
   (`*.test.ts`, vitest, next to the code) *and* **Playwright e2e tests**
   (`*.spec.ts` in `e2e/`). Write them alongside the feature, not after.
2. **Commit** the work (the project requires a clean working tree after every
   completed piece of work — see Working Guidelines).
3. **The post-commit Daytona loop deploys and tests it.** After a successful
   commit, `yarn daytona:loop` deploys HEAD to a throwaway Daytona cloud sandbox,
   boots the app (frontend + backend + the containerized S3 mock), runs the unit
   + e2e suites against the **running** app, and hands back a machine-readable
   `<daytona-loop-result>` PASS/FAIL plus logs and Playwright traces.
4. **On failure, you MUST read the returned container logs and fix the issue
   before re-committing.** The report points at `.daytona/runs/<runId>/` —
   `backend.log` / `frontend.log` / `minio.log` for runtime failures, the
   Playwright `test-results/` traces & screenshots for e2e failures, and
   `summary.json` for the structured record. Diagnose from those, fix, re-commit.
   The loop repeats until green.

The loop is the inner gate that proves a commit actually runs, not just compiles.
See [docs/daytona-loop.md](docs/daytona-loop.md) for the full design, the failure
report format, and the measured numbers.

**Credentials live in the main work tree.** `DAYTONA_API_KEY` (and the optional
`DAYTONA_*` overrides / `DAYTONA_POST_COMMIT`) belong in a gitignored `.env` in
the **main checkout**, never in a card worktree (worktrees carry no `.env`). Both
`yarn daytona:loop` and the post-commit hook resolve `.env` from the main work
tree (the parent of the shared `.git` dir), so the loop runs identically whether
you invoke it from `main` or from a `card/<short-id>` worktree — you do not need
to copy `.env` into each worktree.

## Key Commands

```bash
yarn install          # Install dependencies
yarn build            # Build all packages
yarn test             # Run unit tests (vitest)
yarn test:coverage    # Run unit tests with coverage
yarn e2e              # Run Playwright e2e tests against the containerized app
yarn e2e:install      # One-time: install the Chromium build for Playwright
yarn dev              # Start frontend dev server
yarn type-check       # TypeScript type checking
yarn lint             # Run ESLint
yarn daytona:loop     # Post-commit: deploy HEAD to a Daytona sandbox, run unit+e2e, report back
```

## Deployment Commands

```bash
yarn deploy           # Build + smoke-test + push images, then stand up the full app on AWS Fargate
yarn teardown         # Remove every AWS resource the deploy created
```

Deployment is **container-first**. The same images built for local/dev run in
production — only as immutable artifacts on **AWS Fargate**, behind an ALB and
pointed at real AWS services instead of the dev mocks (config change only, never
a code branch). The Fargate stack (ECR, ECS services, ALB, IAM, S3) is
provisioned by Terraform under `deployment/` and driven by
`scripts/deploy/deploy-fargate.sh`; this replaced the template's original
Terraform-into-Lambda model. Local/dev runs the same images via
`docker compose up`.

- Production deploy & topology: [docs/deploy.md](docs/deploy.md)
- Local/dev containers: [docs/containers.md](docs/containers.md)
- AWS service mocks (e.g. MinIO for S3): [docs/aws-mocks.md](docs/aws-mocks.md)
- **External-service policy (mock vs. call-for-real):**
  [docs/external-services.md](docs/external-services.md) — read this before
  adding any new external dependency. It defines the one decision (mockable
  Pattern A vs. required-real Pattern B) and the checklists that keep the
  per-commit Daytona loop deterministic and key-free.

## The Daytona loop deploy model

The per-commit "deploy to Daytona" does **not** bake a new image per commit.
It boots a **warm BASE snapshot and copies the just-committed source in**:

- **Base snapshot** (`scripts/daytona/snapshot.Dockerfile`) bakes the slow,
  dependency-only parts: the OS, Playwright + its browsers, the workspace
  `node_modules`, and the MinIO S3 mock. The harness keys the snapshot on a
  **hash of the Dockerfile + lockfile + manifests**, so it is rebuilt **only when
  dependencies change** — never on source changes.
- **Per commit**, the harness boots a sandbox from that warm base (~1s),
  injects the committed source over the baked `/app` (via `git archive`, so
  unpushed local commits work and the baked `node_modules` is reused), then
  builds + boots the app as localhost processes and runs unit + e2e in-box.
- **Why:** freshly-baked snapshots intermittently fail to schedule ("No available
  runners"), while a warm base boots in ~1s. Image-baking is reserved for the
  **production Fargate deploy**, where running the exact artifact you ship matters.

The rationale and measured numbers (cold vs warm boot, "No available runners"
causes, cost per run) live in [docs/daytona-loop.md](docs/daytona-loop.md).

## Testing

- **Unit tests** (`*.test.ts`) live next to the code under `packages/` and run
  with vitest. Coverage thresholds are enforced at commit time.
- **E2e tests** (`*.spec.ts`) live in the top-level `e2e/` directory and run
  with Playwright against the containerized app. Write them as part of TDD,
  alongside the feature. See [docs/e2e-testing.md](docs/e2e-testing.md) for
  conventions, the failure-artifact setup, and Daytona-loop alignment.
- `@playwright/test` is pinned (not `*`) so it matches the browsers baked into
  the Daytona base image — see the doc before bumping it.
- **Post-commit loop**: after a commit, `yarn daytona:loop` deploys it to a
  throwaway Daytona sandbox, runs unit + e2e against the running app, and returns
  a machine-readable pass/fail + logs to act on. See
  [docs/daytona-loop.md](docs/daytona-loop.md).

## Working Guidelines

1. You must generate a commit for every piece of completed work you do - ensuring the working directory is clean afterwards (no orphaned files)

## Git Commit Rules

**CRITICAL: NEVER use `--no-verify` when committing.** Pre-commit hooks exist for security and code quality. If a commit fails due to pre-commit hooks:

1. Attempt to fix the issues in the staged files
2. If the issues cannot be resolved through code modifications, **stop and explain the situation to the user**
3. Do not bypass hooks under any circumstances - they are a security requirement
4. Do not change the git hooks that are in place
5. **You are responsible for fixing ALL linting, formatting, or other issues discovered during commit checks** - even if those issues exist in files you didn't modify or are unrelated to the work done in the current session. The goal is always a clean commit.

## External Packages

- We use Yarn to manage packages
- Always use unpinned (latest) packages unless instructed

## Code Quality

- Never leave redundant code in the codebase - this is a greenfield project so we have no need to keep old code around
- All code must pass ESLint, security scans, and coverage thresholds before commit
