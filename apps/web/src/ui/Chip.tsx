import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './Chip.module.css';

export type ChipTone = 'neutral' | 'primary' | 'mint' | 'positive' | 'negative';

export interface BadgeProps {
  tone?: ChipTone;
  /** Filled reads stronger; the design uses it for the active state. */
  filled?: boolean;
  startIcon?: ReactNode;
  /**
   * The badge holds a number or a counter rather than words. Isolates the run
   * at LTR so an RTL page cannot render "1 / 5" as "5 / 1".
   */
  numeric?: boolean;
  children: ReactNode;
  className?: string;
}

/** A static status pill — "학습 완료", "Lv.2", "+50P". */
export function Badge({
  tone = 'neutral',
  filled = false,
  startIcon,
  numeric = false,
  children,
  className,
}: BadgeProps) {
  const classes = [
    styles.badge,
    styles[tone],
    filled ? styles.filled : '',
    numeric ? 'hg-numeric' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes}>
      {startIcon ? <span className={styles.icon}>{startIcon}</span> : null}
      {children}
    </span>
  );
}

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  selected?: boolean;
  children: ReactNode;
}

/** A selectable filter pill. Selected takes the peach fill + orange border. */
export function Chip({ selected = false, children, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={[styles.chip, selected ? styles.chipSelected : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
