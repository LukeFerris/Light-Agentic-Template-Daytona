# External services: mock it, or call it for real

This template runs a **deterministic, free, offline per-commit test gate** — the
Daytona loop (`yarn daytona:loop`). That gate is sacred: it must go green-or-red
on *your* logic alone, with no network, no secrets, and no flake. Every external
service your app touches is therefore subject to **one decision, made
deliberately and written down** — never defaulted to whatever was convenient.

This doc is the policy. The two existing service docs are its worked examples:

- **[aws-mocks.md](aws-mocks.md)** — the canonical _mockable_ service (Pattern A).
- **[playwright-av-testing.md](playwright-av-testing.md)** — the LLM-as-judge
  variant of the _required-real_ service (Pattern B).

If you are taking inspiration from this template in another repo, copy this
policy first, then the example that matches your service.

This mock-vs-real decision is the **same line** the test tiers are named for,
seen from the service's side: mocking incidental services (Pattern A) is exactly
what makes the per-commit loop _integration_ testing, and the required-real tier
(Pattern B) is where _full e2e_ lives. See
[integration-vs-e2e.md](integration-vs-e2e.md).

## The decision test

Ask one question about each external service:

> **Is the service's real behavior what this test is asserting on?**

- **No — the service is plumbing.** The test cares about *your* logic; the
  service is just where bytes go (object store, queue, database). →
  **Mock it (Pattern A).** It belongs *inside* the per-commit gate.
- **Yes — the service is the thing under test.** You're perfecting a prompt,
  validating output quality, or exercising provider behavior a fake cannot
  reproduce. → **Call it for real (Pattern B)**, in a separate gated tier
  *outside* the per-commit loop.
- **Both are true** (common for LLM features): mock the logic-level assertions
  in the gate, *and* keep a small real-call tier for the behavior you can't fake.
  Do both, each in its own tier.

## Confirm the split with the engineer before you build it

This decision is **never made silently.** Before you write the tests or wire the
client factory, stop and **confirm the mock-vs-real split with the engineer**,
explaining your testing thinking. The classification looks obvious to whoever
applies the test above, but "is this service the thing under test?" is a product
judgement the engineer owns — a service you read as incidental plumbing may be
exactly the behavior they wanted exercised for real, and vice versa. Getting it
wrong is expensive in both directions: mock something essential and the suite
goes green without ever testing the thing that matters; call something incidental
for real and you've put a key, a cost, and a flake source on the per-commit loop.

So, **at the start of the work** — before the first test exists — present:

1. **Each external service the feature touches**, and which bucket you propose
   for it: *mock it (plumbing, in the per-commit gate)* or *call it for real
   (the thing under test, in a separate gated tier)* — or *both*.
2. **Your reasoning** for each — i.e. your answer to the decision test above, in
   one line per service ("S3 is just where the bytes land → mock; the summariser
   prompt quality is the feature → real tier").
3. **The consequence** of the split: what the per-commit Daytona loop will and
   won't actually exercise, and where the real behavior gets covered.

Then get the engineer's explicit yes (or their correction) **before** building.
Only once the split is confirmed do you implement Pattern A / Pattern B below.
Treat a changed answer later (a service moving buckets) as the same kind of
decision — re-confirm, don't quietly re-classify.

## Pattern A — Mockable services (the default)

The selection between mock and real is **config, never code.** A single client
factory reads one env var; if it's set, the client targets the mock; if absent,
it targets the real provider via the standard credential chain. **Application
code never branches on "are we mocked?"** — production and tests run the
identical path, only the environment differs.

**Worked example: S3 → MinIO**
([`packages/backend/src/services/aws/s3Client.ts`](../packages/backend/src/services/aws/s3Client.ts)).
`S3_ENDPOINT` set → MinIO with path-style addressing; unset → real AWS S3. The
full write-up is in [aws-mocks.md](aws-mocks.md).

### Checklist for any mockable service

- [ ] One client factory, switched by a single `<SERVICE>_ENDPOINT`-style env var.
- [ ] The mock declared in `docker-compose.yml`, baked into the Daytona snapshot
      (`scripts/daytona/snapshot.Dockerfile`), and booted in
      `scripts/daytona/sandbox-run.sh` — so tests never start it themselves.
- [ ] **Both** config branches (mock and real) covered by unit tests
      (see [`s3Client.test.ts`](../packages/backend/src/services/aws/s3Client.test.ts)).
- [ ] **Zero** `if (mock)` logic in application code.

## Pattern B — Required-real services (the exception)

When a mock would defeat the test's purpose, the real call is allowed in — but it
must **never** weaken the per-commit gate. It is fenced off by four rules:

1. **Separate tier.** Real-external tests live in their own files (e.g.
   [`e2e/llm.spec.ts`](../e2e/llm.spec.ts)), never intermixed with deterministic
   specs.
2. **Double-gated.** They run only when *both* a **capability** flag (the secret,
   e.g. `ANTHROPIC_API_KEY`) **and** an explicit **intent** flag (e.g.
   `RUN_LLM_E2E=1`) are present. A secret leaking into an environment must not, on
   its own, start spending money or introducing flake.
3. **Run off the inner loop.** The per-commit Daytona gate stays mock-only. The
   real tier runs on demand (`yarn e2e:llm`), nightly, or in a labelled CI job
   that owns the cost and latency.
4. **Designed against non-determinism, and honest about state.** Assert on
   **structured / schema-valid** output (use an LLM as a *judge returning a
   verdict*, not a free-text oracle); pin provider/model ids; where possible put
   a cheap deterministic pre-check in front of the costly call.
   - **Skip loud:** when the gates are shut, `test.skip()` with a visible reason
     so a green run never masquerades as having exercised a path it skipped.
   - **Fail loud:** when the gates are open but the service is misconfigured,
     error — never silently pass.

**Worked example: the `/summarize` LLM endpoint.** The app's
[`llmService`](../packages/backend/src/services/llmService.ts) calls a real
Anthropic model through a config-only client factory
([`anthropicClient.ts`](../packages/backend/src/services/llm/anthropicClient.ts))
that mirrors the S3 switch — `ANTHROPIC_BASE_URL` set → a mock Messages endpoint;
unset → the real API. The deterministic per-commit gate covers the service and
handler with **unit tests** that mock the SDK, and the endpoint returns **503**
(not a crash) when no LLM is configured, so the sandbox stays coherent without a
key. The **real** behavior is asserted only by the gated
[`e2e/llm.spec.ts`](../e2e/llm.spec.ts) tier, which skips in the loop and runs via
`yarn e2e:llm`. The multimodal LLM-as-_judge_ variant of this same pattern is in
[playwright-av-testing.md](playwright-av-testing.md) (Tier 3).

### Checklist for any required-real service

- [ ] Real-external assertions isolated in their own spec/test file(s).
- [ ] Double-gated: a capability (secret) flag **and** an explicit intent flag;
      neither alone is enough to run.
- [ ] Not in the per-commit Daytona loop — has its own trigger
      (script / nightly / labelled CI job).
- [ ] Asserts on structured output; provider/model ids pinned.
- [ ] **Skips loud** when gates are shut; **fails loud** when configured wrong.
- [ ] App degrades gracefully (clear error, no crash) when the real service is
      absent, so the deterministic stack stays bootable and coherent.

## One line to carry to your own repo

> Confirm the mock-vs-real split with the engineer up front; then mock everything
> in the per-commit gate via a config-only switch, and let real external calls in
> only through a separately-triggered, double-gated tier that skips loud and fails
> loud — and write down which bucket each service is in.
