// Post-commit Daytona deploy-test-report harness.
//
// On a commit, this boots a sandbox from a pre-baked BASE snapshot, copies the
// just-committed source in, runs the unit + e2e suites against the running app,
// pulls back a machine-readable report (+ logs and Playwright artifacts on
// failure), then tears the sandbox down. A breaking change yields a red report
// an agent can act on; a passing change reports green.
//
// Architecture (see docs/daytona-loop.md):
//   - BASE snapshot = OS + Playwright + browsers + node_modules + the S3 mock,
//     keyed on a hash of scripts/daytona/snapshot.Dockerfile + yarn.lock + the
//     workspace manifests + resources. Rebuilt ONLY when those change — never on
//     source changes. Baking stays OFF the per-commit hot path.
//   - Per commit: boot warm base -> inject `git archive HEAD` at /app -> run
//     scripts/daytona/sandbox-run.sh (build, boot app, unit + e2e) -> collect
//     artifacts -> delete sandbox.
//
// Usage:  node scripts/daytona/harness.mjs [--commit <sha>]
//   DAYTONA_API_KEY        required; read from the env or a gitignored .env. When
//                          run inside a per-card git worktree (which has no .env),
//                          it is resolved from the MAIN work tree's .env.
//   DAYTONA_CPU/MEMORY/DISK  snapshot resources (default 2 / 4 / 5)
//   REBUILD_SNAPSHOT=1      force a fresh base snapshot
//   KEEP_SANDBOX=1          skip teardown (debugging)
// Exit 0 = PASS, 1 = FAIL, 2 = harness/config error.
import { Daytona, Image } from '@daytona/sdk';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  cpSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
// The MAIN work tree = parent of the shared .git dir. When the loop runs inside
// a per-card git worktree, REPO_ROOT is that worktree, which has no .env (it is
// gitignored and never copied in). DAYTONA_API_KEY and friends live in the main
// checkout's .env, so resolve from there too.
const MAIN_ROOT = dirname(
  execFileSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { encoding: 'utf8' },
  ).trim(),
);

/** Parse a gitignored .env (KEY=VALUE lines) without taking a dotenv dependency. */
function loadDotenvFrom(root) {
  const path = join(root, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    const key = m[1];
    const val = m[2].replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}
// Worktree .env wins as a local override (first-set wins); the main work tree's
// .env is the shared fallback so card worktrees inherit the key.
loadDotenvFrom(REPO_ROOT);
if (MAIN_ROOT !== REPO_ROOT) loadDotenvFrom(MAIN_ROOT);

// Bumping this forces every snapshot to rebuild even if deps are unchanged —
// use it when the snapshot Dockerfile's *semantics* change in a way the hash
// inputs below wouldn't otherwise capture.
const SNAPSHOT_SPEC_VERSION = '1';
const DOCKERFILE = join(HERE, 'snapshot.Dockerfile');

// Manifests COPYed by the snapshot Dockerfile; also part of the snapshot identity.
const MANIFESTS = [
  'package.json',
  'yarn.lock',
  'packages/backend/package.json',
  'packages/frontend/package.json',
];

// 1 vCPU / 2 GiB / 5 GiB is the resource shape the spike proved places reliably
// on Daytona's shared runners; larger boxes intermittently get "No available
// runners". Override per environment if you have dedicated/self-hosted runners.
const CPU = Number(process.env.DAYTONA_CPU ?? 1);
const MEMORY = Number(process.env.DAYTONA_MEMORY ?? 2);
const DISK = Number(process.env.DAYTONA_DISK ?? 5);
const WORKDIR = '/app';

const ms = () => Number(process.hrtime.bigint() / 1_000_000n);
const secs = (a, b) => Number(((b - a) / 1000).toFixed(2));

/** Resolve the commit under test (default HEAD) to a full sha. */
function resolveCommit() {
  const idx = process.argv.indexOf('--commit');
  const ref = idx !== -1 ? process.argv[idx + 1] : 'HEAD';
  return execFileSync('git', ['rev-parse', ref], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
}

/**
 * Name the snapshot from a hash of its dependency-defining inputs (Dockerfile +
 * lockfile + manifests + resources), so unchanged deps reuse the warm base and
 * changed deps rebuild it. Deliberately independent of source content.
 */
function snapshotName() {
  const h = createHash('sha256');
  h.update(`spec:${SNAPSHOT_SPEC_VERSION}`);
  h.update(readFileSync(DOCKERFILE));
  for (const m of MANIFESTS) h.update(readFileSync(join(REPO_ROOT, m)));
  h.update(`r:${CPU}:${MEMORY}:${DISK}`);
  return `daytona-loop-${h.digest('hex').slice(0, 16)}`;
}

/**
 * Build the minimal Docker context fromDockerfile needs. fromDockerfile resolves
 * COPY sources relative to the Dockerfile's directory, so we mirror the Dockerfile
 * + the COPYed manifests (preserving their relative paths) into a temp dir.
 */
function buildContext() {
  const ctx = mkdtempSync(join(tmpdir(), 'daytona-snap-'));
  copyFileSync(DOCKERFILE, join(ctx, 'Dockerfile'));
  for (const m of MANIFESTS) {
    const dest = join(ctx, m);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(REPO_ROOT, m), dest);
  }
  return join(ctx, 'Dockerfile');
}

async function ensureSnapshot(daytona, name) {
  if (!process.env.REBUILD_SNAPSHOT) {
    try {
      const existing = await daytona.snapshot.get(name);
      console.log(`[snapshot] reusing "${name}" (state=${existing.state})`);
      return { built: false, buildSeconds: 0 };
    } catch {
      console.log(`[snapshot] "${name}" not found — baking (one-time per deps)`);
    }
  }
  const t0 = ms();
  await daytona.snapshot.create(
    {
      name,
      image: Image.fromDockerfile(buildContext()),
      resources: { cpu: CPU, memory: MEMORY, disk: DISK },
    },
    { onLogs: (c) => process.stdout.write(c.endsWith('\n') ? c : c + '\n'), timeout: 0 },
  );
  return { built: true, buildSeconds: secs(t0, ms()) };
}

/** Parse the <testsuites> roll-up from Playwright's JUnit report. */
function parseJunit(xml) {
  const m = xml.match(/<testsuites\b[^>]*>/);
  const attr = (n) => Number((m?.[0].match(new RegExp(`${n}="([^"]*)"`)) ?? [])[1] ?? 0);
  const tests = attr('tests');
  const failures = attr('failures');
  const errors = attr('errors');
  return { tests, failures, errors, passed: failures === 0 && errors === 0 && tests > 0 };
}

/**
 * Boot the sandbox, retrying the "No available runners" placement error.
 *
 * A freshly-baked snapshot has to be pulled and warmed onto a runner before it
 * can be scheduled, so the first boot after a (re)bake can be rejected for a
 * minute or two. The spike found ~20s of retry isn't enough — be patient.
 * Measured here: a cold, just-baked snapshot took ~4–5 min of retries to place;
 * once warm it boots in ~1s. Budget via DAYTONA_BOOT_RETRY_SECONDS (default 600).
 */
async function createSandbox(daytona, name, summary) {
  const budgetMs = Number(process.env.DAYTONA_BOOT_RETRY_SECONDS ?? 600) * 1000;
  const deadline = ms() + budgetMs;
  for (let attempt = 1; ; attempt++) {
    try {
      const sandbox = await daytona.create(
        { snapshot: name, ephemeral: true, autoStopInterval: 5, labels: { app: 'daytona-loop' } },
        { timeout: 180 },
      );
      if (attempt > 1) summary.bootRetries = attempt - 1;
      return sandbox;
    } catch (e) {
      const transient = /no available runners/i.test(e.message ?? '');
      if (!transient || ms() >= deadline) throw e;
      const backoff = Math.min(15000, 3000 * attempt); // ramp to 15s, then hold
      console.warn(
        `[sandbox] "${e.message}" — retry ${attempt} in ${backoff}ms ` +
          `(${Math.round((deadline - ms()) / 1000)}s budget left; snapshot warming)`,
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

async function main() {
  if (!process.env.DAYTONA_API_KEY) {
    console.error('DAYTONA_API_KEY is not set (see .env.example / docs/daytona-loop.md).');
    process.exit(2);
  }

  const commit = resolveCommit();
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${commit.slice(0, 8)}`;
  const outDir = join(REPO_ROOT, '.daytona', 'runs', runId);
  mkdirSync(outDir, { recursive: true });

  const daytona = new Daytona();
  const name = snapshotName();
  const t0 = ms();
  let sandbox;
  const summary = { runId, commit, snapshot: name, cpu: CPU, memory: MEMORY, disk: DISK };

  try {
    // 1) Bake (or reuse) the warm base snapshot.
    const snap = await ensureSnapshot(daytona, name);
    summary.snapshotBuilt = snap.built;
    summary.snapshotBuildSeconds = snap.buildSeconds;

    // 2) Boot the sandbox (the per-commit cold start).
    const bootStart = ms();
    sandbox = await createSandbox(daytona, name, summary);
    summary.coldStartSeconds = secs(bootStart, ms());
    console.log(`[sandbox] booted ${sandbox.id} in ${summary.coldStartSeconds}s`);

    // Preview URL is exposed for cross-browser / external checks (model 2); the
    // gate itself runs Playwright in-box against localhost (model 1).
    try {
      summary.previewUrl = (await sandbox.getPreviewLink(8080)).url;
    } catch {
      /* non-fatal */
    }

    // 3) Inject the just-committed source: upload `git archive <commit>` and
    //    extract it over the baked /app (node_modules is preserved).
    const archive = execFileSync('git', ['archive', '--format=tar', commit], {
      cwd: REPO_ROOT,
      maxBuffer: 512 * 1024 * 1024,
    });
    await sandbox.fs.uploadFile(Buffer.from(archive), '/tmp/src.tar');
    const extract = await sandbox.process.executeCommand(
      `mkdir -p ${WORKDIR} && tar -xf /tmp/src.tar -C ${WORKDIR} && chmod +x ${WORKDIR}/scripts/daytona/sandbox-run.sh`,
      '/',
      undefined,
      120,
    );
    if (extract.exitCode !== 0) throw new Error(`source extract failed: ${extract.result}`);

    // 4) Run the in-sandbox build + boot + test orchestrator.
    const testStart = ms();
    const res = await sandbox.process.executeCommand(
      `bash ${WORKDIR}/scripts/daytona/sandbox-run.sh`,
      WORKDIR,
      { CI: '1' },
      600,
    );
    summary.testRunSeconds = secs(testStart, ms());
    summary.sandboxExitCode = res.exitCode;
    writeFileSync(join(outDir, 'sandbox-run.log'), res.result ?? res.artifacts?.stdout ?? '');
    console.log(`[run] sandbox exit=${res.exitCode} in ${summary.testRunSeconds}s`);

    // 5) Pull every artifact back as one tarball, plus junit for direct parsing.
    await sandbox.process.executeCommand(
      `tar -czf /tmp/artifacts.tgz -C ${WORKDIR} .daytona-run test-results 2>/dev/null || tar -czf /tmp/artifacts.tgz -C ${WORKDIR} .daytona-run`,
      '/',
      undefined,
      120,
    );
    await sandbox.fs.downloadFile('/tmp/artifacts.tgz', join(outDir, 'artifacts.tgz'));
    execFileSync('tar', ['-xzf', join(outDir, 'artifacts.tgz')], { cwd: outDir });

    // 6) Turn the raw artifacts into a clean pass/fail signal.
    const resultsPath = join(outDir, '.daytona-run', 'results.json');
    if (existsSync(resultsPath)) summary.results = JSON.parse(readFileSync(resultsPath, 'utf8'));
    const junitPath = join(outDir, 'test-results', 'junit.xml');
    if (existsSync(junitPath)) summary.junit = parseJunit(readFileSync(junitPath, 'utf8'));

    const r = summary.results ?? {};
    summary.result =
      res.exitCode === 0 && r.buildExit === 0 && r.unitExit === 0 && r.e2eExit === 0
        ? 'PASS'
        : 'FAIL';
  } finally {
    // 7) Always tear down so parallel agent commits don't leak compute spend.
    if (sandbox && !process.env.KEEP_SANDBOX) {
      try {
        await daytona.delete(sandbox);
        console.log(`[sandbox] deleted ${sandbox.id}`);
      } catch (e) {
        console.warn(`[sandbox] delete failed: ${e.message}`);
      }
    } else if (sandbox) {
      console.log(`[sandbox] KEEP_SANDBOX set — left ${sandbox.id} running`);
    }
  }

  summary.totalCycleSeconds = secs(t0, ms());
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  report(summary, outDir);
  process.exit(summary.result === 'PASS' ? 0 : 1);
}

/** Emit the agent-facing report: a structured block + where to dig on failure. */
function report(summary, outDir) {
  const pass = summary.result === 'PASS';
  const j = summary.junit;
  console.log('\n<daytona-loop-result>');
  console.log(`  <status>${pass ? 'pass' : 'fail'}</status>`);
  console.log(`  <commit>${summary.commit}</commit>`);
  if (j) console.log(`  <e2e tests="${j.tests}" failures="${j.failures}" errors="${j.errors}"/>`);
  const r = summary.results ?? {};
  console.log(
    `  <exit build="${r.buildExit ?? '?'}" unit="${r.unitExit ?? '?'}" e2e="${r.e2eExit ?? '?'}"/>`,
  );
  console.log(`  <artifacts>${outDir}</artifacts>`);
  if (!pass) {
    console.log(
      '  <llm-instruction>An e2e/unit/build step failed in the Daytona sandbox. ' +
        `Read ${join(outDir, '.daytona-run')}/{e2e,unit,build,backend,frontend}.log and the ` +
        `Playwright trace/screenshot under ${join(outDir, 'test-results')} to diagnose, then fix and re-commit.</llm-instruction>`,
    );
  }
  console.log('</daytona-loop-result>');
  console.log(`\n[${summary.result}] cycle=${summary.totalCycleSeconds}s — summary at ${join(outDir, 'summary.json')}`);
}

main().catch((e) => {
  console.error('[harness] fatal:', e);
  process.exit(2);
});
