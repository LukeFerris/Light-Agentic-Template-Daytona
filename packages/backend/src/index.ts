import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { CORS_HEADERS } from './cors';
import { handleHello } from './handlers/hello';
import { handleStorage } from './handlers/storage';

/**
 * AWS Lambda handler that routes REST API requests.
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

  const path = event.path;

  if (path === '/hello' || path === '/prod/hello') {
    return handleHello(context.awsRequestId);
  }

  if (path === '/storage' || path === '/prod/storage') {
    return handleStorage(event);
  }

  return {
    statusCode: 404,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Not found', path }),
  };
}
