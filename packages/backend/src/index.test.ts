import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from './index';
import { route } from './router';

vi.mock('./router', () => ({
  route: vi.fn(async () => ({ statusCode: 201, body: { created: true } })),
}));

const context = { awsRequestId: 'req-1' } as Context;

/**
 * Builds a minimal API Gateway event for the adapter tests.
 * @param overrides - Fields to override on the base event
 * @returns An API Gateway proxy event
 */
function event(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/',
    queryStringParameters: null,
    body: null,
    ...overrides,
  } as APIGatewayProxyEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('lambda adapter', () => {
  it('short-circuits OPTIONS preflight with 204 and no body', async () => {
    const res = await handler(event({ httpMethod: 'OPTIONS' }), context);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(route).not.toHaveBeenCalled();
  });

  it('normalizes the event into a request and serializes the response', async () => {
    const res = await handler(
      event({
        httpMethod: 'POST',
        path: '/storage',
        queryStringParameters: { key: 'k' },
        body: '{"value":"v"}',
      }),
      context,
    );

    expect(route).toHaveBeenCalledWith({
      method: 'POST',
      path: '/storage',
      query: { key: 'k' },
      body: '{"value":"v"}',
      requestId: 'req-1',
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toEqual({ created: true });
    expect(res.headers?.['Content-Type']).toBe('application/json');
  });

  it('defaults a null query to an empty object', async () => {
    await handler(event({ path: '/hello' }), context);
    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({ query: {} }),
    );
  });

  it('serializes a null router body to an empty string', async () => {
    vi.mocked(route).mockResolvedValueOnce({ statusCode: 204, body: null });
    const res = await handler(event({ path: '/x' }), context);
    expect(res.body).toBe('');
  });
});
