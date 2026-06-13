import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient, getModelName } from './llm/anthropicClient';

/**
 * Result of an LLM summarization.
 */
export interface SummaryResult {
  summary: string;
  model: string;
}

/** Cap the response so a runaway model can't blow the request budget. */
const MAX_TOKENS = 256;

/**
 * Summarizes a piece of text with the configured model.
 *
 * This runs unchanged against a mocked Messages endpoint and the real Anthropic
 * API; only the client configuration differs (see {@link getAnthropicClient}).
 * Because it talks to a real external when unmocked, the e2e coverage for the
 * real path lives in the gated `e2e/llm.spec.ts` tier, not the per-commit loop.
 *
 * @param text - The text to summarize
 * @param client - Anthropic client to use (defaults to the shared, env-configured client)
 * @returns The one-sentence summary and the model that produced it
 */
export async function summarize(
  text: string,
  client: Anthropic = getAnthropicClient(),
): Promise<SummaryResult> {
  const model = getModelName();
  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: `Summarize the following text in a single concise sentence. Respond with only the sentence, no preamble.\n\n${text}`,
      },
    ],
  });

  const summary = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  return { summary, model };
}
