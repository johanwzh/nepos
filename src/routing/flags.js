// Leg flags for the user to check (design 2026-10-30): a detour well beyond the straight line, a stop snapped far away.
import { haversineM } from './geometry.js';

const DETOUR_RATIO = 2, DETOUR_MIN_M = 300, FAR_SNAP_M = 25;

/**
 * @param {import('./search.js').Leg} leg @param {{ lon: number, lat: number }} a @param {{ lon: number, lat: number }} b
 * @param {{ off: number }} snapB the snap of the stop the leg ends at
 * @returns {('detour' | 'far-snap')[]}
 */
export function legFlags(leg, a, b, snapB) {
  /** @type {('detour' | 'far-snap')[]} */
  const flags = [];
  if (leg.metres > DETOUR_MIN_M && leg.metres > DETOUR_RATIO * haversineM([a.lon, a.lat], [b.lon, b.lat])) flags.push('detour');
  if (snapB.off > FAR_SNAP_M) flags.push('far-snap');
  return flags;
}
