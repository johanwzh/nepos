// Analyse (spec 2026-10-31): one fact per trip, read from a line exactly as the export reads it (eachTrip: expanded
// blocks, the day code and the trip's own dates, variants). The receipt only adds these up; nothing here is a warning.
// km is known only when every leg has a link the export would write (isExportable): no straight-line estimates.
import { eachTrip } from '../link-pairs.js';
import { isExportable } from '../link-state.js';
import { profileFor } from '../../routing/profiles.js';

/** @typedef {{ stopId: string, arr: number, dep: number }} FactCall minutes from the start date's midnight (may pass 1440) */
/** @typedef {{ key: string, km: number | null }} FactLeg key `${from}|${to}|${profile ?? 'none'}` */
/**
 * @typedef {{ line: string, mode: string, profile: import('../../routing/profiles.js').Profile | null, days: string[],
 *   start: number, end: number, runMin: number, calls: FactCall[], legs: FactLeg[], km: number | null,
 *   stopPlaces: string[], fuel: string, seats: number | null, lowFloor: boolean, booked: boolean }} TripFact
 */

/** A cell's clock: day offset, hours and minutes. @param {any} cell */
const clock = (cell) => (cell?.dayOffset || 0) * 1440 + Number(cell.time.slice(0, 2)) * 60 + Number(cell.time.slice(2, 4));

/**
 * @param {string} code @param {any} rs the line as it is now
 * @param {{ calendars: import('../calendars.js').Calendar[], quayInfo: Map<string, any>,
 *   links: Record<string, import('../link-state.js').SavedLink> | undefined, vehicles: { name: string, fuelType?: string, seats?: number | null, lowFloor?: boolean }[] }} ctx
 *   links: the line's routed links by key
 * @returns {TripFact[]}
 */
export function lineFacts(code, rs, { calendars, quayInfo, links, vehicles }) {
  const mode = rs?.mode || '';
  const profile = profileFor(rs?.mode ?? '', rs?.submode ?? '');
  /** @type {TripFact[]} */
  const out = [];
  eachTrip(rs, { calendars }, (stops, _uid, { col, days }) => {
    if (!days.length || stops.length < 2) return;
    // A time far earlier than the one before is past midnight without a day offset (as speed-profile.js reads it)
    let last = -Infinity, add = 0;
    const at = (/** @type {number} */ m) => { let v = m + add; if (v < last - 720) { add += 1440; v += 1440; } last = v; return v; };
    /** @type {FactCall[]} */
    const calls = stops.map((c) => {
      const arr = at(clock(c.arrCell ?? c.depCell));
      const dep = c.arrCell ? at(clock(c.depCell)) : arr;
      return { stopId: c.stopId, arr, dep };
    });
    /** @type {FactLeg[]} */
    const legs = [];
    for (let i = 1; i < calls.length; i++) {
      const key = `${calls[i - 1].stopId}|${calls[i].stopId}|${profile ?? 'none'}`;
      const saved = profile ? links?.[key] : undefined;
      legs.push({ key, km: saved && isExportable(key, saved, quayInfo) ? saved.distanceM / 1000 : null });
    }
    const known = legs.every((l) => l.km != null);
    const v = col.vehicle ? vehicles.find((x) => x.name === col.vehicle) : undefined;
    const start = calls[0].dep, end = calls[calls.length - 1].arr;
    out.push({ line: code, mode, profile, days, start, end, runMin: end - start, calls, legs,
      km: known ? legs.reduce((n, l) => n + /** @type {number} */ (l.km), 0) : null,
      stopPlaces: [...new Set(calls.map((c) => quayInfo.get(c.stopId)?.stopPlaceId ?? c.stopId))],
      fuel: v?.fuelType ?? '', seats: v?.seats ?? null, lowFloor: v?.lowFloor === true,
      booked: !!(rs.booking || col.booking || stops.some((c) => c.depCell?.booking || c.arrCell?.booking)) });
  });
  return out;
}
