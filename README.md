# Light Agentic Template (Daytona)

A lightweight fullstack TypeScript template — React (Vite + Tailwind) frontend, a
containerized Node API backend — built to be driven by Claude Code agents. It
bakes in two things most templates leave to you:

- a **non-negotiable commit-gate pipeline** (secrets, SAST, lint, build, unit
  tests + coverage, dependency CVEs, pattern checks) that runs before every
  commit, and
- a **Daytona-driven, container-first e2e loop** that, after a commit, deploys
  HEAD to a throwaway cloud sandbox and runs the unit + Playwright e2e suites
  against the *running* app.

The same container images run locally via `docker compose`, get exercised
per-commit in a Daytona sandbox, and ship to AWS Fargate in production.

## Two ways to use this repo

This repo is a **template you can clone wholesale** — and it stays that way. But
assume the more common case is the **candy store**: another agent (or human)
comes in, looks around, and *pulls a piece out* — the Daytona harness, the
external-service policy, the Playwright A/V testing setup, the Fargate deploy
scripts, a single config — and grafts it into a different repo.

Both are first-class. The rule that makes the candy store safe is below.

### 🍬 Candy-store rule: if you take the candy, take the wrapper

Every part of this template was designed to ship **with its commit gates
attached**. If you lift a slice of this repo into another project, you **must
bring the full commit-gate pipeline with it** — not just the feature code. A
feature pulled out of here without its gates is a regression: it silently drops
the secret-scanning, SAST, coverage, and CVE checks that made it safe to commit
in the first place.

Concretely, when you pull something out, carry **all** of these along (see
[The commit gates](#the-commit-gates) for what each one does):

- `.husky/pre-commit` and `.husky/post-commit` — the hook entry points
- the `lint-staged` block **and** `resolutions` block in `package.json`
- `scripts/check-patterns.sh`, `scripts/check-staged-coverage.mjs`,
  `scripts/security/*` — the gate implementations
- `.secretlintrc.json`, `.secretlintignore`, `.osv-scanner.toml`,
  `eslint.config.js`, `vitest.config.ts` — the gate configs
- `playwright.config.ts` **and** `playwright.config.test.ts` (the guard that
  keeps artifact capture from silently reverting) if you take any e2e
- the matching dev-dependencies (`husky`, `lint-staged`, `secretlint`, the
  eslint plugins, `vitest`, `@vitest/coverage-v8`)
- the host tools the gates shell out to: **Semgrep** (SAST) and **OSV-Scanner**
  (dependency CVEs) — installed by `scripts/security/install-security-tools.sh`

Run `bash scripts/verify-setup.sh` in the destination repo to confirm every gate
file and dependency landed. **Do not** disable a gate to make a transplant
commit go green — fix the code, or bring the missing config. `--no-verify` is
never the answer (see [CLAUDE.md](CLAUDE.md#git-commit-rules)).

If you take the **e2e Daytona loop**, also read
[the e2e Daytona policy](#the-e2e-daytona-policy) — it has its own rules about
determinism and which tests are allowed on the per-commit hot path.

## Quick start (clone-the-whole-thing path)

```bash
yarn install            # install dependencies + set up husky hooks
yarn e2e:install        # one-time: install the Chromium build for Playwright
yarn dev                # start the frontend dev server
yarn build              # build all packages
yarn test               # unit tests (vitest)
yarn e2e                # Playwright e2e against the containerized app
cp .env.example .env    # paste your DAYTONA_API_KEY to enable the e2e loop
yarn daytona:loop       # deploy HEAD to a Daytona sandbox, run unit+e2e, report
```

## Package structure

- `packages/frontend` — React + TypeScript frontend with Tailwind CSS (Vite)
- `packages/backend` — Node + TypeScript API. Runs as a container (an HTTP
  server, `src/server.ts`); deployed to **AWS Fargate** in production, not Lambda.

## The commit gates

These run automatically on `git commit` via `.husky/pre-commit` (lint-staged
fans them out by staged file type) and the `check-patterns.sh` step. **They are
the product.** Every one of them must travel with any code you extract.

| Gate | Tool / script | Runs on | What it blocks |
|---|---|---|---|
| Secret scanning | `secretlint` | `*.ts`, `*.tsx` | committed credentials/keys |
| SAST | `scripts/security/check-sast.sh` (Semgrep) | `*.ts`, `*.tsx` | insecure code patterns |
| Lint | `eslint --max-warnings 0` | `*.ts`, `*.tsx` | lint errors **and warnings** |
| Build | `yarn build` | `*.ts`, `*.tsx`, `package.json` | code that doesn't compile |
| Unit tests + coverage | `yarn test:coverage` (vitest) | `*.ts`, `*.tsx`, `package.json` | failing tests / below-threshold coverage |
| Per-file coverage | `yarn check-staged-coverage` | `*.ts`, `*.tsx` | a staged file under its coverage bar |
| Dependency CVEs | `scripts/security/check-dependencies.sh` (OSV-Scanner) | `yarn.lock`, `package-lock.json` | known-vulnerable dependencies |
| Pattern / fallback audit | `scripts/check-patterns.sh` | any staged change | duplicated patterns, reinvented systems, needless fallbacks |

`yarn deploy` runs the same images you tested onto AWS Fargate (ECR + ECS + ALB +
IAM + S3, provisioned by Terraform under `deployment/`); `yarn teardown` removes
everything it created. Local/dev runs the identical images via `docker compose up`.

## The e2e Daytona policy

The e2e story has a single guiding rule: **the per-commit Daytona loop must stay
deterministic, key-free, and fast.** Everything below follows from it.

1. **Write e2e as part of TDD.** For every feature, write Playwright e2e specs
   (`*.spec.ts` in `e2e/`) alongside the unit tests (`*.test.ts`), not after.
2. **The loop deploys, it doesn't just compile.** After a commit, `yarn
   daytona:loop` boots a warm BASE snapshot, injects the just-committed source,
   boots the app (frontend + backend + the MinIO S3 mock) as localhost
   processes, and runs unit + e2e against the **running** app. It hands back a
   machine-readable `<daytona-loop-result>` PASS/FAIL with logs and Playwright
   traces. On FAIL you read the returned logs/traces under `.daytona/runs/<runId>/`
   and fix before re-committing. See [docs/daytona-loop.md](docs/daytona-loop.md).
3. **No real external services on the per-commit path.** External dependencies
   are classified up front (see
   [docs/external-services.md](docs/external-services.md)):
   - **Incidental → mock it.** Mock the service behind an env-driven endpoint
     switch (S3 → MinIO in `s3Client.ts` is the gold standard;
     `anthropicClient.ts` mirrors it for the LLM). The loop runs against the mock.
   - **Essential (real LLM, etc.) → separate tier, off the hot path.** Tests that
     hit a real external service live in their own tier
     (`e2e/llm.spec.ts`, run via `yarn e2e:llm`), gated behind **both**
     `ANTHROPIC_API_KEY` (capability) and `RUN_LLM_E2E=1` (intent). Inside the
     per-commit loop they **skip-loud** — they never silently pass and never
     require a key. Run them nightly or on an explicit label, never per-commit.
4. **Design real-external tests for non-determinism.** Use structured / judge
   output, pin model IDs, and run deterministic pre-checks before the costly LLM
   call. Misconfiguration must **skip-loud or fail-loud**, never pass quietly.
5. **Artifacts are always-on.** `playwright.config.ts` uses
   `screenshot`/`trace`/`video: 'on'`, so a green run returns the same rich
   artifact set as a red one. `playwright.config.test.ts` guards this so it can't
   silently revert to `*-on-failure`. Audio/animation/video assertions:
   [docs/playwright-av-testing.md](docs/playwright-av-testing.md) (headless needs
   `--autoplay-policy=no-user-gesture-required`, set globally in launchOptions).
6. **Pin Playwright to the base image.** `@playwright/test` is pinned (not `*`)
   so it matches the browsers baked into the Daytona base snapshot — read
   [docs/e2e-testing.md](docs/e2e-testing.md) before bumping it.

**Credentials live in the main work tree.** `DAYTONA_API_KEY` (and optional
`DAYTONA_*` overrides / `DAYTONA_POST_COMMIT`) go in a gitignored `.env` in the
**main checkout**, never in a card worktree. Both `yarn daytona:loop` and the
post-commit hook resolve `.env` from the main work tree, so the loop runs
identically from `main` or any `card/<short-id>` worktree.

## Documentation

- [CLAUDE.md](CLAUDE.md) — how an agent works in this template (read first)
- [docs/daytona-loop.md](docs/daytona-loop.md) — the per-commit e2e loop: design, failure-report format, measured numbers
- [docs/external-services.md](docs/external-services.md) — mock-vs-call-for-real policy (read before adding any external dependency)
- [docs/e2e-testing.md](docs/e2e-testing.md) — Playwright conventions, failure artifacts, Daytona alignment
- [docs/playwright-av-testing.md](docs/playwright-av-testing.md) — asserting on audio, animation, and video
- [docs/deploy.md](docs/deploy.md) — production deploy & Fargate topology
- [docs/containers.md](docs/containers.md) — local/dev containers
- [docs/aws-mocks.md](docs/aws-mocks.md) — AWS service mocks (MinIO for S3)
