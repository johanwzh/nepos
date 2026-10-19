import { readText, writeJson } from './fs.js';
import { SETTINGS_FILE, SECRETS_FILE } from './layout.js';

// Personal settings live in private/, never in data/ (spec §5).
export const DEFAULT_SETTINGS = Object.freeze({
  lang: 'no',
  theme: 'system',
  clientName: '',
  geocoderUrl: 'https://api.entur.io/geocoder/v3',
  stopPlacesUrl: 'https://api.entur.io/stop-places/v1/read',
  exportAsZip: true,
  /** show the Quays' private codes beside the stop names (View menu) */
  showPrivateCode: false,
  // Map background: any raster tile URL with {z}/{x}/{y}. CARTO's free basemaps need an API key now.
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
});

/** @type {Record<string, string[]>} */
const ALLOWED = { lang: ['no', 'en'], theme: ['system', 'light', 'dark'] };

/**
 * Read a JSON object file. Missing → null; unreadable or not an object → 'unreadable'.
 * @param {import('./fs.js').ProjectFs} fs
 * @param {string} path
 */
async function readObject(fs, path) {
  const text = await readText(fs, path);
  if (text === null) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

/**
 * Settings with defaults filled in. Unknown keys are kept so settings from a newer Nepos survive.
 * `recovered` is true when the file was unreadable or had invalid values that were reset.
 * @param {import('./fs.js').ProjectFs} fs
 * @returns {Promise<{ settings: Record<string, any>, recovered: boolean }>}
 */
export async function readSettings(fs) {
  const stored = await readObject(fs, SETTINGS_FILE);
  if (stored === null) return { settings: { ...DEFAULT_SETTINGS }, recovered: false };
  if (stored === 'unreadable') return { settings: { ...DEFAULT_SETTINGS }, recovered: true };
  /** @type {Record<string, any>} */
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  let recovered = false;
  for (const [key, allowed] of Object.entries(ALLOWED)) {
    if (!allowed.includes(settings[key])) {
      settings[key] = DEFAULT_SETTINGS[key];
      recovered = true;
    }
  }
  if (typeof settings.showPrivateCode !== 'boolean') settings.showPrivateCode = DEFAULT_SETTINGS.showPrivateCode;
  if (typeof settings.exportAsZip !== 'boolean') {
    settings.exportAsZip = DEFAULT_SETTINGS.exportAsZip;
    recovered = true;
  }
  return { settings, recovered };
}

/**
 * @param {import('./fs.js').ProjectFs} fs
 * @param {Record<string, any>} settings
 */
export async function writeSettings(fs, settings) {
  await writeJson(fs, SETTINGS_FILE, settings);
}

/**
 * @param {import('./fs.js').ProjectFs} fs
 * @returns {Promise<{ secrets: Record<string, any>, recovered: boolean }>}
 */
export async function readSecrets(fs) {
  const stored = await readObject(fs, SECRETS_FILE);
  if (stored === null) return { secrets: {}, recovered: false };
  if (stored === 'unreadable') return { secrets: {}, recovered: true };
  return { secrets: stored, recovered: false };
}

/**
 * @param {import('./fs.js').ProjectFs} fs
 * @param {Record<string, any>} secrets
 */
export async function writeSecrets(fs, secrets) {
  await writeJson(fs, SECRETS_FILE, secrets);
}
