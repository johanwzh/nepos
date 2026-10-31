// What the map shows for one trip (spec §7.3): its calls with a position from NSR, joined in
// order, and the stops that have no position (listed beside the map, never drawn). Pure.
import { journeyStops } from './netex/journeys.js';
import { tripLinks } from './link-pairs.js';
import { linkMoved } from './link-state.js';
import { decodePolyline } from '../routing/geometry.js';

/** @param {any} cell */
const timed = (cell) => !!cell?.time && cell.time !== '|';

/**
 * @param {{ stops: any[] }} grid
 * @param {{ cells: any[] }} col
 * @param {Map<string, { lat: number | null, lon: number | null } | null>} quayInfo
 */
export function tripOnMap(grid, col, quayInfo) {
  /** @type {{ name: string, time: string, stopId: string, lat: number, lon: number, ri: number, bold: boolean }[]} */
  const points = [];
  /** @type {string[]} */
  const missing = [];
  const calls = new Map(journeyStops(grid, col).map((c) => [c.ri, c]));
  grid.stops.forEach((stop, ri) => {
    if (!timed(col.cells[ri])) return;
    const call = calls.get(ri);
    if (!call) {
      // A timed row that is not a call of its own: a dwell arrival (shown with its departure)
      // or a stop without an ID.
      if (stop.stopId == null || stop.stopId === '') missing.push(stop.name);
      return;
    }
    const info = quayInfo.get(call.stopId);
    if (info?.lat != null && info.lon != null) points.push({ name: call.name, time: call.depCell.time, stopId: call.stopId, lat: info.lat, lon: info.lon, ri, bold: !!stop.bold });
    else missing.push(call.name);
  });
  return { points, missing };
}

/**
 * The trip's legs along the line's saved routes (routing editor, 2026-10-31): a routed link draws as routed, one out of
 * date (a Quay moved, not kept) as stale; a leg without one stays a straight line between its stops.
 * @param {{ stops: any[] }} grid @param {{ cells: any[] }} col
 * @param {Record<string, import('./link-state.js').SavedLink> | undefined} links the line's links
 * @param {Map<string, { lat: number | null, lon: number | null } | null>} quayInfo
 * @returns {{ links: { key: string, coords: [number, number][], state: 'routed' | 'stale' }[], straight: [number, number][][] }}
 */
export function tripRouteLegs(grid, col, links, quayInfo) {
  /** @type {{ key: string, coords: [number, number][], state: 'routed' | 'stale' }[]} */
  const out = [];
  /** @type {[number, number][][]} */
  const straight = [];
  for (const { key } of tripLinks(grid, col, 'bus')) {
    const l = links?.[key];
    if (l?.status === 'OK') {
      out.push({ key, coords: /** @type {[number, number][]} */ (decodePolyline(l.polyline, l.precision ?? 6)), state: linkMoved(key, l, /** @type {any} */ (quayInfo)) ? 'stale' : 'routed' });
      continue;
    }
    const [a, b] = key.split('|').map((id) => quayInfo.get(id));
    if (a?.lat != null && a.lon != null && b?.lat != null && b.lon != null) straight.push([[a.lon, a.lat], [b.lon, b.lat]]);
  }
  return { links: out, straight };
}
