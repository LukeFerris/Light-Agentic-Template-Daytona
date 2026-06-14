import type { ApiRequest, ApiResponse } from '../http/types';
import { getObject, putObject } from '../services/storageService';

/**
 * Handles `POST /storage` — stores a `{ key, value }` pair in object storage.
 * @param request - Normalized inbound request
 * @returns Response echoing the stored key, or a 400 on bad input
 */
async function handlePost(request: ApiRequest): Promise<ApiResponse> {
  let payload: unknown;
  try {
    payload = JSON.parse(request.body ?? '');
  } catch {
    return { statusCode: 400, body: { error: 'Invalid JSON body' } };
  }

  const { key, value } = (payload ?? {}) as Record<string, unknown>;
  if (typeof key !== 'string' || typeof value !== 'string') {
    return {
      statusCode: 400,
      body: { error: 'Body must include string "key" and "value"' },
    };
  }

  await putObject(key, value);
  return { statusCode: 201, body: { key } };
}

/**
 * Handles `GET /storage?key=...` — retrieves a stored value by key.
 * @param request - Normalized inbound request
 * @returns Response with the stored object, or 400/404
 */
async function handleGet(request: ApiRequest): Promise<ApiResponse> {
  const key = request.query.key;
  if (!key) {
    return {
      statusCode: 400,
      body: { error: 'Query parameter "key" is required' },
    };
  }

  const stored = await getObject(key);
  if (!stored) {
    return { statusCode: 404, body: { error: 'Not found', key } };
  }
  return { statusCode: 200, body: stored };
}

/**
 * Routes the storage endpoint by HTTP method. Demonstrates an AWS S3 round-trip
 * that runs identically against the mock container and real AWS.
 * @param request - Normalized inbound request
 * @returns The handler's response
 */
export async function handleStorage(request: ApiRequest): Promise<ApiResponse> {
  if (request.method === 'POST') {
    return handlePost(request);
  }
  if (request.method === 'GET') {
    return handleGet(request);
  }
  return { statusCode: 405, body: { error: 'Method not allowed' } };
}
