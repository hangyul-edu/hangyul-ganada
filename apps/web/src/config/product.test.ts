import { describe, expect, it } from 'vitest';

import { PRODUCT, appVersion, displayVersion } from './product';

/**
 * The release number, pinned.
 *
 * `scripts/check-version-consistency.mjs` proves every file *agrees*; this
 * proves what they agree *on*. A tree in which every copy had drifted to the
 * same wrong number would pass the consistency gate and fail here.
 */
describe('web release version', () => {
  it('is exactly 1.0.5', () => {
    expect(PRODUCT.version).toBe('1.0.5');
    expect(appVersion()).toBe('1.0.5');
  });

  it('is shown to a learner as v1.0.5 — no dot after the v, no other number', () => {
    expect(displayVersion()).toBe('v1.0.5');
    expect(displayVersion()).not.toMatch(/^v\./);
    expect(displayVersion()).not.toContain('1.0.4');
    expect(displayVersion()).not.toContain('1.0.6');
  });

  /*
   * The web leads the native deliveries and never lags them.
   *
   * 1.0.5 is what the delivered APK/AAB and the Xcode project carry since the
   * native rebuild of 18 September 2026 (they sat at 1.0.4 for three web-only
   * passes); a web product that reported an *older* number than the binary
   * built from the same tree would be the drift `version:check` exists to
   * catch. The gate enforces the ordering across files; this pins it from the
   * web's side so a tree in which every copy had drifted together still fails
   * somewhere.
   */
  it('never falls behind the delivered native version', () => {
    const parse = (v: string) => v.split('.').map(Number) as [number, number, number];
    const web = parse(PRODUCT.version);
    const native = parse('1.0.5');
    const cmp = web.map((part, i) => part - native[i]!).find((d) => d !== 0) ?? 0;
    expect(cmp).toBeGreaterThanOrEqual(0);
  });

  it('is a three-part release number', () => {
    expect(PRODUCT.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
