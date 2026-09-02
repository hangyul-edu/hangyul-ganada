/**
 * How a set of answer tiles is broken into rows.
 *
 * ## The defect this exists for
 *
 * Five syllable tiles rendered as **four and one**. The tray was a flex box
 * with `flex-wrap: wrap`, so the row filled until the next tile did not fit and
 * the remainder fell through — which on a 390 px phone with 62 px tiles is four
 * across and a single orphan underneath. An orphan reads as a mistake: the eye
 * takes the full row as the answer and the stray tile as something else, and a
 * learner counting tiles to guess the word's length is being told the wrong
 * number.
 *
 * Nothing chose four and one. Wrapping is not a layout, it is what happens when
 * there is no layout, and the shape it produces is a function of the viewport
 * rather than of the question. The same five tiles were three and two on a
 * narrower phone and five across on a tablet.
 *
 * ## The rule
 *
 * ```
 * rows    = ceil(n / 4)          at most four across, which is what fits at 320 px
 * columns = ceil(n / rows)       spread evenly over those rows
 * ```
 *
 * Which gives, for the counts the product actually asks:
 *
 * | tiles | rows |
 * | --- | --- |
 * | 2, 3, 4 | one row |
 * | **5** | **3 + 2** |
 * | 6 | 3 + 3 |
 * | 7 | 4 + 3 |
 * | 8 | 4 + 4 |
 * | 9 | 3 + 3 + 3 |
 * | 10 | 4 + 3 + 3 |
 *
 * No row is ever left with one tile while another has four, because the count
 * is divided rather than filled. That is the property worth stating: the rule
 * is not "5 goes 3 + 2", it is "rows are balanced", and 3 + 2 falls out of it.
 *
 * ## Why the rows are real elements and not a grid
 *
 * A CSS grid can lay five cells over three columns; what it cannot do is centre
 * the two that are left, because centring them means offsetting the row by half
 * a column and a grid's columns do not divide. Every workaround — a doubled
 * sub-column track, a computed margin on one child — needs the tile's width as
 * a number, and the tiles do not have one: they grow with their content, with
 * the reading size, and with the script. A row that centres its own children is
 * exact for any of that, in either reading direction, with no arithmetic to get
 * wrong.
 *
 * The tiles stay in order and stay siblings within a row, so the DOM order, the
 * reading order, the tab order and the touch order are all the order they were
 * given in.
 */

/** The most tiles on one row. Four 62 px tiles and their gaps fit at 320 px. */
const MAX_PER_ROW = 4;

export function optionRows<T>(options: readonly T[], maxPerRow = MAX_PER_ROW): T[][] {
  if (options.length === 0) return [];
  const rows = Math.ceil(options.length / maxPerRow);

  /*
   * Dealt out, not sliced into fixed-width chunks.
   *
   * Chunking by `ceil(n / rows)` looks like the same thing and is not: ten
   * tiles over three rows chunks to 4 + 4 + 2, which is the orphan this file
   * exists to remove, one row further down. Sizes have to be `floor` or
   * `ceil` of the average and nothing else, with the fuller rows first so the
   * shape settles rather than growing.
   */
  const base = Math.floor(options.length / rows);
  const wider = options.length % rows;

  const out: T[][] = [];
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    const size = base + (row < wider ? 1 : 0);
    out.push(options.slice(index, index + size));
    index += size;
  }
  return out;
}
