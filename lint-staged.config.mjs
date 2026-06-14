import path from 'node:path';

/**
 * lint-staged configuration.
 *
 * This is intentionally a *function* config rather than the per-glob object
 * form. The object form keys commands by glob (`**\/*.ts`, `**\/*.tsx`,
 * `package.json`, ...) and lint-staged runs *different globs concurrently*.
 * The project-wide gates — `yarn build`, `yarn test:coverage`,
 * `yarn check-staged-coverage` — are not file-scoped: they always operate on
 * the whole workspace. Duplicating them under each glob meant a single commit
 * touching 2+ groups (e.g. one `.ts` and one `.tsx`, or `.ts` + `package.json`)
 * spawned multiple parallel `vitest run --coverage` processes that raced on
 * `coverage/.tmp/*.json` and died with ENOENT — one run wiping the tmp dir
 * while another was still writing it.
 *
 * A function config is called once with the full staged-file list and returns
 * a single, sequential command list, so each project-wide gate runs exactly
 * once per commit no matter how many file types are staged. lint-staged does
 * NOT auto-append filenames to commands returned from a function, which also
 * removes the need for the old `bash -c '...'` wrappers that existed purely to
 * swallow those appended args.
 *
 * No gate is dropped: every check from the original config is preserved, just
 * de-duplicated and ordered deterministically.
 */

const SCRIPT_DIR = 'scripts/security';

/** Shell-quote a path so filenames with spaces survive lint-staged's parser. */
const quote = (file) => `'${file.replace(/'/g, `'\\''`)}'`;
const quoteAll = (files) => files.map(quote).join(' ');

export default (allStagedFiles) => {
  // lint-staged passes absolute paths; normalise to repo-relative for matching.
  const toRel = (file) => path.relative(process.cwd(), path.resolve(file));

  const tsFiles = allStagedFiles.filter((file) => /\.tsx?$/.test(file));
  const lockFiles = allStagedFiles.filter((file) => {
    const rel = toRel(file);
    return rel.endsWith('yarn.lock') || rel.endsWith('package-lock.json');
  });
  const packageJsonStaged = allStagedFiles.some(
    (file) => toRel(file) === 'package.json'
  );

  const commands = [];

  // Per-file security & lint gates run on the staged TS/TSX files themselves.
  if (tsFiles.length > 0) {
    const files = quoteAll(tsFiles);
    commands.push(`npx secretlint ${files}`);
    commands.push(`bash ${SCRIPT_DIR}/check-sast.sh ${files}`);
    commands.push(`npx eslint --max-warnings 0 --no-warn-ignored ${files}`);
  }

  // Project-wide gates: build + full coverage run once when any TS/TSX file or
  // the root package.json is staged. Ordered build -> coverage so the coverage
  // report exists before per-file coverage is checked.
  if (tsFiles.length > 0 || packageJsonStaged) {
    commands.push('yarn build');
    commands.push('yarn test:coverage');
  }

  // Per-file coverage thresholds are only meaningful for staged source files.
  if (tsFiles.length > 0) {
    commands.push('yarn check-staged-coverage');
  }

  // Dependency CVE scan when a lockfile changes.
  if (lockFiles.length > 0) {
    commands.push(`bash ${SCRIPT_DIR}/check-dependencies.sh ${quoteAll(lockFiles)}`);
  }

  return commands;
};
