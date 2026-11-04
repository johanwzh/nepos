// One place to read a line as it is now (navigation spec §5): the open line, a parked unsaved
// line, or the saved file. The export check runs per line, continuously; saved lines are cached
// by their text, the open line and drafts by their content (backlog 96: one line is not always
// cheap — a block of 1 321 trips was checked 2–3 times per keystroke).
import { app } from './state.js';
import { notifyLinesChanged } from './shell.js';
import { lineSize } from '../core/blocks.js';
import { parseERN } from '../core/ern/parse.js';
import { checkForExport } from '../core/export-check.js';
import { routedLinks } from '../core/features.js';
import { tablePatterns, patternStates } from '../core/route-patterns.js';
import { isRoutedLine } from '../routing/profiles.js';
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
    calendarsProblem: app.calendarsError ? 'unreadable' : '', quayInfo, speedLimits: app.meta?.speedLimits ?? null, vehicles: app.vehicles ?? [],
    links: routedLinks(app.lineLinks),
    hubLines: exportedLines, // a line's Knutepunkt links are checked against the other lines (2026-10-31)
  });
}

/** Every exported line as it is now: the feeders a Knutepunkt can wait for. */
function exportedLines() {
  return app.routes.filter((r) => r.status !== 'damaged').map((r) => ({ code: r.code, rs: lineState(r.code) })).filter((r) => r.rs && r.rs.exported !== false);
}

/** A line with a Knutepunkt: its check depends on other lines too, so it is not cached. @param {any} rs */
const hasHubs = (rs) => Object.values(rs?.grids ?? {}).some((/** @type {any} */ g) => g.stops?.some((/** @type {any} */ s) => s.hub));

/** @type {Map<string, { key: any, issues: import('../core/export-check.js').CheckIssue[] }>} */
const cache = new Map();

/**
 * Line sizes in passing times (lineSize; backlog 96). From `later` on, the open line is checked when the user pauses
 * (DEFER_MS after the last change) instead of on every keystroke; from `heavy` on, the editor says the line is heavy.
 * An object so tests can lower them.
 */
export const checkSizes = { later: 20000, heavy: 200000 };
const DEFER_MS = 400;
let deferred = /** @type {any} */ (null);

/** Check the open line once the user pauses, then tell the lines pane and the problem marker. @param {string} code */
function checkLater(code) {
  clearTimeout(deferred);
  deferred = setTimeout(() => {
    deferred = null;
    if (code !== app.activeRoute) return; // another line was opened meanwhile: it is checked on its own
    lineIssues(code, { fresh: true });
    notifyLinesChanged();
  }, DEFER_MS);
}

/**
 * The export-check issues that belong to one line. A heavy open line being edited gives its last issues and is checked
 * when the user pauses; `fresh` checks it now (stepping to the next problem).
 * @param {string} code
 * @param {{ fresh?: boolean }} [opts]
 * @returns {import('../core/export-check.js').CheckIssue[]}
 */
export function lineIssues(code, { fresh = false } = {}) {
  const entry = app.routes.find((r) => r.code === code);
  if (!entry) return [];
  const rs = lineState(code);
  // A line with a Knutepunkt reads the other lines too: checked on every call, as before.
  const hubs = hasHubs(rs);
  const live = code === app.activeRoute || app.drafts.has(code);
  // Cached by the line's content (its text when saved) and by the project data the check reads.
  const key = [live ? JSON.stringify(rs) : entry.text, app.orgs, app.orgRegister, app.brandings, app.calendars, app.vehicles, app.meta, quayInfo.size, app.lineLinks.get(code)];
  const hit = cache.get(code);
  if (!hubs && hit && hit.key.every((/** @type {any} */ v, /** @type {number} */ i) => v === key[i])) return hit.issues;
  if (!fresh && !hubs && hit && code === app.activeRoute && lineSize(rs).times >= checkSizes.later) {
    checkLater(code);
    return hit.issues;
  }
  const issues = check([{ code, rs, status: entry.status }]).filter((i) => i.route === code);
  if (!hubs) cache.set(code, { key, issues });
  return issues;
}

/** The export check for every exported line, as the lines are now (unsaved changes included). */
export function projectIssues() {
  const routes = app.routes
    .map((r) => ({ code: r.code, status: r.status, rs: lineState(r.code) }))
    .filter((r) => r.rs?.exported !== false);
  return check(routes);
}

/** @type {Map<string, { key: any[], value: { patterns: number, green: number, orange: number, red: number } }>} */
const routingCache = new Map();

/**
 * How much of a line is routed (routing editor, 2026-10-31): its journey patterns by state, or null for a line not
 * routed on roads (or damaged). The published road build is not known here (no download outside Ruting): newer map
 * data does not count. Cached for saved lines by their text, the links and their stops' positions (final review M6).
 * @param {string} code
 */
export function lineRouting(code) {
  const rs = lineState(code);
  if (!rs || !isRoutedLine(rs)) return null;
  const entry = app.routes.find((r) => r.code === code);
  const live = code === app.activeRoute || app.drafts.has(code);
  const ids = [...new Set(Object.values(rs.grids ?? {}).flatMap((g) => /** @type {any} */ (g).stops.map((/** @type {any} */ s) => String(s.stopId ?? ''))))];
  const where = ids.map((id) => { const q = quayInfo.get(id); return q ? `${q.lat},${q.lon}` : ''; }).join(';');
  // The open line and drafts by their content, like lineIssues (backlog 96: a block of 8 640 trips took 0.7 s per call)
  const key = [live ? JSON.stringify(rs) : entry?.text, app.calendars, app.lineLinks.get(code), app.vehicles, where];
  const hit = routingCache.get(code);
  if (hit && hit.key.every((v, i) => v === key[i])) return hit.value;
  const states = patternStates(tablePatterns(rs, { calendars: app.calendars, quayInfo, vehicles: app.vehicles ?? [] }), app.lineLinks.get(code), { quayInfo });
  const n = (/** @type {string} */ s) => states.filter((x) => x.state === s).length;
  const value = { patterns: states.length, green: n('green'), orange: n('orange'), red: n('red') };
  routingCache.set(code, { key, value });
  return value;
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
