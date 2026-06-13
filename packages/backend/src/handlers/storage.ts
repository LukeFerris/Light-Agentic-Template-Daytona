import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { jsonResponse as respond } from '../cors';
import { getObject, putObject } from '../services/storageService';

/**
 * Handles `POST /storage` — stores a `{ key, value }` pair in object storage.
 * @param event - API Gateway proxy event
 * @returns API Gateway response echoing the stored key, or a 400 on bad input
 */
async function handlePost(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  let payload: unknown;
  try {
    payload = JSON.parse(event.body ?? '');
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const { key, value } = (payload ?? {}) as Record<string, unknown>;
  if (typeof key !== 'string' || typeof value !== 'string') {
    return respond(400, { error: 'Body must include string "key" and "value"' });
  }

  await putObject(key, value);
  return respond(201, { key });
}

/**
 * Handles `GET /storage?key=...` — retrieves a stored value by key.
 * @param event - API Gateway proxy event
 * @returns API Gateway response with the stored object, or 400/404
 */
async function handleGet(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const key = event.queryStringParameters?.key;
  if (!key) {
    return respond(400, { error: 'Query parameter "key" is required' });
  }

  const stored = await getObject(key);
  if (!stored) {
    return respond(404, { error: 'Not found', key });
  }
  return respond(200, stored);
}

/**
 * Routes the storage endpoint by HTTP method. Demonstrates an AWS S3 round-trip
 * that runs identically against the mock container and real AWS.
 * @param event - API Gateway proxy event
 * @returns API Gateway response
 */
export async function handleStorage(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'POST') {
    return handlePost(event);
  }
  if (event.httpMethod === 'GET') {
    return handleGet(event);
  }
  return respond(405, { error: 'Method not allowed' });
}
