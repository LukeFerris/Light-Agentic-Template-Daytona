---
name: build-new-app
description: |
  **Build a new application (general / non-CVC)**: Starts a new app or project
  using the Light Agentic Template (Daytona) as the reference — a fullstack
  TypeScript template with a non-negotiable commit-gate pipeline and a
  Daytona-driven, container-first e2e loop. Read the template's README and
  CLAUDE.md to decide what to pull in.
  Trigger: "build me a new app", "start a new project", "scaffold an app",
  "create a web app / fullstack app / API", or any request to begin a brand-new
  application.
  Do NOT use this skill when the user asks for a **CVC** app / internal tool, or
  says "CVC" anywhere — that has its own skill (`use-cvc-setup`). This skill is
  the default for every other "build me an app" request.
---

# Build a new application (from the Light Agentic Template)

The user wants to build a new application and has **not** asked for a CVC app. Your
reference is the **Light Agentic Template (Daytona)** — a lightweight fullstack
TypeScript template (React + Vite + Tailwind frontend, containerized Node API
backend) built to be driven by Claude Code agents. You read from it to decide what
to graft into the user's project; you do **not** build inside the template itself.

> **Wrong skill?** If the user mentioned **CVC** (a CVC app, internal tool, or CVC
> guardrails), stop and use `use-cvc-setup` instead — that path has its own
> reference repo and mandatory pipeline. This skill is for every other new-app
> request.

## Step 1: Clone the reference template (use the remote URL — do not look locally)

Clone the template to a temporary location and read from it. **Always clone from the
remote URL** — do not assume a local checkout exists on this machine:

```bash
git clone https://github.com/LukeFerris/Light-Agentic-Template-Daytona.git /tmp/light-agentic-template --depth 1
TEMPLATE_DIR=/tmp/light-agentic-template
```

For the rest of this skill, `$TEMPLATE_DIR` refers to this cloned copy. Read from it;
never modify it, and never build the user's app inside it.

## Step 2: Read the README and CLAUDE.md FIRST — they decide what you pull in

Before scaffolding anything, **read these two files in full**:

- `$TEMPLATE_DIR/README.md`
- `$TEMPLATE_DIR/CLAUDE.md`

They are the map of the template. Together they tell you:

- **What slices exist** to pull in — the commit-gate pipeline, the Daytona-driven
  per-commit e2e loop, the external-service (mock vs. call-for-real) policy, the
  Playwright A/V testing setup, the container-first / Fargate deploy scripts, and
  the individual configs.
- **How each slice is wired** and which files, scripts, dev-dependencies, and host
  tools each one depends on.
- **The candy-store rule** (below), which governs how you extract any slice.

Do not guess what to copy from the file tree — let the README and CLAUDE.md drive the
decision. They also point at deeper docs under `$TEMPLATE_DIR/docs/` (the Daytona
loop, external-services policy, e2e testing, A/V testing, deploy, containers) — read
the ones relevant to what you're pulling in.

## Step 3: Decide — whole template, or a slice?

There are two first-class ways to use the template. Pick based on what the user wants:

- **Clone-the-whole-thing.** The user wants a fresh fullstack TypeScript app and is
  happy with the template's stack. Start from the whole template: copy it into the
  target, re-point the remote, and adapt. Follow the README's "Quick start".
- **Candy store (a slice).** The user already has a stack/repo, or wants only one
  capability (e.g. just the commit gates, just the Daytona e2e loop, just the A/V
  testing setup). Extract that slice into the target repo.

If it's unclear which the user wants, ask — and ask which stack they're targeting if
they're not adopting the template's React + Node setup.

## Step 4: 🍬 The candy-store rule — if you take the candy, take the wrapper

This is the one non-negotiable rule when extracting **any** slice. Every part of the
template was designed to ship **with its commit gates attached**. When you lift a
slice into another project, you **must bring the full commit-gate pipeline with it**,
not just the feature code. A feature pulled out without its gates is a regression: it
silently drops the secret-scanning, SAST, coverage, and CVE checks that made it safe
to commit.

The template's README has the authoritative extraction checklist — read it and carry
**all** of it. At the time of writing it lists:

- `.husky/pre-commit` and `.husky/post-commit` — the hook entry points
- the `lint-staged` block **and** `resolutions` block in `package.json`
- `scripts/check-patterns.sh`, `scripts/check-staged-coverage.mjs`,
  `scripts/security/*` — the gate implementations
- `.secretlintrc.json`, `.secretlintignore`, `.osv-scanner.toml`,
  `eslint.config.js`, `vitest.config.ts` — the gate configs
- `playwright.config.ts` **and** `playwright.config.test.ts` (the guard that keeps
  artifact capture from silently reverting) if you take any e2e
- the matching dev-dependencies (`husky`, `lint-staged`, `secretlint`, the eslint
  plugins, `vitest`, `@vitest/coverage-v8`)
- the host tools the gates shell out to: **Semgrep** (SAST) and **OSV-Scanner**
  (dependency CVEs) — installed by `scripts/security/install-security-tools.sh`

The README is the source of truth — if it has changed, follow the README, not this
list. Then run the template's own verifier in the destination repo to confirm every
gate file and dependency landed:

```bash
bash scripts/verify-setup.sh
```

**Never disable a gate to make a transplant commit go green** — bring the missing
config or fix the code. `--no-verify` is never the answer. If the target repo already
has a partial pipeline, fill the gaps rather than replacing what works.

## Step 5: If you take the e2e Daytona loop, take its policy too

The per-commit Daytona loop has its own rules. If you pull it in, read the **e2e
Daytona policy** section in the README (and `$TEMPLATE_DIR/docs/daytona-loop.md` and
`docs/external-services.md`). The short version:

- **The per-commit loop must stay deterministic, key-free, and fast.**
- **No real external services on the per-commit path.** Classify every external
  dependency up front: *incidental* services are **mocked** behind an env-driven
  endpoint switch (S3 → MinIO in `s3Client.ts` is the gold standard;
  `anthropicClient.ts` mirrors it for the LLM), and the loop runs against the mock.
- **Essential real-service tests** (real LLM, etc.) live in a **separate tier**, gated
  behind both a capability key and an intent flag (e.g. `ANTHROPIC_API_KEY` +
  `RUN_LLM_E2E=1`); inside the loop they **skip-loud** — never silently pass, never
  require a key.
- **Artifacts are always-on** (`screenshot`/`trace`/`video: 'on'`).
- `DAYTONA_API_KEY` lives in a gitignored `.env` in the **main checkout**, never in a
  worktree.

## Step 6: Build in the target repo, commit, verify

- Do the work in the **target** project, never in `$TEMPLATE_DIR`.
- Adopt the template's working discipline: write unit tests (`*.test.ts`, vitest) and
  Playwright e2e (`*.spec.ts`) alongside each feature (TDD), and end each completed
  piece of work with a clean commit through the full gate pipeline.
- After wiring slices, run `bash scripts/verify-setup.sh` (if you took the gates) and
  the project's `yarn build` / `yarn test` / `yarn lint` to confirm everything is
  green.

## Step 7: Run the Daytona loop as the closing gate — billing is pre-accepted

If you pulled in the Daytona e2e loop, `yarn daytona:loop` is the **mandatory closing
gate** for the build: after the work is committed it deploys HEAD to a throwaway
Daytona sandbox and runs unit + e2e against the *running* app, proving the commit
actually runs and not just compiles. A build is not "done" until the loop reports
PASS.

**The Daytona billing for this loop is pre-accepted. Do NOT pause to ask the user to
confirm or approve the cost, and do NOT skip the loop to avoid charges.** Running
`yarn daytona:loop` is expected and authorized on every new app build. The only
acceptable reasons not to run it are that the project genuinely did not adopt the
Daytona loop, or that `DAYTONA_API_KEY` is absent from the main checkout's `.env`
(see Step 5) — in which case say so plainly rather than silently skipping the gate.

- Run it once the working tree is clean and committed:

  ```bash
  yarn daytona:loop
  ```

- On a `<daytona-loop-result>` FAIL, read the returned container logs and Playwright
  traces under `.daytona/runs/<runId>/`, fix the issue, re-commit, and re-run. Repeat
  until the loop is green.

## Commit discipline (carried from the template)

**NEVER use `--no-verify` when committing.** The pre-commit gates are the product. If
a hook fails:

1. Fix the issue in the code — even if it's in files you didn't write.
2. If it truly cannot be fixed through code changes, stop and explain to the user.
3. Do not bypass, skip, disable, or modify the hooks under any circumstances.

## Cleanup

If you cloned the template to `/tmp`, remove it when done:

```bash
rm -rf /tmp/light-agentic-template
```

Do not delete a local copy that existed before this skill ran.
