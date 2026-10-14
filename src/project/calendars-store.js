// Calendars (timetable structure spec §3): the project's named sets of operating days.
import { readText, writeJson } from './fs.js';
import { CALENDARS_FILE } from './layout.js';
import { normalizeRanges } from '../core/calendars.js';

/** @param {any} c */
const isCalendar = (c) => c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.ranges)
  && c.ranges.every((/** @type {any} */ r) => Array.isArray(r) && r.length === 2 && r.every((x) => typeof x === 'string'));

/** @param {import('./fs.js').ProjectFs} fs @returns {Promise<{ calendars: import('../core/calendars.js').Calendar[], error: null | 'unreadable' }>} */
export async function readCalendars(fs) {
  const text = await readText(fs, CALENDARS_FILE);
  if (text === null) return { calendars: [], error: null };
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) && value.every(isCalendar) ? { calendars: value, error: null } : { calendars: [], error: 'unreadable' };
  } catch {
    return { calendars: [], error: 'unreadable' };
  }
}

/** @param {import('./fs.js').ProjectFs} fs @param {import('../core/calendars.js').Calendar[]} calendars */
export async function writeCalendars(fs, calendars) {
  await writeJson(fs, CALENDARS_FILE, calendars.map((c) => ({ ...c, ranges: normalizeRanges(c.ranges) })));
}

/** @param {string} name @returns {import('../core/calendars.js').Calendar} */
export function newCalendar(name) { return { id: crypto.randomUUID(), name, ranges: [] }; }
