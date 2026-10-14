// Norwegian public holidays ("røde dager"), calculated — no external source (spec §5).
import { addDays } from './calendars.js';

/** Easter Sunday by the anonymous Gregorian algorithm. @param {number} year @returns {string} */
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

/** @param {number} year @returns {Map<string, string>} YYYYMMDD → name, in date order */
export function norwegianHolidays(year) {
  const e = easterSunday(year);
  /** @type {[string, string][]} */
  const list = [
    [`${year}0101`, '1. nyttårsdag'], [addDays(e, -3), 'Skjærtorsdag'], [addDays(e, -2), 'Langfredag'],
    [e, '1. påskedag'], [addDays(e, 1), '2. påskedag'], [`${year}0501`, 'Offentlig høytidsdag'],
    [addDays(e, 39), 'Kristi himmelfartsdag'], [addDays(e, 49), '1. pinsedag'], [addDays(e, 50), '2. pinsedag'],
    [`${year}0517`, 'Grunnlovsdag'], [`${year}1225`, '1. juledag'], [`${year}1226`, '2. juledag'],
  ];
  list.sort((x, y) => (x[0] < y[0] ? -1 : 1));
  return new Map(list);
}
