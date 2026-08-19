import type {
  PronunciationEntry,
  PronunciationManifest,
  VoiceGender,
} from '@hangyul-ganada/shared-types';

/**
 * The one way Hangyul ganada makes a sound.
 *
 * Every speaker button in the app goes through this object. Not because a
 * singleton is elegant, but because the alternative — each screen creating its
 * own `Audio` — produces the three bugs that make an audio feature feel cheap:
 * two clips playing over each other, a clip that keeps playing after the
 * learner has navigated away, and a first tap that does nothing while the
 * browser opens a decoder.
 *
 * ## Offline by construction
 *
 * Clips are files under `public/audio`, generated at build time and served from
 * the app's own origin. There is no speech API call at runtime, so a learner on
 * a plane hears exactly what a learner on wifi hears.
 *
 * ## When a clip is missing
 *
 * The customer has already paid; a gap in the asset set must not remove a
 * feature. If the selected voice has no file for an item, the other voice is
 * played and the substitution is reported — audible Korean in the wrong voice
 * beats silence, and QA gets told about the hole either way.
 */

export type PlaybackOutcome =
  | { status: 'played'; voice: VoiceGender; substituted: boolean }
  | { status: 'missing' }
  /**
   * Something else asked to be heard while this clip was still being started.
   *
   * Not an error. Tapping Next twice quickly, or leaving a screen before its
   * clip has begun, is ordinary use — and the only wrong outcome is the one
   * where the clip the learner has navigated away from starts playing over the
   * screen they are now looking at.
   */
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

export interface PronunciationSource {
  load(): Promise<PronunciationManifest>;
}

/** Fetches the manifest the audio build wrote. */
export class HttpManifestSource implements PronunciationSource {
  constructor(private readonly url = `${import.meta.env.BASE_URL}audio/manifest.json`) {}

  async load(): Promise<PronunciationManifest> {
    const response = await fetch(this.url);
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    return (await response.json()) as PronunciationManifest;
  }
}

export class PronunciationPlayer {
  private manifest: PronunciationManifest | null = null;
  private entries = new Map<string, PronunciationEntry>();
  private loading: Promise<void> | null = null;
  private current: HTMLAudioElement | null = null;
  /**
   * Which request owns the speakers.
   *
   * `play` is asynchronous twice over — the manifest may still be loading, and
   * `HTMLAudioElement.play()` returns a promise that resolves once the decoder
   * has actually started. Between those two points the learner can have moved
   * to the next question, and without a token the *previous* question's clip
   * wins the race and plays over the new screen. Every `play` takes a number;
   * every `stop` invalidates it; a request that finds itself outdated pauses
   * whatever it just started and reports `cancelled`.
   */
  private token = 0;
  /** Decoded clips, keyed by src. Bounded: this is a cache, not a leak. */
  private readonly warm = new Map<string, HTMLAudioElement>();
  private static readonly MAX_WARM = 60;

  constructor(private readonly source: PronunciationSource = new HttpManifestSource()) {}

  /**
   * Loads the manifest. Safe to call from anywhere, any number of times: the
   * first call does the work and the rest await it.
   */
  ready(): Promise<void> {
    this.loading ??= this.source
      .load()
      .then((manifest) => {
        this.manifest = manifest;
        this.entries = new Map(manifest.entries.map((entry) => [entry.id, entry]));
      })
      .catch(() => {
        // A missing manifest disables audio and nothing else. Every caller
        // already handles `missing`, so the lesson still runs.
        this.manifest = null;
      });
    return this.loading;
  }

  get provider(): PronunciationManifest['provider'] | null {
    return this.manifest?.provider ?? null;
  }

  get size(): number {
    return this.entries.size;
  }

  has(id: string | undefined): boolean {
    return Boolean(id && this.entries.has(id));
  }

  /** Resolves an id to a URL, falling back to the other voice. */
  resolve(id: string, voice: VoiceGender): { src: string; substituted: boolean } | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    const preferred = entry[voice];
    if (preferred) return { src: this.url(preferred.src), substituted: false };
    const other = voice === 'female' ? entry.male : entry.female;
    return other ? { src: this.url(other.src), substituted: true } : null;
  }

  /**
   * Warms clips so the next tap starts instantly.
   *
   * Called with the handful of items a screen is about to show, never with the
   * whole curriculum: prefetching two thousand files to save a hundred
   * milliseconds is how an app earns a reputation for eating data.
   */
  async preload(ids: Array<string | undefined>, voice: VoiceGender): Promise<void> {
    await this.ready();
    for (const id of ids) {
      if (!id) continue;
      const resolved = this.resolve(id, voice);
      if (!resolved || this.warm.has(resolved.src)) continue;
      const audio = new Audio(resolved.src);
      audio.preload = 'auto';
      // `load()` rather than playing muted: this only needs the bytes and the
      // decoder, and a muted play would count against autoplay policy.
      audio.load();
      this.remember(resolved.src, audio);
    }
  }

  async play(id: string | undefined, voice: VoiceGender): Promise<PlaybackOutcome> {
    if (!id) return { status: 'missing' };
    const mine = ++this.token;
    this.silence();
    await this.ready();
    if (this.token !== mine) return { status: 'cancelled' };
    const resolved = this.resolve(id, voice);
    if (!resolved) return { status: 'missing' };

    const audio = this.warm.get(resolved.src) ?? new Audio(resolved.src);
    this.remember(resolved.src, audio);
    audio.currentTime = 0;
    this.current = audio;

    try {
      await audio.play();
      // The screen changed while the decoder was opening. Stop before the first
      // sample reaches the learner rather than letting a stale clip finish.
      if (this.token !== mine) {
        audio.pause();
        audio.currentTime = 0;
        if (this.current === audio) this.current = null;
        return { status: 'cancelled' };
      }
      return { status: 'played', voice, substituted: resolved.substituted };
    } catch (error) {
      // Nearly always the browser's autoplay policy on a call the learner did
      // not initiate. Not a defect, and not worth an error dialog.
      //
      // Read `name` off the thrown value rather than testing `instanceof
      // Error`: what browsers actually throw here is a `DOMException`, which
      // does not extend `Error` in every runtime, and losing `NotAllowedError`
      // to a generic label is losing the one detail worth having.
      this.current = null;
      return { status: 'failed', error: errorName(error) };
    }
  }

  /** Stops whatever is sounding, and cancels whatever is about to. */
  stop(): void {
    this.token += 1;
    this.silence();
  }

  private silence(): void {
    if (!this.current) return;
    this.current.pause();
    this.current.currentTime = 0;
    this.current = null;
  }

  private url(src: string): string {
    return `${import.meta.env.BASE_URL}${src}`;
  }

  private remember(src: string, audio: HTMLAudioElement): void {
    if (this.warm.has(src)) return;
    if (this.warm.size >= PronunciationPlayer.MAX_WARM) {
      const oldest = this.warm.keys().next().value;
      if (oldest) this.warm.delete(oldest);
    }
    this.warm.set(src, audio);
  }
}

/** The thrown value's `name`, whatever kind of object it happens to be. */
function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name: unknown }).name;
    if (typeof name === 'string' && name.length > 0) return name;
  }
  return 'PlaybackFailed';
}
