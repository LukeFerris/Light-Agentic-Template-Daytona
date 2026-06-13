import { test, expect } from '@playwright/test';

/**
 * Reference REQUIRED-REAL external e2e tier.
 *
 * Unlike the S3-backed `/storage` endpoint (which runs against a mock container
 * in the per-commit loop), this tier calls the **real** Anthropic API to assert
 * on behavior a mock cannot fake — the "we actually need to perfect the prompt"
 * case. It is therefore quarantined OFF the deterministic Daytona loop and only
 * runs when BOTH gates are open:
 *
 *   - capability: `ANTHROPIC_API_KEY` is present, and
 *   - intent:     `RUN_LLM_E2E=1` is set explicitly.
 *
 * A leaked key alone must not start spending money or introducing flake, hence
 * the second, deliberate flag. Run it with `yarn e2e:llm`. When the gates are
 * shut the whole file skips with a visible reason, so a green loop never
 * masquerades as having exercised the real path. See docs/external-services.md.
 */

const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3000';
const llmEnabled =
  process.env.RUN_LLM_E2E === '1' && Boolean(process.env.ANTHROPIC_API_KEY);

test.describe('LLM summarize (real Anthropic call)', () => {
  test.skip(
    !llmEnabled,
    'Gated tier: set RUN_LLM_E2E=1 and ANTHROPIC_API_KEY to run (off by default so the per-commit Daytona loop stays deterministic and key-free).',
  );

  test('summarizes input text into a shorter, on-topic sentence', async ({
    request,
  }) => {
    const text =
      'The quick brown fox jumps over the lazy dog. The dog was sleeping in the warm afternoon sun and did not stir as the fox bounded past the old wooden fence and into the meadow beyond.';

    const res = await request.post(`${apiURL}/summarize`, { data: { text } });

    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    // Structured shape — assert mechanically, not on exact prose.
    expect(typeof body.summary).toBe('string');
    expect(body.summary.length).toBeGreaterThan(0);
    expect(typeof body.model).toBe('string');
    // A summary should be shorter than the source, and stay on topic.
    expect(body.summary.length).toBeLessThan(text.length);
    expect(body.summary.toLowerCase()).toContain('fox');
  });
});
