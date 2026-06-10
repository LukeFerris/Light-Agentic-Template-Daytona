import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    // Playwright e2e specs live in e2e/ and use @playwright/test, not vitest.
    // Keep vitest's defaults but never let it try to run them.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      reporter: ['text', 'json-summary'],
    },
  },
});
