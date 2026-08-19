import { describe, expect, it } from 'vitest';

import enHandwriting from '../locales/en/handwriting.json';
import deHandwriting from '../locales/de/handwriting.json';
import esHandwriting from '../locales/es/handwriting.json';
import frHandwriting from '../locales/fr/handwriting.json';
import jaHandwriting from '../locales/ja/handwriting.json';
import koHandwriting from '../locales/ko/handwriting.json';
import ptHandwriting from '../locales/pt-BR/handwriting.json';
import zhHandwriting from '../locales/zh-CN/handwriting.json';
import { ALL_CHARACTERS, getCharacterByGlyph } from './characters';
import { strokeGuideFor, strokeGuideText } from './strokeGuide';

/**
 * The writing instruction under every demonstration.
 *
 * What is actually being defended here is a promise to a beginner: whatever
 * character the curriculum puts on screen, the line under the animation tells
 * them what to do with *that* character, in their language, and it is not a
 * blank, a key name or a `{{a}}` that never got filled in.
 */

const BUNDLES: Array<[string, Record<string, unknown>]> = [
  ['en', enHandwriting],
  ['ko', koHandwriting],
  ['ja', jaHandwriting],
  ['zh-CN', zhHandwriting],
  ['es', esHandwriting],
  ['fr', frHandwriting],
  ['de', deHandwriting],
  ['pt-BR', ptHandwriting],
];

/** A `t` that reads the shipped bundle and fails loudly on a missing key. */
function translator(bundle: Record<string, unknown>) {
  return (key: string, params: Record<string, string> = {}) => {
    const value = key.split('.').reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      bundle,
    );
    if (typeof value !== 'string') throw new Error(`missing key ${key}`);
    // `{{a, eulreul}}` — the Korean bundle picks its particle with a formatter,
    // so the placeholder carries one. What is being checked here is that the
    // slot gets filled, not how i18next spells 을 versus 를.
    return value.replace(/\{\{(\w+)(?:,[^}]*)?\}\}/g, (_, name: string) => {
      const filled = params[name];
      if (filled === undefined) throw new Error(`${key} has no ${name}`);
      return filled;
    });
  };
}

describe('stroke guides', () => {
  it('describes ㄱ as the single turning stroke it is', () => {
    const guide = strokeGuideFor(getCharacterByGlyph('ㄱ')!);
    expect(guide).toEqual({ kind: 'strokes', shapes: ['cornerAcrossDown'] });
    expect(strokeGuideText(guide, translator(enHandwriting), 1)).toBe(
      'Just one stroke: across the top and down the right side.',
    );
  });

  it('puts ㅏ’s long line before its branch, and ㅗ’s short line before its base', () => {
    const en = translator(enHandwriting);
    const a = getCharacterByGlyph('ㅏ')!;
    const o = getCharacterByGlyph('ㅗ')!;
    expect(strokeGuideText(strokeGuideFor(a), en, a.stroke_count)).toBe(
      'First the long line down. Then the short line across.',
    );
    expect(strokeGuideText(strokeGuideFor(o), en, o.stroke_count)).toBe(
      'First the short line down. Then the long line across.',
    );
  });

  it('collapses ㅑ’s two identical branches into one clause', () => {
    expect(strokeGuideFor(getCharacterByGlyph('ㅑ')!)).toEqual({
      kind: 'strokes',
      shapes: ['downLong', 'acrossShortTwice'],
    });
  });

  it('says where the next letter goes, and only when the block puts it somewhere', () => {
    const en = translator(enHandwriting);
    // The vowel of 가 is drawn on the right and the sentence says so; the vowel
    // of 고 is drawn underneath and the same sentence says that instead. Both
    // come from the layout in `compose.ts`, so the words cannot drift from the
    // picture.
    expect(strokeGuideText(strokeGuideFor(getCharacterByGlyph('가')!), en, 3)).toBe(
      'Write ㄱ first, then ㅏ to its right.',
    );
    expect(strokeGuideText(strokeGuideFor(getCharacterByGlyph('고')!), en, 3)).toBe(
      'Write ㄱ first, then ㅗ underneath.',
    );
    // ㅘ is a letter made of parts, not a block, so it names them and stops.
    expect(strokeGuideFor(getCharacterByGlyph('ㅘ')!)).toMatchObject({ placement: 'plain' });
  });

  it('describes a character with parts by its parts', () => {
    expect(strokeGuideFor(getCharacterByGlyph('가')!)).toEqual({
      kind: 'parts',
      parts: ['ㄱ', 'ㅏ'],
      doubled: false,
      placement: 'right',
    });
    expect(strokeGuideFor(getCharacterByGlyph('ㅃ')!)).toEqual({
      kind: 'parts',
      parts: ['ㅂ', 'ㅂ'],
      doubled: true,
      placement: 'plain',
    });
    // A 받침 block: the third part is the one that goes underneath, and the
    // sentence for three parts is the one that says so.
    expect(strokeGuideText(strokeGuideFor(getCharacterByGlyph('강')!), translator(enHandwriting), 4)).toBe(
      'Write ㄱ, then ㅏ to its right, then ㅇ along the bottom.',
    );
  });

  it.each(BUNDLES)(
    'produces a real sentence for every taught character in %s',
    (_locale, bundle) => {
      const t = translator(bundle);
      for (const character of ALL_CHARACTERS) {
        const text = strokeGuideText(strokeGuideFor(character), t, character.stroke_count);
        expect(text.length, character.character).toBeGreaterThan(4);
        // No key names, no unfilled placeholders, no empty clauses.
        expect(text, character.character).not.toMatch(/\{\{|strokeGuide\./);
      }
    },
  );

  it('never falls back to the generic sentence for anything in the curriculum', () => {
    // The fallback exists so a letter added later degrades to something true
    // rather than to a blank line. Nothing today should reach it — if this
    // fails, a new character needs either `components` or a clause count the
    // templates cover.
    const generic = enHandwriting.strokeGuide.fallback.replace('{{strokes}}', '');
    for (const character of ALL_CHARACTERS) {
      const text = strokeGuideText(
        strokeGuideFor(character),
        translator(enHandwriting),
        character.stroke_count,
      );
      expect(text.includes(generic.trim().slice(0, 12)), character.character).toBe(false);
    }
  });

  it('no longer ships the one-size-fits-all stroke-order sentence', () => {
    for (const [locale, bundle] of BUNDLES) {
      const strokeOrder = bundle.strokeOrder as Record<string, unknown>;
      expect(strokeOrder.intro, locale).toBeUndefined();
    }
  });
});
