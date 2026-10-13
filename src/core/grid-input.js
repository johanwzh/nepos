// What the user types into a time cell, ported from Nepos 1.5.7 (nepos.html gParse, lines 4011–4024).

/**
 * @param {string} raw
 * @returns {{ time: string, dayOffset: 0, suffix: '' | 'a' | 'p' | 'x' } | null} null when not a valid time
 */
export function parseCellInput(raw) {
  raw = raw.trim();
  if (raw === '|') return { time: '|', dayOffset: 0, suffix: '' };
  /** @type {'' | 'a' | 'p' | 'x'} */
  let suffix = '';
  if (/[apx]$/i.test(raw)) { suffix = /** @type {'a' | 'p' | 'x'} */ (raw.slice(-1).toLowerCase()); raw = raw.slice(0, -1); }
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
