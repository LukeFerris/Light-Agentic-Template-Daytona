import { test, expect } from '@playwright/test';

/**
 * Reference UI e2e test.
 *
 * Drives the real browser against the containerized SPA and asserts the full
 * wiring works: the page renders AND the message it shows came back from the
 * backend API (proving frontend -> backend connectivity end to end).
 *
 * Pattern for agent-authored UI tests:
 *   - navigate with a relative path (baseURL comes from playwright.config.ts)
 *   - assert on user-visible text/roles, not implementation details
 *   - prefer getByRole / getByText with web-first `expect` (auto-retries)
 */
test('home page loads and shows the message from the API', async ({ page }) => {
  await page.goto('/');

  // The static shell renders immediately.
  await expect(
    page.getByRole('heading', { name: 'Light Agentic Template' }),
  ).toBeVisible();

  // This text only appears once the /hello API call resolves, so seeing it
  // proves the browser reached the backend through the container network.
  await expect(
    page.getByText('HELLO BADGER!'),
  ).toBeVisible();

  // The API error banner must NOT be present on a healthy stack.
  await expect(page.getByText('API Error')).toBeHidden();
});
