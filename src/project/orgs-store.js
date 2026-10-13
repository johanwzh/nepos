import { readText, writeJson } from './fs.js';
import { ORGS_FILE } from './layout.js';

/**
 * The organisation list. A missing file is an empty list; an unreadable one is reported, so the
 * UI can refuse to save over it.
 * @param {import('./fs.js').ProjectFs} fs
 * @returns {Promise<{ orgs: { id: string, name: string }[], error: null | 'unreadable' }>}
 */
export async function readOrgs(fs) {
  const text = await readText(fs, ORGS_FILE);
  if (text === null) return { orgs: [], error: null };
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) return { orgs: [], error: 'unreadable' };
    return { orgs: value, error: null };
  } catch {
    return { orgs: [], error: 'unreadable' };
  }
}

/**
 * @param {import('./fs.js').ProjectFs} fs
 * @param {{ id: string, name: string }[]} orgs
 */
export async function writeOrgs(fs, orgs) {
  await writeJson(fs, ORGS_FILE, orgs);
}
