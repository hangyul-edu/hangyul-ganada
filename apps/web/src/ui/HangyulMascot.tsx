/**
 * The Hangyul mascot — a tangerine with a green leaf, mint round glasses and a
 * simple face.
 *
 * Rebuilt as vector from the reference screens rather than cropped out of the
 * PDF, so it scales, stays crisp, and can express a state. Colours match the
 * sampled artwork: amber body fading to pale yellow, `--hg-secondary` glasses.
 */
export type MascotMood = 'happy' | 'cheer' | 'thinking' | 'sad';

export interface HangyulMascotProps {
  mood?: MascotMood;
  size?: number;
  /** Decorative by default; give a label when it carries meaning. */
  label?: string;
  className?: string;
}

export function HangyulMascot({
  mood = 'happy',
  size = 88,
  label,
  className,
}: HangyulMascotProps) {
  const gradientId = `hg-mascot-body-${mood}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="50" y1="18" x2="50" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFC44D" />
          <stop offset="1" stopColor="#FFE9A8" />
        </linearGradient>
      </defs>

      {/* Body */}
      <circle cx="50" cy="56" r="34" fill={`url(#${gradientId})`} />

      {/* Cheeks */}
      <ellipse cx="30" cy="62" rx="6" ry="4" fill="#FFAE7A" opacity="0.5" />
      <ellipse cx="70" cy="62" rx="6" ry="4" fill="#FFAE7A" opacity="0.5" />

      {/* Leaf */}
      <path
        d="M52 24C52 24 58 10 74 10C74 10 72 26 56 27Z"
        fill="#2E9E52"
      />
      <path
        d="M57 24C61 19 66 15 71 13"
        stroke="#7FD79B"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Glasses */}
      <circle cx="38" cy="52" r="11" fill="#FFFFFF" opacity="0.55" />
      <circle cx="62" cy="52" r="11" fill="#FFFFFF" opacity="0.55" />
      <circle cx="38" cy="52" r="11" fill="none" stroke="var(--hg-secondary)" strokeWidth="2.6" />
      <circle cx="62" cy="52" r="11" fill="none" stroke="var(--hg-secondary)" strokeWidth="2.6" />
      <path d="M49 52H51" stroke="var(--hg-secondary)" strokeWidth="2.6" strokeLinecap="round" />

      <Face mood={mood} />
    </svg>
  );
}

function Face({ mood }: { mood: MascotMood }) {
  const eyes = (
    <>
      <circle cx="38" cy="52" r="4" fill="var(--hg-gray-900)" />
      <circle cx="62" cy="52" r="4" fill="var(--hg-gray-900)" />
    </>
  );

  switch (mood) {
    case 'cheer':
      return (
        <>
          {/* Squeezed-shut delighted eyes */}
          <path
            d="M33 53C35 49 41 49 43 53M57 53C59 49 65 49 67 53"
            stroke="var(--hg-gray-900)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M42 68C45 73 55 73 58 68"
            stroke="var(--hg-gray-900)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
    case 'thinking':
      return (
        <>
          {eyes}
          <path
            d="M43 70H57"
            stroke="var(--hg-gray-900)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      );
    case 'sad':
      return (
        <>
          {eyes}
          <path
            d="M43 72C46 67 54 67 57 72"
            stroke="var(--hg-gray-900)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
    case 'happy':
    default:
      return (
        <>
          {eyes}
          <path
            d="M42 68C45 73 55 73 58 68"
            stroke="var(--hg-gray-900)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
  }
}
