import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'dark';
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
