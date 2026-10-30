// Where things live inside a project folder (spec §5).

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
export const ROUTING_CACHE_DIR = 'cache/routing/road';
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

/** How many save backups of one line are kept (user 2026-10-24). */
export const BACKUP_KEEP = 10;

/**
 * Keep the BACKUP_KEEP newest save backups of a line (`<prefix>.<stamp>[-n]<ext>`) in data/backups/; delete the rest.
 * A links file's backups use prefix `links-<code>` and ext '.json'.
 * Never touched: a deleted line's backup (`.deleted.txt`), format-upgrade copies (folders), repair backups and 2.3's
 * routed-link backups (`shapes-<stamp>.json`; other names).
 * @param {import('./fs.js').ProjectFs} fs
 * @param {string} prefix a line's code
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
