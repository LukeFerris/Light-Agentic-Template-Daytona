import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { CORS_HEADERS } from './http/cors';
import { route } from './router';

/**
 * AWS Lambda adapter. Translates an API Gateway event into the normalized
 * request the shared router understands, then serializes its response back into
 * an API Gateway result.
 * @param event - API Gateway proxy event
 * @param context - Lambda execution context
 * @returns API Gateway proxy result
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const result = await route({
    method: event.httpMethod,
    path: event.path,
    query: event.queryStringParameters ?? {},
    body: event.body,
    requestId: context.awsRequestId,
  });

  return {
    statusCode: result.statusCode,
    headers: CORS_HEADERS,
    body: result.body === null ? '' : JSON.stringify(result.body),
  };
}
