import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { handleHello } from './handlers/hello';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

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

  return {
    statusCode: 404,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Not found', path }),
  };
}
