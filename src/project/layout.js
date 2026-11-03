// Where things live inside a project folder (spec §5).

import { writeText } from './fs.js';

export const PROJECT_FILE = 'data/nepos-project.json';
export const ORGS_FILE = 'data/orgs.json';
export const BRANDINGS_FILE = 'data/brandings.json';
export const LABELS_FILE = 'data/labels.json';
export const VEHICLES_FILE = 'data/vehicles.json';
export const EXPORTS_FILE = 'data/exports.json';
export const CALENDARS_FILE = 'data/calendars.json';
export const ROUTES_DIR = 'data/routes';
export const BACKUPS_DIR = 'data/backups';
export const LINKS_DIR = 'data/links'; // routed links, one file per line (2.6)
export const CACHE_DIR = 'cache'; // downloads Nepos can fetch again; can be deleted at any time
/** A routing tile set's cache (routing for all modes, 2026-11-01: one folder per set; road stays where it was). @param {string} set */
export const routingCacheDir = (set) => `cache/routing/${set}`;
export const ROUTING_CACHE_DIR = routingCacheDir('road');
export const EXPORTS_DIR = 'exports'; // generated NeTEx deliveries; can be deleted at any time
export const SETTINGS_FILE = 'private/settings.json';
export const SECRETS_FILE = 'private/secrets.json';

/**
 * Local timestamp for backup names, to the second: YYYY-MM-DDTHHMMSS.
 * @param {Date} d
 */
export function backupStamp(d) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * A backup path that does not exist yet: base+ext, else base-2+ext, base-3+ext, …
 * @param {import('./fs.js').ProjectFs} fs
 * @param {string} base path without extension
 * @param {string} ext e.g. '.txt'
 */
export async function uniqueBackupPath(fs, base, ext) {
  let candidate = `${base}${ext}`;
  for (let n = 2; (await fs.readBytes(candidate)) !== null; n++) candidate = `${base}-${n}${ext}`;
  return candidate;
}

/** How many save backups of one line, or of one project file, are kept (user 2026-10-24, backlog 79). */
export const BACKUP_KEEP = 10;

/**
 * Keep the BACKUP_KEEP newest save backups of one file (`<prefix>.<stamp>[-n]<ext>`) in data/backups/; delete the rest.
 * A line's backups use its code as prefix, a links file's `links-<code>` with ext '.json', a project file's
 * `calendars`, `orgs`, `brandings`, `labels` or `vehicles` with ext '.json'.
 * Never touched: a deleted line's backup (`.deleted.txt`), format-upgrade copies (folders), repair backups and 2.3's
 * routed-link backups (`shapes-<stamp>.json`; other names).
 * @param {import('./fs.js').ProjectFs} fs
 * @param {string} prefix a line's code, or the name of a project file's backups
 * @param {number} [keep]
 * @param {string} [ext]
 * @returns {Promise<number>} how many were deleted
 */
export async function pruneBackups(fs, prefix, keep = BACKUP_KEEP, ext = '.txt') {
  const esc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${esc(prefix)}\\.(\\d{4}-\\d{2}-\\d{2}T\\d{6})(?:-(\\d+))?${esc(ext)}$`);
  const found = [];
  for (const entry of await fs.list(BACKUPS_DIR)) {
    if (entry.kind !== 'file') continue;
    const m = re.exec(entry.name);
    if (m) found.push({ name: entry.name, stamp: m[1], n: Number(m[2] ?? 1) });
  }
  found.sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : b.n - a.n)); // newest first
  const old = found.slice(keep);
  for (const f of old) await fs.remove(`${BACKUPS_DIR}/${f.name}`);
  return old.length;
}

/** A file with nothing in it yet: `[]`, or an object whose lists are all empty. @param {string} text */
function isEmptyList(text) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v.length === 0 : !!v && typeof v === 'object' && Object.values(v).every((x) => Array.isArray(x) && x.length === 0);
  } catch {
    return false;
  }
}

/**
 * Save one of the project's JSON files (calendars, organisations, brandings, labels, vehicles), first copying the old
 * file to `data/backups/<name>.<stamp>.json` and keeping the BACKUP_KEEP newest, as for the lines (backlog 79).
 * No backup when the file is new, an empty list (what a new project starts with: `[]`, `{ "companies": [] }`) or
 * already what is being saved.
 * @param {import('./fs.js').ProjectFs} fs
 * @param {string} path the file, e.g. CALENDARS_FILE
 * @param {string} name the backup's name: `calendars` gives `calendars.<stamp>.json`
 * @param {any} value
 * @param {{ now?: Date }} [opts]
 */
export async function writeJsonBackedUp(fs, path, name, value, { now = new Date() } = {}) {
  const text = JSON.stringify(value, null, 2) + '\n';
  const old = await fs.readBytes(path);
  const oldText = old === null ? '' : new TextDecoder().decode(old);
  if (oldText !== '' && oldText !== text && !isEmptyList(oldText)) {
    await fs.writeBytes(await uniqueBackupPath(fs, `${BACKUPS_DIR}/${name}.${backupStamp(now)}`, '.json'), old);
    await pruneBackups(fs, name, BACKUP_KEEP, '.json');
  }
  await writeText(fs, path, text);
}
