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

export const LetterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8.5 9.5h7M8.5 14h4" />
  </Icon>
);

export const WordIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
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

export const FireIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3s5 4 5 8a5 5 0 0 1-10 0c0-1.5.7-2.8 1.5-3.7C9 9 10 10 10 11c0-3 2-5 2-8z" />
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
