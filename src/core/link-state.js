// What a saved link is worth now (design §6, §7, §10): turning an engine result into what is saved, whether a saved
// link may be exported, and whether it is stale (re-routed quietly when its line is opened). A link the planner
// blocked is never stale and never exported. Pure.
import { encodePolyline, haversineM } from '../shapes/geometry.js';
import { ENGINE_VERSION } from '../shapes/profiles.js';

/**
 * @typedef {{ polyline: string, precision: 6, distanceM: number, status: import('../shapes/engine.js').LinkStatus,
 *             warnings: string[], from: [number, number], to: [number, number], source: string, engine: number,
 *             routedAt: string }} SavedShape
 */

/** After this long a link is routed again when its line is opened. */
export const STALE_DAYS = 180;
/** A Quay moved further than this (NSR) makes the link out of date. */
export const MOVED_M = 5;

/** @param {import('../shapes/engine.js').LinkResult} r @param {Date} now @returns {SavedShape} */
export function toSaved(r, now) {
  return {
    polyline: encodePolyline(r.coordinates, 6), precision: 6, distanceM: Math.round(r.distanceM), status: r.status, warnings: [...r.warnings],
    from: [r.from.lon, r.from.lat], to: [r.to.lon, r.to.lat], source: r.source, engine: r.engine, routedAt: now.toISOString(),
  };
}

/** The planner's "Don't route this link": a straight line, kept as it is. @param {SavedShape} s @returns {SavedShape} */
export function blocked(s) {
  return { ...s, status: 'BLOCKED', polyline: encodePolyline([s.from, s.to], 6), distanceM: Math.round(haversineM(s.from, s.to)), warnings: [] };
}

/**
 * Has NSR moved either Quay more than MOVED_M since the link was made? Unknown positions: no.
 * @param {string} key @param {SavedShape} s @param {Map<string, { lat: number | null, lon: number | null } | null | undefined>} quays
 */
export function quayMoved(key, s, quays) {
  const [fromId, toId] = key.split('|');
  for (const [id, saved] of /** @type {[string, [number, number]][]} */ ([[fromId, s.from], [toId, s.to]])) {
    const q = quays.get(id);
    if (q?.lat == null || q.lon == null) continue;
    if (haversineM([q.lon, q.lat], saved) > MOVED_M) return true;
  }
  return false;
}

/**
 * @param {string} key @param {SavedShape} s @param {Map<string, any>} quays @param {Date} now @param {number} [engine]
 */
export function isStale(key, s, quays, now, engine = ENGINE_VERSION) {
  if (s.status === 'BLOCKED') return false;
  if ((s.engine ?? 0) < engine) return true;
  if (now.getTime() - new Date(s.routedAt).getTime() > STALE_DAYS * 86400000) return true;
  return quayMoved(key, s, quays);
}

/** Exported as a ServiceLink: routed (OK) and its Quays where they were. @param {string} key @param {SavedShape} s @param {Map<string, any>} quays */
export function isExportable(key, s, quays) {
  return s.status === 'OK' && !quayMoved(key, s, quays);
}
