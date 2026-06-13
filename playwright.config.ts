import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e configuration for the containerized app.
 *
 * The same config runs in two places:
 *   - Locally: `yarn e2e` brings up the docker-compose stack (frontend +
 *     backend + S3 mock) via the `webServer` block below, then runs the tests
 *     against it.
 *   - In a Daytona sandbox (the per-commit TDD loop): the harness boots the app
 *     from the warm BASE snapshot and copies the source in, so the app is
 *     already listening. `reuseExistingServer` detects that and skips the
 *     compose build. Point the tests elsewhere with E2E_BASE_URL / E2E_API_URL.
 *
 * Browsers are NOT downloaded per run inside the sandbox: the base snapshot is
 * built FROM mcr.microsoft.com/playwright:v1.60.0-* so the browsers ship with
 * the image. Keep `@playwright/test` in package.json pinned to that image tag
 * (1.60.0) — see docs/e2e-testing.md.
 */

// Frontend (SPA) origin the browser drives. Compose publishes nginx on 8080.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './e2e',
  // Traces, screenshots and videos land here on EVERY run (pass or fail) for the
  // harness to pull — a green commit is inspectable just like a red one.
  outputDir: './test-results',

  // Fail the run if a test was accidentally left as test.only in CI.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  fullyParallel: true,

  // `list` for humans/agents, `junit` for the harness to parse, `html` for
  // local debugging. JUnit + artifacts live under test-results/.
  reporter: [
    ['list'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL,
    // Always-on capture (not *-on-failure): the Daytona loop returns the full
    // artifact set on PASS as well as FAIL, so a passing commit can be inspected
    // — screenshot, trace and video — exactly like a failing one. This is heavier
    // per run (notably `video: 'on'`); the trade-off is documented in
    // docs/daytona-loop.md. The sandbox is ephemeral and torn down each run, so
    // the cost is bounded sandbox time, not accumulating storage.
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    launchOptions: {
      // Chromium runs as root inside the container, where its setuid sandbox
      // cannot start — disable it so tests run both locally and in-sandbox.
      chromiumSandbox: false,
      // MUST ALWAYS BE SET. Headless test runs have no user gesture, so the
      // browser's autoplay policy otherwise blocks <audio>/<video> from
      // starting on load — playback assertions would fail for a reason that
      // has nothing to do with the code under test. Setting it here (not
      // per-test) guarantees every spec inherits it. See
      // docs/playwright-av-testing.md.
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Bring the containerized app up locally; reused (not rebuilt) when something
  // is already listening on baseURL — e.g. an app already booted in the sandbox.
  webServer: {
    command: 'docker compose up --build',
    url: baseURL,
    reuseExistingServer: true,
    // Generous: a cold `docker compose up --build` rebuilds images (yarn install
    // inside the container) before the app answers. Reused instantly when up.
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
