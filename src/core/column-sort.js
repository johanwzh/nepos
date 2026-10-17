// Sorting a table's columns (user test 2026-10-17, from Reggi): by departure, or in day-code blocks
// and then by departure. Only the order changes; interchanges point at columns by position, so they are
// re-pointed. Stable: equal columns keep their order; columns without times go last.
import { parseDayCode } from './day-codes.js';

/** @param {any} col @returns {number} the first time in the column, in minutes (a later day counts later) */
function departure(col) {
  for (const c of col.cells) {
    if (c?.time && c.time !== '|') return (c.dayOffset || 0) * 1440 + Number(c.time.slice(0, 2)) * 60 + Number(c.time.slice(2, 4));
  }
  return Infinity;
}

/** D first, then by the first weekday it runs (DX… and digit codes), 6 and 7 after, H last. @param {string} code */
function block(code) {
  if (code === 'D') return 0;
  if (code === 'H') return 9;
  const p = parseDayCode(code);
  return p?.weekdays.length ? p.weekdays[0] : 8;
}

/**
 * Sort the columns in place.
 * @param {{ stops: any[], cols: any[] }} grid
 * @param {'time' | 'daycode'} by
 */
export function sortColumns(grid, by) {
  const order = grid.cols.map((col, i) => ({ col, i, dep: departure(col) }));
  order.sort((a, b) => {
    if (by === 'daycode') {
      const d = block(a.col.dayCode) - block(b.col.dayCode) || String(a.col.dayCode).localeCompare(String(b.col.dayCode));
      if (d) return d;
    }
    return (a.dep === b.dep ? 0 : a.dep < b.dep ? -1 : 1) || a.i - b.i;
  });
  /** @type {number[]} old index → new index */
  const moved = [];
  order.forEach((o, n) => { moved[o.i] = n; });
  grid.cols = order.map((o) => o.col);
  for (const col of grid.cols) {
    for (const c of col.cells) if (c?.interchange && moved[c.interchange.targetC] != null) c.interchange.targetC = moved[c.interchange.targetC];
  }
}
