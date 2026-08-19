import type { HTMLAttributes, ReactNode } from 'react';

import styles from './Card.module.css';

export type CardTone =
  /** Plain white card — list rows, settings, most content. */
  | 'plain'
  /** Warm peach fill — stat blocks and summaries (`p119`). */
  | 'warm'
  /** White drifting to peach — the featured learning card (`p092`). */
  | 'featured';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  /** Softens the shadow for cards that sit inside another surface. */
  flat?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Card({
  tone = 'plain',
  flat = false,
  padding = 'md',
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    styles[tone],
    styles[`pad-${padding}`],
    flat ? styles.flat : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
