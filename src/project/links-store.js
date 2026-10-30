// Routed links, one file per line (spec §7, 2026-10-30): data/links/<line code>.json. A line's links and its stop snaps
// belong to the line; two lines with the same stop pair have a link each. A file is written only on Apply in a
// routing session. An unreadable file does not stop the project opening: it is moved to data/backups/ and the line
// starts with no links.
import { readText, writeJson } from './fs.js';
import { LINKS_DIR, BACKUPS_DIR, backupStamp, uniqueBackupPath, pruneBackups } from './layout.js';

/** @typedef {import('../core/link-state.js').SavedLink} SavedLink */
/** @typedef {import('../routing/snap.js').SnapRef} SnapRef */
/**
 * links: by key fromQuay|toQuay|profile; snaps: one per Quay id (spec §5).
 * @typedef {{ version: 1, line: string, links: Record<string, SavedLink>, snaps: Record<string, SnapRef> }} LineLinks
 */

const pathOf = (/** @type {string} */ code) => `${LINKS_DIR}/${code}.json`;
const isObject = (/** @type {any} */ v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** @param {string} code @returns {LineLinks} */
export function emptyLineLinks(code) {
  return { version: 1, line: code, links: {}, snaps: {} };
}

/** @param {import('./fs.js').ProjectFs} fs @param {string} code @param {{ now?: Date }} [opts] @returns {Promise<LineLinks>} */
export async function readLineLinks(fs, code, { now = new Date() } = {}) {
  const text = await readText(fs, pathOf(code));
  if (text === null) return emptyLineLinks(code);
  try {
    const v = JSON.parse(text);
    if (v?.version === 1 && isObject(v.links) && isObject(v.snaps)) return { version: 1, line: code, links: v.links, snaps: v.snaps };
  } catch { /* unreadable: below */ }
  const bytes = /** @type {Uint8Array} */ (await fs.readBytes(pathOf(code)));
  await fs.writeBytes(await uniqueBackupPath(fs, `${BACKUPS_DIR}/links-${code}.${backupStamp(now)}.broken`, '.json'), bytes);
  await fs.remove(pathOf(code));
  return emptyLineLinks(code);
}

/** @param {Record<string, any>} o */
const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

/**
 * Backs the previous file up (the 10 newest kept), then writes with keys sorted for stable diffs.
 * @param {import('./fs.js').ProjectFs} fs @param {string} code @param {LineLinks} data @param {{ now?: Date }} [opts]
 */
export async function writeLineLinks(fs, code, data, { now = new Date() } = {}) {
  const old = await fs.readBytes(pathOf(code));
  if (old) {
    await fs.writeBytes(await uniqueBackupPath(fs, `${BACKUPS_DIR}/links-${code}.${backupStamp(now)}`, '.json'), old);
    await pruneBackups(fs, `links-${code}`, undefined, '.json');
  }
  await writeJson(fs, pathOf(code), { version: 1, line: code, links: sorted(data.links), snaps: sorted(data.snaps) });
}

/** With the line (deleteRoute): backed up as `.deleted.json`. @param {import('./fs.js').ProjectFs} fs @param {string} code @param {{ now?: Date }} [opts] */
export async function deleteLineLinks(fs, code, { now = new Date() } = {}) {
  const old = await fs.readBytes(pathOf(code));
  if (old === null) return;
  await fs.writeBytes(await uniqueBackupPath(fs, `${BACKUPS_DIR}/links-${code}.${backupStamp(now)}.deleted`, '.json'), old);
  await fs.remove(pathOf(code));
}

/** Follows a line file renamed by repairFileNames. @param {import('./fs.js').ProjectFs} fs @param {string} from @param {string} to */
export async function renameLineLinks(fs, from, to) {
  if (from === to) return;
  const text = await readText(fs, pathOf(from));
  if (text === null || (await fs.readBytes(pathOf(to))) !== null) return;
  let value;
  try { value = { ...JSON.parse(text), line: to }; } catch { value = null; }
  if (value) await writeJson(fs, pathOf(to), value);
  else await fs.writeBytes(pathOf(to), /** @type {Uint8Array} */ (await fs.readBytes(pathOf(from))));
  await fs.remove(pathOf(from));
}

/** Every line's links, by code. @param {import('./fs.js').ProjectFs} fs @returns {Promise<Map<string, LineLinks>>} */
export async function readAllLinks(fs) {
  /** @type {Map<string, LineLinks>} */
  const out = new Map();
  const names = (await fs.list(LINKS_DIR)).filter((e) => e.kind === 'file' && e.name.endsWith('.json')).map((e) => e.name).sort();
  for (const name of names) {
    const code = name.slice(0, -'.json'.length);
    out.set(code, await readLineLinks(fs, code));
  }
  return out;
}
