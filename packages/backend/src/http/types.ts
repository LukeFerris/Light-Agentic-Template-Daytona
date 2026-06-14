/**
 * A normalized inbound HTTP request, decoupled from the Lambda event shape and
 * the Node `http` server so the shared router can serve both transports.
 */
export interface ApiRequest {
  /** Uppercase HTTP method (e.g. `GET`, `POST`). */
  method: string;
  /** Request path, without a query string (e.g. `/storage`). */
  path: string;
  /** Parsed query-string parameters. */
  query: Record<string, string | undefined>;
  /** Raw request body, or null when there is none. */
  body: string | null;
  /** A correlation id for the request (Lambda request id or a generated UUID). */
  requestId: string;
}

/**
 * A normalized HTTP response produced by the router. Adapters serialize the
 * body to JSON and attach transport-specific headers.
 */
export interface ApiResponse {
  /** HTTP status code. */
  statusCode: number;
  /** Response payload; serialized to JSON by the adapter. `null` means no body. */
  body: unknown;
}
