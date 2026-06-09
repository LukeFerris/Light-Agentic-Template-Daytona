import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleStorage } from './storage';
import { getObject, putObject } from '../services/storageService';

vi.mock('../services/storageService', () => ({
  putObject: vi.fn(),
  getObject: vi.fn(),
}));

/**
 * Builds a minimal API Gateway event for the storage handler tests.
 * @param overrides - Fields to override on the base event
 * @returns An API Gateway proxy event
 */
function event(
  overrides: Partial<APIGatewayProxyEvent>,
): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    queryStringParameters: null,
    body: null,
    ...overrides,
  } as APIGatewayProxyEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleStorage POST', () => {
  it('stores the value and returns 201 with the key', async () => {
    const res = await handleStorage(
      event({ httpMethod: 'POST', body: JSON.stringify({ key: 'k', value: 'v' }) }),
    );

    expect(putObject).toHaveBeenCalledWith('k', 'v');
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toEqual({ key: 'k' });
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const res = await handleStorage(event({ httpMethod: 'POST', body: 'not json' }));

    expect(res.statusCode).toBe(400);
    expect(putObject).not.toHaveBeenCalled();
  });

  it('returns 400 when key or value is missing', async () => {
    const res = await handleStorage(
      event({ httpMethod: 'POST', body: JSON.stringify({ key: 'k' }) }),
    );

    expect(res.statusCode).toBe(400);
    expect(putObject).not.toHaveBeenCalled();
  });
});

describe('handleStorage GET', () => {
  it('returns 200 with the stored object', async () => {
    vi.mocked(getObject).mockResolvedValue({ key: 'k', value: 'v' });

    const res = await handleStorage(
      event({ httpMethod: 'GET', queryStringParameters: { key: 'k' } }),
    );

    expect(getObject).toHaveBeenCalledWith('k');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ key: 'k', value: 'v' });
  });

  it('returns 400 when the key query parameter is missing', async () => {
    const res = await handleStorage(event({ httpMethod: 'GET' }));

    expect(res.statusCode).toBe(400);
    expect(getObject).not.toHaveBeenCalled();
  });

  it('returns 404 when the key does not exist', async () => {
    vi.mocked(getObject).mockResolvedValue(null);

    const res = await handleStorage(
      event({ httpMethod: 'GET', queryStringParameters: { key: 'missing' } }),
    );

    expect(res.statusCode).toBe(404);
  });
});

describe('handleStorage other methods', () => {
  it('returns 405 for unsupported methods', async () => {
    const res = await handleStorage(event({ httpMethod: 'DELETE' }));
    expect(res.statusCode).toBe(405);
  });
});
