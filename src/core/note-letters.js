// Note letters (booking spec 2026-10-22): a time's text note and date changes show as one letter beside it, in place
// of the old triangle. Letters run b, c, … z skipping a, p and x (those are marks of their own), then bb, bc, …; they
// are given per table in reading order (column by column, top to bottom), and the same note and dates share a letter.

const LETTERS = [...'abcdefghijklmnopqrstuvwxyz'].filter((ch) => !'apx'.includes(ch));

/** The letter number i (0 → b). @param {number} i */
export function letterAt(i) {
  if (i < LETTERS.length) return LETTERS[i];
  const k = i - LETTERS.length;
  return LETTERS[Math.floor(k / LETTERS.length) % LETTERS.length] + LETTERS[k % LETTERS.length];
}

/**
 * The letter of every cell with a note or dates, keyed "ci:ri". A block's virtual columns (`virt`) have none.
 * @param {{ stops: any[], cols: any[] }} grid
 * @returns {Map<string, string>}
 */
export function noteLetters(grid) {
  /** @type {Map<string, string>} */
  const byContent = new Map();
  /** @type {Map<string, string>} */
  const out = new Map();
  grid.cols.forEach((col, ci) => {
    if (col.virt) return;
    for (let ri = 0; ri < grid.stops.length; ri++) {
      const cell = col.cells?.[ri];
      if (!cell?.note && !cell?.dates?.length) continue;
      const key = JSON.stringify([cell.note ?? '', cell.dates ?? []]);
      if (!byContent.has(key)) byContent.set(key, letterAt(byContent.size));
      out.set(`${ci}:${ri}`, /** @type {string} */ (byContent.get(key)));
    }
  });
  return out;
}
