import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAnthropicConfig,
  getAnthropicClient,
  getModelName,
  isLlmConfigured,
} from './anthropicClient';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildAnthropicConfig', () => {
  it('targets a custom base URL when ANTHROPIC_BASE_URL is set (mock)', () => {
    const config = buildAnthropicConfig({
      ANTHROPIC_BASE_URL: 'http://mock-llm:4010',
      ANTHROPIC_API_KEY: 'sk-real',
    });

    expect(config).toEqual({
      apiKey: 'sk-real',
      baseURL: 'http://mock-llm:4010',
    });
  });

  it('falls back to a placeholder key for a mock endpoint with no key', () => {
    const config = buildAnthropicConfig({
      ANTHROPIC_BASE_URL: 'http://mock-llm:4010',
    });

    expect(config.baseURL).toBe('http://mock-llm:4010');
    expect(config.apiKey).toBe('mock-endpoint-no-key-required');
  });

  it('targets the real API (no base URL) when ANTHROPIC_BASE_URL is absent (prod)', () => {
    const config = buildAnthropicConfig({ ANTHROPIC_API_KEY: 'sk-real' });

    expect(config).toEqual({ apiKey: 'sk-real' });
    expect(config).not.toHaveProperty('baseURL');
  });

  it('treats empty-string env (compose passthrough) as unset', () => {
    const config = buildAnthropicConfig({
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_BASE_URL: '',
    });

    expect(config).toEqual({ apiKey: 'mock-endpoint-no-key-required' });
    expect(config).not.toHaveProperty('baseURL');
  });
});

describe('getModelName', () => {
  it('returns the configured model', () => {
    expect(getModelName({ ANTHROPIC_MODEL: 'claude-opus-4-8' })).toBe(
      'claude-opus-4-8',
    );
  });

  it('defaults to a small fast model when ANTHROPIC_MODEL is unset', () => {
    expect(getModelName({})).toBe('claude-haiku-4-5-20251001');
  });

  it('defaults when ANTHROPIC_MODEL is an empty string', () => {
    expect(getModelName({ ANTHROPIC_MODEL: '' })).toBe(
      'claude-haiku-4-5-20251001',
    );
  });
});

describe('isLlmConfigured', () => {
  it('is true when a real key is present', () => {
    expect(isLlmConfigured({ ANTHROPIC_API_KEY: 'sk-real' })).toBe(true);
  });

  it('is true when only a mock endpoint is present', () => {
    expect(isLlmConfigured({ ANTHROPIC_BASE_URL: 'http://mock-llm:4010' })).toBe(
      true,
    );
  });

  it('is false when neither key nor endpoint is present', () => {
    expect(isLlmConfigured({})).toBe(false);
  });

  it('is false when both env vars are empty strings (compose passthrough)', () => {
    expect(
      isLlmConfigured({ ANTHROPIC_API_KEY: '', ANTHROPIC_BASE_URL: '' }),
    ).toBe(false);
  });

  it('is true when the key is empty but a mock endpoint is set', () => {
    expect(
      isLlmConfigured({
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_BASE_URL: 'http://mock-llm:4010',
      }),
    ).toBe(true);
  });
});

describe('getAnthropicClient', () => {
  it('returns the same cached client instance across calls', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    expect(getAnthropicClient()).toBe(getAnthropicClient());
  });
});
