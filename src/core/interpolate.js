// Filling empty time cells from stop positions, ported from Nepos 1.5.7 (nepos.html lines
// 5080–5211). Distances are straight lines between stops (spec §7.3; no routing in 2.0). Pure:
// positions come in through posOf.
import { haversineM } from './netex/geo.js';
import { ERN_MODES } from './ern/modes.js';

/** @typedef {{ time: string, dayOffset: number, suffix: string, interchange: any, footnoteId: number | null }} Cell */
/** @typedef {(stop: any) => [number, number] | null} PosOf  [lon, lat] or null when unknown */

/** @param {any} cell @returns {number | null} */
export function cellToMins(cell) {
  if (!cell?.time || cell.time === '|') return null;
  return (cell.dayOffset || 0) * 1440 + parseInt(cell.time.slice(0, 2), 10) * 60 + parseInt(cell.time.slice(2, 4), 10);
}

/** @param {number} totalMins @returns {Cell} */
export function minsToCell(totalMins) {
  const dayOffset = Math.floor(totalMins / 1440);
  const rem = Math.round(totalMins - dayOffset * 1440);
  return {
    time: String(Math.floor(rem / 60)).padStart(2, '0') + String(rem % 60).padStart(2, '0'),
    dayOffset, suffix: '', interchange: null, footnoteId: null,
  };
}

/** Straight-line metres between two stops; 0 for the same stop (a dwell pair), null when unknown. */
function segment(/** @type {any} */ a, /** @type {any} */ b, /** @type {PosOf} */ posOf) {
  if (a.stopId != null && a.stopId === b.stopId) return 0;
  const pa = posOf(a), pb = posOf(b);
  if (!pa || !pb) return null;
  return haversineM(pa, pb);
}

/**
 * The nearest row above (-1) or below (+1) with a real time, skipping dwell arrival rows — except
 * the arrival row right above a dwell departure: the departure can never be earlier than that.
 */
function anchor(/** @type {any} */ grid, /** @type {number} */ ci, /** @type {number} */ ri, /** @type {1 | -1} */ step) {
  for (let r = ri + step; r >= 0 && r < grid.stops.length; r += step) {
    if (grid.stops[r].isDwellArr && !(step === -1 && r === ri - 1)) continue;
    if (cellToMins(grid.cols[ci].cells[r]) !== null) return r;
  }
  return -1;
}

/**
 * A time for (ri, ci) between the nearest known times above and below, in proportion to distance.
 * @param {{ stops: any[], cols: { cells: any[] }[] }} grid
 * @param {number} ci
 * @param {number} ri
 * @param {PosOf} posOf
 * @returns {Cell | null}
 */
export function interpolateTime(grid, ci, ri, posOf) {
  const ra = anchor(grid, ci, ri, -1), rb = anchor(grid, ci, ri, 1);
  if (ra === -1 || rb === -1) return null;
  const col = grid.cols[ci];
  const tA = /** @type {number} */ (cellToMins(col.cells[ra]));
  let tB = /** @type {number} */ (cellToMins(col.cells[rb]));
  // Earlier below than above: a midnight crossing without a day offset — but only when the
  // crossing is plausible; a big step backwards is a typing error, and no time is guessed.
  if (tB < tA) tB += 1440;
  if (tB - tA > 720) return null;
  const span = [];
  for (let r = ra; r <= rb; r++) if (!grid.stops[r].isDwellArr || r === ra) span.push(r);
  const idx = span.indexOf(ri);
  if (idx < 0 || span.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < span.length; i++) {
    const d = segment(grid.stops[span[i - 1]], grid.stops[span[i]], posOf);
    if (d === null) return null;
    cum.push(cum[i - 1] + d);
  }
  const total = cum[cum.length - 1];
  if (total === 0) return null;
  return minsToCell(Math.round(tA + (cum[idx] / total) * (tB - tA)));
}

/**
 * A time for (ri, ci) from one known time and a speed: forwards from the time above, or
 * backwards from the time below.
 * @param {{ stops: any[], cols: { cells: any[] }[] }} grid
 * @param {number} ci
 * @param {number} ri
 * @param {'fwd' | 'bwd'} direction
 * @param {number} kmh
 * @param {PosOf} posOf
 * @returns {Cell | null}
 */
export function extrapolateTime(grid, ci, ri, direction, kmh, posOf) {
  if (!(kmh > 0)) return null;
  const col = grid.cols[ci];
  const r = anchor(grid, ci, ri, direction === 'fwd' ? -1 : 1);
  if (r === -1) return null;
  const dist = direction === 'fwd' ? segment(grid.stops[r], grid.stops[ri], posOf) : segment(grid.stops[ri], grid.stops[r], posOf);
  if (!dist) return null;
  const mins = (dist / 1000 / kmh) * 60;
  const t = /** @type {number} */ (cellToMins(col.cells[r]));
  let result = direction === 'fwd' ? t + mins : t - mins;
  if (result < 0) return null; // before midnight of the first day: no time to give
  return minsToCell(Math.round(result));
}

/** Boats are timed in knots, everything else in km/h. @param {number} ernMode */
export function speedUnit(ernMode) {
  return /** @type {any} */ (ERN_MODES)[ernMode]?.mode === 'water' ? 'knots' : 'kmh';
}

/** @param {number} value @param {'knots' | 'kmh'} unit */
export function toKmh(value, unit) {
  return unit === 'knots' ? value * 1.852 : value;
}
