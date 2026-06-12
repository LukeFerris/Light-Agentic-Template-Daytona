# CLAUDE.md

## Project Overview

Light Agentic Template - A lightweight fullstack TypeScript template with React frontend and AWS Lambda backend, designed for Claude Code agents.

## Package Structure

- `packages/frontend` - React TypeScript frontend with Tailwind CSS (Vite-powered)
- `packages/backend` - AWS Lambda TypeScript API

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

Production runs the frontend and backend as containers on AWS Fargate behind an
ALB (see [docs/deploy.md](docs/deploy.md)). Local/dev runs the same images via
`docker compose up` (see [docs/containers.md](docs/containers.md)).

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
