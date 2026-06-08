import type { APIGatewayProxyResult } from 'aws-lambda';
import { getHelloMessage } from '../services/helloService';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

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
