# End-to-end testing (Playwright)

E2e tests drive the **containerized app** in a real browser and assert on
user-visible behaviour. They are part of the TDD loop: write the e2e test
alongside (or before) the feature, make it green locally, and the Daytona
per-commit loop re-runs the same tests in a sandbox and feeds artifacts back on
failure.

> **These specs are _integration_ tests, despite the file name.** In the
> per-commit loop they drive an app whose external services are **mocked** (S3 →
> MinIO, the LLM → a mock endpoint), so a green run proves your seams hold
> against stand-ins — not that the system works against real providers. That
> "nothing-mocked" proof is a separate _full-e2e_ tier. The naming and the line
> between the two live in [integration-vs-e2e.md](integration-vs-e2e.md); this
> doc is the **how-to-write-the-spec** mechanics, which are identical either way.

> Not every card needs an e2e spec — which tests a card needs (unit, e2e, or a
> one-off "did it deploy?" check) is decided up front with the engineer; see
> [test-strategy.md](test-strategy.md). This doc is how you write the e2e spec
> **when the card calls for one.**

## Where tests live

```
e2e/                     # all Playwright specs (top-level, NOT under packages/)
  home.spec.ts           # reference: UI flow through the browser
  api.spec.ts            # reference: API-level checks via the request fixture
playwright.config.ts     # single config for local + sandbox runs
test-results/            # traces / screenshots / videos / junit.xml — every run (gitignored)
playwright-report/        # HTML report (gitignored)
```

- One spec per feature/flow, named `<feature>.spec.ts`.
- Specs live in `e2e/` so they are **excluded from vitest** (see
  `vitest.config.ts`) and from the staged-coverage gate — unit tests
  (`*.test.ts`) stay with the code under `packages/`, e2e tests stay here.

## Conventions for agent-authored tests

- Navigate with **relative paths** (`page.goto('/')`); the origin comes from
  `baseURL` in `playwright.config.ts`.
- Assert on **user-visible** text and roles (`getByRole`, `getByText`) with
  web-first `expect(...)`, which auto-retries — avoid manual sleeps and
  implementation-detail selectors.
- Use the **`request` fixture** for HTTP-only checks (health, API contracts) —
  faster than spinning up a page.
- Assert both **status and body shape** for API calls.
- Verifying **audio / animation / video** (incl. subjective "is it animating?"
  checks) has its own tiered guide — prefer deterministic media-clock/pixel
  signals, reserve an LLM judge for the perceptual residue:
  [playwright-av-testing.md](playwright-av-testing.md).

## Running locally

```bash
yarn e2e:install     # one-time: download the Chromium build for @playwright/test
yarn e2e             # brings up docker-compose, runs the suite, tears it down
yarn e2e:report      # open the HTML report from the last run
```

`yarn e2e` uses the `webServer` block in the config to run `docker compose up
--build` and waits for the frontend on <http://localhost:8080>. If the stack is
**already running** (locally or in a sandbox) it is reused, not rebuilt.

Point the tests at an already-running app instead of compose:

```bash
E2E_BASE_URL=http://localhost:8080 E2E_API_URL=http://localhost:3000 yarn e2e
```

- `E2E_BASE_URL` — the frontend (SPA) origin the browser drives. Default
  `http://localhost:8080` (compose publishes nginx there).
- `E2E_API_URL` — the backend origin for API-level specs. Default
  `http://localhost:3000` (compose publishes the Node server there).

## Run artifacts (for the harness feedback loop)

Capture is **always-on**, so the config writes these under `test-results/` on
**every** run — pass or fail — not just on failure:

- **trace** (`trace: 'on'`) — open with `npx playwright show-trace`,
- **screenshot** (`screenshot: 'on'`),
- **video** (`video: 'on'`),
- **`junit.xml`** — machine-readable results for the harness to parse.

Why always-on rather than the Playwright-default `*-on-failure`: a green run
produces nothing under `*-on-failure`, so a passing commit can't be inspected the
way a failing one can. `'on'` makes the Daytona loop hand back the same rich set
on PASS and FAIL. It is heavier per run (notably `video: 'on'`); the trade-off and
how to dial it back if the suite grows are covered in
[daytona-loop.md](daytona-loop.md#always-on-artifact-capture-cost-trade-off).

## Container / Daytona loop alignment

The Daytona per-commit loop boots a **warm BASE snapshot** and copies the
just-committed source in — it does not bake an image per commit. That base image
is built `FROM mcr.microsoft.com/playwright:v1.60.0-*`, so Chromium and the
other browsers ship inside it and are **never downloaded per run**.

Because of that, `@playwright/test` in `package.json` is **pinned to `1.60.0`**
to match the base image tag. When you bump it, bump the base image tag in
lockstep (and vice-versa) — a mismatch makes Playwright re-download browsers (or
fail) inside the sandbox. This is the one dependency the template pins on
purpose; everything else tracks latest.

Other loop-aligned settings in `playwright.config.ts`:

- `launchOptions.chromiumSandbox: false` — Chromium runs as root in the
  container, where its setuid sandbox can't start.
- `junit` reporter + always-on trace/screenshot/video into `test-results/` — the
  harness pulls these on every run to feed back to the agent (PASS or FAIL).
- `reuseExistingServer: true` — in-sandbox the app is already up, so the compose
  `webServer` command is skipped and the tests run straight against it.

The harness that drives this loop — bake the base snapshot, copy the commit in,
run unit + e2e, report back — is documented in
[docs/daytona-loop.md](daytona-loop.md) (`yarn daytona:loop`).
