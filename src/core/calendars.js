// Calendars (timetable structure spec §3): named sets of operating days, stored as inclusive
// date ranges [from, to] (YYYYMMDD). Pure.

import { parseDayCode } from './day-codes.js';
import { norwegianHolidays } from './holidays.js';

/** @typedef {{ id: string, name: string, ranges: [string, string][] }} Calendar */

const DATE = /^\d{8}$/;
/** @param {string} d */
const toDate = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)));
/** @param {Date} x */
const fromDate = (x) => `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`;
/** @param {string} d */
const isRealDate = (d) => DATE.test(d) && fromDate(toDate(d)) === d;

/** @param {string} d @param {number} n */
export function addDays(d, n) { const x = toDate(d); x.setUTCDate(x.getUTCDate() + n); return fromDate(x); }
/** Monday = 1 … Sunday = 7. @param {string} d */
export function weekdayOf(d) { return toDate(d).getUTCDay() || 7; }
/** @param {string} d */
export function isoDate(d) { return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`; }

/**
 * @param {[string, string][]} ranges
 * @returns {[string, string][]}
 */
export function normalizeRanges(ranges) {
  const valid = ranges.filter(([a, b]) => isRealDate(a) && isRealDate(b) && a <= b).map(([a, b]) => /** @type {[string, string]} */ ([a, b]));
  valid.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  /** @type {[string, string][]} */
  const out = [];
  for (const r of valid) {
    const last = out[out.length - 1];
    if (last && r[0] <= addDays(last[1], 1)) { if (r[1] > last[1]) last[1] = r[1]; }
    else out.push([r[0], r[1]]);
  }
  return out;
}

/** @param {Calendar} cal */
export function calendarDays(cal) {
  /** @type {string[]} */
  const days = [];
  for (const [a, b] of normalizeRanges(cal.ranges)) for (let d = a; d <= b; d = addDays(d, 1)) days.push(d);
  return days;
}

/** @param {Calendar[]} cals */
export function unionDays(cals) {
  return [...new Set(cals.flatMap(calendarDays))].sort();
}


/**
 * A column's operating days: the period's days filtered by the day code (spec §5).
 * @param {string[]} periodDays sorted YYYYMMDD
 * @param {string} dayCode
 */
export function columnDays(periodDays, dayCode) {
  const code = parseDayCode(dayCode);
  if (!code) return [];
  /** @type {Map<number, Map<string, string>>} */
  const byYear = new Map();
  const isHoliday = (/** @type {string} */ d) => {
    const y = +d.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, norwegianHolidays(y));
    return /** @type {Map<string, string>} */ (byYear.get(y)).has(d);
  };
  return periodDays.filter((d) => {
    if (code.holidays === 'only') return isHoliday(d);
    if (code.holidays === 'exclude' && isHoliday(d)) return false;
    return code.weekdays.includes(weekdayOf(d));
  });
}
/** ISO 8601 week number. @param {string} d */
export function isoWeek(d) {
  const x = toDate(d);
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** @param {string[]} days @returns {[string, string][]} */
export function daysToRanges(days) {
  return normalizeRanges([...new Set(days)].map((d) => /** @type {[string, string]} */ ([d, d])));
}

/** @param {Calendar} cal @param {string[]} days @param {boolean} on @returns {Calendar} */
export function setDays(cal, days, on) {
  const current = new Set(calendarDays(cal));
  for (const d of days) { if (on) current.add(d); else current.delete(d); }
  return { ...cal, ranges: daysToRanges([...current]) };
}

/** @param {[string, string][]} ranges @param {number} days */
export function shiftRanges(ranges, days) {
  return normalizeRanges(ranges.map(([a, b]) => /** @type {[string, string]} */ ([addDays(a, days), addDays(b, days)])));
}

/**
 * A trip's operating days (spreadsheet tools spec, 2026-10-17): its period's days filtered by its day
 * code, plus the days its own dates add (whatever the day code says), minus the days they remove
 * (removing always wins).
 * @param {string[]} periodDays sorted YYYYMMDD
 * @param {{ dayCode: string, dates?: { from: string, to: string, on: boolean }[] }} col
 */
export function tripDays(periodDays, col) {
  const days = new Set(columnDays(periodDays, col.dayCode));
  const dates = col.dates ?? [];
  /** @param {{ from: string, to: string }} r */
  const each = (r) => { const out = []; const to = r.to || r.from; for (let d = r.from || to; d && d <= to; d = addDays(d, 1)) out.push(d); return out; };
  for (const r of dates) if (r.on) for (const d of each(r)) days.add(d);
  for (const r of dates) if (!r.on) for (const d of each(r)) days.delete(d);
  return [...days].sort();
}
