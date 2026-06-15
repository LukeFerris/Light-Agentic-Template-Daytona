// Entry point for the gated real-LLM e2e tier (`yarn e2e:llm`).
//
// Resolves ANTHROPIC_API_KEY the same way the Daytona harness resolves
// DAYTONA_API_KEY — process env -> gitignored .env (worktree, then main work
// tree) -> macOS Keychain — then runs the gated spec with RUN_LLM_E2E=1.
//
// The resolved key + intent flag flow to two places via the inherited env:
//   - e2e/llm.spec.ts, whose gate checks RUN_LLM_E2E and ANTHROPIC_API_KEY, and
//   - the docker-compose backend (the Playwright webServer), which forwards
//     ANTHROPIC_API_KEY into the container so /summarize can make the real call.
//
// Keeping this in a .mjs (not playwright.config.ts) means the gated, normally
// un-exercised resolution never drags a config file below its coverage bar.

import { spawnSync } from 'node:child_process';
import { resolveSecret } from './lib/secrets.mjs';

resolveSecret('ANTHROPIC_API_KEY');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    'ANTHROPIC_API_KEY is not set — the real-LLM e2e tier needs it.\n' +
      'Provide it any of these ways (checked in this order): export ANTHROPIC_API_KEY, ' +
      'put it in a gitignored .env, or store it once in the macOS login Keychain:\n' +
      "  security add-generic-password -a \"$USER\" -s ANTHROPIC_API_KEY -w 'sk-ant-...'\n" +
      'See .env.example / docs/external-services.md.',
  );
  process.exit(2);
}

const result = spawnSync(
  'npx',
  ['playwright', 'test', 'e2e/llm.spec.ts'],
  { stdio: 'inherit', env: { ...process.env, RUN_LLM_E2E: '1' } },
);

process.exit(result.status ?? 1);
