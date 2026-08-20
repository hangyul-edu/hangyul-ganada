/*
 * The flag shown beside a language in the picker.
 *
 * ## A flag is not a language, and this is the compromise
 *
 * Languages do not have flags. Arabic is spoken across two dozen states, Tamil
 * and Telugu are both Indian and neither is *the* Indian language, and a
 * Brazilian reader would not recognise the flag of Portugal as theirs. So the
 * flag here is never the label — the **native name is the label**, in its own
 * script, and the flag is a small mark beside it that makes a list of thirty-two
 * rows scannable at a glance instead of read line by line.
 *
 * Where a flag would say something wrong, it is left out rather than guessed
 * at, and the row simply has no mark. The name still identifies it.
 *
 * ## Files, not emoji
 *
 * These are the SVGs in `apps/common_assets/flags`, imported so the bundler
 * fingerprints and serves them. Emoji flags were the obvious alternative and
 * are not usable: Windows has never shipped the glyphs, so on the desktop
 * platform with the largest share the whole column renders as pairs of letters
 * in boxes. An asset renders identically everywhere, which is the entire
 * argument.
 *
 * Vite inlines files under its asset limit as data URIs; these are 1–4 kB of
 * flat shapes, so most of them become part of the chunk and cost no request.
 *
 * ## The two filenames that do not say what they are
 *
 * The asset pack ships the French tricolour as `GP.svg` and the Polish flag as
 * `ID2.svg`. Both are correct images under surprising names, and they are used
 * as they are rather than renamed, so that a refresh of the pack drops in
 * without a rename step that somebody has to remember. The imports below are
 * named for the language, so nothing downstream has to know.
 */
import ArabicFlag from '../../../common_assets/flags/SA.svg';
import BengaliFlag from '../../../common_assets/flags/BD.svg';
import ChineseFlag from '../../../common_assets/flags/CN.svg';
import CzechFlag from '../../../common_assets/flags/CZ.svg';
import DutchFlag from '../../../common_assets/flags/NL.svg';
import EnglishFlag from '../../../common_assets/flags/US.svg';
import FilipinoFlag from '../../../common_assets/flags/PH.svg';
import FrenchFlag from '../../../common_assets/flags/GP.svg';
import GermanFlag from '../../../common_assets/flags/DE.svg';
import GreekFlag from '../../../common_assets/flags/GR.svg';
import HungarianFlag from '../../../common_assets/flags/HU.svg';
import IndiaFlag from '../../../common_assets/flags/IN.svg';
import IndonesianFlag from '../../../common_assets/flags/ID.svg';
import ItalianFlag from '../../../common_assets/flags/IT.svg';
import JapaneseFlag from '../../../common_assets/flags/JP.svg';
import KazakhFlag from '../../../common_assets/flags/KZ.svg';
import KoreanFlag from '../../../common_assets/flags/KO.svg';
import KyrgyzFlag from '../../../common_assets/flags/KG.svg';
import MongolianFlag from '../../../common_assets/flags/MN.svg';
import PolishFlag from '../../../common_assets/flags/ID2.svg';
import PortugueseFlag from '../../../common_assets/flags/PT.svg';
import RomanianFlag from '../../../common_assets/flags/RO.svg';
import RussianFlag from '../../../common_assets/flags/RU.svg';
import SpanishFlag from '../../../common_assets/flags/ES.svg';
import SwedishFlag from '../../../common_assets/flags/SE.svg';
import ThaiFlag from '../../../common_assets/flags/TH.svg';
import TurkishFlag from '../../../common_assets/flags/TR.svg';
import UkrainianFlag from '../../../common_assets/flags/UA.svg';
import UzbekFlag from '../../../common_assets/flags/UZ.svg';
import VietnameseFlag from '../../../common_assets/flags/VN.svg';

import { baseLanguage, canonicalizeLocale } from './locales';

/**
 * Locale tag → flag, most specific first.
 *
 * Keyed by the full tag where the region decides the image — `pt-BR` is the
 * Brazilian flag and would be wrong as the Portuguese one — and by the base
 * language everywhere else. `flagFor` tries the tag, then the base.
 *
 * Tamil and Telugu share the Indian flag, which is the least wrong option
 * available and still not a good one: it says where the language is official,
 * not what the language is. The native names तमिळ் and తెలుగు are what
 * distinguishes those two rows, and they are set in their own scripts at the
 * size that matters.
 */
const FLAGS: Readonly<Record<string, string>> = {
  ar: ArabicFlag,
  bn: BengaliFlag,
  cs: CzechFlag,
  de: GermanFlag,
  el: GreekFlag,
  en: EnglishFlag,
  es: SpanishFlag,
  fil: FilipinoFlag,
  fr: FrenchFlag,
  hi: IndiaFlag,
  hu: HungarianFlag,
  id: IndonesianFlag,
  it: ItalianFlag,
  ja: JapaneseFlag,
  kk: KazakhFlag,
  ko: KoreanFlag,
  ky: KyrgyzFlag,
  mn: MongolianFlag,
  nl: DutchFlag,
  pl: PolishFlag,
  pt: PortugueseFlag,
  'pt-br': PortugueseFlag,
  ro: RomanianFlag,
  ru: RussianFlag,
  sv: SwedishFlag,
  ta: IndiaFlag,
  te: IndiaFlag,
  th: ThaiFlag,
  tl: FilipinoFlag,
  tr: TurkishFlag,
  uk: UkrainianFlag,
  uz: UzbekFlag,
  vi: VietnameseFlag,
  zh: ChineseFlag,
  'zh-cn': ChineseFlag,
};

/**
 * The flag for a locale, or `undefined` when there is nothing honest to show.
 *
 * `undefined` is a normal answer, not a failure: any valid BCP-47 tag can reach
 * the picker, and a language with no image gets a row with a name and no mark.
 * The caller must render that case rather than substituting a placeholder — a
 * grey square where a flag goes reads as a broken image, which is worse than a
 * tidy blank.
 */
export function flagFor(code: string): string | undefined {
  const canonical = canonicalizeLocale(code).toLowerCase();
  return FLAGS[canonical] ?? FLAGS[baseLanguage(code)];
}
