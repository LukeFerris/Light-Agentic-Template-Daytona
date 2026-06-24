# Integration test vs. full e2e: what the Daytona loop actually is

The per-commit Daytona loop is often called "the e2e loop." That name is
convenient but **imprecise**, and the imprecision matters. Because the loop runs
against an app whose external services are **mocked** (S3 → MinIO, the LLM → a
mock Messages endpoint), what it actually runs is **targeted integration
testing**, not end-to-end testing. True end-to-end — the system with **nothing
mocked**, every external dependency real — is a different, heavier thing that
deliberately lives **off** the per-commit path.

This doc draws that line. It is the third sibling of
[test-strategy.md](test-strategy.md) (which _kinds_ of test a card needs) and
[external-services.md](external-services.md) (mock each service or call it for
real). Those two decide _what you write_; this one names _what the loop you write
it for actually is_.

## The two tiers, named

| | **Integration test** (the per-commit Daytona loop) | **Full e2e** (the gated tier) |
|---|---|---|
| What's mocked | Every external service — S3 is MinIO, the LLM is a mock endpoint | **Nothing.** Real S3, real Anthropic, real everything |
| What it proves | _Your_ code wires together correctly across its seams, against stand-in dependencies | The whole system behaves against the **real** providers |
| Determinism | Deterministic, key-free, fast — runs on every commit | Non-deterministic, key-requiring, slow — runs nightly / on a label |
| Where it lives | `*.test.ts` (vitest) + Playwright `*.spec.ts` in `e2e/`, run by `yarn daytona:loop` | The double-gated tier (`e2e/llm.spec.ts`, `yarn e2e:llm`) — [external-services.md](external-services.md) Pattern B |
| In the loop? | **Yes** — this _is_ the loop | **No** — off the hot path, skips loud inside the loop |

The crucial point the convenient name hides:

> **The Playwright "e2e" specs are integration tests.** Driving a real browser
> through the running app is _end-to-end from the user's point of view_, but the
> app underneath them is talking to **mocks**, not real providers. So a green
> Playwright run proves your integration seams hold against stand-ins — it does
> **not** prove the system works against the real S3 or the real LLM. That's what
> the separate full-e2e tier is for.

"Integration test" is therefore the **umbrella** for what the loop runs;
Playwright e2e specs are one shape of integration test inside it (browser-driven,
user-visible), unit tests are another (function-level). Both run against the
mocked app. Calling the loop "integration" rather than "e2e" keeps you honest
about what its green actually certifies.

## Why the loop is integration, by construction

It isn't an accident of naming — it's forced by the one invariant the loop never
relaxes:

> The per-commit Daytona loop must stay **deterministic, key-free, and fast.**

A real external service breaks all three: it needs a secret (not key-free), it
can flake or drift (not deterministic), and it adds network latency (not fast).
So [external-services.md](external-services.md) **mocks every incidental service
behind a config-only switch** and runs the loop against the mock. The moment you
mock the dependencies, the loop is — by definition — integration testing, not
end-to-end. The integration/e2e distinction is just the mock-vs-real decision
seen from the test tier's side.

## Spin up an integration test: scope it to the change

When you reach for the loop, the framing is:

> **You use Daytona to spin up an _integration test_ of what this card changed —
> not a regression run of the whole system.**

Two rules follow from that:

1. **Test the thing being built or updated — not everything.** Include the **new
   tests this card needs** (unit and/or Playwright, per
   [test-strategy.md](test-strategy.md)) **plus whatever existing tests you judge
   relevant** to the seams you touched. The loop is a targeted check that _this
   change_ integrates, not a full-coverage sweep. A card that changes the upload
   path pulls in the upload specs; it does not re-assert every unrelated flow.
2. **Use locally spun-up data, with the right slice pulled in.** The sandbox
   boots its own data (the MinIO bucket, seed fixtures) and you pull in **only
   the component of data the change actually exercises**. This keeps the run fast
   and **limits what's exposed inside the throwaway sandbox** — you stage the
   minimum the test needs, not a copy of everything.

This is the integration-testing mindset made concrete: a focused check, against
mocked dependencies, with just-enough locally-staged data, proving the seams the
card touched.

## When you actually need full e2e

Reach past integration to a real, nothing-mocked run only when the **real
provider's behavior is the thing under test** — a prompt you're perfecting,
output quality a fake can't reproduce, a provider quirk a mock would paper over.
That is exactly the [external-services.md](external-services.md) Pattern B
decision, and it lands in the same place: a **separate, double-gated tier**
(`e2e/llm.spec.ts`, `yarn e2e:llm`) that runs off the per-commit loop, skips loud
inside it, and never puts a key or a flake on the gate. Full e2e is the
exception you opt into deliberately, not the default the loop gives you.

## One line to carry to your own repo

> The per-commit loop is **integration testing** — your seams against **mocked**
> dependencies, scoped to what the card changed and run on locally-staged data;
> "full e2e" means **nothing mocked** and lives in a separate gated tier. The
> Playwright specs are integration tests, not end-to-end proof — name the tier by
> what's behind the app, not by whether a browser is driving it.
