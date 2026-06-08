/**
 * Result of the hello service.
 */
export interface HelloResult {
  message: string;
  timestamp: string;
}

/**
 * Returns a hello message with the current timestamp.
 * @returns Hello result containing message and timestamp
 */
export function getHelloMessage(): HelloResult {
  return {
    message: 'Hello from Light Agentic Template',
    timestamp: new Date().toISOString(),
  };
}
