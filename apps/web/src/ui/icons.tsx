/**
 * Icon set. Stroked, 24×24, 2px, rounded caps and joins — matching the line
 * weight of the icons in the reference screens. All are decorative; the control
 * that wraps them carries the accessible name.
 *
 * Chevrons mean "onward" and "back", not "east" and "west", so they carry
 * `hg-icon-directional` and are mirrored under `[dir='rtl']` (see global.css).
 * Nothing else here is mirrored: a magnifying glass or a house points the same
 * way in every script.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/** Marks an icon whose meaning is tied to reading direction. */
const DIRECTIONAL = 'hg-icon-directional';

function Icon({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
  </Icon>
);

/*
  Letters and Words.

  ## What they were

  Letters was a sheet of paper with a folded corner and two ruled lines. Words
  was an open book split down the middle into two rounded panels. Neither said
  anything about this product: the page is the icon every application uses for a
  document, and the two panels read as blocks rather than as a book. Neither
  said anything about *Korean* either, which is the one thing both sections are
  entirely about.

  ## What they are

  **Letters is ㄱㄴㄷ** — the opening of the Korean alphabet, and what a Korean
  speaker says for the alphabet itself the way an English speaker says ABC.
  Three letters rather than one, because one letter is a letter and three in a
  row are an *alphabet*, which is what the course teaches. It is also the
  product's own name: 가나다.

  **Words is a word card with 가 on it** — the syllable every learner writes
  first, set on the card the app teaches vocabulary with.

  It got there by elimination, drawn and looked at rather than argued about. A
  plain open book is the icon every application uses for *reading*, and it says
  nothing about words in particular; adding page lines to it helped a little and
  still read as "a book". A book with 가 inside it cramps the ㅏ against the
  cover's right edge. A deck of cards puts a line above the card that reads as a
  lid. 가 sitting above a book merges with the book's top edge into 감, which is
  a different word and the worst outcome of the set.

  The card is the shape that carries the glyph without fighting it, and a
  Korean syllable on a card is what a vocabulary card *is*. Beside ㄱㄴㄷ the
  pair reads as the course reads: letters, then letters made into a word.

  ## How they were sized, which is where the first attempt went wrong

  Both were drawn against the surface they actually appear on: a 44px square
  filled `--hg-orange-200`, `--hg-radius-md`, with the icon set at 26px — plus
  20px in the tab bar. The first ㄱㄴㄷ was drawn on the geometric grid and the
  three letters ran together on the card, because a 2px stroke with round caps
  puts a unit of ink *past* each path endpoint at both ends. A nominal 1.9-unit
  gap is therefore 0.1 units of actual daylight, which is none.

  So the spacing here is computed in ink rather than in path: each letter is 4.6
  units wide and so 6.6 units of ink, the gaps are a real 1.6 units, and the
  three sit on 0.5–23.5 of the 24 grid — optically centred, and separated by an
  amount that survives being drawn at 20px.

  The card is centred the same way, and its 가 is spaced by the same ink
  arithmetic: 2 units of real daylight between the ㄱ and the ㅏ, and the glyph
  as a whole optically centred inside the card rather than inside the 24 grid.

  The 가 itself was drawn against Pretendard rather than by eye, and took three
  passes, each of which is worth recording because each was a different way of
  getting a letter wrong with correct-looking numbers.

  The first started the ㄱ *below* the vowel's top, gave its leg almost no lean,
  and cut the ㅏ's branch short and high. It read as three strokes parked near
  each other.

  The second levelled the tops and leaned the leg, which fixed the shapes and
  not the *block*: with a short leg, all of the ㄱ's ink sits in the upper left
  while the ㅏ runs the full height beside it, and the two read as two pieces
  rather than as one syllable. Lowering the ㄱ is the obvious answer and it is
  the wrong one — it trades a gap at the bottom for uneven tops, which no
  Korean face has.

  What the face actually does is run the ㄱ's leg most of the way down, so the
  two components overlap along nearly their whole height and the eye reads one
  square. That is this version: tops level, a lean of about twelve degrees, and
  a leg reaching to within a unit of the vowel's foot.

  Both are stroked at the set's 2px with no filled shapes, so they carry the
  same weight as Home, Review and My Learning beside them. There is nothing
  platform-specific: they are inline SVG in the bundle, so the browser and the
  Android WebView draw the same paths from this file.
*/
export const LetterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.5 7.75h4.6l-1 8.5" />
    <path d="M9.7 7.75v8.5h4.6" />
    <path d="M22.5 7.75h-4.6v8.5h4.6" />
  </Icon>
);

export const WordIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="3" />
    <path d="M6.6 8.2h4.9l-1.5 6.8" />
    <path d="M15.4 8.2v7.7" />
    <path d="M15.4 12.1h2" />
  </Icon>
);

export const ReviewIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4h-4" />
  </Icon>
);

export const ProfileIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p} className={[DIRECTIONAL, p.className].filter(Boolean).join(' ')}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p} className={[DIRECTIONAL, p.className].filter(Boolean).join(' ')}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.2v.3" />
  </Icon>
);

export const UndoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h9a5 5 0 0 1 0 10H8" />
    <path d="M4 9l4-4M4 9l4 4" />
  </Icon>
);

export const EraserIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.5 19.5 4 15l9-9 5 5-9 9z" />
    <path d="M8.5 19.5H19" />
  </Icon>
);

export const PenIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20l1-4L16 5l3 3L8 19z" />
    <path d="M14.5 6.5l3 3" />
  </Icon>
);

export const TypeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7V5h16v2" />
    <path d="M12 5v14M9 19h6" />
  </Icon>
);

export const SparkleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l2 5.5L19.5 10 14 12l-2 5.5L10 12 4.5 10 10 8.5z" />
  </Icon>
);

export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const EyeOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6" />
    <path d="M6.4 7.8A16.6 16.6 0 0 0 2.5 12S6 18 12 18c1.3 0 2.5-.3 3.6-.7" />
    <path d="M4 4l16 16" />
  </Icon>
);

export const GridIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 12h16M12 4v16" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6" />
  </Icon>
);

/**
 * The streak mark: consecutive days, and nothing else.
 *
 * ## Why the old one looked wrong
 *
 * Two reasons, and only one of them was the drawing. Its ink ran from y=2 to
 * y=16.9 of a 24-unit box, centring at **9.45** — a tenth of the box above the
 * middle. Every badge that puts it in an `align-items: center` row was
 * therefore centring a shape that was not centred in its own square, and it
 * rode visibly high beside the number. No amount of margin on the badge fixes
 * that; the glyph has to sit in the middle of the box it declares.
 *
 * This one measures 2.3 to 21.6, centring at **11.95**, so the icon box and the
 * ink agree and the row's own centring does the work.
 *
 * The shape is also a flame rather than a suggestion of one: an outer silhouette
 * that widens to a round base, and an inner curl that reads at 15 px. The old
 * outline had a flat right side and an inner mark that closed into a blob.
 *
 * Stroked like every other icon here — `currentColor`, width 2, round joins —
 * so it inherits the badge's colour in both themes and needs no second asset.
 */
export const FireIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.35c.4 3.3 2.1 4.6 3.5 6.2C16.8 11.05 17.8 12.75 17.8 14.85a5.8 5.8 0 0 1-11.6 0c0-1.9.8-3.4 1.9-4.6.2 1 .8 1.8 1.6 2.2C9.3 8.95 11 6.75 12 3.35Z" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.6-3.6" />
  </Icon>
);

export const GlobeIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
  </Icon>
);

/**
 * The speaker. Never mirrored: it is an object, not a direction — a loudspeaker
 * faces the same way in Arabic as it does in English.
 */
export const SpeakerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
    <path d="M15.8 9.2a4 4 0 0 1 0 5.6" />
    <path d="M18.4 6.6a7.5 7.5 0 0 1 0 10.8" />
  </Icon>
);

/** Shown while a clip is sounding — the waves alone, animated by CSS. */
export const SpeakerPlayingIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="currentColor" fillOpacity={0.16} />
    <path d="M15.8 9.2a4 4 0 0 1 0 5.6" />
    <path d="M18.4 6.6a7.5 7.5 0 0 1 0 10.8" />
  </Icon>
);

export const SpeakerOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
    <path d="m16 10 4 4" />
    <path d="m20 10-4 4" />
  </Icon>
);

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5" />
    <path d="M12 7.8h.01" />
  </Icon>
);

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Icon>
);

/** A closed book — the vocabulary curriculum, not a single word. */
export const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4.5h9a3.5 3.5 0 0 1 3.5 3.5v11.5H8.5A3.5 3.5 0 0 1 5 16z" />
    <path d="M5 16a3.5 3.5 0 0 1 3.5-3.5h9" />
  </Icon>
);

/**
 * A bookmark, for saving a word.
 *
 * Takes a `filled` prop rather than being two icons: the saved and unsaved
 * states are the same shape with and without ink in it, and a learner scanning
 * a list needs the difference to be the fill, not the outline.
 */
export const BookmarkIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M6.5 4.5h11v15l-5.5-4-5.5 4z" />
  </Icon>
);
