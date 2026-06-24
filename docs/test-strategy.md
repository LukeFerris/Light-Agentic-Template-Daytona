# Which tests does this card need? Decide it up front.

This template's reflex is "write unit tests **and** a Playwright e2e spec for
every feature." That is the right **default** for a feature card — but it is a
default, not a law. In reality the required tests depend on the card: a
pure-logic refactor, a user-facing flow, and a "did the MCP I just deployed
actually answer?" check each call for a different mix.

So the **test plan is one decision, made deliberately at the start of the work
and confirmed with the engineer** — never defaulted to whatever the template's
reflex happens to be, and never skipped silently.

This doc is the sibling of [external-services.md](external-services.md):

- **external-services.md** decides, for each external service the card touches,
  **mock it or call it for real**.
- **this doc** decides, for each card, **which _kinds_ of tests prove it's done**.

Both are "decide up front, confirm with the engineer, write it down." Make both
decisions before the first test exists.

## The one invariant this never relaxes

> The per-commit Daytona loop must stay **deterministic, key-free, and fast.**

Choosing _which_ tests a card needs **never** means smuggling a
non-deterministic or key-requiring test onto the per-commit path. Whatever
deterministic tests you decide the card needs are written TDD-first and run in
the loop; anything that cannot be deterministic — a real-LLM call, a one-off
"did it deploy?" check — lives **off** the loop in its named home (a gated tier,
or the handoff record). Fewer test _types_ on a card never means a weaker gate
for the types you keep.

## The three kinds, and when a card needs each

| Kind | Where it lives | A card needs it when… | In the per-commit loop? |
|---|---|---|---|
| **Unit** | `*.test.ts` (vitest), beside the code under `packages/` | the card adds or changes logic with branches, edge cases, parsing, calculation, or error paths — i.e. almost every code card | **Yes** |
| **Integration / e2e** | `*.spec.ts` (Playwright), top-level `e2e/` | the card delivers user-visible behaviour, wires components/services together, or changes an API contract — anywhere the unit passing doesn't prove the *seams* hold | **Yes** |
| **One-off verification** ("did the thing I just deployed actually work?") | nowhere in the repo — a manual step or a throwaway script, run once | the card's deliverable is a **running artifact**, not a code path: an MCP server stood up, an infra change, a deploy script, a webhook wired | **No** — it isn't a repeatable deterministic gate; **record it in the handoff** |

Most cards are a **mix**: a deploy card still unit-tests the pure logic it added
*and* does a one-off check of the running thing; an LLM feature has unit tests in
the loop *and* a real-call spec in the gated tier off it.

## Deciding (and confirming) up front

Mirroring the mock-vs-real confirmation in
[external-services.md](external-services.md): **at the start of the work** —
before the first test exists — present to the engineer:

1. **What kind of card this is** — pure logic / user-facing feature / wiring /
   deploy-or-infra artifact / a mix.
2. **Which of the three kinds you propose to write, and which you propose to
   skip**, each with a one-line reason ("no user-visible surface, so no spec";
   "the deliverable is the deployed server, so a one-off tool call is the real
   test").
3. **What that means for the per-commit loop** — what it will and won't exercise,
   and where anything left off the loop (a one-off check, a real-service tier)
   gets covered instead.

Then get the engineer's explicit **yes or correction before building.** "What
proves this card is done?" is a judgement the engineer owns — over-testing a
throwaway and under-testing a load-bearing seam are both expensive.

## Worked examples

- **A pure util** (e.g. a formatter added to the backend) → **unit tests only.**
  No e2e — there's no user-visible surface. The loop runs the units.
- **A new user-facing page or flow** → **unit tests** for the components' logic
  **+ a Playwright spec** for the flow. Both in the loop.
- **An LLM-backed endpoint** → **unit tests** with the SDK mocked, in the loop,
  **+ a real-call spec** in the gated `e2e/llm.spec.ts` tier *off* the loop (see
  [external-services.md](external-services.md) Pattern B).
- **"Stand up / update an MCP server"** → typically a **one-off** "call a tool —
  did it answer?" check against the deployed server, **recorded in the handoff**;
  **+ unit tests** for any pure logic you added. No per-commit e2e if there's no
  in-repo app surface to drive.

## The one-off check is a real deliverable, not an excuse

"Did the MCP I just deployed work?" is a legitimate — sometimes the _only_
meaningful — test for a deploy/infra card. But it is the **weakest** kind,
precisely because it isn't repeatable in the gate. Two rules keep it honest:

- **It never replaces a deterministic test that _could_ have existed.** If logic
  you added can be unit-tested, unit-test it. The one-off check is only for the
  part that genuinely exists only once it's running.
- **It is recorded, not remembered.** Write what you ran and what you saw into
  the card handoff, so "I checked it" is auditable rather than a claim.

## One line to carry to your own repo

> Decide which kinds of tests a card needs up front and confirm it with the
> engineer — unit, integration/e2e, and the one-off "did it actually run?" check
> are a per-card mix, not a fixed checklist — but never let "fewer types" weaken
> the deterministic per-commit gate for the types you keep.
