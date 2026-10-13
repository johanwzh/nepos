// Route files are data/routes/<code>.txt. The code appears in the route list, in the export
// file names (ABC-Line-<code>.xml) and in NeTEx IDs (ABC:Line:<code>), so it is limited to
// characters that are safe in all three. Nepos only ever writes this exact form.

export const ROUTE_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

/** @type {Record<string, string>} */
const NORWEGIAN = { Æ: 'AE', Ø: 'O', Å: 'AA', æ: 'ae', ø: 'o', å: 'aa' };

/** @param {string} base */
function suggestCode(base) {
  const code = base
    .trim()
    .replace(/[ÆØÅæøå]/g, (c) => NORWEGIAN[c])
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '');
  return /[A-Za-z0-9]/.test(code) ? code : null;
}

/**
 * Check a file name found in data/routes/.
 * @param {string} fileName
 * @returns {{ ok: true, code: string } | { ok: false, problem: 'extension-case' | 'invalid-code', suggestion: string | null } | null}
 *   null when the file is not a .txt file at all (not a route)
 */
export function checkRouteFileName(fileName) {
  const m = /^(.*)\.(txt)$/i.exec(fileName);
  if (!m) return null;
  const [, base, ext] = m;
  if (ROUTE_CODE_PATTERN.test(base)) {
    return ext === 'txt' ? { ok: true, code: base } : { ok: false, problem: 'extension-case', suggestion: `${base}.txt` };
  }
  const code = suggestCode(base);
  return { ok: false, problem: 'invalid-code', suggestion: code ? `${code}.txt` : null };
}
