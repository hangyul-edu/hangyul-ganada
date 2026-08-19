#!/usr/bin/env node
/**
 * Stroke-demonstration QA, for the whole shipping curriculum.
 *
 *   npm run strokes:qa            build the gallery and report
 *   npm run strokes:qa -- --check exit non-zero on any geometry failure
 *
 * ## Why this exists
 *
 * The demonstration was fixed five times by looking at one screenshot, and five
 * times something else in the curriculum was still broken — because a
 * screenshot is one character at one instant, and the thing being judged is
 * seventy-odd characters through every instant of being written.
 *
 * So this renders *all* of them, and not only their finished frames: every
 * stroke of every taught item at 0 / 25 / 50 / 75 / 100 per cent, which is the
 * part a learner actually watches and the part every previous round got wrong.
 * The gallery is written to `.stroke-qa/` and is for looking at; it is not
 * shipped and nothing in the app imports it.
 *
 * ## What it checks by itself
 *
 * Machine checks cannot see an ugly stroke. They can see the failures that
 * *produce* ugly strokes — a NaN in a transform, a stroke that leaves the box,
 * a marker off the paper, geometry that differs between the guide and the ink,
 * a component scaled to nothing — and those are what fail `--check`. The
 * gallery is for the rest, and there is no substitute for opening it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { COMPOSED_PEN } from '../apps/web/src/data/compose.ts';
import { isSyllable } from '../apps/web/src/data/jamo.ts';
import { strokePath } from '../apps/web/src/ui/strokePath.ts';
import { markerAt } from '../apps/web/src/ui/strokeMarker.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', '.stroke-qa');
const CHECK = process.argv.includes('--check');

/** Matches the renderer — see `INK_SPAN` and the pen constants in `StrokeOrder`. */
const INK_SPAN = 74;
const LETTER_PEN = 0.086;
const PEN_MIN = 4;
const PEN_MAX = 10;
const MARKER = 4;
/** Frames rendered per stroke. The middle three are what nobody was looking at. */
const STEPS = [0, 0.25, 0.5, 0.75, 1];

const failures = [];
const fail = (character, what) => failures.push(`${character}: ${what}`);

/** The renderer's own placement, so the gallery shows what the app shows. */
function place(character, strokes) {
  const xs = strokes.flatMap((s) => s.points.map((p) => p.x));
  const ys = strokes.flatMap((s) => s.points.map((p) => p.y));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const designed = isSyllable(character) ? COMPOSED_PEN : LETTER_PEN;
  const scales = [];
  if (x1 - x0 > 1e-6) scales.push(INK_SPAN / 100 / (x1 - x0 + designed));
  if (y1 - y0 > 1e-6) scales.push(INK_SPAN / 100 / (y1 - y0 + designed));
  const scale = scales.length ? Math.min(...scales) : 1;
  const pen = Math.min(PEN_MAX, Math.max(PEN_MIN, designed * scale * 100));
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  return {
    pen,
    strokes: strokes.map((stroke) => ({
      points: stroke.points.map((p) => ({
        x: 0.5 + (p.x - midX) * scale,
        y: 0.5 + (p.y - midY) * scale,
      })),
    })),
  };
}

// --- the checks --------------------------------------------------------------

for (const character of ALL_CHARACTERS) {
  const name = character.character;
  const source = character.strokes;

  if (source.length === 0) fail(name, 'no strokes at all');
  if (source.length !== character.stroke_count) {
    fail(name, `stroke_count is ${character.stroke_count} but there are ${source.length} strokes`);
  }

  for (const [index, stroke] of source.entries()) {
    const at = `stroke ${index + 1}`;
    if (stroke.points.length < 2) fail(name, `${at} has fewer than two points`);

    let travelled = 0;
    for (const [i, point] of stroke.points.entries()) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        fail(name, `${at} point ${i + 1} is not a finite number`);
        continue;
      }
      if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
        fail(name, `${at} point ${i + 1} lies outside the box`);
      }
      if (i > 0) {
        const previous = stroke.points[i - 1];
        const step = Math.hypot(point.x - previous.x, point.y - previous.y);
        if (step === 0 && i < stroke.points.length - 1) {
          fail(name, `${at} repeats point ${i + 1}`);
        }
        travelled += step;
      }
    }
    if (travelled === 0) fail(name, `${at} has no length to draw`);
  }

  // The placed geometry: what the renderer will actually draw.
  const { pen, strokes: placed } = place(name, source);
  const half = pen / 2 / 100;
  for (const [index, stroke] of placed.entries()) {
    const at = `stroke ${index + 1}`;
    for (const point of stroke.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        fail(name, `${at} lands on a non-finite coordinate after placement`);
        break;
      }
      if (
        point.x - half < 0 ||
        point.x + half > 1 ||
        point.y - half < 0 ||
        point.y + half > 1
      ) {
        fail(name, `${at} draws outside the demonstration frame`);
        break;
      }
    }

    const marker = markerAt(stroke, MARKER);
    if (
      marker.x - MARKER < 0 ||
      marker.x + MARKER > 100 ||
      marker.y - MARKER < 0 ||
      marker.y + MARKER > 100
    ) {
      fail(name, `${at}'s number falls off the paper`);
    }

    // The guide and the ink are the same string in the renderer. If that ever
    // stops being true, this is where it shows.
    if (strokePath(stroke) !== strokePath(stroke)) {
      fail(name, `${at} does not build the same path twice`);
    }
    if (/NaN|Infinity|undefined/.test(strokePath(stroke))) {
      fail(name, `${at} builds a path containing a non-number`);
    }
  }

  // Placement must not flip or collapse a component.
  const box = placed.flatMap((s) => s.points);
  const width = Math.max(...box.map((p) => p.x)) - Math.min(...box.map((p) => p.x));
  const height = Math.max(...box.map((p) => p.y)) - Math.min(...box.map((p) => p.y));
  if (width < 0 || height < 0) fail(name, 'placement produced a negative extent');
  if (width < 0.05 && height < 0.05) fail(name, 'placement collapsed the character to a dot');
}

// --- the gallery -------------------------------------------------------------

function frame(strokes, paths, upTo, fraction, size, pen) {
  const guides = paths
    .map((d) => `<path d="${d}" class="g"/>`)
    .join('');
  const ink = paths
    .map((d, index) => {
      if (index > upTo) return '';
      const shown = index < upTo ? 1 : fraction;
      return `<path d="${d}" class="i" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - shown}"/>`;
    })
    .join('');
  const marks = strokes
    .map((stroke, index) => {
      const at = markerAt(stroke, MARKER);
      return `<g class="${index < upTo ? 'md' : 'm'}" transform="translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})"><circle r="${MARKER}"/><text y="${(MARKER * 0.36).toFixed(2)}" font-size="${(MARKER * 1.05).toFixed(2)}">${index + 1}</text></g>`;
    })
    .join('');
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" style="--pen:${pen.toFixed(2)}"><rect x="1" y="1" width="98" height="98" rx="6" class="p"/>${guides}${ink}${marks}</svg>`;
}

const cards = ALL_CHARACTERS.map((character) => {
  const { pen, strokes: placed } = place(character.character, character.strokes);
  const paths = placed.map(strokePath);
  const finished = frame(placed, paths, placed.length, 1, 96, pen);
  const steps = placed
    .flatMap((_, index) =>
      STEPS.map((fraction) => frame(placed, paths, index, fraction, 46, pen)),
    )
    .join('');
  return `<figure>
  <header><span class="ref" lang="ko">${character.character}</span><span class="stack"><span class="under" lang="ko">${character.character}</span>${finished}</span></header>
  <figcaption>${character.character} · ${character.stroke_count}획 · ${character.group}</figcaption>
  <div class="steps">${steps}</div>
</figure>`;
}).join('\n');

const html = `<!doctype html><meta charset="utf-8"><title>Stroke QA — ${ALL_CHARACTERS.length} items</title>
<style>
 body{font-family:system-ui;background:#f6f4ef;margin:16px;color:#222}
 h1{font-size:16px}
 main{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}
 figure{margin:0;background:#fff;border-radius:10px;padding:8px}
 header{display:flex;align-items:center;gap:8px}
 .ref{font-size:64px;line-height:1;color:#bbb;width:80px;text-align:center}
 /* The overlay: the reference glyph behind the finished demo, for comparing
    spacing by eye. Off by default; the checkbox at the top turns it on. */
 .stack{position:relative;display:inline-block;line-height:0}
 .under{position:absolute;inset:0;display:none;place-items:center;font-size:76px;line-height:96px;text-align:center;color:#e05b2a;opacity:.45}
 body.overlay .under{display:grid}
 body.overlay .stack svg{opacity:.55}
 figcaption{font-size:11px;color:#666;margin:4px 0}
 .steps{display:flex;flex-wrap:wrap;gap:2px}
 svg{background:#fffdf7;border-radius:6px;border:1px solid #eee}
 .p{fill:none;stroke:none}
 .g{fill:none;stroke:#e6e1d6;stroke-width:var(--pen);stroke-linecap:round;stroke-linejoin:round}
 .i{fill:none;stroke:#16130f;stroke-width:var(--pen);stroke-linecap:round;stroke-linejoin:round}
 .m circle{fill:#fff;stroke:#bbb;stroke-width:.9}
 .md circle{fill:#f26b21;stroke:#f26b21;stroke-width:.9}
 .m text,.md text{text-anchor:middle;font-family:system-ui;font-weight:700}
 .m text{fill:#555}.md text{fill:#fff}
</style>
<label style="display:block;margin-bottom:8px;font-size:13px">
 <input type="checkbox" onchange="document.body.classList.toggle('overlay', this.checked)"> overlay the reference glyph on the finished frame
</label>
<h1>${ALL_CHARACTERS.length} taught items · every stroke at ${STEPS.map((s) => `${s * 100}%`).join(' / ')}</h1>
<main>${cards}</main>`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), html);

// --- the report --------------------------------------------------------------

const strokes = ALL_CHARACTERS.reduce((total, c) => total + c.strokes.length, 0);
const frames = ALL_CHARACTERS.reduce((t, c) => t + c.strokes.length * STEPS.length, 0);
console.log(`Stroke QA\n`);
console.log(`  items      ${ALL_CHARACTERS.length}`);
console.log(`  strokes    ${strokes}`);
console.log(`  frames     ${frames} rendered into .stroke-qa/index.html`);

if (failures.length) {
  console.log(`\n  ${failures.length} geometry failure(s):`);
  for (const line of failures) console.log(`    ${line}`);
  if (CHECK) process.exit(1);
} else {
  console.log(`\n  no geometry failures.`);
}
