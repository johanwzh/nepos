// Footnote and date-exception helpers, ported from Nepos 1.5.7 (nepos.html lines 2646–2654,
// 4680–4714, 4720–4788) with the language passed in instead of read from a global.

/** @param {string} s YYYYMMDD */
export function yyyymmddToInput(s) {
  if (!s || s.length !== 8) return '';
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** @param {string} s YYYY-MM-DD */
export function inputToYyyymmdd(s) {
  return s ? s.replace(/-/g, '') : '';
}

/** @param {string} s YYYYMMDD → d/m/yy */
export function yyyymmddToDisplay(s) {
  if (!s || s.length !== 8) return s || '?';
  return `${parseInt(s.slice(6, 8))}/${parseInt(s.slice(4, 6))}/${s.slice(2, 4)}`;
}

/**
 * Day code → active weekdays (1 = Monday … 7 = Sunday).
 * @param {string} code
 */
export function dayCodeToWeekdayNums(code) {
  if (!code || code === 'D') return [1, 2, 3, 4, 5, 6, 7];
  if (code.startsWith('DX')) {
    const excluded = new Set(code.slice(2).split('').map(Number));
    return [1, 2, 3, 4, 5, 6, 7].filter((d) => !excluded.has(d));
  }
  if (/^[1-7]+$/.test(code)) return [...new Set(code.split('').map(Number))].sort();
  return [1, 2, 3, 4, 5, 6, 7];
}

/**
 * Every N weeks on a weekday, from the first such weekday on/after `fromIso` to `untilIso`.
 * @param {string} fromIso YYYY-MM-DD
 * @param {string} untilIso YYYY-MM-DD
 * @param {number} everyNWeeks
 * @param {number} weekday 1 = Monday … 7 = Sunday
 * @returns {string[]} YYYYMMDD dates
 */
export function generateRecurring(fromIso, untilIso, everyNWeeks, weekday) {
  if (!fromIso || !untilIso || !everyNWeeks || !weekday) return [];
  const jsDay = weekday === 7 ? 0 : weekday;
  const start = new Date(fromIso + 'T00:00:00');
  const end = new Date(untilIso + 'T00:00:00');
  if (isNaN(+start) || isNaN(+end) || end < start) return [];
  const cur = new Date(start);
  while (cur.getDay() !== jsDay) cur.setDate(cur.getDate() + 1);
  const dates = [];
  while (cur <= end) {
    dates.push(`${cur.getFullYear()}${String(cur.getMonth() + 1).padStart(2, '0')}${String(cur.getDate()).padStart(2, '0')}`);
    cur.setDate(cur.getDate() + 7 * everyNWeeks);
  }
  return dates;
}

/**
 * The footnote as the sentence shown under the grid.
 * @param {{ text?: string, exceptions?: { runsOnly: boolean, from: string, to: string }[] } | null} fn
 * @param {'no' | 'en'} lang
 */
export function fnToText(fn, lang) {
  if (!fn) return '';
  const parts = [];
  if (fn.text) parts.push(fn.text);
  for (const ex of fn.exceptions ?? []) {
    const from = ex.from || '', to = ex.to || '';
    if (!from && !to) continue;
    const prefix = ex.runsOnly ? (lang === 'no' ? 'Kjører kun' : 'Only') : (lang === 'no' ? 'Ikke' : 'Not');
    let dateStr;
    if (from && to && from !== to) {
      const fd = parseInt(from.slice(6, 8)), fm = parseInt(from.slice(4, 6)), fy = from.slice(2, 4);
      const td = parseInt(to.slice(6, 8)), tm = parseInt(to.slice(4, 6)), ty = to.slice(2, 4);
      dateStr = fy === ty ? `${fd}/${fm}-${td}/${tm} ${fy}` : `${fd}/${fm} ${fy}-${td}/${tm} ${ty}`;
    } else {
      dateStr = yyyymmddToDisplay(from || to);
    }
    parts.push(`${prefix} ${dateStr}`);
  }
  return parts.map((p) => (p.endsWith('.') ? p : p + '.')).join(' ');
}

/**
 * Short form for tooltips and the definition list.
 * @param {{ text?: string, exceptions?: { runsOnly: boolean, from: string, to: string }[] } | null} fn
 * @param {'no' | 'en'} lang
 */
export function fnSummary(fn, lang) {
  if (!fn) return '';
  const parts = [];
  if (fn.text) parts.push(fn.text);
  for (const ex of fn.exceptions ?? []) {
    parts.push(`${ex.runsOnly ? (lang === 'no' ? 'Kun' : 'Only') : (lang === 'no' ? 'Ikke' : 'Not')} ${ex.from || '?'} → ${ex.to || '?'}`);
  }
  return parts.join(' · ');
}
