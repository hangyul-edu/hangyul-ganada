import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './Button.module.css';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'dark'
  /**
   * A filled grey action, weighted to sit beside `primary` as its equal.
   *
   * `secondary` is a tinted orange and reads as a quieter version of the same
   * thing. In a confirmation dialog the two answers are not the same thing —
   * one of them is *no* — and the reference design gives them equal visual
   * weight in different colours rather than a loud one and a faint one. See
   * `ConfirmDialog`.
   */
  | 'neutral';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches to the container — how the design uses its main CTAs. */
  fullWidth?: boolean;
  /**
   * Pill radius. The component sheet (`docs/design-refs/p011`) uses fully
   * rounded buttons standalone, and ~12 radius for CTAs sitting inside a card.
   */
  pill?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  pill = false,
  startIcon,
  endIcon,
  loading = false,
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
    pill ? styles.pill : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {startIcon ? <span className={styles.icon}>{startIcon}</span> : null}
      <span className={styles.label}>{children}</span>
      {endIcon ? <span className={styles.icon}>{endIcon}</span> : null}
    </button>
  );
}
