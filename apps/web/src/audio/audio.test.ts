/**
 * The pronunciation player.
 *
 * The behaviours worth defending are all failure behaviours. Audio is the one
 * part of this product that depends on 6,700 files being where the manifest
 * says they are, and the customer has already paid — so a missing clip, a
 * missing manifest or a browser that blocks playback must all degrade to
 * "this one button does nothing" and never to "the lesson is broken".
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { PronunciationManifest } from '@hangyul-ganada/shared-types';

import { PronunciationPlayer, type PronunciationSource } from './PronunciationPlayer';

const MANIFEST: PronunciationManifest = {
  version: '20260410',
  generated_at: '2026-04-10T00:00:00Z',
  provider: {
    id: 'test',
    female_voice: 'ko-KR-Female',
    male_voice: 'ko-KR-Male',
    format: 'audio/mpeg',
    notes: '',
  },
  entries: [
    {
      id: 'word_sagwa',
      text: '사과',
      kind: 'word',
      female: { src: 'audio/vocabulary/female/word_sagwa.mp3', duration_ms: 700, bytes: 3000 },
      male: { src: 'audio/vocabulary/male/word_sagwa.mp3', duration_ms: 680, bytes: 2900 },
    },
    {
      id: 'word_mul',
      text: '물',
      kind: 'word',
      // Only one voice was generated. The app must still speak.
      female: { src: 'audio/vocabulary/female/word_mul.mp3', duration_ms: 400, bytes: 1800 },
      male: null,
    },
  ],
};

function source(manifest: PronunciationManifest | Error): PronunciationSource {
  return {
    load: async () => {
      if (manifest instanceof Error) throw manifest;
      return manifest;
    },
  };
}

/** A stand-in for `HTMLAudioElement`, recording what was asked of it. */
class FakeAudio {
  static created: FakeAudio[] = [];
  static failNextPlay = false;
  currentTime = 0;
  preload = '';
  paused = true;
  loaded = false;

  constructor(public src: string) {
    FakeAudio.created.push(this);
  }

  load() {
    this.loaded = true;
  }

  async play() {
    if (FakeAudio.failNextPlay) {
      FakeAudio.failNextPlay = false;
      throw new DOMException('blocked', 'NotAllowedError');
    }
    this.paused = false;
  }

  pause() {
    this.paused = true;
  }
}

beforeEach(() => {
  FakeAudio.created = [];
  FakeAudio.failNextPlay = false;
  vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PronunciationPlayer', () => {
  it('plays the clip for the selected voice', async () => {
    const player = new PronunciationPlayer(source(MANIFEST));
    const outcome = await player.play('word_sagwa', 'male');
    expect(outcome).toEqual({ status: 'played', voice: 'male', substituted: false });
    expect(FakeAudio.created.at(-1)!.src).toContain('male/word_sagwa.mp3');
  });

  it('falls back to the other voice rather than staying silent', async () => {
    const player = new PronunciationPlayer(source(MANIFEST));
    const outcome = await player.play('word_mul', 'male');
    expect(outcome).toEqual({ status: 'played', voice: 'male', substituted: true });
    expect(FakeAudio.created.at(-1)!.src).toContain('female/word_mul.mp3');
  });

  it('reports a missing clip instead of throwing', async () => {
    const player = new PronunciationPlayer(source(MANIFEST));
    expect(await player.play('word_nothing', 'female')).toEqual({ status: 'missing' });
    expect(await player.play(undefined, 'female')).toEqual({ status: 'missing' });
  });

  it('survives a manifest that will not load, and disables audio quietly', async () => {
    const player = new PronunciationPlayer(source(new Error('offline')));
    await player.ready();
    expect(player.size).toBe(0);
    expect(player.provider).toBeNull();
    expect(await player.play('word_sagwa', 'female')).toEqual({ status: 'missing' });
  });

  it('treats a blocked autoplay as a failure, not an error', async () => {
    const player = new PronunciationPlayer(source(MANIFEST));
    await player.ready();
    FakeAudio.failNextPlay = true;
    const outcome = await player.play('word_sagwa', 'female');
    expect(outcome).toEqual({ status: 'failed', error: 'NotAllowedError' });
  });

  it('stops what is already playing before starting the next clip', async () => {
    const player = new PronunciationPlayer(source(MANIFEST));
    await player.play('word_sagwa', 'female');
    const first = FakeAudio.created.at(-1)!;
    expect(first.paused).toBe(false);
    await player.play('word_mul', 'female');
    expect(first.paused).toBe(true);
  });

  it('reuses a warmed clip rather than constructing a second one', async () => {
    const player = new PronunciationPlayer(source(MANIFEST));
    await player.preload(['word_sagwa'], 'female');
    const created = FakeAudio.created.length;
    expect(FakeAudio.created.at(-1)!.loaded).toBe(true);
    await player.play('word_sagwa', 'female');
    expect(FakeAudio.created.length).toBe(created);
  });

  it('loads the manifest once however many callers ask for it', async () => {
    const load = vi.fn(async () => MANIFEST);
    const player = new PronunciationPlayer({ load });
    await Promise.all([player.ready(), player.ready(), player.play('word_sagwa', 'female')]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not let a clip start after the learner has moved on', async () => {
    // Tapping Next while a clip is still opening its decoder. The first
    // request's `play()` resolves *after* the second has taken the speakers,
    // and the wrong outcome is the one where the learner is now looking at
    // question B and listening to question A.
    const player = new PronunciationPlayer(source(MANIFEST));
    await player.ready();
    const first = player.play('word_sagwa', 'female');
    const second = player.play('word_mul', 'female');
    expect(await second).toEqual({ status: 'played', voice: 'female', substituted: false });
    expect(await first).toEqual({ status: 'cancelled' });
    // The superseded request never even reached the decoder, which is the
    // strongest form of "did not play": nothing to hear and nothing to stop.
    expect(FakeAudio.created.some((audio) => audio.src.includes('word_sagwa'))).toBe(false);
    expect(FakeAudio.created.find((audio) => audio.src.includes('word_mul'))!.paused).toBe(false);
  });

  it('cancels a clip whose screen was left before the manifest arrived', async () => {
    let release: (manifest: PronunciationManifest) => void = () => {};
    const player = new PronunciationPlayer({
      load: () => new Promise((resolve) => (release = resolve)),
    });
    const pending = player.play('word_sagwa', 'female');
    player.stop();
    release(MANIFEST);
    expect(await pending).toEqual({ status: 'cancelled' });
    expect(FakeAudio.created).toHaveLength(0);
  });

  it('knows which items it can pronounce', async () => {
    const player = new PronunciationPlayer(source(MANIFEST));
    await player.ready();
    expect(player.has('word_sagwa')).toBe(true);
    expect(player.has('word_missing')).toBe(false);
    expect(player.has(undefined)).toBe(false);
    expect(player.provider?.female_voice).toBe('ko-KR-Female');
  });
});
