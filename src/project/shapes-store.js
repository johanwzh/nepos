// Saved links (design §9, Lasse's spec: saved shapes): data/shapes.json, one entry per link key
// (fromQuay|toQuay|profile), shared by every line in the project. A 2.2 project has no file: no links yet.
// An unreadable file does not stop the project opening; it is kept as a backup when the file is next written.
import { readText, writeJson } from './fs.js';
import { SHAPES_FILE, BACKUPS_DIR, backupStamp, uniqueBackupPath } from './layout.js';

/** @typedef {import('../core/link-state.js').SavedShape} SavedShape */

const STATUSES = new Set(['OK', 'BLOCKED', 'NOT_SHAPED', 'NO_NETWORK_NEAR', 'NO_PATH', 'TOO_FAR', 'ERROR']);
/** @param {any} s */
const isShape = (s) => s && typeof s.polyline === 'string' && STATUSES.has(s.status) && Array.isArray(s.from) && Array.isArray(s.to) && typeof s.routedAt === 'string';

/** @param {import('./fs.js').ProjectFs} fs @returns {Promise<{ shapes: Map<string, SavedShape>, error: '' | 'unreadable' }>} */
export async function readShapes(fs) {
  const text = await readText(fs, SHAPES_FILE);
  if (text === null) return { shapes: new Map(), error: '' };
  try {
    const value = JSON.parse(text);
    if (!value || typeof value.shapes !== 'object') return { shapes: new Map(), error: 'unreadable' };
    /** @type {Map<string, SavedShape>} */
    const shapes = new Map();
    for (const [k, s] of Object.entries(value.shapes)) if (isShape(s)) shapes.set(k, /** @type {SavedShape} */ (s));
    return { shapes, error: '' };
  } catch {
    return { shapes: new Map(), error: 'unreadable' };
  }
}

/**
 * @param {import('./fs.js').ProjectFs} fs @param {Map<string, SavedShape>} shapes
 * @param {{ previousError?: string }} [opts] previousError 'unreadable': keep the old file in data/backups/ first
 */
export async function writeShapes(fs, shapes, { previousError = '' } = {}) {
  if (previousError === 'unreadable') {
    const old = await fs.readBytes(SHAPES_FILE);
    if (old) await fs.writeBytes(await uniqueBackupPath(fs, `${BACKUPS_DIR}/shapes-${backupStamp(new Date())}`, '.json'), old);
  }
  /** @type {Record<string, SavedShape>} */
  const out = {};
  for (const k of [...shapes.keys()].sort()) out[k] = /** @type {SavedShape} */ (shapes.get(k));
  await writeJson(fs, SHAPES_FILE, { version: 1, shapes: out });
}
