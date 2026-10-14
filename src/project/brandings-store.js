// Brandings (line header spec §6): the project's own list, data/brandings.json.
import { readText, writeJson } from './fs.js';
import { BRANDINGS_FILE } from './layout.js';

/** @typedef {{ id: string, name: string, shortName: string, description: string, url: string, imageUrl: string }} Branding */

const FIELDS = ['id', 'name', 'shortName', 'description', 'url', 'imageUrl'];
/** @param {any} b */
const isBranding = (b) => b && typeof b === 'object' && FIELDS.every((k) => typeof b[k] === 'string');

/** @param {import('./fs.js').ProjectFs} fs @returns {Promise<{ brandings: Branding[], error: null | 'unreadable' }>} */
export async function readBrandings(fs) {
  const text = await readText(fs, BRANDINGS_FILE);
  if (text === null) return { brandings: [], error: null };
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) && value.every(isBranding) ? { brandings: value, error: null } : { brandings: [], error: 'unreadable' };
  } catch {
    return { brandings: [], error: 'unreadable' };
  }
}

/** @param {import('./fs.js').ProjectFs} fs @param {Branding[]} brandings */
export async function writeBrandings(fs, brandings) {
  await writeJson(fs, BRANDINGS_FILE, brandings);
}

/** @param {string} codespace @returns {Branding} */
export function newBranding(codespace) {
  return { id: `${codespace}:Branding:${crypto.randomUUID()}`, name: '', shortName: '', description: '', url: '', imageUrl: '' };
}
