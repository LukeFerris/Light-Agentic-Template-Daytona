import type Anthropic from '@anthropic-ai/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { summarize } from './llmService';

/**
 * Builds a fake Anthropic client whose `messages.create` is a vitest mock.
 * @param impl - Implementation for the mocked `messages.create` call
 * @returns A fake Anthropic client usable in place of the real one
 */
function fakeClient(impl: (args: unknown) => unknown): Anthropic {
  return {
    messages: { create: vi.fn(impl) },
  } as unknown as Anthropic;
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('summarize', () => {
  it('sends the text to the configured model and returns the joined text blocks', async () => {
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-opus-4-8');
    const client = fakeClient(() => ({
      content: [
        { type: 'text', text: 'A concise summary.' },
        { type: 'tool_use', name: 'noop', input: {} },
      ],
    }));

    const result = await summarize('a long passage of text', client);

    expect(result).toEqual({ summary: 'A concise summary.', model: 'claude-opus-4-8' });

    const args = vi.mocked(client.messages.create).mock.calls[0][0] as {
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(args.model).toBe('claude-opus-4-8');
    expect(args.messages[0].role).toBe('user');
    expect(args.messages[0].content).toContain('a long passage of text');
  });

  it('trims whitespace and ignores non-text content blocks', async () => {
    const client = fakeClient(() => ({
      content: [{ type: 'text', text: '  spaced summary  ' }],
    }));

    const result = await summarize('text', client);

    expect(result.summary).toBe('spaced summary');
  });

  it('returns an empty summary when the model produces no text blocks', async () => {
    const client = fakeClient(() => ({ content: [] }));

    const result = await summarize('text', client);

    expect(result.summary).toBe('');
  });
});
