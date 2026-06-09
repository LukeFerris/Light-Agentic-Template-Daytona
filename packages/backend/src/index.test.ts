import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from './index';
import { handleStorage } from './handlers/storage';

vi.mock('./handlers/storage', () => ({
  handleStorage: vi.fn(async () => ({ statusCode: 200, body: '{"ok":true}' })),
}));

const context = { awsRequestId: 'req-1' } as Context;

/**
 * Builds a minimal API Gateway event for the router tests.
 * @param overrides - Fields to override on the base event
 * @returns An API Gateway proxy event
 */
function event(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return { httpMethod: 'GET', path: '/', ...overrides } as APIGatewayProxyEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handler routing', () => {
  it('short-circuits OPTIONS preflight with 204', async () => {
    const res = await handler(event({ httpMethod: 'OPTIONS' }), context);
    expect(res.statusCode).toBe(204);
  });

  it('routes /hello to the hello handler', async () => {
    const res = await handler(event({ path: '/hello' }), context);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ requestId: 'req-1' });
  });

  it('routes /storage to the storage handler', async () => {
    const res = await handler(event({ path: '/storage', httpMethod: 'POST' }), context);
    expect(handleStorage).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('routes the stage-prefixed /prod/storage path too', async () => {
    await handler(event({ path: '/prod/storage' }), context);
    expect(handleStorage).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for unknown paths', async () => {
    const res = await handler(event({ path: '/nope' }), context);
    expect(res.statusCode).toBe(404);
  });
});
