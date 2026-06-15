# Slide descriptions: gates, the Daytona loop, and mock-vs-real

Three slides explaining how this template proves a change is safe. Each section
gives the **headline**, the **visual** (what the designer draws), the **on-slide
text**, and **speaker notes**. They are grounded in the real pipeline — see
[CLAUDE.md](../CLAUDE.md), [docs/daytona-loop.md](daytona-loop.md), and
[docs/external-services.md](external-services.md).

---

## Slide 1 — The rings of confidence: gates and iteration loops

**Headline:** *Every change runs an obstacle course — fast checks first, a full
running copy last.*

**Visual — concentric circles.** A bullseye of nested rings. You start at the
centre with a code change and have to pass *outward* through each ring; each ring
is a feedback loop you bounce back into until it goes green. The loops get
**slower and more realistic** the further out you go — the innermost is sub-second
and runs on your machine; the outermost spins up a whole environment in the cloud.

```
        ┌──────────────────────────────────────────────┐
        │   ④  Daytona post-commit loop  (~10–25s)      │  ← throwaway cloud sandbox,
        │   deploy HEAD → boot app → unit + e2e         │     app actually RUNNING
        │  ┌────────────────────────────────────────┐  │
        │  │  ③  Pre-commit gates  (seconds)         │  │  ← runs on `git commit`,
        │  │  secrets · SAST · lint · build ·        │  │     blocks the commit
        │  │  coverage · CVEs · patterns             │  │
        │  │  ┌──────────────────────────────────┐  │  │
        │  │  │  ②  TDD loop  (sub-second)        │  │  │  ← vitest watch,
        │  │  │  write test → red → green        │  │  │     your editor
        │  │  │   ┌──────────────────────────┐   │  │  │
        │  │  │   │  ①  Your change          │   │  │  │
        │  │  │   └──────────────────────────┘   │  │  │
        │  │  └──────────────────────────────────┘  │  │
        │  └────────────────────────────────────────┘  │
        └──────────────────────────────────────────────┘
                 (beyond the rings: production → AWS Fargate)
```

**On-slide text (ring labels, inner → outer):**

1. **Your change** — one focused commit's worth of work.
2. **TDD loop** *(sub-second, local)* — write the unit test, watch it go red, make
   it green. Tightest, fastest feedback.
3. **Pre-commit gates** *(seconds, blocking)* — fan out by file type on
   `git commit`: secret scanning, SAST (Semgrep), lint (zero warnings), build,
   unit tests + coverage, per-file coverage, dependency CVEs (OSV-Scanner), and a
   pattern/fallback audit. `--no-verify` is never allowed.
4. **Daytona loop** *(~10–25s, post-commit)* — deploy the just-made commit to a
   throwaway cloud sandbox, boot the *whole* app, and run unit **+ Playwright e2e
   against the running app**. This is the ring that proves the code actually
   *runs*, not just compiles.

> Beyond the outermost ring: **production** — the same container images ship to
> AWS Fargate.

**Speaker notes.** The point of the rings is **cost vs. realism**. Cheap checks
fail fast in the centre, so you almost never pay for the expensive outer loop to
catch a typo. By the time a change reaches the Daytona ring, it has already passed
secrets, SAST, lint, build, coverage and CVE scans — so the outer loop is free to
do the one thing the inner rings can't: stand the app up and exercise it
end-to-end. Each ring is a *loop*, not a checkpoint — you get bounced back to the
centre, fix, and run the gauntlet again until the outermost ring is green.

---

## Slide 2 — What is Daytona? A disposable copy of the whole environment

**Headline:** *Daytona spins up an entire, throwaway copy of the app in the
cloud — real where it can be, mocked where it must be.*

**Visual.** A "sandbox" box that appears, runs, and vanishes. Inside it: the
**frontend**, the **backend API**, and the **mocked dependencies** (e.g. MinIO
standing in for S3) — all wired together as a working app, with Playwright driving
a browser against it. Arrows showing the lifecycle: **boot warm base → inject this
commit's source → build + run + test → pull back report & traces → tear down.**

```
  git commit ──► [ Daytona sandbox (ephemeral) ]──► PASS / FAIL + logs + traces
                 ┌──────────────────────────────┐
                 │  frontend  ◄──► backend API   │
                 │                  │            │
                 │                  ▼            │
                 │           mock S3 (MinIO)      │   built fresh per commit,
                 │   Playwright ─► running app    │   torn down after — no leak
                 └──────────────────────────────┘
```

**On-slide text:**

- **A full environment, not a unit test.** Frontend + backend + dependencies boot
  together as a real, running app; Playwright exercises it through a browser.
- **Disposable.** Each commit gets a fresh sandbox that is **torn down after the
  run** — nothing leaks, nothing accumulates, parallel commits don't collide.
- **Fast, because the slow parts are pre-baked.** A warm *base snapshot* bakes the
  OS, browsers and `node_modules`; per commit we just **copy the new source in**
  and boot — ~1s to boot, ~10–25s for a full pass/fail cycle. The snapshot only
  rebuilds when *dependencies* change, never on source changes.
- **Some things are mocked — on purpose.** Incidental dependencies (the object
  store, etc.) run as in-sandbox mocks so the loop stays **deterministic, key-free
  and offline**. (Which things, and why, is Slide 3.)
- **Every run hands back a verdict + evidence.** A machine-readable PASS/FAIL plus
  container logs and a Playwright trace/screenshot/video for *every* test — green
  runs are as inspectable as red ones.

**Speaker notes.** The mental model: "what if every commit got its own clean
laptop in the cloud, set up exactly like prod, ran the whole app and the full
browser test suite, then threw the laptop away?" That's the Daytona loop. It's the
inner gate that proves a commit *runs*, distinct from the production deploy which
ships the exact same container images to Fargate. The reason it's affordable to do
*per commit* is the warm-base-snapshot trick: dependencies and browsers are baked
once and reused; only the freshly-committed source is new each time.

---

## Slide 3 — Mock it, or call it for real? A per-test decision

**Headline:** *One question per external service decides whether we fake it or use
it for real — and we bias toward running the real thing inside the container.*

**Visual.** A decision fork. One question at the top —
**"Is the service's real behaviour what this test is asserting on?"** — splitting
into two lanes:

- **NO → it's plumbing → mock it.** Lives *inside* the per-commit Daytona loop.
- **YES → it's the thing under test → call it for real.** Lives in a *separate,
  gated tier* outside the per-commit loop.

Show the bias visually: the "mock" lane prefers a **real implementation running
locally in the container** (Docker-in-Docker — e.g. MinIO for S3, a real
**Supabase/Postgres** container for the DB) over a hand-written fake.

```
            Is the service's real behaviour what the test asserts on?
                          │
         ┌────────────────┴─────────────────┐
        NO                                  YES
   "it's plumbing"                  "it's the thing under test"
         │                                   │
   MOCK it  ──────────────►            CALL it for REAL ──────►
   inside the per-commit loop          separate gated tier, OFF the loop
   ▸ config-only switch (one env var)  ▸ double-gated: secret + intent flag
   ▸ prefer a REAL impl in-container:  ▸ runs nightly / on-label, never per-commit
     MinIO, Supabase/Postgres (DinD)   ▸ structured/judge output, pinned model ids
   ▸ keeps loop deterministic+key-free ▸ skip-LOUD when off, fail-LOUD when misconfigured
```

**On-slide text:**

- **The test, once, per service:** *"Is the real behaviour what I'm asserting
  on?"* Decided deliberately and **written down** — never defaulted to whatever
  was convenient. **Confirm the split with the engineer before building** — "is
  this the thing under test?" is a product call the engineer owns.
- **Plumbing → mock (Pattern A).** Object stores, queues, databases where the test
  cares about *your* logic. Switched by **config, not code** — one env var points
  the same client at the mock or the real provider; **zero `if (mock)` branches**
  in app code. Stays inside the per-commit loop.
- **Bias: a real implementation in the container, not a hand-written fake.** Where
  a service has a runnable local image, run it Docker-in-Docker — **MinIO** for S3,
  a real **Supabase / Postgres** container for the database. You get real
  behaviour and real SQL, still deterministic, still offline, still key-free.
- **The thing under test → call it for real (Pattern B).** e.g. perfecting an LLM
  prompt. Fenced off: **own tier, double-gated** (a capability *secret* **and** an
  explicit *intent* flag), **off the per-commit loop** (nightly / on-label),
  asserting on **structured / judge** output with **pinned model ids**.
- **Never lie about coverage.** When the real tier is gated off it **skips loud**
  (visible reason); when it's switched on but misconfigured it **fails loud** —
  a green run never masquerades as having tested a path it skipped.

**Speaker notes.** The whole policy exists to protect one thing: the per-commit
loop must go green-or-red on *your logic alone* — no network, no secrets, no
flake. So incidental dependencies are mocked behind a config-only switch and live
inside the loop; the genuinely-real stuff (an actual LLM response you're tuning)
gets its own double-gated tier that runs off the hot path. The important nuance is
the **bias toward real-in-container**: "mock" doesn't have to mean a flimsy fake.
When a dependency ships a real local image — MinIO, Supabase, Postgres — we run
the real thing in Docker-in-Docker and get true behaviour while keeping the loop
deterministic and key-free. The decision is **per service / per test**, and it's
confirmed with the engineer up front because misclassifying in either direction is
expensive: mock something essential and the suite passes without testing what
matters; call something incidental for real and you've put a key, a cost and a
flake source onto every commit.
