// Where things live inside a project folder (spec §5).

export const PROJECT_FILE = 'data/nepos-project.json';
export const ORGS_FILE = 'data/orgs.json';
export const BRANDINGS_FILE = 'data/brandings.json';
export const ROUTES_DIR = 'data/routes';
export const BACKUPS_DIR = 'data/backups';
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
