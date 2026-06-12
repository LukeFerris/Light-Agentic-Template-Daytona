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
   and the Playwright `test-results/` screenshots, traces & video; collapse them
   into a `PASS`/`FAIL` plus the agent-facing `<daytona-loop-result>` block.
   Capture is **always-on** (`screenshot`/`trace`/`video: 'on'` in
   `playwright.config.ts`), so a green run returns the **same rich artifact set**
   as a red one — the block points at `test-results/` on PASS as well as FAIL.
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

### Known issue: "No available runners"

This is Daytona's #1 operational risk (see the spike). Daytona's own tracker
([daytonaio/daytona#2523](https://github.com/daytonaio/daytona/issues/2523))
confirms the generic error actually covers **two different causes**:

1. **Snapshot propagation** — a newly-built snapshot takes *"2-5 minutes to
   propagate"* to the runners before it can be scheduled. This is a **one-time,
   per-snapshot** cost (i.e. once per dependency change, since the snapshot is
   keyed on the lockfile). The default image never hits this because it is
   already on every runner.
2. **Capacity** — sometimes the shared fleet simply has no free runner. This is
   random, unrelated to our image, and can recur on any run.

Measured here: the first boot after a bake stalled ~4.5 min (propagation), then
booted in ~1s — including a cold boot the **next morning** after the runner had
recycled, which confirms propagation is durable, not a per-machine re-warm. The
harness rides both causes out with a patient retry budget
(`DAYTONA_BOOT_RETRY_SECONDS`, default 600). So: expect the *first* run after any
dependency change to take a few minutes; steady-state runs are ~1s. A multi-minute
stall on a run where dependencies did **not** change is the capacity case — the
durable fix for which is a **dedicated/self-hosted runner** (Daytona's
[job-based runners + custom regions](https://www.daytona.io/changelog/job-based-runners-custom-regions)),
not anything in this harness. Note the `us` region is not available to every org;
the harness lets Daytona auto-place rather than pinning one.

## Reading a run report (PASS or FAIL)

Every run — green or red — returns the same artifacts under `.daytona/runs/<runId>/`,
so a passing commit is as inspectable as a failing one:

- `.daytona-run/e2e.log`, `unit.log`, `build.log` — the suite output,
- `.daytona-run/backend.log`, `frontend.log`, `minio.log` — the container/service
  logs to diagnose a runtime failure,
- `test-results/` — Playwright trace (`npx playwright show-trace`), screenshot,
  and video for **every** e2e test (capture is always-on — see below),
- `summary.json` — the full structured record (timings, JUnit roll-up, exit codes).

The `<daytona-loop-result>` block carries an `<artifacts>` path (the run dir) and a
`<test-artifacts>` path (the `test-results/` dir) on both outcomes; on FAIL it also
names the failing stage (`build` / `unit` / `e2e`) and points you at the logs and
trace to diagnose from.

### Always-on artifact capture (cost trade-off)

`playwright.config.ts` sets `screenshot`, `trace` and `video` to `'on'` rather than
the Playwright-default `*-on-failure`. With `*-on-failure`, a green run produces no
screenshots/traces/video at all — there is nothing to bundle, so a passing commit
cannot be inspected the way a failing one can. `'on'` captures them on every test
regardless of outcome, which is what lets the loop hand back a uniform artifact set.

The trade-off is weight: `video: 'on'` records a screencast of **every** test (and
tracing adds a per-test `trace.zip`), so each run does more I/O and the
`artifacts.tgz` is larger than a logs-only FAIL bundle was. We accept it because:

- the sandbox is **ephemeral and torn down each run**, so the cost is bounded
  sandbox time + a one-off download, never accumulating cloud storage;
- the local `.daytona/runs/<runId>/` dir is **gitignored**, so artifacts never
  bloat the repo — old run dirs can be deleted freely;
- the suite is small (a couple of reference specs), so the absolute size and the
  extra in-sandbox seconds are minor at this scale.

If the e2e suite grows large enough that always-on video dominates run time or
download size, dial `video` back to `'retain-on-failure'` (or `'on-first-retry'`)
while keeping `trace`/`screenshot` on — that keeps cheap artifacts always-on and
makes only the heavy one failure-only.
