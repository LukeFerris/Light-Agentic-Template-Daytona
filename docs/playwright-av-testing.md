# Testing audio, animation & video in Playwright

> How might a Playwright test check that *"the animation visibly begins"*,
> *"the video shows a person talking"*, or *"the audio and video are in sync"*?

Those are three different kinds of question, and they need three different kinds
of answer. This doc maps the space and recommends a pattern for this template.

The headline: **most of what people reach for an LLM to judge can be proven
deterministically** — by reading the same clocks, counters and pixel buffers the
browser exposes to JavaScript. Reserve the LLM judge for the genuinely
subjective residue (*"is this a person talking?"*, *"are lips in sync with the
words?"*), and keep it behind a separate, opt-in gate so the per-commit Daytona
loop stays deterministic and free.

## A tiered model

| Tier | Question shape | How | Deterministic? | Cost |
| --- | --- | --- | --- | --- |
| **1. Signal** | *Did it play / move at all?* | Read media clocks, animation state, frame/pixel deltas in `page.evaluate` | Yes | Free |
| **2. Structure** | *Did the right thing move/play?* | Tier-1 signals scoped to a specific element + value range, screenshot diffs with masks | Mostly | Free |
| **3. Semantic** | *Is this a person talking? Is A/V in sync?* | Capture frames/audio → multimodal LLM judge → structured verdict | No | API + latency |

Always climb from the bottom. A surprising fraction of "we need AI to test this"
turns out to be Tier 1 once you ask *what observable thing actually changes*.

---

## Tier 1 — deterministic signals

The browser hands JavaScript precise clocks and counters for media and
animation. Playwright's `page.evaluate` runs in that context, and `expect.poll`
lets you sample a value over a window of time and assert on the **trend** — which
is exactly what "is it animating / playing" means.

### Animation

**Web Animations API** — every CSS animation/transition and every
`element.animate()` is reflected here. This is the cleanest signal that an
animation *exists and is running* on a specific element:

```ts
const state = await page.locator('#hero').evaluate((el) => {
  const anims = el.getAnimations();
  return anims.map((a) => ({
    playState: a.playState,                  // 'running' | 'paused' | 'finished'
    currentTime: a.currentTime,              // advances while running
  }));
});
expect(state.some((a) => a.playState === 'running')).toBe(true);
```

To prove it *visibly begins* (not just exists), sample `currentTime` twice and
assert it advanced:

```ts
const t0 = await anim.evaluate((a) => a.currentTime);
await page.waitForTimeout(100);
const t1 = await anim.evaluate((a) => a.currentTime);
expect(t1).toBeGreaterThan(t0);
```

**Computed geometry / style deltas** — works for any movement, including
JS-driven `requestAnimationFrame` loops that never touch the Web Animations API.
Sample a position or style property across frames:

```ts
// requestAnimationFrame tick + transform delta over ~5 frames
const moved = await page.locator('#ball').evaluate(async (el) => {
  const read = () => getComputedStyle(el).transform; // matrix(...) string
  const start = read();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return read() !== start;
});
expect(moved).toBe(true);
```

Prefer `expect.poll` over manual sleeps so it auto-retries to a deadline:

```ts
await expect
  .poll(async () => page.locator('#ball').evaluate((el) =>
    el.getBoundingClientRect().left), { timeout: 2000 })
  .toBeGreaterThan(initialLeft);
```

**Canvas / WebGL animation** — there's no DOM to read, so diff the pixels.
Hash the canvas at two moments; a changed hash means it redrew:

```ts
const changed = await page.locator('canvas').evaluate(async (c) => {
  const snap = () => c.toDataURL();
  const a = snap();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return snap() !== a;
});
expect(changed).toBe(true);
```

**Screenshot diffs** (`toHaveScreenshot`) can assert a *specific* visual state,
but continuous animation makes them flaky — pin the animation to a known frame
first (e.g. `page.clock` / pause the animation / set `currentTime`), or mask the
moving region. Don't use a raw full-page screenshot to assert "it's animating";
use it to assert "it reached *this* frame".

### Audio

`HTMLMediaElement` exposes everything needed to prove playback deterministically:

```ts
const audio = page.locator('audio#track');
// It actually started and is progressing:
await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
  .toBeGreaterThan(0);
await audio.evaluate((a: HTMLAudioElement) => ({
  paused: a.paused,            // false while playing
  ended: a.ended,
  readyState: a.readyState,    // >= 2 (HAVE_CURRENT_DATA) once decodable
  duration: a.duration,
  played: a.played.length,     // TimeRanges that have played
}));
```

To prove the audio is **not silent** (real signal, not just a ticking clock),
tap the Web Audio graph with an `AnalyserNode` and read RMS energy:

```ts
const rms = await page.evaluate(async () => {
  const el = document.querySelector('audio')!;
  const ctx = new AudioContext();
  const src = ctx.createMediaElementSource(el);
  const analyser = ctx.createAnalyser();
  src.connect(analyser); analyser.connect(ctx.destination);
  const buf = new Float32Array(analyser.fftSize);
  await new Promise((r) => setTimeout(r, 200));
  analyser.getFloatTimeDomainData(buf);
  return Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
});
expect(rms).toBeGreaterThan(0.01); // above the noise floor
```

> **Autoplay caveat.** Browsers block audio until a user gesture. In tests
> either trigger playback from a real `click`, mute the element
> (`muted`/`volume = 0` still advances `currentTime`), or launch Chromium with
> `--autoplay-policy=no-user-gesture-required`. Capturing the *system* audio
> output of headless Chromium is not practical — the in-page `AnalyserNode`
> route above is how you observe the signal.

### Video

`HTMLVideoElement` is `HTMLMediaElement` plus dimensions and decoded frames:

```ts
await video.evaluate((v: HTMLVideoElement) => ({
  currentTime: v.currentTime,     // advances while playing
  readyState: v.readyState,       // >= 2 once a frame is decodable
  videoWidth: v.videoWidth,       // > 0 once metadata loaded
  videoHeight: v.videoHeight,
  played: v.played.length,
}));
```

To prove the picture is actually changing (not a frozen first frame), draw the
video to a canvas at two times and compare, same as the canvas-animation trick.
`video.requestVideoFrameCallback` gives you exact decoded-frame timing if you
need per-frame precision.

---

## Tier 3 — the LLM (semantic) judge

Some assertions are irreducibly perceptual and have no DOM/clock proxy:

- *"The video shows a person talking."*
- *"The animation looks smooth / not janky."*
- *"The lips are in sync with the audio."*
- *"The chart animates in from the left, then the legend fades in."*

For these, the test becomes: **capture evidence → ask a multimodal model →
assert on its structured verdict.**

### Capturing the evidence

- **Frames over time** — `page.screenshot()` on a timer, or extract frames from a
  `<video>`/`<canvas>` via `page.evaluate` (draw to canvas → `toDataURL` →
  base64). A short strip of 4–8 frames usually carries enough motion for a model
  to judge "begins", "smooth", "person talking".
- **Playwright video recording** — `video: 'on'` (or `'retain-on-failure'`, as
  this template already sets) records the whole page to `test-results/`. You can
  hand that file to a model, or extract frames from it.
- **Audio** — record the element with `MediaRecorder` in-page to get an audio
  blob, then transcribe / judge it. For "is someone talking", even the RMS/voice
  activity envelope from Tier 1 plus a couple of frames is often enough.

### Asking the judge

Send the captured frames (and/or audio/transcript) to a multimodal Claude model
and force a **structured** answer so the assertion is mechanical, not prose:

```ts
// e2e/helpers/llm-judge.ts  (sketch — not shipped in this template by default)
type Verdict = { pass: boolean; confidence: number; reason: string };

async function judge(frames: string[], claim: string): Promise<Verdict> {
  // POST frames (base64) + claim to claude-opus-4-8 with a tool/JSON schema
  // that forces { pass, confidence, reason }. Return the parsed object.
}

// in a spec:
const verdict = await judge(frames, 'A person is visibly talking to camera');
expect(verdict.pass, verdict.reason).toBe(true);
expect(verdict.confidence).toBeGreaterThan(0.7);
```

For **A/V sync** specifically: the robust approach is *correlation*, not a single
model glance. Extract the audio energy envelope (Tier 1 `AnalyserNode`) and a
mouth-openness / motion signal from the frames, and check they correlate in time;
use the LLM as a secondary judge on a few sampled moments. Pure "does it look in
sync" from one model pass is the least reliable assertion in this whole space —
treat its verdict as advisory and lean on the correlation signal.

### Tradeoffs (read before reaching for this)

- **Non-deterministic.** Same input can flip verdicts at the margin. Mitigate
  with a confidence threshold, a small N-of-M vote, and golden fixtures whose
  expected verdict you've eyeballed.
- **Costs money + latency** on every run.
- **Needs a key** (`ANTHROPIC_API_KEY`) wherever the suite runs — including the
  Daytona sandbox and CI.
- **Flaky-by-construction** for "smooth"/"in sync" judgments. Keep the
  deterministic Tier-1 gate *in front* of it so an LLM hiccup never masks a real
  "the video never loaded" regression.

---

## Recommended pattern for this template

This repo's per-commit gate is the **Daytona loop** (`yarn daytona:loop`): it
boots a warm snapshot, runs unit + e2e against the running app, and must stay
deterministic, fast, and key-free. That shapes the recommendation:

1. **Default everything to Tier 1/2 deterministic checks.** They belong in the
   normal `e2e/*.spec.ts` suite and run in the Daytona loop like any other test.
   For the vast majority of "did the animation start / did audio play / is the
   video advancing" assertions, this is all you need — and it's a *stronger*
   test than an LLM glance because it can't hallucinate a pass.

2. **Quarantine the LLM judge behind an opt-in flag.** Put semantic specs in
   their own files (e.g. `e2e/av-semantic.spec.ts`) and `test.skip()` them unless
   `ANTHROPIC_API_KEY` (and an explicit `RUN_LLM_E2E=1`) is present. That keeps
   the Daytona loop green and free by default, while letting a human or a nightly
   job run the perceptual suite deliberately. Shared capture/judge code lives in
   `e2e/helpers/`.

3. **Mind the Daytona/headless constraints** documented in
   [e2e-testing.md](e2e-testing.md): Chromium runs as root with
   `chromiumSandbox: false`; add `--autoplay-policy=no-user-gesture-required` to
   `launchOptions.args` if a spec needs unmuted autoplay; and remember the base
   image pins `@playwright/test` to the snapshot's browser version — don't bump
   one without the other.

### Decision shortcut

- *"Did it move / play / advance at all?"* → Tier 1. Always. No LLM.
- *"Did the **right** element reach the **right** state/frame?"* → Tier 1 scoped
  + masked screenshot. Still no LLM.
- *"Is it a person / smooth / in sync — something only a human eye/ear settles?"*
  → Tier 3, behind the opt-in gate, with a deterministic Tier-1 pre-check in
  front of it.

See also: [e2e-testing.md](e2e-testing.md) for the suite layout and
Daytona-loop alignment, and [daytona-loop.md](daytona-loop.md) for the
per-commit gate this advice is tuned around.
