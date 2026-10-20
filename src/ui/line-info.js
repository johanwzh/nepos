// One place to read a line as it is now (navigation spec §5): the open line, a parked unsaved
// line, or the saved file. The export check runs per line, continuously; saved lines are cached
// by their text, the open line and drafts are checked on each call (one line is cheap).
import { app } from './state.js';
import { parseERN } from '../core/ern/parse.js';
import { checkForExport } from '../core/export-check.js';
import { orgExportMode } from '../project/meta.js';
import { quayInfo } from './quays.js';
import { routeSummary } from './route-summary.js';
import { grid, gridData } from './grid.js';
import { gridKey } from './route-state.js';

/** @type {Map<string, any>} parsed saved texts */
const parsed = new Map();

/** @param {string} text */
function parseCached(text) {
  let rs = parsed.get(text);
  if (!rs) {
    if (parsed.size > 500) parsed.clear();
    rs = parseERN(text, { lang: /** @type {'no' | 'en'} */ (app.settings.lang) });
    parsed.set(text, rs);
  }
  return rs;
}

/**
 * The line's current state, or null for a damaged (read-only) line or an unknown code.
 * @param {string} code
 */
export function lineState(code) {
  const entry = app.routes.find((r) => r.code === code);
  if (!entry || entry.status === 'damaged') return null;
  if (code === app.activeRoute && app.routeState) {
    // Grid edits live in the grid until stored: check what is on screen.
    if (!grid.active) return app.routeState;
    return { ...app.routeState, grids: { ...app.routeState.grids, [gridKey(app.routeState)]: gridData() } };
  }
  return app.drafts.get(code) ?? parseCached(entry.text);
}

/** @param {{ code: string, rs: any, status: string }[]} routes */
function check(routes) {
  return checkForExport({
    routes, orgs: app.orgs, register: app.orgRegister?.companies ?? null, orgMode: orgExportMode(app.meta),
    codespace: app.meta?.codespace ?? '', orgsProblem: app.orgsError ? 'unreadable' : '', brandings: app.brandings,
    brandingsProblem: app.brandingsError ? 'unreadable' : '', calendars: app.calendars,
    calendarsProblem: app.calendarsError ? 'unreadable' : '', quayInfo, speedLimits: app.meta?.speedLimits ?? null, shapes: app.shapes, vehicles: app.vehicles ?? [],
  });
}

/** @type {Map<string, { key: any, issues: import('../core/export-check.js').CheckIssue[] }>} */
const cache = new Map();

/**
 * The export-check issues that belong to one line.
 * @param {string} code
 * @returns {import('../core/export-check.js').CheckIssue[]}
 */
export function lineIssues(code) {
  const entry = app.routes.find((r) => r.code === code);
  if (!entry) return [];
  const rs = lineState(code);
  const live = code === app.activeRoute || app.drafts.has(code);
  // Saved lines: cached by their text and by the project data the check reads.
  const key = [entry.text, app.orgs, app.orgRegister, app.brandings, app.calendars, app.vehicles, app.meta, quayInfo.size];
  const hit = cache.get(code);
  if (!live && hit && hit.key.every((/** @type {any} */ v, /** @type {number} */ i) => v === key[i])) return hit.issues;
  const issues = check([{ code, rs, status: entry.status }]).filter((i) => i.route === code);
  if (!live) cache.set(code, { key, issues });
  return issues;
}

/** The export check for every exported line, as the lines are now (unsaved changes included). */
export function projectIssues() {
  const routes = app.routes
    .map((r) => ({ code: r.code, status: r.status, rs: lineState(r.code) }))
    .filter((r) => r.rs?.exported !== false);
  return check(routes);
}

/**
 * How a line is named to the user: public code and name (the ID is a UUID, spec line header §4).
 * @param {string} code
 */
export function lineLabel(code) {
  const entry = app.routes.find((r) => r.code === code);
  if (!entry) return code;
  const rs = lineState(code);
  const s = rs ? { publicCode: rs.publicCode ?? '', name: rs.routeName ?? '' } : routeSummary(entry.text);
  return [s.publicCode, s.name].filter(Boolean).join(' ') || code;
}
