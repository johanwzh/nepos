// The check that runs before an export (spec §9, §7.2, §8): everything that would make the NeTEx
// wrong or surprising. Errors block the export; warnings are shown and never block. Quay status
// from NSR is advisory, so it only ever gives warnings. Pure.
import { quayStatus, stopLocalId, lineModeOf } from './quays.js';
import { findRole, aliasIssues, orgRole } from './orgs.js';
import { ROUTE_CODE_PATTERN } from './route-names.js';
import { journeyStops, tripVariants } from './netex/journeys.js';
import { calendarDays, unionDays, tripDays } from './calendars.js';
import { isAllowedDayCode } from './day-codes.js';
import { TRANSMODEL_MODES } from './modes.js';
import { destSegments, hasViaWord, firstWord } from './destinations.js';
import { speedProfile, SPEED_LIMITS, HIGH_LIMIT } from './speed-profile.js';
import { ERN_MODES } from './ern/modes.js';
import { expandRoute } from './blocks.js';
import { linkPairs } from './link-pairs.js';
import { isExportable } from './link-state.js';
import { normalizeBooking, bookingProblems } from './booking.js';

/** Every code the check can give; each has a text 'chk:<code>' in both languages. */
export const CHECK_CODES = [
  'orgs-unreadable', 'route-damaged', 'no-trips', 'route-code', 'no-period', 'no-authority', 'no-operator', 'stop-missing', 'stop-not-nsr', 'stop-id-clash', 'col-no-daycode',
  'col-one-stop', 'no-name', 'org-not-in-register', 'org-register-missing', 'org-alias-format', 'org-alias-duplicate', 'org-not-in-project', 'no-mode', 'branding-missing', 'brandings-unreadable', 'table-set-name', 'no-calendar',
  'calendar-missing', 'calendar-empty', 'day-code', 'no-operating-days', 'calendars-unreadable', 'stop-not-seen', 'stop-mode',
  'stop-unchecked', 'col-decreasing', 'cell-dates-also', 'cell-dates-short', 'route-no-trips',
  'route-changed-on-disk', 'org-alias-missing', 'no-submode', 'speed-over', 'speed-limit-high', 'link-blocked', 'link-missing', 'link-detour', 'dest-missing', 'dest-last-dropped', 'dest-via-text', 'dest-unserved', 'dest-not-on-route', 'vehicle-mode',
];

/**
 * @typedef {{ level: 'error' | 'warning', code: string, route?: string,
 *             where?: { tableSet: string, period: string, column?: number, row?: number, setId?: number, periodId?: number }, detail?: string }} CheckIssue
 */

/** @param {any} cell */
const timed = (cell) => !!cell?.time && cell.time !== '|';
/** @param {string[]} names */
const list = (names) => names.slice(0, 3).join(', ') + (names.length > 3 ? ` (+${names.length - 3})` : '');
/** @param {any} cell */
const minutes = (cell) => (cell.dayOffset || 0) * 1440 + Number(cell.time.slice(0, 2)) * 60 + Number(cell.time.slice(2, 4));

/**
 * @param {{ routes: { code: string, rs: any | null, status: string, problem?: string }[],
 *           orgs: import('./orgs.js').Company[], register: import('./orgs.js').Company[] | null,
 *           orgMode: 'codespace' | 'nog', codespace: string, orgsProblem: '' | 'unreadable',
 *           brandings: { id: string }[], brandingsProblem?: '' | 'unreadable',
 *           calendars: import('./calendars.js').Calendar[], calendarsProblem?: '' | 'unreadable',
 *           quayInfo: Map<string, any>, changedOnDisk?: string[], speedLimits?: Record<string, number> | null,
 *           shapes?: Map<string, import('./link-state.js').SavedShape>,
 *           vehicles?: { name: string, transportMode?: string }[] }} input   shapes: the routed links (2.3); none given, no link checks. vehicles: the project's (a trip's vehicle must run the line's mode)
 * @returns {CheckIssue[]} errors first, then warnings
 */
export function checkForExport({ routes, orgs, register, orgMode, codespace, orgsProblem, brandings, brandingsProblem = '', calendars = [], calendarsProblem = '', quayInfo, changedOnDisk = [], speedLimits = null, shapes = undefined, vehicles = [] }) {
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
  /** @type {Set<string>} the modes of the exported lines */
  const modesUsed = new Set();
  let trips = 0, damaged = 0;
  for (const code of changedOnDisk) add('warning', 'route-changed-on-disk', { route: code });
  for (const { code, rs, status, problem } of routes) {
    if (status === 'damaged' || !rs) { add('error', 'route-damaged', { route: code, detail: problem || undefined }); damaged++; continue; }
    // The route code becomes part of NeTEx IDs and the line file name.
    if (!ROUTE_CODE_PATTERN.test(code)) add('error', 'route-code', { route: code });
    // A block's trips are checked as the export writes them, their problems shown on the parent column
    const routeTrips = checkRoute(code, expandRoute(rs), { orgs: register ?? orgs, copy: orgMode === 'codespace' ? orgs : null, brandings, calendars, quayInfo, add, localIds, usedOrgIds, speedLimits, modesUsed });
    if (!routeTrips) add('warning', 'route-no-trips', { route: code });
    if (shapes) checkLinks(code, rs, { shapes, calendars, quayInfo, add });
    checkVehicles(code, rs, vehicles, add);
    checkBookings(code, rs, add);
    trips += routeTrips;
  }
  if (orgMode === 'codespace') {
    const used = orgs.map((c) => ({ ...c,
      authority: c.authority && usedOrgIds.has(c.authority.id) ? c.authority : null,
      operator: c.operator && usedOrgIds.has(c.operator.id) ? c.operator : null }));
    for (const i of aliasIssues(used, codespace)) add(i.code === 'org-alias-missing' ? 'warning' : 'error', i.code, { detail: i.alias });
  }
  if (!trips && !damaged) add('error', 'no-trips');
  // The project's own speed level far above the default: Entur may not accept such speeds (customer 2026-10-19)
  for (const [m, v] of Object.entries(speedLimits ?? {})) {
    const normal = SPEED_LIMITS[m];
    if (modesUsed.has(m) && normal && v > normal * HIGH_LIMIT) add('warning', 'speed-limit-high', { detail: `${m}: ${v} km/h` });
  }

  return [...issues.filter((i) => i.level === 'error'), ...issues.filter((i) => i.level === 'warning')];
}

/**
 * @param {string} code
 * @param {any} rs
 * @param {{ orgs: import('./orgs.js').Company[], quayInfo: Map<string, any>, localIds: Map<string, string>, usedOrgIds: Set<string>, copy: import('./orgs.js').Company[] | null, brandings: { id: string }[], calendars: import('./calendars.js').Calendar[],
 *           add: (level: 'error' | 'warning', code: string, extra?: Partial<CheckIssue>) => void, speedLimits: Record<string, number> | null, modesUsed: Set<string> }} ctx
 * @returns {number} trips (columns with times) in the route
 */
function checkRoute(code, rs, { orgs, copy, brandings, calendars, quayInfo, add, localIds, usedOrgIds, speedLimits, modesUsed }) {
  const addIssue = add;
  const mode = rs.mode || /** @type {any} */ (ERN_MODES)[rs.transportMode ?? 0]?.mode || '';
  modesUsed.add(mode);
  const r = { route: code };
  // Line details (line header spec §7)
  if (!rs.routeName?.trim()) add('error', 'no-name', r);
  if (!rs.mode || rs.mode === 'other') add('error', 'no-mode', r); // 'other' is what a new line starts as
  // A mode with submodes needs one (user 2026-10-19); lift, trolleyBus, ferry and other have none
  else if (!rs.submode && (TRANSMODEL_MODES.find((m) => m.mode === rs.mode)?.submodes.length ?? 0) > 0) add('error', 'no-submode', r);
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
    if (!set.name?.trim()) add('error', 'table-set-name', { ...r, where: { tableSet: '', period: '', setId: set.id } });
    const pers = (rs.periods ?? []).filter((/** @type {any} */ p) => p.setId === set.id);
    if (!pers.length) add('error', 'no-period', { ...r, detail: set.name, where: { tableSet: set.name, period: '', setId: set.id } });
    for (const per of pers) {
      const label = per.calendarIds.map((/** @type {string} */ id) => calendars.find((c) => c.id === id)?.name ?? id).join(' + ');
      const where = { tableSet: set.name, period: label, setId: set.id, periodId: per.id };
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
        const status = quayStatus(id, id ? quayInfo.get(id) : undefined, lineModeOf(rs));
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
      if (byStatus['mode-mismatch'].length) add('error', 'stop-mode', { ...r, where, detail: list(byStatus['mode-mismatch']) });
      if (byStatus.unknown.length) add('warning', 'stop-unchecked', { ...r, where, detail: list(byStatus.unknown) });

      /** @type {Set<string>} */
      const said = new Set();
      // Two trips with the same times at the same stops on a shared day (user 2026-10-24): easy with blocks, e.g. a
      // block every 30 min over a real 07:05, or a 1 and a D that meet on Mondays. A warning: the user decides.
      /** @type {Map<string, { ci: number, days: Set<string> }[]>} */
      const seen = new Map();
      grid.cols.forEach((/** @type {any} */ col, /** @type {number} */ ci) => {
        const calls = journeyStops(grid, col);
        if (calls.length < 2) return;
        const key = calls.map((c) => `${c.stopId}@${c.depCell.dayOffset || 0}:${c.depCell.time}`).join('|');
        const days = new Set(tripDays(periodDays, col));
        const list = seen.get(key) ?? [];
        if (list.some((o) => [...days].some((d) => o.days.has(d)))) add('warning', 'trip-duplicate', { ...r, where: { ...where, column: (col.parentCi ?? ci) + 1 } });
        list.push({ ci, days });
        seen.set(key, list);
      });
      grid.cols.forEach((/** @type {any} */ col, /** @type {number} */ ci) => {
        // A block waiting for times (its parent has none left) is an error on the parent
        if (col.block && !col.cells.some(timed)) { addIssue('error', 'block-empty', { ...r, where: { ...where, column: ci + 1 } }); return; }
        if (!col.cells.some(timed)) return;
        const at = { ...where, column: (col.parentCi ?? ci) + 1 };
        // a on a trip's first stop or p on its last leaves nobody getting on or off there (Antu: "JourneyPattern stop
        // point without boarding or alighting"; user 2026-10-27)
        const calls = journeyStops(grid, col);
        if (calls.length >= 2 && col.parentCi == null) { // a block's trips: said once, on the first trip
          if (calls[0].depCell.suffix === 'a') addIssue('error', 'stop-no-use', { ...r, where: { ...at, row: calls[0].ri } });
          const last = calls[calls.length - 1];
          if ((last.arrCell ?? last.depCell).suffix === 'p' || last.depCell.suffix === 'p') addIssue('error', 'stop-no-use', { ...r, where: { ...at, row: last.ri } });
        }
        // A guarantee says little without how long the trip waits (user 2026-10-24; Antu INTERCHANGE_2/3)
        if (col.cells.some((/** @type {any} */ c) => c?.interchange?.type === 'guaranteed' && !c.interchange.maxWait)) addIssue('warning', 'ix-no-wait' /* none, or 0 minutes (user 2026-10-26) */, { ...r, where: at });
        // A block's trips share their parent's problems: each is said once
        const add = (/** @type {'error' | 'warning'} */ level, /** @type {string} */ c, /** @type {any} */ extra) => {
          const key = `${level}|${c}|${JSON.stringify(extra)}`;
          if (!said.has(key)) { said.add(key); addIssue(level, c, extra); }
        };
        // What the export writes (journeys.js): two or more calls make a trip. Timed rows
        // without a stop ID count too here — they are already errors of their own.
        const unnamed = grid.stops.filter((/** @type {any} */ st, /** @type {number} */ ri) => timed(col.cells[ri]) && (st.stopId == null || st.stopId === '') && !st.isDwellArr).length;
        if (journeyStops(grid, col).length + unnamed >= 2) trips++;
        else add('error', 'col-one-stop', { ...r, where: at });
        checkCellDates(grid, col, periodDays, at, (level, c, extra) => add(level, c, { ...r, ...extra }));
        // A red arc in the speed strip: faster than the mode's level, even in a straight line (user 2026-10-19)
        const profile = speedProfile(grid, col, quayInfo, mode, speedLimits);
        const over = profile.legs.filter((l) => l.kind === 'over');
        if (over.length) {
          const worst = over.reduce((a, b) => (/** @type {number} */ (b.kmh) > /** @type {number} */ (a.kmh) ? b : a));
          add('error', 'speed-over', { ...r, where: { ...at, row: worst.to }, detail: `${worst.fromName} → ${worst.toName}: ${Math.round(/** @type {number} */ (worst.kmh))} km/h (${profile.limit})` });
        }
        if (journeyStops(grid, col).length >= 2) checkDestinations(grid, col, (level, c, extra) => add(level, c, { ...r, where: at, ...extra }));
        // An empty day code would be exported as "every day" — never what the user meant.
        if (!col.dayCode) add('error', 'col-no-daycode', { ...r, where: at });
        else if (!isAllowedDayCode(col.dayCode)) add('error', 'day-code', { ...r, where: at, detail: col.dayCode });
        else if (journeyStops(grid, col).length >= 2 && !tripDays(periodDays, col).length) add('warning', 'no-operating-days', { ...r, where: at });
        let prev = -1;
        grid.stops.forEach((/** @type {any} */ stop, /** @type {number} */ ri) => {
          const cell = col.cells[ri];
          if (!timed(cell)) return;
          const m = minutes(cell);
          if (prev >= 0 && m < prev) add('error', 'col-decreasing', { ...r, where: at, detail: `${stop.name} ${cell.time}` });
          prev = m;
        });
      });
    }
  }
  return trips;
}

/**
 * Routed links (design §7): a blocked link, a pattern left without links (no route, or not routed yet) and a long
 * detour are warnings; a link problem never blocks the export (Entur's import then makes its own links).
 * @param {string} code @param {any} rs
 * @param {{ shapes: Map<string, any>, calendars: any[], quayInfo: Map<string, any>, add: (level: 'error' | 'warning', code: string, extra?: Partial<CheckIssue>) => void }} ctx
 */
function checkLinks(code, rs, { shapes, calendars, quayInfo, add }) {
  const name = (/** @type {{ quayId: string }} */ q) => quayInfo.get(q.quayId)?.stopPlaceName || q.quayId;
  /** @type {string[]} */ const blockedPairs = [], detours = [];
  let none = 0, notYet = 0;
  for (const p of linkPairs(rs, { calendars, quayInfo })) {
    const s = shapes.get(p.key);
    const label = `${name(p.from)} – ${name(p.to)}`;
    if (!s) notYet++;
    else if (s.status === 'BLOCKED') blockedPairs.push(label);
    else if (s.status !== 'OK') none++;
    else if (!isExportable(p.key, s, quayInfo)) notYet++;
    else if (s.warnings?.includes('long detour')) detours.push(label);
  }
  if (blockedPairs.length) add('warning', 'link-blocked', { route: code, detail: list(blockedPairs) });
  if (none + notYet) add('warning', 'link-missing', { route: code, detail: `${none}|${notYet}` });
  if (detours.length) add('warning', 'link-detour', { route: code, detail: list(detours) });
}

/**
 * A trip's vehicle must run the line's mode (user 2026-10-20): one error per vehicle and line. A vehicle without a
 * mode, or a name no longer in the list, is not checked.
 * @param {string} code @param {any} rs @param {{ name: string, transportMode?: string }[]} vehicles
 * @param {(level: 'error' | 'warning', code: string, extra?: Partial<CheckIssue>) => void} add
 */
function checkVehicles(code, rs, vehicles, add) {
  if (!vehicles.length) return;
  const mode = rs.mode || /** @type {any} */ (ERN_MODES)[rs.transportMode ?? 0]?.mode || '';
  /** @type {Set<string>} */ const said = new Set();
  for (const grid of Object.values(rs.grids ?? {})) {
    for (const col of /** @type {any} */ (grid).cols ?? []) {
      const v = col.vehicle ? vehicles.find((x) => x.name === col.vehicle) : null;
      if (!v?.transportMode || v.transportMode === mode || said.has(v.name)) continue;
      said.add(v.name);
      add('error', 'vehicle-mode', { route: code, detail: v.name });
    }
  }
}

/**
 * A booking needs a way to book: a phone number, an e-mail or a web address (booking spec 2026-10-22). One warning per
 * line. @param {string} code @param {any} rs @param {(level: 'error' | 'warning', code: string, extra?: Partial<CheckIssue>) => void} add
 */
function checkBookings(code, rs, add) {
  // Where each booking is (user 2026-10-25): the line's, a trip's (its column) or a time's (its column and row), so the
  // problem list can take the user to it
  /** @type {{ booking: any, where?: any, detail?: string }[]} */
  const all = [{ booking: rs.booking, detail: 'line' }];
  for (const set of rs.tableSets ?? []) for (const per of (rs.periods ?? []).filter((/** @type {any} */ p) => p.setId === set.id)) {
    const grid = rs.grids?.[`${per.id}:${set.id}`];
    if (!grid) continue;
    const at = { tableSet: set.name, period: '', setId: set.id, periodId: per.id };
    grid.cols.forEach((/** @type {any} */ col, /** @type {number} */ ci) => {
      if (col.virt) return;
      all.push({ booking: col.booking, where: { ...at, column: ci + 1 } });
      (col.cells ?? []).forEach((/** @type {any} */ c, /** @type {number} */ ri) => all.push({ booking: c?.booking, where: { ...at, column: ci + 1, row: ri } }));
    });
  }
  for (const { booking, where, detail } of all) {
    const n = normalizeBooking(booking);
    if (!n) continue;
    const extra = { route: code, ...(where ? { where } : {}), ...(detail ? { detail } : {}) };
    if (!n.phone && !n.email && !n.url) add('warning', 'booking-no-contact', extra);
    // What Antu refuses (BookWhen / LatestBookingTime / MinimumBookingPeriod) and a way to book without its contact
    for (const p of bookingProblems(n)) add('error', p, extra);
  }
}

/** The "not one of the stops this trip goes on to" warning: off for now (user 2026-10-20). */
const DEST_NOT_ON_ROUTE = false;

/**
 * A trip's destinations (destination displays spec): every trip needs one; "via" is data, not text;
 * a change on a stop the trip does not serve, and a destination or via the trip does not go on to,
 * are warnings (destinations are not linked to stops, so the user has to be attentive).
 * @param {any} grid @param {any} col
 * @param {(level: 'error' | 'warning', code: string, extra?: Partial<CheckIssue>) => void} add
 */
function checkDestinations(grid, col, add) {
  if (!col.dest) { add('error', 'dest-missing'); return; }
  /** @type {Set<string>} */ const said = new Set();
  /** @type {typeof add} */ const once = (level, code, extra) => { const k = `${code}|${extra?.detail ?? ''}`; if (!said.has(k)) { said.add(k); add(level, code, extra); } };
  const calls = journeyStops(grid, col);
  const word = (/** @type {string} */ s) => firstWord(s).toLowerCase();
  for (const seg of destSegments(grid, col)) {
    if (hasViaWord(seg.dest.text)) once('error', 'dest-via-text', { detail: seg.dest.text });
    if (seg.state === 'unserved') { once('warning', 'dest-unserved', { detail: grid.stops[seg.row]?.name ?? '' }); continue; }
    if (seg.state === 'last') { once('warning', 'dest-last-dropped', { detail: grid.stops[seg.row]?.name ?? '' }); continue; }
    // 'dest-not-on-route' (a destination or via the trip does not go on to) is off for now: too repetitive (user
    // 2026-10-20). Its code and texts are kept; set DEST_NOT_ON_ROUTE to bring it back.
    if (seg.state !== 'ok' || !DEST_NOT_ON_ROUTE) continue;
    const ahead = new Set(calls.filter((c) => c.ri > seg.row).map((c) => word(c.name)));
    for (const text of [seg.dest.text, ...seg.dest.vias]) if (!ahead.has(word(text))) once('warning', 'dest-not-on-route', { detail: text });
  }
}

/**
 * Dates on a single time (user 2026-10-17): a time can be switched off on some of the trip's days, which
 * splits the trip in the export. "Runs also" on a single time does nothing; days on which only one stop
 * is left are not exported.
 * @param {any} grid @param {any} col @param {string[]} periodDays
 * @param {{ tableSet: string, period: string, column: number }} at
 * @param {(level: 'error' | 'warning', code: string, extra?: Partial<CheckIssue>) => void} add
 */
function checkCellDates(grid, col, periodDays, at, add) {
  if (col.cells.some((/** @type {any} */ c) => c?.dates?.some((/** @type {any} */ d) => d.on))) add('warning', 'cell-dates-also', { where: at });
  const short = tripVariants(grid, col, tripDays(periodDays, col)).filter((v) => v.calls.length < 2).reduce((n, v) => n + v.days.length, 0);
  if (short && journeyStops(grid, col).length >= 2) add('warning', 'cell-dates-short', { where: at, detail: String(short) });
}
