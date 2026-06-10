import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type OutgoingHttpHeaders,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { handler } from './index';

const PORT = Number(process.env.PORT ?? 3000);

/**
 * Reads the full request body as a string.
 * @param req - Incoming HTTP request
 * @returns The request body, or null when empty
 */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () =>
      resolve(chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : null),
    );
    req.on('error', reject);
  });
}

/**
 * Builds a minimal API Gateway proxy event from a Node HTTP request so the
 * same Lambda handler can run unchanged inside a container.
 * @param req - Incoming HTTP request
 * @param body - Request body (or null)
 * @returns An API Gateway proxy event
 */
function toProxyEvent(
  req: IncomingMessage,
  body: string | null,
): APIGatewayProxyEvent {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    queryStringParameters[key] = value;
  });
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(',');
  }

  return {
    httpMethod: req.method ?? 'GET',
    path: url.pathname,
    queryStringParameters:
      Object.keys(queryStringParameters).length > 0
        ? queryStringParameters
        : null,
    headers,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    body,
    isBase64Encoded: false,
    resource: url.pathname,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
  };
}

/**
 * Builds a minimal Lambda context carrying a unique request id.
 * @returns A Lambda execution context
 */
function makeContext(): Context {
  return { awsRequestId: randomUUID() } as Context;
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  void (async () => {
    try {
      // Lightweight health probe used by container orchestrators.
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      const body = await readBody(req);
      const event = toProxyEvent(req, body);
      const result: APIGatewayProxyResult = await handler(event, makeContext());

      // API Gateway header values may be boolean; Node's writeHead only accepts
      // string/number/string[], so coerce booleans to strings.
      const headers: OutgoingHttpHeaders = { 'Content-Type': 'application/json' };
      for (const [key, value] of Object.entries(result.headers ?? {})) {
        headers[key] = typeof value === 'boolean' ? String(value) : value;
      }
      res.writeHead(result.statusCode, headers);
      res.end(result.body ?? '');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Internal server error',
          message: err instanceof Error ? err.message : 'Unknown error',
        }),
      );
    }
  })();
});

server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
