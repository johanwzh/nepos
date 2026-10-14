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
