import type { ApiRequest, ApiResponse } from '../http/types';
import { isLlmConfigured } from '../services/llm/anthropicClient';
import { summarize } from '../services/llmService';

/**
 * Handles `POST /summarize` — summarizes `{ text }` with the configured LLM.
 *
 * Demonstrates a **required-real** external dependency (an Anthropic LLM). When
 * no LLM is configured the endpoint returns 503 rather than crashing, so the app
 * stays coherent in the key-free per-commit Daytona loop. The real path is
 * exercised by the gated `e2e/llm.spec.ts` tier. See docs/external-services.md.
 *
 * @param request - Normalized inbound request
 * @returns Response with the summary, or 400/405/503
 */
export async function handleLlm(request: ApiRequest): Promise<ApiResponse> {
  if (request.method !== 'POST') {
    return { statusCode: 405, body: { error: 'Method not allowed' } };
  }

  if (!isLlmConfigured()) {
    return {
      statusCode: 503,
      body: {
        error: 'LLM not configured',
        detail:
          'Set ANTHROPIC_API_KEY (real) or ANTHROPIC_BASE_URL (mock) to enable /summarize.',
      },
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(request.body ?? '');
  } catch {
    return { statusCode: 400, body: { error: 'Invalid JSON body' } };
  }

  const { text } = (payload ?? {}) as Record<string, unknown>;
  if (typeof text !== 'string' || text.trim() === '') {
    return {
      statusCode: 400,
      body: { error: 'Body must include a non-empty string "text"' },
    };
  }

  const result = await summarize(text);
  return { statusCode: 200, body: result };
}
