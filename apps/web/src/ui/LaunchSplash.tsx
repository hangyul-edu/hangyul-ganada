import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocale } from '../i18n/LocaleContext';
import { useLearner } from '../store/LearnerContext';
import styles from './LaunchSplash.module.css';

/*
 * Long enough to be read, short enough that nobody waits.
 *
 * This was 1.8 s when the artwork was a clip, because that was how long the
 * animation took to reach the wordmark. The artwork is a still now and the
 * wordmark is there in the first frame, so the only thing left to buy is the
 * time it takes to actually look at it — under a second, and a splash that
 * outstays that is a splash people learn to resent. On a cold start the profile
 * takes longer than this anyway and the readiness below is what decides.
 */
const MINIMUM_MS = 900;
const CEILING_MS = 4000;
const FADE_MS = 260;

/**
 * The brand screen the app opens on.
 *
 * ## What it is for
 *
 * Two things, and nothing else. It covers the moment between the app appearing
 * and the learner's own profile arriving from IndexedDB — a gap that is a few
 * milliseconds on a laptop and most of a second on a cheap phone with a cold
 * cache — and it is the one place in the product where the brand gets to
 * introduce itself. It is not a loading indicator, it does not report progress,
 * and it never asks for anything.
 *
 * ## Why the language matters here
 *
 * The artwork carries a wordmark and a line of copy, so it is not language
 * neutral: 한귤 with 작은 귤 한 조각처럼, 매일 한 글자씩, or Han gyul with
 * *Like a slice of tangerine, one letter a day*. A learner who set the app to Spanish
 * should not be met by a screen in Korean, so the Korean artwork is used when —
 * and only when — the interface language is Korean, and the English artwork for
 * every other language. That is a deliberate two-way split rather than a
 * thirty-two-way one: the alternative is a wordmark rendered in a face that has
 * not loaded yet, over artwork it was not laid out for.
 *
 * ## Why it holds for a moment even when there is nothing to wait for
 *
 * On a fast device the profile is ready before the first frame, and dismissing
 * on readiness alone makes the splash a flash — worse than not having one. So
 * it stays for a short minimum and then leaves as soon as the app is ready. On
 * a slow device the readiness is what it waits for, and the minimum has already
 * passed.
 *
 * There is a ceiling as well as a floor. If the store never answers — a
 * corrupted database, a browser with storage disabled — the splash still goes,
 * because a learner looking at a brand screen that never lifts has no way to
 * tell that from a crash, and the app behind it works perfectly well on
 * defaults.
 *
 * ## It does not move
 *
 * The artwork was a short clip and is now a still PNG, which is the whole of
 * the change. A motion splash is a cost paid on every single launch by every
 * learner: a video element to decode before first paint, an autoplay policy
 * that can refuse, a `prefers-reduced-motion` branch to keep in step with the
 * one that plays, and a second or so of the learner's time bought to show them
 * something they have already seen. None of that bought anything the picture
 * does not say by being on screen. There is no `<video>` here, no animated
 * format, and no motion branch — the file *is* the splash.
 */
export function LaunchSplash() {
  const { ready } = useLearner();
  const [gone, setGone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const openedAt = useRef(performance.now());
  const held = useRef(false);

  const leave = useCallback(() => {
    if (held.current) return;
    held.current = true;
    setLeaving(true);
    window.setTimeout(() => setGone(true), FADE_MS);
  }, []);

  /*
   * Go as soon as the profile is here, but not before the artwork has had its
   * moment.
   *
   * Keyed on `ready` rather than run once. Run once — with `ready` read inside
   * a timer the effect scheduled — the value is the one captured at mount,
   * which on a cold start is `false` and stays `false` in that closure however
   * many times the store answers. The splash then never noticed it was ready
   * and sat out its full ceiling on every single launch, which is exactly what
   * a walkthrough of the built app showed it doing.
   */
  useEffect(() => {
    if (!ready) return undefined;
    const remaining = Math.max(0, MINIMUM_MS - (performance.now() - openedAt.current));
    const timer = window.setTimeout(leave, remaining);
    return () => window.clearTimeout(timer);
  }, [ready, leave]);

  /*
   * The backstop.
   *
   * If the store never answers — a corrupted database, a browser with storage
   * disabled — the splash still goes. A learner looking at a brand screen that
   * never lifts has no way to tell that from a crash, and the app behind it
   * works perfectly well on defaults.
   */
  useEffect(() => {
    const timer = window.setTimeout(leave, CEILING_MS);
    return () => window.clearTimeout(timer);
  }, [leave]);

  if (gone) return null;

  return <SplashArt leaving={leaving} />;
}

/**
 * The artwork itself.
 *
 * Split out so the language choice and the image are one small thing that a
 * visual review and the e2e suite can point at — `data-splash-language` is on
 * this element for exactly that — and so the dismissal clock above has nothing
 * to do with rendering.
 */
function SplashArt({ leaving }: { leaving: boolean }) {
  const korean = useKoreanInterface();
  const tag = korean ? 'ko' : 'en';
  /*
   * Two files, and the only two there are.
   *
   * `splash-ko.png` and `splash-en.png`, straight from
   * `apps/common_assets/splash`. The interface has thirty-odd languages and the
   * artwork has two, because the split is Korean versus not-Korean rather than
   * one picture per locale — see the note on this component. A locale with no
   * artwork of its own is not a gap to fill; it is the English one, by design.
   */
  const src = `${import.meta.env.BASE_URL}brand/splash/splash-${tag}.png`;

  return (
    <div
      className={`${styles.splash} ${leaving ? styles.leaving : ''}`}
      // Decorative: the app behind it is the content, and a screen reader
      // should be reading that rather than announcing a logo.
      aria-hidden="true"
      data-testid="launch-splash"
      data-splash-language={tag}
    >
      <img
        className={styles.art}
        src={src}
        alt=""
        // The first pixels of the app: never lazy, never queued behind the
        // fonts and the curriculum.
        fetchPriority="high"
        decoding="sync"
      />
    </div>
  );
}

/**
 * Whether the interface is in Korean.
 *
 * From `LocaleContext`, which is the app's own answer and the only one that is
 * right at this moment. Two nearer-looking sources are both wrong by one
 * render: `<html lang>` is set by an effect in `LocaleProvider`, and effects run
 * after children render, so it still says whatever `index.html` was authored
 * with — `en`. And `useTranslation()` reads the i18next instance, which
 * `LocaleProvider` seeds from the same resolution but only after its own first
 * render completes. The context value carries the resolved locale into the
 * first render of every child, which is what this needs.
 *
 * Read once rather than followed. A learner changing language mid-launch is not
 * a case worth a re-render, and swapping the picture out from under them while
 * they are looking at it would be more noticeable than anything it could fix.
 */
function useKoreanInterface(): boolean {
  const { locale } = useLocale();
  const [korean] = useState(() => locale.toLowerCase().startsWith('ko'));
  return korean;
}
