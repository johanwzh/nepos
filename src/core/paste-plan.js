// Where a pasted block goes, Excel's way (backlog 102, spec 2026-11-04-paste-everywhere-design.md). Pure: no grid, no DOM.
import { canonicalDayCode, isAllowedDayCode } from './day-codes.js';

/**
 * A copied block of `rows` × `cols` onto a selection. When the selection is a whole multiple of the block in both
 * directions, the block is repeated to fill it (one cell: it fills the selection) and the table never grows. Otherwise
 * the block is pasted once from the selection's top-left cell, and the table grows as far as the block's used part
 * hangs over its edge. The area is clipped to the table (after growth).
 *
 * `usedRows` / `usedCols` are the part of a block that grows the table (Excel text: as far as it holds times); the
 * default is the whole block. Source cell for (r, c) in the area: ((r − r0) % rows, (c − c0) % cols).
 * @param {{ rows: number, cols: number, usedRows?: number, usedCols?: number }} src
 * @param {{ r0: number, r1: number, c0: number, c1: number }} sel the selected rectangle, normalised
 * @param {{ rows: number, cols: number }} size the table now
 * @returns {{ r0: number, c0: number, r1: number, c1: number, addRows: number, addCols: number } | null} null: nothing to paste
 */
export function pastePlan(src, sel, size) {
  if (src.rows < 1 || src.cols < 1) return null;
  const H = sel.r1 - sel.r0 + 1, W = sel.c1 - sel.c0 + 1;
  if (H % src.rows === 0 && W % src.cols === 0) return { r0: sel.r0, c0: sel.c0, r1: sel.r1, c1: sel.c1, addRows: 0, addCols: 0 };
  const addRows = Math.max(0, sel.r0 + (src.usedRows ?? src.rows) - size.rows);
  const addCols = Math.max(0, sel.c0 + (src.usedCols ?? src.cols) - size.cols);
  return {
    r0: sel.r0, c0: sel.c0, addRows, addCols,
    r1: Math.min(sel.r0 + src.rows - 1, size.rows + addRows - 1),
    c1: Math.min(sel.c0 + src.cols - 1, size.cols + addCols - 1),
  };
}

/**
 * Text from a spreadsheet as rows of cells: line breaks between rows (the one at the end is ignored), tabs between
 * cells; a blank line is an empty row.
 * @param {string} text @returns {string[][]}
 */
export function textBlock(text) {
  if (!text) return [];
  return text.replace(/\r?\n$/, '').split(/\r?\n/).map((line) => (line === '' ? [] : line.split('\t')));
}

/**
 * Day codes in pasted text (tabs and line breaks both separate them, so a row or a column from a spreadsheet works),
 * tidied the way a typed one is (DX76 → DX67). An empty entry is an empty day code (a column not filled in yet), as an
 * empty cell is in the times. Null when any entry is not a day code, or all are empty: then nothing is pasted.
 * @param {string} text @returns {string[] | null}
 */
export function dayCodeList(text) {
  if (!text) return null;
  const codes = text.replace(/\r?\n$/, '').split(/\t|\r?\n/).map((s) => canonicalDayCode(s.trim().toUpperCase()));
  return codes.some((c) => c) && codes.every((c) => c === '' || isAllowedDayCode(c)) ? codes : null;
}
