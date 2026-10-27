// The visual timetable, a Marey chart (design 2026-10-27): the open table's rows down the side, time along the top,
// every trip a line through its times. This module is the arithmetic: where the rows go, which trips a period shows,
// each trip's dots, segments and passes, and the runs of trips that share a pattern ("trip tribes").
import { tripDays } from './calendars.js';
import { tripCols } from './blocks.js';

/** @param {{ lat: number, lon: number }} a @param {{ lat: number, lon: number }} b */
const km = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/**
 * Each row's place down the chart, from 0. 'even': one step a row; 'dist': the distance between the rows' stops (one step
 * where a position is missing). A waiting stop's two rows (arrival, then departure of the same stop) sit on one line.
 * @param {{ stopId: any, isDwellArr?: boolean }[]} rows
 * @param {(stopId: string) => ({ lat: number, lon: number } | null | undefined)} posOf
 * @param {'even' | 'dist'} mode
 */
export function rowOffsets(rows, posOf, mode) {
  const out = [0];
  for (let r = 1; r < rows.length; r++) {
    const a = rows[r - 1], b = rows[r];
    const same = a.isDwellArr && a.stopId != null && a.stopId === b.stopId;
    let step = same ? 0 : 1;
    if (!same && mode === 'dist') {
      const pa = a.stopId != null ? posOf(String(a.stopId)) : null, pb = b.stopId != null ? posOf(String(b.stopId)) : null;
      if (pa?.lat != null && pb?.lat != null) step = km(pa, pb);
    }
    out.push(out[r - 1] + step);
  }
  return out;
}

/** @param {string} s YYYYMMDD */
const ymd = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
/** @param {Date} d */
const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
/** Monday = 0 … Sunday = 6. @param {string} s */
export const weekdayOf = (s) => (ymd(s).getUTCDay() + 6) % 7;

/** The days of a period around a date: the day, its Monday–Sunday week, or its month. @param {string} date @param {'day' | 'week' | 'month'} range */
export function periodDays(date, range) {
  if (range === 'day') return [date];
  const d = ymd(date), out = [];
  if (range === 'week') {
    d.setUTCDate(d.getUTCDate() - weekdayOf(date));
    for (let i = 0; i < 7; i++) { out.push(fmt(d)); d.setUTCDate(d.getUTCDate() + 1); }
    return out;
  }
  d.setUTCDate(1);
  const m = d.getUTCMonth();
  while (d.getUTCMonth() === m) { out.push(fmt(d)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

/** Minutes with the day offset; null for no time or a pass. @param {any} c */
const minutes = (c) => (c?.time && c.time !== '|' ? (c.dayOffset || 0) * 1440 + Number(c.time.slice(0, 2)) * 60 + Number(c.time.slice(2, 4)) : null);

/**
 * @typedef {{ n: number, gen: boolean, dayCode: string, days: string[], cells: (number | '|' | null)[],
 *   stops: { r: number, m: number }[], segs: { a: { r: number, m: number }, b: { r: number, m: number }, skip: boolean }[],
 *   passes: { r: number, m: number }[], ix: { r: number, toN: number, toR: number, type: string, maxWait: number | null }[] }} TripLine
 */

/**
 * The trips of a table that run on any of `days` (a block's trips included), as lines: their dots, segments (a segment
 * over rows the trip does not stop at is a skip) and passes (a `|` row, placed where the segment crosses it).
 * @param {{ stops: any[], cols: any[] }} grid the stored table (no virtual columns)
 * @param {string[]} calendarDays the days of the table's calendars
 * @param {string[]} days the days of the period
 * @param {number[]} y the rows' places (rowOffsets)
 * @returns {TripLine[]}
 */
export function tripLines(grid, calendarDays, days, y) {
  const inPeriod = new Set(days);
  /** @type {TripLine[]} */
  const out = [];
  tripCols(grid).forEach((col, n) => {
    const runs = tripDays(calendarDays, col).filter((d) => inPeriod.has(d));
    if (!runs.length) return;
    const cells = (col.cells ?? []).map((/** @type {any} */ c) => (c?.time === '|' ? '|' : minutes(c)));
    const stops = cells.map((m, r) => (typeof m === 'number' ? { r, m } : null)).filter((s) => s !== null);
    if (stops.length < 2) return;
    const segs = [], passes = [];
    for (let k = 1; k < stops.length; k++) {
      const a = stops[k - 1], b = stops[k];
      // A row in between that is not the other row of a waiting stop at either end: the trip does not stop there
      const between = grid.stops.slice(a.r + 1, b.r);
      const ends = new Set([grid.stops[a.r]?.stopId, grid.stops[b.r]?.stopId]);
      segs.push({ a, b, skip: between.some((s) => !(s.stopId != null && ends.has(s.stopId))) });
      for (let r = a.r + 1; r < b.r; r++) {
        if (cells[r] !== '|') continue;
        const span = y[b.r] - y[a.r];
        passes.push({ r, m: span ? a.m + ((b.m - a.m) * (y[r] - y[a.r])) / span : (a.m + b.m) / 2 });
      }
    }
    const ix = (col.cells ?? []).map((/** @type {any} */ c, /** @type {number} */ r) => (c?.interchange && col.parentCi == null
      ? { r, toN: c.interchange.targetC, toR: c.interchange.targetR, type: c.interchange.type, maxWait: c.interchange.maxWait ?? null } : null))
      .filter((/** @type {any} */ x) => x !== null);
    out.push({ n, gen: col.parentCi != null, dayCode: col.dayCode ?? '', days: runs, cells, stops, segs, passes, ix });
  });
  return out;
}

/**
 * Runs of trips, in departure order, with the same pattern: the same times relative to their first departure at every
 * row, stopping and passing at the same rows. Runs of two or more; one colour per pattern, in order of first appearance.
 * @param {TripLine[]} lines @returns {{ members: number[], colour: number }[]}
 */
export function tribes(lines) {
  const first = (/** @type {TripLine} */ l) => l.stops[0].m;
  const key = (/** @type {TripLine} */ l) => l.cells.map((c) => (typeof c === 'number' ? c - first(l) : c === '|' ? '|' : '-')).join(',');
  const order = [...lines].sort((a, b) => first(a) - first(b));
  /** @type {Map<string, number>} */
  const colours = new Map();
  const out = [];
  for (let a = 0; a < order.length;) {
    let b = a;
    while (b + 1 < order.length && key(order[b + 1]) === key(order[a])) b++;
    if (b > a) {
      const k = key(order[a]);
      if (!colours.has(k)) colours.set(k, colours.size);
      out.push({ members: order.slice(a, b + 1).map((l) => l.n), colour: /** @type {number} */ (colours.get(k)) });
    }
    a = b + 1;
  }
  return out;
}
