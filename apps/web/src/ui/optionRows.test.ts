import { describe, expect, it } from 'vitest';

import { optionRows } from './optionRows';

/**
 * The reported defect is the first case: five tiles must be three and two.
 *
 * The rest are here because "5 goes 3 + 2" is the symptom and "rows are
 * balanced" is the rule, and a test that only pinned the symptom would let the
 * next count regress. Every row length is asserted, not just the first.
 */
describe('option rows', () => {
  const shape = (count: number) =>
    optionRows(Array.from({ length: count }, (_, index) => index)).map((row) => row.length);

  it('never renders five as four and one', () => {
    expect(shape(5)).toEqual([3, 2]);
  });

  it.each([
    [1, [1]],
    [2, [2]],
    [3, [3]],
    [4, [4]],
    [5, [3, 2]],
    [6, [3, 3]],
    [7, [4, 3]],
    [8, [4, 4]],
    [9, [3, 3, 3]],
    [10, [4, 3, 3]],
    [12, [4, 4, 4]],
  ])('lays %i tiles out as %j', (count, expected) => {
    expect(shape(count)).toEqual(expected);
  });

  it('leaves no row with a single tile while another has four', () => {
    for (let count = 2; count <= 24; count += 1) {
      const rows = shape(count);
      expect(Math.max(...rows) - Math.min(...rows), `${count} tiles`).toBeLessThanOrEqual(1);
    }
  });

  it('keeps every tile, once, in the order it was given', () => {
    for (let count = 0; count <= 24; count += 1) {
      const given = Array.from({ length: count }, (_, index) => index);
      expect(optionRows(given).flat()).toEqual(given);
    }
  });

  it('never puts more than four on a row', () => {
    for (let count = 0; count <= 40; count += 1) {
      for (const row of shape(count)) expect(row).toBeLessThanOrEqual(4);
    }
  });
});
