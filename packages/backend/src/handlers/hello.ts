import type { ApiResponse } from '../http/types';
import { getHelloMessage } from '../services/helloService';

/**
 * Handles the hello REST endpoint.
 * @param requestId - Correlation id for the request
 * @returns Normalized response with the hello message
 */
export function handleHello(requestId: string): ApiResponse {
  const result = getHelloMessage();
  return {
    statusCode: 200,
    body: { ...result, requestId },
  };
}
