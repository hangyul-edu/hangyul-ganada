import type { Locator, Page } from '@playwright/test';

/**
 * Traces the reference glyph shown inside a writing box.
 *
 * The path is derived from the guide canvas's own pixels rather than from
 * hard-coded coordinates. That matters for two reasons: hard-coded coordinates
 * silently rot when a glyph, font or layout changes, and — more importantly —
 * a test that traces where the guide actually is will fail if the guide and the
 * evaluation mask ever drift apart again. This is the regression test for that
 * bug, not just a way to draw.
 *
 * Ink is laid down as one horizontal stroke per sampled row of the glyph, which
 * is what a learner filling in a traced outline produces.
 */
export async function traceReferenceGlyph(page: Page, box: Locator): Promise<void> {
  const runs = await inkRuns(box);
  if (runs.length === 0) throw new Error('reference glyph has no ink — is the font loaded?');

  const rect = await box.locator('canvas').first().boundingBox();
  if (!rect) throw new Error('writing box is not visible');

  for (const run of runs) {
    const y = rect.y + run.y * rect.height;
    const x0 = rect.x + run.x0 * rect.width;
    const x1 = rect.x + run.x1 * rect.width;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    const steps = Math.max(2, Math.round((x1 - x0) / 6));
    for (let i = 1; i <= steps; i += 1) {
      await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y);
    }
    await page.mouse.up();
  }
}

/** Draws a scribble that is unmistakably not the target character. */
export async function drawScribble(page: Page, box: Locator): Promise<void> {
  const rect = await box.locator('canvas').first().boundingBox();
  if (!rect) throw new Error('writing box is not visible');

  // A deterministic zigzag across the whole box — no randomness, so a failure
  // here is always reproducible.
  const points: [number, number][] = [
    [0.1, 0.15],
    [0.9, 0.35],
    [0.15, 0.5],
    [0.85, 0.7],
    [0.2, 0.85],
    [0.8, 0.2],
    [0.5, 0.9],
  ];
  await page.mouse.move(rect.x + rect.width * 0.1, rect.y + rect.height * 0.15);
  await page.mouse.down();
  for (const [px, py] of points) {
    await page.mouse.move(rect.x + rect.width * px, rect.y + rect.height * py, { steps: 8 });
  }
  await page.mouse.up();
}

interface InkRun {
  /** All normalised 0..1 within the box. */
  y: number;
  x0: number;
  x1: number;
}

/**
 * Reads horizontal runs of ink out of the guide canvas, sampling every few
 * rows. Runs shorter than a couple of percent of the box are dropped — they are
 * antialiasing fringe, not strokes.
 */
async function inkRuns(box: Locator): Promise<InkRun[]> {
  return box.locator('canvas').first().evaluate((canvas) => {
    const el = canvas as HTMLCanvasElement;
    const ctx = el.getContext('2d');
    if (!ctx) return [];
    const { width, height } = el;
    const { data } = ctx.getImageData(0, 0, width, height);

    const out: { y: number; x0: number; x1: number }[] = [];
    const step = Math.max(1, Math.round(height / 26));

    for (let y = 0; y < height; y += step) {
      let start = -1;
      for (let x = 0; x <= width; x += 1) {
        const inked = x < width && data[(y * width + x) * 4 + 3]! > 96;
        if (inked && start === -1) start = x;
        if (!inked && start !== -1) {
          if (x - start > width * 0.02) {
            out.push({ y: (y + 0.5) / height, x0: (start + 0.5) / width, x1: (x - 0.5) / width });
          }
          start = -1;
        }
      }
    }
    return out;
  });
}

/**
 * Traces a glyph along both axes.
 *
 * `traceReferenceGlyph` lays down one horizontal stroke per sampled row, which
 * is what a learner filling in an outline produces and is enough for the simple
 * shapes the letter journey uses. It is not enough for every Hangul syllable: a
 * vertical stem — the ㅏ in 다, the ㅣ in 기 — is a *narrow* run on every row it
 * crosses, and narrow runs are dropped as antialiasing fringe. The stem then
 * never gets drawn, and where two stems sit either side of a gap the row runs
 * can instead merge across it and put ink where the glyph has none.
 *
 * Scanning columns as well as rows fixes both: a vertical stem is one long run
 * in its own column, and nothing has to be inferred across a gap.
 *
 * Used by the word-writing specs, where every syllable of a four-syllable word
 * has to be traced well enough to pass — a fixture that fails one syllable in
 * four cannot tell a layout regression from its own limits.
 */
export async function traceGlyphThoroughly(page: Page, box: Locator): Promise<void> {
  const rect = await box.locator('canvas').first().boundingBox();
  if (!rect) throw new Error('writing box is not visible');

  const { rows, columns } = await inkRunsBothAxes(box);
  if (rows.length === 0 && columns.length === 0) {
    throw new Error('reference glyph has no ink — is the font loaded?');
  }

  for (const run of rows) {
    const y = rect.y + run.at * rect.height;
    await drag(page, rect.x + run.from * rect.width, y, rect.x + run.to * rect.width, y);
  }
  for (const run of columns) {
    const x = rect.x + run.at * rect.width;
    await drag(page, x, rect.y + run.from * rect.height, x, rect.y + run.to * rect.height);
  }
}

async function drag(page: Page, x0: number, y0: number, x1: number, y1: number): Promise<void> {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 6));
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
  }
  await page.mouse.up();
}

/** A run of ink along one axis, all values normalised 0..1 within the box. */
interface AxisRun {
  /** Position on the perpendicular axis. */
  at: number;
  from: number;
  to: number;
}

async function inkRunsBothAxes(
  box: Locator,
): Promise<{ rows: AxisRun[]; columns: AxisRun[] }> {
  return box.locator('canvas').first().evaluate((canvas) => {
    const el = canvas as HTMLCanvasElement;
    const ctx = el.getContext('2d');
    if (!ctx) return { rows: [], columns: [] };
    const { width, height } = el;
    const { data } = ctx.getImageData(0, 0, width, height);
    const inked = (x: number, y: number) => data[(y * width + x) * 4 + 3]! > 96;

    // Runs shorter than this are antialiasing fringe rather than a stroke.
    const MIN = 0.02;

    const scan = (
      outer: number,
      inner: number,
      isInk: (o: number, i: number) => boolean,
    ): AxisRun[] => {
      const out: AxisRun[] = [];
      const step = Math.max(1, Math.round(outer / 26));
      for (let o = 0; o < outer; o += step) {
        let start = -1;
        for (let i = 0; i <= inner; i += 1) {
          const on = i < inner && isInk(o, i);
          if (on && start === -1) start = i;
          if (!on && start !== -1) {
            if (i - start > inner * MIN) {
              out.push({
                at: (o + 0.5) / outer,
                from: (start + 0.5) / inner,
                to: (i - 0.5) / inner,
              });
            }
            start = -1;
          }
        }
      }
      return out;
    };

    return {
      rows: scan(height, width, (y, x) => inked(x, y)),
      columns: scan(width, height, (x, y) => inked(x, y)),
    };
  });
}
