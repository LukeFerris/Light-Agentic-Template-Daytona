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
    message: 'HELLO BADGER!',
    timestamp: new Date().toISOString(),
  };
}
