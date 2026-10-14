// Value rules for ERN fields. The day-code and time rules match what the Nepos 1.5.7 grid
// accepted (nepos.html gValDC lines 4005–4010 and gParse lines 4011–4024).

import { isAllowedDayCode } from '../day-codes.js';

/** @param {string} code */
export function isValidDayCode(code) {
  // Empty is allowed in a file (a column not yet filled in); otherwise the forms Nepos can turn
  // into operating days, including the holiday (H) forms (timetable structure spec §5).
  return code === '' || isAllowedDayCode(code);
}

/** @param {string} t HHMM or '|' */
export function isValidCellTime(t) {
  if (t === '|') return true;
  if (!/^\d{4}$/.test(t)) return false;
  return Number(t.slice(0, 2)) <= 29 && Number(t.slice(2, 4)) <= 59;
}

/** @param {string} d YYYYMMDD, or '' / '0' for "no date" */
export function isValidDate(d) {
  if (d === '' || d === '0') return true;
  if (!/^\d{8}$/.test(d)) return false;
  const y = Number(d.slice(0, 4)), m = Number(d.slice(4, 6)), day = Number(d.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, day));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === day;
}
