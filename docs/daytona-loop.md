# Post-commit Daytona deploy-test-report loop

This is the harness that closes the template's TDD loop: **after a commit, deploy
the solution to a throwaway cloud sandbox, run the unit + e2e suites against the
running app, and hand a machine-readable pass/fail + logs back to the agent.** A
change that breaks an e2e test produces a red report (with the Playwright
trace/screenshot and container logs to fix from); a passing change reports green.

```
commit ──► boot warm BASE snapshot ──► inject just-committed source
        ──► build + boot app (frontend + backend + S3 mock) ──► unit + e2e
        ──► pull report + artifacts ──► tear sandbox down ──► PASS / FAIL
```

## Quick start

```bash
cp .env.example .env          # paste your DAYTONA_API_KEY (app.daytona.io, $200 free credit)
yarn daytona:loop             # runs the loop for HEAD
yarn daytona:loop --commit <sha>   # or a specific commit
```

First run bakes the base snapshot **and** has to wait for it to warm onto a
runner — measured at ~4–5 min of "No available runners" retries before the first
boot, which the harness rides out automatically. Once warm, the same snapshot
boots in ~1s and a full pass/fail cycle is ~10–25s. Output: a
`<daytona-loop-result>` block on stdout plus a full `summary.json` and all
artifacts under `.daytona/runs/<runId>/` (gitignored).

Measured end-to-end (this template, 1 vCPU / 2 GiB): cold first boot ~265s
(snapshot warming), warm boot ~1.3s, in-sandbox build + boot + unit + e2e ~7–20s.

### As a real post-commit hook (opt-in)

`.husky/post-commit` runs the loop automatically, but only when
`DAYTONA_POST_COMMIT=1` is set (so commits stay fast and offline by default):

```bash
echo "DAYTONA_POST_COMMIT=1" >> .env     # plus DAYTONA_API_KEY
```

The hook is non-blocking — it never rejects the commit, it only reports.

## How it works

### The BASE snapshot (`scripts/daytona/snapshot.Dockerfile`)

One snapshot bakes the slow, dependency-only parts of a run: the OS, Playwright +
its browsers (`FROM mcr.microsoft.com/playwright:v1.60.0-jammy`, so browsers are
**never downloaded per run**), the workspace `node_modules`, and the MinIO S3
mock. The harness names the snapshot from a **hash of the Dockerfile + `yarn.lock`
+ the workspace manifests + resources**, so it is rebuilt **only when dependencies
change** — never on source changes. Snapshot baking therefore stays off the
per-commit hot path, which is what the spike found matters: freshly-baked
snapshots intermittently fail to schedule ("No available runners"), while a warm
base boots in ~1s.

Bump `@playwright/test` and the base image tag together (see
[e2e-testing.md](e2e-testing.md)); a changed lockfile transparently triggers a
one-time snapshot rebuild on the next run.

### Per-commit run (`scripts/daytona/harness.mjs` + `sandbox-run.sh`)

1. **Boot** a sandbox from the warm base (ephemeral, with `autoStopInterval` as a
   backstop), retrying with backoff on the intermittent "No available runners".
2. **Inject source** — `git archive <commit>` is uploaded and extracted over the
   baked `/app`, so the baked `node_modules` is reused and only the
   just-committed source is fresh. (We upload the committed tree rather than
   `git clone` so unpushed local commits work.)
3. **Build + boot + test** in-sandbox via `sandbox-run.sh`: build the frontend +
   backend, start them plus the MinIO mock as localhost processes, then run
   `yarn test:run` (vitest) and `yarn e2e` (Playwright). Playwright detects the
   already-running app and **skips its docker-compose `webServer`**
   (`reuseExistingServer: true`), running in-box against `localhost` — the
   spike's "model 1", zero preview-token friction. A preview URL is still
   captured in `summary.json` for external/cross-browser checks if ever needed.
4. **Report** — pull back `results.json`, the JUnit report, every service log,
   and (on failure) the Playwright `test-results/` traces & screenshots; collapse
   them into a `PASS`/`FAIL` plus the agent-facing `<daytona-loop-result>` block.
5. **Tear down** — always delete the sandbox so parallel agent commits don't leak
   spend (`KEEP_SANDBOX=1` to keep one for debugging).

### Why in-box processes, not docker-compose-in-sandbox

The app is defined by `docker-compose.yml`, but a Daytona sandbox ships no Docker
daemon, runs as a non-root user, and has a small writable disk — so building and
running the compose stack per commit is the slow, fragile path. The base-snapshot
+ copy-in model the spike proved (bake `node_modules` + browsers, boot the app as
localhost processes, Playwright in-box) is fast (~seconds), cheap (~$0.0001–0.0004
/run), and reliable. Production still ships the real containers to Fargate (see
[deploy.md](deploy.md)); this loop is the fast inner gate, not the production
artifact.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `DAYTONA_API_KEY` | — | **Required.** Daytona API key. |
| `DAYTONA_API_URL` | SDK default | Override the API endpoint. |
| `DAYTONA_CPU` / `DAYTONA_MEMORY` / `DAYTONA_DISK` | `1` / `2` / `5` | Snapshot resources. This is the shape the spike proved places reliably; larger boxes intermittently get "No available runners". |
| `DAYTONA_BOOT_RETRY_SECONDS` | `600` | How long to retry "No available runners" while a freshly-baked snapshot warms onto a runner. |
| `REBUILD_SNAPSHOT` | off | Force a fresh base snapshot. |
| `KEEP_SANDBOX` | off | Leave the sandbox running for debugging. |
| `DAYTONA_POST_COMMIT` | off | Enable the `.husky/post-commit` loop. |

> **"No available runners".** This is Daytona's #1 operational risk (see the
> spike). It is intermittent and applies to *custom snapshots* specifically — the
> default image always places instantly. The harness rides it out with a patient
> retry budget; a cold snapshot can take several minutes to first place, then
> boots in ~1s thereafter. The `us` region is not available to every org; the
> harness lets Daytona auto-place rather than pinning a region. For predictable
> capacity, self-host a runner.

## Reading a failure report

The `<daytona-loop-result>` block names the failing stage (`build` / `unit` /
`e2e`) and the artifact directory. Under `.daytona/runs/<runId>/`:

- `.daytona-run/e2e.log`, `unit.log`, `build.log` — the suite output,
- `.daytona-run/backend.log`, `frontend.log`, `minio.log` — the container/service
  logs to diagnose a runtime failure,
- `test-results/` — Playwright trace (`npx playwright show-trace`), screenshot,
  and video for each failed e2e test,
- `summary.json` — the full structured record (timings, JUnit roll-up, exit codes).
