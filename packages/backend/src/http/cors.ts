/**
 * CORS and content headers attached to every API response, shared by the Lambda
 * adapter (`index.ts`) and the local development server (`server.ts`). CORS is
 * open so the browser frontend can call the backend cross-origin in the compose
 * topology.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};
