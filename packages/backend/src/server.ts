import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import { CORS_HEADERS } from './http/cors';
import { route } from './router';

const DEFAULT_PORT = 3000;

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
 * Handles a single HTTP request by translating it into the normalized request
 * the shared router understands, then writing the router's response back. The
 * Node `http` counterpart to the Lambda adapter in `index.ts`. Exported so it
 * can be unit-tested without binding a real socket.
 * @param req - Incoming HTTP request
 * @param res - Outgoing HTTP response
 * @returns A promise that resolves once the response has been sent
 */
export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  try {
    const body = await readBody(req);
    const url = new URL(
      req.url ?? '/',
      `http://${req.headers.host ?? 'localhost'}`,
    );
    const query: Record<string, string | undefined> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    const result = await route({
      method: req.method ?? 'GET',
      path: url.pathname,
      query,
      body,
      requestId: randomUUID(),
    });

    res.writeHead(result.statusCode, CORS_HEADERS);
    res.end(result.body === null ? '' : JSON.stringify(result.body));
  } catch (err) {
    res.writeHead(500, CORS_HEADERS);
    res.end(
      JSON.stringify({
        error: 'Internal server error',
        message: err instanceof Error ? err.message : 'Unknown error',
      }),
    );
  }
}

/**
 * Creates and starts the local development / container HTTP server. The server
 * runs the SAME router that the Lambda adapter uses, so local `dev` and
 * production behave identically.
 * @param port - TCP port to listen on; defaults to the PORT env var or 3000
 * @returns The started HTTP server instance
 */
export function startServer(
  port = Number(process.env.PORT) || DEFAULT_PORT,
): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handleRequest(req, res);
  });
  server.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
  return server;
}
