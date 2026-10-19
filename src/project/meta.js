import { writeJson } from './fs.js';
import { PROJECT_FILE } from './layout.js';
import { SPEED_LIMITS } from '../core/speed-profile.js';

/**
 * Rename the project. Every other key in the project file is kept as it is.
 * @template {Record<string, any>} M
 * @param {import('./fs.js').ProjectFs} fs
 * @param {M} meta current project file contents
 * @param {string} name
 * @returns {Promise<M>}
 */
export async function writeProjectName(fs, meta, name) {
  const updated = { ...meta, name: String(name ?? '').trim() };
  await writeJson(fs, PROJECT_FILE, updated);
  return updated;
}

/**
 * How organisations are written in the export (organisations spec §6.1). Default: codespace.
 * @param {Record<string, any> | null} meta
 * @returns {'codespace' | 'nog'}
 */
export function orgExportMode(meta) {
  return meta?.orgExportMode === 'nog' ? 'nog' : 'codespace';
}

/**
 * @template {Record<string, any>} M
 * @param {import('./fs.js').ProjectFs} fs
 * @param {M} meta
 * @param {'codespace' | 'nog'} mode
 * @returns {Promise<M>}
 */
export async function writeOrgExportMode(fs, meta, mode) {
  const updated = { ...meta, orgExportMode: mode };
  await writeJson(fs, PROJECT_FILE, updated);
  return updated;
}

/**
 * A new codespace for the project file (see core/recode.js for the rest of the project).
 * @template {Record<string, any>} M
 * @param {import('./fs.js').ProjectFs} fs
 * @param {M} meta
 * @param {string} codespace
 * @returns {Promise<M>}
 */
export async function writeProjectCodespace(fs, meta, codespace) {
  const updated = { ...meta, codespace };
  await writeJson(fs, PROJECT_FILE, updated);
  return updated;
}

/**
 * The project's own speed levels (km/h, straight line, per mode; customer 2026-10-19). Only levels that
 * differ from the defaults are kept; none at all removes the key.
 * @template {Record<string, any>} M
 * @param {import('./fs.js').ProjectFs} fs
 * @param {M} meta
 * @param {Record<string, number>} limits
 * @returns {Promise<M>}
 */
export async function writeSpeedLimits(fs, meta, limits) {
  /** @type {Record<string, number>} */
  const own = {};
  for (const [mode, v] of Object.entries(limits)) {
    if (Number.isFinite(v) && v > 0 && v !== SPEED_LIMITS[mode]) own[mode] = Math.round(v);
  }
  const { speedLimits: _old, ...rest } = meta;
  const updated = /** @type {M} */ (Object.keys(own).length ? { ...rest, speedLimits: own } : rest);
  await writeJson(fs, PROJECT_FILE, updated);
  return updated;
}
