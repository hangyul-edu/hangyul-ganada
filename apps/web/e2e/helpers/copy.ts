import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A string from the shipped English bundle, by key path.
 *
 * ## Why a helper rather than the literal
 *
 * A spec that writes `'Six vowels to start'` is asserting the copy *and*
 * pinning it, and only the first of those is what the test is for. Twelve unit
 * titles were rewritten in one commit and three end-to-end cases failed on the
 * old wording — none of them a case about wording. The failures were correct in
 * the sense that the string had changed and wrong in the sense that nothing was
 * broken, and three specs then had to be edited to say the same thing again.
 *
 * Where the spec's subject *is* a particular sentence — the privacy screen
 * saying what it collects, a verdict, a button's label — the literal is right
 * and belongs in the spec. This is for the other case: "the unit's name appears
 * here, once", where the identity of the name is not the point.
 */
const BUNDLES = new Map<string, unknown>();

function bundle(namespace: string): unknown {
  const cached = BUNDLES.get(namespace);
  if (cached) return cached;
  const path = join(process.cwd(), 'src/locales/en', `${namespace}.json`);
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  BUNDLES.set(namespace, parsed);
  return parsed;
}

/** `copy('learning', 'units.unit-1.title')` — the same key the app renders. */
export function copy(namespace: string, path: string): string {
  let node: unknown = bundle(namespace);
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) break;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== 'string') {
    throw new Error(`en/${namespace}.json has no string at ${path}`);
  }
  return node;
}

/**
 * The label on whatever moves a session forward.
 *
 * Four labels, because the product is right to use four: *Got it* ends an
 * introduction, *Next* follows a multiple-choice answer, *Next word* follows a
 * build question — where the next thing genuinely is a word and naming it is
 * better than not — and *Finish* ends the sitting. A walk that matches three of
 * them stands in front of the fourth until it times out, and that has now
 * happened twice in one afternoon in two different specs, both times because a
 * build question started appearing where it had not before.
 *
 * Anchored on purpose. An unanchored /Next/ matches an answer option glossed
 * *next* — 다음 — which is a real word in this corpus and was clicked for sixty
 * seconds by an earlier version of the accessibility walk.
 */
export const CONTINUE = /^\s*(Got it|Next|Next word|Continue|Finish)\s*$/i;
