import { beforeEach, describe, expect, it, vi } from 'vitest';
import { route } from './router';
import type { ApiRequest } from './http/types';
import { handleStorage } from './handlers/storage';
import { handleLlm } from './handlers/llm';

// The storage and LLM handlers reach external services; mock them so the router
// test stays focused on routing. The pure hello handler runs for real.
vi.mock('./handlers/storage', () => ({
  handleStorage: vi.fn(async () => ({ statusCode: 200, body: { stored: true } })),
}));
vi.mock('./handlers/llm', () => ({
  handleLlm: vi.fn(async () => ({ statusCode: 200, body: { summarized: true } })),
}));

/**
 * Builds a normalized request for the router tests.
 * @param method - HTTP method
 * @param path - Request path
 * @param overrides - Fields to override on the base request
 * @returns A normalized API request
 */
function req(
  method: string,
  path: string,
  overrides: Partial<ApiRequest> = {},
): ApiRequest {
  return { method, path, query: {}, body: null, requestId: 'rid-1', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('route', () => {
  it('serves the health probe', async () => {
    const res = await route(req('GET', '/health'));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('serves health behind a stage prefix', async () => {
    expect((await route(req('GET', '/prod/health'))).statusCode).toBe(200);
  });

  it('ignores a query string when matching the path', async () => {
    expect((await route(req('GET', '/hello?lang=en'))).statusCode).toBe(200);
  });

  it('routes /hello and threads the request id through', async () => {
    const res = await route(req('GET', '/hello'));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ requestId: 'rid-1' });
  });

  it('routes /storage to the storage handler', async () => {
    const res = await route(req('POST', '/storage'));
    expect(handleStorage).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('routes /summarize to the LLM handler', async () => {
    const res = await route(req('POST', '/summarize'));
    expect(handleLlm).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 with the original path for unknown routes', async () => {
    const res = await route(req('GET', '/nope'));
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ path: '/nope' });
  });
});
