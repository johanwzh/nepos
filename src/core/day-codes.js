// Day codes (ERN #TUR field 1) as weekday filters, with Norwegian holidays (spec §5).

const ALL = [1, 2, 3, 4, 5, 6, 7];
/** @param {string} digits */
const distinct = (digits) => new Set(digits).size === digits.length;

/**
 * @param {string} code
 * @returns {{ weekdays: number[], holidays: 'normal' | 'exclude' | 'only' } | null} null = not allowed
 */
export function parseDayCode(code) {
  if (code === 'D') return { weekdays: ALL, holidays: 'normal' };
  if (code === 'H') return { weekdays: [], holidays: 'only' };
  let m = /^DX([1-7]{0,3})(H?)$/.exec(code);
  if (m && (m[1] || m[2]) && distinct(m[1])) {
    return { weekdays: ALL.filter((d) => !m?.[1].includes(String(d))), holidays: m[2] ? 'exclude' : 'normal' };
  }
  m = /^([1-7]{1,4})$/.exec(code);
  if (m && distinct(m[1])) return { weekdays: ALL.filter((d) => m?.[1].includes(String(d))), holidays: 'normal' };
  return null;
}

/** @param {string} code */
export function isAllowedDayCode(code) { return parseDayCode(code) !== null; }

/**
 * The shortest allowed day code for a set of weekdays (1 = Monday … 7 = Sunday) and whether the trip
 * runs on public holidays, or null when the day codes cannot express it (the day-code helper).
 * @param {Set<number>} weekdays
 * @param {boolean} holidays
 * @returns {string | null}
 */
export function dayCodeFor(weekdays, holidays) {
  const on = ALL.filter((d) => weekdays.has(d));
  const off = ALL.filter((d) => !weekdays.has(d));
  if (!on.length) return holidays ? 'H' : null;
  if (holidays) {
    if (!off.length) return 'D';
    if (on.length <= 4) return on.join('');
    return `DX${off.join('')}`;
  }
  // Not on holidays: only the DX…H forms say that
  return off.length <= 3 ? `DX${off.join('')}H` : null;
}

/**
 * A day code as the helper's choices: the weekdays it runs on and whether it runs on holidays.
 * @param {string} code
 */
export function dayCodePick(code) {
  const p = parseDayCode(code);
  if (!p) return { days: [], holidays: true };
  return { days: p.weekdays, holidays: p.holidays !== 'exclude' };
}

/**
 * The day code of a trip that runs `days` days later (a copy that starts after midnight): weekday
 * digits move on (7 → 1), in DX… too; D, H and the H of DX…H stay.
 * @param {string} code
 * @param {number} days
 */
export function shiftDayCode(code, days) {
  const n = ((days % 7) + 7) % 7;
  if (!n) return code;
  const move = (/** @type {string} */ digits) => [...digits].map((d) => ((Number(d) - 1 + n) % 7) + 1).sort((a, b) => a - b).join('');
  let m = /^DX([1-7]*)(H?)$/.exec(code);
  if (m) return `DX${move(m[1])}${m[2]}`;
  m = /^([1-7]+)$/.exec(code);
  return m ? move(m[1]) : code;
}
