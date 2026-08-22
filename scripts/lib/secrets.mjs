/**
 * Credentials, read from somewhere `git add` cannot reach.
 *
 * ## Why the file is outside the repository
 *
 * A `.gitignore` entry is a promise that somebody can break with `git add -f`,
 * with a rebase, or with an editor that writes a backup file beside the
 * original. The audio generation pass needs an ElevenLabs key for a few hours
 * and the application needs it never, so the safest place for it is a path the
 * repository cannot see at all: `~/.hangyul-keys/`, which is also where the
 * Android release signing configuration lives, for the same reason.
 *
 * Nothing in this repository contains the value. `scripts/check-no-secrets.mjs`
 * asserts that, over the tracked source, the built site and the packaged
 * Android artefacts.
 *
 * ## What reads this
 *
 * Only the generation scripts, which run on a maintainer's machine. There is no
 * path from the application to this file: the app plays MP3s that were made
 * earlier and never speaks to ElevenLabs. See `docs/AUDIO.md`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ENV_FILE = join(homedir(), '.hangyul-keys', 'elevenlabs.env');

/** Parses `KEY=value` lines, ignoring comments and blanks. */
function parse(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at < 1) continue;
    out[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim();
  }
  return out;
}

/**
 * The ElevenLabs API key.
 *
 * The process environment wins, so CI can supply it without a file. Falls back
 * to the local file, and fails with an instruction rather than a stack trace —
 * "undefined is not a valid xi-api-key" is a worse message than this one.
 */
export function elevenLabsKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  if (existsSync(ENV_FILE)) {
    const key = parse(readFileSync(ENV_FILE, 'utf8')).ELEVENLABS_API_KEY;
    if (key) return key;
  }
  throw new Error(
    `No ElevenLabs key. Set ELEVENLABS_API_KEY, or put it in ${ENV_FILE} as\n` +
      '  ELEVENLABS_API_KEY=...\n' +
      'The key belongs to the machine that generates audio, never to the repository.',
  );
}
