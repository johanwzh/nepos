import { ROUTES_DIR, BACKUPS_DIR, backupStamp, uniqueBackupPath } from './layout.js';
import { encodeWin1252, decodeWin1252 } from '../core/ern/win1252.js';

const isNumber = (/** @type {string} */ s) => /^\d+$/.test(s);

/**
 * Route codes in the project, from data/routes/*.txt. Numeric codes come first in numeric order.
 * @param {import('./fs.js').ProjectFs} fs
 * @returns {Promise<string[]>}
 */
export async function listRoutes(fs) {
  return (await fs.list(ROUTES_DIR))
    // Only the exact '.txt' Nepos writes: a '12.TXT' would be read and saved under different names.
    .filter((e) => e.kind === 'file' && e.name.endsWith('.txt'))
    .map((e) => e.name.slice(0, -4))
    .sort((a, b) => {
      if (isNumber(a) && isNumber(b)) return Number(a) - Number(b);
      if (isNumber(a) !== isNumber(b)) return isNumber(a) ? -1 : 1;
      return a.localeCompare(b, 'nb');
    });
}

/**
 * @param {import('./fs.js').ProjectFs} fs
 * @param {string} code
 * @returns {Promise<string | null>}
 */
export async function readRoute(fs, code) {
  const bytes = await fs.readBytes(`${ROUTES_DIR}/${code}.txt`);
  return bytes === null ? null : decodeWin1252(bytes);
}

/**
 * Save a route, backing up the previous version first.
 * @param {import('./fs.js').ProjectFs} fs
 * @param {string} code
 * @param {string} text ERN text
 * @param {{ now?: Date }} [opts]
 */
export async function writeRoute(fs, code, text, { now = new Date() } = {}) {
  const path = `${ROUTES_DIR}/${code}.txt`;
  const existing = await fs.readBytes(path);
  if (existing !== null && existing.length > 0) {
    await fs.writeBytes(await uniqueBackupPath(fs, `${BACKUPS_DIR}/${code}.${backupStamp(now)}`, '.txt'), existing);
  }
  await fs.writeBytes(path, encodeWin1252(text));
}
