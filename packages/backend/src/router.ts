import type { ApiRequest, ApiResponse } from './http/types';
import { handleHello } from './handlers/hello';
import { handleStorage } from './handlers/storage';
import { handleLlm } from './handlers/llm';

const STAGE_SEGMENTS = new Set(['prod', 'dev', 'staging']);

/**
 * Normalizes a request path by dropping any query string and a leading API
 * Gateway stage segment (e.g. `/prod/hello` → `/hello`), so the router can match
 * the same routes whether it runs behind API Gateway or the local dev server.
 * @param path - The raw request path.
 * @returns The normalized path beginning with a single leading slash.
 */
function normalizePath(path: string): string {
  const clean = path.split('?')[0] ?? '/';
  const segments = clean.split('/').filter(Boolean);
  if (segments.length > 0 && STAGE_SEGMENTS.has(segments[0])) {
    segments.shift();
  }
  return `/${segments.join('/')}`;
}

/**
 * The framework-agnostic application router. It takes a normalized request and
 * returns a normalized response, with no knowledge of Lambda or Node `http`, so
 * the Lambda adapter and the dev server can share one routing table.
 * @param request - The normalized inbound request.
 * @returns The normalized response to serialize back to the client.
 */
export async function route(request: ApiRequest): Promise<ApiResponse> {
  const path = normalizePath(request.path);

  if (path === '/health') {
    return { statusCode: 200, body: { status: 'ok' } };
  }

  if (path === '/hello') {
    return handleHello(request.requestId);
  }

  if (path === '/storage') {
    return handleStorage(request);
  }

  if (path === '/summarize') {
    return handleLlm(request);
  }

  return { statusCode: 404, body: { error: 'Not found', path: request.path } };
}
