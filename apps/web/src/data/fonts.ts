import type { PracticeFont } from '@hangyul-ganada/shared-types';

/**
 * The practice typefaces.
 *
 * ## What this list is for
 *
 * A learner picks a face to *practise in*, so the set is built out of the
 * writing styles a Korean reader would name — 기본체, 고딕체, 명조체, 궁서·바탕체,
 * 손글씨체, 둥근체 — and each slot is filled by the face most people would
 * actually recognise as that style. Six of them, not twenty: an obscure
 * decorative face is not a learning tool, and a picker nobody can choose from
 * is worse than a short one.
 *
 * ## Licensing
 *
 * This app is sold on the App Store and Google Play, so every file here has to
 * be legal to *redistribute inside a binary*, which is a stricter test than
 * "free to use". Every face below is SIL Open Font License 1.1, which permits
 * bundling and commercial distribution provided the font is not sold on its
 * own and the licence travels with it. Licence, source and package are carried
 * as data rather than in a comment, because the picker shows them and the
 * audit reads them.
 *
 * Nothing is fetched at runtime: all files are self-hosted through an npm
 * package and served from the app's own origin, so the practice screen works
 * on a plane and no third party learns which characters a learner is studying.
 *
 * ### 궁서체, and why this is Gowun Batang
 *
 * Genuine 궁서체 — the palace script that ships as Gungsuh/Gungsuhche on
 * Windows and in Hancom Office — is proprietary. It may not be extracted from
 * an operating system and packaged into a product, whatever a search result
 * says, so it is not here.
 *
 * Gowun Batang is in its place, and is not a serif renamed to look the part:
 * it is a Korean 바탕 face drawn in the brush-written tradition 궁서체 belongs
 * to, with the tapered entries, thin horizontals and vertical stress that make
 * that lineage recognisable. It is labelled for what it is — 바탕체 /
 * "Traditional" — rather than as 궁서체, because claiming otherwise would be a
 * small lie told to a learner who came here to learn what Korean looks like.
 *
 * ## The selected face really is the lesson
 *
 * `font_family` drives the reference glyph on screen *and* the mask the
 * evaluator grades against, through one shared code path. Changing the face
 * changes what "correct" means, which is the whole point of practising in more
 * than one — and it is why every face here had to be measured against the
 * evaluator before it could be offered.
 *
 * ### Two faces were rejected on those measurements
 *
 * **Jua** (배달의민족 주아체) is the rounded face most Koreans would name, and it
 * is not here. Its strokes are about twice the width of the learner's pen, so
 * an honest attempt cannot cover the reference ink: at every tolerance setting
 * tried, a correctly written character scored *worse* than a wrong one. No pass
 * mark separates those two, and a picker option that fails people for writing
 * correctly is not an option.
 *
 * **Nanum Pen Script** is the better-known handwriting face and is not here for
 * a related reason: its fast, loose forms leave 사 and 가 barely a percentage
 * point apart, so the margin between "honest attempt" and "wrong character" was
 * about 0.014 — inside the noise of real handwriting. Gaegu is a slightly less
 * famous hand that measures at 0.10, and correct grading is the point of the
 * feature.
 *
 * Both measurements live in `packages/handwriting-core/src/__tests__/
 * font-tolerance.test.ts`, which runs on every build against the same faces.
 *
 * ### And no face needs its own grading
 *
 * `evaluation` exists for a face that does — the mechanism is real and
 * `gradingFor()` in `features/writing/useEvaluator.ts` applies it — but none of
 * the six sets it. What the measurements actually showed was that the *default*
 * tolerance was slightly too tight once the difference between a font's stroke
 * weight and a pen's is accounted for; that was fixed once, globally, in
 * `handwriting-core/src/config.ts`, which is the better place for a finding
 * that applies to every face.
 */
export const PRACTICE_FONTS: PracticeFont[] = [
  {
    id: 'pretendard',
    name: '기본체',
    name_en: 'Standard',
    family_name: 'Pretendard',
    // The app's own interface face. Practising in it means the character in
    // the writing box and the character in the sentence above it are the same
    // shape, which is the least confusing place for a beginner to start.
    font_family: "'Pretendard Variable', Pretendard, sans-serif",
    category: 'sans',
    weight: 500,
    license: 'SIL Open Font License 1.1',
    license_short: 'OFL 1.1',
    license_url: 'https://openfontlicense.org',
    source: 'Kil Hyung-jin (pretendard on npm)',
    source_url: 'https://github.com/orioncactus/pretendard',
    bundled: true,
    translations: {
      en: {
        description: 'Clean, even letterforms, used across modern Korean apps. Start here.',
      },
      ko: { description: '요즘 앱과 웹에서 가장 많이 보는 반듯한 글자. 처음에는 이걸로 시작하세요.' },
    },
  },
  {
    id: 'nanum-gothic',
    name: '고딕체',
    name_en: 'Sans Serif',
    family_name: 'Nanum Gothic',
    font_family: "'Nanum Gothic', sans-serif",
    category: 'sans',
    weight: 400,
    license: 'SIL Open Font License 1.1',
    license_short: 'OFL 1.1',
    license_url: 'https://openfontlicense.org',
    source: 'Naver (@fontsource/nanum-gothic)',
    source_url: 'https://hangeul.naver.com/font',
    bundled: true,
    translations: {
      en: {
        description: 'The gothic on most Korean websites. Wider and softer, with no stroke decoration.',
      },
      ko: { description: '한국 웹사이트에서 가장 흔한 고딕체. 획 장식이 전혀 없어 구조가 잘 보여요.' },
    },
  },
  {
    id: 'nanum-myeongjo',
    name: '명조체',
    name_en: 'Myeongjo',
    family_name: 'Nanum Myeongjo',
    font_family: "'Nanum Myeongjo', serif",
    category: 'serif',
    weight: 400,
    license: 'SIL Open Font License 1.1',
    license_short: 'OFL 1.1',
    license_url: 'https://openfontlicense.org',
    source: 'Naver (@fontsource/nanum-myeongjo)',
    source_url: 'https://hangeul.naver.com/font',
    bundled: true,
    translations: {
      en: {
        description: 'Korean serif — the shapes in books and newspapers. Strokes start thick, finish thin.',
      },
      ko: { description: '책과 신문에서 보는 명조체. 획의 시작은 굵고 끝은 가늘어요.' },
    },
  },
  {
    id: 'gowun-batang',
    name: '바탕체',
    name_en: 'Traditional',
    family_name: 'Gowun Batang',
    font_family: "'Gowun Batang', serif",
    category: 'traditional',
    weight: 400,
    license: 'SIL Open Font License 1.1',
    license_short: 'OFL 1.1',
    license_url: 'https://openfontlicense.org',
    source: 'Yanghee Ryu (@fontsource/gowun-batang)',
    source_url: 'https://github.com/yangheeryu/Gowun-Batang',
    bundled: true,
    translations: {
      en: {
        description:
          'The brush-written tradition 궁서체 belongs to. Elegant, and the hardest to trace.',
      },
      ko: { description: '붓으로 쓰던 전통 서체 계열(궁서체 계통). 우아하지만 따라 쓰기는 가장 어려워요.' },
    },
  },
  {
    id: 'gaegu',
    name: '손글씨체',
    name_en: 'Handwriting',
    family_name: 'Gaegu',
    font_family: "'Gaegu', cursive",
    category: 'handwriting',
    weight: 400,
    license: 'SIL Open Font License 1.1',
    license_short: 'OFL 1.1',
    license_url: 'https://openfontlicense.org',
    source: 'Yoon Design (@fontsource/gaegu)',
    source_url: 'https://fonts.google.com/specimen/Gaegu',
    bundled: true,
    /**
     * The one face that needs its own tolerance, and it was measured rather
     * than guessed.
     *
     * Gaegu's strokes are the thinnest of the six — about 300 ink pixels where
     * Pretendard has 900 — and the default tolerance band is a fraction of the
     * *box*, not of the stroke. On a thin face the band therefore swallows the
     * difference between a letter and the same letter with a stroke added: the
     * adversarial corpus caught it accepting ㅋ for ㄱ, ㅂ for ㅁ, ㅌ for ㄷ and
     * ㅎ for ㅇ, at a false-acceptance rate of 4.96% against 0.83% on the
     * baseline face.
     *
     * At 0.036 the same corpus reports 1.65%, with false rejection unchanged at
     * 0.21% — the band is still wider than any honest wobble it measured, and
     * no longer wide enough to hide a stroke. The number sits in the middle of
     * a flat region (0.034 to 0.038 all measure identically), so it is not
     * balanced on the edge of one.
     */
    evaluation: { glyph_tolerance_ratio: 0.036 },
    translations: {
      en: {
        description: 'A pencil hand — upright and unhurried, close to how you will write it yourself.',
      },
      ko: { description: '연필로 또박또박 쓴 손글씨. 실제로 연습할 때 나오는 글씨와 가장 비슷해요.' },
    },
  },
  {
    id: 'gowun-dodum',
    name: '둥근체',
    name_en: 'Rounded',
    family_name: 'Gowun Dodum',
    font_family: "'Gowun Dodum', sans-serif",
    category: 'rounded',
    weight: 400,
    license: 'SIL Open Font License 1.1',
    license_short: 'OFL 1.1',
    license_url: 'https://openfontlicense.org',
    source: 'Yanghee Ryu (@fontsource/gowun-dodum)',
    source_url: 'https://github.com/yangheeryu/Gowun-Dodum',
    bundled: true,
    translations: {
      en: {
        description: 'Soft, rounded strokes with no sharp corners. The gentlest of the six to trace.',
      },
      ko: { description: '모서리가 둥글고 획이 부드러운 글씨. 여섯 가지 중 따라 쓰기가 가장 편해요.' },
    },
  },
];

export const DEFAULT_FONT_ID = 'pretendard';

const BY_ID = new Map(PRACTICE_FONTS.map((f) => [f.id, f]));

/**
 * The face for an id, falling back to the default.
 *
 * The fallback is load-bearing rather than defensive: a learner who chose a
 * face that a later release retired still has its id in local storage, and the
 * right answer is the standard face, not a crash on the settings screen.
 */
export function getFont(id: string): PracticeFont {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_FONT_ID)!;
}

/**
 * Preview strings shown on each option in the picker.
 *
 * Korean, in every UI language: the point of the preview is to show what the
 * learner will be tracing, and that is Hangul whatever language the interface
 * speaks. 가나다 is also the product's own name.
 */
export const FONT_PREVIEW_PRIMARY = '가나다';
export const FONT_PREVIEW_SECONDARY = '한글';
