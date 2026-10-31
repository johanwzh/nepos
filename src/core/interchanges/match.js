// The feeders a hub's trip can wait for (interchanges spec 2026-10-31, "Matching and approval"): calls of trips on
// other lines in the project that may set down passengers at the hub's stops (or within its radius), arrive in the
// window before our departure (and not before the walk), meet the criteria, and run on at least one of our days.
import { lineTrips } from './trips.js';
import { lineModeOf } from '../quays.js';
import { addDays } from '../calendars.js';

/** @typedef {import('./hub.js').Hub} Hub */
/** @typedef {import('./trips.js').Trip} Trip */
/** @typedef {{ line: string, trip: string, stopId: string, arr: number, transfer: number, commonDays: number, publicCode: string, mode: string }} Candidate */

/** Metres between two points. @param {{ lat: number, lon: number }} a @param {{ lat: number, lon: number }} b */
function metres(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** @param {any} rs @param {import('./hub.js').Criteria} c */
function lineMatches(rs, c) {
  const orgs = (/** @type {'isAuthority' | 'isOperator'} */ role) => (rs.sek ?? []).filter((/** @type {any} */ s) => s[role]).map((/** @type {any} */ s) => s.orgId);
  if (c.authority?.length && !orgs('isAuthority').some((id) => c.authority?.includes(id))) return false;
  if (c.operator?.length && !orgs('isOperator').some((id) => c.operator?.includes(id))) return false;
  if (c.mode && lineModeOf(rs) !== c.mode) return false;
  if (c.submode && (rs.submode ?? '') !== c.submode) return false;
  if (c.publicCode && (rs.publicCode ?? '') !== c.publicCode) return false;
  return true;
}

/**
 * @param {Hub} hub @param {number} row the hub's row in our grid
 * @param {Trip} ourTrip a variant of our trip that calls at the row
 * @param {{ code: string, rs: any }[]} lines the project's lines (ours included; the caller leaves out the ones not exported)
 * @param {{ calendars: import('../calendars.js').Calendar[], quayInfo: Map<string, any>, ownCode: string, memo?: WeakMap<object, Trip[]> }} ctx
 * @returns {Candidate[]} by transfer, then line code
 */
export function candidates(hub, row, ourTrip, lines, { calendars, quayInfo, ownCode, memo }) {
  const ours = ourTrip?.calls.find((c) => c.ri === row);
  if (!ours || !ours.board || ours.dep == null) return [];
  const ourDays = new Set(ourTrip.days);
  const here = quayInfo.get(hub.stopId);
  const places = new Set(hub.stops);
  const placeOf = (/** @type {string} */ q) => quayInfo.get(q)?.stopPlaceId;
  const atHub = (/** @type {string} */ q) => {
    if (places.has(q) || places.has(placeOf(q) ?? '')) return true;
    const there = quayInfo.get(q);
    return !!(hub.radiusM && here && there && metres(here, there) <= hub.radiusM);
  };
  const called = new Set(hub.criteria?.calledAt ?? []);
  /** @type {Map<string, Candidate>} */
  const out = new Map();
  for (const { code, rs } of lines) {
    if (!lineMatches(rs, hub.criteria ?? {})) continue;
    for (const trip of lineTrips(rs, { calendars, memo })) {
      if (code === ownCode && trip.set === ourTrip.set) continue; // inside one table set the timetable's own marks do it
      trip.calls.forEach((call, i) => {
        if (!call.alight || call.arr == null || !atHub(call.stopId)) return;
        if (called.size && !trip.calls.slice(0, i).some((c) => called.has(c.stopId) || called.has(placeOf(c.stopId) ?? ''))) return;
        let transfer = ours.dep - call.arr;
        let shift = 0;
        // Our trip just after midnight on its own date meets the evening before's feeder
        if (transfer < 0 && transfer + 1440 <= hub.window[1]) { transfer += 1440; shift = 1; }
        if (transfer < hub.window[0] || transfer > hub.window[1] || transfer < hub.walk) return;
        const common = trip.days.filter((d) => ourDays.has(shift ? addDays(d, shift) : d)).length;
        if (!common) return;
        const key = `${code}|${trip.uid}|${call.stopId}|${call.arr}`;
        const prev = out.get(key);
        if (prev) { prev.commonDays += common; return; } // another variant of the same trip
        out.set(key, { line: code, trip: trip.uid, stopId: call.stopId, arr: call.arr, transfer, commonDays: common, publicCode: rs.publicCode ?? '', mode: lineModeOf(rs) });
      });
    }
  }
  return [...out.values()].sort((a, b) => a.transfer - b.transfer || a.line.localeCompare(b.line));
}
