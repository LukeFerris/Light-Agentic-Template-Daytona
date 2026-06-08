import { describe, it, expect } from 'vitest';
import { getHelloMessage } from './helloService';

describe('getHelloMessage', () => {
  it('returns a message and timestamp', () => {
    const result = getHelloMessage();
    expect(result.message).toBe('Hello from Light Agentic Template');
    expect(result.timestamp).toBeTruthy();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
