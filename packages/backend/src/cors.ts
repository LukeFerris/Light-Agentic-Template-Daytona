/**
 * Shared CORS headers applied to every API response. CORS is open so the
 * browser frontend can call the backend cross-origin in the compose topology.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};
