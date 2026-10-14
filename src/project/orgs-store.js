import { readText, writeJson } from './fs.js';
import { ORGS_FILE } from './layout.js';

/** @param {any} e */
const isEntry = (e) => e === null || (e && typeof e === 'object' && typeof e.id === 'string' && e.contact && typeof e.contact === 'object');
/** @param {any} c */
const isCompany = (c) => c && typeof c === 'object' && typeof c.name === 'string' && typeof c.organisationId === 'string'
  && isEntry(c.authority) && isEntry(c.operator);

/**
 * The project's copy of the organisations its lines use (organisations spec §3.2). A missing file
 * is an empty copy; an unreadable one is reported, so the UI never saves over it.
 * @param {import('./fs.js').ProjectFs} fs
 * @returns {Promise<{ orgs: import('../core/orgs.js').Company[], error: null | 'unreadable' }>}
 */
export async function readOrgs(fs) {
  const text = await readText(fs, ORGS_FILE);
  if (text === null) return { orgs: [], error: null };
  try {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || !Array.isArray(value.companies) || !value.companies.every(isCompany)) {
      return { orgs: [], error: 'unreadable' };
    }
    return { orgs: value.companies, error: null };
  } catch {
    return { orgs: [], error: 'unreadable' };
  }
}

/**
 * @param {import('./fs.js').ProjectFs} fs
 * @param {import('../core/orgs.js').Company[]} companies
 */
export async function writeOrgs(fs, companies) {
  await writeJson(fs, ORGS_FILE, { companies });
}
