import type { APIGatewayProxyResult } from 'aws-lambda';
import { CORS_HEADERS } from '../cors';
import { getHelloMessage } from '../services/helloService';

/**
 * Handles the hello REST endpoint.
 * @param requestId - AWS Lambda request ID
 * @returns API Gateway response with hello message
 */
export function handleHello(requestId: string): APIGatewayProxyResult {
  const result = getHelloMessage();
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ ...result, requestId }),
  };
}
