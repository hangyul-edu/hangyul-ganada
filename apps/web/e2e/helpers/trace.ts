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

/*
 * A both-axes area tracer used to live here, and it is gone deliberately.
 *
 * It filled the glyph by laying one stroke down every sampled row *and* every
 * sampled column — about sixty-five strokes for a syllable — which was how the
 * word-writing specs got a four-syllable word past the grader reliably.
 *
 * The grader now measures how far the pen travelled (`path.ts`), and an area
 * fill travels several times the length of the letter. It is rejected, and that
 * is correct: colouring a shape in is not one of the beginner behaviours §12
 * asks the product to accept, and "excessive path length" is one §13 asks it to
 * reject. A fixture that needs the gate loosened to pass is a fixture arguing
 * for the scribble hole to be reopened.
 *
 * `traceReferenceGlyph` remains, draws one stroke per row, and passes.
 */
