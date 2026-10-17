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
  col.cells.forEach((c, r) => { if (timed(c)) next.set(r, abs(c) + (rows.includes(r) ? minutes : 0)); });
  const first = [...next.values()][0];
  if (first === undefined) return;
  // The day the trip starts on (its first time's day offset) never changes: the times wrap within it
  const firstCell = col.cells.find(timed);
  const day = Math.floor(abs(firstCell) / 1440) * 1440;
  const wrap = first < day ? 1440 : first >= day + 1440 ? -1440 : 0;
  for (const [r, m] of next) {
    const v = m + wrap;
    const dayOffset = Math.floor(v / 1440);
    const rest = v - dayOffset * 1440;
    col.cells[r] = { ...col.cells[r], time: String(Math.floor(rest / 60)).padStart(2, '0') + String(rest % 60).padStart(2, '0'), dayOffset };
  }
}
