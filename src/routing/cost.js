// The route cost is time (user review of the spike, 2026-10-30): a planner takes E6 over a residential short cut.
// Reported and exported distance stays the driven metres.

/** Snap radius: every road edge this close to a stop is a candidate. */
export const RADIUS_M = 75;
/** Seconds per metre between a stop and its snap point: a 70 m snap costs ~4.5 min, so the route drives to the stop. */
export const OFFROAD_S_PER_M = 4;
/** A bus is never faster than this (m/s), which keeps the search's distance bound admissible. */
export const VMAX_MS = 25;

import { rulesFor } from './rules.js';

const DEFAULT_KMH = [80, 60, 40, 15, 15];          // by class: motorway/trunk, primary/secondary, minor, service, ferry
const FERRY_KMH = 15;

/** Road (bus) as before; every other profile: the edge's maxspeed or the profile's default, never over its top speed.
 *  @param {{ cls: number, speed: number, ferry: boolean }} attr @param {import('./profiles.js').Profile} [profile] */
export function secondsPerMetre(attr, profile = 'bus') {
  const rules = rulesFor(profile);
  if (rules.kmh != null) return 3.6 / Math.min(attr.speed || rules.kmh, rules.vmax * 3.6);
  if (attr.ferry) return 3.6 / FERRY_KMH;
  let kmh = attr.speed || DEFAULT_KMH[attr.cls] || 40;
  if (attr.cls === 3) kmh = Math.min(kmh, 20);      // service roads: allowed, never a short cut
  return 3.6 / Math.min(kmh, 90);
}
