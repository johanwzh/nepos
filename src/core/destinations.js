// Destinations (destination displays spec): what a journey planner shows a trip goes to, from its
// first served stop, changing at later stops. A column holds its start (col.dest) and its changes
// (col.dests, one slot per stop row, parallel to col.cells), so writing times never touches them and
// row and column operations move them with the cells. Pure.
import { journeyStops } from './netex/journeys.js';

/** @typedef {{ text: string, vias: string[] }} Dest */
/**
 * @typedef {{ row: number, end: number, dest: Dest, start: boolean, colour: 0 | 1 | 2,
 *             state: 'ok' | 'unserved' | 'last' }} DestSegment
 */

/** The first word of a stop name ("Oslo S" → "Oslo"): people travel to places, not to stops. @param {string} name */
export function firstWord(name) {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** "via" written into a destination text: a via is data, not text. @param {string} text */
export function hasViaWord(text) {
  return /(^|[^\p{L}\p{N}])via($|[^\p{L}\p{N}])/iu.test(text ?? '');
}

/** @param {Dest | null | undefined} a @param {Dest | null | undefined} b */
export function sameDest(a, b) {
  if (!a || !b) return !a && !b;
  return a.text === b.text && a.vias.length === b.vias.length && a.vias.every((v, i) => v === b.vias[i]);
}

/** One string per distinct destination (compaction, NeTEx IDs). @param {Dest} d */
export function destKey(d) {
  return `${d.text}\u0001${d.vias.join('\u0002')}`;
}

/** @param {Dest} d @returns {{ text: string, vias: string }} */
export function destLabel(d) {
  return { text: d.text, vias: d.vias.length ? `via ${d.vias.join(', ')}` : '' };
}

/**
 * Every column gets a start (null = none yet) and a change list exactly as long as the stops.
 * @param {{ stops: any[], cols: any[] }} grid
 */
export function normalizeDests(grid) {
  const n = grid.stops.length;
  for (const col of grid.cols) {
    if (col.dest === undefined) col.dest = null;
    const old = Array.isArray(col.dests) ? col.dests : [];
    col.dests = Array.from({ length: n }, (_, i) => old[i] ?? null);
  }
}

/** The rows a trip calls at, exactly as the export writes them. @param {{ stops: any[] }} grid @param {{ cells: any[] }} col */
export function servedRows(grid, col) {
  return journeyStops(grid, col).map((c) => c.ri);
}

/**
 * Where each destination of a column starts and ends, for drawing and checking.
 * @param {{ stops: any[] }} grid @param {any} col
 * @returns {DestSegment[]}
 */
export function destSegments(grid, col) {
  const served = servedRows(grid, col);
  const first = served[0], last = served[served.length - 1];
  /** @type {{ row: number, dest: Dest, start: boolean }[]} */
  const marks = [];
  if (col.dest && served.length) marks.push({ row: first, dest: col.dest, start: true });
  (col.dests ?? []).forEach((/** @type {Dest | null} */ dest, /** @type {number} */ row) => {
    if (dest) marks.push({ row, dest, start: false });
  });
  marks.sort((a, b) => a.row - b.row || (a.start ? -1 : 1));
  const endRow = last ?? grid.stops.length - 1;
  return marks.map((m, i) => {
    const next = marks[i + 1];
    const end = next ? Math.max(m.row, next.row - 1) : Math.max(m.row, endRow);
    /** @type {'ok' | 'unserved' | 'last'} */
    let state = 'ok';
    if (!m.start) {
      if (!served.includes(m.row) || m.row <= first) state = 'unserved';
      else if (m.row === last) state = 'last';
    }
    return { row: m.row, end, dest: m.dest, start: m.start, colour: /** @type {0 | 1 | 2} */ (i % 3), state };
  });
}

/** The destination in effect at a row (the last start or change at or above it). @param {{ stops: any[] }} grid @param {any} col @param {number} row */
export function effectiveDestAt(grid, col, row) {
  /** @type {Dest | null} */
  let out = null;
  for (const s of destSegments(grid, col)) if (s.row <= row && s.state !== 'unserved') out = s.dest;
  return out;
}
