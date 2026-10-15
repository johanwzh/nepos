// The check that runs before an export (spec §9, §7.2, §8): everything that would make the NeTEx
// wrong or surprising. Errors block the export; warnings are shown and never block. Quay status
// from NSR is advisory, so it only ever gives warnings. Pure.
import { quayStatus, stopLocalId } from './quays.js';
import { findRole, aliasIssues, orgRole } from './orgs.js';
import { ROUTE_CODE_PATTERN } from './route-names.js';
import { journeyStops } from './netex/journeys.js';
import { calendarDays, unionDays, columnDays } from './calendars.js';
import { isAllowedDayCode } from './day-codes.js';

/** Every code the check can give; each has a text 'chk:<code>' in both languages. */
export const CHECK_CODES = [
  'orgs-unreadable', 'route-damaged', 'no-trips', 'route-code', 'no-period', 'no-authority', 'no-operator', 'stop-missing', 'stop-not-nsr', 'stop-id-clash', 'col-no-daycode',
  'col-one-stop', 'no-name', 'org-not-in-register', 'org-register-missing', 'org-alias-format', 'org-alias-duplicate', 'org-not-in-project', 'no-mode', 'branding-missing', 'brandings-unreadable', 'table-set-name', 'no-calendar',
  'calendar-missing', 'calendar-empty', 'day-code', 'no-operating-days', 'calendars-unreadable', 'stop-not-seen', 'stop-mode',
  'stop-unchecked', 'col-decreasing', 'col-exceptions-ignored', 'route-no-trips',
  'route-changed-on-disk',
];

/**
 * @typedef {{ level: 'error' | 'warning', code: string, route?: string,
 *             where?: { tableSet: string, period: string, column?: number }, detail?: string }} CheckIssue
 */

/** @param {any} cell */
const timed = (cell) => !!cell?.time && cell.time !== '|';
/** @param {string[]} names */
const list = (names) => names.slice(0, 3).join(', ') + (names.length > 3 ? ` (+${names.length - 3})` : '');
/** @param {any} cell */
const minutes = (cell) => (cell.dayOffset || 0) * 1440 + Number(cell.time.slice(0, 2)) * 60 + Number(cell.time.slice(2, 4));

/**
 * @param {{ routes: { code: string, rs: any | null, status: string }[],
 *           orgs: import('./orgs.js').Company[], register: import('./orgs.js').Company[] | null,
 *           orgMode: 'codespace' | 'nog', codespace: string, orgsProblem: '' | 'unreadable',
 *           brandings: { id: string }[], brandingsProblem?: '' | 'unreadable',
 *           calendars: import('./calendars.js').Calendar[], calendarsProblem?: '' | 'unreadable',
 *           quayInfo: Map<string, any>, changedOnDisk?: string[] }} input
 * @returns {CheckIssue[]} errors first, then warnings
 */
export function checkForExport({ routes, orgs, register, orgMode, codespace, orgsProblem, brandings, brandingsProblem = '', calendars = [], calendarsProblem = '', quayInfo, changedOnDisk = [] }) {
  /** @type {CheckIssue[]} */
  const issues = [];
  /** @param {'error' | 'warning'} level @param {string} code @param {Partial<CheckIssue>} [extra] */
  const add = (level, code, extra = {}) => { issues.push({ level, code, ...extra }); };

  if (orgsProblem === 'unreadable') add('error', 'orgs-unreadable');
  if (brandingsProblem === 'unreadable') add('error', 'brandings-unreadable');
  if (calendarsProblem === 'unreadable') add('error', 'calendars-unreadable');
  if (!register) add('warning', 'org-register-missing');
  /** @type {Set<string>} organisation IDs the exported routes use */
  const usedOrgIds = new Set();

  /** @type {Map<string, string>} NeTEx local ID → the first stop ID that produced it */
  const localIds = new Map();
  let trips = 0, damaged = 0;
  for (const code of changedOnDisk) add('warning', 'route-changed-on-disk', { route: code });
  for (const { code, rs, status } of routes) {
    if (status === 'damaged' || !rs) { add('error', 'route-damaged', { route: code }); damaged++; continue; }
    // The route code becomes part of NeTEx IDs and the line file name.
    if (!ROUTE_CODE_PATTERN.test(code)) add('error', 'route-code', { route: code });
    const routeTrips = checkRoute(code, rs, { orgs: register ?? orgs, copy: orgMode === 'codespace' ? orgs : null, brandings, calendars, quayInfo, add, localIds, usedOrgIds });
    if (!routeTrips) add('warning', 'route-no-trips', { route: code });
    trips += routeTrips;
  }
  if (orgMode === 'codespace') {
    const used = orgs.map((c) => ({ ...c,
      authority: c.authority && usedOrgIds.has(c.authority.id) ? c.authority : null,
      operator: c.operator && usedOrgIds.has(c.operator.id) ? c.operator : null }));
    for (const i of aliasIssues(used, codespace)) add('error', i.code, { detail: i.alias });
  }
  if (!trips && !damaged) add('error', 'no-trips');

  return [...issues.filter((i) => i.level === 'error'), ...issues.filter((i) => i.level === 'warning')];
}

/**
 * @param {string} code
 * @param {any} rs
 * @param {{ orgs: import('./orgs.js').Company[], quayInfo: Map<string, any>, localIds: Map<string, string>, usedOrgIds: Set<string>, copy: import('./orgs.js').Company[] | null, brandings: { id: string }[], calendars: import('./calendars.js').Calendar[],
 *           add: (level: 'error' | 'warning', code: string, extra?: Partial<CheckIssue>) => void }} ctx
 * @returns {number} trips (columns with times) in the route
 */
function checkRoute(code, rs, { orgs, copy, brandings, calendars, quayInfo, add, localIds, usedOrgIds }) {
  const r = { route: code };
  // Line details (line header spec §7)
  if (!rs.routeName?.trim()) add('error', 'no-name', r);
  if (!rs.mode || rs.mode === 'other') add('error', 'no-mode', r); // 'other' is what a new line starts as
  if (rs.brandingId && !brandings.some((b) => b.id === rs.brandingId)) add('error', 'branding-missing', { ...r, detail: rs.brandingId });

  const sek = rs.sek ?? [];
  if (!sek.some((/** @type {any} */ s) => s.isAuthority)) add('error', 'no-authority', r);
  if (!sek.some((/** @type {any} */ s) => s.isOperator)) add('error', 'no-operator', r);
  for (const s of sek) {
    const hit = findRole(orgs, s.orgId);
    const role = s.isAuthority ? 'authority' : 'operator';
    if (!hit || hit.role !== role || orgRole(s.orgId) !== role) add('error', 'org-not-in-register', { ...r, detail: s.orgId });
    // Codespace mode writes the organisation from the project copy: it must be there.
    else if (copy && !findRole(copy, s.orgId)) add('error', 'org-not-in-project', { ...r, detail: s.orgId });
    usedOrgIds.add(s.orgId);
  }

  // Table sets, their periods and calendars (timetable structure spec §8)
  let trips = 0;
  for (const set of rs.tableSets ?? []) {
    if (!set.name?.trim()) add('error', 'table-set-name', r);
    const pers = (rs.periods ?? []).filter((/** @type {any} */ p) => p.setId === set.id);
    if (!pers.length) add('error', 'no-period', { ...r, detail: set.name });
    for (const per of pers) {
      const label = per.calendarIds.map((/** @type {string} */ id) => calendars.find((c) => c.id === id)?.name ?? id).join(' + ');
      const where = { tableSet: set.name, period: label };
      if (!per.calendarIds.length) add('error', 'no-calendar', { ...r, where });
      for (const id of per.calendarIds) {
        const cal = calendars.find((c) => c.id === id);
        if (!cal) add('error', 'calendar-missing', { ...r, where, detail: id });
        else if (!calendarDays(cal).length) add('warning', 'calendar-empty', { ...r, where, detail: cal.name });
      }
      const periodDays = unionDays(calendars.filter((c) => per.calendarIds.includes(c.id)));
      const grid = rs.grids[`${per.id}:${per.setId}`];
      if (!grid) continue;

      /** @type {Record<string, string[]>} */
      const byStatus = { missing: [], 'not-nsr': [], 'not-seen': [], 'mode-mismatch': [], unknown: [] };
      grid.stops.forEach((/** @type {any} */ stop, /** @type {number} */ ri) => {
        // Only rows that are exported: a time in at least one column.
        if (!grid.cols.some((/** @type {any} */ col) => timed(col.cells[ri]))) return;
        const id = stop.stopId == null || stop.stopId === '' ? null : String(stop.stopId);
        const status = quayStatus(id, id ? quayInfo.get(id) : undefined, rs.transportMode);
        const label = stop.name || `#${ri + 1}`;
        if (status in byStatus) byStatus[status].push(status === 'not-nsr' ? `${label} (${id})` : label);
        if (id) {
          const local = stopLocalId(id);
          const first = localIds.get(local);
          if (first === undefined) localIds.set(local, id);
          else if (first !== id) add('error', 'stop-id-clash', { ...r, where, detail: `${first} / ${id}` });
        }
      });
      if (byStatus.missing.length) add('error', 'stop-missing', { ...r, where, detail: list(byStatus.missing) });
      if (byStatus['not-nsr'].length) add('error', 'stop-not-nsr', { ...r, where, detail: list(byStatus['not-nsr']) });
      if (byStatus['not-seen'].length) add('warning', 'stop-not-seen', { ...r, where, detail: list(byStatus['not-seen']) });
      if (byStatus['mode-mismatch'].length) add('warning', 'stop-mode', { ...r, where, detail: list(byStatus['mode-mismatch']) });
      if (byStatus.unknown.length) add('warning', 'stop-unchecked', { ...r, where, detail: list(byStatus.unknown) });

      grid.cols.forEach((/** @type {any} */ col, /** @type {number} */ ci) => {
        if (!col.cells.some(timed)) return;
        const at = { ...where, column: ci + 1 };
        // What the export writes (journeys.js): two or more calls make a trip. Timed rows
        // without a stop ID count too here — they are already errors of their own.
        const unnamed = grid.stops.filter((/** @type {any} */ st, /** @type {number} */ ri) => timed(col.cells[ri]) && (st.stopId == null || st.stopId === '') && !st.isDwellArr).length;
        if (journeyStops(grid, col).length + unnamed >= 2) trips++;
        else add('error', 'col-one-stop', { ...r, where: at });
        checkExceptions(rs, per, col, at, (level, c, extra) => add(level, c, { ...r, ...extra }));
        // An empty day code would be exported as "every day" — never what the user meant.
        if (!col.dayCode) add('error', 'col-no-daycode', { ...r, where: at });
        else if (!isAllowedDayCode(col.dayCode)) add('error', 'day-code', { ...r, where: at, detail: col.dayCode });
        else if (journeyStops(grid, col).length >= 2 && !columnDays(periodDays, col.dayCode).length) add('warning', 'no-operating-days', { ...r, where: at });
        let prev = -1;
        grid.stops.forEach((/** @type {any} */ stop, /** @type {number} */ ri) => {
          const cell = col.cells[ri];
          if (!timed(cell)) return;
          const m = minutes(cell);
          if (prev >= 0 && m < prev) add('warning', 'col-decreasing', { ...r, where: at, detail: `${stop.name} ${cell.time}` });
          prev = m;
        });
      });
    }
  }
  return trips;
}

/**
 * Footnote date exceptions are not exported (timetable structure spec §4: dates live in calendars).
 * @param {any} rs @param {any} _per @param {any} col
 * @param {{ tableSet: string, period: string, column: number }} at
 * @param {(level: 'error' | 'warning', code: string, extra?: Partial<CheckIssue>) => void} add
 */
function checkExceptions(rs, _per, col, at, add) {
  const fnOf = (/** @type {number | null} */ id) => rs.footnotes?.find((/** @type {any} */ f) => f.id === id);
  const count = (fnOf(col.footnoteId)?.exceptions ?? []).length
    + col.cells.reduce((/** @type {number} */ n, /** @type {any} */ c) => n + (c?.footnoteId != null ? fnOf(c.footnoteId)?.exceptions?.length ?? 0 : 0), 0);
  if (count) add('warning', 'col-exceptions-ignored', { where: at, detail: String(count) });
}
