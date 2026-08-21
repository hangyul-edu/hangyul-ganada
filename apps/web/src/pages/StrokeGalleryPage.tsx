import { useMemo, useState } from 'react';

import { ALL_CHARACTERS } from '../data/characters';
import { hasVectorGlyph, vectorGlyph, type VectorGlyph } from '../data/strokeVectors';
import { ReferenceGlyph } from '../ui/ReferenceGlyph';
import { StrokeOrder } from '../ui/StrokeOrder';
import { layoutMarkers } from '../ui/strokeMarkers';
import styles from './StrokeGalleryPage.module.css';

/**
 * Every taught character's instructional geometry, on one page, for looking at.
 *
 * ## Not part of the app
 *
 * There is no link to this from anywhere a learner can reach, it is not in any
 * navigation, and `App.tsx` only mounts the route when `import.meta.env.DEV` is
 * true — so it is not in the production bundle at all. It exists because the
 * demonstration was signed off five times on the strength of one screenshot,
 * and five times something else in the curriculum was still wrong.
 *
 * ## Numbers are not what is being checked here
 *
 * `npm run strokes:qa` validates the data — no NaN in a path, nothing outside
 * the box, an end classified `join` genuinely landing on another stroke. All of
 * that passed, on all 73 items, through every round in which the demonstration
 * was visibly broken on screen. The question this page asks is the one no
 * assertion can: *does it look like the letter?* So everything here is rendered
 * at a size a person can judge, and the answer is a person looking at it.
 *
 * ## What it shows, and why in that order
 *
 * **The reference and the instruction, side by side.** The typeface glyph the
 * learner studies, and the last frame of the animation they copy. These are no
 * longer the same geometry — see `ui/ReferenceGlyph` — so the fact that they
 * still agree is a claim, and a claim on display is a claim being checked.
 *
 * **Each stroke alone.** A stroke that is wrong is easiest to see with nothing
 * else on the paper.
 *
 * **The sequence** — every stroke at 0 / 25 / 50 / 75 / 100 per cent. This is
 * the part a learner watches and the part every previous round of this got
 * wrong: the defects that shipped were all *intermediate* states, ink on the
 * paper before the pen had been there.
 *
 * **At the size a phone draws it.** The reported defect was seen on an Android
 * browser, not a desktop, and a 150 px review of a 96 px picture is a different
 * question.
 *
 * Overlay mode drops everything to half opacity so the reference can be read
 * *through* the frames; a stroke landing off its own glyph shows as a doubled
 * edge.
 */
export function StrokeGalleryPage() {
  const [overlay, setOverlay] = useState(false);
  const [live, setLive] = useState(false);

  const items = useMemo(() => ALL_CHARACTERS.filter((c) => hasVectorGlyph(c.character)), []);
  const absent = ALL_CHARACTERS.filter((c) => !hasVectorGlyph(c.character));
  const strokes = items.reduce((n, c) => n + vectorGlyph(c.character).strokes.length, 0);

  return (
    <div className={`${styles.page} ${overlay ? styles.overlay : ''}`}>
      <header className={styles.head}>
        <h1>
          Stroke gallery — {items.length} items, {strokes} strokes
        </h1>
        <p>
          Authored centrelines from <code>data/strokeVectors</code>, stroked with the pen the
          reference face uses. The large character beside each one is the typeface itself: they
          are different geometry that should agree.
        </p>
        <div className={styles.controls}>
          <label>
            <input
              type="checkbox"
              checked={overlay}
              onChange={(e) => setOverlay(e.target.checked)}
            />{' '}
            Overlay — everything at 50% opacity
          </label>
          <label>
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />{' '}
            Play the real demonstration component
          </label>
        </div>
        {absent.length > 0 && (
          <p className={styles.absent}>
            No geometry for {absent.map((c) => c.character).join(' ')} — see{' '}
            <code>data/strokes.ts</code>.
          </p>
        )}
      </header>

      {items.map((character) => (
        <Card key={character.character} character={character.character} live={live} />
      ))}
    </div>
  );
}

const STEPS = [0, 0.25, 0.5, 0.75, 1];

/** The width the demonstration is actually drawn at on the narrowest phone. */
const PHONE_SIZE = 96;

function Card({ character, live }: { character: string; live: boolean }) {
  const glyph = vectorGlyph(character);
  const radius = glyph.strokes.length > 4 ? 4 : 5.6;
  const markers = layoutMarkers(glyph.strokes, radius);

  return (
    <section className={styles.card}>
      <h2>
        {character}{' '}
        <small>
          {glyph.strokes.length} strokes · pen {glyph.pen} ·{' '}
          {glyph.strokes
            .map((s) => `${s.order}:${s.ends.start[0]}${s.ends.end[0]}`)
            .join(' ')}
        </small>
      </h2>

      <div className={styles.pair}>
        <figure>
          <ReferenceGlyph character={character} size={150} className={styles.ref} />
          <figcaption>REFERENCE — the typeface</figcaption>
        </figure>
        <figure>
          <Frame glyph={glyph} upTo={glyph.strokes.length} fraction={0} size={150} />
          <figcaption>FINAL STROKE FRAME</figcaption>
        </figure>
        <figure>
          <svg viewBox="0 0 100 100" width={150} height={150} className={styles.ref}>
            {glyph.strokes.map((s) => (
              <path
                key={s.order}
                d={s.d}
                fill="none"
                stroke="#111"
                strokeWidth={glyph.pen}
                strokeLinecap="butt"
                strokeLinejoin="miter"
                strokeMiterlimit={3}
              />
            ))}
            {markers.map((m) => (
              <g key={m.order}>
                {m.tethered && (
                  <line
                    x1={m.anchor.x}
                    y1={m.anchor.y}
                    x2={m.label.x}
                    y2={m.label.y}
                    stroke="#999"
                    strokeWidth={0.6}
                  />
                )}
                <circle
                  cx={m.label.x}
                  cy={m.label.y}
                  r={radius}
                  fill="#fff"
                  stroke="#999"
                  strokeWidth={0.9}
                />
                <text
                  x={m.label.x}
                  y={m.label.y + radius * 0.36}
                  fontSize={radius * 1.05}
                  textAnchor="middle"
                  fontWeight={700}
                  fill="#444"
                >
                  {m.order}
                </text>
              </g>
            ))}
          </svg>
          <figcaption>markers</figcaption>
        </figure>
        <figure>
          <Frame glyph={glyph} upTo={glyph.strokes.length} fraction={0} size={PHONE_SIZE} />
          <figcaption>at {PHONE_SIZE} px — phone size</figcaption>
        </figure>
        {live && (
          <figure>
            <StrokeOrder character={character} size={150} />
            <figcaption>the shipping component</figcaption>
          </figure>
        )}
      </div>

      {/* Each stroke on its own paper. A malformed stroke hides in a finished
          letter and cannot hide here. */}
      <div className={styles.strip}>
        {glyph.strokes.map((stroke) => (
          <div key={`solo-${stroke.order}`} className={styles.frame}>
            <svg viewBox="0 0 100 100" width={88} height={88} className={styles.ref}>
              <path
                d={stroke.d}
                fill="none"
                stroke="#111"
                strokeWidth={glyph.pen}
                strokeLinecap="butt"
                strokeLinejoin="miter"
                strokeMiterlimit={3}
              />
            </svg>
            <span>
              {stroke.order} alone · {stroke.ends.start}/{stroke.ends.end}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.strip}>
        {glyph.strokes.map((_, index) =>
          STEPS.map((step) => (
            <div key={`${index}-${step}`} className={styles.frame}>
              <Frame glyph={glyph} upTo={index} fraction={step} size={88} />
              <span>
                {index + 1} · {Math.round(step * 100)}%
              </span>
            </div>
          )),
        )}
      </div>
    </section>
  );
}

/**
 * One frame of the demonstration.
 *
 * Deliberately the same three lines the shipping component uses — grey guide,
 * finished strokes, the active one dash-revealed — because a QA sheet drawn a
 * second way is a QA sheet that can pass while the product is wrong. That is
 * exactly how the wedge at the corner of ㄱ survived: it was in both, drawn
 * identically, and both agreed it was fine.
 */
function Frame({
  glyph,
  upTo,
  fraction,
  size,
}: {
  glyph: VectorGlyph;
  upTo: number;
  fraction: number;
  size: number;
}) {
  const active = fraction > 0 ? glyph.strokes[upTo] : undefined;
  const pen = {
    fill: 'none',
    strokeWidth: glyph.pen,
    strokeLinecap: 'butt',
    strokeLinejoin: 'miter',
    strokeMiterlimit: 3,
  } as const;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={styles.ref}>
      {glyph.strokes.map((s) => (
        <path key={`g${s.order}`} d={s.d} stroke="#d9d9d9" {...pen} />
      ))}
      {glyph.strokes.slice(0, upTo).map((s) => (
        <path key={`i${s.order}`} d={s.d} stroke="#111" {...pen} />
      ))}
      {active && (
        <path
          d={active.d}
          stroke="#111"
          {...pen}
          strokeDasharray={active.length}
          strokeDashoffset={active.length * (1 - fraction)}
        />
      )}
    </svg>
  );
}
