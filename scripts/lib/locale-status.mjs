/**
 * Which languages have to be complete, and which are still being written.
 *
 * ## Why a list and not a measurement
 *
 * Every content locale used to be all-or-nothing. A language was written in
 * full or it was absent, so *any* hole in a pack meant something had gone
 * wrong in the build and every gate could treat a gap as a failure.
 *
 * §33 changed that. The quiz now resolves a meaning in the learner's own
 * language or not at all — see `strictMeaning` — so twenty-two languages were
 * opened with a real pack and a hundred words in it, and the rest of the rows
 * deliberately empty. An empty row is not a fault there: it removes that word
 * from that language's quiz pool, which is the designed behaviour. Gating on it
 * would fail the build for the content backlog, on every run, until somebody
 * writes 54,582 lines of translation.
 *
 * A measurement can't tell those two states apart — "this pack is 4% written"
 * looks identical whether that is intended or a generator that broke halfway.
 * The intent has to be declared, so it is declared here, once, and imported by
 * the gates rather than copied into them.
 *
 * ## Moving a language
 *
 * Finish its pack, add it here, and from that moment a missing row fails the
 * build again. That is the whole ratchet: coverage can only be locked in.
 */

/** The ten the curriculum shipped with. A gap in one of these is a defect. */
export const COMPLETE_LOCALES = new Set([
  'en',
  'ko',
  'ja',
  'zh-CN',
  'es',
  'fr',
  'de',
  'pt-BR',
  'th',
  'vi',
]);

/** Whether `locale` has promised a full pack. */
export function isComplete(locale) {
  return COMPLETE_LOCALES.has(locale);
}
