import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { jsonResponse as respond } from '../cors';
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
 * @param event - API Gateway proxy event
 * @returns API Gateway response with the summary, or 400/405/503
 */
export async function handleLlm(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  if (!isLlmConfigured()) {
    return respond(503, {
      error: 'LLM not configured',
      detail:
        'Set ANTHROPIC_API_KEY (real) or ANTHROPIC_BASE_URL (mock) to enable /summarize.',
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(event.body ?? '');
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const { text } = (payload ?? {}) as Record<string, unknown>;
  if (typeof text !== 'string' || text.trim() === '') {
    return respond(400, { error: 'Body must include a non-empty string "text"' });
  }

  const result = await summarize(text);
  return respond(200, result);
}
