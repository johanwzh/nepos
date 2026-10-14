// The check that runs before an export (spec §9, §7.2, §8): everything that would make the NeTEx
// wrong or surprising. Errors block the export; warnings are shown and never block. Quay status
// from NSR is advisory, so it only ever gives warnings. Pure.
import { quayStatus, stopLocalId } from './quays.js';
import { ORG_ID_PATTERN } from './orgs.js';

/**
 * @typedef {{ level: 'error' | 'warning', code: string, route?: string,
 *             where?: { period: string, direction: string, column?: number }, detail?: string }} CheckIssue
 */

/** @param {any} cell */
const timed = (cell) => !!cell?.time && cell.time !== '|';
/** @param {string[]} names */
const list = (names) => names.slice(0, 3).join(', ') + (names.length > 3 ? ` (+${names.length - 3})` : '');
/** @param {any} cell */
const minutes = (cell) => (cell.dayOffset || 0) * 1440 + Number(cell.time.slice(0, 2)) * 60 + Number(cell.time.slice(2, 4));

/**
 * @param {{ routes: { code: string, rs: any | null, status: string }[],
 *           orgs: { id: string, name: string }[], orgsProblem: '' | 'unreadable' | 'not-saved',
 *           quayInfo: Map<string, any> }} input
 * @returns {CheckIssue[]} errors first, then warnings
 */
export function checkForExport({ routes, orgs, orgsProblem, quayInfo }) {
  /** @type {CheckIssue[]} */
  const issues = [];
  /** @param {'error' | 'warning'} level @param {string} code @param {Partial<CheckIssue>} [extra] */
  const add = (level, code, extra = {}) => { issues.push({ level, code, ...extra }); };

  if (orgsProblem === 'unreadable') add('error', 'orgs-unreadable');
  if (orgsProblem === 'not-saved') add('error', 'orgs-not-saved');

  /** @type {Map<string, string>} NeTEx local ID → the first stop ID that produced it */
  const localIds = new Map();
  let trips = 0, damaged = 0;
  for (const { code, rs, status } of routes) {
    if (status === 'damaged' || !rs) { add('error', 'route-damaged', { route: code }); damaged++; continue; }
    trips += checkRoute(code, rs, { orgs, quayInfo, add, localIds });
  }
  if (!trips && !damaged) add('error', 'no-trips');

  return [...issues.filter((i) => i.level === 'error'), ...issues.filter((i) => i.level === 'warning')];
}

/**
 * @param {string} code
 * @param {any} rs
 * @param {{ orgs: { id: string }[], quayInfo: Map<string, any>, localIds: Map<string, string>,
 *           add: (level: 'error' | 'warning', code: string, extra?: Partial<CheckIssue>) => void }} ctx
 * @returns {number} trips (columns with times) in the route
 */
function checkRoute(code, rs, { orgs, quayInfo, add, localIds }) {
  const r = { route: code };
  if (!rs.routeName?.trim()) add('warning', 'no-name', r);
  if (!rs.periods?.length) { add('error', 'no-period', r); return 0; }

  for (const per of rs.periods) {
    if (!per.from || !per.to) add('error', 'period-dates', { ...r, detail: per.name });
    else if (per.from > per.to) add('error', 'period-order', { ...r, detail: per.name });
    if ((per.from2 || per.to2) && (!per.from2 || !per.to2 || per.from2 > per.to2)) add('warning', 'alt-dates', { ...r, detail: per.name });
  }

  const sek = rs.sek ?? [];
  if (!sek.some((/** @type {any} */ s) => s.isAuthority)) add('error', 'no-authority', r);
  if (!sek.some((/** @type {any} */ s) => s.isOperator)) add('error', 'no-operator', r);
  for (const s of sek) {
    if (!ORG_ID_PATTERN.test(s.orgId)) add('warning', 'org-id-old', { ...r, detail: s.orgId });
    else if (!orgs.some((o) => o.id === s.orgId)) add('warning', 'org-not-in-list', { ...r, detail: s.orgId });
  }

  let trips = 0;
  for (const per of rs.periods) {
    for (const dir of rs.directions ?? []) {
      const grid = rs.grids[`${per.id}:${dir.id}`];
      if (!grid) continue;
      const where = { period: per.name, direction: dir.name };

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
        trips++;
        const at = { ...where, column: ci + 1 };
        // An empty day code would be exported as "every day" — never what the user meant.
        if (!col.dayCode) add('error', 'col-no-daycode', { ...r, where: at });
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
