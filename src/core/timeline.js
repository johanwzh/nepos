// The validity timeline under the calendar chips (user idea 2026-10-16): 365 days, the first tenth
// in the past, then NOW, then the future. Each day is valid in the table set's calendars or not;
// with a trip column selected, the column's day code shows what it keeps and what it takes away.
// Pure, so it is tested without a page.
import { addDays } from './calendars.js';

export const TIMELINE_DAYS = 365;
const PAST = Math.floor(TIMELINE_DAYS / 10);

/**
 * @typedef {'none' | 'valid' | 'column' | 'removed'} DayState
 *   valid: in the calendars (no column selected); column: the selected column runs;
 *   removed: in the calendars, but the column's day code leaves it out
 */

/**
 * @param {{ periodDays: string[], colDays: string[] | null, today: string }} input YYYYMMDD, sorted
 * @returns {{ days: { date: string, state: DayState }[], nowIndex: number, before: boolean, after: boolean,
 *             months: { index: number, label: string }[] }}
 */
export function timelineModel({ periodDays, colDays, today }) {
  const start = addDays(today, -PAST);
  const end = addDays(start, TIMELINE_DAYS - 1);
  const valid = new Set(periodDays);
  const col = colDays ? new Set(colDays) : null;
  /** @type {{ date: string, state: DayState }[]} */
  const days = [];
  /** @type {{ index: number, label: string }[]} */
  const months = [];
  for (let i = 0, d = start; i < TIMELINE_DAYS; i++, d = addDays(d, 1)) {
    /** @type {DayState} */
    let state = 'none';
    if (valid.has(d)) state = !col ? 'valid' : col.has(d) ? 'column' : 'removed';
    days.push({ date: d, state });
    if (d.endsWith('01')) months.push({ index: i, label: `${d.slice(0, 4)}-${d.slice(4, 6)}` });
  }
  return {
    days,
    nowIndex: PAST,
    before: periodDays.some((d) => d < start),
    after: periodDays.some((d) => d > end),
    months,
  };
}
