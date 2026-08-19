import type { ReactNode } from 'react';

import { useHorizontalScroll } from './useHorizontalScroll';
import styles from './ScrollRow.module.css';

export interface ScrollRowProps {
  children: ReactNode;
  /** `group` for a set of filters, `tablist` where the row really is tabs. */
  role?: string;
  'aria-label'?: string;
  className?: string;
  /** Drag-to-scroll with a mouse. See `useHorizontalScroll`. */
  draggable?: boolean;
}

/**
 * A row of chips that scrolls sideways, on every input a person might use.
 *
 * The behaviour is `useHorizontalScroll`; this adds the layout and the one
 * thing that replaces the scrollbar. Scrollbars are hidden app-wide — a grey
 * gutter under a row of pills is the loudest "this is a web page" tell there is
 * — so the signal that the row continues is the content fading out at the edge,
 * plus the next chip being visibly cut rather than absent.
 */
export function ScrollRow({
  children,
  role,
  className,
  draggable = true,
  'aria-label': ariaLabel,
}: ScrollRowProps) {
  const { ref, props, overflow } = useHorizontalScroll({
    draggable,
    draggingClassName: styles.dragging,
  });

  return (
    <div
      ref={ref}
      role={role}
      aria-label={ariaLabel}
      className={[
        styles.row,
        overflow.start ? styles.fadeStart : '',
        overflow.end ? styles.fadeEnd : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
