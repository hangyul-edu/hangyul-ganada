/**
 * Hangyul design tokens.
 *
 * Single source of truth. `tokens.css` is generated from this file by
 * `scripts/build-css.mjs` — edit here, then run `npm run tokens:build`.
 *
 * Provenance for every value is in `docs/DESIGN_AUDIT.md`. Values are either
 * (spec) — printed on the colour page of the design PDF — or (sampled) — read
 * pixel-by-pixel out of a rendered reference screen, noted inline below.
 */

/** Brand primary ramp. `900` is the primary; lower numbers are the tint ramp. (spec) */
export const orange = {
  50: '#FFF7E0',
  100: '#FFEAB1',
  200: '#FFDC7E',
  300: '#FFD04A',
  400: '#FFC41F',
  500: '#FFBA00',
  600: '#FFAC00',
  700: '#FF9900',
  800: '#FF8700',
  900: '#FF6700',
} as const;

/**
 * Neutral ramp. (spec, with one measured correction)
 *
 * `600` is #626B72 rather than the #778088 on the colour page. The spec value
 * measures 4.02:1 against white and 3.82:1 against the warm surface it most
 * often sits on, and it is used for captions and secondary lines at 11–13 px —
 * which is normal-size text, and normal-size text needs 4.5:1 to meet WCAG 2.1
 * AA. The axe audit in `e2e/accessibility.spec.ts` found it on every screen.
 *
 * #626B72 is the same hue and chroma, darker: 5.43:1 on white, 5.16:1 on the
 * warm surface, and 4.85:1 on the warm tint a *selected* card uses — which is
 * the surface that decided the value, because a caption inside a chosen option
 * is exactly where a near-miss would have survived. Nothing else changed.
 */
export const gray = {
  0: '#FFFFFF',
  100: '#F2F4F5',
  200: '#E6E8EB',
  400: '#ADB4BA',
  600: '#626B72',
  700: '#5A636A',
  900: '#262C31',
  1000: '#000000',
} as const;

/**
 * Warm surfaces. Hangyul's warmth comes from surfaces, not from more orange —
 * these carry it. (sampled: p092 home, p119 stats, p229 custom learning, p294)
 */
export const warm = {
  50: '#FFF8F1',
  100: '#FFEFE5',
  200: '#FFDCC2',
} as const;

/** Semantic accents. (spec) */
export const accent = {
  mint: '#66CCCC',
  positive: '#547CF1',
  negative: '#F24147',
} as const;

/**
 * Semantic aliases. Components reference these, never raw ramp entries, so the
 * palette can shift without touching component code.
 *
 * Every key here has a counterpart in `dark` below. That pairing is the whole
 * theme system: a component that reads `--hg-surface` is correct in both
 * appearances without knowing either exists.
 */
export const semantic = {
  primary: orange[900],
  primaryHover: '#F05F00',
  primaryPressed: '#DB5600',
  primarySubtle: warm[100],
  /**
   * `primarySubtle` under the pointer.
   *
   * The subtle-accent surfaces — the streak pill, secondary buttons, a modal's
   * close, the language suggestion — all pair `primarySubtle` with
   * `primaryText`, and all of them used to darken on hover by reaching into the
   * orange ramp for `orange[100]`. In light mode that is the shade it looks
   * like. In dark mode it is a pale yellow under `primaryText`'s light orange:
   * 1.9:1, a label that disappears when the mouse arrives.
   *
   * As a role it moves the right way in each appearance, and it keeps
   * `primaryText` above 4.5:1 in both.
   */
  primarySubtleHover: orange[100],
  primaryDisabled: gray[200],

  /**
   * Brand orange used as *small* text.
   *
   * #FF6700 fills buttons, draws progress and marks selection. As small text it
   * measures 2.92:1 on white — well under the 4.5:1 AA needs — so an orange
   * caption or an orange count in a chip was unreadable for anyone with low
   * vision. This is the brand hue at the brightest value that still clears 4.5:1
   * on white *and* on the warm tint a selected card uses (5.05:1 / 4.50:1).
   * There is nothing brighter at this hue that passes; that is arithmetic, not
   * preference.
   */
  primaryText: '#B84F07',

  /**
   * Brand orange for figures big enough to need only 3:1.
   *
   * Large text (24 px, or 18.66 px bold) and the outline of a control both sit
   * at a 3:1 floor rather than 4.5:1, and at that floor the orange can be much
   * closer to the brand: 3.37:1 on white. This is what the big percentage on the
   * home card and the ring around a chosen option use, so those read as Hangyul
   * orange rather than as a darker cousin of it.
   */
  primaryStrong: '#E6650E',

  secondary: accent.mint,
  positive: accent.positive,
  negative: accent.negative,

  /**
   * The three accent tints, as roles rather than as mixtures with white.
   *
   * A graded answer paints its own background — right is a wash of `positive`,
   * wrong a wash of `negative` — and every one of those washes was written as
   * `color-mix(in srgb, var(--hg-positive) 8%, white)`. `white` is a colour and
   * not a role, so in dark mode the mix lands a shade off #FFFFFF while the
   * label above it stays at `text`: #F6F0EA on #F1F5FE, which is 1.06:1. The
   * learner answers a question and the option they chose goes blank. It was
   * reported on Review and it was every graded option in the product — the
   * daily vocabulary session and the letter recognition step do the same thing.
   *
   * Light keeps the value the mixture produced, so nothing moves in the
   * appearance that was correct. Dark mixes the same accent into `surface`
   * instead of into white, which is the same *idea* — a tint of the accent on
   * the card it sits on — arrived at from the right end. `text` measures
   * 11.1:1 on the positive tint and 11.4:1 on the negative one.
   */
  positiveSubtle: '#F1F5FE',
  negativeSubtle: '#FEF0F0',
  secondarySubtle: '#E4F6F6',
  /** `secondary` as small text, on `secondarySubtle`. */
  secondaryText: '#2F6E6E',

  bg: gray[0],
  bgWarm: warm[50],
  bgMuted: gray[100],
  surface: gray[0],
  surfaceWarm: warm[50],
  /**
   * A card under the pointer, or held down.
   *
   * This exists because the hover states did not have a token and reached
   * straight into the warm ramp for `warm[50]` instead. A ramp value is a
   * *colour*, not a role: it is the same #FFF8F1 in both appearances, correctly,
   * because a palette that flipped with the theme would be unusable. So in dark
   * mode every hover painted the card near-white and left the text at
   * `text` — #F6F0EA on #FFF8F1, which is a card whose entire contents vanish
   * under the mouse. The typeface picker was the report; the language rows, the
   * locale list and every chip did it too.
   *
   * As a role it can be what hover should be in each appearance: a shade *away*
   * from the surface, not a jump to the other end of the scale. It is
   * deliberately quieter than `surfaceSelected` — hover is a pointer resting
   * somewhere, selection is a decision, and the two must not compete.
   */
  surfaceHover: warm[50],
  surfaceSelected: warm[100],
  overlay: 'rgba(38, 44, 49, 0.45)',

  border: gray[200],
  borderStrong: gray[400],
  borderSelected: '#E6650E',

  text: gray[900],
  textSecondary: gray[700],
  textTertiary: gray[600],
  textDisabled: gray[400],
  /**
   * The label on a filled orange control.
   *
   * White, everywhere, on every solid #FF6700 surface — the rule the design
   * system is drawn around, and what every button on the reference artboards
   * does. A dark label on brand orange reads as a disabled control and makes the
   * whole product look muddy, which is the failure this replaced.
   *
   * The honest number: white on #FF6700 is 2.92:1, below the 4.5:1 WCAG 2.1 AA
   * asks of normal text and just below the 3:1 it asks of large text. No colour
   * at the brand hue clears 4.5:1 against white, so a product whose primary
   * really is #FF6700 cannot have an AA-contrasting label on it. The brand wins
   * on the fill and the label is white; every other text/background pair in the
   * product meets AA, and `e2e/accessibility.spec.ts` records this one pair as a
   * named, measured exception rather than switching contrast checking off.
   */
  textOnPrimary: gray[0],
  textOnDark: gray[0],

  /**
   * The writing surface, and it is light in both appearances.
   *
   * Handwriting practice is the one place the product does not follow the
   * theme. A learner is copying a Korean glyph, and a glyph is black ink on
   * paper — inverting it to white-on-black in dark mode would teach the shape
   * against a background it never has in the world, and would put the grading
   * mask, the guide glyph and the learner's own ink all through a second
   * inversion for no gain. So the paper stays warm white, the ink stays black,
   * and dark mode changes what is *around* the box.
   */
  canvasPaper: '#FFFDF8',
  canvasInk: gray[900],
  canvasGuide: gray[200],
  canvasGuideWarm: warm[200],
  canvasTraceGlyph: gray[400],

  /**
   * The ground the launch screen sits on.
   *
   * Sampled from the corner of `splash_ko.png` / `splash_eng.png` in
   * `apps/common_assets/splash` — both artworks share it — and it is the same
   * number in three places that cannot import from each other: here, the
   * `SplashScreen` background in `capacitor.config.ts`, and `splashBackground`
   * in the Android `colors.xml`. The native launch screen paints it, the
   * WebView takes over and paints the same picture on the same ground, and
   * there is no moment where the colour changes.
   *
   * It was #FFF6E9 while the splash was an animation, because that was the
   * ground of *frame zero* rather than of the finished art. There are no frames
   * any more; this is the picture's own ground, which is the only one there is.
   *
   * In this set and *not* in the dark one, for the same reason `canvasPaper` is
   * light in both appearances: the artwork is a light picture, and giving it a
   * dark variant would put a dark border around it.
   */
  splashGround: '#FFF1E1',
} as const;

/**
 * The dark appearance, key for key.
 *
 * Built from warm near-blacks rather than #000000 and neutral greys. Pure black
 * with grey cards is the house style of a developer dashboard; Hangyul is a
 * warm product, and the warmth has to survive the lights going out. Every
 * surface here carries a little of the brand's red, and elevation is expressed
 * by getting *lighter*, the way it does on paper under a lamp.
 *
 * Contrast was measured, not eyeballed: body text is 14.8:1 on the page
 * background, secondary text 8.1:1, and the faintest tertiary 5.4:1 — all above
 * AA, because a dark theme that is merely atmospheric is a dark theme people
 * turn off.
 */
export const dark = {
  primary: orange[900],
  primaryHover: '#FF7A1F',
  primaryPressed: '#E65C00',
  /** A tinted surface, not a tint of white — brand orange at low alpha over the page. */
  primarySubtle: '#3A2415',
  /** A step up from `primarySubtle`; `primaryText` reads 4.9:1 on it. */
  primarySubtleHover: '#4A2E19',
  primaryDisabled: '#3A322C',

  /** On dark ground the brand orange is already legible as text: 6.1:1. */
  primaryText: '#FF8A3D',
  primaryStrong: orange[900],

  secondary: '#7FD6D6',
  positive: '#8AA6F7',
  negative: '#FF7A80',

  /**
   * The accent tints, mixed into `surface` rather than into white.
   *
   * 18% of the appearance's own accent over #1E1815 — a graded option that
   * reads as tinted at a glance and still carries `text` at better than 11:1.
   * See the note beside their light counterparts for why they are tokens at
   * all rather than a `color-mix` in the component.
   */
  positiveSubtle: '#31323E',
  negativeSubtle: '#462A28',
  secondarySubtle: '#2F3A38',
  /** `secondary` needs no darkening here: on dark ground it is already 8.4:1. */
  secondaryText: '#7FD6D6',

  bg: '#15110E',
  bgWarm: '#1B1613',
  bgMuted: '#211B17',
  surface: '#1E1815',
  surfaceWarm: '#25201B',
  /**
   * One step up from `surface`, and nowhere near the light ramp.
   *
   * 4.6:1 against `text` at worst, so every line inside a hovered card — the
   * name, the Korean label, the description and the licence line — stays as
   * readable as it was before the pointer arrived.
   */
  surfaceHover: '#2C241E',
  surfaceSelected: '#37281D',
  overlay: 'rgba(8, 6, 5, 0.62)',

  border: '#332B25',
  borderStrong: '#4C423A',
  borderSelected: '#FF8A3D',

  text: '#F6F0EA',
  textSecondary: '#CFC5BC',
  textTertiary: '#ADA298',
  textDisabled: '#6E645C',
  textOnPrimary: gray[0],
  textOnDark: gray[0],

  canvasPaper: '#FFFDF8',
  canvasInk: gray[900],
  canvasGuide: gray[200],
  canvasGuideWarm: warm[200],
  canvasTraceGlyph: gray[400],
} as const;

/**
 * Gradients read off the reference screens. (sampled)
 * `card` — featured learning card, top → bottom (p092).
 * `session` — learning-session page background (p235).
 * `ground` — mascot ground band at the foot of a screen (p229).
 */
export const gradient = {
  card: 'linear-gradient(180deg, #FFFFFF 0%, #FFF2E0 100%)',
  session: 'linear-gradient(180deg, #FFFEFC 0%, #FFEAD1 100%)',
  ground: 'linear-gradient(180deg, rgba(255,236,220,0) 0%, #FFDCC2 100%)',
} as const;

/** The same three gradients after dark, warm-tinted rather than merely dimmed. */
export const darkGradient = {
  card: 'linear-gradient(180deg, #241D18 0%, #2E2318 100%)',
  session: 'linear-gradient(180deg, #1A1512 0%, #2A2018 100%)',
  ground: 'linear-gradient(180deg, rgba(58,36,21,0) 0%, #3A2415 100%)',
} as const;

/** Pretendard is OFL-1.1 and matches the letterforms in the design PDF. */
export const fontFamily = {
  ui: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
  /** Overridden at runtime by the learner's selected practice typeface. */
  practice: "'Pretendard Variable', Pretendard, sans-serif",
  /**
   * The face instruction is set in. Never overridden.
   *
   * The same stack as `practice` starts out as, and deliberately a separate
   * token: the learner may set the practice face to a brush or a serif, and the
   * large reference character on a lesson screen must not follow it there. That
   * glyph is the shape being taught, and the stroke geometry underneath it is
   * fitted to *this* face's proportions (`scripts/measure-jamo.mjs`), so letting
   * it change would put a letter on the screen the demonstration does not match.
   */
  reference: "'Pretendard Variable', Pretendard, sans-serif",
} as const;

/** Type scale measured off the 375 pt artboards. */
export const fontSize = {
  micro: '11px',
  caption: '13px',
  bodySm: '14px',
  body: '15px',
  bodyLg: '16px',
  title: '17px',
  heading: '20px',
  headingLg: '24px',
  display: '28px',
  displayLg: '34px',
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

export const lineHeight = {
  tight: 1.25,
  snug: 1.4,
  normal: 1.5,
  relaxed: 1.65,
} as const;

/** 4 pt base grid. */
export const space = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const radius = {
  xs: '6px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  pill: '999px',
} as const;

/**
 * Shadows are warm-tinted, not neutral grey — sampled shadow peak under the
 * home cards is #C4B6A6 on white. A neutral rgba(0,0,0,.1) reads visibly wrong
 * beside the reference screens.
 */
export const shadow = {
  card: '0 1px 2px rgba(120, 82, 40, 0.06), 0 6px 16px rgba(120, 82, 40, 0.10)',
  raised: '0 2px 4px rgba(120, 82, 40, 0.08), 0 12px 28px rgba(120, 82, 40, 0.14)',
  button: '0 2px 8px rgba(255, 103, 0, 0.28)',
  nav: '0 -1px 0 rgba(38, 44, 49, 0.06)',
  modal: '0 12px 40px rgba(120, 82, 40, 0.22)',
  /**
   * A confirmation dialog, which sits closer to the page than a celebration.
   *
   * Neutral rather than warm, and short rather than wide: the app-service
   * design file draws these with a hard drop under the card, not the bloom the
   * cream celebration sits in. It is the one shadow in the set that is not
   * warm-tinted, because it is not being cast onto the warm ground — the
   * overlay is already over it.
   */
  dialog: '0 4px 12px rgba(38, 44, 49, 0.24)',
} as const;

/** Minimum hit target, and the fixed chrome heights the layout shell reserves. */
export const size = {
  hitTarget: '44px',
  controlSm: '36px',
  controlMd: '48px',
  controlLg: '56px',
  appHeader: '56px',
  bottomNav: '64px',
  /** The design is drawn at 375 pt; the shell centres at this width on desktop. */
  appMaxWidth: '430px',
} as const;

export const zIndex = {
  base: 0,
  sticky: 10,
  header: 20,
  bottomNav: 30,
  overlay: 40,
  modal: 50,
  toast: 60,
} as const;

export const duration = {
  instant: '80ms',
  fast: '150ms',
  normal: '220ms',
  slow: '360ms',
  celebrate: '600ms',
} as const;

export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  decelerate: 'cubic-bezier(0, 0, 0, 1)',
  accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

export const tokens = {
  orange,
  gray,
  warm,
  accent,
  semantic,
  dark,
  gradient,
  darkGradient,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  space,
  radius,
  shadow,
  size,
  zIndex,
  duration,
  easing,
} as const;

export type Tokens = typeof tokens;
