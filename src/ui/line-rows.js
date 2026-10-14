// The rows of the lines pane (navigation spec §3), shared by the mini and the maxi view: what
// each line is now (unsaved edits included), its valid period, flags and check result.
import { app } from './state.js';
import { routeSummary } from './route-summary.js';
import { lineIssues } from './line-info.js';
import { isUnsaved } from './drafts.js';
import { findRole, orgRole } from '../core/orgs.js';
import { normalizeRanges } from '../core/calendars.js';

/**
 * @typedef {{ code: string, name: string, publicCode: string, label: string, mode: string, submode: string,
 *   brandingId: string, brand: string, authority: string, operator: string, orgIds: string[],
 *   firstDay: string, lastDay: string, expired: boolean, exported: boolean, isPublic: boolean,
 *   unsaved: boolean, damaged: boolean, errors: number, warnings: number }} LineRow
 * @typedef {{ col: string, dir: 1 | -1 }} LineSort
 */

const SORT_KEY = 'nepos.lineSort';

/** @returns {LineSort} */
export function loadLineSort() {
  try {
    const v = JSON.parse(localStorage.getItem(SORT_KEY) ?? 'null');
    if (v && typeof v.col === 'string' && (v.dir === 1 || v.dir === -1)) return v;
  } catch { /* the default */ }
  return { col: 'code', dir: 1 };
}

/** @param {LineSort} sort */
export function saveLineSort(sort) {
  try { localStorage.setItem(SORT_KEY, JSON.stringify(sort)); } catch { /* not remembered */ }
}

const today = () => { const n = new Date(); return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}`; };

/** @param {string} id */
function orgName(id) {
  const found = findRole(app.orgs, id);
  return found ? found.company.name || id : id;
}

/** @param {string} code @param {any} rs */
function liveSummary(code, rs) {
  const sek = /** @type {any[]} */ (rs.sek ?? []);
  return {
    name: rs.routeName ?? '', publicCode: rs.publicCode ?? '', mode: rs.mode ?? '', submode: rs.submode ?? '',
    brandingId: rs.brandingId ?? '', exported: rs.exported !== false, isPublic: rs.isPublic !== false,
    calendarIds: [...new Set(/** @type {any[]} */ (rs.periods ?? []).flatMap((p) => p.calendarIds ?? []))],
    orgIds: [...sek.filter((s) => s.isAuthority), ...sek.filter((s) => !s.isAuthority)].map((s) => String(s.orgId)).filter((id) => id && id !== '-1'),
  };
}

/** @returns {LineRow[]} */
export function lineRows() {
  const now = today();
  return app.routes.map((r) => {
    const live = r.code === app.activeRoute && app.routeState ? app.routeState : app.drafts.get(r.code);
    const s = live ? liveSummary(r.code, live) : routeSummary(r.text);
    let firstDay = '', lastDay = '';
    for (const id of s.calendarIds) {
      const cal = app.calendars.find((c) => c.id === id);
      for (const [a, b] of cal ? normalizeRanges(cal.ranges) : []) {
        if (!firstDay || a < firstDay) firstDay = a;
        if (!lastDay || b > lastDay) lastDay = b;
      }
    }
    const brand = s.brandingId ? app.brandings.find((b) => b.id === s.brandingId)?.name ?? '' : '';
    const issues = lineIssues(r.code);
    const errors = issues.filter((i) => i.level === 'error').length;
    const authId = s.orgIds.find((id) => orgRole(id) === 'authority' || findRole(app.orgs, id)?.role === 'authority') ?? '';
    const operId = s.orgIds.find((id) => id !== authId) ?? '';
    return {
      code: r.code, name: s.name, publicCode: s.publicCode,
      label: s.publicCode || brand || s.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3),
      mode: s.mode, submode: s.submode, brandingId: s.brandingId, brand,
      authority: authId ? orgName(authId) : '', operator: operId ? orgName(operId) : '', orgIds: s.orgIds,
      firstDay, lastDay, expired: !!lastDay && lastDay < now, exported: s.exported, isPublic: s.isPublic,
      unsaved: isUnsaved(r.code), damaged: r.status === 'damaged', errors, warnings: issues.length - errors,
    };
  });
}

/** @type {Record<string, (r: LineRow) => string | number>} */
const KEYS = {
  code: (r) => r.publicCode, name: (r) => r.name, mode: (r) => r.mode, branding: (r) => r.brand,
  authority: (r) => r.authority, operator: (r) => r.operator, valid: (r) => r.firstDay,
  exported: (r) => (r.exported ? 1 : 0), public: (r) => (r.isPublic ? 1 : 0),
  status: (r) => r.errors * 10000 + r.warnings * 10 + (r.unsaved ? 1 : 0),
};

/**
 * @param {LineRow[]} rows
 * @param {LineSort} sort
 */
export function sortLines(rows, sort) {
  const key = KEYS[sort.col] ?? KEYS.code;
  /** @param {string | number} a @param {string | number} b */
  const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'nb', { numeric: true }));
  return [...rows].sort((a, b) => sort.dir * (cmp(key(a), key(b)) || a.name.localeCompare(b.name, 'nb')));
}
