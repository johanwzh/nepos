import { readText } from './fs.js';
import { PROJECT_FILE } from './layout.js';
import { checkFormatVersion, migrateProject } from './format.js';
import { readSettings } from './settings.js';
import { readOrgs } from './orgs-store.js';
import { readBrandings } from './brandings-store.js';
import { readLabels } from './labels-store.js';
import { readVehicles } from './vehicles-store.js';
import { readShapes } from './shapes-store.js';
import { readCalendars } from './calendars-store.js';
import { listRoutes, readRoute, writeRoute } from './routes.js';
import { normalizeCodespace } from '../core/codespace.js';
import { checkRouteFile, summarizeIntegrity } from '../core/integrity/check.js';
import { parseERN } from '../core/ern/parse.js';
import { serializeERN } from '../core/ern/serialize.js';
import { orgNameList } from '../core/orgs.js';

/**
 * @typedef {{ code: string, text: string, status: 'ok' | 'outdated' | 'damaged',
 *             issues: import('../core/integrity/check.js').IntegrityIssue[] }} RouteEntry
 */

/**
 * @typedef {{ ok: false, reason: 'not-nepos-project' | 'invalid-project-file' | 'invalid-codespace' | 'newer-format',
 *             formatVersion?: number }} OpenFailure
 * @typedef {{ ok: true, meta: { formatVersion: number, name: string, codespace: string } & Record<string, any>,
 *             settings: Record<string, any>, settingsRecovered: boolean,
 *             orgs: import('../core/orgs.js').Company[], orgsError: null | 'unreadable',
 *             brandings: import('./brandings-store.js').Branding[], brandingsError: null | 'unreadable',
 *             labels: import('./labels-store.js').Label[], labelsError: null | 'unreadable',
 *             vehicles: import('./vehicles-store.js').Vehicle[], vehiclesError: null | 'unreadable',
 *             shapes: Map<string, import('../core/link-state.js').SavedShape>, shapesError: '' | 'unreadable',
 *             calendars: import('../core/calendars.js').Calendar[], calendarsError: null | 'unreadable',
 *             routes: RouteEntry[], summary: { ok: number, outdated: number, damaged: number },
 *             migrated: boolean }} OpenSuccess
 */

/**
 * Open a project folder: check its format, upgrade it if older, load settings and
 * organisations, and run the integrity check on every route.
 * @param {import('./fs.js').ProjectFs} fs
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<OpenFailure | OpenSuccess>}
 */
export async function openProject(fs, { now = new Date() } = {}) {
  const metaText = await readText(fs, PROJECT_FILE);
  if (metaText === null) return { ok: false, reason: 'not-nepos-project' };

  let meta;
  try {
    meta = JSON.parse(metaText);
  } catch {
    return { ok: false, reason: 'invalid-project-file' };
  }
  const format = checkFormatVersion(meta);
  if (format === 'invalid') return { ok: false, reason: 'invalid-project-file' };
  if (format === 'newer') return { ok: false, reason: 'newer-format', formatVersion: meta.formatVersion };

  const cs = normalizeCodespace(meta.codespace);
  if (cs.ok === false) return { ok: false, reason: 'invalid-codespace' };

  let migrated = false;
  if (format === 'older') {
    meta = await migrateProject(fs, meta, { now });
    migrated = true;
  }
  meta = { ...meta, codespace: cs.value };

  const { settings, recovered: settingsRecovered } = await readSettings(fs);
  const { orgs, error: orgsError } = await readOrgs(fs);
  const { brandings, error: brandingsError } = await readBrandings(fs);
  const { labels, error: labelsError } = await readLabels(fs);
  const { vehicles, error: vehiclesError } = await readVehicles(fs);
  const { shapes, error: shapesError } = await readShapes(fs);
  const { calendars, error: calendarsError } = await readCalendars(fs);

  /** @type {RouteEntry[]} */
  const routes = [];
  for (const code of await listRoutes(fs)) {
    const text = await readRoute(fs, code);
    if (text === null) {
      // Listed but unreadable (e.g. removed while opening): report it instead of failing the project.
      routes.push({ code, text: '', status: 'damaged', issues: [{ code: 'unreadable-file', severity: 'damaged' }] });
      continue;
    }
    const { status, issues } = checkRouteFile(text);
    routes.push({ code, text, status, issues });
  }

  return { ok: true, meta, settings, settingsRecovered, orgs, orgsError, brandings, brandingsError, labels, labelsError, vehicles, vehiclesError, shapes, shapesError, calendars, calendarsError, routes, summary: summarizeIntegrity(routes), migrated };
}

/**
 * Rewrite every outdated route in the current format (backing each one up first).
 * Damaged routes are left alone.
 * @param {import('./fs.js').ProjectFs} fs
 * @param {{ meta: { name: string, codespace: string }, orgs: import('../core/orgs.js').Company[], routes: RouteEntry[] }} opened
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<RouteEntry[]>}
 */
export async function updateOutdatedRoutes(fs, { meta, orgs, routes }, { now = new Date() } = {}) {
  /** @type {RouteEntry[]} */
  const updated = [];
  for (const route of routes) {
    if (route.status !== 'outdated') continue;
    const text = serializeERN(parseERN(route.text), route.code, {
      delivery: { name: meta.name, codespace: meta.codespace },
      orgs: orgNameList(orgs),
    });
    await writeRoute(fs, route.code, text, { now });
    const { status, issues } = checkRouteFile(text);
    updated.push({ code: route.code, text, status, issues });
  }
  return updated;
}
