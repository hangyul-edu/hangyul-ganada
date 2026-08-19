import styles from './StepTrail.module.css';

/**
 * Where the learner is in the loop, and what is coming.
 *
 * Three dots with labels, not a progress bar: the steps are named things
 * ("trace", "write", "recognise") rather than a percentage, and a beginner who
 * can see that writing comes after tracing understands why they are being asked
 * to trace. Without it, the second canvas looks like the app forgot they
 * already did this.
 */
export function StepTrail({
  steps,
  current,
  label,
}: {
  steps: string[];
  /** Zero-based index of the active step. */
  current: number;
  label: string;
}) {
  if (steps.length < 2) return null;
  return (
    <ol className={styles.trail} aria-label={label}>
      {steps.map((step, index) => (
        <li
          key={step}
          className={`${styles.step} ${
            index < current ? styles.done : index === current ? styles.active : ''
          }`}
          aria-current={index === current ? 'step' : undefined}
        >
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.label}>{step}</span>
        </li>
      ))}
    </ol>
  );
}
