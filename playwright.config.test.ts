import { describe, expect, it } from 'vitest';
import config from './playwright.config';

/**
 * Guards the always-on artifact capture the Daytona loop relies on: a PASS run
 * must return the same screenshots/traces/video as a FAIL run, so a green commit
 * is as inspectable as a red one. If someone reverts these to *-on-failure the
 * passing-run artifacts silently disappear — this test fails loudly instead.
 */
describe('playwright config — always-on artifact capture', () => {
  it('captures screenshots, traces and video on success as well as failure', () => {
    expect(config.use?.screenshot).toBe('on');
    expect(config.use?.trace).toBe('on');
    expect(config.use?.video).toBe('on');
  });

  it('writes artifacts to test-results/ so the harness bundles them on PASS and FAIL', () => {
    expect(config.outputDir).toBe('./test-results');
  });
});
