// Whether a saved link (a routed stop-to-stop leg) may be exported as a ServiceLink: routed, and its Quays still
// where they were when it was routed. Kept from 2.3 (2026-10-30) for the OSM graph-tile routing to come. Pure.
import { haversineM } from '../routing/geometry.js';

/**
 * A routed link, by key fromQuay|toQuay|profile. polyline: Google's polyline coding (lat first) at 10^precision;
 * distanceM: along the network (ferry included); from, to: the Quays' positions [lon, lat] when it was routed.
 * 2.6 adds: ferryM, seconds (driving time by the router's cost), via (the user's waypoints [lon, lat]), roads (names
 * along it), flags ('detour', 'far-snap'), routedAt (ISO) and the tile build it was routed on. reviewed (routing editor,
 * 2026-10-31): Keep — the user checked the saved route against this road build and these Quay positions.
 * @typedef {{ polyline: string, precision?: number, distanceM: number, status: string, from: [number, number], to: [number, number],
 *   ferryM?: number, seconds?: number, via?: [number, number][], roads?: string[], flags?: string[], routedAt?: string,
 *   tiles?: { set: 'road', built: string, dataDate: string, hashes: Record<string, string> },
 *   reviewed?: { built?: string, from?: [number, number], to?: [number, number] } }} SavedLink
 */

/** A Quay moved further than this (NSR) makes the link out of date. */
export const MOVED_M = 5;

/**
 * Has NSR moved either Quay more than MOVED_M since the link was made? Unknown positions: no.
 * @param {string} key @param {SavedLink} s @param {Map<string, { lat: number | null, lon: number | null } | null | undefined>} quays
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
 * Out of date: a Quay moved since the link was routed, or since the user kept it there (Keep, routing editor
 * 2026-10-31: reviewed holds the positions it was checked at). @param {string} key @param {SavedLink} s @param {Map<string, any>} quays
 */
export function linkMoved(key, s, quays) {
  const r = s.reviewed;
  return quayMoved(key, r?.from || r?.to ? { ...s, from: r.from ?? s.from, to: r.to ?? s.to } : s, quays);
}

/** Exported as a ServiceLink: routed (OK) and its Quays where they were. @param {string} key @param {SavedLink} s @param {Map<string, any>} quays */
export function isExportable(key, s, quays) {
  return s.status === 'OK' && !linkMoved(key, s, quays);
}
