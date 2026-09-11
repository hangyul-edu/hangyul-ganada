import { describe, expect, it } from 'vitest';

import { PRODUCT, appVersion, displayVersion } from './product';

/**
 * The release number, pinned.
 *
 * `scripts/check-version-consistency.mjs` proves every file *agrees*; this
 * proves what they agree *on*. A tree in which every copy had drifted to the
 * same wrong number would pass the consistency gate and fail here.
 */
describe('release version', () => {
  it('is exactly 1.0.4', () => {
    expect(PRODUCT.version).toBe('1.0.4');
    expect(appVersion()).toBe('1.0.4');
  });

  it('is shown to a learner as v1.0.4 — no dot after the v, no other number', () => {
    expect(displayVersion()).toBe('v1.0.4');
    expect(displayVersion()).not.toMatch(/^v\./);
    expect(displayVersion()).not.toContain('1.0.6');
  });

  it('is a three-part release number', () => {
    expect(PRODUCT.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
