import { test, expect } from '@playwright/test';

/**
 * Reference API-level e2e test.
 *
 * Hits the backend container directly with Playwright's `request` fixture (no
 * browser), the way the SPA's browser code does. In docker-compose the backend
 * is published on its own origin, so it is addressed via E2E_API_URL rather than
 * the frontend baseURL.
 *
 * Pattern for agent-authored API tests:
 *   - use the `request` fixture for HTTP-only checks (fast, no page)
 *   - assert status AND body shape
 */

// Backend origin. Compose publishes the Node server on 3000.
const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3000';

test('health endpoint reports ok', async ({ request }) => {
  const res = await request.get(`${apiURL}/health`);

  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ status: 'ok' });
});

test('hello endpoint returns a message and timestamp', async ({ request }) => {
  const res = await request.get(`${apiURL}/hello`);

  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(body.message).toBe('Hello from Light Agentic Template');
  // ISO-8601 timestamp the frontend renders.
  expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
});
