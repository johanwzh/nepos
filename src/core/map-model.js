// What the map shows for one trip (spec §7.3): its calls with a position from NSR, joined in
// order, and the stops that have no position (listed beside the map, never drawn). Pure.
import { journeyStops } from './netex/journeys.js';

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
