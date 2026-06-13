import type { APIGatewayProxyResult } from 'aws-lambda';

/**
 * Shared CORS headers applied to every API response. CORS is open so the
 * browser frontend can call the backend cross-origin in the compose topology.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

/**
 * Builds a JSON API Gateway response with the shared CORS headers. The single
 * response builder used by every handler.
 * @param statusCode - HTTP status code
 * @param body - Response payload to serialize as JSON
 * @returns API Gateway response
 */
export function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}
