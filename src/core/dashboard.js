// Oversikt (dashboard design 2026-10-21): what needs the planner today, what soon, and what is fine, from the lines of
// the open project. Entur wants data valid 120 days at delivery: a line ending within 30 days is for today, within 120
// days soon. Lines set not to be exported are left out (they are not delivered).
import { groupIssues } from './issue-groups.js';

/** Days ahead: under TODAY_DAYS a line's end is for today, under ENTUR_DAYS it is soon (Entur's requirement). */
export const TODAY_DAYS = 30;
export const ENTUR_DAYS = 120;
/** The marks on the validity strip. */
export const VALIDITY_MARKS = [30, 60, 90, 120];
/** A line not exported for this many days is soon ("not exported for a long time"). */
export const STALE_DAYS = 180;

/**
 * @typedef {import('./export-check.js').CheckIssue} CheckIssue
 * @typedef {import('./issue-groups.js').IssueGroup} IssueGroup
 * @typedef {{ code: string, label: string, exported: boolean, lastDay: string, issues: CheckIssue[], hash: string }} DashLine
 *   lastDay: the last day of the line's calendars (YYYYMMDD, '' for none); hash: its ERN now (core/hash.js)
 * @typedef {{ kind: 'expires', code: string, label: string, days: number, lastDay: string }
 *   | { kind: 'errors', code: string, label: string, count: number, groups: IssueGroup[] }
 *   | { kind: 'changed', codes: string[], labels: string[], code?: undefined }} TodayItem
 * @typedef {{ kind: 'expiring', code: string, label: string, days: number, lastDay: string }
 *   | { kind: 'stale', code: string, label: string, never: boolean, days: number }
 *   | { kind: 'warnings', code: string, label: string, count: number, groups: IssueGroup[] }} SoonItem
 * @typedef {{ code: string, label: string, lastDay: string, days: number, bucket: 'today' | 'soon' | 'ok' }} Validity
 * @typedef {{ today: TodayItem[], soon: SoonItem[], ok: { count: number, until: string }, validity: Validity[] }} Dashboard
 */

/** @param {Date} d */
const localDay = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
/** @param {string} ymd */
const ymdDay = (ymd) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))) / 86400000;

/**
 * @param {{ lines: DashLine[], exports: import('../project/exports-store.js').ExportRecords, today: Date }} input
 * @returns {Dashboard}
 */
export function buildDashboard({ lines, exports, today }) {
  const now = localDay(today);
  const delivered = lines.filter((l) => l.exported);
  /** @type {TodayItem[]} */ const expires = [], errors = [];
  /** @type {SoonItem[]} */ const expiring = [], stale = [], warnings = [];
  /** @type {DashLine[]} */ const changed = [];
  /** @type {Validity[]} */ const validity = [];
  /** @type {Set<string>} lines with something to say */ const flagged = new Set();

  for (const l of delivered) {
    if (l.lastDay) {
      const days = ymdDay(l.lastDay) - now;
      const bucket = days < TODAY_DAYS ? 'today' : days < ENTUR_DAYS ? 'soon' : 'ok';
      validity.push({ code: l.code, label: l.label, lastDay: l.lastDay, days, bucket });
      if (bucket === 'today') expires.push({ kind: 'expires', code: l.code, label: l.label, days, lastDay: l.lastDay });
      if (bucket === 'soon') expiring.push({ kind: 'expiring', code: l.code, label: l.label, days, lastDay: l.lastDay });
      if (bucket !== 'ok') flagged.add(l.code);
    }
    const errs = l.issues.filter((i) => i.level === 'error');
    if (errs.length) { errors.push({ kind: 'errors', code: l.code, label: l.label, count: errs.length, groups: groupIssues(errs) }); flagged.add(l.code); }
    else if (l.issues.length) { warnings.push({ kind: 'warnings', code: l.code, label: l.label, count: l.issues.length, groups: groupIssues(l.issues) }); flagged.add(l.code); }
    const record = exports[l.code];
    if (!record) { stale.push({ kind: 'stale', code: l.code, label: l.label, never: true, days: 0 }); flagged.add(l.code); }
    else if (record.hash !== l.hash) { changed.push(l); flagged.add(l.code); }
    else {
      const days = now - localDay(new Date(record.at));
      if (days > STALE_DAYS) { stale.push({ kind: 'stale', code: l.code, label: l.label, never: false, days }); flagged.add(l.code); }
    }
  }

  /** @param {{ days: number }} a @param {{ days: number }} b */
  const soonest = (a, b) => a.days - b.days;
  /** @type {TodayItem[]} */
  const todayItems = [...expires.sort(/** @type {any} */ (soonest)), ...errors];
  if (changed.length) todayItems.push({ kind: 'changed', codes: changed.map((l) => l.code), labels: changed.map((l) => l.label) });
  const fine = delivered.filter((l) => !flagged.has(l.code));
  const ends = fine.map((l) => l.lastDay).filter(Boolean).sort();
  return {
    today: todayItems,
    soon: [...expiring.sort(/** @type {any} */ (soonest)), ...stale, ...warnings],
    ok: { count: fine.length, until: ends[0] ?? '' },
    validity: validity.sort(soonest),
  };
}
