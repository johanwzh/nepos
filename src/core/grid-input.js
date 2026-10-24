// What the user types into a time cell, ported from Nepos 1.5.7 (nepos.html gParse, lines 4011–4024).

/**
 * @param {string} raw
 * @returns {{ time: string, dayOffset: 0, suffix: '' | 'a' | 'p' } | null} null when not a valid time
 *   An x is never typed (booking spec 2026-10-22: request stops come from a menu): a trailing x is ignored.
 *   a and p together is refused (that is a passing stop, |).
 */
export function parseCellInput(raw) {
  raw = raw.trim();
  if (raw === '|') return { time: '|', dayOffset: 0, suffix: '' };
  const marks = (/[apx]*$/i.exec(raw)?.[0] ?? '').toLowerCase();
  raw = raw.slice(0, raw.length - marks.length);
  if (marks.includes('a') && marks.includes('p')) return null;
  /** @type {'' | 'a' | 'p'} */
  const suffix = marks.includes('a') ? 'a' : marks.includes('p') ? 'p' : '';
  const cm = raw.match(/^(\d{1,2}):(\d{2})(?::\d+)?$/);
  if (cm) {
    const h = parseInt(cm[1], 10), m = parseInt(cm[2], 10);
    if (h <= 29 && m <= 59) return { time: String(h).padStart(2, '0') + String(m).padStart(2, '0'), dayOffset: 0, suffix };
    return null;
  }
  const d = raw.replace(/\D/g, '');
  const s = d.length === 3 ? '0' + d : d.length === 4 ? d : null;
  if (!s || d.length !== raw.length) return null;
  const h = parseInt(s.slice(0, 2), 10), m = parseInt(s.slice(2, 4), 10);
  if (h > 29 || m > 59) return null;
  return { time: s, dayOffset: 0, suffix };
}

/**
 * A cell from before 2.4, where x was a suffix like a and p, becomes a request stop beside its boarding rule.
 * @template T @param {T} cell @returns {T}
 */
export function normalizeCell(cell) {
  const c = /** @type {any} */ (cell);
  if (c && c.suffix === 'x') { c.suffix = ''; c.req = true; }
  return cell;
}
