import { useMemo } from 'react';
import { useLocale } from '../i18n';
import styles from './Progress.module.css';

export interface ProgressBarProps {
  /** 0..1. */
  value: number;
  label: string;
  /** Hides the label visually but keeps it for screen readers. */
  hideLabel?: boolean;
  size?: 'sm' | 'md';
}

/** The thin rounded track under a session header (`docs/design-refs/p235`). */
export function ProgressBar({ value, label, hideLabel = true, size = 'md' }: ProgressBarProps) {
  const pct = Math.round(clamp01(value) * 100);
  return (
    <div className={styles.barRow}>
      {!hideLabel && <span className={styles.barLabel}>{label}</span>}
      <div
        className={`${styles.track} ${styles[size]}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
      >
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export interface CircularProgressProps {
  /** 0..1. */
  value: number;
  label: string;
  size?: number;
  /** Renders the percentage inside the ring, as the home screen does. */
  showValue?: boolean;
  /** Overrides the centre content — used for "3 / 5" style counters. */
  caption?: string;
}

/**
 * The gauge from the featured learning card: a ~270° arc with a rounded cap and
 * a large orange numeral inside.
 */
export function CircularProgress({
  value,
  label,
  size = 96,
  showValue = true,
  caption,
}: CircularProgressProps) {
  /*
   * The arc is capped and the number is not.
   *
   * A ring cannot draw more than one revolution, so the geometry has to stop at
   * full. The *label* has no such excuse, and clamping both is why a learner
   * who had done twelve words against a goal of ten read `12/10` beside a ring
   * that said `100%`. Two numbers about the same fact, on the same card,
   * disagreeing — and the one that was wrong was the one being celebrated.
   */
  const pct = clamp01(value);
  // The design sets the numeral large and the percent sign small, so the two
  // are separate elements — but they still have to be the locale's numeral and
  // the locale's percent sign, in the locale's order. `formatToParts` gives
  // both without hand-assembling `${n}%`, which is wrong in several of the
  // languages this app ships.
  const percent = usePercentParts(Math.max(0, value));
  const stroke = size * 0.11;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  // 270° of sweep, leaving the gap at the bottom.
  const arc = circumference * 0.75;
  const rotation = 135;

  return (
    <div
      className={styles.gauge}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`rotate(${rotation} ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--hg-border)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circumference}`}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--hg-primary)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arc * pct} ${circumference}`}
            className={styles.gaugeFill}
          />
        </g>
      </svg>
      {(showValue || caption) && (
        <div className={styles.gaugeCenter}>
          {caption ? (
            <span className={styles.gaugeCaption}>{caption}</span>
          ) : (
            <>
              <span className={styles.gaugeValue}>{percent.value}</span>
              <span className={styles.gaugeUnit}>{percent.unit}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Splits a formatted percentage into its numeral and its percent sign. */
function usePercentParts(ratio: number): { value: string; unit: string } {
  const { locale } = useLocale();
  return useMemo(() => {
    const parts = new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 0,
    }).formatToParts(ratio);
    const unit = parts.find((part) => part.type === 'percentSign')?.value ?? '%';
    const value = parts
      .filter((part) => part.type !== 'percentSign')
      .map((part) => part.value)
      .join('')
      .trim();
    return { value, unit };
  }, [locale, ratio]);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
