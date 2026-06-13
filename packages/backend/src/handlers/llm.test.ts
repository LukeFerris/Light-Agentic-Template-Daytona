import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleLlm } from './llm';
import { isLlmConfigured } from '../services/llm/anthropicClient';
import { summarize } from '../services/llmService';

vi.mock('../services/llm/anthropicClient', () => ({
  isLlmConfigured: vi.fn(),
}));
vi.mock('../services/llmService', () => ({
  summarize: vi.fn(),
}));

/**
 * Builds a minimal API Gateway event for the LLM handler tests.
 * @param overrides - Fields to override on the base event
 * @returns An API Gateway proxy event
 */
function event(
  overrides: Partial<APIGatewayProxyEvent>,
): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    queryStringParameters: null,
    body: null,
    ...overrides,
  } as APIGatewayProxyEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isLlmConfigured).mockReturnValue(true);
});

describe('handleLlm', () => {
  it('returns 200 with the summary when configured', async () => {
    vi.mocked(summarize).mockResolvedValue({
      summary: 'A summary.',
      model: 'claude-haiku-4-5-20251001',
    });

    const res = await handleLlm(
      event({ body: JSON.stringify({ text: 'some text' }) }),
    );

    expect(summarize).toHaveBeenCalledWith('some text');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      summary: 'A summary.',
      model: 'claude-haiku-4-5-20251001',
    });
  });

  it('returns 503 when no LLM is configured (graceful degradation)', async () => {
    vi.mocked(isLlmConfigured).mockReturnValue(false);

    const res = await handleLlm(
      event({ body: JSON.stringify({ text: 'some text' }) }),
    );

    expect(res.statusCode).toBe(503);
    expect(summarize).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const res = await handleLlm(event({ body: 'not json' }));

    expect(res.statusCode).toBe(400);
    expect(summarize).not.toHaveBeenCalled();
  });

  it('returns 400 when text is missing or empty', async () => {
    const res = await handleLlm(event({ body: JSON.stringify({ text: '   ' }) }));

    expect(res.statusCode).toBe(400);
    expect(summarize).not.toHaveBeenCalled();
  });

  it('returns 405 for non-POST methods', async () => {
    const res = await handleLlm(event({ httpMethod: 'GET' }));

    expect(res.statusCode).toBe(405);
    expect(summarize).not.toHaveBeenCalled();
  });
});
