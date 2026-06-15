// Shared secret/config resolution for the local tooling (the Daytona harness and
// the Playwright config). One place so the env / .env / Keychain logic is not
// duplicated. Pure Node, no dependencies.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Parse a gitignored .env (KEY=VALUE lines) into `env` without a dotenv
 * dependency. Existing values win (first-set wins), so a real process env never
 * gets clobbered by a .env file.
 * @param {string} root - Directory whose `.env` to read.
 * @param {NodeJS.ProcessEnv} [env] - Target env to populate (defaults to process.env).
 * @returns {void}
 */
export function loadDotenvFrom(root, env = process.env) {
  const path = join(root, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    const key = m[1];
    const val = m[2].replace(/^['"]|['"]$/g, '');
    if (!(key in env)) env[key] = val;
  }
}

/**
 * Read a secret from the macOS login Keychain (a generic password whose service
 * name is `service`). Returns the trimmed value, or null when the item is
 * absent, `security` isn't available, or the platform isn't macOS. Never throws.
 * @param {string} service - The Keychain item's service name (`-s`).
 * @returns {string|null} The stored secret, or null when unavailable.
 */
export function keychainSecret(service) {
  if (process.platform !== 'darwin') return null;
  try {
    const val = execFileSync(
      'security',
      ['find-generic-password', '-s', service, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return val || null;
  } catch {
    return null; // item not found (non-zero exit) or `security` unavailable
  }
}

/**
 * The roots whose `.env` the loop reads: `[repoRoot, mainWorkTreeRoot]`. In a
 * normal checkout both are the same and the list is deduped to one; in a per-card
 * git worktree they differ so the main checkout's `.env` is still found. Falls
 * back to the current working directory if git isn't available.
 * @returns {string[]} One or two directories to look for `.env` in.
 */
export function workTreeRoots() {
  try {
    const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();
    const main = dirname(
      execFileSync(
        'git',
        ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        { encoding: 'utf8' },
      ).trim(),
    );
    return repo === main ? [repo] : [repo, main];
  } catch {
    return [process.cwd()];
  }
}

/**
 * Resolve a single secret into `env` if it isn't already set, in order:
 * process env (left untouched if present) → `.env` at each of `roots` → the
 * macOS login Keychain. This is the one resolution order the whole toolchain
 * uses, so one key can be shared machine-wide with no per-repo `.env`.
 * @param {string} name - The variable / Keychain service name to resolve.
 * @param {{roots?: string[], env?: NodeJS.ProcessEnv}} [opts] - Roots to search
 *   for `.env` (defaults to {@link workTreeRoots}) and the target env.
 * @returns {string|undefined} The resolved value, or undefined when unavailable.
 */
export function resolveSecret(name, { roots = workTreeRoots(), env = process.env } = {}) {
  for (const root of roots) {
    if (env[name]) break;
    loadDotenvFrom(root, env);
  }
  if (!env[name]) {
    const fromKeychain = keychainSecret(name);
    if (fromKeychain) env[name] = fromKeychain;
  }
  return env[name];
}
