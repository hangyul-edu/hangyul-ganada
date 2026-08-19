import { useMemo, useState } from 'react';

import { ALL_CHARACTERS } from '../data/characters';
import { STROKE_ASSETS, STROKE_ASSET_FACE, hasStrokeAsset, strokeAsset } from '../data/strokeAssets';
import { ReferenceGlyph } from '../ui/ReferenceGlyph';
import { StrokeOrder } from '../ui/StrokeOrder';
import { layoutMarkers } from '../ui/strokeMarkers';
import styles from './StrokeGalleryPage.module.css';

/**
 * Every taught character's stroke asset, on one page, for looking at.
 *
 * ## Not part of the app
 *
 * There is no link to this from anywhere a learner can reach, it is not in any
 * navigation, and `App.tsx` only mounts the route when `import.meta.env.DEV` is
 * true — so it is not in the production bundle at all. It exists because the
 * demonstration was signed off five times on the strength of one screenshot, and
 * five times something else in the curriculum was still wrong.
 *
 * ## What it shows, and why in that order
 *
 * The two things that have to agree, side by side and at the same size: the
 * REFERENCE — the union of every stroke — and the FINAL STROKE FRAME the
 * animation lands on. If those two ever differ, the asset is broken in the one
 * way that matters most, because the learner would be copying a shape the
 * lesson never actually taught. They cannot differ by construction, and that is
 * exactly why they are worth putting next to each other: it is the claim being
 * checked, so it is the claim on display.
 *
 * Then the sequence — every stroke at 0 / 25 / 50 / 75 / 100 per cent, which is
 * the part a learner watches and the part every previous round of this got
 * wrong. Overlay mode drops everything to half opacity so the reference can be
 * read *through* the frames; a stroke landing off its own glyph shows up
 * immediately as a doubled edge.
 *
 * `npm run strokes:qa` renders the same thing to a static file, for a machine to
 * check and for review without a dev server running.
 */
export function StrokeGalleryPage() {
  const [overlay, setOverlay] = useState(false);
  const [live, setLive] = useState(false);

  const items = useMemo(
    () => ALL_CHARACTERS.filter((c) => hasStrokeAsset(c.character)),
    [],
  );
  const absent = ALL_CHARACTERS.filter((c) => !hasStrokeAsset(c.character));

  return (
    <div className={`${styles.page} ${overlay ? styles.overlay : ''}`}>
      <header className={styles.head}>
        <h1>
          Stroke gallery — {items.length} items,{' '}
          {items.reduce((n, c) => n + strokeAsset(c.character).strokes.length, 0)} strokes
        </h1>
        <p>
          Cut from <code>{STROKE_ASSET_FACE}</code>. Every stroke is an outline taken from the
          reference glyph, so the union of a character&rsquo;s strokes is that glyph.
        </p>
        <div className={styles.controls}>
          <label>
            <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />{' '}
            Overlay — everything at 50% opacity
          </label>
          <label>
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Play
            the real demonstration component
          </label>
        </div>
        {absent.length > 0 && (
          <p className={styles.absent}>
            No asset for {absent.map((c) => c.character).join(' ')} — run{' '}
            <code>npm run strokes:build</code>.
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

function Card({ character, live }: { character: string; live: boolean }) {
  const asset = STROKE_ASSETS[character]!;
  const radius = asset.strokes.length > 4 ? 4 : 5.6;
  const markers = layoutMarkers(asset.strokes, radius);

  return (
    <section className={styles.card}>
      <h2>
        {character}{' '}
        <small>
          {asset.group} · {asset.strokes.length} strokes · {asset.segmentation ?? '—'}
        </small>
      </h2>

      <div className={styles.pair}>
        <figure>
          <ReferenceGlyph character={character} size={150} className={styles.ref} />
          <figcaption>REFERENCE — union of all strokes</figcaption>
        </figure>
        <figure>
          <Frame asset={asset} upTo={asset.strokes.length} fraction={0} size={150} />
          <figcaption>FINAL STROKE FRAME</figcaption>
        </figure>
        <figure>
          <svg viewBox="0 0 100 100" width={150} height={150} className={styles.ref}>
            {asset.strokes.map((s) => (
              <path key={s.order} d={s.shape} fill="#111" fillRule="evenodd" />
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
                <circle cx={m.label.x} cy={m.label.y} r={radius} fill="#fff" stroke="#999" strokeWidth={0.9} />
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
        {live && (
          <figure>
            <StrokeOrder character={character} size={150} />
            <figcaption>the shipping component</figcaption>
          </figure>
        )}
      </div>

      <div className={styles.strip}>
        {asset.strokes.map((_, index) =>
          STEPS.map((step) => (
            <div key={`${index}-${step}`} className={styles.frame}>
              <Frame asset={asset} upTo={index} fraction={step} size={88} />
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

function Frame({
  asset,
  upTo,
  fraction,
  size,
}: {
  asset: (typeof STROKE_ASSETS)[string];
  upTo: number;
  fraction: number;
  size: number;
}) {
  const active = fraction > 0 ? asset.strokes[upTo] : undefined;
  const id = `qa-${asset.character.codePointAt(0)}-${upTo}-${Math.round(fraction * 100)}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={styles.ref}>
      {asset.strokes.map((s) => (
        <path key={`g${s.order}`} d={s.shape} fill="#d9d9d9" fillRule="evenodd" />
      ))}
      {asset.strokes.slice(0, upTo).map((s) => (
        <path key={`i${s.order}`} d={s.shape} fill="#111" fillRule="evenodd" />
      ))}
      {active && (
        <>
          <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
            <path
              d={`M${active.draw}`}
              fill="none"
              stroke="#fff"
              strokeWidth={active.reveal}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - fraction}
            />
          </mask>
          <path d={active.shape} fill="#111" fillRule="evenodd" mask={`url(#${id})`} />
        </>
      )}
    </svg>
  );
}
