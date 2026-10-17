// Nudging a trip's times (the mini-jog, user test 2026-10-17): the given rows move by whole minutes.
// The day code never changes. A stop that moves past midnight within the trip gets the next day; when
// the trip's first time would fall before 00:00 or at 24:00 or later, the whole column moves a day back
// into range, so it wraps round the clock on the same day code.

/** @param {any} c */
const timed = (c) => !!c?.time && c.time !== '|';
/** @param {any} c */
const abs = (c) => (c.dayOffset || 0) * 1440 + Number(c.time.slice(0, 2)) * 60 + Number(c.time.slice(2, 4));

/**
 * @param {{ cells: any[] }} col
 * @param {number[]} rows
 * @param {number} minutes
 */
export function shiftTimes(col, rows, minutes) {
  /** @type {Map<number, number>} row → new minutes */
  const next = new Map();
  col.cells.forEach((c, r) => { if (timed(c) && rows.includes(r)) next.set(r, abs(c) + minutes); });
  if (!next.size) return;
  // Only the given rows change. The day the trip starts on never changes: when its first time moves
  // past that day's start or end, the moved times wrap round within it
  const firstRow = col.cells.findIndex(timed);
  const day = Math.floor(abs(col.cells[firstRow]) / 1440) * 1440;
  const first = next.get(firstRow);
  const wrap = first === undefined ? 0 : first < day ? 1440 : first >= day + 1440 ? -1440 : 0;
  for (const [r, m] of next) {
    const v = m + wrap;
    const dayOffset = Math.floor(v / 1440);
    const rest = v - dayOffset * 1440;
    // In place: anything holding the cell (an open note box) keeps the right one
    Object.assign(col.cells[r], { time: String(Math.floor(rest / 60)).padStart(2, '0') + String(rest % 60).padStart(2, '0'), dayOffset });
  }
}
