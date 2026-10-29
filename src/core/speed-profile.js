// The speed profile of one trip (user test 2026-10-16): for each leg between two calls, the
// straight-line distance over the running time. The road is always longer, so this is the lowest
// speed that could work: if even that is too fast, a time or a stop is wrong. Pure.
// - Stops are placed by their share of the trip's running time (0 … 1).
// - The same stop twice in a row (or two calls a few metres apart) is a layover: no speed.
// - Times past midnight: a later day (dayOffset) or the clock wrapping round. A time that goes
//   backwards is flagged; the stops never move backwards on the line.
// - Seconds are never typed (2.5, user 2026-10-29): a trip's first departure and a departure after a wait or a
//   layover are taken as :00, every other time as somewhere in its minute (:00–:59). Each leg gets the slowest and
//   fastest speed those windows allow; the trip gets its own average (km over running minutes, layovers left out).
import { journeyStops } from './netex/journeys.js';

/** Warning levels, straight-line km/h, per NeTEx mode. */
export const SPEED_LIMITS = /** @type {Record<string, number>} */ ({
  bus: 80, coach: 100, tram: 60, metro: 80, rail: 200, water: 60, air: 900, funicular: 30, cableway: 40, taxi: 100,
});
const DEFAULT_LIMIT = 100;
/** A project's own level above this many times the default: Entur may not accept it (customer 2026-10-19). */
export const HIGH_LIMIT = 1.5;

/**
 * The red level for a mode: the project's own (Prosjektinnstillinger), else the default.
 * @param {string} mode @param {Record<string, number> | null} [limits] the project's levels
 */
export function speedLimit(mode, limits) {
  const own = limits?.[mode];
  return typeof own === 'number' && Number.isFinite(own) && own > 0 ? own : SPEED_LIMITS[mode] ?? DEFAULT_LIMIT;
}
/** Near the limit: from this share of it. */
const NEAR = 0.8;
/** Closer than this (km) counts as the same place. */
const SAME_PLACE_KM = 0.05;

/**
 * @typedef {{ ri: number, name: string, bold: boolean, x: number, lat: number, lon: number }} ProfilePoint
 * @typedef {{ from: number, to: number, fromName: string, toName: string, minutes: number, km: number,
 *             kmh: number | null, kmhMin: number | null, kmhMax: number | null,
 *             kind: 'ok' | 'warn' | 'over' | 'zero' | 'negative' | 'layover' }} ProfileLeg
 */

/** @param {any} cell */
const clock = (cell) => (cell.dayOffset || 0) * 1440 + Number(cell.time.slice(0, 2)) * 60 + Number(cell.time.slice(2, 4));

/** Great-circle distance in km. @param {{ lat: number, lon: number }} a @param {{ lat: number, lon: number }} b */
function km(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * @param {{ stops: any[] }} grid
 * @param {{ cells: any[] }} col
 * @param {Map<string, { lat: number | null, lon: number | null } | null>} quayInfo
 * @param {string} mode the line's NeTEx mode
 * @param {Record<string, number> | null} [limits] the project's own levels
 * @returns {{ points: ProfilePoint[], legs: ProfileLeg[], limit: number, avg: number | null }}
 */
export function speedProfile(grid, col, quayInfo, mode, limits) {
  const limit = speedLimit(mode, limits);
  const calls = journeyStops(grid, col).flatMap((c) => {
    const pos = quayInfo.get(c.stopId);
    return pos?.lat != null && pos.lon != null ? [{ ...c, lat: pos.lat, lon: pos.lon, arr: clock(c.arrCell ?? c.depCell), dep: clock(c.depCell) }] : [];
  });
  /** @type {ProfileLeg[]} */
  const legs = [];
  /** @type {number[]} running minutes at each call, never decreasing */
  const at = [0];
  for (let i = 1; i < calls.length; i++) {
    const a = calls[i - 1], b = calls[i];
    let minutes = b.arr - a.dep;
    if (minutes < -720) minutes += 1440; // the clock wrapped past midnight without a day offset
    const dist = km(a, b);
    const layover = a.stopId === b.stopId || dist < SAME_PLACE_KM;
    const kmh = !layover && minutes > 0 ? dist / (minutes / 60) : null;
    const kind = layover ? 'layover' : minutes < 0 ? 'negative' : minutes === 0 ? 'zero'
      : /** @type {number} */ (kmh) > limit ? 'over' : /** @type {number} */ (kmh) > limit * NEAR ? 'warn' : 'ok';
    // The departure is pinned at :00 at the trip's start and after a wait or a layover; else it is a window
    const pinned = i === 1 || (a.arrCell != null && a.arr !== a.dep) || legs[i - 2]?.kind === 'layover';
    const lo = Math.max(1, minutes * 60 - (pinned ? 0 : 59)), hi = minutes * 60 + 59;
    const ranged = !layover && minutes >= 0;
    legs.push({ from: a.ri, to: b.ri, fromName: a.name, toName: b.name, minutes, km: dist, kmh,
      kmhMin: ranged ? dist / (hi / 3600) : null, kmhMax: ranged ? dist / (lo / 3600) : null, kind });
    at.push(at[i - 1] + Math.max(0, minutes));
  }
  const total = at[at.length - 1];
  const points = calls.map((c, i) => ({ ri: c.ri, name: c.name, bold: !!grid.stops[c.ri]?.bold, lat: c.lat, lon: c.lon,
    x: total > 0 ? at[i] / total : calls.length > 1 ? i / (calls.length - 1) : 0 }));
  const run = legs.filter((l) => l.kind !== 'layover');
  const runMinutes = run.reduce((n, l) => n + Math.max(0, l.minutes), 0);
  const avg = runMinutes > 0 ? run.reduce((n, l) => n + l.km, 0) / (runMinutes / 60) : null;
  return { points, legs, limit, avg };
}
