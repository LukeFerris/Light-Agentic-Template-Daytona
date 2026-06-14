import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleRequest, startServer } from './server';
import { route } from './router';

vi.mock('./router', () => ({
  route: vi.fn(async () => ({ statusCode: 200, body: { ok: true } })),
}));

interface MockRes {
  writeHead: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

/**
 * Builds a readable stream that doubles as an IncomingMessage for the tests.
 * @param method - HTTP method
 * @param url - Request URL
 * @returns A mock incoming request
 */
function makeReq(method: string, url: string): IncomingMessage {
  const stream = new PassThrough() as unknown as IncomingMessage;
  stream.method = method;
  stream.url = url;
  stream.headers = { host: 'localhost' };
  return stream;
}

const makeRes = (): MockRes => ({ writeHead: vi.fn(), end: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleRequest', () => {
  it('answers OPTIONS preflight with 204', async () => {
    const req = makeReq('OPTIONS', '/storage');
    const res = makeRes();
    await handleRequest(req, res as unknown as ServerResponse);
    expect(res.writeHead).toHaveBeenCalledWith(204, expect.anything());
    expect(res.end).toHaveBeenCalledWith();
    expect(route).not.toHaveBeenCalled();
  });

  it('reads the body, routes the request and serializes the response', async () => {
    const req = makeReq('POST', '/storage?key=k');
    const res = makeRes();
    const pending = handleRequest(req, res as unknown as ServerResponse);
    req.emit('data', Buffer.from('{"value":"v"}'));
    req.emit('end');
    await pending;

    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/storage',
        query: { key: 'k' },
        body: '{"value":"v"}',
      }),
    );
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
    expect(JSON.parse((res.end.mock.calls[0] as string[])[0])).toEqual({ ok: true });
  });

  it('defaults method and path when absent', async () => {
    const req = makeReq('GET', '/health');
    Reflect.deleteProperty(req, 'method');
    Reflect.deleteProperty(req, 'url');
    const res = makeRes();
    const pending = handleRequest(req, res as unknown as ServerResponse);
    req.emit('end');
    await pending;
    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/' }),
    );
  });

});

describe('handleRequest edge cases', () => {
  it('writes an empty string when the router returns a null body', async () => {
    vi.mocked(route).mockResolvedValueOnce({ statusCode: 204, body: null });
    const req = makeReq('DELETE', '/storage');
    const res = makeRes();
    const pending = handleRequest(req, res as unknown as ServerResponse);
    req.emit('end');
    await pending;
    expect(res.end).toHaveBeenCalledWith('');
  });

  it('returns 500 when the router throws', async () => {
    vi.mocked(route).mockRejectedValueOnce(new Error('boom'));
    const req = makeReq('GET', '/storage');
    const res = makeRes();
    const pending = handleRequest(req, res as unknown as ServerResponse);
    req.emit('end');
    await pending;
    expect(res.writeHead).toHaveBeenCalledWith(500, expect.anything());
    expect(JSON.parse((res.end.mock.calls[0] as string[])[0])).toMatchObject({
      error: 'Internal server error',
      message: 'boom',
    });
  });
});

describe('startServer', () => {
  it('starts listening and can be closed', async () => {
    const server = startServer(0);
    await new Promise((resolve) => server.on('listening', resolve));
    expect(server.address()).not.toBeNull();
    await new Promise((resolve) => server.close(resolve));
  });
});
