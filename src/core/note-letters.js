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
 * Every note and dates combination of the table, in the order its letters were given, and the letter of each cell.
 * A block's virtual columns (`virt`) have none.
 * @param {{ stops: any[], cols: any[] }} grid
 */
function assign(grid) {
  /** @type {Map<string, { letter: string, note: string, dates: any[] }>} */
  const byContent = new Map();
  /** @type {Map<string, string>} */
  const out = new Map();
  grid.cols.forEach((col, ci) => {
    if (col.virt) return;
    for (let ri = 0; ri < grid.stops.length; ri++) {
      const cell = col.cells?.[ri];
      if (!cell?.note && !cell?.dates?.length) continue;
      const key = JSON.stringify([cell.note ?? '', cell.dates ?? []]);
      let entry = byContent.get(key);
      if (!entry) {
        entry = { letter: letterAt(byContent.size), note: cell.note ?? '', dates: cell.dates ?? [] };
        byContent.set(key, entry);
      }
      out.set(`${ci}:${ri}`, entry.letter);
    }
  });
  return { byContent, out };
}

/**
 * Both at once, for one pass over the table: `letters` is the letter of every cell with a note or dates, keyed "ci:ri";
 * `legend` is the list under the grid (backlog 116): every letter in use once, with the note and dates it stands for,
 * in the order of the letters (b … z, then bb, bc …).
 * @param {{ stops: any[], cols: any[] }} grid
 * @returns {{ letters: Map<string, string>, legend: { letter: string, note: string, dates: any[] }[] }}
 */
export function noteMarks(grid) {
  const { byContent, out } = assign(grid);
  return { letters: out, legend: [...byContent.values()] };
}

/** The letter of every cell with a note or dates, keyed "ci:ri". @param {{ stops: any[], cols: any[] }} grid */
export const noteLetters = (grid) => noteMarks(grid).letters;

/** The list under the grid: every letter once, with its note and dates. @param {{ stops: any[], cols: any[] }} grid */
export const noteLegend = (grid) => noteMarks(grid).legend;
