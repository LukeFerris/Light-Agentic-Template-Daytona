import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk';

/**
 * Default model for LLM calls. A small, fast model keeps the gated real-LLM
 * e2e tier cheap; override with `ANTHROPIC_MODEL` when a task needs more
 * capability (e.g. a multimodal judge). See docs/external-services.md.
 */
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Builds the Anthropic client configuration from environment variables.
 *
 * This is the single point where the app chooses between a **mocked** LLM
 * endpoint and the **real** Anthropic API — by config only, never by branching
 * in application logic. It is the LLM analogue of the S3 `S3_ENDPOINT` switch
 * (see {@link ../aws/s3Client}):
 *
 * - When `ANTHROPIC_BASE_URL` is set, the client targets that endpoint. Point it
 *   at a local stub that speaks the Messages API to keep tests deterministic and
 *   offline — the "mocked endpoint" path the per-commit Daytona loop relies on.
 * - When `ANTHROPIC_BASE_URL` is absent, the client targets the real Anthropic
 *   API. This is the "required real" path used by the gated `e2e/llm.spec.ts`
 *   tier and by production.
 *
 * `ANTHROPIC_API_KEY` is the credential. A mock endpoint typically ignores auth,
 * so when only `ANTHROPIC_BASE_URL` is set we pass a placeholder key purely so
 * the SDK constructor does not throw — it is never sent anywhere real.
 *
 * @param env - Environment variables to read configuration from
 * @returns Anthropic client configuration
 */
export function buildAnthropicConfig(
  env: NodeJS.ProcessEnv = process.env,
): ClientOptions {
  // Treat an empty string the same as unset: container/compose env passes
  // absent variables through as "" (e.g. ANTHROPIC_* defaulted to empty on the
  // deterministic path), and "" is not a usable endpoint or key. `||` collapses
  // both to the unset behavior.
  const baseURL = env.ANTHROPIC_BASE_URL || undefined;
  // A mock endpoint needs no real key; fall back to a placeholder so the SDK
  // constructor is happy. The real path always carries a genuine key.
  const apiKey = env.ANTHROPIC_API_KEY || 'mock-endpoint-no-key-required';

  if (baseURL) {
    return { apiKey, baseURL };
  }

  return { apiKey };
}

/**
 * Returns the model id to use for LLM calls.
 * @param env - Environment variables to read configuration from
 * @returns Model id from `ANTHROPIC_MODEL`, defaulting to {@link DEFAULT_MODEL}
 */
export function getModelName(env: NodeJS.ProcessEnv = process.env): string {
  // `||` so an empty ANTHROPIC_MODEL (passed through by compose) falls back to
  // the default rather than becoming an empty model id.
  return env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

/**
 * Reports whether an LLM backend is configured at all.
 *
 * True when either a real key (`ANTHROPIC_API_KEY`) or a mock endpoint
 * (`ANTHROPIC_BASE_URL`) is present. When neither is set the app has no LLM to
 * talk to, and callers should degrade gracefully rather than fail — this is how
 * the sandbox stays coherent without a key. See the `/summarize` handler.
 *
 * @param env - Environment variables to read configuration from
 * @returns Whether an LLM backend (real or mock) is available
 */
export function isLlmConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  // `||` so empty-string env (compose passes absent vars as "") counts as unset:
  // an empty key with a real mock endpoint is still configured, and a wholly
  // empty env is not.
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_BASE_URL);
}

let cachedClient: Anthropic | undefined;

/**
 * Returns a lazily-created, process-wide Anthropic client built from the
 * environment. Only call this once {@link isLlmConfigured} is true. The same
 * client is reused across invocations to avoid re-creating connections.
 * @returns A configured Anthropic client
 */
export function getAnthropicClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic(buildAnthropicConfig());
  }
  return cachedClient;
}
