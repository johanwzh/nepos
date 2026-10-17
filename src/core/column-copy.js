// Copying a column at an interval (user test 2026-10-17, from Reggi): start + k × interval while the
// copy's start is at or before the last start time (on the clock: an earlier clock time means the next
// day), and less than 24 hours after the original's start. A copy that starts on a later day runs a
// day later: its day code moves on (shiftDayCode) and its times are written on its own day. Copies get
// new IDs; marks and notes come along, interchanges do not.
import { shiftDayCode } from './day-codes.js';
import { addDays } from './calendars.js';

/** A trip's own dates, a number of days later. @param {any[] | undefined} dates @param {number} n */
const moveDates = (dates, n) => (n && dates?.length ? dates.map((d) => ({ ...d, from: d.from ? addDays(d.from, n) : d.from, to: d.to ? addDays(d.to, n) : d.to })) : dates);

/** @param {any} c */
const abs = (c) => (c.dayOffset || 0) * 1440 + Number(c.time.slice(0, 2)) * 60 + Number(c.time.slice(2, 4));
/** @param {any} c */
const timed = (c) => !!c?.time && c.time !== '|';

/**
 * @param {any} col the column to copy
 * @param {number} interval minutes, > 0
 * @param {number} lastStart the last start time, minutes after midnight (0 … 1439)
 * @returns {any[]} the new columns, in order
 */
export function copiesAtInterval(col, interval, lastStart) {
  const first = col.cells.find(timed);
  if (!first || !(interval > 0)) return [];
  const start = abs(first);
  const startDay = Math.floor(start / 1440);
  const span = (((lastStart - (start % 1440)) % 1440) + 1440) % 1440; // minutes from the start to the last start
  const out = [];
  for (let k = 1; k * interval <= span && k * interval < 1440; k++) {
    const shift = k * interval;
    const copyDay = Math.floor((start + shift) / 1440);
    const base = (copyDay - startDay) * 1440; // the days the copy moved on: its times are written on its own day
    out.push({
      ...col,
      uid: crypto.randomUUID(),
      dayCode: shiftDayCode(col.dayCode, copyDay - startDay),
      tripNo: '', // a trip number belongs to one trip
      dest: col.dest ? structuredClone(col.dest) : null, // its own destinations, not shared with the original
      dests: col.dests ? structuredClone(col.dests) : undefined,
      dates: moveDates(col.dates, copyDay - startDay), // its own dates move with it
      cells: col.cells.map((/** @type {any} */ c) => {
        if (!c) return null;
        if (!timed(c)) return { ...c, interchange: null, dates: moveDates(c.dates, copyDay - startDay) };
        const rel = abs(c) + shift - base;
        const dayOffset = Math.floor(rel / 1440);
        const m = rel - dayOffset * 1440;
        return { ...c, time: String(Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0'), dayOffset, interchange: null, dates: moveDates(c.dates, copyDay - startDay) };
      }),
    });
  }
  return out;
}
