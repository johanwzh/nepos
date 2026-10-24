// Virtual intervals (power tools spec 2026-10-24): a block is a parent column (a real trip) with
// `block = { every, span }`: an interval that divides 60 and the last departure, in minutes after the parent's first
// departure. Every trip in it is the parent shifted by n × every, up to and including span. Only the parent is stored;
// the grid shows band columns (minutes past the hour) and an end column (the last trip), and the export writes every
// trip. Everything is inherited from the parent; generated trips have no trip number (deprioritised, user).
import { uuid5 } from './uuid5.js';

export const INTERVALS = [60, 30, 20, 15, 12, 10, 6, 5, 4, 3, 2, 1];
/** The intervals a drag reaches: 1–6 band columns. */
export const DRAG_INTERVALS = [60, 30, 20, 15, 12, 10];
/** Default and minimum: parent + 2 h (a shorter block says nothing a few real columns would not). */
export const MIN_SPAN = 120;
export const MAX_SPAN = 1439;

/** @param {any} c */
const timed = (c) => !!c?.time && c.time !== '|';
/** @param {any} c */
const abs = (c) => (c.dayOffset || 0) * 1440 + Number(c.time.slice(0, 2)) * 60 + Number(c.time.slice(2, 4));
/** @param {number} m */
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;

/** Minutes (with day offset) of the earliest time in the column, or null. @param {{ cells: any[] }} col */
export function firstDeparture(col) {
  let best = null;
  for (const c of col.cells ?? []) if (timed(c)) { const m = abs(c); if (best === null || m < best) best = m; }
  return best;
}

/** Whether a block is one Nepos can hold. @param {any} block */
export const validBlock = (block) => !!block && INTERVALS.includes(block.every) && Number.isInteger(block.span)
  && block.span >= MIN_SPAN && block.span <= MAX_SPAN && block.span % block.every === 0;

/**
 * A copy of the column with every time moved by `offset` minutes (day offsets follow); no block, no trip number.
 * @param {any} col @param {number} offset
 */
function shifted(col, offset) {
  const copy = JSON.parse(JSON.stringify(col));
  delete copy.block;
  delete copy.tripNo;
  copy.cells = (copy.cells ?? []).map((/** @type {any} */ c) => {
    if (!timed(c)) return c;
    const v = abs(c) + offset;
    const d = Math.floor(v / 1440);
    return { ...c, time: hhmm(v - d * 1440), dayOffset: d, interchange: null };
  });
  return copy;
}

/** A generated trip's uid: stable per parent and offset, a real UUID (NeTEx ids). @param {any} col @param {number} offset */
const tripUid = (col, offset) => uuid5(`${col.uid}|+${offset}`);

/** The generated trips (not the parent), the end last. @param {any} col @returns {any[]} */
export function blockTrips(col) {
  if (!validBlock(col.block)) return [];
  const out = [];
  for (let off = col.block.every; off <= col.block.span; off += col.block.every) out.push({ ...shifted(col, off), uid: tripUid(col, off) });
  return out;
}

/**
 * The band columns: one per departure in the hour (the trip `every`, 2·every … 60 minutes on), showing the minutes
 * past the hour; under 10 minutes one collapsed column. @param {any} col @returns {any[]}
 */
export function bandColumns(col) {
  if (!validBlock(col.block)) return [];
  const { every } = col.block;
  const first = firstDeparture(col) ?? 0;
  if (every < 10) return [{ ...shifted(col, every), uid: uuid5(`${col.uid}|band`), virt: 'band', of: col.uid, every }];
  const out = [];
  for (let off = every; off <= 60; off += every) out.push({ ...shifted(col, off), uid: uuid5(`${col.uid}|band|${off}`), virt: 'band', of: col.uid, minute: (first + off) % 60 });
  return out;
}

/** The end column: the last trip, shown in full. @param {any} col */
export function endColumn(col) {
  return { ...shifted(col, col.block.span), uid: tripUid(col, col.block.span), virt: 'end', of: col.uid };
}

/**
 * Remap every interchange target through `map` (old index → new index; undefined drops the interchange).
 * @param {any[]} cols @param {(i: number) => number | undefined} map
 */
function remapTargets(cols, map) {
  for (const col of cols) for (const cell of col.cells ?? []) {
    if (!cell?.interchange) continue;
    const to = map(cell.interchange.targetC);
    if (to === undefined) cell.interchange = null; else cell.interchange.targetC = to;
  }
}

/** The grid's working copy: each block's band and end columns right after its parent. @param {any[]} cols */
export function withBlocks(cols) {
  /** @type {any[]} */
  const out = [];
  /** @type {number[]} */
  const at = [];
  for (const col of cols) {
    at.push(out.length);
    out.push(col);
    if (validBlock(col.block)) out.push(...bandColumns(col), endColumn(col));
  }
  remapTargets(out.filter((c) => !c.virt), (i) => at[i]);
  return out;
}

/** The stored columns: the virtual ones taken away. @param {any[]} cols */
export function withoutBlocks(cols) {
  /** @type {(number | undefined)[]} */
  const to = [];
  let n = 0;
  for (const col of cols) to.push(col.virt ? undefined : n++);
  const out = cols.filter((c) => !c.virt);
  remapTargets(out, (i) => to[i]);
  return out;
}

/** Clamp to the limits and round up to the band (down when that passes the maximum). @param {number} every @param {number} span */
export function snapSpan(every, span) {
  const s = Math.min(MAX_SPAN, Math.max(MIN_SPAN, span));
  const up = Math.ceil(s / every) * every;
  return up <= MAX_SPAN ? up : Math.floor(MAX_SPAN / every) * every;
}

/** Interchanges stay out of blocks this round: not from the column, not to it. @param {any[]} cols @param {number} ci */
export function canBeBlock(cols, ci) {
  if ((cols[ci]?.cells ?? []).some((/** @type {any} */ c) => c?.interchange)) return false;
  return !cols.some((col) => (col.cells ?? []).some((/** @type {any} */ c) => c?.interchange?.targetC === ci));
}

/**
 * What a drag of `steps` column widths means: 1 the dialog, 2–7 a band of 1–6 columns, more asks how often.
 * @param {number} steps
 * @returns {{ kind: 'none' } | { kind: 'dialog' } | { kind: 'band', every: number } | { kind: 'ask' }}
 */
export function dragResult(steps) {
  if (steps <= 0) return { kind: 'none' };
  if (steps === 1) return { kind: 'dialog' };
  if (steps - 2 < DRAG_INTERVALS.length) return { kind: 'band', every: DRAG_INTERVALS[steps - 2] };
  return { kind: 'ask' };
}

/**
 * Every trip of a table in order: the real columns, then each block's generated trips (with `parentCi`, the parent's
 * index). Appended after the real columns, so stored interchange indices stay valid. @param {{ cols: any[] }} grid
 */
export function tripCols(grid) {
  const real = grid.cols.filter((c) => !c.virt);
  /** @type {any[]} */
  const gen = [];
  real.forEach((col, ci) => { for (const trip of blockTrips(col)) gen.push({ ...trip, parentCi: ci }); });
  return gen.length ? [...real, ...gen] : real;
}

/** The route with every table's blocks expanded (tripCols); the route itself is not changed. @param {any} rs */
export function expandRoute(rs) {
  if (!rs?.grids) return rs;
  let any = false;
  /** @type {Record<string, any>} */
  const grids = {};
  for (const [k, g] of Object.entries(rs.grids)) {
    const cols = tripCols(/** @type {any} */ (g));
    if (cols.length !== /** @type {any} */ (g).cols.length) any = true;
    grids[k] = { .../** @type {any} */ (g), cols };
  }
  return any ? { ...rs, grids } : rs;
}
