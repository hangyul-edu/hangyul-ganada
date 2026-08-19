import styles from './SyllableEquation.module.css';

/**
 * `ㄱ + ㅏ = 가`, drawn rather than written.
 *
 * This is the single idea a learner has to have before Hangul makes any sense:
 * the letters are *pieces*, and a syllable is what you get when you put them in
 * a box together. Someone who has never seen the writing system will read a
 * line of text saying so and still be surprised by 가.
 *
 * So each piece gets its own tile and the block gets a bigger, warmer one, with
 * the operators between them. It is the same information the sentence carried,
 * arranged so the arrangement is the point: three small things on the left, one
 * square thing on the right.
 *
 * The source string lives in the curriculum data (`INTRO_DIAGRAMS`) because it
 * is Korean, not copy — `ㄱ + ㅏ = 가` reads identically in every interface
 * language. Lines are separated by `\n`, tokens by spaces.
 */
export function SyllableEquation({ diagram }: { diagram: string }) {
  const lines = diagram
    .split('\n')
    .map((line) => line.trim().split(/\s+/).filter(Boolean))
    .filter((tokens) => tokens.length > 0);

  return (
    // Korean, laid out as the writing system lays it out. Never mirrored and
    // never reordered, whatever the interface language is doing.
    <div className={styles.equations} lang="ko" dir="ltr">
      {lines.map((tokens, line) => (
        <div key={line} className={styles.row}>
          {tokens.map((token, i) => {
            if (token === '+' || token === '=') {
              return (
                <span key={i} className={styles.operator} aria-hidden="true">
                  {token}
                </span>
              );
            }
            // After an `=`, the token is the finished block: bigger, and in the
            // product's own colour, because it is the answer.
            const isResult = tokens.slice(0, i).includes('=');
            return (
              <span key={i} className={`${styles.tile} ${isResult ? styles.result : ''}`}>
                {token}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
