import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleStorage } from './storage';
import type { ApiRequest } from '../http/types';
import { getObject, putObject } from '../services/storageService';

vi.mock('../services/storageService', () => ({
  putObject: vi.fn(),
  getObject: vi.fn(),
}));

/**
 * Builds a normalized request for the storage handler tests.
 * @param overrides - Fields to override on the base request
 * @returns A normalized API request
 */
function request(overrides: Partial<ApiRequest>): ApiRequest {
  return {
    method: 'GET',
    path: '/storage',
    query: {},
    body: null,
    requestId: 'test-id',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleStorage POST', () => {
  it('stores the value and returns 201 with the key', async () => {
    const res = await handleStorage(
      request({ method: 'POST', body: JSON.stringify({ key: 'k', value: 'v' }) }),
    );

    expect(putObject).toHaveBeenCalledWith('k', 'v');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ key: 'k' });
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const res = await handleStorage(request({ method: 'POST', body: 'not json' }));

    expect(res.statusCode).toBe(400);
    expect(putObject).not.toHaveBeenCalled();
  });

  it('returns 400 when key or value is missing', async () => {
    const res = await handleStorage(
      request({ method: 'POST', body: JSON.stringify({ key: 'k' }) }),
    );

    expect(res.statusCode).toBe(400);
    expect(putObject).not.toHaveBeenCalled();
  });
});

describe('handleStorage GET', () => {
  it('returns 200 with the stored object', async () => {
    vi.mocked(getObject).mockResolvedValue({ key: 'k', value: 'v' });

    const res = await handleStorage(request({ method: 'GET', query: { key: 'k' } }));

    expect(getObject).toHaveBeenCalledWith('k');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ key: 'k', value: 'v' });
  });

  it('returns 400 when the key query parameter is missing', async () => {
    const res = await handleStorage(request({ method: 'GET' }));

    expect(res.statusCode).toBe(400);
    expect(getObject).not.toHaveBeenCalled();
  });

  it('returns 404 when the key does not exist', async () => {
    vi.mocked(getObject).mockResolvedValue(null);

    const res = await handleStorage(
      request({ method: 'GET', query: { key: 'missing' } }),
    );

    expect(res.statusCode).toBe(404);
  });
});

describe('handleStorage other methods', () => {
  it('returns 405 for unsupported methods', async () => {
    const res = await handleStorage(request({ method: 'DELETE' }));
    expect(res.statusCode).toBe(405);
  });
});
