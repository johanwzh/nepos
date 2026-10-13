/**
 * Normalise a codespace typed by the user. Entur codespaces are exactly three letters.
 * @param {string} input
 * @returns {{ ok: true, value: string } | { ok: false, error: 'required' | 'format' }}
 */
export function normalizeCodespace(input) {
  const value = String(input ?? '').trim().toUpperCase();
  if (!value) return { ok: false, error: 'required' };
  if (!/^[A-Z]{3}$/.test(value)) return { ok: false, error: 'format' };
  return { ok: true, value };
}
