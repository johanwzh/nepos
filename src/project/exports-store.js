// When each line was last exported (user 2026-10-21, for Oversikt): data/exports.json, written after every finished
// export. A line's record holds the time and a fingerprint of its ERN as exported, so Nepos can tell later whether it
// changed since. Older projects have no records until their next export; a broken file reads as none.
import { readText, writeJson } from './fs.js';
import { EXPORTS_FILE } from './layout.js';
import { textHash } from '../core/hash.js';

/** @typedef {Record<string, { at: string, hash: string }>} ExportRecords line code → the last export */

/** @param {any} r */
const isRecord = (r) => r && typeof r.at === 'string' && typeof r.hash === 'string';

/** @param {import('./fs.js').ProjectFs} fs @returns {Promise<ExportRecords>} */
export async function readExports(fs) {
  const text = await readText(fs, EXPORTS_FILE);
  if (text === null) return {};
  try {
    const lines = JSON.parse(text)?.lines;
    if (!lines || typeof lines !== 'object') return {};
    return Object.fromEntries(Object.entries(lines).filter(([, r]) => isRecord(r)));
  } catch {
    return {};
  }
}

/** @param {import('./fs.js').ProjectFs} fs @param {ExportRecords} records */
export async function writeExports(fs, records) {
  await writeJson(fs, EXPORTS_FILE, { version: 1, lines: records });
}

/**
 * The records after an export of these lines (their ERN text as exported); other lines keep theirs.
 * @param {ExportRecords} records @param {{ code: string, text: string }[]} lines @param {Date} now
 * @returns {ExportRecords}
 */
export function recordExports(records, lines, now) {
  const out = { ...records };
  for (const { code, text } of lines) out[code] = { at: now.toISOString(), hash: textHash(text) };
  return out;
}
